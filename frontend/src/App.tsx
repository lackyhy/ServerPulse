import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  fetchServers,
  triggerCheckNow,
  triggerReloadConfig,
  subscribeToEvents,
  checkAuthStatus,
  getStoredToken,
  clearStoredToken,
} from './api';
import type { ServersResponse, ServerRuntime, AppEvent } from './types';
import { Header } from './components/Header';
import { StatsSummary } from './components/StatsSummary';
import { ServerFilter } from './components/ServerFilter';
import type { FilterStatus, SortOption } from './components/ServerFilter';
import { ServerCard } from './components/ServerCard';
import { ServerMetricsModal } from './components/ServerMetricsModal';
import { LoginModal } from './components/LoginModal';
import { AlertCircle, CheckCircle2, ServerOff } from 'lucide-react';

export const App: React.FC = () => {
  const [data, setData] = useState<ServersResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isSseConnected, setIsSseConnected] = useState<boolean>(false);
  const [isAuthRequired, setIsAuthRequired] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [modalTarget, setModalTarget] = useState<{
    server: ServerRuntime;
    tab: 'metrics' | 'docker' | 'tmux' | 'ports';
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [, setTick] = useState<number>(0);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  const loadInitialData = useCallback(() => {
    setLoading(true);
    fetchServers()
      .then((res) => {
        setData(res);
        setIsAuthenticated(true);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        if (err.message === '403_FORBIDDEN') {
          clearStoredToken();
          setIsAuthenticated(false);
        } else {
          showToast('Не удалось загрузить список серверов: ' + err.message, 'error');
        }
        setLoading(false);
      });
  }, []);

  // Check auth requirement on mount
  useEffect(() => {
    checkAuthStatus()
      .then((status) => {
        setIsAuthRequired(status.required);
        if (status.required && !getStoredToken()) {
          setIsAuthenticated(false);
          setLoading(false);
        } else {
          loadInitialData();
        }
      })
      .catch(() => {
        loadInitialData();
      });
  }, [loadInitialData]);

  const handleLogout = () => {
    clearStoredToken();
    setIsAuthenticated(false);
    setData(null);
    showToast('Вы вышли из системы');
  };

  // Subscribe to real-time events via SSE
  useEffect(() => {
    const unsubscribe = subscribeToEvents(
      (event: AppEvent) => {
        if (event.type === 'ServerUpdated') {
          const updated = event.payload;
          setData((prev) => {
            if (!prev) return prev;
            const updatedServers = prev.servers.map((s) =>
              s.config.name === updated.config.name ? updated : s
            );
            return calculateStats(updatedServers);
          });
        } else if (event.type === 'AllChecked' || event.type === 'ConfigReloaded') {
          setData(event.payload);
          if (event.type === 'ConfigReloaded') {
            showToast('Конфигурация успешно перезагружена из файла servers.yaml');
          }
        }
      },
      (connected) => {
        setIsSseConnected(connected);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // Update relative timestamps every 2 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Helper to recompute stats when single server changes
  const calculateStats = (servers: ServerRuntime[]): ServersResponse => {
    let online = 0;
    let offline = 0;
    let degraded = 0;
    let pending = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const s of servers) {
      if (s.status === 'online') online++;
      else if (s.status === 'offline') offline++;
      else if (s.status === 'degraded') degraded++;
      else pending++;

      if (s.latency_ms != null) {
        totalLatency += s.latency_ms;
        latencyCount++;
      }
    }

    return {
      servers,
      total: servers.length,
      online,
      offline,
      degraded,
      pending,
      avg_latency_ms:
        latencyCount > 0 ? Math.round((totalLatency / latencyCount) * 10) / 10 : null,
      last_updated: new Date().toISOString(),
    };
  };

  const handleCheckNow = async () => {
    try {
      setIsChecking(true);
      const res = await triggerCheckNow();
      setData(res);
      showToast('Все серверы успешно проверены');
    } catch (err: any) {
      showToast(err.message || 'Ошибка проверки серверов', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  const handleReloadConfig = async () => {
    try {
      setIsReloading(true);
      const res = await triggerReloadConfig();
      setData(res);
      showToast('Конфигурация перезагружена из servers.yaml');
    } catch (err: any) {
      showToast(err.message || 'Ошибка перезагрузки конфигурации', 'error');
    } finally {
      setIsReloading(false);
    }
  };

  // Filter and sort items
  const filteredServers = useMemo(() => {
    if (!data?.servers) return [];

    let list = data.servers.filter((s) => {
      // Status filter
      if (statusFilter !== 'all' && s.status !== statusFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesName = s.config.name.toLowerCase().includes(q);
        const matchesHost = s.config.host.toLowerCase().includes(q);
        const matchesPort = s.config.port ? s.config.port.toString().includes(q) : false;
        const matchesType = s.config.check_type.toLowerCase().includes(q);
        return matchesName || matchesHost || matchesPort || matchesType;
      }
      return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return a.config.name.localeCompare(b.config.name);
      }
      if (sortBy === 'latency') {
        const latA = a.latency_ms ?? 999999;
        const latB = b.latency_ms ?? 999999;
        return latA - latB;
      }
      if (sortBy === 'status') {
        const order: Record<string, number> = { offline: 0, degraded: 1, pending: 2, online: 3 };
        return (order[a.status] ?? 4) - (order[b.status] ?? 4);
      }
      return 0;
    });

    return list;
  }, [data, searchQuery, statusFilter, sortBy]);

  const counts = useMemo(() => {
    return {
      all: data?.total ?? 0,
      online: data?.online ?? 0,
      offline: data?.offline ?? 0,
      degraded: data?.degraded ?? 0,
    };
  }, [data]);

  return (
    <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 20px',
            borderRadius: '10px',
            background: toast.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(244, 63, 94, 0.95)',
            color: '#ffffff',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(8px)',
            fontSize: '0.875rem',
            fontWeight: 500,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <Header
        isChecking={isChecking}
        isReloading={isReloading}
        isSseConnected={isSseConnected}
        onCheckNow={handleCheckNow}
        onReloadConfig={handleReloadConfig}
        lastUpdated={data?.last_updated ?? null}
        isAuthRequired={isAuthRequired}
        onLogout={handleLogout}
      />

      {/* Metrics Summary Banner */}
      <StatsSummary stats={data} />

      {/* Controls & Filters */}
      <ServerFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        counts={counts}
      />

      {/* Server Grid */}
      {loading ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <div className="status-dot status-dot-pending pulse-ring" style={{ margin: '0 auto 16px', width: '14px', height: '14px' }} />
          <p>Загрузка статуса узлов...</p>
        </div>
      ) : filteredServers.length === 0 ? (
        <div
          className="glass-panel"
          style={{
            padding: '60px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}
        >
          <ServerOff size={42} color="var(--text-dim)" style={{ marginBottom: '14px' }} />
          <h3 style={{ color: 'var(--text-main)', fontSize: '1.1rem', marginBottom: '6px' }}>
            Серверы не найдены
          </h3>
          <p style={{ fontSize: '0.85rem' }}>
            {searchQuery
              ? 'По вашему запросу ничего не найдено. Попробуйте изменить параметры поиска.'
              : 'В выбранной категории нет серверов.'}
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredServers.map((server) => (
            <ServerCard
              key={server.config.name}
              server={server}
              onViewMetrics={(s, tab = 'metrics') => setModalTarget({ server: s, tab })}
            />
          ))}
        </div>
      )}

      {/* Hardware, Docker & Tmux Modal */}
      {modalTarget && (
        <ServerMetricsModal
          server={modalTarget.server}
          initialTab={modalTarget.tab}
          onClose={() => setModalTarget(null)}
        />
      )}

      {/* Password Login Modal if auth required */}
      {isAuthRequired && !isAuthenticated && (
        <LoginModal
          onSuccess={() => {
            setIsAuthenticated(true);
            loadInitialData();
            showToast('Успешный вход в систему');
          }}
        />
      )}
    </div>
  );
};
export default App;
