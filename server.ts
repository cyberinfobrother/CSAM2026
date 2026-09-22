import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Default Vendors (Booth 1, Booth 2, Booth 3 matching Google Sheets database)
const VENDORS: Record<string, { id: string; name: string; category: string; stampTitle: string; token: string }> = {
  'Booth 1': { id: 'Booth 1', name: 'Booth 1 - Netsec', category: 'Network Security & Firewall', stampTitle: 'Netsec Defense Challenge', token: 'TOKEN-BOOTH-1-NETSEC' },
  'Booth 2': { id: 'Booth 2', name: 'Booth2 - TVM', category: 'Threat & Vulnerability Management', stampTitle: 'TVM Assessment Challenge', token: 'TOKEN-BOOTH-2-TVM' },
  'Booth 3': { id: 'Booth 3', name: 'Booth3 - SecOps', category: 'Security Operations & Incident Response', stampTitle: 'SecOps Triage Challenge', token: 'TOKEN-BOOTH-3-SECOPS' },
};

// Data persistence structures
interface ParticipantRecord {
  token: string;
  participantId: string;
  name: string;
  office: string;
  completedVendors: string[];
  lastScannedAt?: string;
  raffleQualified?: boolean;
}

interface ScanLog {
  id: string;
  timestamp: number;
  dateTime: string;
  participantId: string;
  participantToken: string;
  participantName: string;
  participantOffice: string;
  vendorId: string;
  vendorName: string;
  isDuplicate: boolean;
  completionCount: number;
  totalRequired: number;
  raffleQualified: boolean;
  syncedToExternal?: boolean;
  syncError?: string | null;
  databaseType?: string;
  updatedColumn?: string;
  rowNumber?: number;
  sheetName?: string;
}

interface DatabaseConfigData {
  databaseType: 'google_sheets' | 'rest_api' | 'webhook' | 'supabase';
  databaseUrl: string;
  apiKey: string;
  authHeader: string;
  enabled: boolean;
  lastConnectedAt?: number;
  lastStatus?: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const RECORDS_FILE = path.join(DATA_DIR, 'records.json');
const CONFIG_FILE = path.join(DATA_DIR, 'db-config.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {}
  }
}

// Global In-Memory Stores backed by disk
const participants: Map<string, ParticipantRecord> = new Map();
let scanHistory: ScanLog[] = [];

let dbConfig: DatabaseConfigData = {
  databaseType: 'google_sheets',
  databaseUrl: process.env.BACKEND_WEBHOOK_URL || process.env.DATABASE_URL || '',
  apiKey: process.env.DATABASE_API_KEY || '',
  authHeader: '',
  enabled: true,
  lastConnectedAt: undefined,
  lastStatus: '',
};

// Load saved config & records on startup
function initializeDataStore() {
  ensureDataDir();

  // Load Config
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      dbConfig = { ...dbConfig, ...savedConfig };
    }
  } catch (err) {
    console.warn('Could not read db-config.json:', err);
  }

  // Load Records
  try {
    if (fs.existsSync(RECORDS_FILE)) {
      const savedData = JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf-8'));
      if (Array.isArray(savedData.participants)) {
        for (const p of savedData.participants) {
          participants.set(p.token, p);
        }
      }
      if (Array.isArray(savedData.scans)) {
        scanHistory = savedData.scans;
      }
      console.log(`Loaded ${participants.size} participants and ${scanHistory.length} scans from storage.`);
    }
  } catch (err) {
    console.warn('Could not read records.json:', err);
  }
}

