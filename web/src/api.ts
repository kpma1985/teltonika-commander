import type {
  AppConfig,
  CommandResult,
  Device,
  DeviceDetail,
  Health,
  HistoryResponse,
  PresetData,
  SettingsResponse,
} from "./types";

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    let err = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) err = body.error;
    } catch {
      // ignore
    }
    throw new Error(err);
  }
  return (await res.json()) as T;
};

export const api = {
  health: () => fetch("/api/health").then(json<Health>),
  devices: () => fetch("/api/devices").then(json<Device[]>),
  device: (id: number, params?: { resultsCount?: number; resultsOffset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.resultsCount != null) qs.set("results_count", String(params.resultsCount));
    if (params?.resultsOffset != null) qs.set("results_offset", String(params.resultsOffset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return fetch(`/api/devices/${id}${suffix}`).then(json<DeviceDetail>);
  },
  settings: () => fetch("/api/settings").then(json<SettingsResponse>),
  updateSettings: (config: Partial<AppConfig>) =>
    fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    }).then(json<{ ok: true; config: AppConfig }>),
  updateDeviceSettings: (
    id: number,
    body: { smsRecipient: string | null }
  ) =>
    fetch(`/api/devices/${id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<{ ok: true; smsRecipient: string | null }>),
  history: (id: number, params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return fetch(`/api/devices/${id}/history${suffix}`).then(json<HistoryResponse>);
  },
  commandQueue: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : "";
    return fetch(`/api/commands/queue${suffix}`, { cache: "no-store" }).then(
      json<HistoryResponse>
    );
  },
  clearHistory: (id: number) =>
    fetch(`/api/devices/${id}/history`, { method: "DELETE" }).then(json<{ ok: true }>),
  preview: (data: PresetData): Promise<{ payloads: string[]; sms: string[] }> => {
    const qs = new URLSearchParams({ data: JSON.stringify(data) });
    return fetch(`/api/commands/preview?${qs}`).then(
      json<{ payloads: string[]; sms: string[] }>
    );
  },
  sendCommand: (
    id: number,
    body: {
      channel: "gprs" | "sms";
      recipient?: string;
      data: PresetData;
    }
  ) =>
    fetch(`/api/devices/${id}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<{ results: CommandResult[] }>),

  bluetooth: {
    status: () => fetch("/api/bluetooth/status").then(
      json<{ available: boolean; connected: boolean; path: string | null }>
    ),
    ports: () => fetch("/api/bluetooth/ports").then(
      json<{ ports: Array<{ path: string; manufacturer?: string }> }>
    ),
    connect: (path: string, password?: string) =>
      fetch("/api/bluetooth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, password }),
      }).then(json<{ connected: boolean; path: string | null }>),
    disconnect: () =>
      fetch("/api/bluetooth/disconnect", { method: "DELETE" }).then(
        json<{ connected: boolean }>
      ),
    command: (command: string, timeout?: number) =>
      fetch("/api/bluetooth/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout }),
      }).then(json<{ lines: string[] }>),
  },
};
