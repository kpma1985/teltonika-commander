import { useEffect, useState } from "react";
import { api } from "../../api";
import type { PresetData } from "../../types";
import { useUi } from "../../ui";

type Props = {
  data: PresetData | null;
  recipient: string;
};

export const DirectSmsPanel = ({ data, recipient }: Props) => {
  const { t } = useUi();
  const [payloads, setPayloads] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!data) { setPayloads([]); return; }
    let cancelled = false;
    api.preview(data)
      .then((r) => { if (!cancelled) setPayloads(r.sms); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [JSON.stringify(data)]);

  if (payloads.length === 0) return null;

  const copy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // fallback: select text
    }
  };

  const hasRecipient = recipient.length > 4;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <div className="border-b border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {t("direct_sms_label")}
      </div>
      <div className="divide-y divide-[var(--color-line)] bg-[var(--color-panel-2)]">
        {payloads.map((text, idx) => (
          <div key={idx} className="space-y-2 p-3">
            <div className="break-all rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-2.5 py-2 font-mono text-xs text-[var(--color-accent-2)]">
              {text}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => copy(text, idx)}
                className="flex-1 rounded-lg border border-[var(--color-line)] py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {copiedIdx === idx ? t("direct_sms_copied") : t("direct_sms_copy")}
              </button>
              {hasRecipient && (
                <a
                  href={`sms:${recipient}?body=${encodeURIComponent(text)}`}
                  className="flex-1 rounded-lg bg-[var(--color-accent)] py-1.5 text-center text-xs font-medium text-white"
                >
                  {t("direct_sms_open")}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
      {!hasRecipient && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-[11px] text-[var(--color-muted)]">
          {t("direct_sms_no_recipient")}
        </div>
      )}
    </div>
  );
};
