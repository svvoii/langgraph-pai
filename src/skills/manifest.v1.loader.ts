import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  SkillManifestV1Schema,
  type LoadedSkillV1,
  type SkillManifestV1,
} from "./manifest.v1.schema.js";

function parseVersion(version: string): [number, number, number] {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    throw new Error(`Invalid version: ${version}`);
  }
  return [parts[0], parts[1], parts[2]];
}

function compareVersion(a: string, b: string): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

function satisfiesSimpleRange(version: string, range: string): boolean {
  const tokens = range
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const match = token.match(/^(>=|<=|>|<)?([0-9]+\.[0-9]+\.[0-9]+)$/);
    if (!match) {
      return false;
    }

    const operator = match[1] ?? "=";
    const target = match[2];
    const cmp = compareVersion(version, target);

    const ok =
      (operator === "=" && cmp === 0) ||
      (operator === ">" && cmp > 0) ||
      (operator === ">=" && cmp >= 0) ||
      (operator === "<" && cmp < 0) ||
      (operator === "<=" && cmp <= 0);

    if (!ok) {
      return false;
    }
  }

  return true;
}

async function loadFromDir(
  dir: string,
  source: "system" | "user",
): Promise<LoadedSkillV1[]> {
  let files: string[];

  try {
    files = await readdir(dir, { encoding: "utf8" });
  } catch {
    return [];
  }

  const skills: LoadedSkillV1[] = [];

  for (const file of files) {
    if (!file.endsWith(".manifest.json")) {
      continue;
    }

    const manifestPath = join(dir, file);
    const raw = await readFile(manifestPath, "utf-8");
    const parsed = SkillManifestV1Schema.parse(JSON.parse(raw));
    skills.push({ ...parsed, source, manifestPath });
  }

  return skills;
}

function mergeWithOverrides(system: LoadedSkillV1[], user: LoadedSkillV1[]): LoadedSkillV1[] {
  const byId = new Map<string, LoadedSkillV1>();

  for (const s of system) {
    byId.set(s.id, s);
  }

  for (const u of user) {
    if (u.overrideOf && byId.has(u.overrideOf)) {
      const base = byId.get(u.overrideOf);
      if (base) {
        byId.set(u.overrideOf, {
          ...u,
          id: base.id,
          name: base.name,
        });
        continue;
      }
    }

    byId.set(u.id, u);
  }

  return [...byId.values()].filter((s) => s.enabled);
}

function validateDependencies(skills: LoadedSkillV1[]): string[] {
  const ids = new Set(skills.map((s) => s.id));
  const errors: string[] = [];

  for (const skill of skills) {
    for (const dep of skill.dependencies) {
      if (!ids.has(dep)) {
        errors.push(`Missing dependency: ${skill.id} -> ${dep}`);
      }
    }
  }

  return errors;
}

function validateCompatibility(skills: LoadedSkillV1[], assistantCoreVersion: string): string[] {
  const errors: string[] = [];

  for (const skill of skills) {
    if (!satisfiesSimpleRange(assistantCoreVersion, skill.compatibility.assistantCore)) {
      errors.push(
        `Incompatible assistantCore for ${skill.id}: requires ${skill.compatibility.assistantCore}, current ${assistantCoreVersion}`,
      );
    }
  }

  return errors;
}

export async function loadSkillsV1(args: {
  systemDir: string;
  userDir: string;
  assistantCoreVersion: string;
}): Promise<LoadedSkillV1[]> {
  const [system, user] = await Promise.all([
    loadFromDir(args.systemDir, "system"),
    loadFromDir(args.userDir, "user"),
  ]);

  const merged = mergeWithOverrides(system, user);
  const depErrors = validateDependencies(merged);
  const compatErrors = validateCompatibility(merged, args.assistantCoreVersion);
  const allErrors = [...depErrors, ...compatErrors];

  if (allErrors.length > 0) {
    throw new Error(allErrors.join("\n"));
  }

  return merged;
}

export function formatLoadedSkillsV1(skills: LoadedSkillV1[]): string {
  if (skills.length === 0) {
    return "No skills loaded";
  }

  return skills
    .map((s) => `${s.id} ${s.version} [${s.source}] (${basename(s.manifestPath)})`)
    .join("\n");
}

export function scaffoldManifestV1(input: {
  id: string;
  name: string;
  description: string;
  useWhen: string[];
}): SkillManifestV1 {
  return {
    id: input.id,
    name: input.name,
    version: "1.0.0",
    description: input.description,
    enabled: true,
    useWhen: input.useWhen,
    requiredTools: [],
    permissions: {
      network: false,
      fileSystem: false,
      shell: false,
      allowedPaths: [],
      blockedCommands: [],
      maxToolCalls: 10,
    },
    entrypoints: {},
    dependencies: [],
    compatibility: {
      assistantCore: ">=0.1.0 <1.0.0",
    },
    overrideOf: null,
    tags: [],
  };
}
