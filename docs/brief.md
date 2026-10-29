# 白板工作室

Source: installed whiteboard-video-factory, its SKILL.md and all nine references; BuilderIO turn-into-app. No private prior video or credentials imported.
Goal: turn a topic and narration into an editable local whiteboard video project and export original-engine MP4, captions and three covers.
Configuration: Chinese media creators, 1920×1080 at 30fps, beat-separated narration, original renderer, three TTS engines.
Knowledge: bundled engine/references contains DSL, scene patterns, voices, sources, compliance, publishing and QA guides.
Workflow: project → editable scenes → preview/render jobs → actual generated downloads; all objects remain directly accessible.
Input/output: typed titles, narration, up to six screen points per scene, provider voice/speed, branding; local scenes.js, script.json, audio, MP4, covers, SRT and publishing drafts.
Agent moments: polish selected scene; review sources; draft platform copy. Use existing AgentSidebar, shared actions, readback and hashes. No provider currently configured.
Representative run: clearly synthetic four-scene sample; not an external news claim.
Invariants: scoped local files per user, validated ids, safe JS generated exclusively from JSON-escaped values, no user code execution, overlap lock per project, optimistic concurrency on source hash, no automatic social publication.
Hazards: distinguish estimated canvas structure from actual raster preview; missing TTS/network is a failed job, never a completed render. Secret values never returned in status.
Source of truth: local-files manifest, data/episodes scoped by owner hash. Each render snapshots source and uses an isolated engine/config so edits cannot race with active export.
Assumptions: local execution because file-backed skill requires Node, Python, Chromium and ffmpeg. Edge is key-free default but requires network. API keys are supplied separately as environment variables. Original sample brand is replaced with neutral sample branding.
App design: A5 gallery and stage, studio-canvas with green source accent. Project rail, 16:9 canvas, storyboard strip and right narration inspector; tabs are peer settings/copy views, not steps. Narrow view stacks inspector. Home /studio; chat remains one shared sidebar.
Open scope: generated asset picking and drag/drop spatial editing remain with engine/agent workflow; UI supports structured text/card layouts. Full exports require working speech provider. Source facts require real review.
