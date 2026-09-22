import { ScanRecord, DatabaseConfig, DatabaseType, Participant } from '../types';
import {
  DEFAULT_VENDORS,
  TOTAL_STATIONS_FOR_RAFFLE,
  getStoredParticipants,
  saveStoredParticipants,
} from '../data/mockData';

export interface BackendConfig {
  databaseType: DatabaseType;
  backendUrl: string;
  databaseUrl: string;
  apiKey: string;
  authHeader: string;
  hasExternalBackend: boolean;
  builtInBackendActive: boolean;
  enabled: boolean;
  pendingSyncCount: number;
}

export interface BackendTestResult {
  success: boolean;
  status?: number;
  message: string;
  latencyMs?: number;
  response?: any;
  error?: string;
}

export interface ScanApiResponse {
  success: boolean;
  duplicate: boolean;
  name: string;
  office: string;
  vendor: string;
  completion: number;
  total: number;
  raffleQualified: boolean;
  message: string;
  updatedColumn?: string;
  rowNumber?: number;
  sheetName?: string;
  externalBackend?: {
    configured: boolean;
    synced: boolean;
    error?: string;
    updatedColumn?: string;
    rowNumber?: number;
    sheetName?: string;
  };
}

const LOCAL_CONFIG_KEY = 'csam_backend_config_v2';
const LOCAL_PENDING_KEY = 'csam_pending_scans_v2';
const LOCAL_SCANS_KEY = 'csam_vendor_scans_prod';

function getLocalConfig(): BackendConfig {
  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const pendingRaw = localStorage.getItem(LOCAL_PENDING_KEY);
      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
      return {
        databaseType: parsed.databaseType || 'google_sheets',
        backendUrl: parsed.backendUrl || parsed.databaseUrl || '',
        databaseUrl: parsed.databaseUrl || parsed.backendUrl || '',
        apiKey: parsed.apiKey || '',
        authHeader: parsed.authHeader || '',
        hasExternalBackend: !!(parsed.databaseUrl || parsed.backendUrl),
        builtInBackendActive: true,
        enabled: parsed.enabled !== false,
        pendingSyncCount: pending.length,
      };
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

function saveLocalConfig(cfg: Partial<BackendConfig>) {
  try {
    const current = getLocalConfig();
    const updated = {
      ...current,
      ...cfg,
      backendUrl: cfg.databaseUrl || cfg.backendUrl || current.databaseUrl,
      databaseUrl: cfg.databaseUrl || cfg.backendUrl || current.databaseUrl,
    };
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to save local config', e);
    return getLocalConfig();
  }
}

export async function validateStationWithBackend(vendorToken: string) {
  try {
    const res = await fetch(`/api/vendor/validate?vendorToken=${encodeURIComponent(vendorToken)}`);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (err) {
    // Expected on Cloudflare Pages static hosting
  }

  // Fallback for Cloudflare Pages (Client-side validation)
  const vendor = DEFAULT_VENDORS.find((v) => v.token === vendorToken);
  if (vendor) {
    return {
      valid: true,
      vendor: {
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        stampTitle: vendor.stampTitle,
      },
    };
  }
  return null;
}

export async function getBackendConfig(): Promise<BackendConfig> {
  try {
    const res = await fetch('/api/backend/config');
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const serverCfg = await res.json();
        // Sync local cache
        saveLocalConfig(serverCfg);
        return serverCfg;
      }
    }
  } catch (e) {
    // Fall back to local storage
  }

  return getLocalConfig();
}

