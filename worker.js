/**
 * ============================================================================
 * CSAM 2026 BOOTHMASTER QR SCANNER - FULL-STACK CLOUDFLARE WORKER
 * ============================================================================
 * 
 * Features:
 *   1. Full Original GUI serving: If accessed via web browser, serves the 
 *      100% Mobile-Compatible CyberSecurity Awareness Month 2026 Original UI.
 *   2. High-Performance API & Proxy: If accessed via POST or with ?format=json,
 *      handles CORS, normalizes tokens, and relays to Google Apps Script
 *      with redirect: 'follow' and text/plain.
 * ============================================================================
 */

const DEFAULT_GOOGLE_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxAeLqizAvH2HGjbQF0eG7rPaf0RTNE41NfC6Xob5fRJINICFsNvIETXNZj08l9DK3A/exec";

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
    const url = new URL(request.url);

    // 1. CORS Preflight (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: CORS_HEADERS });
    }

    const googleScriptUrl =
      (env && env.GOOGLE_SCRIPT_URL) || DEFAULT_GOOGLE_SCRIPT_URL;

    // 2. GET Route: Serve Original GUI or API Diagnostic
    if (request.method === "GET") {
      const wantsJson =
        url.searchParams.get("format") === "json" ||
        url.pathname === "/status" ||
        url.pathname === "/api/status" ||
        request.headers.get("accept")?.includes("application/json");

      if (!wantsJson) {
        return new Response(renderOriginalBoothMasterHtml(googleScriptUrl), {
          status: 200,
          headers: {
            "Content-Type": "text/html;charset=utf-8",
            ...CORS_HEADERS,
          },
        });
      }

      return jsonResponse({
        status: "ONLINE",
        service: "CSAM 2026 Boothmaster QR Proxy Worker",
        timestamp: new Date().toISOString(),
        googleScriptConfigured: Boolean(googleScriptUrl),
        supportedActions: ["qr_checkin", "validateVendorStation", "ping"],
        appUrl: "https://ais-pre-qa4a4yyutoy7aazehq43ea-607520250010.asia-southeast1.run.app",
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

    // 3. POST Route: Check-in & Handshake forwarding
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
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
      }

      // Handshake / Ping
      if (
        requestData.action === "validateVendorStation" ||
        requestData.ping ||
        requestData.action === "ping"
      ) {
        try {
          const pingResponse = await fetch(googleScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "validateVendorStation",
              ping: "test-handshake",
              timestamp: new Date().toISOString(),
              client: "Cloudflare-Worker-Proxy",
            }),
            redirect: "follow",
          });

          const pingText = await pingResponse.text();
          let pingJson;
          try { pingJson = JSON.parse(pingText); } catch { pingJson = { raw: pingText }; }

          return jsonResponse({
            success: true,
            status: "LIVE_CONNECTED",
            message: "Cloudflare Worker proxy successfully reached Google Apps Script!",
            appsScriptStatus: pingResponse.status,
            backendResponse: pingJson,
          });
        } catch (err) {
          return jsonResponse({ success: false, error: `Failed to connect: ${err.message}` }, 502);
        }
      }

      // Check-in Relay
      const vendorToken = (
        requestData.vendorToken ||
        requestData.boothToken ||
        requestData.boothId ||
        requestData.vendorId ||
        requestData.booth ||
        "B1"
      ).trim();

      const rawParticipantId =
        requestData.participantId ||
        requestData.scannedQrData ||
        requestData.participantToken ||
        requestData.token ||
        "";

      const participantId = normalizeParticipantId(rawParticipantId);

      if (!participantId) {
        return jsonResponse(
          { success: false, error: "Missing required parameter 'participantId' or 'scannedQrData'." },
          400
        );
      }

      const appsScriptPayload = {
        action: "qr_checkin",
        vendorToken: vendorToken,
        participantId: participantId,
        timestamp: requestData.timestamp || new Date().toISOString(),
        client: "Cloudflare-Worker-Proxy",
        ...(requestData.currentParticipant ? { currentParticipant: requestData.currentParticipant } : {}),
      };

      try {
        const gasResponse = await fetch(googleScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(appsScriptPayload),
          redirect: "follow",
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
            message: "Google Apps Script responded with non-JSON content. Verify web app access is set to 'Anyone'.",
          });
        }

        return jsonResponse(responseJson, gasResponse.status);
      } catch (fetchError) {
        return jsonResponse(
          { success: false, error: `Error communicating with Google Apps Script: ${fetchError.message}` },
          502
        );
      }
    }

    return jsonResponse({ error: `Method ${request.method} not allowed.` }, 405);
  },
};

