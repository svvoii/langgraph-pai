import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { SkillManifestSchema, type ResolvedSkillManifest, type SkillManifest } from "./schema.js";

async function readManifestFile(
  manifestPath: string,
  source: "system" | "user",
): Promise<ResolvedSkillManifest> {
  const raw = await readFile(manifestPath, "utf-8");
  const parsed = SkillManifestSchema.parse(JSON.parse(raw));
  return { ...parsed, source, manifestPath };
}

async function loadManifestsFromDir(
  rootDir: string,
  source: "system" | "user",
): Promise<ResolvedSkillManifest[]> {
  let dirEntries;

  try {
    dirEntries = await readdir(rootDir, { withFileTypes: true, encoding: "utf8" });
  } catch {
    return [];
  }

  const manifests: ResolvedSkillManifest[] = [];

  for (const entry of dirEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".manifest.json")) {
      continue;
    }
    const manifestPath = join(rootDir, entry.name);
    manifests.push(await readManifestFile(manifestPath, source));
  }

  return manifests;
}

function mergeByPrecedence(
  systemSkills: ResolvedSkillManifest[],
  userSkills: ResolvedSkillManifest[],
): ResolvedSkillManifest[] {
  const merged = new Map<string, ResolvedSkillManifest>();

  for (const skill of systemSkills) {
    merged.set(skill.name.toLowerCase(), skill);
  }

  for (const skill of userSkills) {
    const targetKey = (skill.overrideOf ?? skill.name).toLowerCase();
    const existing = merged.get(targetKey);

    if (existing && skill.overrideOf) {
      merged.set(targetKey, {
        ...skill,
        name: existing.name,
      });
      continue;
    }

    merged.set(targetKey, skill);
  }

  return [...merged.values()].filter((skill) => skill.enabled);
}

export async function loadResolvedSkills(paths: {
  systemSkillsDir: string;
  userSkillsDir: string;
}): Promise<ResolvedSkillManifest[]> {
  const [systemSkills, userSkills] = await Promise.all([
    loadManifestsFromDir(paths.systemSkillsDir, "system"),
    loadManifestsFromDir(paths.userSkillsDir, "user"),
  ]);

  return mergeByPrecedence(systemSkills, userSkills);
}

export async function scaffoldSkillManifest(args: {
  rootDir: string;
  name: string;
  description: string;
  useWhen: string[];
  overrideOf?: string;
}): Promise<string> {
  await mkdir(args.rootDir, { recursive: true });

  const manifest: SkillManifest = {
    name: args.name,
    description: args.description,
    useWhen: args.useWhen,
    permissions: {
      tools: [],
      network: false,
      fileSystem: false,
    },
    enabled: true,
    overrideOf: args.overrideOf,
  };

  const fileName = `${args.name.toLowerCase().replace(/\s+/g, "-")}.manifest.json`;
  const outputPath = join(args.rootDir, fileName);
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
  return outputPath;
}

export function formatSkillSummary(skills: ResolvedSkillManifest[]): string {
  if (skills.length === 0) {
    return "No skills loaded";
  }

  return skills
    .map((skill) => {
      const file = basename(skill.manifestPath);
      return `${skill.name} [${skill.source}] (${file})`;
    })
    .join("\n");
}
