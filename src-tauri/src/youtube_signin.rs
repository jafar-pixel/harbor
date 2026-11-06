//! YouTube (Google) sign in for the desktop app, in the listener's own browser.
//!
//! The app's web view blocks Google's pop-up, and Google refuses sign ins inside embedded web
//! views, so the desktop app does what Spotify's sign in does (music/spotify/auth.rs): open
//! Google in the default browser and catch the answer on a loopback address. The page decides
//! what to ask Google for and checks the answer; this only carries it back.

use std::sync::Mutex;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};

/// Keep in sync with YOUTUBE_DESKTOP_REDIRECT in src/lib/music/youtube-web/auth.ts and the
/// music-link function's YOUTUBE_REDIRECT. Registered on the Google OAuth client.
const REDIRECT_PORT: u16 = 8899;
const REDIRECT_PATH: &str = "/youtube";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(180);
const READ_TIMEOUT: Duration = Duration::from_secs(10);

static PENDING: Mutex<Option<oneshot::Sender<()>>> = Mutex::new(None);

const DONE_HTML: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>YouTube connected · JL Media Vision</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0d10;color:#f5f3ec;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}h1{font-weight:500;margin:0 0 .5rem;font-size:1.25rem}p{opacity:.6;margin:0;font-size:.875rem}</style></head>
<body><main><h1>Back to JL Media Vision</h1><p>You can close this tab and go back to the app.</p></main></body></html>"#;

// Google puts a token answer after the "#", which never reaches a server. This page moves it
// into the query and asks again.
const FRAGMENT_HTML: &str = r#"<!doctype html>
<html><head><meta charset="utf-8"><title>JL Media Vision</title></head>
<body><script>location.replace(location.pathname + "?" + (location.hash.slice(1) || "error=no_answer"));</script></body></html>"#;

fn redirect_uri() -> String {
    format!("http://localhost:{REDIRECT_PORT}{REDIRECT_PATH}")
}

/// Opens `url` (Google's sign in page) in the default browser and returns the query string
/// Google sends back to the loopback address. A newer call cancels an older one.
#[tauri::command]
pub async fn youtube_browser_signin(url: String) -> Result<String, String> {
    check_sign_in_url(&url)?;
    let (cancel_tx, mut cancel) = oneshot::channel();
    if let Some(older) = PENDING.lock().map_err(|_| "busy")?.replace(cancel_tx) {
        let _ = older.send(());
    }
    let (v4, v6) = bind().await?;
    tauri_plugin_opener::open_url(&url, None::<&str>)
        .map_err(|error| format!("Couldn't open your browser for Google sign in: {error}"))?;

    let (answer_tx, mut answers) = mpsc::channel::<String>(1);
    let serve = async {
        loop {
            let stream = match &v6 {
                Some(v6) => tokio::select! {
                    r = v4.accept() => r,
                    r = v6.accept() => r,
                },
                None => v4.accept().await,
            };
            if let Ok((stream, _)) = stream {
                tokio::spawn(answer(stream, answer_tx.clone()));
            }
        }
    };
    tokio::select! {
        _ = serve => Err("Google sign in stopped before it finished.".to_string()),
        Some(query) = answers.recv() => Ok(query),
        _ = &mut cancel => Err("Google sign in was started again.".to_string()),
        _ = tokio::time::sleep(SIGN_IN_TIMEOUT) => Err(format!(
            "Google sign in timed out after {} minutes. Press Connect to try again.",
            SIGN_IN_TIMEOUT.as_secs() / 60
        )),
    }
}

/// Only Google's sign in page, sending its answer to this app's loopback address.
fn check_sign_in_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "That Google sign in address isn't valid.")?;
    let redirect = redirect_uri();
    if parsed.scheme() != "https"
        || parsed.host_str() != Some("accounts.google.com")
        || !parsed
            .query_pairs()
            .any(|(key, value)| key == "redirect_uri" && value == redirect.as_str())
    {
        return Err("That Google sign in address isn't valid.".to_string());
    }
    Ok(())
}

/// Browsers try "localhost" as IPv6 or IPv4, so listen on both where the system has them. An
/// older sign in just cancelled may still hold the port for a moment.
async fn bind() -> Result<(TcpListener, Option<TcpListener>), String> {
    for _ in 0..20 {
        if let Ok(v4) = TcpListener::bind(("127.0.0.1", REDIRECT_PORT)).await {
            let v6 = TcpListener::bind(("::1", REDIRECT_PORT)).await.ok();
            return Ok((v4, v6));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err(format!(
        "Google sign in needs port {REDIRECT_PORT}. Close whatever is using it, or restart {}, and try again.",
        crate::brand::PRODUCT_NAME
    ))
}

async fn answer(mut stream: TcpStream, found: mpsc::Sender<String>) {
    let mut head = Vec::new();
    let mut chunk = [0u8; 2048];
    let read = tokio::time::timeout(READ_TIMEOUT, async {
        while !head.windows(4).any(|w| w == b"\r\n\r\n") && head.len() < 16 * 1024 {
            match stream.read(&mut chunk).await {
                Ok(0) | Err(_) => break,
                Ok(n) => head.extend_from_slice(&chunk[..n]),
            }
        }
    })
    .await;
    if read.is_err() || head.is_empty() {
        return;
    }
    let (status, body, query) = match request_query(&head) {
        Some(query) if !query.is_empty() => ("200 OK", DONE_HTML, Some(query)),
        Some(_) => ("200 OK", FRAGMENT_HTML, None),
        None => ("404 Not Found", "", None),
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;
    if let Some(query) = query {
        let _ = found.send(query).await;
    }
}

/// The query of a `GET /youtube?...` request ("" with no query), or None for anything else.
fn request_query(head: &[u8]) -> Option<String> {
    let line = std::str::from_utf8(head).ok()?.lines().next()?;
    let mut parts = line.split(' ');
    if parts.next()? != "GET" {
        return None;
    }
    let target = parts.next()?;
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    (path == REDIRECT_PATH).then(|| query.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_redirect_is_the_loopback_address_registered_with_google() {
        assert_eq!(redirect_uri(), "http://localhost:8899/youtube");
    }

    #[test]
    fn reads_the_query_of_the_callback_only() {
        assert_eq!(
            request_query(b"GET /youtube?code=a&state=b HTTP/1.1\r\nHost: x\r\n\r\n").as_deref(),
            Some("code=a&state=b")
        );
        assert_eq!(
            request_query(b"GET /youtube HTTP/1.1\r\n\r\n").as_deref(),
            Some("")
        );
        assert_eq!(request_query(b"GET /favicon.ico HTTP/1.1\r\n\r\n"), None);
        assert_eq!(
            request_query(b"POST /youtube?code=a HTTP/1.1\r\n\r\n"),
            None
        );
    }

    #[test]
    fn opens_only_google_with_this_redirect() {
        let ok = format!(
            "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri={}",
            url::form_urlencoded::byte_serialize(redirect_uri().as_bytes()).collect::<String>()
        );
        assert!(check_sign_in_url(&ok).is_ok());
        assert!(check_sign_in_url(
            "https://example.com/?redirect_uri=http%3A%2F%2Flocalhost%3A8899%2Fyoutube"
        )
        .is_err());
        assert!(check_sign_in_url(
            "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fevil"
        )
        .is_err());
        assert!(check_sign_in_url("file:///etc/passwd").is_err());
    }
}
