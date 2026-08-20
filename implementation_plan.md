# LexisGraph — Landing Page Implementation Plan

## Background

LexisGraph is an enterprise compliance intelligence platform built with **Next.js 16 (App Router)**, **Tailwind v4**, **shadcn/ui**, and **Geist Sans** typography. The existing design system is fully defined in `/client/src/styles/` with custom CSS variables for colors, shadows, spacing, typography, and animations.

The current `/` route redirects unauthenticated users to `/login` and authenticated users to `/dashboard`. This must change — `/` becomes the public landing page, while all authenticated routes remain untouched.

---

## User Review Required

> [!IMPORTANT]
> The landing page will be placed in the existing Next.js client at `C:\Learn With Shrimant Marathe\LexisGraph\client`. This is **outside** the `c:\Final year project` workspace root, but it is the actual application. All file writes will target that path using PowerShell commands.

> [!IMPORTANT]
> The current `src/app/page.tsx` redirects all traffic to `/login` or `/dashboard`. The new landing page **replaces** this file. Unauthenticated users will now see the landing page at `/`, and CTAs will link to `/login` and `/register`. Authenticated users visiting `/` will see the landing page (their session is preserved; they can navigate to `/dashboard` via the navbar).

> [!WARNING]
> The logo PNG (`Lexisgraph logo.png`) from the project root will be copied to `client/public/` for use on the landing page. The existing favicon will remain unchanged.

---

## Open Questions

> [!NOTE]
> No blocking questions. All design decisions are well-specified. Implementation proceeds using the existing design system tokens exactly as found in `colors.css`, `typography.css`, `shadows.css`, `spacing.css`, `animations.css`, and `utilities.css`.

---

## Proposed Changes

### A — Routing

#### [MODIFY] `src/app/page.tsx`
Replace the redirect-only root page with the full public landing page component composition. This file becomes the landing page entry point.

#### [NEW] `src/app/(landing)/layout.tsx` *(Optional wrapper)*
A dedicated layout for public routes without the authenticated sidebar. Since the root `layout.tsx` already renders `{children}` without any sidebar, the root layout is sufficient. No separate layout needed.

---

### B — Logo Asset

#### [NEW] `client/public/logo.png`
Copy the LexisGraph logo from `c:\Final year project\Lexisgraph logo.png` to `client/public/logo.png` for use in the navbar and footer.

---

### C — Landing Page Components

All components go under `src/components/landing/`. This keeps landing-page concerns isolated from authenticated-app components.

#### [NEW] `src/components/landing/LandingNavbar.tsx`
- Sticky top navigation with glass effect on scroll
- Left: LexisGraph logo (SVG text + icon) + wordmark
- Center: Product, How It Works, Capabilities, Security, About (anchor links)
- Right: Sign In (ghost), Get Started (primary button)
- Mobile: hamburger menu with full-screen drawer using existing `Sheet` component
- Uses existing `Button` component variants

#### [NEW] `src/components/landing/HeroSection.tsx`
- Full-viewport-height section
- Headline: "Turn Regulatory Complexity Into Compliance Clarity."
- Subheadline supporting copy
- Two CTAs: `[Get Started]` → `/register`, `[See How It Works]` → `#how-it-works`
- Hero visual: SVG-based compliance workflow graph (CSS-animated, no heavy library)
- Dark mode first, uses `--background` / `--surface` tokens

#### [NEW] `src/components/landing/ValueStrip.tsx`
- 5-item horizontal strip below hero
- Items: Regulations → Policies → Evidence → Findings → Remediation
- Supporting sentence copy
- Subtle top/bottom border using `--border` token

#### [NEW] `src/components/landing/ProblemSection.tsx`
- 4 problem cards in 2×2 grid (desktop), stacked (mobile)
- Scattered Information / Limited Traceability / Manual Gap Identification / Fragmented Follow-Through
- Uses `feature-card` utility class from `utilities.css`

