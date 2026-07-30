/**
 * Sweeps the pre-auth /create flow across BOTH themes × all six steps, writing
 * _screenshots/create-{theme}-{step}.png for visual review.
 *
 * Unlike scripts/screenshot.ts this needs no DB and no impersonation — /create
 * is anonymous. What it does need are two non-obvious things:
 *
 *   1. Both localStorage keys are seeded via addInitScript, so they exist BEFORE
 *      the theme boot script and the draft restore run.
 *   2. It navigates to /create?resume=1. useDraft() deliberately DELETES a
 *      stored draft on any non-resume visit (so reopening /create never lands on
 *      a stale half-finished draft), which would otherwise park every shot on an
 *      empty step 1.
 *   3. The seeded draft's own `step` is NOT how we choose the screen. ?resume=1
 *      is the post-OAuth leg, so CreateFlow force-jumps a named draft straight to
 *      `build`. We let it, then click the step rail back to the target — which
 *      also keeps a real org name in every shot (seeding an empty name would
 *      honour draft.step, but then there is nothing to look at).
 *
 * The seed sets kind + interviewDone because CreateFlow gates the steps past the
 * interview — without them a rail jump to roles/timeline bounces to `interview`.
 *
 * Prereqs: dev server on http://localhost:3000 (npm run dev).
 *
 * Usage:
 *   npx tsx scripts/screenshot-create-flow.ts              # both themes, all steps
 *   npx tsx scripts/screenshot-create-flow.ts dusk          # one theme
 *   npx tsx scripts/screenshot-create-flow.ts ivory roles   # one theme, one step
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Browser } from "playwright";
import {
  CREATE_STEPS,
  DRAFT_STORAGE_KEY,
  defaultMetrics,
  emptyDraft,
  type CreateStep,
} from "../lib/onboarding/draft";
import { CREATE_THEME_STORAGE_KEY, type CrfTheme } from "../lib/onboarding/create-theme";
import { KIND_TO_TYPE } from "../lib/onboarding/kinds";
import { seatsFromTemplate } from "../lib/onboarding/seats";
import { getOrgType } from "../lib/org-types";

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "_screenshots");
const THEMES: CrfTheme[] = ["dusk", "ivory"];

/**
 * The Build step has two faces and ?resume=1 only ever shows one of them: the
 * post-OAuth leg auto-fires provisioning, so the Google sign-in card — the step's
 * FIRST frame in the real flow, and the one place the theme has to fight a white
 * pill on near-white paper — never appears. Pre-auth the auto-build 401s, which
 * returns BuildStep's phase to "signin", so waiting for .gbtn reaches it.
 */
const SIGNIN_STEP = "signin";

/**
 * A complete, mid-flow draft: named org, interview finished, seats seeded.
 *
 * Built from emptyDraft() rather than hand-written, so it can never drift out of
 * conformance with draftSchema — a draft that fails to parse is silently
 * discarded and every shot lands on an empty step 1.
 */
function seedDraft() {
  const kind = "fraternity" as const;
  const orgTypeId = KIND_TO_TYPE[kind];
  const orgType = getOrgType(orgTypeId);
  if (!orgType) throw new Error(`No org type for kind "${kind}"`);
  return {
    ...emptyDraft(),
    step: "build" as CreateStep,
    name: "Oozma Kappa",
    kind,
    founderName: "Mike Wazowski",
    interviewDone: true,
    enabledWorkflows: [...orgType.enabledWorkflows],
    metrics: defaultMetrics(kind),
    seats: seatsFromTemplate(orgTypeId),
  };
}

async function ensureChromium(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    if (/Executable doesn't exist|install/i.test(String(err))) {
      console.log("Chromium binary not found — installing (one-time)…");
      execSync("npx playwright install chromium", { stdio: "inherit" });
      return await chromium.launch();
    }
    throw err;
  }
}

