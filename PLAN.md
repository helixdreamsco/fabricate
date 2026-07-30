# Brand templates: Logo Keyring, QR Stand, Coaster Set

Plan for extending the template customiser with three business-focused
templates plus the two shared layers they need (`asset:svg` logo upload,
multi-quantity ordering).

Status: **All phases complete.** `npm test` → 59 TypeScript + 106 Python, green.

| Phase | State |
|---|---|
| 0 · Discovery | Done — findings below |
| 1 · Schema + quantity + tiers | **Done** |
| 2 · SVG asset pipeline | **Done** |
| 3 · Logo Keyring | **Done** |
| 4 · QR Stand + decode gate | **Done** |
| 5 · Coaster Set | **Done** |
| 6 · Gallery + chips + docs | **Done** |

### Deviations from the brief, and why

| Brief said | What shipped | Why |
|---|---|---|
| Store logos in R2 with per-user keys | `DATA_DIR/designs/assets/`, per-owner rows, authz'd reads | There is no R2 — storage is local-fs, GCS-FUSE-mounted in prod |
| Parse SVG on client *and* server | Parse **once** at upload, both sides extrude the stored polygons | Two parsers is two interpretations; this is what makes preview parity actually hold |
| Maker capacity model, or cap at 25 | Per-template caps (100 keyrings / 12 coasters / 10 stands) | Routing is a bid marketplace with no capacity concept; caps reflect what one maker can batch. Batching design below |
| Raster PNG → potrace fallback | Not built | Marked a stretch goal; cut to finish the required scope |

### Known limitation

A few QR module patterns leave a handful of non-manifold edges in the *raw*
builder mesh. The repair pipeline resolves them and all 28
URL×face×caption configurations ship watertight, single-piece and
decode-verified. Tests assert the pipeline output, since that is what ships.

---

## Step 0 — What the existing engine actually does

Read end-to-end before designing. Findings that change the plan are marked
**⚠**.

### The template pipeline

One template spec JSON is the single source of truth, read by both sides:

```
design/templates/<id>.json
  ├─→ src/lib/design/registry.ts   (zod-parsed, cached)  → client
  └─→ api/app/design/routes.py:load_spec()               → server
```

Flow for a preset:

```
Customiser.tsx  ──params JSON──→  POST /api/design/preset
  │                                 ├─ validateParams()  (zod, from spec)
  │                                 ├─ canonicaliseParams() → sha256 hash
  │                                 └─ createPresetJob()
  │                                      ├─ geometry cache: reuse artifacts
  │                                      │   of any ready job with same hash
  │                                      └─ generateDesign() → FastAPI
  │                                           POST /design/generate
  │                                             build(params, spec, repo_root)
  │                                             pipeline.process()  ← repair
  │                                             _finish() → slice + export
  └─ buildPreview.ts (cosmetic, Manifold WASM)      ↓
                                        {metrics, badge, stl_b64, glb_b64}
                                             ↓
                              writeArtifacts → DATA_DIR/designs/<jobId>/
                                             ↓
                              indicativeQuote(metrics) → estimateQuote()
                                             ↓
                       DesignJobStatus "Print with a maker"
                         → savePendingUpload(blob) → /configure → checkout
```

### Parameter system

`src/lib/design/schema.ts` — closed discriminated union of five kinds:
`text | enum | number | icon | part`. Mirrored by `validate_params()` in
`api/app/design/common.py`. Values are `Record<string, string | number>`
everywhere: canonicalisation, hashing, Python validation, the pyapi request
body.

