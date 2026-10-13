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

const SESSION_VENDOR_KEY = 'csam_session_vendor_id';

export function getStoredVendorId(): string | null {
  try {
    // Clean legacy localStorage key so default is always Choose Your Booth on new visits
    localStorage.removeItem(CURRENT_VENDOR_KEY);
    const sessionSaved = sessionStorage.getItem(SESSION_VENDOR_KEY);
    if (sessionSaved && DEFAULT_VENDORS.some(v => v.id === sessionSaved)) {
      return sessionSaved;
    }
  } catch (e) {}
  return null; // By default no booth is selected until the booth master chooses one
}

export function saveStoredVendorId(id: string | null) {
  try {
    if (id) {
      sessionStorage.setItem(SESSION_VENDOR_KEY, id);
    } else {
      sessionStorage.removeItem(SESSION_VENDOR_KEY);
    }
    localStorage.removeItem(CURRENT_VENDOR_KEY);
  } catch (e) {}
}
