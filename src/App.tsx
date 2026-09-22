import React, { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  DEFAULT_VENDORS,
  TOTAL_STATIONS_FOR_RAFFLE,
  TOTAL_EVENT_STATIONS,
  getStoredParticipants,
  saveStoredParticipants,
  getStoredVendorId,
  saveStoredVendorId,
} from './data/mockData';
import { VendorStation, Participant, ScanRecord, ScanOutcome, ModalState } from './types';
import { soundFx } from './utils/audio';
import { StationHeader } from './components/StationHeader';
import { QRScannerView } from './components/QRScannerView';
import { ScanResultCard } from './components/ScanResultCard';
import { CameraModal } from './components/CameraModal';
import { ScanHistoryModal } from './components/ScanHistoryModal';
import { BackendConnectModal } from './components/BackendConnectModal';
import {
  recordScanWithBackend,
  getBackendConfig,
  saveBackendConfig,
  testBackendConnection,
  fetchServerScans,
  BackendConfig,
  BackendTestResult,
  HARDCODED_GOOGLE_SHEETS_URL,
} from './utils/api';
import { QrCode, Sparkles, User, AlertCircle, ShieldAlert } from 'lucide-react';

export default function App() {
  // Vendor Station
  const [vendors] = useState<VendorStation[]>(DEFAULT_VENDORS);
  const [currentVendor, setCurrentVendor] = useState<VendorStation>(() => {
    // Check URL query param first
    try {
      const params = new URLSearchParams(window.location.search);
      const urlVendorId = params.get('vendor') || params.get('v');
      if (urlVendorId) {
        const found = DEFAULT_VENDORS.find(
          (v) => v.id.toUpperCase() === urlVendorId.toUpperCase() || v.token === urlVendorId
        );
        if (found) return found;
      }
    } catch (e) {}
    const storedId = getStoredVendorId();
    return DEFAULT_VENDORS.find((v) => v.id === storedId) || DEFAULT_VENDORS[0]; // Booth 1 default
  });

  // Backend Integration State (Defaulted to live Google Sheets database)
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
    databaseType: 'google_sheets',
    backendUrl: HARDCODED_GOOGLE_SHEETS_URL,
    databaseUrl: HARDCODED_GOOGLE_SHEETS_URL,
    hasExternalBackend: true,
    builtInBackendActive: true,
  });
  const [isBackendModalOpen, setIsBackendModalOpen] = useState<boolean>(false);

  // Participants & History (Clean, without mock data)
  const [participants, setParticipants] = useState<Participant[]>(() => getStoredParticipants());
  const [scans, setScans] = useState<ScanRecord[]>(() => {
    try {
      const saved = localStorage.getItem('csam_vendor_scans_prod');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [manualToken, setManualToken] = useState<string>('');

  // Modals
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [cameraModalState, setCameraModalState] = useState<ModalState>('idle');
  const [cameraModalError, setCameraModalError] = useState<string>('');

  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => soundFx.isEnabled());

  // Load backend config on mount
  useEffect(() => {
    getBackendConfig().then((cfg) => {
      setBackendConfig(cfg);
    });
  }, []);

  // Save changes
  useEffect(() => {
    saveStoredParticipants(participants);
  }, [participants]);

  useEffect(() => {
    try {
      localStorage.setItem('csam_vendor_scans_prod', JSON.stringify(scans));
    } catch (e) {}
  }, [scans]);

  const handleSelectVendor = (v: VendorStation) => {
    setCurrentVendor(v);
    saveStoredVendorId(v.id);
    setOutcome(null);
  };

  const handleToggleSound = () => {
    const next = soundFx.toggle();
    setSoundEnabled(next);
  };

  // Trigger celebration confetti
  const fireConfetti = useCallback(() => {
    try {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#4F7CFF', '#9D4EDD', '#FFC700', '#34D399', '#F43F5E'],
      });
    } catch (e) {}
  }, []);

  const handleSaveBackendConfig = async (configOrUrl: any) => {
    const updated = await saveBackendConfig(configOrUrl);
    setBackendConfig(updated);
  };

  const handleTestBackend = async (params: any) => {
    return await testBackendConnection(params);
  };

  // Handle participant scan logic (calls real backend and syncs)
  const handleScan = useCallback(
    async (rawText: string) => {
      if (!rawText || !rawText.trim()) {
        soundFx.playFailure();
        setOutcome({
          type: 'failure',
          title: '❌ Scan Rejected',
          message: 'The scanned QR code did not contain any readable participant token.',
          rawPayload: rawText,
        });
        return;
      }

      // 1. Extract participant token
      let token = rawText.trim();
      try {
        if (token.startsWith('http://') || token.startsWith('https://')) {
          const url = new URL(token);
          token = url.searchParams.get('p') || url.searchParams.get('participant') || token;
        } else if (token.startsWith('{') && token.endsWith('}')) {
          const parsed = JSON.parse(token);
          token = parsed.p || parsed.participantToken || parsed.token || token;
        }
      } catch (e) {
        // use raw text
      }

      token = token.trim();

      try {
        // Submit scan record to the backend API & live database
        const res = await recordScanWithBackend(currentVendor.token, token);

        // Refresh database config for pending counters
        getBackendConfig().then((cfg) => setBackendConfig(cfg));

        const isDuplicate = res.duplicate;
        const isRaffleQualified = res.raffleQualified;

        const updatedCol = res.externalBackend?.updatedColumn || (res as any).updatedColumn || currentVendor.id;
        const syncMsg = res.externalBackend?.synced
          ? `Logged to ${res.externalBackend.sheetName || 'Google Sheet'} column [${updatedCol}]`
          : undefined;

        if (isDuplicate) {
          soundFx.playDuplicate();
          setOutcome({
            type: 'duplicate',
            title: '⛔ DUPLICATE SCAN REJECTED',
            message: res.message || `This attendee has already been stamped at ${currentVendor.name}. Only 1 entry per booth is allowed.`,
            participantName: res.name,
            participantOffice: res.office,
            completion: res.completion,
            total: res.total,
            raffleQualified: isRaffleQualified,
            vendorName: currentVendor.name,
            syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
            updatedColumn: updatedCol,
            syncMessage: syncMsg,
          });
        } else {
          if (isRaffleQualified && res.completion === TOTAL_STATIONS_FOR_RAFFLE) {
            soundFx.playCelebration();
            fireConfetti();
          } else {
            soundFx.playSuccess();
          }

          setOutcome({
            type: 'success',
            title: '✓ CHALLENGE COMPLETE',
            message: res.message,
            participantName: res.name,
            participantOffice: res.office,
            completion: res.completion,
            total: res.total,
            raffleQualified: isRaffleQualified,
            vendorName: currentVendor.name,
            syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
            updatedColumn: updatedCol,
            syncMessage: syncMsg,
          });
        }

        // Update local state and history
        const newRecord: ScanRecord = {
          id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: Date.now(),
          participantToken: token,
          participantName: res.name,
          participantOffice: res.office,
          vendorId: currentVendor.id,
          vendorName: currentVendor.name,
          isDuplicate: isDuplicate,
          completionCount: res.completion,
          totalRequired: res.total,
          raffleQualified: isRaffleQualified,
          syncedToExternal: res.externalBackend ? res.externalBackend.synced : false,
          updatedColumn: updatedCol,
        };
        setScans((prev) => [newRecord, ...prev]);

        setParticipants((prevList) => {
          const existing = prevList.find((p) => p.token.toLowerCase() === token.toLowerCase());
          if (existing) {
            const alreadyHas = existing.completedVendors.includes(currentVendor.id);
            if (!alreadyHas && !isDuplicate) {
              return prevList.map((p) =>
                p.token === existing.token
                  ? { ...p, completedVendors: [...p.completedVendors, currentVendor.id] }
                  : p
              );
            }
            return prevList;
          } else {
            return [
              ...prevList,
              {
                token,
                name: res.name,
                office: res.office,
                completedVendors: [currentVendor.id],
              },
            ];
          }
        });
      } catch (err: any) {
        console.warn('Backend scan failed, running client fallback:', err);
        // Fallback gracefully in case of offline/network issues
        setParticipants((prevList) => {
          let participant = prevList.find(
            (p) => p.token.toLowerCase() === token.toLowerCase()
          );
          let updatedList = [...prevList];

          if (!participant) {
            participant = {
              token,
              name: `Guest Participant (${token.slice(0, 8)})`,
              office: 'Attendee — Security Summit 2026',
              completedVendors: [],
            };
            updatedList.push(participant);
          }

          const vendorId = currentVendor.id;
          const vendorShort = 'Vendor ' + vendorId.substring(1);
          const alreadyCompleted = participant.completedVendors.includes(vendorId);

          if (alreadyCompleted) {
            soundFx.playDuplicate();
            const currentCount = participant.completedVendors.length;
            const isRaffleQualified = currentCount >= TOTAL_STATIONS_FOR_RAFFLE;

            setOutcome({
              type: 'duplicate',
              title: '⚠️ ALREADY COMPLETED',
              message: `${vendorShort} was already stamped on this participant's passport.`,
              participantName: participant.name,
              participantOffice: participant.office,
              completion: currentCount,
              total: TOTAL_EVENT_STATIONS,
              raffleQualified: isRaffleQualified,
              vendorName: currentVendor.name,
            });

            const newRecord: ScanRecord = {
              id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: Date.now(),
              participantToken: participant.token,
              participantName: participant.name,
              participantOffice: participant.office,
              vendorId: currentVendor.id,
              vendorName: currentVendor.name,
              isDuplicate: true,
              completionCount: currentCount,
              totalRequired: TOTAL_EVENT_STATIONS,
              raffleQualified: isRaffleQualified,
            };
            setScans((prev) => [newRecord, ...prev]);
            return updatedList;
          } else {
            const newCompleted = [...participant.completedVendors, vendorId];
            const updatedParticipant = {
              ...participant,
              completedVendors: newCompleted,
            };

            const newCount = newCompleted.length;
            const isRaffleQualified = newCount >= TOTAL_STATIONS_FOR_RAFFLE;

            if (isRaffleQualified && participant.completedVendors.length < TOTAL_STATIONS_FOR_RAFFLE) {
              soundFx.playCelebration();
              fireConfetti();
            } else {
              soundFx.playSuccess();
            }

            setOutcome({
              type: 'success',
              title: '✓ CHALLENGE COMPLETE',
              message: `${vendorShort} has been verified and recorded locally.`,
              participantName: participant.name,
              participantOffice: participant.office,
              completion: newCount,
              total: TOTAL_EVENT_STATIONS,
              raffleQualified: isRaffleQualified,
              vendorName: currentVendor.name,
            });

            const newRecord: ScanRecord = {
              id: `scan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: Date.now(),
              participantToken: participant.token,
              participantName: participant.name,
              participantOffice: participant.office,
              vendorId: currentVendor.id,
              vendorName: currentVendor.name,
              isDuplicate: false,
              completionCount: newCount,
              totalRequired: TOTAL_EVENT_STATIONS,
              raffleQualified: isRaffleQualified,
            };
            setScans((prev) => [newRecord, ...prev]);
            return updatedList.map((p) => (p.token === participant!.token ? updatedParticipant : p));
          }
        });
      }
    },
    [currentVendor, fireConfetti]
  );

  // Camera permission flow from user code
  const openCameraModal = () => {
    setCameraModalState('idle');
    setCameraModalError('');
    setIsCameraModalOpen(true);
  };

  const handleGrantPermission = async () => {
    setCameraModalState('requesting');
    try {
      // Test camera permissions with browser mediaDevices
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      // Stop initial test stream tracks
      stream.getTracks().forEach((track) => track.stop());

      setCameraModalState('granted');
      setTimeout(() => {
        setIsCameraModalOpen(false);
        setIsScanning(true);
      }, 700);
    } catch (err: unknown) {
      const error = err as Error;
      setCameraModalError(
        error?.message ||
          'Camera access was denied or could not be initialized by the browser.'
      );
      setCameraModalState('denied');
    }
  };

  const handleTriggerPhotoUpload = () => {
    setIsCameraModalOpen(false);
    const input = document.getElementById('qrFileInput') as HTMLInputElement;
    if (input) input.click();
  };

  const resetScannerUI = () => {
    setOutcome(null);
  };

  const handleScanNext = () => {
    resetScannerUI();
    // Keep camera active and ready for next attendee
    setIsScanning(true);
  };

  // Vendor stations stats for this station
  const stationScans = scans.filter((s) => s.vendorId === currentVendor.id);
  const uniqueAttendees = new Set(stationScans.map((s) => s.participantToken)).size;

  return (
    <div
      className="min-h-screen relative text-white flex flex-col items-center justify-start p-4 sm:p-6 selection:bg-cyan-500 selection:text-black overflow-x-hidden"
      style={{
        backgroundImage: `radial-gradient(ellipse at 85% 15%, rgba(255, 140, 50, 0.15) 0%, transparent 45%), radial-gradient(ellipse at 15% 85%, rgba(0, 229, 255, 0.12) 0%, transparent 50%), url('/csam_theme_bg.jpg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundColor: '#070C1A',
      }}
    >
      {/* High-tech cyber mesh overlay with subtle dark depth */}
      <div className="fixed inset-0 bg-[#070B18]/60 backdrop-brightness-95 pointer-events-none" />

      {/* Container */}
      <div className="w-full max-w-[620px] mx-auto relative z-10">
        {/* Main Card - Glassmorphism */}
        <div className="backdrop-blur-2xl bg-[#091126]/75 border border-white/15 rounded-[26px] p-5 sm:p-8 shadow-[0_24px_64px_rgba(0,0,0,0.65),inset_0_1px_1px_rgba(255,255,255,0.12)] relative overflow-hidden">
          {/* Subtle glowing ambient lights matching CSAM theme */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#FF8C38]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#00E5FF]/15 rounded-full blur-3xl pointer-events-none" />

          {/* Station Header */}
          <StationHeader
            currentVendor={currentVendor}
            allVendors={vendors}
            onSelectVendor={handleSelectVendor}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
            onOpenHistory={() => setIsHistoryModalOpen(true)}
            onOpenBackend={() => setIsBackendModalOpen(true)}
            hasExternalBackend={backendConfig.hasExternalBackend}
            databaseType={backendConfig.databaseType}
            pendingSyncCount={backendConfig.pendingSyncCount}
            scanCount={stationScans.length}
          />

          {/* QR Scanner Viewport */}
          <QRScannerView
            isScanning={isScanning}
            setIsScanning={setIsScanning}
            onScanSuccess={handleScan}
            onRequestCameraModal={openCameraModal}
          />

          {/* Scan Result Notification Card */}
          {outcome && (
            <ScanResultCard
              outcome={outcome}
              onReset={resetScannerUI}
              onScanNext={handleScanNext}
            />
          )}

          {/* Manual Attendee Check-In (Backup for damaged/unreadable badges) */}
          <div className="mt-5 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-cyan-400" />
                Manual Attendee Check-In (Backup)
              </span>
              <span className="text-[10px] text-[#8E9BB5]">Type Token or ID</span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualToken.trim()) return;
                handleScan(manualToken.trim());
                setManualToken('');
              }}
              className="flex gap-2"
            >
              <input
                id="manualTokenInput"
                type="text"
                placeholder="Enter attendee token (e.g. badge token or URL)..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="flex-1 backdrop-blur-md bg-black/40 border border-white/15 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#7888A6] outline-none transition-colors"
              />
              <button
                id="manualSubmitBtn"
                type="submit"
                disabled={!manualToken.trim()}
                className="px-4 py-2.5 rounded-xl font-bold text-xs text-white backdrop-blur-md bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed border border-white/20 active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-md"
              >
                Verify Badge
              </button>
            </form>
          </div>

          {/* Station Metrics Banner - Glassmorphic */}
          <div className="mt-4 p-3 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 flex items-center justify-around text-center text-xs shadow-inner">
            <div>
              <div className="text-base font-extrabold text-white tracking-tight">{stationScans.length}</div>
              <div className="text-[10px] text-[#9BB0D3] uppercase tracking-wider font-semibold">Total Scans</div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <div className="text-base font-extrabold text-cyan-400 tracking-tight">{uniqueAttendees}</div>
              <div className="text-[10px] text-[#9BB0D3] uppercase tracking-wider font-semibold">Unique Attendees</div>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <div className="text-base font-extrabold text-emerald-400 tracking-tight">
                {TOTAL_STATIONS_FOR_RAFFLE} of {TOTAL_EVENT_STATIONS}
              </div>
              <div className="text-[10px] text-[#9BB0D3] uppercase tracking-wider font-semibold">Raffle Target</div>
            </div>
          </div>
        </div>

        {/* Footer info & tips */}
        <div className="mt-4 text-center text-xs text-[#8A9CBE] space-y-1">
          <p>
            Connected to Vendor Station: <strong className="text-white">{currentVendor.name}</strong> ({currentVendor.token})
          </p>
          <p className="text-[11px] text-[#7284A5]">
            CSAM 2026 QR Verification Portal • Compatible with mobile web passports and physical badges.
          </p>
        </div>
      </div>

      {/* Camera Permission Modal */}
      <CameraModal
        isOpen={isCameraModalOpen}
        state={cameraModalState}
        stationName={currentVendor.name.replace(/^VENDOR \d+ — /, '')}
        errorMessage={cameraModalError}
        onClose={() => setIsCameraModalOpen(false)}
        onGrant={handleGrantPermission}
        onUploadClick={handleTriggerPhotoUpload}
      />

      {/* Scan History & CSV Export Modal */}
      <ScanHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        scans={scans}
        onClearHistory={() => setScans([])}
        stationName={currentVendor.name}
      />

      {/* Backend & Database Connection Modal */}
      <BackendConnectModal
        isOpen={isBackendModalOpen}
        onClose={() => setIsBackendModalOpen(false)}
        config={backendConfig}
        onSaveConfig={handleSaveBackendConfig}
        onTestConnection={handleTestBackend}
      />
    </div>
  );
}
