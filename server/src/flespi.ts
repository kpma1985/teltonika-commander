import { getRuntimeConfig } from "./runtime-config.ts";
import { env } from "./env.ts";

const BASE = env.FLESPI_BASE_URL;
const CACHE_TTL = {
  devices: 60_000,
  device: 30_000,
  telemetry: 45_000,
  results: 15_000,
  messages: 120_000,
} as const;

/** Max attempts when Flespi returns 429 (REST volume per minute). */
const FLESPI_429_MAX_ATTEMPTS = 6;

const headers = (): HeadersInit => ({
  Authorization: `FlespiToken ${getRuntimeConfig().FLESPI_TOKEN}`,
  "Content-Type": "application/json",
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Fetch with Retry-After / exponential backoff on HTTP 429. */
const flespiRequest = async (
  url: string,
  init?: RequestInit
): Promise<Response> => {
  const merged: RequestInit = {
    ...init,
    headers: { ...headers(), ...(init?.headers as HeadersInit) },
  };

  for (let attempt = 0; attempt < FLESPI_429_MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, merged);
    if (res.status !== 429) return res;

    const ra = res.headers.get("Retry-After");
    let waitMs = ra ? Number.parseFloat(ra) * 1000 : 400 * 2 ** attempt;
    if (!Number.isFinite(waitMs) || waitMs < 200) waitMs = 400 * 2 ** attempt;
    waitMs = Math.min(waitMs, 45_000);
    await sleep(waitMs);
  }

  return fetch(url, merged);
};

type CacheEntry<T> = {
  expiresAt: number;
  value?: T;
  pending?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

const getCached = async <T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing?.value !== undefined && existing.expiresAt > now) {
    return existing.value;
  }
  if (existing?.pending) {
    return existing.pending;
  }

  const pending = loader()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .catch((error: Error) => {
      const stale = cache.get(key) as CacheEntry<T> | undefined;
      if (error.message.includes("Flespi 429") && stale?.value !== undefined) {
        return stale.value;
      }
      cache.delete(key);
      throw error;
    });

  cache.set(key, {
    value: existing?.value,
    expiresAt: existing?.expiresAt ?? 0,
    pending,
  });
  return pending;
};

const invalidateFlespiCache = (deviceId?: number): void => {
  if (deviceId == null) {
    cache.clear();
    return;
  }
  const prefixes = [
    "devices:list",
    `device:${deviceId}`,
    `telemetry:${deviceId}`,
    `results:${deviceId}:`,
    `messages:${deviceId}:`,
  ];
  for (const key of Array.from(cache.keys())) {
    if (prefixes.some((prefix) => key === prefix || key.startsWith(prefix))) {
      cache.delete(key);
    }
  }
};

export type FlespiDevice = {
  id: number;
  name: string;
  device_type_id: number;
  enabled: boolean;
  ident: string;
  last_seen: number | null;
  online: boolean;
  movement_status: boolean | null;
};

type DeviceRaw = {
  id: number;
  name: string;
  device_type_id: number;
  enabled: boolean;
  "configuration.ident"?: string;
  configuration?: { ident?: string };
};

