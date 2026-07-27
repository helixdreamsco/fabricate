# Design customiser (`/design`)

Users create their own 3D models two ways — parametric **templates** with a
live 3D preview, and **AI text/image-to-creation** (Meshy) — both ending in a
repaired, validated, slice-checked STL that hands off to the normal
upload → `/configure` → quote flow. A valid design can never produce an
unprintable part: anything that reaches "Continue to quote" has passed the
repair + validation + PrusaSlicer check.

Ported from the standalone build at `xavierjohncharles/fabricate-customiser`
(see its PLAN.md for history); geometry code is byte-identical and produces
the same deterministic STLs.

## Architecture

```
/design                 gallery (6 templates) + AI tab
/design/[templateId]    customiser: live preview (client, cosmetic) +
                        "Get instant quote" (server, authoritative)

Next.js (this app)                       FastAPI (api/, port 8000)
  src/lib/design/registry|schema|params    app/design/  (vendored worker)
  src/lib/design/moderation|classifier       templates/ 6 builders
  src/lib/design/meshy|provider              pipeline.py repair/validate
  src/lib/design/jobs.ts  ← state owner      slicer.py + pla_0.2.ini
  Prisma: DesignJob, DesignModerationLog   POST /design/generate
  artifacts: DATA_DIR/designs/<jobId>/     POST /design/repair
                                           (stateless; artifacts base64 out)
```

- **Client preview is cosmetic** (three + Manifold WASM, lazy-loaded; reuses
  the `/configure` Viewer component). The server rebuild from the parameter
  JSON is authoritative — the client never uploads a mesh. Canonical params
  are persisted on the job (`paramsJson`) so any design is reproducible;
  identical params reuse cached artifacts and skip regeneration.
- **No Meshy key? Demo generator.** When `MESHY_API_KEY` is absent the
  provider falls back to a built-in demo generator (`local-demo` on the job,
  labelled in the UI): deterministic prompt-seeded placeholder models from
  `GET /design/mock-model` on the FastAPI service, run through the full
  moderation → repair → slice → quote pipeline with simulated progress.
  Costs nothing, exercises everything; swaps itself out the moment a Meshy
  key is configured.
- **AI flow**: job `moderating → blocked | generating(progress %) →
  downloading → processing → ready | failed`. Meshy is polled **server-side
  every 5 s** (its webhooks have no signature mechanism → treated as
  unverifiable; poll-on-read revives loops after restarts). The preview-stage
  mesh is used directly — Meshy's paid `refine` stage adds texture only,
  pointless for one-colour FDM (`MESHY_ENABLE_REFINE=1` re-enables it via
  `POST /api/design/jobs/:id/refine`). Credits per job are recorded on
  `DesignJob.credits`.
- **Moderation, fail closed**: blocklist (`src/lib/design/blocklist.ts` — the
  one editable file; normalisation catches leetspeak/spacing/diacritics) then
  a Claude classifier (text or vision for image uploads). Classifier error or
  missing `ANTHROPIC_API_KEY` ⇒ block; hence the AI tab requires BOTH keys.
  Everything is logged to `DesignModerationLog`.
- **Quota / abuse**: 3 successful generations/user/day (blocked prompts never
  count, provider failures drop out of the count), 24 h dedupe by
  user+prompt+seed (Meshy is never called for a duplicate), 10 req/min rate
  limit via `src/lib/rate-limit.ts`. AI requires sign-in; presets work for
  guests (signed `fab_design_id` cookie), matching the landing-page upload
  behaviour.
- **Handoff**: "Continue to quote" fetches the finished STL, stashes it with
  `savePendingUpload()` (exactly like the homepage dropzone) and routes to
  `/configure` — the existing quote/checkout/job flow is untouched. The
  price shown on the design page is *indicative*, computed with the same
  `estimateQuote()` from real slicer filament mass.

## Running locally

```sh
# FastAPI service (needs Python deps: pip install -r api/requirements.txt)
cd api && python3 -m uvicorn app.main:app --port 8000
# Web
npm run dev
```

PrusaSlicer is discovered via `api/app/slicer.py` (`find_slicer()`); without
it the pipeline falls back to an analytic estimate (`metrics.sliced=false`,
quote marked estimated). Python service tests: `cd api && python3 -m pytest
tests -q` (covers generation determinism, repair of a committed broken GLB
fixture, and endpoint error mapping).

## Env vars

| Var | Effect when absent |
|---|---|
| `MESHY_API_KEY` | built-in demo generator serves the AI tab (labelled; placeholder shapes) |
| `ANTHROPIC_API_KEY` | AI tab shows "coming soon" — moderation fails closed, AI disabled |
| `MESHY_ENABLE_REFINE` | refine endpoint returns 409 (default; texture-only stage) |
| `DESIGN_REPO_ROOT` | FastAPI resolves templates/fonts/icons from repo root |

## Deployment note

The FastAPI service now needs the geometry deps in `api/requirements.txt`
(manifold3d, shapely, matplotlib, scikit-image, fast-simplification, rtree)
and benefits from a PrusaSlicer binary on its host. The Node app needs
nothing new beyond `manifold-3d` + `@anthropic-ai/sdk` (already in
package.json) and the Prisma schema push (`DesignJob`,
`DesignModerationLog`).

## Adding a template

1. Spec JSON in `design/templates/<id>.json` (validated by
   `src/lib/design/schema.ts`; UI controls generate from it, so invalid
   states are unreachable).
2. Builder in `api/app/design/templates/<id_snake>.py` (register in
   `templates/__init__.py`) — mm units, Z-up, one watertight solid, fixed
   segment counts (determinism), user text as data only.
3. Client preview case in `src/lib/design/preview/buildPreview.ts`
   (approximate is fine — cosmetic), light-theme thumbnail in
   `public/design-thumbs/`.
4. Bump `version` in the spec when changing existing geometry — old jobs
   keep their recorded `templateVersion`.
