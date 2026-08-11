import { z } from "zod";

export const settingsFormSchema = z.object({
  scanDepth: z.coerce.number().int().min(1).max(10),
  concurrency: z.coerce.number().int().min(1).max(16),
});

export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
