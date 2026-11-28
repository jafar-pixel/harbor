package com.jlstream.mediavision

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppUpdaterTest {
    @Test
    fun laterReleasesAreNewer() {
        assertTrue(AppUpdater.isNewer("0.9.137", "0.9.136"))
        assertTrue(AppUpdater.isNewer("0.10.0", "0.9.136"))
        assertTrue(AppUpdater.isNewer("1.0.0", "0.9.999"))
    }

    @Test
    fun sameOrEarlierReleasesAreNot() {
        assertFalse(AppUpdater.isNewer("0.9.136", "0.9.136"))
        assertFalse(AppUpdater.isNewer("0.9.135", "0.9.136"))
        assertFalse(AppUpdater.isNewer("0.9.136", "0.9.136-pro-verification"))
    }
}
