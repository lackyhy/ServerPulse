use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckType {
    Ping,
    Tcp,
    Http,
    Https,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub name: String,
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    pub check_type: CheckType,
    #[serde(default = "default_expected_status")]
    pub expected_status: Option<u16>,
    #[serde(default = "default_interval")]
    pub interval_seconds: u64,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_expected_status() -> Option<u16> {
    Some(200)
}

fn default_interval() -> u64 {
    15
}

fn default_timeout() -> u64 {
    3000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConfig {
    #[serde(default = "default_ssh_key_path")]
    pub key_path: String,
    #[serde(default = "default_ssh_user")]
    pub user: String,
    #[serde(default = "default_ssh_timeout")]
    pub timeout_seconds: u64,
    #[serde(default = "default_ssh_poll_interval")]
    pub poll_interval_seconds: u64,
}

impl Default for SshConfig {
    fn default() -> Self {
        Self {
            key_path: default_ssh_key_path(),
            user: default_ssh_user(),
            timeout_seconds: default_ssh_timeout(),
            poll_interval_seconds: default_ssh_poll_interval(),
        }
    }
}

fn default_ssh_key_path() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    format!("{}/.ssh/id_ed25519", home)
}

fn default_ssh_user() -> String {
    "root".to_string()
}

fn default_ssh_timeout() -> u64 {
    6
}

fn default_ssh_poll_interval() -> u64 {
    15
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(default = "default_listen_port")]
    pub port: u16,
    #[serde(default = "default_listen_host")]
    pub host: String,
    #[serde(default = "default_servers_file")]
    pub servers_file: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub ssh: SshConfig,
    #[serde(default)]
    pub servers: Vec<ServerConfig>,
}

fn default_listen_port() -> u16 {
    3000
}

fn default_listen_host() -> String {
    "0.0.0.0".to_string()
}

fn default_servers_file() -> String {
    "servers.yaml".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServersOnlyWrapper {
    #[serde(default)]
    pub servers: Vec<ServerConfig>,
}

pub fn load_config<P: AsRef<Path>>(path: P) -> Result<AppConfig, Box<dyn std::error::Error + Send + Sync>> {
    let path_ref = path.as_ref();
    let mut config: AppConfig = if path_ref.exists() {
        let content = fs::read_to_string(path_ref)?;
        // Try parsing full AppConfig first
        if let Ok(cfg) = serde_yaml::from_str::<AppConfig>(&content) {
            cfg
        } else if let Ok(s_only) = serde_yaml::from_str::<ServersOnlyWrapper>(&content) {
            AppConfig {
                port: default_listen_port(),
                host: default_listen_host(),
                servers_file: default_servers_file(),
                password: None,
                ssh: SshConfig::default(),
                servers: s_only.servers,
            }
        } else {
            AppConfig {
                port: default_listen_port(),
                host: default_listen_host(),
                servers_file: default_servers_file(),
                password: None,
                ssh: SshConfig::default(),
                servers: Vec::new(),
            }
        }
    } else {
        AppConfig {
            port: default_listen_port(),
            host: default_listen_host(),
            servers_file: default_servers_file(),
            password: None,
            ssh: SshConfig::default(),
            servers: Vec::new(),
        }
    };

    // If config has a servers_file and servers is empty or servers_file exists, load from servers_file
    let s_path = Path::new(&config.servers_file);
    if s_path.exists() {
        if let Ok(s_content) = fs::read_to_string(s_path) {
            if let Ok(wrapper) = serde_yaml::from_str::<ServersOnlyWrapper>(&s_content) {
                if !wrapper.servers.is_empty() {
                    config.servers = wrapper.servers;
                }
            } else if let Ok(list) = serde_yaml::from_str::<Vec<ServerConfig>>(&s_content) {
                if !list.is_empty() {
                    config.servers = list;
                }
            }
        }
    }

    Ok(config)
}
