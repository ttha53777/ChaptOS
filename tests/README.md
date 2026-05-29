# Tests

## One-time setup

Make sure Docker Desktop (or any Docker daemon) is running, then:

```sh
npm run test:db:up    # start figurints-test Postgres on :54330
```

## Run

```sh
npm test              # one-shot
npm run test:watch    # watch mode
```

`globalSetup` migrates the test DB before any test file runs. `resetDb()` in
`tests/setup/prisma.ts` TRUNCATEs every domain table between tests.

## Categories

- `tests/tenancy/` — proves `db(orgId)` never returns cross-org rows. **P0**:
  red here blocks every other test category.
- `tests/services/` — state transitions, conflict guards, business rules.
- `tests/permissions/` — gate matrix per `Permission` bit (added later).

## Tear down

```sh
npm run test:db:down  # remove container + volume
```

The compose file uses `tmpfs` for `/var/lib/postgresql/data` so even without
explicit teardown, the DB resets to empty on container restart.

## CI

GitHub Actions will need a Postgres service container; the workflow file lives
in `.github/workflows/` (added in a follow-up commit if not present).
