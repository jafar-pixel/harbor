package com.jlstream.mediavision

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import java.util.Locale

/**
 * The full-screen player bar, drawn by the TV app above the video. It follows the app's Classic
 * player layout (Settings › Player layout): play/pause, stop, volume and time on the left, skip
 * back and forward in the middle, speed, English dub, subtitles and audio on the right, with the
 * title on top and the progress line above the buttons.
 *
 * It is drawn natively rather than by the page: with the page over the video, the Shield showed
 * HDR and Dolby Vision without their colour processing. The remote moves between the buttons
 * with the arrows and presses one with OK.
 */
@SuppressLint("ViewConstructor")
class TvControlBar(context: Context, private val actions: Actions) : FrameLayout(context) {
    interface Actions {
        fun togglePause()
        fun stop()
        fun toggleMute()
        fun seekBy(deltaMs: Long)
        /** Moves to the next speed and returns it. */
        fun nextSpeed(): Float
        fun englishDub()
        fun openMenu()
        fun leave()
        /** Moves to the next picture fit and returns its name. */
        fun nextAspect(): String
        fun identifySong()
    }

    private fun dp(v: Float) =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics).toInt()

    private val title = TextView(context).apply {
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 20f)
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        setShadowLayer(6f, 0f, 1f, Color.BLACK)
    }
    private val time = TextView(context).apply {
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
        setShadowLayer(4f, 0f, 1f, Color.BLACK)
    }
    private val progress = ProgressBar(context, null, android.R.attr.progressBarStyleHorizontal).apply {
        max = 1000
        progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor("#F97316"))
        secondaryProgressTintList = android.content.res.ColorStateList.valueOf(Color.argb(140, 255, 255, 255))
        progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.argb(70, 255, 255, 255))
        isFocusable = false
    }

    private fun button(icon: Int, label: String, onPress: () -> Unit) = ImageButton(context).apply {
        setImageResource(icon)
        contentDescription = label
        scaleType = android.widget.ImageView.ScaleType.FIT_CENTER
        val pad = dp(12f)
        setPadding(pad, pad, pad, pad)
        background = focusBackground()
        isFocusable = true
        isFocusableInTouchMode = true
        setOnClickListener { onPress() }
        layoutParams = LinearLayout.LayoutParams(dp(52f), dp(52f)).apply { marginEnd = dp(6f) }
    }

    private fun focusBackground(): StateListDrawable {
        val focused = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.argb(70, 255, 255, 255))
            setStroke(dp(2f), Color.parseColor("#3B82F6"))
        }
        return StateListDrawable().apply {
            addState(intArrayOf(android.R.attr.state_focused), focused)
            addState(intArrayOf(), ColorDrawable(Color.TRANSPARENT))
        }
    }

    private val playPause = button(R.drawable.tv_ic_pause, "Pause") { actions.togglePause() }
    private val stop = button(R.drawable.tv_ic_stop, "Stop") { actions.stop() }
    private val volume = button(R.drawable.tv_ic_volume, "Mute") { actions.toggleMute() }
    private val back10 = button(R.drawable.tv_ic_back10, "Back 10 seconds") { actions.seekBy(-10_000) }
    private val fwd10 = button(R.drawable.tv_ic_fwd10, "Forward 10 seconds") { actions.seekBy(10_000) }
    private val speedLabel = TextView(context).apply {
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        text = "1×"
    }
    private val speed = button(R.drawable.tv_ic_speed, "Speed") { speedLabel.text = speedText(actions.nextSpeed()) }
    private val dub = button(R.drawable.tv_ic_dub, "English dub") { actions.englishDub() }
    private val subtitles = button(R.drawable.tv_ic_subtitles, "Subtitles") { actions.openMenu() }
    private val audio = button(R.drawable.tv_ic_audio, "Audio") { actions.openMenu() }
    private val aspect = button(R.drawable.tv_ic_aspect, "Picture fit") { showSong(actions.nextAspect(), "Picture fit") }
    private val song = button(R.drawable.tv_ic_song, "Identify song") { actions.identifySong() }

    /** Identify song's answer (and short notices), top right; stays up on its own timer. */
    private val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        visibility = View.GONE
        setPadding(dp(20f), dp(14f), dp(20f), dp(14f))
        background = GradientDrawable().apply {
            cornerRadius = dp(16f).toFloat()
            setColor(Color.argb(220, 12, 14, 20))
            setStroke(dp(1f), Color.argb(60, 255, 255, 255))
        }
    }
    private val cardTitle = TextView(context).apply {
        setTextColor(Color.WHITE)
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
    }
    private val cardBody = TextView(context).apply {
        setTextColor(Color.argb(210, 255, 255, 255))
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
        maxLines = 3
        ellipsize = TextUtils.TruncateAt.END
    }
    private val hideCard = Runnable {
        card.visibility = View.GONE
        // Nothing of the bar over the video once both are gone (HDR keeps the video alone).
        if (bottom.visibility != View.VISIBLE) visibility = View.GONE
    }

    private lateinit var top: View
    private lateinit var bottom: View
    private val backButton = button(R.drawable.tv_ic_back, "Back") { actions.leave() }

    private var live = false

    init {
        visibility = View.GONE
        isFocusable = false
        descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS

        // Top: back and the title over a soft shade.
        top = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(32f), dp(20f), dp(32f), dp(40f))
            background = GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                intArrayOf(Color.argb(170, 0, 0, 0), Color.TRANSPARENT),
            )
            addView(backButton)
            addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(8f)
            })
        }
        addView(top, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        // Bottom: the progress line, then the buttons in the Classic layout's order.
        val left = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(playPause)
            addView(stop)
            addView(volume)
            addView(time, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                marginStart = dp(10f)
            })
        }
        val middle = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            addView(back10)
            addView(fwd10)
        }
        val right = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL or Gravity.END
            addView(speed)
            addView(speedLabel, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                marginEnd = dp(10f)
            })
            addView(dub)
            addView(subtitles)
            addView(audio)
            addView(aspect)
            addView(song)
        }
        val buttons = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(left, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(middle, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(right, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        bottom = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(32f), dp(48f), dp(32f), dp(20f))
            background = GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                intArrayOf(Color.argb(200, 0, 0, 0), Color.TRANSPARENT),
            )
            addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(4f)).apply {
                bottomMargin = dp(12f)
            })
            addView(buttons)
        }
        addView(bottom, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))

        card.addView(cardTitle)
        card.addView(cardBody)
        addView(card, LayoutParams(dp(420f), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP or Gravity.END).apply {
            topMargin = dp(84f)
            marginEnd = dp(32f)
        })
    }

    /** The controls are up (the song card can stay up without them). */
    val isShowing get() = visibility == View.VISIBLE && bottom.visibility == View.VISIBLE

    fun setSongIdShown(shown: Boolean) {
        song.visibility = if (shown) View.VISIBLE else View.GONE
    }

    /** A short card over the video for ten seconds: a song's name, or why it couldn't be named. */
    fun showSong(title: String, body: String) {
        visibility = View.VISIBLE
        cardTitle.text = title
        cardBody.text = body
        cardBody.visibility = if (body.isEmpty()) View.GONE else View.VISIBLE
        card.visibility = View.VISIBLE
        removeCallbacks(hideCard)
        postDelayed(hideCard, 10_000)
    }

    fun setTitle(text: String) {
        title.text = text
    }

    /** Shows the bar; [focus] puts the remote on play/pause when nothing in the bar has it. */
    fun show(focus: Boolean) {
        visibility = View.VISIBLE
        top.visibility = View.VISIBLE
        bottom.visibility = View.VISIBLE
        if (focus && findFocus() == null) playPause.requestFocus()
    }

    /** Hides the controls; a song card still showing stays until its time is up. */
    fun hide() {
        top.visibility = View.GONE
        bottom.visibility = View.GONE
        if (card.visibility != View.VISIBLE) visibility = View.GONE
    }

    /** Leaving full screen: nothing of the bar stays. */
    fun hideAll() {
        hide()
        removeCallbacks(hideCard)
        card.visibility = View.GONE
        visibility = View.GONE
    }

    fun update(positionMs: Long, durationMs: Long, bufferedMs: Long, isLive: Boolean, playing: Boolean, muted: Boolean) {
        live = isLive
        playPause.setImageResource(if (playing) R.drawable.tv_ic_pause else R.drawable.tv_ic_play)
        playPause.contentDescription = if (playing) "Pause" else "Play"
        volume.setImageResource(if (muted) R.drawable.tv_ic_muted else R.drawable.tv_ic_volume)
        volume.contentDescription = if (muted) "Unmute" else "Mute"
        if (isLive || durationMs <= 0) {
            time.text = "● LIVE"
            progress.progress = 1000
            progress.secondaryProgress = 1000
        } else {
            time.text = "${clock(positionMs)} / ${clock(durationMs)}"
            progress.progress = ((positionMs * 1000) / durationMs).toInt().coerceIn(0, 1000)
            progress.secondaryProgress = ((bufferedMs * 1000) / durationMs).toInt().coerceIn(0, 1000)
        }
        speed.visibility = if (isLive) View.GONE else View.VISIBLE
        speedLabel.visibility = speed.visibility
    }

    private fun speedText(v: Float) =
        if (v == v.toInt().toFloat()) "${v.toInt()}×" else String.format(Locale.US, "%.2f×", v).replace("0×", "×")

    private fun clock(ms: Long): String {
        val total = (ms / 1000).coerceAtLeast(0)
        val h = total / 3600
        val m = (total % 3600) / 60
        val s = total % 60
        return if (h > 0) String.format(Locale.US, "%d:%02d:%02d", h, m, s)
        else String.format(Locale.US, "%d:%02d", m, s)
    }
}
