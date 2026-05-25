// Regression: ⌘Z must reach the doc-level undo stack even when focus is
// inside a controlled input. Browser-native input undo doesn't work on
// React-controlled inputs whose value is rewritten on every keystroke,
// so the keyboard handler has to fire ours first.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, waitFor } from "./_setup.mjs";

async function readStopTime(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll(".form-row")];
    for (const r of rows) {
      if (r.textContent?.includes("Stop time")) {
        const i = r.querySelector("input");
        return i?.value ?? null;
      }
    }
    return null;
  });
}

test("Cmd+Z from inside the Stop time input undoes the doc-level edit", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC step response" });
  try {
    const original = await readStopTime(page);
    assert.ok(original, "Stop time input should be present");

    // Click into the input, replace its contents with "25"
    const inputBox = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".form-row")];
      for (const r of rows) {
        if (r.textContent?.includes("Stop time")) {
          const i = r.querySelector("input");
          if (!i) return null;
          const b = i.getBoundingClientRect();
          return { x: b.x + 10, y: b.y + b.height / 2 };
        }
      }
      return null;
    });
    assert.ok(inputBox, "Stop time input should be measurable");

    await page.mouse.click(inputBox.x, inputBox.y);
    await waitFor(150);
    // Type "25" — each keystroke commits to the doc undo stack
    await page.keyboard.type("25");
    await waitFor(400);
    const afterType = await readStopTime(page);
    assert.notEqual(afterType, original, "typing should change the input value");

    // Cmd+Z while still focused on the input
    await page.keyboard.down("Meta");
    await page.keyboard.press("KeyZ");
    await page.keyboard.up("Meta");
    await waitFor(400);
    const afterUndo = await readStopTime(page);
    assert.notEqual(
      afterUndo,
      afterType,
      "Cmd+Z while focused on a value input should reach the doc undo",
    );
  } finally {
    await browser.close();
  }
});
