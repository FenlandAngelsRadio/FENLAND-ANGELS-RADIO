package uk.co.fenlandangelsradio.app

import android.content.ComponentName
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
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
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        controllerFuture = MediaController.Builder(this, token).buildAsync()
        controllerFuture.addListener({
            controller = controllerFuture.get().also { it.addListener(listener) }
            render()
        }, ContextCompat.getMainExecutor(this))

        binding.playButton.setOnClickListener {
            controller?.let {
                if (it.isPlaying) it.pause()
                else {
                    if (it.playbackState == Player.STATE_IDLE) it.prepare()
                    it.play()
                }
            }
        }
    }

    private fun render() {
        val c = controller ?: return
        binding.playButton.text = if (c.isPlaying) "PAUSE" else "LISTEN LIVE"
        binding.status.text = when {
            c.isPlaying -> "LIVE • Playing"
            c.playbackState == Player.STATE_BUFFERING -> "Connecting…"
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
