// Regression: WaveformViewer must not unmount + remount on every
// auto-run cycle. Before the fix it had `key={waveformRunKey}` which
// blew away the scope's internal state on each sim.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, runSim, waitFor } from "./_setup.mjs";

test("re-running the same sim keeps the same waveform DOM node", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    // First run to make sure the scope is mounted
    await runSim(page);
    await waitFor(800);
    const tagged = await page.evaluate(() => {
      const n = document.querySelector(".wf-pane");
      if (!n) return false;
      n.setAttribute("data-e2e-tag", "first");
      return true;
    });
    assert.ok(tagged, "waveform pane should be present after the first run");

    // Second run — should reuse the same DOM node
    await runSim(page);
    await waitFor(800);
    const stillTagged = await page.evaluate(
      () => document.querySelector(".wf-pane")?.getAttribute("data-e2e-tag"),
    );
    assert.equal(
      stillTagged,
      "first",
      "WaveformViewer should NOT remount on re-run (tag should survive)",
    );
  } finally {
    await browser.close();
  }
});
