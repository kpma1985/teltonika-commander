import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";

mkdirSync("data", { recursive: true });
const db = new Database("data/app.sqlite");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS sipgate_auth (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    access_token   TEXT NOT NULL,
    refresh_token  TEXT NOT NULL,
    expires_at     INTEGER NOT NULL,
    scope          TEXT,
    updated_at     INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sipgate_oauth_state (
    state          TEXT PRIMARY KEY,
    verifier       TEXT NOT NULL,
    created_at     INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS command_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   INTEGER NOT NULL,
    device_name TEXT NOT NULL,
    channel     TEXT NOT NULL CHECK (channel IN ('gprs', 'sms')),
    preset      TEXT,
    payload     TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    error       TEXT,
    external_id TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS device_settings (
    device_id      INTEGER PRIMARY KEY,
    sms_recipient  TEXT,
    updated_at     INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_config (
    key         TEXT PRIMARY KEY,
    value       TEXT,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_log_device_ts
    ON command_log(device_id, created_at DESC);
`);

export type LogRow = {
  id: number;
  device_id: number;
  device_name: string;
  channel: "gprs" | "sms";
  preset: string | null;
  payload: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  external_id: string | null;
  created_at: number;
};

export type LogInsert = Omit<LogRow, "id" | "created_at">;

const insertStmt = db.prepare<
  unknown,
  [number, string, string, string | null, string, string, string | null, string | null, number]
>(`
  INSERT INTO command_log
    (device_id, device_name, channel, preset, payload, status, error, external_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export const logCommand = (row: LogInsert): number => {
  const res = insertStmt.run(
    row.device_id,
    row.device_name,
    row.channel,
    row.preset,
    row.payload,
    row.status,
    row.error,
    row.external_id,
    Date.now()
  );
  return Number(res.lastInsertRowid);
};

const recentStmt = db.prepare<LogRow, [number, number, number]>(`
  SELECT * FROM command_log
  WHERE device_id = ?
  ORDER BY created_at DESC
  LIMIT ?
  OFFSET ?
`);

export const recentForDevice = (
  deviceId: number,
  limit = 50,
  offset = 0
): LogRow[] => recentStmt.all(deviceId, limit, offset);

const allStmt = db.prepare<LogRow, [number, number]>(`
  SELECT * FROM command_log ORDER BY created_at DESC LIMIT ? OFFSET ?
`);

export const recentAll = (limit = 100, offset = 0): LogRow[] =>
  allStmt.all(limit, offset);

const clearHistoryStmt = db.prepare(`DELETE FROM command_log WHERE device_id = ?`);
export const clearHistory = (deviceId: number): void => { clearHistoryStmt.run(deviceId); };

export type DeviceSettings = {
  device_id: number;
  sms_recipient: string | null;
  updated_at: number;
};

const getDeviceSettingsStmt = db.prepare<DeviceSettings, [number]>(
  `SELECT * FROM device_settings WHERE device_id = ?`
);

export const getDeviceSettings = (deviceId: number): DeviceSettings | null =>
  getDeviceSettingsStmt.get(deviceId) ?? null;

const upsertDeviceSettingsStmt = db.prepare<unknown, [number, string | null, number]>(`
  INSERT INTO device_settings (device_id, sms_recipient, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(device_id) DO UPDATE SET
    sms_recipient = excluded.sms_recipient,
    updated_at = excluded.updated_at
`);

export const saveDeviceSmsRecipient = (
  deviceId: number,
  smsRecipient: string | null
): void => {
  upsertDeviceSettingsStmt.run(deviceId, smsRecipient, Date.now());
};

type AppConfigRow = {
  key: string;
  value: string | null;
  updated_at: number;
};

const allConfigStmt = db.prepare<AppConfigRow, []>(
  `SELECT key, value, updated_at FROM app_config`
);
const getConfigStmt = db.prepare<AppConfigRow, [string]>(
  `SELECT key, value, updated_at FROM app_config WHERE key = ?`
);
const upsertConfigStmt = db.prepare<unknown, [string, string | null, number]>(`
  INSERT INTO app_config (key, value, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = excluded.updated_at
`);

export const getAppConfigValue = (key: string): string | null =>
  getConfigStmt.get(key)?.value ?? null;

export const getAllAppConfig = (): Record<string, string | null> =>
  Object.fromEntries(allConfigStmt.all().map((row) => [row.key, row.value]));

export const setAppConfigValues = (values: Record<string, string | null>): void => {
  const now = Date.now();
  for (const [key, value] of Object.entries(values)) {
    upsertConfigStmt.run(key, value, now);
  }
};

// -------- Sipgate OAuth token storage --------

export type SipgateAuthRow = {
  id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  updated_at: number;
};

const getSipgateStmt = db.prepare<SipgateAuthRow, []>(
  `SELECT * FROM sipgate_auth WHERE id = 1`
);

export const getSipgateAuth = (): SipgateAuthRow | null =>
  getSipgateStmt.get() ?? null;

const upsertSipgateStmt = db.prepare<
  unknown,
  [string, string, number, string | null, number]
>(`
  INSERT INTO sipgate_auth (id, access_token, refresh_token, expires_at, scope, updated_at)
  VALUES (1, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    scope = excluded.scope,
    updated_at = excluded.updated_at
`);

export const saveSipgateAuth = (row: {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
}): void => {
  upsertSipgateStmt.run(
    row.access_token,
    row.refresh_token,
    row.expires_at,
    row.scope,
    Date.now()
  );
};

const deleteSipgateStmt = db.prepare(`DELETE FROM sipgate_auth WHERE id = 1`);
export const clearSipgateAuth = (): void => {
  deleteSipgateStmt.run();
};

// -------- OAuth state (PKCE) --------

const putStateStmt = db.prepare<unknown, [string, string, number]>(
  `INSERT OR REPLACE INTO sipgate_oauth_state (state, verifier, created_at) VALUES (?, ?, ?)`
);

export const putOauthState = (state: string, verifier: string): void => {
  putStateStmt.run(state, verifier, Date.now());
};

const takeStateStmt = db.prepare<{ verifier: string; created_at: number }, [string]>(
  `SELECT verifier, created_at FROM sipgate_oauth_state WHERE state = ?`
);
const deleteStateStmt = db.prepare<unknown, [string]>(
  `DELETE FROM sipgate_oauth_state WHERE state = ?`
);

export const takeOauthState = (state: string): string | null => {
  const row = takeStateStmt.get(state);
  deleteStateStmt.run(state);
  if (!row) return null;
  if (Date.now() - row.created_at > 10 * 60 * 1000) return null;
  return row.verifier;
};
