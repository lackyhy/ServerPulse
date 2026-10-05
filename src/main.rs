mod config;
mod monitor;
mod state;
mod routes;

use std::collections::HashMap;
use std::env;
use std::fs;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{broadcast, RwLock};
use tracing::{error, info};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::load_config;
use crate::monitor::{check_all_now, start_monitor_worker};
use crate::routes::app_router;
use crate::state::{AppStateInner, ServerRuntime, SharedState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize structured logging
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "server_pulse=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config_path = env::var("SERVER_CONFIG_PATH").unwrap_or_else(|_| {
        if Path::new("config.yaml").exists() {
            "config.yaml".to_string()
        } else if Path::new("servers.yaml").exists() {
            "servers.yaml".to_string()
        } else {
            "config.yaml".to_string()
        }
    });

    info!("Starting Server Pulse Monitor using config: {}", config_path);

    if !Path::new(&config_path).exists() {
        warn_or_create_default_config(&config_path)?;
    }

    let initial_config = match load_config(&config_path) {
        Ok(cfg) => cfg,
        Err(e) => {
            error!("Failed to parse config file '{}': {}. Exiting.", config_path, e);
            std::process::exit(1);
        }
    };

    let servers_path = initial_config.servers_file.clone();
    let mtime_cfg = fs::metadata(&config_path).and_then(|m| m.modified()).ok();
    let mtime_srv = fs::metadata(&servers_path).and_then(|m| m.modified()).ok();
    let (tx_events, _) = broadcast::channel(100);

    let mut servers_map = HashMap::new();
    for s_cfg in initial_config.servers {
        servers_map.insert(s_cfg.name.clone(), ServerRuntime::new(s_cfg));
    }

    let shared_state: SharedState = Arc::new(RwLock::new(AppStateInner {
        servers: servers_map,
        config_path: config_path.clone(),
        servers_path: servers_path.clone(),
        password: initial_config.password.clone(),
        last_config_mtime: mtime_cfg,
        last_servers_mtime: mtime_srv,
        tx_events,
    }));

    // Start background polling worker
    start_monitor_worker(shared_state.clone());

    // Trigger an initial immediate check in background so metrics appear right away
    let state_for_initial = shared_state.clone();
    tokio::spawn(async move {
        info!("Performing initial startup check of all nodes...");
        check_all_now(state_for_initial).await;
        info!("Initial check complete.");
    });

    let port = initial_config.port;
    let bind_host: std::net::IpAddr = initial_config
        .host
        .parse()
        .unwrap_or(std::net::IpAddr::V4(std::net::Ipv4Addr::new(0, 0, 0, 0)));
    let addr = SocketAddr::from((bind_host, port));
    let listener = TcpListener::bind(addr).await?;
    info!("🚀 Server Pulse listening on http://{}:{}", initial_config.host, port);
    info!("📊 Web Dashboard & REST API available at http://127.0.0.1:{}", port);

    let app = app_router(shared_state);
    axum::serve(listener, app).await?;

    Ok(())
}

fn warn_or_create_default_config(path: &str) -> std::io::Result<()> {
    info!("Configuration file '{}' not found. Creating sample configuration...", path);
    let sample = r#"# Server Pulse Monitoring Configuration
servers:
  - name: "Cloudflare DNS"
    host: "1.1.1.1"
    check_type: "ping"
    interval_seconds: 10
    timeout_ms: 3000

  - name: "Google Public DNS"
    host: "8.8.8.8"
    check_type: "ping"
    interval_seconds: 15
    timeout_ms: 3000

  - name: "HTTPBin Status API"
    host: "httpbin.org/status/200"
    check_type: "https"
    expected_status: 200
    interval_seconds: 20
    timeout_ms: 5000

  - name: "Local Backend Service"
    host: "127.0.0.1"
    port: 3000
    check_type: "tcp"
    interval_seconds: 10
    timeout_ms: 2000

  - name: "GitHub Public Web"
    host: "github.com"
    check_type: "https"
    expected_status: 200
    interval_seconds: 30
    timeout_ms: 5000
"#;
    fs::write(path, sample)?;
    Ok(())
}
