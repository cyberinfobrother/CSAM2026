import React, { useState } from 'react';
import { Database, Link2, CheckCircle2, AlertTriangle, Play, Copy, Check, ExternalLink, X, Code, RefreshCw } from 'lucide-react';
import { BackendConfig, BackendTestResult } from '../utils/api';

interface BackendConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: BackendConfig;
  onSaveConfig: (url: string) => Promise<void>;
  onTestConnection: (url: string) => Promise<BackendTestResult>;
}

export const BackendConnectModal: React.FC<BackendConnectModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onTestConnection,
}) => {
  const [urlInput, setUrlInput] = useState(config.backendUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<BackendTestResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSaveConfig(urlInput.trim());
      setTestResult(null);
    } catch (e: any) {
      alert(e?.message || 'Failed saving configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!urlInput.trim()) {
      alert('Please enter a backend URL link first.');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await onTestConnection(urlInput.trim());
      setTestResult(result);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || 'Network error communicating with backend.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const sampleAppsScriptCode = `// Google Apps Script Code (Code.gs)
// Deploy as Web App -> Execute as: Me -> Who has access: Anyone

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Log the scan event to Google Sheet
    sheet.appendRow([
      new Date(),
      data.vendorToken || data.vendorId,
      data.participantToken,
      data.action || "recordVendorScan",
      Session.getActiveUser().getEmail() || "Vendor Station"
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      recordedAt: new Date().toISOString(),
      vendor: data.vendorId || "V04",
      participantToken: data.participantToken
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(sampleAppsScriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-xl bg-[#151C31] border border-[#2B3554] rounded-2xl shadow-2xl overflow-hidden text-white animate-scale-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B3554] bg-[#0E1424]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Backend & Database Connection</h3>
              <p className="text-xs text-[#8E9BB5]">
                Configure where attendee scans and passport data are recorded
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#202942] text-[#8E9BB5] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-left text-xs">
          {/* Active Status Badge */}
          <div className="p-3.5 rounded-xl bg-[#090D1A] border border-[#232B44] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <span className="font-bold text-white block">
                  {config.backendUrl ? 'Dual Sync Mode (Local + Remote Link)' : 'Built-in Express Server Active'}
                </span>
                <span className="text-[11px] text-[#8E9BB5]">
                  {config.backendUrl
                    ? 'Records are saved locally and synced to your external backend link'
                    : 'All attendee stamps are securely recorded on the Node/Express backend'}
                </span>
              </div>
            </div>
            <span className="px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold uppercase tracking-wider shrink-0">
              Online
            </span>
          </div>

          {/* Backend Link Input */}
          <div className="space-y-2">
            <label className="block font-bold text-white text-xs uppercase tracking-wider">
              Backend Endpoint / Webhook URL
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
                <input
                  type="url"
                  placeholder="https://script.google.com/macros/s/.../exec or https://api.yourdomain.com/scans"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0B1020] text-white border border-[#2B3554] rounded-xl focus:outline-none focus:border-[#4F7CFF] text-xs font-mono"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl font-bold bg-[#4F7CFF] hover:bg-[#3D6CEB] text-white shrink-0 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSaving ? 'Saving...' : 'Save Link'}
              </button>
            </div>
            <p className="text-[11px] text-[#8E9BB5]">
              Paste your Google Apps Script Web App link, Google Sheets Webhook, or external REST API endpoint here.
            </p>
          </div>

          {/* Test Link Button & Result */}
          <div className="p-3.5 rounded-xl bg-[#0E1424] border border-[#232B44] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Test Backend Handshake:</span>
              <button
                onClick={handleTest}
                disabled={isTesting || !urlInput.trim()}
                className="px-3 py-1.5 rounded-lg font-bold text-xs bg-[#202942] hover:bg-[#2B3554] text-white border border-[#2B3554] disabled:opacity-40 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Pinging...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" /> Test Connection
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <div className="font-bold text-xs">{testResult.message}</div>
                  {testResult.latencyMs && (
                    <div className="text-[10px] text-white/70">
                      Response latency: {testResult.latencyMs}ms • HTTP {testResult.status || 200}
                    </div>
                  )}
                  {testResult.response && (
                    <pre className="text-[10px] bg-black/40 p-1.5 rounded text-white/80 overflow-x-auto max-h-24">
                      {typeof testResult.response === 'object'
                        ? JSON.stringify(testResult.response, null, 2)
                        : String(testResult.response)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Google Sheets / Apps Script Integration Helper */}
          <div className="pt-2 border-t border-[#232B44]">
            <button
              onClick={() => setShowCode(!showCode)}
              className="text-[#4F7CFF] hover:underline font-semibold flex items-center gap-1.5"
            >
              <Code className="w-3.5 h-3.5" />
              {showCode ? 'Hide Google Apps Script Template' : 'Need a Google Sheets / Apps Script Backend?'}
            </button>

            {showCode && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-[#8E9BB5]">
                  <span>Paste this into your Google Spreadsheet (Extensions → Apps Script):</span>
                  <button
                    onClick={copyScript}
                    className="flex items-center gap-1 text-white hover:text-[#4F7CFF] transition-colors"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiedCode ? 'Copied' : 'Copy Script'}
                  </button>
                </div>
                <pre className="bg-[#090D1A] p-3 rounded-xl border border-[#232B44] text-[10px] font-mono text-emerald-300 overflow-x-auto max-h-48 leading-relaxed">
                  {sampleAppsScriptCode}
                </pre>
                <p className="text-[11px] text-[#8E9BB5]">
                  Then click <strong>Deploy → New deployment → Web app</strong> (Who has access: <em>Anyone</em>), and paste the resulting Web App URL in the input above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
