import type { GraphRunState } from "../types.js";

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
    { id: "ISC-1", text: "Graph compiles and runs", status: "pending" as const },
    { id: "ISC-2", text: "Hook lifecycle emits events", status: "pending" as const },
    { id: "ISC-3", text: "State persisted to disk", status: "pending" as const },
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

export function thinkNode(state: GraphRunState): GraphRunState {
  return markDecision(
    {
      ...state,
      currentPhase: "think",
    },
    "Assessed risks and clarified assumptions",
  );
}

export function planNode(state: GraphRunState): GraphRunState {
  return markDecision(
    {
      ...state,
      currentPhase: "plan",
    },
    "Created phased implementation strategy",
  );
}

export function buildNode(state: GraphRunState): GraphRunState {
  return markDecision(
    {
      ...state,
      currentPhase: "build",
      iteration: state.iteration + 1,
    },
    "Built and integrated core runtime modules",
  );
}

export function executeNode(state: GraphRunState): GraphRunState {
  return markDecision(
    {
      ...state,
      currentPhase: "execute",
    },
    "Executed the planned runtime flow",
  );
}

export function verifyNode(state: GraphRunState): GraphRunState {
  const updatedCriteria = state.criteria.map((criterion, index) => ({
    ...criterion,
    status: index < 2 ? "pass" : criterion.status,
    evidence: index < 2 ? "MVP integration check passed" : criterion.evidence,
  }));

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
  const allPassed = state.criteria.every((criterion) => criterion.status === "pass");
  const plateauCount = allPassed ? state.plateauCount : state.plateauCount + 1;

  return markDecision(
    {
      ...state,
      currentPhase: "learn",
      plateauCount,
      stopReason: allPassed ? "criteria_satisfied" : null,
    },
    allPassed
      ? "Recorded successful reflection and completion learning"
      : "Recorded partial progress reflection for next iteration",
  );
}
