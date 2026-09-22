// Client API service for interacting with the backend
import { DatabaseConfig, DatabaseType } from '../types';

export interface BackendConfig extends DatabaseConfig {
  backendUrl: string;
  databaseType: DatabaseType;
  apiKey?: string;
  authHeader?: string;
  hasExternalBackend: boolean;
  builtInBackendActive: boolean;
  enabled: boolean;
  lastConnectedAt?: number;
  lastStatus?: string;
  pendingSyncCount?: number;
}

export interface BackendTestResult {
  success: boolean;
  status?: number;
  latencyMs?: number;
  response?: any;
  message: string;
  sentPayload?: any;
}

export interface ScanApiResponse {
  success: boolean;
  ok: boolean;
  duplicate: boolean;
  participantId?: string;
  vendor: string;
  vendorName: string;
  name: string;
  office: string;
  completion: number;
  total: number;
  raffleQualified: boolean;
  message: string;
  externalBackend?: {
    synced: boolean;
    url: string;
    databaseType?: string;
    updatedColumn?: string;
    rowNumber?: number;
    sheetName?: string;
    error?: string | null;
    rawResponse?: any;
  } | null;
}

export async function validateStationWithBackend(vendorToken: string) {
  try {
    const res = await fetch(`/api/vendor/validate?vendorToken=${encodeURIComponent(vendorToken)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend validate station fallback', err);
  }
  return null;
}

export async function recordScanWithBackend(
  vendorToken: string,
  participantToken: string
): Promise<ScanApiResponse> {
  const res = await fetch('/api/vendor/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      vendorToken,
      participantToken,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(errText);
    } catch (e) {
      parsed = { message: errText || 'Failed recording scan' };
    }
    throw new Error(parsed.message || `Server returned ${res.status}`);
  }

  return await res.json();
}

export async function getBackendConfig(): Promise<BackendConfig> {
  try {
    const res = await fetch('/api/backend/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {}
  return {
    databaseType: 'google_sheets',
    backendUrl: '',
    databaseUrl: '',
    apiKey: '',
    authHeader: '',
    hasExternalBackend: false,
    builtInBackendActive: true,
    enabled: true,
    pendingSyncCount: 0,
  };
}

export async function saveBackendConfig(
  configOrUrl: string | Partial<DatabaseConfig>
): Promise<BackendConfig> {
  const body =
    typeof configOrUrl === 'string'
      ? { backendUrl: configOrUrl, databaseUrl: configOrUrl }
      : {
          backendUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl,
          databaseUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl,
          databaseType: configOrUrl.databaseType || 'google_sheets',
          apiKey: configOrUrl.apiKey || '',
          authHeader: configOrUrl.authHeader || '',
          enabled: configOrUrl.enabled !== false,
        };

  const res = await fetch('/api/backend/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error('Failed saving backend configuration');
  }
  return await res.json();
}

export async function testBackendConnection(
  params?: string | { databaseUrl?: string; databaseType?: string; apiKey?: string; authHeader?: string }
): Promise<BackendTestResult> {
  const body =
    typeof params === 'string'
      ? { backendUrl: params, databaseUrl: params }
      : params || {};

  const res = await fetch('/api/backend/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

export async function fetchServerScans(vendorId?: string) {
  try {
    const url = vendorId ? `/api/vendor/scans?vendorId=${vendorId}` : '/api/vendor/scans';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.scans || [];
    }
  } catch (e) {}
  return [];
}

export async function clearServerScans() {
  await fetch('/api/vendor/scans', { method: 'DELETE' });
}

export async function syncPendingScans(): Promise<{ synced: number; failed: number; message: string }> {
  const res = await fetch('/api/vendor/sync-pending', { method: 'POST' });
  if (!res.ok) {
    throw new Error('Failed to trigger pending sync');
  }
  return await res.json();
}

