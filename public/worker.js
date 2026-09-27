/**
 * ============================================================================
 * CSAM 2026 BOOTHMASTER QR SCANNER - CLOUDFLARE WORKER PROXY / MIDDLEWARE
 * ============================================================================
 * 
 * Purpose:
 *   Acts as a robust, high-performance CORS proxy and webhook gateway between
 *   the Boothmaster QR Scanner frontend and the Google Apps Script Web App
 *   (backed by Google Sheets).
 * 
 * Key Features:
 *   1. Full CORS Preflight & Response Handling (OPTIONS 200, dynamic headers).
 *   2. Content-Type: 'text/plain;charset=utf-8' forwarding to bypass Apps Script CORS.
 *   3. CRITICAL: redirect: 'follow' in fetch() to transparently handle Google's 302 redirects.
 *   4. Payload standardisation for Google Apps Script:
 *      {
 *        "action": "qr_checkin",
 *        "vendorToken": "B1" | "B2" | "B3",
 *        "participantId": "CSAM-001"
 *      }
 *   5. Automatic QR URL cleaning (e.g. extracts ?p=CSAM-001 if participant scanned a link).
 *   6. Health check & Ping validation route for frontend connection test.
 * 
 * Environment Variables (optional, set in Cloudflare Dashboard or wrangler.toml):
 *   - GOOGLE_SCRIPT_URL: Your deployed Google Apps Script Web App URL (/exec).
 * ============================================================================
 */

// Fallback Google Apps Script URL if GOOGLE_SCRIPT_URL secret is not set
const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxAeLqizAvH2HGjbQF0eG7rPaf0RTNE41NfC6Xob5fRJINICFsNvIETXNZj08l9DK3A/exec";

// Universal CORS headers for seamless cross-origin communication
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept",
  "Access-Control-Max-Age": "86400",
};

/**
 * Creates a JSON response with CORS headers.
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

/**
 * Helper to clean and extract attendee Participant ID if QR data is a URL or JSON.
 */
function normalizeParticipantId(rawInput) {
  if (!rawInput) return "";
  let clean = String(rawInput).trim();

  // If attendee badge contains a URL (e.g., https://csam.event/badge?p=CSAM-104)
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    try {
      const url = new URL(clean);
      const paramId =
        url.searchParams.get("p") ||
        url.searchParams.get("participantId") ||
        url.searchParams.get("id") ||
        url.searchParams.get("token");
      if (paramId) return paramId.trim();
    } catch (e) {
      // Not a valid URL, keep clean string
    }
  }

  // If badge is encoded as JSON string (e.g., {"p":"CSAM-104"})
  if (clean.startsWith("{") && clean.endsWith("}")) {
    try {
      const parsed = JSON.parse(clean);
      const jsonId = parsed.participantId || parsed.p || parsed.token || parsed.id;
      if (jsonId) return String(jsonId).trim();
    } catch (e) {
      // Not JSON, keep clean string
    }
  }

  return clean;
}

