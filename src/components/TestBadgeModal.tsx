import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, Play, Copy, Check, UserCheck, Sparkles, ExternalLink } from 'lucide-react';
import { Participant } from '../types';

interface TestBadgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  participants: Participant[];
  currentVendorId: string;
  onSimulateScan: (tokenPayload: string) => void;
}

export const TestBadgeModal: React.FC<TestBadgeModalProps> = ({
  isOpen,
  onClose,
  participants,
  currentVendorId,
  onSimulateScan,
}) => {
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(
    participants[0] || null
  );
  const [customInput, setCustomInput] = useState<string>('https://csam.event.app/passport?p=PT-9421');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (selectedParticipant) {
      const url = `https://csam.event.app/passport?p=${selectedParticipant.token}`;
      setCustomInput(url);
      generateQr(url);
    }
  }, [selectedParticipant]);

  const generateQr = async (text: string) => {
    try {
      const url = await QRCode.toDataURL(text, {
        width: 220,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQrDataUrl(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCustomGenerate = () => {
    if (customInput.trim()) {
      generateQr(customInput.trim());
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(customInput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

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
            <div className="w-9 h-9 rounded-xl bg-[#4F7CFF]/20 border border-[#4F7CFF]/40 flex items-center justify-center text-[#4F7CFF]">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Attendee Test Badges</h3>
              <p className="text-xs text-[#8E9BB5]">
                Generate scannable QR codes or simulate test check-ins
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
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Participant Picker */}
          <div>
            <label className="block text-xs font-semibold text-[#8E9BB5] uppercase tracking-wider mb-2">
              Select Sample Attendee
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {participants.map((p) => {
                const alreadyStamped = p.completedVendors.includes(currentVendorId);
                const isSelected = selectedParticipant?.token === p.token;
                return (
                  <button
                    key={p.token}
                    onClick={() => setSelectedParticipant(p)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-[#202942] border-[#4F7CFF] shadow-md shadow-blue-900/20'
                        : 'bg-[#0E1424] border-[#232B44] hover:border-[#38466E]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-bold text-white">{p.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          alreadyStamped
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}
                      >
                        {alreadyStamped ? 'Already Stamped' : 'Ready to Stamp'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8E9BB5] truncate mt-1">
                      {p.office}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5 text-[10px] text-white/60">
                      <span>Token: {p.token}</span>
                      <span>{p.completedVendors.length} / 6 stamped</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active QR Display & Action */}
          <div className="p-4 rounded-xl bg-[#090D1A] border border-[#232B44] flex flex-col sm:flex-row items-center gap-5">
            {qrDataUrl && (
              <div className="p-2 rounded-xl bg-white flex flex-col items-center justify-center shrink-0 shadow-lg">
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  className="w-40 h-40 object-contain rounded"
                  referrerPolicy="no-referrer"
                />
                <span className="text-[10px] font-bold text-gray-800 mt-1">
                  Point Camera Here
                </span>
              </div>
            )}

            <div className="flex-1 space-y-3 text-left w-full">
              <div>
                <span className="text-xs font-semibold text-[#8E9BB5]">Encoded Payload:</span>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => {
                      setCustomInput(e.target.value);
                      generateQr(e.target.value);
                    }}
                    className="flex-1 bg-[#151C31] text-xs text-white px-3 py-2 rounded-lg border border-[#2B3554] focus:outline-none focus:border-[#4F7CFF]"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="p-2 rounded-lg bg-[#202942] hover:bg-[#2B3554] text-white text-xs border border-[#2B3554]"
                    title="Copy payload"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Instant Simulation Button */}
              <button
                onClick={() => {
                  onClose();
                  onSimulateScan(customInput);
                }}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-[#4F7CFF] to-[#9D4EDD] hover:opacity-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Simulate Direct Scan as This Attendee
              </button>

              <p className="text-[11px] text-[#8E9BB5] leading-relaxed">
                💡 Tip: You can scan this QR code directly using your phone's camera, or click "Simulate Direct Scan" to test validation instantly without camera.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
