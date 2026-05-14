---
name: Fabricate legal finalisation status
description: Legal docs are filled in for HELIXDREAMSCO LTD with the real ICO registration ZC135824; remaining follow-ups are virtual office and domain email
type: project
originSessionId: a2f3133d-b865-4afc-a614-5ddf496a7795
---
Legal documents (`src/content/legal/terms.md` and `privacy.md`) are filled in with real values, DRAFT banners removed.

**Live values:**
- Entity: HELIXDREAMSCO LTD
- Companies House: 17158644
- Registered office: 26 Watermint Quay, Craven Walk, London, N16 6DD
- Contact emails (support / privacy / disputes): helixdreamsco@gmail.com (single Gmail for now)
- Hosting region: "the United Kingdom"
- ICO registration: **ZC135824** (real, swapped in 2026-05-04 from earlier `Z9999999` placeholder)

**Document versions:**
- terms.md → v1
- privacy.md → v2 (bumped 2026-05-04 with the ICO swap; existing users get re-prompted)
- `PRIVACY_VERSION` in `src/lib/legal.ts` and `REQUIRED_PRIVACY_VERSION` in `src/proxy.ts` both set to 2

**Other follow-ups before customer launch:**

- Virtual office for the registered address (Companies (Trading Disclosures) Regulations 2008 require Ltd companies to display registered office on website + emails; the address is already public on Companies House but suggest a virtual office service like Hold Everything / Mailbox London / Hoxton Mix £15-30/mo so his home address stops appearing everywhere).
- Domain email — Gmail is acceptable pre-launch but `privacy@<own-domain>` reads professional and gives a cleaner GDPR audit trail.
- Solicitor review of terms.md + privacy.md — Miles self-approved the drafts; a UK consumer-law solicitor should still review before customer-facing launch (standing risk).
