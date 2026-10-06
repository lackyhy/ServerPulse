use chrono::Utc;
use std::fs;
use std::net::SocketAddr;
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::net::TcpStream;
use tokio::process::Command;
use tracing::{error, info};

use crate::config::{load_config, CheckType, ServerConfig};
use crate::state::{
    AppEvent, DockerContainerInfo, Pm2ProcessInfo, PortInfo, ServerMetrics, ServerRuntime, ServerStatusKind, SharedState,
    TmuxSessionInfo,
};

pub async fn check_server(config: &ServerConfig) -> (ServerStatusKind, Option<f64>, Option<String>) {
    match config.check_type {
        CheckType::Http | CheckType::Https => check_http(config).await,
        CheckType::Tcp => check_tcp(config).await,
        CheckType::Ping => check_ping(config).await,
    }
}

async fn check_http(config: &ServerConfig) -> (ServerStatusKind, Option<f64>, Option<String>) {
    let scheme = match config.check_type {
        CheckType::Https => "https",
        _ => "http",
    };

    let url = if config.host.starts_with("http://") || config.host.starts_with("https://") {
        config.host.clone()
    } else if let Some(port) = config.port {
        format!("{}://{}:{}/", scheme, config.host, port)
    } else {
        format!("{}://{}/", scheme, config.host)
    };

    let timeout_duration = Duration::from_millis(config.timeout_ms);
    let client = match reqwest::Client::builder()
        .timeout(timeout_duration)
        .danger_accept_invalid_certs(true) // Helpful for internal/local testing
        .build()
    {
        Ok(c) => c,
        Err(e) => return (ServerStatusKind::Offline, None, Some(format!("HTTP client error: {}", e))),
    };

    let start = Instant::now();
    match client.get(&url).send().await {
        Ok(resp) => {
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
            let status_code = resp.status().as_u16();
            let expected = config.expected_status.unwrap_or(200);

            if status_code == expected {
                (ServerStatusKind::Online, Some((elapsed_ms * 10.0).round() / 10.0), None)
            } else {
                (
                    ServerStatusKind::Degraded,
                    Some((elapsed_ms * 10.0).round() / 10.0),
                    Some(format!("HTTP status {}, expected {}", status_code, expected)),
                )
            }
        }
        Err(err) => {
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
            let err_msg = if err.is_timeout() {
                format!("Timeout after {}ms", config.timeout_ms)
            } else if err.is_connect() {
                format!("Connection failed: {}", err)
            } else {
                err.to_string()
            };
            (ServerStatusKind::Offline, Some((elapsed_ms * 10.0).round() / 10.0), Some(err_msg))
        }
    }
}

async fn check_tcp(config: &ServerConfig) -> (ServerStatusKind, Option<f64>, Option<String>) {
    let port = config.port.unwrap_or(80);
    let host = &config.host;
    let target = format!("{}:{}", host, port);

    let timeout_duration = Duration::from_millis(config.timeout_ms);
    let start = Instant::now();

    // First try parsing as SocketAddr directly, or resolve via tokio dns lookup
    let connect_future = async {
        if let Ok(addr) = target.parse::<SocketAddr>() {
            TcpStream::connect(addr).await
        } else {
            TcpStream::connect(&target).await
        }
    };

    match tokio::time::timeout(timeout_duration, connect_future).await {
        Ok(Ok(_stream)) => {
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
            (ServerStatusKind::Online, Some((elapsed_ms * 10.0).round() / 10.0), None)
        }
        Ok(Err(e)) => {
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
            (
                ServerStatusKind::Offline,
                Some((elapsed_ms * 10.0).round() / 10.0),
                Some(format!("TCP error on {}: {}", target, e)),
            )
        }
        Err(_) => {
            (
                ServerStatusKind::Offline,
                None,
                Some(format!("TCP timeout after {}ms connecting to {}", config.timeout_ms, target)),
            )
        }
    }
}

