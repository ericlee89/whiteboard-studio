# Chat — Agent Guide

Whiteboard Studio is a single-instance whiteboard-video workbench supporting local use, standalone VPS and a Vercel gateway backed by the same VPS. `/` lands on `/studio`; chat remains at `/chat` and in the shared sidebar. Projects are scoped local files; rendering uses isolated original-engine child processes.

## Video production

The `whiteboard-selection` application state identifies episode and scene. Read `list-episodes` before editing; `save-episode` requires current hash for updates. Each narration uses `|` between beats, with at most six short screen points. Preserve source ledger, neutral defaults and sample attribution. Never invent sources, expose keys or publish to a social account. Render status and files are actual engine evidence, not estimated UI previews. Missing speech/network/browser dependencies are failures with guidance.

|Action|Purpose|
|---|---|
|list-episodes|Read local projects, scenes and hashes|
|save-episode|Create/update validated project; current hash protects concurrent edits|
|start-render|preview for stills and covers; build for MP4; one job per project|
|render-status|Actual progress, log and scoped download links|

All TTS environment reads in engine are operator-owned desktop CLI configuration, isolated in a child process; documented guard annotations do not permit hosted shared credentials. This is an operator-owned workbench for a trusted workspace, not an unrestricted multi-tenant service.

## Docker workbench

Docker uses a production Node build plus PostgreSQL, with the app published only on host 127.0.0.1. It remains a trusted single-tenant file workbench: Compose explicitly enables the framework's supported local-file bridge. Runtime TTS variables are operator-owned and injected with env_file; never copy .env files into images or job snapshots. Preserve project/state/database volumes and stable encryption keys. Startup recovers interrupted job locks without trusting previous-container PIDs. Read docs/docker-deployment.md before deployment changes. Report Docker build/run separately from static checks; a local production smoke or database protocol fixture is not an actual image/container/PostgreSQL 16 acceptance test.

## Dual-platform deployment

Read `docs/platform-deployment.md` for deployment changes. Vercel builds only the streaming gateway via `scripts/deploy/build-vercel.cjs`; pages, actions, identity, projects and rendering remain on the configured VPS. Do not add pass-through actions or a second business API for this transport. `vps` and `vercel-backend` modes require account sign-in and an HTTPS APP_URL; only a verified deployment gateway can establish a forwarded public origin. A gateway key never replaces user authentication or per-owner scoping. Keep database and render volumes on a single backend instance. Report local gateway tests separately from actual Vercel, VPS and Docker deployments. CLI checks must use `DO_NOT_TRACK=1 AGENT_NATIVE_TELEMETRY_DISABLED=1`, the framework-supported telemetry opt-out.

## Skills

Search with `rg --hidden --follow`; read the exact linked guide before deeper work. `.agents/skills/build-an-app/SKILL.md` — start here for vague requests to create a domain app. `.agents/skills/adding-a-feature/SKILL.md` — cross-area feature checklist. Data/integrations: `.agents/skills/actions/SKILL.md`, `.agents/skills/storing-data/SKILL.md`, `.agents/skills/security/SKILL.md`, `.agents/skills/secrets/SKILL.md`, `.agents/skills/sharing/SKILL.md`. UI: `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/client-side-routing/SKILL.md`. Agent context/workflows: `.agents/skills/context-awareness/SKILL.md`, `.agents/skills/real-time-sync/SKILL.md`, `.agents/skills/reliable-mutations/SKILL.md`, `.agents/skills/performance/SKILL.md`, `.agents/skills/delegate-to-agent/SKILL.md`. Framework: `.agents/skills/agent-native-docs/SKILL.md`, `.agents/skills/agent-native-toolkit/SKILL.md`, `.agents/skills/customizing-agent-native/SKILL.md`.

Use local docs only (no web research): `pnpm action docs-search --query "<topic>"`, `pnpm action docs-search --slug "<slug>"`, `pnpm action docs-search --list`, `pnpm action source-search --query "<pattern>"`, `pnpm action source-search --path <path>`, or `pnpm action source-search --list`. For external-agent integrations, read `pnpm action docs-search --slug "external-agents"`.

## Core rules

- UI feedback: target 100 ms, never exceed 400 ms; acknowledge before network work.
- Normal app data must flow through actions. Keep actions deterministic and focused; use agent chat/AgentSidebar for AI work and follow-ups in the same thread. Keep structured state in SQL and large files in configured storage; persist references only.
- For external integrations, inspect the workspace/provider connection catalog first; reuse its scoped resolver. Never hardcode credentials, webhook URLs, or private/customer data.
- Never fabricate. Report failures and recover; verify writes by reading the row or screen. Navigation is in `<current-screen>`; use `view-screen` for fresh visible-record details.

For custom branding, keep `server/plugins/agent-native-email-branding.ts` aligned: `app.name` appears in transactional email and optional `app.logoUrl` must be an absolute HTTPS URL.

## Application state

- `navigation` describes the view and selected ids. Chat is `chat` at `/chat` and `/chat/<threadId>`; the Get started page is `home` at `/home`; `/` opens shared sign-in/signup.
- Use `navigate` when supported and `view-screen` for a fresh read of visible details; basic navigation is already in `<current-screen>`.

## Building a domain app

Choose the primary workflow and route before editing. Add a domain route under `app/routes/` and set `app.homePath` in `server/plugins/agent-native-email-branding.ts` with `defineAppConfig`. The default Get started page lives at `/home`, and Chat stays at `/chat`; edit `app/routes/home.tsx` when replacing that page with a domain-specific home. Add a static link in `app/components/layout/Sidebar.tsx` before `ChatThreadsSection`; `Header.tsx` uses `APP_TITLE` elsewhere. Shared sidebar and AgentInspector remain.

Use `adding-a-feature` for functional parity and `frontend-design` for a user-facing screen. Keep feature guidance here; do not rewrite `README.md` or `DESIGN.md`. After all edits, run one typecheck, one doctor check, and one browser smoke of the primary workflow, including overlap rejection, cancellation freeing the slot, and authenticated landing. Skip production build and extra test suites.

Before building common workspace or agent UI, read `agent-native-toolkit`; for supported customization, read `customizing-agent-native`.

- Guarded verification: run `pnpm agent-native:doctor`; fix findings before done.
