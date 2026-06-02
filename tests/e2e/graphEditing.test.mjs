// Model-C graph-editing behaviors (wire-edge-design.md §9c/§10/§11/§13). These
// drive real gestures and assert against the live graph via the dev test hook
// window.__qa (worldToScreen / screenToWorld / graphPage / legacyPage).

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, loadDemoCircuit, waitFor, getComponentPin } from "./_setup.mjs";

const graph = (page) => page.evaluate(() => {
  const g = window.__qa.graphPage();
  return { wires: g.wires.length, nodes: (g.nodes || []).length, probes: g.probes.length };
});
const cellPx = async (page) => {
  const z = await page.evaluate(() => {
    const m = (document.body.innerText || "").match(/Zoom:\s*(\d+)%/);
    return m ? +m[1] : 100;
  });
  return 20 * (z / 100);
};
const statusNodes = (page) => page.evaluate(() => {
  const m = (document.body.innerText || "").match(/Nodes\s+(\d+)/);
  return m ? +m[1] : null;
});
// midpoint (world) of the longest axis-aligned wire segment
const longestSegMid = (page) => page.evaluate(() => {
  const lg = window.__qa.legacyPage();
  let best = null, bl = 0;
  for (const w of lg.wires) for (let i = 0; i < w.points.length - 1; i++) {
    const [x1, y1] = w.points[i], [x2, y2] = w.points[i + 1];
    if (Math.abs(x1 - x2) > 1e-6 && Math.abs(y1 - y2) > 1e-6) continue;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > bl) { bl = len; best = { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2), horiz: Math.abs(y1 - y2) < 1e-6 }; }
  }
  return best;
});

test("draw a wire onto another wire's interior forms a T-junction", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    const mid = await longestSegMid(page);
    assert.ok(mid, "found an axis-aligned segment");
    const start = mid.horiz ? { x: mid.x, y: mid.y - 3 } : { x: mid.x - 3, y: mid.y };
    const before = await graph(page);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "w", bubbles: true })));
    await waitFor(150);
    const s1 = await page.evaluate((p) => window.__qa.worldToScreen(p.x, p.y), start);
    const s2 = await page.evaluate((p) => window.__qa.worldToScreen(p.x, p.y), mid);
    await page.mouse.click(s1.x, s1.y); await waitFor(150);
    await page.mouse.click(s2.x, s2.y); await waitFor(300);
    const after = await graph(page);
    assert.ok(after.wires > before.wires, "the target wire split + a new wire added");
    assert.ok(after.nodes > before.nodes, "a junction node was created");
  } finally { await browser.close(); }
});

test("dropping a probe on a wire interior attaches it to a junction", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    const mid = await longestSegMid(page);
    assert.ok(mid);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true })));
    await waitFor(150);
    const s = await page.evaluate((p) => window.__qa.worldToScreen(p.x, p.y), mid);
    await page.mouse.click(s.x, s.y); await waitFor(300);
    const node = await page.evaluate(() => window.__qa.graphPage().probes.at(-1)?.node ?? null);
    assert.ok(node, "the new probe is attached to a graph node (not left disconnected)");
  } finally { await browser.close(); }
});

test("Node tool: clicking a wire segment + Delete splits the net", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })));
    await waitFor(200);
    const mid = await page.evaluate(() => {
      const lg = window.__qa.legacyPage();
      let best = null, bl = 0;
      for (const w of lg.wires) for (let i = 0; i < w.points.length - 1; i++) {
        const [x1, y1] = w.points[i], [x2, y2] = w.points[i + 1];
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len > bl) { bl = len; best = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }; }
      }
      return best;
    });
    const s = await page.evaluate((m) => window.__qa.worldToScreen(m.x, m.y), mid);
    await page.mouse.click(s.x, s.y); await waitFor(200);
    const nodesBefore = await statusNodes(page);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })));
    await waitFor(300);
    const nodesAfter = await statusNodes(page);
    assert.ok(nodesAfter > nodesBefore, "splitting a segment severs a net (node count rises)");
  } finally { await browser.close(); }
});

test("Node tool: dragging a bend handle reshapes the wire, keeping nets", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Voltage divider" });
  try {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true })));
    await waitFor(250);
    const grab = await page.evaluate(() => {
      const sq = document.querySelector(".node-edit-handles rect");
      if (!sq) return null;
      const r = sq.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    assert.ok(grab, "a bend handle exists");
    const before = await page.evaluate(() => window.__qa.graphPage().wires.flatMap((w) => w.bends).map((b) => b.join()).join("|"));
    const nodesBefore = await statusNodes(page);
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) { await page.mouse.move(grab.x + i * 12, grab.y - i * 12); await waitFor(25); }
    await page.mouse.up();
    await waitFor(300);
    const after = await page.evaluate(() => window.__qa.graphPage().wires.flatMap((w) => w.bends).map((b) => b.join()).join("|"));
    assert.notEqual(after, before, "a bend moved");
    assert.equal(await statusNodes(page), nodesBefore, "connectivity preserved");
  } finally { await browser.close(); }
});

test("flipping a 2-pin part preserves connectivity (wires don't move)", async () => {
  const { browser, page } = await launchApp({ loadDemo: "Inverting amplifier" });
  try {
    const p0 = await getComponentPin(page, "r1", 0), p1 = await getComponentPin(page, "r1", 1);
    assert.ok(p0 && p1);
    await page.mouse.click((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
    await waitFor(200);
    const nodesBefore = await statusNodes(page);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) => /flip horizontal/i.test(e.getAttribute("aria-label") || ""));
      b?.click();
    });
    await waitFor(300);
    assert.equal(await statusNodes(page), nodesBefore, "flip must not merge/split nets");
  } finally { await browser.close(); }
});

test("dragging a component over a wire does NOT connect to it (no silent rewire)", async () => {
  const { browser, page } = await launchApp({ loadDemo: "RC low-pass" });
  try {
    const target = await longestSegMid(page);
    const p0 = await getComponentPin(page, "r1", 0), p1 = await getComponentPin(page, "r1", 1);
    assert.ok(p0 && p1 && target);
    const center = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const cp = await cellPx(page);
    const pin0World = await page.evaluate((p) => window.__qa.screenToWorld(p.x, p.y), p0);
    const dx = (target.x - pin0World.x) * cp, dy = (target.y - pin0World.y) * cp;
    const dotsBefore = await page.evaluate(() => document.querySelectorAll(".wire-junction-dot").length);
    const nodesBefore = await statusNodes(page);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(center.x + dx * i / 10, center.y + dy * i / 10); await waitFor(20); }
    await page.mouse.up();
    await waitFor(400);
    assert.equal(await page.evaluate(() => document.querySelectorAll(".wire-junction-dot").length), dotsBefore, "no false junction dot");
    assert.equal(await statusNodes(page), nodesBefore, "no spurious connection (net count unchanged)");
  } finally { await browser.close(); }
});
