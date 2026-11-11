package com.jlstream.mediavision

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.Point
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.appcompat.app.AlertDialog
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Format
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.common.util.Util
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.upstream.DefaultBandwidthMeter
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.Renderer
import androidx.media3.exoplayer.analytics.AnalyticsListener
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import androidx.media3.exoplayer.text.TextOutput
import androidx.media3.exoplayer.audio.AudioCapabilities
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.TeeAudioProcessor
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import androidx.media3.ui.DefaultTimeBar
import androidx.media3.ui.PlayerControlView
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * ExoPlayer drawn over the WebView, driven by the web app through [MainActivity]'s
 * `window.JLNativePlayer` bridge. Every method runs on the main thread.
 *  - FULL: fills the screen; the remote controls playback. On a live channel Down opens the
 *    page's Today's games list over the picture; otherwise the arrows bring up the bar.
 *  - HERO: placed in the page's sticky hero area (a rect the page sends); the WebView keeps the remote.
 *  - HIDDEN: not drawn; playback carries on until the page pauses or stops it.
 * Video is picked up to the TV's largest display mode (4K on a 4K set) and drawn on the default
 * surface, so HDR10 and Dolby Vision reach the TV as they are. [Options] come from the page.
 */
@OptIn(UnstableApi::class)
class NativePlayer(
    private val activity: Activity,
    private val root: FrameLayout,
    /** The WebView: hero rects are relative to it, and it takes the remote outside full screen. */
    private val web: View,
    /** Sends an event's detail to the page. */
    private val emit: (JSONObject) -> Unit,
) {
    /**
     * FULL: the video fills the screen above the page, with this app's controls. HERO: a box over
     * the page. UNDER: the video fills the screen under the page, so the page's own overlays
     * (Live TV's channel list, the stream picker) show over a live picture; HDR and Dolby Vision
     * can't go under the page (their colours break), so they are hidden instead. HIDDEN: no video.
     */
    enum class Mode { FULL, HERO, UNDER, HIDDEN }

    /** Playback options the page sends through `setOptions`; they apply from the next [play]. */
    data class Options(
        /** Switch the display to the video's frame rate (and up to its size) while in FULL. */
        val matchFrameRate: Boolean = true,
        /** The tallest video to pick, 0 for no limit. */
        val maxHeight: Int = 0,
        /** Send AC3/E-AC3/DTS/TrueHD to the receiver undecoded when it reports support. */
        val audioPassthrough: Boolean = true,
        /** Tunneled playback; off by default because some streams fail to start with it. */
        val tunneling: Boolean = false,
        /** Identify song on the bar: on, "audd" or "ai", the viewer's key and Gemini model. */
        val songIdEnabled: Boolean = false,
        val songIdProvider: String = "audd",
        val songIdKey: String = "",
        val songIdModel: String = "",
        /**
         * The player bar's buttons in the viewer's order (Settings › Player layout), as the page's
         * control ids; null keeps this app's default row. Ids the TV can't do are skipped.
         */
        val controls: List<String>? = null,
        /** The title and the stream's labels (e.g. "Hope · 4K · HDR10 · DTS-HD MA"), shown with the bar. */
        val info: String = "",
        /** Subtitle look (Settings › Subtitles): text size as the page's px at 1080p, colours, style. */
        val subSize: Int = 32,
        val subColor: Int = Color.WHITE,
        val subEdgeColor: Int = Color.BLACK,
        /** "shadow", "outline" or "box". */
        val subStyle: String = "shadow",
        val subBoxColor: Int = Color.argb(153, 0, 0, 0),
        /** Settings › Intros: what skips by itself, and whether the skip button shows. */
        val skipIntro: Boolean = false,
        val skipRecap: Boolean = false,
        val skipOutro: Boolean = false,
        val skipButton: Boolean = true,
        /** The theme's accent colour, for the seek bar. */
        val accent: Int = Color.rgb(47, 134, 255),
    ) {
        companion object {
            private fun color(hex: String?, fallback: Int): Int =
                try { if (hex.isNullOrBlank()) fallback else Color.parseColor(hex) } catch (_: Exception) { fallback }

            fun parse(json: String?): Options? {
                val o = try { JSONObject(json ?: return null) } catch (_: Exception) { return null }
                val d = Options()
                return Options(
                    matchFrameRate = o.optBoolean("matchFrameRate", d.matchFrameRate),
                    maxHeight = when (o.optString("maxResolution")) { "1080p" -> 1080; "720p" -> 720; else -> 0 },
                    audioPassthrough = o.optBoolean("audioPassthrough", d.audioPassthrough),
                    tunneling = o.optBoolean("tunneling", d.tunneling),
                    songIdEnabled = o.optJSONObject("songId")?.optBoolean("enabled", false) ?: false,
                    songIdProvider = o.optJSONObject("songId")?.optString("provider", "audd") ?: "audd",
                    songIdKey = o.optJSONObject("songId")?.optString("key", "") ?: "",
                    songIdModel = o.optJSONObject("songId")?.optString("model", "") ?: "",
                    controls = o.optJSONArray("controls")?.let { a ->
                        (0 until a.length()).mapNotNull { i -> a.optString(i).takeIf { it.isNotBlank() } }
                    },
                    info = o.optString("info", "").take(300),
                    subSize = o.optJSONObject("subtitles")?.optInt("size", d.subSize)?.coerceIn(12, 96) ?: d.subSize,
                    subColor = color(o.optJSONObject("subtitles")?.optString("color"), d.subColor),
                    subEdgeColor = color(o.optJSONObject("subtitles")?.optString("edgeColor"), d.subEdgeColor),
                    subStyle = o.optJSONObject("subtitles")?.optString("style", d.subStyle) ?: d.subStyle,
                    subBoxColor = o.optJSONObject("subtitles")?.let { sub ->
                        val base = color(sub.optString("boxColor"), Color.BLACK)
                        val alpha = (sub.optDouble("boxOpacity", 0.6).coerceIn(0.0, 1.0) * 255).toInt()
                        Color.argb(alpha, Color.red(base), Color.green(base), Color.blue(base))
                    } ?: d.subBoxColor,
                    skipIntro = o.optJSONObject("skip")?.optBoolean("intro", d.skipIntro) ?: d.skipIntro,
                    skipRecap = o.optJSONObject("skip")?.optBoolean("recap", d.skipRecap) ?: d.skipRecap,
                    skipOutro = o.optJSONObject("skip")?.optBoolean("outro", d.skipOutro) ?: d.skipOutro,
                    skipButton = o.optJSONObject("skip")?.optBoolean("button", d.skipButton) ?: d.skipButton,
                    accent = color(o.optString("accent").takeIf { it.startsWith("#") }, d.accent),
                )
            }
        }
    }

    var options = Options()

    /** The audio language the page asked for (`setPreferredAudioLanguage`) or last picked in the menu; kept until [stop]. */
    private var preferredAudioLanguage: String? = null

    /** The playing stream's audio tracks as JSON for `audioTracks()`, which the WebView reads off the main thread. */
    @Volatile var audioTracksJson: String = "[]"
        private set

    var mode = Mode.HIDDEN
        private set


    /** Device pixels per CSS pixel; MainActivity keeps it in step with the WebView's zoom. */
    var cssScale = activity.resources.displayMetrics.density

    private val view = PlayerView(activity).apply {
        visibility = View.GONE
        setBackgroundColor(Color.BLACK)
        keepScreenOn = true
        useController = false
        isFocusable = false
        controllerShowTimeoutMs = 5000
        controllerAutoShow = false
        setShowBuffering(PlayerView.SHOW_BUFFERING_WHEN_PLAYING)
    }

    private var player: ExoPlayer? = null
    /** The hero rect in CSS pixels (x, y, w, h), or null when the page hasn't sent one. */
    private var heroRect: DoubleArray? = null
    private var readySent = false
    /** The window's preferredDisplayModeId before playback changed it; null while unchanged. */
    private var savedDisplayModeId: Int? = null

    /** The full-screen "Audio & options" menu while it is open; see [openMenu]. */
    private var menu: AlertDialog? = null
    private var toast: Toast? = null

    private val handler = Handler(Looper.getMainLooper())
    private val positionTick = object : Runnable {
        override fun run() {
            if (player?.isPlaying == true) send("position")
            handler.postDelayed(this, 1000)
        }
    }

    val isActive get() = player != null

    /** The last seconds of decoded sound, for Identify song. */
    private val songCapture = SongCapture()

    /** Full screen's picture fit, chosen on the controls; kept across videos. */
    private var aspect = AspectRatioFrameLayout.RESIZE_MODE_FIT

    /** Full screen was set up (the page sends "full" again on every layout pass; set up once). */
    private var fullShown = false

    // Buttons this app adds to Media3's own controls, as Just Player (moneytoo/Player) does:
    // Media3 keeps D-pad focus and clicks working for its bar, and these join it.
    /** The bar's own buttons, rebuilt from the viewer's layout before each play. */
    private val row = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }

    private val infoLine = TextView(activity).apply {
        visibility = View.GONE
        setTextColor(Color.WHITE)
        textSize = 20f
        maxLines = 2
        typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL)
        setShadowLayer(10f, 0f, 2f, Color.BLACK)
        val pad = (24 * activity.resources.displayMetrics.density).toInt()
        // Top left, as on the desktop player; the controls' scrim darkens the top behind it.
        setPadding(pad * 2, pad * 2, pad * 6, pad)
    }

    private val speeds = floatArrayOf(1f, 1.25f, 1.5f, 2f, 0.5f, 0.75f)

    /** The playing item without side-loaded subtitles, and the subtitles the page added to it. */
    private var baseItem: MediaItem? = null
    private val sideSubtitles = ArrayList<MediaItem.SubtitleConfiguration>()
    private val sideSubtitleKeys = HashSet<String>()
    private var selector: DefaultTrackSelector? = null

    /** Audio and subtitle timing; see [SyncOffsets]. Audio timing stays for the next video, as in mpv. */
    private val sync = SyncOffsets()

    /** The decoders playing the video and sound, for Stream info. */
    private var videoDecoder: String? = null
    /** Whether this stream's first load was checked for an addon's placeholder video. */
    private var sourceChecked = false
    private var audioDecoder: String? = null

    /** The skip button over the video (Skip intro, Skip credits, Next episode); see [setSkipButton]. */
    private var skipAction: (() -> Unit)? = null
    private val skipView = TextView(activity).apply {
        visibility = View.GONE
        isFocusable = true
        setTextColor(Color.WHITE)
        textSize = 20f
        val padH = (28 * activity.resources.displayMetrics.density).toInt()
        val padV = (14 * activity.resources.displayMetrics.density).toInt()
        setPadding(padH, padV, padH, padV)
        background = GradientDrawable().apply {
            cornerRadius = 999f
            setColor(Color.argb(200, 12, 16, 30))
            setStroke((2 * activity.resources.displayMetrics.density).toInt(), Color.argb(150, 255, 255, 255))
        }
        setOnClickListener { skipAction?.invoke() }
    }

    private val songButton = extraButton(R.drawable.jl_ic_song, "Identify song") { identifySong() }

    init {
        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        val basic = view.findViewById<LinearLayout>(androidx.media3.ui.R.id.exo_basic_controls)
        if (basic != null) {
            basic.addView(HorizontalScrollView(activity).apply {
                isHorizontalScrollBarEnabled = false
                addView(row)
            }, 0)
        }
        buildRow()
        // The title and stream labels across the top while the bar is up.
        view.overlayFrameLayout?.addView(infoLine, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.START,
        ))
        // Time left at the end of the seek bar (res/layout/exo_player_control_view.xml).
        view.findViewById<PlayerControlView>(androidx.media3.ui.R.id.exo_controller)
            ?.setProgressUpdateListener { position, _ -> showTimeLeft(position) }
        view.overlayFrameLayout?.addView(skipView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END,
        ).apply {
            val m = (48 * activity.resources.displayMetrics.density).toInt()
            setMargins(m, m, m, m * 3)
        })
        view.setShowNextButton(false)
        view.setShowPreviousButton(false)
        view.setShowRewindButton(true)
        view.setShowFastForwardButton(true)
        view.setShowSubtitleButton(true)
        view.setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { visibility ->
            // The remote lands on play/pause whenever the controls come up (as in Just Player;
            // otherwise focus starts on the first button of the bottom bar).
            if (visibility == View.VISIBLE && mode == Mode.FULL) {
                view.findViewById<View>(androidx.media3.ui.R.id.exo_play_pause)?.requestFocus()
            }
            infoLine.visibility = if (visibility == View.VISIBLE && options.info.isNotBlank()) View.VISIBLE else View.GONE
        })
    }


    /**
     * The buttons in the viewer's order (Settings › Player layout). Play/pause and the 10 second
     * skips are Media3's own, in the middle of the bar; controls the TV can't do (shaders, RTX,
     * picture-in-picture, window buttons) are left out.
     */
    private fun buildRow() {
        row.removeAllViews()
        // The player menu (gear) always comes last, so audio, subtitles and the rest are one press away.
        val ids = ((options.controls ?: DEFAULT_ROW) + "menu").distinctBy { if (it == "back") "stop" else it }
        for (id in ids) buttonFor(id)?.let { button ->
            (button.parent as? ViewGroup)?.removeView(button)
            row.addView(button)
        }
    }

    private fun buttonFor(id: String): View? = when (id) {
        // The desktop player's icons (Lucide, res/drawable/jl_ic_*).
        "pick-another" -> extraButton(R.drawable.jl_ic_streams, "Change stream or channel") { openPanel() }
        "english-dub" -> extraButton(R.drawable.jl_ic_dub, "English dub") { englishDub() }
        "aspect-menu" -> extraButton(R.drawable.jl_ic_aspect, "Picture fit") { showMessage(nextAspect()) }
        "song-id" -> songButton
        "stop", "back" -> extraButton(R.drawable.jl_ic_stop, "Stop") { exitFull() }
        "audio-menu" -> extraButton(R.drawable.jl_ic_audio, "Audio") { openMenu() }
        "subtitle-menu" -> extraButton(R.drawable.jl_ic_subtitles, "Subtitles") { openMenu() }
        "menu" -> extraButton(R.drawable.jl_ic_menu, "Player menu") { openMenu() }
        "today-games" -> extraButton(R.drawable.jl_ic_games, "Today's games") { control("today-games") }
        "speed-menu" -> extraButton(R.drawable.jl_ic_speed, "Playback speed") { showMessage(nextSpeed()) }
        "prev-episode" -> extraButton(R.drawable.jl_ic_prev, "Previous episode") { control("prev-episode") }
        "next-episode" -> extraButton(R.drawable.jl_ic_next, "Next episode") { control("next-episode") }
        else -> null
    }

    /** A button the page carries out (next or previous episode); see bridge.ts "control". */
    private fun control(id: String) {
        view.hideController()
        emit(JSONObject().put("type", "control").put("id", id).put("mode", mode.name.lowercase(Locale.ROOT)))
    }

    private val timeLeft: TextView? get() = view.findViewById(R.id.jl_time_left)

    private fun showTimeLeft(position: Long) {
        val label = timeLeft ?: return
        val duration = player?.duration ?: C.TIME_UNSET
        if (duration == C.TIME_UNSET || duration <= 0 || player?.isCurrentMediaItemLive == true) {
            label.text = ""
            return
        }
        val left = ((duration - position).coerceAtLeast(0) + 999) / 1000
        label.text = if (left >= 3600) String.format(Locale.US, "-%d:%02d:%02d", left / 3600, left / 60 % 60, left % 60)
        else String.format(Locale.US, "-%d:%02d", left / 60, left % 60)
    }

    /** The theme's accent on the seek bar, as on the desktop player. */
    private fun applyAccent() {
        val bar = view.findViewById<DefaultTimeBar>(androidx.media3.ui.R.id.exo_progress) ?: return
        val accent = options.accent
        bar.setPlayedColor(accent)
        bar.setScrubberColor(accent)
        bar.setBufferedColor(Color.argb(110, 255, 255, 255))
        bar.setUnplayedColor(Color.argb(60, 255, 255, 255))
    }

    private fun nextSpeed(): String {
        val p = player ?: return "Nothing is playing"
        val now = p.playbackParameters.speed
        val at = speeds.indexOfFirst { kotlin.math.abs(it - now) < 0.01f }
        val next = speeds[(at + 1).mod(speeds.size)]
        p.setPlaybackSpeed(next)
        return if (next == 1f) "Speed: Normal" else "Speed: ${next}×"
    }

    private fun extraButton(icon: Int, label: String, onPress: () -> Unit): ImageButton =
        ImageButton(activity, null, 0, androidx.media3.ui.R.style.ExoStyledControls_Button_Bottom).apply {
            setImageResource(icon)
            contentDescription = label
            setOnClickListener { onPress() }
        }

    /** Asks the page for its stream picker (or, live, the channel list); see bridge.ts "panel". */
    private fun openPanel() {
        view.hideController()
        send("panel")
    }

    /**
     * A subtitle the page found (an addon's or a subtitle site's, downloaded and parsed by the page
     * as on the desktop) joins the playing video as a WebVTT track. Media3 adds side-loaded
     * subtitles only when the item is prepared, so the item is set again at the same position.
     */
