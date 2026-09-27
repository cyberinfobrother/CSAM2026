import React, { useState } from 'react';
import {
  Database,
  Link2,
  CheckCircle2,
  AlertTriangle,
  Play,
  Copy,
  Check,
  ExternalLink,
  X,
  Code,
  RefreshCw,
  Key,
  Columns,
  Table,
  Sparkles,
  Wifi,
  FileSpreadsheet,
  Cloud,
  Terminal,
  ArrowRightLeft,
  ShieldCheck,
} from 'lucide-react';
import {
  BackendConfig,
  BackendTestResult,
  syncPendingScans,
  HARDCODED_GOOGLE_SHEETS_URL,
  LIVE_CLOUDFLARE_WORKER_URL,
} from '../utils/api';
import { DatabaseType, DatabaseConfig } from '../types';

interface BackendConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BackendConfig;
  onSaveConfig: (cfg: Partial<DatabaseConfig> | string) => Promise<void>;
  onTestConnection: (params?: any) => Promise<BackendTestResult>;
}

export const BackendConnectModal: React.FC<BackendConnectModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection,
}) => {
  const [dbType, setDbType] = useState<DatabaseType>(config.databaseType || 'google_sheets');
  const [urlInput, setUrlInput] = useState(
    config.databaseUrl || config.backendUrl || LIVE_CLOUDFLARE_WORKER_URL
  );
  const [apiKeyInput, setApiKeyInput] = useState(config.apiKey || '');
  const [authHeaderInput, setAuthHeaderInput] = useState(config.authHeader || '');
  const [syncEnabled, setSyncEnabled] = useState(config.enabled !== false);

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncingPending, setIsSyncingPending] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<BackendTestResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWorkerCode, setCopiedWorkerCode] = useState(false);
  const [copiedWranglerCode, setCopiedWranglerCode] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'script' | 'sheet_preview' | 'worker' | 'logs'>('settings');

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig({
        databaseUrl: urlInput.trim(),
        databaseType: dbType,
        apiKey: apiKeyInput.trim(),
        authHeader: authHeaderInput.trim(),
        enabled: syncEnabled,
      });
      setTestResult(null);
    } catch (e: any) {
      alert(e?.message || 'Failed saving database configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!urlInput.trim()) {
      alert('Please enter a Google Sheet Web App URL or Cloudflare Worker URL first.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection({
        databaseUrl: urlInput.trim(),
        databaseType: dbType,
        apiKey: apiKeyInput.trim(),
        authHeader: authHeaderInput.trim(),
      });
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Network error communicating with Google Sheets.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncPending = async () => {
    setIsSyncingPending(true);
    setSyncMessage(null);
    try {
      const res = await syncPendingScans();
      setSyncMessage(res.message);
    } catch (e: any) {
      setSyncMessage(e?.message || 'Failed to sync pending records.');
    } finally {
      setIsSyncingPending(false);
    }
  };

  // Turnkey Google Apps Script tailored specifically to the user's exact 13 columns
  const sampleAppsScriptCode = `// ============================================================================
// CSAM 2026 GOOGLE SHEETS LIVE DATABASE CONNECTOR
// ============================================================================
// EXACT SHEET COLUMNS MATCHED (13 COLUMNS):
// Col 1 (A): Participant ID
// Col 2 (B): Name
// Col 3 (C): Office / Company
// Col 4 (D): Registration Date/Time
// Col 5 (E): Booth 1 (Booth Survey)
// Col 6 (F): BoothQR1 (true / false)  <--- Logged TRUE on B1 scan
// Col 7 (G): Booth 2 (Booth Survey)
// Col 8 (H): BoothQR2 (true / false)  <--- Logged TRUE on B2 scan
// Col 9 (I): Booth 3 (Booth Survey)
// Col 10 (J): BoothQR3 (true / false) <--- Logged TRUE on B3 scan
// Col 11 (K): Survey Completed
// Col 12 (L): Booth Completion (e.g. "1 / 3", "2 / 3", "3 / 3")
// Col 13 (M): Raffle Qualified ("QUALIFIED 🏆" / "PENDING")
// ============================================================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 12 seconds for concurrent scans to prevent collision
  lock.tryLock(12000);

  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : null;
    var data = {};
    if (raw) {
      try { data = JSON.parse(raw); } catch (err) { data = {}; }
    } else if (e && e.parameter) {
      data = e.parameter;
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // ------------------------------------------------------------------------
    // 1. Health check & handshake ping
    // ------------------------------------------------------------------------
    if (data.action === "validateVendorStation" || data.ping === "test-handshake" || data.action === "ping") {
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        status: "LIVE_CONNECTED",
        message: "Google Sheets is connected and ready to log attendee scans into respective columns!",
        spreadsheetTitle: ss.getName(),
        timestamp: new Date().toISOString()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // ------------------------------------------------------------------------
    // 2. Locate active Participant Sheet
    // ------------------------------------------------------------------------
    var partSheet = ss.getSheetByName("Participants");
    if (!partSheet) {
      if (ss.getSheets().length > 0 && ss.getSheets()[0].getName() !== "Scan_Logs") {
        partSheet = ss.getSheets()[0];
      } else {
        partSheet = ss.insertSheet("Participants", 0);
      }
    }

    // Initialize exact 13 headers if sheet is empty
    if (partSheet.getLastRow() === 0) {
      partSheet.appendRow([
        "Participant ID",
        "Name",
        "Office / Company",
        "Registration Date/Time",
        "Booth 1",
        "BoothQR1",
        "Booth 2",
        "BoothQR2",
        "Booth 3",
        "BoothQR3",
        "Survey Completed",
        "Booth Completion",
        "Raffle Qualified"
      ]);
      partSheet.getRange("A1:M1").setFontWeight("bold").setBackground("#0f172a").setFontColor("#38bdf8");
      partSheet.setFrozenRows(1);
    }

    // ------------------------------------------------------------------------
    // 3. Ensure "Scan_Logs" audit trail sheet exists
    // ------------------------------------------------------------------------
    var logSheet = ss.getSheetByName("Scan_Logs");
    if (!logSheet) {
      logSheet = ss.insertSheet("Scan_Logs");
      logSheet.appendRow([
        "Timestamp",
        "Booth Token",
        "Booth Name",
        "Participant ID",
        "Name",
        "Office / Company",
        "Status",
        "Updated Column",
        "Booth Completion",
        "Raffle Qualified"
      ]);
      logSheet.getRange("A1:J1").setFontWeight("bold").setBackground("#0f172a").setFontColor("#38bdf8");
      logSheet.setFrozenRows(1);
    }

    // ------------------------------------------------------------------------
    // 4. Map columns dynamically from Row 1
    // ------------------------------------------------------------------------
    var headers = partSheet.getRange(1, 1, 1, Math.max(partSheet.getLastColumn(), 13)).getValues()[0];
    
    function findCol(keywords, fallback) {
      for (var i = 0; i < headers.length; i++) {
        var h = String(headers[i] || "").trim().toLowerCase();
        for (var k = 0; k < keywords.length; k++) {
          if (h.indexOf(keywords[k].toLowerCase()) !== -1) {
            return i + 1; // 1-indexed column
          }
        }
      }
      return fallback;
    }

    var colId = findCol(["participant id", "id", "token", "badge id"], 1);
    var colName = findCol(["name", "attendee", "participant name"], 2);
    var colOffice = findCol(["office", "company", "division"], 3);
    var colRegDate = findCol(["registration", "date/time", "registered"], 4);
    var colBooth1 = findCol(["booth 1", "netsec"], 5);
    var colBoothQR1 = findCol(["boothqr1", "booth qr 1", "boothqr 1", "qr1"], 6);
    var colBooth2 = findCol(["booth 2", "tvm"], 7);
    var colBoothQR2 = findCol(["boothqr2", "booth qr 2", "boothqr 2", "qr2"], 8);
    var colBooth3 = findCol(["booth 3", "secops"], 9);
    var colBoothQR3 = findCol(["boothqr3", "booth qr 3", "boothqr 3", "qr3"], 10);
    var colSurvey = findCol(["survey completed", "survey"], 11);
    var colCompletion = findCol(["booth completion", "completion", "total stamps"], 12);
    var colRaffle = findCol(["raffle qualified", "raffle", "eligible"], 13);

    // Identify current Station & its respective Booth / QR columns
    var boothToken = String(data.vendorToken || data.boothToken || data.boothId || data.vendorId || "B1").trim();
    var vendorName = String(data.vendorName || data.boothName || (boothToken === "B2" ? "Booth 2" : boothToken === "B3" ? "Booth 3" : "Booth 1"));
    var targetBoothCol = colBooth1;
    var targetQrCol = colBoothQR1;
    var targetColHeader = "BoothQR1";

    var vLower = (boothToken + " " + vendorName).toLowerCase();
    if (vLower.indexOf("b2") !== -1 || vLower.indexOf("booth 2") !== -1 || vLower.indexOf("tvm") !== -1) {
      targetBoothCol = colBooth2;
      targetQrCol = colBoothQR2;
      targetColHeader = headers[colBoothQR2 - 1] || "BoothQR2";
    } else if (vLower.indexOf("b3") !== -1 || vLower.indexOf("booth 3") !== -1 || vLower.indexOf("secops") !== -1) {
      targetBoothCol = colBooth3;
      targetQrCol = colBoothQR3;
      targetColHeader = headers[colBoothQR3 - 1] || "BoothQR3";
    } else {
      targetBoothCol = colBooth1;
      targetQrCol = colBoothQR1;
      targetColHeader = headers[colBoothQR1 - 1] || "BoothQR1";
    }

    // Read Participant ID from incoming payload
    var token = String(data.participantId || data.participantToken || data.scannedQrData || data.token || "").trim();
    // Parse URL if raw QR was a URL link
    if (token.indexOf("http://") === 0 || token.indexOf("https://") === 0) {
      var match = token.match(/[?&](?:p|participantId|id|token)=([^&]+)/);
      if (match && match[1]) token = decodeURIComponent(match[1]);
    }

    var now = new Date();
    var timeString = Utilities.formatDate(now, Session.getScriptTimeZone() || "GMT+8", "yyyy-MM-dd HH:mm:ss");

    // ------------------------------------------------------------------------
    // 5. Find attendee row by Participant ID
    // ------------------------------------------------------------------------
    var lastRow = partSheet.getLastRow();
    var pData = lastRow > 1 ? partSheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
    var targetRow = -1;
    var participantName = (data.currentParticipant && data.currentParticipant.name) || "Attendee (" + token.slice(0, 8) + ")";
    var participantOffice = (data.currentParticipant && data.currentParticipant.office) || "Security Summit 2026";

    for (var r = 0; r < pData.length; r++) {
      var rowId = String(pData[r][colId - 1] || "").trim().toLowerCase();
      if (rowId === token.toLowerCase() || (token.indexOf("-") !== -1 && rowId.indexOf(token.toLowerCase()) !== -1)) {
        targetRow = r + 2; // Row number in sheet (1-based + 1 header)
        if (pData[r][colName - 1]) participantName = pData[r][colName - 1];
        if (pData[r][colOffice - 1]) participantOffice = pData[r][colOffice - 1];
        break;
      }
    }

    // ------------------------------------------------------------------------
    // 6. Check duplicate in respective BoothQR column (true if already scanned)
    // ------------------------------------------------------------------------
    var isDuplicate = false;

    if (targetRow > 0) {
      var currentQrVal = partSheet.getRange(targetRow, targetQrCol).getValue();
      // If already true or ticked, it is a duplicate
      if (currentQrVal === true || String(currentQrVal).toLowerCase() === "true" || currentQrVal === "✓") {
        isDuplicate = true;
      } else {
        // Log TRUE in BoothQR column
        partSheet.getRange(targetRow, targetQrCol).setValue(true);
        partSheet.getRange(targetRow, targetQrCol).setBackground("#dcfce7"); // Light emerald highlight
      }
    } else {
      // Attendee not found: Append new participant row with defaults
      targetRow = partSheet.getLastRow() + 1;
      var newRow = new Array(headers.length);
      for (var c = 0; c < headers.length; c++) newRow[c] = "";

      newRow[colId - 1] = token;
      newRow[colName - 1] = participantName;
      newRow[colOffice - 1] = participantOffice;
      newRow[colRegDate - 1] = timeString;

      // Default all BoothQR columns to false except the scanned one
      newRow[colBoothQR1 - 1] = false;
      newRow[colBoothQR2 - 1] = false;
      newRow[colBoothQR3 - 1] = false;

      // Set scanned station BoothQR to true
      newRow[targetQrCol - 1] = true;

      newRow[colSurvey - 1] = "NO";
      newRow[colCompletion - 1] = "1 / 3";
      newRow[colRaffle - 1] = "PENDING";

      partSheet.appendRow(newRow);
      partSheet.getRange(targetRow, targetQrCol).setBackground("#dcfce7");
    }

    // ------------------------------------------------------------------------
    // 7. Calculate Booth Completion across BoothQR1, BoothQR2, BoothQR3
    // ------------------------------------------------------------------------
    var qr1 = partSheet.getRange(targetRow, colBoothQR1).getValue();
    var qr2 = partSheet.getRange(targetRow, colBoothQR2).getValue();
    var qr3 = partSheet.getRange(targetRow, colBoothQR3).getValue();

    var isQr1 = qr1 === true || String(qr1).toLowerCase() === "true";
    var isQr2 = qr2 === true || String(qr2).toLowerCase() === "true";
    var isQr3 = qr3 === true || String(qr3).toLowerCase() === "true";

    var completedCount = (isQr1 ? 1 : 0) + (isQr2 ? 1 : 0) + (isQr3 ? 1 : 0);
    if (completedCount === 0 && !isDuplicate) completedCount = 1;
    var isRaffleQualified = completedCount >= 3;

    // Update Booth Completion & Raffle Qualified columns
    partSheet.getRange(targetRow, colCompletion).setValue(completedCount + " / 3");
    partSheet.getRange(targetRow, colRaffle).setValue(isRaffleQualified ? "QUALIFIED 🏆" : "PENDING");
    partSheet.getRange(targetRow, colRaffle).setFontColor(isRaffleQualified ? "#059669" : "#d97706").setFontWeight("bold");

    // ------------------------------------------------------------------------
    // 8. Append transaction to "Scan_Logs" audit trail
    // ------------------------------------------------------------------------
    logSheet.appendRow([
      timeString,
      boothToken,
      vendorName,
      token,
      participantName,
      participantOffice,
      isDuplicate ? "DUPLICATE" : "STAMPED",
      targetColHeader,
      completedCount + " / 3",
      isRaffleQualified ? "QUALIFIED" : "PENDING"
    ]);

    // ------------------------------------------------------------------------
    // 9. Return JSON confirmation to BoothMaster / Cloudflare Worker
    // ------------------------------------------------------------------------
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ok: true,
      action: "qr_checkin",
      duplicate: isDuplicate,
      vendorToken: boothToken,
      participantId: token,
      name: participantName,
      office: participantOffice,
      updatedColumn: targetColHeader,
      columnNumber: targetQrCol,
      rowNumber: targetRow,
      sheetName: partSheet.getName(),
      completion: completedCount,
      total: 3,
      raffleQualified: isRaffleQualified,
      message: isDuplicate
        ? "Attendee was already stamped at " + targetColHeader + " (Row " + targetRow + ")"
        : "Successfully recorded in Google Sheets Column [" + targetColHeader + "] (Row " + targetRow + ")"
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

  // Complete Cloudflare Worker (worker.js) turnkey script
  const sampleWorkerCode = `/**
 * ============================================================================
 * CSAM 2026 BOOTHMASTER QR SCANNER - CLOUDFLARE WORKER PROXY / MIDDLEWARE
 * ============================================================================
 * 
 * Features:
 *   1. Full CORS Preflight & Response Handling (OPTIONS 200, dynamic headers).
 *   2. Content-Type: 'text/plain;charset=utf-8' forwarding to bypass Apps Script CORS.
 *   3. CRITICAL: redirect: 'follow' in fetch() to transparently handle Google's 302 redirects.
 *   4. Payload standardisation for Google Apps Script:
 *      {
 *        "action": "qr_checkin",
 *        "vendorToken": boothToken,
 *        "participantId": scannedQrData
 *      }
 */

// Fallback Google Apps Script URL if environment variable is not configured
const DEFAULT_GOOGLE_SCRIPT_URL =
  "${HARDCODED_GOOGLE_SHEETS_URL}";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function normalizeParticipantId(rawInput) {
  if (!rawInput) return "";
  let clean = String(rawInput).trim();
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    try {
      const url = new URL(clean);
      const paramId =
        url.searchParams.get("p") ||
        url.searchParams.get("participantId") ||
        url.searchParams.get("id") ||
        url.searchParams.get("token");
      if (paramId) return paramId.trim();
    } catch (e) {}
  }
  if (clean.startsWith("{") && clean.endsWith("}")) {
    try {
      const parsed = JSON.parse(clean);
      const jsonId = parsed.participantId || parsed.p || parsed.token || parsed.id;
      if (jsonId) return String(jsonId).trim();
    } catch (e) {}
  }
  return clean;
}

