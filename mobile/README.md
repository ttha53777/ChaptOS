# ChaptOS mobile

The member app (Expo SDK 58, React Native 0.88, expo-router). Plans:
`docs/mobile-app-plan.md` (build, API, stores) and `docs/mobile-app-ui-motion-plan.md`
(look and motion).

**Status:** U0 (foundations) and the build-plan Phase 2 shell are built: dev
sign-in, the `api()` client, TanStack Query with a persisted cache, routing by
entry state, the org switcher, EAS profiles. The tabs are placeholders (Today
shows `/api/auth/me`); their content is U1/U2. The Motion Lab (`/lab`) is dev only.

## Run it

Needs **Node ≥ 22.13** (Expo 58). The repo's web app still runs on the machine default,
so switch only in this folder:

```bash
cd mobile
nvm use              # reads .nvmrc → 22
npm install
npx expo start       # scan the QR with Expo Go (everything U0 uses ships in Expo Go)
```

Before signing in: `mobile/.env.local` needs `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (the web's public values), and Supabase's redirect
allowlist needs `chaptos://auth-callback` and `exp://**` (Expo Go's redirect is
`exp://<mac-ip>:8081/--/auth-callback`; the sign-in screen prints it in dev).

**API server.** Development talks to `http://<the Mac running Metro>:3100`, the
isolated dev server (worktree + throwaway Postgres), never `:3000`, which shares
the prod database. Override with `EXPO_PUBLIC_API_URL`. Preview and production
builds use `https://chaptos.com` (app.config.ts).

There's no dev client yet. Add `expo-dev-client` when a library outside Expo Go
arrives (push in Phase 5 at the latest).

Checks: `npx tsc --noEmit`, `npx expo-doctor`, and from the repo root
`npm run lint:modules` (mobile/ may import only `import type` from
`lib/api-types` and Zod schemas from `lib/validation`). The root `tsconfig.json` excludes
`mobile/`, so the web `tsc` never sees RN code.

## Layout

```
src/app/            routes (expo-router). index = entry dispatcher; sign-in, terms, join,
                    awaiting = entry screens; (tabs)/ = the member tabs; lab = Motion Lab
src/auth/           the ONLY sign-in code: supabase client (keychain session, PKCE),
                    dev-google.ts (Phase 2 browser OAuth; Phase 7 swaps it). Import ~/auth only
src/api/            api() client (bearer, x-org-slug, x-app-version, 401 refresh, 426 gate)
src/data/           TanStack Query client + AsyncStorage persister, query hooks
src/entry/          useEntry (signed out → terms → join/awaiting → ready), Update screen
src/state/          active org (remembered), update gate
src/theme/          palette.ts (day/night from app/paper-aesthetic.css), type.ts,
                    shadow.ts (hard offset shadows), PaperProvider (theme + motion + type)
src/motion/         motion.ts (EASE / DUR / SPRING tokens), haptics.ts
src/icons/          glyphs.ts is GENERATED from app/components/paper/PaperIcon.tsx
                    (npm run gen:icons); Icon.tsx renders them with react-native-svg
src/paper/          primitives: Button, Surface/Tile/Pill/Chip/Kicker/Avatar/Tape/StickyNote,
                    Ticket, IndexCard, LegalPad, ManilaFolder, Receipt, SheetSurface,
                    Highlighter, Stamp, TickingNumber
src/moments/        signature moments (CheckInTicket)
src/lab/            Motion Lab sections
src/ui/             T (type-scale text), Segmented
```

## Rules for screens

- No literal colours: `const { c } = useTheme()`. No raw `<Text>`: use `<T v="body">`.
- Animate with `useMotion()`: `m.timing(ms, ease)`, `m.spring(name)`, `m.t(ms)` for
  timers. It applies Lab slow-mo and pins `reduceMotion: Never`, because every
  animation designs its own reduced version: branch on `m.reduced`.
- Transform and opacity only on anything that runs per frame.
- Haptics through `haptics.*` only, one per meaningful action.
- New signature moments go in `src/moments/` and get a Lab section.
- Server data goes through `api()` + TanStack Query, keyed by the active org slug.
- Import only `import type` from `@/lib/api-types`; request bodies come from
  `@/lib/validation` (`z.input<typeof schema>`, or `.safeParse` for inline errors).
