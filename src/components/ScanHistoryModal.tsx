import React, { useState } from 'react';
import { History, X, Download, Trash2, Search, CheckCircle, Clock } from 'lucide-react';
import { ScanRecord } from '../types';

interface ScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  scans: ScanRecord[];
  onClearHistory: () => void;
  stationName: string;
}

export const ScanHistoryModal: React.FC<ScanHistoryModalProps> = ({
  isOpen,
  onClose,
  scans,
  onClearHistory,
  stationName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredScans = scans.filter(
    (s) =>
      s.participantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.participantOffice.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.participantToken.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportCSV = () => {
    if (scans.length === 0) return;
    const headers = [
      'Timestamp',
      'Date Time',
      'Vendor ID',
      'Vendor Name',
      'Respective Column',
      'Participant Token',
      'Participant Name',
      'Office / Dept',
      'Status',
      'Completion Count',
      'Raffle Qualified',
    ];

    const rows = scans.map((s) => [
      s.timestamp,
      new Date(s.timestamp).toLocaleString(),
      s.vendorId,
      `"${s.vendorName.replace(/"/g, '""')}"`,
      `"${(s.updatedColumn || s.vendorId).replace(/"/g, '""')}"`,
      s.participantToken,
      `"${s.participantName.replace(/"/g, '""')}"`,
      `"${s.participantOffice.replace(/"/g, '""')}"`,
      s.isDuplicate ? 'Duplicate Scan' : 'Stamp Awarded',
      `${s.completionCount}/${s.totalRequired}`,
      s.raffleQualified ? 'YES' : 'NO',
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `vendor-station-scans-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-2xl bg-[#151C31] border border-[#2B3554] rounded-2xl shadow-2xl overflow-hidden text-white animate-scale-up max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2B3554] bg-[#0E1424]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#4F7CFF]/20 border border-[#4F7CFF]/40 flex items-center justify-center text-[#4F7CFF]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Station Check-in History</h3>
              <p className="text-xs text-[#8E9BB5]">{stationName} Visitor Logs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-transparent hover:bg-[#202942] text-[#8E9BB5] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar: Search + Export + Clear */}
        <div className="p-4 border-b border-[#2B3554] bg-[#12182B] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#8E9BB5]" />
            <input
              type="text"
              placeholder="Search by name or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#0B1020] text-white border border-[#2B3554] rounded-lg focus:outline-none focus:border-[#4F7CFF]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={exportCSV}
              disabled={scans.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#202942] hover:bg-[#2B3554] disabled:opacity-40 border border-[#2B3554] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to clear scan history for this session?')) {
                  onClearHistory();
                }
              }}
              disabled={scans.length === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-300 hover:text-white hover:bg-red-950/60 disabled:opacity-40 border border-red-900/40 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>

        {/* Records List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2">
          {filteredScans.length === 0 ? (
            <div className="py-12 text-center text-[#8E9BB5] text-xs">
              {scans.length === 0
                ? 'No participants scanned at this station yet. Scan an attendee QR code to record check-ins.'
                : 'No attendees matching your search.'}
            </div>
          ) : (
            filteredScans.map((s) => (
              <div
                key={s.id}
                className="p-3 rounded-xl bg-[#0E1424] border border-[#232B44] flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                      s.isDuplicate
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {s.isDuplicate ? '⚠️' : '✓'}
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      {s.participantName}
                      {s.raffleQualified && (
                        <span className="text-[10px] bg-amber-400/20 text-amber-300 border border-amber-400/40 px-1.5 py-0.2 rounded font-semibold">
                          🏆 Raffle Ready
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8E9BB5] flex items-center gap-1.5 mt-0.5">
                      <span>{s.participantOffice}</span>
                      {s.updatedColumn && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#1C253D] text-emerald-300 border border-emerald-500/30 font-mono">
                          Col: {s.updatedColumn}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-white/90 font-medium">
                    Stamp {s.completionCount} of {s.totalRequired}
                  </div>
                  <div className="text-[10px] text-[#8E9BB5] flex items-center justify-end gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {new Date(s.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
