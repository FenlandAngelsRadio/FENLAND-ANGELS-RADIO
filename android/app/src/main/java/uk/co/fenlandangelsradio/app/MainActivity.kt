package uk.co.fenlandangelsradio.app

import android.content.ComponentName
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import uk.co.fenlandangelsradio.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var controllerFuture: ListenableFuture<MediaController>
    private var controller: MediaController? = null

    private val listener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) = render()
        override fun onPlaybackStateChanged(playbackState: Int) = render()
        override fun onPlayerError(error: PlaybackException) {
            binding.status.text = "Reconnecting…"
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()
        controllerFuture.addListener({
            runCatching { controllerFuture.get() }
                .onSuccess {
                    controller = it
                    it.addListener(listener)
                    render()
                }
                .onFailure {
                    binding.status.text = "Player unavailable"
                }
        }, ContextCompat.getMainExecutor(this))

        binding.playButton.setOnClickListener {
            controller?.let { player ->
                if (player.isPlaying || player.playWhenReady) {
                    player.pause()
                } else {
                    if (player.playbackState == Player.STATE_IDLE) player.prepare()
                    player.play()
                }
            }
        }
    }

    private fun render() {
        val player = controller ?: return
        binding.playButton.text =
            if (player.isPlaying || player.playWhenReady) "PAUSE" else "LISTEN LIVE"

        binding.status.text = when {
            player.isPlaying -> "LIVE • Playing"
            player.playbackState == Player.STATE_BUFFERING -> "Connecting…"
            player.playWhenReady -> "Reconnecting…"
            else -> "Ready to listen"
        }
    }

    override fun onDestroy() {
        controller?.removeListener(listener)
        MediaController.releaseFuture(controllerFuture)
        controller = null
        super.onDestroy()
    }
}
