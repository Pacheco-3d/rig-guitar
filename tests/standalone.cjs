const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [],
    remote = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/^https?:/, (route) => {
    remote.push(route.request().url());
    return route.abort();
  });
  await page.setContent(readFileSync("dist/rig-studio.html", "utf8"), {
    waitUntil: "load",
  });
  assert.equal(await page.locator(".preset-item").count(), 24);
  assert.equal(await page.locator("#cabinet-ir option").count(), 3);
  assert.equal(
    await page
      .locator(".application")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
    "rgb(100, 98, 97)",
  );
  await page.locator("#save-button").click();
  assert(await page.locator("#save-dialog").isVisible());
  assert.deepEqual(errors, []);
  assert.deepEqual(remote, []);
  console.log(
    "PASS: standalone HTML renders from its file contents with inline styles, scripts, 24 presets and 3 IRs; no external requests.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
