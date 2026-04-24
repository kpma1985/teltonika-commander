import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { z } from "zod";
import {
  btConnect,
  btDisconnect,
  btListPorts,
  btSendCommand,
  btStatus,
  onBtLog,
} from "./bluetooth.ts";
import { env } from "./env.ts";
import {
  buildApn,
  buildBtObd2,
  buildServer,
  buildSettingsRead,
  buildOutputs,
  buildStatus,
  buildTracking,
  CPURESET,
  DEFAULTCFG,
  STATUS_COMMANDS,
  wrapSmsCommand,
} from "./commands.ts";
import {
  type CommandResult as FlespiCommandResult,
  getDevice,
  getRecentResults,
  getTelemetry,
  listDevices,
  queueCommand,
  summarizeTelemetry,
} from "./flespi.ts";
import {
  clearSipgateAuth,
  getDeviceSettings,
  getAllAppConfig,
  logCommand,
  recentAll,
  recentForDevice,
  saveDeviceSmsRecipient,
  setAppConfigValues,
  clearHistory,
} from "./db.ts";
import {
  buildAuthorizeUrl,
  exchangeCode,
  sendSms,
  sipgateStatus,
} from "./sipgate.ts";
import { normalizePhoneNumber } from "./phone.ts";
import { getPublicRuntimeConfig } from "./runtime-config.ts";

const app = new Hono();
app.use("*", cors());

app.get("/api/health", (c) => {
  const s = sipgateStatus();
  return c.json({
    ok: true,
    sipgate: s.connected,
    sipgateMode: s.mode,
    statusCommands: STATUS_COMMANDS.map(({ key, label }) => ({ key, label })),
    btPasswordSet: env.BLUETOOTH_PASSWORD.length > 0,
  });
});

app.get("/api/settings", (c) => {
  return c.json({
    config: getPublicRuntimeConfig(),
    overrides: getAllAppConfig(),
  });
});

app.put("/api/settings", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { config?: Record<string, string | null> }
    | null;
  if (!body?.config) return c.json({ error: "config required" }, 400);
  setAppConfigValues(body.config);
  return c.json({ ok: true, config: getPublicRuntimeConfig() });
});

app.get("/api/sipgate/authorize", (c) => {
  try {
    return c.redirect(buildAuthorizeUrl());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.get("/api/sipgate/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const errorParam = c.req.query("error");
  if (errorParam) {
    return c.html(
      `<pre>Sipgate OAuth error: ${errorParam} — ${c.req.query("error_description") ?? ""}</pre>`,
      400
    );
  }
  if (!code || !state) return c.json({ error: "missing code/state" }, 400);
  try {
    await exchangeCode(code, state);
  } catch (e) {
    return c.html(
      `<pre>Exchange failed: ${(e as Error).message}</pre>`,
      500
    );
  }
  return c.html(
    `<!doctype html><meta charset=utf-8>
     <style>body{font:16px -apple-system;padding:2rem;background:#0b0f17;color:#e5e7eb}a{color:#60a5fa}</style>
     <h2>Sipgate verbunden ✅</h2>
     <p>Du kannst dieses Fenster schließen. <a href="/">Zurück zur App</a></p>
     <script>window.opener&&window.opener.postMessage({type:"sipgate-connected"},"*");setTimeout(function(){window.close()},1500);</script>`
  );
});

app.post("/api/sipgate/disconnect", (c) => {
  clearSipgateAuth();
  return c.json({ ok: true });
});

app.get("/api/devices", async (c) => {
  const devices = await listDevices();
  return c.json(devices.map((d) => ({
    ...d,
    smsRecipient: getDeviceSettings(d.id)?.sms_recipient ?? null,
  })));
});

app.get("/api/commands/queue", async (c) => {
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? 50)));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  const candidates = recentAll(200, 0).filter(
    (row) => row.channel === "gprs" && row.status === "queued"
  );
  const deviceIds = Array.from(new Set(candidates.map((row) => row.device_id)));
  const resultsByDevice = new Map<number, FlespiCommandResult[]>();

  await Promise.all(
    deviceIds.map(async (deviceId) => {
      const results = await getRecentResults(deviceId, 200).catch(
        () => [] as FlespiCommandResult[]
      );
      resultsByDevice.set(deviceId, results);
    })
  );

  const pending = candidates.filter((row) => {
    if (row.external_id == null) return true;
    const results = resultsByDevice.get(row.device_id) ?? [];
    return !results.some((result) =>
      [result.id, result.command_id]
        .filter((value): value is number | string => value != null)
        .map(String)
        .includes(row.external_id as string)
    );
  });

  return c.json({
    rows: pending.slice(offset, offset + limit),
    offset,
    limit,
  });
});

