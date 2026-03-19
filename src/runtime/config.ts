import { z } from "zod";

const ConfigSchema = z.object({
  dataRoot: z.string().default(".data"),
  maxIterations: z.number().int().positive().default(6),
  plateauLimit: z.number().int().positive().default(3),
  assistantCoreVersion: z.string().default("0.1.0"),
  systemSkillsDir: z.string().default("skills/system"),
  userSkillsDir: z.string().default("skills/user-overrides"),
  skillDocContextEnabled: z.boolean().default(true),
  skillDocMaxBytesPerSkill: z.number().int().positive().default(8000),
  skillDocIncludeSupplementalDocs: z.boolean().default(false),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  return ConfigSchema.parse({
    dataRoot: process.env.PAI_MVP_DATA_ROOT,
    maxIterations: process.env.PAI_MVP_MAX_ITERATIONS
      ? Number(process.env.PAI_MVP_MAX_ITERATIONS)
      : undefined,
    plateauLimit: process.env.PAI_MVP_PLATEAU_LIMIT
      ? Number(process.env.PAI_MVP_PLATEAU_LIMIT)
      : undefined,
    assistantCoreVersion: process.env.PAI_MVP_ASSISTANT_CORE_VERSION,
    systemSkillsDir: process.env.PAI_MVP_SYSTEM_SKILLS_DIR,
    userSkillsDir: process.env.PAI_MVP_USER_SKILLS_DIR,
    skillDocContextEnabled: process.env.PAI_MVP_SKILL_DOC_CONTEXT_ENABLED
      ? process.env.PAI_MVP_SKILL_DOC_CONTEXT_ENABLED.toLowerCase() === "true"
      : undefined,
    skillDocMaxBytesPerSkill: process.env.PAI_MVP_SKILL_DOC_MAX_BYTES_PER_SKILL
      ? Number(process.env.PAI_MVP_SKILL_DOC_MAX_BYTES_PER_SKILL)
      : undefined,
    skillDocIncludeSupplementalDocs: process.env.PAI_MVP_SKILL_DOC_INCLUDE_SUPPLEMENTAL_DOCS
      ? process.env.PAI_MVP_SKILL_DOC_INCLUDE_SUPPLEMENTAL_DOCS.toLowerCase() === "true"
      : undefined,
  });
}