/**
     * The page's skip button (Settings › Intros), drawn over the video: JSON {label, toSec} skips
     * to that second, {label, action: "next"} asks the page for the next episode, "" hides it.
     */
    fun setSkipButton(json: String) {
        val o = try { if (json.isBlank()) null else JSONObject(json) } catch (_: Exception) { null }
        val label = o?.optString("label").orEmpty()
        if (o == null || label.isBlank() || !options.skipButton || mode != Mode.FULL) {
            if (skipView.hasFocus()) view.requestFocus()
            skipView.visibility = View.GONE
            skipAction = null
            return
        }
        val toSec = o.optDouble("toSec", -1.0)
        val next = o.optString("action") == "next"
        skipAction = {
            skipView.visibility = View.GONE
            if (next) control("next-episode")
            else if (toSec >= 0) seek((toSec * 1000).toLong())
        }
        skipView.text = label
        skipView.visibility = View.VISIBLE
    }

    /** OK on the remote presses the skip button while it shows and the bar is hidden. */
    fun pressSkipIfShown(): Boolean {
        val action = skipAction ?: return false
        if (skipView.visibility != View.VISIBLE) return false
        action()
        return true
    }

    fun addSubtitleText(vtt: String, language: String?, label: String?, select: Boolean): Boolean {
        if (player == null || baseItem == null) return false
        val lang = language?.takeIf { it.isNotBlank() }
        // The same subtitle again (the page restores and auto-picks the same one): just show it.
        val key = "${vtt.length}:${vtt.hashCode()}"
        if (key in sideSubtitleKeys) {
            if (select) setSubtitlesEnabled(true, lang)
            return true
        }
        val dir = File(activity.cacheDir, "subtitles").apply { mkdirs() }
        if (sideSubtitles.isEmpty()) dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "sub-${sideSubtitles.size}-${System.currentTimeMillis()}.vtt")
        try {
            file.writeText(vtt)
        } catch (_: Exception) {
            return false
        }
        sideSubtitleKeys += key
        sideSubtitles += MediaItem.SubtitleConfiguration.Builder(Uri.fromFile(file))
            .setMimeType(MimeTypes.TEXT_VTT)
            .setLanguage(lang)
            .setLabel(label?.takeIf { it.isNotBlank() } ?: lang ?: "Subtitles")
            .setId("jl-sub-${sideSubtitles.size}")
            .setSelectionFlags(if (select) C.SELECTION_FLAG_DEFAULT else 0)
            .build()
        if (select) setSubtitlesEnabled(true, lang)
        // Each change of side-loaded subtitles reloads the stream; subtitles the page adds in a
        // burst (as a video starts) are taken in one reload instead of one each.
        handler.removeCallbacks(applySideSubtitles)
        handler.postDelayed(applySideSubtitles, SUBTITLE_BATCH_MS)
        return true
    }

    private val applySideSubtitles = Runnable {
        val p = player ?: return@Runnable
        val base = baseItem ?: return@Runnable
        val at = p.currentPosition
        val playing = p.playWhenReady
        p.setMediaItem(base.buildUpon().setSubtitleConfigurations(ArrayList(sideSubtitles)).build(), at)
        p.prepare()
        p.playWhenReady = playing
    }

    /** Subtitles on or off (the page's subtitle menu and its Off item); [language] is preferred when on. */
    fun setSubtitlesEnabled(on: Boolean, language: String? = null) {
        val s = selector ?: return
        val params = s.buildUponParameters().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !on)
        if (on && language != null) params.setPreferredTextLanguage(language)
        s.setParameters(params.build())
    }

    /** The viewer's subtitle size, colours and style (Settings › Subtitles), as on the desktop. */
    private fun applySubtitleStyle() {
        val sub = view.subtitleView ?: return
        val o = options
        val (edgeType, background) = when (o.subStyle) {
            "box" -> CaptionStyleCompat.EDGE_TYPE_NONE to o.subBoxColor
            "outline" -> CaptionStyleCompat.EDGE_TYPE_OUTLINE to Color.TRANSPARENT
            else -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW to Color.TRANSPARENT
        }
        sub.setStyle(CaptionStyleCompat(o.subColor, background, Color.TRANSPARENT, edgeType, o.subEdgeColor, null))
        // The page's size is in px at 1080p (32 by default); Media3's default is a fraction of the height.
        sub.setFractionalTextSize(SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * o.subSize / 32f)
        sub.setApplyEmbeddedStyles(false)
    }

    private fun nextAspect(): String {
        val (next, label) = when (aspect) {
            AspectRatioFrameLayout.RESIZE_MODE_FIT -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM to "Picture: Zoom"
            AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> AspectRatioFrameLayout.RESIZE_MODE_FILL to "Picture: Stretch"
            else -> AspectRatioFrameLayout.RESIZE_MODE_FIT to "Picture: Fit"
        }
        aspect = next
        view.resizeMode = next
        return label
    }

    private var identifying = false

    /** Names the song in the last 8 seconds, with the viewer's service and key (Settings). */
    private fun identifySong() {
        if (identifying) return
        val key = options.songIdKey
        if (key.isBlank()) {
            showMessage("Add your song key in Settings › Library & metadata")
            return
        }
        val wav = songCapture.lastWav()
        if (wav == null) {
            showMessage(
                if (options.audioPassthrough) "Can't hear this audio: it goes to your receiver as Dolby or DTS. Turn off Audio passthrough in Video tuning to name songs."
                else "Let it play a few seconds, then try again.",
            )
            return
        }
        if (!songCapture.audible(wav)) {
            showMessage("Nothing to hear. Try again while the music is playing.")
            return
        }
        identifying = true
        showMessage("Listening…")
        SongId.recognize(wav, options.songIdProvider, key, options.songIdModel) { song, error ->
            identifying = false
            showMessage(
                when {
                    error != null -> "Song identification failed: ${error.take(160)}"
                    song == null -> "Couldn't identify the song"
                    else -> listOf(
                        "♪ " + song.title.ifEmpty { song.artist },
                        listOf(if (song.title.isNotEmpty()) song.artist else "", song.album).filter { it.isNotEmpty() }.joinToString(" · "),
                    ).filter { it.isNotBlank() }.joinToString("\n")
                },
            )
        }
    }

    /** Back with the controls up hides them (Just Player does the same); true when it did. */
    fun hideBarOnBack(): Boolean {
        if (mode != Mode.FULL || !view.isControllerFullyVisible) return false
        view.hideController()
        return true
    }

    fun play(url: String, headers: Map<String, String>, title: String, startMs: Long) {
        release()
        readySent = false
        songCapture.clear()
        buildRow()
        infoLine.text = options.info
        applyAccent()
        songButton.visibility = if (options.songIdEnabled) View.VISIBLE else View.GONE
        var userAgent = Util.getUserAgent(activity, "JLMediaVisionTV")
        val requestHeaders = HashMap<String, String>()
        for ((name, value) in headers) {
            // DefaultHttpDataSource writes its own User-Agent after the request headers, so a page
            // supplied one has to go through setUserAgent to take effect.
            if (name.equals("User-Agent", ignoreCase = true)) userAgent = value else requestHeaders[name] = value
        }
        val http = DefaultHttpDataSource.Factory()
            .setUserAgent(userAgent)
            .setDefaultRequestProperties(requestHeaders)
            // IPTV panels often redirect between http and https.
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15_000)
            .setReadTimeoutMs(30_000)
        // More buffer than the default: IPTV servers stall, and a longer lead rides most stalls out.
        // Media3 also caps the buffer by size (about 140 MB), which a 4K remux at 80-100 Mb/s
        // fills in 11-14 seconds; with the large heap (AndroidManifest) it holds more.
        val load = DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 50_000, 2_500, 5_000)
            .setTargetBufferBytes(bufferBytesFor(Runtime.getRuntime().maxMemory()))
            .build()
        val p = ExoPlayer.Builder(activity)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setLoadControl(load)
            .setBandwidthMeter(DefaultBandwidthMeter.getSingletonInstance(activity))
            .setRenderersFactory(renderersFactory())
            .setTrackSelector(trackSelector())
            .setHandleAudioBecomingNoisy(true)
            // The skips the desktop player and the remote's left and right use.
            .setSeekBackIncrementMs(SEEK_STEP_MS)
            .setSeekForwardIncrementMs(SEEK_STEP_MS)
            .build()
        p.setVideoChangeFrameRateStrategy(
            if (options.matchFrameRate) C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS
            else C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF,
        )
        p.addListener(listener)
        videoDecoder = null
        audioDecoder = null
        sourceChecked = false
        p.addAnalyticsListener(object : AnalyticsListener {
            override fun onVideoDecoderInitialized(
                eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long,
            ) { videoDecoder = decoderName }

            override fun onAudioDecoderInitialized(
                eventTime: AnalyticsListener.EventTime, decoderName: String, initializedTimestampMs: Long, initializationDurationMs: Long,
            ) { audioDecoder = decoderName }

            // The first load's address after redirects: a stream addon whose debrid service
            // refused the link sends a short "Access denied" video instead of the film. It is
            // refused as an error rather than played (and taken for the film by the page).
            override fun onLoadCompleted(
                eventTime: AnalyticsListener.EventTime, loadEventInfo: LoadEventInfo, mediaLoadData: MediaLoadData,
            ) {
                if (sourceChecked) return
                sourceChecked = true
                val reason = addonPlaceholder(loadEventInfo.uri.path) ?: return
                handler.post {
                    if (player !== p) return@post
                    p.stop()
                    send("error", reason)
                }
            }
        })
        p.volume = volume
        val item = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
            .apply { if (looksLikeHls(Uri.parse(url))) setMimeType(MimeTypes.APPLICATION_M3U8) }
            .build()
        baseItem = item
        sideSubtitles.clear()
        sideSubtitleKeys.clear()
        applySubtitleStyle()
        if (startMs > 0) p.setMediaItem(item, startMs) else p.setMediaItem(item)
        p.prepare()
        p.playWhenReady = true
        view.player = p
        player = p
        handler.removeCallbacks(positionTick)
        handler.postDelayed(positionTick, 1000)
        applyMode()
    }

    // The viewport is the TV's largest mode rather than the UI's current size (often 1080p on a
    // 4K Shield), so adaptive streams pick their 4K variants. No size cap unless the page sets one.
    private fun trackSelector(): DefaultTrackSelector {
        val selector = DefaultTrackSelector(activity)
        this.selector = selector
        val largest = DisplayModes.display(activity)?.let { DisplayModes.largest(it.supportedModes) }
        val viewport = largest?.let { Point(it.physicalWidth, it.physicalHeight) }
            ?: Util.getCurrentDisplayModeSize(activity)
        val params = selector.buildUponParameters()
            .setViewportSize(viewport.x, viewport.y, true)
            .setTunnelingEnabled(options.tunneling)
            .setPreferredAudioLanguage(preferredAudioLanguage)
        if (options.maxHeight > 0) params.setMaxVideoSize(options.maxHeight * 16 / 9, options.maxHeight)
        selector.setParameters(params.build())
        return selector
    }

    // With passthrough on, ExoPlayer's default sink already sends Dolby and DTS to a receiver that
    // reports them. With it off the sink is told the output is plain PCM, so everything is decoded.
    // Audio the TV can neither take nor decode itself (DTS and TrueHD on most TVs, Dolby on some)
    // is decoded by the FFmpeg extension, which runs after the platform's own decoders, so the
    // film always has sound, as the desktop app's mpv does.
    private fun renderersFactory(): DefaultRenderersFactory {
        val factory = CapturingRenderersFactory(activity, options.audioPassthrough, songCapture, sync, !options.tunneling)
        factory.setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)
        // A Dolby Vision or HEVC decoder that fails to start falls back to the next one.
        return factory.setEnableDecoderFallback(true)
    }

    /** Switches the display to suit the video while in FULL; see [DisplayModes.bestFor]. */
    fun matchDisplayMode() {
        if (!options.matchFrameRate || mode != Mode.FULL) return
        val format = player?.videoFormat ?: return
        val display = DisplayModes.display(activity) ?: return
        val current = display.mode
        val target = DisplayModes.bestFor(display.supportedModes, current, format.width, format.height, format.frameRate) ?: return
        if (target.modeId == current.modeId) return
        val attrs = activity.window.attributes
        if (savedDisplayModeId == null) savedDisplayModeId = attrs.preferredDisplayModeId
        attrs.preferredDisplayModeId = target.modeId
        activity.window.attributes = attrs
    }

    /** Puts the display back the way it was before [matchDisplayMode]. */
    fun restoreDisplayMode() {
        val saved = savedDisplayModeId ?: return
        savedDisplayModeId = null
        val attrs = activity.window.attributes
        attrs.preferredDisplayModeId = saved
        activity.window.attributes = attrs
    }

    /** The hero area in CSS pixels, relative to the WebView's viewport; w or h <= 0 clears it. */
    fun setRect(x: Double, y: Double, w: Double, h: Double) {
        heroRect = if (w > 0 && h > 0) doubleArrayOf(x, y, w, h) else null
        if (mode == Mode.HERO) applyMode()
    }

    /** Whether the playing video can go under the page (not HDR or Dolby Vision). */
    fun canShowUnderPage(): Boolean = player != null && !isHdr()

    private fun isHdr(): Boolean {
        val f = player?.videoFormat ?: return false
        if (f.sampleMimeType == MimeTypes.VIDEO_DOLBY_VISION) return true
        if (f.codecs?.startsWith("dvh") == true || f.codecs?.startsWith("dva") == true) return true
        val transfer = f.colorInfo?.colorTransfer
        return transfer == C.COLOR_TRANSFER_ST2084 || transfer == C.COLOR_TRANSFER_HLG
    }

    fun setMode(next: Mode) {
        mode = next
        applyMode()
    }

    /**
     * Plays audio in [lang] (an ISO 639 code) when the stream has it, replacing any earlier choice;
     * null or blank goes back to ExoPlayer's default pick. It also applies to the next [play].
     */
    fun setPreferredAudioLanguage(lang: String?) {
        preferredAudioLanguage = lang?.trim()?.takeIf { it.isNotEmpty() }
        val p = player ?: return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_AUDIO)
            .setPreferredAudioLanguage(preferredAudioLanguage)
            .build()
    }

    /** The page's volume (Live TV and Sports TV volume buttons); kept for the next [play]. */
    private var volume = 1f

    fun setVolume(next: Float) {
        volume = next.coerceIn(0f, 1f)
        player?.volume = volume
    }

    fun pause() { player?.playWhenReady = false }

    fun resume() {
        val p = player ?: return
        if (p.playbackState == Player.STATE_ENDED) p.seekToDefaultPosition()
        if (p.playbackState == Player.STATE_IDLE) p.prepare()
        p.playWhenReady = true
    }

    fun togglePause() {
        val p = player ?: return
        if (p.playWhenReady) pause() else resume()
    }

    fun seek(ms: Long) {
        val p = player ?: return
        val duration = p.duration
        p.seekTo(if (duration != C.TIME_UNSET && duration > 0) ms.coerceIn(0, duration) else ms.coerceAtLeast(0))
    }

    fun seekBy(deltaMs: Long) {
        val p = player ?: return
        seek(p.currentPosition + deltaMs)
    }

    /** Stops playback and tells the page; [message] says why when it wasn't the page's own call. */
    fun stop(message: String? = null) {
        if (player != null) send("stopped", message)
        release()
        preferredAudioLanguage = null
        restoreDisplayMode()
        mode = Mode.HIDDEN
        applyMode()
    }

    /** Releases the decoder without telling the page (the activity is going away). */
    /** One line for a crash report: what was playing and how. */
    fun crashSummary(): String {
        val p = player ?: return "off"
        val v = p.videoFormat
        val video = v?.let {
            listOfNotNull(
                if (it.width > 0) "${it.width}×${it.height}" else null,
                videoCodecName(it),
                hdrName(it),
            ).joinToString(" ")
        }
        val at = p.currentPosition / 1000
        val clock = String.format(Locale.US, "%d:%02d:%02d", at / 3600, at / 60 % 60, at % 60)
        return listOfNotNull(
            mode.name.lowercase(Locale.ROOT),
            if (p.isPlaying) "playing" else "paused",
            video,
            p.audioFormat?.let { audioCodecName(it) },
            clock,
        ).joinToString(" · ")
    }

    /**
     * The TV's display mode for a crash report, and the mode it was in before the player
     * switched it for the video (Match frame rate), when it did.
     */
    fun displaySummary(): String {
        val display = DisplayModes.display(activity) ?: return "unknown"
        val name = { m: Display.Mode ->
            String.format(Locale.US, "%d×%d %.3g Hz", m.physicalWidth, m.physicalHeight, m.refreshRate)
        }
        val now = name(display.mode)
        val before = savedDisplayModeId?.let { id -> display.supportedModes.firstOrNull { it.modeId == id } }
        return when {
            savedDisplayModeId == null -> "$now (not switched)"
            before != null -> "$now (switched from ${name(before)})"
            else -> "$now (switched for the video)"
        }
    }

    fun release() {
        closeMenu()
        skipView.visibility = View.GONE
        skipAction = null
        handler.removeCallbacks(positionTick)
        handler.removeCallbacks(applySideSubtitles)
        view.player = null
        player?.removeListener(listener)
        player?.release()
        player = null
        audioTracksJson = "[]"
    }

    /** Back in full screen: return to the hero area when the page has one, otherwise stop. */
    fun exitFull() {
        send("exit-full")
        if (heroRect != null) setMode(Mode.HERO) else stop()
    }

    /**
     * Remote keys while full screen, as Just Player (moneytoo/Player) handles them on Android TV:
     * with the controls hidden, OK plays or pauses, left and right skip 10 seconds and other keys
     * bring the controls up; with them up, keys go to Media3's controls (false here), which move
     * focus between the buttons and press them.
     */
    fun handleFullKey(event: KeyEvent): Boolean {
        // The menu is a dialog with its own window and takes the remote while it is open.
        if (mode != Mode.FULL || player == null || menu != null) return false
        val down = event.action == KeyEvent.ACTION_DOWN
        when (event.keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> { if (down && event.repeatCount == 0) togglePause(); return true }
            KeyEvent.KEYCODE_MEDIA_PLAY -> { if (down) resume(); return true }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> { if (down) pause(); return true }
            KeyEvent.KEYCODE_MEDIA_REWIND -> { if (down) seekBy(-SEEK_STEP_MS); return true }
            KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { if (down) seekBy(SEEK_STEP_MS); return true }
            // The remote's menu (≡) button: audio and subtitle tracks.
            KeyEvent.KEYCODE_MENU -> { if (down && event.repeatCount == 0) openMenu(); return true }
        }
        if (view.isControllerFullyVisible) return false
        if (down) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER ->
                    // OK presses Skip intro / Next episode while it shows; otherwise play or pause.
                    if (event.repeatCount == 0 && !pressSkipIfShown()) { togglePause(); view.showController() }
                KeyEvent.KEYCODE_DPAD_LEFT -> seekBy(-SEEK_STEP_MS)
                KeyEvent.KEYCODE_DPAD_RIGHT -> seekBy(SEEK_STEP_MS)
                // Live: Down goes straight to the other games, and the game keeps playing.
                KeyEvent.KEYCODE_DPAD_DOWN ->
                    if (event.repeatCount == 0 && options.controls?.contains("today-games") == true) control("today-games")
                    else view.showController()
                else -> view.showController()
            }
        }
        return true
    }

    /** A short message over the video; shown only in FULL, where the page's own notices are hidden. */
    fun showMessage(text: String) {
        if (mode != Mode.FULL || player == null || text.isBlank()) return
        toast?.cancel()
        toast = Toast.makeText(activity, text, Toast.LENGTH_LONG).also { it.show() }
    }

    /** One supported track of a group, as the menu lists it. */
    private class TrackRow(val group: Tracks.Group, val index: Int) {
        val format: Format get() = group.getTrackFormat(index)
        val selected: Boolean get() = group.isTrackSelected(index)
    }

    private class MenuEntry(val label: String, val action: () -> Unit)

    /**
     * The full-screen "Audio & options" list: English dub, each audio track, the embedded subtitle
     * tracks, and a way out to the page's own controls. Back closes it.
     */
    private fun openMenu() {
        val p = player ?: return
        if (menu != null) return
        view.hideController()
        val audio = trackRows(p.currentTracks, C.TRACK_TYPE_AUDIO)
        val text = trackRows(p.currentTracks, C.TRACK_TYPE_TEXT)
        val entries = ArrayList<MenuEntry>()
        entries += MenuEntry(checked(audio.any { it.selected && isEnglish(it.format) }, "English dub")) { englishDub() }
        audio.forEachIndexed { i, row ->
            val name = listOfNotNull(trackName(row.format, "Track ${i + 1}"), channelsName(row.format.channelCount))
                .joinToString(" · ")
            entries += MenuEntry(checked(row.selected, "Audio: $name")) { selectTrack(row) }
        }
        if (text.isNotEmpty()) {
            entries += MenuEntry(checked(text.none { it.selected }, "Subtitles: Off")) { subtitlesOff() }
            text.forEachIndexed { i, row ->
                val forced = (row.format.selectionFlags and C.SELECTION_FLAG_FORCED) != 0
                val name = trackName(row.format, "Track ${i + 1}") + if (forced) " (forced)" else ""
                entries += MenuEntry(checked(row.selected, "Subtitles: $name")) { selectTrack(row) }
            }
        }
        entries += MenuEntry(checked(false, "Speed: " + speedName(p.playbackParameters.speed))) { showMessage(nextSpeed()); openMenuSoon() }
        entries += MenuEntry(checked(false, "Picture: " + aspectName())) { showMessage(nextAspect()); openMenuSoon() }
        entries += MenuEntry(checked(options.skipIntro, "Skip intros automatically")) { toggleSkip("autoSkipIntro") }
        entries += MenuEntry(checked(options.skipRecap, "Skip recaps automatically")) { toggleSkip("autoSkipRecap") }
        entries += MenuEntry(checked(options.skipOutro, "Skip credits automatically")) { toggleSkip("autoSkipOutro") }
        entries += MenuEntry(checked(options.skipButton, "Show the skip button")) { toggleSkip("showSkipButton") }
        entries += MenuEntry(checked(false, "Subtitle timing: ${SyncOffsets.describe(SyncOffsets.toSec(sync.subtitleUs))}")) { openTiming(subtitles = true) }
        entries += MenuEntry(checked(false, "Audio timing: ${SyncOffsets.describe(SyncOffsets.toSec(sync.audioUs))}")) { openTiming(subtitles = false) }
        entries += MenuEntry(checked(false, "Stream info")) { openStreamInfo() }
        entries += MenuEntry(checked(false, "More player options")) { exitFull() }
        val labels = Array<CharSequence>(entries.size) { entries[it].label }
        val dialog = AlertDialog.Builder(activity)
            .setTitle("Player menu")
            .setItems(labels) { _, which -> entries[which].action() }
            .create()
        styleAsSidePanel(dialog)
        dialog.setOnDismissListener {
            if (menu === dialog) menu = null
            if (mode == Mode.FULL && player != null) view.showController()
        }
        menu = dialog
        dialog.show()
    }

    /** Subtitle or audio timing (the page's sets go through [setSubtitleDelay] and [setAudioDelay]). */
    fun setSubtitleDelay(sec: Double) {
        sync.subtitleUs = SyncOffsets.toUs(sec)
    }

    fun setAudioDelay(sec: Double) {
        sync.audioUs = SyncOffsets.toUs(sec)
    }

    /**
     * Earlier and later in tenths of a second, as the desktop's timing rows; the dialog stays
     * open while the viewer adjusts, and the page saves the subtitle timing for this title.
     */
    private fun openTiming(subtitles: Boolean) {
        if (player == null) return
        if (!subtitles && options.tunneling) {
            showMessage("Audio timing needs Tunneled playback off in Video tuning.")
            return
        }
        val current = { SyncOffsets.toSec(if (subtitles) sync.subtitleUs else sync.audioUs) }
        val value = TextView(activity).apply {
            textSize = 28f
            gravity = Gravity.CENTER
            val pad = (24 * activity.resources.displayMetrics.density).toInt()
            setPadding(pad, pad, pad, pad)
        }
        val what = if (subtitles) "Subtitles" else "Sound"
        val show = { value.text = "$what: ${SyncOffsets.describe(current())}" }
        show()
        val dialog = AlertDialog.Builder(activity)
            .setTitle(if (subtitles) "Subtitle timing" else "Audio timing")
            .setView(value)
            .setNegativeButton("Earlier", null)
            .setNeutralButton("Reset", null)
            .setPositiveButton("Later", null)
            .create()
        val set = { sec: Double ->
            if (subtitles) setSubtitleDelay(sec) else setAudioDelay(sec)
            show()
            emit(
                JSONObject().put("type", "sync")
                    .put("subDelaySec", SyncOffsets.toSec(sync.subtitleUs))
                    .put("audioDelaySec", SyncOffsets.toSec(sync.audioUs)),
            )
        }
        dialog.setOnShowListener {
            // Set here rather than on the builder, so a press adjusts without closing the dialog.
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE)?.setOnClickListener { set(current() - SyncOffsets.STEP_SEC) }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.setOnClickListener { set(current() + SyncOffsets.STEP_SEC) }
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL)?.setOnClickListener { set(0.0) }
            dialog.getButton(AlertDialog.BUTTON_POSITIVE)?.requestFocus()
        }
        showDialog(dialog)
    }

    /** What is playing and how: resolution, HDR, codecs, sound, decoders and the TV's mode. */
    private fun openStreamInfo() {
        val p = player ?: return
        val lines = ArrayList<String>()
        p.videoFormat?.let { v ->
            val size = if (v.width > 0 && v.height > 0) "${v.width}×${v.height}" else null
            val fps = v.frameRate.takeIf { it > 0 }?.let { String.format(Locale.US, "%.3g fps", it) }
            lines += "Video: " + listOfNotNull(size, fps, videoCodecName(v), hdrName(v)).joinToString(" · ")
            bitrateName(v.bitrate)?.let { lines += "Video bitrate: $it" }
        }
        videoDecoder?.let { lines += "Video decoder: $it" }
        p.audioFormat?.let { a ->
            lines += "Sound: " + listOfNotNull(
                audioCodecName(a),
                channelsName(a.channelCount),
                a.sampleRate.takeIf { it > 0 }?.let { "${it / 1000.0} kHz" },
                a.language?.takeIf { it != C.LANGUAGE_UNDETERMINED },
            ).joinToString(" · ")
        }
        audioDecoder?.let { lines += "Sound decoder: $it" }
        lines += String.format(Locale.US, "Buffered ahead: %d s", (p.totalBufferedDuration / 1000).coerceAtLeast(0))
        DefaultBandwidthMeter.getSingletonInstance(activity).bitrateEstimate.takeIf { it > 0 }?.let {
            lines += String.format(Locale.US, "Network: %.0f Mb/s (estimate)", it / 1_000_000.0)
        }
        lines += "Audio passthrough: " + if (options.audioPassthrough) "On" else "Off"
        lines += "Tunneled playback: " + if (options.tunneling) "On" else "Off"
        DisplayModes.display(activity)?.mode?.let { m ->
            lines += String.format(Locale.US, "TV mode: %d×%d at %.3g Hz", m.physicalWidth, m.physicalHeight, m.refreshRate)
        }
        val dialog = AlertDialog.Builder(activity)
            .setTitle("Stream info")
            .setMessage(lines.joinToString("\n"))
            .setPositiveButton("Close", null)
            .create()
        showDialog(dialog)
    }

    /** Shows a dialog over full screen; the controls come back when it closes. */
    private fun showDialog(dialog: AlertDialog) {
        closeMenu()
        dialog.setOnDismissListener {
            if (menu === dialog) menu = null
            if (mode == Mode.FULL && player != null) view.showController()
        }
        menu = dialog
        dialog.show()
    }

