package com.jlstream.mediavision

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Provider requests the page can't make itself. IPTV servers answer over plain http without CORS
 * headers, so the page's own fetch() is blocked. The page asks for
 * `https://jl-native-fetch.invalid/?u=<url>&ua=<user agent>` instead (src/lib/native-fetch.ts);
 * [MainActivity] hands those requests here, which fetches the URL from the TV and returns the
 * answer to the page with CORS allowed. GET only, so the page never needs a preflight.
 */
object NativeFetch {
    const val HOST = "jl-native-fetch.invalid"
    private const val MAX_REDIRECTS = 5

    fun handle(request: Uri): WebResourceResponse {
        val target = request.getQueryParameter("u") ?: return failure(400, "Bad Request")
        if (!isHttp(target)) return failure(400, "Bad Request")
        return try {
            fetch(target, request.getQueryParameter("ua"))
        } catch (_: Exception) {
            failure(502, "Bad Gateway")
        }
    }

    fun refused(): WebResourceResponse = failure(403, "Forbidden")

    private fun fetch(url: String, userAgent: String?): WebResourceResponse {
        var current = URL(url)
        // Followed by hand: HttpURLConnection won't follow a redirect between http and https.
        for (hop in 0..MAX_REDIRECTS) {
            val conn = current.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects = false
            conn.connectTimeout = 30_000
            conn.readTimeout = 60_000
            if (!userAgent.isNullOrBlank()) conn.setRequestProperty("User-Agent", userAgent)
            val status = conn.responseCode
            val location = conn.getHeaderField("Location")
            if (status in 300..399 && location != null && hop < MAX_REDIRECTS) {
                conn.disconnect()
                current = URL(current, location)
                if (!isHttp(current.toString())) return failure(502, "Bad Gateway")
                continue
            }
            val body = (if (status >= 400) conn.errorStream else conn.inputStream)
                ?: ByteArrayInputStream(ByteArray(0))
            val type = conn.contentType.orEmpty()
            val mime = type.substringBefore(';').trim().ifEmpty { "application/octet-stream" }
            val charset = Regex("charset=([^;]+)", RegexOption.IGNORE_CASE).find(type)?.groupValues?.get(1)?.trim()
            val reason = conn.responseMessage?.takeIf { it.isNotBlank() } ?: "OK"
            return WebResourceResponse(mime, charset, status, reason, corsHeaders(), body)
        }
        return failure(502, "Bad Gateway")
    }

    private fun isHttp(url: String): Boolean {
        val uri = Uri.parse(url)
        return (uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrEmpty()
    }

    private fun corsHeaders(): Map<String, String> =
        mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-store")

    private fun failure(status: Int, reason: String): WebResourceResponse =
        WebResourceResponse("text/plain", "utf-8", status, reason, corsHeaders(), ByteArrayInputStream(ByteArray(0)))
}
