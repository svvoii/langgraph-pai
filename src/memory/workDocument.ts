import { z } from "zod";
import type { GraphRunState } from "../types.js";

const WorkFrontmatterSchema = z.object({
  work_id: z.string().min(1),
  status: z.enum(["IN_PROGRESS", "COMPLETE", "BLOCKED"]),
  mode: z.enum(["minimal", "native", "algorithm"]),
  phase: z.string().min(1),
  iteration: z.number().int().nonnegative(),
  max_iterations: z.number().int().positive(),
  stop_reason: z.string().min(1),
  verification_summary: z.string().min(1),
  updated_at: z.string().min(1),
});

export type WorkFrontmatter = z.infer<typeof WorkFrontmatterSchema>;

function stateToFrontmatter(state: GraphRunState): WorkFrontmatter {
  const status = state.stopReason === "criteria_satisfied" ? "COMPLETE" : "IN_PROGRESS";

  return {
    work_id: state.workId,
    status,
    mode: state.mode,
    phase: state.currentPhase ?? "none",
    iteration: state.iteration,
    max_iterations: state.maxIterations,
    stop_reason: state.stopReason ?? "none",
    verification_summary: `${state.verificationSummary.passed}/${state.criteria.length}`,
    updated_at: new Date().toISOString(),
  };
}

function serializeFrontmatter(frontmatter: WorkFrontmatter): string {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return ["---", ...lines, "---"].join("\n");
}

export function serializeWorkDocument(state: GraphRunState): string {
  const frontmatter = stateToFrontmatter(state);
  const header = serializeFrontmatter(frontmatter);

  const changelog = state.eventLog.length > 0 ? state.eventLog : ["No changes recorded"];

  return [
    header,
    "",
    "# Request",
    state.request,
    "",
    "# Ideal State Criteria",
    ...state.criteria.map((c) => {
      const check = c.status === "pass" ? "x" : " ";
      const evidence = c.evidence ? ` (evidence: ${c.evidence})` : "";
      return `- [${check}] ${c.id}: ${c.text}${evidence}`;
    }),
    "",
    "# Decisions",
    ...state.decisionLog.map((entry) => `- ${entry}`),
    "",
    "# Changelog",
    ...changelog.map((entry) => `- ${entry}`),
    "",
    "# Verification",
    `- Passed: ${state.verificationSummary.passed}`,
    `- Failed: ${state.verificationSummary.failed}`,
    `- Pending: ${state.verificationSummary.pending}`,
  ].join("\n");
}

export function validateWorkDocument(markdown: string): WorkFrontmatter {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    throw new Error("Work document frontmatter missing");
  }

  const raw = match[1].split("\n");
  const parsed: Record<string, string | number> = {};

  for (const line of raw) {
    const parts = line.split(":");

    if (parts.length < 2) {
      continue;
    }

    const key = parts[0].trim();
    const value = parts.slice(1).join(":").trim();

    if (key === "iteration" || key === "max_iterations") {
      parsed[key] = Number(value);
      continue;
    }

    parsed[key] = value;
  }

  return WorkFrontmatterSchema.parse(parsed);
}
