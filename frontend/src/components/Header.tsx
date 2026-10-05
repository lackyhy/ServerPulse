import React from 'react';
import { RefreshCw, FileText, LogOut } from 'lucide-react';

interface HeaderProps {
  isChecking: boolean;
  isReloading: boolean;
  isSseConnected: boolean;
  onCheckNow: () => void;
  onReloadConfig: () => void;
  lastUpdated: string | null;
  isAuthRequired?: boolean;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isChecking,
  isReloading,
  isSseConnected,
  onCheckNow,
  onReloadConfig,
  lastUpdated,
  isAuthRequired,
  onLogout,
}) => {
  const formattedTime = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : '—';

  return (
    <header
      className="glass-panel"
      style={{
        padding: '20px 28px',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
      }}
    >
      {/* Brand & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
          }}
        >
          <img
            src="/favicon.svg"
            alt="ServerPulse Logo"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                fontSize: '1.45rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              ServerPulse
            </h1>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#818cf8',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                padding: '2px 8px',
                borderRadius: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Rust + TS
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Локальный мониторинг узлов, портов и HTTP-сервисов
          </p>
        </div>
      </div>

      {/* Realtime Status & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        {/* SSE Live Status indicator */}
        <div
          title={isSseConnected ? 'Потоковое SSE-соединение активно' : 'Переподключение SSE...'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '20px',
            background: isSseConnected ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
            border: `1px solid ${isSseConnected ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)'}`,
            fontSize: '0.8rem',
            color: isSseConnected ? '#34d399' : '#fb7185',
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isSseConnected ? '#10b981' : '#f43f5e',
              boxShadow: isSseConnected ? '0 0 8px #10b981' : '0 0 8px #f43f5e',
            }}
            className={isSseConnected ? 'pulse-ring' : ''}
          />
          {isSseConnected ? 'SSE Live' : 'Офлайн'}
          <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginLeft: '4px' }}>
            ({formattedTime})
          </span>
        </div>

        {/* Reload YAML Config Button */}
        <button
          className="btn-secondary"
          onClick={onReloadConfig}
          disabled={isReloading}
          title="Горячая перезагрузка конфигурации из servers.yaml"
        >
          <FileText size={16} className={isReloading ? 'spin' : ''} />
          {isReloading ? 'Перезагрузка...' : 'Обновить конфиг'}
        </button>

        {/* Force Check Now Button */}
        <button
          className="btn-primary"
          onClick={onCheckNow}
          disabled={isChecking}
          title="Принудительно опросить все серверы прямо сейчас"
        >
          <RefreshCw size={16} className={isChecking ? 'spin' : ''} />
          {isChecking ? 'Опрос узлов...' : 'Проверить сейчас'}
        </button>

        {/* Optional Logout Button */}
        {isAuthRequired && onLogout && (
          <button
            className="btn-secondary"
            onClick={onLogout}
            title="Выйти из защищенной панели"
            style={{
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#f87171',
            }}
          >
            <LogOut size={16} />
            Выход
          </button>
        )}
      </div>
    </header>
  );
};