async fn check_ping(config: &ServerConfig) -> (ServerStatusKind, Option<f64>, Option<String>) {
    let host = &config.host;
    let timeout_duration = Duration::from_millis(config.timeout_ms);
    let start = Instant::now();

    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("ping");
    #[cfg(target_os = "macos")]
    cmd.args(["-c", "1", "-W", &config.timeout_ms.to_string(), host]);

    #[cfg(not(target_os = "macos"))]
    let mut cmd = Command::new("ping");
    #[cfg(not(target_os = "macos"))]
    let timeout_secs = ((config.timeout_ms + 999) / 1000).max(1);
    #[cfg(not(target_os = "macos"))]
    cmd.args(["-c", "1", "-W", &timeout_secs.to_string(), host]);

    let ping_future = cmd.output();

    match tokio::time::timeout(timeout_duration, ping_future).await {
        Ok(Ok(output)) => {
            let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                // Attempt to parse actual ping latency time=X.X ms if available
                let parsed_ms = stdout
                    .lines()
                    .find(|line| line.contains("time="))
                    .and_then(|line| {
                        line.split("time=").nth(1)?.split_whitespace().next()?.parse::<f64>().ok()
                    })
                    .unwrap_or(elapsed_ms);

                (ServerStatusKind::Online, Some((parsed_ms * 10.0).round() / 10.0), None)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let err_msg = if stderr.trim().is_empty() {
                    format!("Ping packet loss / host unreachable ({})", host)
                } else {
                    stderr.trim().to_string()
                };
                (ServerStatusKind::Offline, None, Some(err_msg))
            }
        }
        Ok(Err(err)) => {
            (ServerStatusKind::Offline, None, Some(format!("Failed to execute ping: {}", err)))
        }
        Err(_) => {
            (ServerStatusKind::Offline, None, Some(format!("Ping timeout after {}ms", config.timeout_ms)))
        }
    }
}

pub async fn reload_config_from_disk(state: &SharedState) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (config_path, servers_path) = {
        let guard = state.read().await;
        (guard.config_path.clone(), guard.servers_path.clone())
    };

    let new_config = load_config(&config_path)?;
    let mtime_cfg = fs::metadata(&config_path).and_then(|m| m.modified()).ok();
    let mtime_srv = fs::metadata(&servers_path).and_then(|m| m.modified()).ok();

    let event_payload = {
        let mut guard = state.write().await;
        guard.servers_path = new_config.servers_file.clone();
        guard.password = new_config.password.clone();
        guard.last_config_mtime = mtime_cfg;
        guard.last_servers_mtime = mtime_srv;

        // Preserve existing runtime info for unchanged servers, update configs, add new ones
        let mut new_map = std::collections::HashMap::new();
        for server_cfg in new_config.servers {
            let key = server_cfg.name.clone();
            if let Some(mut existing) = guard.servers.remove(&key) {
                existing.config = server_cfg;
                new_map.insert(key, existing);
            } else {
                new_map.insert(key.clone(), ServerRuntime::new(server_cfg));
            }
        }
        guard.servers = new_map;
        guard.build_response()
    };

    let guard = state.read().await;
    let _ = guard.tx_events.send(AppEvent::ConfigReloaded(event_payload));
    info!("Successfully reloaded configuration (config: {}, servers: {})", config_path, servers_path);
    Ok(())
}

pub async fn check_all_now(state: SharedState) -> crate::state::ServersResponse {
    let configs: Vec<(String, ServerConfig)> = {
        let guard = state.read().await;
        guard.servers.iter().map(|(k, v)| (k.clone(), v.config.clone())).collect()
    };

    let mut tasks = Vec::new();
    for (key, cfg) in configs {
        let state_clone = state.clone();
        tasks.push(tokio::spawn(async move {
            let (status, latency, error) = check_server(&cfg).await;
            let ssh_res = if status != ServerStatusKind::Offline {
                fetch_all_ssh_data(&cfg).await.ok()
            } else {
                None
            };
            let mut guard = state_clone.write().await;
            if let Some(runtime) = guard.servers.get_mut(&key) {
                runtime.record_result(status, latency, error);
                if let Some(ssh) = ssh_res {
                    runtime.update_ssh_data(
                        ssh.metrics,
                        Some(ssh.docker),
                        Some(ssh.tmux),
                        Some(ssh.pm2),
                        Some(ssh.ports),
                    );
                }
                let cloned_runtime = runtime.clone();
                let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned_runtime));
            }
        }));
    }

    for task in tasks {
        let _ = task.await;
    }

    let guard = state.read().await;
    let response = guard.build_response();
    let _ = guard.tx_events.send(AppEvent::AllChecked(response.clone()));
    response
}

