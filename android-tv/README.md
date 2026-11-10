# JL Media Vision for Android TV

A WebView shell around the JL Media Vision web app (`BuildConfig.APP_URL`) for Android TV and the
NVIDIA Shield. Streams play in a native ExoPlayer (Media3) drawn over the WebView, which the page
drives through `window.JLNativePlayer`.

Build: `gradle -p android-tv assembleRelease` (JDK 17, Android SDK platform 35). CI builds it in
`.github/workflows/jl-release.yml`.

## TV track

The TV app is released on its own, from the `tv/main` branch (`jl-release.yml` with `tv_only`,
which reuses the latest Windows installer untouched). It carries its own copy of the app's pages:
the release builds them from the same commit and `tools/bundle_site.py` puts them in
`assets/site`, and `BundledSite.kt` answers the app's address (`watch.jl-stream.com`) from that
copy. The address is unchanged, so sign ins, saved data and server access stay as they were; the
server's `/api/` paths and big media (models, game files, large images) still load from the
website. A website deploy no longer changes the TV, and TV fixes on `tv/main` never reach the
desktop app's release branch.

## Native player bridge

`window.JLNativePlayer` exists in the main WebView only (not in the in-app browser). Calls do
nothing unless the WebView is on an `APP_HOSTS` page (or the `APP_URL` host). Every call is
handed to the main thread, so it returns before the player has acted on it; follow the
`jl-native-player` events for the actual state.

```js
const player = window.JLNativePlayer;
if (player?.isAvailable()) {
  player.setMode("full");
  player.play(url, JSON.stringify({ Referer: "https://example.com/" }), "Channel 4", 0);
}
```

