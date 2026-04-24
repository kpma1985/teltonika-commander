import { useEffect, useMemo, useState } from "react";
import type { PresetData } from "../../types";
import { ChannelPicker } from "./ChannelPicker";
import { Preview } from "./Preview";
import { SendButton } from "./SendButton";
import { DirectSmsPanel } from "./DirectSmsPanel";
import { useSender } from "./useSender";

type Props = {
  deviceId: number;
  sipgate: boolean;
  onSent: () => void;
  smsRecipient: string | null;
  onSaveRecipient: (value: string) => void;
};

type OutBit = "0" | "1" | "?";

export const OutputsPreset = ({
  deviceId,
  sipgate,
  onSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const [dout1, setDout1] = useState<OutBit>("?");
  const [dout2, setDout2] = useState<OutBit>("?");
  const [t1, setT1] = useState("0");
  const [t2, setT2] = useState("0");
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const [rawCmd, setRawCmd] = useState<"setdigout" | "cpureset" | "defaultcfg">(
    "setdigout"
  );
  const { sending, result, error, send } = useSender(deviceId, onSent);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  const data: PresetData = useMemo(() => {
    if (rawCmd === "cpureset") return { preset: "raw", payload: "cpureset" };
    if (rawCmd === "defaultcfg") return { preset: "raw", payload: "defaultcfg" };
    return {
      preset: "outputs",
      states: `${dout1}${dout2}`,
      t1: Number(t1) || 0,
      t2: Number(t2) || 0,
    };
  }, [rawCmd, dout1, dout2, t1, t2]);

  const canSend = channel !== "direct" && (channel === "gprs" || recipient.length > 4);

  const BitSel = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: OutBit;
    onChange: (v: OutBit) => void;
  }) => (
    <div>
      <div className="text-xs text-[var(--color-muted)] mb-1">{label}</div>
      <div className="flex gap-1">
        {(["1", "0", "?"] as OutBit[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 text-sm py-1.5 rounded-lg border ${
              value === v
                ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            {v === "?" ? "—" : v === "1" ? "on" : "off"}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">Outputs / Reset</div>

      <div className="flex gap-1">
        {(["setdigout", "cpureset", "defaultcfg"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRawCmd(k)}
            className={`flex-1 text-xs py-1.5 rounded-lg border ${
              rawCmd === k
                ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      {rawCmd === "setdigout" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <BitSel label="DOUT1" value={dout1} onChange={setDout1} />
            <BitSel label="DOUT2" value={dout2} onChange={setDout2} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <div className="text-xs text-[var(--color-muted)] mb-1">Timer DOUT1 (s)</div>
              <input
                value={t1}
                onChange={(e) => setT1(e.target.value)}
                inputMode="numeric"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <div className="text-xs text-[var(--color-muted)] mb-1">Timer DOUT2 (s)</div>
              <input
                value={t2}
                onChange={(e) => setT2(e.target.value)}
                inputMode="numeric"
                className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="text-xs text-green-200 bg-green-950/30 border border-green-800/50 rounded-lg p-2">
            Achtung: DOUT1 wird z.B. für Zündunterbrechung/Motorblockierung
            genutzt. Nicht während der Fahrt schalten.
          </div>
        </>
      )}

      {rawCmd === "defaultcfg" && (
        <div className="text-xs text-red-300 bg-red-900/20 border border-red-700 rounded-lg p-2">
          <code className="font-mono">defaultcfg</code> setzt die gesamte
          Konfiguration auf Werkszustand zurück (auch APN!).
        </div>
      )}

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
{channel === "direct" && <DirectSmsPanel data={data} recipient={recipient} />}

      <SendButton
        channel={channel}
        onChannelChange={setChannel}
        sipgate={sipgate}
        sending={sending}
        disabled={!canSend}
        error={error}
        result={result}
        onClick={() => send(data, channel as "gprs" | "sms", channel === "sms" ? recipient : undefined)}
      />
    </div>
  );
};
