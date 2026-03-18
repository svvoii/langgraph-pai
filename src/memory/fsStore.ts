import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GraphRunState } from "../types.js";
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
}
