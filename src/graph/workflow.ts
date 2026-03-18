import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AppConfig } from "../runtime/config.js";
import type { LlmAdapter } from "../llm.js";
import type { MemoryRetriever } from "../memory/retriever.js";
import type { ToolExecutor } from "../runtime/executor.js";
import type { GraphRunState } from "../types.js";
import {
  buildNode,
  executeNode,
  learnNode,
  observeNode,
  planNode,
  thinkNode,
  verifyNode,
} from "./phases.js";

const GraphState = Annotation.Root({
  request: Annotation<string>(),
  mode: Annotation<"minimal" | "native" | "algorithm">(),
  workId: Annotation<string>(),
  currentPhase: Annotation<
    "observe" | "think" | "plan" | "build" | "execute" | "verify" | "learn" | null
  >(),
  criteria: Annotation<
    Array<{
      id: string;
      text: string;
      checkType: "file" | "command" | "test" | "semantic";
      target?: string;
      status: "pending" | "pass" | "fail";
      evidence?: {
        checkType: "file" | "command" | "test" | "semantic";
        passed: boolean;
        summary: string;
        details: string;
        timestamp: string;
      };
    }>
  >(),
  maxIterations: Annotation<number>(),
  iteration: Annotation<number>(),
  plateauCount: Annotation<number>(),
  stopReason: Annotation<string | null>(),
  decisionLog: Annotation<string[]>(),
  eventLog: Annotation<string[]>(),
  verificationSummary: Annotation<{ passed: number; failed: number; pending: number }>(),
  verificationGates: Annotation<{
    noFailedCriteria: boolean;
    noBlockedPolicyEvents: boolean;
    noUnresolvedHighRiskAssumptions: boolean;
    passed: boolean;
    failedReasons: string[];
  }>(),
  activeSkillPolicies: Annotation<
    Array<{
      skillId: string;
      requiredTools: string[];
      permissions: {
        network: boolean;
        fileSystem: boolean;
        shell: boolean;
        allowedPaths: string[];
        blockedCommands: string[];
        maxToolCalls: number;
      };
    }>
  >(),
  plannedToolIntents: Annotation<
    Array<{
      id: string;
      skillId: string;
      toolName: string;
      input: string;
      targetPath?: string;
      command?: string;
    }>
  >(),
  toolResults: Annotation<
    Array<{
      intentId: string;
      skillId: string;
      toolName: string;
      status: "ok" | "error" | "blocked";
      output: string;
      timestamp: string;
    }>
  >(),
  retrievedContextSnippets: Annotation<string[]>(),
  phaseDurationsMs: Annotation<
    Partial<Record<"observe" | "think" | "plan" | "build" | "execute" | "verify" | "learn", number>>
  >(),
});

function shouldIterate(state: GraphRunState): "iterate" | "done" {
  const completed = state.stopReason === "criteria_satisfied";
  const iterationCapReached = state.iteration >= state.maxIterations;
  const plateauReached = state.plateauCount >= 3;

  if (completed || iterationCapReached || plateauReached) {
    return "done";
  }

  return "iterate";
}

export function createWorkflow(
  config: AppConfig,
  deps: { llmAdapter?: LlmAdapter; toolExecutor?: ToolExecutor; memoryRetriever?: MemoryRetriever } = {},
) {
  const withTiming = <T extends GraphRunState>(
    phase: "observe" | "think" | "plan" | "build" | "execute" | "verify" | "learn",
    node: (state: T) => T | Promise<T>,
  ) => {
    return async (state: T): Promise<T> => {
      const started = Date.now();
      const next = await node(state);
      const elapsed = Date.now() - started;
      const durations = next.phaseDurationsMs ?? {};
      return {
        ...next,
        phaseDurationsMs: {
          ...durations,
          [phase]: (durations[phase] ?? 0) + elapsed,
        },
      };
    };
  };

  const graph = new StateGraph(GraphState)
    .addNode("observe", (state) => withTiming("observe", observeNode)(state as GraphRunState))
    .addNode("think", (state) =>
      withTiming("think", (s) => thinkNode(s, deps.llmAdapter, deps.memoryRetriever))(state as GraphRunState),
    )
    .addNode("plan", (state) =>
      withTiming("plan", (s) => planNode(s, deps.llmAdapter, deps.memoryRetriever))(state as GraphRunState),
    )
    .addNode("build", (state) => withTiming("build", buildNode)(state as GraphRunState))
    .addNode("execute", (state) =>
      withTiming("execute", (s) => executeNode(s, deps.toolExecutor))(state as GraphRunState),
    )
    .addNode("verify", (state) => withTiming("verify", verifyNode)(state as GraphRunState))
    .addNode("learn", (state) => withTiming("learn", learnNode)(state as GraphRunState))
    .addEdge(START, "observe")
    .addEdge("observe", "think")
    .addEdge("think", "plan")
    .addEdge("plan", "build")
    .addEdge("build", "execute")
    .addEdge("execute", "verify")
    .addEdge("verify", "learn")
    .addConditionalEdges("learn", (state) => shouldIterate(state as GraphRunState), {
      iterate: "build",
      done: END,
    });

  const app = graph.compile();

  return {
    run: async (input: GraphRunState): Promise<GraphRunState> => {
      const boundedInput = {
        ...input,
        maxIterations: config.maxIterations,
      };
      const result = await app.invoke(boundedInput);
      return result as GraphRunState;
    },
  };
}
