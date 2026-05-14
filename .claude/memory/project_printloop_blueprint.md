---
name: Fabricate blueprint
description: Core project vision, stack, and non-negotiable constraints for the Fabricate 3D printing marketplace (internal codename formerly "London PrintLoop")
type: project
originSessionId: 2bee140b-774d-4b5e-95aa-a22d934e02ef
---
**Project:** "Fabricate" (renamed from "London PrintLoop" on 2026-04-24) — a 2-tap (Upload → Pay) 3D printing marketplace for London startups and prototype teams. Differentiator vs competitors: no manual maker accept step. A local "Bridge Client" auto-feeds G-code to hobbyist/prosumer printers (Bambu, Prusa, Creality) over USB.

**Stakeholders:** Creators (buyers, want instant quotes), Makers (printer owners, want passive income with zero admin), Admin (fleet/escrow/network health).

**Stack (as specified by user):**
- Backend & Bridge Client: Python (FastAPI for API, PySerial for printer USB, Trimesh for mesh analysis)
- Frontend: React / Next.js with Three.js / React Three Fiber for STL preview
- Slicing: CuraEngine CLI or PrusaSlicer CLI (headless, server-side)
- Payments: Stripe Connect with escrow-on-pickup
- Notifications: Firebase Cloud Messaging
- Fleet monitoring: WebSocket dashboard

**Non-negotiable constraints:**
- Server-side G-code generation is mandatory (safety — prevents hardware damage from untrusted client-side slicing).
- Hardware-as-a-State model: every printer is exactly one of {Offline, Ready, Printing, Bed Occupied}.
- Pricing formula: (Material Weight × Margin) + (Energy/Time Cost) + London Delivery/Service Fee.

**Current scope decision:** Starting with web only — Bridge Client, mobile Maker app, and FCM are deferred.

**Why:** User explicitly scoped down to "web only" at kickoff to avoid boiling the ocean.

**How to apply:** Don't scaffold PySerial / Bridge Client / mobile code yet. Creator-facing flow and admin tooling are in scope; anything that requires a physical printer hookup is not. Re-check with user before expanding scope.

**Design reference:** User directed PrintLoop to inherit visual language from `~/Desktop/co-lab` — Swiss-minimalist / Linear-Vercel aesthetic: Inter + Space Mono, pure black/white palette (#0a0a0a foreground, #ffffff background, black/8–black/15 borders), dotted grid background, pill buttons with uppercase mono labels, bottom-border inputs, no shadows except on modals, `active:scale-95` press micro-interactions, CSS-only transitions.

**How to apply:** When adding new pages/components, steal co-lab's patterns: monospace labels everywhere for UI chrome, `rounded-full` pill buttons, `rounded-xl`/`rounded-2xl` cards, thin borders in rgba(0,0,0,0.08). Do NOT copy co-lab's domain concepts (milestones, generations, entity trees) — only the visual system.
