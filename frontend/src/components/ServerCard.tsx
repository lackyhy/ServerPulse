import React, { useState } from 'react';
import {
  Globe,
  Network,
  Radio,
  Clock,
  Copy,
  Check,
  AlertCircle,
  ShieldCheck,
  Cpu,
  Boxes,
  Terminal,
} from 'lucide-react';
import type { ServerRuntime, ServerStatusKind } from '../types';
import { LatencySparkline } from './LatencySparkline';

interface ServerCardProps {
  server: ServerRuntime;
  onViewMetrics?: (server: ServerRuntime, tab?: 'metrics' | 'docker' | 'tmux' | 'ports') => void;
}

export const ServerCard: React.FC<ServerCardProps> = ({ server, onViewMetrics }) => {
  const [copied, setCopied] = useState(false);

  const { config, status, latency_ms, last_checked, last_successful, error_message, history } =
    server;

  const copyHost = () => {
    const text = config.port ? `${config.host}:${config.port}` : config.host;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Status configuration
  const statusMeta: Record<
    ServerStatusKind,
    { label: string; dotClass: string; badgeClass: string; borderColor: string }
  > = {
    online: {
      label: 'В сети',
      dotClass: 'status-dot-online',
      badgeClass: 'status-online',
      borderColor: 'rgba(16, 185, 129, 0.25)',
    },
    offline: {
      label: 'Офлайн',
      dotClass: 'status-dot-offline',
      badgeClass: 'status-offline',
      borderColor: 'rgba(244, 63, 94, 0.35)',
    },
    degraded: {
      label: 'Деградация',
      dotClass: 'status-dot-degraded',
      badgeClass: 'status-degraded',
      borderColor: 'rgba(245, 158, 11, 0.35)',
    },
    pending: {
      label: 'Ожидание',
      dotClass: 'status-dot-pending',
      badgeClass: 'status-pending',
      borderColor: 'rgba(99, 102, 241, 0.25)',
    },
  };

  const currentMeta = statusMeta[status] || statusMeta.pending;

  // Type icon
  const getProtocolIcon = () => {
    switch (config.check_type) {
      case 'https':
        return <ShieldCheck size={14} color="#38bdf8" />;
      case 'http':
        return <Globe size={14} color="#60a5fa" />;
      case 'tcp':
        return <Network size={14} color="#a78bfa" />;
      case 'ping':
        return <Radio size={14} color="#34d399" />;
    }
  };

  // Format relative time
  const formatRelativeTime = (isoString: string | null) => {
    if (!isoString) return 'Еще не проверялся';
    const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (diff < 3) return 'только что';
    if (diff < 60) return `${diff} сек назад`;
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    return `${hours} ч назад`;
  };

  // Latency styling
  const getLatencyColor = (ms: number | null) => {
    if (ms == null) return 'var(--text-dim)';
    if (ms < 50) return '#34d399';
    if (ms < 150) return '#fbbf24';
    return '#fb7185';
  };

  return (
    <div
      className="glass-panel glass-panel-hover"
      style={{
        padding: '20px',
        border: `1px solid ${currentMeta.borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top row: Name & Status badge */}
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <h3
              style={{
                fontSize: '1.05rem',
                fontWeight: 600,
                color: '#ffffff',
                letterSpacing: '-0.01em',
              }}
            >
              {config.name}
            </h3>
            {/* Host & Port info with copy button */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '6px',
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                background: 'rgba(255, 255, 255, 0.04)',
                padding: '3px 8px',
                borderRadius: '6px',
              }}
            >
              <span>{config.host}</span>
              {config.port && <span style={{ color: '#818cf8' }}>:{config.port}</span>}
              <button
                onClick={copyHost}
                title="Скопировать хост"
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? '#34d399' : 'var(--text-dim)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Status Badge */}
          <div className={`badge-status ${currentMeta.badgeClass}`}>
            <span
              className={`status-dot ${currentMeta.dotClass} ${status === 'online' ? 'pulse-ring' : ''}`}
            />
            {currentMeta.label}
          </div>
        </div>

        {/* Check Type & Configuration Tags */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '14px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-main)',
              textTransform: 'uppercase',
            }}
          >
            {getProtocolIcon()}
            {config.check_type}
            {config.expected_status && ` (${config.expected_status})`}
          </span>

          {server.metrics && (
            <>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  color: '#a5b4fc',
                  fontFamily: 'JetBrains Mono',
                }}
              >
                ЦП {server.metrics.cpu.usage_percent}%
              </span>

              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#6ee7b7',
                  fontFamily: 'JetBrains Mono',
                }}
              >
                ОЗУ {server.metrics.ram.usage_percent}%
              </span>
            </>
          )}

          <span
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-dim)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Clock size={12} />
            каждые {config.interval_seconds}с
          </span>
        </div>
      </div>

      {/* Latency & History Section */}
      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Задержка (RTT):</span>
            <span
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                fontFamily: 'JetBrains Mono, monospace',
                color: getLatencyColor(latency_ms),
              }}
            >
              {latency_ms != null ? `${latency_ms} ms` : '—'}
            </span>
          </div>

          {/* Sparkline */}
          <LatencySparkline history={history} width={130} height={28} />
        </div>

        {/* Timestamps */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            color: 'var(--text-dim)',
            marginTop: '6px',
          }}
        >
          <span>Проверено: {formatRelativeTime(last_checked)}</span>
          {last_successful && (
            <span style={{ color: '#10b981' }}>
              Успех: {formatRelativeTime(last_successful)}
            </span>
          )}
        </div>

        {/* Error message alert */}
        {error_message && (
          <div
            style={{
              marginTop: '10px',
              padding: '8px 10px',
              borderRadius: '6px',
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#fca5a5',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
            }}
          >
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ wordBreak: 'break-word' }}>{error_message}</span>
          </div>
        )}

        {/* Action Buttons: Metrics, Docker, tmux, Ports */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginTop: '14px' }}>
          <button
            onClick={() => onViewMetrics?.(server, 'metrics')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(6, 182, 212, 0.08) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Системные метрики: ЦП, ОЗУ, Swap, Диск, Сеть"
          >
            <Cpu size={13} color="#818cf8" />
            <span>Железо</span>
          </button>

          <button
            onClick={() => onViewMetrics?.(server, 'docker')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'rgba(14, 165, 233, 0.12)',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              color: '#7dd3fc',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Docker контейнеры"
          >
            <Boxes size={13} color="#38bdf8" />
            <span>Docker{server.docker ? ` ${server.docker.length}` : ''}</span>
          </button>

          <button
            onClick={() => onViewMetrics?.(server, 'tmux')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#6ee7b7',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Сессии tmux"
          >
            <Terminal size={13} color="#34d399" />
            <span>tmux{server.tmux ? ` ${server.tmux.length}` : ''}</span>
          </button>

          <button
            onClick={() => onViewMetrics?.(server, 'ports')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 4px',
              borderRadius: '8px',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#fcd34d',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Открытые порты (ss -tulnp)"
          >
            <Radio size={13} color="#fbbf24" />
            <span>Порты{server.ports ? ` ${server.ports.length}` : ''}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
