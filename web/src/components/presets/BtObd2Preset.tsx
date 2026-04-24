import { useEffect, useMemo, useState } from "react";
import type { PresetData } from "../../types";
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
};

const normalizeMac = (v: string): string =>
  v.replace(/[^0-9A-Fa-f]/g, "").toUpperCase().slice(0, 12);

export const BtObd2Preset = ({
  deviceId,
  sipgate,
  onSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const { t } = useUi();
  const [mac, setMac] = useState("");
  const [pin, setPin] = useState("1234");
  const [externalName, setExternalName] = useState("");
  const [reset, setReset] = useState(true);
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const { sending, result, error, send } = useSender(deviceId, onSent);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  const macClean = normalizeMac(mac);
  const macValid = macClean.length === 12;
  const pinValid = /^[0-9]{1,8}$/.test(pin);
  const canSend =
    macValid && pinValid && (channel !== "direct" && (channel === "gprs" || recipient.length > 4));

  const data: PresetData | null = useMemo(() => {
    if (!macValid || !pinValid) return null;
    const d: PresetData = {
      preset: "bt-obd2",
      mac: macClean,
      pin,
      reset,
    };
    if (externalName) (d as { externalName?: string }).externalName = externalName;
    return d;
  }, [macClean, pin, externalName, reset, macValid, pinValid]);

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("bt_obd2_title")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">
        {t("bt_obd2_hint")}
      </div>
      <div className="text-xs text-green-100 bg-green-950/30 border border-green-800/50 rounded-lg p-2">
        {t("bt_obd2_prep")}
      </div>

      <label className="block">
        <div className="text-xs text-[var(--color-muted)] mb-1">OBD2 MAC-Adresse</div>
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          placeholder="AA:BB:CC:11:22:33"
          autoCapitalize="characters"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm font-mono"
        />
        {!macValid && mac.length > 0 && (
          <div className="text-xs text-green-500 mt-1">
            {macClean.length}/12 Hex — Doppelpunkte werden automatisch entfernt.
          </div>
        )}
      </label>

      <label className="block">
        <div className="text-xs text-[var(--color-muted)] mb-1">OBD2 PIN</div>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="1234"
          inputMode="numeric"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <div className="text-xs text-[var(--color-muted)] mb-1">
          Externer Name (optional)
        </div>
        <input
          value={externalName}
          onChange={(e) => setExternalName(e.target.value)}
          placeholder="z.B. OBDII"
          className="w-full bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={reset}
          onChange={(e) => setReset(e.target.checked)}
        />
        anschließend <code className="font-mono">cpureset</code>
      </label>

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
