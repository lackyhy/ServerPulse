export type CheckType = 'ping' | 'tcp' | 'http' | 'https';

export type ServerStatusKind = 'online' | 'offline' | 'degraded' | 'pending';

export interface ServerConfig {
  name: string;
  host: string;
  port?: number | null;
  check_type: CheckType;
  expected_status?: number | null;
  interval_seconds: number;
  timeout_ms: number;
}

export interface HistoryPoint {
  timestamp: string;
  latency_ms: number | null;
  status: ServerStatusKind;
}

export interface CpuMetrics {
  usage_percent: number;
  load_1: number;
  load_5: number;
  load_15: number;
  cores: number;
}

export interface RamMetrics {
  total_mb: number;
  used_mb: number;
  available_mb: number;
  usage_percent: number;
  swap_total_mb?: number;
  swap_used_mb?: number;
  swap_free_mb?: number;
  swap_usage_percent?: number;
}

export interface DiskMetrics {
  total_gb: number;
  used_gb: number;
  free_gb: number;
  usage_percent: number;
  mount: string;
}

export interface NetworkMetrics {
  rx_bytes: number;
  tx_bytes: number;
  rx_mb: number;
  tx_mb: number;
}

export interface ServerMetrics {
  cpu: CpuMetrics;
  ram: RamMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  uptime_seconds: number;
  fetched_at: string;
}

export interface DockerContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
}

export interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export interface Pm2ProcessInfo {
  name: string;
  pm_id: number;
  status: string;
  pid?: number | null;
  cpu: number;
  memory_bytes: number;
  restarts: number;
  uptime_ms?: number | null;
}

export interface PortInfo {
  proto: string;
  state: string;
  local_addr: string;
  port: number;
  process: string;
  pid?: number | null;
}

export interface ServerRuntime {
  config: ServerConfig;
  status: ServerStatusKind;
  latency_ms: number | null;
  last_checked: string | null;
  last_successful: string | null;
  error_message: string | null;
  history: HistoryPoint[];
  metrics?: ServerMetrics | null;
  docker?: DockerContainerInfo[] | null;
  tmux?: TmuxSessionInfo[] | null;
  pm2?: Pm2ProcessInfo[] | null;
  ports?: PortInfo[] | null;
}

export interface ServersResponse {
  servers: ServerRuntime[];
  total: number;
  online: number;
  offline: number;
  degraded: number;
  pending: number;
  avg_latency_ms: number | null;
  last_updated: string;
}

export interface PingResult {
  host: string;
  latency_ms: number | null;
  status: ServerStatusKind;
  error?: string | null;
}

export type AppEvent =
  | { type: 'ServerUpdated'; payload: ServerRuntime }
  | { type: 'AllChecked'; payload: ServersResponse }
  | { type: 'ConfigReloaded'; payload: ServersResponse };
