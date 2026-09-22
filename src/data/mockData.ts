import { VendorStation, Participant } from '../types';

export const TOTAL_STATIONS_FOR_RAFFLE = 3;
export const TOTAL_EVENT_STATIONS = 3;

export const DEFAULT_VENDORS: VendorStation[] = [
  {
    id: 'Booth 1',
    name: 'Booth 1 - Netsec',
    category: 'Network Security & Firewall',
    stampTitle: 'Netsec Defense Challenge',
    token: 'B1',
  },
  {
    id: 'Booth 2',
    name: 'Booth2 - TVM',
    category: 'Threat & Vulnerability Management',
    stampTitle: 'TVM Assessment Challenge',
    token: 'B2',
  },
  {
    id: 'Booth 3',
    name: 'Booth3 - SecOps',
    category: 'Security Operations & Incident Response',
    stampTitle: 'SecOps Triage Challenge',
    token: 'B3',
  },
];

export const INITIAL_PARTICIPANTS: Participant[] = [];

const PARTICIPANTS_STORAGE_KEY = 'csam_vendor_participants_prod';
const SCANS_STORAGE_KEY = 'csam_vendor_scans_prod';
const CURRENT_VENDOR_KEY = 'csam_current_vendor_id_prod';

export function getStoredParticipants(): Participant[] {
  try {
    const data = localStorage.getItem(PARTICIPANTS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed reading participants from storage', e);
  }
  return [];
}

export function saveStoredParticipants(participants: Participant[]) {
  try {
    localStorage.setItem(PARTICIPANTS_STORAGE_KEY, JSON.stringify(participants));
  } catch (e) {
    console.error('Failed saving participants to storage', e);
  }
}

export function getStoredVendorId(): string {
  try {
    const saved = localStorage.getItem(CURRENT_VENDOR_KEY);
    if (saved && DEFAULT_VENDORS.some(v => v.id === saved)) {
      return saved;
    }
  } catch (e) {}
  return 'Booth 1'; // Default to Booth 1 - Netsec
}

export function saveStoredVendorId(id: string) {
  try {
    localStorage.setItem(CURRENT_VENDOR_KEY, id);
  } catch (e) {}
}
