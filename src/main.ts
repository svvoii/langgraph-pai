import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { routeMode } from "./graph/modeRouter.js";
import { createWorkflow } from "./graph/workflow.js";
import { HookBus } from "./hooks/hookBus.js";
import { registerDefaultHooks } from "./hooks/defaultHooks.js";
import { createLlmAdapter } from "./llm.js";
import { createMemoryRetriever } from "./memory/retriever.js";
import { FsStore } from "./memory/fsStore.js";
import { synthesizeLearningForWork } from "./memory/synthesizer.js";
import { loadConfig } from "./runtime/config.js";
import { createWorkId } from "./runtime/workId.js";
import { createToolExecutor } from "./runtime/executor.js";
import { assertSkillToolPolicy } from "./runtime/policies.js";
import { buildRunReport, formatRecentRunSummaries, summarizeRunReport } from "./runtime/telemetry.js";
import {
  formatLoadedSkillsV1,
  loadSkillsV1,
  scaffoldManifestV1,
} from "./skills/manifest.v1.loader.js";
import { loadSkillDocContexts } from "./skills/docContext.loader.js";
import {
  summarizeValidationIssues,
  validateLoadedSkillsV1Policy,
} from "./skills/manifest.v1.validator.js";
import type { LoadedSkillV1 } from "./skills/manifest.v1.schema.js";
import type { GraphRunState, SkillRuntimePolicy, ToolEvent } from "./types.js";

