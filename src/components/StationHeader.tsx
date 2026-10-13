import React, { useState } from 'react';
import { Shield, Volume2, VolumeX, QrCode, History, ChevronDown, Check, Sparkles, Database } from 'lucide-react';
import { VendorStation } from '../types';
import { triggerHaptic } from '../utils/audio';

interface StationHeaderProps {
  currentVendor: VendorStation | null;
  allVendors: VendorStation[];
  onSelectVendor: (vendor: VendorStation | null) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenTestBadges?: () => void;
  onOpenHistory: () => void;
  onOpenBackend: () => void;
  hasExternalBackend: boolean;
  databaseType?: string;
  databaseUrl?: string;
  pendingSyncCount?: number;
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
  databaseType,
  databaseUrl,
  pendingSyncCount,
  scanCount,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const getDbLabel = () => {
    if (!hasExternalBackend) return 'Local DB';
    if (databaseUrl?.includes('workers.dev')) return 'Worker Online';
    if (databaseType === 'google_sheets') return 'Sheets Live';
    if (databaseType === 'supabase') return 'Supabase Live';
    return 'Live DB';
  };

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
          {/* Live Database Connection Launcher */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onOpenBackend();
            }}
            className={`px-2.5 py-1.5 min-h-[38px] rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 ${
              hasExternalBackend
                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/70 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-[#9BB0D3] hover:text-white border-white/15 hover:bg-white/10'
            }`}
            title="Configure Live Database connection and instant sync"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">{getDbLabel()}</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            {pendingSyncCount !== undefined && pendingSyncCount > 0 && (
              <span className="bg-amber-500 text-black text-[9px] font-bold px-1 rounded-full">
                {pendingSyncCount}
              </span>
            )}
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onToggleSound();
            }}
            className={`p-2 min-h-[38px] min-w-[38px] rounded-xl border text-xs font-semibold flex items-center justify-center gap-1 transition-all backdrop-blur-md active:scale-95 ${
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
              onClick={() => {
                triggerHaptic('tap');
                onOpenTestBadges();
              }}
              className="px-2.5 py-1.5 min-h-[38px] rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Generate test attendee QR badges"
            >
              <QrCode className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Test QRs</span>
            </button>
          )}

          {/* History Modal Launcher */}
          <button
            onClick={() => {
              triggerHaptic('tap');
              onOpenHistory();
            }}
            className="px-2.5 py-1.5 min-h-[38px] rounded-xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#9BB0D3] hover:text-white flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
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
          id="stationDropdownBtn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className={`group inline-flex items-center gap-2.5 px-4 py-2.5 rounded-xl backdrop-blur-xl transition-all shadow-inner cursor-pointer border ${
            !currentVendor
              ? 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-400/60 hover:border-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.3)] text-cyan-200 ring-2 ring-cyan-400/20 active:scale-98'
              : 'bg-black/50 hover:bg-black/65 border-white/20 hover:border-cyan-400/50 text-white active:scale-98'
          } text-base sm:text-lg font-bold tracking-wide`}
        >
          <span className={!currentVendor ? 'text-cyan-300 font-extrabold flex items-center gap-2' : 'text-cyan-400 font-extrabold'}>
            {!currentVendor ? (
              <>
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                <span>Choose Your Booth</span>
              </>
            ) : (
              currentVendor.name
            )}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              !currentVendor ? 'text-cyan-300 group-hover:translate-y-0.5' : 'text-[#9BB0D3] group-hover:text-white'
            } ${dropdownOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {dropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setDropdownOpen(false)}
            />
            <div className="absolute left-1/2 -translate-x-1/2 mt-2 w-72 sm:w-80 backdrop-blur-2xl bg-[#091126]/95 border border-white/20 rounded-xl shadow-2xl z-30 py-1.5 text-left overflow-hidden animate-scale-up">
              <div className="px-3 py-1.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider border-b border-white/10 flex items-center justify-between">
                <span>Select Your Booth Station</span>
                {!currentVendor && (
                  <span className="text-[9px] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/30 font-semibold">
                    Required
                  </span>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {allVendors.map((v) => {
                  const isSelected = currentVendor?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        triggerHaptic('tap');
                        onSelectVendor(v);
                        setDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors active:bg-cyan-500/20 cursor-pointer ${
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
                          {v.category} : {v.stampTitle}
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {currentVendor && (
                <div className="border-t border-white/10 p-1 bg-black/20">
                  <button
                    onClick={() => {
                      triggerHaptic('tap');
                      onSelectVendor(null);
                      setDropdownOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 text-[11px] flex items-center justify-center gap-1.5 text-[#8A9CBE] hover:text-cyan-300 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  >
                    <span>Reset to &quot;Choose Your Booth&quot;</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-1 text-[11px] font-medium flex items-center justify-center gap-1.5">
        {currentVendor ? (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400">Station Online & Ready</span>
          </>
        ) : (
          <>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-amber-300 font-semibold">Please choose your booth from dropdown</span>
          </>
        )}
      </div>
    </div>
  );
};
