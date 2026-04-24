import { env } from "./env.ts";
import { getAllAppConfig } from "./db.ts";

export type RuntimeConfig = {
  FLESPI_TOKEN: string;
  SIPGATE_SMS_ID: string;
  SIPGATE_CLIENT_ID: string;
  SIPGATE_CLIENT_SECRET: string;
  SIPGATE_REDIRECT_URI: string;
  SIPGATE_TOKEN_ID: string;
  SIPGATE_TOKEN: string;
  TELTONIKA_SMS_LOGIN: string;
  TELTONIKA_SMS_PASSWORD: string;
};

const fromDbOrEnv = (db: Record<string, string | null>, key: keyof RuntimeConfig, fallback = ""): string =>
  db[key] ?? (env as Record<string, unknown>)[key]?.toString() ?? fallback;

export const getRuntimeConfig = (): RuntimeConfig => {
  const db = getAllAppConfig();
  return {
    FLESPI_TOKEN: fromDbOrEnv(db, "FLESPI_TOKEN"),
    SIPGATE_SMS_ID: fromDbOrEnv(db, "SIPGATE_SMS_ID", "s0"),
    SIPGATE_CLIENT_ID: fromDbOrEnv(db, "SIPGATE_CLIENT_ID"),
    SIPGATE_CLIENT_SECRET: fromDbOrEnv(db, "SIPGATE_CLIENT_SECRET"),
    SIPGATE_REDIRECT_URI: fromDbOrEnv(db, "SIPGATE_REDIRECT_URI", env.SIPGATE_REDIRECT_URI),
    SIPGATE_TOKEN_ID: fromDbOrEnv(db, "SIPGATE_TOKEN_ID"),
    SIPGATE_TOKEN: fromDbOrEnv(db, "SIPGATE_TOKEN"),
    TELTONIKA_SMS_LOGIN: fromDbOrEnv(db, "TELTONIKA_SMS_LOGIN"),
    TELTONIKA_SMS_PASSWORD: fromDbOrEnv(db, "TELTONIKA_SMS_PASSWORD"),
  };
};

export const getPublicRuntimeConfig = () => {
  const cfg = getRuntimeConfig();
  return {
    FLESPI_TOKEN: cfg.FLESPI_TOKEN,
    SIPGATE_SMS_ID: cfg.SIPGATE_SMS_ID,
    SIPGATE_CLIENT_ID: cfg.SIPGATE_CLIENT_ID,
    SIPGATE_CLIENT_SECRET: cfg.SIPGATE_CLIENT_SECRET,
    SIPGATE_REDIRECT_URI: cfg.SIPGATE_REDIRECT_URI,
    SIPGATE_TOKEN_ID: cfg.SIPGATE_TOKEN_ID,
    SIPGATE_TOKEN: cfg.SIPGATE_TOKEN,
    TELTONIKA_SMS_LOGIN: cfg.TELTONIKA_SMS_LOGIN,
    TELTONIKA_SMS_PASSWORD: cfg.TELTONIKA_SMS_PASSWORD,
  };
};
