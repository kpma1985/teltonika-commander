import { useEffect, useRef, useState } from "react";
import type { CommandResult } from "../../types";
import { useUi } from "../../ui";
import type { Channel } from "./ChannelPicker";

type Props = {
  sending: boolean;
  disabled?: boolean;
  error: string | null;
  result: CommandResult[] | null;
  onClick: () => void;
  label?: string;
  channel?: Channel;
  onChannelChange?: (channel: Channel) => void;
  sipgate?: boolean;
};

export const SendButton = ({
  sending,
  disabled,
  error,
  onClick,
  label,
  channel,
  onChannelChange,
  sipgate = false,
}: Props) => {
  const { t } = useUi();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hasChannelMenu = channel != null && onChannelChange != null;
  const channelItems: Array<{ key: Channel; label: string; disabled?: boolean }> = [
    { key: "gprs", label: t("gprs_flespi") },
    { key: "sms", label: sipgate ? t("sms_sipgate") : t("sms_disabled"), disabled: !sipgate },
    { key: "direct", label: t("direct_sms_label") },
  ];

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <div className="space-y-2">
      <div ref={menuRef} className="relative flex w-full rounded-xl bg-[var(--color-accent)] text-white shadow-sm">
        <button
          type="button"
          onClick={onClick}
          disabled={sending || disabled}
          className={`min-w-0 flex-1 py-3 text-sm font-semibold tracking-wide transition-opacity disabled:opacity-35 hover:opacity-90 ${
            hasChannelMenu ? "rounded-l-xl" : "rounded-xl"
          }`}
        >
          {sending ? t("sending") : (label ?? t("send"))}
        </button>
        {hasChannelMenu && (
          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            disabled={sending}
            className="flex w-12 shrink-0 items-center justify-center rounded-r-xl border-l border-white/35 bg-black/20 text-lg font-bold leading-none text-white shadow-inner transition-colors hover:bg-black/35 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:opacity-35"
            aria-label={t("send_menu")}
            aria-expanded={menuOpen}
            title={t("send_menu")}
          >
            ▾
          </button>
        )}
        {hasChannelMenu && menuOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] py-1 text-[var(--color-text)] shadow-xl">
            {channelItems.map((item) => (
              <button
                key={item.key}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  onChannelChange(item.key);
                  setMenuOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs transition-colors disabled:opacity-35 ${
                  channel === item.key
                    ? "bg-[var(--color-accent)]/15 text-[var(--color-accent-2)]"
                    : "hover:bg-[var(--color-soft)]"
                }`}
              >
                <span>{item.label}</span>
                {channel === item.key && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-red-700/60 bg-red-950/30 p-2.5 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
};
