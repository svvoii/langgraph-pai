import { loadResolvedSkills } from "./loader.js";
import type { ResolvedSkillManifest } from "./schema.js";

export class SkillRegistry {
  constructor(private readonly skills: ResolvedSkillManifest[]) {}

  static async fromDisk(paths: {
    systemSkillsDir: string;
    userSkillsDir: string;
  }): Promise<SkillRegistry> {
    const skills = await loadResolvedSkills(paths);
    return new SkillRegistry(skills);
  }

  route(request: string): ResolvedSkillManifest[] {
    const lowered = request.toLowerCase();
    return this.skills.filter((skill) =>
      skill.useWhen.some((token) => lowered.includes(token.toLowerCase())),
    );
  }

  all(): ResolvedSkillManifest[] {
    return [...this.skills];
  }
}

export type { ResolvedSkillManifest } from "./schema.js";
export { formatSkillSummary } from "./loader.js";
