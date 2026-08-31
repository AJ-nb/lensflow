import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, onboardingStateSchema } from "./onboarding";

describe("onboarding state contract", () => {
  it("accepts a persisted five-step state", () => {
    const state = onboardingStateSchema.parse({
      schemaVersion: 1,
      mode: "active",
      completedSteps: ["asset", "analysis"],
      updatedAt: "2026-08-31T00:00:00.000Z"
    });
    expect(state.completedSteps).toEqual(ONBOARDING_STEPS.slice(0, 2));
  });

  it("rejects unknown steps and schema versions", () => {
    expect(() => onboardingStateSchema.parse({ schemaVersion: 2, mode: "active", completedSteps: [], updatedAt: "2026-08-31T00:00:00.000Z" })).toThrow();
    expect(() => onboardingStateSchema.parse({ schemaVersion: 1, mode: "active", completedSteps: ["provider"], updatedAt: "2026-08-31T00:00:00.000Z" })).toThrow();
  });
});
