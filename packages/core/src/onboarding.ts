import {
  ONBOARDING_STEPS,
  onboardingStateSchema,
  type OnboardingState,
  type OnboardingStep
} from "@lensflow/contracts";

export function createOnboardingState(now = new Date().toISOString()): OnboardingState {
  return { schemaVersion: 1, mode: "active", completedSteps: [], updatedAt: now };
}

export function parseOnboardingState(value: unknown, now = new Date().toISOString()): OnboardingState {
  const parsed = onboardingStateSchema.safeParse(value);
  return parsed.success ? parsed.data : createOnboardingState(now);
}

export function completeOnboardingStep(state: OnboardingState, step: OnboardingStep, now = new Date().toISOString()): OnboardingState {
  const completedSteps = ONBOARDING_STEPS.filter((candidate) => state.completedSteps.includes(candidate) || candidate === step);
  return {
    ...state,
    mode: completedSteps.length === ONBOARDING_STEPS.length ? "completed" : state.mode,
    completedSteps,
    updatedAt: now
  };
}

export function setOnboardingMode(state: OnboardingState, mode: OnboardingState["mode"], now = new Date().toISOString()): OnboardingState {
  return { ...state, mode, updatedAt: now };
}