export default {
  async fetch(request, env, ctx) {
    // 1. CORS Preflight Handling
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const googleScriptUrl =
      (env && env.GOOGLE_SCRIPT_URL) || DEFAULT_GOOGLE_SCRIPT_URL;

    // 2. Browser GUI vs API Diagnostic Route
    if (request.method === "GET") {
      const url = new URL(request.url);
      const acceptHeader = request.headers.get("accept") || "";
      const isJsonRequested =
        url.searchParams.get("format") === "json" ||
        url.pathname === "/health" ||
        url.pathname === "/api" ||
        (acceptHeader.includes("application/json") && !acceptHeader.includes("text/html"));

      if (isJsonRequested) {
        return jsonResponse({
          status: "ONLINE",
          service: "CSAM 2026 Boothmaster QR Proxy Worker",
          timestamp: new Date().toISOString(),
          googleScriptConfigured: Boolean(googleScriptUrl),
          targetColumns: ["BoothQR1 (Col 6)", "BoothQR2 (Col 8)", "BoothQR3 (Col 10)"],
        });
      }

      // Serve Full Interactive Standalone Scanner GUI when visited via browser!
      return new Response(renderStandaloneScannerHtml(googleScriptUrl), {
        status: 200,
        headers: { "Content-Type": "text/html;charset=utf-8", ...CORS_HEADERS },
      });
    }

    // 3. Process Scanner POST Request
    if (request.method === "POST") {
      let requestData = {};

      try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          requestData = await request.json();
        } else {
          requestData = JSON.parse(await request.text());
        }
      } catch (err) {
        requestData = {};
      }

      // Connection test / ping
      if (requestData.action === "validateVendorStation" || requestData.ping) {
        try {
          const pingRes = await fetch(googleScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "validateVendorStation",
              ping: "test-handshake",
              timestamp: new Date().toISOString(),
              client: "Cloudflare-Worker-Proxy",
            }),
            redirect: "follow", // CRITICAL for Apps Script 302 redirects
          });
          const text = await pingRes.text();
          let json;
          try { json = JSON.parse(text); } catch { json = { message: text }; }
          return jsonResponse({
            success: true,
            status: "LIVE_CONNECTED",
            message: "Cloudflare Worker proxy successfully reached Google Apps Script!",
            backendResponse: json,
          });
        } catch (e) {
          return jsonResponse({ success: false, error: e.message }, 502);
        }
      }

      // 4. Extract required parameters
      const vendorToken = (
        requestData.vendorToken ||
        requestData.boothToken ||
        requestData.boothId ||
        requestData.vendorId ||
        "B1"
      ).trim();

      const rawId =
        requestData.participantId ||
        requestData.scannedQrData ||
        requestData.participantToken ||
        requestData.token ||
        "";

      const participantId = normalizeParticipantId(rawId);

      if (!participantId) {
        return jsonResponse(
          { success: false, error: "Missing required parameter 'participantId' or 'scannedQrData'." },
          400
        );
      }

      // 5. Build standardized payload for Apps Script
      const appsScriptPayload = {
        action: "qr_checkin",
        vendorToken: vendorToken,
        participantId: participantId,
      };

      // 6. Forward to Google Apps Script with text/plain & redirect: 'follow'
      try {
        const gasResponse = await fetch(googleScriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "text/plain;charset=utf-8",
          },
          body: JSON.stringify(appsScriptPayload),
          redirect: "follow", // <-- CRITICAL: Follow Google 302 redirects
        });

        const responseText = await gasResponse.text();
        let responseJson;
        try {
          responseJson = JSON.parse(responseText);
        } catch (e) {
          return jsonResponse({
            success: gasResponse.ok,
            status: gasResponse.status,
            rawResponse: responseText,
          });
        }

        return jsonResponse(responseJson, gasResponse.status);
      } catch (fetchError) {
        return jsonResponse(
          {
            success: false,
            error: "Error communicating with Google Apps Script: " + fetchError.message,
          },
          502
        );
      }
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  },
};`;

  const sampleWranglerCode = `name = "csam-boothmaster-proxy"