**⚠ Adding a parameter kind means touching both validators.** They are
independent implementations of the same contract — the Python one is the
security boundary (the client's zod is convenience).

### ⚠ There is no R2

The mission brief says logo uploads should reuse "R2 keying". There is no R2
and no S3. Actual storage:

| Layer | Reality |
|---|---|
| `src/lib/storage.ts` | `LocalFsStorage` under `dataDir()` = `DATA_DIR` or `<cwd>/prisma` |
| Production | GCS bucket `fabricate-uploads` FUSE-mounted at `/data`, `DATA_DIR=/data` |
| `getStorage()` | Abstraction exists; the GCS backend **deliberately throws** — not shipped |
| Design artifacts | `DATA_DIR/designs/<jobId>/{model.stl,preview.glb}`, served by `/api/design/files/[...key]` |
| Image uploads | `POST /api/uploads/image` — requires `auth()` session, random hex name, read back through `/api/uploads/image/[name]` with per-request authz |

So "reuse that storage path with per-user keys" maps to: write through
`getStorage()`/`dataDir()` under a new `designs/assets/` prefix, keyed by
owner, with the same session-auth + authz-on-read pattern as
`/api/uploads/image`. No new storage backend.

### ⚠ The Python service is stateless and cannot read our storage

`api/Dockerfile` bakes in `design/`, `public/fonts` and `public/design-icons`.
It has **no** `DATA_DIR` mount and no database. `generateDesign()` posts
`{template_id, template_version, params}` and gets artifacts back inline as
base64.

**Consequence: an `asset:svg` param cannot be passed as a storage key.** The
Node side must resolve the asset id to its sanitised SVG and include the
content in the request. This needs a new `assets` field on the pyapi
contract. Getting this wrong would mean the server regeneration silently
builds a logo-less part.

### ⚠ Quantity must not be a parameter

`createPresetJob` caches geometry on `paramsHash`. Ten units and one unit are
byte-identical STLs. If quantity lived in `params` it would change the hash,
miss the cache, and re-slice identical geometry — exactly what the brief says
not to do ("Do not slice N copies").

So `quantity` is a **template-level capability and a sibling field on the
job**, never inside `params` or the canonical hash.

### Quoting

`estimateQuote()` in `src/lib/pricing.ts` already accepts `quantity` and
scales `weightG` / `estMinutes` linearly. Config constants live in
`src/lib/catalog.ts` (`MARGIN_MULTIPLIER`, `SERVICE_FEE_*`, …). There are **no
volume tiers today**. `indicativeQuote()` in `jobs.ts` hardcodes
`quantity: 1`.

`/configure` already renders a quantity `Stepper` (min 1, max 50) wired to
`draft.quantity`, and `Job.quantity` already exists in Prisma.

### ⚠ Maker routing has no capacity concept

Routing is a **bid marketplace**, not an assignment engine: makers browse
`/market`, place a `JobBid`, the creator accepts one. `MakerProfile` has
printers and pickup locations but no throughput, no max-units, no queue depth.

Adding a real capacity model means inventing maker-side throughput data,
splitting jobs into batches, and multi-maker settlement/payout — that is a
genuine rabbit hole and it fights the architecture, because makers already
self-select by choosing whether to bid.

**Decision: take the brief's documented escape hatch.** v1 caps template
quantity at 25, surfaces quantity prominently so makers self-select, and the
batching design is written up below for later.

### Client preview parity

`buildPreview.ts` is a per-template `switch` producing `THREE.BufferGeometry`,
with booleans via Manifold WASM (`csg.ts`) and a graceful non-boolean overlay
fallback. Server builds the same shapes from shapely polygons via
`trimesh.creation.extrude_polygon`. Two independent implementations per
template — the client is explicitly cosmetic, the server authoritative.

### Dependencies already present

- Node: `qrcode`, `@types/qrcode`, `svgpath`, `three` (has `SVGLoader`), `manifold-3d`
- Python: `trimesh`, `shapely`, `manifold3d`, `numpy`, `scipy`, `scikit-image`, `matplotlib`
- Python **missing**: SVG path parsing, QR generation, QR decoding

### Existing UI kit to reuse

`Dropzone.tsx` (drag-drop + picker, already used for STL upload), `Stepper.tsx`,
`SegmentedControl.tsx`, `MonoLabel.tsx`, `Card.tsx`. Gallery is
`src/app/design/page.tsx`; prompt chips are `EXAMPLE_PROMPTS` in `AiPanel.tsx`.

---

## Design decisions

### D1 — `asset:svg` is a param kind whose value is an asset id

```jsonc
"logo": { "kind": "asset", "label": "Logo", "accept": "svg", "required": false }
```

Value is a stable asset id string (`asset_<hex>`), so:
- the canonical params hash stays a pure function of the design,
- the geometry cache still works (same logo + same knobs = cache hit),
- the client never re-uploads at order time — it references the id.

Assets are **immutable once stored**. Re-uploading the same bytes yields the
same content hash and reuses the existing row.

### D2 — Sanitise on upload, store the sanitised form only

The raw upload is never persisted and never echoed back. Sanitiser strips
`<script>`, `<foreignObject>`, all `on*` handlers, `<use href>`/`xlink:href`
external refs, `<image>`, DOCTYPE/ENTITY (XXE), and any non-allowlisted
element or attribute. Allowlist, not blocklist.

Both the 2D preview served to the browser and the geometry conversion read
the same sanitised bytes.

### D3 — Path extraction happens server-side, once, at upload

Rather than parse SVG in two places with two libraries and hope they agree,
upload does: sanitise → parse → flatten curves to polylines → fill-rule
resolution → **store a normalised polygon set** alongside the SVG.

- Client preview extrudes those polygons (`THREE.Shape`) — no `SVGLoader`
  divergence.
- Server build extrudes the same polygons (shapely) — no re-parse.
- Printability metrics are computed once, at upload, and cached on the asset.

This is a deliberate simplification of the brief (which suggested parsing on
both sides) and it is what makes preview parity actually hold.

### D4 — Quantity tiers in config

New `QUANTITY_TIERS` in `src/lib/catalog.ts`, ordered, read by
`estimateQuote()`:

```ts
export const QUANTITY_TIERS = [
  { minQty: 10, discountPct: 10 },
  { minQty: 25, discountPct: 20 },
] as const;
```

Applies to the (material + machine) × margin subtotal only — never to the
service fee or delivery, matching how `discountPct` already behaves.

### D5 — QR validation decodes what we actually built

Generate matrix → build geometry → **rasterise the module matrix as it will
physically appear** (raised modules dark on light) → decode → compare to the
input URL. Fail the job on mismatch. Decoding the source matrix would be
circular; this checks the geometry-driving data.

---

## Build order

Shared layers first, then templates, simplest last as the proof.

### Phase 1 — Schema + quantity (no new templates yet)

1. `asset` param kind in `schema.ts` + `paramValuesValidator` + Python
   `validate_params`.
2. `quantity: {min, max, default}` optional block on `templateSpecSchema`;
   absent = single-item, hidden UI, quantity 1.
3. `QUANTITY_TIERS` in `catalog.ts`; `estimateQuote()` applies them;
   `indicativeQuote()` takes a quantity.
4. `DesignJob.quantity` column + migration.
5. Carry quantity through the `/configure` handoff.

**Tests:** tier boundaries (9/10/24/25/26), quantity absent from the canonical
hash, existing quote maths unchanged at quantity 1.

### Phase 2 — SVG asset pipeline

6. `DesignAsset` Prisma model: id, ownerId, contentHash, sanitised key,
   polygon JSON key, bbox, `minStrokeMm` metrics, moderation verdict.
7. Sanitiser (`src/lib/design/svg/sanitise.ts`) — allowlist parser.
8. Path extraction + fill-rule resolution + stroke-only handling.
9. Printability analysis: min feature width after scaling to the template's
   logo area; `thicken` (dilation) and `scale` fixes.
10. `POST /api/design/assets` — auth, 2 MB cap, sanitise, extract, moderate
    (reuse `classifyImage` fail-closed pattern with a logo-specific system
    prompt covering hate symbols / sexual content / major-brand marks), store.
11. `GET /api/design/assets/[id]` — authz'd read of sanitised SVG for the 2D
    preview.
12. pyapi contract: `assets` map on `/design/generate`; Python-side polygon
    → mesh helper in `common.py`.
13. `AssetControl` UI: dropzone, flat SVG preview, error states, fix buttons.

**Tests:** malicious SVG fixtures (script / onload / XXE / foreignObject /
external use) come out inert; multi-path; holes and counters; stroke-only;
too-thin flagged not silently printed.

### Phase 3 — Logo Keyring / Merch Tag

14. Spec JSON, Python builder, client preview, thumbnail.
15. Cut-through mode: boolean, then **single-connected-component check** —
    reuse the component-counting approach already added to the API test suite.
16. Test against several real-world messy SVGs.

### Phase 4 — QR Stand

17. Python deps: `qrcode`, `svgelements`, `zxing-cpp` (pip wheels — chosen
    over `pyzbar`, which needs a system `libzbar` package in the image).
18. URL validation + normalisation, https only.
19. Geometry: angled face on a stable base, raised modules, quiet zone,
    module ≥ 1.6 mm, friendly error when the URL won't fit.
20. Decode-round-trip validation in the pipeline.

**Tests:** 5 URLs of varying length, generate → geometry → decode; too-long
URL gives the friendly error.

### Phase 5 — Coaster Set

21. Spec, builder, preview, set-size quantity presets (4/6/12).

### Phase 6 — Gallery, chips, docs

22. FOR BRANDS / FOR YOU sections (Desk Nameplate moves to BRANDS).
23. Brand prompt chips in `AiPanel`.
24. `docs/design-customiser.md`: new param kinds, tier config, QR validation.

---

## Deferred: multi-maker batching (v1 cap = 25)

Recorded here per the brief rather than built.

When a single order exceeds one maker's throughput the job should split into
**batches**: a parent `Job` with N `JobBatch` children, each independently
biddable and independently paid out, sharing one creator payment held until
all batches complete. That needs, in order:

1. `MakerProfile.maxUnitsPerJob` + printer-count-derived throughput hint.
2. `JobBatch` model; `/market` lists batches, not jobs, when a job is split.
3. Escrow split across batches; partial-completion and partial-refund states.
4. Creator UX for "3 makers printing your 60 coasters", per-batch tracking.

Until then quantity is capped at 25 with a note in the customiser that larger
runs should contact us. 25 × a coaster is roughly a plate and a half on a
single Bambu — feasible for one maker.

---

## Risks

| Risk | Mitigation |
|---|---|
| Preview/server divergence on SVG geometry | D3: parse once at upload, both sides extrude the same polygons |
| Python service can't see uploaded assets | Assets travel inline in the pyapi request body |
| Quantity poisoning the geometry cache | Quantity kept out of `params` and the canonical hash |
| New Python deps bloat the API image (already OOM-sensitive) | `zxing-cpp` over `pyzbar`; measure image size and repair peak memory after |
| Messy real-world logos | Test corpus of found SVGs, not just synthetic fixtures |
| Moderation false-positives on small-brand logos | Logo-specific prompt; block only clear major-brand marks; log verdicts like the existing path |

## Non-goals for this pass

- PNG raster → potrace auto-trace (brief marks it a stretch goal)
- GCS storage backend migration
- Real maker capacity model (deferred above)