const unwrap = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Flespi ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = (await res.json()) as { result?: T; errors?: unknown };
  if (!("result" in json)) {
    throw new Error(`Flespi: unexpected response ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.result as T;
};

export const listDevices = async (): Promise<FlespiDevice[]> => {
  return getCached("devices:list", CACHE_TTL.devices, async () => {
    const url =
      `${BASE}/gw/devices/all?fields=id,name,configuration.ident,device_type_id,enabled`;
    const res = await flespiRequest(url);
    const raw = await unwrap<DeviceRaw[]>(res);
    // Kein getTelemetry pro Gerät — das hat bei N Geräten N+1 Requests/min ausgelöst (Flespi 429).
    // Online/Bewegung siehst du nach Auswahl unter Gerätedetails (ein Telemetry-Call).
    return raw.map((d) => ({
      id: d.id,
      name: d.name,
      device_type_id: d.device_type_id,
      enabled: d.enabled,
      ident: d["configuration.ident"] ?? d.configuration?.ident ?? "",
      last_seen: null,
      online: false,
      movement_status: null,
    }));
  });
};

export const getDevice = async (id: number): Promise<FlespiDevice | null> => {
  return getCached(`device:${id}`, CACHE_TTL.device, async () => {
    const res = await flespiRequest(
      `${BASE}/gw/devices/${id}?fields=id,name,configuration.ident,device_type_id,enabled`
    );
    const raw = await unwrap<DeviceRaw[]>(res);
    const d = raw[0];
    if (!d) return null;
    return {
      id: d.id,
      name: d.name,
      device_type_id: d.device_type_id,
      enabled: d.enabled,
      ident: d["configuration.ident"] ?? d.configuration?.ident ?? "",
      last_seen: null,
      online: false,
      movement_status: null,
    };
  });
};

export type FlespiTelemetry = Record<string, { value: unknown; ts: number }>;

export const summarizeTelemetry = (
  telemetry: FlespiTelemetry
): {
  last_seen: number | null;
  online: boolean;
  movement_status: boolean | null;
} => {
  const lastSeen =
    telemetry.timestamp?.ts ??
    telemetry["server.timestamp"]?.ts ??
    null;
  const movementStatus =
    typeof telemetry["movement.status"]?.value === "boolean"
      ? (telemetry["movement.status"].value as boolean)
      : null;

  return {
    last_seen: lastSeen,
    online: lastSeen != null ? Date.now() / 1000 - lastSeen <= 15 * 60 : false,
    movement_status: movementStatus,
  };
};

export const getTelemetry = async (id: number): Promise<FlespiTelemetry> => {
  return getCached(`telemetry:${id}`, CACHE_TTL.telemetry, async () => {
    const res = await flespiRequest(`${BASE}/gw/devices/${id}/telemetry/all`);
    const raw = await unwrap<Array<{ telemetry?: FlespiTelemetry }>>(res);
    return raw[0]?.telemetry ?? {};
  });
};

export type QueuedCommand = {
  id?: number | string;
  name: string;
  address?: string;
  properties: Record<string, unknown>;
};

// Queue a command to the device. For Teltonika, the typical shape is:
//   { name: "custom", properties: { text: "setparam 800:1" } }
// Flespi delivers it via the live GPRS connection using Codec-12.
const commandPropKey = new Map<number, "payload" | "text">();

export const queueCommand = async (
  deviceId: number,
  payload: string
): Promise<QueuedCommand[]> => {
  invalidateFlespiCache(deviceId);

  const trySend = async (key: "payload" | "text") => {
    const body = [{ name: "custom", properties: { [key]: payload } }];
    return flespiRequest(`${BASE}/gw/devices/${deviceId}/commands-queue`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  const key = commandPropKey.get(deviceId) ?? "payload";
  let res = await trySend(key);

  // Wenn payload schlägt fehl, text probieren (und umgekehrt)
  if (!res.ok && res.status === 400) {
    const fallback = key === "payload" ? "text" : "payload";
    res = await trySend(fallback);
    if (res.ok) commandPropKey.set(deviceId, fallback);
  } else if (res.ok) {
    commandPropKey.set(deviceId, key);
  }

  return unwrap<QueuedCommand[]>(res);
};

export type CommandResult = {
  id: number | string;
  command_id?: number | string;
  device_id?: number;
  ident?: string;
  name: string;
  address?: string;
  properties: Record<string, unknown>;
  executed?: boolean | { timestamp: number };
  response?: { payload?: string } & Record<string, unknown>;
  timestamp?: number;
};

const resultTimestamp = (result: CommandResult): number => {
  if (typeof result.executed === "object" && result.executed?.timestamp != null) {
    return result.executed.timestamp;
  }
  return result.timestamp ?? 0;
};

// Fetch the most recent command results for a device.
export const getRecentResults = async (
  deviceId: number,
  count = 20
): Promise<CommandResult[]> => {
  return getCached(`results:${deviceId}:${count}`, CACHE_TTL.results, async () => {
    const res = await flespiRequest(
      `${BASE}/gw/devices/${deviceId}/commands-result?count=${count}&reverse=true`
    );
    const raw = await unwrap<
      Array<
        Omit<CommandResult, "response" | "executed"> & {
          response?: string | ({ payload?: string } & Record<string, unknown>);
          executed?: boolean | { timestamp: number };
        }
      >
    >(res);
    return raw
      .map((item) => ({
        ...item,
        executed:
          typeof item.executed === "boolean"
            ? item.timestamp != null
              ? { timestamp: item.timestamp }
              : undefined
            : item.executed,
        response:
          typeof item.response === "string"
            ? { payload: item.response }
            : item.response,
      }))
      .sort((a, b) => resultTimestamp(b) - resultTimestamp(a));
  });
};

export type TrackPoint = {
  lat: number;
  lon: number;
  ts: number;
  speed?: number;
};

type RawMessage = Record<string, unknown>;

const readMessageTimestamp = (msg: RawMessage): number | null => {
  const t = msg.timestamp;
  if (typeof t === "number") return t;
  const st = msg["server.timestamp"];
  if (typeof st === "number") return st;
  if (st && typeof st === "object" && st !== null && "ts" in st) {
    const ts = (st as { ts?: unknown }).ts;
    if (typeof ts === "number") return ts;
  }
  return null;
};

export const extractTrackPoint = (msg: RawMessage): TrackPoint | null => {
  let lat: number | undefined;
  let lon: number | undefined;
  const pos = msg.position;
  if (pos && typeof pos === "object" && pos !== null) {
    const p = pos as Record<string, unknown>;
    if (typeof p.latitude === "number") lat = p.latitude;
    if (typeof p.longitude === "number") lon = p.longitude;
  }
  if (lat == null || lon == null) {
    const flatLat = msg["position.latitude"];
    const flatLon = msg["position.longitude"];
    if (typeof flatLat === "number") lat = flatLat;
    if (typeof flatLon === "number") lon = flatLon;
  }
  if (
    lat == null ||
    lon == null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon)
  ) {
    return null;
  }
  const ts = readMessageTimestamp(msg);
  if (ts == null) return null;

  let speed: number | undefined;
  if (pos && typeof pos === "object" && pos !== null) {
    const s = (pos as Record<string, unknown>).speed;
    if (typeof s === "number") speed = s;
  }
  if (speed == null && typeof msg["position.speed"] === "number") {
    speed = msg["position.speed"] as number;
  }

  const point: TrackPoint = { lat, lon, ts };
  if (speed != null) point.speed = speed;
  return point;
};

export const messagesToTrackPoints = (messages: RawMessage[]): TrackPoint[] => {
  const out: TrackPoint[] = [];
  for (const m of messages) {
    const p = extractTrackPoint(m);
    if (p) out.push(p);
  }
  out.sort((a, b) => a.ts - b.ts);
  const deduped: TrackPoint[] = [];
  for (const p of out) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.ts === p.ts && prev.lat === p.lat && prev.lon === p.lon) {
      continue;
    }
    deduped.push(p);
  }
  return deduped;
};

export type DeviceMessagesOptions = {
  count?: number;
  from?: number;
  to?: number;
  reverse?: boolean;
};

export const getDeviceMessages = async (
  deviceId: number,
  options: DeviceMessagesOptions = {}
): Promise<RawMessage[]> => {
  const count = Math.min(1000, Math.max(1, options.count ?? 500));
  const params = new URLSearchParams();
  params.set("count", String(count));
  if (options.from != null) params.set("from", String(Math.floor(options.from)));
  if (options.to != null) params.set("to", String(Math.floor(options.to)));
  if (options.reverse === true) params.set("reverse", "true");
  if (options.reverse === false) params.set("reverse", "false");

  const cacheKey = `messages:${deviceId}:${count}:${options.from ?? ""}:${
    options.to ?? ""
  }:${options.reverse ?? ""}`;
  return getCached(cacheKey, CACHE_TTL.messages, async () => {
    const res = await flespiRequest(`${BASE}/gw/devices/${deviceId}/messages?${params}`);
    const raw = await unwrap<RawMessage[]>(res);
    return Array.isArray(raw) ? raw : [];
  });
};
