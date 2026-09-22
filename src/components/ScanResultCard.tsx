import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Award, ArrowRight, RotateCcw } from 'lucide-react';
import { ScanOutcome } from '../types';

interface ScanResultCardProps {
  outcome: ScanOutcome;
  onReset: () => void;
  onScanNext: () => void;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({
  outcome,
  onReset,
  onScanNext,
}) => {
  const isSuccess = outcome.type === 'success';
  const isDuplicate = outcome.type === 'duplicate';
  const isFailure = outcome.type === 'failure';

  const containerBg = isSuccess
    ? 'backdrop-blur-2xl bg-[#082417]/85 border-2 border-emerald-400/50 shadow-[0_16px_48px_rgba(16,185,129,0.35)]'
    : isDuplicate
    ? 'backdrop-blur-2xl bg-[#2b1f09]/85 border-2 border-amber-400/50 shadow-[0_16px_48px_rgba(245,158,11,0.35)]'
    : 'backdrop-blur-2xl bg-[#33111c]/85 border-2 border-rose-400/50 shadow-[0_16px_48px_rgba(244,63,94,0.35)]';

  const accentColor = isSuccess
    ? 'text-emerald-300'
    : isDuplicate
    ? 'text-amber-300'
    : 'text-rose-300';

  const total = outcome.total || 3;
  const current = outcome.completion || 0;
  const percent = Math.min(100, Math.round((current / total) * 100));

  return (
    <div
      id="result"
      className={`mt-4 p-5 rounded-2xl text-center text-white shadow-2xl transition-all animate-scale-up ${containerBg}`}
    >
      {/* Live Status indicator */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-md text-[11px] font-semibold text-emerald-300 border border-emerald-400/30 mb-2 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Camera Ready — Next badge can scan now
      </div>

      {/* Status Icon & Title */}
      <div className="flex items-center justify-center gap-2 mb-2">
        {isSuccess && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
        {isDuplicate && <AlertTriangle className="w-6 h-6 text-amber-400" />}
        {isFailure && <XCircle className="w-6 h-6 text-rose-400" />}
        <div className={`text-xl font-extrabold tracking-wide uppercase ${accentColor}`}>
          {outcome.title}
        </div>
      </div>

      {/* Participant Details */}
      {outcome.participantName && (
        <div className="my-3 py-2 px-3 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 max-w-sm mx-auto shadow-inner">
          <div className="text-lg font-bold text-white tracking-tight">
            {outcome.participantName}
          </div>
          {outcome.participantOffice && (
            <div className="text-xs text-white/80 mt-0.5 font-medium">
              {outcome.participantOffice}
            </div>
          )}
        </div>
      )}

      {/* Description Message */}
      <p className="text-sm text-white/95 my-2 leading-relaxed font-medium">
        {outcome.message}
      </p>

      {/* Progress & Raffle Status (for success and duplicate) */}
      {!isFailure && outcome.completion !== undefined && (
        <div className="my-4 p-3.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/15 max-w-sm mx-auto shadow-inner">
          <div className="text-xs uppercase tracking-wider text-cyan-200 font-bold mb-1">
            Event Passport Stamps
          </div>
          <div className="text-3xl font-black text-white tracking-tight my-1">
            {outcome.completion} / {outcome.total}
          </div>

          {/* Mini progress bar */}
          <div className="w-full bg-white/20 h-2.5 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                outcome.raffleQualified
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-300 shadow-[0_0_12px_#FFC700]'
                  : 'bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_8px_#00E5FF]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Raffle Qualified Pill */}
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
              {outcome.raffleQualified ? (
                <span className="bg-amber-400/25 text-amber-200 border border-amber-400/60 px-3.5 py-1.5 rounded-full flex items-center gap-1.5 shadow-[0_0_15px_rgba(251,191,36,0.3)] animate-pulse">
                  <Award className="w-4 h-4 text-amber-300" />
                  🏆 RAFFLE QUALIFIED
                </span>
              ) : (
                <span className="bg-white/10 text-white/90 border border-white/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  🔒 NOT YET QUALIFIED (Need {total - current} more)
                </span>
              )}
            </div>

            {/* Backend Sync Indicator */}
            {outcome.syncedToExternal !== undefined && (
              <div className="text-[11px] text-white/90 flex flex-col items-center gap-1 mt-1.5 font-medium">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {outcome.syncedToExternal
                      ? outcome.updatedColumn
                        ? `Logged to Google Sheet Column [${outcome.updatedColumn}]`
                        : 'Synced to Google Sheets Database'
                      : 'Recorded to Local Database'}
                  </span>
                </div>
                {outcome.syncMessage && (
                  <span className="text-[10px] text-white/70 italic">{outcome.syncMessage}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset & Continue Actions */}
      <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
        <button
          id="scanAnotherBtn"
          onClick={onScanNext}
          className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/40 border border-cyan-300/30 cursor-pointer"
        >
          {isFailure ? 'Try Scanning Again' : 'Ready for Next Attendee'}
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="w-full sm:w-auto py-3 px-4 rounded-xl font-semibold text-xs text-white/90 hover:text-white backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          title="Dismiss Result"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Dismiss Card
        </button>
      </div>
    </div>
  );
};
