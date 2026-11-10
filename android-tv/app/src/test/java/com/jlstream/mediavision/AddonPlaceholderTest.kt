package com.jlstream.mediavision

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AddonPlaceholderTest {
    @Test
    fun recognisesAnAddonsAccessDeniedVideo() {
        val message = NativePlayer.addonPlaceholder("/videos/access_denied_v2.mp4")
        assertNotNull(message)
        assertTrue(message!!.contains("access denied"))
        assertNotNull(NativePlayer.addonPlaceholder("/static/exceptions/debrid_expired.mp4"))
        assertNotNull(NativePlayer.addonPlaceholder("/videos/failed_rar_v2.mp4"))
    }

    @Test
    fun leavesRealFilmsAlone() {
        assertNull(NativePlayer.addonPlaceholder("/d/ABCDEF123/Heart.of.the.Beast.2026.2160p.DV.mkv"))
        assertNull(NativePlayer.addonPlaceholder("/d/XYZ/Fatal.Error.2026.1080p.mkv"))
        assertNull(NativePlayer.addonPlaceholder("/stream/movie/tt123.m3u8"))
        assertNull(NativePlayer.addonPlaceholder(null))
    }
}
