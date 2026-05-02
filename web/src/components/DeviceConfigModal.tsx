import type { DeviceConfig } from "../lib/deviceConfig";
import { useUi } from "../ui";

type Props = {
  config: DeviceConfig;
  onApply: () => void;
  onDismiss: () => void;
};

export const DeviceConfigModal = ({ config, onApply, onDismiss }: Props) => {
  const { t } = useUi();

  const rows: Array<{ label: string; value: string }> = [];
  if (config.apn !== undefined) rows.push({ label: "APN", value: config.apn || "—" });
  if (config.apnUser !== undefined) rows.push({ label: t("apn_user"), value: config.apnUser || "—" });
  if (config.apnPassword !== undefined)
    rows.push({ label: t("apn_password"), value: config.apnPassword || "—" });
  if (config.apnAuth !== undefined)
    rows.push({ label: t("apn_auth"), value: config.apnAuth.toUpperCase() });
  if (config.gprsEnabled !== undefined)
    rows.push({ label: t("gprs_context"), value: config.gprsEnabled ? t("on") : t("off") });
  if (config.domain !== undefined) rows.push({ label: t("server_domain"), value: config.domain || "—" });
  if (config.port !== undefined) rows.push({ label: t("server_port"), value: String(config.port) });
  if (config.protocol !== undefined)
    rows.push({ label: t("server_protocol"), value: config.protocol.toUpperCase() });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-xl space-y-4">
        <div className="text-sm font-medium">{t("device_config_modal_title")}</div>
        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] overflow-hidden">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 px-3 py-2 border-b border-[var(--color-line)] last:border-0 text-xs"
            >
              <span className="text-[var(--color-muted)] shrink-0">{row.label}</span>
              <span className="font-mono break-all text-right">{row.value}</span>
            </div>
          ))}
        </div>
        <div className="text-xs text-[var(--color-muted)]">{t("device_config_modal_hint")}</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onApply}
            className="flex-1 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-white"
            title={t("tooltip_device_config_apply")}
          >
            {t("device_config_apply")}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm text-[var(--color-muted)]"
            title={t("tooltip_device_config_dismiss")}
          >
            {t("device_config_dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
};