private fun speedName(speed: Float): String =
        if (kotlin.math.abs(speed - 1f) < 0.01f) "Normal" else "${speed}×"

    private fun aspectName(): String = when (aspect) {
        AspectRatioFrameLayout.RESIZE_MODE_ZOOM -> "Zoom"
        AspectRatioFrameLayout.RESIZE_MODE_FILL -> "Stretch"
        else -> "Fit"
    }

    /** A skip setting from the menu: kept here and saved by the page (Settings › Intros). */
    private fun toggleSkip(key: String) {
        val o = options
        options = when (key) {
            "autoSkipIntro" -> o.copy(skipIntro = !o.skipIntro)
            "autoSkipRecap" -> o.copy(skipRecap = !o.skipRecap)
            "autoSkipOutro" -> o.copy(skipOutro = !o.skipOutro)
            else -> o.copy(skipButton = !o.skipButton)
        }
        val value = when (key) {
            "autoSkipIntro" -> options.skipIntro
            "autoSkipRecap" -> options.skipRecap
            "autoSkipOutro" -> options.skipOutro
            else -> options.skipButton
        }
        if (key == "showSkipButton" && !value) setSkipButton("")
        emit(JSONObject().put("type", "setting").put("key", key).put("value", value))
        openMenuSoon()
    }

    /** Opens the menu again once the one just picked from has closed, so a change is seen at once. */
    private fun openMenuSoon() {
        handler.postDelayed({ if (mode == Mode.FULL && player != null) openMenu() }, 150)
    }

