export type Device = {
  id: number;
  name: string;
  ident: string;
  device_type_id: number;
  enabled: boolean;
  last_seen: number | null;
  online: boolean;
  movement_status: boolean | null;
  smsRecipient?: string | null;
};

export type TelemetryValue = { value: unknown; ts: number };
export type Telemetry = Record<string, TelemetryValue>;

export type FlespiResult = {
  id: number | string;
  command_id?: number | string;
  device_id?: number;
  ident?: string;
  name: string;
  address?: string;
  properties: Record<string, unknown>;
  executed?: { timestamp: number };
  response?: { payload?: string } & Record<string, unknown>;
  timestamp?: number;
};

export type DeviceDetail = {
  device: Device;
  telemetry: Telemetry;
  results: FlespiResult[];
  resultsTotal: number;
  smsRecipient: string | null;
};

export type HistoryRow = {
  id: number;
  device_id: number;
  device_name: string;
  channel: "gprs" | "sms";
  preset: string | null;
  payload: string;
  status: "queued" | "sent" | "failed" | "executed";
  error: string | null;
  external_id: string | null;
  created_at: number;
  executed_at?: number | null;
  response?: string | null;
};

export type HistoryResponse = {
  rows: HistoryRow[];
  offset: number;
  limit: number;
};

export type TrackPoint = {
  lat: number;
  lon: number;
  ts: number;
  speed?: number;
};

export type TrackResponse = {
  points: TrackPoint[];
  /** hours nur gesetzt, wenn Anfrage über Preset-Stunden erfolgte */
  range: { from: number; to: number; hours?: number };
  error?: string;
};

export type StatusCommand = { key: string; label: string };

export type Health = {
  ok: true;
  sipgate: boolean;
  sipgateMode: "oauth" | "pat" | "disabled";
  statusCommands: StatusCommand[];
  btPasswordSet?: boolean;
};

export type AppConfig = {
  FLESPI_TOKEN: string;
  SIPGATE_SMS_ID: string;
  SIPGATE_CLIENT_ID: string;
  SIPGATE_CLIENT_SECRET: string;
  SIPGATE_REDIRECT_URI: string;
  SIPGATE_TOKEN_ID: string;
  SIPGATE_TOKEN: string;
  TELTONIKA_SMS_LOGIN: string;
  TELTONIKA_SMS_PASSWORD: string;
};

export type SettingsResponse = {
  config: AppConfig;
  overrides: Record<string, string | null>;
};

export type PresetData =
  | { preset: "bt-obd2"; mac: string; pin: string; externalName?: string; reset?: boolean }
  | { preset: "apn"; apn: string; user?: string; password?: string; auth?: "pap" | "chap" }
  | {
      preset: "server";
      domain: string;
      port: number;
      protocol: "tcp" | "udp";
      enableGprs?: boolean;
      reset?: boolean;
    }
  | { preset: "settings-read"; profile: "apn" | "server" | "network" }
  | { preset: "status"; key: string }
  | {
      preset: "outputs";
      states: string;
      t1?: number;
      t2?: number;
      s1?: number;
      s2?: number;
      reset?: boolean;
    }
  | { preset: "tracking"; stopInterval: number; movingInterval: number }
  | { preset: "raw"; payload: string };

export type CommandResult = {
  payload: string;
  status: "queued" | "sent" | "failed";
  error?: string;
  logId: number;
  externalId?: string | null;
  deviceId?: number;
  deviceName?: string;
  channel?: "gprs" | "sms";
  preset?: string;
  createdAt?: number;
};

// Teltonika device_type_id → model name
export const TELTONIKA_DEVICE_TYPES = new Map<number, string>([
  [353, "FMT100"],
  [745, "FMB003"],
]);

// FMT100 family (kept for OBD feature flag)
export const FMT_DEVICE_TYPES = new Set<number>([353]);