function persistRecords() {
  try {
    ensureDataDir();
    const data = {
      participants: Array.from(participants.values()),
      scans: scanHistory,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist records.json:', err);
  }
}

function persistConfig() {
  try {
    ensureDataDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dbConfig, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Could not persist db-config.json:', err);
  }
}

initializeDataStore();

const TOTAL_REQUIRED_FOR_RAFFLE = 3;
const TOTAL_STATIONS = 3;

// Helper to resolve vendor from token or ID
function findVendor(tokenOrId: string) {
  if (!tokenOrId) return VENDORS['Booth 1'];
  const clean = tokenOrId.trim();

  // Direct match
  if (VENDORS[clean]) return VENDORS[clean];

  for (const v of Object.values(VENDORS)) {
    if (
      v.id.toLowerCase() === clean.toLowerCase() ||
      v.token.toLowerCase() === clean.toLowerCase() ||
      v.name.toLowerCase() === clean.toLowerCase()
    ) {
      return v;
    }
  }

  // Keyword / alias matching
  const lower = clean.toLowerCase();
  if (lower.includes('netsec') || lower.includes('booth 1') || lower.includes('booth1') || lower === 'b1' || lower === 'v1') {
    return VENDORS['Booth 1'];
  }
  if (lower.includes('tvm') || lower.includes('booth 2') || lower.includes('booth2') || lower === 'b2' || lower === 'v2') {
    return VENDORS['Booth 2'];
  }
  if (lower.includes('secops') || lower.includes('booth 3') || lower.includes('booth3') || lower === 'b3' || lower === 'v3') {
    return VENDORS['Booth 3'];
  }

  return VENDORS['Booth 1']; // default fallback
}

// Forward scan payload to user's live database (Google Sheets, REST API, Supabase, Webhook)
async function sendToLiveDatabase(payload: any, targetUrl?: string) {
  const url = (targetUrl || dbConfig.databaseUrl || '').trim();
  if (!url || !dbConfig.enabled) {
    return { synced: false, error: 'Live database not configured or disabled' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (dbConfig.apiKey) {
    headers['apikey'] = dbConfig.apiKey;
    headers['Authorization'] = `Bearer ${dbConfig.apiKey}`;
  }
  if (dbConfig.authHeader) {
    headers['Authorization'] = dbConfig.authHeader;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = { rawText: text };
    }

    if (response.ok) {
      dbConfig.lastConnectedAt = Date.now();
      dbConfig.lastStatus = `OK ${response.status}`;
      return {
        synced: true,
        status: response.status,
        data,
      };
    } else {
      const errMsg = `HTTP ${response.status}: ${typeof data === 'object' && data.error ? data.error : text.slice(0, 150)}`;
      dbConfig.lastStatus = errMsg;
      return {
        synced: false,
        status: response.status,
        error: errMsg,
        data,
      };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    const errMsg = err.name === 'AbortError' ? 'Live database connection timed out (8s limit)' : (err.message || 'Network unreachable');
    dbConfig.lastStatus = errMsg;
    return {
      synced: false,
      error: errMsg,
    };
  }
}

// ----------------- API ROUTES ----------------- //

app.get('/api/health', (req, res) => {
  const pendingSyncs = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    vendorsCount: Object.keys(VENDORS).length,
    participantsCount: participants.size,
    scansCount: scanHistory.length,
    pendingSyncCount: pendingSyncs,
    liveDatabaseConfigured: !!dbConfig.databaseUrl,
    databaseType: dbConfig.databaseType,
  });
});

// 1. Validate Vendor Station (matches google.script.run validateVendorStation)
app.get('/api/vendor/validate', (req, res) => {
  const vendorToken = (req.query.vendorToken || req.query.token || req.query.vendor || 'V04') as string;
  const vendor = findVendor(vendorToken);
  res.json({
    success: true,
    vendor: vendor.id,
    vendorName: vendor.name,
    category: vendor.category,
    stampTitle: vendor.stampTitle,
    token: vendor.token,
  });
});

// 2. Record Vendor Scan (Records locally and updates live database)
app.post('/api/vendor/scan', async (req, res) => {
  try {
    const { vendorToken, participantToken } = req.body;

    if (!participantToken || !participantToken.trim()) {
      res.status(400).json({ success: false, message: 'Participant token is required.' });
      return;
    }

    let token = participantToken.trim();
    // Parse URL if formatted as https://domain.com/passport?p=PT-XXXX
    try {
      if (token.startsWith('http://') || token.startsWith('https://')) {
        const u = new URL(token);
        token = u.searchParams.get('p') || u.searchParams.get('participant') || u.searchParams.get('token') || token;
      } else if (token.startsWith('{') && token.endsWith('}')) {
        const parsed = JSON.parse(token);
        token = parsed.p || parsed.participantToken || parsed.token || token;
      }
    } catch (e) {}

    const vendor = findVendor(vendorToken || 'V04');

    // Lookup existing participant or prepare draft
    let participant = participants.get(token);
    if (!participant) {
      const nextNum = participants.size + 1;
      participant = {
        token,
        participantId: `CSAM-${String(nextNum).padStart(3, '0')}`,
        name: `Guest Participant (${token.slice(0, 8)})`,
        office: 'Attendee — Security Summit 2026',
        completedVendors: [],
      };
      participants.set(token, participant);
    }

    const alreadyCompleted = participant.completedVendors.includes(vendor.id);
    if (!alreadyCompleted) {
      participant.completedVendors.push(vendor.id);
    }

    let completion = participant.completedVendors.length;
    let isRaffleQualified = completion >= TOTAL_REQUIRED_FOR_RAFFLE;
    participant.raffleQualified = isRaffleQualified;
    participant.lastScannedAt = new Date().toISOString();

    // Prepare Live Database synchronization payload
    const liveDbPayload = {
      action: 'recordVendorScan',
      event: 'SCAN_RECORDED',
      timestamp: new Date().toISOString(),
      vendorToken: vendor.token,
      vendorId: vendor.id,
      vendorName: vendor.name,
      boothId: vendor.id,
      boothName: vendor.name,
      boothColumn: vendor.id, // Target column in Google Sheets: e.g. "Booth 1", "Booth 2", "Booth 3"
      vendorCategory: vendor.category,
      stampTitle: vendor.stampTitle,
      participantToken: token,
      participantId: participant.participantId,
      participantName: participant.name,
      participantOffice: participant.office,
      isDuplicate: alreadyCompleted,
      completionCount: completion,
      totalRequired: TOTAL_STATIONS,
      raffleQualified: isRaffleQualified,
      currentParticipant: {
        token: participant.token,
        participantId: participant.participantId,
        name: participant.name,
        office: participant.office,
        completedVendors: participant.completedVendors,
        completionCount: completion,
      },
    };

    // Forward to user's live database (Google Sheets Apps Script or Webhook)
    const syncResult = await sendToLiveDatabase(liveDbPayload);

    let updatedColumn: string = vendor.id;
    let rowNumber: number | undefined = undefined;
    let sheetName: string | undefined = undefined;

    // Merge live database response into participant record if provided
    if (syncResult.synced && syncResult.data) {
      const d = syncResult.data;
      const remotePart = d.participant || d.attendee || d.record || d;

      if (d.updatedColumn || remotePart.updatedColumn) {
        updatedColumn = d.updatedColumn || remotePart.updatedColumn;
      }
      if (typeof d.rowNumber === 'number' || typeof remotePart.rowNumber === 'number') {
        rowNumber = d.rowNumber ?? remotePart.rowNumber;
      }
      if (typeof d.sheetName === 'string' || typeof remotePart.sheetName === 'string') {
        sheetName = d.sheetName ?? remotePart.sheetName;
      }

      if (remotePart.name && typeof remotePart.name === 'string') {
        participant.name = remotePart.name;
      }
      if (remotePart.office && typeof remotePart.office === 'string') {
        participant.office = remotePart.office;
      }
      if (remotePart.participantId && typeof remotePart.participantId === 'string') {
        participant.participantId = remotePart.participantId;
      }
      if (Array.isArray(remotePart.completedVendors)) {
        participant.completedVendors = remotePart.completedVendors;
        completion = participant.completedVendors.length;
      }
      if (typeof remotePart.completion === 'number') {
        completion = remotePart.completion;
      }
      if (typeof remotePart.raffleQualified === 'boolean') {
        isRaffleQualified = remotePart.raffleQualified;
        participant.raffleQualified = isRaffleQualified;
      }
    }

    // Create persistent scan log
    const log: ScanLog = {
      id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
      dateTime: new Date().toLocaleString(),
      participantId: participant.participantId || participant.token,
      participantToken: participant.token,
      participantName: participant.name,
      participantOffice: participant.office,
      vendorId: vendor.id,
      vendorName: vendor.name,
      isDuplicate: alreadyCompleted,
      completionCount: completion,
      totalRequired: TOTAL_STATIONS,
      raffleQualified: isRaffleQualified,
      syncedToExternal: syncResult.synced,
      syncError: syncResult.error || null,
      databaseType: dbConfig.databaseType,
      updatedColumn,
      rowNumber,
      sheetName,
    };

    scanHistory.unshift(log);
    persistRecords();

    // Format response matching Google Apps Script structure
    res.json({
      success: true,
      ok: true,
      duplicate: alreadyCompleted,
      participantId: participant.participantId || participant.token,
      vendor: vendor.id,
      vendorName: vendor.name,
      name: participant.name,
      office: participant.office,
      completion,
      total: TOTAL_STATIONS,
      raffleQualified: isRaffleQualified,
      updatedColumn,
      rowNumber,
      sheetName,
      message: alreadyCompleted
        ? `Vendor ${vendor.id} was already completed.`
        : `Vendor ${vendor.id} stamped and recorded to Google Sheets column [${updatedColumn}].`,
      externalBackend: dbConfig.databaseUrl
        ? {
            synced: syncResult.synced,
            url: dbConfig.databaseUrl,
            databaseType: dbConfig.databaseType,
            updatedColumn,
            rowNumber,
            sheetName,
            error: syncResult.error || null,
            rawResponse: syncResult.data || null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Scan processing error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Server error processing scan.' });
  }
});

// 3. Get Scan History
app.get('/api/vendor/scans', (req, res) => {
  const vendorId = req.query.vendorId as string;
  if (vendorId) {
    const filtered = scanHistory.filter((s) => s.vendorId === vendorId);
    res.json({ scans: filtered, total: filtered.length });
  } else {
    res.json({ scans: scanHistory, total: scanHistory.length });
  }
});

// 4. Clear Scan History
app.delete('/api/vendor/scans', (req, res) => {
  scanHistory = [];
  persistRecords();
  res.json({ success: true, message: 'Scan history reset.' });
});

// 5. Participants Directory
app.get('/api/vendor/participants', (req, res) => {
  res.json({ participants: Array.from(participants.values()) });
});

// 6. Pre-seed or Upsert Participants (Organizer tool)
app.post('/api/vendor/participants/upsert', (req, res) => {
  const { participants: newParticipants } = req.body;
  if (!Array.isArray(newParticipants)) {
    res.status(400).json({ success: false, message: 'Expected array of participants.' });
    return;
  }

  let count = 0;
  for (const p of newParticipants) {
    if (p.token) {
      const existing = participants.get(p.token);
      participants.set(p.token, {
        token: p.token,
        participantId: p.participantId || existing?.participantId || `CSAM-${String(participants.size + 1).padStart(3, '0')}`,
        name: p.name || existing?.name || `Participant ${p.token.slice(0, 6)}`,
        office: p.office || existing?.office || 'Summit Attendee',
        completedVendors: p.completedVendors || existing?.completedVendors || [],
        raffleQualified: p.raffleQualified || existing?.raffleQualified || false,
      });
      count++;
    }
  }
  persistRecords();
  res.json({ success: true, count, total: participants.size });
});

// 7. Retry Syncing Pending/Failed Scans to Live Database
app.post('/api/vendor/sync-pending', async (req, res) => {
  if (!dbConfig.databaseUrl) {
    res.status(400).json({ success: false, message: 'No live database URL configured.' });
    return;
  }

  const pending = scanHistory.filter((s) => s.syncedToExternal === false);
  let syncedCount = 0;
  let failCount = 0;

  for (const scan of pending) {
    const payload = {
      action: 'recordVendorScan',
      event: 'RETRY_SYNC',
      timestamp: new Date(scan.timestamp).toISOString(),
      vendorId: scan.vendorId,
      vendorName: scan.vendorName,
      participantToken: scan.participantToken,
      participantId: scan.participantId,
      participantName: scan.participantName,
      participantOffice: scan.participantOffice,
      isDuplicate: scan.isDuplicate,
      completionCount: scan.completionCount,
      totalRequired: scan.totalRequired,
      raffleQualified: scan.raffleQualified,
    };

    const resSync = await sendToLiveDatabase(payload);
    if (resSync.synced) {
      scan.syncedToExternal = true;
      scan.syncError = null;
      syncedCount++;
    } else {
      scan.syncError = resSync.error || 'Retry failed';
      failCount++;
    }
  }

  persistRecords();
  res.json({
    success: true,
    synced: syncedCount,
    failed: failCount,
    message: `Processed ${pending.length} pending scans. (${syncedCount} synced, ${failCount} failed)`,
  });
});

// 8. Live Database Link Configuration
app.get('/api/backend/config', (req, res) => {
  const pendingCount = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    backendUrl: dbConfig.databaseUrl,
    databaseUrl: dbConfig.databaseUrl,
    databaseType: dbConfig.databaseType,
    apiKey: dbConfig.apiKey,
    authHeader: dbConfig.authHeader,
    enabled: dbConfig.enabled,
    hasExternalBackend: !!dbConfig.databaseUrl,
    builtInBackendActive: true,
    lastConnectedAt: dbConfig.lastConnectedAt,
    lastStatus: dbConfig.lastStatus,
    pendingSyncCount: pendingCount,
  });
});

app.post('/api/backend/config', (req, res) => {
  const { backendUrl, databaseUrl, databaseType, apiKey, authHeader, enabled } = req.body;

  const resolvedUrl = typeof databaseUrl === 'string' ? databaseUrl.trim() : (typeof backendUrl === 'string' ? backendUrl.trim() : dbConfig.databaseUrl);
  
  dbConfig.databaseUrl = resolvedUrl;
  if (databaseType) dbConfig.databaseType = databaseType;
  if (apiKey !== undefined) dbConfig.apiKey = apiKey.trim();
  if (authHeader !== undefined) dbConfig.authHeader = authHeader.trim();
  if (enabled !== undefined) dbConfig.enabled = !!enabled;

  persistConfig();

  const pendingCount = scanHistory.filter((s) => s.syncedToExternal === false).length;
  res.json({
    success: true,
    backendUrl: dbConfig.databaseUrl,
    databaseUrl: dbConfig.databaseUrl,
    databaseType: dbConfig.databaseType,
    hasExternalBackend: !!dbConfig.databaseUrl,
    enabled: dbConfig.enabled,
    pendingSyncCount: pendingCount,
  });
});

// 9. Test Live Database Handshake
app.post('/api/backend/test', async (req, res) => {
  const targetUrl = (req.body.databaseUrl || req.body.backendUrl || dbConfig.databaseUrl || '').trim();
  if (!targetUrl) {
    res.status(400).json({ success: false, message: 'Please provide a live database URL link.' });
    return;
  }

  const testType = req.body.databaseType || dbConfig.databaseType || 'google_sheets';
  const apiKey = req.body.apiKey !== undefined ? req.body.apiKey : dbConfig.apiKey;
  const authHeader = req.body.authHeader !== undefined ? req.body.authHeader : dbConfig.authHeader;

  try {
    const startTime = Date.now();
    const testPayload = {
      action: 'validateVendorStation',
      event: 'HANDSHAKE_TEST',
      vendorToken: 'TOKEN-BOOTH-1-NETSEC',
      vendorId: 'Booth 1',
      vendorName: 'Booth 1 - Netsec',
      ping: 'test-handshake',
      testParticipantToken: 'TEST-PARTICIPANT-001',
      timestamp: new Date().toISOString(),
      source: 'BoothMaster QR Portal Live DB Connector',
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (apiKey) {
      headers['apikey'] = apiKey;
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(testPayload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const elapsed = Date.now() - startTime;
    const responseText = await response.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(responseText);
    } catch (e) {
      parsed = responseText.slice(0, 400);
    }

    res.json({
      success: response.ok,
      status: response.status,
      latencyMs: elapsed,
      response: parsed,
      sentPayload: testPayload,
      databaseType: testType,
      message: response.ok
        ? `Successfully connected to live database in ${elapsed}ms!`
        : `Database returned HTTP status ${response.status}`,
    });
  } catch (err: any) {
    res.status(502).json({
      success: false,
      message: err.name === 'AbortError' ? 'Connection timed out after 8s' : `Failed connecting to live database: ${err.message || 'Network unreachable'}`,
    });
  }
});

// ----------------- VITE MIDDLEWARE SETUP ----------------- //

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BoothMaster Vendor Portal Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

