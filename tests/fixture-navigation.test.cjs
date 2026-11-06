const test = require('node:test');
const assert = require('node:assert/strict');
const {navigationState, dateLabel} = require('../fixture-slider.js');
const now = Date.parse('2026-11-06T12:00:00Z');
const rounds = [
    {value: 0, label: 'Round 19', date: '2026-10-30', endDate: '2026-11-01'},
    {value: 1, label: 'Round 20', date: '2026-11-06', endDate: '2026-11-08'},
    {value: 2, label: 'Round 21', date: '2026-11-20', endDate: '2026-11-22'}
];

test('a current weekend remains the jump target until its published end date', () => {
    const state = navigationState(rounds, 0, {now: Date.parse('2026-11-07T10:00:00Z'), unit: 'weekends'});
    assert.equal(state.currentValue, 1);
    assert.equal(state.jumpLabel, 'Current weekend');
    assert.equal(state.canJump, true);
    assert.equal(state.positionLabel, '1 of 3 weekends');
    assert.equal(state.dateLabel, '30 Oct – 1 Nov');
});
test('between weekends the next published event is preferred over a completed event', () => {
    const state = navigationState(rounds, 0, {now: Date.parse('2026-11-12T00:00:00Z')});
    assert.equal(state.currentValue, 2);
    assert.equal(state.jumpLabel, 'Next round');
});
test('a finished season offers its latest dated round without changing the selected value', () => {
    const entries = structuredClone(rounds);
    const state = navigationState(entries, 0, {now: Date.parse('2026-12-01T00:00:00Z')});
    assert.equal(state.currentValue, 2);
    assert.equal(state.jumpLabel, 'Latest round');
    assert.equal(state.selectedIndex, 0);
    assert.deepEqual(entries, rounds);
});
test('an explicit current selection follows the league logic even when another date is nearer', () => {
    const state = navigationState(rounds, 2, {now, currentValue: 0, currentLabel: 'Latest round'});
    assert.equal(state.currentValue, 0);
    assert.equal(state.jumpLabel, 'Latest round');
    assert.equal(state.canJump, true);
    assert.equal(navigationState(rounds, 0, {now, currentValue: 0}).canJump, false);
});
test('an arbitrary first-render or deep-linked selection is never treated as current without evidence', () => {
    const entries = [{value: 25, label: 'Finals Week 1'}, {value: 26, label: 'Finals Week 2'}];
    const state = navigationState(entries, 25, {now});
    assert.equal(state.currentValue, null);
    assert.equal(state.canJump, false);
    assert.equal(navigationState(entries, 25, {now, currentValue: 26}).currentValue, 26);
});
test('date-only event windows follow the Sydney date at the UTC day boundary', () => {
    const state = navigationState(rounds, 0, {now: Date.parse('2026-11-05T14:00:00Z')});
    assert.equal(state.currentValue, 1);
    assert.equal(state.jumpLabel, 'Current round');
});
test('missing, invalid and empty dates cannot create a false jump target or crash navigation', () => {
    const entries = [{value: 0, label: 'Week 1', date: '2026-99-99'}, {value: 1, label: 'Week 2', date: null}];
    assert.equal(navigationState(entries, 0, {now}).currentValue, null);
    assert.equal(dateLabel(entries[0], now), '');
    assert.equal(dateLabel({date: '2026-02-30'}, now), '');
    assert.equal(navigationState([], 0, {now}).positionLabel, '');
    assert.equal(navigationState([], 0, {now}).canJump, false);
});
test('short date ranges retain month and year context for a future season', () => {
    assert.equal(dateLabel({date: '2026-11-06', endDate: '2026-11-08'}, now), '6–8 Nov');
    assert.equal(dateLabel({date: '2027-11-06', endDate: '2027-11-08'}, now), '6–8 Nov 2027');
    assert.equal(dateLabel({date: '2026-12-31', endDate: '2027-01-02'}, now), '31 Dec 2026 – 2 Jan 2027');
});
