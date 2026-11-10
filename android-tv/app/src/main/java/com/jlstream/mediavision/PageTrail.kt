package com.jlstream.mediavision

/**
 * The page's last few errors and the screen it was on, kept in memory so a crash report can say
 * what was happening (CrashLog). Addresses are cut to their host, so stream links and their
 * tokens never reach the report.
 */
object PageTrail {
    private const val KEEP = 6
    // Requests a server refuses to the page (CORS) are routine and would crowd out real errors.
    private val ROUTINE = Regex("blocked by CORS policy|net::ERR_|Failed to load resource", RegexOption.IGNORE_CASE)
    private const val MAX_CHARS = 140
    private val URL = Regex("""\b([a-z][a-z0-9+.-]*)://([^/\s'"<>)]+)[^\s'"<>)]*""", RegexOption.IGNORE_CASE)
    private val errors = ArrayDeque<String>()
    private val calls = ArrayDeque<String>()
    private const val KEEP_CALLS = 10

    @Volatile var screen: String = ""
        private set

    @Synchronized
    fun noteError(message: String) {
        if (ROUTINE.containsMatchIn(message)) return
        val clean = sanitize(message)
        if (clean.isBlank() || errors.lastOrNull() == clean) return
        errors.addLast(clean)
        while (errors.size > KEEP) errors.removeFirst()
    }

    /** The app screen's path, without its query (which can hold search words or ids). */
    fun noteScreen(path: String?) {
        screen = path?.substringBefore('?')?.take(80).orEmpty()
    }

    @Synchronized
    fun recentErrors(): List<String> = errors.toList()

    /** A step between the page and the player ("play", "setMode full", "→ ready"), newest last. */
    @Synchronized
    fun noteCall(step: String) {
        if (calls.lastOrNull() == step) return
        calls.addLast(step.take(40))
        while (calls.size > KEEP_CALLS) calls.removeFirst()
    }

    @Synchronized
    fun recentCalls(): List<String> = calls.toList()

    fun sanitize(text: String): String =
        URL.replace(text.replace(Regex("""\s+"""), " ").trim()) { "${it.groupValues[1]}://${it.groupValues[2]}/…" }
            .take(MAX_CHARS)
}