app.get("/api/devices/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const resultsCount = Math.max(1, Math.min(50, Number(c.req.query("results_count") ?? 10)));
  const resultsOffset = Math.max(0, Number(c.req.query("results_offset") ?? 0));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const device = await getDevice(id);
  if (!device) return c.json({ error: "not found" }, 404);
  const [telemetry, results] = await Promise.all([
    getTelemetry(id).catch(() => ({})),
    getRecentResults(id, resultsCount + resultsOffset).catch(() => []),
  ]);
  const settings = getDeviceSettings(id);
  return c.json({
    device: {
      ...device,
      ...summarizeTelemetry(telemetry),
    },
    telemetry,
    results: results.slice(resultsOffset, resultsOffset + resultsCount),
    resultsTotal: results.length,
    smsRecipient: settings?.sms_recipient ?? null,
  });
});

app.put("/api/devices/:id/settings", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const body = (await c.req.json().catch(() => null)) as
    | { smsRecipient?: string | null }
    | null;
  if (!body || !("smsRecipient" in body)) {
    return c.json({ error: "smsRecipient required" }, 400);
  }
  const smsRecipient =
    typeof body.smsRecipient === "string" ? normalizePhoneNumber(body.smsRecipient) : "";
  saveDeviceSmsRecipient(id, smsRecipient || null);
  return c.json({ ok: true, smsRecipient: smsRecipient || null });
});

app.delete("/api/devices/:id/history", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  clearHistory(id);
  return c.json({ ok: true });
});

app.get("/api/devices/:id/history", async (c) => {
  const id = Number(c.req.param("id"));
  const limit = Math.max(1, Math.min(100, Number(c.req.query("limit") ?? 100)));
  const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const [rows, results] = await Promise.all([
    Promise.resolve(recentForDevice(id, limit, offset)),
    getRecentResults(id, 200).catch(() => [] as FlespiCommandResult[]),
  ]);

  const byExternalId = new Map<string, FlespiCommandResult>();
  for (const result of results) {
    const keys = [result.id, result.command_id]
      .filter((value): value is number | string => value != null)
      .map(String);
    for (const key of keys) byExternalId.set(key, result);
  }

  return c.json({
    rows: rows.map((row) => {
      const matched =
        row.external_id != null ? byExternalId.get(row.external_id) : undefined;
      return {
        ...row,
        status: matched ? "executed" : row.status,
        executed_at: matched?.timestamp ?? null,
        response:
          typeof matched?.response?.payload === "string"
            ? matched.response.payload
            : null,
      };
    }),
    offset,
    limit,
  });
});

const PresetSchema = z.discriminatedUnion("preset", [
  z.object({
    preset: z.literal("bt-obd2"),
    mac: z.string().min(1),
    pin: z.string().min(1),
    externalName: z.string().optional(),
    reset: z.boolean().optional(),
  }),
  z.object({
    preset: z.literal("apn"),
    apn: z.string().min(1),
    user: z.string().optional(),
    password: z.string().optional(),
    auth: z.enum(["pap", "chap"]).optional(),
  }),
  z.object({
    preset: z.literal("server"),
    domain: z.string().min(1),
    port: z.number().int().positive().max(65535),
    protocol: z.enum(["tcp", "udp"]),
    enableGprs: z.boolean().optional(),
    reset: z.boolean().optional(),
  }),
  z.object({
    preset: z.literal("settings-read"),
    profile: z.enum(["apn", "server", "network"]),
  }),
  z.object({
    preset: z.literal("status"),
    key: z.string().min(1),
  }),
  z.object({
    preset: z.literal("outputs"),
    states: z.string().min(1),
    t1: z.number().int().nonnegative().optional(),
    t2: z.number().int().nonnegative().optional(),
    s1: z.number().int().nonnegative().optional(),
    s2: z.number().int().nonnegative().optional(),
    reset: z.boolean().optional(),
  }),
  z.object({
    preset: z.literal("tracking"),
    stopInterval: z.number().int().positive(),
    movingInterval: z.number().int().positive(),
  }),
  z.object({
    preset: z.literal("raw"),
    payload: z.string().min(1),
  }),
]);

const CommandRequest = z.object({
  channel: z.enum(["gprs", "sms"]),
  recipient: z.string().optional(), // required for sms
  data: PresetSchema,
});

const buildPayloads = (data: z.infer<typeof PresetSchema>): string[] => {
  switch (data.preset) {
    case "bt-obd2":
      return buildBtObd2(data);
    case "apn":
      return buildApn(data);
    case "server":
      return buildServer(data);
    case "settings-read":
      return buildSettingsRead(data);
    case "status":
      return buildStatus(data.key as (typeof STATUS_COMMANDS)[number]["key"]);
    case "outputs":
      return buildOutputs(data);
    case "tracking":
      return buildTracking(data);
    case "raw": {
      const p = data.payload.trim();
      if (p === CPURESET || p === DEFAULTCFG) return [p];
      return [p];
    }
  }
};

