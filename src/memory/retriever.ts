import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface RetrievalRecord {
  source: string;
  updatedAtMs: number;
  content: string;
}

export interface MemoryRetriever {
  retrieve(args: {
    request: string;
    currentWorkId: string;
    topK?: number;
  }): Promise<string[]>;
}

export function createMemoryRetriever(dataRoot: string): MemoryRetriever {
  return {
    retrieve: async ({ request, currentWorkId, topK = 3 }) => {
      const records = await collectRecords(dataRoot, currentWorkId);
      const scored = records
        .map((record) => ({
          record,
          score: scoreRecord(record.content, request, record.updatedAtMs),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((entry) => summarizeRecord(entry.record));

      return scored;
    },
  };
}

async function collectRecords(dataRoot: string, currentWorkId: string): Promise<RetrievalRecord[]> {
  const workRecords = await collectDir(join(dataRoot, "work"), currentWorkId);
  const learningRecords = await collectDir(join(dataRoot, "learning"), currentWorkId);
  return [...workRecords, ...learningRecords];
}

async function collectDir(dirPath: string, currentWorkId: string): Promise<RetrievalRecord[]> {
  let files: string[];

  try {
    files = await readdir(dirPath, { encoding: "utf-8" });
  } catch {
    return [];
  }

  const records: RetrievalRecord[] = [];

  for (const file of files) {
    if (!file.endsWith(".md")) {
      continue;
    }

    if (file.includes(currentWorkId)) {
      continue;
    }

    const fullPath = join(dirPath, file);

    try {
      const content = await readFile(fullPath, "utf-8");
      const updatedAtMs = parseUpdatedAtMs(content) ?? Date.now();
      records.push({
        source: file,
        updatedAtMs,
        content,
      });
    } catch {
      // Ignore unreadable records and continue retrieval.
    }
  }

  return records;
}

function parseUpdatedAtMs(markdown: string): number | null {
  const match = markdown.match(/updated_at:\s*([^\n]+)/);
  if (!match) {
    return null;
  }

  const ms = Date.parse(match[1].trim());
  return Number.isNaN(ms) ? null : ms;
}

function scoreRecord(content: string, request: string, updatedAtMs: number): number {
  const relevance = lexicalOverlapScore(content, request);
  const recency = recencyScore(updatedAtMs);
  return relevance * 0.75 + recency * 0.25;
}

function lexicalOverlapScore(content: string, request: string): number {
  const contentTokens = tokenize(content);
  const requestTokens = tokenize(request);

  if (requestTokens.size === 0 || contentTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of requestTokens) {
    if (contentTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / requestTokens.size;
}

function recencyScore(updatedAtMs: number): number {
  const ageMs = Math.max(Date.now() - updatedAtMs, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const ageDays = ageMs / dayMs;
  return 1 / (1 + ageDays);
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

function summarizeRecord(record: RetrievalRecord): string {
  const body = record.content
    .split("\n")
    .filter((line) => line.trim().length > 0 && !line.startsWith("---"))
    .slice(0, 6)
    .join(" ")
    .slice(0, 420);

  return `[${record.source}] ${body}`;
}
