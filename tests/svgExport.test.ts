import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeExportLayer } from "../src/editor/svgExport.ts";

test("schematic SVG export removes editor chrome and normalizes selected wires", () => {
  const layer = new FakeElement("g", "", [
    new FakeElement("rect", "component-hit-target"),
    new FakeElement("circle", "component-pin-hit"),
    new FakeElement("circle", "pin-target-ring active"),
    new FakeElement("rect", "component-selection"),
    new FakeElement("rect", "placement-draft-footprint"),
    new FakeElement("circle", "wire-vertex"),
    new FakeElement("polyline", "wire-hit-target"),
    new FakeElement("polyline", "wire-live wire-live-overlay", [], { stroke: "var(--accent)", "stroke-width": "0.18" }),
    new FakeElement("polyline", "wire-live reverse", [], { stroke: "var(--accent)", "stroke-width": "0.2" }),
  ]);

  sanitizeExportLayer(layer as unknown as Element);

  assert.equal(layer.querySelectorAll(".component-selection").length, 0);
  assert.equal(layer.querySelectorAll(".component-hit-target").length, 0);
  assert.equal(layer.querySelectorAll(".component-pin-hit").length, 0);
  assert.equal(layer.querySelectorAll(".pin-target-ring").length, 0);
  assert.equal(layer.querySelectorAll(".placement-draft-footprint").length, 0);
  assert.equal(layer.querySelectorAll(".wire-vertex").length, 0);
  assert.equal(layer.querySelectorAll(".wire-hit-target").length, 0);
  assert.equal(layer.querySelectorAll(".wire-live-overlay").length, 0);
  const wire = layer.querySelectorAll(".wire-group polyline:not(.wire-hit-target)")[0] as FakeElement;
  assert.equal(wire.attributes.stroke, "var(--ink)");
  assert.equal(wire.attributes["stroke-width"], "0.12");
  assert.equal(wire.classList.has("wire-live"), false);
  assert.equal(wire.classList.has("reverse"), false);
});

test("schematic SVG export preserves note colors without selected hover styling", () => {
  const note = new FakeElement(
    "rect",
    "note-card selected hovered",
    [],
    {},
    { fill: "#af52de29", stroke: "#af52def2", "stroke-width": "0.075" },
  );
  const layer = new FakeElement("g", "", [note]);

  sanitizeExportLayer(layer as unknown as Element);

  assert.equal(note.classList.has("selected"), false);
  assert.equal(note.classList.has("hovered"), false);
  assert.equal(note.attributes.fill, "#af52de1a");
  assert.equal(note.attributes.stroke, "#af52deb8");
  assert.equal(note.attributes["stroke-width"], "0.05");
  assert.equal(note.style.getPropertyValue("fill"), "");
  assert.equal(note.style.getPropertyValue("stroke"), "");
  assert.equal(note.style.getPropertyValue("stroke-width"), "");
});

class FakeElement {
  tagName: string;
  attributes: Record<string, string>;
  parent: FakeElement | null = null;
  style: FakeStyle;
  classList: FakeClassList;
  children: FakeElement[];

  constructor(
    tagName: string,
    className = "",
    children: FakeElement[] = [],
    attributes: Record<string, string> = {},
    style: Record<string, string> = {},
  ) {
    this.tagName = tagName;
    this.children = children;
    this.classList = new FakeClassList(className);
    this.attributes = { ...attributes };
    this.style = new FakeStyle(style);
    for (const child of children) child.parent = this;
  }

  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  querySelectorAll(selectorList: string): FakeElement[] {
    const selectors = selectorList.split(",").map((selector) => selector.trim());
    return this.descendants().filter((element) => selectors.some((selector) => matches(element, selector)));
  }

  private descendants(): FakeElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
}

class FakeStyle {
  private values: Record<string, string>;

  constructor(values: Record<string, string>) {
    this.values = { ...values };
  }

  getPropertyValue(name: string): string {
    return this.values[name] ?? "";
  }

  removeProperty(name: string) {
    delete this.values[name];
  }
}

class FakeClassList {
  private values: Set<string>;

  constructor(className: string) {
    this.values = new Set(className.split(/\s+/).filter(Boolean));
  }

  has(value: string): boolean {
    return this.values.has(value);
  }

  remove(...values: string[]) {
    for (const value of values) this.values.delete(value);
  }
}

function matches(element: FakeElement, selector: string): boolean {
  if (selector === ".wire-group polyline:not(.wire-hit-target)") {
    return element.tagName === "polyline" && !element.classList.has("wire-hit-target");
  }
  if (selector === ".component-group:not(.net-label-group) [stroke='var(--accent)']") {
    return element.attributes.stroke === "var(--accent)";
  }
  if (selector === ".component-group:not(.net-label-group) [fill='var(--accent)']") {
    return element.attributes.fill === "var(--accent)";
  }
  if (selector.startsWith(".")) return element.classList.has(selector.slice(1));
  return false;
}
