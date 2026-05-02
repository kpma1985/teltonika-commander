import { chromium, type BrowserContext, type Page } from "playwright";
import { ImapFlow } from "imapflow";
import * as fs from "fs";
import * as path from "path";

// ── Load env ───────────────────────────────────────────────────────────────

const envFile = path.join(__dirname, "private.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const env = {
  password: process.env.ANNOUNCE_PASSWORD!,
  imap: {
    host: "mail.1337.so",
    port: 993,
    user: process.env.MAILCOW_DOMAIN_ADMIN_USER ?? "claude@1337.so",
    pass: process.env.MAILCOW_DOMAIN_ADMIN_PASS!,
  },
  reddit: {
    email: process.env.REDDIT_EMAIL ?? "reddit@1337.so",
    username: process.env.REDDIT_USERNAME ?? "teltonika-commander",
  },
  haForum: { email: process.env.HA_FORUM_EMAIL ?? "haforum@1337.so" },
  adminDe: { email: process.env.ADMIN_DE_EMAIL ?? "adminde@1337.so" },
};

const GITHUB_URL = "https://github.com/kpma1985/teltonika-commander";
const VERSION = process.env.RELEASE_VERSION ?? "v1.0";
const STATE_FILE = path.join(__dirname, "publish-state.json");

// ── Templates ──────────────────────────────────────────────────────────────

const tpl = (lang: "en" | "de") =>
  fs.readFileSync(path.join(__dirname, "post-templates", `${lang}.md`), "utf-8");

const extractBody = (md: string) =>
  md.split("\n").filter(l => !l.startsWith("#")).join("\n").trim();

const TITLE_EN = "Teltonika Commander — open-source web UI + Home Assistant add-on for Teltonika FMT/FMB GPS trackers";
const TITLE_DE = "Teltonika Commander — Open-Source Web-UI + Home Assistant Add-on für Teltonika GPS-Tracker";
const BODY_EN = extractBody(tpl("en"));
const BODY_DE = extractBody(tpl("de"));

// ── State (cooldown / posted URLs) ────────────────────────────────────────

type State = {
  lastPosted?: string;
  postedUrls?: Record<string, string>;
  accountsCreated?: Record<string, boolean>;
};

const loadState = (): State => {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")); } catch { return {}; }
};

const saveState = (s: State) =>
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

// ── IMAP: wait for verification email ─────────────────────────────────────

