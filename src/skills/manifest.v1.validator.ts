import type { LoadedSkillV1 } from "./manifest.v1.schema.js";

export type ValidationIssueLevel = "PASS" | "WARN" | "FAIL";

export interface ValidationIssue {
  level: ValidationIssueLevel;
  skillId: string;
  message: string;
}

const KNOWN_TOOLS = new Set(["file.read", "file.write", "shell.run", "web.fetch", "reasoning"]);

export function validateLoadedSkillsV1Policy(skills: LoadedSkillV1[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const skill of skills) {
    let hasHardFail = false;

    for (const tool of skill.requiredTools) {
      if (!KNOWN_TOOLS.has(tool)) {
        hasHardFail = true;
        issues.push({
          level: "FAIL",
          skillId: skill.id,
          message: `Unknown required tool: ${tool}`,
        });
      }
    }

    if (!skill.permissions.shell && skill.permissions.blockedCommands.length > 0) {
      issues.push({
        level: "WARN",
        skillId: skill.id,
        message: "blockedCommands defined while shell permission is false",
      });
    }

    if (skill.permissions.fileSystem && skill.permissions.allowedPaths.length === 0) {
      issues.push({
        level: "WARN",
        skillId: skill.id,
        message: "fileSystem permission true but allowedPaths is empty",
      });
    }

    if (!hasHardFail) {
      issues.push({
        level: "PASS",
        skillId: skill.id,
        message: "Skill passed policy validation",
      });
    }
  }

  return issues;
}

export function summarizeValidationIssues(issues: ValidationIssue[]): string {
  if (issues.length === 0) {
    return "PASS No validation issues";
  }

  const pass = issues.filter((i) => i.level === "PASS").length;
  const warn = issues.filter((i) => i.level === "WARN").length;
  const fail = issues.filter((i) => i.level === "FAIL").length;

  const lines = issues.map((i) => `${i.level} ${i.skillId}: ${i.message}`);
  lines.push(`Summary: ${pass} pass, ${warn} warn, ${fail} fail`);

  return lines.join("\n");
}
