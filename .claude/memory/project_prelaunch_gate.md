---
name: Fabricate pre-launch gate (lifted 2026-05-05)
description: Historic note — Miles explicitly lifted the legal-review gate and removed the PreLaunchBanner on 2026-05-05; do not block on this any more
type: project
originSessionId: a2f3133d-b865-4afc-a614-5ddf496a7795
---
The previous "must not release until full legal review" gate has been
**explicitly lifted by Miles on 2026-05-05**, in commit `26eb5eb`. The
`PreLaunchBanner` was removed from `src/app/layout.tsx`. Solicitor review,
insurance, virtual office, separate domain, and the live payout-arrival
test were all explicitly waived in the same instruction.

**Why:** Miles overrode the gate at the end of an extended launch session,
trading legal risk for time-to-market. He's aware of the standing risk and
chose to ship.

**How to apply:**
- Don't reintroduce the PreLaunchBanner without a fresh explicit ask.
- Don't repeatedly remind Miles about the legal/insurance gaps — he's been
  reminded throughout the 2026-05-05 session and made an informed call.
- The component file `src/components/shell/PreLaunchBanner.tsx` still
  exists (unused) in case it ever needs to be re-added quickly.
- If Miles asks to re-add the gate (e.g. after a regulator nudge), bring
  back the import + render in `src/app/layout.tsx`.
