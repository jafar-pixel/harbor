package com.jlstream.mediavision

import android.content.res.AssetManager
import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.FileNotFoundException

/**
 * The TV app's own copy of the app's pages, built into the APK (assets/site, from the TV track's
 * build in .github/workflows/jl-release.yml). Requests for the app's address are answered from it,
 * so the TV runs the version it was released with, and a website deploy can't change the TV. The
 * address stays the same, so sign ins, saved data and server access are unchanged. The server's
 * own paths (/api) still go to the network, and an APK built without the copy uses the website.
 */
class BundledSite(private val assets: AssetManager) {
    /** Whether this APK carries the pages at all. */
    val available: Boolean = exists(INDEX)

    /** The bundled answer for a request to the app's address, or null to use the network. */
    fun serve(method: String, url: Uri): WebResourceResponse? {
        if (!available || method != "GET") return null
        val file = assetFor(url.path.orEmpty()) { exists("$ROOT/$it") } ?: return null
        return open(file)
    }

    private fun exists(asset: String): Boolean =
        try {
            assets.open(asset).close()
            true
        } catch (_: FileNotFoundException) {
            false
        }

    private fun open(file: String): WebResourceResponse? {
        val stream =
            try {
                assets.open("$ROOT/$file")
            } catch (_: FileNotFoundException) {
                return null
            }
        val mime = mimeOf(file)
        val headers =
            mapOf(
                // Hashed build files never change; the page itself is read fresh each start.
                "Cache-Control" to if (file.startsWith("assets/")) "max-age=31536000, immutable" else "no-cache",
                "X-Content-Type-Options" to "nosniff",
            )
        val encoding = if (mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json")) "utf-8" else null
        return WebResourceResponse(mime, encoding, 200, "OK", headers, stream)
    }

    companion object {
        private const val ROOT = "site"
        private const val INDEX = "$ROOT/index.html"
        private val NETWORK_PREFIXES = listOf("/api/", "/api-proxy/")

        private val TYPES =
            mapOf(
                "html" to "text/html",
                "js" to "text/javascript",
                "mjs" to "text/javascript",
                "css" to "text/css",
                "json" to "application/json",
                "webmanifest" to "application/manifest+json",
                "svg" to "image/svg+xml",
                "png" to "image/png",
                "jpg" to "image/jpeg",
                "jpeg" to "image/jpeg",
                "webp" to "image/webp",
                "avif" to "image/avif",
                "gif" to "image/gif",
                "ico" to "image/x-icon",
                "woff" to "font/woff",
                "woff2" to "font/woff2",
                "ttf" to "font/ttf",
                "otf" to "font/otf",
                "wasm" to "application/wasm",
                "mp3" to "audio/mpeg",
                "ogg" to "audio/ogg",
                "wav" to "audio/wav",
                "mp4" to "video/mp4",
                "webm" to "video/webm",
                "txt" to "text/plain",
                "xml" to "application/xml",
            )

        fun mimeOf(file: String): String =
            TYPES[file.substringAfterLast('.', "").lowercase()] ?: "application/octet-stream"

        /**
         * The bundled file that answers [path], or null for the network: the server's own paths,
         * and a missing file. A page address (no file extension) is one of the app's routes, which
         * the app itself answers, as the website does.
         */
        fun assetFor(path: String, has: (String) -> Boolean): String? {
            if (NETWORK_PREFIXES.any { path.startsWith(it) }) return null
            val file = path.trimStart('/').ifEmpty { "index.html" }
            if (file.split('/').any { it == ".." }) return null
            if (has(file)) return file
            return if ('.' !in file.substringAfterLast('/')) "index.html" else null
        }
    }
}