export async function saveBackendConfig(
  configOrUrl: string | Partial<DatabaseConfig>
): Promise<BackendConfig> {
  const payload =
    typeof configOrUrl === 'string'
      ? { backendUrl: configOrUrl, databaseUrl: configOrUrl, databaseType: 'google_sheets' as DatabaseType }
      : {
          backendUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl || '',
          databaseUrl: configOrUrl.databaseUrl || (configOrUrl as any).backendUrl || '',
          databaseType: configOrUrl.databaseType || 'google_sheets',
          apiKey: configOrUrl.apiKey || '',
          authHeader: configOrUrl.authHeader || '',
          enabled: configOrUrl.enabled !== false,
        };

  // Always save to localStorage first (guaranteed to work on Cloudflare Pages)
  const localSaved = saveLocalConfig(payload);

  // Attempt server sync if running in full-stack container mode
  try {
    const res = await fetch('/api/backend/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (e) {
    // Normal for Cloudflare Pages (no server.ts)
  }

  return localSaved;
}

export async function testBackendConnection(
  params?: string | { databaseUrl?: string; databaseType?: string; apiKey?: string; authHeader?: string }
): Promise<BackendTestResult> {
  const body =
    typeof params === 'string'
      ? { backendUrl: params, databaseUrl: params }
      : params || {};

  const targetUrl = (body.databaseUrl || (body as any).backendUrl || '').trim();

  // Try Express backend first if available
  try {
    const res = await fetch('/api/backend/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (e) {
    // Fall back to direct browser call (Cloudflare Pages mode)
  }

  // Direct Browser Ping to Google Sheets (Cloudflare Pages fallback)
  if (!targetUrl) {
    return {
      success: false,
      message: 'Please enter a valid Google Sheets Web App URL.',
    };
  }

  const start = Date.now();
  try {
    // Note: We use 'text/plain;charset=utf-8' because it avoids CORS preflight OPTIONS rejection
    // which Google Apps Script Web Apps do not support.
    const directRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'validateVendorStation',
        ping: 'test-handshake',
        timestamp: new Date().toISOString(),
        client: 'Cloudflare-Direct-Sync',
      }),
    });

    const latency = Date.now() - start;
    const text = await directRes.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // Return raw response text
    }

    if (json && (json.success || json.ok || json.status === 'LIVE_CONNECTED')) {
      return {
        success: true,
        status: directRes.status,
        message: json.message || 'Connected to Google Sheets successfully (Direct Cloudflare Sync)!',
        latencyMs: latency,
        response: json,
      };
    }

    if (directRes.ok) {
      return {
        success: true,
        status: directRes.status,
        message: 'Google Sheets responded with HTTP 200.',
        latencyMs: latency,
        response: json || text,
      };
    }

    return {
      success: false,
      status: directRes.status,
      message: `Google Sheets returned status ${directRes.status}. Make sure Apps Script deployment access is set to 'Anyone'.`,
      latencyMs: latency,
      response: json || text,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Direct Google Sheets test error: ${err?.message || 'Network error'}. Verify that the Google Apps Script is deployed as Web App with "Who has access: Anyone".`,
      latencyMs: Date.now() - start,
      error: String(err),
    };
  }
}

export async function recordScanWithBackend(
  vendorToken: string,
  participantToken: string
): Promise<ScanApiResponse> {
  // 1. Try Express backend API first
  try {
    const res = await fetch('/api/vendor/scan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        vendorToken,
        participantToken,
      }),
    });

    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch (err) {
    // Fall back to direct browser scan (Cloudflare Pages mode)
  }

  // 2. Direct Browser Processing (Cloudflare Pages fallback)
  const vendor = DEFAULT_VENDORS.find((v) => v.token === vendorToken) || DEFAULT_VENDORS[0];
  const participants = getStoredParticipants();
  let participant = participants.find((p) => p.token === participantToken || p.participantId === participantToken);

  let isNew = false;
  if (!participant) {
    isNew = true;
    const generatedId = participantToken.startsWith('PT-') || participantToken.startsWith('CSAM-')
      ? participantToken
      : `CSAM-${Math.floor(100 + Math.random() * 900)}`;
    participant = {
      participantId: generatedId,
      name: `Attendee (${participantToken.slice(0, 8)})`,
      office: 'Security Summit 2026',
      token: participantToken,
      completedVendors: [],
    };
  }

  const isDuplicate = participant.completedVendors.includes(vendor.id);
  if (!isDuplicate) {
    participant.completedVendors.push(vendor.id);
    if (isNew) {
      saveStoredParticipants([...participants, participant]);
    } else {
      saveStoredParticipants(participants.map((p) => (p.token === participant!.token ? participant! : p)));
    }
  }

  const completionCount = participant.completedVendors.length;
  const isRaffleQualified = completionCount >= TOTAL_STATIONS_FOR_RAFFLE;

  // Sync directly to Google Sheets if configured
  const cfg = getLocalConfig();
  const dbUrl = cfg.databaseUrl || cfg.backendUrl;
  let externalSynced = false;
  let updatedColumn = vendor.id;
  let rowNumber: number | undefined;
  let sheetName: string | undefined;
  let syncError: string | undefined;

  if (dbUrl && cfg.enabled) {
    const partId = participant.participantId || participant.token;
    const livePayload = {
      event: 'CSAM_BOOTH_SCAN',
      timestamp: new Date().toISOString(),
      vendorId: vendor.id,
      vendorName: vendor.name,
      boothId: vendor.id,
      boothName: vendor.name,
      boothColumn: vendor.id,
      participantToken: participant.token,
      participantId: partId,
      isDuplicate,
      currentParticipant: {
        id: partId,
        name: participant.name,
        office: participant.office,
        completedBooths: participant.completedVendors,
        totalCompleted: completionCount,
        raffleQualified: isRaffleQualified,
      },
    };

    try {
      const extRes = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(livePayload),
      });

      if (extRes.ok) {
        externalSynced = true;
        try {
          const extData = await extRes.json();
          if (extData.updatedColumn) updatedColumn = extData.updatedColumn;
          if (extData.rowNumber) rowNumber = extData.rowNumber;
          if (extData.sheetName) sheetName = extData.sheetName;
        } catch {}
      } else {
        syncError = `HTTP ${extRes.status}`;
      }
    } catch (e: any) {
      syncError = e?.message || 'Network sync error';
    }

    // If failed, save to pending queue in localStorage
    if (!externalSynced) {
      try {
        const pendingRaw = localStorage.getItem(LOCAL_PENDING_KEY);
        const pendingList = pendingRaw ? JSON.parse(pendingRaw) : [];
        pendingList.push({ payload: livePayload, timestamp: Date.now() });
        localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(pendingList));
      } catch {}
    }
  }

  // Save scan record locally
  try {
    const rawScans = localStorage.getItem(LOCAL_SCANS_KEY);
    const scanList: ScanRecord[] = rawScans ? JSON.parse(rawScans) : [];
    const record: ScanRecord = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      participantToken: participant.token,
      participantName: participant.name,
      participantOffice: participant.office,
      vendorId: vendor.id,
      vendorName: vendor.name,
      isDuplicate,
      completionCount,
      totalRequired: TOTAL_STATIONS_FOR_RAFFLE,
      raffleQualified: isRaffleQualified,
      syncedToExternal: externalSynced,
      updatedColumn,
    };
    localStorage.setItem(LOCAL_SCANS_KEY, JSON.stringify([record, ...scanList]));
  } catch {}

  return {
    success: true,
    duplicate: isDuplicate,
    name: participant.name,
    office: participant.office,
    vendor: vendor.id,
    completion: completionCount,
    total: TOTAL_STATIONS_FOR_RAFFLE,
    raffleQualified: isRaffleQualified,
    updatedColumn,
    rowNumber,
    sheetName,
    message: isDuplicate
      ? `Attendee already completed challenge at ${vendor.name}.`
      : `Challenge complete! Stamp awarded for ${vendor.name}.`,
    externalBackend: {
      configured: !!dbUrl,
      synced: externalSynced,
      error: syncError,
      updatedColumn,
      rowNumber,
      sheetName,
    },
  };
}

export async function fetchServerScans(vendorId?: string): Promise<ScanRecord[]> {
  try {
    const url = vendorId ? `/api/vendor/scans?vendorId=${vendorId}` : '/api/vendor/scans';
    const res = await fetch(url);
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        return data.scans || [];
      }
    }
  } catch (e) {}

  // Fallback to localStorage (Cloudflare Pages)
  try {
    const raw = localStorage.getItem(LOCAL_SCANS_KEY);
    if (raw) {
      const scans: ScanRecord[] = JSON.parse(raw);
      if (vendorId) return scans.filter((s) => s.vendorId === vendorId);
      return scans;
    }
  } catch {}
  return [];
}

export async function clearServerScans() {
  try {
    await fetch('/api/vendor/scans', { method: 'DELETE' });
  } catch {}
  localStorage.removeItem(LOCAL_SCANS_KEY);
}

export async function syncPendingScans(): Promise<{ synced: number; failed: number; message: string }> {
  // Try Express endpoint first
  try {
    const res = await fetch('/api/vendor/sync-pending', { method: 'POST' });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        return await res.json();
      }
    }
  } catch {}

  // Fallback to direct client sync for Cloudflare Pages
  const cfg = getLocalConfig();
  const dbUrl = cfg.databaseUrl || cfg.backendUrl;
  if (!dbUrl) {
    return { synced: 0, failed: 0, message: 'No Google Sheet URL configured.' };
  }

  const raw = localStorage.getItem(LOCAL_PENDING_KEY);
  const pending: Array<{ payload: any; timestamp: number }> = raw ? JSON.parse(raw) : [];
  if (pending.length === 0) {
    return { synced: 0, failed: 0, message: 'No pending scans in queue.' };
  }

  let synced = 0;
  const remaining: typeof pending = [];

  for (const item of pending) {
    try {
      const r = await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(item.payload),
      });
      if (r.ok) synced++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  localStorage.setItem(LOCAL_PENDING_KEY, JSON.stringify(remaining));
  return {
    synced,
    failed: remaining.length,
    message: `Synced ${synced} scan(s) to Google Sheets. ${remaining.length} remaining.`,
  };
}
