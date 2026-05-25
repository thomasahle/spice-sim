// Regression: a click (or sub-component-length drag) on a pin in Select
// mode must NOT commit a wire. Wires only appear when the user drags
// further than a component's pin-to-pin length away from the start point.

import test from "node:test";
import assert from "node:assert/strict";
import {
  launchApp,
  countWires,
  getComponentPin,
  waitFor,
} from "./_setup.mjs";

async function getZoomScale(page) {
  // Inspector status bar shows "Zoom: NNN%". 1 cell unit = 20 * (zoom%/100) px.
  const pct = await page.evaluate(() => {
    const el = [...document.querySelectorAll("span")].find((e) =>
      e.textContent?.startsWith("Zoom:"),
    );
    const m = el?.textContent?.match(/(\d+)%/);
    return m ? Number(m[1]) : 100;
  });
  return 20 * (pct / 100);
}

test("static click on a component pin selects but does not create a wire", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    const pin = await getComponentPin(page, "v1");
    assert.ok(pin, "expected V1's first connection handle to be discoverable");

    const before = await countWires(page);
    await page.mouse.click(pin.x, pin.y);
    await waitFor(400);
    const after = await countWires(page);

    assert.equal(after - before, 0, "stationary pin click must not commit a wire");
  } finally {
    await browser.close();
  }
});

test("short drag from a pin (sub component length) does not create a wire", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    const pin = await getComponentPin(page, "v1");
    const px = await getZoomScale(page);
    // 2 cell units — half a typical component, well under the 4-unit
    // quick-wire commit threshold.
    const dragPx = Math.round(2 * px);

    const before = await countWires(page);
    await page.mouse.move(pin.x, pin.y);
    await page.mouse.down();
    await page.mouse.move(pin.x + dragPx, pin.y, { steps: 6 });
    await page.mouse.up();
    await waitFor(500);
    const after = await countWires(page);

    assert.equal(
      after - before,
      0,
      `2-unit drag (${dragPx}px) must not commit a wire`,
    );
  } finally {
    await browser.close();
  }
});

test("long drag from a pin (≥ component length) commits a wire", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    const pin = await getComponentPin(page, "v1");
    const px = await getZoomScale(page);
    // 6 cell units — comfortably past the 4-unit threshold.
    const dragPx = Math.round(6 * px);

    const before = await countWires(page);
    await page.mouse.move(pin.x, pin.y);
    await page.mouse.down();
    await page.mouse.move(pin.x + dragPx, pin.y, { steps: 12 });
    await page.mouse.up();
    await waitFor(700);
    const after = await countWires(page);

    assert.ok(
      after > before,
      `expected new wires after a 6-unit drag (${dragPx}px); before=${before} after=${after}`,
    );
  } finally {
    await browser.close();
  }
});
