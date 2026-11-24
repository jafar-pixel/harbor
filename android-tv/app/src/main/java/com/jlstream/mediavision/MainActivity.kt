package com.jlstream.mediavision

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.InputMethodManager
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

/**
 * The JL Media Vision web app in a full-screen WebView for Android TV and the NVIDIA Shield.
 * The remote's D-pad drives the app's own TV focus navigation; Back walks back through the app
 * and asks before leaving. Streams play in a native ExoPlayer ([NativePlayer]) the page drives
 * through `window.JLNativePlayer` (see android-tv/README.md).
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private lateinit var nativePlayer: NativePlayer
    private lateinit var site: BundledSite
    private lateinit var nativeFetch: NativeFetch
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private val appHost: String get() = Uri.parse(BuildConfig.APP_URL).host ?: ""

    /** Whether the WebView is on an app page; the bridge reads it off the main thread. */
    @Volatile private var onAppPage = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrashLog.install(this)
        // chrome://inspect on a computer the TV already trusts for adb can look inside the app
        // (what loads, what is slow); only while the TV's USB or network debugging is on.
        WebView.setWebContentsDebuggingEnabled(adbDebuggingOn())
        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        CrashLog.take(this)?.let(::showLastCrash)
        nativePlayer = NativePlayer(this, root, web, ::dispatchPlayerEvent)
        site = BundledSite(assets)
        nativeFetch = NativeFetch(::fetchReady)

        CookieManager.getInstance().setAcceptCookie(true)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // Many IPTV providers still serve plain-http streams.
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            userAgentString = "$userAgentString JLMediaVisionTV/${BuildConfig.VERSION_NAME}"
        }
        web.isFocusable = true
        web.isFocusableInTouchMode = true
        web.requestFocus()
        web.addJavascriptInterface(PlayerBridge(), "JLNativePlayer")
        web.addJavascriptInterface(FetchBridge(), "JLNativeFetch")
        web.addJavascriptInterface(KeyboardBridge(), "JLKeyboard")
        web.addJavascriptInterface(AppsBridge(), "JLApps")
        web.webViewClient = object : WebViewClient() {
            // The app stays in this view; any other site opens in the plain in-app browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == appHost || uri.host in APP_HOSTS) return false
                // Google's sign in (Connect YouTube) stays in this view so its redirect lands back
                // in the app; in the separate browser it could never return.
                if (uri.scheme == "https" && isSignInHost(uri.host)) return false
                if (uri.scheme == "https" || uri.scheme == "http") {
                    startActivity(Intent(this@MainActivity, BrowserActivity::class.java).setData(uri))
                }
                return true
            }

            // A new document can't drive the player the old one started.
            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                onAppPage = isAppUrl(url)
                nativePlayer.stop("navigation")
            }

            // The page's renderer died (most often out of memory with a big playlist). Without this
            // Android closes the whole app; instead the screen is rebuilt and the app reopens.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                if (view !== web || isFinishing || isDestroyed) return true
                CrashLog.record(
                    this@MainActivity,
                    pageGoneReport(
                        if (detail.didCrash()) "The page crashed."
                        else "Android closed the page to free memory.",
                    ),
                )
                nativePlayer.release()
                recreate()
                return true
            }

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                onAppPage = isAppUrl(url)
                if (onAppPage) PageTrail.noteScreen(Uri.parse(url).path)
            }

            override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
                nativePlayer.cssScale = newScale
            }

            // Answers to requests the TV made for the page (see NativeFetch); only handed over here,
            // the waiting happened on NativeFetch's own threads.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                // The app's pages come from this APK's own copy (BundledSite), not the website.
                if (request.url.host == appHost) return site.serve(request.method, request.url)
                if (request.url.host != NativeFetch.HOST) return null
                if (!onAppPage || request.method != "GET") return NativeFetch.refused()
                return nativeFetch.take(request.url)
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // Video full screen from the web player.
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (fullscreenView != null) { callback.onCustomViewHidden(); return }
                fullscreenView = view
                fullscreenCallback = callback
                root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                web.visibility = View.GONE
            }

            override fun onHideCustomView() = exitFullscreen()

            // The page's errors, for the crash report (PageTrail cuts addresses to their host).
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    PageTrail.noteError(message.message())
                }
                // The page's timing reports ("[sports-perf] ..."), into adb logcat under "JLPage" on
                // every Android TV; WebView's own console logging isn't there on all of them.
                if (message.message().startsWith("[sports-perf]")) Log.i("JLPage", message.message())
                return super.onConsoleMessage(message)
            }
        }

        if (savedInstanceState != null) web.restoreState(savedInstanceState)
        else web.loadUrl(BuildConfig.APP_URL)
    }

    private fun isAppUrl(url: String?): Boolean {
        val host = Uri.parse(url ?: return false).host ?: return false
        return host == appHost || host in APP_HOSTS
    }

    private fun dispatchPlayerEvent(detail: JSONObject) {
        if (!isAppUrl(web.url)) return
        detail.optString("type").takeIf { it.isNotEmpty() && it != "position" }?.let { PageTrail.noteCall("→ $it") }
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('jl-native-player', {detail: $detail}))", null)
    }

    /** Tells the page a [NativeFetch] answer is ready to read, or why the request failed. */
    private fun fetchReady(id: String, error: String?) {
        val script = "window.__jlNativeFetchDone&&window.__jlNativeFetchDone(" +
            JSONObject.quote(id) + "," + (error?.let(JSONObject::quote) ?: "null") + ")"
        runOnUiThread { if (isAppUrl(web.url)) web.evaluateJavascript(script, null) }
    }

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        root.removeView(view)
        fullscreenView = null
        web.visibility = View.VISIBLE
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        web.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val back = event.keyCode == KeyEvent.KEYCODE_BACK || event.keyCode == KeyEvent.KEYCODE_ESCAPE
        if (back) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                // Full screen: Back first hides the player bar, then leaves.
                if (!nativePlayer.hideBarOnBack()) onBack()
            }
            return true
        }
        if (nativePlayer.handleFullKey(event)) return true
        // Full screen's bar buttons take the arrows and OK; the page underneath doesn't.
        if (nativePlayer.isActive && nativePlayer.mode == NativePlayer.Mode.FULL) return super.dispatchKeyEvent(event)
        // No window-focus check: a dialog has its own window and never reaches this, and the
        // player in the small TV box must not stop the remote from reaching the page.
        if (fullscreenView == null && onAppPage && forwardNavigationKey(event)) return true
        return super.dispatchKeyEvent(event)
    }

    /** Keep D-pad events in the app's focus system instead of WebView spatial navigation, on every screen. */
    private fun forwardNavigationKey(event: KeyEvent): Boolean {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A -> "Enter"
            KeyEvent.KEYCODE_MENU -> "ContextMenu"
            else -> return false
        }
        if (event.action != KeyEvent.ACTION_DOWN && event.action != KeyEvent.ACTION_UP) return false
        // Holding Select must not repeatedly open screens or start streams.
        if (key == "Enter" && event.repeatCount > 0) return true
        val copy = KeyEvent(event)
        val type = if (event.action == KeyEvent.ACTION_DOWN) "keydown" else "keyup"
        val repeat = event.repeatCount > 0
        // Big Picture's root when it is showing, otherwise the regular app: both move focus with
        // the app's own focus system, which reaches every button, list and row. WebView spatial
        // navigation skipped the side lists and the Sports Hub's watch list.
        val script = "(function(){var r=document.querySelector('[data-bp-root]');" +
            "if(r&&getComputedStyle(r).visibility==='hidden')return false;" +
            "if(!r)r=document.body;if(!r)return false;" +
            "var a=document.activeElement;" +
            // Only a field being typed in keeps the arrows; a focused field the remote is moving
            // through (not editing) lets them move focus on, so the remote never gets stuck.
            "if(a&&(a.matches('textarea,select')||a.isContentEditable||" +
            "(a.matches('input')&&a.hasAttribute('data-search-editing'))))return false;" +
            "var e=new KeyboardEvent('$type',{key:'$key',code:'$key'," +
            "bubbles:true,cancelable:true,repeat:$repeat});var target=a||r;" +
            "target.dispatchEvent(e);" +
            "if(e.type==='keydown'&&e.key==='Enter'&&!e.defaultPrevented&&a&&" +
            "a.matches('button,a[href],[role=button],input[type=button],input[type=submit]'))a.click();" +
            "return true;})()"
        web.evaluateJavascript(script) { result ->
            if (result != "true" && !isFinishing && !isDestroyed) web.dispatchKeyEvent(copy)
        }
        return true
    }

    /**
     * Back: leave video full screen, then let Big Picture go back through its own screens, then go
     * back in the app, then ask before closing.
     */
    private fun onBack() {
        if (fullscreenView != null) { exitFullscreen(); return }
        if (!isAppUrl(web.url)) { historyBack(); return }
        // Full screen's player controls are the page's: its Back closes the player. A page that
        // doesn't take it (an older web version) still gets out of full screen here.
        val nativeFull = nativePlayer.isActive && nativePlayer.mode == NativePlayer.Mode.FULL
        // Big Picture keeps its screens in its own stack rather than in WebView history.
        web.evaluateJavascript(PAGE_BACK_JS) { result ->
            when {
                result?.trim('"') == "handled" -> Unit
                nativeFull -> nativePlayer.exitFull()
                result?.trim('"') == "root" -> confirmLeave()
                else -> historyBack()
            }
        }
    }

    private fun historyBack() {
        if (web.canGoBack()) web.goBack() else confirmLeave()
    }

    /**
     * What was going on when the page stopped: the screen, the player, the TV's free memory, the
     * WebView version and the page's last errors, so a photo of the report says enough to fix it.
     */
    private fun pageGoneReport(what: String): String {
        val memory = ActivityManager.MemoryInfo().also {
            (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it)
        }
        val mb = { bytes: Long -> bytes / (1024 * 1024) }
        val webView = WebView.getCurrentWebViewPackage()?.versionName ?: "unknown"
        val errors = PageTrail.recentErrors()
        return buildList {
            add(what)
            add("Screen: ${PageTrail.screen.ifBlank { "/" }}")
            add("Player: ${nativePlayer.crashSummary()}")
            add("TV mode: ${nativePlayer.displaySummary()}")
            add(
                "Free memory: ${mb(memory.availMem)} of ${mb(memory.totalMem)} MB" +
                    if (memory.lowMemory) " (low)" else "",
            )
            add("WebView $webView")
            PageTrail.page.takeIf { it.isNotBlank() }?.let { add("Page: $it") }
            val calls = PageTrail.recentCalls()
            if (calls.isNotEmpty()) add("Last steps: " + calls.joinToString(", "))
            if (errors.isNotEmpty()) add("Last errors:\n" + errors.joinToString("\n") { "• $it" })
        }.joinToString("\n")
    }

    /** Why the app closed last time, so it can be photographed and fixed. */
    private fun showLastCrash(report: String) {
        AlertDialog.Builder(this)
            .setTitle("JL Media Vision closed unexpectedly")
            .setMessage("Take a photo of this so it can be fixed.\n\n$report")
            .setPositiveButton("OK", null)
            .show()
    }

    private fun confirmLeave() {
        AlertDialog.Builder(this)
            .setTitle("Leave JL Media Vision?")
            .setPositiveButton("Leave") { _, _ -> finish() }
            .setNegativeButton("Stay", null)
            .show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        nativePlayer.pause()
        nativePlayer.restoreDisplayMode()
    }

    override fun onResume() {
        super.onResume()
        nativePlayer.matchDisplayMode()
    }

    override fun onStop() {
        super.onStop()
        // Frees the decoder and the provider connection (IPTV accounts often allow only one).
        nativePlayer.stop("background")
        CookieManager.getInstance().flush()
    }

    override fun onDestroy() {
        nativePlayer.release()
        web.destroy()
        super.onDestroy()
    }

    /**
     * USB or network debugging is on. NVIDIA's Shield turns on network debugging without the usual
     * settings (both read 0 there), so adb listening on a network port, or Developer options being
     * on, count too.
     */
    private fun adbDebuggingOn(): Boolean {
        fun global(name: String) = try {
            Settings.Global.getInt(contentResolver, name, 0) == 1
        } catch (_: Exception) {
            false
        }
        return global(Settings.Global.ADB_ENABLED) ||
            global("adb_wifi_enabled") ||
            global(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) ||
            adbTcpPort() > 0
    }

    /** The port adb listens on over the network (service.adb.tcp.port), or 0. */
    private fun adbTcpPort(): Int = try {
        val props = Class.forName("android.os.SystemProperties")
        val get = props.getMethod("get", String::class.java)
        listOf("service.adb.tcp.port", "persist.adb.tcp.port")
            .firstNotNullOfOrNull { (get.invoke(null, it) as? String)?.toIntOrNull()?.takeIf { p -> p > 0 } }
            ?: 0
    } catch (_: Exception) {
        0
    }

    /**
     * `window.JLApps`: "Your apps" opens a subscription app (Netflix, YouTube TV...) on this TV.
     * JL Media Vision is the hub; the services play in their own apps.
     */
    private inner class AppsBridge {
        @JavascriptInterface
        fun open(packages: String?, name: String?, url: String?): Boolean {
            if (!onAppPage) return false
            val list = packages.orEmpty().split(',').map { it.trim() }
                .filter { it.matches(Regex("[A-Za-z0-9_.]{3,120}")) }
            val site = url.orEmpty().takeIf { it.startsWith("https://") }
            runOnUiThread { launchApp(list, site) }
            return true
        }
    }

    /** The installed app, else its store page (Google Play, then Amazon's), else its website. */
    private fun launchApp(packages: List<String>, site: String?) {
        for (pkg in packages) {
            val intent = packageManager.getLeanbackLaunchIntentForPackage(pkg)
                ?: packageManager.getLaunchIntentForPackage(pkg)
                ?: continue
            if (tryStart(intent)) return
        }
        packages.firstOrNull()?.let { pkg ->
            if (tryStart(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")))) return
            if (tryStart(Intent(Intent.ACTION_VIEW, Uri.parse("amzn://apps/android?p=$pkg")))) return
        }
        site?.let { startActivity(Intent(this, BrowserActivity::class.java).setData(Uri.parse(it))) }
    }

    private fun hasHardwareKeyboard(): Boolean {
        val config = resources.configuration
        return config.keyboard == Configuration.KEYBOARD_QWERTY &&
            config.hardKeyboardHidden == Configuration.HARDKEYBOARDHIDDEN_NO
    }

    private fun tryStart(intent: Intent): Boolean = try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: ActivityNotFoundException) {
        false
    } catch (_: SecurityException) {
        false
    }

    /**
     * `window.JLKeyboard`: the page asks for the on-screen keyboard when the viewer starts typing
     * in a field (OK on a search box) and closes it when they leave the field. Android only opens
     * it, and only sends a keyboard's keys to the field, when the app asks; a field the page
     * focuses by itself gets neither.
     */
    private inner class KeyboardBridge {
        @JavascriptInterface
        fun show() {
            if (!onAppPage) return
            runOnUiThread {
                if (!isAppUrl(web.url)) return@runOnUiThread
                web.requestFocus()
                val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                imm.restartInput(web)
                // A keyboard is plugged in or paired: type on it, no on-screen keyboard over the page.
                if (!hasHardwareKeyboard()) imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT)
            }
        }

        @JavascriptInterface
        fun hide() {
            runOnUiThread {
                val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                imm.hideSoftInputFromWindow(web.windowToken, 0)
            }
        }
    }

    /**
     * `window.JLNativePlayer`. Calls arrive on a WebView thread; player work hops to the main
     * thread, and is dropped unless the WebView is still on an app page.
     */
    private inner class PlayerBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = onAppPage

        /** False when the URL isn't http(s) or the page isn't the app. */
        @JavascriptInterface
        fun play(url: String?, headersJson: String?, title: String?, startMs: Long): Boolean {
            if (!onAppPage || url == null) return false
            val uri = Uri.parse(url)
            if ((uri.scheme != "https" && uri.scheme != "http") || uri.host.isNullOrEmpty()) return false
            val headers = parseHeaders(headersJson)
            PageTrail.noteCall("play")
            onMain { nativePlayer.play(url, headers, title.orEmpty(), startMs) }
            return true
        }

        @JavascriptInterface
        fun setRect(x: Double, y: Double, w: Double, h: Double) = onMain { nativePlayer.setRect(x, y, w, h) }

        @JavascriptInterface
        fun setMode(mode: String?) {
            val next = when (mode) {
                "full" -> NativePlayer.Mode.FULL
                "hero" -> NativePlayer.Mode.HERO
                "under" -> NativePlayer.Mode.UNDER
                "hidden" -> NativePlayer.Mode.HIDDEN
                else -> return
            }
            PageTrail.noteCall("setMode $mode")
            onMain { nativePlayer.setMode(next) }
        }

        /** Whether the video can play under the page's overlays (README: `canShowUnderPage`). */
        @JavascriptInterface
        fun canShowUnderPage(): Boolean = onAppPage && nativePlayer.canShowUnderPage()

        /** Playback options (README: `setOptions`); they apply from the next `play`. */
        @JavascriptInterface
        fun setOptions(json: String?) {
            val options = NativePlayer.Options.parse(json) ?: return
            PageTrail.noteCall("setOptions")
            onMain { nativePlayer.options = options }
        }

        /** What the TV can show and pass through, as JSON (README: `capabilities`). */
        @JavascriptInterface
        fun capabilities(): String =
            if (onAppPage) NativePlayer.capabilities(this@MainActivity).toString() else "{}"

        /** The playing stream's audio tracks, as JSON (README: `audioTracks`). `"[]"` off an app page. */
        @JavascriptInterface
        fun audioTracks(): String = if (onAppPage) nativePlayer.audioTracksJson else "[]"

        /** Prefers audio in this language, now and for the next `play` (README: `setPreferredAudioLanguage`). */
        @JavascriptInterface
        fun setPreferredAudioLanguage(lang: String?) = onMain { nativePlayer.setPreferredAudioLanguage(lang) }

        /** A short message over the full-screen video (README: `showMessage`); ignored outside `full`. */
        @JavascriptInterface
        fun showMessage(text: String?) {
            val message = text?.trim()?.take(200)?.takeIf { it.isNotEmpty() } ?: return
            onMain { nativePlayer.showMessage(message) }
        }

        @JavascriptInterface
        fun pause() = onMain { nativePlayer.pause() }

        @JavascriptInterface
        fun resume() = onMain { nativePlayer.resume() }

        @JavascriptInterface
        fun seek(ms: Long) = onMain { nativePlayer.seek(ms) }

        @JavascriptInterface
        fun stop() {
            PageTrail.noteCall("stop")
            onMain { nativePlayer.stop() }
        }

        /** The player's own volume, 0 to 1 (README: `setVolume`); the page's volume buttons. */
        /** What the page is doing, for a crash report (README: `notePage`). */
        @JavascriptInterface
        fun notePage(text: String?) {
            if (onAppPage && text != null) PageTrail.notePage(text)
        }

        @JavascriptInterface
        fun setVolume(volume: Double) = onMain { nativePlayer.setVolume(volume.toFloat()) }

        private fun onMain(action: () -> Unit) {
            if (!onAppPage) return
            runOnUiThread { if (isAppUrl(web.url)) action() }
        }

        private fun parseHeaders(json: String?): Map<String, String> {
            val o = try { JSONObject(json ?: return emptyMap()) } catch (_: Exception) { return emptyMap() }
            val headers = HashMap<String, String>()
            for (name in o.keys()) {
                val value = o.optString(name)
                if (name.isNotBlank() && value.isNotEmpty()) headers[name] = value
            }
            return headers
        }
    }

    /** `window.JLNativeFetch`: the page's requests that the TV makes itself ([NativeFetch]). */
    private inner class FetchBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = onAppPage

        /** Starts a request and returns its id, or "" off the app's pages or for a bad request. */
        @JavascriptInterface
        fun start(json: String?): String = if (onAppPage) nativeFetch.start(json) else ""

        @JavascriptInterface
        fun cancel(id: String?) = nativeFetch.cancel(id)
    }

    companion object {
        /** A long film's subtitles are well under 1 MB; anything far larger isn't a subtitle. */

        // Where the web app lives now and after the domain swap.
        val APP_HOSTS = setOf("jl-media-vision.vercel.app", "watch.jl-stream.com")
        val SIGN_IN_HOSTS = setOf("accounts.youtube.com")

        /** Google's sign in moves between its own pages (consent, 2-step checks) before it returns. */
        fun isSignInHost(host: String?): Boolean =
            host != null && (host == "google.com" || host.endsWith(".google.com") || host in SIGN_IN_HOSTS)

        // Big Picture's Back chain (src/views/big-picture/bp-back.ts): "handled" when it went back
        // a screen, "root" at its home screen, "none" when Big Picture is not open.
        // Big Picture walks its own screens; the regular app goes back through its own screens
        // (App.tsx __harborAppBack). Either says "root" when there is nowhere left to go.
        private const val PAGE_BACK_JS = "(function(){var bp=document.documentElement.hasAttribute('data-big-picture');" +
            "var b=bp?window.__harborBack:window.__harborAppBack;" +
            "if(typeof b!=='function')return 'none';" +
            "try{return b()?'handled':'root'}catch(e){return 'none'}})()"
    }
}
