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
- **Refine flow** (Meshy live only; photo uploads and the demo generator skip
  it): text prompts walk clarify → concept → approve before any 3D generation
  is spent. `POST /api/design/ai/clarify` moderates the prompt then asks
  Claude (`src/lib/design/refine.ts`, fail-open — errors just mean "no
  questions") for up to 3 multiple-choice clarifying questions on ambiguous
  prompts; answers are folded into the prompt client-side. `POST
  /api/design/ai/concept` re-moderates and creates a Meshy text-to-image task
  (nano-banana, 3 credits); the UI polls `GET /api/design/ai/concept/:id` and
  shows the image for approval. "Make it 3D" posts the enriched prompt +
  `conceptImageUrl` (restricted to `assets.meshy.ai`) to `/api/design/ai`,
  which runs image-to-3D from the approved image. Only the final 3D
  generation consumes daily quota.
- **AI model sizing**: generator units are arbitrary, so AI meshes are scaled
  to a 90 mm default figurine size (`DEFAULT_AI_SIZE_MM`) unless a target size
  is given. Clamping to the 20 mm minimum made walls thinner than the nozzle —
  unsliceable first layers and constant too-fragile badges.
- **Moderation, fail closed**: blocklist (`src/lib/design/blocklist.ts` — the
  one editable file; normalisation catches leetspeak/spacing/diacritics) then
  a Claude classifier (text or vision for image uploads). Classifier error or
  missing `ANTHROPIC_API_KEY` ⇒ block; hence the AI tab requires BOTH keys.
  Everything is logged to `DesignModerationLog`.
- **Quota / abuse**: `DESIGN_FREE_GENERATIONS_PER_DAY` (default 3) successful generations/user/day (blocked prompts never
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
| `DESIGN_FREE_GENERATIONS_PER_DAY` | daily AI quota defaults to 3 |
| `DESIGN_REPO_ROOT` | FastAPI resolves templates/fonts/icons from repo root |

## Deployment note

The FastAPI service now needs the geometry deps in `api/requirements.txt`
(manifold3d, shapely, matplotlib, scikit-image, fast-simplification, rtree,
plus qrcode + zxing-cpp for the QR stand) and benefits from a PrusaSlicer
binary on its host. The Node app needs nothing new beyond `manifold-3d`,
`@anthropic-ai/sdk`, `qrcode` and `svgpath` (all already in package.json)
and the Prisma migrations (`DesignJob`, `DesignModerationLog`,
`DesignJob.quantity`, `DesignAsset`).

The API image must also copy `public/design-icons` — `coaster_set` resolves
icons from `DESIGN_REPO_ROOT` and 422s without them.

## Adding a template

1. Spec JSON in `design/templates/<id>.json` (validated by
   `src/lib/design/schema.ts`; UI controls generate from it, so invalid
   states are unreachable).
2. Builder in `api/app/design/templates/<id_snake>.py` (register in
   `templates/__init__.py`) — mm units, Z-up, one watertight solid, fixed
   segment counts (determinism), user text as data only. Signature is
   `build(params, spec, repo_root, assets=None)`.
3. Client preview case in `src/lib/design/preview/buildPreview.ts`
   (approximate is fine — cosmetic), light-theme thumbnail in
   `public/design-thumbs/`.
4. Set `audience` to `"brands"` or `"you"` — it picks the gallery section.
   Defaults to `"you"`.
5. Bump `version` in the spec when changing existing geometry — old jobs
   keep their recorded `templateVersion`.

### Geometry gotcha: never let parts merely touch

Every multi-part template here has, at some point, produced a mesh that
looked right and wasn't. The cause is always the same: two solids meeting on
an exactly coincident plane. The boolean resolves that into zero-volume
sliver shells and non-manifold edges; `merge_vertices()` in the repair
pipeline then welds those into holes, the mesh stops being watertight, and it
falls through to the voxel remesh — which is lossy, triples the triangle
count and fragments the result.

Always overlap. Relief sinks a fraction of a mm into its face
(`RELIEF_EMBED_MM`), the QR panel sinks into its plinth (`PANEL_SINK_MM`),
and QR modules are grown ~2% so diagonally adjacent ones overlap instead of
touching at a point. Prefer merging in 2D (shapely) before extruding over
3D-unioning many small solids.

## Parameter kinds

`text`, `enum`, `number`, `icon`, `part`, and:

### `asset` — user-uploaded SVG (brand logos)

```jsonc
"logo": {
  "kind": "asset", "label": "Logo", "accept": "svg",
  "areaFraction": 0.45,   // fraction of the part's largest dimension
  "required": false, "default": ""
}
```

The parameter **value is an asset id**, never the artwork. That keeps the
canonical params hash a pure function of the design, so the geometry cache
still works, and means the client never re-uploads at order time.

Pipeline (`src/lib/design/svg/`, `src/lib/design/assets.ts`):

```
upload → sanitise → extract polygons → printability → moderate → store
POST /api/design/assets                    GET /api/design/assets/<id>
```

- **Sanitise** (`svg/sanitise.ts`) is parse-and-**rebuild**, not strip: output
  is constructed only from allowlisted elements/attributes, so a payload
  cannot survive by hiding in syntax the sanitiser failed to anticipate.
  DOCTYPE/ENTITY (XXE) and CDATA are refused outright rather than cleaned.
  Only the sanitised form is ever stored or served.
- **Extract** (`svg/geometry.ts`) runs **once, server-side**, and stores
  polygon rings. Both the browser preview and the Python worker extrude
  *those*, rather than each re-parsing the SVG with a different library —
  that is what makes preview parity actually hold. Stroke-only artwork
  (`fill="none"`) is auto-outlined and flagged.
- **Printability** (`svg/printability.ts`) rasterises the artwork at real
  print size and measures the thinnest feature via a distance transform.
  Below 1.0 mm the UI offers scale-up or thicken.
- **Moderation** reuses the fail-closed classifier with a logo-specific
  prompt: blocks hate symbols, sexual content and *major* brand marks, and
  leans hard toward allowing unfamiliar small-brand logos.

> **The worker cannot read our storage.** `fabricate-api` is stateless with no
> `DATA_DIR` and no database, so assets travel **inline** in the
> `/design/generate` request body as an `assets` map keyed by asset id.
> `resolveAssetsForWorker()` throws rather than degrading — a part rebuilt
> without its logo passes every check and is still the wrong product.

## Quantity and volume tiers

Templates opt in with a top-level block:

```jsonc
"quantity": { "min": 4, "max": 12, "default": 4, "presets": [4, 6, 12] }
```

`presets` renders fixed set sizes instead of a stepper. Omit the whole block
for single-item templates: quantity is 1 and the picker is hidden.

**Quantity is deliberately not a parameter.** N units are one byte-identical
STL, so folding it into `params` would change `paramsHash`, miss the geometry
cache and re-slice the same solid. It rides as a sibling column on
`DesignJob` and survives the `/configure` handoff via `savePendingHints`.

Tiers live in config, not constants — `QUANTITY_TIERS` in `src/lib/catalog.ts`:

```ts
export const QUANTITY_TIERS = [
  { minQty: 10, discountPct: 10, label: "10+ · −10%" },
  { minQty: 25, discountPct: 20, label: "25+ · −20%" },
] as const;
```

Highest qualifying tier wins. The break applies to the printing subtotal
only — never the service fee or delivery — and does **not** stack with a
community discount: the larger of the two applies, so the schemes can be
tuned independently without compounding toward a free print.

### Maker capacity (v1 limitation)

Routing is a bid marketplace: makers browse `/market` and choose what to bid
on. There is no capacity, throughput or assignment model anywhere in the
schema. Rather than invent one, v1 caps quantity **per template** at what one
maker can plausibly batch — 100 keyrings, 12 coasters, 10 QR stands — and
relies on makers self-selecting. Multi-maker batching is designed but not
built; see `PLAN.md`.

## QR validation

`api/app/design/qr.py`. A QR object that doesn't scan fails in front of a
customer, so scannability is a hard gate, not a nicety.

1. **Normalise** the URL — https only; bare domains are upgraded, other
   schemes rejected.
2. **Size** it: module pitch must be ≥ `MIN_MODULE_MM` (1.6 mm) at the chosen
   face, with a 4-module quiet zone. Too dense raises `QrTooDense` naming the
   smallest face that *would* work.
3. **Decode** it: `assert_decodes()` rasterises the same module matrix that
   drives the geometry and decodes it with `zxing-cpp`. Mismatch fails the
   job. Decoding the source string would be circular — this checks the data
   about to become raised boxes.

Error correction is level M (~15% damage tolerance) without the module-count
inflation of Q or H. Modules are **raised**, so they read by shadow — dark
filament is recommended, and the UI says so.

`zxing-cpp` over `pyzbar` deliberately: it ships manylinux wheels, whereas
pyzbar needs a system `libzbar` in the image.

> **Build the API image for linux/amd64.** zxing-cpp publishes wheels for
> x86_64 (and macOS arm64) but not linux/aarch64. Cloud Build and Cloud Run
> are both x86_64 so the deploy path is unaffected, but `docker build` on an
> Apple Silicon machine will try to compile from source and fail — use
> `docker buildx build --platform linux/amd64 -f api/Dockerfile .`.

## Tests

```bash
npm test        # both suites
npm run test:unit   # TypeScript, node:test + native type stripping
npm run test:api    # pytest
```

The TS runner is Node's built-in `node:test` with a small resolver hook
(`test/resolver.mjs`) that teaches it the `@/` alias and extensionless
imports — no bundler, no new dependencies. Note it strips types without
transforming, so TypeScript **parameter properties** (`constructor(readonly
x: string)`) will not run; declare fields explicitly.
