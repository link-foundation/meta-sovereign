//! `meta-sovereign-rs` — pure-Rust drop-in for `bin/meta-sovereign serve`.
//!
//! Usage:
//!   meta-sovereign-rs serve [--port 8787] [--web ./src/web]
//!
//! When `--web` points at the SPA assets the Rust server doubles as
//! the static host, so the SPA can be opened at the same origin and
//! `discover.js` picks the server up via the same-origin probe.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use meta_sovereign_server::{serve, ServerOptions};

fn parse_args() -> ServerOptions {
    let mut port: u16 = 8787;
    let mut web: Option<PathBuf> = None;
    let mut args = std::env::args().skip(1);
    let mut subcmd_seen = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "serve" => subcmd_seen = true,
            "--port" => {
                if let Some(v) = args.next() {
                    port = v.parse().unwrap_or(port);
                }
            }
            "--web" => {
                web = args.next().map(PathBuf::from);
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                eprintln!("unknown argument: {other}");
                print_help();
                std::process::exit(2);
            }
        }
    }
    if !subcmd_seen {
        // Default to `serve` so `meta-sovereign-rs` with no args boots
        // the server, matching the JS bin behaviour.
    }
    ServerOptions {
        port,
        static_root: web,
    }
}

fn print_help() {
    eprintln!("meta-sovereign-rs — pure-Rust local server");
    eprintln!();
    eprintln!("USAGE:");
    eprintln!("  meta-sovereign-rs serve [--port <port>] [--web <dir>]");
    eprintln!();
    eprintln!("OPTIONS:");
    eprintln!("  --port <port>   TCP port to listen on (default 8787)");
    eprintln!("  --web <dir>     directory containing the SPA assets");
}

fn main() {
    let opts = parse_args();
    let handle = match serve(opts.clone()) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("failed to bind: {e}");
            std::process::exit(1);
        }
    };
    println!(
        "meta-sovereign-rs listening on http://127.0.0.1:{}",
        handle.port()
    );

    let stop = Arc::new(AtomicBool::new(false));
    let stop_for_handler = Arc::clone(&stop);
    // Best-effort SIGINT handling without external crates: install a
    // simple counter via the standard ctrl-c path. If the platform
    // doesn't expose it we just spin until killed.
    let _ = ctrlc_setup(move || stop_for_handler.store(true, Ordering::SeqCst));
    while !stop.load(Ordering::SeqCst) {
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    handle.shutdown();
}

#[cfg(unix)]
fn ctrlc_setup<F: Fn() + Send + 'static>(cb: F) -> std::io::Result<()> {
    use std::sync::Mutex;
    static CB: std::sync::OnceLock<Mutex<Box<dyn Fn() + Send + 'static>>> =
        std::sync::OnceLock::new();
    CB.get_or_init(|| Mutex::new(Box::new(cb)));
    // We deliberately do not install a real signal handler to avoid
    // pulling in `libc`. `Ctrl-C` will terminate the process; the
    // shutdown signal in the loop above is best-effort for tests.
    Ok(())
}

#[cfg(not(unix))]
fn ctrlc_setup<F: Fn() + Send + 'static>(_cb: F) -> std::io::Result<()> {
    Ok(())
}
