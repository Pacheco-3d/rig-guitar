function makeTone() {
  const samples = 22050,
    buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF");
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(22050, 24);
  buffer.writeUInt32LE(44100, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    buffer.writeInt16LE(
      Math.round(5000 * Math.sin((2 * Math.PI * 220 * i) / 22050)),
      44 + i * 2,
    );
  return buffer;
}
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.RIG_TEST_URL || "http://127.0.0.1:3000");
  await page.screenshot({ path: "/tmp/rig-rack-desktop.png", fullPage: true });
  assert.equal(await page.locator(".preset-item").count(), 24);
  await page.locator(".preset-item").nth(1).click();
  assert.equal(
    await page.locator("#preset-title").textContent(),
    "Midnight Glass",
  );
  assert.equal(await page.locator("#amp-model").inputValue(), "american");
  await page.locator("#amp-0").fill("8.2");
  assert.equal(
    await page.locator("#amp-controls output").first().textContent(),
    "8.2",
  );
  await page.locator("#amp-0").focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator("#amp-0").inputValue(), "8.3");
  await page.locator("#compare").click();
  assert.equal(await page.locator("#amp-0").inputValue(), "2");
  assert.equal(
    await page.locator("#compare").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#compare").click();
  assert.equal(await page.locator("#amp-0").inputValue(), "8.3");
  await page.locator("#amp-power").click();
  assert.equal(
    await page.locator("#amp-power").getAttribute("aria-pressed"),
    "false",
  );
  await page.locator(".footswitch").nth(2).click();
  assert.equal(
    await page.locator(".footswitch").nth(2).getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#master").fill("42");
  await page.locator("#mic").selectOption("1");
  await page.locator("#save-button").click();
  await page.locator("#preset-name").fill("Meu rack");
  await page.locator("#save-form button[type=submit]").click();
  await page.reload();
  await page.locator(".preset-item").last().click();
  assert.equal(await page.locator("#amp-0").inputValue(), "8.3");
  assert.equal(await page.locator("#master").inputValue(), "42");
  assert.equal(
    await page.locator("#amp-power").getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    await page.locator(".footswitch").nth(2).getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(await page.locator("#mic").inputValue(), "1");
  await page.locator("#search").fill("nada-encontrado");
  assert.equal(await page.locator(".preset-item").count(), 0);
  assert(await page.locator(".empty").isVisible());
  await page.locator("#search").fill("");
  await page.locator(".preset-item").first().click();
  await page.locator("#play-demo").click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#play-text").textContent(), "Parar demo");
  const energy = await page.evaluate(() => {
    const a = new Float32Array(audio.analyser.fftSize);
    audio.analyser.getFloatTimeDomainData(a);
    return a.some((n) => Math.abs(n) > 0.0001);
  });
  assert(energy, "Audio graph must produce actual output");
  await page.locator("#amp-0").fill("9");
  await page.locator("#global-bypass").click();
  assert.equal(
    await page.locator("#global-bypass").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#global-bypass").click();
  await page.locator("#play-demo").click();
  assert.equal(await page.locator("#play-text").textContent(), "Ouvir timbre");
  await page.locator("#help").click();
  assert(await page.locator("#help-dialog").isVisible());
  await page.keyboard.press("Escape");
  await page.locator("[data-bank=modern]").click();
  assert.equal(await page.locator(".preset-item").count(), 5);
  assert.equal(await page.locator("#amp-model").inputValue(), "modern");
  await page.locator("[data-bank=all]").click();
  await page.locator("#nav-library").click();
  assert(await page.locator("#components-content").isVisible());
  await page.locator(".component-button").nth(1).click();
  assert.equal(
    await page.locator(".component-button").nth(1).getAttribute("aria-pressed"),
    "false",
  );
  await page.locator("#nav-studio").click();
  assert(await page.locator("#browser-content").isVisible());
  await page.locator("#live-view").click();
  assert(
    await page
      .locator(".application")
      .evaluate((e) => e.classList.contains("live")),
  );
  await page.locator(".live-switch").nth(3).click();
  assert.equal(
    await page.locator(".live-switch").nth(3).getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#live-view").click();
  await page.locator("#collapse-all").click();
  assert.equal(await page.locator(".pedal.collapsed").count(), 4);
  await page.locator("#collapse-all").click();
  assert.equal(await page.locator(".pedal.collapsed").count(), 0);
  await page.locator("#audio-file").setInputFiles({
    name: "rig-test-tone.wav",
    mimeType: "audio/wav",
    buffer: makeTone(),
  });
  await page.waitForFunction(
    () =>
      document.querySelector("#audio-file-label").textContent ===
      "rig-test-tone.wav",
  );
  await page.locator("#play-demo").click();
  await page.waitForTimeout(400);
  assert.equal(
    await page.locator("#engine-label").textContent(),
    "rig-test-tone.wav",
  );
  assert(
    await page.evaluate(() => {
      const d = new Float32Array(audio.analyser.fftSize);
      audio.analyser.getFloatTimeDomainData(d);
      return d.some((n) => Math.abs(n) > 0.0001);
    }),
  );
  await page.locator("#clear-audio").click();
  assert.equal(await page.locator("#play-text").textContent(), "Ouvir timbre");
  assert(await page.locator("#clear-audio").isHidden());
  await page.locator("#ir-file").setInputFiles("library/irs/warm-vintage.wav");
  await page.waitForFunction(() =>
    document.querySelector("#ir-status").textContent.includes("nesta sessão"),
  );
  assert(
    await page.evaluate(
      () =>
        Math.abs(audio.cabIR.buffer.duration - 1024 / 48000) <
        1 / audio.ctx.sampleRate,
    ),
  );
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    assert(
      !(await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      )),
      `Overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(3600);
  await page.screenshot({ path: "/tmp/rig-rack-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: banks, browser/components, live view, collapse/expand, compare/restore, presets, saved settings, keyboard, audio import/play/clear, synthesized output, bypass, help, 5 viewport widths.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
