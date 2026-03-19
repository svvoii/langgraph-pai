import type { GraphRunState } from "../types.js";
import type { LlmAdapter } from "../llm.js";
import type { MemoryRetriever } from "../memory/retriever.js";
import type { ToolExecutor } from "../runtime/executor.js";
import { evaluateCriterion } from "../verification/checker.js";

function markDecision(state: GraphRunState, decision: string): GraphRunState {
  return {
    ...state,
    decisionLog: [...state.decisionLog, decision],
    eventLog: [...state.eventLog, decision],
  };
}

export function observeNode(state: GraphRunState): GraphRunState {
  if (state.criteria.length > 0) {
    return markDecision(
      {
        ...state,
        currentPhase: "observe",
      },
      "Resumed work and retained existing ideal state criteria",
    );
  }

  const criteria = [
    {
      id: "ISC-1",
      text: "Graph compiles and runs",
      checkType: "command" as const,
      target: "npm run check",
      status: "pending" as const,
    },
    {
      id: "ISC-2",
      text: "Hook lifecycle emits events",
      checkType: "semantic" as const,
      target: "hook-event-signal",
      status: "pending" as const,
    },
    {
      id: "ISC-3",
      text: "State persisted to disk",
      checkType: "file" as const,
      target: ".data",
      status: "pending" as const,
    },
  ];

  return markDecision(
    {
      ...state,
      currentPhase: "observe",
      criteria,
    },
    "Observed request and initialized ideal state criteria",
  );
}

export async function thinkNode(
  state: GraphRunState,
  llmAdapter?: LlmAdapter,
  memoryRetriever?: MemoryRetriever,
): Promise<GraphRunState> {
  const fallbackDecision = "Assessed risks and clarified assumptions";
  const contextSnippets = await retrieveContextSnippets(state, memoryRetriever);
  const llmDecision = await safeLlmDecision(
    state,
    "think",
    llmAdapter,
    contextSnippets,
    state.selectedSkillContexts,
    fallbackDecision,
  );

  return markDecision(
    {
      ...state,
      currentPhase: "think",
      retrievedContextSnippets: contextSnippets,
    },
    llmDecision,
  );
}

export async function planNode(
  state: GraphRunState,
  llmAdapter?: LlmAdapter,
  memoryRetriever?: MemoryRetriever,
): Promise<GraphRunState> {
  const fallbackDecision = "Created phased implementation strategy";
  const contextSnippets = await retrieveContextSnippets(state, memoryRetriever);
  const llmDecision = await safeLlmDecision(
    state,
    "plan",
    llmAdapter,
    contextSnippets,
    state.selectedSkillContexts,
    fallbackDecision,
  );

  return markDecision(
    {
      ...state,
      currentPhase: "plan",
      retrievedContextSnippets: contextSnippets,
    },
    llmDecision,
  );
}

export function buildNode(state: GraphRunState): GraphRunState {
  const targetPath = extractPathFromRequest(state.request);
  const targetUrl = extractUrlFromRequest(state.request);

  const hintBySkillId = new Map(
    state.selectedSkillContexts.map((context) => [context.skillId, context.intentHints]),
  );

  const intents = state.activeSkillPolicies.flatMap((policy) => {
    const hints = hintBySkillId.get(policy.skillId);
    const orderedTools = orderToolsForPolicy(policy.requiredTools, hints?.preferredToolOrder);
    const filteredTools = orderedTools.filter((toolName) => {
      if (toolName === "web.fetch" && (!hints?.requiresUrl || !targetUrl)) {
        return false;
      }
      if ((toolName === "file.read" || toolName === "file.write") && (!hints?.requiresFilePath || !targetPath)) {
        return false;
      }
      return true;
    });

    const toolsToUse =
      filteredTools.length > 0
        ? filteredTools
        : ["reasoning"];

    return toolsToUse.map((toolName, index) => ({
      id: `${policy.skillId}-${state.iteration + 1}-${index + 1}`,
      skillId: policy.skillId,
      toolName,
      input: state.request,
      targetPath,
      command: chooseCommandForRequest(toolName, state.request),
    }));
  });

  return markDecision(
    {
      ...state,
      currentPhase: "build",
      iteration: state.iteration + 1,
      plannedToolIntents: intents,
    },
    `Built runtime plan with ${intents.length} tool intent(s)`,
  );
}

export async function executeNode(
  state: GraphRunState,
  toolExecutor?: ToolExecutor,
): Promise<GraphRunState> {
  if (!toolExecutor || state.plannedToolIntents.length === 0) {
    return markDecision(
      {
        ...state,
        currentPhase: "execute",
      },
      "Execute skipped tool runtime (no executor or no intents)",
    );
  }

  const results = await toolExecutor.executeIntents(state);

  const summary =
    results.length === 0
      ? "Executed 0 tool intents"
      : `Executed ${results.length} tool intents: ${results.map((r) => `${r.toolName}:${r.status}`).join(", ")}`;

  return markDecision(
    {
      ...state,
      currentPhase: "execute",
      toolResults: [...state.toolResults, ...results],
    },
    summary,
  );
}

