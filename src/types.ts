export interface VendorStation {
  id: string; // e.g. 'V01', 'V02'
  name: string; // e.g. 'Cisco Zero Trust Lab'
  category: string; // e.g. 'Network Security'
  stampTitle: string; // e.g. 'Packet Inspector Challenge'
  token: string;
}

export interface Participant {
  token: string;
  name: string;
  office: string;
  email?: string;
  avatarUrl?: string;
  completedVendors: string[]; // List of vendor IDs completed
}

export interface ScanRecord {
  id: string;
  timestamp: number;
  participantToken: string;
  participantName: string;
  participantOffice: string;
  vendorId: string;
  vendorName: string;
  isDuplicate: boolean;
  completionCount: number;
  totalRequired: number;
  raffleQualified: boolean;
  syncedToExternal?: boolean;
}

export interface ScanOutcome {
  type: 'success' | 'duplicate' | 'failure';
  title: string;
  message: string;
  participantName?: string;
  participantOffice?: string;
  completion?: number;
  total?: number;
  raffleQualified?: boolean;
  vendorName?: string;
  rawPayload?: string;
  syncedToExternal?: boolean;
  externalBackendInfo?: string;
}

export type ModalState = 'idle' | 'requesting' | 'granted' | 'denied';
