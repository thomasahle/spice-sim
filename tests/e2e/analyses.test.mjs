// Each analysis kind end-to-end: a fresh load of an appropriate demo,
// click the analysis pill, click Run, assert the scope renders the
// expected axis. Catches breakage in the editor↔backend handshake at
// the same layer the user sees.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, selectAnalysis, runSim, waitFor } from "./_setup.mjs";

async function scopeState(page) {
  return page.evaluate(() => ({
    scopeRendered: !!document.querySelector(".wf-pane"),
    xAxisLabel: document.querySelector(".wf-pane")?.textContent?.match(
      /(Time|Frequency|sweep)\s*\(([^)]+)\)/i,
    )?.[0],
    noAxisShown: document.body.textContent?.includes("No waveform axis"),
    analysisChip: [...document.querySelectorAll(".statusbar code")]
      .map((c) => c.textContent?.trim())
      .find((t) => /^(TRAN|AC|DC|OP)$/.test(t ?? "")),
  }));
}

test("Tran on RC step renders a scope with a Time axis", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    // RC step demo loads pre-configured for transient.
    await runSim(page);
    await waitFor(600);
    const s = await scopeState(page);
    assert.equal(s.analysisChip, "TRAN");
    assert.equal(s.noAxisShown, false, "scope must not show 'No waveform axis'");
    assert.equal(s.scopeRendered, true, "scope pane should render");
    assert.match(
      s.xAxisLabel ?? "",
      /Time/i,
      `expected a Time x-axis, got ${JSON.stringify(s.xAxisLabel)}`,
    );
  } finally {
    await browser.close();
  }
});

test("OP on voltage divider does not pretend to render a waveform", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await selectAnalysis(page, "OP");
    await runSim(page);
    await waitFor(600);
    const s = await scopeState(page);
    assert.equal(s.analysisChip, "OP");
    // OP plots a single operating point — the scope intentionally goes
    // empty-state with the OP-specific copy.
    const opMsg = await page.evaluate(() =>
      document.body.textContent?.includes("Operating point has no waveform"),
    );
    assert.ok(opMsg, "scope should show the OP-specific empty state");
  } finally {
    await browser.close();
  }
});
