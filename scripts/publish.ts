import { chromium, type Page } from "playwright";
import * as fs from "fs";
import * as path from "path";

const envFile = path.join(__dirname, "private.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const PASSWORD = process.env.ANNOUNCE_PASSWORD!;
const MAILCOW_BASE = process.env.MAILCOW_BASE_URL!;
const MAILCOW_KEY = process.env.MAILCOW_API_KEY!;

const GITHUB_URL = "https://github.com/kpma1985/teltonika-commander";
const VERSION = process.env.RELEASE_VERSION ?? "v1.0";

const tpl = (lang: "en" | "de") =>
  fs.readFileSync(path.join(__dirname, "post-templates", `${lang}.md`), "utf-8");

const titleEn = `Teltonika Commander — open-source web UI + Home Assistant add-on for Teltonika FMT/FMB GPS trackers`;
const titleDe = `Teltonika Commander — Open-Source Web-UI + Home Assistant Add-on für Teltonika GPS-Tracker`;
const bodyEn = tpl("en").replace(/^#.*\n+/m, "").replace(/^## .*\n/gm, "").trim();
const bodyDe = tpl("de").replace(/^#.*\n+/m, "").replace(/^## .*\n/gm, "").trim();

// ── Mailcow: fetch verification link from inbox ────────────────────────────

async function fetchVerificationLink(toEmail: string, retries = 12): Promise<string | null> {
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${MAILCOW_BASE}/api/v1/get/mailbox/${toEmail.split("@")[0]}`, {
        headers: { "X-API-Key": MAILCOW_KEY },
      });
      const data = await res.json() as { messages?: Array<{ body_html?: string; body_text?: string }> };
      const messages = data?.messages ?? [];
      for (const msg of messages.reverse()) {
        const body = msg.body_html ?? msg.body_text ?? "";
        const match = body.match(/https?:\/\/[^\s"'<>]+(?:verify|confirm|activate)[^\s"'<>]*/i);
        if (match) return match[0];
      }
    } catch {
      // retry
    }
  }
  return null;
}

// ── Reddit ─────────────────────────────────────────────────────────────────

async function postReddit(page: Page, subreddit: string, title: string, body: string) {
  console.log(`[reddit] posting to r/${subreddit}...`);
  await page.goto(`https://www.reddit.com/r/${subreddit}/submit`);
  await page.waitForTimeout(2000);

  // Accept cookies if prompted
  const acceptBtn = page.locator('button:has-text("Accept all")');
  if (await acceptBtn.isVisible({ timeout: 3000 }).catch(() => false)) await acceptBtn.click();

  // Switch to text post
  await page.locator('[data-testid="post-content-tab-text"]').click().catch(() => {});
  await page.fill('[placeholder*="Title"]', title);
  await page.locator('.public-DraftEditor-content, [data-testid="post-body"]').fill(body);
  await page.locator('button:has-text("Post")').click();
  await page.waitForTimeout(3000);
  console.log(`[reddit] posted to r/${subreddit}: ${page.url()}`);
}

async function loginReddit(page: Page) {
  const email = process.env.REDDIT_EMAIL!;
  const username = process.env.REDDIT_USERNAME!;

  await page.goto("https://www.reddit.com/login");
  await page.waitForTimeout(1000);

  // Check if already logged in
  if (await page.locator(`text=${username}`).isVisible({ timeout: 3000 }).catch(() => false)) return;

  await page.fill("#loginUsername", username);
  await page.fill("#loginPassword", PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log(`[reddit] logged in as ${username}`);
}

// ── Home Assistant Forum (Discourse) ──────────────────────────────────────

async function loginHaForum(page: Page) {
  const email = process.env.HA_FORUM_EMAIL!;
  await page.goto("https://community.home-assistant.io/session");
  await page.fill("#login-account-name", email);
  await page.fill("#login-account-password", PASSWORD);
  await page.locator("#login-button").click();
  await page.waitForTimeout(3000);
  console.log(`[ha-forum] logged in`);
}

async function postHaForum(page: Page, title: string, body: string) {
  console.log(`[ha-forum] creating new topic...`);
  await page.goto("https://community.home-assistant.io/new-topic?category=projects");
  await page.waitForTimeout(2000);
  await page.fill("#reply-title", title);
  await page.locator(".d-editor-input").fill(body);
  await page.locator("#reply-control button.create").click();
  await page.waitForTimeout(4000);
  console.log(`[ha-forum] posted: ${page.url()}`);
}

// ── administrator.de ───────────────────────────────────────────────────────

async function loginAdminDe(page: Page) {
  const email = process.env.ADMIN_DE_EMAIL!;
  await page.goto("https://www.administrator.de/contentid/members/login.php");
  await page.fill('input[name="vb_login_username"]', email.split("@")[0]);
  await page.fill('input[name="vb_login_password"]', PASSWORD);
  await page.locator('input[type="submit"]').click();
  await page.waitForTimeout(2000);
  console.log(`[admin.de] logged in`);
}

async function postAdminDe(page: Page, title: string, body: string) {
  console.log(`[admin.de] posting...`);
  await page.goto("https://www.administrator.de/contentid/forum/newthread.php?do=newthread&f=271");
  await page.waitForTimeout(2000);
  await page.fill('input[name="subject"]', title);
  await page.locator("#vB_Editor_001_iframe, textarea[name='message']").fill(body);
  await page.locator('input[type="submit"][value*="Submit"]').click();
  await page.waitForTimeout(3000);
  console.log(`[admin.de] posted: ${page.url()}`);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results: Record<string, string> = {};

  try {
    // Reddit — EN posts to multiple subreddits
    await loginReddit(page);
    for (const sub of ["homeassistant", "selfhosted", "Teltonika", "GPStracking"]) {
      await postReddit(page, sub, titleEn, bodyEn);
      results[`reddit/${sub}`] = page.url();
      await page.waitForTimeout(10000); // rate limit protection
    }

    // HA Forum — EN
    await loginHaForum(page);
    await postHaForum(page, titleEn, bodyEn);
    results["ha-forum"] = page.url();

    // administrator.de — DE
    await loginAdminDe(page);
    await postAdminDe(page, titleDe, bodyDe);
    results["admin.de"] = page.url();
  } finally {
    await browser.close();
  }

  console.log("\n=== Results ===");
  for (const [platform, url] of Object.entries(results)) {
    console.log(`${platform}: ${url}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
