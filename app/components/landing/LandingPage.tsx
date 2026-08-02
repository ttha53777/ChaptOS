// Marketing landing page, rendered at "/" for signed-out visitors (signed-in
// users never see this — app/page.tsx redirects them into their org first).
//
// Ported from _design/ChaptOS Landing Doodle Mock v5.html: Notion-warm paper,
// soft pastels, hand-drawn doodles, Klarna-ish motion. Every product visual is
// a hand-built HTML/CSS vignette (no screenshots), so the page stays sharp at
// every DPI and ships zero image bytes.
//
// The whole tree is server-rendered static markup carrying the mock's data-*
// hooks; LandingMotion is the only page-wide client component and drives every
// animation off them. sections/Setup.tsx is the one interactive section with
// real React state. Everything is scoped under .lp — see landing.css.
import "./landing.css";

import { DoodleSprite } from "./DoodleSprite";
import { LandingMotion } from "./LandingMotion";
import { landingFontClass } from "./fonts";
import { AskPayoff, AskScene } from "./sections/AskScene";
import { Cta } from "./sections/Cta";
import { DayDial, DayPayoff } from "./sections/DayDial";
import { Footer } from "./sections/Footer";
import { Hero } from "./sections/Hero";
import { Modules } from "./sections/Modules";
import { Nav } from "./sections/Nav";
import { Pain } from "./sections/Pain";
import { Price } from "./sections/Price";
import { Setup } from "./sections/Setup";
import { Trust } from "./sections/Trust";

// With JS off everything is present and readable, just static. Opening the beat
// rows is not enough: their content is what carries the opacity, so without the
// `.beat__in > *` rule the transcript renders as six empty gaps.
const NO_JS_CSS = `
.lp [data-reveal]{opacity:1 !important; transform:none !important}
.lp [data-hb]{opacity:1 !important; transform:none !important}
.lp .scene__rail{height:auto}
.lp .scene__stage{position:static; height:auto}
.lp .chat{height:auto; overflow:visible; -webkit-mask-image:none; mask-image:none}
.lp .beat{grid-template-rows:1fr}
.lp .beat__in > *{opacity:1; transform:none}
.lp .ledger li{opacity:1}
.lp .beatlist{display:none}
.lp .dialdeck{height:auto; display:grid; gap:26px}
.lp .dialcard{position:static; opacity:1; transform:none; display:block}
.lp .dialcard__t{display:block}
.lp .dial{display:none}
.lp .spotmini__a{opacity:1; transform:none}
`;

export function LandingPage() {
  return (
    <div className={`lp ${landingFontClass}`}>
      <noscript>
        <style>{NO_JS_CSS}</style>
      </noscript>

      <DoodleSprite />

      <div className="progress" aria-hidden="true">
        <i data-progress />
      </div>

      <Nav />

      <main id="top">
        <Hero />
        <Pain />
        <AskScene />
        <AskPayoff />
        <DayDial />
        <DayPayoff />
        <Modules />
        <Setup />
        <Trust />
        <Price />
        <Cta />
      </main>

      <Footer />

      <LandingMotion />
    </div>
  );
}
