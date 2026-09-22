import React, { useState } from 'react';
import { Shield, Volume2, VolumeX, QrCode, History, ChevronDown, Check, Sparkles, Database } from 'lucide-react';
import { VendorStation } from '../types';

interface StationHeaderProps {
  currentVendor: VendorStation;
  allVendors: VendorStation[];
  onSelectVendor: (vendor: VendorStation) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenTestBadges?: () => void;
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
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5 text-left">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-900/40 font-black text-sm">
            🛡️
          </div>
          <div>
            <div className="text-xs font-bold text-white tracking-wider flex items-center gap-1.5">
              <span>BOOTHMASTER</span>
              <span className="text-[10px] font-bold text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30">
                CSAM 2026
              </span>
            </div>
            <div className="text-[10px] text-[#9BB0D3]">Vendor Station Scanner</div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Backend Connection Launcher */}
          <button
            onClick={onOpenBackend}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer backdrop-blur-md ${
              hasExternalBackend
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/60'
                : 'bg-white/5 text-[#9BB0D3] hover:text-white border-white/15 hover:bg-white/10'
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
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors backdrop-blur-md ${
              soundEnabled
                ? 'bg-white/10 text-emerald-400 border-white/20 hover:bg-white/15'
                : 'bg-white/5 text-[#9BB0D3] border-white/15 hover:bg-white/10'
            }`}
            title={soundEnabled ? 'Sound is Enabled' : 'Sound is Muted'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Test Badges Modal Launcher (optional) */}
          {onOpenTestBadges && (
            <button
              onClick={onOpenTestBadges}
              className="px-2.5 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Generate test attendee QR badges"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Test QRs</span>
            </button>
          )}

          {/* History Modal Launcher */}
          <button
            onClick={onOpenHistory}
            className="px-2.5 py-1.5 rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            title="View scan history"
          >
            <History className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Scans</span>
            {scanCount > 0 && (
              <span className="bg-cyan-500 text-black text-[10px] px-1.5 py-0.2 rounded-full font-bold shadow-sm">
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
      <div className="text-xs sm:text-sm text-cyan-300/90 font-semibold mt-1 tracking-wide uppercase">
        CyberMaster Challenge Scanner
      </div>

      {/* Station Dropdown Selector */}
      <div className="relative inline-block mt-3 text-center">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="group inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl backdrop-blur-xl bg-black/45 hover:bg-black/60 border border-white/15 hover:border-cyan-400/50 text-white text-base sm:text-lg font-bold tracking-wide transition-all shadow-inner cursor-pointer"
        >
          <span className="text-cyan-400 font-extrabold">
            {currentVendor.name}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-[#9BB0D3] group-hover:text-white transition-transform ${
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
            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 backdrop-blur-2xl bg-[#091126]/95 border border-white/20 rounded-xl shadow-2xl z-30 py-1.5 text-left overflow-hidden animate-scale-up">
              <div className="px-3 py-1.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider border-b border-white/10">
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
                          ? 'bg-cyan-500/15 text-white font-bold border-l-2 border-cyan-400'
                          : 'text-[#9BB0D3] hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="truncate">
                        <div className="text-white font-semibold flex items-center gap-1.5 text-sm">
                          <span className={isSelected ? 'text-amber-300' : 'text-white'}>{v.name}</span>
                        </div>
                        <div className="text-[11px] text-[#9BB0D3] truncate mt-0.5">
                          {v.category} — {v.stampTitle}
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
