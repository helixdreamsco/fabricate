# Future features

Captured ideas worth shipping post-launch, once the marketplace has enough
volume to make them visually meaningful.

---

## Demand insights for makers

**One-line:** show makers (existing and prospective) where there's open demand they could uniquely fill.

**Why:** marketplace flywheel — makers want to know they'll have work; surfacing supply gaps converts into both better matches and stronger maker recruitment.

**Where it surfaces:**

- `/maker` dashboard — a "Most-wanted in your area" card highlighting 1–3 specific gaps the signed-in maker could close (i.e. they don't already serve them).
- `/makers` (the public landing for prospective makers) — a less specific marketing surface: "Right now there are X open jobs and only Y makers who stock material Z."

**Data sources (already in DB):**

- Demand: `Job.material`, `Job.materialAlternatives`, `Job.colorMatters` × `Job.partColors`, `Job.materialNotes`, `Job.isMultiMaterial`, derived dimensions from `Job.estimatedGrams` + the original analysis JSON.
- Supply: `Printer.materials`, `Printer.hasAMS`, count of active printers per `MakerProfile`.

**What to compute:**

- Per material category (PLA / PETG / ABS / TPU): `jobs_in_last_30d / active_makers_stocking_it`. Anything where this ratio is high = under-served.
- AMS demand: `% jobs flagged isMultiMaterial=true` vs. `% active makers with hasAMS=true`.
- Build-volume gaps: number of jobs whose dim exceeds the largest active printer in the area.
- Material-notes trends: bag-of-words over `Job.materialNotes` (case-folded, stop-worded, brand-named) — surface tokens trending up but not represented in any printer's stocked materials.

**Privacy posture:**

- Aggregate counts only.
- Minimum 3-job threshold per category before showing — prevents leaking individual job specifics back to makers.
- No surface that combines location + material to a granularity narrower than postcode outward code.

**Build effort:** ~45 min for the dashboard card + a single aggregate Prisma query. The marketing surface is another ~30 min on top.

---

## Printer-technology segmentation (resin / SLS / multi-jet)

**One-line:** Fabricate currently treats all printers as FDM. Make the marketplace work for resin / SLS / MJF / SLA makers and their differently-shaped capability lists.

**Why:** SLA/DLP resin printing is huge in the hobbyist tabletop / miniatures community (the exact target market for personal-use Fabricate); SLS is gaining traction in the more functional-prototype niche. Makers with these tools can't currently signal that capability and creators can't request it.

**Schema changes:**

- Add `Printer.technology` enum: `FDM` (current default) | `RESIN` (SLA/DLP/MSLA) | `SLS` | `MJF` | `OTHER`.
- Add tech-specific compatibility hints — resin printers can't use FDM filament categories; SLS doesn't take user-defined colour; MJF has its own material list.
- Migration: backfill existing `Printer` rows to `FDM`.

**Bid-validation impact:**

- `selectBestPrinter` needs to be tech-aware: a job tagged "resin" cannot match an FDM printer.
- Job creation needs a tech selector — at minimum FDM/Resin radio on `/configure`.
- Material list per technology: resin uses Standard/Tough/Castable/Flexible; SLS uses PA12/PA11/glass-filled; etc.

**UI changes:**

- `/maker/profile` printer rows: technology dropdown, conditional material list.
- `/configure` material section: technology pill above the ranked list, filtered material catalogue per tech.
- `/jobs/[id]` and `/maker/jobs/[id]` job-spec cards: surface technology.

**Build effort:** ~2-3 hours including schema + migration + config UI + bid validation + spec rendering.

**Recommended sequencing:** ship demand insights first (data we already have), then segment by tech once a real demand signal for resin/SLS shows up in the metrics.

---

## When to revisit

Both features become valuable once the marketplace has ≥10 active makers and ≥30 jobs/month — early aggregate stats from a near-empty marketplace would look more like noise than signal. Re-evaluate at that growth milestone.
