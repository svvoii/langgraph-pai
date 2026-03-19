import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { LoadedSkillV1 } from "./manifest.v1.schema.js";
import type { SelectedSkillContext } from "../types.js";

export interface SkillDocLoaderOptions {
  enabled: boolean;
  maxBytesPerSkill: number;
  includeSupplementalDocs: boolean;
}

export async function loadSkillDocContexts(
  selectedSkills: LoadedSkillV1[],
  options: SkillDocLoaderOptions,
): Promise<SelectedSkillContext[]> {
  if (!options.enabled) {
    return [];
  }

  const contexts: SelectedSkillContext[] = [];

  for (const skill of selectedSkills) {
    const docsDir = join(dirname(skill.manifestPath), skill.id);
    const files = await collectSkillDocFiles(skill, docsDir, options.includeSupplementalDocs);

    if (files.length === 0) {
      contexts.push({
        skillId: skill.id,
        skillName: skill.name,
        skillDescription: skill.description,
        source: skill.source,
        docSnippets: [],
        intentHints: inferIntentHints(skill),
      });
      continue;
    }

    let remaining = options.maxBytesPerSkill;
    const snippets: string[] = [];

    for (const filePath of files) {
      if (remaining <= 0) {
        break;
      }

      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimToBytes(trimmed, remaining);
      if (!normalized) {
        continue;
      }

      const rel = relative(docsDir, filePath).replace(/\\/g, "/");
      snippets.push(`FILE: ${rel}\n${normalized}`);
      remaining -= Buffer.byteLength(normalized, "utf-8");
    }

    contexts.push({
      skillId: skill.id,
      skillName: skill.name,
      skillDescription: skill.description,
      source: skill.source,
      docSnippets: snippets,
      intentHints: inferIntentHints(skill),
    });
  }

  return contexts;
}

async function collectSkillDocFiles(
  skill: LoadedSkillV1,
  docsDir: string,
  includeSupplementalDocs: boolean,
): Promise<string[]> {
  const entrypointPaths = [skill.entrypoints.plannerPrompt, skill.entrypoints.executorPrompt]
    .filter((value): value is string => Boolean(value))
    .map((value) => join(dirname(skill.manifestPath), value));

  const deduped = new Set<string>();
  const files: string[] = [];

  for (const filePath of entrypointPaths) {
    if (filePath.toLowerCase().endsWith(".md") && !deduped.has(filePath)) {
      deduped.add(filePath);
      files.push(filePath);
    }
  }

  if (includeSupplementalDocs) {
    const supplemental = await listMarkdownFiles(docsDir);
    for (const filePath of supplemental) {
      if (!deduped.has(filePath)) {
        deduped.add(filePath);
        files.push(filePath);
      }
    }
  }

  if (files.length > 0) {
    return files;
  }

  return listMarkdownFiles(docsDir);
}

async function listMarkdownFiles(rootDir: string): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      const nested = await listMarkdownFiles(fullPath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function inferIntentHints(skill: LoadedSkillV1): SelectedSkillContext["intentHints"] {
  const required = new Set(skill.requiredTools);

  const requiresUrl = required.has("web.fetch");
  const requiresFilePath = required.has("file.read") || required.has("file.write");
  const preferredToolOrder = orderTools(skill.requiredTools);

  return {
    requiresUrl,
    requiresFilePath,
    preferredToolOrder,
  };
}

function orderTools(tools: string[]): string[] {
  const priority = new Map<string, number>([
    ["reasoning", 1],
    ["file.read", 2],
    ["web.fetch", 3],
    ["file.write", 4],
    ["shell.run", 5],
  ]);

  return [...tools].sort((a, b) => {
    const pa = priority.get(a) ?? 50;
    const pb = priority.get(b) ?? 50;
    if (pa !== pb) {
      return pa - pb;
    }
    return a.localeCompare(b);
  });
}

function trimToBytes(input: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  if (Buffer.byteLength(input, "utf-8") <= maxBytes) {
    return input;
  }

  let value = input;
  while (value.length > 0 && Buffer.byteLength(value, "utf-8") > maxBytes) {
    value = value.slice(0, -1);
  }

  return value.trimEnd();
}
