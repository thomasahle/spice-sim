import test from "node:test";
import assert from "node:assert/strict";

import { launchApp, runSim, waitFor } from "./_setup.mjs";

const DEV_URL = process.env.SPICESIM_E2E_URL ?? "http://localhost:5173/";

function docUrl(doc) {
  const payload = Buffer.from(
    JSON.stringify(doc),
    "utf8",
  ).toString("base64");
  return `${DEV_URL}?canvas-text-edit-smoke=${Date.now()}#doc=${encodeURIComponent(payload)}`;
}

function canvasTextEditDoc() {
  return {
    pages: [
      {
        id: "p-main",
        name: "main",
        description: "Canvas text editing smoke",
        components: [
          {
            id: "r1",
            kind: "R",
            x: 0,
            y: 0,
            rotation: 0,
            value: "1k",
            label: "bias leg",
          },
          {
            id: "r2",
            kind: "R",
            x: 0,
            y: 4,
            rotation: 0,
            value: "1k",
          },
          { id: "label1", kind: "LABEL", x: 3, y: 0, rotation: 0, value: "V_{TH}" },
          {
            id: "note1",
            kind: "NOTE",
            x: -12,
            y: -6,
            rotation: 0,
            value:
              "Equation notes:\n\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}",
            params: { w: "7", h: "4", color: "#34c759" },
          },
          {
            id: "x1",
            kind: "SUBX",
            x: 6,
            y: 2,
            rotation: 0,
            value: "relu_cell",
            params: { npins: "2", w: "5", h: "3" },
          },
        ],
        wires: [
          { id: "w-label", points: [[2, 0], [3, 0]] },
          { id: "w-probe", points: [[6, 0.5], [7, 0.5]] },
        ],
        probes: [{ id: "probe1", x: 7, y: 0.5, color: "#0a84ff", label: "Vout" }],
      },
      {
        id: "p-relu",
        name: "relu_cell",
        description: "Reusable block",
        components: [
          {
            id: "port-x",
            kind: "LABEL",
            x: -2,
            y: 0,
            rotation: 0,
            value: "x",
            params: { port: "1", portOrder: "1" },
          },
          {
            id: "port-h",
            kind: "LABEL",
            x: 2,
            y: 0,
            rotation: 0,
            value: "h",
            params: { port: "1", portOrder: "2" },
          },
        ],
        wires: [],
        probes: [],
      },
    ],
    activePageId: "p-main",
    directives: "",
    analysis: { kind: "op" },
  };
}

