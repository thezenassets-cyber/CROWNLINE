import type { Queryable } from '../db/index.ts';
import type { MilestoneDefinition } from '../domain/progress.ts';

export async function loadMilestones(q: Queryable): Promise<MilestoneDefinition[]> {
  const rows = (
    await q.query<{
      code: string; label: string; explanation: string; customer_action: string | null;
      progress_percent: number; sort_order: number; international_only: boolean;
    }>(
      `select code, label, explanation, customer_action, progress_percent, sort_order, international_only
       from milestone_definitions where active order by sort_order`,
    )
  ).rows;
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    explanation: r.explanation,
    customerAction: r.customer_action,
    progressPercent: r.progress_percent,
    sortOrder: r.sort_order,
    internationalOnly: r.international_only,
  }));
}
