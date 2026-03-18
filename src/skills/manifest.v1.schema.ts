import { z } from "zod";

const SemverPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const SemverRangePattern = /^(>=|<=|>|<)?\s*[0-9]+\.[0-9]+\.[0-9]+(\s+(<|<=|>|>=)\s*[0-9]+\.[0-9]+\.[0-9]+)?$/;

export const SkillManifestV1Schema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  version: z.string().regex(SemverPattern),
  description: z.string().min(1),
  enabled: z.boolean().default(true),
  useWhen: z.array(z.string().min(1)).min(1),
  requiredTools: z.array(z.string().min(1)).default([]),
  permissions: z.object({
    network: z.boolean().default(false),
    fileSystem: z.boolean().default(false),
    shell: z.boolean().default(false),
    allowedPaths: z.array(z.string().min(1)).default([]),
    blockedCommands: z.array(z.string().min(1)).default([]),
    maxToolCalls: z.number().int().positive().default(10),
  }),
  entrypoints: z
    .object({
      plannerPrompt: z.string().optional(),
      executorPrompt: z.string().optional(),
      workflowModule: z.string().optional(),
    })
    .default({}),
  dependencies: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  compatibility: z.object({
    assistantCore: z.string().regex(SemverRangePattern),
  }),
  overrideOf: z.string().regex(/^[a-z0-9-]+$/).nullable().default(null),
  tags: z.array(z.string()).default([]),
});

export type SkillManifestV1 = z.infer<typeof SkillManifestV1Schema>;

export type LoadedSkillV1 = SkillManifestV1 & {
  source: "system" | "user";
  manifestPath: string;
};
