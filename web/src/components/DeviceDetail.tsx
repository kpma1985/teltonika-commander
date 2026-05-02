import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api";
import { TrackPanel } from "./TrackPanel";
import type { Device, DeviceDetail as Detail, Health } from "../types";
import { TELTONIKA_DEVICE_TYPES } from "../types";
import { BtObd2Preset } from "./presets/BtObd2Preset";
import { ApnPreset } from "./presets/ApnPreset";
import { ServerPreset } from "./presets/ServerPreset";
import { SettingsReadPreset } from "./presets/SettingsReadPreset";
import { StatusPreset } from "./presets/StatusPreset";
import { OutputsPreset } from "./presets/OutputsPreset";
import { RawPreset } from "./presets/RawPreset";
import { TrackingPreset } from "./presets/TrackingPreset";
import { HistoryPanel } from "./HistoryPanel";
import { AutoStatsPanel } from "./AutoStatsPanel";
import { ObdPanel } from "./ObdPanel";
import { DeviceConfigModal } from "./DeviceConfigModal";
import { Redacted, useUi } from "../ui";
import { normalizePhoneNumber } from "../lib/phone";
import {
  type DeviceConfig,
  type DeviceConfigReadProfile,
  type StoredDeviceConfig,
  deviceConfigIsEmpty,
  loadDeviceConfig,
  parseGetparamPayloads,
  saveDeviceConfig,
} from "../lib/deviceConfig";

type PresetTab =
  | "bt-obd2"
  | "apn"
  | "server"
  | "settings-read"
  | "status"
  | "tracking"
  | "outputs"
  | "raw";
type DetailSection = "stats" | "obd" | "forms" | "responses" | "history";
type PendingRead = {
  profile: DeviceConfigReadProfile;
  startedAt: number;
  expectedResults: number;
  lastResultAt: number | null;
};

const DETAIL_SECTIONS: DetailSection[] = [
  "stats",
  "obd",
  "forms",
  "responses",
  "history",
];

const DEFAULT_SECTIONS_OPEN: Record<DetailSection, boolean> = {
  stats: true,
  obd: true,
  forms: true,
  responses: true,
  history: true,
};

const SECTION_ORDER_STORAGE_KEY = "device-detail-section-order";
const SECTION_OPEN_STORAGE_KEY = "device-detail-sections-open";
const RESULTS_PAGE_SIZE = 10;
const READ_PROFILE_PARAM_COUNTS: Record<DeviceConfigReadProfile, number> = {
  apn: 5,
  server: 4,
  network: 9,  // 2000,2001,2002,2003,2004,2005,2006,2010,2016
};

const isDetailSection = (value: string): value is DetailSection =>
  DETAIL_SECTIONS.includes(value as DetailSection);

const readStoredSectionOrder = (): DetailSection[] => {
  if (typeof window === "undefined") return DETAIL_SECTIONS;

  try {
    const raw = window.localStorage.getItem(SECTION_ORDER_STORAGE_KEY);
    if (!raw) return DETAIL_SECTIONS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DETAIL_SECTIONS;
    const valid = parsed.filter((value): value is DetailSection =>
      typeof value === "string" && isDetailSection(value)
    );
    const missing = DETAIL_SECTIONS.filter((section) => !valid.includes(section));
    return valid.length > 0 ? [...valid, ...missing] : DETAIL_SECTIONS;
  } catch {
    return DETAIL_SECTIONS;
  }
};

const readStoredSectionsOpen = (): Record<DetailSection, boolean> => {
  if (typeof window === "undefined") return DEFAULT_SECTIONS_OPEN;

  try {
    const raw = window.localStorage.getItem(SECTION_OPEN_STORAGE_KEY);
    if (!raw) return DEFAULT_SECTIONS_OPEN;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_SECTIONS_OPEN;

    return DETAIL_SECTIONS.reduce<Record<DetailSection, boolean>>((acc, section) => {
      acc[section] =
        typeof (parsed as Record<string, unknown>)[section] === "boolean"
          ? ((parsed as Record<string, unknown>)[section] as boolean)
          : DEFAULT_SECTIONS_OPEN[section];
      return acc;
    }, { ...DEFAULT_SECTIONS_OPEN });
  } catch {
    return DEFAULT_SECTIONS_OPEN;
  }
};

