# insidethe.ai — Claude Instructions

Read **AGENTS.md** before doing any work in this repository. It contains the full project context, tech stack, architecture decisions, design system rules, and coding conventions.

## Quick Reference

- Package manager: `pnpm` — never npm or yarn
- Model: `gpt2` (HuggingFace) — 12 layers, 12 heads, 117M params
- Design source of truth: `mocks/insidethe-ai-style-system.html`
- Finalized landing page: `mocks/landing-mock-01.html`
- All pages share the same nav + gravitational lensing grid background
- The only active section is **Inside the Processing** (`/processing`)
- Streaming via WebSocket — see protocol in AGENTS.md

## Database / Data

No database currently. Soft-delete any persistent state if introduced later.

## Git

Branch names must follow the pattern `type/description` — e.g. `feat/processing-page`, `fix/canvas-dpr`, `chore/update-deps`. Never create bare branches like `processing` or `init`.

## Mocks

Before building any new page or major component, check `mocks/` for a reference design. If none exists, build a mock first and get approval before implementing.
