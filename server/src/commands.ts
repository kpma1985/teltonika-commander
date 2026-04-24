import { getRuntimeConfig } from "./runtime-config.ts";

export type PresetKind =
  | "bt-obd2"
  | "apn"
  | "server"
  | "settings-read"
  | "status"
  | "outputs"
  | "tracking";

export type CommandChannel = "gprs" | "sms";

// Teltonika SMS format: "<login> <password> <command>"
// If login/password empty, two spaces are required.
export const wrapSmsCommand = (payload: string): string => {
  const cfg = getRuntimeConfig();
  return `${cfg.TELTONIKA_SMS_LOGIN} ${cfg.TELTONIKA_SMS_PASSWORD} ${payload}`;
};

// Build a multi-parameter setparam payload.
// Input: [[800, "1"], [807, "2"], [804, "AABBCC112233"], [806, "1234"]]
// Output: "setparam 800:1;807:2;804:AABBCC112233;806:1234"
export const setparam = (pairs: Array<[number, string | number]>): string => {
  const parts = pairs.map(([id, v]) => `${id}:${v}`).join(";");
  return `setparam ${parts}`;
};

const stripMac = (mac: string): string =>
  mac.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();

export const isValidMac = (mac: string): boolean =>
  /^[0-9A-F]{12}$/.test(stripMac(mac));

export type BtObd2Input = {
  mac: string;
  pin: string;
  externalName?: string;
  reset?: boolean;
};

export const buildBtObd2 = (i: BtObd2Input): string[] => {
  const mac = stripMac(i.mac);
  if (!isValidMac(mac)) throw new Error("Invalid MAC address");
  if (!/^[0-9]{1,8}$/.test(i.pin)) throw new Error("PIN must be 1–8 digits");

  const params: Array<[number, string | number]> = [
    [800, 1], // BT Radio: enable (hidden)
    [807, 2], // Auto-Connect Mode external: OBDII
    [804, mac], // External MAC
    [806, i.pin], // External PIN
  ];
  if (i.externalName) params.push([805, i.externalName.slice(0, 30)]);

  const cmds = [setparam(params)];
  if (i.reset) cmds.push("cpureset");
  return cmds;
};

export type ApnInput = {
  apn: string;
  user?: string;
  password?: string;
  auth?: "pap" | "chap";
};

export const buildApn = (i: ApnInput): string[] => {
  if (!i.apn || i.apn.length > 63) throw new Error("APN required, ≤63 chars");
  const params: Array<[number, string | number]> = [[2001, i.apn]];
  if (i.user !== undefined) params.push([2002, i.user]);
  if (i.password !== undefined) params.push([2003, i.password]);
  if (i.auth) params.push([2016, i.auth === "chap" ? 1 : 0]);
  return [setparam(params)];
};

export type ServerInput = {
  domain: string;
  port: number;
  protocol: "tcp" | "udp";
  enableGprs?: boolean;
  reset?: boolean;
};

export const buildServer = (i: ServerInput): string[] => {
  if (!i.domain || i.domain.length > 55) throw new Error("Domain required, ≤55 chars");
  if (!Number.isInteger(i.port) || i.port < 1 || i.port > 65535) {
    throw new Error("Port must be 1-65535");
  }

  const params: Array<[number, string | number]> = [];
  if (i.enableGprs !== false) params.push([2000, 1]);
  params.push([2004, i.domain], [2005, i.port], [2006, i.protocol === "udp" ? 1 : 0]);

  const cmds = [setparam(params)];
  if (i.reset) cmds.push("cpureset");
  return cmds;
};

export type SettingsReadInput = {
  profile: "apn" | "server" | "network";
};

export const buildSettingsRead = (i: SettingsReadInput): string[] => {
  const profiles: Record<SettingsReadInput["profile"], number[]> = {
    apn: [2000, 2001, 2002, 2003, 2016],
    server: [2004, 2005, 2006, 2010],
    network: [2000, 2001, 2002, 2003, 2004, 2005, 2006, 2010, 2016],
  };
  const ids = profiles[i.profile];
  if (!ids) throw new Error("Unknown settings read profile");
  return ids.map((id) => `getparam ${id}`);
};

// Tracking params: Home network only (10000-10055)
// 10000 = min period stop, 10050 = min period moving
// 10005 = send period stop, 10055 = send period moving
export const buildTracking = (i: { stopInterval: number; movingInterval: number }): string[] => [
  setparam([
    [10000, i.stopInterval],
    [10005, i.stopInterval],
    [10050, i.movingInterval],
    [10055, i.movingInterval],
  ]),
];

export const STATUS_COMMANDS = [
  { key: "getinfo", label: "Runtime info", payload: "getinfo" },
  { key: "getver", label: "Firmware/IMEI", payload: "getver" },
  { key: "getstatus", label: "Modem status", payload: "getstatus" },
  { key: "getgps", label: "GPS data", payload: "getgps" },
  { key: "battery", label: "Battery", payload: "battery" },
  { key: "readio", label: "I/O state", payload: "readio" },
] as const;

export type StatusKey = (typeof STATUS_COMMANDS)[number]["key"];

export const buildStatus = (key: StatusKey): string[] => {
  const match = STATUS_COMMANDS.find((c) => c.key === key);
  if (!match) throw new Error(`Unknown status command: ${key}`);
  return [match.payload];
};

export type OutputsInput = {
  // setdigout <states> <Y1> <Y2> <Z1> <Z2>
  // states: e.g. "1" DOUT1 on, "0" off, "?" keep
  states: string;
  // timer for state 1 (seconds)
  t1?: number;
  t2?: number;
  // speed threshold (km/h) for auto-off
  s1?: number;
  s2?: number;
  reset?: boolean;
};

export const buildOutputs = (i: OutputsInput): string[] => {
  if (!/^[01?]{1,2}$/.test(i.states)) {
    throw new Error("states must be 1–2 chars of [0,1,?]");
  }
  const parts = [
    "setdigout",
    i.states,
    String(i.t1 ?? 0),
    String(i.t2 ?? 0),
    String(i.s1 ?? 0),
    String(i.s2 ?? 0),
  ];
  const cmds = [parts.join(" ")];
  if (i.reset) cmds.push("cpureset");
  return cmds;
};

export const CPURESET = "cpureset";
export const DEFAULTCFG = "defaultcfg";
