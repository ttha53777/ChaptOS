/** Run against a local Next dev server: LANDING_TEST_URL=http://localhost:3001 npx tsx scripts/test-mobile-landing.ts */
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";

const base = process.env.LANDING_TEST_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const errors: string[] = [];
  const watchErrors = (page: Page) => {
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" && /hydration|didn't match|did not match/i.test(message.text())) errors.push(message.text());
    });
  };
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    watchErrors(page);
    await page.goto(base, { waitUntil: "networkidle" });
    await page.locator(".mlp").waitFor({ state: "visible" });
    await page.locator("#mobile-members:not([disabled])").waitFor();

    for (const width of [320, 375, 390, 430, 767, 768, 1024, 1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForFunction(mobile => {
        const mobileVisible = getComputedStyle(document.querySelector(".mlp")!).display !== "none";
        const desktopVisible = getComputedStyle(document.querySelector(".landing-desktop")!).display !== "none";
        return mobileVisible === mobile && desktopVisible !== mobile;
      }, width < 768);
      assert.equal(await page.getByRole("main").count(), 1, `one accessible main at ${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal overflow at ${width}px`);
      if (width < 768) {
        const clippedText = await page.locator(".mlp h1").evaluate(el => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return Array.from(range.getClientRects()).some(r => r.left < 0 || r.right > innerWidth);
        });
        assert.equal(clippedText, false, `headline fits at ${width}px`);
      }
    }

    await page.getByRole("tab", { name: "The plans" }).click();
    await page.getByRole("tabpanel").getByText("Chapter meeting").waitFor();
    await page.getByRole("tab", { name: "The plans" }).press("ArrowRight");
    await page.getByRole("tabpanel").getByText("Join requests").waitFor();
    await page.getByRole("tab", { name: "The people" }).press("Home");
    await page.getByRole("tabpanel").getByText("Semester dues").waitFor();
    await page.getByRole("button", { name: "What’s on this week?" }).click();
    await page.getByText("Chapter on Tuesday. Service on Saturday.", { exact: true }).waitFor();
    await page.locator(".mlp .source summary").click();
    await page.locator(".mlp .source[open]").waitFor();
    await page.getByRole("button", { name: "Mark fall budget as done in demo" }).click();
    await page.getByText("Done · one less thing on your list", { exact: true }).waitFor();

    for (const [count, price] of [[1, "$0"], [4, "$0"], [5, "$25"], [50, "$25"], [51, "$65"], [120, "$65"], [121, "Let’s talk"]] as const) {
      await page.locator("#mobile-members").fill(String(count));
      await page.waitForFunction(expected => document.querySelector(".mlp .amount > span")?.textContent === expected, price);
      assert.equal(await page.locator(".mlp .price-card .primary").getAttribute("href"), count > 120 ? "/contact" : "/create");
    }
    assert.equal(await page.locator(".mlp .topbar .sign-in").getAttribute("href"), "/login");
    await page.locator(".mlp .faq summary").first().click();
    assert.notEqual(await page.locator(".mlp .faq details").first().getAttribute("open"), null);

    await page.locator("#mobile-inside").scrollIntoViewIfNeeded();
    await page.locator(".mlp .dock.visible:not([inert])").waitFor();
    await page.locator("#mobile-closing").scrollIntoViewIfNeeded();
    await page.locator(".mlp .dock[inert]").waitFor();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.locator("#mobile-hero-cta").click();
    await page.waitForURL("**/create");
    assert.equal(new URL(page.url()).pathname, "/create", "real setup navigation");
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue("--mobile-landing-dock-height")), "", "dock clearance is cleaned up on navigation");

    // Tabbing used to leave the pricing link entirely behind the fixed CTA.
    // Exercise browser-driven focus scrolling, rather than Playwright click()
    // which scrolls targets into view and can hide this regression.
    for (const width of [320, 390]) {
      const keyboard = await browser.newPage({ viewport: { width, height: 664 }, reducedMotion: "reduce" });
      watchErrors(keyboard);
      await keyboard.goto(base, { waitUntil: "networkidle" });
      let pricingLinkChecked = false;
      for (let step = 0; step < 30 && !pricingLinkChecked; step++) {
        await keyboard.keyboard.press("Tab");
        await keyboard.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const focus = await keyboard.evaluate(() => {
          const active = document.activeElement as HTMLElement;
          const dock = document.querySelector<HTMLElement>(".mlp .dock")!;
          const rect = active.getBoundingClientRect();
          return {
            text: active.textContent?.trim() ?? "",
            covered: !!active.closest(".mlp") && !dock.contains(active) && dock.classList.contains("visible") && rect.width > 0 && rect.bottom > dock.getBoundingClientRect().top,
          };
        });
        assert.equal(focus.covered, false, `keyboard focus stays above dock at ${width}px: ${focus.text}`);
        pricingLinkChecked = focus.text === "Full pricing details ↗";
      }
      assert.equal(pricingLinkChecked, true, "keyboard traversal reached pricing details");
      // Simulate taller text/device safe-area padding to exercise measurement.
      await keyboard.addStyleTag({ content: ".mlp .dock { padding-bottom: 64px; }" });
      await keyboard.waitForFunction(() => Number.parseFloat(document.documentElement.style.getPropertyValue("--mobile-landing-dock-height")) === document.querySelector<HTMLElement>(".mlp .dock")!.offsetHeight);
      await keyboard.close();
    }

    const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const fallback = await noJs.newPage();
    await fallback.goto(base);
    assert.equal(await fallback.locator(".mlp").isVisible(), true);
    assert.equal(await fallback.locator(".landing-desktop").isVisible(), false);
    assert.equal(await fallback.locator("#mobile-hero-cta").getAttribute("href"), "/create");
    assert.equal(await fallback.locator("#mobile-members").isDisabled(), true, "SSR calculator cannot change independently of its quote");
    await fallback.locator("#mobile-members").dispatchEvent("keydown", { key: "End" });
    assert.equal(await fallback.locator("#mobile-members").inputValue(), "25");
    assert.equal(await fallback.locator("#mobile-member-count").innerText(), "25 members");
    assert.match(await fallback.locator(".mlp .amount").innerText(), /\$25/);
    assert.equal(await fallback.locator(".mlp noscript .price-caption").isVisible(), true);
    await noJs.close();

    const reduced = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    watchErrors(reduced);
    await reduced.goto(base);
    assert.equal(await reduced.locator(".mlp .dock").evaluate(el => getComputedStyle(el).transitionDuration), "0s");
    await reduced.close();
    assert.deepEqual(errors, [], "no runtime/hydration errors");
    console.log("PASS: mobile/desktop breakpoint + resizing, headline fit, tabs + keyboard, sample questions, sources, task toggle, pricing boundaries, CTA navigation, dock + keyboard clearance + cleanup, FAQ, no-JS pricing fallback, reduced motion, hydration.");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
