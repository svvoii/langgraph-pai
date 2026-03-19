---
name: Utilities
description: Developer utilities and tooling workflows.
---

# Utilities

Unified skill for tooling and execution support workflows.

## Workflow Routing

| Request Pattern | Route To |
|---|---|
| create cli, command tool, wrap api | Workflows/CreateCLI.md |
| create skill, scaffold skill, validate skill | Workflows/CreateSkill.md |
| delegate, parallel execution, agent workstreams | Workflows/Delegation.md |
| eval, benchmark, compare prompts or models | Workflows/Evals.md |
| process docs, convert files, extract text | Workflows/Documents.md |
| parse content, extract entities, structured output | Workflows/Parser.md |
| browser automation, verify ui, screenshots | Workflows/Browser.md |

## Utilities Rules

- Prefer deterministic outputs and explicit constraints.
- Keep tools and commands scoped and safe.
- Return actionable outputs with concise summaries.