pub fn start_monitor_worker(state: SharedState) {
    tokio::spawn(async move {
        info!("Server monitoring background worker started");

        let mut ticker = tokio::time::interval(Duration::from_millis(1000));
        loop {
            ticker.tick().await;

            // 1. Check if config file or servers file was modified on disk (hot-reload)
            let (config_path, servers_path) = {
                let guard = state.read().await;
                (guard.config_path.clone(), guard.servers_path.clone())
            };

            let mut needs_reload = false;

            if Path::new(&config_path).exists() {
                if let Ok(metadata) = fs::metadata(&config_path) {
                    if let Ok(current_mtime) = metadata.modified() {
                        let guard = state.read().await;
                        if guard.last_config_mtime.map(|m| current_mtime > m).unwrap_or(false) {
                            needs_reload = true;
                        }
                    }
                }
            }

            if !needs_reload && Path::new(&servers_path).exists() {
                if let Ok(metadata) = fs::metadata(&servers_path) {
                    if let Ok(current_mtime) = metadata.modified() {
                        let guard = state.read().await;
                        if guard.last_servers_mtime.map(|m| current_mtime > m).unwrap_or(false) {
                            needs_reload = true;
                        }
                    }
                }
            }

            if needs_reload {
                info!("File change detected on disk (config or servers). Hot-reloading...");
                if let Err(e) = reload_config_from_disk(&state).await {
                    error!("Failed to hot-reload config: {}", e);
                }
            }

            // 2. Identify servers due for standard network checking
            let servers_to_check: Vec<(String, ServerConfig)> = {
                let guard = state.read().await;
                let now = Instant::now();
                guard
                    .servers
                    .iter()
                    .filter_map(|(k, v)| {
                        let is_due = match v.last_run_instant {
                            None => true,
                            Some(last) => now.duration_since(last).as_secs() >= v.config.interval_seconds,
                        };
                        if is_due {
                            Some((k.clone(), v.config.clone()))
                        } else {
                            None
                        }
                    })
                    .collect()
            };

            // 3. Dispatch network checks asynchronously without blocking the loop
            for (key, cfg) in servers_to_check {
                let state_clone = state.clone();
                tokio::spawn(async move {
                    let (status, latency, error) = check_server(&cfg).await;
                    let mut guard = state_clone.write().await;
                    if let Some(runtime) = guard.servers.get_mut(&key) {
                        runtime.record_result(status, latency, error);
                        let cloned_runtime = runtime.clone();
                        let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned_runtime));
                    }
                });
            }

            // 4. Background SSH Data Collection (Hardware, Docker, tmux) every 15s
            let ssh_candidates: Vec<(String, ServerConfig)> = {
                let guard = state.read().await;
                let now = Instant::now();
                guard
                    .servers
                    .iter()
                    .filter_map(|(k, v)| {
                        let is_due = match v.last_ssh_instant {
                            None => true,
                            Some(last) => now.duration_since(last).as_secs() >= 15,
                        };
                        if is_due && v.status != ServerStatusKind::Offline {
                            Some((k.clone(), v.config.clone()))
                        } else {
                            None
                        }
                    })
                    .collect()
            };

            for (key, cfg) in ssh_candidates {
                let state_clone = state.clone();
                tokio::spawn(async move {
                    if let Ok(data) = fetch_all_ssh_data(&cfg).await {
                        let mut guard = state_clone.write().await;
                        if let Some(runtime) = guard.servers.get_mut(&key) {
                            runtime.update_ssh_data(
                                data.metrics,
                                Some(data.docker),
                                Some(data.tmux),
                                Some(data.pm2),
                                Some(data.ports),
                            );
                            let cloned_runtime = runtime.clone();
                            let _ = guard.tx_events.send(AppEvent::ServerUpdated(cloned_runtime));
                        }
                    }
                });
            }
        }
    });
}

#[derive(serde::Deserialize)]
struct RawMetrics {
    cpu: crate::state::CpuMetrics,
    ram: crate::state::RamMetrics,
    disk: crate::state::DiskMetrics,
    network: crate::state::NetworkMetrics,
    uptime_seconds: u64,
}