| Method                                            | Description                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isAvailable(): boolean`                          | `true` when the bridge will accept calls on this page.                                                                                                                                                                                                                                                                                                                    |
| `play(url, headersJson, title, startMs): boolean` | Plays an `http`/`https` URL, replacing what was playing. `headersJson` is a JSON object of request headers (`""` or `"{}"` for none); a `User-Agent` entry replaces the default `JLMediaVisionTV/<version> … AndroidXMedia3/<version>`. `startMs > 0` starts there (ignored by live streams). Returns `false` when the URL or page is rejected. The current mode is kept. |
| `setMode(mode)`                                   | `"full"`, `"hero"` or `"hidden"`. Unknown values are ignored. The mode can be set before `play`.                                                                                                                                                                                                                                                                          |
| `setRect(x, y, w, h)`                             | The hero area in CSS pixels relative to the WebView viewport (`element.getBoundingClientRect()`). Call it again whenever the area moves or resizes. `w` or `h` `<= 0` clears it.                                                                                                                                                                                          |
| `pause()` / `resume()`                            | Pauses or resumes. `resume()` restarts an ended or failed stream.                                                                                                                                                                                                                                                                                                         |
| `seek(ms)`                                        | Seeks to `ms`, clamped to the stream's duration when known.                                                                                                                                                                                                                                                                                                               |
| `stop()`                                          | Stops, releases the player and returns to `hidden`.                                                                                                                                                                                                                                                                                                                       |
| `setOptions(json)`                                | Playback options, applied from the next `play` (see below). Unknown or missing keys keep their defaults; invalid JSON is ignored.                                                                                                                                                                                                                                         |
| `capabilities(): string`                          | What the TV supports, as JSON (see below). `"{}"` off an app page.                                                                                                                                                                                                                                                                                                        |
| `audioTracks(): string`                           | The playing stream's audio tracks, as a JSON array (see [Audio tracks](#audio-tracks)). `"[]"` before the tracks are known, after `stop()`, or off an app page.                                                                                                                                                                                                           |
| `setPreferredAudioLanguage(lang)`                 | Plays audio in `lang` (an ISO 639 code such as `"en"` or `"eng"`) when the stream has it, replacing any earlier audio choice; `""` goes back to the default pick. It stays in force for later `play` calls until `stop()`.                                                                                                                                                |
| `showMessage(text)`                               | Shows `text` (up to 200 characters) as a toast over the video in `full`, where the page can't be seen. Ignored in `hero` and `hidden`.                                                                                                                                                                                                                                    |
| `addSubtitleText(vtt, language, label, select)`   | Adds a subtitle to the playing video as WebVTT text. The page downloads and reads it as the desktop does (addons, subtitle sites, logins, zips, encodings; `native-tv/subtitles.ts`). The item is set again at the same position, as Media3 adds side-loaded subtitles only on prepare. `select` turns it on. False off an app page or over 8 million characters.         |
| `setSubtitlesEnabled(on)`                         | Subtitles on or off, keeping the tracks.                                                                                                                                                                                                                                                                                                                                  |
| `setSubtitleDelay(sec)`                           | Subtitle timing in seconds; positive shows them later.                                                                                                                                                                                                                                                                                                                    |
| `setAudioDelay(sec)`                              | Audio timing in seconds; positive plays the sound later. No effect with tunneled playback.                                                                                                                                                                                                                                                                                |

`setOptions`, `capabilities`, `audioTracks`, `setPreferredAudioLanguage` and `showMessage` are newer than the
first app builds, so the page checks `typeof player.setOptions === "function"` (and so on) before
calling them; an older app plays with the defaults below and reports no audio tracks.

### Playback options

```js
player.setOptions(
  JSON.stringify({
    matchFrameRate: true, // default true
    maxResolution: "auto", // "auto" (default, up to the TV's largest mode), "1080p" or "720p"
    audioPassthrough: true, // default true
    tunneling: false, // default false
  }),
);
```

- Video tracks are chosen for the TV's largest display mode (`Display.getSupportedModes`), not the
  size the UI runs at, so adaptive HLS/DASH streams pick their 4K variants on a 4K TV.
  `maxResolution` caps that. Video is drawn on the default surface, so HDR10 and Dolby Vision
  pass through to the TV.
- `matchFrameRate`: in `full`, the window asks for the display mode that suits the video once its
  format is known: the video's frame rate or a whole multiple of it (23.976 Hz, else 24 Hz, for
  23.976 fps), and a larger size only when the video needs it, so the Shield keeps upscaling lower
  resolutions itself. The original mode returns when playback stops, the app pauses, or the mode
  leaves `full`. ExoPlayer's own seamless frame-rate hint is on with it and off without it.
- `audioPassthrough`: AC3, E-AC3, DTS and TrueHD go to the receiver undecoded when it reports
  them. Off, everything is decoded to PCM; ExoPlayer has no DTS or TrueHD decoder, so those tracks
  then have no sound.
- `tunneling`: tunneled video playback. Some streams fail to start with it.

### Capabilities

```json
{
  "maxWidth": 3840,
  "maxHeight": 2160,
  "refreshRates": [23.976, 24, 25, 29.97, 30, 50, 59.94, 60],
  "hdr": ["hdr10", "hlg", "dolby-vision"],
  "passthrough": ["ac3", "eac3", "eac3-joc", "dts", "truehd"],
  "pageBack": true
}
```

`hdr` holds any of `hdr10`, `hdr10-plus`, `hlg`, `dolby-vision`. `passthrough` holds any of `ac3`,
`eac3`, `eac3-joc`, `ac4`, `dts`, `dts-hd`, `truehd`, for the current audio output. `pageBack`
says the app hands Back to Big Picture (below); the page only opens in Big Picture by default
when it is true.

### Audio tracks

`audioTracks()` and the `tracks` event list the audio tracks the TV can play:

```json
[
  {
    "id": "1:0",
    "language": "ja",
    "label": "Japanese",
    "selected": true,
    "channels": 6,
    "codec": "audio/eac3"
  },
  {
    "id": "2:0",
    "language": "en",
    "label": "English",
    "selected": false,
    "channels": 2,
    "codec": "audio/mp4a-latm"
  }
]
```

`id` is `"<group>:<track>"` and stays the same for the stream. `language` (as the stream tags it,
often `"und"` when untagged), `label`, `channels` and `codec` are left out when the stream doesn't
say. Tracks the TV can't decode or pass through are not listed. The page switches audio with
`setPreferredAudioLanguage(track.language)`; Media3 picks among tracks that share a language, so
two English tracks can't be told apart this way.

### Modes

- `full`: fills the screen. The remote controls the player: Center/Enter and Play/Pause toggle
  pause, Left/Right (and Rewind/Fast-forward) seek 10 seconds, Up shows the progress bar, and
  Down (or Menu) opens the [full-screen menu](#full-screen-menu). Back sends `exit-full`, then
  returns to `hero` when the page has set a hero rect, otherwise stops (`stopped` follows).
- `hero`: the video sits in the hero rect while the page keeps the remote and scrolls beneath it.
  Nothing is drawn until a rect has been set. The video covers anything the page draws in that
  area, so switch to `hidden` while a menu or dialog overlaps it.
- `hidden`: the video is not drawn. Playback continues; call `pause()` or `stop()` as needed.

In `hero` and `hidden`, keys go to the page. Back then goes to Big Picture when it is open
(`window.__harborBack()`, `src/views/big-picture/bp-back.ts`): it goes back a screen there, and
at Big Picture's home screen the app asks before leaving. Outside Big Picture, Back walks the
WebView's history, then asks before leaving.

### Full-screen menu

Down or Menu in `full` opens an "Audio & options" list. While it is open the remote moves through
the list and Center picks an item, instead of seeking or pausing; Back closes it. A checked item
is the current choice.

- **English dub**: checked while the playing audio track is English (tagged `en`/`eng`, or
  labelled English). When the file has an English track, the app switches to it (the main mix
  before commentary, then the default, then the most channels). When it has none, the app shows
  "No English audio in this file. Finding an English dub…" and sends `english-dub`; the page
  then looks for an English dub source and plays it in place with `play`, which keeps `full`.
- **Audio: …**: each audio track the TV can play, by label/language and channels. Picking one
  plays exactly that track, and its language is kept for later `play` calls like
  `setPreferredAudioLanguage`.
- **Subtitles: Off / …**: shown when the stream has embedded text tracks. Off disables text
  tracks; a track plays exactly that track.
- **Subtitle timing / Audio timing**: Earlier and Later move the subtitles or the sound by 0.1 s
  (Reset puts them back), as the desktop's timing rows and mpv's `sub-delay` and `audio-delay`.
  The dialog stays open while adjusting and sends `sync`. Subtitles are shown at the playback
  position minus the delay (`DelayedTextRenderer`); the sound is delayed by moving the playback
  clock, which follows the audio sink (`DelayedAudioSink`). Audio timing is off with tunneled
  playback, where the TV's decoder syncs the picture itself. See `SyncOffsets.kt`.
- **Stream info**: resolution, frame rate, codec and HDR type, bitrate, sound format, the
  decoders in use, passthrough and tunneling, the TV's current display mode, how many seconds are
  buffered ahead, and the network speed Media3 measures.
- **More player options**: leaves `full` as Back does (`exit-full`), so the page's own controls
  can be reached.

The menu closes when the player leaves `full`, stops, or plays another stream.

### Events

The player reports through a window event:

```js
window.addEventListener("jl-native-player", (event) => {
  const { type, mode, positionMs, durationMs, message } = event.detail;
});
```

| `type`        | When                                                                                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ready`       | The stream is ready to play (once per `play`).                                                                                                                                                                                                                          |
| `playing`     | Playback started or resumed.                                                                                                                                                                                                                                            |
| `paused`      | Paused (by the page, the remote, or the app leaving the screen).                                                                                                                                                                                                        |
| `buffering`   | Waiting for data.                                                                                                                                                                                                                                                       |
| `ended`       | The stream finished.                                                                                                                                                                                                                                                    |
| `error`       | Playback failed; `message` holds the Media3 error code name and text. A live stream that falls behind its window rejoins the live edge without an error.                                                                                                                |
| `stopped`     | The player was released. `message` is `"navigation"` when the WebView loaded a new document, `"background"` when the app left the screen, and absent for `stop()` or Back.                                                                                              |
| `position`    | About once a second while playing.                                                                                                                                                                                                                                      |
| `exit-full`   | Back, or the menu's "More player options", left full screen.                                                                                                                                                                                                            |
| `tracks`      | The stream's tracks are known or the selection changed; `audioTracks` holds the same array `audioTracks()` returns.                                                                                                                                                     |
| `english-dub` | The full-screen menu's English dub item was picked and the file has no English audio track: the page should find an English dub source and `play` it (`src/views/player/hooks/use-english-dub.ts`). The page's notices about it reach the screen through `showMessage`. |
| `sync`        | The viewer changed the timing in the menu; `subDelaySec` and `audioDelaySec` hold both timings in seconds (positive is later). The page keeps the subtitle timing for the title, as on the desktop.                                                                     |

