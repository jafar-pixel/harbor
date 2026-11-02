package com.jlstream.mediavision

import android.os.Handler
import android.os.Looper
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Identify song for the TV app, as the desktop app does it (src-tauri/src/song_id.rs and
 * song_id_gemini.rs): a short WAV clip sent to AudD, or to Gemini, with the viewer's own key.
 */
object SongId {
    data class Song(val title: String, val artist: String, val album: String)

    /** Gemini models tried in turn after the viewer's own choice, as on the desktop. */
    private val MODELS = listOf("gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite")

    private const val PROMPT = "You identify music like Shazam. The audio is a short capture from a movie or " +
        "show, so a song may sit under dialogue, effects or crowd noise. Ignore speech and noise and name the " +
        "music. Give your single best guess for artist and title even if the audio is imperfect. Use an empty " +
        "string for any field you cannot name, and empty strings for both artist and title only when there is " +
        "no music at all. Reply with only a JSON object using the keys artist, title and album. No prose, no " +
        "code fence."

    private val main = Handler(Looper.getMainLooper())

    /** Runs off the main thread; [done] gets the song (null: no match) or an error message. */
    fun recognize(wav: ByteArray, provider: String, key: String, model: String, done: (Song?, String?) -> Unit) {
        Thread {
            val result = try {
                Pair(if (provider == "ai") gemini(wav, key, model) else audd(wav, key), null)
            } catch (e: Exception) {
                Pair(null, e.message ?: "Song identification failed")
            }
            main.post { done(result.first, result.second) }
        }.start()
    }

    private fun audd(wav: ByteArray, key: String): Song? {
        val boundary = "----jl" + System.currentTimeMillis()
        val body = ByteArrayOutputStream()
        fun field(name: String, value: String) {
            body.write("--$boundary\r\nContent-Disposition: form-data; name=\"$name\"\r\n\r\n$value\r\n".toByteArray())
        }
        field("api_token", key)
        field("return", "apple_music,spotify")
        body.write("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"clip.wav\"\r\nContent-Type: audio/wav\r\n\r\n".toByteArray())
        body.write(wav)
        body.write("\r\n--$boundary--\r\n".toByteArray())
        val (status, text) = post("https://api.audd.io/", "multipart/form-data; boundary=$boundary", body.toByteArray(), emptyMap())
        val json = JSONObject(text)
        if (json.optString("status") != "success") {
            val msg = json.optJSONObject("error")?.optString("error_message") ?: "HTTP $status"
            throw Exception("AudD: $msg")
        }
        val r = json.optJSONObject("result") ?: return null
        return Song(r.optString("title"), r.optString("artist"), r.optString("album"))
    }

    private fun gemini(wav: ByteArray, key: String, model: String): Song? {
        val audio = Base64.encodeToString(wav, Base64.NO_WRAP)
        val chain = (listOf(model.trim()).filter { it.isNotEmpty() } + MODELS).distinct()
        var last = "Gemini has no usable model for this key"
        for (m in chain) {
            val body = JSONObject()
                .put("contents", JSONArray().put(JSONObject()
                    .put("role", "user")
                    .put("parts", JSONArray()
                        .put(JSONObject().put("text", PROMPT))
                        .put(JSONObject().put("inlineData", JSONObject().put("mimeType", "audio/wav").put("data", audio))))))
                .put("generationConfig", JSONObject().put("temperature", 0.0).put("responseMimeType", "application/json"))
            val (status, text) = post(
                "https://generativelanguage.googleapis.com/v1beta/models/$m:generateContent",
                "application/json",
                body.toString().toByteArray(),
                mapOf("x-goog-api-key" to key),
            )
            val json = try { JSONObject(text) } catch (_: Exception) { JSONObject() }
            if (status !in 200..299) {
                last = json.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() } ?: "Gemini: HTTP $status"
                // A model this key can't use, or a busy one: try the next. A bad key stops here.
                if (status == 404 || status == 429 || status >= 500 || status == 400) continue
                throw Exception(last)
            }
            val parts = json.optJSONArray("candidates")?.optJSONObject(0)
                ?.optJSONObject("content")?.optJSONArray("parts") ?: return null
            val reply = StringBuilder()
            for (i in 0 until parts.length()) reply.append(parts.optJSONObject(i)?.optString("text").orEmpty())
            val raw = reply.toString().trim()
            val start = raw.indexOf('{')
            val end = raw.lastIndexOf('}')
            if (start < 0 || end <= start) return null
            val song = JSONObject(raw.substring(start, end + 1))
            val title = song.optString("title").trim()
            val artist = song.optString("artist").trim()
            if (title.isEmpty() && artist.isEmpty()) return null
            return Song(title, artist, song.optString("album").trim())
        }
        throw Exception(last)
    }

    private fun post(url: String, type: String, body: ByteArray, headers: Map<String, String>): Pair<Int, String> {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 10_000
            conn.readTimeout = 45_000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", type)
            for ((k, v) in headers) conn.setRequestProperty(k, v)
            conn.outputStream.use { it.write(body) }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            return Pair(status, text)
        } finally {
            conn.disconnect()
        }
    }
}
