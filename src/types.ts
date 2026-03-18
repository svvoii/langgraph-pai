export type Mode = "minimal" | "native" | "algorithm";

export type Phase =
  | "observe"
  | "think"
  | "plan"
  | "build"
  | "execute"
  | "verify"
  | "learn";

export type CriterionStatus = "pending" | "pass" | "fail";

export interface Criterion {
  id: string;
  text: string;
  status: CriterionStatus;
  evidence?: string;
}

export interface ToolEvent {
  toolName: string;
  input: string;
}

export interface GraphRunState {
  request: string;
  mode: Mode;
  workId: string;
  currentPhase: Phase | null;
  criteria: Criterion[];
  maxIterations: number;
  iteration: number;
  plateauCount: number;
  stopReason: string | null;
  decisionLog: string[];
  eventLog: string[];
  verificationSummary: {
    passed: number;
    failed: number;
    pending: number;
  };
}

export interface HookContext {
  workId: string;
  sessionId: string;
  phase: Phase | null;
}

export type HookEvent =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SessionEnd";

export interface HookPayloadMap {
  SessionStart: { request: string; mode: Mode };
  UserPromptSubmit: { request: string };
  PreToolUse: { toolEvent: ToolEvent };
  PostToolUse: { toolEvent: ToolEvent; result: string };
  Stop: { summary: string };
  SessionEnd: { status: "complete" | "blocked" | "failed" };
}