pub async fn fetch_server_metrics(config: &ServerConfig) -> Result<ServerMetrics, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let script = r#"python3 -c '
import os, sys, json, time
cores = os.cpu_count() or 1
load1, load5, load15 = os.getloadavg()
try:
    with open("/proc/stat") as f:
        fields = [float(x) for x in f.readline().split()[1:8]]
        idle1, total1 = fields[3], sum(fields)
    time.sleep(0.12)
    with open("/proc/stat") as f:
        fields = [float(x) for x in f.readline().split()[1:8]]
        idle2, total2 = fields[3], sum(fields)
    idle_delta, total_delta = idle2 - idle1, total2 - total1
    cpu_percent = round(100.0 * (1.0 - idle_delta / max(1.0, total_delta)), 1)
except:
    cpu_percent = round(min(100.0, (load1 / cores) * 100), 1)

mem_total, mem_avail, mem_free = 0, 0, 0
swap_total, swap_free = 0, 0
with open("/proc/meminfo") as f:
    for line in f:
        if line.startswith("MemTotal:"): mem_total = int(line.split()[1]) // 1024
        elif line.startswith("MemAvailable:"): mem_avail = int(line.split()[1]) // 1024
        elif line.startswith("MemFree:"): mem_free = int(line.split()[1]) // 1024
        elif line.startswith("SwapTotal:"): swap_total = int(line.split()[1]) // 1024
        elif line.startswith("SwapFree:"): swap_free = int(line.split()[1]) // 1024
mem_used = mem_total - mem_avail
mem_pct = round(mem_used / max(1, mem_total) * 100, 1)
swap_used = max(0, swap_total - swap_free)
swap_pct = round(swap_used / max(1, swap_total) * 100, 1) if swap_total > 0 else 0.0

st = os.statvfs("/")
disk_total = round((st.f_blocks * st.f_frsize) / (1024**3), 1)
disk_free = round((st.f_bavail * st.f_frsize) / (1024**3), 1)
disk_used = round(disk_total - disk_free, 1)
disk_pct = round(disk_used / max(0.1, disk_total) * 100, 1)

rx_bytes, tx_bytes = 0, 0
with open("/proc/net/dev") as f:
    for line in f:
        if ":" in line:
            iface, data = line.split(":")
            iface = iface.strip()
            if iface not in ("lo",) and not iface.startswith("br-") and not iface.startswith("veth") and not iface.startswith("docker"):
                parts = data.split()
                rx_bytes += int(parts[0])
                tx_bytes += int(parts[1])

with open("/proc/uptime") as f:
    uptime_sec = int(float(f.readline().split()[0]))

print(json.dumps({
    "cpu": {"usage_percent": cpu_percent, "load_1": round(load1, 2), "load_5": round(load5, 2), "load_15": round(load15, 2), "cores": cores},
    "ram": {
        "total_mb": mem_total, "used_mb": mem_used, "available_mb": mem_avail, "usage_percent": mem_pct,
        "swap_total_mb": swap_total, "swap_used_mb": swap_used, "swap_free_mb": swap_free, "swap_usage_percent": swap_pct
    },
    "disk": {"total_gb": disk_total, "used_gb": disk_used, "free_gb": disk_free, "usage_percent": disk_pct, "mount": "/"},
    "network": {"rx_bytes": rx_bytes, "tx_bytes": tx_bytes, "rx_mb": round(rx_bytes / (1024**2), 1), "tx_mb": round(tx_bytes / (1024**2), 1)},
    "uptime_seconds": uptime_sec
}))
'"#;

    let mut cmd = prepare_ssh_cmd(port, &target, script);

    let output = tokio::time::timeout(Duration::from_secs(6), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to spawn SSH process: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("SSH error (code {:?}): {}", output.status.code(), err.trim()));
    }

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let json_line = stdout_str
        .lines()
        .find(|l| l.trim().starts_with('{') && l.trim().ends_with('}'))
        .ok_or_else(|| format!("Invalid metrics output from server: {}", stdout_str.trim()))?;

    let raw: RawMetrics = serde_json::from_str(json_line)
        .map_err(|e| format!("Failed to parse metrics JSON: {}. Output: {}", e, json_line))?;

    Ok(ServerMetrics {
        cpu: raw.cpu,
        ram: raw.ram,
        disk: raw.disk,
        network: raw.network,
        uptime_seconds: raw.uptime_seconds,
        fetched_at: Utc::now(),
    })
}

