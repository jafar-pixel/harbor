package com.jlstream.mediavision

import android.app.Activity
import android.os.Build
import android.view.Display
import kotlin.math.abs
import kotlin.math.roundToInt

/** The TV's display modes. Display.Mode is API 23, below minSdk 24, so nothing here needs a guard. */
object DisplayModes {
    @Suppress("DEPRECATION")
    fun display(activity: Activity): Display? =
        if (Build.VERSION.SDK_INT >= 30) activity.display else activity.windowManager.defaultDisplay

    /** The largest mode the TV supports, which is not always the size the UI currently runs at. */
    fun largest(modes: Array<Display.Mode>): Display.Mode? = modes.maxByOrNull { area(it) }

    /**
     * The mode to play a [width]x[height] video at [fps] in, or null when nothing fits.
     *
     * The size only ever goes up: a video larger than [current] gets the smallest mode that holds
     * it, anything else keeps the current size, so the Shield goes on upscaling lower resolutions
     * to the TV's 4K itself. The refresh rate is the frame rate or a whole multiple of it, exact
     * matches first (23.976 Hz for 23.976 fps, then 24 Hz), lower multiples first. Without a known
     * frame rate, or with no rate that fits, the current refresh rate is kept.
     */
    fun bestFor(modes: Array<Display.Mode>, current: Display.Mode, width: Int, height: Int, fps: Float): Display.Mode? {
        if (modes.isEmpty() || width <= 0 || height <= 0) return null
        val holds = { m: Display.Mode ->
            maxOf(m.physicalWidth, m.physicalHeight) >= maxOf(width, height) &&
                minOf(m.physicalWidth, m.physicalHeight) >= minOf(width, height)
        }
        val size = when {
            holds(current) -> current
            else -> modes.filter(holds).minByOrNull { area(it) } ?: largest(modes) ?: return null
        }
        val sameSize = modes.filter { it.physicalWidth == size.physicalWidth && it.physicalHeight == size.physicalHeight }
        val byRate = if (fps > 1f) {
            sameSize.mapNotNull { m -> rateFit(m.refreshRate, fps)?.let { m to it } }.minByOrNull { it.second }?.first
        } else null
        return byRate ?: sameSize.minByOrNull { abs(it.refreshRate - current.refreshRate) }
    }

    /**
     * How well [refresh] carries [fps]: lower is better, null when it is not within 0.2% of a whole
     * multiple. 24 Hz is 0.1% off 23.976 fps, close enough to use when 23.976 Hz is missing.
     */
    private fun rateFit(refresh: Float, fps: Float): Float? {
        val multiple = (refresh / fps).roundToInt()
        if (multiple < 1) return null
        val error = abs(refresh - multiple * fps) / (multiple * fps)
        if (error > 0.002f) return null
        val exact = if (error < 0.0005f) 0f else 1f
        return exact + multiple / 1000f
    }

    private fun area(m: Display.Mode): Long = m.physicalWidth.toLong() * m.physicalHeight
}
