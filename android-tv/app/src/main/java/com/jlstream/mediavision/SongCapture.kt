package com.jlstream.mediavision

import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.audio.TeeAudioProcessor
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * The last few seconds of what the player decodes, kept for Identify song: mono 16-bit PCM in a
 * ring, so a song can be named the moment the button is pressed. Audio sent to the receiver
 * undecoded (passthrough: Dolby, DTS, Atmos) never reaches it, and the ring stays empty.
 */
@OptIn(UnstableApi::class)
class SongCapture(private val seconds: Int = 10) : TeeAudioProcessor.AudioBufferSink {
    private val lock = Any()
    private var sampleRate = 0
    private var channels = 0
    private var pcm16 = false
    private var ring = ShortArray(0)
    private var written = 0L

    override fun flush(sampleRateHz: Int, channelCount: Int, encoding: Int) {
        synchronized(lock) {
            pcm16 = encoding == C.ENCODING_PCM_16BIT
            if (sampleRateHz != sampleRate || channelCount != channels) {
                sampleRate = sampleRateHz
                channels = channelCount
                ring = ShortArray((sampleRateHz.coerceAtLeast(1)) * seconds)
                written = 0
            }
        }
    }

    override fun handleBuffer(buffer: ByteBuffer) {
        synchronized(lock) {
            if (!pcm16 || channels <= 0 || ring.isEmpty()) return
            val shorts = buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
            val frames = shorts.remaining() / channels
            for (f in 0 until frames) {
                var sum = 0
                for (c in 0 until channels) sum += shorts.get(f * channels + c)
                ring[(written % ring.size).toInt()] = (sum / channels).toShort()
                written++
            }
        }
    }

    fun clear() {
        synchronized(lock) { written = 0 }
    }

    /**
     * The last [want] seconds as a WAV file, or null when fewer than [min] seconds were heard
     * (passthrough, or playback only just started).
     */
    fun lastWav(want: Int = 8, min: Int = 4): ByteArray? {
        val samples: ShortArray
        val rate: Int
        synchronized(lock) {
            rate = sampleRate
            if (rate <= 0) return null
            val have = minOf(written, ring.size.toLong()).toInt()
            if (have < rate * min) return null
            val n = minOf(have, rate * want)
            samples = ShortArray(n)
            val start = written - n
            for (i in 0 until n) samples[i] = ring[((start + i) % ring.size).toInt()]
        }
        return wav(samples, rate)
    }

    /** Loud enough to hold music (not silence). */
    fun audible(wav: ByteArray): Boolean {
        var peak = 0
        var i = 44
        while (i + 1 < wav.size) {
            val s = (wav[i].toInt() and 0xff) or (wav[i + 1].toInt() shl 8)
            peak = maxOf(peak, kotlin.math.abs(s.toShort().toInt()))
            i += 2
        }
        return peak >= 150
    }

    private fun wav(samples: ShortArray, rate: Int): ByteArray {
        val data = samples.size * 2
        val out = ByteArrayOutputStream(44 + data)
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray()).putInt(36 + data).put("WAVE".toByteArray())
        header.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1)
        header.putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
        header.put("data".toByteArray()).putInt(data)
        out.write(header.array())
        val body = ByteBuffer.allocate(data).order(ByteOrder.LITTLE_ENDIAN)
        for (s in samples) body.putShort(s)
        out.write(body.array())
        return out.toByteArray()
    }
}
