import { useEffect, useState } from "react";
import { api } from "../api";
import type { CommandResult, HistoryRow } from "../types";
import { useUi } from "../ui";

type Props = {
  open: boolean;
  refreshKey: number;
  optimisticResults: CommandResult[];
  onClose: () => void;
};

const fromCommandResult = (result: CommandResult): HistoryRow => ({
  id: result.logId,
  device_id: result.deviceId ?? 0,
  device_name: result.deviceName ?? "—",
  channel: result.channel ?? "gprs",
  preset: result.preset ?? null,
  payload: result.payload,
  status: result.status,
  error: result.error ?? null,
  external_id: result.externalId ?? null,
  created_at: result.createdAt ?? Date.now(),
});

export const CommandQueueModal = ({
  open,
  refreshKey,
  optimisticResults,
  onClose,
}: Props) => {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manualRefresh, setManualRefresh] = useState(0);
  const { t } = useUi();
  const optimisticRows = optimisticResults.map(fromCommandResult);
  const displayedRows = rows
    ? [
        ...optimisticRows.filter((optimistic) =>
          rows.some((row) => row.id === optimistic.id)
        ),
        ...rows.filter(
          (row) => !optimisticRows.some((optimistic) => optimistic.id === row.id)
        ),
      ].sort((a, b) => b.created_at - a.created_at)
    : optimisticRows;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const load = () => {
      setErr(null);
      api
        .commandQueue({ limit: 50 })
        .then((response) => !cancelled && setRows(response.rows))
        .catch((e: Error) => {
          if (cancelled) return;
          setErr(
            e.message.includes("404")
              ? t("queue_endpoint_missing")
              : e.message
          );
        });
    };

    load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, refreshKey, manualRefresh, t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
        aria-label={t("close_menu")}
        title={t("tooltip_close_menu_overlay")}
      />
      <div className="relative z-10 flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-bg)] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("queue_modal_title")}</div>
            <div className="text-[11px] text-[var(--color-muted)]">
              {t("queue_modal_hint")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualRefresh((value) => value + 1)}
              className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-panel)]"
              title={t("tooltip_queue_modal_refresh")}
            >
              {t("refresh")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--color-line)] text-sm hover:bg-[var(--color-panel)]"
              aria-label={t("close_menu")}
              title={t("close_menu")}
            >
              x
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {err && <div className="text-xs text-red-300">{err}</div>}
          {rows === null && !err && displayedRows.length === 0 && (
            <div className="text-xs text-[var(--color-muted)]">{t("load")}</div>
          )}
          {displayedRows.length === 0 && rows !== null && (
            <div className="text-xs text-[var(--color-muted)]">{t("queue_empty")}</div>
          )}
          {displayedRows.length > 0 && (
            <div className="space-y-2">
              {displayedRows.map((row) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-xs"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        row.status === "failed"
                          ? "bg-red-500"
                          : row.status === "sent"
                            ? "bg-emerald-500"
                            : "bg-green-500"
                      }`}
                    />
                    <span className="font-medium">{row.device_name}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-muted)]">
                      {row.channel}
                    </span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                      {row.status}
                    </span>
                    <span className="ml-auto text-[11px] text-[var(--color-muted)]">
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="font-mono break-all text-[var(--color-accent-2)]">
                    {row.payload}
                  </div>
                  {row.external_id && (
                    <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                      {t("queue_id")}: <span className="font-mono">{row.external_id}</span>
                    </div>
                  )}
                  {row.error && <div className="mt-1 text-red-300">{row.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
