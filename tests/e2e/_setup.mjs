// Shared helpers for puppeteer-driven end-to-end tests against the running
// Vite dev server. Run via `npm run test:e2e` after starting `npm run dev`
// in another terminal.

import puppeteer from "puppeteer-core";

const DEV_URL = process.env.SPICESIM_E2E_URL ?? "http://localhost:5173/";
// macOS-bundled Chrome is the default. Override via env when running on Linux/CI.
const CHROME =
  process.env.SPICESIM_E2E_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let serverReady = null;
async function checkServer() {
  if (serverReady) return serverReady;
  serverReady = (async () => {
    try {
      const r = await fetch(DEV_URL, { method: "HEAD" });
      return r.ok || r.status === 304;
    } catch {
      return false;
    }
  })();
  return serverReady;
}

/**
 * Launch a headless Chrome, load the app fresh (cleared localStorage), and
 * return the `page`. Caller is responsible for `browser.close()`.
 */
export async function launchApp({
  width = 1400,
  height = 900,
  loadDemo = null,
} = {}) {
  if (!(await checkServer())) {
    throw new Error(
      `[e2e] dev server not reachable at ${DEV_URL}. Start \`npm run dev\` first.`,
    );
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    defaultViewport: { width, height, deviceScaleFactor: 2 },
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.goto(DEV_URL, { waitUntil: "networkidle2" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle2" });
  await waitFor(2500);
  if (loadDemo) {
    await loadDemoCircuit(page, loadDemo);
  }
  return { browser, page };
}

/** Click one of the buttons in the "Schematic is empty" demo picker. */
export async function loadDemoCircuit(page, name) {
  const clicked = await page.evaluate((n) => {
    const b = [...document.querySelectorAll("a, button")].find(
      (e) => e.textContent?.trim() === n,
    );
    if (b) {
      b.click();
      return true;
    }
    return false;
  }, name);
  if (!clicked) throw new Error(`[e2e] demo "${name}" not found in picker`);
  await waitFor(2000);
}

/** Click the floating analysis pill (Tran / AC / DC / OP). */
export async function selectAnalysis(page, kind) {
  const label = `${kind} ${kind === "OP" ? "" : "sweep "}analysis`.replace(
    /\s+$/,
    "",
  );
  const map = {
    Tran: "Transient analysis",
    AC: "AC sweep analysis",
    DC: "DC sweep analysis",
    OP: "Operating point analysis",
  };
  const aria = map[kind];
  if (!aria) throw new Error(`[e2e] unknown analysis kind: ${kind}`);
  const ok = await page.evaluate((a) => {
    const b = [...document.querySelectorAll("button")].find(
      (e) => e.getAttribute("aria-label") === a,
    );
    if (b) {
      b.click();
      return true;
    }
    return false;
  }, aria);
  if (!ok) throw new Error(`[e2e] analysis pill "${kind}" not found`);
  await waitFor(400);
}

/** Click the floating Run button and wait for the sim to complete. */
export async function runSim(page) {
  await page.evaluate(() => {
    const r = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Run simulation",
    );
    if (r) r.click();
  });
  await waitFor(2500);
}

/** Number of distinct wires currently on the canvas. */
export async function countWires(page) {
  return page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll("[data-wire-id]")].map((g) =>
          g.getAttribute("data-wire-id"),
        ),
      ).size,
  );
}

/** Bounding-box centre of the first connection handle inside a component. */
export async function getComponentPin(page, componentId, handleIndex = 0) {
  return page.evaluate(
    (id, idx) => {
      const c = document.querySelector(`[data-component-id="${id}"]`);
      if (!c) return null;
      const handles = c.querySelectorAll('[data-connection-handle="true"]');
      const h = handles[idx];
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    },
    componentId,
    handleIndex,
  );
}

export function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
