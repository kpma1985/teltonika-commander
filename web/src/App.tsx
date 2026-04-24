import { useEffect, useState } from "react";
import { api } from "./api";
import type { CommandResult, Device, Health } from "./types";
import { DeviceList } from "./components/DeviceList";
import { DeviceDetail } from "./components/DeviceDetail";
import { SettingsPanel } from "./components/SettingsPanel";
import { BluetoothPanel } from "./components/BluetoothPanel";
import { CommandQueueModal } from "./components/CommandQueueModal";
import { useUi } from "./ui";

const SELECTED_DEVICE_STORAGE_KEY = "selected-device-id";

const readStoredSelectedDeviceId = (): number | null => {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
  if (!raw) return null;

  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const App = () => {
  const [health, setHealth] = useState<Health | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(readStoredSelectedDeviceId);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [queueOptimisticResults, setQueueOptimisticResults] = useState<CommandResult[]>([]);
  const [toasts, setToasts] =
    useState<Array<{ id: number; result: CommandResult; fading: boolean }>>([]);
  const { t, language, setLanguage, theme, setTheme, privacy, setPrivacy } = useUi();

  const refresh = () => {
    Promise.all([api.health(), api.devices()])
      .then(([h, d]) => {
        setHealth(h);
        setDevices(d);
        setSelectedId((cur) => {
          if (cur != null && d.some((device) => device.id === cur)) return cur;

          const storedId = readStoredSelectedDeviceId();
          if (storedId != null && d.some((device) => device.id === storedId)) {
            return storedId;
          }

          return d[0]?.id ?? null;
        });
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    refresh();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "sipgate-connected") refresh();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const timers: number[] = [];

    const onCommandSent = (event: Event) => {
      const detail = (event as CustomEvent<{ results?: CommandResult[] }>).detail;
      const results = detail?.results ?? [];
      setQueueRefreshKey((value) => value + 1);
      setQueueOptimisticResults((current) => {
        const existing = new Set(current.map((item) => item.logId));
        const fresh = results.filter((item) => !existing.has(item.logId));
        return [...fresh, ...current].slice(0, 50);
      });

      for (const result of results) {
        const id = result.logId || Date.now() + Math.random();
        setToasts((current) => [
          ...current,
          { id, result, fading: false },
        ].slice(-5));

        timers.push(window.setTimeout(() => {
          setToasts((current) =>
            current.map((toast) =>
              toast.id === id ? { ...toast, fading: true } : toast
            )
          );
        }, 2400));

        timers.push(window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 4200));
      }
    };

    window.addEventListener("teltonika-command-sent", onCommandSent);
    return () => {
      window.removeEventListener("teltonika-command-sent", onCommandSent);
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  useEffect(() => {
    if (devices === null) return;

    if (selectedId != null && devices.some((device) => device.id === selectedId)) {
      window.localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, String(selectedId));
      return;
    }

    window.localStorage.removeItem(SELECTED_DEVICE_STORAGE_KEY);
  }, [devices, selectedId]);

  const connectSipgate = () => {
    window.open("/api/sipgate/authorize", "_blank", "width=600,height=750");
  };

  const disconnectSipgate = async () => {
    await fetch("/api/sipgate/disconnect", { method: "POST" });
    refresh();
  };

  const selected = devices?.find((d) => d.id === selectedId) ?? null;
  const onlineCount = devices?.filter((d) => d.online).length ?? 0;

  const sidebarContent = (
    <section className="space-y-3">
      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-medium">{t("devices")}</div>
          <button
            type="button"
            onClick={() => {
              setQueueOpen(true);
              setQueueRefreshKey((value) => value + 1);
            }}
            className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
          >
            {t("queue_link")}
          </button>
        </div>
        {devices === null ? (
          <div className="text-sm text-[var(--color-muted)]">{t("devices_loading")}</div>
        ) : (
          <DeviceList
            devices={devices}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              window.localStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, String(id));
              setSidebarOpen(false);
            }}
          />
        )}
      </div>
      <BluetoothPanel health={health} />
      <SettingsPanel />
    </section>
  );

  return (
    <div className="min-h-full flex flex-col">
      <CommandQueueModal
        open={queueOpen}
        refreshKey={queueRefreshKey}
        optimisticResults={queueOptimisticResults}
        onClose={() => setQueueOpen(false)}
      />
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[60] flex max-w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border border-green-700/60 bg-green-950/90 px-4 py-3 text-sm text-green-100 shadow-2xl transition-opacity duration-[1800ms] ${
                toast.fading ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="font-mono break-all text-xs">{toast.result.payload}</div>
              {toast.result.externalId && (
                <div className="mt-1 text-[11px] text-green-200/80">
                  {t("queue_id")}: <span className="font-mono">{toast.result.externalId}</span>
                </div>
              )}
              <div className="mt-1 text-xs font-medium">
                {toast.result.status === "failed"
                  ? toast.result.error
                  : toast.result.status === "sent"
                    ? `✓ ${t("sent")}`
                    : `✓ ${t("queued")}`}
              </div>
            </div>
          ))}
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[var(--color-bg)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] text-base md:hidden"
              aria-label={t("open_menu")}
              title={t("open_menu")}
            >
              ≡
            </button>
            <div>
              <div className="text-lg font-semibold tracking-tight">{t("app_title")}</div>
              <div className="text-[11px] text-[var(--color-muted)]">
                {devices
                  ? t("devices_online", { online: onlineCount, total: devices.length })
                  : t("devices_loading")}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--color-muted)]">
              <span>{t("flespi")}</span>
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              {health && (
                <>
                  <span className="ml-1">{t("sipgate")}</span>
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      health.sipgate ? "bg-emerald-500" : "bg-gray-500"
                    }`}
                  />
                  {health.sipgateMode === "oauth" && !health.sipgate && (
                    <button
                      onClick={connectSipgate}
                      className="rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-white"
                    >
                      {t("connect")}
                    </button>
                  )}
                  {health.sipgateMode === "oauth" && health.sipgate && (
                    <button
                      onClick={disconnectSipgate}
                      className="rounded-lg border border-[var(--color-line)] px-2.5 py-1"
                    >
                      {t("disconnect")}
                    </button>
                  )}
                </>
              )}
              <div className="flex items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-1">
                {(["de", "en"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLanguage(value)}
                    className={`inline-flex h-7 min-w-8 items-center justify-center rounded-lg px-2 text-[11px] font-medium transition ${
                      language === value
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                    }`}
                    aria-label={t("language")}
                    title={value === "de" ? "DE" : "EN"}
                  >
                    {value === "de" ? "DE" : "EN"}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-1">
                {(["dark", "light"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTheme(value)}
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-sm transition ${
                      theme === value
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                    }`}
                    aria-label={t(value)}
                    title={t(value)}
                  >
                    {value === "dark" ? "◐" : "◌"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPrivacy((v) => !v)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm transition ${
                  privacy
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                }`}
                title={privacy ? "Privacy mode on — click to show data" : "Privacy mode off — click to blur sensitive data"}
              >
                {privacy ? "🙈" : "👁"}
              </button>
              <button
                type="button"
                onClick={() => setAutoRefresh((v) => !v)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm transition ${
                  autoRefresh
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                    : "border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                }`}
                title={autoRefresh ? "Auto-Refresh an (15s) — klicken zum Deaktivieren" : "Auto-Refresh aus — klicken zum Aktivieren"}
              >
                ↻
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Server neu starten?")) return;
                  await fetch("/api/server/restart", { method: "POST" });
                  await new Promise((r) => setTimeout(r, 4000));
                  refresh();
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
                title="Server neu starten"
              >
                ⟳ Restart
              </button>
            </div>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 bg-black/45"
            aria-label={t("close_menu")}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-[var(--color-line)] bg-[var(--color-bg)] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("menu")}</div>
                <div className="text-[11px] text-[var(--color-muted)]">
                  {t("devices")} & {t("settings")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] text-sm"
                aria-label={t("close_menu")}
                title={t("close_menu")}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {sidebarContent}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:items-start lg:grid-cols-[300px_minmax(0,1fr)]">
        {error && (
          <div className="rounded-2xl border border-red-700 bg-red-900/40 p-3 text-sm text-red-200 lg:col-span-2">
            {error}
          </div>
        )}

        <section className="hidden space-y-3 md:sticky md:top-28 md:block">
          {sidebarContent}
        </section>

        <section className="min-w-0">
          {selected && health ? (
            <DeviceDetail device={selected} health={health} />
          ) : (
            <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-sm text-[var(--color-muted)]">
              {t("no_selection")}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
