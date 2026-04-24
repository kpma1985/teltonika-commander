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

export const RawPreset = ({
  deviceId,
  sipgate,
  onSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const { t } = useUi();
  const [payload, setPayload] = useState("");
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const { sending, result, error, send } = useSender(deviceId, onSent);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  const trimmed = payload.trim();
  const data: PresetData | null = useMemo(() => {
    if (!trimmed) return null;
    return { preset: "raw", payload: trimmed };
  }, [trimmed]);

  const canSend =
    trimmed.length > 0 && (channel !== "direct" && (channel === "gprs" || recipient.length > 4));

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("raw_title")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">
        {t("raw_hint")}
      </div>

      <label className="block">
        <div className="text-xs text-[var(--color-muted)] mb-1">Kommando</div>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={4}
          placeholder="getinfo"
          className="w-full resize-y bg-[var(--color-bg)] border border-[var(--color-line)] rounded-lg px-3 py-2 text-sm font-mono"
        />
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
{channel === "direct" && <DirectSmsPanel data={data} recipient={recipient} />}

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
