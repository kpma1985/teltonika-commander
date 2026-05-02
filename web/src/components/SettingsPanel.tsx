import { useEffect, useState } from "react";
import { api } from "../api";
import { frontendEnv } from "../env";
import type { AppConfig } from "../types";
import { useUi } from "../ui";

const fields: Array<{
  key: keyof AppConfig;
  secret?: boolean;
  label: string;
  helpUrl?: string;
  hintKey?: string;
}> = [
  {
    key: "FLESPI_TOKEN",
    secret: true,
    label: "flespi_token",
    helpUrl: frontendEnv.FLESPI_TOKEN_HELP_URL,
    hintKey: "hint_flespi_token",
  },
  { key: "SIPGATE_SMS_ID", label: "sipgate_sms_id" },
  {
    key: "SIPGATE_CLIENT_ID",
    label: "sipgate_client_id",
    helpUrl: frontendEnv.SIPGATE_API_CLIENTS_URL,
    hintKey: "hint_sipgate_oauth",
  },
  {
    key: "SIPGATE_CLIENT_SECRET",
    secret: true,
    label: "sipgate_client_secret",
    helpUrl: frontendEnv.SIPGATE_API_CLIENTS_URL,
    hintKey: "hint_sipgate_oauth",
  },
  { key: "SIPGATE_REDIRECT_URI", label: "sipgate_redirect_uri" },
  {
    key: "SIPGATE_TOKEN_ID",
    label: "sipgate_token_id",
    helpUrl: frontendEnv.SIPGATE_PAT_URL,
    hintKey: "hint_sipgate_pat",
  },
  {
    key: "SIPGATE_TOKEN",
    secret: true,
    label: "sipgate_token",
    helpUrl: frontendEnv.SIPGATE_PAT_URL,
    hintKey: "hint_sipgate_pat",
  },
  {
    key: "TELTONIKA_SMS_LOGIN",
    label: "teltonika_sms_login",
    hintKey: "hint_teltonika_sms_auth",
  },
  {
    key: "TELTONIKA_SMS_PASSWORD",
    secret: true,
    label: "teltonika_sms_password",
    hintKey: "hint_teltonika_sms_auth",
  },
];

export const SettingsPanel = () => {
  const { t } = useUi();
  const [form, setForm] = useState<AppConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHints, setShowHints] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);

  useEffect(() => {
    api.settings().then((r) => setForm(r.config)).catch(() => undefined);
  }, []);

  if (!form) return null;

  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 shadow-sm">
      <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)]">
        <div className="flex items-start justify-between gap-3 px-3 py-3">
          <button
            type="button"
            onClick={() => setShowApiSettings((v) => !v)}
            className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
            title={
              showApiSettings
                ? t("tooltip_settings_collapse_panel")
                : t("tooltip_settings_expand_panel")
            }
          >
            <div>
              <div className="text-sm font-medium">{t("api_settings")}</div>
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                Flespi, Sipgate, Teltonika
              </div>
            </div>
            <span className="shrink-0 text-sm text-[var(--color-muted)]">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] text-sm text-[var(--color-muted)]">
                {showApiSettings ? "-" : "+"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-panel)] text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-soft)]"
            title={t("tooltip_settings_hints")}
            aria-label={t("tooltip_settings_hints")}
          >
            {showHints ? "?" : "i"}
          </button>
        </div>
        {showApiSettings && (
          <div className="space-y-3 border-t border-[var(--color-line)] p-3">
            <div className="grid grid-cols-1 gap-2">
              {fields.map((field) => (
                <label key={field.key} className="block">
                  <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--color-muted)]">
                    <span>{t(field.label)}</span>
                    {field.helpUrl && (
                      <a
                        href={field.helpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--color-line)] text-[10px] no-underline hover:bg-[var(--color-panel-2)]"
                        title={field.helpUrl}
                      >
                        ?
                      </a>
                    )}
                  </div>
                  <input
                    type={field.secret ? "password" : "text"}
                    value={form[field.key] ?? ""}
                    onChange={(e) =>
                      setForm((current) =>
                        current
                          ? { ...current, [field.key]: e.target.value }
                          : current
                      )
                    }
                    className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm"
                  />
                  {showHints && field.hintKey && (
                    <div className="mt-1.5 max-w-[62ch] pl-0.5 text-[10px] leading-4 text-[var(--color-muted)]/85">
                      {t(field.hintKey)}
                    </div>
                  )}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  setMessage(null);
                  try {
                    await api.updateSettings(form);
                    setMessage(t("settings_saved"));
                  } finally {
                    setSaving(false);
                  }
                }}
                className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm text-white disabled:opacity-50"
                title={t("tooltip_settings_save")}
              >
                {saving ? t("sending") : t("save_settings")}
              </button>
              {message && <div className="text-xs text-[var(--color-muted)]">{message}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
