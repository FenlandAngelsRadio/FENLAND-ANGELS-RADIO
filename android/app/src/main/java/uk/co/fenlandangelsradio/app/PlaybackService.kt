package uk.co.fenlandangelsradio.app

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
    private var userWantsPlayback = false
    private var recoveryAttempt = 0

    private val recover = Runnable {
        if (!userWantsPlayback) return@Runnable
        recoveryAttempt++
        player.stop()
        player.clearMediaItems()
        player.setMediaItem(stationItem())
        player.prepare()
        player.play()
    }

    override fun onCreate() {
        super.onCreate()

        val httpFactory = DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(10_000)
            .setReadTimeoutMs(15_000)
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent("FenlandAngelsRadio-Android/1.0")

        val retryPolicy = object : DefaultLoadErrorHandlingPolicy(12) {
            override fun getRetryDelayMsFor(
                loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo
            ): Long {
                val count = loadErrorInfo.errorCount.coerceAtMost(6)
                return (1_000L shl (count - 1)).coerceAtMost(30_000L)
            }
        }

        val mediaSourceFactory = DefaultMediaSourceFactory(httpFactory)
            .setLoadErrorHandlingPolicy(retryPolicy)

        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                15_000,
                50_000,
                2_500,
                5_000
            )
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
                if (!playWhenReady) {
                    handler.removeCallbacks(recover)
                    recoveryAttempt = 0
                }
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) {
                    handler.removeCallbacks(recover)
                    recoveryAttempt = 0
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                if (userWantsPlayback) scheduleRecovery()
            }
        })

        mediaSession = MediaSession.Builder(this, player).build()
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

    private fun scheduleRecovery() {
        handler.removeCallbacks(recover)
        val delay = when (recoveryAttempt) {
            0 -> 2_000L
            1 -> 5_000L
            2 -> 10_000L
            else -> 20_000L
        }
        handler.postDelayed(recover, delay)
    }

    override fun onGetSession(
        controllerInfo: MediaSession.ControllerInfo
    ): MediaSession? = mediaSession

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        mediaSession?.release()
        player.release()
        mediaSession = null
        super.onDestroy()
    }

    companion object {
        const val STREAM_URL = "https://hq3.yesstreaming.net:7085/stream"
    }
}