app.post("/api/devices/:id/command", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);

  const parsed = CommandRequest.safeParse(await c.req.json());
  if (!parsed.success) {
    return c.json({ error: "invalid body", issues: parsed.error.issues }, 400);
  }
  const { channel, recipient, data } = parsed.data;
  const normalizedRecipient =
    channel === "sms" && recipient ? normalizePhoneNumber(recipient) : undefined;

  if (channel === "sms" && !sipgateStatus().connected) {
    return c.json({ error: "sipgate not connected" }, 400);
  }
  if (channel === "sms" && !normalizedRecipient) {
    return c.json({ error: "recipient (E.164) required for sms" }, 400);
  }

  const device = await getDevice(id);
  if (!device) return c.json({ error: "device not found" }, 404);

  let payloads: string[];
  try {
    payloads = buildPayloads(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }

  const results: Array<{
    payload: string;
    status: "queued" | "sent" | "failed";
    error?: string;
    logId: number;
    externalId?: string | null;
    deviceId: number;
    deviceName: string;
    channel: "gprs" | "sms";
    preset: string;
    createdAt: number;
  }> = [];

  for (const payload of payloads) {
    try {
      let externalId: string | null = null;
      if (channel === "gprs") {
        const q = await queueCommand(id, payload);
        externalId = q[0]?.id != null ? String(q[0].id) : null;
      } else {
        await sendSms({
          recipient: normalizedRecipient as string,
          message: wrapSmsCommand(payload),
        });
        saveDeviceSmsRecipient(id, normalizedRecipient as string);
      }
      const status = channel === "sms" ? "sent" : "queued";
      const logId = logCommand({
        device_id: id,
        device_name: device.name,
        channel,
        preset: data.preset,
        payload,
        status,
        error: null,
        external_id: externalId,
      });
      results.push({
        payload,
        status,
        logId,
        externalId,
        deviceId: id,
        deviceName: device.name,
        channel,
        preset: data.preset,
        createdAt: Date.now(),
      });
    } catch (e) {
      const msg = (e as Error).message;
      const logId = logCommand({
        device_id: id,
        device_name: device.name,
        channel,
        preset: data.preset,
        payload,
        status: "failed",
        error: msg,
        external_id: null,
      });
      results.push({
        payload,
        status: "failed",
        error: msg,
        logId,
        externalId: null,
        deviceId: id,
        deviceName: device.name,
        channel,
        preset: data.preset,
        createdAt: Date.now(),
      });
    }
  }

  return c.json({ results });
});

app.get("/api/commands/preview", (c) => {
  // Helpful for the UI to show the generated payload before sending.
  const raw = c.req.query("data");
  if (!raw) return c.json({ error: "missing data" }, 400);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return c.json({ error: "bad json" }, 400);
  }
  const parsed = PresetSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return c.json({ error: "invalid", issues: parsed.error.issues }, 400);
  }
  try {
    const payloads = buildPayloads(parsed.data);
    return c.json({ payloads, sms: payloads.map(wrapSmsCommand) });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// ── Bluetooth ──────────────────────────────────────────────────────────────

app.get("/api/bluetooth/status", (c) => c.json(btStatus()));

app.get("/api/bluetooth/ports", async (c) => {
  try {
    const ports = await btListPorts();
    return c.json({ ports });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.post("/api/bluetooth/connect", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    path?: string;
    password?: string;
  };
  if (!body.path) return c.json({ error: "path required" }, 400);
  // ENV-Passwort als Fallback wenn GUI-Feld leer
  const password = body.password?.trim() || env.BLUETOOTH_PASSWORD || undefined;
  try {
    await btConnect(body.path, password);
    return c.json(btStatus());
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.delete("/api/bluetooth/disconnect", async (c) => {
  await btDisconnect();
  return c.json(btStatus());
});

app.post("/api/bluetooth/command", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    command?: string;
    timeout?: number;
  };
  if (!body.command?.trim()) return c.json({ error: "command required" }, 400);
  try {
    const lines = await btSendCommand(body.command.trim(), body.timeout);
    return c.json({ lines });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

app.get("/api/bluetooth/log", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const unsub = onBtLog((line) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(line)}\n\n`));
      });
      c.req.raw.signal.addEventListener("abort", () => {
        unsub();
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

app.post("/api/server/restart", (c) => {
  setTimeout(() => {
    Bun.spawn(
      ["/bin/bash", "-c", `"${import.meta.dir}/../../scripts/server.sh" restart`],
      { detached: true, stdio: ["ignore", "ignore", "ignore"] }
    );
  }, 300);
  return c.json({ ok: true });
});

// ── Server ─────────────────────────────────────────────────────────────────

const webDistRoot = env.WEB_DIST_DIR || `${import.meta.dir}/../../web/dist`;
app.use("/*", serveStatic({ root: webDistRoot }));
app.get("*", serveStatic({ path: `${webDistRoot}/index.html` }));

const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
server.ref();
console.log(`teltonika-sms server listening on :${server.port}`);
