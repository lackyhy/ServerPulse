import React from 'react';
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

  return (
    <div title="История последних проверок" style={{ display: 'flex', alignItems: 'flex-end', height }}>
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

          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={1.5}
                fill={fill}
                style={{
                  transition: 'height 0.3s ease, fill 0.3s ease',
                  opacity: 0.85,
                }}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
};