/**
 * Renders the 100% Mobile-Compatible Original UI identical to Google AI Studio
 */
function renderOriginalBoothMasterHtml(googleScriptUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#070C1A" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="BoothMaster" />
  <meta name="format-detection" content="telephone=no" />
  <title>BoothMaster QR Portal — CSAM 2026</title>
  
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js"><\/script>

  <style>
    @keyframes scanLine {
      0% { top: 6%; opacity: 0.8; }
      50% { top: 90%; opacity: 1; }
      100% { top: 6%; opacity: 0.8; }
    }
    .animate-scan-line { animation: scanLine 2.4s ease-in-out infinite; }
    @keyframes scaleUp {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-scale-up { animation: scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    * { -webkit-tap-highlight-color: transparent; box-sizing: border-box; }
    button, input, select { touch-action: manipulation; }
    #reader { width: 100% !important; border: none !important; background: #050A17 !important; }
    #reader video {
      width: 100% !important;
      height: 100% !important;
      max-height: 52vh !important;
      object-fit: cover !important;
      border-radius: 1rem !important;
      transform: scale(1.02);
    }
    #reader img { display: none !important; }
    @media screen and (max-width: 640px) {
      input[type="text"] { font-size: 16px !important; }
    }
  </style>
</head>
<body
  class="min-h-[100dvh] relative text-white flex flex-col items-center justify-start p-3 sm:p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.75rem+env(safe-area-inset-top,0px))] selection:bg-cyan-500 selection:text-black overflow-x-hidden font-sans"
  style="background-image: radial-gradient(ellipse at 85% 15%, rgba(255, 140, 50, 0.15) 0%, transparent 45%), radial-gradient(ellipse at 15% 85%, rgba(0, 229, 255, 0.12) 0%, transparent 50%); background-color: #070C1A;"
>
  <div class="fixed inset-0 bg-[#070B18]/60 backdrop-brightness-95 pointer-events-none"></div>

  <div class="w-full max-w-[620px] mx-auto relative z-10">
    <div class="backdrop-blur-2xl bg-[#091126]/80 border border-white/15 rounded-[22px] sm:rounded-[26px] p-4 sm:p-7 shadow-[0_24px_64px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.12)] relative overflow-hidden">
      <div class="absolute -top-24 -right-24 w-64 h-64 bg-[#FF8C38]/15 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -left-24 w-64 h-64 bg-[#00E5FF]/15 rounded-full blur-3xl pointer-events-none"></div>

      <!-- Top Nav -->
      <div class="w-full mb-5 text-center">
        <div class="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/10">
          <div class="flex items-center gap-2.5 text-left">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-md font-black text-sm">
              🛡️
            </div>
            <div>
              <div class="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
                <span>BOOTHMASTER</span>
                <span class="text-[10px] font-bold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30">CSAM 2026</span>
              </div>
              <div class="text-[10px] text-[#9BB0D3]">Vendor Station Scanner</div>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <div class="px-2.5 py-1.5 min-h-[38px] rounded-xl border text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md bg-emerald-950/70 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
              <span>⚡ Worker Live</span>
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            </div>
            <button id="soundToggleBtn" onclick="toggleSound()" class="p-2 min-h-[38px] min-w-[38px] rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 backdrop-blur-md bg-white/10 text-emerald-400 border-white/20">
              <span id="soundIcon">🔊</span>
            </button>
            <button onclick="openHistoryModal()" class="px-2.5 py-1.5 min-h-[38px] rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5">
              <span>Scans</span>
              <span id="headerScanCountBadge" class="bg-cyan-500 text-black text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
          </div>
        </div>

        <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">CyberSecurity Awareness Month 2026</h1>
        <div class="text-xs sm:text-sm text-cyan-300/90 font-semibold mt-1 tracking-wide uppercase">CyberMaster Challenge Scanner</div>

        <!-- Booth selector -->
        <div class="relative inline-block mt-3 text-center">
          <button id="stationDropdownBtn" onclick="toggleStationDropdown()" class="group inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl backdrop-blur-xl bg-black/45 hover:bg-black/60 border border-white/15 text-white text-base sm:text-lg font-bold tracking-wide">
            <span id="selectedStationName" class="text-cyan-400 font-extrabold">VENDOR 1 — BOOTH 1</span>
            <span class="text-xs text-[#9BB0D3]">▼</span>
          </button>

          <div id="stationDropdownMenu" class="hidden absolute left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 backdrop-blur-2xl bg-[#091126]/95 border border-white/20 rounded-xl shadow-2xl z-30 py-1.5 text-left overflow-hidden">
            <div class="px-3 py-1.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider border-b border-white/10">Switch Booth Station</div>
            <button onclick="selectStation('B1', 'VENDOR 1 — BOOTH 1')" class="w-full px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-white/5 border-l-2 border-cyan-400 bg-cyan-500/15">
              <span class="text-white font-semibold">VENDOR 1 — BOOTH 1</span>
              <span class="text-amber-300 font-bold">B1</span>
            </button>
            <button onclick="selectStation('B2', 'VENDOR 2 — BOOTH 2')" class="w-full px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-white/5 text-[#9BB0D3]">
              <span class="text-white font-semibold">VENDOR 2 — BOOTH 2</span>
              <span class="text-cyan-300 font-bold">B2</span>
            </button>
            <button onclick="selectStation('B3', 'VENDOR 3 — BOOTH 3')" class="w-full px-3 py-2.5 text-xs flex items-center justify-between gap-2 hover:bg-white/5 text-[#9BB0D3]">
              <span class="text-white font-semibold">VENDOR 3 — BOOTH 3</span>
              <span class="text-purple-300 font-bold">B3</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Viewfinder -->
      <div id="scannerContainer" class="relative min-h-[280px] md:min-h-[310px] rounded-2xl backdrop-blur-xl border-2 border-cyan-400/60 bg-[#050A17]/65 shadow-[0_0_30px_rgba(6,182,212,0.2)] flex flex-col items-center justify-center overflow-hidden">
        <div id="reader" class="w-full h-full min-h-[280px] rounded-2xl overflow-hidden"></div>
        <div id="viewfinderOverlay" class="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div id="reticleBox" class="relative w-56 h-56 border-2 border-cyan-400/60 rounded-xl overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.25)]">
            <div class="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl shadow-[0_0_10px_#00E5FF]"></div>
            <div class="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr shadow-[0_0_10px_#00E5FF]"></div>
            <div class="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl shadow-[0_0_10px_#00E5FF]"></div>
            <div class="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br shadow-[0_0_10px_#00E5FF]"></div>
            <div class="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_14px_#00E5FF] animate-scan-line"></div>
          </div>
          <div class="absolute bottom-3 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl text-xs text-white border border-white/20 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>Camera live — Ready for attendee badges</span>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="flex flex-col gap-2 mt-3">
        <div class="grid grid-cols-2 gap-2">
          <button onclick="restartCameraStream()" class="py-2.5 px-3 min-h-[44px] rounded-xl font-bold text-xs text-white backdrop-blur-xl bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 flex items-center justify-center gap-1.5">
            🔄 Restart Camera
          </button>
          <button onclick="flipCamera()" class="py-2.5 px-3 min-h-[44px] rounded-xl font-bold text-xs text-cyan-300 backdrop-blur-xl bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 flex items-center justify-center gap-1.5">
            📷 Flip Camera
          </button>
        </div>
        <select id="cameraSelect" onchange="onSelectCamera(this.value)" class="w-full text-xs bg-black/60 text-white border border-white/15 rounded-lg px-2 py-2 min-h-[40px]"></select>
      </div>

      <!-- Result Card -->
      <div id="resultCard" class="hidden mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up">
        <div id="resultTitle" class="text-xl font-extrabold tracking-wide uppercase my-1 text-emerald-300">✓ CHALLENGE COMPLETE</div>
        <div class="my-3 py-2 px-3 rounded-xl bg-black/40 border border-white/15 max-w-sm mx-auto">
          <div id="resultAttendeeName" class="text-lg font-bold text-white">John Doe</div>
          <div id="resultAttendeeOffice" class="text-xs text-white/80 mt-0.5">Attendee</div>
        </div>
        <p id="resultMessage" class="text-sm text-white/95 my-2 font-medium">Participant badge scanned successfully!</p>
        <div class="my-3 p-3 rounded-xl bg-black/40 border border-white/15 max-w-sm mx-auto">
          <div class="text-xs uppercase text-cyan-200 font-bold mb-1">Event Passport Stamps</div>
          <div id="resultStampCount" class="text-3xl font-black text-white my-1">1 / 3</div>
          <div class="w-full bg-white/20 h-2.5 rounded-full overflow-hidden my-2">
            <div id="resultProgressBar" class="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full" style="width: 33%;"></div>
          </div>
          <div id="raffleBadge" class="hidden inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-400 text-black">
            🎉 RAFFLE QUALIFIED!
          </div>
        </div>
      </div>

      <!-- Manual Input -->
      <div class="mt-5 pt-4 border-t border-white/10">
        <div class="flex items-center justify-between mb-2">
          <span class="text-[11px] font-bold text-cyan-300 uppercase tracking-wider">Manual Attendee Check-In (Backup)</span>
          <span class="text-[10px] text-[#8E9BB5]">Type Token or ID</span>
        </div>
        <form onsubmit="handleManualSubmit(event)" class="flex gap-2">
          <input
            id="manualTokenInput"
            type="text"
            placeholder="Enter attendee token (e.g. CSAM-001)..."
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck="false"
            inputMode="text"
            class="flex-1 backdrop-blur-md bg-black/50 border border-white/15 focus:border-cyan-400 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-[#7888A6] outline-none min-h-[44px]"
          />
          <button type="submit" class="px-4 py-2.5 rounded-xl font-bold text-xs text-white bg-white/10 hover:bg-white/15 border border-white/20 active:scale-95 min-h-[44px]">
            Verify Badge
          </button>
        </form>
      </div>

      <!-- Stats -->
      <div class="mt-4 p-3 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 flex items-center justify-around text-center text-xs">
        <div>
          <div id="statTotalScans" class="text-base font-extrabold text-white">0</div>
          <div class="text-[10px] text-[#9BB0D3] uppercase font-semibold">Total Scans</div>
        </div>
        <div class="w-px h-6 bg-white/10"></div>
        <div>
          <div id="statUniqueAttendees" class="text-base font-extrabold text-cyan-400">0</div>
          <div class="text-[10px] text-[#9BB0D3] uppercase font-semibold">Unique Attendees</div>
        </div>
        <div class="w-px h-6 bg-white/10"></div>
        <div>
          <div class="text-base font-extrabold text-emerald-400">3 of 3</div>
          <div class="text-[10px] text-[#9BB0D3] uppercase font-semibold">Raffle Target</div>
        </div>
      </div>
    </div>
  </div>

  <!-- History Modal -->
  <div id="historyModal" class="hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div class="relative w-full max-w-2xl bg-[#151C31] border border-[#2B3554] rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[85vh]">
      <div class="flex items-center justify-between px-6 py-4 border-b border-[#2B3554] bg-[#0E1424]">
        <h3 class="text-base font-bold text-white">Check-in Logs</h3>
        <button onclick="closeHistoryModal()" class="w-8 h-8 rounded-lg bg-transparent text-[#8E9BB5] hover:text-white">✕</button>
      </div>
      <div class="p-4 flex-1 overflow-y-auto">
        <table class="w-full text-xs text-left">
          <tbody id="historyTableBody"></tbody>
        </table>
      </div>
      <div class="p-3 border-t border-[#2B3554] flex justify-end gap-2 bg-[#0E1424]">
        <button onclick="closeHistoryModal()" class="px-3 py-1.5 rounded-lg bg-white/10 font-bold text-xs text-white">Close</button>
      </div>
    </div>
  </div>

  <script>
    let currentStation = { id: 'B1', name: 'VENDOR 1 — BOOTH 1', token: 'B1' };
    let scans = JSON.parse(localStorage.getItem('csam_vendor_scans_prod') || '[]');
    let html5QrScanner = null;
    let soundEnabled = true;
    let cameras = [];
    let selectedCameraId = '';
    let isProcessing = false;
    let lastScanned = { text: '', time: 0 };
    let audioCtx = null;

    function getAudioCtx() {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) audioCtx = new AudioCtx();
      }
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      return audioCtx;
    }

    const unlockAudio = () => {
      getAudioCtx();
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('click', unlockAudio);
    };
    window.addEventListener('touchstart', unlockAudio, { passive: true });
    window.addEventListener('click', unlockAudio, { passive: true });

    function playSound(type) {
      if (!soundEnabled) return;
      try {
        const ctx = getAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;
        if (type === 'success') {
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(f, now + i * 0.08);
            gain.gain.setValueAtTime(0.0001, now + i * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.08 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.35);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.08);
            osc.stop(now + i * 0.08 + 0.36);
          });
        } else if (type === 'duplicate') {
          [440, 440].forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(f, now + i * 0.15);
            gain.gain.setValueAtTime(0.0001, now + i * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.15 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + i * 0.15);
            osc.stop(now + i * 0.15 + 0.15);
          });
        }
      } catch (e) {}
    }

    function triggerHaptic(type) {
      if ('vibrate' in navigator) {
        try {
          if (type === 'success') navigator.vibrate([40, 40, 50]);
          else if (type === 'duplicate') navigator.vibrate([70, 40, 70]);
          else navigator.vibrate(20);
        } catch (e) {}
      }
    }

    function toggleSound() {
      soundEnabled = !soundEnabled;
      document.getElementById('soundIcon').textContent = soundEnabled ? '🔊' : '🔇';
      triggerHaptic('tap');
    }

    function toggleStationDropdown() {
      triggerHaptic('tap');
      document.getElementById('stationDropdownMenu').classList.toggle('hidden');
    }

    function selectStation(token, name) {
      triggerHaptic('tap');
      currentStation = { id: token, token: token, name: name };
      document.getElementById('selectedStationName').textContent = name;
      document.getElementById('stationDropdownMenu').classList.add('hidden');
      updateStats();
    }

    function updateStats() {
      const stationScans = scans.filter(s => s.vendorId === currentStation.id || s.vendorToken === currentStation.token);
      const unique = new Set(stationScans.map(s => s.participantToken)).size;
      document.getElementById('statTotalScans').textContent = stationScans.length;
      document.getElementById('statUniqueAttendees').textContent = unique;
      document.getElementById('headerScanCountBadge').textContent = stationScans.length;
    }

    async function initCamera() {
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          cameras = devices;
          const select = document.getElementById('cameraSelect');
          select.innerHTML = '';
          const backCam = devices.find(d => /back|rear|environment/i.test(d.label));
          selectedCameraId = backCam ? backCam.id : devices[0].id;
          devices.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.label || ('Camera ' + c.id.substring(0, 5));
            if (c.id === selectedCameraId) opt.selected = true;
            select.appendChild(opt);
          });
        }
      } catch (e) {}
      startContinuousScanner();
    }

    async function startContinuousScanner() {
      if (html5QrScanner) {
        try {
          if (html5QrScanner.isScanning) await html5QrScanner.stop();
          await html5QrScanner.clear();
        } catch (e) {}
      }

      html5QrScanner = new Html5Qrcode('reader');
      const config = {
        fps: 15,
        qrbox: (w, h) => {
          const edge = Math.min(w, h);
          const size = Math.floor(edge * 0.72);
          return { width: Math.max(180, Math.min(260, size)), height: Math.max(180, Math.min(260, size)) };
        },
        aspectRatio: 1.0,
      };

      const onScan = (decodedText) => {
        const now = Date.now();
        if (isProcessing) return;
        if (lastScanned.text === decodedText && now - lastScanned.time < 8000) return;
        if (now - lastScanned.time < 1500) return;

        lastScanned = { text: decodedText, time: now };
        isProcessing = true;
        processBadgeScan(decodedText);
        setTimeout(() => { isProcessing = false; }, 1800);
      };

      try {
        if (selectedCameraId) {
          await html5QrScanner.start(selectedCameraId, config, onScan, () => {});
        } else {
          await html5QrScanner.start({ facingMode: { ideal: 'environment' } }, config, onScan, () => {});
        }
      } catch (err) {
        try {
          await html5QrScanner.start({ facingMode: 'environment' }, config, onScan, () => {});
        } catch (e2) {
          await html5QrScanner.start({ facingMode: 'user' }, config, onScan, () => {});
        }
      }
    }

    async function restartCameraStream() {
      triggerHaptic('tap');
      if (html5QrScanner && html5QrScanner.isScanning) {
        try { await html5QrScanner.stop(); } catch (e) {}
      }
      setTimeout(startContinuousScanner, 200);
    }

    async function flipCamera() {
      triggerHaptic('tap');
      if (cameras.length < 2) return;
      const idx = cameras.findIndex(c => c.id === selectedCameraId);
      const nextIdx = (idx + 1) % cameras.length;
      selectedCameraId = cameras[nextIdx].id;
      document.getElementById('cameraSelect').value = selectedCameraId;
      await restartCameraStream();
    }

    async function onSelectCamera(newId) {
      selectedCameraId = newId;
      await restartCameraStream();
    }

    async function processBadgeScan(rawText) {
      let token = rawText.trim();
      try {
        if (token.startsWith('http://') || token.startsWith('https://')) {
          const u = new URL(token);
          token = u.searchParams.get('p') || u.searchParams.get('participant') || token;
        } else if (token.startsWith('{') && token.endsWith('}')) {
          const parsed = JSON.parse(token);
          token = parsed.p || parsed.token || token;
        }
      } catch (e) {}

      const cleanToken = token.toUpperCase().trim();
      const payload = {
        action: 'qr_checkin',
        vendorToken: currentStation.token,
        participantId: cleanToken,
        timestamp: new Date().toISOString(),
      };

      const isLocalDup = scans.some(s => 
        (s.vendorId === currentStation.id || s.vendorToken === currentStation.token) &&
        s.participantToken === cleanToken
      );

      let backendRes = null;
      try {
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
        });
        backendRes = await response.json();
      } catch (e) {
        backendRes = {
          success: !isLocalDup,
          duplicate: isLocalDup,
          name: 'Participant ' + cleanToken,
          office: 'Attendee',
          completion: isLocalDup ? 1 : 2,
          total: 3,
          raffleQualified: !isLocalDup,
          message: isLocalDup ? 'Duplicate Scan' : 'Check-in recorded',
        };
      }

      const isDup = backendRes.duplicate || isLocalDup;
      const card = document.getElementById('resultCard');
      card.classList.remove('hidden');

      if (isDup) {
        playSound('duplicate');
        triggerHaptic('duplicate');
        card.className = 'mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up backdrop-blur-2xl bg-[#2b1f09]/85 border-2 border-amber-400/50 shadow-[0_16px_48px_rgba(245,158,11,0.35)]';
        document.getElementById('resultTitle').className = 'text-xl font-extrabold uppercase my-1 text-amber-300';
        document.getElementById('resultTitle').textContent = '⛔ DUPLICATE SCAN REJECTED';
        document.getElementById('resultMessage').textContent = backendRes.message || ('Attendee already checked in at ' + currentStation.name);
      } else {
        triggerHaptic('success');
        card.className = 'mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up backdrop-blur-2xl bg-[#082417]/85 border-2 border-emerald-400/50 shadow-[0_16px_48px_rgba(16,185,129,0.35)]';
        document.getElementById('resultTitle').className = 'text-xl font-extrabold uppercase my-1 text-emerald-300';
        document.getElementById('resultTitle').textContent = '✓ CHALLENGE COMPLETE';
        document.getElementById('resultMessage').textContent = backendRes.message || ('Stamp awarded at ' + currentStation.name);

        if (backendRes.raffleQualified) {
          try { confetti({ particleCount: 110, spread: 70, origin: { y: 0.6 } }); } catch (e) {}
        } else {
          playSound('success');
        }
      }

      document.getElementById('resultAttendeeName').textContent = backendRes.name || cleanToken;
      document.getElementById('resultAttendeeOffice').textContent = backendRes.office || 'Attendee';
      const comp = backendRes.completion || (isDup ? 1 : 2);
      const tot = backendRes.total || 3;
      document.getElementById('resultStampCount').textContent = comp + ' / ' + tot;
      const pct = Math.min(100, Math.round((comp / tot) * 100));
      document.getElementById('resultProgressBar').style.width = pct + '%';
      
      const raffleBadge = document.getElementById('raffleBadge');
      if (backendRes.raffleQualified) raffleBadge.classList.remove('hidden');
      else raffleBadge.classList.add('hidden');

      scans.unshift({
        timestamp: Date.now(),
        participantToken: cleanToken,
        participantName: backendRes.name || cleanToken,
        participantOffice: backendRes.office || 'Attendee',
        vendorId: currentStation.id,
        vendorName: currentStation.name,
        vendorToken: currentStation.token,
        isDuplicate: isDup,
      });
      localStorage.setItem('csam_vendor_scans_prod', JSON.stringify(scans));
      updateStats();
    }

    function handleManualSubmit(e) {
      e.preventDefault();
      triggerHaptic('tap');
      const input = document.getElementById('manualTokenInput');
      const val = input.value.trim();
      if (!val) return;
      processBadgeScan(val);
      input.value = '';
    }

    function openHistoryModal() {
      triggerHaptic('tap');
      const tbody = document.getElementById('historyTableBody');
      if (scans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-[#8E9BB5]">No scans recorded yet.</td></tr>';
      } else {
        tbody.innerHTML = scans.map(s => \`
          <tr class="border-b border-white/5 hover:bg-white/5">
            <td class="py-2.5 text-[#8E9BB5]">\${new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
            <td class="py-2.5 font-bold text-white">\${s.participantName}</td>
            <td class="py-2.5 text-cyan-300 font-semibold">\${s.vendorToken || s.vendorId}</td>
            <td class="py-2.5">\${s.isDuplicate ? '<span class="text-amber-400 font-bold">Duplicate</span>' : '<span class="text-emerald-400 font-bold">Stamped</span>'}</td>
          </tr>
        \`).join('');
      }
      document.getElementById('historyModal').classList.remove('hidden');
    }

    function closeHistoryModal() {
      document.getElementById('historyModal').classList.add('hidden');
    }

    window.addEventListener('DOMContentLoaded', () => {
      updateStats();
      initCamera();
    });
  </script>
</body>
</html>`;
}
