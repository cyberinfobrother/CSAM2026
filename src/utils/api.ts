// Client API service for interacting with the backend

export interface BackendConfig {
  backendUrl: string;
  hasExternalBackend: boolean;
  builtInBackendActive: boolean;
}

export interface BackendTestResult {
  success: boolean;
  status?: number;
  latencyMs?: number;
  response?: any;
  message: string;
}

export interface ScanApiResponse {
  success: boolean;
  duplicate: boolean;
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
    error?: string | null;
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
    backendUrl: '',
    hasExternalBackend: false,
    builtInBackendActive: true,
  };
}

export async function saveBackendConfig(backendUrl: string): Promise<BackendConfig> {
  const res = await fetch('/api/backend/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backendUrl }),
  });
  if (!res.ok) {
    throw new Error('Failed saving backend configuration');
  }
  return await res.json();
}

export async function testBackendConnection(backendUrl?: string): Promise<BackendTestResult> {
  const res = await fetch('/api/backend/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backendUrl }),
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
