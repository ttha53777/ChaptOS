# ChaptOS — landing style app mock

An interactive, standalone light-paper mock of all 13 signed-in destinations. The visual source is `app/components/landing/landing.css`: cream paper, brown ink, peach/sky/mint/butter/lilac/rose accents, Bricolage Grotesque headings, Inter UI text, IBM Plex Mono metadata, and hand-highlighter accents.

## Preview

From the repository root:

```sh
python3 -m http.server 8772 --bind 127.0.0.1 --directory "_design/Landing Style App Mock"
```

Open http://127.0.0.1:8772. This also works by opening `index.html` directly. Google Fonts requires a network connection; system fallbacks are supplied.

## Scope

Dashboard, Timeline, Brotherhood, Chapter, Tasks, Docs, Instagram, Programming, Service, Parties, Treasury, Settings, Billing, and Ask Chapt. Includes sample forms, details drawers, polls, notes, attendance, join-request review, filters, calendars, financial records, and 16 settings destinations including Billing.

This is an adaptation of the existing `Warm App Mock`, copied into a separate directory. The original mock and production app remain untouched. Sample changes persist separately under `chaptos-landing-app-v1`; use Reset sample data in the footer to restore the seed.

## Layout alignment

The current source was consulted for navigation order, sidebar dimensions and profile menu, dashboard grid and four measures, ballot position, single-column Tasks ledger, Chapter meeting list, Treasury's four tabs and balance/breakdown layout, and Settings' dedicated navigation. `layout.js` contains these adaptations; `paper.css` contains the final style layer. All layout changes are confined to this prototype.

This is a functional design approximation, not a pixel-identical rendering of the production React components. Form contents, detailed settings editors, account menus, billing states, and assistant responses are simplified. It uses fictional records with September 10, 2026 as the reference date; permissions, authentication, external integrations, real payments, and AI are not connected. Public marketing, sign-in, provisioning, admin-only tools, and error/loading states are outside this signed-in mock.

## Validation

Run `node "_design/Landing Style App Mock/verify.cjs"` with the preview server running. It checks every destination at desktop and mobile widths, horizontal overflow, settings sections, profile navigation, sidebar collapse, task creation/persistence, local check-in state, Treasury tabs, Programming's calendar, the assistant dialog, and mobile navigation. Screenshots and the machine-readable report are in `qa/`.

## Motion and illustrated details

`life.css` and `life.js` layer in the landing page's actual glyphs (copied to `doodles.svg`), short staggered destination entrances, highlighter strokes, a health-ring sweep, chart-line drawing, scroll reveals, taped announcements, soft background color washes, responsive buttons/cards, and a small paper burst on task completion. Existing screen controls remain in place. Filtering and local data updates do not replay the entrance sequence. Motion runs only on entry or interaction, with no perpetual animation loop. Reduced-motion preferences disable scripted and CSS animations.