fn prepare_ssh_cmd(port: u16, target: &str, command_str: &str) -> Command {
    let mut cmd = Command::new("ssh");
    cmd.args([
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=4",
    ]);
    if Path::new("/Users/lcky/.ssh/id_ed25519").exists() {
        cmd.args(["-i", "/Users/lcky/.ssh/id_ed25519"]);
    }
    cmd.args(["-p", &port.to_string(), target, command_str]);
    cmd
}

#[derive(serde::Deserialize)]
struct RawDockerOutput {
    #[serde(default, rename = "ID")]
    id: String,
    #[serde(default, rename = "Names")]
    names: String,
    #[serde(default, rename = "Image")]
    image: String,
    #[serde(default, rename = "Status")]
    status: String,
    #[serde(default, rename = "State")]
    state: String,
    #[serde(default, rename = "Ports")]
    ports: String,
}

pub async fn fetch_server_docker(config: &ServerConfig) -> Result<Vec<DockerContainerInfo>, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let mut cmd = prepare_ssh_cmd(
        port,
        &target,
        "docker ps -a --format '{{json .}}' 2>/dev/null || true",
    );

    let output = tokio::time::timeout(Duration::from_secs(6), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to run SSH: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut containers = Vec::new();

    for line in stdout_str.lines() {
        let line = line.trim();
        if line.starts_with('{') && line.ends_with('}') {
            if let Ok(raw) = serde_json::from_str::<RawDockerOutput>(line) {
                containers.push(DockerContainerInfo {
                    id: raw.id,
                    name: raw.names,
                    image: raw.image,
                    status: raw.status,
                    state: raw.state,
                    ports: raw.ports,
                });
            }
        }
    }

    Ok(containers)
}

pub async fn fetch_server_tmux(config: &ServerConfig) -> Result<Vec<TmuxSessionInfo>, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let mut cmd = prepare_ssh_cmd(
        port,
        &target,
        "tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}' 2>/dev/null || true",
    );

    let output = tokio::time::timeout(Duration::from_secs(6), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to run SSH: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let mut sessions = Vec::new();

    for line in stdout_str.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("error") || line.starts_with("no server") {
            continue;
        }
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            let name = parts[0].to_string();
            let windows = parts[1].parse::<u32>().unwrap_or(1);
            let created = parts[2].to_string();
            let attached = parts[3] == "attached";

            sessions.push(TmuxSessionInfo {
                name,
                windows,
                created,
                attached,
            });
        }
    }

    Ok(sessions)
}

pub fn parse_pm2_output(stdout_str: &str) -> Vec<Pm2ProcessInfo> {
    let mut processes = Vec::new();

    let trimmed = stdout_str.trim();
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            if end > start {
                let json_slice = &trimmed[start..=end];
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(json_slice) {
                    if let Some(arr) = v.as_array() {
                        for item in arr {
                            let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                            let pm_id = item.get("pm_id").and_then(|id| id.as_u64()).unwrap_or(0) as u32;
                            let pid = item.get("pid").and_then(|p| p.as_u64()).map(|p| p as u32);

                            let (status, restarts, uptime_ms, cpu, memory_bytes) = if let Some(env) = item.get("pm2_env") {
                                let status = env.get("status").and_then(|s| s.as_str()).unwrap_or("unknown").to_string();
                                let restarts = env.get("restart_time").and_then(|r| r.as_u64()).unwrap_or(0) as u32;
                                let pm_uptime = env.get("pm_uptime").and_then(|u| u.as_u64());
                                let now_ms = Utc::now().timestamp_millis() as u64;
                                let uptime_ms = pm_uptime.and_then(|start_ms| {
                                    if now_ms >= start_ms {
                                        Some(now_ms - start_ms)
                                    } else {
                                        None
                                    }
                                });

                                let (cpu, mem) = if let Some(monit) = item.get("monit") {
                                    let c = monit.get("cpu").and_then(|c| c.as_f64()).unwrap_or(0.0);
                                    let m = monit.get("memory").and_then(|m| m.as_u64()).unwrap_or(0);
                                    (c, m)
                                } else {
                                    (0.0, 0)
                                };

                                (status, restarts, uptime_ms, cpu, mem)
                            } else {
                                ("unknown".to_string(), 0, None, 0.0, 0)
                            };

                            processes.push(Pm2ProcessInfo {
                                name,
                                pm_id,
                                status,
                                pid,
                                cpu,
                                memory_bytes,
                                restarts,
                                uptime_ms,
                            });
                        }
                    }
                }
            }
        }
    }

    processes
}

