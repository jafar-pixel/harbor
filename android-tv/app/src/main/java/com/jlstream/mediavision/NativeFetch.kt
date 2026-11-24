package com.jlstream.mediavision

import android.net.Uri
import android.os.SystemClock
import android.util.Base64
import android.util.Log
import android.webkit.WebResourceResponse
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/**
 * Requests the page can't make itself, made by the TV the way the Windows app makes them
 * natively: add-ons, debrid services, subtitles and IPTV providers that send no CORS header or
 * answer over plain http. Before this the page sent them through the website's /api-proxy, so
 * the TV depended on that server for every stream.
 *
 * The page calls [start] (src/lib/native-http.ts) and gets an id back at once. The request runs
 * on this class's own threads, never WebView's, so a slow add-on can't hold up the page, and
 * [cancel] stops it the moment the page gives up on it (a new search letter, leaving a screen).
 * When the status and headers are in, [notify] tells the page, which then reads the answer from
 * `https://jl-native-fetch.invalid/r/<id>`; [take] hands WebView the open connection's body, so
 * large playlists stream instead of sitting in memory.
 */
class NativeFetch(private val notify: (id: String, error: String?) -> Unit) {
    private class Call {
        @Volatile var conn: HttpURLConnection? = null
        @Volatile var future: Future<*>? = null
        @Volatile var cancelled = false
        @Volatile var response: WebResourceResponse? = null
        @Volatile var readyAt = 0L
        val startedAt = SystemClock.elapsedRealtime()
    }

