import { useEffect, useMemo, useRef, useState } from "react";
import type { PresetData } from "../../types";
import type { DeviceConfig } from "../../lib/deviceConfig";
import { apnDiffersFromConfig } from "../../lib/deviceConfig";
import { ChannelPicker } from "./ChannelPicker";
import { Preview } from "./Preview";
import { SendButton } from "./SendButton";
import { DirectSmsPanel } from "./DirectSmsPanel";
import { useSender } from "./useSender";
import { useUi } from "../../ui";

type Props = {
  deviceId: number;
  sipgate: boolean;
  onSent: () => void;
  smsRecipient: string | null;
  onSaveRecipient: (value: string) => void;
  knownConfig?: DeviceConfig | null;
  configVersion?: number;
};

type ApnPresetItem = {
  name: string;
  group: "de" | "eu" | "iot";
  apn: string;
  user?: string;
  pass?: string;
  auth?: "pap" | "chap";
};

const APN_PRESETS: ApnPresetItem[] = [
  { name: "Telekom", group: "de", apn: "internet.t-mobile", user: "t-mobile", pass: "tm" },
  { name: "Congstar", group: "de", apn: "internet.t-mobile", user: "t-mobile", pass: "tm" },
  { name: "ja! mobil", group: "de", apn: "internet.t-mobile", user: "tm", pass: "tm" },
  { name: "PENNY Mobil", group: "de", apn: "internet.t-mobile", user: "tm", pass: "tm" },
  { name: "Vodafone", group: "de", apn: "web.vodafone.de" },
  { name: "Lidl Connect", group: "de", apn: "web.vodafone.de" },
  { name: "O2", group: "de", apn: "internet" },
  { name: "Aldi Talk", group: "de", apn: "internet.eplus.de", user: "eplus", pass: "gprs" },
  { name: "1&1", group: "de", apn: "web.vodafone.de" },
  { name: "EDEKA smart", group: "de", apn: "internet.access" },
  { name: "Sipgate", group: "de", apn: "sipgate.de", user: "sipgate", pass: "sipgate" },
  { name: "Orange", group: "eu", apn: "orange" },
  { name: "TIM", group: "eu", apn: "ibox.tim.it" },
  { name: "A1", group: "eu", apn: "A1.net" },
  { name: "EMnify", group: "iot", apn: "em", user: "em", pass: "em" },
  { name: "1NCE", group: "iot", apn: "iot.1nce.net" },
  { name: "Wireless Logic", group: "iot", apn: "wirelesslogic" },
];

const GROUPS: Array<{ key: ApnPresetItem["group"] | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "de", label: "DE" },
  { key: "eu", label: "EU" },
  { key: "iot", label: "IoT" },
];

const CUSTOM_STORAGE_KEY = "apn-custom-presets";
const loadCustomPresets = (): ApnPresetItem[] => {
  try { return JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) ?? "[]"); } catch { return []; }
};
const saveCustomPresets = (presets: ApnPresetItem[]) =>
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(presets));

