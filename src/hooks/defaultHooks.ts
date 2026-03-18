import type { FsStore } from "../memory/fsStore.js";
import type { HookContext } from "../types.js";
import { HookBus } from "./hookBus.js";

async function writeEvent(
  store: FsStore,
  context: HookContext,
  text: string,
): Promise<void> {
  await store.appendEvent(context.workId, text);
}

export function registerDefaultHooks(bus: HookBus, store: FsStore): void {
  bus.on("SessionStart", async ({ request, mode }, context) => {
    await writeEvent(store, context, `session_start mode=${mode} request=${request}`);
  });

  bus.on("UserPromptSubmit", async ({ request }, context) => {
    await writeEvent(store, context, `user_prompt request=${request}`);
  });

  bus.on("PreToolUse", async ({ toolEvent }, context) => {
    const suffix = toolEvent.skillId ? ` skill=${toolEvent.skillId}` : "";
    await writeEvent(store, context, `pre_tool tool=${toolEvent.toolName}${suffix}`);
  });

  bus.on("PostToolUse", async ({ toolEvent, result }, context) => {
    await writeEvent(store, context, `post_tool tool=${toolEvent.toolName} result=${result}`);
  });

  bus.on("Stop", async ({ summary }, context) => {
    await writeEvent(store, context, `stop summary=${summary}`);
  });

  bus.on("SessionEnd", async ({ status }, context) => {
    await writeEvent(store, context, `session_end status=${status}`);
  });
}
