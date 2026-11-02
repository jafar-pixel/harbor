package com.jlstream.mediavision

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
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
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.audio.AudioCapabilities
import androidx.media3.exoplayer.audio.AudioSink
import androidx.media3.exoplayer.audio.DefaultAudioSink
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.trackselection.DefaultTrackSelector
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * ExoPlayer drawn over the WebView, driven by the web app through [MainActivity]'s
 * `window.JLNativePlayer` bridge. Every method runs on the main thread.
 *  - FULL: fills the screen; the remote controls playback, and Down opens the "Audio & options" menu.
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
    enum class Mode { FULL, HERO, HIDDEN }

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
    ) {
        companion object {
            fun parse(json: String?): Options? {
                val o = try { JSONObject(json ?: return null) } catch (_: Exception) { return null }
                val d = Options()
                return Options(
                    matchFrameRate = o.optBoolean("matchFrameRate", d.matchFrameRate),
                    maxHeight = when (o.optString("maxResolution")) { "1080p" -> 1080; "720p" -> 720; else -> 0 },
                    audioPassthrough = o.optBoolean("audioPassthrough", d.audioPassthrough),
                    tunneling = o.optBoolean("tunneling", d.tunneling),
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

    // Full screen's own control bar: what's playing, live or the time, play/pause, volume and the
    // remote's buttons. Shown when full screen opens and on any remote key, then fades.
    private var title = ""
    private fun text(size: Float, color: Int, bold: Boolean = false) = TextView(activity).apply {
        textSize = size
        setTextColor(color)
        if (bold) typeface = Typeface.DEFAULT_BOLD
        maxLines = 1
    }
    private val barTitle = text(24f, Color.WHITE, bold = true)
    private val barStatus = text(16f, 0xEEFFFFFF.toInt())
    private val barHints = text(14f, 0xBBFFFFFF.toInt()).apply {
        text = "OK  Play / pause      \u25BC  Audio & subtitles      Back  Small TV"
    }
    private val bar = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL
        visibility = View.GONE
        background = GradientDrawable(
            GradientDrawable.Orientation.BOTTOM_TOP,
            intArrayOf(0xE6000000.toInt(), 0x99000000.toInt(), 0x00000000),
        )
        val pad = (40 * activity.resources.displayMetrics.density).toInt()
        setPadding(pad, pad * 2, pad, pad)
        addView(barTitle)
        addView(barStatus)
        addView(barHints)
    }
    private val hideBar = Runnable { bar.visibility = View.GONE }

    init {
        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(bar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    }

    /** Brings the full-screen control bar up for a few seconds, with the current state. */
    private fun showBar() {
        val p = player
        if (mode != Mode.FULL || p == null) {
            handler.removeCallbacks(hideBar)
            bar.visibility = View.GONE
            return
        }
        barTitle.text = title
        val where = if (p.isCurrentMediaItemLive || p.duration == C.TIME_UNSET) "\u25CF LIVE"
            else "${clock(p.currentPosition)} / ${clock(p.duration)}"
        val state = if (p.playWhenReady) "Playing" else "Paused"
        val sound = if (volume <= 0f) "Muted" else "Volume ${Math.round(volume * 100)}%"
        barStatus.text = "$where     $state     $sound"
        bar.visibility = View.VISIBLE
        bar.bringToFront()
        handler.removeCallbacks(hideBar)
        handler.postDelayed(hideBar, 5000)
    }

    private fun clock(ms: Long): String {
        val s = (ms / 1000).coerceAtLeast(0)
        val h = s / 3600
        val m = (s % 3600) / 60
        val sec = s % 60
        return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, sec)
            else String.format(Locale.US, "%d:%02d", m, sec)
    }

    fun play(url: String, headers: Map<String, String>, title: String, startMs: Long) {
        release()
        this.title = title
        readySent = false
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
        val load = DefaultLoadControl.Builder()
            .setBufferDurationsMs(20_000, 50_000, 2_500, 5_000)
            .build()
        val p = ExoPlayer.Builder(activity)
            .setMediaSourceFactory(DefaultMediaSourceFactory(http))
            .setLoadControl(load)
            .setRenderersFactory(renderersFactory())
            .setTrackSelector(trackSelector())
            .setHandleAudioBecomingNoisy(true)
            .build()
        p.setVideoChangeFrameRateStrategy(
            if (options.matchFrameRate) C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_ONLY_IF_SEAMLESS
            else C.VIDEO_CHANGE_FRAME_RATE_STRATEGY_OFF,
        )
        p.addListener(listener)
        p.volume = volume
        val item = MediaItem.Builder()
            .setUri(url)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
            .apply { if (looksLikeHls(Uri.parse(url))) setMimeType(MimeTypes.APPLICATION_M3U8) }
            .build()
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
    private fun renderersFactory(): DefaultRenderersFactory {
        val factory = if (options.audioPassthrough) DefaultRenderersFactory(activity) else PcmOnlyRenderersFactory(activity)
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
        view.showController()
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
    fun release() {
        closeMenu()
        handler.removeCallbacks(positionTick)
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

    /** Remote keys while full screen. Returns true when the key was used here. */
    fun handleFullKey(event: KeyEvent): Boolean {
        // The menu is a dialog with its own window and takes the remote while it is open.
        if (mode != Mode.FULL || player == null || menu != null) return false
        val down = event.action == KeyEvent.ACTION_DOWN
        // Any remote key brings the controls up; volume keys still go on to the system.
        if (down) {
            view.showController()
            handler.post { showBar() }
        }
        when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> if (down && event.repeatCount == 0) { togglePause(); view.showController() }
            KeyEvent.KEYCODE_MEDIA_PLAY -> if (down) resume()
            KeyEvent.KEYCODE_MEDIA_PAUSE -> if (down) pause()
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> if (down) seekBy(-SEEK_STEP_MS)
            KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> if (down) seekBy(SEEK_STEP_MS)
            // Up only brings up the progress bar; focus never moves into the controller, so
            // Center/Left/Right always mean play/pause and seek.
            KeyEvent.KEYCODE_DPAD_UP -> if (down) view.showController()
            KeyEvent.KEYCODE_DPAD_DOWN, KeyEvent.KEYCODE_MENU -> if (down && event.repeatCount == 0) openMenu()
            else -> return false
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
        entries += MenuEntry(checked(false, "More player options")) { exitFull() }
        val labels = Array<CharSequence>(entries.size) { entries[it].label }
        val dialog = AlertDialog.Builder(activity)
            .setTitle("Audio & options")
            .setItems(labels) { _, which -> entries[which].action() }
            .create()
        dialog.setOnDismissListener {
            if (menu === dialog) menu = null
            if (mode == Mode.FULL && player != null) view.requestFocus()
        }
        menu = dialog
        dialog.show()
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

    private fun applyMode() {
        val rect = heroRect
        val visible = player != null && when (mode) {
            Mode.FULL -> true
            Mode.HERO -> rect != null
            Mode.HIDDEN -> false
        }
        if (mode != Mode.FULL || !visible) {
            closeMenu()
            handler.removeCallbacks(hideBar)
            bar.visibility = View.GONE
        }
        if (mode == Mode.FULL) matchDisplayMode() else restoreDisplayMode()
        if (!visible) {
            view.hideController()
            view.useController = false
            view.isFocusable = false
            view.visibility = View.GONE
            if (view.hasFocus()) web.requestFocus()
            return
        }
        if (mode == Mode.FULL) {
            view.resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
            view.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            view.useController = true
            view.isFocusable = true
            view.visibility = View.VISIBLE
            view.requestFocus()
            view.showController()
            showBar()
        } else if (rect != null) {
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
            if (mode == Mode.FULL) showBar()
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
    private class PcmOnlyRenderersFactory(context: Context) : DefaultRenderersFactory(context) {
        @Suppress("DEPRECATION")
        override fun buildAudioSink(
            context: Context,
            enableFloatOutput: Boolean,
            enableAudioTrackPlaybackParams: Boolean,
        ): AudioSink = DefaultAudioSink.Builder()
            .setEnableFloatOutput(enableFloatOutput)
            .setEnableAudioTrackPlaybackParams(enableAudioTrackPlaybackParams)
            .build()
    }

    companion object {
        private const val SEEK_STEP_MS = 10_000L

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