function netLabelContainmentDoc() {
  return {
    pages: [
      {
        id: "p-labels",
        name: "main",
        description: "Net label containment smoke",
        components: [
          { id: "wp", kind: "LABEL", x: -6, y: -2, rotation: 0, value: "W_+" },
          { id: "wm", kind: "LABEL", x: -6, y: 2, rotation: 0, value: "W_-" },
          { id: "biasp", kind: "LABEL", x: -2, y: -2, rotation: 0, value: "bias+" },
          { id: "biasm", kind: "LABEL", x: -2, y: 2, rotation: 0, value: "bias-" },
          { id: "vdd", kind: "LABEL", x: 1, y: -4, rotation: 0, value: "VDD" },
          { id: "vout", kind: "LABEL", x: 5, y: 0, rotation: 0, value: "VOUT" },
          { id: "m1", kind: "NMOS", x: -3, y: -1.5, rotation: 0, value: "NM" },
          { id: "m2", kind: "NMOS", x: -3, y: 1.5, rotation: 0, value: "NM" },
          { id: "m3", kind: "NMOS", x: 0, y: -1.5, rotation: 0, value: "NM" },
          { id: "m4", kind: "NMOS", x: 0, y: 1.5, rotation: 0, value: "NM" },
          { id: "g1", kind: "GND", x: 0, y: 4, rotation: 0, value: "" },
        ],
        wires: [
          { id: "w-top", points: [[-4, -4], [4, -4]] },
          { id: "w-mid", points: [[-4, 0], [5, 0]] },
          { id: "w-bot", points: [[-4, 4], [4, 4]] },
          { id: "w-left", points: [[-3, -4], [-3, 4]] },
          { id: "w-right", points: [[0, -4], [0, 4]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-labels",
    directives: "",
    analysis: { kind: "op" },
  };
}

function componentValueContainmentDoc() {
  return {
    pages: [
      {
        id: "p-value-labels",
        name: "main",
        description: "Component value label containment smoke",
        components: [
          { id: "vin", kind: "V", x: -6, y: 1, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: -2, y: -1, rotation: 0, value: "2k" },
          { id: "r2", kind: "R", x: 2, y: -1, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 1, rotation: 0, value: "1u" },
          { id: "g1", kind: "GND", x: -6, y: 3.5, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 3.5, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 4, y: -1, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-r", points: [[-6, -1], [-4, -1]] },
          { id: "w-r-r", points: [[0, -1], [2, -1]] },
          { id: "w-r-c", points: [[4, -1], [4, -1]] },
          { id: "w-v-g", points: [[-6, 3], [-6, 3.5]] },
          { id: "w-c-g", points: [[4, 3], [4, 3.5]] },
        ],
        probes: [],
      },
    ],
    activePageId: "p-value-labels",
    directives: "",
    analysis: { kind: "op" },
  };
}

function probeScopeEditDoc() {
  return {
    pages: [
      {
        id: "p-probe-scope-edit",
        name: "main",
        description: "Probe mini-scope label edit smoke",
        components: [
          { id: "vin", kind: "V", x: -4, y: 0, rotation: 0, value: "PULSE(0 5 0 1u 1u 1m 2m)" },
          { id: "r1", kind: "R", x: 0, y: -2, rotation: 0, value: "1k" },
          { id: "c1", kind: "C", x: 4, y: 0, rotation: 0, value: "1u" },
          { id: "g1", kind: "GND", x: -4, y: 2, rotation: 0, value: "" },
          { id: "g2", kind: "GND", x: 4, y: 2, rotation: 0, value: "" },
          { id: "out", kind: "LABEL", x: 4, y: -2, rotation: 0, value: "out" },
        ],
        wires: [
          { id: "w-v-r", points: [[-4, -2], [-2, -2]] },
          { id: "w-r-c", points: [[2, -2], [4, -2]] },
          { id: "w-v-g", points: [[-4, 2], [-4, 2.5]] },
          { id: "w-c-g", points: [[4, 2], [4, 2.5]] },
        ],
        probes: [{ id: "probe1", x: 4, y: -2, color: "#0a84ff", label: "V_{out}" }],
      },
    ],
    activePageId: "p-probe-scope-edit",
    directives: "",
    analysis: { kind: "tran", tstep: "10u", tstop: "4m" },
  };
}

async function centerOf(page, selector) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    if (el instanceof SVGGraphicsElement) {
      const bbox = el.getBBox();
      const matrix = el.getScreenCTM();
      if (matrix) {
        const point = new DOMPoint(bbox.x + bbox.width / 2, bbox.y + bbox.height / 2).matrixTransform(matrix);
        return { x: point.x, y: point.y };
      }
    }
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, selector);
  assert.ok(box, `expected selector to exist: ${selector}`);
  return box;
}

async function openEditor(page, selector) {
  await page.waitForSelector(selector, { visible: true, timeout: 2500 });
  const point = await centerOf(page, selector);
  await page.mouse.click(point.x, point.y);
  await waitFor(40);
  await page.mouse.click(point.x, point.y);
  try {
    await page.waitForSelector(".canvas-text-editor", { visible: true, timeout: 800 });
  } catch {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    }, selector);
    await page.waitForSelector(".canvas-text-editor", { visible: true, timeout: 2500 });
  }
  await waitFor(120);
  return page.evaluate(() => {
    const editor = document.querySelector(".canvas-text-editor");
    return {
      className: editor?.getAttribute("class") ?? "",
      tagName: editor?.tagName ?? "",
      value: editor?.value ?? "",
      selectionStart: editor?.selectionStart ?? null,
      selectionEnd: editor?.selectionEnd ?? null,
    };
  });
}

async function startEditorByTyping(page, selector, firstText) {
  await page.waitForSelector(selector, { visible: true, timeout: 2500 });
  const point = await centerOf(page, selector);
  await page.mouse.click(point.x, point.y);
  await waitFor(120);
  await page.keyboard.type(firstText);
  await page.waitForSelector(".canvas-text-editor", { visible: true, timeout: 2500 });
  await waitFor(150);
  return page.evaluate(() => {
    const editor = document.querySelector(".canvas-text-editor");
    return {
      className: editor?.getAttribute("class") ?? "",
      tagName: editor?.tagName ?? "",
      value: editor?.value ?? "",
      selectionStart: editor?.selectionStart ?? null,
      selectionEnd: editor?.selectionEnd ?? null,
    };
  });
}

async function startEditorByTypingAtFraction(page, selector, fractionX, fractionY, firstText) {
  await page.waitForSelector(selector, { visible: true, timeout: 2500 });
  const point = await page.evaluate(({ sel, fx, fy }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.left + rect.width * fx,
      y: rect.top + rect.height * fy,
    };
  }, { sel: selector, fx: fractionX, fy: fractionY });
  assert.ok(point, `expected selector to exist: ${selector}`);
  await page.mouse.click(point.x, point.y);
  await waitFor(120);
  await page.keyboard.type(firstText);
  await page.waitForSelector(".canvas-text-editor", { visible: true, timeout: 2500 });
  await waitFor(150);
  return page.evaluate(() => {
    const editor = document.querySelector(".canvas-text-editor");
    return {
      className: editor?.getAttribute("class") ?? "",
      tagName: editor?.tagName ?? "",
      value: editor?.value ?? "",
      selectionStart: editor?.selectionStart ?? null,
      selectionEnd: editor?.selectionEnd ?? null,
    };
  });
}

async function openEditorByKeyboard(page, selector, key = "Enter") {
  await page.waitForSelector(selector, { visible: true, timeout: 2500 });
  const point = await centerOf(page, selector);
  await page.mouse.click(point.x, point.y);
  await waitFor(120);
  const openedFromClick = await page.evaluate(() => document.querySelectorAll(".canvas-text-editor").length > 0);
  if (!openedFromClick) {
    await page.keyboard.press(key);
  }
  await page.waitForSelector(".canvas-text-editor", { visible: true, timeout: 2500 });
  await waitFor(150);
  return page.evaluate(() => {
    const editor = document.querySelector(".canvas-text-editor");
    return {
      className: editor?.getAttribute("class") ?? "",
      tagName: editor?.tagName ?? "",
      value: editor?.value ?? "",
      selectionStart: editor?.selectionStart ?? null,
      selectionEnd: editor?.selectionEnd ?? null,
    };
  });
}

async function cancelEditor(page) {
  await page.keyboard.press("Escape");
  await waitFor(120);
  const count = await page.evaluate(() => document.querySelectorAll(".canvas-text-editor").length);
  assert.equal(count, 0, "Escape should close the canvas text editor");
}

async function setEditorValue(page, value) {
  await page.evaluate((nextValue) => {
    const editor = document.querySelector(".canvas-text-editor");
    if (!(editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement)) {
      throw new Error("canvas text editor is not open");
    }
    const prototype = editor instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (!valueSetter) throw new Error("missing native input value setter");
    valueSetter.call(editor, nextValue);
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.focus();
  }, value);
  await waitFor(90);
}

async function commitEditorValue(page, value, commitMode = "enter") {
  await setEditorValue(page, value);
  if (commitMode === "note") {
    await page.keyboard.down("Meta");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Meta");
  } else {
    await page.keyboard.press("Enter");
  }
  await waitFor(220);
  const count = await page.evaluate(() => document.querySelectorAll(".canvas-text-editor").length);
  assert.equal(count, 0, "committing should close the canvas text editor");
}

async function undoDocEdit(page) {
  await page.keyboard.down("Meta");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Meta");
  await waitFor(260);
}

async function redoDocEdit(page) {
  await page.keyboard.down("Meta");
  await page.keyboard.down("Shift");
  await page.keyboard.press("KeyZ");
  await page.keyboard.up("Shift");
  await page.keyboard.up("Meta");
  await waitFor(260);
}

test("canvas text surfaces open in-place editors from real SVG targets", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    const casesRendered = await page.evaluate(() => ({
      katexCount: document.querySelectorAll(".note-text .katex").length,
      displayMathCount: document.querySelectorAll(".note-text .katex-display").length,
      katexErrors: document.querySelectorAll(".note-text .katex-error").length,
      rawBeginVisible: document.body.innerText.includes("\\begin"),
    }));
    assert.ok(casesRendered.katexCount >= 2, "note math should render through KaTeX");
    assert.ok(casesRendered.displayMathCount >= 1, "multi-line note environments should use KaTeX display rendering");
    assert.equal(casesRendered.katexErrors, 0, "note math should not produce KaTeX errors");
    assert.equal(casesRendered.rawBeginVisible, false, "rendered note should not leak raw TeX");

    let editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.match(editor.className, /label-editor/);
    assert.equal(editor.value, "V_{TH}");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="note1"] .note-card');
    assert.match(editor.className, /note-editor/);
    assert.match(editor.tagName, /^TEXTAREA$/i);
    assert.match(editor.value, /\\begin\{cases\*\}/);
    assert.match(editor.value, /\\alpha u/);
    assert.equal(editor.selectionStart, 0, "note editing should place the caret at the start, not select the source");
    assert.equal(editor.selectionEnd, 0, "note editing should not open with a blue full-source selection");
    const noteEditState = await page.evaluate(() => ({
      visibleRenderedNoteText: [...document.querySelectorAll('[data-component-id="note1"] .note-text')].filter(
        (el) => getComputedStyle(el).display !== "none",
      ).length,
      editorBackground: getComputedStyle(document.querySelector(".canvas-text-editor")).backgroundColor,
      editorBoxShadow: getComputedStyle(document.querySelector(".canvas-text-editor")).boxShadow,
      editorColor: getComputedStyle(document.querySelector(".canvas-text-editor")).color,
      overlayBackground: getComputedStyle(document.querySelector(".canvas-text-editor-overlay")).backgroundColor,
      overlayBoxShadow: getComputedStyle(document.querySelector(".canvas-text-editor-overlay")).boxShadow,
      overflowX: getComputedStyle(document.querySelector(".canvas-text-editor")).overflowX,
      whiteSpace: getComputedStyle(document.querySelector(".canvas-text-editor")).whiteSpace,
    }));
    assert.equal(noteEditState.visibleRenderedNoteText, 0);
    assert.equal(noteEditState.editorBackground, "rgba(0, 0, 0, 0)");
    assert.equal(noteEditState.editorBoxShadow, "none");
    assert.match(noteEditState.editorColor, /rgb\(29,\s*29,\s*31\)/);
    assert.match(noteEditState.overlayBackground, /rgba?\(52,\s*199,\s*89/);
    assert.equal(noteEditState.overlayBoxShadow, "none");
    assert.equal(noteEditState.overflowX, "hidden");
    assert.equal(noteEditState.whiteSpace, "pre-wrap");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.match(editor.className, /value-editor/);
    assert.equal(editor.value, "1k");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "bias leg");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-probe-id="probe1"]');
    assert.match(editor.className, /probe-editor/);
    assert.equal(editor.value, "Vout");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-subx-label-edit-id="x1"]');
    assert.match(editor.className, /subx-label-editor/);
    assert.equal(editor.value, "relu_cell");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.match(editor.className, /subx-pin-label-editor/);
    assert.equal(editor.value, "x");
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});

