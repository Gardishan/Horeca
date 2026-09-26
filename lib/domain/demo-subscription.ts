/**
 * Срок demo-подписки из seed: один календарный месяц от момента запуска seed.
 * Срок пересчитывается при каждом запуске, поэтому повторный seed после
 * истечения снова даёт подписку, действующую в будущем.
 */
export function demoSubscriptionTerm(now: Date): { startsAt: Date; endsAt: Date } {
  const endsAt = new Date(now);
  endsAt.setMonth(endsAt.getMonth() + 1);
  return { startsAt: new Date(now), endsAt };
}
