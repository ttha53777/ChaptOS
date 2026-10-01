# ChaptOS — Warm Paper After Hours

A connected, responsive mock of the signed-in app. Open `index.html` or serve this directory:

```sh
python3 -m http.server 8770 --bind 127.0.0.1 --directory "_design/Warm App Mock"
```

Preview: http://127.0.0.1:8770/

## Coverage

Dashboard, Timeline, Brotherhood, Chapter, Tasks and polls, Docs, Instagram, Programming, Service, Parties, Treasury, Settings, and Billing. Settings includes identity, vocabulary, accounts, invitations, roles, custom fields and metrics, thresholds, semesters, event types, money categories, workflow visibility, and activity. Treasury includes transactions, budgets, dues, reimbursements, party totals, and reports.

The mock includes editable records, event preparation, attendance roll call, meeting notes, service hours, party wrap-up, reviewed join requests, polls, document folders and pins, calendars, filters, search, CSV exports, and an Ask Chapt demonstration. Tasks, events, members, and finances are shared between screens. Payments and approved reimbursements update the local ledger. Changes persist in browser localStorage; “Reset sample data” restores the original state.

No production files, backend, real invitations, payment processor, or AI service are connected. Billing is a visual preview; document links point to sample destinations. Login, loading, onboarding, and marketing are excluded. Sample date is fixed at September 10, 2026. This is a design prototype, not a replacement for production validation, permissions, or accounting.

## Design foundation

Adapted from the user’s Dashboard Dark Warm Mock and the app’s landing-page design vocabulary. Warm charcoal paper (#1C1B19), deeper navigation (#181715), brown-black cards (#25231F), cream text (#F3EBDD), muted warm dividers. Bricolage Grotesque supplies the rounded display voice, Inter carries UI text, and IBM Plex Mono separates dates and metadata. Google Fonts needs a network connection; local fallbacks remain available.

Six subdued color families distinguish work: sky for general records, lilac for planning, mint for service and healthy finances, butter for decisions and dues, peach for attention, and rose for parties. Soft tinted surfaces use brighter text and medium borders rather than saturated fills. Rounded cards, compact pills, colored hard shadows on primary buttons, restrained hand highlights, and a taped announcement note keep the app aligned with the reference.

The wide layout uses persistent navigation and a primary work area with a secondary rail. Narrow layouts use a navigation drawer, stacked content, two-column metrics, and locally scrolling tables/calendars. Dialogs support Escape, labelled forms, visible focus, and reduced-motion preferences.

## Verification

All JavaScript passed `node --check`. Browser checks covered the main destinations and every settings section, task creation appearing on the timeline, persisted state after reload, reimbursement approval, dues payment, event checklist changes, attendance dialog, and sample assistant responses. Desktop and 390px layouts were visually inspected. No runtime errors were reported during these checks.

## Production fidelity pass · October 1, 2026

Programming now follows the app’s `lib/programming.ts` stage gates and the structure of `ProgrammingBoard`, `TimelineStrip`, and `EventWrapUp`: a next-on-deck briefing, attention filter, published-event strip, multi-select type filters, four described lanes, calendar with an undated rail, and an event details drawer with preparation progress. Moving into Planning asks for an owner; confirming asks for date and location; moving a published event back warns that it will leave the timeline. Wrap-up saves an optional rating and notes. Event editing no longer offers a shortcut from an unconfirmed event straight to Done.

The Timeline and dashboard upcoming lists exclude unpublished programming plans. Timeline search works across titles and locations, and Add to calendar previews Google, Apple, and other calendar setup with an explicit local-only state. The existing poll action now reopens closed polls correctly. All enhancements use the unchanged `theme.css` tokens. `fidelity.js` and `fidelity.css` contain the production-shaped Programming surfaces and calendar preview; the original connected mock remains the foundation.

Validation: browser checks covered all 13 routes, missing-field stage prompts, publication visibility, Timeline search, calendar instructions, persisted wrap-up, multiple type filters, the undated calendar rail, mobile drawer navigation, Escape dismissal, and horizontal overflow at 390px. Desktop and mobile screenshots were reviewed. This pass does not connect production data or create a live calendar subscription.
