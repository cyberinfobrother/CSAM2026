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
    // 2. Health Check & Diagnostic GET Route
    // ------------------------------------------------------------------------
    if (request.method === "GET") {
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
