export type DeviceConfig = {
  apn?: string;
  apnUser?: string;
  apnPassword?: string;
  apnAuth?: "pap" | "chap";
  gprsEnabled?: boolean;
  domain?: string;
  port?: number;
  protocol?: "tcp" | "udp";
};

export type StoredDeviceConfig = {
  config: DeviceConfig;
  savedAt: number; // ms timestamp
};

export type DeviceConfigReadProfile = "apn" | "server" | "network";

const storageKey = (deviceId: number) => `device-config-${deviceId}`;

export const loadDeviceConfig = (deviceId: number): StoredDeviceConfig | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(deviceId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredDeviceConfig;
  } catch {
    return null;
  }
};

export const saveDeviceConfig = (deviceId: number, config: DeviceConfig): void => {
  window.localStorage.setItem(
    storageKey(deviceId),
    JSON.stringify({ config, savedAt: Date.now() } satisfies StoredDeviceConfig)
  );
};

// Parst getparam-Antworten (ein oder mehrere Zeilen pro Payload)
export const parseGetparamPayloads = (payloads: string[]): DeviceConfig => {
  const params: Record<number, string> = {};
  for (const payload of payloads) {
    for (const line of payload.split(/\r?\n/)) {
      const m =
        line.match(/Param\s+ID\s*:\s*(\d+)\s+Value\s*:\s*(.*)/i) ??
        line.match(/ID\s*:\s*(\d+)\s+Value\s*:\s*(.*)/i) ??
        line.match(/^\s*(\d{3,5})\s*[:=]\s*(.*)\s*$/);
      if (m) params[Number(m[1])] = (m[2] ?? "").trim();
    }
  }
  const cfg: DeviceConfig = {};
  if (2001 in params) cfg.apn = params[2001];
  if (2002 in params) cfg.apnUser = params[2002];
  if (2003 in params) cfg.apnPassword = params[2003];
  if (2016 in params) cfg.apnAuth = params[2016] === "1" ? "chap" : "pap";
  if (2000 in params) cfg.gprsEnabled = params[2000] === "1";
  if (2004 in params) cfg.domain = params[2004];
  if (2005 in params) {
    const p = Number(params[2005]);
    if (Number.isFinite(p) && p > 0) cfg.port = p;
  }
  if (2006 in params) cfg.protocol = params[2006] === "1" ? "udp" : "tcp";
  return cfg;
};

export const deviceConfigIsEmpty = (cfg: DeviceConfig): boolean =>
  Object.values(cfg).every((v) => v === undefined);

// Gibt true zurück wenn form-Werte von gespeichertem Config abweichen
export const apnDiffersFromConfig = (
  apn: string,
  user: string,
  password: string,
  auth: "pap" | "chap",
  stored: DeviceConfig
): boolean => {
  if (stored.apn !== undefined && stored.apn !== apn) return true;
  if (stored.apnUser !== undefined && stored.apnUser !== user) return true;
  if (stored.apnPassword !== undefined && stored.apnPassword !== password) return true;
  if (stored.apnAuth !== undefined && stored.apnAuth !== auth) return true;
  return false;
};

export const serverDiffersFromConfig = (
  domain: string,
  port: string,
  protocol: "tcp" | "udp",
  stored: DeviceConfig
): boolean => {
  if (stored.domain !== undefined && stored.domain !== domain.trim()) return true;
  if (stored.port !== undefined && String(stored.port) !== port) return true;
  if (stored.protocol !== undefined && stored.protocol !== protocol) return true;
  return false;
};