function createInitialState(request: string): GraphRunState {
  const mode = routeMode(request);
  return {
    request,
    mode,
    workId: createWorkId(),
    currentPhase: null,
    criteria: [],
    maxIterations: 6,
    iteration: 0,
    plateauCount: 0,
    stopReason: null,
    decisionLog: [],
    eventLog: [],
    activeSkillPolicies: [],
    selectedSkillContexts: [],
    plannedToolIntents: [],
    toolResults: [],
    retrievedContextSnippets: [],
    phaseDurationsMs: {},
    verificationSummary: {
      passed: 0,
      failed: 0,
      pending: 0,
    },
    verificationGates: {
      noFailedCriteria: false,
      noBlockedPolicyEvents: true,
      noUnresolvedHighRiskAssumptions: true,
      passed: false,
      failedReasons: [],
    },
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const request = args.join(" ").trim();

  const config = loadConfig();
  const store = new FsStore(config.dataRoot);
  await store.ensure();

  if (args[0] === "skill:validate") {
    const skills = await loadSkillsV1({
      systemDir: config.systemSkillsDir,
      userDir: config.userSkillsDir,
      assistantCoreVersion: config.assistantCoreVersion,
    });

    const issues = validateLoadedSkillsV1Policy(skills);
    const summary = [formatLoadedSkillsV1(skills), summarizeValidationIssues(issues)].join("\n");

    process.stdout.write(`${summary}\n`);
    return;
  }

  if (args[0] === "skill:init") {
    const isUser = args.includes("--user");
    const filteredArgs = args.filter((arg) => arg !== "--user");
    const [, name, description, tokens] = filteredArgs;

    if (!name || !description || !tokens) {
      process.stderr.write(
        "Usage: npm run dev -- skill:init <Name> <Description> <token1,token2> [--user]\n",
      );
      process.exit(1);
    }

    const rootDir = isUser ? config.userSkillsDir : config.systemSkillsDir;
    await mkdir(rootDir, { recursive: true });

    const id = name.toLowerCase().replace(/\s+/g, "-");
    const manifest = scaffoldManifestV1({
      id,
      name,
      description,
      useWhen: tokens.split(",").map((token) => token.trim()).filter(Boolean),
    });

    const outputPath = join(rootDir, `${id}.manifest.json`);
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

    process.stdout.write(`Created manifest: ${outputPath}\n`);
    return;
  }

  if (args[0] === "learn:summarize") {
    const workId = args[1];

    if (!workId) {
      process.stderr.write("Usage: npm run dev -- learn:summarize <workId>\n");
      process.exit(1);
    }

    const summary = await synthesizeLearningForWork(store, workId);
    process.stdout.write(`${summary}\n`);
    return;
  }

  if (args[0] === "runs:recent") {
    const count = args[1] ? Number(args[1]) : 5;
    const summaries = await store.listRunReportSummaries(Number.isFinite(count) ? count : 5);
    process.stdout.write(`${formatRecentRunSummaries(summaries)}\n`);
    return;
  }

  if (args[0] === "resume") {
    const workId = args[1];

    if (!workId) {
      process.stderr.write("Usage: npm run dev -- resume <workId>\n");
      process.exit(1);
    }

    const existing = await store.readState(workId);

    if (!existing) {
      process.stderr.write(`No state found for workId=${workId}\n`);
      process.exit(1);
    }

    await runSession(existing.request, existing, config, store);
    return;
  }

  if (!request) {
    process.stderr.write(
      'Usage: npm run dev -- "your request" or commands: skill:validate | skill:init | resume | learn:summarize\n',
    );
    process.exit(1);
  }

  const state = createInitialState(request);
  await runSession(request, state, config, store);
}

async function runSession(
  request: string,
  state: GraphRunState,
  config: ReturnType<typeof loadConfig>,
  store: FsStore,
): Promise<GraphRunState> {
  const startedAtMs = Date.now();
  const normalizedState = withRuntimeDefaults(state);
  const sessionId = randomUUID();

  const hookBus = new HookBus();
  registerDefaultHooks(hookBus, store);

  const context = {
    workId: normalizedState.workId,
    sessionId,
    phase: normalizedState.currentPhase,
  };

  await hookBus.emit("SessionStart", { request, mode: normalizedState.mode }, context);
  await hookBus.emit("UserPromptSubmit", { request }, context);

  const skills = await loadSkillsV1({
    systemDir: config.systemSkillsDir,
    userDir: config.userSkillsDir,
    assistantCoreVersion: config.assistantCoreVersion,
  });

  const selectedSkills = routeSkillsV1(skills, request);
  const activeSkillPolicies = selectedSkills.map((skill) => toSkillRuntimePolicy(skill));
  const selectedSkillContexts = await loadSkillDocContexts(selectedSkills, {
    enabled: config.skillDocContextEnabled,
    maxBytesPerSkill: config.skillDocMaxBytesPerSkill,
    includeSupplementalDocs: config.skillDocIncludeSupplementalDocs,
  });
  const activeState: GraphRunState = {
    ...normalizedState,
    activeSkillPolicies,
    selectedSkillContexts,
  };

  const routingEvent: ToolEvent = {
    toolName: "skill-router",
    input: selectedSkills.map((skill) => skill.id).join(", ") || "none",
  };

  await hookBus.emit("PreToolUse", { toolEvent: routingEvent }, context);

  const plannedToolEvents = buildPlannedToolEvents(activeSkillPolicies, request);
  const skillsById = new Map(activeSkillPolicies.map((skill) => [skill.skillId, skill]));

  for (const toolEvent of plannedToolEvents) {
    const skill = toolEvent.skillId ? skillsById.get(toolEvent.skillId) : undefined;
    assertSkillToolPolicy(toolEvent, skill);
    await hookBus.emit("PreToolUse", { toolEvent }, context);
  }

  const toolExecutor = createToolExecutor({
    projectRoot: process.cwd(),
    onPreToolUse: async (toolEvent) => hookBus.emit("PreToolUse", { toolEvent }, context),
    onPostToolUse: async (toolEvent, result) =>
      hookBus.emit("PostToolUse", { toolEvent, result }, context),
  });

  const workflow = createWorkflow(config, {
    llmAdapter: createLlmAdapter(),
    toolExecutor,
    memoryRetriever: createMemoryRetriever(config.dataRoot),
  });
  const result = await workflow.run(activeState);
  const finishedAtMs = Date.now();

  await hookBus.emit(
    "PostToolUse",
    {
      toolEvent: routingEvent,
      result: `mode=${result.mode} phase=${result.currentPhase} iterations=${result.iteration}`,
    },
    {
      ...context,
      phase: result.currentPhase,
    },
  );

  await store.writeState(result);
  await store.writeWorkDoc(result);
  const runReport = buildRunReport({
    request,
    state: result,
    startedAtMs,
    finishedAtMs,
  });
  await store.writeRunReport(result.workId, runReport);
  await store.appendTranscript(result.workId, "user", request);

  const summary = `Completed in mode=${result.mode} iteration=${result.iteration} pass=${result.verificationSummary.passed}`;
  const runSummary = summarizeRunReport(runReport);
  await store.appendTranscript(result.workId, "assistant", summary);

  await hookBus.emit("Stop", { summary }, { ...context, phase: result.currentPhase });
  await hookBus.emit(
    "SessionEnd",
    { status: result.stopReason === "criteria_satisfied" ? "complete" : "blocked" },
    { ...context, phase: result.currentPhase },
  );

  process.stdout.write(`${summary}\n`);
  process.stdout.write(
    `Run summary: outcome=${runSummary.outcome} failures=${runSummary.failureCauses.join(";") || "none"}\n`,
  );
  process.stdout.write(`Work ID: ${result.workId}\n`);
  process.stdout.write(`Work doc: ${config.dataRoot}/work/${result.workId}.md\n`);

  return result;
}

function buildPlannedToolEvents(skills: SkillRuntimePolicy[], request: string): ToolEvent[] {
  const events: ToolEvent[] = [];

  for (const skill of skills) {
    let toolCallCount = 0;

    for (const toolName of skill.requiredTools) {
      toolCallCount += 1;
      events.push({
        toolName,
        input: request,
        skillId: skill.skillId,
        toolCallCount,
        targetPath: extractPathFromRequest(request),
      });
    }
  }

  return events;
}

function extractPathFromRequest(request: string): string | undefined {
  const match = request.match(/([A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/);
  return match ? match[1] : undefined;
}

function routeSkillsV1(skills: LoadedSkillV1[], request: string): LoadedSkillV1[] {
  const lowered = request.toLowerCase();
  return skills.filter((skill) =>
    skill.useWhen.some((token) => lowered.includes(token.toLowerCase())),
  );
}

function toSkillRuntimePolicy(skill: LoadedSkillV1): SkillRuntimePolicy {
  return {
    skillId: skill.id,
    requiredTools: skill.requiredTools,
    permissions: {
      network: skill.permissions.network,
      fileSystem: skill.permissions.fileSystem,
      shell: skill.permissions.shell,
      allowedPaths: skill.permissions.allowedPaths,
      blockedCommands: skill.permissions.blockedCommands,
      maxToolCalls: skill.permissions.maxToolCalls,
    },
  };
}

function withRuntimeDefaults(state: GraphRunState): GraphRunState {
  return {
    ...state,
    activeSkillPolicies: state.activeSkillPolicies ?? [],
    selectedSkillContexts: state.selectedSkillContexts ?? [],
    plannedToolIntents: state.plannedToolIntents ?? [],
    toolResults: state.toolResults ?? [],
    retrievedContextSnippets: state.retrievedContextSnippets ?? [],
    phaseDurationsMs: state.phaseDurationsMs ?? {},
    verificationGates: state.verificationGates ?? {
      noFailedCriteria: false,
      noBlockedPolicyEvents: true,
      noUnresolvedHighRiskAssumptions: true,
      passed: false,
      failedReasons: [],
    },
  };
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
