// Regression: switching to DC and clicking Run must produce a visible
// scope with the sweep variable on the X axis. Two distinct bugs (the
// `dcsweep` vs `dc` kind mismatch, and the `v(v-sweep)` scale detection)
// both manifested as "No waveform axis returned" — this test would have
// caught both before they reached the user.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, selectAnalysis, runSim, waitFor } from "./_setup.mjs";

test("DC sweep on the voltage divider renders a scope", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await selectAnalysis(page, "DC");
    await runSim(page);
    await waitFor(500);

    const result = await page.evaluate(() => ({
      scopeRendered: !!document.querySelector(".wf-pane"),
      noAxisShown: document.body.textContent?.includes("No waveform axis"),
      analysisChip: [...document.querySelectorAll(".statusbar code")]
        .map((c) => c.textContent?.trim())
        .find((t) => /^(TRAN|AC|DC|OP)$/.test(t ?? "")),
    }));

    assert.equal(result.analysisChip, "DC", "status bar should show DC analysis");
    assert.equal(
      result.noAxisShown,
      false,
      "the 'No waveform axis returned' empty state should NOT be visible after a successful DC sweep",
    );
    assert.equal(
      result.scopeRendered,
      true,
      "the waveform pane should render after a successful DC sweep",
    );
  } finally {
    await browser.close();
  }
});