export const ApnPreset = ({
  deviceId,
  sipgate,
  onSent,
  smsRecipient,
  onSaveRecipient,
  knownConfig,
  configVersion,
}: Props) => {
  const { t } = useUi();
  const [apn, setApn] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<"pap" | "chap">("pap");
  const [group, setGroup] = useState<(typeof GROUPS)[number]["key"]>("de");
  const [customPresets, setCustomPresets] = useState<ApnPresetItem[]>(loadCustomPresets);
  const [addingCustom, setAddingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("sms");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const { sending, result, error, send } = useSender(deviceId, onSent);
  const prefilled = useRef(false);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  // Beim ersten Laden vorausfüllen (wenn Felder noch leer)
  useEffect(() => {
    if (prefilled.current || !knownConfig) return;
    if (apn || user || password) return;
    prefilled.current = true;
    if (knownConfig.apn !== undefined) setApn(knownConfig.apn);
    if (knownConfig.apnUser !== undefined) setUser(knownConfig.apnUser);
    if (knownConfig.apnPassword !== undefined) setPassword(knownConfig.apnPassword);
    if (knownConfig.apnAuth !== undefined) setAuth(knownConfig.apnAuth);
  }, [knownConfig]);

  // Nach Modal-Bestätigung (configVersion steigt) Werte sofort übernehmen
  useEffect(() => {
    if (!configVersion || !knownConfig) return;
    if (knownConfig.apn !== undefined) setApn(knownConfig.apn);
    if (knownConfig.apnUser !== undefined) setUser(knownConfig.apnUser);
    if (knownConfig.apnPassword !== undefined) setPassword(knownConfig.apnPassword);
    if (knownConfig.apnAuth !== undefined) setAuth(knownConfig.apnAuth);
  }, [configVersion]);

  const hasDiff =
    !!knownConfig && apnDiffersFromConfig(apn, user, password, auth, knownConfig);

  const visiblePresets = APN_PRESETS.filter((preset) => group === "all" || preset.group === group);
  const valid = apn.trim().length > 0 && apn.trim().length <= 63;
  const canSend = valid && (channel !== "direct" && (channel === "gprs" || recipient.length > 4));

  const data: PresetData | null = useMemo(() => {
    if (!valid) return null;
    const preset: PresetData = { preset: "apn", apn: apn.trim(), auth };
    if (user) preset.user = user;
    if (password) preset.password = password;
    return preset;
  }, [apn, user, password, auth, valid]);

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("apn_set")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">{t("apn_hint")}</div>
      {knownConfig?.apn !== undefined && !hasDiff && (
        <div className="text-xs text-emerald-400">{t("device_config_matches")}</div>
      )}
      {hasDiff && (
        <div className="text-xs text-amber-400">{t("device_config_mismatch")}</div>
      )}

      <div className="flex flex-wrap gap-1">
        {GROUPS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setGroup(item.key)}
            className={`rounded-lg border px-2.5 py-1 text-xs ${
              group === item.key
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1">
        {[...visiblePresets, ...customPresets].map((preset) => (
          <button
            key={`${preset.group}-${preset.name}`}
            type="button"
            onClick={() => {
              setApn(preset.apn);
              setUser(preset.user ?? "");
              setPassword(preset.pass ?? "");
              setAuth(preset.auth ?? "pap");
            }}
            className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)] transition-colors"
          >
            {preset.name}
          </button>
        ))}
        {addingCustom ? (
          <div className="flex gap-1">
            <input
              name="apn-custom-name"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Name"
              autoFocus
              className="w-24 rounded-lg border border-[var(--color-accent)] bg-[var(--color-bg)] px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                if (!customName.trim() || !apn.trim()) return;
                const entry: ApnPresetItem = { name: customName.trim(), group: "de", apn: apn.trim(), user: user || undefined, pass: password || undefined };
                const updated = [...customPresets, entry];
                setCustomPresets(updated);
                saveCustomPresets(updated);
                setAddingCustom(false);
                setCustomName("");
              }}
              className="rounded-lg border border-[var(--color-accent)] px-2 py-1 text-xs text-[var(--color-accent)]"
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => { setAddingCustom(false); setCustomName(""); }}
              className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-muted)]"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="rounded-lg border border-dashed border-[var(--color-line)] px-2 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            + Eigener
          </button>
        )}
      </div>

      <label className="block">
        <div className="mb-1 text-xs text-[var(--color-muted)]">APN</div>
        <input
          value={apn}
          onChange={(e) => setApn(e.target.value)}
          placeholder="internet.t-mobile"
          autoCapitalize="off"
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <div className="mb-1 text-xs text-[var(--color-muted)]">{t("apn_user")}</div>
          <input
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-[var(--color-muted)]">{t("apn_password")}</div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div>
        <div className="mb-1 text-xs text-[var(--color-muted)]">{t("apn_auth")}</div>
        <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-1">
          {(["pap", "chap"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAuth(value)}
              className={`rounded-lg px-3 py-2 text-sm ${
                auth === value
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-panel)]"
              }`}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <ChannelPicker
        variant="recipient-only"
        channel={channel}
        onChange={setChannel}
        recipient={recipient}
        onRecipientChange={setRecipient}
        sipgate={sipgate}
        savedRecipient={smsRecipient}
        onSaveRecipient={() => onSaveRecipient(recipient.trim())}
      />

      {channel !== "direct" && <Preview data={data} channel={channel} />}
      {channel === "direct" && (
        <DirectSmsPanel data={data} recipient={recipient} />
      )}


      <SendButton
        channel={channel}
        onChannelChange={setChannel}
        sipgate={sipgate}
        sending={sending}
        disabled={!canSend}
        error={error}
        result={result}
        label={t("send")}
        onClick={() =>
          data && send(data, channel as "gprs" | "sms", channel === "sms" ? recipient : undefined)
        }
      />
    </div>
  );
};
