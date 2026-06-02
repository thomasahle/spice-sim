// Node tool (Model C, §13.8): a wire's intermediary BENDS get handles (square,
// distinct from round graph-node handles), clicking one selects it, Delete drops
// the waypoint (the wire routes through the rest), and undo restores it. This is
// the "delete intermediary points" capability — bends are NOT graph nodes, so
// they need their own handles.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, waitFor } from "./_setup.mjs";

const bendHandles = (page) =>
  page.evaluate(() => document.querySelectorAll(".node-edit-handles rect").length);
const nodeHandles = (page) =>
  page.evaluate(() => document.querySelectorAll(".node-edit-handles circle").length);

test("Node tool: bends get handles, delete removes one, undo restores it", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    // Enter the Node tool — handles appear for nodes (circles) and bends (squares).
    await page.keyboard.press("n");
    await waitFor(250);
    assert.ok(await nodeHandles(page) > 0, "Node tool shows graph-node handles");
    const bends = await bendHandles(page);
    assert.ok(bends > 0, "wire bends get handles in the Node tool");

    // Click the first bend handle → it selects (fills with the accent colour).
    const selected = await page.evaluate(async () => {
      const sq = document.querySelector(".node-edit-handles rect");
      const r = sq.getBoundingClientRect();
      sq.closest("svg").dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
          button: 0,
          bubbles: true,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
      await new Promise((res) => setTimeout(res, 150));
      return [...document.querySelectorAll(".node-edit-handles rect")].filter((s) =>
        (s.getAttribute("fill") || "").includes("accent"),
      ).length;
    });
    assert.equal(selected, 1, "clicking a bend handle selects exactly that bend");

    // Delete drops the bend.
    const before = await bendHandles(page);
    await page.keyboard.press("Delete");
    await waitFor(250);
    assert.equal(await bendHandles(page), before - 1, "Delete removes exactly one bend");

    // Undo restores it (it was a real, undoable commit).
    const mod = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.down(mod);
    await page.keyboard.press("z");
    await page.keyboard.up(mod);
    await waitFor(300);
    assert.equal(await bendHandles(page), before, "undo restores the deleted bend");
  } finally {
    await browser.close();
  }
});
