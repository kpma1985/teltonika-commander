import { randomBytes, createHash } from "node:crypto";
import { env } from "./env.ts";
import {
  getSipgateAuth,
  putOauthState,
  saveSipgateAuth,
  takeOauthState,
} from "./db.ts";
import { getRuntimeConfig } from "./runtime-config.ts";

const API_BASE = env.SIPGATE_API_BASE_URL;
const OAUTH_BASE = env.SIPGATE_OAUTH_BASE_URL;
const OAUTH_SCOPE = "sessions:sms:write offline_access";

// -------- utilities --------

const base64url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const generatePkce = (): { verifier: string; challenge: string } => {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

// -------- OAuth flow --------

export const buildAuthorizeUrl = (): string => {
  const cfg = getRuntimeConfig();
  if (sipgateMode() !== "oauth") {
    throw new Error("Sipgate OAuth is not configured");
  }
  const state = base64url(randomBytes(16));
  const { verifier, challenge } = generatePkce();
  putOauthState(state, verifier);

  const params = new URLSearchParams({
    client_id: cfg.SIPGATE_CLIENT_ID,
    redirect_uri: cfg.SIPGATE_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${OAUTH_BASE}/auth?${params}`;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

const postToken = async (form: Record<string, string>): Promise<TokenResponse> => {
  const cfg = getRuntimeConfig();
  const body = new URLSearchParams(form).toString();
  const basic = Buffer.from(
    `${cfg.SIPGATE_CLIENT_ID}:${cfg.SIPGATE_CLIENT_SECRET}`
  ).toString("base64");
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sipgate token ${res.status}: ${text.slice(0, 400)}`);
  }
  return (await res.json()) as TokenResponse;
};

export const exchangeCode = async (
  code: string,
  state: string
): Promise<void> => {
  const cfg = getRuntimeConfig();
  const verifier = takeOauthState(state);
  if (!verifier) throw new Error("Invalid or expired OAuth state");
  const tok = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.SIPGATE_REDIRECT_URI,
    client_id: cfg.SIPGATE_CLIENT_ID,
    code_verifier: verifier,
  });
  saveSipgateAuth({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 30) * 1000,
    scope: tok.scope ?? null,
  });
};

const refreshAccessToken = async (): Promise<string> => {
  const cfg = getRuntimeConfig();
  const row = getSipgateAuth();
  if (!row) throw new Error("Sipgate not connected — run OAuth first");
  const tok = await postToken({
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
    client_id: cfg.SIPGATE_CLIENT_ID,
  });
  saveSipgateAuth({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: Date.now() + (tok.expires_in - 30) * 1000,
    scope: tok.scope ?? row.scope,
  });
  return tok.access_token;
};

const currentAccessToken = async (): Promise<string> => {
  const row = getSipgateAuth();
  if (!row) throw new Error("Sipgate not connected — run OAuth first");
  if (row.expires_at > Date.now()) return row.access_token;
  return refreshAccessToken();
};

// -------- SMS send --------

const authHeaderFor = async (): Promise<string> => {
  const mode = sipgateMode();
  const cfg = getRuntimeConfig();
  if (mode === "oauth") {
    return `Bearer ${await currentAccessToken()}`;
  }
  if (mode === "pat") {
    const raw = `${cfg.SIPGATE_TOKEN_ID}:${cfg.SIPGATE_TOKEN}`;
    return `Basic ${Buffer.from(raw).toString("base64")}`;
  }
  throw new Error("Sipgate is not configured");
};

export type SmsSend = {
  recipient: string; // E.164, e.g. +491701234567
  message: string;
  smsId?: string;
  sendAt?: number;
};

export const sendSms = async (input: SmsSend): Promise<{ queued: true }> => {
  const cfg = getRuntimeConfig();
  const body = {
    smsId: input.smsId ?? cfg.SIPGATE_SMS_ID,
    recipient: input.recipient,
    message: input.message,
    ...(input.sendAt ? { sendAt: input.sendAt } : {}),
  };
  const res = await fetch(`${API_BASE}/sessions/sms`, {
    method: "POST",
    headers: {
      Authorization: await authHeaderFor(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sipgate ${res.status}: ${text.slice(0, 400)}`);
  }
  return { queued: true };
};

export const sipgateStatus = (): {
  mode: "oauth" | "pat" | "disabled";
  connected: boolean;
} => {
  const mode = sipgateMode();
  if (mode === "pat") return { mode, connected: true };
  if (mode === "oauth") return { mode, connected: getSipgateAuth() !== null };
  return { mode, connected: false };
};

export const sipgateMode = (): "oauth" | "pat" | "disabled" => {
  const cfg = getRuntimeConfig();
  if (cfg.SIPGATE_CLIENT_ID && cfg.SIPGATE_CLIENT_SECRET) return "oauth";
  if (cfg.SIPGATE_TOKEN_ID && cfg.SIPGATE_TOKEN) return "pat";
  return "disabled";
};
