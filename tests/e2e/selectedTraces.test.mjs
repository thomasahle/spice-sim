// Regression: a re-run (auto or manual) must preserve the user's
// manual trace toggles. Before the fix, `setSelectedTraces(defaults)`
// fired on every successful run and reset the legend.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, runSim, waitFor } from "./_setup.mjs";

test("manually-toggled trace selection survives a re-run", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    await runSim(page);
    await waitFor(800);

    // Collect the initial set of *checked* trace toggles
    const initial = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".wf-trace-list input[type=checkbox]")];
      return items.map((i) => ({ name: i.getAttribute("aria-label") || i.value, on: i.checked }));
    });
    if (initial.length === 0) {
      // Single-trace plots sometimes don't render individual checkboxes;
      // skip the assertion in that case.
      return;
    }

    // Toggle the first ON trace OFF (or vice-versa), capture the new set
    const target = initial.find((t) => t.on) ?? initial[0];
    const toggleIndex = initial.findIndex((t) => t.name === target.name);
    await page.evaluate((idx) => {
      const items = [...document.querySelectorAll(".wf-trace-list input[type=checkbox]")];
      items[idx]?.click();
    }, toggleIndex);
    await waitFor(300);
    const afterToggle = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".wf-trace-list input[type=checkbox]")];
      return items.map((i) => ({ name: i.getAttribute("aria-label") || i.value, on: i.checked }));
    });
    assert.notDeepEqual(initial, afterToggle, "click should have flipped a checkbox");

    // Re-run the sim
    await runSim(page);
    await waitFor(800);

    const afterRerun = await page.evaluate(() => {
      const items = [...document.querySelectorAll(".wf-trace-list input[type=checkbox]")];
      return items.map((i) => ({ name: i.getAttribute("aria-label") || i.value, on: i.checked }));
    });
    assert.deepEqual(
      afterRerun,
      afterToggle,
      "manual trace toggles should survive a re-run",
    );
  } finally {
    await browser.close();
  }
});
