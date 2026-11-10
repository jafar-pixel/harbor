package com.jlstream.mediavision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class PageTrailTest {
    @Test
    fun cutsAddressesToTheirHost() {
        val out = PageTrail.sanitize("Failed to load https://cdn.example.com/dl/abc?token=SECRET123 (404)")
        assertEquals("Failed to load https://cdn.example.com/… (404)", out)
        assertFalse(out.contains("SECRET123"))
    }

    @Test
    fun keepsTheLastFewDistinctErrors() {
        repeat(8) { PageTrail.noteError("error $it") }
        PageTrail.noteError("error 7")
        assertEquals(listOf("error 2", "error 3", "error 4", "error 5", "error 6", "error 7"), PageTrail.recentErrors())
    }

    @Test
    fun keepsTheLastTenStepsWithoutRepeats() {
        repeat(12) { PageTrail.noteCall("step $it") }
        PageTrail.noteCall("step 11")
        val steps = PageTrail.recentCalls()
        assertEquals(10, steps.size)
        assertEquals("step 2", steps.first())
        assertEquals("step 11", steps.last())
    }

    @Test
    fun leavesOutRefusedRequests() {
        PageTrail.noteError("real error")
        PageTrail.noteError("Access to fetch at 'https://api.example.org/x' has been blocked by CORS policy")
        assertEquals("real error", PageTrail.recentErrors().last())
    }

    @Test
    fun screenDropsItsQuery() {
        PageTrail.noteScreen("/search?q=private words")
        assertEquals("/search", PageTrail.screen)
    }
}
