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
} from 'lucide-react';
import { BackendConfig, BackendTestResult, syncPendingScans, HARDCODED_GOOGLE_SHEETS_URL } from '../utils/api';
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
    config.databaseUrl || config.backendUrl || HARDCODED_GOOGLE_SHEETS_URL
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
  const [activeTab, setActiveTab] = useState<'settings' | 'script' | 'sheet_preview' | 'logs'>('settings');

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
      alert('Please enter a Google Sheet Web App URL first.');
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
// Col 6 (F): BoothQR1 (true / false)
// Col 7 (G): Booth 2 (Booth Survey)
// Col 8 (H): BoothQR2 (true / false)
// Col 9 (I): Booth 3 (Booth Survey)
// Col 10 (J): BoothQR3 (true / false)
// Col 11 (K): Survey Completed
// Col 12 (L): Booth Completion
// Col 13 (M): Raffle Qualified
// ============================================================================

// ============================================================================
// OPTIONAL: REPLICATE TO MAIN MASTER GOOGLE SHEET
// ============================================================================
// OPTION A: If you want every scan to write directly into your Main Google Sheet:
// Paste the Sheet ID from its URL (between /d/ and /edit in the browser):
var MAIN_SPREADSHEET_ID = ""; // e.g. "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"

// OPTION B: If your Main Google Sheet already has its own Web App running:
// Paste that existing Apps Script Web App URL here to forward all scan events:
var FORWARD_TO_MAIN_WEBAPP_URL = ""; 
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
    if (data.action === "validateVendorStation" || data.ping === "test-handshake") {
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
        "Booth ID",
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
    var vendorId = String(data.vendorId || data.boothId || "Booth 1");
    var vendorName = String(data.vendorName || data.boothName || "Booth 1");
    var targetBoothCol = colBooth1;
    var targetQrCol = colBoothQR1;
    var targetColHeader = "BoothQR1";

    var vLower = (vendorId + " " + vendorName).toLowerCase();
    if (vLower.indexOf("booth 2") !== -1 || vLower.indexOf("tvm") !== -1 || vLower.indexOf("b2") !== -1) {
      targetBoothCol = colBooth2;
      targetQrCol = colBoothQR2;
      targetColHeader = headers[colBoothQR2 - 1] || "BoothQR2";
    } else if (vLower.indexOf("booth 3") !== -1 || vLower.indexOf("secops") !== -1 || vLower.indexOf("b3") !== -1) {
      targetBoothCol = colBooth3;
      targetQrCol = colBoothQR3;
      targetColHeader = headers[colBoothQR3 - 1] || "BoothQR3";
    } else {
      targetBoothCol = colBooth1;
      targetQrCol = colBoothQR1;
      targetColHeader = headers[colBoothQR1 - 1] || "BoothQR1";
    }

    var token = String(data.participantToken || data.participantId || "").trim();
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
      vendorId,
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
    // 9. Replicate to Main Master Google Sheet (if configured)
    // ------------------------------------------------------------------------
    if (MAIN_SPREADSHEET_ID && String(MAIN_SPREADSHEET_ID).trim() !== "") {
      try {
        var mainSs = SpreadsheetApp.openById(String(MAIN_SPREADSHEET_ID).trim());
        var mainSheet = mainSs.getSheetByName("Participants") || mainSs.getSheets()[0];
        var mainLastRow = mainSheet.getLastRow();
        var mainHeaders = mainSheet.getRange(1, 1, 1, Math.max(mainSheet.getLastColumn(), 13)).getValues()[0];
        var mainPData = mainLastRow > 1 ? mainSheet.getRange(2, 1, mainLastRow - 1, mainHeaders.length).getValues() : [];
        var mainRow = -1;

        for (var mr = 0; mr < mainPData.length; mr++) {
          var mToken = String(mainPData[mr][colId - 1] || "").trim().toLowerCase();
          if (mToken === token.toLowerCase()) {
            mainRow = mr + 2;
            break;
          }
        }

        if (mainRow > 0) {
          mainSheet.getRange(mainRow, targetQrCol).setValue(true);
          mainSheet.getRange(mainRow, targetQrCol).setBackground("#dcfce7");
          mainSheet.getRange(mainRow, colCompletion).setValue(completedCount + " / 3");
          mainSheet.getRange(mainRow, colRaffle).setValue(isRaffleQualified ? "QUALIFIED 🏆" : "PENDING");
        } else {
          // If not in main sheet, append
          var newMainRow = new Array(mainHeaders.length);
          for (var mc = 0; mc < mainHeaders.length; mc++) newMainRow[mc] = "";
          newMainRow[colId - 1] = token;
          newMainRow[colName - 1] = participantName;
          newMainRow[colOffice - 1] = participantOffice;
          newMainRow[colRegDate - 1] = timeString;
          newMainRow[colBoothQR1 - 1] = false;
          newMainRow[colBoothQR2 - 1] = false;
          newMainRow[colBoothQR3 - 1] = false;
          newMainRow[targetQrCol - 1] = true;
          newMainRow[colSurvey - 1] = "NO";
          newMainRow[colCompletion - 1] = completedCount + " / 3";
          newMainRow[colRaffle - 1] = isRaffleQualified ? "QUALIFIED 🏆" : "PENDING";
          mainSheet.appendRow(newMainRow);
        }
      } catch (repErr) {
        Logger.log("Main Sheet replication error: " + repErr);
      }
    }

    if (FORWARD_TO_MAIN_WEBAPP_URL && String(FORWARD_TO_MAIN_WEBAPP_URL).trim() !== "") {
      try {
        UrlFetchApp.fetch(String(FORWARD_TO_MAIN_WEBAPP_URL).trim(), {
          method: "post",
          contentType: "text/plain;charset=utf-8",
          payload: JSON.stringify({
            event: "BOOTH_SCAN_REPLICATE",
            timestamp: timeString,
            participantId: token,
            name: participantName,
            office: participantOffice,
            boothId: vendorId,
            boothName: vendorName,
            updatedColumn: targetColHeader,
            qrCompleted: true,
            completion: completedCount + " / 3",
            raffleQualified: isRaffleQualified
          }),
          muteHttpExceptions: true
        });
      } catch (fwdErr) {
        Logger.log("Forward to main Web App error: " + fwdErr);
      }
    }

    // ------------------------------------------------------------------------
    // 10. Return JSON confirmation to BoothMaster
    // ------------------------------------------------------------------------
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ok: true,
      duplicate: isDuplicate,
      name: participantName,
      office: participantOffice,
      participantId: token,
      vendor: vendorId,
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

  const copyScript = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
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

              {/* URL Input */}
              <div className="space-y-1.5">
                <label className="block font-bold text-white uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Google Sheets Web App URL (doPost)</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Extensions → Apps Script → Deploy</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
                    <input
                      type="url"
                      placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#080C17] text-white border border-[#2B3754] rounded-xl focus:outline-none focus:border-emerald-400 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 disabled:opacity-50 transition-colors cursor-pointer shadow-md"
                  >
                    {isSaving ? 'Saving...' : 'Save URL'}
                  </button>
                </div>
                <p className="text-[10px] text-[#8E9BB5] mt-1">
                  Need the script? Click the <strong>Google Apps Script Code</strong> tab above and paste it into your Google Sheet's script editor.
                </p>
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