test("KaTeX component value labels stay contained inside their hit bounds", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(componentValueContainmentDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="vin"] .component-value-text .katex', { timeout: 4000 });
    await waitFor(500);

    const issues = await page.evaluate(() => {
      const epsilon = 1.5;
      return ["vin", "r1", "r2", "c1"].flatMap((id) => {
        const group = document.querySelector(`[data-component-id="${id}"]`);
        const hit = group?.querySelector(".component-value-hit-target");
        const text = group?.querySelector(".component-value-text .katex");
        const html = group?.querySelector(".component-value-text .katex-html");
        const textShell = group?.querySelector(".component-value-text .svg-katex-text");
        if (!group || !hit || !text) return [{ id, issue: "missing value label" }];
        const hitRect = hit.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const problems = [];
        if (textRect.left < hitRect.left - epsilon) problems.push("left overflow");
        if (textRect.right > hitRect.right + epsilon) problems.push("right overflow");
        if (textRect.top < hitRect.top - epsilon) problems.push("top overflow");
        if (textRect.bottom > hitRect.bottom + epsilon) problems.push("bottom overflow");
        if (html && html.scrollWidth > html.clientWidth + 1) {
          problems.push(`hidden text overflow ${html.scrollWidth}/${html.clientWidth}`);
        }
        if (textShell && textShell.scrollWidth > textShell.clientWidth + 1) {
          problems.push(`hidden shell overflow ${textShell.scrollWidth}/${textShell.clientWidth}`);
        }
        if ((text.textContent ?? "").trim().length < 2) problems.push("unexpectedly short text");
        return problems.map((issue) => ({ id, issue }));
      });
    });

    assert.deepEqual(issues, []);
  } finally {
    await browser.close();
  }
});