#### [NEW] `src/components/landing/SolutionFlow.tsx`
- Vertical connected flow visualization
- 8 stages: Regulations → Requirements → Policies → Evidence → Analysis → Findings → Remediation → Resolution
- CSS-drawn connector lines between nodes
- Each node has icon, label, brief description
- Hover/focus highlights individual stage

#### [NEW] `src/components/landing/HowItWorks.tsx`
- 4-step numbered section (01–04)
- Connect / Analyze / Identify / Resolve
- Horizontal layout desktop, vertical mobile
- Step numbers use `--primary` color token

#### [NEW] `src/components/landing/CapabilitiesSection.tsx`
- 6-capability grid (3×2 desktop, 2×3 tablet, 1 column mobile)
- Compliance Analysis / Evidence-Based Findings / Knowledge Graph / Review Workflow / Remediation / AI-Assisted Analysis
- Each uses `feature-card` pattern with lucide-react icon

#### [NEW] `src/components/landing/KnowledgeGraphShowcase.tsx`
- Signature section with a polished SVG knowledge graph visualization
- Animated node-and-edge diagram showing: Regulation → Requirement → Policy → Evidence → Finding → Remediation
- Pure CSS/SVG animation — no external graph library
- Lazy-loaded via `React.lazy` + `Suspense` for performance

#### [NEW] `src/components/landing/FindingLifecycle.tsx`
- 4-stage lifecycle: Identified → Review → Remediation → Resolution
- Visual progress track (horizontal desktop, vertical mobile)
- Uses `--warning`, `--primary`, `--accent`, `--success` semantic color tokens

#### [NEW] `src/components/landing/RolesSection.tsx`
- 4 role cards: Administrator / Compliance Analyst / Reviewer / Viewer
- Clean card grid, brief descriptions matching actual app permissions

#### [NEW] `src/components/landing/SecuritySection.tsx`
- Professional section on data control
- Covers: Organization isolation, Role-based access, Controlled document access, Auditability, Traceable findings
- **No fabricated certifications**
- Icon grid layout

#### [NEW] `src/components/landing/UseCasesSection.tsx`
- 4 use case cards: Legal Teams / Compliance Teams / Legal Firms / Startups
- Brief, honest copy

#### [NEW] `src/components/landing/DifferentiationSection.tsx`
- "More than a document repository." heading
- Two-column comparison: Traditional approach vs. LexisGraph
- No competitor names

#### [NEW] `src/components/landing/ProductPreview.tsx`
- 3 illustrative product preview cards
- Compliance Analysis coverage card (72 Covered, 18 Partial, 7 Gaps — labelled "Illustrative")
- Finding card (F-104, High Severity, In Remediation)
- Graph card (Regulation → Requirement → Policy → Finding)
- Clearly marked as demo data

#### [NEW] `src/components/landing/FinalCTA.tsx`
- Strong closing section with gradient background
- Heading: "Build a clearer path from regulation to resolution."
- Two buttons: Get Started → `/register`, Sign In → `/login`

#### [NEW] `src/components/landing/LandingFooter.tsx`
- Four link columns: Product / Company / Resources / Legal
- LexisGraph wordmark + tagline
- No fake social links

#### [NEW] `src/components/landing/landing-content.ts`
- Static content configuration file
- All copy, nav links, capabilities, use cases, roles, security items in one place
- Makes future copy updates easy

---

### D — Styles

#### [NEW] `src/styles/landing.css`
Landing-page-specific utility classes that **extend** (not duplicate) the existing design system:
- `.landing-section` — section padding/spacing
- `.landing-container` — max-width container
- `.section-label` — overline text style (extends `.text-label`)
- `.flow-connector` — CSS-drawn vertical/horizontal connectors
- `.graph-node` — knowledge graph node style
- Scroll-reveal animation utilities (CSS only, respects `prefers-reduced-motion`)

Import added to `src/app/globals.css` (after existing imports).