/**
 * Main Request Handler (ES Module export)
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ------------------------------------------------------------------------
    // 1. CORS Preflight Handling (OPTIONS)
    // ------------------------------------------------------------------------
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // Resolve target Google Apps Script Web App URL
    const googleScriptUrl =
      (env && env.GOOGLE_SCRIPT_URL) || DEFAULT_GOOGLE_SCRIPT_URL;

    // ------------------------------------------------------------------------
    // 2. Browser GUI vs API Diagnostic Route
    // ------------------------------------------------------------------------
    if (request.method === "GET") {
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
          supportedActions: ["qr_checkin", "validateVendorStation", "ping"],
          targetSheetColumns: [
            "Col 1: Participant ID",
            "Col 2: Name",
            "Col 3: Office / Company",
            "Col 4: Registration Date/Time",
            "Col 5: Booth 1",
            "Col 6: BoothQR1",
            "Col 7: Booth 2",
            "Col 8: BoothQR2",
            "Col 9: Booth 3",
            "Col 10: BoothQR3",
            "Col 11: Survey Completed",
            "Col 12: Booth Completion",
            "Col 13: Raffle Qualified",
          ],
        });
      }

      // Render the Full Interactive Standalone GUI for browser visitors!
      return new Response(renderStandaloneScannerHtml(googleScriptUrl), {
        status: 200,
        headers: {
          "Content-Type": "text/html;charset=utf-8",
          ...CORS_HEADERS,
        },
      });
    }

    // ------------------------------------------------------------------------
    // 3. Process Incoming HTTP POST Requests from Scanner
    // ------------------------------------------------------------------------
    if (request.method === "POST") {
      let requestData = {};

      try {
        const contentType = request.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          requestData = await request.json();
        } else {
          const rawText = await request.text();
          try {
            requestData = JSON.parse(rawText);
          } catch {
            requestData = { raw: rawText };
          }
        }
      } catch (err) {
        return jsonResponse(
          {
            success: false,
            error: "Invalid request payload. Expected JSON body.",
          },
          400
        );
      }

      // Handle Connection Test / Ping handshake
      if (
        requestData.action === "validateVendorStation" ||
        requestData.ping ||
        requestData.action === "ping"
      ) {
        try {
          const pingResponse = await fetch(googleScriptUrl, {
            method: "POST",
            headers: {
              "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify({
              action: "validateVendorStation",
              ping: "test-handshake",
              timestamp: new Date().toISOString(),
              client: "Cloudflare-Worker-Proxy",
            }),
            redirect: "follow", // CRITICAL for Google Apps Script 302 redirects
          });

          const pingText = await pingResponse.text();
          let pingJson;
          try {
            pingJson = JSON.parse(pingText);
          } catch {
            pingJson = { raw: pingText };
          }

          return jsonResponse({
            success: true,
            status: "LIVE_CONNECTED",
            message: "Cloudflare Worker proxy successfully reached Google Apps Script!",
            appsScriptStatus: pingResponse.status,
            backendResponse: pingJson,
          });
        } catch (err) {
          return jsonResponse(
            {
              success: false,
              error: `Failed to connect to Google Apps Script: ${err.message}`,
            },
            502
          );
        }
      }

      // ----------------------------------------------------------------------
      // 4. Extract & Standardize Payload for Google Apps Script
      // ----------------------------------------------------------------------
      // Station vendor token (e.g. 'B1', 'B2', or 'B3')
      const vendorToken = (
        requestData.vendorToken ||
        requestData.boothToken ||
        requestData.boothId ||
        requestData.vendorId ||
        requestData.booth ||
        "B1"
      ).trim();

      // Scanned Attendee QR Data (e.g. 'CSAM-001')
      const rawParticipantId =
        requestData.participantId ||
        requestData.scannedQrData ||
        requestData.participantToken ||
        requestData.token ||
        "";

      const participantId = normalizeParticipantId(rawParticipantId);

      if (!participantId) {
        return jsonResponse(
          {
            success: false,
            error: "Missing required parameter 'participantId' or 'scannedQrData'.",
          },
          400
        );
      }

      // Construct the exact JSON payload expected by Google Apps Script
      const appsScriptPayload = {
        action: "qr_checkin",
        vendorToken: vendorToken,
        participantId: participantId,
        // Pass-through metadata for logging and compatibility
        timestamp: requestData.timestamp || new Date().toISOString(),
        client: "Cloudflare-Worker-Proxy",
        ...(requestData.currentParticipant ? { currentParticipant: requestData.currentParticipant } : {}),
      };

      // ----------------------------------------------------------------------
      // 5. Webhook Request to Google Apps Script
      // ----------------------------------------------------------------------
      // CRITICAL Requirements:
      //   - Content-Type: 'text/plain;charset=utf-8' avoids Apps Script preflight issues
      //   - redirect: 'follow' transparently follows Google's 302 temporary redirects
      // ----------------------------------------------------------------------
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
          // If response is HTML error or non-JSON
          return jsonResponse({
            success: gasResponse.ok,
            status: gasResponse.status,
            rawResponse: responseText,
            message: "Google Apps Script responded with non-JSON content. Verify web app access is set to 'Anyone'.",
          });
        }

        // Return the Google Apps Script outcome directly to the scanner with CORS headers
        return jsonResponse(responseJson, gasResponse.status);

      } catch (fetchError) {
        return jsonResponse(
          {
            success: false,
            error: `Error communicating with Google Apps Script: ${fetchError.message}`,
            proxyNotice: "Ensure the Google Apps Script Web App is deployed with 'Who has access: Anyone'.",
          },
          502
        );
      }
    }

    // Method Not Allowed for other HTTP verbs
    return jsonResponse({ error: `Method ${request.method} not allowed.` }, 405);
  },
};

/**
 * ============================================================================
 * FULL-STACK STANDALONE BOOTHMASTER SCANNER GUI (HTML/CSS/JS)
 * ============================================================================
 * Renders an interactive Cyber Security Awareness Month 2026 QR Scanner Web App
 * directly from the Cloudflare Worker when visited in any web browser.
 */