async function main() {
  const args = process.argv.slice(2);
  // Args are filters, in either order and independently: any theme name narrows
  // the themes, any step name narrows the steps, and naming neither runs everything.
  const namedThemes = args.filter((a): a is CrfTheme => THEMES.includes(a as CrfTheme));
  const namedSteps = args.filter(a => CREATE_STEPS.includes(a as CreateStep) || a === SIGNIN_STEP);
  const themes = namedThemes.length ? namedThemes : THEMES;
  const steps: string[] = namedSteps.length ? namedSteps : [...CREATE_STEPS, SIGNIN_STEP];

  const unknown = args.filter(a => !namedThemes.includes(a as CrfTheme) && !namedSteps.includes(a));
  if (unknown.length) {
    console.error(`\n✗ Unknown argument(s): ${unknown.join(", ")}`);
    console.error(`  themes: ${THEMES.join(", ")}`);
    console.error(`  steps:  ${[...CREATE_STEPS, SIGNIN_STEP].join(", ")}\n`);
    process.exit(1);
  }

  try {
    await fetch(BASE_URL, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  } catch {
    console.error(`\n✗ Dev server not reachable at ${BASE_URL}. Start it with: npm run dev\n`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await ensureChromium();

  for (const theme of themes) {
    for (const step of steps) {
      // A fresh context per shot: the draft is seeded per-step, and a stale
      // in-page draft would be re-persisted by the write-through effect.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(
        ([themeKey, themeVal, draftKey, draftVal]) => {
          localStorage.setItem(themeKey as string, themeVal as string);
          localStorage.setItem(draftKey as string, draftVal as string);
        },
        [CREATE_THEME_STORAGE_KEY, theme, DRAFT_STORAGE_KEY, JSON.stringify(seedDraft())] as const,
      );

      const page = await context.newPage();
      const file = resolve(OUT_DIR, `create-${theme}-${step}.png`);
      try {
        await page.goto(new URL("/create?resume=1", BASE_URL).toString(), {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        // Wait on the surface, not a timeout: the resume leg lands on `build`.
        await page.waitForSelector(`.crf .scr[data-step="build"]`, { timeout: 20_000 });

        if (step === SIGNIN_STEP) {
          await page.waitForSelector(".crf .gbtn", { timeout: 30_000 });
        } else if (step !== "build") {
          // The rail is index-aligned with CREATE_STEPS, and every step is
          // reachable because the seed answered the interview.
          await page.locator(".crf .rail button").nth(CREATE_STEPS.indexOf(step as CreateStep)).click();
          await page.waitForSelector(`.crf .scr[data-step="${step}"]`, { timeout: 10_000 });
        }
        // The blueprint's URL field runs an async slug check. A fixed wait races
        // it, so consecutive runs disagree about whether the badge reads
        // "checking …" or "✓ available" — which shows up as a phantom 559px diff
        // when comparing runs. Wait for the field to settle instead.
        if (step === "blueprint") {
          await page
            .waitForSelector(".crf .url-field.ok, .crf .url-field.taken", { timeout: 15_000 })
            .catch(() => {});
        }
        // Let the entrance choreography land (the name reveal is 1100ms).
        await page.waitForTimeout(1400);

        const landed = await page.evaluate(() => ({
          theme: document.documentElement.dataset.crfTheme ?? "(unset)",
          step: document.querySelector(".crf .scr")?.getAttribute("data-step") ?? "(none)",
          paper: getComputedStyle(document.querySelector(".crf")!).backgroundColor,
        }));
        // Never fullPage: .crf is position:fixed, so a fullPage shot of a fixed
        // overlay double-exposes. Viewport shots only.
        await page.screenshot({ path: file });
        const expected = step === SIGNIN_STEP ? "build" : step;
        const warn = landed.step !== expected ? ` ⚠ landed on ${landed.step}` : "";
        console.log(`  ${theme}/${step} → ${landed.paper}${warn}`);
      } catch (err) {
        console.error(`  ${theme}/${step} → FAILED: ${String(err).split("\n")[0]}`);
      }
      await context.close();
    }
  }

  await browser.close();
  console.log(`\nDone. PNGs in ${OUT_DIR.replace(process.cwd() + "/", "")}/`);
}

void main();
