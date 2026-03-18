import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphRunState } from "../types.js";
import type { RunReportSummary } from "../runtime/telemetry.js";
import { serializeWorkDocument, validateWorkDocument } from "./workDocument.js";

export class FsStore {
  constructor(private readonly dataRoot: string) {}

  async ensure(): Promise<void> {
    await Promise.all([
      mkdir(join(this.dataRoot, "work"), { recursive: true }),
      mkdir(join(this.dataRoot, "state"), { recursive: true }),
      mkdir(join(this.dataRoot, "learning"), { recursive: true }),
      mkdir(join(this.dataRoot, "events"), { recursive: true }),
      mkdir(join(this.dataRoot, "transcripts"), { recursive: true }),
      mkdir(join(this.dataRoot, "reports"), { recursive: true }),
    ]);
  }

  async writeState(state: GraphRunState): Promise<void> {
    const path = join(this.dataRoot, "state", `${state.workId}.json`);
    await writeFile(path, JSON.stringify(state, null, 2), "utf-8");
  }

  async writeWorkDoc(state: GraphRunState): Promise<void> {
    const markdown = serializeWorkDocument(state);
    validateWorkDocument(markdown);

    const path = join(this.dataRoot, "work", `${state.workId}.md`);
    await writeFile(path, markdown, "utf-8");
  }

  async appendEvent(workId: string, event: string): Promise<void> {
    const path = join(this.dataRoot, "events", `${workId}.jsonl`);
    const record = JSON.stringify({ timestamp: new Date().toISOString(), event });
    await writeFile(path, `${record}\n`, { encoding: "utf-8", flag: "a" });
  }

  async appendTranscript(
    workId: string,
    role: "user" | "assistant",
    content: string,
  ): Promise<void> {
    const path = join(this.dataRoot, "transcripts", `${workId}.jsonl`);
    const record = JSON.stringify({ timestamp: new Date().toISOString(), role, content });
    await writeFile(path, `${record}\n`, { encoding: "utf-8", flag: "a" });
  }

  async readEventLines(workId: string): Promise<string[]> {
    const path = join(this.dataRoot, "events", `${workId}.jsonl`);

    try {
      const raw = await readFile(path, "utf-8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const parsed = JSON.parse(line) as { event?: string };
          return parsed.event ?? "";
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async writeLearningSummary(workId: string, content: string): Promise<void> {
    const path = join(this.dataRoot, "learning", `${workId}.md`);
    await writeFile(path, content, "utf-8");
  }

  async readState(workId: string): Promise<GraphRunState | null> {
    const path = join(this.dataRoot, "state", `${workId}.json`);

    try {
      const raw = await readFile(path, "utf-8");
      return JSON.parse(raw) as GraphRunState;
    } catch {
      return null;
    }
  }

  async writeRunReport(workId: string, report: unknown): Promise<void> {
    const path = join(this.dataRoot, "reports", `${workId}.json`);
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  }

  async listRunReportSummaries(limit: number): Promise<RunReportSummary[]> {
    const reportsDir = join(this.dataRoot, "reports");

    let files: string[];
    try {
      files = await readdir(reportsDir, { encoding: "utf-8" });
    } catch {
      return [];
    }

    const records: RunReportSummary[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const fullPath = join(reportsDir, file);
      try {
        const raw = await readFile(fullPath, "utf-8");
        const parsed = JSON.parse(raw) as {
          workId?: string;
          finishedAt?: string;
          mode?: RunReportSummary["mode"];
          verificationGates?: { passed?: boolean };
          iteration?: number;
          failureCauses?: string[];
          request?: string;
        };

        records.push({
          workId: parsed.workId ?? file.replace(/\.json$/, ""),
          finishedAt: parsed.finishedAt ?? new Date(0).toISOString(),
          mode: parsed.mode ?? "algorithm",
          outcome: parsed.verificationGates?.passed ? "complete" : "blocked",
          iteration: parsed.iteration ?? 0,
          failureCauses: parsed.failureCauses ?? [],
          request: parsed.request ?? "unknown",
        });
      } catch {
        // Ignore malformed reports and continue.
      }
    }

    return records
      .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
      .slice(0, Math.max(limit, 0));
  }
}
