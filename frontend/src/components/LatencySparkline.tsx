import React, { useState } from 'react';
import type { HistoryPoint } from '../types';

interface LatencySparklineProps {
  history: HistoryPoint[];
  width?: number;
  height?: number;
}

export const LatencySparkline: React.FC<LatencySparklineProps> = ({
  history,
  width = 160,
  height = 36,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!history || history.length === 0) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-dim)',
          fontStyle: 'italic',
        }}
      >
        Нет данных
      </div>
    );
  }

  // Find max latency for scaling (minimum max 50ms)
  const maxLat = Math.max(
    50,
    ...history.map((h) => (h.status === 'online' && h.latency_ms ? h.latency_ms : 0))
  );

  const barWidth = Math.max(3, Math.floor((width - (history.length - 1) * 2) / history.length));
  const totalW = history.length * (barWidth + 2);

  const formatPointTime = (ts: string) => {
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return ts;
    }
  };

  const hoveredPoint = hoveredIndex != null ? history[hoveredIndex] : null;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        height,
      }}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {/* Floating tooltip */}
      {hoveredPoint && hoveredIndex != null && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: `${Math.min(
              Math.max(hoveredIndex * (barWidth + 2) + barWidth / 2, 40),
              totalW - 40
            )}px`,
            transform: 'translateX(-50%) translateY(-6px)',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '0.72rem',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#ffffff',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor:
                  hoveredPoint.status === 'online'
                    ? hoveredPoint.latency_ms && hoveredPoint.latency_ms < 40
                      ? '#10b981'
                      : hoveredPoint.latency_ms && hoveredPoint.latency_ms < 120
                      ? '#34d399'
                      : '#fbbf24'
                    : hoveredPoint.status === 'degraded'
                    ? '#f59e0b'
                    : '#f43f5e',
              }}
            />
            <span style={{ fontWeight: 700 }}>
              {hoveredPoint.status === 'online'
                ? `${hoveredPoint.latency_ms != null ? hoveredPoint.latency_ms : '—'} ms`
                : hoveredPoint.status === 'offline'
                ? 'Offline'
                : 'Degraded'}
            </span>
          </div>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            {formatPointTime(hoveredPoint.timestamp)}
          </span>
        </div>
      )}

      <svg width={totalW} height={height} style={{ overflow: 'visible' }}>
        {history.map((point, idx) => {
          const x = idx * (barWidth + 2);
          let barHeight = 4;
          let fill = 'var(--text-dim)';

          if (point.status === 'online') {
            const lat = point.latency_ms || 1;
            barHeight = Math.max(4, Math.min(height, Math.round((lat / maxLat) * height)));
            if (lat < 40) fill = '#10b981'; // fast green
            else if (lat < 120) fill = '#34d399'; // good
            else fill = '#fbbf24'; // slow yellow
          } else if (point.status === 'degraded') {
            barHeight = height * 0.7;
            fill = '#f59e0b';
          } else if (point.status === 'offline') {
            barHeight = height;
            fill = '#f43f5e';
          }

          const y = height - barHeight;
          const isHovered = hoveredIndex === idx;

          const tooltipText =
            point.status === 'online'
              ? `${point.latency_ms != null ? point.latency_ms : '—'} ms (${formatPointTime(point.timestamp)})`
              : `${point.status.toUpperCase()} (${formatPointTime(point.timestamp)})`;

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIndex(idx)}
              style={{ cursor: 'pointer' }}
            >
              {/* Invisible wider hover hit area */}
              <rect
                x={x - 1}
                y={0}
                width={barWidth + 2}
                height={height}
                fill="transparent"
              />
              {/* Visible Bar */}
              <rect
                x={x}
                y={isHovered ? Math.max(0, y - 2) : y}
                width={barWidth}
                height={isHovered ? Math.min(height, barHeight + 2) : barHeight}
                rx={1.5}
                fill={fill}
                style={{
                  transition: 'height 0.15s ease, y 0.15s ease, opacity 0.15s ease',
                  opacity: isHovered ? 1 : hoveredIndex != null ? 0.45 : 0.85,
                  filter: isHovered ? 'brightness(1.25)' : 'none',
                }}
              >
                <title>{tooltipText}</title>
              </rect>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
