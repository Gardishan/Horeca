import { describe, expect, it, vi } from "vitest";
import { demoSubscriptionTerm } from "@/lib/domain/demo-subscription";
import { renewDemoSubscription } from "../prisma/demo-subscription";

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

describe("demo subscription renewal on re-seed", () => {
  function client(renewedCount: number) {
    return {
      subscription: { updateMany: vi.fn().mockResolvedValue({ count: renewedCount }) },
      invoice: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it("renews only the seed-owned subscription, guarded against another ACTIVE one, and refreshes its invoice", async () => {
    const now = new Date(2026, 8, 24, 9);
    const db = client(1);

    const result = await renewDemoSubscription(db as never, now);

    expect(result).toEqual({ renewed: true, term: demoSubscriptionTerm(now) });
    expect(db.subscription.updateMany).toHaveBeenCalledWith({
      where: {
        id: "subscription-active",
        company: { subscriptions: { none: { id: { not: "subscription-active" }, status: "ACTIVE" } } },
      },
      data: { status: "ACTIVE", ...demoSubscriptionTerm(now) },
    });
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: { invoiceNumber: "HKZ-DEMO-0001", subscriptionId: "subscription-active" },
      data: { issuedAt: demoSubscriptionTerm(now).startsAt, dueAt: demoSubscriptionTerm(now).endsAt },
    });
  });

  it("leaves the subscription and its invoice alone when another ACTIVE subscription supersedes it", async () => {
    const db = client(0);

    const result = await renewDemoSubscription(db as never, new Date(2026, 8, 24, 9));

    expect(result.renewed).toBe(false);
    expect(db.invoice.updateMany).not.toHaveBeenCalled();
  });
});
