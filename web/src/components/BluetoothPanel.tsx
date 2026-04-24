import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Health } from "../types";

type Port = { path: string; manufacturer?: string };
type LogLine = { dir: "tx" | "rx" | "info"; text: string; ts: number };

const QUICK_CMDS = [
  { label: "getinfo", cmd: "getinfo" },
  { label: "getver", cmd: "getver" },
  { label: "APN lesen", cmd: "getparam 2001" },
  { label: "Server lesen", cmd: "getparam 2004" },
  { label: "GPS", cmd: "getgps" },
  { label: "Status", cmd: "getstatus" },
];

export const BluetoothPanel = ({ health }: { health: Health | null }) => {
  const btPasswordSet = health?.btPasswordSet ?? false;
  const [ports, setPorts] = useState<Port[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [password, setPassword] = useState("");
  const [connected, setConnected] = useState(false);
  const [connectedPath, setConnectedPath] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = (dir: LogLine["dir"], text: string) =>
    setLog((l) => [...l, { dir, text, ts: Date.now() }]);

  const loadPorts = async () => {
    try {
      const { ports: p } = await api.bluetooth.ports();
      setPorts(p);
      const firstPort = p[0];
      if (firstPort && !selectedPort) setSelectedPort(firstPort.path);
    } catch (e) {
      addLog("info", `Ports: ${(e as Error).message}`);
    }
  };

  const loadStatus = async () => {
    try {
      const s = await api.bluetooth.status();
      setConnected(s.connected);
      setConnectedPath(s.path);
      if (s.connected && s.path) setSelectedPort(s.path);
    } catch {}
  };

  useEffect(() => {
    loadStatus();
    loadPorts();
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  useEffect(() => {
    if (!connected) return;
    const es = new EventSource("/api/bluetooth/log");
    es.onmessage = (e) => {
      try {
        const line = JSON.parse(e.data) as string;
        addLog("info", line);
      } catch {}
    };
    return () => es.close();
  }, [connected]);

  const connect = async () => {
    if (!selectedPort) return;
    setConnecting(true);
    try {
      const s = await api.bluetooth.connect(selectedPort, password || undefined);
      setConnected(s.connected);
      setConnectedPath(s.path);
      addLog("info", `Verbunden mit ${s.path}`);
    } catch (e) {
      addLog("info", `Fehler: ${(e as Error).message}`);
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await api.bluetooth.disconnect();
    setConnected(false);
    setConnectedPath(null);
    addLog("info", "Getrennt");
  };

  const send = async (cmd: string) => {
    if (!cmd.trim() || sending) return;
    setSending(true);
    addLog("tx", cmd.trim());
    setInput("");
    try {
      const { lines } = await api.bluetooth.command(cmd.trim());
      if (lines.length === 0) {
        addLog("info", "(keine Antwort)");
      } else {
        lines.forEach((l) => addLog("rx", l));
      }
    } catch (e) {
      addLog("info", `Fehler: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  const portLabel = (p: Port) => {
    const name = p.path.replace("/dev/cu.", "");
    return p.manufacturer ? `${name} — ${p.manufacturer}` : name;
  };

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Bluetooth</div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] ${
            connected ? "text-green-400" : "text-[var(--color-muted)]"
          }`}
        >
          <span className={`inline-block w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-zinc-600"}`} />
          {connected ? connectedPath?.replace("/dev/cu.", "") : "getrennt"}
        </span>
      </div>

      {!connected && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-2 py-1.5 text-xs"
            >
              {ports.length === 0 && (
                <option value="">— keine Ports gefunden —</option>
              )}
              {ports.map((p) => (
                <option key={p.path} value={p.path}>
                  {portLabel(p)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadPorts}
              className="rounded-lg border border-[var(--color-line)] px-2 py-1.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)]"
            >
              ↻
            </button>
          </div>
          <input
            name="bt-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={btPasswordSet ? "Aus .env — hier überschreiben zum Testen" : "Passwort (leer = keins)"}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-mono"
          />
          <button
            type="button"
            onClick={connect}
            disabled={connecting || !selectedPort}
            className="w-full rounded-xl bg-[var(--color-accent)] py-2 text-sm font-semibold text-white disabled:opacity-35"
          >
            {connecting ? "Verbinde…" : "Verbinden"}
          </button>
        </div>
      )}

      {connected && (
        <>
          <div className="flex flex-wrap gap-1">
            {QUICK_CMDS.map((q) => (
              <button
                key={q.cmd}
                type="button"
                onClick={() => send(q.cmd)}
                disabled={sending}
                className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 transition-colors"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div
            ref={logRef}
            className="no-scrollbar h-40 overflow-y-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] p-2 font-mono text-[11px] space-y-0.5"
          >
            {log.length === 0 && (
              <div className="text-[var(--color-muted)]">Bereit.</div>
            )}
            {log.map((l, i) => (
              <div
                key={i}
                className={
                  l.dir === "tx"
                    ? "text-[var(--color-muted)]"
                    : l.dir === "rx"
                    ? "text-[var(--color-accent-2)]"
                    : "text-[var(--color-muted)] italic"
                }
              >
                {l.dir === "tx" ? "› " : l.dir === "rx" ? "  " : "# "}
                {l.text}
              </div>
            ))}
            {sending && (
              <div className="text-[var(--color-muted)] animate-pulse">…</div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              name="bt-command"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Kommando eingeben…"
              disabled={sending}
              className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-35"
            >
              Senden
            </button>
          </div>

          <button
            type="button"
            onClick={disconnect}
            className="w-full rounded-lg border border-[var(--color-line)] py-1.5 text-xs text-[var(--color-muted)] hover:border-red-700 hover:text-red-400 transition-colors"
          >
            Trennen
          </button>
        </>
      )}
    </div>
  );
};
