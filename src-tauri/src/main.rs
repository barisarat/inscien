// Prevents an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// InScien desktop shell.
//
// Lifecycle: resolve the OS app-data dir + the bundled frontend -> resolve the (user-picked) Zotero
// folder -> pick a free loopback port -> spawn the frozen backend sidecar (which serves BOTH the API
// and the static UI) with the env it needs -> wait for /health -> open a window pointed at
// http://127.0.0.1:<port> -> kill the sidecar on exit.
//
// ML weights are NOT bundled: the backend defaults the embedding cache and Kokoro voice weights
// under INSCIEN_DATA_DIR (writable). fastembed auto-downloads bge-small on first index; the Kokoro
// voice (~1 GB) is downloaded on demand from the Narrate tab with a progress bar.
//
// NOTE: a few Tauri 2 API calls below may need small signature fixes against the installed
// toolchain (shell-sidecar scope/permission, dialog FilePath -> String, window builder). The
// structure + env wiring is the load-bearing part.

use std::collections::HashMap;
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default, Serialize, Deserialize)]
struct Config {
    zotero_dir: Option<String>,
}

/// Holds the backend child so we can kill it on exit.
struct Backend(Mutex<Option<CommandChild>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .expect("no free port")
        .local_addr()
        .unwrap()
        .port()
}

fn wait_healthy(port: u16, timeout: Duration) -> bool {
    let url = format!("http://127.0.0.1:{port}/health");
    let start = Instant::now();
    while start.elapsed() < timeout {
        if ureq::get(&url).timeout(Duration::from_secs(2)).call().is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    false
}

fn main() {
    #[cfg(target_os = "linux")]
    {
        // WebKitGTK's DMABUF renderer fails on many Linux setups (bare WMs like i3, some GPU
        // drivers), showing a blank white window. Disable it unless the user set a preference.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // WebKitGTK plays HTML5 <audio> (narration) through GStreamer, but linuxdeploy points the
        // plugin search path at the (empty) bundle dir inside the AppImage, so appsink/autoaudiosink
        // aren't found and playback fails on a plain launch. Until we bundle GStreamer into the
        // AppImage, fall back to the host's system plugins. Non-destructive: append the existing
        // system plugin dirs to whatever AppRun set, so the bundle path (if ever populated) still
        // wins first and a user override is preserved.
        const SYS_GST_DIRS: [&str; 3] = [
            "/usr/lib/gstreamer-1.0",
            "/usr/lib64/gstreamer-1.0",
            "/usr/lib/x86_64-linux-gnu/gstreamer-1.0",
        ];
        for var in ["GST_PLUGIN_SYSTEM_PATH_1_0", "GST_PLUGIN_SYSTEM_PATH", "GST_PLUGIN_PATH"] {
            let mut parts: Vec<String> = std::env::var(var)
                .ok()
                .filter(|s| !s.is_empty())
                .map(|s| s.split(':').map(String::from).collect())
                .unwrap_or_default();
            for dir in SYS_GST_DIRS {
                if std::path::Path::new(dir).is_dir() && !parts.iter().any(|p| p == dir) {
                    parts.push(dir.to_string());
                }
            }
            if !parts.is_empty() {
                std::env::set_var(var, parts.join(":"));
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Backend(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();

            // --- paths --------------------------------------------------------------------
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            let config_dir = app.path().app_config_dir()?;
            std::fs::create_dir_all(&config_dir).ok();
            let config_path = config_dir.join("config.json");

            // The bundled frontend export. Prefer an explicit env override (for `tauri dev` / the
            // spike, where bundled resources aren't assembled), else the bundled resource location.
            let frontend_dist = match std::env::var("FRONTEND_DIST") {
                Ok(p) if !p.is_empty() => PathBuf::from(p),
                _ => app
                    .path()
                    .resolve("frontend", BaseDirectory::Resource)
                    .unwrap_or_else(|_| PathBuf::from("frontend")),
            };

            // --- Zotero folder ------------------------------------------------------------
            // From saved config, else the ZOTERO_DATA_DIR env (handy for dev/the spike). We do
            // NOT pop a blocking native dialog here - that deadlocks because the GTK event loop
            // isn't running yet during setup() (and won't show at all on a bare WM). First-run
            // folder selection is deferred to an in-app action. If unset, the app still launches
            // (Map works on already-indexed data; the navigator shows the "set your library" state).
            let config: Config = std::fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default();
            let zotero_dir = config.zotero_dir.clone().or_else(|| std::env::var("ZOTERO_DATA_DIR").ok());

            // --- spawn the backend sidecar ------------------------------------------------
            let port = free_port();
            let mut env: HashMap<String, String> = HashMap::new();
            env.insert("ENV_NAME".into(), "production".into());
            env.insert("HOST".into(), "127.0.0.1".into());
            env.insert("PORT".into(), port.to_string());
            env.insert("INSCIEN_DATA_DIR".into(), data_dir.to_string_lossy().into_owned());
            env.insert("FRONTEND_DIST".into(), frontend_dist.to_string_lossy().into_owned());
            // ML weights (fastembed cache, Kokoro voice) default under INSCIEN_DATA_DIR - don't
            // override them, so the on-demand download lands where the backend reads.
            // Narration is bring-your-own; default to a host Ollama (the in-app gate handles "none").
            env.insert("OLLAMA_BASE_URL".into(), "http://localhost:11434/v1".into());
            if let Some(z) = &zotero_dir {
                env.insert("ZOTERO_DATA_DIR".into(), z.clone());
            }

            let (mut rx, child) = app.shell().sidecar("inscien-backend")?.envs(env).spawn()?;
            *app.state::<Backend>().0.lock().unwrap() = Some(child);

            // Forward the backend sidecar's stdout/stderr to our console (debuggability).
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => {
                            print!("[backend] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(e) => eprintln!("[backend error] {e}"),
                        CommandEvent::Terminated(p) => eprintln!("[backend exited] code={:?}", p.code),
                        _ => {}
                    }
                }
            });

            // --- open the window once the backend is healthy ------------------------------
            std::thread::spawn(move || {
                if wait_healthy(port, Duration::from_secs(60)) {
                    let url = format!("http://127.0.0.1:{port}/");
                    let _ = WebviewWindowBuilder::new(
                        &handle,
                        "main",
                        WebviewUrl::External(url.parse().unwrap()),
                    )
                    .title("InScien")
                    .inner_size(1280.0, 820.0)
                    .min_inner_size(940.0, 620.0)
                    .build();
                } else {
                    eprintln!("[inscien] backend did not become healthy within 60s - check the [backend] logs above");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building InScien")
        .run(|app, event| {
            // Make sure the backend sidecar dies with the app (no orphan process).
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<Backend>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
