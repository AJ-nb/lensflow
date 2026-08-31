import { describe, expect, it } from "vitest";
import { completeOnboardingStep, createOnboardingState, parseOnboardingState, setOnboardingMode } from "./onboarding";

const now = "2026-08-31T00:00:00.000Z";

describe("onboarding progress", () => {
  it("records real events once and completes after all five", () => {
    let state = createOnboardingState(now);
    for (const step of ["result", "asset", "analysis", "composition", "preflight", "result"] as const) {
      state = completeOnboardingStep(state, step, now);
    }
    expect(state.completedSteps).toEqual(["asset", "analysis", "composition", "preflight", "result"]);
    expect(state.mode).toBe("completed");
  });

  it("preserves progress across skip, disable and restore", () => {
    const progressed = completeOnboardingStep(createOnboardingState(now), "asset", now);
    expect(setOnboardingMode(progressed, "skipped", now).completedSteps).toEqual(["asset"]);
    expect(setOnboardingMode(progressed, "disabled", now).completedSteps).toEqual(["asset"]);
    expect(setOnboardingMode(progressed, "active", now)).toMatchObject({ mode: "active", completedSteps: ["asset"] });
  });

  it("recovers damaged local state", () => {
    expect(parseOnboardingState({ mode: "active" }, now)).toEqual(createOnboardingState(now));
  });
});
