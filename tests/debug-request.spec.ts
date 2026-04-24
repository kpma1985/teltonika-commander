import { test } from "@playwright/test";

test("debug: POST requests der App", async ({ page }) => {
  page.on("request", (req) => {
    if (req.method() === "POST") {
      console.log("\nPOST", req.url());
      console.log("BODY", req.postData());
    }
  });
  page.on("response", async (res) => {
    if (res.request().method() === "POST") {
      const body = await res.text().catch(() => "?");
      console.log("\nRESP", res.status(), res.url());
      console.log("BODY", body.slice(0, 300));
    }
  });

  await page.goto("http://localhost:5173");
  await page.waitForTimeout(2000);

  // Screenshot für Debugging
  await page.screenshot({ path: "test-results/app-state.png", fullPage: true });

  // Alle sichtbaren Buttons ausgeben
  const buttons = await page.locator("button").allTextContents();
  console.log("\nButtons:", buttons.join(" | "));

  await page.waitForTimeout(500);

  // Tab "Einstellungen lesen" — suche flexibler
  const settingsTab = page.locator("button").filter({ hasText: /lesen/i });
  if (await settingsTab.count() > 0) {
    console.log("Klick: lesen");
    await settingsTab.first().click();
    await page.waitForTimeout(500);
  }

  // GPRS
  const gprs = page.locator("button").filter({ hasText: /^GPRS/i });
  if (await gprs.count() > 0) {
    console.log("Klick: GPRS");
    await gprs.first().click();
    await page.waitForTimeout(300);
  }

  // Senden
  const send = page.locator("button").filter({ hasText: /^Senden$/i });
  if (await send.count() > 0) {
    console.log("Klick: Senden");
    await send.first().click();
    await page.waitForTimeout(3000);
  } else {
    console.log("Kein Senden-Button gefunden");
    const allBtns = await page.locator("button").allTextContents();
    console.log("Alle Buttons:", allBtns.join(" | "));
  }
});
