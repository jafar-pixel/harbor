package com.jlstream.mediavision

import androidx.media3.common.C
import org.junit.Assert.assertEquals
import org.junit.Test

class BufferSizeTest {
    private val mb = 1024L * 1024

    @Test
    fun smallHeapKeepsMedia3sOwnSize() {
        assertEquals(C.LENGTH_UNSET, NativePlayer.bufferBytesFor(192 * mb))
    }

    @Test
    fun largeHeapHoldsUpTo256Mb() {
        assertEquals((256 * mb).toInt(), NativePlayer.bufferBytesFor(512 * mb))
        assertEquals((150 * mb).toInt(), NativePlayer.bufferBytesFor(300 * mb))
    }
}
