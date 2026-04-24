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

export const StatusPreset = ({
  deviceId,
  health,
  onSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const { t } = useUi();
  const [key, setKey] = useState<string>(health.statusCommands[0]?.key ?? "getinfo");
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const { sending, result, error, send } = useSender(deviceId, onSent);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  const data: PresetData = useMemo(() => ({ preset: "status", key }), [key]);
  const canSend = channel !== "direct" && (channel === "gprs" || recipient.length > 4);

  return (
      <div className="space-y-4">
      <div className="text-sm font-medium">{t("status_query")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">
        {t("status_hint")}
      </div>

      <div className="grid grid-cols-2 gap-1">
        {health.statusCommands.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setKey(c.key)}
            className={`text-left text-xs px-3 py-2 rounded-lg border ${
              key === c.key
                ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
            }`}
          >
            <div className="font-medium">{c.label}</div>
            <div className="font-mono text-[10px] opacity-50">{c.key}</div>
          </button>
        ))}
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
        onClick={() =>
          send(data, channel as "gprs" | "sms", channel === "sms" ? recipient : undefined)
        }
      />
    </div>
  );
};
