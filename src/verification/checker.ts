import { access } from "node:fs/promises";
import { join } from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";
import type { Criterion, CriterionStatus, GraphRunState, VerificationEvidence } from "../types.js";

const exec = promisify(execCallback);
const COMMAND_ALLOWLIST_PREFIXES = ["echo", "pwd", "ls", "cat", "npm run check"];

export async function evaluateCriterion(
  criterion: Criterion,
  state: GraphRunState,
): Promise<{ status: CriterionStatus; evidence: VerificationEvidence }> {
  switch (criterion.checkType) {
    case "file":
      return verifyFileCriterion(criterion);
    case "command":
      return verifyCommandCriterion(criterion);
    case "test":
      return verifyTestCriterion(criterion, state);
    case "semantic":
      return verifySemanticCriterion(criterion, state);
    default:
      return {
        status: "fail",
        evidence: buildEvidence(criterion.checkType, false, "Unsupported check type", criterion.text),
      };
  }
}

async function verifyFileCriterion(
  criterion: Criterion,
): Promise<{ status: CriterionStatus; evidence: VerificationEvidence }> {
  const target = criterion.target;

  if (!target) {
    return {
      status: "fail",
      evidence: buildEvidence("file", false, "Missing file target", criterion.text),
    };
  }

  const fullPath = join(process.cwd(), target);

  try {
    await access(fullPath);
    return {
      status: "pass",
      evidence: buildEvidence("file", true, `File exists: ${target}`, `Checked path ${fullPath}`),
    };
  } catch {
    return {
      status: "fail",
      evidence: buildEvidence("file", false, `File missing: ${target}`, `Checked path ${fullPath}`),
    };
  }
}

async function verifyCommandCriterion(
  criterion: Criterion,
): Promise<{ status: CriterionStatus; evidence: VerificationEvidence }> {
  const command = criterion.target ?? "npm run check";
  const allowed = COMMAND_ALLOWLIST_PREFIXES.some((prefix) =>
    command === prefix || command.startsWith(`${prefix} `),
  );

  if (!allowed) {
    return {
      status: "fail",
      evidence: buildEvidence("command", false, `Command not allowed: ${command}`, "Denied by allowlist"),
    };
  }

  try {
    const { stdout, stderr } = await exec(command, { timeout: 20_000, maxBuffer: 1024 * 1024 });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim() || "No output";
    return {
      status: "pass",
      evidence: buildEvidence("command", true, `Command passed: ${command}`, output.slice(0, 400)),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "fail",
      evidence: buildEvidence("command", false, `Command failed: ${command}`, message.slice(0, 400)),
    };
  }
}

function verifyTestCriterion(
  criterion: Criterion,
  state: GraphRunState,
): { status: CriterionStatus; evidence: VerificationEvidence } {
  const hasSuccessfulExecution = state.toolResults.some((result) => result.status === "ok");

  if (hasSuccessfulExecution) {
    return {
      status: "pass",
      evidence: buildEvidence(
        "test",
        true,
        "Execution results include successful tool runs",
        `Successful tools: ${state.toolResults.filter((r) => r.status === "ok").length}`,
      ),
    };
  }

  return {
    status: "fail",
    evidence: buildEvidence("test", false, "No successful tool results found", criterion.text),
  };
}

function verifySemanticCriterion(
  criterion: Criterion,
  state: GraphRunState,
): { status: CriterionStatus; evidence: VerificationEvidence } {
  const hasSignal = state.decisionLog.length > 0 && state.eventLog.length > 0;

  if (hasSignal) {
    return {
      status: "pass",
      evidence: buildEvidence(
        "semantic",
        true,
        "Semantic checks show progress evidence",
        `decisions=${state.decisionLog.length}, events=${state.eventLog.length}`,
      ),
    };
  }

  return {
    status: "fail",
    evidence: buildEvidence("semantic", false, "Insufficient semantic signals", criterion.text),
  };
}

function buildEvidence(
  checkType: VerificationEvidence["checkType"],
  passed: boolean,
  summary: string,
  details: string,
): VerificationEvidence {
  return {
    checkType,
    passed,
    summary,
    details,
    timestamp: new Date().toISOString(),
  };
}
