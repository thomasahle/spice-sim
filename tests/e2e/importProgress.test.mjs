// Regression: importing a non-trivial netlist must (a) keep the import
// modal's spinner updating while ELK runs in the worker and the
// wire-routing loop yields between nets, and (b) honour the abort
// button mid-routing by falling back to a label-only layout.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, waitFor } from "./_setup.mjs";

// Big enough for routing to take a few seconds — needs >2 s of layout+routing
// work for the abort/fallback button to surface in the modal (it's gated on
// elapsed >= 2). The user's real ReLU cell netlist was the original repro.
// 40 components — enough that routing crosses the 2 s threshold and the
// fallback button appears, but fast enough to keep CI under a minute.
const NETLIST = buildBigStack(40);

function buildBigStack(n) {
  const lines = ["* synthetic transistor mesh"];
  for (let i = 0; i < n; i++) {
    const a = i === 0 ? "vdd" : `n${i - 1}`;
    const g = `g${i}`;
    const d = `n${i}`;
    lines.push(`M${i} ${a} ${g} ${d} 0 NMOS W=4u L=180n`);
    // a few cross-connections so the router has obstacles to avoid
    if (i % 5 === 0 && i > 0) {
      lines.push(`R${i} n${i} n${i - 3} 1k`);
    }
  }
  lines.push("V1 vdd 0 DC 1.8");
  lines.push(".tran 1n 10n");
  lines.push(".end");
  return lines.join("\n");
}

async function openImportAndPaste(page, netlist) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(
      (e) => e.getAttribute("aria-label") === "Import netlist",
    );
    if (b) b.click();
  });
  await waitFor(300);
  await page.evaluate((nl) => {
    const ta = document.querySelector(
      '[role="dialog"][aria-label="Import netlist"] textarea',
    );
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(ta, nl);
    ta?.dispatchEvent(new Event("input", { bubbles: true }));
  }, netlist);
}

test("import modal cycles phase headlines and the spinner ticks while importing", async () => {
  const { browser, page } = await launchApp();
  try {
    await openImportAndPaste(page, NETLIST);
    await waitFor(200);

    // Sample the headline text during the import to make sure it changes
    // (the only way that's true is if the main thread is actually
    // repainting while the routing loop yields).
    const headlines = new Set();
    const poll = setInterval(async () => {
      try {
        const h = await page.evaluate(
          () =>
            document
              .querySelector(
                '[role="dialog"][aria-label="Import netlist"] [role=status] strong',
              )
              ?.textContent ?? null,
        );
        if (h) headlines.add(h.replace(/\d+\.\d+s$/, "").trim());
      } catch {}
    }, 80);

    await page.evaluate(() => {
      const btn = [
        ...document.querySelectorAll(
          '[role="dialog"][aria-label="Import netlist"] button',
        ),
      ].find((b) => b.textContent?.trim() === "Import");
      btn?.click();
    });

    // Wait until the modal closes
    for (let i = 0; i < 60; i++) {
      await waitFor(300);
      const closed = await page.evaluate(
        () => !document.querySelector('[role="dialog"][aria-label="Import netlist"]'),
      );
      if (closed) break;
    }
    clearInterval(poll);

    // We must have seen at least one routing-phase headline. If the UI was
    // frozen the entire time, headlines.size would be 1 (the initial
    // "Importing…") and nothing else would have ticked through.
    const sawRouting = [...headlines].some((h) => h.includes("Routing wires…"));
    assert.ok(
      sawRouting,
      `expected to see a 'Routing wires…' headline during import; saw ${JSON.stringify(
        [...headlines],
      )}`,
    );
  } finally {
    await browser.close();
  }
});

test("clicking abort during routing falls back to label-only layout", async () => {
  const { browser, page } = await launchApp();
  try {
    await openImportAndPaste(page, NETLIST);
    await waitFor(200);

    await page.evaluate(() => {
      const btn = [
        ...document.querySelectorAll(
          '[role="dialog"][aria-label="Import netlist"] button',
        ),
      ].find((b) => b.textContent?.trim() === "Import");
      btn?.click();
    });

    // The abort/fallback button only appears after 2 s of waiting; poll
    // until it's there, then click it.
    let clicked = false;
    for (let i = 0; i < 30; i++) {
      await waitFor(250);
      clicked = await page.evaluate(() => {
        const dialog = document.querySelector(
          '[role="dialog"][aria-label="Import netlist"]',
        );
        const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((b) =>
          b.textContent?.includes("Cancel auto-layout"),
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      if (clicked) break;
    }
    assert.ok(
      clicked,
      "abort/fallback button should appear within ~7 s of clicking Import",
    );

    // Wait for the modal to close (label-only path completes the import)
    for (let i = 0; i < 30; i++) {
      await waitFor(300);
      const closed = await page.evaluate(
        () =>
          !document.querySelector(
            '[role="dialog"][aria-label="Import netlist"]',
          ),
      );
      if (closed) break;
    }

    const final = await page.evaluate(() => ({
      status: document.querySelector(".statusbar")?.textContent ?? "",
      comps: new Set(
        [...document.querySelectorAll("[data-component-id]")].map((g) =>
          g.getAttribute("data-component-id"),
        ),
      ).size,
    }));
    assert.ok(
      final.status.includes("label-only layout"),
      `status should announce the label-only fallback; got ${JSON.stringify(
        final.status.slice(0, 200),
      )}`,
    );
    assert.ok(
      final.comps >= 8,
      `imported circuit should still contain the components; got ${final.comps}`,
    );
  } finally {
    await browser.close();
  }
});