test("start-anchored component value labels keep visual breathing room", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(componentValueContainmentDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="vin"] .component-value-text .katex', { timeout: 4000 });
    await waitFor(500);

    const issues = await page.evaluate(() => {
      const minInset = 2.5;
      return ["vin", "c1"].flatMap((id) => {
        const group = document.querySelector(`[data-component-id="${id}"]`);
        const hit = group?.querySelector(".component-value-hit-target");
        const text = group?.querySelector(".component-value-text .katex");
        if (!hit || !text) return [{ id, issue: "missing value label" }];
        const hitRect = hit.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const leftInset = textRect.left - hitRect.left;
        const rightInset = hitRect.right - textRect.right;
        const problems = [];
        if (leftInset < minInset) problems.push(`left inset ${leftInset.toFixed(2)}px`);
        if (rightInset < minInset) problems.push(`right inset ${rightInset.toFixed(2)}px`);
        return problems.map((issue) => ({ id, issue }));
      });
    });

    assert.deepEqual(issues, []);
  } finally {
    await browser.close();
  }
});

test("source value editor sizes for raw SPICE text, not the short rendered label", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(componentValueContainmentDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="vin"] .component-value-label', { timeout: 4000 });
    await waitFor(500);

    const editor = await openEditor(page, '[data-component-id="vin"] .component-value-label');
    assert.match(editor.className, /value-editor/);
    assert.equal(editor.value, "PULSE(0 5 0 1u 1u 1m 2m)");

    const metrics = await page.evaluate(() => {
      const renderedLabel = document.querySelector('[data-component-id="vin"] .component-value-label');
      const overlay = document.querySelector(".canvas-text-editor-overlay");
      const input = document.querySelector(".canvas-text-editor");
      if (!renderedLabel || !overlay || !(input instanceof HTMLInputElement)) return null;
      const labelRect = renderedLabel.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      return {
        labelWidth: labelRect.width,
        overlayWidth: overlayRect.width,
        inputClientWidth: input.clientWidth,
        inputScrollWidth: input.scrollWidth,
      };
    });

    assert.ok(metrics, "expected source value editor metrics");
    assert.ok(
      metrics.overlayWidth > metrics.labelWidth * 1.8,
      `raw editor should be wider than the short rendered label (${metrics.overlayWidth}/${metrics.labelWidth})`,
    );
    assert.ok(
      metrics.inputScrollWidth <= metrics.inputClientWidth + 4,
      `raw source text should fit in the value editor (${metrics.inputScrollWidth}/${metrics.inputClientWidth})`,
    );
  } finally {
    await browser.close();
  }
});

