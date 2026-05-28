import test from "node:test";
import assert from "node:assert/strict";

import { launchApp, runSim, waitFor } from "./_setup.mjs";

const DEV_URL = process.env.SPICESIM_E2E_URL ?? "http://localhost:5173/";

function docUrl(doc) {
  const payload = Buffer.from(JSON.stringify(doc), "utf8").toString("base64");
  return `${DEV_URL}?scope-trace-filter=${Date.now()}#doc=${encodeURIComponent(payload)}`;
}

function labeledRcDividerDoc() {
  return {
    pages: [
      {
        id: "p-scope-filter",
        name: "main",
        description: "Scope trace filtering smoke",
        components: [
          { id: "vin", kind: "V", x: -6, y: 1, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: -2, y: -1, rotation: 0, value: "1k" },
          { id: "r2", kind: "R", x: 2, y: -1, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 1, rotation: 0, value: "1u" },
          { id: "g1", kind: "GND", x: -6, y: 3.5, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 3.5, rotation: 0, value: "" },
          { id: "label-out", kind: "LABEL", x: 4, y: -1, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-r", points: [[-6, -1], [-4, -1]] },
          { id: "w-v-g", points: [[-6, 3], [-6, 3.5]] },
          { id: "w-c-g", points: [[4, 3], [4, 3.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-scope-filter",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

function labeledInOutRcDividerDoc() {
  const doc = labeledRcDividerDoc();
  const page = doc.pages[0];
  page.id = "p-scope-xy-filter";
  page.description = "Scope X/Y trace filtering smoke";
  page.components = [
    ...page.components,
    { id: "label-in", kind: "LABEL", x: -6, y: -1, rotation: 0, value: "in" },
  ];
  doc.activePageId = page.id;
  return doc;
}

async function waveformState(page) {
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll(".wf-trow-name")].map((el) => el.textContent?.trim() ?? ""),
    toggles: [...document.querySelectorAll(".wf-internal-toggle")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    debugTriggers: [...document.querySelectorAll(".wf-debug-trace-trigger")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""),
    actionButtons: [...document.querySelectorAll(".wf-trace-action")].map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  }));
}

async function clickWaveformToggle(page, labelPrefix) {
  await page.evaluate(() => {
    const trigger = document.querySelector(".wf-debug-trace-trigger");
    if (trigger instanceof HTMLButtonElement && !document.querySelector(".wf-internal-toggle")) {
      trigger.click();
    }
  });
  await page.waitForSelector(".wf-internal-toggle", { timeout: 2500 });
  const clicked = await page.evaluate((prefix) => {
    const button = [...document.querySelectorAll(".wf-internal-toggle")]
      .find((candidate) => candidate.textContent?.trim().startsWith(prefix));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  }, labelPrefix);
  assert.equal(clicked, true, `expected a waveform toggle starting with "${labelPrefix}"`);
  await waitFor(150);
}

async function clickWire(page, wireId) {
  const point = await page.evaluate((id) => {
    const el = document.querySelector(`.wire-hit-target[data-wire-id="${id}"]`);
    if (!(el instanceof SVGGraphicsElement)) return null;
    const bbox = el.getBBox();
    const matrix = el.getScreenCTM();
    if (!matrix) return null;
    const p = new DOMPoint(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2).matrixTransform(matrix);
    return { x: p.x, y: p.y };
  }, wireId);
  assert.ok(point, `expected clickable wire ${wireId}`);
  await page.mouse.click(point.x, point.y);
  await waitFor(180);
}

async function radixSelectOptions(page, ariaLabel) {
  await page.click(`button[aria-label="${ariaLabel}"]`);
  await page.waitForSelector(".radix-select-item", { timeout: 5000 });
  const options = await page.evaluate(() =>
    [...document.querySelectorAll(".radix-select-item")]
      .map((option) => option.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
  await page.keyboard.press("Escape");
  await waitFor(50);
  return options;
}

test("waveform list shows user-labeled nodes by default and hides internals/currents behind toggles", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(labeledRcDividerDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="label-out"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForFunction(
      () => Boolean(document.querySelector(".wf-pane")) ||
        Boolean(document.querySelector('button[aria-label="Simulation engine unavailable"]')) ||
        document.body.textContent?.includes("✗"),
      { timeout: 10000 },
    );

    const defaultState = await waveformState(page);
    assert.deepEqual(defaultState.rows, ["V(out)"], JSON.stringify(defaultState, null, 2));
    assert.deepEqual(defaultState.toggles, [], JSON.stringify(defaultState, null, 2));
    assert.ok(defaultState.debugTriggers.some((label) => /^\+ More traces\s*\d+/.test(label)), JSON.stringify(defaultState, null, 2));
    assert.deepEqual(defaultState.actionButtons, [], JSON.stringify(defaultState, null, 2));

    await clickWire(page, "w-v-r");
    const withClickedInternalWire = await waveformState(page);
    assert.ok(withClickedInternalWire.rows.includes("V(out)"), JSON.stringify(withClickedInternalWire, null, 2));
    assert.ok(
      withClickedInternalWire.rows.some((name) => /^V\(n\d+\)$/.test(name)),
      `clicking an unlabeled wire should add that exact internal node trace without enabling every internal node: ${JSON.stringify(withClickedInternalWire, null, 2)}`,
    );
    assert.equal(
      withClickedInternalWire.rows.filter((name) => /^V\(n\d+\)$/.test(name)).length,
      1,
      `wire click should add one ad-hoc internal node, not turn on the whole internal-node bucket: ${JSON.stringify(withClickedInternalWire, null, 2)}`,
    );

    await clickWaveformToggle(page, "Internal nodes");
    const withAllNodes = await waveformState(page);
    assert.ok(withAllNodes.rows.includes("V(out)"), JSON.stringify(withAllNodes, null, 2));
    assert.ok(
      withAllNodes.rows.some((name) => /^V\(n\d+\)$/.test(name)),
      `expected auto-generated node traces only after Internal nodes: ${JSON.stringify(withAllNodes, null, 2)}`,
    );
    assert.equal(
      withAllNodes.rows.some((name) => /^I\(/.test(name)),
      false,
      `currents should remain hidden until the Currents toggle: ${JSON.stringify(withAllNodes, null, 2)}`,
    );

    await clickWaveformToggle(page, "Currents");
    const withCurrents = await waveformState(page);
    assert.ok(
      withCurrents.rows.some((name) => /^I\(/.test(name)),
      `expected branch/device currents after Currents toggle: ${JSON.stringify(withCurrents, null, 2)}`,
    );
  } finally {
    await browser.close();
  }
});

test("X/Y selectors lead with user-labeled voltages, then offer currents for I–V curves", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(labeledInOutRcDividerDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="label-out"]', { timeout: 5000 });
    await page.waitForSelector('[data-component-id="label-in"]', { timeout: 5000 });

    await runSim(page);
    await page.waitForSelector(".wf-pane", { timeout: 10000 });

    const clicked = await page.evaluate(() => {
      const button = document.querySelector('button[data-waveform-tab="xy"]');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    });
    assert.equal(clicked, true, "expected X/Y Plot tab to be enabled");
    await page.waitForSelector('button[aria-label="X trace"]', { timeout: 5000 });

    const selectors = {
      xOptions: await radixSelectOptions(page, "X trace"),
      yOptions: await radixSelectOptions(page, "Y trace"),
    };

    // User-labeled voltages lead (so the default stays V-vs-V), but currents
    // are now appended so I–V / transfer curves can be plotted. Distinct raw
    // vectors that share a display label (e.g. v1#branch and i(v1) → "I(V1)")
    // are collapsed to a single option.
    const expectVoltagesFirst = (options) => {
      assert.deepEqual(options.slice(0, 2), ["V(in)", "V(out)"], JSON.stringify(selectors, null, 2));
      assert.ok(options.some((name) => /^I\(/.test(name)), JSON.stringify(selectors, null, 2));
      assert.equal(new Set(options).size, options.length, `no duplicate labels: ${JSON.stringify(options)}`);
    };
    expectVoltagesFirst(selectors.xOptions);
    expectVoltagesFirst(selectors.yOptions);
  } finally {
    await browser.close();
  }
});
