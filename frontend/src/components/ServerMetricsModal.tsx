import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  RefreshCw,
  Cpu,
  Database,
  HardDrive,
  Activity,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  AlertTriangle,
  Boxes,
  Terminal,
  Layers,
  CheckCircle2,
  XCircle,
  Radio,
  Search,
  Copy,
  Check,
  Globe,
  Lock,
  RotateCw,
} from 'lucide-react';
import type {
  ServerRuntime,
  ServerMetrics,
  DockerContainerInfo,
  TmuxSessionInfo,
  Pm2ProcessInfo,
  PortInfo,
} from '../types';
import {
  fetchServerMetrics,
  fetchServerDocker,
  fetchServerTmux,
  fetchServerPm2,
  fetchServerPorts,
} from '../api';

interface ServerMetricsModalProps {
  server: ServerRuntime;
  onClose: () => void;
  initialTab?: TabType;
}

type TabType = 'metrics' | 'docker' | 'tmux' | 'pm2' | 'ports';

export const ServerMetricsModal: React.FC<ServerMetricsModalProps> = ({
  server,
  onClose,
  initialTab = 'metrics',
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);

  // Metrics state
  const [metrics, setMetrics] = useState<ServerMetrics | null>(server.metrics || null);
  const [metricsLoading, setMetricsLoading] = useState<boolean>(!server.metrics);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Docker state
  const [dockerContainers, setDockerContainers] = useState<DockerContainerInfo[] | null>(
    server.docker || null
  );
  const [dockerLoading, setDockerLoading] = useState<boolean>(false);
  const [dockerError, setDockerError] = useState<string | null>(null);

  // Tmux state
  const [tmuxSessions, setTmuxSessions] = useState<TmuxSessionInfo[] | null>(
    server.tmux || null
  );
  const [tmuxLoading, setTmuxLoading] = useState<boolean>(false);
  const [tmuxError, setTmuxError] = useState<string | null>(null);

  // PM2 state
  const [pm2Processes, setPm2Processes] = useState<Pm2ProcessInfo[] | null>(
    server.pm2 || null
  );
  const [pm2Loading, setPm2Loading] = useState<boolean>(false);
  const [pm2Error, setPm2Error] = useState<string | null>(null);

  // Ports state (ss -tulnp)
  const [ports, setPorts] = useState<PortInfo[] | null>(server.ports || null);
  const [portsLoading, setPortsLoading] = useState<boolean>(false);
  const [portsError, setPortsError] = useState<string | null>(null);
  const [portFilter, setPortFilter] = useState<'all' | 'tcp' | 'udp'>('all');
  const [portSearch, setPortSearch] = useState<string>('');
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const data = await fetchServerMetrics(server.config.name);
      setMetrics(data);
    } catch (err: any) {
      setMetricsError(err.message || 'Не удалось получить метрики по SSH');
    } finally {
      setMetricsLoading(false);
    }
  }, [server.config.name]);

  const loadDocker = useCallback(async () => {
    try {
      setDockerLoading(true);
      setDockerError(null);
      const data = await fetchServerDocker(server.config.name);
      setDockerContainers(data);
    } catch (err: any) {
      setDockerError(err.message || 'Не удалось получить список контейнеров Docker');
    } finally {
      setDockerLoading(false);
    }
  }, [server.config.name]);

  const loadTmux = useCallback(async () => {
    try {
      setTmuxLoading(true);
      setTmuxError(null);
      const data = await fetchServerTmux(server.config.name);
      setTmuxSessions(data);
    } catch (err: any) {
      setTmuxError(err.message || 'Не удалось получить сессии tmux');
    } finally {
      setTmuxLoading(false);
    }
  }, [server.config.name]);

  const loadPm2 = useCallback(async () => {
    try {
      setPm2Loading(true);
      setPm2Error(null);
      const data = await fetchServerPm2(server.config.name);
      setPm2Processes(data);
    } catch (err: any) {
      setPm2Error(err.message || 'Не удалось получить процессы PM2');
    } finally {
      setPm2Loading(false);
    }
  }, [server.config.name]);

  const loadPorts = useCallback(async () => {
    try {
      setPortsLoading(true);
      setPortsError(null);
      const data = await fetchServerPorts(server.config.name);
      setPorts(data);
    } catch (err: any) {
      setPortsError(err.message || 'Не удалось получить список портов (ss -tulnp)');
    } finally {
      setPortsLoading(false);
    }
  }, [server.config.name]);

  // Initial load
  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // Load tab data on switch if not already loaded
  useEffect(() => {
    if (activeTab === 'docker' && dockerContainers === null && !dockerLoading) {
      loadDocker();
    } else if (activeTab === 'tmux' && tmuxSessions === null && !tmuxLoading) {
      loadTmux();
    } else if (activeTab === 'pm2' && pm2Processes === null && !pm2Loading) {
      loadPm2();
    } else if (activeTab === 'ports' && ports === null && !portsLoading) {
      loadPorts();
    }
  }, [activeTab, dockerContainers, dockerLoading, tmuxSessions, tmuxLoading, pm2Processes, pm2Loading, ports, portsLoading, loadDocker, loadTmux, loadPm2, loadPorts]);

  // Auto-refresh interval (for metrics)
  useEffect(() => {
    if (!autoRefresh || activeTab !== 'metrics') return;
    const interval = setInterval(() => {
      loadMetrics();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, loadMetrics]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days} дн. ${hours} ч. ${mins} мин.`;
  };

  const getMeterColor = (pct: number) => {
    if (pct < 60) return '#10b981';
    if (pct < 85) return '#f59e0b';
    return '#f43f5e';
  };

  const formatBytes = (bytes: number) => {
    if (bytes >= 1024 ** 4) return (bytes / 1024 ** 4).toFixed(2) + ' TB';
    if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + ' GB';
    if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  const formatTimestamp = (ts: string) => {
    const num = parseInt(ts, 10);
    if (!isNaN(num) && num > 1000000000) {
      return new Date(num * 1000).toLocaleString();
    }
    return ts || '—';
  };

  const filteredPorts = (ports || []).filter((p) => {
    if (portFilter === 'tcp' && !p.proto.toLowerCase().includes('tcp')) return false;
    if (portFilter === 'udp' && !p.proto.toLowerCase().includes('udp')) return false;
    if (portSearch.trim()) {
      const q = portSearch.toLowerCase().trim();
      const matchPort = p.port.toString().includes(q);
      const matchProcess = p.process.toLowerCase().includes(q);
      const matchAddr = p.local_addr.toLowerCase().includes(q);
      const matchPid = p.pid ? p.pid.toString().includes(q) : false;
      return matchPort || matchProcess || matchAddr || matchPid;
    }
    return true;
  });

  const tcpCount = (ports || []).filter((p) => p.proto.toLowerCase().includes('tcp')).length;
  const udpCount = (ports || []).filter((p) => p.proto.toLowerCase().includes('udp')).length;
  const totalCount = (ports || []).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '880px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '28px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          animation: 'fadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
            borderBottom: '1px solid var(--border-color)',
            paddingBottom: '18px',
            marginBottom: '20px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ffffff' }}>
                {server.config.name}
              </h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  color: 'var(--text-muted)',
                }}
              >
                {server.config.host}:{server.config.port || 8998}
              </span>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              SSH управление &bull; Мониторинг ресурсов, контейнеров и сессий
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => {
                if (activeTab === 'metrics') loadMetrics();
                else if (activeTab === 'docker') loadDocker();
                else if (activeTab === 'tmux') loadTmux();
                else if (activeTab === 'pm2') loadPm2();
                else if (activeTab === 'ports') loadPorts();
              }}
              disabled={metricsLoading || dockerLoading || tmuxLoading || pm2Loading || portsLoading}
              className="btn-secondary"
              title="Обновить данные"
            >
              <RefreshCw
                size={15}
                className={
                  metricsLoading || dockerLoading || tmuxLoading || pm2Loading || portsLoading ? 'spin' : ''
                }
              />
              <span>Обновить</span>
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Закрыть (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation: Metrics | Docker | tmux | Ports */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
            paddingBottom: '12px',
          }}
        >
          <button
            onClick={() => setActiveTab('metrics')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === 'metrics' ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid transparent',
              background: activeTab === 'metrics' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeTab === 'metrics' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Layers size={16} color={activeTab === 'metrics' ? '#818cf8' : 'var(--text-dim)'} />
            <span>Железо (ЦП, ОЗУ, Диск, Сеть)</span>
          </button>

          <button
            onClick={() => setActiveTab('docker')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === 'docker' ? '1px solid rgba(14, 165, 233, 0.5)' : '1px solid transparent',
              background: activeTab === 'docker' ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
              color: activeTab === 'docker' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Boxes size={16} color={activeTab === 'docker' ? '#38bdf8' : 'var(--text-dim)'} />
            <span>Docker</span>
            {dockerContainers && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.2)',
                  color: '#38bdf8',
                }}
              >
                {dockerContainers.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('tmux')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === 'tmux' ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid transparent',
              background: activeTab === 'tmux' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
              color: activeTab === 'tmux' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Terminal size={16} color={activeTab === 'tmux' ? '#34d399' : 'var(--text-dim)'} />
            <span>tmux</span>
            {tmuxSessions && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(52, 211, 153, 0.2)',
                  color: '#34d399',
                }}
              >
                {tmuxSessions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('pm2')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === 'pm2' ? '1px solid rgba(168, 85, 247, 0.5)' : '1px solid transparent',
              background: activeTab === 'pm2' ? 'rgba(168, 85, 247, 0.15)' : 'transparent',
              color: activeTab === 'pm2' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCw size={16} color={activeTab === 'pm2' ? '#c084fc' : 'var(--text-dim)'} />
            <span>PM2</span>
            {pm2Processes && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(168, 85, 247, 0.2)',
                  color: '#c084fc',
                }}
              >
                {pm2Processes.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('ports')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              border: activeTab === 'ports' ? '1px solid rgba(245, 158, 11, 0.5)' : '1px solid transparent',
              background: activeTab === 'ports' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
              color: activeTab === 'ports' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <Radio size={16} color={activeTab === 'ports' ? '#fbbf24' : 'var(--text-dim)'} />
            <span>Порты</span>
            {ports && (
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#fbbf24',
                }}
              >
                {ports.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: HARDWARE METRICS */}
        {activeTab === 'metrics' && (
          <div>
            {/* Top Status & Controls Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px',
                fontSize: '0.82rem',
                color: 'var(--text-dim)',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {metrics && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                  <Clock size={14} color="#818cf8" />
                  <span>Аптайм (Uptime):</span>
                  <strong style={{ color: '#ffffff' }}>{formatUptime(metrics.uptime_seconds)}</strong>
                </div>
              )}

              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  style={{ accentColor: '#6366f1', cursor: 'pointer' }}
                />
                <span>Авто-обновление каждые 4 сек</span>
              </label>
            </div>

            {/* Error Alert */}
            {metricsError && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Ошибка опроса SSH:</strong>
                  <div style={{ marginTop: '2px', wordBreak: 'break-word' }}>{metricsError}</div>
                </div>
              </div>
            )}

            {/* Metrics Grid */}
            {metricsLoading && !metrics ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="status-dot status-dot-pending pulse-ring" style={{ margin: '0 auto 16px', width: '16px', height: '16px' }} />
                <p>Подключение по SSH и считывание системных данных...</p>
              </div>
            ) : metrics ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: '20px',
                }}
              >
                {/* 1. CPU Card */}
                <div
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                        <Cpu size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>Процессор (ЦП)</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {metrics.cpu.cores} {metrics.cpu.cores === 1 ? 'ядро' : 'ядер'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: getMeterColor(metrics.cpu.usage_percent) }}>
                      {metrics.cpu.usage_percent}%
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, metrics.cpu.usage_percent)}%`,
                        height: '100%',
                        backgroundColor: getMeterColor(metrics.cpu.usage_percent),
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Load Average:</span>
                    <span style={{ fontFamily: 'JetBrains Mono', color: 'var(--text-main)' }}>
                      1м: <strong>{metrics.cpu.load_1}</strong> &bull; 5м: <strong>{metrics.cpu.load_5}</strong> &bull; 15м: <strong>{metrics.cpu.load_15}</strong>
                    </span>
                  </div>
                </div>

                {/* 2. RAM Card */}
                <div
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                        <Database size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>Оперативная память (ОЗУ)</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {(metrics.ram.used_mb / 1024).toFixed(2)} GB из {(metrics.ram.total_mb / 1024).toFixed(2)} GB
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: getMeterColor(metrics.ram.usage_percent) }}>
                      {metrics.ram.usage_percent}%
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, metrics.ram.usage_percent)}%`,
                        height: '100%',
                        backgroundColor: getMeterColor(metrics.ram.usage_percent),
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Доступно:</span>
                    <span style={{ fontFamily: 'JetBrains Mono', color: '#34d399' }}>
                      <strong>{(metrics.ram.available_mb / 1024).toFixed(2)} GB</strong> свободно
                    </span>
                  </div>

                  {/* SWAP Memory Section */}
                  <div
                    style={{
                      marginTop: '14px',
                      paddingTop: '12px',
                      borderTop: '1px dashed rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: metrics.ram.swap_total_mb && metrics.ram.swap_total_mb > 0 ? '#38bdf8' : 'var(--text-dim)',
                          }}
                        />
                        <span>SWAP (Подкачка):</span>
                      </span>

                      {metrics.ram.swap_total_mb && metrics.ram.swap_total_mb > 0 ? (
                        <span
                          style={{
                            fontSize: '0.82rem',
                            fontFamily: 'JetBrains Mono',
                            fontWeight: 600,
                            color: getMeterColor(metrics.ram.swap_usage_percent || 0),
                          }}
                        >
                          {metrics.ram.swap_usage_percent}% ({metrics.ram.swap_used_mb} MB из {metrics.ram.swap_total_mb} MB)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          Отключен (0 MB)
                        </span>
                      )}
                    </div>

                    {metrics.ram.swap_total_mb && metrics.ram.swap_total_mb > 0 && (
                      <>
                        <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${Math.min(100, metrics.ram.swap_usage_percent || 0)}%`,
                              height: '100%',
                              backgroundColor: getMeterColor(metrics.ram.swap_usage_percent || 0),
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                          Свободно SWAP: {metrics.ram.swap_free_mb} MB
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 3. Disk Card */}
                <div
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                        <HardDrive size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>Дисковое хранилище (ДИСК)</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          Раздел {metrics.disk.mount} ({metrics.disk.used_gb} GB из {metrics.disk.total_gb} GB)
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: getMeterColor(metrics.disk.usage_percent) }}>
                      {metrics.disk.usage_percent}%
                    </div>
                  </div>

                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, metrics.disk.usage_percent)}%`,
                        height: '100%',
                        backgroundColor: getMeterColor(metrics.disk.usage_percent),
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>

                  <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    <span>Свободное место:</span>
                    <span style={{ fontFamily: 'JetBrains Mono', color: '#fbbf24' }}>
                      <strong>{metrics.disk.free_gb} GB</strong> доступно
                    </span>
                  </div>
                </div>

                {/* 4. Network Card */}
                <div
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
                        <Activity size={18} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>Сетевой трафик (СЕТЬ)</h3>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          Суммарный объем переданных данных
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <ArrowDownCircle size={14} color="#34d399" />
                        <span>Входящий (RX)</span>
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: '#34d399', marginTop: '4px' }}>
                        {formatBytes(metrics.network.rx_bytes)}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <ArrowUpCircle size={14} color="#60a5fa" />
                        <span>Исходящий (TX)</span>
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'JetBrains Mono', color: '#60a5fa', marginTop: '4px' }}>
                        {formatBytes(metrics.network.tx_bytes)}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: '14px', fontSize: '0.72rem', color: 'var(--text-dim)', textAlign: 'right' }}>
                    Обновлено: {new Date(metrics.fetched_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 2: DOCKER CONTAINERS */}
        {activeTab === 'docker' && (
          <div>
            {dockerError && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Ошибка Docker:</strong>
                  <div style={{ marginTop: '2px' }}>{dockerError}</div>
                </div>
              </div>
            )}

            {dockerLoading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="status-dot status-dot-pending pulse-ring" style={{ margin: '0 auto 16px', width: '16px', height: '16px' }} />
                <p>Получение списка контейнеров Docker через SSH...</p>
              </div>
            ) : !dockerContainers || dockerContainers.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '50px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <Boxes size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <h3 style={{ color: 'var(--text-main)', fontSize: '1.05rem', marginBottom: '6px' }}>
                  Нет запущенных контейнеров
                </h3>
                <p style={{ fontSize: '0.85rem' }}>
                  На этом сервере нет активных Docker контейнеров или демон Docker не установлен/не запущен.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Всего контейнеров: <strong style={{ color: '#ffffff' }}>{dockerContainers.length}</strong>
                </div>

                {dockerContainers.map((c) => {
                  const isRunning = c.state === 'running' || c.status.toLowerCase().includes('up');

                  return (
                    <div
                      key={c.id || c.name}
                      className="glass-panel"
                      style={{
                        padding: '16px 20px',
                        border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            className={`status-dot ${isRunning ? 'status-dot-online pulse-ring' : 'status-dot-offline'}`}
                          />
                          <span style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff' }}>
                            {c.name}
                          </span>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontFamily: 'JetBrains Mono',
                              color: 'var(--text-dim)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {c.id.substring(0, 12)}
                          </span>
                        </div>

                        <span
                          className={`badge-status ${isRunning ? 'status-online' : 'status-offline'}`}
                        >
                          {isRunning ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {c.status}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '16px',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                          flexWrap: 'wrap',
                          marginTop: '4px',
                        }}
                      >
                        <div>
                          <span style={{ color: 'var(--text-dim)' }}>Образ: </span>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#c7d2fe' }}>{c.image}</span>
                        </div>
                        {c.ports && (
                          <div>
                            <span style={{ color: 'var(--text-dim)' }}>Порты: </span>
                            <span style={{ fontFamily: 'JetBrains Mono', color: '#34d399' }}>{c.ports}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TMUX SESSIONS */}
        {activeTab === 'tmux' && (
          <div>
            {tmuxError && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Ошибка tmux:</strong>
                  <div style={{ marginTop: '2px' }}>{tmuxError}</div>
                </div>
              </div>
            )}

            {tmuxLoading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="status-dot status-dot-pending pulse-ring" style={{ margin: '0 auto 16px', width: '16px', height: '16px' }} />
                <p>Запрос списка сессий tmux через SSH...</p>
              </div>
            ) : !tmuxSessions || tmuxSessions.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '50px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <Terminal size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <h3 style={{ color: 'var(--text-main)', fontSize: '1.05rem', marginBottom: '6px' }}>
                  Нет активных сессий tmux
                </h3>
                <p style={{ fontSize: '0.85rem' }}>
                  На этом сервере сервер tmux не запущен или нет открытых сессий.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Активных сессий: <strong style={{ color: '#ffffff' }}>{tmuxSessions.length}</strong>
                </div>

                {tmuxSessions.map((s) => (
                  <div
                    key={s.name}
                    className="glass-panel"
                    style={{
                      padding: '16px 20px',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          padding: '8px',
                          borderRadius: '8px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                        }}
                      >
                        <Terminal size={18} />
                      </div>
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          Создана: {formatTimestamp(s.created)}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontFamily: 'JetBrains Mono',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {s.windows} {s.windows === 1 ? 'окно' : 'окон'}
                      </span>

                      <span
                        className={`badge-status ${s.attached ? 'status-online' : 'status-pending'}`}
                      >
                        {s.attached ? 'Подключена (attached)' : 'В фоне (detached)'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: PM2 PROCESSES */}
        {activeTab === 'pm2' && (
          <div>
            {pm2Error && (
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  marginBottom: '20px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Ошибка PM2:</strong>
                  <div style={{ marginTop: '2px' }}>{pm2Error}</div>
                </div>
              </div>
            )}

            {pm2Loading ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="status-dot status-dot-pending pulse-ring" style={{ margin: '0 auto 16px', width: '16px', height: '16px' }} />
                <p>Запрос списка процессов PM2 по SSH (pm2 jlist)...</p>
              </div>
            ) : !pm2Processes || pm2Processes.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '50px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <RotateCw size={40} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <h3 style={{ color: 'var(--text-main)', fontSize: '1.05rem', marginBottom: '6px' }}>
                  Нет запущенных процессов PM2
                </h3>
                <p style={{ fontSize: '0.85rem' }}>
                  На этом сервере PM2 не установлен или список процессов пуст.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                    Всего процессов: <strong style={{ color: '#ffffff' }}>{pm2Processes.length}</strong>
                    {' &bull; '}
                    Online:{' '}
                    <strong style={{ color: '#10b981' }}>
                      {pm2Processes.filter((p) => p.status === 'online').length}
                    </strong>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontFamily: 'JetBrains Mono',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: 'rgba(168, 85, 247, 0.1)',
                      color: '#c084fc',
                      border: '1px solid rgba(168, 85, 247, 0.25)',
                    }}
                  >
                    pm2 status
                  </span>
                </div>

                {pm2Processes.map((proc) => {
                  const isOnline = proc.status === 'online';
                  const isErrored = proc.status === 'errored';

                  const badgeClass = isOnline
                    ? 'status-online'
                    : isErrored
                    ? 'status-offline'
                    : 'status-pending';

                  const uptimeFormatted = proc.uptime_ms != null
                    ? formatUptime(Math.floor(proc.uptime_ms / 1000))
                    : '—';

                  return (
                    <div
                      key={`${proc.pm_id}-${proc.name}`}
                      className="glass-panel"
                      style={{
                        padding: '16px 20px',
                        border: isOnline
                          ? '1px solid rgba(168, 85, 247, 0.25)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '14px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '220px' }}>
                        <div
                          style={{
                            padding: '8px',
                            borderRadius: '8px',
                            background: isOnline ? 'rgba(168, 85, 247, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            color: isOnline ? '#c084fc' : 'var(--text-dim)',
                          }}
                        >
                          <RotateCw size={18} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
                              {proc.name}
                            </span>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontFamily: 'JetBrains Mono',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                color: 'var(--text-muted)',
                              }}
                            >
                              id: {proc.pm_id}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '3px' }}>
                            PID: <strong style={{ color: 'var(--text-muted)' }}>{proc.pid ?? '—'}</strong>
                            {' &bull; '}
                            Аптайм: {uptimeFormatted}
                          </div>
                        </div>
                      </div>

                      {/* Stats & status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontFamily: 'JetBrains Mono',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-muted)',
                            }}
                            title="Использование CPU"
                          >
                            CPU: <strong style={{ color: '#ffffff' }}>{proc.cpu.toFixed(1)}%</strong>
                          </span>

                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontFamily: 'JetBrains Mono',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: 'var(--text-muted)',
                            }}
                            title="Оперативная память"
                          >
                            RAM: <strong style={{ color: '#ffffff' }}>{formatBytes(proc.memory_bytes)}</strong>
                          </span>

                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontFamily: 'JetBrains Mono',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              color: proc.restarts > 5 ? '#f59e0b' : 'var(--text-muted)',
                            }}
                            title="Количество перезапусков"
                          >
                            ↺ {proc.restarts}
                          </span>
                        </div>

                        <span className={`badge-status ${badgeClass}`}>
                          {proc.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PORTS (ss -tulnp) */}
        {activeTab === 'ports' && (
          <div>
            {/* Top Toolbar: Filter pills (Все | TCP | UDP) + Search + info badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '18px',
              }}
            >
              {/* Protocol Filters: Все | TCP | UDP */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  gap: '4px',
                }}
              >
                <button
                  onClick={() => setPortFilter('all')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: portFilter === 'all' ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                    color: portFilter === 'all' ? '#ffffff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Все ({totalCount})
                </button>
                <button
                  onClick={() => setPortFilter('tcp')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: portFilter === 'tcp' ? 'rgba(56, 189, 248, 0.3)' : 'transparent',
                    color: portFilter === 'tcp' ? '#38bdf8' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  TCP ({tcpCount})
                </button>
                <button
                  onClick={() => setPortFilter('udp')}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                    background: portFilter === 'udp' ? 'rgba(168, 85, 247, 0.3)' : 'transparent',
                    color: portFilter === 'udp' ? '#c084fc' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  UDP ({udpCount})
                </button>
              </div>

              {/* Search & ss command badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flex: '1',
                  minWidth: '240px',
                  justifyContent: 'flex-end',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    flex: '1',
                    maxWidth: '320px',
                  }}
                >
                  <Search size={14} color="var(--text-dim)" />
                  <input
                    type="text"
                    placeholder="Поиск по порту, процессу..."
                    value={portSearch}
                    onChange={(e) => setPortSearch(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      width: '100%',
                    }}
                  />
                  {portSearch && (
                    <button
                      onClick={() => setPortSearch('')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <span
                  style={{
                    fontSize: '0.72rem',
                    fontFamily: 'JetBrains Mono, monospace',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--text-dim)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Команда сбора: ss -tulnp"
                >
                  ss -tulnp
                </span>
              </div>
            </div>

            {/* Error banner */}
            {portsError && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle size={16} />
                  <span>{portsError}</span>
                </div>
                <button
                  onClick={loadPorts}
                  className="btn-secondary"
                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                >
                  Повторить
                </button>
              </div>
            )}

            {/* Loading */}
            {portsLoading && !ports ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '50px 20px',
                  color: 'var(--text-muted)',
                }}
              >
                <RefreshCw
                  size={28}
                  className="spin"
                  color="#fbbf24"
                  style={{ marginBottom: '12px' }}
                />
                <span>Опрос открытых сокетов через SSH (ss -tulnp)...</span>
              </div>
            ) : !ports || filteredPorts.length === 0 ? (
              <div
                className="glass-panel"
                style={{
                  padding: '45px 20px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <Radio size={36} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
                <h3 style={{ color: '#ffffff', fontSize: '1.05rem', marginBottom: '6px' }}>
                  {portSearch || portFilter !== 'all'
                    ? 'Порты не найдены'
                    : 'Нет активных прослушиваемых портов'}
                </h3>
                <p style={{ fontSize: '0.82rem' }}>
                  {portSearch || portFilter !== 'all'
                    ? 'Попробуйте сбросить фильтр или изменить строку поиска'
                    : 'Команда ss -tulnp не вернула слушающих сокетов'}
                </p>
                {(portSearch || portFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setPortFilter('all');
                      setPortSearch('');
                    }}
                    className="btn-secondary"
                    style={{ marginTop: '14px', fontSize: '0.8rem' }}
                  >
                    Сбросить фильтры
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    marginBottom: '4px',
                    padding: '0 4px',
                  }}
                >
                  <span>
                    Найдено портов: <strong style={{ color: '#ffffff' }}>{filteredPorts.length}</strong>
                    {portFilter !== 'all' && ` (фильтр: ${portFilter.toUpperCase()})`}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    Нажмите Копия для сохранения host:port
                  </span>
                </div>

                {filteredPorts.map((p, idx) => {
                  const isTcp = p.proto.toLowerCase().includes('tcp');
                  const isLocalhost =
                    p.local_addr.startsWith('127.') ||
                    p.local_addr.startsWith('[::1]') ||
                    p.local_addr.includes('localhost');
                  const copyText = `${server.config.host}:${p.port}`;
                  const isCopied = copiedItem === copyText;

                  return (
                    <div
                      key={`${p.proto}-${p.port}-${p.local_addr}-${idx}`}
                      className="glass-panel"
                      style={{
                        padding: '12px 16px',
                        border: isTcp
                          ? '1px solid rgba(56, 189, 248, 0.2)'
                          : '1px solid rgba(168, 85, 247, 0.2)',
                        background: 'rgba(15, 23, 42, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        transition: 'border-color 0.15s ease',
                      }}
                    >
                      {/* Left: Proto + Port + Bind Address */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Protocol badge */}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            textTransform: 'uppercase',
                            fontFamily: 'JetBrains Mono, monospace',
                            background: isTcp
                              ? 'rgba(56, 189, 248, 0.15)'
                              : 'rgba(168, 85, 247, 0.15)',
                            color: isTcp ? '#38bdf8' : '#c084fc',
                            border: isTcp
                              ? '1px solid rgba(56, 189, 248, 0.35)'
                              : '1px solid rgba(168, 85, 247, 0.35)',
                          }}
                        >
                          {p.proto.toUpperCase()}
                        </span>

                        {/* Port Number */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '1.2rem',
                              fontWeight: 700,
                              fontFamily: 'JetBrains Mono, monospace',
                              color: '#ffffff',
                              letterSpacing: '-0.02em',
                            }}
                          >
                            :{p.port}
                          </span>
                        </div>

                        {/* Local Address & Bind Scope */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '0.8rem',
                              fontFamily: 'JetBrains Mono, monospace',
                              color: 'var(--text-muted)',
                              background: 'rgba(255, 255, 255, 0.04)',
                              padding: '2px 8px',
                              borderRadius: '5px',
                            }}
                            title={`Локальный адрес привязки: ${p.local_addr}`}
                          >
                            {p.local_addr}
                          </span>

                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 500,
                              padding: '2px 7px',
                              borderRadius: '10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: isLocalhost
                                ? 'rgba(148, 163, 184, 0.12)'
                                : 'rgba(16, 185, 129, 0.12)',
                              color: isLocalhost ? '#94a3b8' : '#34d399',
                              border: isLocalhost
                                ? '1px solid rgba(148, 163, 184, 0.25)'
                                : '1px solid rgba(16, 185, 129, 0.25)',
                            }}
                          >
                            {isLocalhost ? (
                              <>
                                <Lock size={10} /> Localhost
                              </>
                            ) : (
                              <>
                                <Globe size={10} /> 0.0.0.0
                              </>
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Right: Process name, PID, State & Copy */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Process & PID */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              color: '#f1f5f9',
                              maxWidth: '180px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={`Процесс: ${p.process}`}
                          >
                            {p.process || 'неизвестно'}
                          </span>
                          {p.pid && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontFamily: 'JetBrains Mono, monospace',
                                color: 'var(--text-dim)',
                                background: 'rgba(0, 0, 0, 0.25)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                              }}
                            >
                              pid:{p.pid}
                            </span>
                          )}
                        </div>

                        {/* State */}
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background:
                              p.state === 'LISTEN'
                                ? 'rgba(16, 185, 129, 0.15)'
                                : 'rgba(245, 158, 11, 0.15)',
                            color: p.state === 'LISTEN' ? '#34d399' : '#fbbf24',
                          }}
                        >
                          {p.state === 'LISTEN' ? 'LISTEN' : p.state}
                        </span>

                        {/* Copy button */}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(copyText);
                            setCopiedItem(copyText);
                            setTimeout(() => setCopiedItem(null), 1800);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '5px 8px',
                            color: isCopied ? '#34d399' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            transition: 'all 0.15s ease',
                          }}
                          title={`Скопировать ${copyText}`}
                        >
                          {isCopied ? <Check size={12} /> : <Copy size={12} />}
                          <span>{isCopied ? 'Скопировано' : 'Копия'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
