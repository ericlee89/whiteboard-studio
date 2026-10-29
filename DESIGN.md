# Visual Design Contract

Chat is a quiet, full-canvas conversation workbench. AgentKit owns the
conversation primitives; the template owns the surrounding navigation and
workspace chrome.

## Product mode

- Mode: `operate`
- Audience and cadence: frequent users managing many ongoing agent threads.
- Primary workflow: begin, resume, pin, and organize conversations without
  leaving the chat canvas.

## Chat route direction

- Direction name: Quiet conversation library
- Palette family: neutral ink and semantic surfaces; active rows use the
  existing sidebar accent rather than a separate branded color.
- Type treatment: dense sans-serif labels with regular-weight conversation
  titles and restrained section labels.
- Composition: a persistent conversation library beside a generous chat
  canvas. New chat is the primary rail action, followed by Pinned and Recents.
  Account, workspace, settings, and sign-out controls disclose from one footer
  row instead of competing in the rail.
- Shape language: borderless lists, soft selected rows, quiet corners, and
  compact icon controls.
- Anti-references: icon-only navigation as the default state, floating chips,
  duplicated settings links, timestamps competing with thread titles, and
  placeholder destinations that the app does not implement.

## Guardrails

- Use studio-canvas semantic tokens for the studio surface and preserve shared component seams.
- Keep domain pages distinct from full-page chat and use the AgentSidebar for
  contextual AI.

## Studio surface

- Archetype: A5 Gallery and stage; Chinese whiteboard-video production.
- Direction: studio-canvas with source green primary, pale sage workspace and paper canvas.
- Composition: project rail, selected whiteboard stage, scene strip, narration inspector; mobile inspector stacks under the stage.
- Agent moments: generate a new project's scene set, polish one scene, review sources, draft publishing copy. All use the shared AgentSidebar and structured save action.
- Sample data: one explicitly synthetic four-scene example; no invented completed exports.
- Signature: beat-separated narration linked to storyboards and actual original-engine preview PNGs.
- Refuses: generic landing page or setup wizard; shows the editable production object immediately.
- Local-only: isolated jobs run original Chromium/ffmpeg engine. Server environment credentials belong to the local operator, never browser/source snapshots.
- Compare sibling apps before reusing their palette or composition.
- Keep pinning, rename, archive, and routing wired to the shared chat thread
  model; the sidebar is a presentation layer, not a second history store.
