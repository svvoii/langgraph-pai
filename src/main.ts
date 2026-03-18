import { randomUUID } from "node:crypto";
import { routeMode } from "./graph/modeRouter.js";
import { createWorkflow } from "./graph/workflow.js";
import { HookBus } from "./hooks/hookBus.js";
import { registerDefaultHooks } from "./hooks/defaultHooks.js";
import { FsStore } from "./memory/fsStore.js";
import { synthesizeLearningForWork } from "./memory/synthesizer.js";
import { loadConfig } from "./runtime/config.js";
import { formatSkillSummary, SkillRegistry } from "./skills/registry.js";
import { loadResolvedSkills, scaffoldSkillManifest } from "./skills/loader.js";
import type { GraphRunState } from "./types.js";

function createInitialState(request: string): GraphRunState {
  const mode = routeMode(request);
  return {
    request,
    mode,
    workId: `work-${Date.now()}-${randomUUID().slice(0, 8)}`,
    currentPhase: null,
    criteria: [],
    maxIterations: 6,
    iteration: 0,
    plateauCount: 0,
    stopReason: null,
    decisionLog: [],
    eventLog: [],
    verificationSummary: {
      passed: 0,
      failed: 0,
      pending: 0,
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
    const skills = await loadResolvedSkills({
      systemSkillsDir: config.systemSkillsDir,
      userSkillsDir: config.userSkillsDir,
    });
    process.stdout.write(`${formatSkillSummary(skills)}\n`);
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

    const outputPath = await scaffoldSkillManifest({
      rootDir: isUser ? config.userSkillsDir : config.systemSkillsDir,
      name,
      description,
      useWhen: tokens.split(",").map((token) => token.trim()).filter(Boolean),
    });

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
      "Usage: npm run dev -- \"your request\" or commands: skill:validate | skill:init | resume | learn:summarize\n",
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
  const sessionId = randomUUID();

  const hookBus = new HookBus();
  registerDefaultHooks(hookBus, store);

  const context = {
    workId: state.workId,
    sessionId,
    phase: state.currentPhase,
  };

  await hookBus.emit("SessionStart", { request, mode: state.mode }, context);
  await hookBus.emit("UserPromptSubmit", { request }, context);

  const registry = await SkillRegistry.fromDisk({
    systemSkillsDir: config.systemSkillsDir,
    userSkillsDir: config.userSkillsDir,
  });
  const selectedSkills = registry.route(request);
  const toolEvent = {
    toolName: "skill-router",
    input: selectedSkills.map((skill) => skill.name).join(", ") || "none",
  };

  await hookBus.emit("PreToolUse", { toolEvent }, context);

  const workflow = createWorkflow(config);
  const result = await workflow.run(state);

  await hookBus.emit(
    "PostToolUse",
    {
      toolEvent,
      result: `mode=${result.mode} phase=${result.currentPhase} iterations=${result.iteration}`,
    },
    {
      ...context,
      phase: result.currentPhase,
    },
  );

  await store.writeState(result);
  await store.writeWorkDoc(result);
  await store.appendTranscript(result.workId, "user", request);

  const summary = `Completed in mode=${result.mode} iteration=${result.iteration} pass=${result.verificationSummary.passed}`;
  await store.appendTranscript(result.workId, "assistant", summary);

  await hookBus.emit("Stop", { summary }, { ...context, phase: result.currentPhase });
  await hookBus.emit(
    "SessionEnd",
    { status: result.stopReason === "criteria_satisfied" ? "complete" : "blocked" },
    { ...context, phase: result.currentPhase },
  );

  process.stdout.write(`${summary}\n`);
  process.stdout.write(`Work ID: ${result.workId}\n`);
  process.stdout.write(`Work doc: ${config.dataRoot}/work/${result.workId}.md\n`);

  return result;
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
