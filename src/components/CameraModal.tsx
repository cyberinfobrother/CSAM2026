import React from 'react';
import { Camera, ShieldCheck, AlertTriangle, ExternalLink, RefreshCw, Upload, X } from 'lucide-react';
import { ModalState } from '../types';

interface CameraModalProps {
  isOpen: boolean;
  state: ModalState;
  stationName: string;
  errorMessage?: string;
  onClose: () => void;
  onGrant: () => void;
  onUploadClick: () => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  state,
  stationName,
  errorMessage,
  onClose,
  onGrant,
  onUploadClick,
}) => {
  if (!isOpen) return null;

  const isIframe = window.self !== window.top;

  return (
    <div
      id="cameraPermissionModal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && state !== 'requesting') {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-[440px] bg-[#15102A] border border-[#2B264A] rounded-2xl shadow-2xl overflow-hidden text-white animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#2B264A] bg-[#1e1938]/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#9D4EDD]/20 border border-[#9D4EDD]/40 flex items-center justify-center text-[#D8B4FE]">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-left">
              <h3 className="text-sm font-bold text-white leading-tight">Camera Access Request</h3>
              <p className="text-xs text-[#9FA8C7] leading-tight">{stationName} Scanner</p>
            </div>
          </div>
          <button
            id="closeCameraModalBtn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#28214A] text-[#9FA8C7] hover:text-white flex items-center justify-center transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 text-left">
          {/* State 1: Idle */}
          {state === 'idle' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#0F0C1B] border border-[#2B264A]">
                <div className="p-2 rounded-lg bg-[#FFC700]/10 border border-[#FFC700]/30 text-[#FFC700] flex-shrink-0">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Why does this app need camera access?
                  </h4>
                  <p className="text-xs text-[#9FA8C7] mt-1 leading-relaxed">
                    To instantly scan attendee QR codes and stamp participant digital passports at your booth in real time.
                  </p>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-[#34D399] font-bold flex items-center gap-1.5 mb-2">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Privacy First Guarantee:</span>
                </div>
                <ul className="list-disc pl-4 space-y-1 text-[11px] text-[#9FA8C7] leading-relaxed">
                  <li>All QR detection runs entirely on your local device.</li>
                  <li>No video, photo, or audio data is ever recorded, stored, or uploaded.</li>
                  <li>Camera stream turns off automatically as soon as you stop scanning.</li>
                </ul>
              </div>

              {isIframe && (
                <div className="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-200 flex items-center justify-between">
                  <span>Running in preview iframe? For direct camera access:</span>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[11px] transition-colors ml-2 shrink-0"
                  >
                    Open New Tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  id="grantCameraPermissionBtn"
                  onClick={onGrant}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#4F7CFF] to-[#9D4EDD] hover:opacity-95 shadow-lg shadow-purple-900/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Allow Camera Access
                </button>
                <button
                  id="fallbackUploadBtn"
                  onClick={onUploadClick}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[#9FA8C7] bg-[#1E1938] hover:bg-[#28214A] hover:text-white border border-[#3B3560] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Or Upload QR Photo / Screenshot
                </button>
              </div>
            </div>
          )}

          {/* State 2: Requesting */}
          {state === 'requesting' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-10 h-10 border-4 border-[#9D4EDD]/30 border-t-[#FFC700] rounded-full animate-spin mx-auto" />
              <h4 className="text-sm font-bold text-white">Prompting Browser Permission...</h4>
              <p className="text-xs text-[#9FA8C7] max-w-xs mx-auto">
                Please tap <strong className="text-white">"Allow"</strong> in your browser's permission pop-up when prompted.
              </p>
            </div>
          )}

          {/* State 3: Granted */}
          {state === 'granted' && (
            <div className="py-6 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <h4 className="text-sm font-bold text-white">Camera Access Granted!</h4>
              <p className="text-xs text-[#9FA8C7]">Starting live QR scanner stream...</p>
            </div>
          )}

          {/* State 4: Denied */}
          {state === 'denied' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#512333]/70 border border-red-400/40 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="text-left">
                  <h4 className="text-xs font-bold text-red-200 uppercase tracking-wider">
                    Camera Permission Blocked
                  </h4>
                  <p className="text-[11px] text-red-300 mt-1 leading-relaxed">
                    {errorMessage || 'Camera access was denied or could not be initialized by the browser.'}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0F0C1B] border border-[#2B264A] text-[11px] text-[#9FA8C7]">
                <div className="font-bold text-white text-xs mb-2">How to enable camera:</div>
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-[#FFC700]">1.</span>
                    <span>Click the <strong>Lock / Tune icon 🔒</strong> in your browser address bar.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-[#FFC700]">2.</span>
                    <span>Toggle <strong>Camera</strong> from "Block" to <strong>"Allow"</strong>.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-bold text-[#FFC700]">3.</span>
                    <span>
                      If running in an embedded preview/iframe, open in a new tab:
                    </span>
                  </div>
                </div>
                <div className="mt-3">
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#27314A] hover:bg-[#344265] text-white text-xs font-semibold w-full justify-center transition-colors"
                  >
                    Open Station in New Window <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={onGrant}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm text-white bg-[#9D4EDD] hover:bg-[#8A3ECE] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" /> Try Again
                </button>
                <button
                  onClick={onUploadClick}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-[#9FA8C7] bg-[#1E1938] hover:bg-[#28214A] hover:text-white border border-[#3B3560] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload QR Photo Instead
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
