package com.jlstream.mediavision

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BundledSiteTest {
    private val files = setOf("index.html", "assets/main-abc.js", "brand/jl-mark.webp", "favicon.png")
    private fun answer(path: String) = BundledSite.assetFor(path) { it in files }

    @Test
    fun theAppAndItsFilesComeFromTheApk() {
        assertEquals("index.html", answer("/"))
        assertEquals("index.html", answer(""))
        assertEquals("assets/main-abc.js", answer("/assets/main-abc.js"))
        assertEquals("brand/jl-mark.webp", answer("/brand/jl-mark.webp"))
    }

    @Test
    fun theAppsOwnRoutesOpenTheApp() {
        assertEquals("index.html", answer("/music/youtube-callback"))
        assertEquals("index.html", answer("/live"))
    }

    @Test
    fun serverPathsAndMissingFilesUseTheNetwork() {
        assertNull(answer("/api/proxy"))
        assertNull(answer("/api-proxy/https://example.com/x"))
        assertNull(answer("/assets/missing-file.js"))
        assertNull(answer("/../secret.txt"))
    }

    @Test
    fun typesMatchTheWebsite() {
        assertEquals("text/html", BundledSite.mimeOf("index.html"))
        assertEquals("text/javascript", BundledSite.mimeOf("assets/main.js"))
        assertEquals("font/woff2", BundledSite.mimeOf("a.WOFF2"))
        assertEquals("application/octet-stream", BundledSite.mimeOf("noext"))
    }
}
