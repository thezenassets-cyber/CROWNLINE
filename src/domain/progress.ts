export interface MilestoneDefinition {
  code: string;
  label: string;
  explanation: string;
  customerAction: string | null;
  progressPercent: number;
  sortOrder: number;
  internationalOnly: boolean;
}

export interface ProgressEvent {
  category: 'milestone' | 'exception' | 'info';
  milestoneCode: string | null;
  occurredAt: Date;
  voided: boolean;
}

export interface ShipmentProgressState {
  currentMilestone: string | null;
  progressPercent: number;
  lastEventAt: Date | null;
  deliveredAt: Date | null;
  /** True when a milestone was recorded with an earlier timestamp than a lower milestone. */
  hasOutOfOrderEvents: boolean;
}

export const DELIVERED_MILESTONE = 'delivered';

export type ProgressTone = 'red' | 'yellow' | 'green';

/**
 * Colour of the customer and staff progress bar.
 * 0–24 early (collection / origin), 25–74 in transit, 75–100 near destination or delivered.
 */
export function progressTone(percent: number): ProgressTone {
  const n = Number(percent);
  if (!Number.isFinite(n) || n < 25) return 'red';
  if (n < 75) return 'yellow';
  return 'green';
}

/**
 * Derives a shipment's progress from its event history. Progress is the highest
 * milestone reached by any non-voided event, so events arriving out of order cannot
 * make progress regress. Only voiding (an explicit, audited correction) can lower it.
 * Exceptions and informational events never change the percentage.
 */
export function computeProgress(defs: readonly MilestoneDefinition[], events: readonly ProgressEvent[]): ShipmentProgressState {
  const byCode = new Map(defs.map((d) => [d.code, d]));
  const live = events.filter((e) => !e.voided);

  let best: MilestoneDefinition | null = null;
  let deliveredAt: Date | null = null;
  let lastEventAt: Date | null = null;

  for (const e of live) {
    if (!lastEventAt || e.occurredAt > lastEventAt) lastEventAt = e.occurredAt;
    if (e.category !== 'milestone' || !e.milestoneCode) continue;
    const def = byCode.get(e.milestoneCode);
    if (!def) continue;
    if (!best || def.sortOrder > best.sortOrder) best = def;
    if (def.code === DELIVERED_MILESTONE && (!deliveredAt || e.occurredAt < deliveredAt)) deliveredAt = e.occurredAt;
  }

  const milestoneEvents = live
    .filter((e) => e.category === 'milestone' && e.milestoneCode && byCode.has(e.milestoneCode))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let maxOrder = -Infinity;
  let hasOutOfOrderEvents = false;
  for (const e of milestoneEvents) {
    const order = byCode.get(e.milestoneCode!)!.sortOrder;
    if (order < maxOrder) hasOutOfOrderEvents = true;
    maxOrder = Math.max(maxOrder, order);
  }

  let progressPercent = best?.progressPercent ?? 0;
  // 100% is reserved for a recorded delivery confirmation.
  if (best?.code !== DELIVERED_MILESTONE) progressPercent = Math.min(progressPercent, 99);

  return { currentMilestone: best?.code ?? null, progressPercent, lastEventAt, deliveredAt, hasOutOfOrderEvents };
}

/**
 * The percentage a customer sees. A coordinator may set it directly.
 * Delivery still forces 100%, and a coordinator cannot show 100% before delivery is confirmed.
 */
export function customerProgress(
  milestonePercent: number,
  displayProgress: number | null,
  delivered: boolean,
): { percent: number; source: 'milestone' | 'coordinator' } {
  if (delivered) return { percent: 100, source: 'milestone' };
  if (displayProgress === null || !Number.isInteger(displayProgress) || displayProgress < 0 || displayProgress > 99) {
    return { percent: milestonePercent, source: 'milestone' };
  }
  return { percent: displayProgress, source: 'coordinator' };
}

export interface MilestoneStep extends MilestoneDefinition {
  /**
   * recorded: an event confirms this milestone.
   * passed_unconfirmed: a later milestone was recorded but this one was not reported.
   * pending: not reached yet.
   */
  state: 'recorded' | 'passed_unconfirmed' | 'pending';
  reachedAt: Date | null;
  isCurrent: boolean;
}

/** Milestones relevant to a route (international-only steps hidden for domestic shipments). */
export function milestoneSteps(
  defs: readonly MilestoneDefinition[],
  events: readonly ProgressEvent[],
  isInternational: boolean,
  currentMilestone: string | null,
): MilestoneStep[] {
  const current = defs.find((d) => d.code === currentMilestone);
  const firstReached = new Map<string, Date>();
  for (const e of events) {
    if (e.voided || e.category !== 'milestone' || !e.milestoneCode) continue;
    const prev = firstReached.get(e.milestoneCode);
    if (!prev || e.occurredAt < prev) firstReached.set(e.milestoneCode, e.occurredAt);
  }
  return defs
    .filter((d) => isInternational || !d.internationalOnly)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => {
      const reachedAt = firstReached.get(d.code) ?? null;
      const state: MilestoneStep['state'] = reachedAt
        ? 'recorded'
        : current && d.sortOrder < current.sortOrder
          ? 'passed_unconfirmed'
          : 'pending';
      return { ...d, state, reachedAt, isCurrent: d.code === currentMilestone };
    });
}
