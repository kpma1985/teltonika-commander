import type { Device } from "../types";
import { TELTONIKA_DEVICE_TYPES } from "../types";
import { Redacted, useUi } from "../ui";

type Props = {
  devices: Device[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

export const DeviceList = ({ devices, selectedId, onSelect }: Props) => {
  const { t } = useUi();

  if (devices.length === 0) {
    return (
      <div className="text-sm text-[var(--color-muted)]">
        {t("no_devices")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
      {devices.map((d) => {
        const modelName = TELTONIKA_DEVICE_TYPES.get(d.device_type_id);
        const active = d.id === selectedId;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            className={`text-left rounded-2xl border px-3 py-3 transition ${
              active
                ? "bg-[var(--color-panel-2)] border-[var(--color-accent)] shadow-sm"
                : "bg-[var(--color-panel-2)]/60 border-[var(--color-line)] hover:bg-[var(--color-panel-2)]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block w-2 h-2 rounded-full ${
                  d.online ? "bg-green-400" : "bg-zinc-600"
                }`}
              />
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              {modelName && (
                <span className="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-300">
                  {modelName}
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-[var(--color-muted)] font-mono">
              {d.ident ? <Redacted value={d.ident} /> : "—"}
            </div>
            {d.smsRecipient && (
              <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)] font-mono">
                <Redacted value={d.smsRecipient} />
              </div>
            )}
            <div className="mt-2 text-[11px] text-[var(--color-muted)]">
              {d.online
                ? t("online")
                : d.last_seen
                  ? t("last_seen", {
                      value: new Date(d.last_seen * 1000).toLocaleString(),
                    })
                  : t("no_contact")}
            </div>
          </button>
        );
      })}
    </div>
  );
};
