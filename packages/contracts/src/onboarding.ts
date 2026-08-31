import { z } from "zod";

export const ONBOARDING_STEPS = ["asset", "analysis", "composition", "preflight", "result"] as const;
export const onboardingStepSchema = z.enum(ONBOARDING_STEPS);
export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

export const onboardingStateSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["active", "skipped", "disabled", "completed"]),
  completedSteps: z.array(onboardingStepSchema).max(ONBOARDING_STEPS.length),
  updatedAt: z.string().datetime()
});
export type OnboardingState = z.infer<typeof onboardingStateSchema>;
