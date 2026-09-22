import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, CameraDevice } from 'html5-qrcode';
import { Camera, Flashlight, SwitchCamera, Upload, AlertCircle, Sparkles } from 'lucide-react';

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
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [scannerStatus, setScannerStatus] = useState<string>('Ready to scan');
  const [processingFile, setProcessingFile] = useState<boolean>(false);

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
      setIsScanning(false);
      setTorchOn(false);
    }
  }, [setIsScanning]);

  // Load available cameras
  const refreshCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        setCameras(devices);
        // Prefer back camera if available
        const backCam = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') || 
          d.label.toLowerCase().includes('environment')
        );
        setSelectedCameraId(backCam ? backCam.id : devices[0].id);
      }
    } catch (e) {
      // Ignore if permissions not yet granted
    }
  }, []);

  useEffect(() => {
    refreshCameras();
    return () => {
      stopScanner();
    };
  }, [refreshCameras, stopScanner]);

  // Start scanning
  const startCameraStream = async (cameraId?: string): Promise<boolean> => {
    await stopScanner();

    const elementId = 'reader';
    const scanner = new Html5Qrcode(elementId);
    scannerRef.current = scanner;

    const config = {
      fps: 15,
      qrbox: { width: 240, height: 240 },
      aspectRatio: 1.0,
    };

    const handleSuccess = (decodedText: string) => {
      stopScanner();
      onScanSuccess(decodedText);
    };

    try {
      if (cameraId) {
        await scanner.start(cameraId, config, handleSuccess, () => {});
      } else {
        // Try environment first
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
      setScannerStatus('Align attendee QR code within the frame');

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

      // Refresh camera list after permission granted
      refreshCameras();
      return true;
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Camera start failed', error);
      setIsScanning(false);
      throw error;
    }
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
      try {
        await startCameraStream(newId);
      } catch (e) {
        console.error('Failed switching camera', e);
      }
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
      {/* Scanner Box / Viewport */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative min-h-[260px] md:min-h-[290px] rounded-2xl bg-[#090D1A] border-2 ${
          dragOver
            ? 'border-[#4F7CFF] bg-[#101730]'
            : isScanning
            ? 'border-[#4F7CFF]/80 shadow-[0_0_25px_rgba(79,124,255,0.2)]'
            : 'border-[#232B44]'
        } flex flex-col items-center justify-center overflow-hidden transition-all`}
      >
        {/* html5-qrcode DOM Target */}
        <div
          id="reader"
          className={`w-full h-full min-h-[260px] rounded-2xl overflow-hidden ${
            !isScanning ? 'hidden' : 'block'
          }`}
        />

        {/* Viewfinder Overlay & Laser when scanning */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* Target Reticle corners */}
            <div className="relative w-56 h-56 border-2 border-[#4F7CFF]/40 rounded-xl overflow-hidden">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-[#4F7CFF] rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-[#4F7CFF] rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-[#4F7CFF] rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-[#4F7CFF] rounded-br" />

              {/* Scanning red/blue laser beam */}
              <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FFC700] to-transparent shadow-[0_0_12px_#FFC700] animate-scan-line" />
            </div>
            <div className="absolute bottom-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-xs text-[#aeb8d0] border border-[#2b3554]">
              {scannerStatus}
            </div>
          </div>
        )}

        {/* Idle View / Instructions when not scanning */}
        {!isScanning && (
          <div className="p-6 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#151C31] border border-[#2B3554] flex items-center justify-center text-[#4F7CFF] shadow-inner">
              {processingFile ? (
                <div className="w-8 h-8 border-3 border-[#4F7CFF]/30 border-t-[#4F7CFF] rounded-full animate-spin" />
              ) : (
                <Camera className="w-8 h-8" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                {processingFile ? 'Processing QR Image...' : 'Camera Offline'}
              </h3>
              <p className="text-xs text-[#8E9BB5] mt-1 max-w-xs">
                {processingFile
                  ? 'Decoding participant token...'
                  : 'Start live camera scanning or drop attendee QR ticket image here.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Control Actions */}
      <div className="flex flex-col gap-2">
        {/* Main Scan Buttons */}
        {!isScanning ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              id="liveScanBtn"
              onClick={onRequestCameraModal}
              className="py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-[#4F7CFF] hover:bg-[#3D6CEB] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 cursor-pointer"
            >
              <Camera className="w-4 h-4" /> Scan Live QR Video
            </button>
            <button
              id="photoBtn"
              onClick={() => fileInputRef.current?.click()}
              className="py-3.5 px-4 rounded-xl font-bold text-sm text-white bg-[#202942] hover:bg-[#2A3656] border border-[#2B3554] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#8E9BB5]" /> Take / Upload QR Photo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <button
              id="stopScanBtn"
              onClick={stopScanner}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 cursor-pointer"
            >
              Stop Live Camera
            </button>

            {/* In-stream camera controls */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#151C31] border border-[#2B3554]">
              {cameras.length > 1 ? (
                <div className="flex items-center gap-2 flex-1">
                  <SwitchCamera className="w-4 h-4 text-[#8E9BB5] shrink-0" />
                  <select
                    value={selectedCameraId}
                    onChange={(e) => handleCameraChange(e.target.value)}
                    className="w-full text-xs bg-[#0B1020] text-white border border-[#2B3554] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#4F7CFF]"
                  >
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || `Camera ${c.id.substring(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-[#8E9BB5]">Camera active</span>
              )}

              {torchSupported && (
                <button
                  onClick={toggleTorch}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                    torchOn
                      ? 'bg-[#FFC700] text-black'
                      : 'bg-[#202942] text-white hover:bg-[#2B3554]'
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
