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

## Skill Manifest Paths

- System skills: skills/system
- User override skills: skills/user-overrides

If a user manifest sets overrideOf to an existing system skill, the user manifest takes precedence.

---

## Persistence Tiers

- Transcript source: `.data/transcripts/<workId>.jsonl`
- Event log source: `.data/events/<workId>.jsonl`
- Mutable work and state: `.data/work/<workId>.md` and `.data/state/<workId>.json`
- Immutable learning archive: `.data/learning/<workId>.md`
- Structured run report: `.data/reports/<workId>.json`

---

## Notes

- This includes implemented LLM integration, V1 skills loading, policy enforcement, retrieval context, verification gates, and run telemetry.
- Work ID format is `work-DDMMYYYY-XXXXXXXX` where `XXXXXXXX` is a random 8-character suffix.
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

- V1 schema is in `src/skills/manifest.v1.schema.ts`.
- V1 loading and override precedence are in `src/skills/manifest.v1.loader.ts`.
- V1 policy validation is in `src/skills/manifest.v1.validator.ts`.
- Base manifests are in `skills/system`.
- User overrides are in `skills/user-overrides`.

---

## Memory tiers

- Persistence adapter is in `src/memory/fsStore.ts`.
- PRD-like work doc serializer and validator are in `src/memory/workDocument.ts`.
- Learning synthesis is in `src/memory/synthesizer.ts`.
- Retrieval memory ranker is in `src/memory/retriever.ts`.
- Runtime config and path control are in `src/runtime/config.ts`.

---

## Content learning order 

1. Start with `src/main.ts` and `src/runtime/config.ts` for entry and config.
2. `src/graph/workflow.ts` and `src/graph/phases.ts`
3. `src/skills/manifest.v1.loader.ts`, `src/skills/manifest.v1.schema.ts`, and `src/skills/manifest.v1.validator.ts`
4. `src/memory/fsStore.ts` and `src/memory/workDocument.ts`


---

## Test and Validation Commands

## 1. Baseline health

- Install and compile check:
```bash
npm install
npm run check
```

## 2. Normal run and artifacts

- Start / execute run in dev mode: 
```bash
npm run dev -- "manual validation normal run"
```

- Validate skill manifests: 
```bash
npm run dev -- skill:validate
```
- Expected: (Lists `code-refactor`, `research`, `thinking`, `utilities`)

- Scaffold a system skill: 
```bash
npm run dev -- skill:init MySkill "Description" "token1,token2"
```

- Scaffold a user override skill: 
```bash
npm run dev -- skill:init MySkill "Description" "token1,token2" --user
```

## 3. Resume and learning synthesis

- Resume saved run: 
```bash
npm run dev -- resume <workId>
```
- Expected: (same work id is used; iteration increases or remains bounded by max iteration logic)

- Synthesize learning from events: 
```bash
npm run dev -- learn:summarize <workId>
ls -1 .data/learning/<workId>.md
```

## 4. Safety and policy checks

- Negative safety test:
```bash
npm run dev -- "build and run git reset --hard on repo"
```
- Expected: Request is blocked with policy violation

- Optional path permission probe:
```bash
npm run dev -- "write /etc/passwd"
```
- Expected: Blocked by filesystem path policy unless a matching allowed path exists


## 5. Retrieval and verification gates

- Run retrieval follow-up to confirm prior runs are used as context:
```bash
npm run dev -- "phase-g retrieval memory test followup"
```
- Expected: Work doc includes `# Retrieved Context` with prior run snippets

- Inspect latest work doc:
```bash
tail -n +1 .data/work/<workId>.md
```
- Expected: (Criterion evidence includes check type, summary, details, timestamp; Verification section includes gate statuses and failure reasons)


## 6. Observability and operations

- Inspect latest run reports: 
```bash
npm run dev -- runs:recent <N>
```

- Inspect structured report:
```bash
cat .data/reports/<workId>.json
```
Expected report fields: (`durationMs`, `phaseDurationsMs`, `toolCounts`, `tokenUsage`, `failureCauses`)


## 7. Build and run compiled artifact

```bash
npm run build
npm run start -- "manual built artifact run"
```
- Expected: Built app runs successfully and emits work id plus report summary


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

Current state:
- Manual validation commands are in place and verified.
- Automated unit and scenario test harness is the next implementation step.

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


# 05 Next Steps

## 1. Automated test harness (highest priority)
- Add Vitest.
- Add unit tests for policy, loader, checker, and phase transitions.
- Add scenario tests for normal flow, tool-heavy flow, resume flow, and policy violation.

## 2. Tool intent quality improvements
- Improve intent generation from plan output instead of static skill-required tool expansion.
- Add richer tool inputs and deterministic tie-breaking for overlapping skill matches.

## 3. Verification depth
- Add dedicated command/test criterion adapters with stricter evidence schemas.
- Add per-criterion retries and clearer failure diagnosis.

## 4. Retrieval quality
- Replace lexical scoring with embedding-based similarity.
- Add snippet deduplication, token budget controls, and provenance links.

## 5. Security hardening
- Add outgoing payload secret scanning.
- Add confirmation-required policies for dangerous but permitted operations.

## 6. Operations and CI
- Add CI pipeline for check, build, and tests.
- Add report regression checks for failure causes and latency thresholds.

---
