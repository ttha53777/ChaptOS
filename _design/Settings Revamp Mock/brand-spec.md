# Settings mock design foundation

Uses the huashu-design context-first workflow. Source of truth is the repository,
specifically app/[slug]/settings/settings-ledger.css and app/layout.tsx.

The prototype directly loads the settings stylesheet. app-tokens.css bridges
prototype variable names to the app's actual .set-page tokens and follows its
input, button, card, status pill and checkbox conventions.

Typography: Fraunces headings, Geist interface text, Geist Mono metadata.
Palette: app dusk surfaces, cream text, violet actions, gold unsaved state,
rose destructive actions and green success. No alternate visual themes.

Layout: one settings sidebar, one reading column, compact headings and divided
rows. Search, direct section navigation and unsaved-change protection remain.
The app screenshot references are in _screenshots/responsive/.

This mock has sample content and simulated actions. It must stay inside the
repository for the linked application stylesheet to resolve.
