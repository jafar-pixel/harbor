//! WebView2 keeps an HTTP cache of the app's own pages (tauri.localhost) in its profile, and the
//! app's assets are served without cache headers. After an update that cache could keep showing
//! the previous version's screens, so the first launch of a new version clears it. Only the cache
//! folders go: sign-ins, settings and other site data stay.

#[cfg(windows)]
pub fn clear_after_update(identifier: &str, version: &str) {
    use std::fs;
    use std::path::PathBuf;

    let Some(base) = std::env::var_os("LOCALAPPDATA") else {
        return;
    };
    let dir = PathBuf::from(base).join(identifier);
    let stamp = dir.join("web-cache-version.txt");
    if fs::read_to_string(&stamp).ok().as_deref() == Some(version) {
        return;
    }
    let profile = dir.join("EBWebView").join("Default");
    let mut cleared = true;
    for sub in ["Cache", "Code Cache", "GPUCache", "Service Worker"] {
        let path = profile.join(sub);
        if path.exists() && fs::remove_dir_all(&path).is_err() {
            // Still in use (another copy running): try again on the next launch.
            cleared = false;
        }
    }
    if cleared {
        let _ = fs::create_dir_all(&dir);
        let _ = fs::write(&stamp, version);
    }
}

#[cfg(not(windows))]
pub fn clear_after_update(_identifier: &str, _version: &str) {}
