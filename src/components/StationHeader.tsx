import React, { useState } from 'react';
import { Shield, Volume2, VolumeX, QrCode, History, ChevronDown, Check, Sparkles, Database } from 'lucide-react';
import { VendorStation } from '../types';

interface StationHeaderProps {
  currentVendor: VendorStation;
  allVendors: VendorStation[];
  onSelectVendor: (vendor: VendorStation) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenTestBadges: () => void;
  onOpenHistory: () => void;
  onOpenBackend: () => void;
  hasExternalBackend: boolean;
  scanCount: number;
}

export const StationHeader: React.FC<StationHeaderProps> = ({
  currentVendor,
  allVendors,
  onSelectVendor,
  soundEnabled,
  onToggleSound,
  onOpenTestBadges,
  onOpenHistory,
  onOpenBackend,
  hasExternalBackend,
  scanCount,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <div className="w-full mb-5 text-center">
      {/* Top Utility Nav */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-[#232B44]/80">
        <div className="flex items-center gap-2 text-left">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#4F7CFF] to-[#9D4EDD] flex items-center justify-center text-white shadow-md shadow-blue-900/40 font-black text-sm">
            🛡️
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
              <span>BOOTHMASTER</span>
              <span className="text-[10px] font-bold text-[#FFC700] bg-[#FFC700]/10 px-1.5 py-0.5 rounded border border-[#FFC700]/30">
                QR PORTAL
              </span>
            </div>
            <div className="text-[10px] text-[#8E9BB5]">Vendor Station Scanner</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Backend Connection Launcher */}
          <button
            onClick={onOpenBackend}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              hasExternalBackend
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50'
                : 'bg-[#151C31] text-[#8E9BB5] hover:text-white border-[#2B3554] hover:bg-[#202942]'
            }`}
            title="Configure Backend link and data recording"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Backend</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          {/* Sound Toggle */}
          <button
            onClick={onToggleSound}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
              soundEnabled
                ? 'bg-[#151C31] text-emerald-400 border-[#2B3554] hover:bg-[#202942]'
                : 'bg-[#151C31] text-[#8E9BB5] border-[#2B3554] hover:bg-[#202942]'
            }`}
            title={soundEnabled ? 'Sound is Enabled' : 'Sound is Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Test Badges Modal Launcher */}
          <button
            onClick={onOpenTestBadges}
            className="px-2.5 py-1.5 rounded-xl bg-[#151C31] hover:bg-[#202942] border border-[#2B3554] text-xs font-semibold text-[#8E9BB5] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Generate test attendee QR badges"
          >
            <QrCode className="w-3.5 h-3.5 text-[#4F7CFF]" />
            <span className="hidden sm:inline">Test QRs</span>
          </button>

          {/* History Modal Launcher */}
          <button
            onClick={onOpenHistory}
            className="px-2.5 py-1.5 rounded-xl bg-[#151C31] hover:bg-[#202942] border border-[#2B3554] text-xs font-semibold text-[#8E9BB5] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            title="View scan history"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Scans</span>
            {scanCount > 0 && (
              <span className="bg-[#4F7CFF] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                {scanCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Card Header */}
      <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight">
        CyberSecurity Awareness Month 2026
      </h1>
      <div className="text-sm text-[#AEB8D0] font-medium mt-1">
        CyberMaster Challenge Scanner
      </div>

      {/* Station Dropdown Selector */}
      <div className="relative inline-block mt-3 text-center">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="group inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#090D1A] hover:bg-[#11172A] border border-[#2B3554] text-white text-base sm:text-lg font-bold tracking-wide transition-all shadow-inner cursor-pointer"
        >
          <span className="text-[#4F7CFF] font-black">
            {currentVendor.id}
          </span>
          <span className="text-white">
            {currentVendor.name.replace(/^VENDOR \d+ — /, '')}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#8E9BB5] group-hover:text-white transition-transform ${
              dropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 bg-[#151C31] border border-[#2B3554] rounded-xl shadow-2xl z-30 py-1.5 text-left overflow-hidden animate-scale-up">
              <div className="px-3 py-1.5 text-[10px] font-bold text-[#8E9BB5] uppercase tracking-wider border-b border-white/5">
                Switch Booth Station
              </div>
              <div className="max-h-60 overflow-y-auto">
                {allVendors.map((v) => {
                  const isSelected = v.id === currentVendor.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        onSelectVendor(v);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-[#202942] text-white font-bold'
                          : 'text-[#8E9BB5] hover:bg-[#1B233C] hover:text-white'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-white font-semibold flex items-center gap-1.5">
                          <span className="text-[#4F7CFF] font-bold">{v.id}</span>
                          <span className="truncate">{v.name.replace(/^VENDOR \d+ — /, '')}</span>
                        </div>
                        <div className="text-[10px] text-[#8E9BB5] truncate">
                          {v.stampTitle}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-1 text-[11px] text-emerald-400 font-medium flex items-center justify-center gap-1.5">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Station Online & Ready
      </div>
    </div>
  );
};
