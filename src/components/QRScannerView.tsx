import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { Camera, Flashlight, SwitchCamera, Upload, RefreshCw, CheckCircle2, VideoOff } from 'lucide-react';

interface QRScannerViewProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
  isScanning: boolean;
  setIsScanning: (scanning: boolean) => void;
  onRequestCameraModal: () => void;
}

export const QRScannerView: React.FC<QRScannerViewProps> = ({
  onScanSuccess,
  isScanning,
  setIsScanning,
  onRequestCameraModal,
}) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const lastScannedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<string>('Ready to scan');
  const [processingFile, setProcessingFile] = useState<boolean>(false);
  const [isRestarting, setIsRestarting] = useState<boolean>(false);
  const [scanFlash, setScanFlash] = useState<boolean>(false);

  // Stop scanner safely
  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn('Scanner stop error', e);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  }, [setIsScanning]);

  // Load available cameras
  const refreshCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Prefer back / rear camera
        const backCam = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment')
        );
        setSelectedCameraId((prev) => prev || (backCam ? backCam.id : devices[0].id));
      }
    } catch (e) {
      // Ignore if permissions not yet granted
    }
  }, []);

  // Start continuous camera stream
  const startCameraStream = useCallback(async (cameraId?: string) => {
    try {
      setScannerStatus('Starting camera...');
      
      // Stop any existing instance first
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          await scannerRef.current.clear();
        } catch (e) {
          // ignore cleanup errors
        }
        scannerRef.current = null;
      }

      // Small delay to allow mobile hardware to release
      await new Promise((r) => setTimeout(r, 120));

      const elementId = 'reader';
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      const handleSuccess = (decodedText: string) => {
        const now = Date.now();
        // Prevent duplicate firing while attendee holds badge or during cooldown
        if (isProcessingRef.current) return;
        if (lastScannedRef.current.text === decodedText && now - lastScannedRef.current.time < 3000) {
          return;
        }
        if (now - lastScannedRef.current.time < 1200) {
          return;
        }

        lastScannedRef.current = { text: decodedText, time: now };
        isProcessingRef.current = true;

        // Visual flash indication on the viewfinder
        setScanFlash(true);
        setScannerStatus('✓ QR Code Scanned!');

        // Send to parent handler
        onScanSuccess(decodedText);

        // Reset flash and lock after 1.5 seconds WITHOUT stopping the camera
        setTimeout(() => {
          setScanFlash(false);
          isProcessingRef.current = false;
          setScannerStatus('Camera live — Ready for next attendee');
        }, 1500);
      };

      const targetCamera = cameraId || selectedCameraId;
      if (targetCamera) {
        await scanner.start(targetCamera, config, handleSuccess, () => {});
      } else {
        // Fallback sequence: exact environment -> environment -> user
        try {
          await scanner.start(
            { facingMode: { exact: 'environment' } },
            config,
            handleSuccess,
            () => {}
          );
        } catch (e1) {
          try {
            await scanner.start(
              { facingMode: 'environment' },
              config,
              handleSuccess,
              () => {}
            );
          } catch (e2) {
            await scanner.start(
              { facingMode: 'user' },
              config,
              handleSuccess,
              () => {}
            );
          }
        }
      }

      setIsScanning(true);
      setScannerStatus('Camera live — Ready for attendee badges');

      // Check for torch capability
      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        if (capabilities && 'torch' in capabilities) {
          setTorchSupported(true);
        } else {
          setTorchSupported(false);
        }
      } catch (e) {
        setTorchSupported(false);
      }

      // Refresh camera list after permission is granted
      refreshCameras();
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Camera start failed', error);
      setIsScanning(false);
      setScannerStatus('Camera start failed');
      // If error is permission or device error, trigger the modal helper
      onRequestCameraModal();
    }
  }, [selectedCameraId, onScanSuccess, setIsScanning, refreshCameras, onRequestCameraModal]);

  // Synchronize when isScanning prop changes
  useEffect(() => {
    if (isScanning && !scannerRef.current?.isScanning) {
      startCameraStream();
    } else if (!isScanning && scannerRef.current?.isScanning) {
      stopScanner();
    }
  }, [isScanning, startCameraStream, stopScanner]);

  // Initial load
  useEffect(() => {
    refreshCameras();
    return () => {
      stopScanner();
    };
  }, [refreshCameras, stopScanner]);

  // One-click Restart Camera without browser refresh
  const handleRestartCamera = async () => {
    setIsRestarting(true);
    setScannerStatus('Restarting camera stream...');
    await stopScanner();
    setTimeout(async () => {
      try {
        await startCameraStream(selectedCameraId);
      } finally {
        setIsRestarting(false);
      }
    }, 250);
  };

  // Toggle flashlight
  const toggleTorch = async () => {
    if (!scannerRef.current || !isScanning) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Could not toggle torch', e);
    }
  };

  // Switch camera
  const handleCameraChange = async (newId: string) => {
    setSelectedCameraId(newId);
    if (isScanning) {
      await stopScanner();
      setTimeout(() => {
        startCameraStream(newId);
      }, 150);
    }
  };

  // File upload scan
  const handleFileScan = async (file: File) => {
    if (!file) return;
    setProcessingFile(true);
    setScannerStatus('Analyzing QR code from image...');
    await stopScanner();

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode('reader');
    }

    try {
      const decodedText = await scannerRef.current.scanFile(file, true);
      setProcessingFile(false);
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 1500);
      onScanSuccess(decodedText);
    } catch (err) {
      setProcessingFile(false);
      setScannerStatus('No QR code detected in image. Please try again.');
      alert('Could not read a valid QR code from this image. Please ensure the QR code is clear, well-lit, and in focus.');
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileScan(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileScan(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Scanner Box / Viewport - Glassmorphic Viewfinder Bezel */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative min-h-[280px] md:min-h-[310px] rounded-2xl backdrop-blur-xl transition-all duration-300 flex flex-col items-center justify-center overflow-hidden ${
          scanFlash
            ? 'border-2 border-emerald-400 bg-emerald-950/40 shadow-[0_0_35px_rgba(52,211,153,0.45)]'
            : dragOver
            ? 'border-2 border-cyan-400 bg-[#0a1b38]/70 shadow-[0_0_30px_rgba(6,182,212,0.35)]'
            : isScanning
            ? 'border-2 border-cyan-400/60 bg-[#050A17]/65 shadow-[0_0_30px_rgba(6,182,212,0.2),inset_0_0_25px_rgba(6,182,212,0.08)]'
            : 'border-2 border-white/15 hover:border-cyan-400/40 bg-[#050A17]/60 shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.12)]'
        }`}
      >
        {/* html5-qrcode DOM Target - Video stream stays 100% sharp and unblurred */}
        <div
          id="reader"
          className={`w-full h-full min-h-[280px] rounded-2xl overflow-hidden ${
            !isScanning ? 'hidden' : 'block'
          }`}
        />

        {/* Viewfinder Overlay & Laser when scanning */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Target Reticle corners */}
            <div
              className={`relative w-56 h-56 border-2 rounded-xl overflow-hidden transition-colors duration-300 ${
                scanFlash
                  ? 'border-emerald-400 shadow-[0_0_20px_#10b981]'
                  : 'border-cyan-400/60 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
              }`}
            >
              <div
                className={`absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 rounded-tl transition-colors ${
                  scanFlash ? 'border-emerald-400' : 'border-cyan-400 shadow-[0_0_10px_#00E5FF]'
                }`}
              />
              <div
                className={`absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 rounded-tr transition-colors ${
                  scanFlash ? 'border-emerald-400' : 'border-cyan-400 shadow-[0_0_10px_#00E5FF]'
                }`}
              />
              <div
                className={`absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 rounded-bl transition-colors ${
                  scanFlash ? 'border-emerald-400' : 'border-cyan-400 shadow-[0_0_10px_#00E5FF]'
                }`}
              />
              <div
                className={`absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 rounded-br transition-colors ${
                  scanFlash ? 'border-emerald-400' : 'border-cyan-400 shadow-[0_0_10px_#00E5FF]'
                }`}
              />

              {/* Laser scanning beam with cyber gradient */}
              {!scanFlash && (
                <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_14px_#00E5FF] animate-scan-line" />
              )}

              {/* Scan flash confirmation */}
              {scanFlash && (
                <div className="absolute inset-0 bg-emerald-500/25 backdrop-blur-[2px] flex items-center justify-center animate-fade-in">
                  <div className="px-3.5 py-1.5 rounded-full bg-emerald-600/90 text-white text-xs font-black tracking-wide flex items-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.6)] border border-emerald-300/40">
                    <CheckCircle2 className="w-4 h-4" />
                    SCANNED!
                  </div>
                </div>
              )}
            </div>

            {/* Live Status Pill at bottom of viewport with glassmorphic backdrop */}
            <div className="absolute bottom-3 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl text-xs text-white border border-white/20 flex items-center gap-2 shadow-xl">
              <span className={`w-2 h-2 rounded-full ${scanFlash ? 'bg-emerald-400 animate-ping' : 'bg-cyan-400 animate-pulse'}`} />
              <span className="font-medium tracking-wide">{scannerStatus}</span>
            </div>
          </div>
        )}

        {/* Idle View / Instructions when not scanning */}
        {!isScanning && (
          <div className="p-6 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/15 flex items-center justify-center text-cyan-400 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              {processingFile ? (
                <div className="w-8 h-8 border-3 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              ) : (
                <Camera className="w-8 h-8 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                {processingFile ? 'Processing QR Image...' : 'Camera Inactive'}
              </h3>
              <p className="text-xs text-[#9BB0D3] mt-1 max-w-xs leading-relaxed">
                {processingFile
                  ? 'Decoding participant token...'
                  : 'Tap below to launch continuous live scanning for attendee badges.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Control Actions - Glassmorphic styling */}
      <div className="flex flex-col gap-2">
        {/* Main Scan Buttons */}
        {!isScanning ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              id="liveScanBtn"
              onClick={() => setIsScanning(true)}
              className="py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#00D2FF] to-[#0066FF] hover:from-[#26D9FF] hover:to-[#1A75FF] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/40 border border-cyan-300/30 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Start Live Camera
            </button>
            <button
              id="photoBtn"
              onClick={() => fileInputRef.current?.click()}
              className="py-3.5 px-4 rounded-xl font-bold text-sm text-white backdrop-blur-xl bg-white/10 hover:bg-white/15 border border-white/15 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Upload className="w-4 h-4 text-[#9BB0D3]" /> Take / Upload QR Photo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                id="restartCameraBtn"
                onClick={handleRestartCamera}
                disabled={isRestarting}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-white backdrop-blur-xl bg-white/10 hover:bg-white/15 border border-white/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                title="Restart camera stream if frozen or blank"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Restarting...' : 'Restart Camera'}
              </button>

              <button
                id="stopScanBtn"
                onClick={stopScanner}
                className="py-2.5 px-3 rounded-xl font-bold text-xs text-rose-200 backdrop-blur-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <VideoOff className="w-3.5 h-3.5 text-rose-300" />
                Pause Camera
              </button>
            </div>

            {/* In-stream camera controls */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10">
              {cameras.length > 1 ? (
                <div className="flex items-center gap-2 flex-1">
                  <SwitchCamera className="w-4 h-4 text-[#9BB0D3] shrink-0" />
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="w-full text-xs bg-black/50 text-white border border-white/15 rounded-lg px-2 py-1.5 focus:outline-none focus:border-cyan-400"
                  >
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || `Camera ${c.id.substring(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-cyan-300 flex items-center gap-1.5 font-medium px-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  Continuous Live Scanner Active
                </span>
              )}

              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    torchOn
                      ? 'bg-[#FFC700] text-black font-bold shadow-[0_0_12px_#FFC700]'
                      : 'backdrop-blur-md bg-white/10 text-white hover:bg-white/20 border border-white/15'
                  }`}
                  title="Toggle Flashlight"
                >
                  <Flashlight className="w-3.5 h-3.5" />
                  {torchOn ? 'Flash On' : 'Flash'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Hidden File Input for Native Camera / Photo upload */}
        <input
          ref={fileInputRef}
          type="file"
          id="qrFileInput"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={onFileInputChange}
        />
      </div>
    </div>
  );
};
