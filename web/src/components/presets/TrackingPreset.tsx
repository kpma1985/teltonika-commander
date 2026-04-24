import { useEffect, useMemo, useState } from "react";
import type { Health, PresetData } from "../../types";
import { ChannelPicker } from "./ChannelPicker";
import { Preview } from "./Preview";
import { SendButton } from "./SendButton";
import { DirectSmsPanel } from "./DirectSmsPanel";
import { useSender } from "./useSender";
import { useUi } from "../../ui";

type Props = {
  deviceId: number;
  health: Health;
  onSent: () => void;
  smsRecipient: string | null;
  onSaveRecipient: (value: string) => void;
};

const PRESETS = [
  { label: "Schnell", stopInterval: 60, movingInterval: 15 },
  { label: "Normal", stopInterval: 120, movingInterval: 30 },
  { label: "Sparsam", stopInterval: 300, movingInterval: 60 },
];

export const TrackingPreset = ({
  deviceId,
  health,
  onSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const { t } = useUi();
  const [stopInterval, setStopInterval] = useState(60);
  const [movingInterval, setMovingInterval] = useState(15);
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const { sending, result, error, send } = useSender(deviceId, onSent);

  useEffect(() => { setRecipient(smsRecipient ?? ""); }, [smsRecipient]);

  const data: PresetData = useMemo(
    () => ({ preset: "tracking", stopInterval, movingInterval }),
    [stopInterval, movingInterval]
  );

  const canSend = channel !== "direct" && (channel === "gprs" || recipient.length > 4);

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Tracking-Intervall</div>

      <div className="grid grid-cols-3 gap-1">
        {PRESETS.map((p) => {
          const active = stopInterval === p.stopInterval && movingInterval === p.movingInterval;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => { setStopInterval(p.stopInterval); setMovingInterval(p.movingInterval); }}
              className={`text-left text-xs px-3 py-2 rounded-lg border ${
                active
                  ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                  : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)]"
              }`}
            >
              <div className="font-medium">{p.label}</div>
              <div className="font-mono text-[10px] opacity-60">
                {p.movingInterval}s / {p.stopInterval}s
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="mb-1 text-[11px] text-[var(--color-muted)]">Bewegung (s)</div>
          <input
            name="tracking-moving"
            type="number"
            min={5}
            max={3600}
            value={movingInterval}
            onChange={(e) => setMovingInterval(Math.max(5, Number(e.target.value)))}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-mono"
          />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-[var(--color-muted)]">Parken (s)</div>
          <input
            name="tracking-stop"
            type="number"
            min={5}
            max={3600}
            value={stopInterval}
            onChange={(e) => setStopInterval(Math.max(5, Number(e.target.value)))}
            className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-mono"
          />
        </div>
      </div>

      <ChannelPicker
        variant="recipient-only"
        channel={channel}
        onChange={setChannel}
        recipient={recipient}
        onRecipientChange={setRecipient}
        sipgate={health.sipgate}
        savedRecipient={smsRecipient}
        onSaveRecipient={() => onSaveRecipient(recipient.trim())}
      />

      {channel !== "direct" && <Preview data={data} channel={channel} />}
      {channel === "direct" && <DirectSmsPanel data={data} recipient={recipient} />}

      <SendButton
        channel={channel}
        onChannelChange={setChannel}
        sipgate={health.sipgate}
        sending={sending}
        disabled={!canSend}
        error={error}
        result={result}
        label={t("send")}
        onClick={() => send(data, channel as "gprs" | "sms", channel === "sms" ? recipient : undefined)}
      />
    </div>
  );
};
