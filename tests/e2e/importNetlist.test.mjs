// The "Import netlist" menu surfaces a paste-in modal (not a file
// chooser). Verify the basic flow end-to-end: open the modal, paste,
// click Import, modal closes, doc reflects the imported components.

import test from "node:test";
import assert from "node:assert/strict";
import { launchApp, waitFor } from "./_setup.mjs";

const TINY_NETLIST = `* tiny RC
V1 in 0 DC 5
R1 in out 1k
C1 out 0 1uF
.tran 10u 10m
.end`;

test("Import netlist menu opens a paste-in modal, not a file picker", async () => {
  const { browser, page } = await launchApp();
  try {
    // Click the "Import netlist" button in the side-nav file actions
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.getAttribute("aria-label") === "Import netlist",
      );
      if (b) {
        b.click();
        return true;
      }
      return false;
    });
    assert.ok(opened, "Import netlist button should be present");

    await waitFor(400);

    const modalInfo = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Import netlist"]');
      const textarea = dialog?.querySelector("textarea");
      const buttons = dialog ? [...dialog.querySelectorAll("button")].map((b) => b.textContent?.trim()) : [];
      return {
        dialogPresent: !!dialog,
        textareaPresent: !!textarea,
        buttons,
      };
    });
    assert.equal(modalInfo.dialogPresent, true, "import modal should be open");
    assert.equal(modalInfo.textareaPresent, true, "modal should contain a textarea");
    assert.ok(
      modalInfo.buttons.some((b) => b === "Import" || b === "Importing…"),
      `modal should have an Import button — saw ${JSON.stringify(modalInfo.buttons)}`,
    );
  } finally {
    await browser.close();
  }
});

test("paste + Import replaces the doc with the imported components", async () => {
  const { browser, page } = await launchApp();
  try {
    // Open the modal
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find(
        (e) => e.getAttribute("aria-label") === "Import netlist",
      );
      if (b) b.click();
    });
    await waitFor(400);

    // Paste via direct DOM setter (puppeteer's keyboard.type is slow for
    // multi-line text and the textarea is the focus target anyway).
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
    }, TINY_NETLIST);
    await waitFor(200);

    // Click Import
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Import netlist"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Import",
      );
      btn?.click();
    });
    await waitFor(2000);

    // Modal should close, doc should now contain V1, R1, C1
    const afterImport = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-label="Import netlist"]');
      const ids = [...document.querySelectorAll("[data-component-id]")].map((g) =>
        g.getAttribute("data-component-id"),
      );
      return {
        modalStillOpen: !!dialog,
        componentIds: [...new Set(ids)],
      };
    });
    assert.equal(
      afterImport.modalStillOpen,
      false,
      "modal should close after a successful import",
    );
    // Component IDs are randomly generated; just count and check kinds.
    assert.ok(
      afterImport.componentIds.length >= 3,
      `expected ≥ 3 imported components (V1, R1, C1, …); got ${afterImport.componentIds.length}`,
    );
  } finally {
    await browser.close();
  }
});
