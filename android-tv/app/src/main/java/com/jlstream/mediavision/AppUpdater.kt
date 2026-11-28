package com.jlstream.mediavision

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import androidx.appcompat.app.AlertDialog
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Keeps the TV app current without a computer: on start it asks GitHub for the latest JL Media
 * Vision release, and when it is newer than this app, offers to install it. The APK is handed to
 * Android's own installer, which only accepts an update signed with this app's release key.
 */
class AppUpdater(private val activity: Activity) {
    private val main = Handler(Looper.getMainLooper())
    private val prefs = activity.getSharedPreferences("jl.updater", Context.MODE_PRIVATE)
    private var busy = false
    private var waitingForPermission: Release? = null

    data class Release(val version: String, val apkUrl: String, val size: Long)

    /** Called on start and on return to the app; looks at most every few hours. */
    fun check(force: Boolean = false) {
        // Test builds carry their own version suffix and are never replaced by a release.
        if (BuildConfig.DEBUG || busy) return
        waitingForPermission?.let { pending ->
            if (canInstall()) {
                waitingForPermission = null
                download(pending)
            }
            return
        }
        val now = System.currentTimeMillis()
        if (!force && now - prefs.getLong(LAST_CHECK, 0) < CHECK_EVERY_MS) return
        busy = true
        thread(name = "jl-update-check", isDaemon = true) {
            val release = try {
                latestRelease()
            } catch (e: Exception) {
                Log.w(TAG, "Update check failed: ${e.message}")
                null
            }
            main.post {
                busy = false
                if (release == null) return@post
                prefs.edit().putLong(LAST_CHECK, now).apply()
                if (isNewer(release.version, BuildConfig.VERSION_NAME)) offer(release)
            }
        }
    }

    private fun latestRelease(): Release? {
        val json = JSONObject(get(LATEST_URL))
        val tag = json.optString("tag_name")
        if (!tag.startsWith(TAG_PREFIX)) return null
        val assets = json.optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val asset = assets.getJSONObject(i)
            if (asset.optString("name") == APK_NAME) {
                return Release(
                    version = tag.removePrefix(TAG_PREFIX),
                    apkUrl = asset.getString("browser_download_url"),
                    size = asset.optLong("size", -1),
                )
            }
        }
        return null
    }

    private fun offer(release: Release) {
        if (activity.isFinishing) return
        AlertDialog.Builder(activity)
            .setTitle("Update available")
            .setMessage(
                "JL Media Vision ${release.version} is ready (you have ${BuildConfig.VERSION_NAME}).",
            )
            .setPositiveButton("Install") { _, _ -> install(release) }
            .setNegativeButton("Later", null)
            .show()
    }

    private fun install(release: Release) {
        if (canInstall()) {
            download(release)
            return
        }
        // Android asks once whether this app may install updates; the install resumes on return.
        waitingForPermission = release
        AlertDialog.Builder(activity)
            .setTitle("Allow updates")
            .setMessage(
                "Allow JL Media Vision to install its updates, then press Back.\n\n" +
                    "If the app list doesn't open: Settings › Device Preferences › Security & " +
                    "restrictions › Unknown sources › JL Media Vision.",
            )
            .setPositiveButton("Open settings") { _, _ ->
                // Android TV builds differ: the per-app screen, else Security, else Settings.
                val opened = listOf(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:${activity.packageName}"),
                    ),
                    Intent(Settings.ACTION_SECURITY_SETTINGS),
                    Intent(Settings.ACTION_SETTINGS),
                ).any { intent ->
                    try {
                        activity.startActivity(intent)
                        true
                    } catch (_: Exception) {
                        false
                    }
                }
                if (!opened) {
                    waitingForPermission = null
                    failed("This TV has no setting to allow app updates.")
                }
            }
            .setNegativeButton("Later") { _, _ -> waitingForPermission = null }
            .show()
    }

    private fun canInstall(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            activity.packageManager.canRequestPackageInstalls()

    private fun download(release: Release) {
        busy = true
        val progress = AlertDialog.Builder(activity)
            .setTitle("Updating JL Media Vision")
            .setMessage("Downloading ${release.version}…")
            .setCancelable(false)
            .show()
        thread(name = "jl-update-download", isDaemon = true) {
            val file = File(activity.cacheDir, "update.apk")
            val error = try {
                fetch(release.apkUrl, file)
                if (release.size > 0 && file.length() != release.size) "The download was incomplete." else null
            } catch (e: Exception) {
                Log.w(TAG, "Update download failed: ${e.message}")
                "The download failed. Check the connection and try again."
            }
            main.post {
                progress.dismiss()
                busy = false
                if (error != null) failed(error) else commit(file)
            }
        }
    }

    private fun commit(apk: File) {
        try {
            val installer = activity.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
            params.setAppPackageName(activity.packageName)
            val id = installer.createSession(params)
            installer.openSession(id).use { session ->
                session.openWrite("jl-media-vision.apk", 0, apk.length()).use { out ->
                    apk.inputStream().use { it.copyTo(out) }
                    session.fsync(out)
                }
                val action = "${activity.packageName}.UPDATE_STATUS"
                listen(action)
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                val status = PendingIntent.getBroadcast(
                    activity,
                    id,
                    Intent(action).setPackage(activity.packageName),
                    flags,
                )
                session.commit(status.intentSender)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Update install failed: ${e.message}")
            failed("The update couldn't be installed.")
        }
    }

    private var receiver: BroadcastReceiver? = null

    private fun listen(action: String) {
        if (receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
                    PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                        @Suppress("DEPRECATION")
                        val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                        confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        if (confirm != null) activity.startActivity(confirm)
                    }
                    PackageInstaller.STATUS_SUCCESS -> Unit // Android restarts the updated app.
                    PackageInstaller.STATUS_FAILURE_ABORTED -> Unit // The viewer chose Cancel.
                    else -> failed(
                        intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                            ?: "The update couldn't be installed.",
                    )
                }
            }
        }
        val filter = IntentFilter(action)
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(r, filter)
        }
        receiver = r
    }

    fun release() {
        receiver?.let { runCatching { activity.unregisterReceiver(it) } }
        receiver = null
    }

    private fun failed(message: String) {
        if (activity.isFinishing) return
        AlertDialog.Builder(activity)
            .setTitle("Update not installed")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun get(url: String): String {
        val conn = open(url)
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun fetch(url: String, to: File) {
        val conn = open(url)
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
            conn.inputStream.use { input -> to.outputStream().use { input.copyTo(it) } }
        } finally {
            conn.disconnect()
        }
    }

    private fun open(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 60_000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty("User-Agent", "JLMediaVisionTV/${BuildConfig.VERSION_NAME}")
        conn.setRequestProperty("Accept", "application/vnd.github+json, application/octet-stream")
        return conn
    }

    companion object {
        private const val TAG = "JLUpdate"
        private const val LAST_CHECK = "lastCheck"
        private const val CHECK_EVERY_MS = 6 * 60 * 60 * 1000L
        private const val TAG_PREFIX = "jl-v"
        private const val APK_NAME = "JL-Media-Vision-TV.apk"
        private const val LATEST_URL =
            "https://api.github.com/repos/jafar-pixel/harbor/releases/latest"

        /** Whether [candidate] ("0.9.137") is a later version than [current] ("0.9.136"). */
        fun isNewer(candidate: String, current: String): Boolean {
            fun parts(v: String) = v.substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
            val a = parts(candidate)
            val b = parts(current)
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return false
        }
    }
}