`mode` is `"full"`, `"hero"` or `"hidden"` at the time of the event. `positionMs` and
`durationMs` are milliseconds; `durationMs` is `0` when unknown, and for a live stream it is the
length of the live window.

### Lifecycle

The player pauses when the activity pauses and is released (`stopped`, message `"background"`)
when it stops, which also frees the provider connection. The page calls `play` again to resume.

### Audio

With Audio passthrough on, Dolby and DTS go to the TV or receiver undecoded when it reports
them. Anything it can't take is decoded on the TV by Media3's FFmpeg extension
(`org.jellyfin.media3:media3-ffmpeg-decoder`, which must match the Media3 version): Dolby
Digital, Dolby Digital Plus, DTS and TrueHD, after the platform's own decoders. With
passthrough off, everything is decoded to PCM.

### Streams

HTTP requests allow redirects between `http` and `https`. URLs whose path ends in `.m3u8`, or
with `output=hls` or `output=m3u8` in the query, play as HLS; anything else is detected from the
content (MPEG-TS, MP4, MKV and other progressive formats).

## Provider requests

IPTV servers mostly answer over plain http without CORS headers, so the page can't read them with
its own `fetch()`. When `window.JLNativeFetch?.isAvailable()` is true, the page requests
`https://jl-native-fetch.invalid/?u=<url>&ua=<user agent>` instead (`src/lib/native-fetch.ts`).
`MainActivity` intercepts that host and `NativeFetch` fetches the URL from the TV, following up
to five redirects, and returns the status, body and content type with
`Access-Control-Allow-Origin: *`. Only `GET` from an app page is served, and only `http`/`https`
targets. A failed connection answers `502`.

