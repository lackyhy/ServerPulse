import React from 'react';
import { Server, CheckCircle2, XCircle, AlertTriangle, Zap } from 'lucide-react';
import type { ServersResponse } from '../types';

interface StatsSummaryProps {
  stats: ServersResponse | null;
}

export const StatsSummary: React.FC<StatsSummaryProps> = ({ stats }) => {
  const total = stats?.total ?? 0;
  const online = stats?.online ?? 0;
  const offline = stats?.offline ?? 0;
  const degraded = stats?.degraded ?? 0;
  const avgLatency = stats?.avg_latency_ms;

  const items = [
    {
      title: 'Всего узлов',
      value: total,
      sub: 'В конфигурации',
      icon: <Server size={20} color="#94a3b8" />,
      color: 'var(--text-main)',
      border: 'var(--border-color)',
    },
    {
      title: 'В сети (Online)',
      value: online,
      sub: `${total > 0 ? Math.round((online / total) * 100) : 0}% доступно`,
      icon: <CheckCircle2 size={20} color="#10b981" />,
      color: '#34d399',
      border: 'rgba(16, 185, 129, 0.25)',
      glow: 'rgba(16, 185, 129, 0.1)',
    },
    {
      title: 'Офлайн (Down)',
      value: offline,
      sub: offline > 0 ? 'Требует внимания' : 'Нет сбоев',
      icon: <XCircle size={20} color="#f43f5e" />,
      color: '#fb7185',
      border: 'rgba(244, 63, 94, 0.25)',
      glow: offline > 0 ? 'rgba(244, 63, 94, 0.15)' : undefined,
    },
    {
      title: 'Деградация',
      value: degraded,
      sub: degraded > 0 ? 'Неожиданный статус' : 'Все в норме',
      icon: <AlertTriangle size={20} color="#f59e0b" />,
      color: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.25)',
      glow: degraded > 0 ? 'rgba(245, 158, 11, 0.15)' : undefined,
    },
    {
      title: 'Средний RTT',
      value: avgLatency != null ? `${avgLatency} ms` : '—',
      sub: 'Задержка отклика',
      icon: <Zap size={20} color="#06b6d4" />,
      color: '#22d3ee',
      border: 'rgba(6, 182, 212, 0.25)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
      }}
    >
      {items.map((it, idx) => (
        <div
          key={idx}
          className="glass-panel"
          style={{
            padding: '16px 20px',
            border: `1px solid ${it.border}`,
            background: it.glow ? `radial-gradient(circle at 100% 0%, ${it.glow} 0%, var(--bg-card) 70%)` : 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {it.title}
            </div>
            <div style={{ fontSize: '1.65rem', fontWeight: 700, color: it.color, marginTop: '4px', letterSpacing: '-0.02em' }}>
              {it.value}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '2px' }}>
              {it.sub}
            </div>
          </div>
          <div
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(255, 255, 255, 0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {it.icon}
          </div>
        </div>
      ))}
    </div>
  );
};
