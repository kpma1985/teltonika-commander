import { useUi } from "../../ui";
import { normalizePhoneNumber } from "../../lib/phone";

export type Channel = "gprs" | "sms" | "direct";

type Props = {
  channel: Channel;
  onChange: (c: Channel) => void;
  recipient: string;
  onRecipientChange: (v: string) => void;
  sipgate: boolean;
  onSaveRecipient?: () => void;
  savedRecipient?: string | null;
  variant?: "tabs" | "recipient-only";
};

export const ChannelPicker = ({
  channel,
  onChange,
  recipient,
  onRecipientChange,
  sipgate,
  onSaveRecipient,
  savedRecipient,
  variant = "tabs",
}: Props) => {
  const { t } = useUi();
  const normalizedSavedRecipient = savedRecipient ? normalizePhoneNumber(savedRecipient) : null;

  const buttons: Array<{ key: Channel; label: string; disabled?: boolean }> = [
    { key: "gprs", label: t("gprs_flespi") },
    { key: "sms", label: sipgate ? t("sms_sipgate") : t("sms_disabled"), disabled: !sipgate },
    { key: "direct", label: t("direct_sms_label") },
  ];

  return (
    <div className="space-y-2">
      {variant === "tabs" && (
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-1">
          {buttons.map(({ key, label, disabled }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onChange(key)}
              className={`rounded-lg py-2 text-xs font-medium transition-colors disabled:opacity-35 ${
                channel === key
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-panel-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {(channel === "sms" || channel === "direct") && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              value={recipient}
              onChange={(e) => onRecipientChange(normalizePhoneNumber(e.target.value))}
              onBlur={(e) => onRecipientChange(normalizePhoneNumber(e.target.value))}
              placeholder="+491701234567"
              className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-sm font-mono transition-colors"
            />
            {onSaveRecipient && (
              <button
                type="button"
                onClick={onSaveRecipient}
                className="shrink-0 rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                {t("save_number")}
              </button>
            )}
          </div>
          {normalizedSavedRecipient && (
            <div className="text-[11px] text-[var(--color-muted)]">
              {t("saved_number", { value: normalizedSavedRecipient })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
