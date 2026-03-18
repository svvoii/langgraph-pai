import { z } from "zod";

const ConfigSchema = z.object({
  dataRoot: z.string().default(".data"),
  maxIterations: z.number().int().positive().default(6),
  plateauLimit: z.number().int().positive().default(3),
  systemSkillsDir: z.string().default("skills/system"),
  userSkillsDir: z.string().default("skills/user-overrides"),
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
    systemSkillsDir: process.env.PAI_MVP_SYSTEM_SKILLS_DIR,
    userSkillsDir: process.env.PAI_MVP_USER_SKILLS_DIR,
  });
}
