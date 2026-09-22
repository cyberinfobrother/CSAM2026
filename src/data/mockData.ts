import { VendorStation, Participant } from '../types';

export const TOTAL_STATIONS_FOR_RAFFLE = 5;
export const TOTAL_EVENT_STATIONS = 5;

export const DEFAULT_VENDORS: VendorStation[] = [
  {
    id: 'V1',
    name: 'VENDOR 1 — Palo Alto Networks',
    category: 'Next-Gen Firewall & SASE',
    stampTitle: 'Zero-Day Shield Challenge',
    token: 'TOKEN-VENDOR-V1-PANW',
  },
  {
    id: 'V2',
    name: 'VENDOR 2 — CrowdStrike Falcon',
    category: 'Endpoint Detection & Response',
    stampTitle: 'Adversary Threat Hunt',
    token: 'TOKEN-VENDOR-V2-CRWD',
  },
  {
    id: 'V3',
    name: 'VENDOR 3 — Cloudflare Security',
    category: 'Edge & DDoS Mitigation',
    stampTitle: 'Edge Defense Simulator',
    token: 'TOKEN-VENDOR-V3-NET',
  },
  {
    id: 'V4',
    name: 'VENDOR 4 — Google Cloud Security',
    category: 'Cloud Architecture & IAM',
    stampTitle: 'Chronicle SIEM Blueprint',
    token: 'TOKEN-VENDOR-V4-GOOG',
  },
  {
    id: 'V5',
    name: 'VENDOR 5 — Cisco Security',
    category: 'Secure Access & Duo MFA',
    stampTitle: 'Phishing Defense Lab',
    token: 'TOKEN-VENDOR-V5-CSCO',
  },
];

export const INITIAL_PARTICIPANTS: Participant[] = [
  {
    token: 'PT-9421',
    name: 'Alex Rivera',
    office: 'SecOps & Threat Intel — Bldg 4B',
    completedVendors: ['V1', 'V2', 'V3'],
  },
  {
    token: 'PT-3819',
    name: 'Elena Rostova',
    office: 'Cloud Architecture — Remote / EMEA',
    completedVendors: ['V1'],
  },
  {
    token: 'PT-7204',
    name: 'Marcus Chen',
    office: 'Enterprise IT & Infrastructure — Austin Hub',
    completedVendors: ['V1', 'V2', 'V3', 'V4', 'V5'],
  },
  {
    token: 'PT-5190',
    name: 'Amina Al-Mansoor',
    office: 'Compliance & Cyber Risk — London HQ',
    completedVendors: [],
  },
  {
    token: 'PT-8832',
    name: 'David K. Miller',
    office: 'Product Engineering — San Francisco',
    completedVendors: ['V2', 'V3'],
  },
  {
    token: 'PT-6311',
    name: 'Priya Patel',
    office: 'DevSecOps — Seattle Campus',
    completedVendors: ['V1', 'V4', 'V5'],
  },
];

const PARTICIPANTS_STORAGE_KEY = 'csam_vendor_participants_v1';
const SCANS_STORAGE_KEY = 'csam_vendor_scans_v1';
const CURRENT_VENDOR_KEY = 'csam_current_vendor_id_v1';

export function getStoredParticipants(): Participant[] {
  try {
    const data = localStorage.getItem(PARTICIPANTS_STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed reading participants from storage', e);
  }
  saveStoredParticipants(INITIAL_PARTICIPANTS);
  return INITIAL_PARTICIPANTS;
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
  return 'V04'; // Default to VENDOR 04 as featured in sample
}

export function saveStoredVendorId(id: string) {
  try {
    localStorage.setItem(CURRENT_VENDOR_KEY, id);
  } catch (e) {}
}
