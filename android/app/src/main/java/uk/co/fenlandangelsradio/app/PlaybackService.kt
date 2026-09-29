package uk.co.fenlandangelsradio.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

@UnstableApi
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null
    private lateinit var player: ExoPlayer
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallbackRegistered = false
    private var userWantsPlayback = false
    private var recoveryAttempt = 0
    private var recoveryPending = false

    // A stalled live stream can remain BUFFERING without raising an error.
    private val bufferingWatchdog = Runnable {
        if (userWantsPlayback && !player.isPlaying &&
            player.playbackState == Player.STATE_BUFFERING
        ) scheduleRecovery(0L)
    }

    private val recover = Runnable {
        recoveryPending = false
        if (!userWantsPlayback || !hasInternetNetwork()) return@Runnable

        recoveryAttempt++
        // Re-create the stream connection, but preserve the user's intent.
        player.stop()
        player.clearMediaItems()
        player.setMediaItem(stationItem())
        player.prepare()
        player.play()

        // A retry may itself stall without generating a player error.
        startBufferingWatchdog()
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            handler.post {
                if (userWantsPlayback && !player.isPlaying) scheduleRecovery(1_000L)
            }
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                handler.post {
                    if (userWantsPlayback && !player.isPlaying) scheduleRecovery(1_000L)
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        val httpFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(15_000)
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("FenlandAngelsRadio-Android/1.0")

        val retryPolicy = object : DefaultLoadErrorHandlingPolicy(12) {
            override fun getRetryDelayMsFor(
                loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo
            ): Long {
                val count = loadErrorInfo.errorCount.coerceIn(1, 6)
                return (1_000L shl (count - 1)).coerceAtMost(30_000L)
            }
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(httpFactory)
            .setLoadErrorHandlingPolicy(retryPolicy)

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(15_000, 50_000, 2_500, 5_000)
            .build()

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSourceFactory)
            .setLoadControl(loadControl)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                    .setUsage(C.USAGE_MEDIA)
                    .build(),
                true
            )
            .build()

        player.setMediaItem(stationItem())
        player.prepare()

        player.addListener(object : Player.Listener {
            override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                userWantsPlayback = playWhenReady
                if (playWhenReady) {
                    if (!player.isPlaying) startBufferingWatchdog()
                } else {
                    cancelRecovery()
                    recoveryAttempt = 0
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    cancelRecovery()
                    recoveryAttempt = 0
                } else if (userWantsPlayback) {
                    startBufferingWatchdog()
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (!userWantsPlayback) return
                when (playbackState) {
                    Player.STATE_BUFFERING -> startBufferingWatchdog()
                    Player.STATE_IDLE, Player.STATE_ENDED -> scheduleRecovery(2_000L)
                    Player.STATE_READY -> handler.removeCallbacks(bufferingWatchdog)
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                if (userWantsPlayback) scheduleRecovery()
            }
        })

        mediaSession = MediaSession.Builder(this, player).build()

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        connectivityManager.registerNetworkCallback(request, networkCallback)
        networkCallbackRegistered = true
    }

    private fun hasInternetNetwork(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val caps = connectivityManager.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun startBufferingWatchdog() {
        handler.removeCallbacks(bufferingWatchdog)
        if (userWantsPlayback && !player.isPlaying) {
            handler.postDelayed(bufferingWatchdog, 20_000L)
        }
    }

    private fun scheduleRecovery(delayOverride: Long? = null) {
        if (!userWantsPlayback) return
        handler.removeCallbacks(bufferingWatchdog)
        handler.removeCallbacks(recover)
        val delay = delayOverride ?: when (recoveryAttempt) {
            0 -> 2_000L
            1 -> 5_000L
            2 -> 10_000L
            else -> 20_000L
        }
        recoveryPending = true
        handler.postDelayed(recover, delay)
    }

    private fun cancelRecovery() {
        handler.removeCallbacks(recover)
        handler.removeCallbacks(bufferingWatchdog)
        recoveryPending = false
    }

    private fun stationItem() = MediaItem.Builder()
        .setUri(STREAM_URL)
        .setMediaId("far-live")
        .setMediaMetadata(
            MediaMetadata.Builder()
                .setTitle("Fenland Angels Radio")
                .setArtist("The Sound of the Fens")
                .setStation("Fenland Angels Radio")
                .build()
        )
        .build()

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaSession? = mediaSession

    override fun onDestroy() {
        if (networkCallbackRegistered) {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        }
        cancelRecovery()
        mediaSession?.release()
        player.release()
        mediaSession = null
        super.onDestroy()
    }

    companion object {
        const val STREAM_URL = "https://hq3.yesstreaming.net:7085/stream"
    }
}