test("KaTeX net labels stay contained and centered inside their chips", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(netLabelContainmentDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="biasm"] .net-label-chip', { timeout: 4000 });
    await waitFor(500);

    const issues = await page.evaluate(() => {
      const epsilon = 1.5;
      return [...document.querySelectorAll(".net-label-group")].flatMap((group) => {
        const chip = group.querySelector(".net-label-chip");
        const shell = group.querySelector(".net-label-text");
        const text = group.querySelector(".net-label-text .katex");
        if (!chip || !shell || !text) return [{ id: group.getAttribute("data-component-id"), issue: "missing chip or text" }];
        const chipRect = chip.getBoundingClientRect();
        const shellRect = shell.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const centerDeltaX = Math.abs((textRect.left + textRect.right) / 2 - (chipRect.left + chipRect.right) / 2);
        const centerDeltaY = Math.abs((textRect.top + textRect.bottom) / 2 - (chipRect.top + chipRect.bottom) / 2);
        const shellInset = Math.min(
          shellRect.left - chipRect.left,
          chipRect.right - shellRect.right,
          shellRect.top - chipRect.top,
          chipRect.bottom - shellRect.bottom,
        );
        const problems = [];
        if (shellInset < 1) problems.push(`text shell inset ${shellInset.toFixed(2)}px`);
        if (textRect.left < chipRect.left - epsilon) problems.push("left overflow");
        if (textRect.right > chipRect.right + epsilon) problems.push("right overflow");
        if (textRect.top < chipRect.top - epsilon) problems.push("top overflow");
        if (textRect.bottom > chipRect.bottom + epsilon) problems.push("bottom overflow");
        if (centerDeltaX > 2.5) problems.push(`off-center-x ${centerDeltaX.toFixed(2)}px`);
        if (centerDeltaY > 2.5) problems.push(`off-center-y ${centerDeltaY.toFixed(2)}px`);
        return problems.map((issue) => ({ id: group.getAttribute("data-component-id"), issue }));
      });
    });

    assert.deepEqual(issues, []);
  } finally {
    await browser.close();
  }
});

test("KaTeX probe and component user labels stay contained and centered", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-probe-id="probe1"] .probe-badge-chip', { timeout: 4000 });
    await waitFor(500);

    const issues = await page.evaluate(() => {
      const epsilon = 1.5;
      const centerLimit = 2.75;
      const checks = [
        {
          id: "component-r1",
          chip: document.querySelector('[data-component-id="r1"] .component-user-label-chip'),
          text: document.querySelector('[data-component-id="r1"] .component-user-label-text .katex'),
        },
        {
          id: "probe1",
          chip: document.querySelector('[data-probe-id="probe1"] .probe-badge-chip'),
          text: document.querySelector('[data-probe-id="probe1"] .probe-badge-text .katex'),
        },
      ];
      return checks.flatMap(({ id, chip, text }) => {
        if (!chip || !text) return [{ id, issue: "missing chip or text" }];
        const chipRect = chip.getBoundingClientRect();
        const textRect = text.getBoundingClientRect();
        const centerDeltaX = Math.abs((textRect.left + textRect.right) / 2 - (chipRect.left + chipRect.right) / 2);
        const centerDeltaY = Math.abs((textRect.top + textRect.bottom) / 2 - (chipRect.top + chipRect.bottom) / 2);
        const problems = [];
        if (textRect.left < chipRect.left - epsilon) problems.push("left overflow");
        if (textRect.right > chipRect.right + epsilon) problems.push("right overflow");
        if (textRect.top < chipRect.top - epsilon) problems.push("top overflow");
        if (textRect.bottom > chipRect.bottom + epsilon) problems.push("bottom overflow");
        if (centerDeltaX > centerLimit) problems.push(`off-center-x ${centerDeltaX.toFixed(2)}px`);
        if (centerDeltaY > centerLimit) problems.push(`off-center-y ${centerDeltaY.toFixed(2)}px`);
        return problems.map((issue) => ({ id, issue }));
      });
    });

    assert.deepEqual(issues, []);
  } finally {
    await browser.close();
  }
});

