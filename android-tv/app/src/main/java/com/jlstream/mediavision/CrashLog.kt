package com.jlstream.mediavision

import android.content.Context
import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Why the app last closed unexpectedly: an uncaught error, or the page's renderer stopping. The
 * next launch shows it once, so the reason can be read off the TV instead of guessed at.
 */
object CrashLog {
    private const val PREFS = "jl.crash"
    private const val KEY = "last"
    private const val MAX_CHARS = 2500

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        if (previous is Handler) return
        Thread.setDefaultUncaughtExceptionHandler(Handler(app, previous))
    }

    fun record(context: Context, what: String) {
        val stamp = SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date())
        val text = "$stamp · version ${BuildConfig.VERSION_NAME}\n$what".take(MAX_CHARS)
        // commit, not apply: the process may be about to end.
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, text).commit()
    }

    /** The last report, once; null when the app closed normally. */
    fun take(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val text = prefs.getString(KEY, null) ?: return null
        prefs.edit().remove(KEY).apply()
        return text
    }

    private class Handler(
        private val context: Context,
        private val previous: Thread.UncaughtExceptionHandler?,
    ) : Thread.UncaughtExceptionHandler {
        override fun uncaughtException(thread: Thread, error: Throwable) {
            try {
                record(context, "App error (${thread.name}):\n${Log.getStackTraceString(error)}")
            } catch (_: Throwable) {
                // Nothing more can be done while the app is going down.
            }
            previous?.uncaughtException(thread, error)
        }
    }
}
