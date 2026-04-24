import { getRuntimeConfig } from "./runtime-config.ts";
import { env } from "./env.ts";

const BASE = env.FLESPI_BASE_URL;
const CACHE_TTL = {
  devices: 15_000,
  device: 15_000,
  telemetry: 15_000,
  results: 8_000,
} as const;

const headers = (): HeadersInit => ({
  Authorization: `FlespiToken ${getRuntimeConfig().FLESPI_TOKEN}`,
  "Content-Type": "application/json",
});

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
    const res = await fetch(url, { headers: headers() });
    const raw = await unwrap<DeviceRaw[]>(res);
    return Promise.all(
      raw.map(async (d) => {
        const telemetry = await getTelemetry(d.id).catch(() => ({} as FlespiTelemetry));
        return {
          id: d.id,
          name: d.name,
          device_type_id: d.device_type_id,
          enabled: d.enabled,
          ident: d["configuration.ident"] ?? d.configuration?.ident ?? "",
          ...summarizeTelemetry(telemetry),
        };
      })
    );
  });
};

export const getDevice = async (id: number): Promise<FlespiDevice | null> => {
  return getCached(`device:${id}`, CACHE_TTL.device, async () => {
    const res = await fetch(
      `${BASE}/gw/devices/${id}?fields=id,name,configuration.ident,device_type_id,enabled`,
      { headers: headers() }
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
    const res = await fetch(`${BASE}/gw/devices/${id}/telemetry/all`, {
      headers: headers(),
    });
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
    return fetch(`${BASE}/gw/devices/${deviceId}/commands-queue`, {
      method: "POST",
      headers: headers(),
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
    const res = await fetch(
      `${BASE}/gw/devices/${deviceId}/commands-result?count=${count}&reverse=true`,
      { headers: headers() }
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
