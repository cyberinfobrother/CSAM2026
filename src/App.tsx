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
import { TestBadgeModal } from './components/TestBadgeModal';
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
    return DEFAULT_VENDORS.find((v) => v.id === storedId) || DEFAULT_VENDORS[3]; // V04 default
  });

  // Backend Integration State
  const [backendConfig, setBackendConfig] = useState<BackendConfig>({
    backendUrl: '',
    hasExternalBackend: false,
    builtInBackendActive: true,
  });
  const [isBackendModalOpen, setIsBackendModalOpen] = useState<boolean>(false);

  // Participants & History
  const [participants, setParticipants] = useState<Participant[]>(() => getStoredParticipants());
  const [scans, setScans] = useState<ScanRecord[]>(() => {
    try {
      const saved = localStorage.getItem('csam_vendor_scans_v1');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Scanner state
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);

  // Modals
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [cameraModalState, setCameraModalState] = useState<ModalState>('idle');
  const [cameraModalError, setCameraModalError] = useState<string>('');

  const [isTestBadgeModalOpen, setIsTestBadgeModalOpen] = useState<boolean>(false);
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
      localStorage.setItem('csam_vendor_scans_v1', JSON.stringify(scans));
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

  const handleSaveBackendConfig = async (url: string) => {
    const updated = await saveBackendConfig(url);
    setBackendConfig(updated);
  };

  const handleTestBackend = async (url: string) => {
    return await testBackendConnection(url);
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
        // Submit scan record to the backend API
        const res = await recordScanWithBackend(currentVendor.token, token);

        const isDuplicate = res.duplicate;
        const isRaffleQualified = res.raffleQualified;

        if (isDuplicate) {
          soundFx.playDuplicate();
          setOutcome({
            type: 'duplicate',
            title: '⚠️ ALREADY COMPLETED',
            message: res.message,
            participantName: res.name,
            participantOffice: res.office,
            completion: res.completion,
            total: res.total,
            raffleQualified: isRaffleQualified,
            vendorName: currentVendor.name,
            syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
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
          syncedToExternal: res.externalBackend ? res.externalBackend.synced : undefined,
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
    // Auto-reopen live camera or readiness
    openCameraModal();
  };

  // Vendor stations stats for this station
  const stationScans = scans.filter((s) => s.vendorId === currentVendor.id);
  const uniqueAttendees = new Set(stationScans.map((s) => s.participantToken)).size;

  return (
    <div className="min-h-screen bg-[#0B1020] text-white flex flex-col items-center justify-start p-4 sm:p-6 selection:bg-[#4F7CFF] selection:text-white">
      {/* Container */}
      <div className="w-full max-w-[620px] mx-auto">
        {/* Main Card */}
        <div className="bg-[#151C31] border border-[#2B3554] rounded-[24px] p-5 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)] relative overflow-hidden">
          {/* Subtle glowing backdrop highlight */}
          <div className="absolute -top-24 -right-24 w-60 h-60 bg-[#4F7CFF]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-[#9D4EDD]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Station Header */}
          <StationHeader
            currentVendor={currentVendor}
            allVendors={vendors}
            onSelectVendor={handleSelectVendor}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
            onOpenTestBadges={() => setIsTestBadgeModalOpen(true)}
            onOpenHistory={() => setIsHistoryModalOpen(true)}
            onOpenBackend={() => setIsBackendModalOpen(true)}
            hasExternalBackend={backendConfig.hasExternalBackend}
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

          {/* Quick Testing Bar for instantaneous testing without camera */}
          <div className="mt-6 pt-5 border-t border-[#232B44]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#8E9BB5] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#FFC700]" />
                Interactive Attendee Simulator
              </span>
              <button
                onClick={() => setIsTestBadgeModalOpen(true)}
                className="text-[11px] text-[#4F7CFF] hover:underline font-semibold"
              >
                View Full Badges →
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {participants.slice(0, 3).map((p) => {
                const stamped = p.completedVendors.includes(currentVendor.id);
                return (
                  <button
                    key={p.token}
                    onClick={() => handleScan(p.token)}
                    className="p-2 rounded-xl bg-[#0E1424] hover:bg-[#1A233C] border border-[#232B44] text-left transition-colors text-xs flex flex-col justify-between"
                  >
                    <div className="font-bold text-white truncate">{p.name.split(' ')[0]}</div>
                    <div className="flex items-center justify-between text-[10px] text-[#8E9BB5] mt-1">
                      <span>{p.completedVendors.length}/6 done</span>
                      <span className={stamped ? 'text-amber-400' : 'text-emerald-400 font-bold'}>
                        {stamped ? 'Stamped' : 'Stamp'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Station Metrics Banner */}
          <div className="mt-4 p-3 rounded-xl bg-[#090D1A]/80 border border-[#20283E] flex items-center justify-around text-center text-xs">
            <div>
              <div className="text-base font-extrabold text-white">{stationScans.length}</div>
              <div className="text-[10px] text-[#8E9BB5] uppercase tracking-wider">Total Scans</div>
            </div>
            <div className="w-px h-6 bg-[#20283E]" />
            <div>
              <div className="text-base font-extrabold text-[#4F7CFF]">{uniqueAttendees}</div>
              <div className="text-[10px] text-[#8E9BB5] uppercase tracking-wider">Unique Attendees</div>
            </div>
            <div className="w-px h-6 bg-[#20283E]" />
            <div>
              <div className="text-base font-extrabold text-emerald-400">
                {TOTAL_STATIONS_FOR_RAFFLE} of {TOTAL_EVENT_STATIONS}
              </div>
              <div className="text-[10px] text-[#8E9BB5] uppercase tracking-wider">Raffle Target</div>
            </div>
          </div>
        </div>

        {/* Footer info & tips */}
        <div className="mt-4 text-center text-xs text-[#5D6B88] space-y-1">
          <p>
            Connected to Vendor Station: <strong>{currentVendor.name}</strong> ({currentVendor.token})
          </p>
          <p className="text-[11px]">
            Fully compatible with attendee mobile web passports, physical badge QR codes, and photo uploads.
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

      {/* Attendee Test Badges & Simulator Modal */}
      <TestBadgeModal
        isOpen={isTestBadgeModalOpen}
        onClose={() => setIsTestBadgeModalOpen(false)}
        participants={participants}
        currentVendorId={currentVendor.id}
        onSimulateScan={handleScan}
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
