package com.jlstream.mediavision

import androidx.media3.common.Player
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KeepStreamTest {
    private val url = "http://provider.test/live/1.ts"

    @Test
    fun keepsTheSameLiveStreamGoingFullScreen() {
        assertTrue(NativePlayer.keepsStream(url, url, 0, Player.STATE_READY))
        assertTrue(NativePlayer.keepsStream(url, url, 0, Player.STATE_BUFFERING))
    }

    @Test
    fun reconnectsForAnotherStreamAPositionOrADeadOne() {
        assertFalse(NativePlayer.keepsStream(null, url, 0, Player.STATE_READY))
        assertFalse(NativePlayer.keepsStream(url, "$url?2", 0, Player.STATE_READY))
        assertFalse(NativePlayer.keepsStream(url, url, 5_000, Player.STATE_READY))
        assertFalse(NativePlayer.keepsStream(url, url, 0, Player.STATE_IDLE))
        assertFalse(NativePlayer.keepsStream(url, url, 0, Player.STATE_ENDED))
    }
}