test("net label in-place editor aligns with the rendered chip", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(netLabelContainmentDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="wp"] .net-label-chip', { timeout: 4000 });
    await waitFor(500);

    for (const id of ["wp", "biasp", "vdd", "vout"]) {
      const selector = `[data-component-id="${id}"] .net-label-chip`;
      const editor = await openEditor(page, selector);
      assert.match(editor.className, /label-editor/);

      const alignment = await page.evaluate((componentId) => {
        const chip = document.querySelector(`[data-component-id="${componentId}"] .net-label-chip`);
        const overlay = document.querySelector(".canvas-text-editor-overlay");
        const input = document.querySelector(".canvas-text-editor");
        if (!chip || !overlay || !input) return null;
        const chipRect = chip.getBoundingClientRect();
        const overlayRect = overlay.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        return {
          chip: {
            x: chipRect.x,
            y: chipRect.y,
            width: chipRect.width,
            height: chipRect.height,
            cx: chipRect.x + chipRect.width / 2,
            cy: chipRect.y + chipRect.height / 2,
          },
          overlay: {
            x: overlayRect.x,
            y: overlayRect.y,
            width: overlayRect.width,
            height: overlayRect.height,
            cx: overlayRect.x + overlayRect.width / 2,
            cy: overlayRect.y + overlayRect.height / 2,
          },
          input: {
            x: inputRect.x,
            y: inputRect.y,
            width: inputRect.width,
            height: inputRect.height,
            cx: inputRect.x + inputRect.width / 2,
            cy: inputRect.y + inputRect.height / 2,
          },
          textAlign: getComputedStyle(input).textAlign,
          lineHeight: getComputedStyle(input).lineHeight,
        };
      }, id);

      assert.ok(alignment, `expected editor alignment info for ${id}`);
      assert.ok(Math.abs(alignment.overlay.cx - alignment.chip.cx) <= 1.6, `${id} editor should stay horizontally centered`);
      assert.ok(Math.abs(alignment.overlay.cy - alignment.chip.cy) <= 1.6, `${id} editor should stay vertically centered`);
      assert.ok(alignment.overlay.width >= alignment.chip.width - 1, `${id} editor should cover chip width`);
      assert.ok(alignment.overlay.height >= alignment.chip.height - 1, `${id} editor should cover chip height`);
      assert.equal(alignment.textAlign, "center", `${id} editor text should be centered`);

      await cancelEditor(page);
    }
  } finally {
    await browser.close();
  }
});

test("rendered canvas text glyphs open the matching in-place editor", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    let editor = await openEditor(page, '[data-component-id="label1"] .net-label-text .katex');
    assert.match(editor.className, /label-editor/);
    assert.equal(editor.value, "V_{TH}");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-value-text .katex');
    assert.match(editor.className, /value-editor/);
    assert.equal(editor.value, "1k");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-text .katex');
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "bias leg");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="note1"] .note-text .katex-display');
    assert.match(editor.className, /note-editor/);
    assert.match(editor.value, /\\begin\{cases\*\}/);
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});

test("canvas text edits commit back to the schematic from in-place editors", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    let editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.match(editor.className, /label-editor/);
    await commitEditorValue(page, "V_{OUT}");
    editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.equal(editor.value, "V_{OUT}");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="note1"] .note-card');
    assert.match(editor.className, /note-editor/);
    await commitEditorValue(page, "Edited note\n$h$ output", "note");
    editor = await openEditor(page, '[data-component-id="note1"] .note-card');
    assert.equal(editor.value, "Edited note\n$h$ output");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.match(editor.className, /value-editor/);
    await commitEditorValue(page, "2k");
    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.equal(editor.value, "2k");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.match(editor.className, /component-label-editor/);
    await commitEditorValue(page, "feedback leg");
    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.equal(editor.value, "feedback leg");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-probe-id="probe1"]');
    assert.match(editor.className, /probe-editor/);
    await commitEditorValue(page, "Vcap");
    editor = await openEditor(page, '[data-probe-id="probe1"]');
    assert.equal(editor.value, "Vcap");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.match(editor.className, /subx-pin-label-editor/);
    await commitEditorValue(page, "input");
    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.equal(editor.value, "input");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-subx-label-edit-id="x1"]');
    assert.match(editor.className, /subx-label-editor/);
    await commitEditorValue(page, "relu_cell");
    editor = await openEditor(page, '[data-subx-label-edit-id="x1"]');
    assert.equal(editor.value, "relu_cell");
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});

test("committed in-place canvas text edits undo and redo through the document history", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    const cases = [
      {
        selector: '[data-component-id="label1"] .net-label-chip',
        nextValue: "V_{OUT}",
        original: "V_{TH}",
      },
      {
        selector: '[data-component-id="note1"] .note-card',
        nextValue: "Changed note\n$h = \\max(0, u)$",
        original: "Equation notes:\n\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}",
        commitMode: "note",
      },
      {
        selector: '[data-component-id="r1"] .component-value-label',
        nextValue: "2k",
        original: "1k",
      },
      {
        selector: '[data-component-id="r1"] .component-user-label-chip',
        nextValue: "feedback leg",
        original: "bias leg",
      },
      {
        selector: '[data-probe-id="probe1"]',
        nextValue: "Vcap",
        original: "Vout",
      },
      {
        selector: '[data-component-id="x1"] [data-subx-pin-label-index="0"]',
        nextValue: "input",
        original: "x",
      },
      {
        selector: '[data-subx-label-edit-id="x1"]',
        nextValue: "activation_cell",
        original: "relu_cell",
      },
    ];

    for (const { selector, nextValue, original, commitMode } of cases) {
      let editor = await openEditor(page, selector);
      assert.equal(editor.value, original, `unexpected initial canvas text for ${selector}`);
      await commitEditorValue(page, nextValue, commitMode);

      editor = await openEditor(page, selector);
      assert.equal(editor.value, nextValue, `commit should update canvas text for ${selector}`);
      await cancelEditor(page);

      await undoDocEdit(page);

      editor = await openEditor(page, selector);
      assert.equal(editor.value, original, `undo should restore canvas text for ${selector}`);
      await cancelEditor(page);

      await redoDocEdit(page);

      editor = await openEditor(page, selector);
      assert.equal(editor.value, nextValue, `redo should reapply canvas text for ${selector}`);
      await cancelEditor(page);
    }
  } finally {
    await browser.close();
  }
});

