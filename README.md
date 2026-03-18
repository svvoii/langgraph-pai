# 00 LangGraph Infrastructure for AI Assistant

Contains a local-first TypeScript implementation of Personal AI Assistant with LangGraph that was inspired by PAI architecture.

## Includes

- Mode router: minimal, native, algorithm
- Seven-phase execution graph: observe, think, plan, build, execute, verify, learn
- Hook bus: session and tool lifecycle events
- Filesystem persistence: work docs, state, and event log
- Skill manifests from disk with user override precedence
- CLI entrypoint for local execution

---

## Run

- Install dependencies: 
```bash
npm install
npm run check
```

- Start in dev mode: 
```bash
npm run dev -- "test request"
```

- Build: 
```bash
npm run build
```

- Start built artifact: 
```bash
npm run start -- "test request"
```

---

## Skill Commands

- Validate manifests: 
```bash
npm run dev -- skill:validate
```

- Scaffold a system skill: 
```bash
npm run dev -- skill:init MySkill "Description" "token1,token2"
```

- Scaffold a user override skill: 
```bash
npm run dev -- skill:init MySkill "Description" "token1,token2" --user
```

- Resume a saved run: 
```bash
npm run dev -- resume <workId>
```

- Synthesize learning from events: 
```bash
npm run dev -- learn:summarize <workId>
```

---

## Skill Manifest Paths

- System skills: skills/system
- User override skills: skills/user-overrides

If a user manifest sets overrideOf to an existing system skill, the user manifest takes precedence.

---

## Persistence Tiers

- Transcript source: `.data/transcripts/<workId>.jsonl`
- Mutable work and state: `.data/work/<workId>.md` and `.data/state/<workId>.json`
- Immutable learning archive: `.data/learning/<workId>.md`

---

## Notes

- This is an MVP skeleton with deterministic behavior and stubs for future LLM/tool integrations.
- Optional systems such as voice and statusline are intentionally out of critical path.

---

# 01 How the workflow and architecture fit together:

## Runtime flow

- Entry point starts in `src/main.ts`.
- Request mode is classified in `src/graph/modeRouter.ts`.
- Seven-phase execution graph is wired in `src/graph/workflow.ts`.
- Phase behavior lives in `src/graph/phases.ts`.
- Lifecycle hooks run through `src/hooks/hookBus.ts` and `src/hooks/defaultHooks.ts`.

---

## Skill system

- Schema and validation are in `src/skills/schema.ts`.
- Loading and precedence merge are in `src/skills/loader.ts`.
- Routing abstraction is in `src/skills/registry.ts`.
- Base manifests are in `skills/system`.
- User overrides are in `skills/user-overrides`.

---

## Memory tiers

- Persistence adapter is in `src/memory/fsStore.ts`.
- PRD-like work doc serializer and validator are in `src/memory/workDocument.ts`.
- Learning synthesis is in `src/memory/synthesizer.ts`.
- Runtime config and path control are in `src/runtime/config.ts`.

---

## Simple test course of action

### Step 1: Compile check

- Run: `npm run check`

### Step 2: Validate skills are loading

- Run: `npm run dev -- skill:validate`
- Expect system manifests listed.

### Step 3: Run one normal workflow

- Run: `npm run dev -- "implement a local orchestrator with verification"`
- Capture the printed Work ID.

### Step 4: Verify artifacts

- Confirm these files exist for that Work ID:
- .data/work/<workId>.md
- .data/state/<workId>.json
- .data/events/<workId>.jsonl
- .data/transcripts/<workId>.jsonl

### Step 5: Resume behavior

- Run: `npm run dev -- resume <workId>`
- Expect iteration to increase while preserving the same work id.

### Step 6: Learning synthesis

- Run: `npm run dev -- learn:summarize <workId>`
- Expect `.data/learning/<workId>.md` to be generated.

### Step 7: Override precedence test

- Create one user override manifest in `skills/user-overrides` that targets an existing system skill with `overrideOf`.
- Run `npm run dev -- skill:validate` again.
- Expect user manifest to win.

---

## Content learning order 

1. Start with `src/main.ts` and `src/runtime/config.ts` for entry and config.
2. `src/graph/workflow.ts` and `src/graph/phases.ts`
3. `src/skills/loader.ts`
4. `src/memory/fsStore.ts` and `src/memory/workDocument.ts`


---

# 02 Improvements For A Functional Assistant

## 1. LLM Integration

- Adding model adapter interfaces so the graph phases call a real model through an abstraction layer. 
- Implemented adapters (OpenAI, local LLM, etc.)
- Added structured outputs for phase artifacts (criteria list, plan steps, tool intents, verification notes)
- Added retries, timeout, and fallbacks model routing

## 2. Tool Runtime and Action Loop

- Added a controlled tool executor (shell tool with allow list, file read/write tool with path restrictions, web fetch tool..)
- Added planner-executor loop (model proposes tool actions, hook layer validates, executor runs, results returned to model for next steps)
- Enforced max tool steps per run to avoid loops

## 3. Retrieval-Augmented Memory
- Keeping current filesystem memory tiers
- Added indexed retrieval (embedded work docs, decisions, and learning summaries; retrieve top context snippets before Think and Plan phases)
- Added recency + relevance scoring so that stale memory is deprioritized

## 4. Strong Verification Layer
- Added criterion-level verification contract (each criterion has check type: file, command, test, semantic)
- Added explicit pass/fail evidence payload saved in work docs.
- Added post-execution quality gates (no failed criteria, no blocked policy events, no unresolved high-risk assumptions) 

## 5. Observability and Operations
- Added run telemetry (phase durations, tool count, token usage, failure causes)
- Added structured run report file for every execution.
- Added CLI command to inspect last N runs quickly (summary of request, outcome, failure points)

## 6. Safety and Isolation
- Expanded pre-tool policy from keyword blocking to rule packs (path scope rules, command category risk levels, confirmation-required rules)
- Added secrets scanner on outgoing tool payloads
- Added pre-skill permissions and enforcement at execution time

## 7. Testing and Evaluation Harness
- Added unit tests for (graph transitions, skill resolution and override precedence, policy blocking and allow cases)
- Added scenario evaluation suite (simple request, tool-heavy request, resume flow, policy violation attempt, learning synthesis consistency)
- Store baseline expectated outcomes and run in CI

---

# 03 Modular Skills Architecture Improvemenmts

## 1. Skills Should Be True Modules / Plugins
- Each skill is an independent and self-contained plugin with (manifest, prompt templates, optional tool adapters, optional workflow hooks. tests, docs)

## 2. Skill Contract
- Necessary fields in manifest (id, version, description, useWhen, requiredPermissions, requiredTools, dependencies, compatibilityRange, enabled, overrideOf)
- Startup validation that rejects incompatible skills early

## 3. Skill Lifecycle
- Install
- Validate
- Enable/Disable
- Uninstall
- Dry-run validate command should report (schema validity, permission missmatches, missing dependencies, conflicts with other skills)

## 4. Runtime Skill Resolution Strategy
- Skill resolution order (explicit request by user; router match by intent; default fallback skills)
- User overrides should win over system skills only when compatibile
- Deterministic tie-breaking for multiple skills matches

## 5. Skill Sandboxing
- Enfirced per-skill execution scope (allowed tools, allowed paths, network on/off, max tool calls)
- This should keep skills independent and safely removable

## Design Rules for Easy Add / Remove Skills
- No shared mutable state between skills
- All skills outputs go through core state reducers
- Skill permissions declared, never implied
- Skill dependencies explicit and versioned
- Skill uninstall leaves no orphan runtime hooks
- Every skill has a small contract test


---


