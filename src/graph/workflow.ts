import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { AppConfig } from "../runtime/config.js";
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
    Array<{ id: string; text: string; status: "pending" | "pass" | "fail"; evidence?: string }>
  >(),
  maxIterations: Annotation<number>(),
  iteration: Annotation<number>(),
  plateauCount: Annotation<number>(),
  stopReason: Annotation<string | null>(),
  decisionLog: Annotation<string[]>(),
  eventLog: Annotation<string[]>(),
  verificationSummary: Annotation<{ passed: number; failed: number; pending: number }>(),
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

export function createWorkflow(config: AppConfig) {
  const graph = new StateGraph(GraphState)
    .addNode("observe", (state) => observeNode(state as GraphRunState))
    .addNode("think", (state) => thinkNode(state as GraphRunState))
    .addNode("plan", (state) => planNode(state as GraphRunState))
    .addNode("build", (state) => buildNode(state as GraphRunState))
    .addNode("execute", (state) => executeNode(state as GraphRunState))
    .addNode("verify", (state) => verifyNode(state as GraphRunState))
    .addNode("learn", (state) => learnNode(state as GraphRunState))
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
