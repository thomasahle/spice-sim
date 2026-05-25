// Regression: canvas voltage labels must stay visible during the brief
// "stale" window between an edit and the next auto-run, not blink off.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, runSim, waitFor } from "./_setup.mjs";

test("voltage-pill overlays don't disappear during the auto-run stale window", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    // Switch to OP so the canvas shows the all-node voltage overlays
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.getAttribute("aria-label") === "Operating point analysis",
      );
      if (b) b.click();
    });
    await waitFor(400);
    await runSim(page);
    await waitFor(700);

    const before = await page.evaluate(() => {
      // The voltage pills render as <text> inside the canvas with the
      // accent fill — count any node-reading-shaped element.
      return document.querySelectorAll(".canvas text").length;
    });
    if (before === 0) return; // OP without probes in some demos — skip cleanly

    // Trigger an edit by typing a stop-time keystroke (auto-run schedules a
    // re-run after 400 ms). Sample the label count immediately so we see
    // the stale window.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll(".form-row")].find((r) =>
        r.textContent?.includes("Stop time"),
      );
      const inp = row?.querySelector("input");
      if (inp) {
        inp.focus();
        inp.value = String(inp.value) + "0";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    // Brief settle for React to apply the doc change + stale flag
    await waitFor(80);

    const during = await page.evaluate(() => document.querySelectorAll(".canvas text").length);
    assert.ok(
      during >= before * 0.5,
      `voltage labels should not collapse to ~0 during the stale window — before=${before} during=${during}`,
    );
  } finally {
    await browser.close();
  }
});
