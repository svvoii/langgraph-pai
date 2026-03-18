import type { GraphRunState } from "../types.js";

export interface RunReport {
  workId: string;
  request: string;
  mode: GraphRunState["mode"];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  iteration: number;
  stopReason: string | null;
  verificationSummary: GraphRunState["verificationSummary"];
  verificationGates: GraphRunState["verificationGates"];
  phaseDurationsMs: GraphRunState["phaseDurationsMs"];
  toolCounts: {
    total: number;
    ok: number;
    error: number;
    blocked: number;
  };
  tokenUsage: {
    estimatedInputTokens: number;
    estimatedOutputTokens: number;
    estimatedTotalTokens: number;
    modelReported: boolean;
  };
  failureCauses: string[];
}

export interface RunReportSummary {
  workId: string;
  finishedAt: string;
  mode: GraphRunState["mode"];
  outcome: "complete" | "blocked";
  iteration: number;
  failureCauses: string[];
  request: string;
}

export function buildRunReport(args: {
  request: string;
  state: GraphRunState;
  startedAtMs: number;
  finishedAtMs: number;
}): RunReport {
  const { request, state, startedAtMs, finishedAtMs } = args;

  const ok = state.toolResults.filter((result) => result.status === "ok").length;
  const error = state.toolResults.filter((result) => result.status === "error").length;
  const blocked = state.toolResults.filter((result) => result.status === "blocked").length;

  const estimatedInputTokens = estimateTokens(
    request + state.retrievedContextSnippets.join("\n") + state.criteria.map((c) => c.text).join("\n"),
  );
  const estimatedOutputTokens = estimateTokens(state.decisionLog.join("\n"));

  const failureCauses: string[] = [];

  if (blocked > 0) {
    failureCauses.push(`blocked_policy_events=${blocked}`);
  }
  if (error > 0) {
    failureCauses.push(`tool_errors=${error}`);
  }
  if (!state.verificationGates.passed) {
    failureCauses.push(...state.verificationGates.failedReasons);
  }
  if (state.stopReason && state.stopReason !== "criteria_satisfied") {
    failureCauses.push(`stop_reason=${state.stopReason}`);
  }

  return {
    workId: state.workId,
    request,
    mode: state.mode,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    iteration: state.iteration,
    stopReason: state.stopReason,
    verificationSummary: state.verificationSummary,
    verificationGates: state.verificationGates,
    phaseDurationsMs: state.phaseDurationsMs,
    toolCounts: {
      total: state.toolResults.length,
      ok,
      error,
      blocked,
    },
    tokenUsage: {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
      modelReported: false,
    },
    failureCauses,
  };
}

export function summarizeRunReport(report: RunReport): RunReportSummary {
  return {
    workId: report.workId,
    finishedAt: report.finishedAt,
    mode: report.mode,
    outcome: report.verificationGates.passed ? "complete" : "blocked",
    iteration: report.iteration,
    failureCauses: report.failureCauses,
    request: report.request,
  };
}

export function formatRecentRunSummaries(summaries: RunReportSummary[]): string {
  if (summaries.length === 0) {
    return "No run reports found";
  }

  return summaries
    .map((summary) => {
      const failure = summary.failureCauses.length > 0 ? summary.failureCauses.join("; ") : "none";
      return [
        `${summary.workId} [${summary.outcome}] mode=${summary.mode} iter=${summary.iteration}`,
        `finished_at=${summary.finishedAt}`,
        `request=${summary.request}`,
        `failure_points=${failure}`,
      ].join("\n");
    })
    .join("\n\n");
}

function estimateTokens(input: string): number {
  const normalized = input.trim();
  if (!normalized) {
    return 0;
  }

  return Math.ceil(normalized.length / 4);
}
