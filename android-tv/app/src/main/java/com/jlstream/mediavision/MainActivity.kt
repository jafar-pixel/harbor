package com.jlstream.mediavision

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
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
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private val appHost: String get() = Uri.parse(BuildConfig.APP_URL).host ?: ""

    /** Whether the WebView is on an app page; the bridge reads it off the main thread. */
    @Volatile private var onAppPage = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        nativePlayer = NativePlayer(this, root, web, ::dispatchPlayerEvent)

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
        web.webViewClient = object : WebViewClient() {
            // The app stays in this view; any other site opens in the plain in-app browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == appHost || uri.host in APP_HOSTS) return false
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

            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                onAppPage = isAppUrl(url)
            }

            override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) {
                nativePlayer.cssScale = newScale
            }

            // Provider requests the page routes through the app (see NativeFetch). Called off the
            // main thread, so the blocking fetch is fine here.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                if (request.url.host != NativeFetch.HOST) return null
                if (!onAppPage || request.method != "GET") return NativeFetch.refused()
                return NativeFetch.handle(request.url)
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
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('jl-native-player', {detail: $detail}))", null)
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
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onBack()
            return true
        }
        if (nativePlayer.handleFullKey(event)) return true
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
                "hidden" -> NativePlayer.Mode.HIDDEN
                else -> return
            }
            onMain { nativePlayer.setMode(next) }
        }

        /** Playback options (README: `setOptions`); they apply from the next `play`. */
        @JavascriptInterface
        fun setOptions(json: String?) {
            val options = NativePlayer.Options.parse(json) ?: return
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
        fun stop() = onMain { nativePlayer.stop() }

        /** The player's own volume, 0 to 1 (README: `setVolume`); the page's volume buttons. */
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

    /** `window.JLNativeFetch`: tells the page it can route provider requests through [NativeFetch]. */
    private inner class FetchBridge {
        @JavascriptInterface
        fun isAvailable(): Boolean = onAppPage
    }

    companion object {
        // Where the web app lives now and after the domain swap.
        val APP_HOSTS = setOf("jl-media-vision.vercel.app", "watch.jl-stream.com")

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
