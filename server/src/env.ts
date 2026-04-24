const withoutTrailingSlash = (value: string): string => value.replace(/\/+$/, "");
const urlFromEnv = (key: string): string => withoutTrailingSlash(process.env[key]?.trim() ?? "");

export const env = {
  FLESPI_TOKEN: process.env.FLESPI_TOKEN ?? "",
  FLESPI_BASE_URL: urlFromEnv("FLESPI_BASE_URL"),
  PORT: Number(process.env.PORT ?? 3001),
  SIPGATE_SMS_ID: process.env.SIPGATE_SMS_ID ?? "s0",
  SIPGATE_API_BASE_URL: urlFromEnv("SIPGATE_API_BASE_URL"),
  SIPGATE_OAUTH_BASE_URL: urlFromEnv("SIPGATE_OAUTH_BASE_URL"),
  // OAuth (preferred)
  SIPGATE_CLIENT_ID: process.env.SIPGATE_CLIENT_ID ?? "",
  SIPGATE_CLIENT_SECRET: process.env.SIPGATE_CLIENT_SECRET ?? "",
  SIPGATE_REDIRECT_URI: process.env.SIPGATE_REDIRECT_URI ?? "",
  // PAT fallback
  SIPGATE_TOKEN_ID: process.env.SIPGATE_TOKEN_ID ?? "",
  SIPGATE_TOKEN: process.env.SIPGATE_TOKEN ?? "",
  // Teltonika SMS auth
  TELTONIKA_SMS_LOGIN: process.env.TELTONIKA_SMS_LOGIN ?? "",
  TELTONIKA_SMS_PASSWORD: process.env.TELTONIKA_SMS_PASSWORD ?? "",
  // Bluetooth Configurator Passwort
  BLUETOOTH_PASSWORD: process.env.BLUETOOTH_PASSWORD ?? "",
  // Optional override for compiled/packaged releases
  WEB_DIST_DIR: process.env.WEB_DIST_DIR ?? "",
};

export type SipgateMode = "oauth" | "pat" | "disabled";

export const sipgateMode = (): SipgateMode => {
  if (env.SIPGATE_CLIENT_ID && env.SIPGATE_CLIENT_SECRET) return "oauth";
  if (env.SIPGATE_TOKEN_ID && env.SIPGATE_TOKEN) return "pat";
  return "disabled";
};
