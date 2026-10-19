# vinext-starter

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux; no Bash required
- Managed Linux: managed Linux runtime with Bash, `flock`, `curl`, `sha256sum`, and GNU `timeout`
- Git is required only for publishing

## Sites Lifecycle

The Sites initializer copies the shared starter and selects managed-linux only when `SITES_MANAGED_LINUX_CONTAINER=1`; otherwise it selects portable. It saves the selection only in ignored `.sites-runtime/execution-profile.json`. Both profiles copy/configure first, then use the plugin's separate `install-dependencies.mjs` step to measure installation independently. Edit source under `app/` and follow the Sites skill for installation, preview, builds, and publishing.

Run `node <plugin-root>/scripts/configure-execution-profile.mjs` only when the profile is unknown for the current checkout and environment. Profile changes do not alter tracked source or require reinstalling otherwise-valid dependencies; restart an existing preview to use the new selection. Do not commit or upload `.sites-runtime/`.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against the shared lockfile, disables parent-workspace discovery, and includes required dev/optional dependencies despite production/omit settings. Sharp defaults to prebuilt binaries unless explicitly configured otherwise. Do not overlap installers.

- **Portable:** Preserve host HOME, npm cache, registry, proxy, temporary paths, retry/concurrency settings, and lifecycle-script policy. Use `--prefer-offline --no-audit --no-fund`.
- **Managed Linux:** Use the existing project-local HOME/cache/tmp setup and Linux install lock, tarball preflight, and timeout. Restore the image-seeded npm cache only when its lockfile hash matches; retain network fallback. Builds keep their existing timeout. These helpers are not invoked by the portable profile.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

On portable, `npm run dev` uses `vinext dev` with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state, rejects an ordinary duplicate launch, and recovers stale state after a stopped process; exactly simultaneous starts can race. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep portable previews on loopback.

For browser QA on managed Linux, use `sites-preview start`. The project's dev script runs Vite and accepts the supervisor's `--host 0.0.0.0 --port 4173 --strictPort` arguments. The internal browser uses `http://terminal.local:4173/`; it is not a user-facing URL. The supervisor owns the preview lifecycle. The ignored local profile survives the supervisor's cleared process environment.

The portable profile simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. Mock auth is disabled in the managed-linux profile and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

The portable build runs Vinext directly without a host `timeout` command. The managed-linux build uses `scripts/build-verified.sh` and its existing `SITES_BUILD_TIMEOUT` setting.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)

## Astra forecast v2.0

Original experimental election-day model in `lib/astra-model.ts`; methodology is exposed in the Astra dashboard panel. Inputs: deduplicated raw polls from the 338Canada HTML table, Northern Vibe HTML table and Vote-Scope public JSON catalog; official Elections BC candidate table; a fixed 93-riding certified-2024-result baseline retrieved from Northern Vibe on October 4, 2026. `lib/data/astra-inputs.json` and `astra-result.json` are initial offline snapshots, not invented live data. The 2024 baseline is fixed historical information and need not be downloaded at each refresh.

`GET /api/election` and `GET /api/astra` refresh the model from fixed public upstream sources with a five-minute cache. They accept no user-written model inputs or arbitrary URLs. The latest inputs/result and feed health are cached in D1's `astra_cache`; an unavailable upstream preserves earlier data with an explicit warning. The dashboard opens and refreshes these endpoints every five minutes while visible. There is no background schedule: reopening recomputes as needed. Forecasting stops after October 24. These endpoints are read-only public forecast resources whose cache is maintained internally; they do not expose an arbitrary data writer.

The polling median covers five models (338Canada, Northern Vibe, Stephen Taylor, Astra and Opus 5.5) and is the middle value, calculated separately per leading party. With three human-built models and two AI-built ones, the median always falls within the human models' range. Vote-Scope's forecast is still fetched and shown, flagged as untrusted and excluded from the median: its 80% vote ranges (about ±1.8 points) leave almost no room for a province-wide polling miss. Its poll catalog is still an Astra/Opus input, and its vote estimate still appears in the Popular vote panel. It continues to carry 50% of the headline. Astra shares polling inputs with peers and has no independent-evidence claim. Probabilities exclude seat ties. Other candidates' seats are combined only for display; separate independents and minor parties are separate competitors for most seats.

