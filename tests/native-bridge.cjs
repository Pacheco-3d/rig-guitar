const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.bridgeCalls = [];
    window.RigAndroid = {
      getSavedPresets: () => "[]",
      setSettings: (json) =>
        window.bridgeCalls.push(["settings", JSON.parse(json)]),
      refreshDevices: () => {},
      selectIr: (id) => window.bridgeCalls.push(["ir", id]),
      startEngine: (input, output) =>
        window.bridgeCalls.push(["start", input, output]),
      stopEngine: () => window.bridgeCalls.push(["stop"]),
      pickIr: () => window.bridgeCalls.push(["pickIr"]),
      chooseDriveFolder: () => window.bridgeCalls.push(["folder"]),
      exportLibrary: () => window.bridgeCalls.push(["export"]),
      importPresets: () => {},
      savePresets: (json) =>
        window.bridgeCalls.push(["save", JSON.parse(json)]),
    };
  });
  await page.goto(process.env.RIG_TEST_URL || "http://127.0.0.1:3000");
  await page.evaluate(() => {
    window.onRigNativeEvent({
      type: "library",
      payload: {
        irs: [
          { id: "studio-reference.wav", name: "Studio Reference" },
          { id: "warm-vintage.wav", name: "Warm Vintage" },
        ],
        selectedIr: "studio-reference.wav",
        folderConnected: false,
      },
    });
    window.onRigNativeEvent({
      type: "devices",
      payload: {
        inputs: [{ id: 23, name: "USB interface", type: 11 }],
        outputs: [{ id: 24, name: "USB headphones", type: 11 }],
      },
    });
  });
  await page.locator("#input-device").selectOption("23");
  await page.locator("#output-device").selectOption("24");
  await page.locator("#connect-guitar").click();
  assert(
    await page.evaluate(() =>
      window.bridgeCalls.some(
        (c) => c[0] === "start" && c[1] === 23 && c[2] === 24,
      ),
    ),
  );
  const params = await page.evaluate(
    () => window.bridgeCalls.filter((c) => c[0] === "settings").at(-1)[1],
  );
  assert.equal(params.length, 24);
  assert.equal(params[6], 0);
  assert.equal(params[7], 1);
  await page.evaluate(() =>
    window.onRigNativeEvent({
      type: "engine",
      payload: { running: true, level: 0.1, bufferFrames: 192, xruns: 0 },
    }),
  );
  assert(await page.locator("#connect-guitar").isDisabled());
  await page.locator("#disconnect-guitar").click();
  assert(
    await page.evaluate(() => window.bridgeCalls.some((c) => c[0] === "stop")),
  );
  await page.evaluate(() =>
    window.onRigNativeEvent({ type: "engine", payload: { running: false } }),
  );
  assert(await page.locator("#disconnect-guitar").isDisabled());
  await page.locator("#connect-drive").click();
  await page.locator("#export-library").click();
  assert(
    await page.evaluate(
      () =>
        window.bridgeCalls.some((c) => c[0] === "folder") &&
        window.bridgeCalls.some((c) => c[0] === "export"),
    ),
  );
  await page.locator("#cabinet-ir").selectOption("warm-vintage.wav");
  assert(
    await page.evaluate(() =>
      window.bridgeCalls.some(
        (c) => c[0] === "ir" && c[1] === "warm-vintage.wav",
      ),
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Android bridge settings schema, device IDs, engine state, Drive folder/export requests, IR selection (mocked bridge, not device hardware).",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
