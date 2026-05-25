// `<ValueWithUnit>` claims: typing a SPICE prefix in the number box
// snaps the prefix into the dropdown on blur, and changing the
// dropdown rewrites only the suffix.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, waitFor } from "./_setup.mjs";

async function selectComponent(page, id) {
  const box = await page.evaluate((cid) => {
    const c = document.querySelector(`[data-component-id="${cid}"]`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, id);
  if (!box) throw new Error(`component ${id} not found`);
  await page.mouse.click(box.x, box.y);
  await waitFor(300);
}

/** Read the inspector's primary Value input + its unit-dropdown selection. */
async function readValueInput(page) {
  return page.evaluate(() => {
    const row = [...document.querySelectorAll(".inspector .row")].find(
      (r) => r.querySelector(".row-label")?.textContent?.trim() === "Value",
    );
    if (!row) return null;
    const input = row.querySelector(".value-with-unit-magnitude");
    const select = row.querySelector(".value-with-unit-select");
    return {
      magnitude: input ? input.value : null,
      prefix: select ? select.value : null,
      hasUnitSelect: !!select,
    };
  });
}

async function valueInputBox(page) {
  return page.evaluate(() => {
    const row = [...document.querySelectorAll(".inspector .row")].find(
      (r) => r.querySelector(".row-label")?.textContent?.trim() === "Value",
    );
    const i = row?.querySelector(".value-with-unit-magnitude");
    if (!i) return null;
    const b = i.getBoundingClientRect();
    return { x: b.x + 10, y: b.y + b.height / 2 };
  });
}

test("typing '2.2k' in a resistor Value snaps to magnitude=2.2 + prefix=k on blur", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    await selectComponent(page, "r1");
    const before = await readValueInput(page);
    assert.ok(before, "Value row should be present in the inspector");
    assert.ok(before.hasUnitSelect, "resistor Value should have a unit selector");

    const inputBox = await valueInputBox(page);
    await page.mouse.click(inputBox.x, inputBox.y);
    // select-all reliably (puppeteer's Cmd+A is inconsistent across input
    // implementations); HTMLInputElement.select() is unambiguous.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll(".inspector .row")].find(
        (r) => r.querySelector(".row-label")?.textContent?.trim() === "Value",
      );
      const i = row?.querySelector(".value-with-unit-magnitude");
      i?.focus();
      i?.select();
    });
    await page.keyboard.type("2.2k");
    await page.keyboard.press("Tab"); // blur triggers snap-on-blur
    await waitFor(400);

    const after = await readValueInput(page);
    assert.equal(after.magnitude, "2.2", "magnitude should snap to 2.2");
    assert.equal(after.prefix, "k", "prefix should snap to k");
  } finally {
    await browser.close();
  }
});

test("changing the unit dropdown rewrites only the prefix", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    await selectComponent(page, "r1");
    const before = await readValueInput(page);
    assert.ok(before, "Value row should be present");
    const originalMagnitude = before.magnitude;

    await page.evaluate(() => {
      const row = [...document.querySelectorAll(".inspector .row")].find(
        (r) => r.querySelector(".row-label")?.textContent?.trim() === "Value",
      );
      const sel = row?.querySelector(".value-with-unit-select");
      if (sel) {
        sel.value = "Meg";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await waitFor(300);

    const after = await readValueInput(page);
    assert.equal(after.prefix, "Meg", "prefix should switch to Meg");
    assert.equal(
      after.magnitude,
      originalMagnitude,
      `magnitude should remain ${originalMagnitude}; got ${after.magnitude}`,
    );
  } finally {
    await browser.close();
  }
});
