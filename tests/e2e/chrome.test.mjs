// Static DOM assertions for the UI chrome — header link text, close
// buttons rendering as SVGs, tooltip stacking context. These all came
// out of one-line CSS / JSX changes; easy to regress, easy to verify.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, runSim, waitFor } from "./_setup.mjs";

test("header GitHub link says 'GitHub' and the star uses ink colour", async () => {
  const { browser, page } = await launchApp();
  try {
    const info = await page.evaluate(() => {
      const a = document.querySelector(".app-header-stars");
      const label = a?.querySelector(".app-header-stars-label")?.textContent;
      const svg = a?.querySelector("svg");
      const color = svg ? getComputedStyle(svg).color : null;
      return { label, color };
    });
    assert.equal(info.label, "GitHub", "header link label should be 'GitHub'");
    // The CSS sets `color: var(--ink)`. Whatever the resolved RGB is, it
    // must NOT be the old gold accent (#f6c54f).
    assert.doesNotMatch(
      info.color ?? "",
      /246,\s*197,\s*79/,
      `star colour should not be the old gold (#f6c54f); got ${info.color}`,
    );
  } finally {
    await browser.close();
  }
});

test("WaveformViewer close button renders as an SVG inside .icon-btn", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    await runSim(page);
    await waitFor(800);
    const closeInfo = await page.evaluate(() => {
      const wf = document.querySelector(".wf-pane");
      const btn = wf?.querySelector(".icon-btn");
      const svg = btn?.querySelector("svg");
      return {
        present: !!btn,
        ariaLabel: btn?.getAttribute("aria-label"),
        hasSvg: !!svg,
        linesInSvg: svg?.querySelectorAll("line").length ?? 0,
      };
    });
    assert.equal(closeInfo.present, true, "scope pane should have a close button");
    assert.equal(closeInfo.ariaLabel, "Close waveform");
    assert.equal(closeInfo.hasSvg, true, "close button should render an SVG");
    assert.equal(closeInfo.linesInSvg, 2, "X glyph should be two crossing lines");
  } finally {
    await browser.close();
  }
});

test("tool-strip lives outside .canvas-wrap clipping so tooltips can overflow", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    // The fix was to bump .tool-strip z-index above the playbar's stacking
    // context. Verify it's > 12 (its old value) and the canvas-wrap allows
    // visible overflow.
    const stacking = await page.evaluate(() => {
      const strip = document.querySelector(".tool-strip");
      const wrap = document.querySelector(".canvas-wrap");
      if (!strip || !wrap) return null;
      const sZ = parseInt(getComputedStyle(strip).zIndex, 10);
      const wOverflow = getComputedStyle(wrap).overflow;
      return { stripZ: sZ, wrapOverflow: wOverflow };
    });
    assert.ok(stacking, "expected .tool-strip and .canvas-wrap to be present");
    assert.ok(
      stacking.stripZ >= 40,
      `tool-strip z-index should be ≥ 40 (was 12 before the fix); got ${stacking.stripZ}`,
    );
    assert.equal(
      stacking.wrapOverflow,
      "visible",
      `canvas-wrap overflow should be visible so tooltips aren't clipped; got '${stacking.wrapOverflow}'`,
    );
  } finally {
    await browser.close();
  }
});