test("Escape cancels uncommitted in-place canvas text edits", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    const cases = [
      {
        selector: '[data-component-id="label1"] .net-label-chip',
        badValue: "SHOULD_NOT_SAVE",
        expected: "V_{TH}",
      },
      {
        selector: '[data-component-id="note1"] .note-card',
        badValue: "SHOULD_NOT_SAVE\n$bad$",
        expected: "Equation notes:\n\\begin{cases*}\nu, & if $u>0$ \\\\\n\\alpha u, & otherwise\n\\end{cases*}",
      },
      {
        selector: '[data-component-id="r1"] .component-value-label',
        badValue: "999k",
        expected: "1k",
      },
      {
        selector: '[data-component-id="r1"] .component-user-label-chip',
        badValue: "bad label",
        expected: "bias leg",
      },
      {
        selector: '[data-probe-id="probe1"]',
        badValue: "bad probe",
        expected: "Vout",
      },
      {
        selector: '[data-component-id="x1"] [data-subx-pin-label-index="0"]',
        badValue: "bad pin",
        expected: "x",
      },
      {
        selector: '[data-subx-label-edit-id="x1"]',
        badValue: "bad_subckt",
        expected: "relu_cell",
      },
    ];

    for (const { selector, badValue, expected } of cases) {
      let editor = await openEditor(page, selector);
      await setEditorValue(page, badValue);
      await cancelEditor(page);

      editor = await openEditor(page, selector);
      assert.equal(
        editor.value,
        expected,
        `Escape should discard uncommitted canvas text for ${selector}`,
      );
      await cancelEditor(page);
    }
  } finally {
    await browser.close();
  }
});

test("probe mini-scope labels are editable directly on the canvas", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(probeScopeEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="vin"]', { timeout: 4000 });

    await runSim(page);
    await page.waitForSelector('[data-probe-label-edit-id="probe1"]', { visible: true, timeout: 8000 });
    await waitFor(300);

    let editor = await openEditor(page, '[data-probe-label-edit-id="probe1"]');
    assert.match(editor.className, /probe-editor/);
    assert.equal(editor.value, "V_{out}");
    await commitEditorValue(page, "V_{cap}");

    editor = await openEditor(page, '[data-probe-label-edit-id="probe1"]');
    assert.equal(editor.value, "V_{cap}");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-probe-label-edit-id="probe1"]', "h");
    assert.match(editor.className, /probe-editor/);
    assert.equal(editor.value, "h");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("out");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-probe-label-edit-id="probe1"]');
    assert.equal(editor.value, "hout");
    await cancelEditor(page);

    const labelState = await page.evaluate(() => ({
      scopeLabelCount: document.querySelectorAll('[data-probe-label-edit-id="probe1"]').length,
      standaloneBadgeCount: document.querySelectorAll('[data-probe-id="probe1"] .probe-badge-chip').length,
      visibleEditorCount: document.querySelectorAll(".canvas-text-editor").length,
      renderedText: document.querySelector('[data-probe-label-edit-id="probe1"]')?.textContent ?? "",
    }));
    assert.equal(labelState.scopeLabelCount, 1);
    assert.equal(labelState.standaloneBadgeCount, 0, "mini-scope label should replace the standalone probe badge");
    assert.equal(labelState.visibleEditorCount, 0);
    assert.match(labelState.renderedText, /h|out/i);
  } finally {
    await browser.close();
  }
});

