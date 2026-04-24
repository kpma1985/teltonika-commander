import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  onReadSent?: (
    channel: "gprs" | "sms",
    profile: (typeof profiles)[number]
  ) => void;
  smsRecipient: string | null;
  onSaveRecipient: (value: string) => void;
};

const profiles = ["apn", "server", "network"] as const;

export const SettingsReadPreset = ({
  deviceId,
  sipgate,
  onSent,
  onReadSent,
  smsRecipient,
  onSaveRecipient,
}: Props) => {
  const { t } = useUi();
  const [profile, setProfile] = useState<(typeof profiles)[number]>("network");
  const [channel, setChannel] = useState<"gprs" | "sms" | "direct">("gprs");
  const [recipient, setRecipient] = useState(smsRecipient ?? "");
  const pendingChannelRef = useRef<"gprs" | "sms" | null>(null);

  const handleSent = useCallback(() => {
    onSent();
    if (pendingChannelRef.current) {
      onReadSent?.(pendingChannelRef.current, profile);
      pendingChannelRef.current = null;
    }
  }, [onSent, onReadSent, profile]);

  const { sending, result, error, send } = useSender(deviceId, handleSent);

  useEffect(() => {
    setRecipient(smsRecipient ?? "");
  }, [smsRecipient]);

  const data: PresetData = useMemo(
    () => ({ preset: "settings-read", profile }),
    [profile]
  );

  const canSend =
    channel === "gprs" || channel === "direct" || recipient.trim().length > 4;

  return (
    <div className="space-y-4">
      <div className="text-sm font-medium">{t("settings_read")}</div>
      <div className="text-xs text-[var(--color-muted)] -mt-2">
        {t("settings_read_hint")}
      </div>

      <div className="grid grid-cols-3 gap-1">
        {profiles.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setProfile(value)}
            className={`rounded-lg border px-2.5 py-2 text-xs font-medium ${
              profile === value
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-[var(--color-line)] text-[var(--color-muted)]"
            }`}
          >
            {t(`settings_read_${value}`)}
          </button>
        ))}
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
        onClick={() => {
          pendingChannelRef.current =
            channel === "direct" ? "sms" : (channel as "gprs" | "sms");
          send(
            data,
            (channel === "direct" ? "sms" : channel) as "gprs" | "sms",
            channel === "gprs" ? undefined : recipient
          );
        }}
      />
    </div>
 );
};