---

### E — SEO & Metadata

#### [MODIFY] `src/app/page.tsx` or `src/app/layout.tsx`
Add page-specific metadata export:
```ts
export const metadata: Metadata = {
  title: "LexisGraph — Compliance Intelligence for Modern Organizations",
  description: "LexisGraph connects regulations, policies, evidence, findings, and remediation to help organizations understand and manage compliance.",
  openGraph: { ... },
  twitter: { ... },
};
```

---

### F — Root Page Routing Change

#### [MODIFY] `src/app/page.tsx`
Current behavior: redirect to `/login` or `/dashboard`.
New behavior: render the public landing page. Authenticated users visiting `/` will see the landing page (no session destruction). They can navigate to `/dashboard` via their existing bookmarks or the app navbar after login.

> [!NOTE]
> The `page.tsx` currently uses `"use client"` with `useAuth`. The new landing page is a **Server Component** — no auth check at the root. The `/dashboard`, `/compliance`, and other routes remain protected by their own `ProtectedRoute` wrappers.

---

## Verification Plan

### Automated Tests
- `npm run lint` — ESLint passes with no errors
- `npm run build` — Next.js build succeeds with no TypeScript errors

### Manual Verification
1. Visit `http://localhost:3000` — landing page renders correctly
2. Test all CTA buttons link to `/register` and `/login`
3. Test anchor navigation (Product, How It Works, Capabilities, etc.)
4. Test hamburger menu on mobile viewport
5. Visit `/login` — existing login page works
6. Visit `/register` — existing register page works
7. Log in → verify redirect to `/dashboard`
8. While logged in, visit `/` — landing page shows (session intact)
9. Test all authenticated routes: `/dashboard`, `/compliance`, `/findings`, `/knowledge-graph`, `/reports`, `/notifications`
10. Test dark mode toggle
11. Test responsive layouts at 375px, 768px, 1024px, 1440px
12. Test keyboard navigation through landing page
13. Test with `prefers-reduced-motion` media query enabled
14. Check browser console — no errors
15. Lighthouse audit: Performance ≥ 85, Accessibility ≥ 90

---

## Performance Considerations
- `KnowledgeGraphShowcase` dynamically imported with `React.lazy` + `Suspense`
- Logo served from `public/` (Next.js static optimization)
- All animations CSS-only (no JS animation libraries added)
- No new npm packages required (uses existing: lucide-react, next, tailwindcss)
- SVG graph visualization is inline — zero image weight

## Dependencies Added
**None.** All implementation uses existing dependencies:
- `next` 16 (App Router, Image, Link)
- `lucide-react` (icons)
- `tailwindcss` v4
- Existing design system CSS variables

## Files Created
| File | Type |
|------|------|
| `src/app/page.tsx` | Modified |
| `src/components/landing/LandingNavbar.tsx` | New |
| `src/components/landing/HeroSection.tsx` | New |
| `src/components/landing/ValueStrip.tsx` | New |
| `src/components/landing/ProblemSection.tsx` | New |
| `src/components/landing/SolutionFlow.tsx` | New |
| `src/components/landing/HowItWorks.tsx` | New |
| `src/components/landing/CapabilitiesSection.tsx` | New |
| `src/components/landing/KnowledgeGraphShowcase.tsx` | New |
| `src/components/landing/FindingLifecycle.tsx` | New |
| `src/components/landing/RolesSection.tsx` | New |
| `src/components/landing/SecuritySection.tsx` | New |
| `src/components/landing/UseCasesSection.tsx` | New |
| `src/components/landing/DifferentiationSection.tsx` | New |
| `src/components/landing/ProductPreview.tsx` | New |
| `src/components/landing/FinalCTA.tsx` | New |
| `src/components/landing/LandingFooter.tsx` | New |
| `src/components/landing/landing-content.ts` | New |
| `src/styles/landing.css` | New |
| `client/public/logo.png` | Copied from project root |