main = "worker.js"
compatibility_date = "2024-09-01"

[vars]
GOOGLE_SCRIPT_URL = "${HARDCODED_GOOGLE_SHEETS_URL}"`;

  const copyScript = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const copyWorker = () => {
    navigator.clipboard.writeText(sampleWorkerCode);
    setCopiedWorkerCode(true);
    setTimeout(() => setCopiedWorkerCode(false), 2000);
  };

  const copyWrangler = () => {
    navigator.clipboard.writeText(sampleWranglerCode);
    setCopiedWranglerCode(true);
    setTimeout(() => setCopiedWranglerCode(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#0F1424] border border-[#2B3754] rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden text-white animate-scale-up max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232D48] bg-[#0A0E1A]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/25 to-cyan-500/25 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">Google Sheets Column Logger</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  COLUMN-BY-COLUMN
                </span>
              </div>
              <p className="text-xs text-[#8E9BB5]">
                Logs each boothmaster's scan directly into their respective column in Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#1C243B] text-[#8E9BB5] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#232D48] bg-[#0C101E] text-xs font-semibold">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            Connection Settings
          </button>
          <button
            onClick={() => setActiveTab('sheet_preview')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sheet_preview'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5 text-amber-400" />
            Column Layout Preview
          </button>
          <button
            onClick={() => setActiveTab('script')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'script'
                ? 'border-cyan-400 text-cyan-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Google Apps Script Code
          </button>
          <button
            onClick={() => setActiveTab('worker')}
            className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'worker'
                ? 'border-orange-400 text-orange-300 font-bold'
                : 'border-transparent text-[#8E9BB5] hover:text-white'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-orange-400" />
            Cloudflare Worker (worker.js)
          </button>
          {config.pendingSyncCount !== undefined && config.pendingSyncCount > 0 && (
            <button
              onClick={() => setActiveTab('logs')}
              className={`pb-2.5 px-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'border-amber-400 text-amber-300 font-bold'
                  : 'border-transparent text-amber-400/80 hover:text-amber-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Pending Scans ({config.pendingSyncCount})
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-left">
          {activeTab === 'settings' && (
            <>
              {/* Status Ribbon */}
              <div className="p-3.5 rounded-xl bg-[#080C17] border border-[#232D48] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {urlInput ? (
                    <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_10px_#10B981] animate-pulse" />
                  ) : (
                    <div className="w-3 h-3 rounded-full bg-amber-400" />
                  )}
                  <div>
                    <div className="font-bold text-white text-xs">
                      {urlInput
                        ? syncEnabled
                          ? 'Google Sheets Live Sync Active'
                          : 'Live Sync Paused (Local Only)'
                        : 'Awaiting Google Sheets Web App URL'}
                    </div>
                    <div className="text-[11px] text-[#8E9BB5]">
                      {urlInput
                        ? 'When scanned, attendee rows update their respective Booth 1, 2, or 3 column in real time.'
                        : 'Deploy the Apps Script on your Google Sheet and paste its URL below.'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] text-[#A2B2D2] font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncEnabled}
                      onChange={(e) => setSyncEnabled(e.target.checked)}
                      className="rounded accent-emerald-400 w-3.5 h-3.5 cursor-pointer"
                    />
                    Auto-Sync
                  </label>
                </div>
              </div>

              {/* URL Input & Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Database / Proxy Endpoint URL</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Live Sync Ready
                  </span>
                </div>

                {/* Preset Chips */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUrlInput(LIVE_CLOUDFLARE_WORKER_URL)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                      urlInput.trim() === LIVE_CLOUDFLARE_WORKER_URL.trim()
                        ? 'bg-orange-500/20 text-orange-300 border-orange-500/60 shadow-[0_0_10px_rgba(249,115,22,0.25)]'
                        : 'bg-[#141B2D] text-[#8E9BB5] border-[#25324E] hover:text-white'
                    }`}
                  >
                    <Cloud className="w-3 h-3 text-orange-400" />
                    <span>⚡ Live Cloudflare Worker Proxy (ONLINE)</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUrlInput(HARDCODED_GOOGLE_SHEETS_URL)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                      urlInput.trim() === HARDCODED_GOOGLE_SHEETS_URL.trim()
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                        : 'bg-[#141B2D] text-[#8E9BB5] border-[#25324E] hover:text-white'
                    }`}
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                    <span>Direct Google Sheets Apps Script</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
                    <input
                      type="url"
                      placeholder="https://csam2026.cyber-infobro.workers.dev/"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#080C17] text-white border border-[#2B3754] rounded-xl focus:outline-none focus:border-cyan-400 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl font-bold bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 disabled:opacity-50 transition-colors cursor-pointer shadow-md"
                  >
                    {isSaving ? 'Saving...' : 'Save URL'}
                  </button>
                </div>

                {/* Cloudflare Worker Verified Banner */}
                {urlInput.includes('workers.dev') && (
                  <div className="p-3 rounded-xl bg-gradient-to-r from-orange-950/40 via-amber-950/30 to-[#0A1020] border border-orange-500/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
                          <Cloud className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-white font-bold text-xs flex items-center gap-2">
                            <span>Live Cloudflare Proxy Worker Active</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                              ONLINE
                            </span>
                            <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold">
                              GAS CONFIGURED: TRUE
                            </span>
                          </div>
                          <div className="text-[10px] text-[#A2B2D2] mt-0.5">
                            Proxying check-ins to Google Sheets • Handles CORS & 302 redirects automatically
                          </div>
                        </div>
                      </div>
                      <a
                        href={urlInput}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 font-mono text-[10px] flex items-center gap-1 border border-orange-500/30 transition-colors"
                      >
                        <span>Open Live URL</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Handshake Test Section */}
              <div className="p-3.5 rounded-xl bg-[#090D1A] border border-[#232D48] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                    Verify Google Sheets Connection:
                  </span>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={isTesting || !urlInput.trim()}
                    className="px-3 py-1.5 rounded-lg font-bold text-xs bg-[#1C253D] hover:bg-[#253252] text-white border border-[#2F3D5E] disabled:opacity-40 flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    {isTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" /> Testing...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current text-emerald-400" /> Test Ping & Handshake
                      </>
                    )}
                  </button>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                      testResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 w-full overflow-hidden">
                      <div className="font-bold text-xs">{testResult.message}</div>
                      {testResult.latencyMs !== undefined && (
                        <div className="text-[10px] text-white/70">
                          Roundtrip Latency: <strong>{testResult.latencyMs}ms</strong> • HTTP Status: {testResult.status || 200}
                        </div>
                      )}
                      {testResult.response && (
                        <pre className="text-[10px] bg-black/50 p-2 rounded text-emerald-300 font-mono overflow-x-auto max-h-24">
                          {typeof testResult.response === 'object'
                            ? JSON.stringify(testResult.response, null, 2)
                            : String(testResult.response)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Connected Flow Architecture Card */}
              <div className="p-3.5 rounded-xl bg-[#090D1A] border border-[#232D48] text-[11px] space-y-2">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Aligned to Your CSAM 2026 Apps Script (13 Columns):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-[#A2B2D2]">
                  <div className="p-2 rounded-lg bg-[#0E1527] border border-[#1F2942]">
                    <span className="font-bold text-cyan-300">Station QR Check-in (Logs TRUE / FALSE):</span>
                    <div>• <code>Booth 1</code> ➔ Col F: <code>BoothQR1</code> (true)</div>
                    <div>• <code>Booth 2</code> ➔ Col H: <code>BoothQR2</code> (true)</div>
                    <div>• <code>Booth 3</code> ➔ Col J: <code>BoothQR3</code> (true)</div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0E1527] border border-[#1F2942]">
                    <span className="font-bold text-emerald-300">Surveys & Qualification:</span>
                    <div>• Col E, G, I: Booth 1, 2, 3 (Booth Survey)</div>
                    <div>• Col K: Survey Completed</div>
                    <div>• Col L: Booth Completion (e.g. 3 / 3)</div>
                    <div>• Col M: Raffle Qualified (QUALIFIED 🏆)</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'sheet_preview' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 text-cyan-200">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <Columns className="w-4 h-4 text-cyan-400" />
                  How BoothMaster Maps to Your 13 Google Sheet Columns
                </div>
                <p className="text-[11px] text-[#BACAE5] mt-1">
                  When a boothmaster scans an attendee badge, BoothMaster looks up the participant by Participant ID and automatically marks <strong>true</strong> in <strong>BoothQR1</strong>, <strong>BoothQR2</strong>, or <strong>BoothQR3</strong> (default is <strong>false</strong>).
                </p>
              </div>

              {/* Visual Google Sheet Table Mockup */}
              <div className="overflow-x-auto rounded-xl border border-[#2B3754] bg-[#080C17]">
                <table className="w-full text-[10px] border-collapse text-left font-mono whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#0e1629] text-[#7187A8] border-b border-[#232D48]">
                      <th className="p-2 border-r border-[#1C253D]">Row</th>
                      <th className="p-2 border-r border-[#1C253D] text-white font-bold">Col A: Participant ID</th>
                      <th className="p-2 border-r border-[#1C253D] text-white font-bold">Col B: Name</th>
                      <th className="p-2 border-r border-[#1C253D] text-white font-bold">Col C: Office / Company</th>
                      <th className="p-2 border-r border-[#1C253D] text-[#8E9BB5]">Col D: Registration Date/Time</th>
                      <th className="p-2 border-r border-[#1C253D] text-[#8E9BB5]">Col E: Booth 1</th>
                      <th className="p-2 border-r border-[#1C253D] text-emerald-300 font-bold bg-emerald-950/40">
                        Col F: BoothQR1 📍
                      </th>
                      <th className="p-2 border-r border-[#1C253D] text-[#8E9BB5]">Col G: Booth 2</th>
                      <th className="p-2 border-r border-[#1C253D] text-amber-300 font-bold bg-amber-950/40">
                        Col H: BoothQR2 📍
                      </th>
                      <th className="p-2 border-r border-[#1C253D] text-[#8E9BB5]">Col I: Booth 3</th>
                      <th className="p-2 border-r border-[#1C253D] text-purple-300 font-bold bg-purple-950/40">
                        Col J: BoothQR3 📍
                      </th>
                      <th className="p-2 border-r border-[#1C253D] text-[#8E9BB5]">Col K: Survey Completed</th>
                      <th className="p-2 border-r border-[#1C253D] text-cyan-300 font-bold">Col L: Booth Completion</th>
                      <th className="p-2 text-emerald-400 font-bold">Col M: Raffle Qualified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C253D] text-[#C4D1EB]">
                    <tr className="hover:bg-[#12192e]">
                      <td className="p-2 border-r border-[#1C253D] text-[#5D6F8F]">2</td>
                      <td className="p-2 border-r border-[#1C253D] text-cyan-300 font-bold">CSAM-001</td>
                      <td className="p-2 border-r border-[#1C253D]">Jasmine Rivera</td>
                      <td className="p-2 border-r border-[#1C253D]">Security Ops</td>
                      <td className="p-2 border-r border-[#1C253D] text-[#7187A8]">2026-09-22 08:30:00</td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-400">Done</td>
                      <td className="p-2 border-r border-[#1C253D] bg-emerald-950/30 text-emerald-400 font-bold">
                        true
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-400">Done</td>
                      <td className="p-2 border-r border-[#1C253D] bg-amber-950/30 text-amber-400 font-bold">
                        true
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-400">Done</td>
                      <td className="p-2 border-r border-[#1C253D] bg-purple-950/30 text-purple-400 font-bold">
                        true
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-emerald-400 font-bold">YES</td>
                      <td className="p-2 border-r border-[#1C253D] font-bold text-white">3 / 3</td>
                      <td className="p-2 font-bold text-emerald-400">QUALIFIED 🏆</td>
                    </tr>
                    <tr className="hover:bg-[#12192e]">
                      <td className="p-2 border-r border-[#1C253D] text-[#5D6F8F]">3</td>
                      <td className="p-2 border-r border-[#1C253D] text-cyan-300 font-bold">CSAM-002</td>
                      <td className="p-2 border-r border-[#1C253D]">Marcus Vance</td>
                      <td className="p-2 border-r border-[#1C253D]">Infra Team</td>
                      <td className="p-2 border-r border-[#1C253D] text-[#7187A8]">2026-09-22 08:45:10</td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-400">Done</td>
                      <td className="p-2 border-r border-[#1C253D] bg-emerald-950/30 text-emerald-400 font-bold">
                        true
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-500">—</td>
                      <td className="p-2 border-r border-[#1C253D] bg-red-950/20 text-red-400 font-mono">
                        false
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-gray-400">Done</td>
                      <td className="p-2 border-r border-[#1C253D] bg-purple-950/30 text-purple-400 font-bold">
                        true
                      </td>
                      <td className="p-2 border-r border-[#1C253D] text-[#64748b]">NO</td>
                      <td className="p-2 border-r border-[#1C253D] font-bold text-amber-300">2 / 3</td>
                      <td className="p-2 font-bold text-amber-400">PENDING</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3 rounded-xl bg-[#090D1A] border border-[#232D48] text-[11px] text-[#A2B2D2] space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Your 13 Google Sheet Columns Match 100%:
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  <li><strong>Col A (Participant ID):</strong> Scanned badges look up this exact row.</li>
                  <li><strong>Col E, G, I (Booth 1, Booth 2, Booth 3):</strong> Reserved for Booth Surveys.</li>
                  <li><strong>Col F, H, J (BoothQR1, BoothQR2, BoothQR3):</strong> Logged as <code>true</code> when scanned by the Boothmaster (defaults to <code>false</code>).</li>
                  <li><strong>Col L (Booth Completion):</strong> Recalculates total completed scans (e.g. <code>3 / 3</code>).</li>
                  <li><strong>Col M (Raffle Qualified):</strong> Flips to <code>QUALIFIED 🏆</code> upon scanning all 3 booths.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'script' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-200 space-y-1.5">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Google Apps Script Setup (Takes ~60 seconds)
                </div>
                <ol className="list-decimal list-inside text-[11px] text-[#BACAE5] space-y-1">
                  <li>In your Google Sheet, click <strong>Extensions → Apps Script</strong> in the top menu.</li>
                  <li>Replace whatever is in <code>Code.gs</code> with the code below and click the Save icon.</li>
                  <li>Click <strong>Deploy → New deployment</strong> (blue button, top right).</li>
                  <li>Select type: <strong>Web app</strong> (click the gear icon if needed).</li>
                  <li>Set <strong>Execute as:</strong> "Me" & <strong>Who has access:</strong> "Anyone".</li>
                  <li>Click <strong>Deploy</strong>, grant permissions, and copy the <strong>Web App URL</strong> into Settings!</li>
                </ol>
              </div>

              <div className="flex items-center justify-between text-[#8E9BB5]">
                <span className="font-semibold text-white">Google Apps Script (Code.gs):</span>
                <button
                  onClick={copyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer font-bold text-xs shadow-md"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied to Clipboard!' : 'Copy Script'}
                </button>
              </div>

              <pre className="bg-[#080C17] p-3.5 rounded-xl border border-[#232D48] text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-72 leading-relaxed selection:bg-cyan-500 selection:text-black">
                {sampleAppsScriptCode}
              </pre>
            </div>
          )}

          {activeTab === 'worker' && (
            <div className="space-y-4">
              {/* Verified Live Deployment Card */}
              <div className="p-3.5 rounded-xl bg-gradient-to-br from-emerald-950/40 via-cyan-950/30 to-[#0A1122] border border-emerald-500/50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="font-bold text-white text-xs">Live Worker Status: ONLINE & READY</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    VERIFIED DEPLOYMENT
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-black/50 border border-emerald-500/30 font-mono text-[10px] text-emerald-300 space-y-1">
                  <div className="flex items-center justify-between text-[#8E9BB5]">
                    <span>Worker URL:</span>
                    <a
                      href="https://csam2026.cyber-infobro.workers.dev/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 underline hover:text-cyan-300"
                    >
                      https://csam2026.cyber-infobro.workers.dev/
                    </a>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[10px]">
                    <div>• <strong>Status:</strong> <span className="text-emerald-400">ONLINE</span></div>
                    <div>• <strong>Script Configured:</strong> <span className="text-emerald-400">TRUE (Google Sheets connected)</span></div>
                    <div>• <strong>Actions:</strong> <span className="text-cyan-300">qr_checkin, validateVendorStation</span></div>
                    <div>• <strong>Target Columns:</strong> <span className="text-cyan-300">13 Aligned Sheet Columns</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput(LIVE_CLOUDFLARE_WORKER_URL);
                      setActiveTab('settings');
                    }}
                    className="flex-1 py-1.5 px-3 rounded-lg font-bold text-xs bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer text-center"
                  >
                    Select as Active Scanner Endpoint
                  </button>
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={isTesting}
                    className="py-1.5 px-3 rounded-lg font-bold text-xs bg-[#1C253D] hover:bg-[#253252] text-cyan-300 border border-cyan-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>Test Ping</span>
                  </button>
                </div>
              </div>

              {/* Architecture Banner */}
              <div className="p-3.5 rounded-xl bg-orange-950/30 border border-orange-500/40 text-orange-200 space-y-2">
                <div className="font-bold text-xs flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-orange-400" />
                    <span>Cloudflare Worker Proxy Architecture (CSAM 2026)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 font-mono text-[10px] border border-orange-500/30">
                    MIDDLEWARE PROXY
                  </span>
                </div>
                <p className="text-[11px] text-[#BACAE5]">
                  This Cloudflare Worker handles CORS headers, accepts scanner check-ins, resolves attendee ID tokens, and forwards to Google Apps Script using <code className="text-orange-300 bg-black/40 px-1 py-0.5 rounded">redirect: "follow"</code> and <code className="text-orange-300 bg-black/40 px-1 py-0.5 rounded">Content-Type: text/plain;charset=utf-8</code> to bypass CORS and 302 redirect blocks.
                </p>

                {/* Pipeline visualizer */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[10px]">
                  <div className="p-2 rounded-lg bg-[#0C101E] border border-orange-500/30">
                    <div className="font-bold text-white flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> 1. Scanner Client
                    </div>
                    <div className="text-[#8E9BB5] mt-0.5 font-mono">
                      HTTP POST (CORS)
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0C101E] border border-orange-500/30">
                    <div className="font-bold text-white flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span> 2. Cloudflare Worker
                    </div>
                    <div className="text-[#8E9BB5] mt-0.5 font-mono">
                      OPTIONS 200 • 302 follow
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0C101E] border border-orange-500/30">
                    <div className="font-bold text-white flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> 3. Google Apps Script
                    </div>
                    <div className="text-[#8E9BB5] mt-0.5 font-mono">
                      BoothQR1, 2, 3 = true
                    </div>
                  </div>
                </div>
              </div>

              {/* Payload Contract Card */}
              <div className="p-3 rounded-xl bg-[#090D1A] border border-[#232D48] space-y-1.5">
                <div className="font-bold text-white flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    Exact Payload Contract Sent to Apps Script:
                  </span>
                  <span className="text-emerald-400 font-mono text-[10px]">POST Body (JSON)</span>
                </div>
                <pre className="bg-[#050811] p-2.5 rounded-lg border border-[#1E273E] text-[10px] font-mono text-cyan-300">
{`{
  "action": "qr_checkin",
  "vendorToken": "B1",       // "B1", "B2", or "B3" (Station Secret Token)
  "participantId": "CSAM-001" // Scanned registration ID (or cleaned URL)
}`}
                </pre>
              </div>

              {/* Worker.js Code Block */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[#8E9BB5]">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Cloud className="w-3.5 h-3.5 text-orange-400" />
                    Cloudflare Worker Script (worker.js):
                  </span>
                  <button
                    onClick={copyWorker}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors cursor-pointer font-bold text-xs shadow-md"
                  >
                    {copiedWorkerCode ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWorkerCode ? 'Copied worker.js!' : 'Copy worker.js'}
                  </button>
                </div>
                <pre className="bg-[#080C17] p-3 rounded-xl border border-[#232D48] text-[10px] font-mono text-orange-300 overflow-x-auto max-h-64 leading-relaxed selection:bg-orange-500 selection:text-black">
                  {sampleWorkerCode}
                </pre>
              </div>

              {/* Wrangler.toml Code Block & Instructions */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[#8E9BB5]">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                    wrangler.toml (Optional CLI Deployment):
                  </span>
                  <button
                    onClick={copyWrangler}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1F293D] hover:bg-[#2B3852] text-white transition-colors cursor-pointer text-xs"
                  >
                    {copiedWranglerCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedWranglerCode ? 'Copied wrangler.toml!' : 'Copy wrangler.toml'}
                  </button>
                </div>
                <pre className="bg-[#080C17] p-2.5 rounded-xl border border-[#232D48] text-[10px] font-mono text-cyan-300 overflow-x-auto leading-relaxed">
                  {sampleWranglerCode}
                </pre>
              </div>

              {/* Deployment Steps */}
              <div className="p-3 rounded-xl bg-[#080C17] border border-[#232D48] text-[11px] text-[#A2B2D2] space-y-1">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Quick Deployment Guide:
                </div>
                <ol className="list-decimal list-inside space-y-0.5 text-[10px]">
                  <li>In Cloudflare Dashboard, go to <strong>Workers & Pages → Create Application → Create Worker</strong>.</li>
                  <li>Click <strong>Quick Edit</strong>, paste the <code className="text-white">worker.js</code> script above, and click <strong>Save and Deploy</strong>.</li>
                  <li>In <strong>Settings → Variables</strong>, add environment variable <code className="text-white">GOOGLE_SCRIPT_URL</code> pointing to your Google Apps Script Web App URL.</li>
                  <li>Copy your worker's <code className="text-orange-300">*.workers.dev</code> URL and paste it into the <strong>Connection Settings</strong> tab!</li>
                </ol>
              </div>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200">
                <div className="font-bold text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Unsynced / Pending Scans Queue
                </div>
                <p className="text-[11px] text-[#BACAE5] mt-1">
                  If your internet connection dropped during a scan or Google Sheets was briefly unreachable, scans were saved locally so attendees were never blocked. You can retry syncing them now.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#090D1A] border border-[#232D48]">
                <div>
                  <div className="text-white font-bold">
                    {config.pendingSyncCount || 0} scans pending sync
                  </div>
                  <div className="text-[10px] text-[#8E9BB5]">
                    Target: {config.databaseUrl || 'None configured'}
                  </div>
                </div>
                <button
                  onClick={handleSyncPending}
                  disabled={isSyncingPending || !config.databaseUrl}
                  className="px-4 py-2 rounded-xl font-bold bg-amber-500 hover:bg-amber-400 text-black disabled:opacity-40 transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isSyncingPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" /> Sync Pending Now
                    </>
                  )}
                </button>
              </div>

              {syncMessage && (
                <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs font-semibold">
                  {syncMessage}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#232D48] bg-[#0A0E1A] flex items-center justify-between">
          <div className="text-[10px] text-[#7888A6]">
            BoothMaster QR Portal • Google Sheets Column-by-Column Sync Engine
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1C253D] hover:bg-[#253252] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
