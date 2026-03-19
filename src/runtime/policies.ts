import type { SkillRuntimePolicy, ToolEvent } from "../types.js";

const GLOBAL_BLOCKED_SHELL_PATTERNS = ["rm -rf /", "git reset --hard", "curl | sh"];

export function assertSkillToolPolicy(
  toolEvent: ToolEvent,
  skill: SkillRuntimePolicy | undefined,
): void {
  if (toolEvent.toolName === "skill-router") {
    return;
  }

  if (!skill) {
    throw new Error(`Policy violation: missing skill context for tool '${toolEvent.toolName}'`);
  }

  if (!skill.requiredTools.includes(toolEvent.toolName)) {
    if (toolEvent.toolName === "reasoning") {
      return;
    }

    throw new Error(
      `Policy violation: skill '${skill.skillId}' is not allowed to use tool '${toolEvent.toolName}'`,
    );
  }

  if (toolEvent.toolCallCount && toolEvent.toolCallCount > skill.permissions.maxToolCalls) {
    throw new Error(
      `Policy violation: skill '${skill.skillId}' exceeded maxToolCalls (${skill.permissions.maxToolCalls})`,
    );
  }

  if (toolEvent.toolName === "shell.run") {
    assertShellPolicy(toolEvent, skill);
    return;
  }

  if (toolEvent.toolName === "file.read" || toolEvent.toolName === "file.write") {
    assertFilePolicy(toolEvent, skill);
    return;
  }

  if (toolEvent.toolName === "web.fetch" && !skill.permissions.network) {
    throw new Error(`Policy violation: skill '${skill.skillId}' does not allow network access`);
  }
}

function assertShellPolicy(toolEvent: ToolEvent, skill: SkillRuntimePolicy): void {
  if (!skill.permissions.shell) {
    throw new Error(`Policy violation: skill '${skill.skillId}' does not allow shell commands`);
  }

  const input = toolEvent.input.toLowerCase();

  const blockedBySkill = skill.permissions.blockedCommands.some((pattern) =>
    input.includes(pattern.toLowerCase()),
  );

  if (blockedBySkill) {
    throw new Error(`Policy violation: shell input blocked for skill '${skill.skillId}'`);
  }

  const blockedGlobally = GLOBAL_BLOCKED_SHELL_PATTERNS.some((pattern) =>
    input.includes(pattern.toLowerCase()),
  );

  if (blockedGlobally) {
    throw new Error(`Policy violation: shell input blocked by global policy`);
  }
}

function assertFilePolicy(toolEvent: ToolEvent, skill: SkillRuntimePolicy): void {
  if (!skill.permissions.fileSystem) {
    throw new Error(`Policy violation: skill '${skill.skillId}' does not allow filesystem access`);
  }

  if (!toolEvent.targetPath || skill.permissions.allowedPaths.length === 0) {
    return;
  }

  const normalizedTarget = normalizePath(toolEvent.targetPath);
  const allowed = skill.permissions.allowedPaths.some((pattern) =>
    matchAllowedPath(normalizedTarget, pattern),
  );

  if (!allowed) {
    throw new Error(
      `Policy violation: target path '${toolEvent.targetPath}' is outside allowedPaths for '${skill.skillId}'`,
    );
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function matchAllowedPath(targetPath: string, pattern: string): boolean {
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return targetPath.startsWith(prefix);
  }

  return targetPath === normalizedPattern;
}
