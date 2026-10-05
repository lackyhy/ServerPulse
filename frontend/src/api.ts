import type {
  ServersResponse,
  AppEvent,
  ServerMetrics,
  DockerContainerInfo,
  TmuxSessionInfo,
  PortInfo,
} from './types';

const API_BASE = '/api';

const TOKEN_KEY = 'serverpulse_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Access-Password'] = token;
  }
  return headers;
}

export async function checkAuthStatus(): Promise<{ required: boolean }> {
  const res = await fetch(`${API_BASE}/auth/status`);
  if (!res.ok) {
    throw new Error('Failed to check auth status');
  }
  return res.json();
}

export async function loginWithPassword(password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ password }),
  });

  const data = await res.json();
  if (res.ok && data.success && data.token) {
    setStoredToken(data.token);
  }
  return data;
}

export async function fetchServers(): Promise<ServersResponse> {
  const res = await fetch(`${API_BASE}/servers`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch servers: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchServerMetrics(serverName: string): Promise<ServerMetrics> {
  const res = await fetch(`${API_BASE}/server-metrics?name=${encodeURIComponent(serverName)}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to fetch hardware metrics: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchServerDocker(serverName: string): Promise<DockerContainerInfo[]> {
  const res = await fetch(`${API_BASE}/server-docker?name=${encodeURIComponent(serverName)}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to fetch Docker containers`);
  }
  return res.json();
}

export async function fetchServerTmux(serverName: string): Promise<TmuxSessionInfo[]> {
  const res = await fetch(`${API_BASE}/server-tmux?name=${encodeURIComponent(serverName)}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to fetch Tmux sessions`);
  }
  return res.json();
}

export async function fetchServerPorts(serverName: string): Promise<PortInfo[]> {
  const res = await fetch(`${API_BASE}/server-ports?name=${encodeURIComponent(serverName)}`, {
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Failed to fetch open ports`);
  }
  return res.json();
}

export async function triggerCheckNow(): Promise<ServersResponse> {
  const res = await fetch(`${API_BASE}/check-now`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    throw new Error(`Failed to run checks: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function triggerReloadConfig(): Promise<ServersResponse> {
  const res = await fetch(`${API_BASE}/config/reload`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (res.status === 403) {
    throw new Error('403_FORBIDDEN');
  }
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Config reload failed: ${errorText || res.statusText}`);
  }
  return res.json();
}

export function subscribeToEvents(
  onEvent: (event: AppEvent) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  const token = getStoredToken();
  const url = token
    ? `${API_BASE}/events?token=${encodeURIComponent(token)}`
    : `${API_BASE}/events`;

  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    if (onStatusChange) onStatusChange(true);
  };

  eventSource.onmessage = (e) => {
    try {
      const data: AppEvent = JSON.parse(e.data);
      onEvent(data);
    } catch (err) {
      console.error('Error parsing SSE event:', err);
    }
  };

  eventSource.onerror = (err) => {
    console.warn('SSE connection error or reconnecting...', err);
    if (onStatusChange) onStatusChange(false);
  };

  return () => {
    eventSource.close();
    if (onStatusChange) onStatusChange(false);
  };
}
