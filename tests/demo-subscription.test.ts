import { describe, expect, it } from "vitest";
import { demoSubscriptionTerm } from "@/lib/domain/demo-subscription";

describe("demo subscription term", () => {
  it("starts at the seed run and ends one calendar month later", () => {
    const now = new Date(2026, 8, 24, 12, 30);

    const term = demoSubscriptionTerm(now);

    expect(term.startsAt).toEqual(now);
    expect(term.endsAt).toEqual(new Date(2026, 9, 24, 12, 30));
  });

  it("is recomputed from each run, so a re-seed after expiry ends in the future again", () => {
    const firstSeed = new Date(2026, 7, 1, 9);
    const reSeed = new Date(2026, 8, 24, 9);
    expect(demoSubscriptionTerm(firstSeed).endsAt.getTime()).toBeLessThan(reSeed.getTime());

    expect(demoSubscriptionTerm(reSeed).endsAt.getTime()).toBeGreaterThan(reSeed.getTime());
  });

  it("does not mutate or share the caller's date", () => {
    const now = new Date(2026, 11, 15, 8);
    const snapshot = now.getTime();

    const term = demoSubscriptionTerm(now);

    expect(now.getTime()).toBe(snapshot);
    expect(term.startsAt).not.toBe(now);
    expect(term.endsAt).toEqual(new Date(2027, 0, 15, 8));
  });
});