Validation: `node scripts/astra-check.mjs` checks probability/seat conservation, joint draw bounds and totals, Dirichlet moments, ballot eligibility, reproducibility, deduplication, four-model median/spread, and extreme-poll direction. It regenerates the dated October 4 seed and reports sensitivity to ±25% uncertainty. `node scripts/astra-backtest.mjs` then runs two retrospective election-eve checks using the same production model and writes `lib/data/astra-backtests.json`. See `scripts/fixtures/README.md` for input provenance, cutoffs, limitations and reconstruction. These are limited checks, not independent validation or evidence of calibrated rare-event odds.

Version 2 replaces independent heavy-tailed percentage-point shocks with joint Dirichlet vote distributions. Variance scales with party support, with extra log-odds uncertainty for new parties. All riding draws sum to 100%; ballot-ineligible parties stay zero. No party's most-seats probability is manually forced to zero. Below 0.1% is a shared display band (including no wins); raw probabilities remain in `/api/astra`. A version-specific persistent cache prevents a saved v1 forecast from overriding the corrected seed.

## Opus 5.5 model v1.0

An AI-built challenger to Astra, designed and coded by Claude Opus 5.5 (Anthropic), in `lib/opus-model.ts`; methodology is exposed in the Opus dashboard panel. It reuses Astra's fetched inputs (the same deduplicated polls, Elections BC candidate list and fixed 2024 baseline), so it adds no upstream requests, and is recomputed with Astra in `lib/astra-server.ts`. Both forecasts are skipped when inputs and date are unchanged, because each simulation is seeded from its inputs.

It differs from Astra by design: centred, shrunk pollster house effects; inverse-variance poll weights that include a non-sampling error term; a 50/50 blend of uniform and proportional swing; open-seat, returning-MLA and floor-crossing adjustments, with name matching that tolerates middle names and initials; and log-share (logistic-normal) uncertainty whose province-wide errors share a multivariate-t scale, allowing every party to miss together. All parameters are in `OPUS_PARAMS` and were fixed before the retrospective checks.

The Opus model is one of the five models in the headline polling median, with 338Canada, Northern Vibe, Stephen Taylor and Astra (the median is the middle value). It also has its own panel with a head-to-head against Astra.

`GET /api/opus` returns the current forecast, feed status and backtests. `node scripts/opus-check.mjs` checks seat/probability conservation, riding share sums, calibration of riding baselines to the polling average, reproducibility, extreme-poll direction and name matching, regenerates `lib/data/opus-result.json` (stamped with its inputs' retrieval time) and runs the same 2020/2024 election-eve fixtures as Astra, writing `lib/data/opus-backtests.json` with Astra's scores alongside. Two elections with three polls each cannot establish calibration, and the model's author knew both outcomes.

## Public snapshot on GitHub Pages

`.github/workflows/snapshot.yml` publishes a static copy of the dashboard to GitHub Pages every 2 hours from 8 a.m. to 6 p.m. Pacific, on pushes to `main` that touch the app, and on demand (Actions → Publish dashboard snapshot → Run workflow). Scheduled runs stop after October 25, 2026.

Each run starts the app on the runner, captures `/api/election` and `/api/history`, and `scripts/snapshot/build.mjs` bundles the real dashboard components with that data into one self-contained `index.html`. The page cannot refresh itself; it shows when the snapshot was taken. To build one locally: `node scripts/snapshot/refresh.mjs _site`.

The page's **Latest polls** panel marks polls that are new since the previous update. Each build publishes `poll-ledger.json` (when each poll first appeared) beside the page, and the next build downloads it to compare (`lib/poll-ledger.ts`). A poll whose fieldwork dates are revised keeps its original arrival time. In the live app, which has no ledger, the panel lists the most recent polls without arrival times.

## Popular vote

The **Popular vote** panel shows each party's expected province-wide vote share on election day (mean and 80% range across simulations) from Astra and Opus 5.5, Vote-Scope's own published estimate, and each party's expected share of seats. Both simulations record the turnout-weighted vote in every run (`popularVoteTracker` in `lib/astra-model.ts`) and how often the party with the most votes fails to win the most seats outright. Recording these does not change either model's forecast.

## Stephen Taylor projection

`parseTaylor` in `lib/poll-models.ts` reads Stephen Taylor's BC projection page (stephentaylor.ca) for each party's "Most seats in N% of simulations" and the "As of" date. There is no data feed, so a layout change makes the refresh fail and the dashboard keeps the last saved figures with a warning. Taylor updates less often than 338Canada, so check the projection date in the comparison table.
