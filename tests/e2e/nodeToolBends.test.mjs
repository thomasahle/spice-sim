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
const statusNodes = (page) =>
  page.evaluate(() => {
    const m = (document.body.innerText || "").match(/Nodes\s+(\d+)/);
    return m ? +m[1] : null;
  });
const selectedNodeHandles = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll(".node-edit-handles circle")].filter((c) =>
        (c.getAttribute("fill") || "").includes("accent"),
      ).length,
  );
// Standalone (non-pin) graph nodes as {id,x,y} — these are the draggable ones.
const standaloneNodes = (page) =>
  page.evaluate(() => {
    const g = window.__qa.graphPage();
    const pin = new Set();
    for (const c of g.components) for (const id of c.pins || []) pin.add(id);
    return (g.nodes || []).filter((n) => !pin.has(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
  });

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

// §13.9.7 — Delete on exactly two selected nodes that are ADJACENT on a wire
// (the two endpoints of a bend-free edge) splits the wire between them, severing
// the net. This is in addition to the click-a-segment→Delete split.
test("Node tool: Delete on two adjacent selected nodes splits the wire between them", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })));
    await waitFor(250);
    // The two endpoints of a bend-free wire are adjacent graph nodes.
    const ends = await page.evaluate(() => {
      const g = window.__qa.graphPage();
      const lg = window.__qa.legacyPage();
      const gw = g.wires.find((w) => w.bends.length === 0);
      if (!gw) return null;
      const lw = lg.wires.find((w) => w.id === gw.id);
      if (!lw) return null;
      return { a: lw.points[0], b: lw.points[lw.points.length - 1] };
    });
    assert.ok(ends, "found a bend-free wire");
    const sa = await page.evaluate((p) => window.__qa.worldToScreen(p[0], p[1]), ends.a);
    const sb = await page.evaluate((p) => window.__qa.worldToScreen(p[0], p[1]), ends.b);
    const before = await statusNodes(page);
    // Click one endpoint node, shift-click the other → two nodes selected.
    await page.mouse.click(sa.x, sa.y);
    await waitFor(150);
    await page.keyboard.down("Shift");
    await page.mouse.click(sb.x, sb.y);
    await page.keyboard.up("Shift");
    await waitFor(150);
    assert.equal(await selectedNodeHandles(page), 2, "two node handles are selected");
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    await waitFor(300);
    assert.ok((await statusNodes(page)) > before, "splitting between the two nodes severs a net");
  } finally {
    await browser.close();
  }
});

// §13.9.5 — A window rubber-band selects every node inside the box; dragging one
// selected standalone node moves ALL selected standalone nodes by the same delta
// (pin-nodes in the selection are not moved — they follow their components).
test("Node tool: rubber-band selects nodes and dragging moves them together", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })));
    await waitFor(250);
    // Create standalone nodes by splitting two bend-wire end segments.
    const splitOneBendWire = async () => {
      const mid = await page.evaluate(() => {
        const g = window.__qa.graphPage();
        const lg = window.__qa.legacyPage();
        const gw = g.wires.find((w) => w.bends.length >= 1);
        if (!gw) return null;
        const lw = lg.wires.find((w) => w.id === gw.id);
        if (!lw) return null;
        const p1 = lw.points[1];
        const p2 = lw.points[lw.points.length - 1];
        return { x: (p1[0] + p2[0]) / 2, y: (p1[1] + p2[1]) / 2 };
      });
      if (!mid) return false;
      const s = await page.evaluate((m) => window.__qa.worldToScreen(m.x, m.y), mid);
      await page.mouse.click(s.x, s.y);
      await waitFor(150);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
      await waitFor(250);
      return true;
    };
    await splitOneBendWire();
    await splitOneBendWire();
    const nodes = await standaloneNodes(page);
    assert.ok(nodes.length >= 2, "two standalone nodes exist after splitting");

    // Window rubber-band over all standalone nodes.
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const box = { x1: Math.min(...xs) - 1, y1: Math.min(...ys) - 1, x2: Math.max(...xs) + 1, y2: Math.max(...ys) + 1 };
    const tl = await page.evaluate((b) => window.__qa.worldToScreen(b.x1, b.y1), box);
    const br = await page.evaluate((b) => window.__qa.worldToScreen(b.x2, b.y2), box);
    await page.mouse.move(tl.x, tl.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(tl.x + ((br.x - tl.x) * i) / 5, tl.y + ((br.y - tl.y) * i) / 5);
      await waitFor(20);
    }
    await page.mouse.up();
    await waitFor(200);
    assert.ok((await selectedNodeHandles(page)) >= 2, "rubber-band selected the standalone nodes");

    // Drag one selected standalone node up by ~2 cells; assert ALL selected
    // standalone nodes shifted by the same delta.
    const before = await standaloneNodes(page);
    const grab = await page.evaluate((n) => window.__qa.worldToScreen(n.x, n.y), before[0]);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(grab.x, grab.y - i * 8);
      await waitFor(20);
    }
    await page.mouse.up();
    await waitFor(300);
    const after = await standaloneNodes(page);
    const beforeById = new Map(before.map((n) => [n.id, n]));
    const deltas = after
      .filter((n) => beforeById.has(n.id))
      .map((n) => {
        const b = beforeById.get(n.id);
        return { dx: n.x - b.x, dy: n.y - b.y };
      });
    const movedTogether = deltas.filter((d) => d.dx === deltas[0].dx && d.dy === deltas[0].dy);
    assert.ok(deltas[0].dy < 0, "the dragged node moved up");
    assert.equal(movedTogether.length, deltas.length, "all selected standalone nodes moved by the same delta");
  } finally {
    await browser.close();
  }
});
