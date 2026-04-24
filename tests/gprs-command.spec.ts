import { test, expect } from "@playwright/test";

// Prüft ob GPRS-Kommandos korrekt mit { payload } und nicht { text } an Flespi gehen
test("GPRS settings-read sendet payload (nicht text) an Flespi", async ({ request }) => {
  // Direkt ans Backend
  const res = await request.post("http://localhost:3001/api/devices/5919378/command", {
    data: { channel: "gprs", data: { preset: "settings-read", profile: "server" } },
  });

  expect(res.status()).toBe(200);
  const body = await res.json();

  // Alle results müssen queued sein — kein Flespi-400-Fehler
  expect(body.results).toBeDefined();
  expect(body.results.length).toBeGreaterThan(0);
  for (const r of body.results) {
    expect(r.status).toBe("queued");
    expect(r.externalId).toBeTruthy();
  }
});

test("Flespi akzeptiert payload-Format direkt", async ({ request }) => {
  const token = process.env.FLESPI_TOKEN;
  if (!token) throw new Error("FLESPI_TOKEN nicht gesetzt");

  const res = await request.post(
    "https://flespi.io/gw/devices/5919378/commands-queue",
    {
      headers: { Authorization: `FlespiToken ${token}` },
      data: [{ name: "custom", properties: { payload: "getparam 2004" } }],
    }
  );

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.result).toBeDefined();
  expect(body.result.length).toBeGreaterThan(0);
  expect(body.errors ?? []).toHaveLength(0);
});