/**
     * The menu as a glass panel down the right side of the picture, which stays in view (the
     * dialog's own window, so the remote moves through it and Back closes it).
     */
    private fun styleAsSidePanel(dialog: AlertDialog) {
        val window = dialog.window ?: return
        val density = activity.resources.displayMetrics.density
        window.setGravity(Gravity.END or Gravity.CENTER_VERTICAL)
        window.setDimAmount(0f)
        window.setBackgroundDrawable(GradientDrawable().apply {
            cornerRadius = 28 * density
            setColor(Color.argb(232, 11, 15, 28))
            setStroke((1 * density).toInt(), Color.argb(60, 255, 255, 255))
        })
        dialog.setOnShowListener {
            window.setLayout((520 * density).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT)
        }
    }

    private fun closeMenu() {
        val open = menu ?: return
        menu = null
        open.dismiss()
    }

    /**
     * Switches to the file's English track when it has one. Otherwise the page looks for an
     * English dub source (`english-dub` event) and plays it in place, so FULL is kept.
     */
    private fun englishDub() {
        val p = player ?: return
        if (p.currentTracks.isEmpty) return
        val audio = trackRows(p.currentTracks, C.TRACK_TYPE_AUDIO)
        if (audio.any { it.selected && isEnglish(it.format) }) return
        val english = audio.filter { isEnglish(it.format) }.maxByOrNull { englishRank(it.format) }
        if (english != null) {
            selectTrack(english)
            preferredAudioLanguage = "en"
            return
        }
        showMessage("No English audio in this file. Finding an English dub…")
        send("english-dub")
    }

    /** Plays exactly this track; an audio pick also becomes the language for the next [play]. */
    private fun selectTrack(row: TrackRow) {
        val p = player ?: return
        val type = row.group.type
        if (type == C.TRACK_TYPE_AUDIO) {
            row.format.language?.takeIf { it.isNotBlank() && it != C.LANGUAGE_UNDETERMINED }?.let { preferredAudioLanguage = it }
        }
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(type, false)
            .setOverrideForType(TrackSelectionOverride(row.group.mediaTrackGroup, row.index))
            .build()
    }

    private fun subtitlesOff() {
        val p = player ?: return
        p.trackSelectionParameters = p.trackSelectionParameters.buildUpon()
            .clearOverridesOfType(C.TRACK_TYPE_TEXT)
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
            .build()
    }

    private fun trackRows(tracks: Tracks, type: Int): List<TrackRow> {
        val rows = ArrayList<TrackRow>()
        for (group in tracks.groups) {
            if (group.type != type) continue
            for (i in 0 until group.length) if (group.isTrackSupported(i)) rows += TrackRow(group, i)
        }
        return rows
    }

    /** Out of full screen: the controls go, and the page takes the remote again. */
    private fun leaveFull() {
        if (!fullShown) return
        fullShown = false
        view.hideController()
        view.useController = false
        web.isFocusable = true
        (web as? ViewGroup)?.descendantFocusability = ViewGroup.FOCUS_BEFORE_DESCENDANTS
        web.requestFocus()
    }

    private fun applyMode() {
        val rect = heroRect
        val visible = player != null && when (mode) {
            Mode.FULL -> true
            Mode.HERO -> rect != null
            Mode.UNDER -> !isHdr()
            Mode.HIDDEN -> false
        }
        if (mode != Mode.FULL || !visible) closeMenu()
        if (mode == Mode.FULL) matchDisplayMode() else restoreDisplayMode()
        if (mode != Mode.FULL || !visible) leaveFull()
        if (!visible) {
            view.hideController()
            view.useController = false
            view.isFocusable = false
            view.visibility = View.GONE
            if (view.hasFocus()) web.requestFocus()
            return
        }
        if (mode == Mode.FULL) {
            // The page sends "full" on every layout pass: set full screen up once, or the
            // controls would be hidden and focus moved again each time.
            if (fullShown) return
            fullShown = true
            // Full screen: the video above the page, as the Shield needs for HDR and Dolby
            // Vision, with Media3's controls (and this app's buttons) over it.
            setUnderPage(false)
            view.resizeMode = aspect
            view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            // The page underneath must not take the remote while the controls have it.
            web.isFocusable = false
            (web as? ViewGroup)?.descendantFocusability = ViewGroup.FOCUS_BLOCK_DESCENDANTS
            view.useController = true
            view.controllerShowTimeoutMs = 5000
            view.isFocusable = true
            view.visibility = View.VISIBLE
            view.requestFocus()
            view.showController()
        } else if (mode == Mode.UNDER) {
            // The page's overlay takes the remote; the picture carries on full size beneath it.
            setUnderPage(true)
            view.hideController()
            view.useController = false
            view.isFocusable = false
            view.resizeMode = aspect
            view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            view.visibility = View.VISIBLE
            if (!web.hasFocus()) web.requestFocus()
        } else if (rect != null) {
            setUnderPage(false)
            // The small TV fills its box (edges trimmed) instead of letterboxing inside it.
            view.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
            view.hideController()
            view.useController = false
            view.isFocusable = false
            view.layoutParams = FrameLayout.LayoutParams(px(rect[2]), px(rect[3]), Gravity.TOP or Gravity.START).apply {
                leftMargin = web.left + px(rect[0])
                topMargin = web.top + px(rect[1])
            }
            view.visibility = View.VISIBLE
            if (!web.hasFocus()) web.requestFocus()
        }
    }

    private fun px(css: Double) = Math.round(css * cssScale).toInt()

    /**
     * Full screen draws the video under the page (the page's player controls go on top); the
     * small TV draws it over the page, whose backgrounds would otherwise hide it. Only the drawing
     * order changes: the video view stays attached, so its surface (and 4K/HDR output) carries on.
     */
    private fun setUnderPage(under: Boolean) {
        val webAt = root.indexOfChild(web)
        val at = root.indexOfChild(view)
        if (webAt < 0 || at < 0) return
        if (under && at > webAt) {
            web.bringToFront()
            web.setBackgroundColor(Color.TRANSPARENT)
        } else if (!under && at < webAt) {
            view.bringToFront()
            web.setBackgroundColor(Color.WHITE)
        }
    }

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            when (state) {
                Player.STATE_BUFFERING -> send("buffering")
                Player.STATE_READY -> if (!readySent) { readySent = true; send("ready") }
                Player.STATE_ENDED -> send("ended")
            }
        }

        // The video's size and frame rate are known by its first decoded frame.
        override fun onVideoSizeChanged(videoSize: VideoSize) {
            if (videoSize.width > 0 && videoSize.height > 0) matchDisplayMode()
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            val p = player ?: return
            if (isPlaying) send("playing")
            else if (!p.playWhenReady && p.playbackState != Player.STATE_ENDED) send("paused")
        }

        override fun onTracksChanged(tracks: Tracks) {
            val audio = audioTracks(tracks)
            audioTracksJson = audio.toString()
            send("tracks", audioTracks = audio)
        }

        override fun onPlayerError(error: PlaybackException) {
            val p = player ?: return
            // A live stream that fell out of the playlist window: rejoin at the live edge.
            if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
                p.seekToDefaultPosition()
                p.prepare()
                return
            }
            send("error", listOfNotNull(error.errorCodeName, error.message).joinToString(": "))
        }
    }

    /** The playable audio tracks; `id` is "<group>:<track>" and stays put for this stream. */
    private fun audioTracks(tracks: Tracks): JSONArray {
        val out = JSONArray()
        tracks.groups.forEachIndexed { groupIndex, group ->
            if (group.type != C.TRACK_TYPE_AUDIO) return@forEachIndexed
            for (i in 0 until group.length) {
                if (!group.isTrackSupported(i)) continue
                val format = group.getTrackFormat(i)
                val track = JSONObject()
                    .put("id", "$groupIndex:$i")
                    .put("selected", group.isTrackSelected(i))
                format.language?.let { track.put("language", it) }
                format.label?.let { track.put("label", it) }
                if (format.channelCount != Format.NO_VALUE) track.put("channels", format.channelCount)
                (format.sampleMimeType ?: format.codecs)?.let { track.put("codec", it) }
                out.put(track)
            }
        }
        return out
    }

    private fun send(type: String, message: String? = null, audioTracks: JSONArray? = null) {
        val p = player
        val duration = p?.duration?.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        val detail = JSONObject()
            .put("type", type)
            .put("mode", mode.name.lowercase())
            .put("positionMs", p?.currentPosition ?: 0L)
            .put("durationMs", duration)
        if (message != null) detail.put("message", message)
        if (audioTracks != null) detail.put("audioTracks", audioTracks)
        emit(detail)
    }

    /** Without passthrough: a sink built without a context assumes PCM-only output. */
    @OptIn(UnstableApi::class)
    /**
     * The audio sink keeps a copy of decoded sound for Identify song ([SongCapture]); without
     * passthrough it is built without a context, which makes it PCM-only.
     */
    private class CapturingRenderersFactory(
        context: Context,
        private val passthrough: Boolean,
        private val capture: SongCapture,
        private val sync: SyncOffsets,
        private val audioTiming: Boolean,
    ) : DefaultRenderersFactory(context) {
        @Suppress("DEPRECATION")
        override fun buildAudioSink(
            context: Context,
            enableFloatOutput: Boolean,
            enableAudioTrackPlaybackParams: Boolean,
        ): AudioSink = (if (passthrough) DefaultAudioSink.Builder(context) else DefaultAudioSink.Builder())
            .setEnableFloatOutput(enableFloatOutput)
            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
            .setAudioProcessors(arrayOf<AudioProcessor>(TeeAudioProcessor(capture)))
            .build()
            .let { DelayedAudioSink(it, sync, audioTiming) }

        override fun buildTextRenderers(
            context: Context,
            output: TextOutput,
            outputLooper: Looper,
            extensionRendererMode: Int,
            out: ArrayList<Renderer>,
        ) {
            val from = out.size
            super.buildTextRenderers(context, output, outputLooper, extensionRendererMode, out)
            for (i in from until out.size) out[i] = DelayedTextRenderer(out[i], sync)
        }
    }

    companion object {
        private const val SEEK_STEP_MS = 10_000L

        /** The bar before the page sends a layout (older app pages). */
        val DEFAULT_ROW = listOf("pick-another", "english-dub", "aspect-menu", "song-id", "stop")

        // As src/lib/player/english-dub.ts: commentary and audio description tracks are English
        // too, but never the dub the viewer wants.
        private val ENGLISH_CODES = setOf("en", "eng", "english")
        private val ENGLISH_WORD = Regex("\\benglish\\b", RegexOption.IGNORE_CASE)
        private val SECONDARY_AUDIO = Regex("comment|descri|narrat", RegexOption.IGNORE_CASE)
        private val AUDIO_DESCRIPTION = Regex("\\bAD\\b")

        fun isEnglish(format: Format): Boolean {
            val base = format.language?.trim()?.lowercase(Locale.ROOT)?.split('-', '_')?.firstOrNull()
            if (base != null && base in ENGLISH_CODES) return true
            return ENGLISH_WORD.containsMatchIn(format.label.orEmpty())
        }

        /** The main mix before commentary, then the default track, then the most channels. */
        private fun englishRank(format: Format): Int {
            val label = format.label.orEmpty()
            val secondary = SECONDARY_AUDIO.containsMatchIn(label) || AUDIO_DESCRIPTION.containsMatchIn(label)
            return (if (secondary) 0 else 1000) +
                (if ((format.selectionFlags and C.SELECTION_FLAG_DEFAULT) != 0) 100 else 0) +
                format.channelCount.coerceAtLeast(0)
        }

        private fun checked(on: Boolean, label: String) = (if (on) "✓  " else "     ") + label

        /** The track's label and language, e.g. "Director's commentary (English)". */
        private fun trackName(format: Format, fallback: String): String {
            val language = format.language?.takeIf { it.isNotBlank() && it != C.LANGUAGE_UNDETERMINED }
                ?.let { tag -> Locale.forLanguageTag(tag).displayLanguage.ifBlank { tag } }
            val label = format.label?.takeIf { it.isNotBlank() }
            return when {
                label == null -> language ?: fallback
                language == null || label.contains(language, ignoreCase = true) -> label
                else -> "$label ($language)"
            }
        }

        private fun videoCodecName(f: Format): String? = when (f.sampleMimeType) {
            MimeTypes.VIDEO_H265 -> "HEVC"
            MimeTypes.VIDEO_H264 -> "H.264"
            MimeTypes.VIDEO_AV1 -> "AV1"
            MimeTypes.VIDEO_VP9 -> "VP9"
            MimeTypes.VIDEO_DOLBY_VISION -> "Dolby Vision"
            MimeTypes.VIDEO_MPEG2 -> "MPEG-2"
            else -> f.sampleMimeType?.substringAfter('/')
        }

        private fun hdrName(f: Format): String? = when {
            f.sampleMimeType == MimeTypes.VIDEO_DOLBY_VISION -> null
            f.codecs?.startsWith("dvh") == true || f.codecs?.startsWith("dva") == true -> "Dolby Vision"
            f.colorInfo?.colorTransfer == C.COLOR_TRANSFER_ST2084 -> "HDR10"
            f.colorInfo?.colorTransfer == C.COLOR_TRANSFER_HLG -> "HLG"
            else -> "SDR"
        }

        private fun audioCodecName(f: Format): String? = when (f.sampleMimeType) {
            MimeTypes.AUDIO_AC3 -> "Dolby Digital"
            MimeTypes.AUDIO_E_AC3 -> "Dolby Digital Plus"
            MimeTypes.AUDIO_E_AC3_JOC -> "Dolby Atmos (DD+)"
            MimeTypes.AUDIO_TRUEHD -> "Dolby TrueHD"
            MimeTypes.AUDIO_DTS -> "DTS"
            MimeTypes.AUDIO_DTS_HD -> "DTS-HD"
            MimeTypes.AUDIO_DTS_EXPRESS -> "DTS Express"
            MimeTypes.AUDIO_AAC -> "AAC"
            MimeTypes.AUDIO_OPUS -> "Opus"
            MimeTypes.AUDIO_FLAC -> "FLAC"
            MimeTypes.AUDIO_MPEG -> "MP3"
            else -> f.sampleMimeType?.substringAfter('/')
        }

        private const val MAX_BUFFER_BYTES = 256 * 1024 * 1024
        private const val SUBTITLE_BATCH_MS = 1_500L

        // Addons (Torrentio, Comet, MediaFusion and others) answer a refused or failed debrid
        // link with a short video from their own server, under a folder like /videos/ or
        // /static/, named for the problem (access_denied.mp4, failed_access_v2.mp4, ...).
        private val PLACEHOLDER_DIR = Regex("/(videos?|static|assets|exceptions|media/errors?)/", RegexOption.IGNORE_CASE)
        private val PLACEHOLDER_NAME = Regex(
            "access[_-]?denied|denied|failed|unavailable|limits?[_-]?exceeded|downloading|not[_-]?cached|uncached|" +
                "expired|invalid|error|exception|blocked|no[_-]?subscription|infringement|too[_-]?big",
            RegexOption.IGNORE_CASE,
        )
        private val VIDEO_FILE = Regex("\\.(mp4|mkv|webm|m4v)$", RegexOption.IGNORE_CASE)

        /** The message for an addon's placeholder video at the address [path], or null for a real stream. */
        fun addonPlaceholder(path: String?): String? {
            if (path == null) return null
            val name = path.substringAfterLast('/')
            if (!VIDEO_FILE.containsMatchIn(name) || !PLACEHOLDER_DIR.containsMatchIn(path)) return null
            if (!PLACEHOLDER_NAME.containsMatchIn(name)) return null
            val denied = Regex("access|denied|subscription|expired|invalid", RegexOption.IGNORE_CASE).containsMatchIn(name)
            return if (denied) {
                "Your debrid service refused this stream (access denied). Check your debrid account and key in Settings, then pick a stream again."
            } else {
                "The stream addon couldn't get this stream (${name.substringBeforeLast('.')}). Pick another stream."
            }
        }

        /**
         * The playback buffer's size for an app heap of [maxMemory] bytes: half the heap, at most
         * 256 MB, and never below Media3's own (C.LENGTH_UNSET keeps that).
         */
        fun bufferBytesFor(maxMemory: Long): Int {
            val half = maxMemory / 2
            return if (half <= DefaultLoadControl.DEFAULT_MUXED_BUFFER_SIZE) C.LENGTH_UNSET
            else minOf(half, MAX_BUFFER_BYTES.toLong()).toInt()
        }

        private fun bitrateName(bps: Int): String? =
            if (bps <= 0) null else String.format(Locale.US, "%.1f Mb/s", bps / 1_000_000.0)

        private fun channelsName(count: Int): String? = when {
            count <= 0 -> null
            count == 1 -> "Mono"
            count == 2 -> "Stereo"
            count == 6 -> "5.1"
            count == 8 -> "7.1"
            else -> "$count ch"
        }

        private val PASSTHROUGH_ENCODINGS = listOf(
            C.ENCODING_AC3 to "ac3",
            C.ENCODING_E_AC3 to "eac3",
            C.ENCODING_E_AC3_JOC to "eac3-joc",
            C.ENCODING_AC4 to "ac4",
            C.ENCODING_DTS to "dts",
            C.ENCODING_DTS_HD to "dts-hd",
            C.ENCODING_DOLBY_TRUEHD to "truehd",
        )

        /** What this TV can show and pass through, for the page's settings (README: `capabilities()`). */
        fun capabilities(activity: Activity): JSONObject {
            val display = DisplayModes.display(activity)
            val modes = display?.supportedModes ?: emptyArray<Display.Mode>()
            val largest = DisplayModes.largest(modes)
            val rates = JSONArray()
            modes.map { Math.round(it.refreshRate * 1000) / 1000.0 }.distinct().sorted().forEach { rates.put(it) }
            val hdr = JSONArray()
            // getHdrCapabilities is API 24 (minSdk); its type list moved to Display.Mode in API 34.
            @Suppress("DEPRECATION")
            val hdrTypes = display?.hdrCapabilities?.supportedHdrTypes ?: IntArray(0)
            for (type in hdrTypes) {
                when (type) {
                    Display.HdrCapabilities.HDR_TYPE_HDR10 -> hdr.put("hdr10")
                    Display.HdrCapabilities.HDR_TYPE_HDR10_PLUS -> hdr.put("hdr10-plus")
                    Display.HdrCapabilities.HDR_TYPE_HLG -> hdr.put("hlg")
                    Display.HdrCapabilities.HDR_TYPE_DOLBY_VISION -> hdr.put("dolby-vision")
                }
            }
            val audio = AudioCapabilities.getCapabilities(activity, AudioAttributes.DEFAULT, null)
            val passthrough = JSONArray()
            for ((encoding, name) in PASSTHROUGH_ENCODINGS) if (audio.supportsEncoding(encoding)) passthrough.put(name)
            return JSONObject()
                .put("maxWidth", largest?.physicalWidth ?: 0)
                .put("maxHeight", largest?.physicalHeight ?: 0)
                .put("refreshRates", rates)
                .put("hdr", hdr)
                .put("passthrough", passthrough)
                // MainActivity hands Back to the page's Big Picture before walking history.
                .put("pageBack", true)
        }

        fun looksLikeHls(uri: Uri): Boolean {
            if (uri.path.orEmpty().lowercase().endsWith(".m3u8")) return true
            val output = if (uri.isHierarchical) uri.getQueryParameter("output")?.lowercase() else null
            return output == "hls" || output == "m3u8"
        }
    }
}