pub async fn fetch_server_pm2(config: &ServerConfig) -> Result<Vec<Pm2ProcessInfo>, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let mut cmd = prepare_ssh_cmd(
        port,
        &target,
        "pm2 jlist 2>/dev/null || npx --no-install pm2 jlist 2>/dev/null || true",
    );

    let output = tokio::time::timeout(Duration::from_secs(6), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to run SSH: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    Ok(parse_pm2_output(&stdout_str))
}

pub fn parse_ports_output(stdout_str: &str) -> Vec<PortInfo> {
    let mut ports = Vec::new();

    for line in stdout_str.lines() {
        let line = line.trim();
        if line.is_empty()
            || line.starts_with("Netid")
            || line.starts_with("Active")
            || line.starts_with("Proto")
        {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        let raw_proto = parts[0].to_lowercase();
        let proto = if raw_proto.starts_with("tcp") {
            "tcp".to_string()
        } else if raw_proto.starts_with("udp") {
            "udp".to_string()
        } else {
            continue;
        };

        // For ss output:
        // parts[0]: tcp/udp
        // parts[1]: LISTEN/UNCONN
        // parts[2]: Recv-Q
        // parts[3]: Send-Q
        // parts[4]: Local Address:Port
        // col 5: Peer Address:Port
        // col 6..: Process info: users:(("docker-proxy",pid=3811521,fd=8))
        let (state, local_addr) = if parts.len() >= 5
            && (parts[1] == "LISTEN"
                || parts[1] == "UNCONN"
                || parts[1] == "ESTAB"
                || parts[1] == "CLOSE-WAIT")
        {
            (parts[1].to_string(), parts[4].to_string())
        } else if parts.len() >= 4 && parts[3].contains(':') {
            // netstat fallback: proto recv send local_addr foreign_addr [state] [pid/prog]
            let st = if parts.len() > 5 && parts[5] == "LISTEN" {
                "LISTEN"
            } else if proto == "udp" {
                "UNCONN"
            } else {
                "LISTEN"
            };
            (st.to_string(), parts[3].to_string())
        } else if parts.len() >= 5 && parts[4].contains(':') {
            (parts[1].to_string(), parts[4].to_string())
        } else {
            continue;
        };

        let port = match local_addr.rfind(':') {
            Some(idx) => match local_addr[idx + 1..].parse::<u16>() {
                Ok(p) => p,
                Err(_) => continue,
            },
            None => continue,
        };

        let mut process_name = String::new();
        let mut pid: Option<u32> = None;

        if let Some(idx) = line.find("users:") {
            let sub = &line[idx + 6..];
            if let Some(first_quote) = sub.find('"') {
                let after_first_quote = &sub[first_quote + 1..];
                if let Some(second_quote) = after_first_quote.find('"') {
                    process_name = after_first_quote[..second_quote].to_string();
                }
            }
            if let Some(pid_idx) = sub.find("pid=") {
                let pid_sub = &sub[pid_idx + 4..];
                let digits: String = pid_sub.chars().take_while(|c| c.is_ascii_digit()).collect();
                pid = digits.parse::<u32>().ok();
            }
        } else if let Some(last) = parts.last() {
            if let Some(slash_idx) = last.find('/') {
                let pid_str = &last[..slash_idx];
                pid = pid_str.parse::<u32>().ok();
                process_name = last[slash_idx + 1..].to_string();
            }
        }

        if process_name.is_empty() {
            process_name = "-".to_string();
        }

        ports.push(PortInfo {
            proto,
            state,
            local_addr,
            port,
            process: process_name,
            pid,
        });
    }

    // Sort by port number ascending, then proto
    ports.sort_by(|a, b| a.port.cmp(&b.port).then_with(|| a.proto.cmp(&b.proto)));

    // Deduplicate exact matches
    ports.dedup_by(|a, b| {
        a.proto == b.proto && a.port == b.port && a.local_addr == b.local_addr && a.process == b.process
    });

    ports
}

pub async fn fetch_server_ports(config: &ServerConfig) -> Result<Vec<PortInfo>, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let mut cmd = prepare_ssh_cmd(
        port,
        &target,
        "ss -tulnp -H 2>/dev/null || ss -tulnp 2>/dev/null || netstat -tulnp 2>/dev/null || true",
    );

    let output = tokio::time::timeout(Duration::from_secs(6), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to run SSH: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    Ok(parse_ports_output(&stdout_str))
}

pub struct SshFullData {
    pub metrics: Option<ServerMetrics>,
    pub docker: Vec<DockerContainerInfo>,
    pub tmux: Vec<TmuxSessionInfo>,
    pub pm2: Vec<Pm2ProcessInfo>,
    pub ports: Vec<PortInfo>,
}

pub async fn fetch_all_ssh_data(config: &ServerConfig) -> Result<SshFullData, String> {
    let port = config.port.unwrap_or(8998);
    let host = &config.host;
    let target = format!("root@{}", host);

    let combined_script = r##"
python3 -c "
import os, sys, json, time
cores = os.cpu_count() or 1
load1, load5, load15 = os.getloadavg()
try:
    with open('/proc/stat') as f:
        fields = [float(x) for x in f.readline().split()[1:8]]
        idle1, total1 = fields[3], sum(fields)
    time.sleep(0.12)
    with open('/proc/stat') as f:
        fields = [float(x) for x in f.readline().split()[1:8]]
        idle2, total2 = fields[3], sum(fields)
    idle_delta, total_delta = idle2 - idle1, total2 - total1
    cpu_percent = round(100.0 * (1.0 - idle_delta / max(1.0, total_delta)), 1)
except:
    cpu_percent = round(min(100.0, (load1 / cores) * 100), 1)

mem_total, mem_avail, mem_free = 0, 0, 0
swap_total, swap_free = 0, 0
with open('/proc/meminfo') as f:
    for line in f:
        if line.startswith('MemTotal:'): mem_total = int(line.split()[1]) // 1024
        elif line.startswith('MemAvailable:'): mem_avail = int(line.split()[1]) // 1024
        elif line.startswith('MemFree:'): mem_free = int(line.split()[1]) // 1024
        elif line.startswith('SwapTotal:'): swap_total = int(line.split()[1]) // 1024
        elif line.startswith('SwapFree:'): swap_free = int(line.split()[1]) // 1024
mem_used = mem_total - mem_avail
mem_pct = round(mem_used / max(1, mem_total) * 100, 1)
swap_used = max(0, swap_total - swap_free)
swap_pct = round(swap_used / max(1, swap_total) * 100, 1) if swap_total > 0 else 0.0

st = os.statvfs('/')
disk_total = round((st.f_blocks * st.f_frsize) / (1024**3), 1)
disk_free = round((st.f_bavail * st.f_frsize) / (1024**3), 1)
disk_used = round(disk_total - disk_free, 1)
disk_pct = round(disk_used / max(0.1, disk_total) * 100, 1)

rx_bytes, tx_bytes = 0, 0
with open('/proc/net/dev') as f:
    for line in f:
        if ':' in line:
            iface, data = line.split(':')
            iface = iface.strip()
            if iface not in ('lo',) and not iface.startswith('br-') and not iface.startswith('veth') and not iface.startswith('docker'):
                parts = data.split()
                rx_bytes += int(parts[0])
                tx_bytes += int(parts[1])

with open('/proc/uptime') as f:
    uptime_sec = int(float(f.readline().split()[0]))

print(json.dumps({
    'cpu': {'usage_percent': cpu_percent, 'load_1': round(load1, 2), 'load_5': round(load5, 2), 'load_15': round(load15, 2), 'cores': cores},
    'ram': {
        'total_mb': mem_total, 'used_mb': mem_used, 'available_mb': mem_avail, 'usage_percent': mem_pct,
        'swap_total_mb': swap_total, 'swap_used_mb': swap_used, 'swap_free_mb': swap_free, 'swap_usage_percent': swap_pct
    },
    'disk': {'total_gb': disk_total, 'used_gb': disk_used, 'free_gb': disk_free, 'usage_percent': disk_pct, 'mount': '/'},
    'network': {'rx_bytes': rx_bytes, 'tx_bytes': tx_bytes, 'rx_mb': round(rx_bytes / (1024**2), 1), 'tx_mb': round(tx_bytes / (1024**2), 1)},
    'uptime_seconds': uptime_sec
}))
" 2>/dev/null || true
echo "===DOCKER==="
docker ps -a --format "{{json .}}" 2>/dev/null || true
echo "===TMUX==="
tmux list-sessions -F "#{session_name}|#{session_windows}|#{session_created}|#{?session_attached,attached,detached}" 2>/dev/null || true
echo "===PM2==="
pm2 jlist 2>/dev/null || npx --no-install pm2 jlist 2>/dev/null || true
echo "===PORTS==="
ss -tulnp -H 2>/dev/null || ss -tulnp 2>/dev/null || netstat -tulnp 2>/dev/null || true
"##;

    let mut cmd = prepare_ssh_cmd(port, &target, combined_script);

    let output = tokio::time::timeout(Duration::from_secs(8), cmd.output())
        .await
        .map_err(|_| format!("SSH timeout connecting to {}:{}", host, port))?
        .map_err(|e| format!("Failed to run SSH: {}", e))?;

    let stdout_str = String::from_utf8_lossy(&output.stdout);
    let parts: Vec<&str> = stdout_str.split("===DOCKER===").collect();
    let metrics_part = parts.get(0).unwrap_or(&"");
    let after_docker = parts.get(1).unwrap_or(&"");

    let docker_tmux_rest: Vec<&str> = after_docker.split("===TMUX===").collect();
    let docker_part = docker_tmux_rest.get(0).unwrap_or(&"");
    let after_tmux = docker_tmux_rest.get(1).unwrap_or(&"");

    let tmux_pm2_ports: Vec<&str> = after_tmux.split("===PM2===").collect();
    let tmux_part = tmux_pm2_ports.get(0).unwrap_or(&"");
    let after_pm2 = tmux_pm2_ports.get(1).unwrap_or(&"");

    let pm2_ports: Vec<&str> = after_pm2.split("===PORTS===").collect();
    let pm2_part = pm2_ports.get(0).unwrap_or(&"");
    let ports_part = pm2_ports.get(1).unwrap_or(&"");

    let metrics = metrics_part
        .lines()
        .find(|l| l.trim().starts_with('{') && l.trim().ends_with('}'))
        .and_then(|line| serde_json::from_str::<RawMetrics>(line).ok())
        .map(|raw| ServerMetrics {
            cpu: raw.cpu,
            ram: raw.ram,
            disk: raw.disk,
            network: raw.network,
            uptime_seconds: raw.uptime_seconds,
            fetched_at: Utc::now(),
        });

    let mut docker = Vec::new();
    for line in docker_part.lines() {
        let line = line.trim();
        if line.starts_with('{') && line.ends_with('}') {
            if let Ok(raw) = serde_json::from_str::<RawDockerOutput>(line) {
                docker.push(DockerContainerInfo {
                    id: raw.id,
                    name: raw.names,
                    image: raw.image,
                    status: raw.status,
                    state: raw.state,
                    ports: raw.ports,
                });
            }
        }
    }

    let mut tmux = Vec::new();
    for line in tmux_part.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("error") || line.starts_with("no server") {
            continue;
        }
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 4 {
            let name = parts[0].to_string();
            let windows = parts[1].parse::<u32>().unwrap_or(1);
            let created = parts[2].to_string();
            let attached = parts[3] == "attached";

            tmux.push(TmuxSessionInfo {
                name,
                windows,
                created,
                attached,
            });
        }
    }

    let pm2 = parse_pm2_output(pm2_part);
    let ports = parse_ports_output(ports_part);

    Ok(SshFullData {
        metrics,
        docker,
        tmux,
        pm2,
        ports,
    })
}

