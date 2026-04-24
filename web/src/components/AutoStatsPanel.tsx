import type { Telemetry } from "../types";
import { useUi } from "../ui";

type Props = { telemetry: Telemetry; showHeader?: boolean };

const getNumber = (telemetry: Telemetry, key: string): number | null => {
  const value = telemetry[key]?.value;
  return typeof value === "number" ? value : null;
};

const getBoolean = (telemetry: Telemetry, key: string): boolean | null => {
  const value = telemetry[key]?.value;
  return typeof value === "boolean" ? value : null;
};

const formatAge = (ts: number | null): string => {
  if (!ts) return "—";
  const diff = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
};

export const AutoStatsPanel = ({ telemetry, showHeader = true }: Props) => {
  const { t } = useUi();
  const stats = [
    {
      label: t("mileage"),
      value:
        typeof getNumber(telemetry, "vehicle.mileage") === "number"
          ? `${getNumber(telemetry, "vehicle.mileage")?.toFixed(1)} km`
          : "—",
    },
    {
      label: t("speed"),
      value:
        typeof getNumber(telemetry, "position.speed") === "number"
          ? `${Math.round(getNumber(telemetry, "position.speed") ?? 0)} km/h`
          : "—",
    },
    {
      label: t("power"),
      value:
        typeof getNumber(telemetry, "external.powersource.voltage") === "number"
          ? `${(getNumber(telemetry, "external.powersource.voltage") ?? 0).toFixed(2)} V`
          : "—",
    },
    {
      label: t("ignition"),
      value:
        typeof getBoolean(telemetry, "engine.ignition.status") === "boolean"
          ? getBoolean(telemetry, "engine.ignition.status")
            ? t("on")
            : t("off")
          : "—",
    },
    {
      label: t("movement"),
      value:
        typeof getBoolean(telemetry, "movement.status") === "boolean"
          ? getBoolean(telemetry, "movement.status")
            ? t("yes")
            : t("no")
          : "—",
    },
    {
      label: t("gps_age"),
      value: formatAge(telemetry.timestamp?.ts ?? null),
    },
  ];

  return (
    <div className="bg-[var(--color-panel)] border border-[var(--color-line)] rounded-xl p-3">
      {showHeader && <div className="text-sm font-medium mb-2">{t("auto_stats")}</div>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2"
          >
            <div className="text-[11px] uppercase tracking-wide text-gray-400">
              {stat.label}
            </div>
            <div className="mt-1 text-sm font-medium">{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
