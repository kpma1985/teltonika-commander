import { useEffect, useMemo, useRef, useState } from "react";
import type { PresetData } from "../../types";
import type { DeviceConfig } from "../../lib/deviceConfig";
import { serverDiffersFromConfig } from "../../lib/deviceConfig";
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

export const ServerPreset = ({
  deviceId,
  sipgate,
  onSent,
  smsRecipient,
  onSaveRecipient,
  knownConfig,
  configVersion,
}: Props) => {
  const { t } = useUi();
  const [domain, setDomain] = useState("");
  const [port, setPort] = useState("12050");
  const [protocol, setProtocol] = useState<"tcp" | "udp">("tcp");
  const [enableGprs, setEnableGprs] = useState(true);
  const [reset, setReset] = useState(true);
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
    if (domain) return;
    prefilled.current = true;
    if (knownConfig.domain !== undefined) setDomain(knownConfig.domain);
    if (knownConfig.port !== undefined) setPort(String(knownConfig.port));
    if (knownConfig.protocol !== undefined) setProtocol(knownConfig.protocol);
  }, [knownConfig]);

  // Nach Modal-Bestätigung (configVersion steigt) Werte sofort übernehmen
  useEffect(() => {
    if (!configVersion || !knownConfig) return;
    if (knownConfig.domain !== undefined) setDomain(knownConfig.domain);
    if (knownConfig.port !== undefined) setPort(String(knownConfig.port));
    if (knownConfig.protocol !== undefined) setProtocol(knownConfig.protocol);
  }, [configVersion]);

  const hasDiff =
    !!knownConfig && serverDiffersFromConfig(domain, port, protocol, knownConfig);

  const parsedPort = Number(port);
  const valid =
    domain.trim().length > 0 &&
    Number.isInteger(parsedPort) &&
    parsedPort > 0 &&
    parsedPort <= 65535;
  const canSend = valid && (channel !== "direct" && (channel === "gprs" || recipient.length > 4));

  const data: PresetData | null = useMemo(() => {
    if (!valid) return null;
    return {
      preset: "server",
      domain: domain.trim(),
      port: parsedPort,
      protocol,
      enableGprs,
      reset,
    };
  }, [domain, parsedPort, protocol, enableGprs, reset, valid]);

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("server_setup")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">{t("server_setup_hint")}</div>
      {knownConfig?.domain !== undefined && !hasDiff && (
        <div className="text-xs text-emerald-400">{t("device_config_matches")}</div>
      )}
      {hasDiff && (
        <div className="text-xs text-amber-400">{t("device_config_mismatch")}</div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs text-[var(--color-muted)]">{t("server_domain")}</div>
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="example.server.tld"
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono"
          />
        </label>
        <label className="block">
          <div className="mb-1 text-xs text-[var(--color-muted)]">{t("server_port")}</div>
          <input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-xs text-[var(--color-muted)]">{t("server_protocol")}</div>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-soft)] p-1">
            {(["tcp", "udp"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setProtocol(value)}
                className={`rounded-lg px-2 py-2 text-sm ${
                  protocol === value
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-panel)]"
                }`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => setEnableGprs((value) => !value)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${
              enableGprs
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            {t("gprs_context")} {enableGprs ? t("on") : t("off")}
          </button>
          <button
            type="button"
            onClick={() => setReset((value) => !value)}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${
              reset
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            CPU reset {reset ? t("on") : t("off")}
          </button>
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
