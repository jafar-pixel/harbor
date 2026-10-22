# JL MediaVision remote controller

The normal JL app stays a full browsing and playback app on the iPad. Open its Remote tab to choose **Watch here** or **Control display**; selecting a display makes browsing and Play control that display. **Watch here** restores iPad playback. The dedicated `/remote` address opens directly to the controller.

1. Sign into the same JL account on the receiving display and the iPad or phone.
2. On the display, enable **Allow remote controller** under Settings → Remotes. In the TV interface, use the **Enable remote controller** action on the Connect screen.
3. Open https://watch.jl-stream.com/remote on the iPad. In the Remote tab, choose the display. Keep the receiving JL app open.
4. Browse with the existing JL interface, or use the touchpad and directional remote. A disconnected display does not queue old commands for later playback.

The remote controller uses an authenticated private network channel. It works with JL on a desktop and the JL Android TV/Shield APK. A television must run the compatible JL app; this does not control arbitrary TV power or system menus.

The iPad web/PWA remote does not use Bluetooth. Native iPad Bluetooth support is a separate implementation that requires an iPad app and receiver/hardware testing.

Display discovery expires after twelve seconds without an update. Reopening a backgrounded iPad reconnects with a fresh account session. Controls remain disabled until the private channel joins. Provider keys, library dumps and local cast addresses are excluded from remote controller snapshots; password fields are excluded from remote typing. Profile PIN protection remains in place.
