export interface VendorStation {
  id: string; // e.g. 'V01', 'V02'
  name: string; // e.g. 'Cisco Zero Trust Lab'
  category: string; // e.g. 'Network Security'
  stampTitle: string; // e.g. 'Packet Inspector Challenge'
  token: string;
}

export interface Participant {
  token: string;
  participantId?: string;
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
  syncError?: string | null;
  databaseType?: string;
  updatedColumn?: string;
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
  syncMessage?: string;
  updatedColumn?: string;
}

export type ModalState = 'idle' | 'requesting' | 'granted' | 'denied';

export type DatabaseType = 'google_sheets' | 'rest_api' | 'webhook' | 'supabase';

export interface DatabaseConfig {
  databaseType: DatabaseType;
  databaseUrl: string;
  apiKey?: string;
  authHeader?: string;
  enabled: boolean;
  hasExternalBackend?: boolean;
  builtInBackendActive?: boolean;
  lastConnectedAt?: number;
  lastStatus?: string;
  pendingSyncCount?: number;
}

