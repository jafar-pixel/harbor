package com.jlstream.mediavision

import androidx.media3.exoplayer.audio.AudioSink
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncOffsetsTest {
    @Test
    fun keepsTenthsWithinAMinute() {
        assertEquals(0.3, SyncOffsets.clampSec(0.30000000004), 0.0)
        assertEquals(-1.2, SyncOffsets.clampSec(-1.19), 0.0)
        assertEquals(60.0, SyncOffsets.clampSec(500.0), 0.0)
        assertEquals(-60.0, SyncOffsets.clampSec(-500.0), 0.0)
        assertEquals(0.0, SyncOffsets.clampSec(Double.NaN), 0.0)
    }

    @Test
    fun convertsSecondsAndMicroseconds() {
        assertEquals(300_000L, SyncOffsets.toUs(0.3))
        assertEquals(-1_200_000L, SyncOffsets.toUs(-1.2))
        assertEquals(0.3, SyncOffsets.toSec(300_000L), 0.0)
    }

    @Test
    fun describesTheTiming() {
        assertEquals("In sync", SyncOffsets.describe(0.0))
        assertEquals("0.3 s later", SyncOffsets.describe(0.3))
        assertEquals("1.2 s earlier", SyncOffsets.describe(-1.2))
    }

    @Test
    fun movesTheClockButNotAnUnsetPosition() {
        assertEquals(1_500_000L, SyncOffsets.shiftedPositionUs(1_000_000L, 500_000L))
        assertEquals(500_000L, SyncOffsets.shiftedPositionUs(1_000_000L, -500_000L))
        assertEquals(
            AudioSink.CURRENT_POSITION_NOT_SET,
            SyncOffsets.shiftedPositionUs(AudioSink.CURRENT_POSITION_NOT_SET, 500_000L),
        )
    }
}
