import type { Telemetry } from "../types";
import { useUi } from "../ui";

type Props = { telemetry: Telemetry; showHeader?: boolean };

const interestingPrefixes = ["obd.", "vehicle.", "can."];

const formatValue = (value: unknown): string => {
  if (typeof value === "number") return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  if (typeof value === "boolean") return value ? "ja" : "nein";
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return "—";
};

export const ObdPanel = ({ telemetry, showHeader = true }: Props) => {
  const { t } = useUi();
  const entries = Object.entries(telemetry)
    .filter(([key]) => interestingPrefixes.some((prefix) => key.startsWith(prefix)))
    .sort(([a], [b]) => a.localeCompare(b));

  const relevant = entries.filter(
    ([key]) =>
      ![
        "vehicle.mileage",
      ].includes(key)
  );

  const hasObdData = relevant.length > 0;

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-line)] rounded-xl p-3">
      {showHeader && (
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium">{t("obd_ready")}</div>
          <div className="text-[11px] text-gray-400">
            {hasObdData ? t("obd_signals_detected", { count: relevant.length }) : t("obd_no_data")}
          </div>
        </div>
      )}

      {hasObdData ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {relevant.slice(0, 8).map(([key, item]) => (
            <div
              key={key}
              className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
            >
              <div className="text-[11px] uppercase tracking-wide text-gray-400">{key}</div>
              <div className="mt-1 text-sm font-medium break-all">
                {formatValue(item.value)}
              </div>
              <div className="mt-1 text-[11px] text-gray-400">
                {t("refresh")} {new Date(item.ts * 1000).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2 text-xs text-gray-300">
          <div className="rounded-lg border border-green-800/50 bg-green-950/30 p-2 text-green-100">
            {t("obd_no_data_long")}
          </div>
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
            {t("obd_step_1")}
          </div>
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
            {t("obd_step_2")}
          </div>
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
            {t("obd_step_3")}
          </div>
          <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
            {t("obd_step_4")}
          </div>
        </div>
      )}
    </div>
  );
};