type Props = { device: Device; health: Health };

export const DeviceDetail = ({ device, health }: Props) => {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<PresetTab>("status");
  const [refreshKey, setRefreshKey] = useState(0);
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [resultsOffset, setResultsOffset] = useState(0);
  const [sectionOrder, setSectionOrder] = useState<DetailSection[]>(readStoredSectionOrder);
  const [sectionsOpen, setSectionsOpen] =
    useState<Record<DetailSection, boolean>>(readStoredSectionsOpen);
  const [knownConfig, setKnownConfig] = useState<StoredDeviceConfig | null>(null);
  const [configVersion, setConfigVersion] = useState(0);
  const [pendingRead, setPendingRead] = useState<PendingRead | null>(null);
  const [modalConfig, setModalConfig] = useState<DeviceConfig | null>(null);
  const seenResultIds = useRef(new Set<string>());
  const pendingReadResultIds = useRef(new Set<string>());
  const pendingReadPayloads = useRef<string[]>([]);
  const { t } = useUi();

  const isTeltonika = TELTONIKA_DEVICE_TYPES.has(device.device_type_id);

  // knownConfig aus localStorage laden wenn Gerät wechselt
  useEffect(() => {
    seenResultIds.current.clear();
    pendingReadResultIds.current.clear();
    pendingReadPayloads.current = [];
    setPendingRead(null);
    setModalConfig(null);
    setKnownConfig(loadDeviceConfig(device.id));
  }, [device.id]);

  // Pending Read nach 3 Minuten automatisch löschen
  useEffect(() => {
    if (!pendingRead) return;
    const timer = window.setTimeout(() => setPendingRead(null), 3 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [pendingRead]);

  const finishPendingRead = () => {
    const parsed = parseGetparamPayloads(pendingReadPayloads.current);
    if (!deviceConfigIsEmpty(parsed)) setModalConfig(parsed);
    pendingReadResultIds.current.clear();
    pendingReadPayloads.current = [];
    setPendingRead(null);
  };

  // Wenn nicht alle Antworten einzeln sichtbar werden, trotzdem nach kurzer Ruhephase auswerten.
  useEffect(() => {
    if (!pendingRead?.lastResultAt) return;
    const timer = window.setTimeout(finishPendingRead, 5000);
    return () => window.clearTimeout(timer);
  }, [pendingRead?.lastResultAt]);

  // Getparam-Antworten beobachten und Modal auslösen
  useEffect(() => {
    if (!detail?.results || !pendingRead) return;

    const getparamResults = detail.results.filter((r) => {
      const cmd = (r.properties?.text ?? r.properties?.payload) as string | undefined;
      const payload = r.response?.payload as string | undefined;
      return (
        ((typeof cmd === "string" && cmd.includes("getparam")) ||
          (typeof payload === "string" && /Param\s+ID\s*:|^\s*\d{3,5}\s*[:=]/im.test(payload))) &&
        r.executed?.timestamp != null &&
        r.executed.timestamp >= pendingRead.startedAt - 15
      );
    });

    const fresh = getparamResults.filter(
      (r) => !pendingReadResultIds.current.has(String(r.id))
    );
    if (fresh.length === 0) return;

    for (const r of fresh) {
      const id = String(r.id);
      seenResultIds.current.add(id);
      pendingReadResultIds.current.add(id);
    }

    const payloads = fresh
      .map((r) => r.response?.payload as string | undefined)
      .filter((p): p is string => typeof p === "string");
    pendingReadPayloads.current.push(...payloads);

    const parsed = parseGetparamPayloads(pendingReadPayloads.current);
    if (
      !deviceConfigIsEmpty(parsed) &&
      pendingReadResultIds.current.size >= pendingRead.expectedResults
    ) {
      finishPendingRead();
      return;
    }

    setPendingRead((current) =>
      current ? { ...current, lastResultAt: Date.now() / 1000 } : current
    );
  }, [detail?.results, pendingRead]);

  const loadDetail = () => {
    let cancelled = false;
    setErr(null);
    api
      .device(device.id, { resultsCount: RESULTS_PAGE_SIZE, resultsOffset })
      .then((d) => !cancelled && setDetail(d))
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    setDetail(null);
    setErr(null);
    setResultsOffset(0);
  }, [device.id]);

  useEffect(() => {
    const cleanup = loadDetail();
    return cleanup;
  }, [device.id, refreshKey, resultsOffset]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [device.id]);

  useEffect(() => {
    window.localStorage.setItem(SECTION_ORDER_STORAGE_KEY, JSON.stringify(sectionOrder));
  }, [sectionOrder]);

  useEffect(() => {
    window.localStorage.setItem(SECTION_OPEN_STORAGE_KEY, JSON.stringify(sectionsOpen));
  }, [sectionsOpen]);

  const onCommandSent = () => {
    setRefreshKey((k) => k + 1);
    window.setTimeout(() => setRefreshKey((k) => k + 1), 3500);
  };

  const onReadSent = (
    channel: "gprs" | "sms",
    profile: DeviceConfigReadProfile
  ) => {
    if (channel === "gprs") {
      pendingReadResultIds.current.clear();
      pendingReadPayloads.current = [];
      setPendingRead({
        profile,
        startedAt: Date.now() / 1000,
        expectedResults: READ_PROFILE_PARAM_COUNTS[profile],
        lastResultAt: null,
      });
    }
  };

  const applyModalConfig = () => {
    if (!modalConfig) return;
    const next: StoredDeviceConfig = { config: modalConfig, savedAt: Date.now() };
    saveDeviceConfig(device.id, modalConfig);
    setKnownConfig(next);
    setConfigVersion((v) => v + 1);
    setModalConfig(null);
  };

  const saveRecipient = async (value: string) => {
    setSavingRecipient(true);
    try {
      const normalized = normalizePhoneNumber(value);
      await api.updateDeviceSettings(device.id, {
        smsRecipient: normalized || null,
      });
      setRefreshKey((k) => k + 1);
    } finally {
      setSavingRecipient(false);
    }
  };

  const tabs: Array<{ key: PresetTab; label: string }> = [
    { key: "status", label: t("tab_status") },
    { key: "bt-obd2", label: t("tab_bt_obd2") },
    { key: "apn", label: t("tab_apn") },
    { key: "server", label: t("tab_server") },
    { key: "settings-read", label: t("tab_settings_read") },
    { key: "tracking", label: "Tracking" },
    { key: "outputs", label: t("tab_outputs") },
    { key: "raw", label: t("tab_raw") },
  ];

  const toggleSection = (section: DetailSection) => {
    setSectionsOpen((current) => ({ ...current, [section]: !current[section] }));
  };

  const moveSection = (section: DetailSection, direction: "up" | "down") => {
    setSectionOrder((current) => {
      const index = current.indexOf(section);
      if (index === -1) return current;
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const currentItem = next[index];
      const targetItem = next[target];
      if (!currentItem || !targetItem) return current;
      next[index] = targetItem;
      next[target] = currentItem;
      return next;
    });
  };

  const telemetry = detail?.telemetry;
  const sortedResults = detail?.results
    ? [...detail.results].sort((a, b) => {
        const aTime = a.executed?.timestamp ?? a.timestamp ?? 0;
        const bTime = b.executed?.timestamp ?? b.timestamp ?? 0;
        return bTime - aTime;
      })
    : [];
  const battery = telemetry?.["battery.level"]?.value;
  const gsm = telemetry?.["gsm.signal.level"]?.value;
  const lastSeen = telemetry?.timestamp?.ts ?? telemetry?.["server.timestamp"]?.ts;
  const movement = telemetry?.["movement.status"]?.value;
  const movementChangedAt = telemetry?.["movement.status"]?.ts;
  const position = telemetry?.position?.value as
    | { latitude?: number; longitude?: number; satellites?: number; speed?: number }
    | undefined;
  const lat = typeof position?.latitude === "number" ? position.latitude : null;
  const lon = typeof position?.longitude === "number" ? position.longitude : null;
  const online = detail?.device.online ?? device.online;

  const statCards = [
    {
      label: "Status",
      value: online ? t("online") : t("offline"),
    },
    {
      label: t("battery"),
      value: typeof battery === "number" ? `${battery}%` : "—",
    },
    {
      label: t("gsm"),
      value: typeof gsm === "number" ? `${gsm}` : "—",
    },
    {
      label: t("satellites"),
      value: typeof position?.satellites === "number" ? `${position.satellites}` : "—",
    },
    {
      label: t("last_signal"),
      value: lastSeen ? new Date(lastSeen * 1000).toLocaleString() : "—",
    },
    {
      label: t("movement"),
      value:
        typeof movement === "boolean"
          ? movement
            ? t("yes")
            : t("no")
          : "—",
    },
  ];

  const renderSectionShell = (
    section: DetailSection,
    title: string,
    content: ReactNode,
    headerExtra?: ReactNode
  ) => {
    const index = sectionOrder.indexOf(section);
    const isOpen = sectionsOpen[section];
    return (
      <div key={section} className="bg-[var(--color-panel)] border border-[var(--color-line)] rounded-xl">
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-3 py-3">
          <button
            type="button"
            onClick={() => toggleSection(section)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
          >
            <div className="text-sm font-medium">{title}</div>
            <span className="text-[var(--color-muted)]">{isOpen ? "-" : "+"}</span>
          </button>
          {headerExtra}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={index <= 0}
              onClick={() => moveSection(section, "up")}
              className="rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] disabled:opacity-35"
              aria-label={`${title} up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={index === -1 || index >= sectionOrder.length - 1}
              onClick={() => moveSection(section, "down")}
              className="rounded-md border border-[var(--color-line)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)] disabled:opacity-35"
              aria-label={`${title} down`}
              title="Move down"
            >
              ↓
            </button>
          </div>
        </div>
        {isOpen && <div className="p-3">{content}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {modalConfig && (
        <DeviceConfigModal
          config={modalConfig}
          onApply={applyModalConfig}
          onDismiss={() => setModalConfig(null)}
        />
      )}
      <div className="bg-[var(--color-panel)] border border-[var(--color-line)] rounded-xl p-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className="font-medium">{device.name}</div>
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  online ? "bg-green-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                {online ? t("online") : t("offline")}
              </span>
            </div>
            <div className="text-xs text-[var(--color-muted)] mt-0.5 font-mono">
              {t("imei")} {device.ident ? <Redacted value={device.ident} /> : "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-[var(--color-muted)]">{t("type")} {device.device_type_id}</div>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
            >
              {t("refresh")}
            </button>
          </div>
        </div>
        {!isTeltonika && (
          <div className="mt-2 text-xs text-green-300 bg-green-950/40 border border-green-800/60 rounded-lg p-2">
            Unbekannter Gerätetyp — Presets sind für Teltonika-Geräte. Rohe Kommandos funktionieren nur, wenn das Protokoll des Geräts sie unterstützt.
          </div>
        )}
        {err && <div className="mt-2 text-xs text-red-300">{err}</div>}
        {detail && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {statCards.map((card) => (
              <div
                key={card.label}
                className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
              >
                <div className="text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                  {card.label}
                </div>
                <div className="mt-1 text-sm font-medium">{card.value}</div>
              </div>
            ))}
          </div>
        )}
        {position && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-[var(--color-muted)]">
              {t("stats_position")}{" "}
              <Redacted value={`${position.latitude ?? "—"}, ${position.longitude ?? "—"}`} />
              {" "}| {t("speed")} {position.speed ?? "—"} km/h
            </div>
            <TrackPanel
              deviceId={device.id}
              deviceName={device.name}
              currentLat={lat}
              currentLon={lon}
              refreshKey={refreshKey}
              online={online}
            />
            {movementChangedAt && (
              <div
                title={`${t("movement_changed_title")}: ${new Date(movementChangedAt * 1000).toLocaleString()}`}
                className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] w-fit"
              >
                {t("last_movement_change")}{" "}
                {new Date(movementChangedAt * 1000).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {sectionOrder.map((section) => {
        if (section === "stats" && detail) {
          return renderSectionShell(
            "stats",
            t("auto_stats"),
            <AutoStatsPanel telemetry={detail.telemetry} showHeader={false} />
          );
        }
        if (section === "obd" && detail) {
          return renderSectionShell(
            "obd",
            t("obd_ready"),
            <ObdPanel telemetry={detail.telemetry} showHeader={false} />
          );
        }
        if (section === "forms") {
          return renderSectionShell(
            "forms",
            t("forms"),
            <>
              <div className="no-scrollbar flex gap-1 flex-wrap rounded-xl bg-[var(--color-bg)] p-1">
                {tabs.map((tItem) => (
                  <button
                    key={tItem.key}
                    onClick={() => setTab(tItem.key)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      tab === tItem.key
                        ? "bg-[var(--color-accent)] text-white"
                        : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
                    }`}
                  >
                    {tItem.label}
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-4">
                {tab === "status" && (
                  <StatusPreset
                    deviceId={device.id}
                    health={health}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                  />
                )}
                {tab === "bt-obd2" && (
                  <BtObd2Preset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                  />
                )}
                {tab === "apn" && (
                  <ApnPreset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                    knownConfig={knownConfig?.config ?? null}
                    configVersion={configVersion}
                  />
                )}
                {tab === "outputs" && (
                  <OutputsPreset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                  />
                )}
                {tab === "server" && (
                  <ServerPreset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                    knownConfig={knownConfig?.config ?? null}
                    configVersion={configVersion}
                  />
                )}
                {tab === "settings-read" && (
                  <SettingsReadPreset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                    onReadSent={onReadSent}
                  />
                )}
                {tab === "tracking" && (
                  <TrackingPreset
                    deviceId={device.id}
                    health={health}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                  />
                )}
                {tab === "raw" && (
                  <RawPreset
                    deviceId={device.id}
                    sipgate={health.sipgate}
                    onSent={onCommandSent}
                    smsRecipient={detail?.smsRecipient ?? null}
                    onSaveRecipient={saveRecipient}
                  />
                )}
                {savingRecipient && (
                  <div className="mt-3 text-xs text-[var(--color-muted)]">{t("sending")}</div>
                )}
              </div>
            </>
          );
        }
        if (section === "responses" && detail && detail.results.length > 0) {
          return renderSectionShell(
            "responses",
            t("latest_responses"),
            <>
              <div className="space-y-2">
                {sortedResults.map((r, idx) => {
                  const payload = (r.response?.payload as string | undefined) ?? "—";
                  const ts = r.executed?.timestamp
                    ? new Date(r.executed.timestamp * 1000).toLocaleString()
                    : "pending";
                  return (
                    <div
                      key={`${r.id}-${idx}`}
                      className="bg-[var(--color-panel-2)] rounded-lg p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 text-[var(--color-muted)]">
                        <span>{ts}</span>
                        <span className="font-mono text-[11px]">
                          {(r.properties?.text as string | undefined) ?? r.name}
                        </span>
                      </div>
                      <div className="font-mono mt-1 break-all">{payload}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={resultsOffset === 0}
                  onClick={() => setResultsOffset((v) => Math.max(0, v - RESULTS_PAGE_SIZE))}
                  className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] disabled:opacity-40"
                >
                  {t("previous")}
                </button>
                <div className="text-[11px] text-[var(--color-muted)]">
                  {t("page")} {Math.floor(resultsOffset / RESULTS_PAGE_SIZE) + 1}
                </div>
                <button
                  type="button"
                  disabled={
                    (detail.results?.length ?? 0) < RESULTS_PAGE_SIZE ||
                    (detail.resultsTotal ?? 0) <= resultsOffset + RESULTS_PAGE_SIZE
                  }
                  onClick={() => setResultsOffset((v) => v + RESULTS_PAGE_SIZE)}
                  className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] disabled:opacity-40"
                >
                  {t("next")}
                </button>
              </div>
            </>
          );
        }
        if (section === "history") {
          const archiveBtn = (
            <button
              type="button"
              onClick={() => {
                if (!confirm("Kommando-History löschen?")) return;
                api.clearHistory(device.id).then(() => setRefreshKey((k) => k + 1));
              }}
              className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-muted)] hover:border-red-700 hover:text-red-400 transition-colors"
              title="History löschen"
            >
              Leeren
            </button>
          );
          return renderSectionShell(
            "history",
            t("command_history"),
            <HistoryPanel deviceId={device.id} refreshKey={refreshKey} showHeader={false} />,
            archiveBtn
          );
        }
        return null;
      })}
    </div>
  );
};
