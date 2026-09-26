import type { PrismaClient } from "@prisma/client";
import { demoSubscriptionTerm } from "../lib/domain/demo-subscription";

const DEMO_SUBSCRIPTION_ID = "subscription-active";
const DEMO_SUBSCRIPTION_INVOICE_NUMBER = "HKZ-DEMO-0001";

type RenewalClient = Pick<PrismaClient, "subscription" | "invoice">;

/**
 * Renews the seed-owned demo subscription and its invoice dates on every
 * db:seed, so the demo supplier does not drop out of the public catalog a
 * month after the first seed. It leaves the subscription alone when the
 * company already has another ACTIVE subscription (a tester renewal through
 * billing), so a re-seed never creates a second ACTIVE subscription.
 */
export async function renewDemoSubscription(client: RenewalClient, now: Date) {
  const term = demoSubscriptionTerm(now);
  const renewal = await client.subscription.updateMany({
    where: {
      id: DEMO_SUBSCRIPTION_ID,
      company: { subscriptions: { none: { id: { not: DEMO_SUBSCRIPTION_ID }, status: "ACTIVE" } } },
    },
    data: { status: "ACTIVE", ...term },
  });
  if (renewal.count !== 1) return { renewed: false, term };
  await client.invoice.updateMany({
    where: { invoiceNumber: DEMO_SUBSCRIPTION_INVOICE_NUMBER, subscriptionId: DEMO_SUBSCRIPTION_ID },
    data: { issuedAt: term.startsAt, dueAt: term.endsAt },
  });
  return { renewed: true, term };
}
