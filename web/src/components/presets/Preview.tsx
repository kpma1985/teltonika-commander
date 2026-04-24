import { useEffect, useState } from "react";
import { api } from "../../api";
import type { PresetData } from "../../types";
import { useUi } from "../../ui";

type Props = { data: PresetData | null; channel: "gprs" | "sms" | "direct" };

export const Preview = ({ data, channel }: Props) => {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "error"; msg: string }
    | { kind: "ok"; payloads: string[]; sms: string[] }
  >({ kind: "idle" });

  useEffect(() => {
    if (!data) {
      setState({ kind: "idle" });
      return;
    }
    let cancelled = false;
    api
      .preview(data)
      .then((r) => !cancelled && setState({ kind: "ok", ...r }))
      .catch((e: Error) => !cancelled && setState({ kind: "error", msg: e.message }));
    return () => {
      cancelled = true;
    };
  }, [JSON.stringify(data)]);

  if (!data || state.kind === "idle") return null;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 bg-[var(--color-bg)] px-3 py-2 text-left text-[10px] uppercase tracking-widest text-[var(--color-muted)]"
        aria-expanded={open}
      >
        <span>{t("command_preview")}</span>
        <span className="text-sm leading-none">{open ? "-" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
          {state.kind === "error" && (
            <div className="text-xs text-red-300">{state.msg}</div>
          )}
          {state.kind === "ok" && (
            <div className="space-y-1">
              {(channel !== "gprs" ? state.sms : state.payloads).map((p, i) => (
                <div key={i} className="break-all font-mono text-xs text-[var(--color-accent-2)]">
                  {p}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
