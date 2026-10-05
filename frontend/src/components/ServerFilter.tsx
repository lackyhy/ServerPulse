import React from 'react';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import type { ServerStatusKind } from '../types';

export type FilterStatus = 'all' | ServerStatusKind;
export type SortOption = 'default' | 'name' | 'latency' | 'status';

interface ServerFilterProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: FilterStatus;
  onStatusFilterChange: (status: FilterStatus) => void;
  sortBy: SortOption;
  onSortByChange: (sort: SortOption) => void;
  counts: {
    all: number;
    online: number;
    offline: number;
    degraded: number;
  };
}

export const ServerFilter: React.FC<ServerFilterProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  counts,
}) => {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '14px 20px',
        marginBottom: '20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      {/* Search Input */}
      <div
        style={{
          position: 'relative',
          flex: '1 1 240px',
          maxWidth: '380px',
        }}
      >
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
          }}
        />
        <input
          type="text"
          placeholder="Поиск по имени, хосту или порту..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 34px 8px 36px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            color: 'var(--text-main)',
            fontSize: '0.875rem',
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(99, 102, 241, 0.5)')}
          onBlur={(e) => (e.target.style.borderColor = 'var(--border-color)')}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'Все', count: counts.all },
          { id: 'online', label: 'В сети', count: counts.online, color: '#34d399' },
          { id: 'offline', label: 'Офлайн', count: counts.offline, color: '#fb7185' },
          { id: 'degraded', label: 'Деградация', count: counts.degraded, color: '#fbbf24' },
        ].map((tab) => {
          const active = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onStatusFilterChange(tab.id as FilterStatus)}
              style={{
                background: active ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: active ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid var(--border-color)',
                color: active ? '#ffffff' : 'var(--text-muted)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: active ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  color: tab.color || 'var(--text-dim)',
                  fontWeight: 600,
                }}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sort Dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <SlidersHorizontal size={14} color="var(--text-dim)" />
        <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Сортировка:</span>
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value as SortOption)}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-main)',
            borderRadius: '8px',
            padding: '6px 10px',
            fontSize: '0.8rem',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="default">По умолчанию</option>
          <option value="name">По имени (А-Я)</option>
          <option value="latency">По задержке (быстрые первыми)</option>
          <option value="status">По статусу (сбои первыми)</option>
        </select>
      </div>
    </div>
  );
};
