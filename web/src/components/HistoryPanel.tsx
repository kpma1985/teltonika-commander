import { useEffect, useState } from "react";
import { api } from "../api";
import type { HistoryRow } from "../types";
import { useUi } from "../ui";

type Props = { deviceId: number; refreshKey: number; showHeader?: boolean };

export const HistoryPanel = ({ deviceId, refreshKey, showHeader = true }: Props) => {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 10;
  const { t } = useUi();
  const sortedRows = rows
    ? [...rows].sort((a, b) => b.created_at - a.created_at)
    : null;

  const load = () => {
    let cancelled = false;
    setErr(null);
    api
      .history(deviceId, { limit, offset })
      .then((r) => !cancelled && setRows(r.rows))
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    setOffset(0);
  }, [deviceId]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [deviceId, refreshKey, offset]);

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-line)] rounded-xl p-3">
      {showHeader && (
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-medium">{t("command_history")}</div>
          <button
            type="button"
            onClick={load}
            className="text-[11px] px-2 py-1 rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] hover:bg-[var(--color-panel-2)]"
          >
            {t("refresh")}
          </button>
        </div>
      )}
      {err && <div className="text-xs text-red-300">{err}</div>}
      {rows === null && !err && (
        <div className="text-xs text-[var(--color-muted)]">{t("load")}</div>
      )}
      {sortedRows && sortedRows.length === 0 && (
        <div className="text-xs text-[var(--color-muted)]">{t("no_commands")}</div>
      )}
      {sortedRows && sortedRows.length > 0 && (
        <div className="space-y-2">
          {sortedRows.map((r) => (
            <div
              key={r.id}
              className="bg-[var(--color-panel-2)] rounded-lg p-2 text-xs"
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    r.status === "executed"
                      ? "bg-green-400"
                      : r.status === "sent"
                        ? "bg-emerald-500"
                        : r.status === "queued"
                          ? "bg-green-600"
                          : "bg-red-500"
                  }`}
                />
                <span className="uppercase text-[10px] tracking-wide text-[var(--color-muted)]">
                  {r.channel}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--color-muted)]">
                  {r.status}
                </span>
                {r.preset && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-300">
                    {r.preset}
                  </span>
                )}
                <span className="ml-auto text-[var(--color-muted)]">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              <div className="font-mono break-all">{r.payload}</div>
              {r.external_id && (
                <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                  {t("queue_id")}: <span className="font-mono">{r.external_id}</span>
                </div>
              )}
              {r.response && (
                <div className="mt-2 rounded-lg border border-green-800/70 bg-green-950/30 p-2 text-green-100">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-green-400">{t("flespi_response")}</div>
                  <div className="font-mono break-all">{r.response}</div>
                </div>
              )}
              {r.executed_at && (
                <div className="mt-1 text-[11px] text-[var(--color-muted)]">
                  {t("executed")}: {new Date(r.executed_at * 1000).toLocaleString()}
                </div>
              )}
              {r.error && (
                <div className="mt-1 text-red-300">{r.error}</div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - limit))}
              className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] disabled:opacity-40"
            >
              {t("previous")}
            </button>
            <div className="text-[11px] text-[var(--color-muted)]">
              {t("page")} {Math.floor(offset / limit) + 1}
            </div>
            <button
              type="button"
              disabled={sortedRows.length < limit}
              onClick={() => setOffset((v) => v + limit)}
              className="rounded-lg border border-[var(--color-line)] px-2 py-1 text-[11px] text-[var(--color-muted)] disabled:opacity-40"
            >
              {t("next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
