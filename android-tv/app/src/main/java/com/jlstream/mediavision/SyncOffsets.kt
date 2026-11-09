package com.jlstream.mediavision

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.ForwardingAudioSink
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

/**
 * The viewer's audio and subtitle timing, as the desktop's mpv `audio-delay` and `sub-delay`: a
 * positive delay plays that sound, or shows those subtitles, later than the picture. Set on the
 * main thread and read on the playback thread.
 */
class SyncOffsets {
    @Volatile var audioUs = 0L
    @Volatile var subtitleUs = 0L

    companion object {
        /** As the desktop's timing rows: tenths of a second, within a minute either way. */
        const val STEP_SEC = 0.1
        private const val MAX_SEC = 60.0

        fun clampSec(sec: Double): Double =
            if (sec.isNaN()) 0.0 else (sec.coerceIn(-MAX_SEC, MAX_SEC) * 10).roundToLong() / 10.0

        fun toUs(sec: Double): Long = (clampSec(sec) * 1_000_000).roundToLong()

        fun toSec(us: Long): Double = clampSec(us / 1_000_000.0)

        /** "In sync", "0.3 s later" or "1.2 s earlier". */
        fun describe(sec: Double): String {
            val s = clampSec(sec)
            if (s == 0.0) return "In sync"
            return String.format(Locale.US, "%.1f s %s", abs(s), if (s > 0) "later" else "earlier")
        }

        /**
         * The playback clock with the sound [delayUs] late. ExoPlayer's clock is the audio
         * renderer's position, read from its sink (MediaCodecAudioRenderer.updateCurrentPosition),
         * and video frames are shown when the clock reaches them. Reporting the sink [delayUs]
         * ahead shows each frame that much before its sound is heard.
         */
        fun shiftedPositionUs(positionUs: Long, delayUs: Long): Long =
            if (positionUs == AudioSink.CURRENT_POSITION_NOT_SET) positionUs else positionUs + delayUs
    }
}

/**
 * The audio sink with [SyncOffsets.audioUs] applied (see [SyncOffsets.shiftedPositionUs]). Off for
 * tunneled playback, where the TV's decoder syncs the picture to the sound itself.
 */
@OptIn(UnstableApi::class)
class DelayedAudioSink(
    sink: AudioSink,
    private val sync: SyncOffsets,
    private val active: Boolean,
) : ForwardingAudioSink(sink) {
    override fun getCurrentPositionUs(sourceEnded: Boolean): Long {
        val at = super.getCurrentPositionUs(sourceEnded)
        return if (active) SyncOffsets.shiftedPositionUs(at, sync.audioUs) else at
    }
}

/**
 * A subtitle renderer that shows its cues [SyncOffsets.subtitleUs] late (or early, when negative):
 * it is handed the playback position minus the delay. Media3 has no subtitle offset of its own,
 * and its TextRenderer is final, so the renderer is wrapped rather than extended.
 */
@OptIn(UnstableApi::class)
class DelayedTextRenderer(
    private val inner: Renderer,
    private val sync: SyncOffsets,
) : Renderer by inner {
    override fun render(positionUs: Long, elapsedRealtimeUs: Long) =
        inner.render(positionUs - sync.subtitleUs, elapsedRealtimeUs)
}