    private val calls = ConcurrentHashMap<String, Call>()
    private val ids = AtomicLong()
    private val pool =
        Executors.newFixedThreadPool(THREADS) { r -> Thread(r, "jl-fetch").apply { isDaemon = true } }
    private val sweeper =
        Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "jl-fetch-sweep").apply { isDaemon = true } }

    init {
        sweeper.scheduleWithFixedDelay(::sweep, SWEEP_MS, SWEEP_MS, TimeUnit.MILLISECONDS)
    }

    /** Starts the request described by [json] and returns its id, or "" when it can't be made. */
    fun start(json: String?): String {
        val req = try { JSONObject(json ?: return "") } catch (_: Exception) { return "" }
        val url = req.optString("url")
        if (!isHttp(url)) return ""
        val id = ids.incrementAndGet().toString()
        val call = Call()
        calls[id] = call
        call.future = pool.submit { run(id, call, req) }
        return id
    }

    fun cancel(id: String?) {
        val call = calls.remove(id ?: return) ?: return
        call.cancelled = true
        call.future?.cancel(true)
        call.conn?.disconnect()
        try { call.response?.data?.close() } catch (_: Exception) {}
    }

    /** The answer for `/r/<id>`, once [notify] said it is ready; each one is read once. */
    fun take(request: Uri): WebResourceResponse {
        val id = request.path.orEmpty().removePrefix("/r/")
        val call = calls.remove(id) ?: return failure(404, "Not Found")
        return call.response ?: failure(404, "Not Found").also { cancelOnly(call) }
    }

    private fun run(id: String, call: Call, req: JSONObject) {
        var host = "?"
        try {
            var current = URL(req.getString("url"))
            host = current.host
            var method = req.optString("method", "GET").uppercase()
            var body = bodyOf(req)
            val headers = req.optJSONObject("headers")
            val timeout = req.optInt("timeoutMs", DEFAULT_TIMEOUT_MS).coerceIn(1_000, MAX_TIMEOUT_MS)
            for (hop in 0..MAX_REDIRECTS) {
                if (call.cancelled) return
                val conn = current.openConnection() as HttpURLConnection
                call.conn = conn
                conn.instanceFollowRedirects = false
                conn.connectTimeout = minOf(timeout, CONNECT_TIMEOUT_MS)
                conn.readTimeout = timeout
                conn.requestMethod = method
                headers?.keys()?.forEach { name ->
                    if (name.lowercase() !in SKIPPED_REQUEST_HEADERS) conn.setRequestProperty(name, headers.optString(name))
                }
                if (body != null && method != "GET" && method != "HEAD") {
                    conn.doOutput = true
                    conn.setFixedLengthStreamingMode(body.size)
                    conn.outputStream.use { it.write(body) }
                }
                val status = conn.responseCode
                val location = conn.getHeaderField("Location")
                // Followed by hand: HttpURLConnection won't follow a redirect between http and https.
                if (status in 300..399 && location != null) {
                    conn.disconnect()
                    if (hop == MAX_REDIRECTS) break
                    current = URL(current, location)
                    if (!isHttp(current.toString())) break
                    // What a browser does: 303, and 301/302 after a POST, continue as a body-less GET.
                    if (status == 303 || ((status == 301 || status == 302) && method == "POST")) {
                        method = "GET"
                        body = null
                    }
                    continue
                }
                if (status in 300..399) break // WebView can't hand the page a redirect status.
                call.response = responseOf(conn, status, current, call)
                call.readyAt = SystemClock.elapsedRealtime()
                Log.i(TAG, "$method $host -> $status in ${call.readyAt - call.startedAt} ms")
                if (call.cancelled) cancelOnly(call) else notify(id, null)
                return
            }
            finish(id, call, host, "redirect could not be followed")
        } catch (e: Exception) {
            if (call.cancelled) return
            finish(id, call, host, e.javaClass.simpleName + (e.message?.let { ": $it" } ?: ""))
        }
    }

    private fun finish(id: String, call: Call, host: String, error: String) {
        call.conn?.disconnect()
        calls.remove(id)
        Log.w(TAG, "$host failed after ${SystemClock.elapsedRealtime() - call.startedAt} ms: $error")
        notify(id, error)
    }

    private fun responseOf(conn: HttpURLConnection, status: Int, finalUrl: URL, call: Call): WebResourceResponse {
        val raw = (if (status >= 400) conn.errorStream else conn.inputStream) ?: ByteArrayInputStream(ByteArray(0))
        val stream: InputStream =
            object : FilterInputStream(raw) {
                override fun close() {
                    try { super.close() } finally { conn.disconnect() }
                }
            }
        val type = conn.contentType.orEmpty()
        val mime = type.substringBefore(';').trim().ifEmpty { "application/octet-stream" }
        val charset = Regex("charset=([^;]+)", RegexOption.IGNORE_CASE).find(type)?.groupValues?.get(1)?.trim()
        val headers = LinkedHashMap<String, String>()
        conn.headerFields.forEach { (name, values) ->
            if (name != null && name.lowercase() !in SKIPPED_RESPONSE_HEADERS) headers[name] = values.joinToString(", ")
        }
        headers.putAll(pageHeaders())
        headers[FINAL_URL_HEADER] = finalUrl.toString()
        val reason = conn.responseMessage?.takeIf { it.isNotBlank() } ?: if (status < 400) "OK" else "Error"
        return WebResourceResponse(mime, charset, status, reason, headers, stream)
    }

    private fun cancelOnly(call: Call) {
        call.cancelled = true
        call.conn?.disconnect()
        try { call.response?.data?.close() } catch (_: Exception) {}
    }

    /** Answers the page never collected (it went away mid-request) don't keep their connections. */
    private fun sweep() {
        val now = SystemClock.elapsedRealtime()
        for ((id, call) in calls) {
            val stale =
                if (call.readyAt > 0) now - call.readyAt > UNCLAIMED_MS else now - call.startedAt > MAX_TIMEOUT_MS + UNCLAIMED_MS
            if (stale && calls.remove(id, call)) {
                call.future?.cancel(true)
                cancelOnly(call)
            }
        }
    }

    private fun bodyOf(req: JSONObject): ByteArray? {
        val base64 = req.optString("bodyBase64")
        if (base64.isNotEmpty()) return Base64.decode(base64, Base64.DEFAULT)
        if (!req.has("body") || req.isNull("body")) return null
        return req.getString("body").toByteArray(Charsets.UTF_8)
    }

    private fun isHttp(url: String): Boolean {
        val uri = Uri.parse(url)
        return (uri.scheme == "http" || uri.scheme == "https") && !uri.host.isNullOrEmpty()
    }

    companion object {
        const val HOST = "jl-native-fetch.invalid"
        private const val TAG = "JLNet"
        private const val FINAL_URL_HEADER = "x-harbor-final-url"
        private const val THREADS = 16
        private const val MAX_REDIRECTS = 5
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val DEFAULT_TIMEOUT_MS = 30_000
        private const val MAX_TIMEOUT_MS = 120_000
        private const val UNCLAIMED_MS = 60_000L
        private const val SWEEP_MS = 30_000L

        // The connection sets these itself; a page-supplied Accept-Encoding would also turn off
        // its transparent gzip and hand the page compressed bytes.
        private val SKIPPED_REQUEST_HEADERS = setOf("host", "content-length", "connection", "accept-encoding")

        // The body reaches the page already decoded, and cookies stay with the provider.
        private val SKIPPED_RESPONSE_HEADERS =
            setOf("content-encoding", "content-length", "transfer-encoding", "connection", "set-cookie",
                "access-control-allow-origin", "access-control-allow-credentials", "access-control-expose-headers")

        private fun pageHeaders(): Map<String, String> =
            mapOf(
                "Access-Control-Allow-Origin" to "*",
                "Access-Control-Expose-Headers" to "*",
                "Cache-Control" to "no-store",
            )

        fun refused(): WebResourceResponse = failure(403, "Forbidden")

        fun failure(status: Int, reason: String): WebResourceResponse =
            WebResourceResponse("text/plain", "utf-8", status, reason, pageHeaders(), ByteArrayInputStream(ByteArray(0)))
    }
}
