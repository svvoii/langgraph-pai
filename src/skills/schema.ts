import { z } from "zod";

export const SkillManifestSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  useWhen: z.array(z.string().min(1)).min(1),
  permissions: z
    .object({
      tools: z.array(z.string().min(1)).default([]),
      network: z.boolean().default(false),
      fileSystem: z.boolean().default(false),
    })
    .default({ tools: [], network: false, fileSystem: false }),
  entrypoints: z
    .object({
      workflow: z.string().optional(),
      template: z.string().optional(),
      tools: z.array(z.string()).optional(),
    })
    .optional(),
  enabled: z.boolean().default(true),
  overrideOf: z.string().optional(),
});

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

export type ResolvedSkillManifest = SkillManifest & {
  source: "system" | "user";
  manifestPath: string;
};
