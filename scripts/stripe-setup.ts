/**
 * Create (or find) the Stripe Product + Price this app bills against.
 *
 * Pricing lives in code, not in Dashboard clicks: the tiers are read straight
 * from lib/billing/tiers.ts, so the Price you create here and the bands the app
 * enforces cannot drift apart. Re-runnable — it looks the Price up by a stable
 * lookup_key and only creates one if it's missing.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_test_... npx tsx scripts/stripe-setup.ts
 *   npx tsx scripts/stripe-setup.ts --force-new   # mint a new version
 *
 * Then put the printed id in .env.local as STRIPE_PRICE_ID.
 *
 * ── Changing prices later ────────────────────────────────────────────────────
 *
 * Stripe Prices are IMMUTABLE. You cannot edit an amount or a tier boundary —
 * the only move is to create a new Price and migrate subscriptions onto it. So a
 * pricing change is a three-step job, not a one-line edit:
 *
 *   1. Edit BILLING_BANDS in lib/billing/tiers.ts.
 *   2. Bump LOOKUP_KEY_VERSION below and re-run with --force-new.
 *   3. Migrate existing subscriptions onto the new price id (Stripe can do this
 *      in bulk from the Dashboard, or via subscriptions.update per customer),
 *      and decide whether existing customers are grandfathered.
 *
 * Skipping step 3 means new orgs pay the new price and existing ones silently
 * keep the old one — which may be exactly what you want, but should be a choice.
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import Stripe from "stripe";
import { BILLING_BANDS, SELF_SERVE_MAX, formatPrice, formatRange, stripeTiers } from "../lib/billing/tiers";

/** Bump when the bands change; each version is a distinct, immutable Price. */
const LOOKUP_KEY_VERSION = 1;
const LOOKUP_KEY = `figurints_monthly_v${LOOKUP_KEY_VERSION}`;
const PRODUCT_NAME = "Figurints";

/**
 * "Software as a service (SaaS) - business use".
 *
 * Not optional. Stripe accounts now have Managed Payments enabled by default,
 * and it refuses to create a Checkout Session for a product with no eligible tax
 * code — the failure surfaces at checkout time as
 * "Invalid line_items[0]: the product tax code is missing", long after setup
 * appeared to succeed.
 *
 * Business rather than personal use: the customer is an organization buying
 * software for its operations, not an individual consumer.
 */
const SAAS_TAX_CODE = "txcd_10103001";

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set. Add it to .env.local or pass it inline.");
    process.exit(1);
  }
  const forceNew = process.argv.includes("--force-new");
  const stripe = new Stripe(key);
  const live = key.startsWith("sk_live_");

  console.log(`\nStripe setup — ${live ? "LIVE MODE" : "test mode"}`);
  console.log("─".repeat(60));

  // ── The bands, echoed back so a mistake is visible before anything is created ──
  console.log("\nBands (from lib/billing/tiers.ts):");
  for (const b of BILLING_BANDS) {
    console.log(`  ${formatRange(b).padEnd(18)} ${formatPrice(b.priceCents)}${b.priceCents === null ? "  (not self-serve)" : "/mo"}`);
  }
  console.log(`\n  Self-serve ceiling: ${SELF_SERVE_MAX} members`);

  // ── Product ─────────────────────────────────────────────────────────────────
  // Resolved BEFORE the existing-price check, deliberately. The tax-code heal
  // below has to run even on an otherwise no-op invocation — a product created
  // without one still fails at checkout, and "re-run the setup script" should be
  // enough to fix it. Putting this after an early return made the fix
  // unreachable on exactly the accounts that needed it.
  //
  // Reused across price versions so Stripe reporting treats them as one product.
  const products = await stripe.products.search({ query: `name:"${PRODUCT_NAME}" AND active:"true"`, limit: 1 });
  let product = products.data[0] ?? await stripe.products.create({
    name: PRODUCT_NAME,
    description: "Chapter operations platform — billed monthly by member count.",
    tax_code: SAAS_TAX_CODE,
  });

  const currentTaxCode = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
  if (currentTaxCode !== SAAS_TAX_CODE) {
    product = await stripe.products.update(product.id, { tax_code: SAAS_TAX_CODE });
    console.log(`\nProduct: ${product.id} — tax_code set to ${SAAS_TAX_CODE} (required by Managed Payments)`);
  } else {
    console.log(`\nProduct: ${product.id} (${products.data[0] ? "existing" : "created"})`);
  }

  // ── Existing price? ─────────────────────────────────────────────────────────
  if (!forceNew) {
    const found = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1, expand: ["data.tiers"] });
    if (found.data.length > 0) {
      const price = found.data[0];
      console.log(`\nPrice already exists for lookup_key "${LOOKUP_KEY}".`);
      printPrice(price);
      console.log("\nNothing else to do. Pass --force-new to mint a new version.");
      return;
    }
  }

  // ── Price ───────────────────────────────────────────────────────────────────
  const tiers = stripeTiers();
  const price = await stripe.prices.create({
    product:        product.id,
    currency:       "usd",
    nickname:       `Monthly, volume-tiered (v${LOOKUP_KEY_VERSION})`,
    // Only set on the non-forced path; a --force-new run would collide otherwise
    // (lookup keys are unique among active prices).
    ...(forceNew ? {} : { lookup_key: LOOKUP_KEY }),
    recurring:      { interval: "month", usage_type: "licensed" },
    billing_scheme: "tiered",
    // volume, not graduated: the whole quantity is priced by the ONE tier it
    // lands in. With unit_amount 0 and the band price in flat_amount, that is
    // exactly a flat fee per band.
    tiers_mode:     "volume",
    tiers,
    expand:         ["tiers"],
  });

  console.log(`\nPrice created.`);
  printPrice(price);

  console.log(`\n${"─".repeat(60)}`);
  console.log("Add this to .env.local:\n");
  console.log(`  STRIPE_PRICE_ID=${price.id}`);
  console.log("\nStill to do in the Dashboard (Settings → Billing):");
  console.log("  • Turn ON automatic customer emails (receipts, failed payment, card expiring)");
  console.log("  • Turn ON Smart Retries");
  console.log("    Those two ARE the dunning strategy — without them nobody learns their card failed.");
  console.log(`  • Add a webhook endpoint → https://<your-domain>/api/billing/webhook`);
  console.log("    then put its signing secret in STRIPE_WEBHOOK_SECRET.\n");
}

function printPrice(price: Stripe.Price): void {
  console.log(`  id:         ${price.id}`);
  console.log(`  lookup_key: ${price.lookup_key ?? "(none)"}`);
  console.log(`  scheme:     ${price.billing_scheme} / ${price.tiers_mode}`);
  for (const t of price.tiers ?? []) {
    const upTo = t.up_to === null ? "inf" : t.up_to;
    console.log(`    up_to ${String(upTo).padEnd(5)} unit ${t.unit_amount ?? 0}  flat ${t.flat_amount ?? 0}`);
  }
}

main().catch((e: unknown) => {
  console.error("\nstripe-setup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