export async function verifyNode(state: GraphRunState): Promise<GraphRunState> {
  const updatedCriteria = await Promise.all(
    state.criteria.map(async (criterion) => {
      const result = await evaluateCriterion(criterion, state);
      return {
        ...criterion,
        status: result.status,
        evidence: result.evidence,
      };
    }),
  );

  const passed = updatedCriteria.filter((c) => c.status === "pass").length;
  const failed = updatedCriteria.filter((c) => c.status === "fail").length;
  const pending = updatedCriteria.filter((c) => c.status === "pending").length;

  return markDecision(
    {
      ...state,
      currentPhase: "verify",
      criteria: updatedCriteria,
      verificationSummary: { passed, failed, pending },
    },
    "Verified current iteration output against criteria",
  );
}

export function learnNode(state: GraphRunState): GraphRunState {
  const noFailedCriteria =
    state.verificationSummary.failed === 0 && state.verificationSummary.pending === 0;
  const noBlockedPolicyEvents = !state.toolResults.some((result) => result.status === "blocked");
  const noUnresolvedHighRiskAssumptions =
    !state.decisionLog.some((entry) => /high-risk assumption unresolved/i.test(entry));

  const failedReasons: string[] = [];
  if (!noFailedCriteria) {
    failedReasons.push("criteria checks not fully passing");
  }
  if (!noBlockedPolicyEvents) {
    failedReasons.push("blocked policy events detected");
  }
  if (!noUnresolvedHighRiskAssumptions) {
    failedReasons.push("unresolved high-risk assumptions detected");
  }

  const gatesPassed =
    noFailedCriteria && noBlockedPolicyEvents && noUnresolvedHighRiskAssumptions;
  const plateauCount = gatesPassed ? state.plateauCount : state.plateauCount + 1;

  return markDecision(
    {
      ...state,
      currentPhase: "learn",
      plateauCount,
      stopReason: gatesPassed ? "criteria_satisfied" : null,
      verificationGates: {
        noFailedCriteria,
        noBlockedPolicyEvents,
        noUnresolvedHighRiskAssumptions,
        passed: gatesPassed,
        failedReasons,
      },
    },
    gatesPassed
      ? "Recorded successful reflection and completion learning"
      : `Recorded partial progress reflection for next iteration (gates failed: ${failedReasons.join(", ")})`,
  );
}

async function safeLlmDecision(
  state: GraphRunState,
  phase: "think" | "plan",
  llmAdapter: LlmAdapter | undefined,
  contextSnippets: string[],
  selectedSkillContexts: GraphRunState["selectedSkillContexts"],
  fallbackDecision: string,
): Promise<string> {
  if (!llmAdapter || state.mode === "minimal") {
    return fallbackDecision;
  }

  try {
    const generated = await llmAdapter.completePhase({
      phase,
      request: state.request,
      mode: state.mode,
      iteration: state.iteration,
      criteria: state.criteria,
      contextSnippets,
      selectedSkillContexts,
    });

    return generated || fallbackDecision;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return `${fallbackDecision} (LLM fallback: ${message})`;
  }
}

async function retrieveContextSnippets(
  state: GraphRunState,
  memoryRetriever: MemoryRetriever | undefined,
): Promise<string[]> {
  if (!memoryRetriever) {
    return state.retrievedContextSnippets;
  }

  try {
    return await memoryRetriever.retrieve({
      request: state.request,
      currentWorkId: state.workId,
      topK: 3,
    });
  } catch {
    return state.retrievedContextSnippets;
  }
}

function extractPathFromRequest(request: string): string | undefined {
  const match = request.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/);
  return match ? match[1] : undefined;
}

function extractUrlFromRequest(request: string): string | undefined {
  const match = request.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : undefined;
}

function orderToolsForPolicy(tools: string[], preferredOrder: string[] | undefined): string[] {
  if (!preferredOrder || preferredOrder.length === 0) {
    return tools;
  }

  const rank = new Map(preferredOrder.map((tool, index) => [tool, index]));
  return [...tools].sort((a, b) => {
    const ra = rank.get(a) ?? 100;
    const rb = rank.get(b) ?? 100;
    if (ra !== rb) {
      return ra - rb;
    }
    return a.localeCompare(b);
  });
}

function chooseCommandForRequest(toolName: string, request: string): string | undefined {
  if (toolName !== "shell.run") {
    return undefined;
  }

  const lowered = request.toLowerCase();
  if (lowered.includes("check") || lowered.includes("compile") || lowered.includes("type")) {
    return "npm run check";
  }

  if (lowered.includes("list") || lowered.includes("files")) {
    return "ls";
  }

  return "echo no-op";
}
