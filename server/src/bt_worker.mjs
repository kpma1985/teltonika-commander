// Läuft unter Node.js — verwaltet den Seriell-Port für Bun
import { SerialPort } from "serialport";

let port = null;
let rawBuf = "";
let buf = "";

// Pending command state
let cmdResolve = null;
let cmdLines = [];
let cmdIdleTimer = null;
let cmdAbsTimer = null;
let cmdId = null;

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); } catch (e) { send({ type: "error", error: e.message }); }
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Prüft ob eine Zeile ein internes Debug-Log ist
function isDebugLine(line) {
  return /^\[20\d\d\.\d\d\.\d\d/.test(line);
}

function onPortData(chunk) {
  rawBuf += chunk.toString("utf8");
  // Zeilenweise verarbeiten (\n oder \r\n)
  let idx;
  while ((idx = rawBuf.search(/\r?\n/)) !== -1) {
    const raw = rawBuf.slice(0, idx).replace(/\r$/, "").trimEnd();
    rawBuf = rawBuf.slice(idx + (rawBuf[idx] === "\r" ? 2 : 1));

    if (!raw) continue;

    if (isDebugLine(raw)) {
      // Debug-Log → nur als info weiterleiten
      send({ type: "log", line: raw });
    } else {
      // Echte Antwort-Zeile
      send({ type: "log", line: raw }); // auch anzeigen
      if (cmdResolve) {
        cmdLines.push(raw);
        clearTimeout(cmdAbsTimer);
        if (cmdIdleTimer) clearTimeout(cmdIdleTimer);
        cmdIdleTimer = setTimeout(finishCmd, 600);
      }
    }
  }
}

function finishCmd() {
  if (!cmdResolve) return;
  clearTimeout(cmdAbsTimer);
  clearTimeout(cmdIdleTimer);
  const resolve = cmdResolve;
  const lines = cmdLines;
  cmdResolve = null;
  cmdLines = [];
  cmdId = null;
  resolve(lines);
}

async function close() {
  finishCmd();
  if (port) {
    await new Promise((r) => port.close(r));
    port = null;
    rawBuf = "";
  }
}

async function handle(msg) {
  try {
    if (msg.type === "connect") {
      await close();
      port = new SerialPort({ path: msg.path, baudRate: 115200, autoOpen: false });
      port.on("data", onPortData);
      port.on("error", (e) => send({ type: "error", error: e.message }));
      await new Promise((resolve, reject) => port.open((e) => e ? reject(e) : resolve()));
      if (msg.password?.trim()) {
        port.write(msg.password.trim() + "\r\n");
        await delay(500);
      }
      send({ type: "connected", path: msg.path });

    } else if (msg.type === "disconnect") {
      await close();
      send({ type: "disconnected" });

    } else if (msg.type === "status") {
      send({ type: "status", connected: port?.isOpen ?? false, path: port?.path ?? null });

    } else if (msg.type === "command") {
      if (!port?.isOpen) { send({ type: "response", id: msg.id, error: "Nicht verbunden" }); return; }

      const timeout = msg.timeout ?? 4000;
      const lines = await new Promise((resolve) => {
        cmdResolve = resolve;
        cmdLines = [];
        cmdId = msg.id;
        cmdAbsTimer = setTimeout(finishCmd, timeout);
        port.write(msg.command + "\r\n");
      });

      // Nur Nicht-Debug-Zeilen als Kommando-Antwort zurückschicken
      const responseLines = lines.filter((l) => !isDebugLine(l));
      send({ type: "response", id: msg.id, lines: responseLines });
    }
  } catch (e) {
    send({ type: "error", id: msg.id, error: e.message });
  }
}

process.on("SIGTERM", async () => { await close(); process.exit(0); });
