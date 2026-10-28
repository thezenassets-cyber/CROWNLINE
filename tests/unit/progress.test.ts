import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeProgress, customerProgress, milestoneSteps, type MilestoneDefinition, type ProgressEvent } from '../../src/domain/progress.ts';

const defs: MilestoneDefinition[] = [
  ['booking_confirmed', 5, 10, false],
  ['collected', 15, 20, false],
  ['received_origin_facility', 25, 30, false],
  ['export_processing', 35, 40, true],
  ['departed_origin', 45, 50, true],
  ['international_transit', 60, 60, true],
  ['arrived_destination_country', 75, 70, true],
  ['customs_released', 85, 80, true],
  ['out_for_delivery', 95, 90, false],
  ['delivered', 100, 100, false],
].map(([code, pct, order, intl]) => ({
  code: code as string,
  label: code as string,
  explanation: '',
  customerAction: null,
  progressPercent: pct as number,
  sortOrder: order as number,
  internationalOnly: intl as boolean,
}));

const t = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
const m = (code: string, h: number, voided = false): ProgressEvent => ({ category: 'milestone', milestoneCode: code, occurredAt: t(h), voided });

test('no events means no progress', () => {
  const s = computeProgress(defs, []);
  assert.equal(s.progressPercent, 0);
  assert.equal(s.currentMilestone, null);
  assert.equal(s.lastEventAt, null);
});

test('progress follows the highest milestone and never regresses on late events', () => {
  const s = computeProgress(defs, [m('booking_confirmed', 1), m('departed_origin', 5), m('collected', 2)]);
  assert.equal(s.currentMilestone, 'departed_origin');
  assert.equal(s.progressPercent, 45);
  assert.equal(s.hasOutOfOrderEvents, false);

  const late = computeProgress(defs, [m('out_for_delivery', 1), m('collected', 3)]);
  assert.equal(late.progressPercent, 95);
  assert.equal(late.hasOutOfOrderEvents, true);
});

test('voided events are excluded (explicit correction)', () => {
  const s = computeProgress(defs, [m('collected', 1), m('out_for_delivery', 2, true)]);
  assert.equal(s.currentMilestone, 'collected');
  assert.equal(s.progressPercent, 15);
});

test('exceptions and info events never change the percentage', () => {
  const s = computeProgress(defs, [
    m('collected', 1),
    { category: 'exception', milestoneCode: null, occurredAt: t(5), voided: false },
    { category: 'info', milestoneCode: null, occurredAt: t(6), voided: false },
  ]);
  assert.equal(s.progressPercent, 15);
  assert.deepEqual(s.lastEventAt, t(6));
});

test('100% only with a delivery confirmation', () => {
  const nearly = computeProgress(defs, [m('out_for_delivery', 1)]);
  assert.equal(nearly.progressPercent, 95);
  assert.equal(nearly.deliveredAt, null);

  const done = computeProgress(defs, [m('out_for_delivery', 1), m('delivered', 2)]);
  assert.equal(done.progressPercent, 100);
  assert.deepEqual(done.deliveredAt, t(2));

  const capped = computeProgress([...defs.filter((d) => d.code !== 'delivered'), { ...defs[8]!, code: 'x', progressPercent: 100, sortOrder: 95 }], [m('x', 1)]);
  assert.equal(capped.progressPercent, 99);
});

test('domestic routes hide international milestones and flag unconfirmed steps', () => {
  const events = [m('booking_confirmed', 1), m('out_for_delivery', 4)];
  const state = computeProgress(defs, events);
  const steps = milestoneSteps(defs, events, false, state.currentMilestone);
  assert.deepEqual(
    steps.map((s) => s.code),
    ['booking_confirmed', 'collected', 'received_origin_facility', 'out_for_delivery', 'delivered'],
  );
  assert.equal(steps[0]!.state, 'recorded');
  assert.equal(steps[1]!.state, 'passed_unconfirmed');
  assert.equal(steps[3]!.state, 'recorded');
  assert.equal(steps[3]!.isCurrent, true);
  assert.equal(steps[4]!.state, 'pending');
  assert.equal(milestoneSteps(defs, events, true, state.currentMilestone).length, 10);
});

test('the customer percentage follows a coordinator figure until delivery', () => {
  assert.deepEqual(customerProgress(45, null, false), { percent: 45, source: 'milestone' });
  assert.deepEqual(customerProgress(45, 40, false), { percent: 40, source: 'coordinator' });
  assert.deepEqual(customerProgress(45, 0, false), { percent: 0, source: 'coordinator' });
  assert.deepEqual(customerProgress(45, 100, false), { percent: 45, source: 'milestone' });
  assert.deepEqual(customerProgress(45, 12.5, false), { percent: 45, source: 'milestone' });
  assert.deepEqual(customerProgress(95, 40, true), { percent: 100, source: 'milestone' });
});
