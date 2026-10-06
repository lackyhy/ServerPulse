use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime};
use tokio::sync::{broadcast, RwLock};

use crate::config::ServerConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatusKind {
    Online,
    Offline,
    Degraded,
    Pending,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPoint {
    pub timestamp: DateTime<Utc>,
    pub latency_ms: Option<f64>,
    pub status: ServerStatusKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuMetrics {
    pub usage_percent: f64,
    pub load_1: f64,
    pub load_5: f64,
    pub load_15: f64,
    pub cores: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RamMetrics {
    pub total_mb: u64,
    pub used_mb: u64,
    pub available_mb: u64,
    pub usage_percent: f64,
    #[serde(default)]
    pub swap_total_mb: u64,
    #[serde(default)]
    pub swap_used_mb: u64,
    #[serde(default)]
    pub swap_free_mb: u64,
    #[serde(default)]
    pub swap_usage_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMetrics {
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_percent: f64,
    pub mount: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkMetrics {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_mb: f64,
    pub tx_mb: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DockerContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmuxSessionInfo {
    pub name: String,
    pub windows: u32,
    pub created: String,
    pub attached: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortInfo {
    pub proto: String,
    pub state: String,
    pub local_addr: String,
    pub port: u16,
    pub process: String,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pm2ProcessInfo {
    pub name: String,
    pub pm_id: u32,
    pub status: String,
    pub pid: Option<u32>,
    pub cpu: f64,
    pub memory_bytes: u64,
    pub restarts: u32,
    pub uptime_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerMetrics {
    pub cpu: CpuMetrics,
    pub ram: RamMetrics,
    pub disk: DiskMetrics,
    pub network: NetworkMetrics,
    pub uptime_seconds: u64,
    pub fetched_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerRuntime {
    pub config: ServerConfig,
    pub status: ServerStatusKind,
    pub latency_ms: Option<f64>,
    pub last_checked: Option<DateTime<Utc>>,
    pub last_successful: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub history: Vec<HistoryPoint>,
    pub metrics: Option<ServerMetrics>,
    pub docker: Option<Vec<DockerContainerInfo>>,
    pub tmux: Option<Vec<TmuxSessionInfo>>,
    pub pm2: Option<Vec<Pm2ProcessInfo>>,
    pub ports: Option<Vec<PortInfo>>,
    #[serde(skip)]
    pub last_run_instant: Option<Instant>,
    #[serde(skip)]
    pub last_ssh_instant: Option<Instant>,
}

impl ServerRuntime {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            status: ServerStatusKind::Pending,
            latency_ms: None,
            last_checked: None,
            last_successful: None,
            error_message: None,
            history: Vec::new(),
            metrics: None,
            docker: None,
            tmux: None,
            pm2: None,
            ports: None,
            last_run_instant: None,
            last_ssh_instant: None,
        }
    }

    pub fn update_ssh_data(
        &mut self,
        metrics: Option<ServerMetrics>,
        docker: Option<Vec<DockerContainerInfo>>,
        tmux: Option<Vec<TmuxSessionInfo>>,
        pm2: Option<Vec<Pm2ProcessInfo>>,
        ports: Option<Vec<PortInfo>>,
    ) {
        if metrics.is_some() {
            self.metrics = metrics;
        }
        if docker.is_some() {
            self.docker = docker;
        }
        if tmux.is_some() {
            self.tmux = tmux;
        }
        if pm2.is_some() {
            self.pm2 = pm2;
        }
        if ports.is_some() {
            self.ports = ports;
        }
        self.last_ssh_instant = Some(Instant::now());
    }

    pub fn record_result(&mut self, status: ServerStatusKind, latency_ms: Option<f64>, error: Option<String>) {
        let now = Utc::now();
        self.status = status;
        self.latency_ms = latency_ms;
        self.error_message = error;
        self.last_checked = Some(now);
        self.last_run_instant = Some(Instant::now());

        if status == ServerStatusKind::Online {
            self.last_successful = Some(now);
        }

        // Keep last 25 historical points for sparklines
        self.history.push(HistoryPoint {
            timestamp: now,
            latency_ms,
            status,
        });
        if self.history.len() > 25 {
            self.history.remove(0);
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServersResponse {
    pub servers: Vec<ServerRuntime>,
    pub total: usize,
    pub online: usize,
    pub offline: usize,
    pub degraded: usize,
    pub pending: usize,
    pub avg_latency_ms: Option<f64>,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AppEvent {
    ServerUpdated(ServerRuntime),
    AllChecked(ServersResponse),
    ConfigReloaded(ServersResponse),
}

pub struct AppStateInner {
    pub servers: HashMap<String, ServerRuntime>,
    pub config_path: String,
    pub servers_path: String,
    pub password: Option<String>,
    pub last_config_mtime: Option<SystemTime>,
    pub last_servers_mtime: Option<SystemTime>,
    pub tx_events: broadcast::Sender<AppEvent>,
}

impl AppStateInner {
    pub fn build_response(&self) -> ServersResponse {
        let mut list: Vec<ServerRuntime> = self.servers.values().cloned().collect();
        // Sort stably by name
        list.sort_by(|a, b| a.config.name.cmp(&b.config.name));

        let total = list.len();
        let mut online = 0;
        let mut offline = 0;
        let mut degraded = 0;
        let mut pending = 0;
        let mut total_latency = 0.0;
        let mut latency_count = 0;

        for s in &list {
            match s.status {
                ServerStatusKind::Online => online += 1,
                ServerStatusKind::Offline => offline += 1,
                ServerStatusKind::Degraded => degraded += 1,
                ServerStatusKind::Pending => pending += 1,
            }
            if let Some(lat) = s.latency_ms {
                total_latency += lat;
                latency_count += 1;
            }
        }

        let avg_latency_ms = if latency_count > 0 {
            Some((total_latency / latency_count as f64 * 10.0).round() / 10.0)
        } else {
            None
        };

        ServersResponse {
            servers: list,
            total,
            online,
            offline,
            degraded,
            pending,
            avg_latency_ms,
            last_updated: Utc::now(),
        }
    }
}

pub type SharedState = Arc<RwLock<AppStateInner>>;
