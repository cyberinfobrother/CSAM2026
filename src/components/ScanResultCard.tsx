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
    ? 'bg-[#173d2a] border-[#2d7a54]'
    : isDuplicate
    ? 'bg-[#493c1c] border-[#917634]'
    : 'bg-[#512333] border-[#9e4360]';

  const accentColor = isSuccess
    ? 'text-emerald-400'
    : isDuplicate
    ? 'text-amber-400'
    : 'text-rose-400';

  const total = outcome.total || 6;
  const current = outcome.completion || 0;
  const percent = Math.min(100, Math.round((current / total) * 100));

  return (
    <div
      id="result"
      className={`mt-4 p-5 rounded-2xl border text-center text-white shadow-xl transition-all animate-scale-up ${containerBg}`}
    >
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
        <div className="my-3 py-2 px-3 rounded-xl bg-black/25 border border-white/10 max-w-sm mx-auto">
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
      <p className="text-sm text-white/90 my-2 leading-relaxed font-medium">
        {outcome.message}
      </p>

      {/* Progress & Raffle Status (for success and duplicate) */}
      {!isFailure && outcome.completion !== undefined && (
        <div className="my-4 p-3 rounded-xl bg-black/30 border border-white/10 max-w-sm mx-auto">
          <div className="text-xs uppercase tracking-wider text-white/70 font-semibold mb-1">
            Event Passport Stamps
          </div>
          <div className="text-3xl font-black text-white tracking-tight my-1">
            {outcome.completion} / {outcome.total}
          </div>

          {/* Mini progress bar */}
          <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                outcome.raffleQualified
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-300 shadow-[0_0_10px_#FFC700]'
                  : 'bg-gradient-to-r from-blue-400 to-indigo-400'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Raffle Qualified Pill */}
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wider">
              {outcome.raffleQualified ? (
                <span className="bg-amber-500/30 text-amber-200 border border-amber-400/50 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm animate-pulse">
                  <Award className="w-4 h-4 text-amber-300" />
                  🏆 RAFFLE QUALIFIED
                </span>
              ) : (
                <span className="bg-white/10 text-white/80 border border-white/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                  🔒 NOT YET QUALIFIED (Need {total - current} more)
                </span>
              )}
            </div>

            {/* Backend Sync Indicator */}
            {outcome.syncedToExternal !== undefined && (
              <div className="text-[11px] text-white/70 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>
                  {outcome.syncedToExternal
                    ? 'Synced to Remote Backend Link'
                    : 'Recorded to Express Database'}
                </span>
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
          className="w-full sm:w-auto flex-1 py-3 px-5 rounded-xl font-bold text-sm text-white bg-[#3b82f6] hover:bg-[#2563eb] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
        >
          {isFailure ? 'Try Scanning Again' : 'Scan Another Participant'}
          <ArrowRight className="w-4 h-4" />
        </button>

        <button
          onClick={onReset}
          className="w-full sm:w-auto py-3 px-4 rounded-xl font-semibold text-xs text-white/80 hover:text-white bg-black/30 hover:bg-black/40 border border-white/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          title="Dismiss Result"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Dismiss
        </button>
      </div>
    </div>
  );
};
