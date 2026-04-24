import { join } from "path";

const WORKER_PATH = join(import.meta.dir, "bt_worker.mjs");

type Resolver = { resolve: (lines: string[]) => void; reject: (e: Error) => void };

let worker: ReturnType<typeof Bun.spawn> | null = null;
let pending = new Map<string, Resolver>();
let cmdSeq = 0;
let stdoutBuf = "";
let connectedPath: string | null = null;
let connectResolver: ((ok: boolean, err?: string) => void) | null = null;

export type BtPortInfo = { path: string; manufacturer?: string };

// ── Worker lifecycle ────────────────────────────────────────────────────────

function ensureWorker() {
  if (worker && !worker.killed) return;

  worker = Bun.spawn(["node", WORKER_PATH], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  // Worker stdout (JSON-Lines) lesen
  const pump = async () => {
    const stdout = worker?.stdout;
    if (!stdout || typeof stdout === "number") return;
    const reader = stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      stdoutBuf += dec.decode(value);
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
        const line = stdoutBuf.slice(0, nl).trim();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (!line) continue;
        try { dispatch(JSON.parse(line)); } catch { /* ignore malformed */ }
      }
    }
    worker = null;
  };
  pump().catch(() => { worker = null; });
}

type LogListener = (line: string) => void;
const logListeners = new Set<LogListener>();
export const onBtLog = (fn: LogListener) => { logListeners.add(fn); return () => logListeners.delete(fn); };

function dispatch(msg: Record<string, unknown>) {
  if (msg.type === "connected") {
    connectedPath = msg.path as string;
    connectResolver?.(true);
    connectResolver = null;
  } else if (msg.type === "disconnected") {
    connectedPath = null;
    connectResolver?.(true);
    connectResolver = null;
  } else if (msg.type === "log") {
    logListeners.forEach((fn) => fn(msg.line as string));
  } else if (msg.type === "response") {
    const id = msg.id as string;
    const r = pending.get(id);
    if (r) {
      pending.delete(id);
      if (msg.error) r.reject(new Error(msg.error as string));
      else r.resolve(msg.lines as string[]);
    }
  } else if (msg.type === "error" && !msg.id) {
    console.error("[BT Worker]", msg.error);
    if (connectResolver) { connectResolver(false, msg.error as string); connectResolver = null; }
  }
}

function workerSend(obj: Record<string, unknown>) {
  ensureWorker();
  const stdin = worker?.stdin;
  if (!stdin || typeof stdin === "number") {
    throw new Error("Bluetooth worker stdin unavailable");
  }
  stdin.write(JSON.stringify(obj) + "\n");
}

// ── Public API ──────────────────────────────────────────────────────────────

export const btAvailable = (): boolean => {
  try { return true; } catch { return false; }
};

export const btStatus = () => ({
  available: true,
  connected: connectedPath !== null,
  path: connectedPath,
});

export const btListPorts = async (): Promise<BtPortInfo[]> => {
  const proc = Bun.spawn(["ls", "/dev/"], { stdout: "pipe" });
  const text = await new Response(proc.stdout).text();
  return text
    .split("\n")
    .filter(
      (f) =>
        f.startsWith("cu.") &&
        !f.includes("Incoming-Port") &&
        !f.includes("debug-console") &&
        f.trim().length > 0
    )
    .map((f) => ({ path: `/dev/${f.trim()}` }));
};

export const btConnect = (path: string, password?: string): Promise<void> =>
  new Promise((resolve, reject) => {
    connectResolver = (ok, err) => (ok ? resolve() : reject(new Error(err ?? "Verbindung fehlgeschlagen")));
    workerSend({ type: "connect", path, password: password ?? "" });
    // Absoluter Timeout
    setTimeout(() => {
      if (connectResolver) { connectResolver = null; reject(new Error("Timeout")); }
    }, 8000);
  });

export const btDisconnect = (): Promise<void> =>
  new Promise((resolve) => {
    if (!connectedPath) { connectedPath = null; resolve(); return; }
    connectResolver = () => resolve();
    workerSend({ type: "disconnect" });
    setTimeout(() => { connectedPath = null; resolve(); }, 2000);
  });

export const btSendCommand = (command: string, timeoutMs = 4000): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const id = String(++cmdSeq);
    pending.set(id, { resolve, reject });
    workerSend({ type: "command", id, command, timeout: timeoutMs });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve([]); // Timeout → leeres Ergebnis
      }
    }, timeoutMs + 1000);
  });
