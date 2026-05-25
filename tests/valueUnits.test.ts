import test from "node:test";
import assert from "node:assert/strict";
import {
  formatValueUnit,
  isComplexValue,
  parseValueUnit,
  UNIT_FAMILIES,
} from "../src/editor/valueUnits.ts";

test("parseValueUnit splits SPICE prefix from magnitude (resistance)", () => {
  const f = UNIT_FAMILIES.resistance;
  assert.deepEqual(parseValueUnit("10k", f), { magnitude: "10", prefix: "k" });
  assert.deepEqual(parseValueUnit("2.2Meg", f), { magnitude: "2.2", prefix: "Meg" });
  assert.deepEqual(parseValueUnit("100", f), { magnitude: "100", prefix: "" });
});

test("parseValueUnit strips trailing base unit letter", () => {
  const f = UNIT_FAMILIES.capacitance;
  assert.deepEqual(parseValueUnit("47uF", f), { magnitude: "47", prefix: "u" });
  assert.deepEqual(parseValueUnit("1F", f), { magnitude: "1", prefix: "" });
  assert.deepEqual(parseValueUnit("100nF", f), { magnitude: "100", prefix: "n" });
});

test("parseValueUnit picks 'Meg' over 'M' (mega vs milli disambiguation)", () => {
  const f = UNIT_FAMILIES.resistance;
  assert.deepEqual(parseValueUnit("1Meg", f), { magnitude: "1", prefix: "Meg" });
});

test("parseValueUnit handles inductance and time prefixes", () => {
  assert.deepEqual(
    parseValueUnit("4.7mH", UNIT_FAMILIES.inductance),
    { magnitude: "4.7", prefix: "m" },
  );
  assert.deepEqual(
    parseValueUnit("10us", UNIT_FAMILIES.time),
    { magnitude: "10", prefix: "u" },
  );
});

test("parseValueUnit returns default prefix for empty string", () => {
  const f = UNIT_FAMILIES.capacitance;
  assert.deepEqual(parseValueUnit("", f), { magnitude: "", prefix: f.defaultPrefix });
});

test("parseValueUnit keeps unparseable text intact", () => {
  const f = UNIT_FAMILIES.resistance;
  assert.deepEqual(parseValueUnit("garbage", f), { magnitude: "garbage", prefix: "k" });
});

test("parseValueUnit accepts scientific notation as plain number", () => {
  const f = UNIT_FAMILIES.resistance;
  assert.deepEqual(parseValueUnit("1.5e3", f), { magnitude: "1.5e3", prefix: "" });
});

test("formatValueUnit recombines magnitude + prefix", () => {
  assert.equal(formatValueUnit("10", "k"), "10k");
  assert.equal(formatValueUnit("2.2", "Meg"), "2.2Meg");
  assert.equal(formatValueUnit("100", ""), "100");
  assert.equal(formatValueUnit("", "k"), "");
});

test("isComplexValue flags source specs and expressions", () => {
  assert.equal(isComplexValue("10k"), false);
  assert.equal(isComplexValue("2.2Meg"), false);
  assert.equal(isComplexValue(""), false);
  assert.equal(isComplexValue("SIN(0 1 1k)"), true);
  assert.equal(isComplexValue("V=sin(2*pi*1k*time)"), true);
  assert.equal(isComplexValue("PULSE(0 5 0 1n 1n 50u 100u)"), true);
  assert.equal(isComplexValue("1 + 2"), true);
});