## Player controls

Full screen uses this app's own control layout (`res/layout/exo_player_control_view.xml`, which
replaces Media3's and keeps every id it looks up): a glass bar along the bottom with the seek bar
across its top in the theme's `accent` (time played left, time left right), the viewer's buttons
(Settings › Player layout) with the desktop player's Lucide icons (`res/drawable/jl_ic_*`), and
the title and stream labels top left. Left and right skip 10 seconds, as on the desktop.

The gear (always last) and the remote's menu button open the **Player menu**, a glass panel down
the right side: audio and subtitle tracks, subtitle and audio timing, speed, picture fit, the
skip settings (Settings › Intros: skip intros, recaps and credits automatically, show the skip
button; a change is sent as a `setting` event and saved by the page), stream info, and more
player options.

`setSkipButton(json)` shows the page's skip button over the video, JSON `{label, toSec}` (skip
to that second) or `{label, action: "next"}` (next episode); `""` hides it. OK on the remote
presses it while it shows.

## Buffering

Media3 caps its buffer by size as well as time (about 140 MB by default), which a 4K UHD remux at
80-100 Mb/s fills in 11-14 seconds. The app asks for Android's large heap (`android:largeHeap`, as
Jellyfin's Android TV app does) and sets the buffer to half the heap, at most 256 MB
(`NativePlayer.bufferBytesFor`), so it holds roughly twice as much of a remux.

## Crash reports

When the app closes unexpectedly (an uncaught error, or the page's renderer stopping), the next
launch shows why once, so it can be photographed (`CrashLog.kt`). A stopped page reports whether
it crashed or Android closed it for memory, then:

- the app screen it was on (path only, no query),
- the player: mode, playing or paused, resolution, codec, HDR type, sound format and position,
- the TV's display mode, and the mode before the player switched it for the video (Match frame
  rate),
- the TV's free memory, and the WebView version,
- what the page is doing, sent every 5 seconds while the player is attached (`notePage`): its
  JavaScript heap, how many video elements it has and how many are playing, its frames and
  element count,
- the last ten steps between the page and the player (`play`, `setMode full`, `→ ready`…),
- the page's last four console errors, with every address cut to its host (`PageTrail.kt`), so
  stream links and tokens never reach the report.