async function waitForVerificationLink(toEmail: string, timeoutMs = 120_000): Promise<string> {
  console.log(`[imap] waiting for verification email to ${toEmail}...`);
  const deadline = Date.now() + timeoutMs;
  const seenUids = new Set<number>();

  while (Date.now() < deadline) {
    const client = new ImapFlow({
      host: env.imap.host,
      port: env.imap.port,
      secure: true,
      auth: { user: env.imap.user, pass: env.imap.pass },
      logger: false,
    });

    try {
      await client.connect();
      await client.mailboxOpen("INBOX");

      // Search for unseen messages to toEmail
      const msgs = await client.search({ to: toEmail, seen: false }, { uid: true });
      if (!msgs || !Array.isArray(msgs)) { await client.logout(); continue; }

      for (const uid of msgs as number[]) {
        if (seenUids.has(uid)) continue;
        seenUids.add(uid);
        const msg = await client.fetchOne(String(uid), { source: true });
        if (!msg) continue;
        const raw = (msg as unknown as { source?: Buffer }).source?.toString() ?? "";
        const match = raw.match(/https?:\/\/[^\s"'<>\r\n]+(?:verif|confirm|activat|token)[^\s"'<>\r\n]*/i);
        if (match) {
          await client.logout();
          console.log(`[imap] found verification link: ${match[0]}`);
          return match[0];
        }
      }

      await client.logout();
    } catch (e) {
      try { await client.logout(); } catch {}
    }

    await new Promise(r => setTimeout(r, 8000));
  }

  throw new Error(`[imap] timeout waiting for verification email to ${toEmail}`);
}

async function waitForOtpCode(toEmail: string, timeoutMs = 120_000): Promise<string> {
  console.log(`[imap] waiting for OTP email to ${toEmail}...`);
  const deadline = Date.now() + timeoutMs;
  const seenUids = new Set<number>();

  while (Date.now() < deadline) {
    const client = new ImapFlow({
      host: env.imap.host, port: env.imap.port, secure: true,
      auth: { user: env.imap.user, pass: env.imap.pass },
      logger: false,
    });
    try {
      await client.connect();
      await client.mailboxOpen("INBOX");
      const msgs = await client.search({ to: toEmail, seen: false }, { uid: true });
      if (msgs && Array.isArray(msgs)) {
        for (const uid of msgs as number[]) {
          if (seenUids.has(uid)) continue;
          seenUids.add(uid);
          const msg = await client.fetchOne(String(uid), { source: true });
          if (!msg) continue;
          const raw = (msg as unknown as { source?: Buffer }).source?.toString() ?? "";
          // Look for 6-digit OTP code
          const match = raw.match(/\b(\d{6})\b/);
          if (match) { await client.logout(); return match[1]; }
        }
      }
      await client.logout();
    } catch { try { await client.logout(); } catch {} }
    await new Promise(r => setTimeout(r, 6000));
  }
  throw new Error(`[imap] timeout waiting for OTP to ${toEmail}`);
}

// ── Reddit ─────────────────────────────────────────────────────────────────

async function ensureRedditAccount(ctx: BrowserContext, state: State): Promise<void> {
  if (state.accountsCreated?.reddit) return;
  const page = await ctx.newPage();
  console.log("[reddit] registering account...");

  await page.goto("https://www.reddit.com/register/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Dismiss cookie banner
  await page.locator('button:has-text("Accept all")').click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // Fill email and continue
  await page.locator('input[name="email"]').fill(env.reddit.email);
  await page.waitForTimeout(500);
  await page.locator('button:visible:has-text("Continue")').first().click();

  // Reddit sends a 6-digit OTP code to the email — fetch it via IMAP
  await page.locator('input[name="code"]').waitFor({ state: "visible", timeout: 15000 });
  console.log("[reddit] OTP code required — fetching from IMAP...");
  const otp = await waitForOtpCode(env.reddit.email);
  console.log(`[reddit] OTP code: ${otp}`);
  await page.locator('input[name="code"]').fill(otp);
  await page.locator('button:visible:has-text("Continue")').last().click();
  await page.waitForTimeout(2000);

  // Now fill username + password
  await page.locator('input[name="username"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('input[name="username"]').fill(env.reddit.username);
  await page.locator('input[name="password"]').fill(env.password);
  await page.waitForTimeout(500);
  await page.locator('button:visible:has-text("Continue")').last().click();
  await page.waitForTimeout(4000);
  await page.close();

  // Verify email
  const link = await waitForVerificationLink(env.reddit.email);
  const vPage = await ctx.newPage();
  await vPage.goto(link);
  await vPage.waitForTimeout(2000);
  await vPage.close();

  state.accountsCreated = { ...state.accountsCreated, reddit: true };
  saveState(state);
  console.log("[reddit] account created and verified");
}

async function loginReddit(page: Page): Promise<void> {
  await page.goto("https://www.reddit.com/login/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.locator('button:has-text("Accept all")').click({ timeout: 5000 }).catch(() => {});

  // Already logged in?
  if (await page.locator(`a[href*="/user/${env.reddit.username}"]`).isVisible({ timeout: 3000 }).catch(() => false)) {
    console.log("[reddit] already logged in");
    return;
  }

  await page.locator('input[name="username"], #login-username').fill(env.reddit.username);
  await page.locator('input[name="password"], #login-password').fill(env.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  console.log("[reddit] logged in");
}

async function postReddit(page: Page, subreddit: string, title: string, body: string): Promise<string> {
  console.log(`[reddit] posting to r/${subreddit}...`);
  await page.goto(`https://www.reddit.com/r/${subreddit}/submit?type=self`);
  await page.waitForTimeout(3000);

  // Fill title
  await page.locator('textarea[placeholder*="Title"], input[placeholder*="Title"], [data-test-id="post-title"]').fill(title);

  // Fill body — try both old and new Reddit editor
  const bodyLocator = page.locator('.public-DraftEditor-content, [data-testid="post-body"], div[role="textbox"]').first();
  await bodyLocator.click();
  await bodyLocator.fill(body);

  await page.locator('button:has-text("Post"), button[type="submit"]:has-text("Post")').last().click();
  await page.waitForTimeout(4000);

  const url = page.url();
  console.log(`[reddit] posted: ${url}`);
  return url;
}

// ── Home Assistant Forum (Discourse) ──────────────────────────────────────

async function ensureHaForumAccount(ctx: BrowserContext, state: State): Promise<void> {
  if (state.accountsCreated?.haForum) return;
  const page = await ctx.newPage();
  console.log("[ha-forum] registering account...");

  await page.goto("https://community.home-assistant.io/signup");
  await page.waitForTimeout(2000);

  await page.fill('#new-account-email', env.haForum.email);
  await page.fill('#new-account-username', "teltonika-commander");
  await page.fill('#new-account-password', env.password);
  await page.locator('button.btn-primary:has-text("Create")').click();
  await page.waitForTimeout(3000);
  await page.close();

  const link = await waitForVerificationLink(env.haForum.email);
  const vPage = await ctx.newPage();
  await vPage.goto(link);
  await vPage.waitForTimeout(2000);
  await vPage.close();

  state.accountsCreated = { ...state.accountsCreated, haForum: true };
  saveState(state);
  console.log("[ha-forum] account created and verified");
}

async function loginHaForum(page: Page): Promise<void> {
  await page.goto("https://community.home-assistant.io/login");
  await page.waitForTimeout(2000);
  await page.fill('#login-account-name', env.haForum.email);
  await page.fill('#login-account-password', env.password);
  await page.locator('#login-button').click();
  await page.waitForTimeout(3000);
  console.log("[ha-forum] logged in");
}

async function postHaForum(page: Page, title: string, body: string): Promise<string> {
  console.log("[ha-forum] creating topic...");
  await page.goto("https://community.home-assistant.io/new-topic?category=share-your-projects");
  await page.waitForTimeout(3000);

  await page.fill('#reply-title', title);
  await page.locator('.d-editor-input').fill(body);
  await page.locator('#reply-control button.create').click();
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log(`[ha-forum] posted: ${url}`);
  return url;
}

// ── administrator.de ───────────────────────────────────────────────────────

async function ensureAdminDeAccount(ctx: BrowserContext, state: State): Promise<void> {
  if (state.accountsCreated?.adminDe) return;
  const page = await ctx.newPage();
  console.log("[admin.de] registering account...");

  await page.goto("https://www.administrator.de/contentid/members/register.php");
  await page.waitForTimeout(2000);

  await page.fill('input[name="username"]', "teltonika-commander").catch(() => {});
  await page.fill('input[name="email"]', env.adminDe.email).catch(() => {});
  await page.fill('input[name="password"]', env.password).catch(() => {});
  await page.fill('input[name="password_confirm"]', env.password).catch(() => {});
  await page.locator('input[type="submit"]').click();
  await page.waitForTimeout(3000);
  await page.close();

  // administrator.de may require email verification
  try {
    const link = await waitForVerificationLink(env.adminDe.email, 60_000);
    const vPage = await ctx.newPage();
    await vPage.goto(link);
    await vPage.waitForTimeout(2000);
    await vPage.close();
  } catch {
    console.log("[admin.de] no verification email required or timeout");
  }

  state.accountsCreated = { ...state.accountsCreated, adminDe: true };
  saveState(state);
  console.log("[admin.de] account created");
}

async function loginAdminDe(page: Page): Promise<void> {
  await page.goto("https://www.administrator.de/contentid/members/login.php");
  await page.waitForTimeout(1500);
  await page.fill('input[name="vb_login_username"]', "teltonika-commander");
  await page.fill('input[name="vb_login_password"]', env.password);
  await page.locator('input[type="submit"]').click();
  await page.waitForTimeout(2000);
  console.log("[admin.de] logged in");
}

async function postAdminDe(page: Page, title: string, body: string): Promise<string> {
  console.log("[admin.de] posting...");
  // Category 271 = Software & Anwendungen / GPS & Ortung area
  await page.goto("https://www.administrator.de/contentid/forum/newthread.php?do=newthread&f=271");
  await page.waitForTimeout(2000);
  await page.fill('input[name="subject"]', title);

  // vBulletin editor — try textarea first, then iframe
  const textarea = page.locator("textarea[name='message']");
  if (await textarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    await textarea.fill(body);
  } else {
    await page.locator("#vB_Editor_001_iframe").contentFrame()!.locator("body").fill(body);
  }

  await page.locator('input[type="submit"][value*="Submit"], input[type="submit"][value*="Absenden"]').click();
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log(`[admin.de] posted: ${url}`);
  return url;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const state = loadState();
  const results: Record<string, string> = state.postedUrls ?? {};

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  try {
    // ── Reddit ────────────────────────────────────────────────────────────
    await ensureRedditAccount(ctx, state);
    const redditPage = await ctx.newPage();
    await loginReddit(redditPage);

    for (const sub of ["homeassistant", "selfhosted", "Teltonika", "GPStracking"]) {
      if (results[`reddit/${sub}`]) {
        console.log(`[reddit] skipping r/${sub} (already posted: ${results[`reddit/${sub}`]})`);
        continue;
      }
      try {
        const url = await postReddit(redditPage, sub, TITLE_EN, BODY_EN);
        results[`reddit/${sub}`] = url;
        saveState({ ...state, postedUrls: results });
      } catch (e) {
        console.error(`[reddit] r/${sub} failed:`, (e as Error).message);
      }
      await new Promise(r => setTimeout(r, 15_000)); // rate limit
    }
    await redditPage.close();

    // ── HA Forum ──────────────────────────────────────────────────────────
    if (!results["ha-forum"]) {
      await ensureHaForumAccount(ctx, state);
      const haPage = await ctx.newPage();
      await loginHaForum(haPage);
      try {
        const url = await postHaForum(haPage, TITLE_EN, BODY_EN);
        results["ha-forum"] = url;
        saveState({ ...state, postedUrls: results });
      } catch (e) {
        console.error("[ha-forum] failed:", (e as Error).message);
      }
      await haPage.close();
    } else {
      console.log(`[ha-forum] skipping (already posted: ${results["ha-forum"]})`);
    }

    // ── administrator.de ──────────────────────────────────────────────────
    if (!results["admin.de"]) {
      await ensureAdminDeAccount(ctx, state);
      const adminPage = await ctx.newPage();
      await loginAdminDe(adminPage);
      try {
        const url = await postAdminDe(adminPage, TITLE_DE, BODY_DE);
        results["admin.de"] = url;
        saveState({ ...state, postedUrls: results });
      } catch (e) {
        console.error("[admin.de] failed:", (e as Error).message);
      }
      await adminPage.close();
    } else {
      console.log(`[admin.de] skipping (already posted: ${results["admin.de"]})`);
    }

  } finally {
    await browser.close();
  }

  state.lastPosted = new Date().toISOString();
  state.postedUrls = results;
  saveState(state);

  console.log("\n=== Results ===");
  for (const [platform, url] of Object.entries(results)) {
    console.log(`${platform}: ${url}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