function renderStandaloneScannerHtml(googleScriptUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>CSAM 2026 - Boothmaster QR Scanner</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: #070B19;
      color: #E2E8F0;
      -webkit-tap-highlight-color: transparent;
    }
    .font-mono {
      font-family: 'JetBrains+Mono', monospace;
    }
    .scanner-reticle {
      box-shadow: 0 0 0 9999px rgba(5, 9, 20, 0.75);
    }
    @keyframes pulse-cyan {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.8; }
    }
    .cyber-glow {
      animation: pulse-cyan 3s infinite ease-in-out;
    }
  </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-start p-3 sm:p-6 text-slate-100 relative overflow-x-hidden selection:bg-cyan-500 selection:text-black">
  <!-- Glowing Cyber Grid Background -->
  <div class="fixed inset-0 pointer-events-none opacity-20 bg-[radial-gradient(#00e5ff_1px,transparent_1px)] [background-size:24px_24px]"></div>
  <div class="fixed -top-32 -left-32 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
  <div class="fixed -bottom-32 -right-32 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none"></div>

  <!-- Main Container -->
  <div class="w-full max-w-lg mx-auto relative z-10 flex flex-col gap-4">

    <!-- Top Utility Header -->
    <header class="bg-[#0B1224]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-lg font-black shadow-lg shadow-cyan-500/20">
          🛡️
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-black tracking-wider text-white">CSAM 2026</span>
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">BOOTHMASTER</span>
          </div>
          <div class="text-[11px] text-cyan-300 font-semibold" id="station-subtitle">Booth 1 - Netsec Challenge</div>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <!-- Live Google Sheets Status -->
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold" title="Connected to Google Sheets via Cloudflare Worker">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="hidden sm:inline">SHEETS LIVE</span>
        </div>

        <!-- Audio FX Toggle -->
        <button id="sound-btn" onclick="toggleSound()" class="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-300 transition-colors" title="Toggle Beep Sound">
          🔊
        </button>
      </div>
    </header>

    <!-- Station Selection Bar -->
    <div class="bg-[#0B1224]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 shadow-xl">
      <label class="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Select Your Active Station:</label>
      <div class="grid grid-cols-3 gap-2">
        <button onclick="selectStation('B1')" id="btn-B1" class="station-tab py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center">
          <div class="text-sm">🛡️ B1</div>
          <div class="text-[10px] opacity-80">Netsec</div>
          <div class="text-[9px] text-emerald-400 font-mono">Col 6 (BoothQR1)</div>
        </button>
        <button onclick="selectStation('B2')" id="btn-B2" class="station-tab py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center">
          <div class="text-sm">🔍 B2</div>
          <div class="text-[10px] opacity-80">TVM</div>
          <div class="text-[9px] text-emerald-400 font-mono">Col 8 (BoothQR2)</div>
        </button>
        <button onclick="selectStation('B3')" id="btn-B3" class="station-tab py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center">
          <div class="text-sm">⚡ B3</div>
          <div class="text-[10px] opacity-80">SecOps</div>
          <div class="text-[9px] text-emerald-400 font-mono">Col 10 (BoothQR3)</div>
        </button>
      </div>
    </div>

    <!-- Scanner Viewport Card -->
    <div class="bg-[#0B1224]/90 backdrop-blur-xl border border-white/10 rounded-3xl p-4 shadow-2xl overflow-hidden relative">
      <div class="flex items-center justify-between mb-3 px-1">
        <div class="flex items-center gap-1.5 text-xs font-bold text-white">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>Optical QR Camera Scanner</span>
        </div>
        <div class="text-[11px] text-slate-400" id="scan-counter">Session Scans: 0</div>
      </div>

      <!-- Scanner Box -->
      <div class="relative w-full aspect-square bg-[#050812] rounded-2xl overflow-hidden border border-white/15 flex flex-col items-center justify-center">
        <div id="reader" class="w-full h-full"></div>

        <!-- Initial Placeholder when camera is inactive -->
        <div id="scanner-placeholder" class="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10 bg-[#070D1F]">
          <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-3xl mb-3 shadow-lg shadow-cyan-500/20">
            📷
          </div>
          <h3 class="font-bold text-white text-sm mb-1">Camera Scanner Ready</h3>
          <p class="text-xs text-slate-400 mb-4 max-w-xs">Point at attendee badge QR code to instantly verify & log to Google Sheets.</p>
          <button onclick="startCamera()" id="start-cam-btn" class="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/30 transition-all cursor-pointer flex items-center gap-2">
            <span>Start QR Scanner</span>
            <span>⚡</span>
          </button>
        </div>

        <!-- Reticle Overlay when scanning -->
        <div id="scanner-reticle" class="hidden absolute inset-0 pointer-events-none flex items-center justify-center">
          <div class="w-56 h-56 border-2 border-cyan-400 rounded-2xl relative shadow-[0_0_20px_rgba(0,229,255,0.4)]">
            <div class="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-cyan-300"></div>
            <div class="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-cyan-300"></div>
            <div class="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-cyan-300"></div>
            <div class="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-cyan-300"></div>
            <div class="absolute inset-x-0 top-1/2 h-0.5 bg-cyan-400/40 animate-pulse"></div>
          </div>
        </div>
      </div>

      <!-- Controls under scanner -->
      <div id="cam-controls" class="hidden mt-3 flex items-center justify-between gap-2">
        <button onclick="stopCamera()" class="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-bold text-xs transition-colors">
          Stop Camera
        </button>
        <span class="text-[11px] text-cyan-300 font-mono" id="scan-status-text">Scanning for badge...</span>
      </div>

      <!-- Live Scan Outcome Notification Card -->
      <div id="outcome-card" class="hidden mt-4 p-4 rounded-2xl border transition-all"></div>
    </div>

    <!-- Manual ID Check-In Backup -->
    <div class="bg-[#0B1224]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
      <div class="flex items-center justify-between mb-2">
        <label class="text-[11px] font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
          <span>⌨️</span> Manual Check-In (Badge ID Backup)
        </label>
        <span class="text-[10px] text-slate-400">e.g. CSAM-001</span>
      </div>
      <form onsubmit="handleManualSubmit(event)" class="flex gap-2">
        <input
          type="text"
          id="manual-id-input"
          placeholder="Enter Participant ID (e.g. CSAM-001)"
          class="flex-1 bg-[#050812] border border-white/15 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-400 uppercase"
        />
        <button
          type="submit"
          id="manual-submit-btn"
          class="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 font-bold text-xs rounded-xl text-white transition-colors cursor-pointer shrink-0"
        >
          Check In
        </button>
      </form>

      <!-- Quick Test Badges -->
      <div class="mt-2.5 pt-2.5 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-400 overflow-x-auto">
        <span>Test Badges:</span>
        <button onclick="quickTest('CSAM-001')" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono">CSAM-001</button>
        <button onclick="quickTest('CSAM-002')" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono">CSAM-002</button>
        <button onclick="quickTest('CSAM-003')" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 font-mono">CSAM-003</button>
      </div>
    </div>

    <!-- Recent Session Scans -->
    <div class="bg-[#0B1224]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-xl">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
          <span>📋</span> Recent Station Check-Ins
        </h4>
        <span class="text-[10px] text-slate-400" id="recent-count">0 logged</span>
      </div>
      <div id="recent-list" class="space-y-1.5 max-h-48 overflow-y-auto pr-1 text-xs">
        <div class="text-[11px] text-slate-500 italic py-2 text-center">No scans recorded yet this session.</div>
      </div>
    </div>

    <!-- Footer Links -->
    <footer class="text-center text-[10px] text-slate-500 pb-8 space-y-1">
      <div>CSAM 2026 Cyber Security Awareness Month • Boothmaster Portal</div>
      <div class="flex items-center justify-center gap-3">
        <a href="?format=json" class="text-cyan-400 hover:underline">API Diagnostic (JSON)</a>
        <span>•</span>
        <a href="/health" class="text-cyan-400 hover:underline">Health Endpoint</a>
        <span>•</span>
        <span>Proxying to Google Sheets</span>
      </div>
    </footer>

  </div>

  <!-- Audio Synthesizer (Zero asset dependency) -->
  <script>
    const STATIONS = {
      'B1': { code: 'B1', name: 'Booth 1 - Netsec', column: 'BoothQR1', colNum: 6, icon: '🛡️' },
      'B2': { code: 'B2', name: 'Booth 2 - TVM', column: 'BoothQR2', colNum: 8, icon: '🔍' },
      'B3': { code: 'B3', name: 'Booth 3 - SecOps', column: 'BoothQR3', colNum: 10, icon: '⚡' }
    };

    let currentStation = 'B1';
    let soundEnabled = true;
    let html5QrCode = null;
    let isScanning = false;
    let recentScans = [];
    let audioCtx = null;

    function getAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      return audioCtx;
    }

    function playBeep(success = true) {
      if (!soundEnabled) return;
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (success) {
          osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
          osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
          gain.gain.setValueAtTime(0.2, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.15);
        } else {
          osc.frequency.setValueAtTime(260, ctx.currentTime);
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.25);
        }
      } catch (e) {}
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      document.getElementById('sound-btn').innerText = soundEnabled ? '🔊' : '🔇';
    }

    function selectStation(code) {
      currentStation = code;
      const st = STATIONS[code];
      document.getElementById('station-subtitle').innerText = st.name;
      ['B1', 'B2', 'B3'].forEach(k => {
        const btn = document.getElementById('btn-' + k);
        if (k === code) {
          btn.className = 'station-tab py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-[0_0_12px_rgba(0,229,255,0.3)]';
        } else {
          btn.className = 'station-tab py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center bg-[#070D1F] text-slate-400 border-white/10 hover:text-white';
        }
      });
    }

    async function performCheckin(participantId) {
      const cleanId = String(participantId).trim().toUpperCase();
      if (!cleanId) return;

      const st = STATIONS[currentStation];
      const outcomeCard = document.getElementById('outcome-card');
      outcomeCard.className = 'mt-4 p-4 rounded-2xl border bg-cyan-950/40 border-cyan-500/50 text-cyan-200 animate-pulse';
      outcomeCard.innerHTML = '<div class="text-xs font-bold">Relaying to Google Sheets (' + st.column + ')...</div>';
      outcomeCard.classList.remove('hidden');

      try {
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'qr_checkin',
            vendorToken: currentStation,
            participantId: cleanId,
            timestamp: new Date().toISOString()
          })
        });

        const data = await response.json();
        handleCheckinResponse(cleanId, data);
      } catch (err) {
        outcomeCard.className = 'mt-4 p-4 rounded-2xl border bg-rose-950/40 border-rose-500/50 text-rose-200';
        outcomeCard.innerHTML = '<div class="font-bold text-xs">⚠️ Sync Error</div><div class="text-[11px]">' + err.message + '</div>';
        playBeep(false);
      }
    }

    function handleCheckinResponse(participantId, data) {
      const outcomeCard = document.getElementById('outcome-card');
      const isDuplicate = data.duplicate === true || data.isDuplicate === true;
      const isSuccess = data.success !== false;
      const completion = data.completion || 1;
      const isRaffle = data.raffleQualified === true || completion >= 3;
      const st = STATIONS[currentStation];

      playBeep(!isDuplicate && isSuccess);

      if (isRaffle && !isDuplicate && window.confetti) {
        window.confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }

      if (isDuplicate) {
        outcomeCard.className = 'mt-4 p-4 rounded-2xl border bg-amber-950/50 border-amber-500/50 text-amber-200 space-y-1.5';
        outcomeCard.innerHTML = 
          '<div class="flex items-center justify-between">' +
            '<span class="font-bold text-xs text-amber-300">⚠️ ALREADY STAMPED</span>' +
            '<span class="text-[10px] font-mono text-amber-400">' + participantId + '</span>' +
          '</div>' +
          '<div class="text-xs text-white">Attendee was already scanned for ' + st.name + '.</div>' +
          '<div class="text-[10px] text-amber-300/80">Google Sheet column [' + st.column + '] is already TRUE.</div>';
      } else if (isSuccess) {
        outcomeCard.className = 'mt-4 p-4 rounded-2xl border bg-emerald-950/50 border-emerald-500/50 text-emerald-200 space-y-2';
        outcomeCard.innerHTML = 
          '<div class="flex items-center justify-between">' +
            '<div class="flex items-center gap-1.5">' +
              '<span class="text-emerald-400 font-black">✓ STAMPED</span>' +
              '<span class="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">' + st.column + ' = TRUE</span>' +
            '</div>' +
            '<span class="font-mono text-xs text-white font-bold">' + participantId + '</span>' +
          '</div>' +
          '<div class="text-xs text-white font-semibold">' + (data.name || 'CSAM Attendee') + ' <span class="text-[#8E9BB5] font-normal">• ' + (data.office || 'Summit') + '</span></div>' +
          '<div class="text-[11px] text-emerald-300">Logged to Sheet: Booth ' + st.code + ' complete (' + completion + ' of 3 booths).</div>' +
          (isRaffle ? '<div class="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-center text-xs">🏆 RAFFLE QUALIFIED! ALL 3 BOOTHS COMPLETED</div>' : '');
      } else {
        outcomeCard.className = 'mt-4 p-4 rounded-2xl border bg-rose-950/50 border-rose-500/50 text-rose-200';
        outcomeCard.innerHTML = '<div class="font-bold text-xs">❌ Check-in Error</div><div class="text-[11px]">' + (data.error || data.message || 'Unknown error') + '</div>';
      }

      // Add to session scans
      recentScans.unshift({
        id: participantId,
        name: data.name || participantId,
        station: st.code,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        duplicate: isDuplicate
      });
      updateRecentList();
    }

    function updateRecentList() {
      document.getElementById('scan-counter').innerText = 'Session Scans: ' + recentScans.length;
      document.getElementById('recent-count').innerText = recentScans.length + ' logged';
      const container = document.getElementById('recent-list');
      if (recentScans.length === 0) {
        container.innerHTML = '<div class="text-[11px] text-slate-500 italic py-2 text-center">No scans recorded yet this session.</div>';
        return;
      }
      container.innerHTML = recentScans.slice(0, 10).map(s => 
        '<div class="p-2 rounded-xl bg-[#070D1F] border border-white/5 flex items-center justify-between">' +
          '<div class="flex items-center gap-2">' +
            '<span class="text-xs font-mono font-bold text-cyan-300">' + s.id + '</span>' +
            '<span class="text-[10px] text-slate-400">' + s.station + '</span>' +
            (s.duplicate ? '<span class="text-[9px] text-amber-400 font-bold bg-amber-500/20 px-1 rounded">DUPLICATE</span>' : '<span class="text-[9px] text-emerald-400 font-bold bg-emerald-500/20 px-1 rounded">VERIFIED</span>') +
          '</div>' +
          '<span class="text-[10px] text-slate-500 font-mono">' + s.time + '</span>' +
        '</div>'
      ).join('');
    }

    async function startCamera() {
      try {
        document.getElementById('scanner-placeholder').classList.add('hidden');
        document.getElementById('scanner-reticle').classList.remove('hidden');
        document.getElementById('cam-controls').classList.remove('hidden');
        
        html5QrCode = new Html5Qrcode("reader");
        const config = { fps: 15, qrbox: { width: 220, height: 220 } };

        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            // Debounce
            if (isScanning) return;
            isScanning = true;
            document.getElementById('scan-status-text').innerText = 'Processing ' + decodedText.slice(0, 12) + '...';
            performCheckin(decodedText);
            setTimeout(() => {
              isScanning = false;
              document.getElementById('scan-status-text').innerText = 'Scanning for badge...';
            }, 2500);
          },
          (errorMessage) => {}
        );
      } catch (err) {
        alert("Camera error: " + (err.message || err));
        stopCamera();
      }
    }

    async function stopCamera() {
      if (html5QrCode) {
        try { await html5QrCode.stop(); } catch (e) {}
        html5QrCode = null;
      }
      document.getElementById('scanner-placeholder').classList.remove('hidden');
      document.getElementById('scanner-reticle').classList.add('hidden');
      document.getElementById('cam-controls').classList.add('hidden');
    }

    function handleManualSubmit(e) {
      e.preventDefault();
      const inp = document.getElementById('manual-id-input');
      const val = inp.value.trim();
      if (val) {
        performCheckin(val);
        inp.value = '';
      }
    }

    function quickTest(id) {
      document.getElementById('manual-id-input').value = id;
      performCheckin(id);
    }

    // Initialize Station 1 as active
    selectStation('B1');
  </script>
</body>
</html>`;
}