test("selected canvas text objects enter in-place edit mode from typing", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    let editor = await startEditorByTyping(page, '[data-component-id="label1"] .net-label-chip', "o");
    assert.match(editor.className, /label-editor/);
    assert.equal(editor.value, "o");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("ut");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.equal(editor.value, "out");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-component-id="note1"] .note-card', "A");
    assert.match(editor.className, /note-editor/);
    assert.match(editor.tagName, /^TEXTAREA$/i);
    assert.equal(editor.value, "A");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type(" note");
    await page.keyboard.down("Meta");
    await page.keyboard.press("Enter");
    await page.keyboard.up("Meta");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="note1"] .note-card');
    assert.equal(editor.value, "A note");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-component-id="r1"] .component-value-label', "2");
    assert.match(editor.className, /value-editor/);
    assert.equal(editor.value, "2");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("k");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.equal(editor.value, "2k");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-component-id="r1"] .component-user-label-chip', "f");
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "f");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("eedback");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.equal(editor.value, "feedback");
    await cancelEditor(page);

    editor = await startEditorByTypingAtFraction(page, '[data-component-id="r1"] .component-hit-target', 0.5, 0.25, "w");
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "w");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("ire");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.equal(editor.value, "wire");
    await cancelEditor(page);

    editor = await startEditorByTypingAtFraction(page, '[data-component-id="r2"] .component-hit-target', 0.5, 0.25, "q");
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "q");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("uick label");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="r2"] .component-user-label-chip');
    assert.equal(editor.value, "quick label");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]', "i");
    assert.match(editor.className, /subx-pin-label-editor/);
    assert.equal(editor.value, "i");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("nput");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.equal(editor.value, "input");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-subx-label-edit-id="x1"]', "a");
    assert.match(editor.className, /subx-label-editor/);
    assert.equal(editor.value, "a");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("ctivation_block");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-subx-label-edit-id="x1"]');
    assert.equal(editor.value, "activation_block");
    await cancelEditor(page);

    editor = await startEditorByTyping(page, '[data-probe-id="probe1"]', "v");
    assert.match(editor.className, /probe-editor/);
    assert.equal(editor.value, "v");
    assert.equal(editor.selectionStart, 1);
    assert.equal(editor.selectionEnd, 1);
    await page.keyboard.type("out");
    await page.keyboard.press("Enter");
    await waitFor(220);
    editor = await openEditor(page, '[data-probe-id="probe1"]');
    assert.equal(editor.value, "vout");
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});

test("blank commits do not erase required schematic text", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    async function attemptBlankRequiredCommit(selector, expectedClass, statusText) {
      await setEditorValue(page, "");
      await page.keyboard.press("Enter");
      await waitFor(220);
      const blankState = await page.evaluate(() => {
        const editor = document.querySelector(".canvas-text-editor");
        return {
          count: document.querySelectorAll(".canvas-text-editor").length,
          className: editor?.getAttribute("class") ?? "",
          value: editor?.value ?? null,
          selectionStart: editor?.selectionStart ?? null,
          selectionEnd: editor?.selectionEnd ?? null,
          status: document.querySelector(".statusbar")?.textContent ?? document.body.textContent ?? "",
        };
      });
      assert.equal(blankState.count, 1, `${selector} should stay in edit mode so the blank value can be corrected`);
      assert.match(blankState.className, expectedClass);
      assert.equal(blankState.value, "");
      assert.equal(blankState.selectionStart, 0);
      assert.equal(blankState.selectionEnd, 0);
      assert.match(blankState.status, statusText);
      await cancelEditor(page);
    }

    let editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.equal(editor.value, "V_{TH}");
    await attemptBlankRequiredCommit(
      '[data-component-id="label1"] .net-label-chip',
      /label-editor/,
      /Net label text cannot be empty/,
    );
    editor = await openEditor(page, '[data-component-id="label1"] .net-label-chip');
    assert.equal(editor.value, "V_{TH}", "net label text should not become an invisible empty label");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.equal(editor.value, "1k");
    await attemptBlankRequiredCommit(
      '[data-component-id="r1"] .component-value-label',
      /value-editor/,
      /Component value cannot be empty/,
    );
    editor = await openEditor(page, '[data-component-id="r1"] .component-value-label');
    assert.equal(editor.value, "1k", "component value should not become empty from an accidental commit");
    await cancelEditor(page);

    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.equal(editor.value, "x");
    await attemptBlankRequiredCommit(
      '[data-component-id="x1"] [data-subx-pin-label-index="0"]',
      /subx-pin-label-editor/,
      /Subcircuit pin label cannot be empty/,
    );
    editor = await openEditor(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.equal(editor.value, "x", "subcircuit pin labels are required for usable symbols");
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});

test("Enter opens the exact clicked canvas text target", async () => {
  const { browser, page } = await launchApp({ width: 1500, height: 950 });
  try {
    await page.goto(docUrl(canvasTextEditDoc()), { waitUntil: "networkidle2" });
    await page.waitForSelector('[data-component-id="r1"]', { timeout: 4000 });
    await waitFor(500);

    let editor = await openEditorByKeyboard(page, '[data-component-id="r1"] .component-user-label-chip');
    assert.match(editor.className, /component-label-editor/);
    assert.equal(editor.value, "bias leg");
    await cancelEditor(page);

    editor = await openEditorByKeyboard(page, '[data-component-id="r1"] .component-value-label');
    assert.match(editor.className, /value-editor/);
    assert.equal(editor.value, "1k");
    await cancelEditor(page);

    editor = await openEditorByKeyboard(page, '[data-component-id="x1"] [data-subx-pin-label-index="0"]');
    assert.match(editor.className, /subx-pin-label-editor/);
    assert.equal(editor.value, "x");
    await cancelEditor(page);

    editor = await openEditorByKeyboard(page, '[data-subx-label-edit-id="x1"]');
    assert.match(editor.className, /subx-label-editor/);
    assert.equal(editor.value, "relu_cell");
    await cancelEditor(page);
  } finally {
    await browser.close();
  }
});
