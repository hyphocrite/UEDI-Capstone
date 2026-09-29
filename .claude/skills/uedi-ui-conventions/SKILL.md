---
name: uedi-ui-conventions
description: UEDI client UI rules (green palette, Tailwind v4 utilities, page layout, nav, API calls, roles). Use when adding or changing any page or component in client/.
---

# UEDI UI conventions

Stack: React 19, Vite, TypeScript, Tailwind CSS v4, react-router-dom 7, lucide-react icons.

## Palette

Defined once in `client/src/index.css` under `@theme`. Use the tokens, never raw hex, in components.

| Use | Token | Hex |
| --- | --- | --- |
| Top header, primary buttons, headings | `brand-800` | `#0B422A` |
| Page background | `surface` | `#F7F9F6` |
| Accent (links, focus, positive) | `accent` / `accent-dark` | `#10B981` / `#059669` |
| Body text | `ink` | `#0D1F17` |
| Tints and borders | `brand-50` to `brand-900` | shades of green |

Warnings use Tailwind `amber-*`. Errors and "raises risk" use `red-*`.

## Shared classes

Tailwind v4 needs custom classes declared with `@utility` (not `@layer components`),
otherwise `@apply` fails with "Cannot apply unknown utility class". Existing ones:
`card`, `btn`, `btn-primary`, `btn-accent`, `btn-ghost`, `input`, `label`, `table-head`.
Reuse them before writing new class lists.

## Page layout

- Pages live in `client/src/pages/<Name>Page.tsx`. Components shared across pages are in
  `client/src/components/`. Feature components go in a subfolder, such as
  `components/pending-loans/`.
- Start every page with `PageHeader` (`title`, `subtitle`, optional `actions`).
- Group content in `card` sections. Show status with `StatusBadge` and
  numbers with `StatCard`. Format money with `client/src/lib/format.ts`
  (Philippine peso).
- Signed-in pages render inside `layouts/AppLayout.tsx` via the `ProtectedRoute` in
  `App.tsx`. Heavy pages (like Loan Application with OCR) are `lazy()` loaded.

## Adding a page

1. Create `client/src/pages/FooPage.tsx`.
2. Add the route in `client/src/App.tsx`, inside the protected block.
3. Add a nav item in `layouts/AppLayout.tsx` (`{ to, label, icon }` using a lucide icon).
   The desktop nav shows at the `xl` breakpoint. Keep labels short so the header fits at 1280px.
4. Check the page at phone width (375px) and at 1440px.

## Data and roles

- Call the API with `api()` from `client/src/lib/api.ts`, which sends cookies and throws on errors.
- The current user comes from `useAuth()` in `context/AuthContext.tsx`. Roles are `admin`,
  `loan_officer` and `staff`. Hide or disable approve/deny for `staff`, and say why in the UI.
- Members, loans, plans and reports still read `client/src/data/mock.ts`. Real data is
  only auth and loan applications (`/api/applications`).

## Writing style in the UI

Plain language for loan staff: "Biggest factors", "Run models again", not model jargon.
Show ML percentages as risk scores, not exact odds of default.

## Before finishing

```
npm --prefix client run lint
npm --prefix client run build
```
Lint flags `set-state-in-effect`. Avoid calling setState synchronously inside `useEffect`.
