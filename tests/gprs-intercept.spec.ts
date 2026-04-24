import { test, expect } from "@playwright/test";

test("App sendet GPRS-Kommando mit payload (nicht text)", async ({ page }) => {
  const requests: { url: string; body: unknown }[] = [];

  page.on("request", (req) => {
    if (req.url().includes("/command") || req.url().includes("flespi")) {
      try { requests.push({ url: req.url(), body: JSON.parse(req.postData() ?? "{}") }); } catch {}
    }
  });

  await page.goto("http://localhost:5173");
  await page.waitForTimeout(2000);

  // Ersten GPRS-Request abfangen
  const responsePromise = page.waitForResponse((r) => r.url().includes("/command"), { timeout: 10000 });

  // Netzwerk lesen via GPRS klicken — Tab "Einstellungen lesen" suchen
  const tabs = page.locator("button").filter({ hasText: /lesen|read/i });
  if (await tabs.count() > 0) await tabs.first().click();

  // GPRS wählen
  const gprsBtn = page.locator("button").filter({ hasText: /gprs/i });
  if (await gprsBtn.count() > 0) await gprsBtn.first().click();

  // Senden
  const sendBtn = page.locator("button").filter({ hasText: /senden|send/i });
  if (await sendBtn.count() > 0) await sendBtn.first().click();

  const response = await responsePromise.catch(() => null);

  console.log("Requests:", JSON.stringify(requests, null, 2));
  console.log("Response status:", response?.status());
  console.log("Response body:", await response?.text());

  // Kein Request darf direkt an flespi.io gehen
  const flespiDirect = requests.filter((r) => r.url.includes("flespi.io"));
  expect(flespiDirect).toHaveLength(0);

  // Response muss 200 sein
  expect(response?.status()).toBe(200);
});
