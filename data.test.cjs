const test = require('node:test');
const assert = require('node:assert/strict');
const Data = require('./data.js');

function memoryStorage(initial) {
  const entries = new Map(initial ? [[Data.STORAGE_KEY, initial]] : []);
  return {
    getItem: (key) => entries.has(key) ? entries.get(key) : null,
    setItem: (key, value) => entries.set(key, value)
  };
}

function record(overrides = {}) {
  return { id: 'test-record', title: '洗牙', type: 'dental', date: '2024-02-29', nextDate: '', note: '', ...overrides };
}

test('defaults contain an editable routine and no invented health records or check-ins', () => {
  const first = Data.createDefaultState();
  const second = Data.createDefaultState();
  assert.deepEqual(first.routines.map(({ time }) => time), ['07:30', '08:00', '12:30', '18:30', '23:00']);
  assert.deepEqual(first.records, []);
  assert.deepEqual(first.checks, {});
  first.routines[0].title = 'changed';
  assert.equal(second.routines[0].title, '起床');
  assert.deepEqual(Data.validateState(second), second);
});

test('todayKey uses local calendar fields and rejects an invalid date', () => {
  assert.equal(Data.todayKey(new Date(2025, 0, 2, 0, 5)), '2025-01-02');
  assert.throws(() => Data.todayKey(new Date('invalid')), /日期/);
});

test('calendar differences work across leap day, months, years and daylight-saving boundaries', () => {
  assert.equal(Data.dateDiff('2024-03-01', '2024-02-28'), 2);
  assert.equal(Data.dateDiff('2025-01-01', '2024-12-31'), 1);
  assert.equal(Data.dateDiff('2024-03-11', '2024-03-09'), 2);
  assert.equal(Data.dateDiff('2024-11-04', '2024-11-02'), 2);
  assert.equal(Data.dateDiff('2024-01-01', '2024-01-02'), -1);
  assert.equal(Data.dateDiff('2024-01-01', '2024-01-01'), 0);
  assert.throws(() => Data.dateDiff('2025-02-29', '2025-01-01'), /有效日期/);
  assert.throws(() => Data.dateDiff('2024-13-01', '2025-01-01'), /有效日期/);
  assert.throws(() => Data.dateDiff('2024-1-01', '2025-01-01'), /格式/);
});

test('storage round-trip retains health records, next dates, notes and daily checks', () => {
  const storage = memoryStorage();
  const state = Data.loadState(storage);
  state.checks['2024-02-29'] = ['routine-wake'];
  state.records.push(record({ nextDate: '2024-08-29', note: '<script>只作为文字保存</script>' }));
  assert.deepEqual(Data.saveState(state, storage), state);
  assert.deepEqual(Data.loadState(storage), state);
});

test('validation normalizes text and strips unrelated fields without mutating inputs', () => {
  const state = Data.createDefaultState();
  state.routines[0].title = '  起床  ';
  state.unrelated = 'ignored';
  const result = Data.validateState(state);
  assert.equal(result.routines[0].title, '起床');
  assert.equal(result.unrelated, undefined);
  assert.equal(state.routines[0].title, '  起床  ');
});

test('duplicate ids, invalid categories, times and excessive fields are rejected', () => {
  const cases = [
    [(state) => state.routines.push({ ...state.routines[0] }), /重复/],
    [(state) => state.routines[0].time = '24:00', /24 小时/],
    [(state) => state.routines[0].time = '7:30', /24 小时/],
    [(state) => state.routines[0].category = 'unknown', /分类/],
    [(state) => state.routines[0].title = ' ', /填写/],
    [(state) => state.routines[0].title = '字'.repeat(81), /80/],
    [(state) => state.routines[0].note = '字'.repeat(2001), /2000/],
    [(state) => state.records.push(record(), record()), /重复/],
    [(state) => state.records.push(record({ type: 'unknown' })), /类型/],
    [(state) => state.records.push(record({ date: '2023-02-29' })), /有效日期/],
    [(state) => state.records.push(record({ date: '9999-01-01' })), /晚于今天/],
    [(state) => state.records.push(record({ nextDate: '2024-02-28' })), /早于/],
    [(state) => state.checks['2024-02-29'] = ['same', 'same'], /重复/],
    [(state) => state.checks['9999-01-01'] = [], /未来/]
  ];
  for (const [mutate, pattern] of cases) {
    const state = Data.createDefaultState();
    mutate(state);
    assert.throws(() => Data.validateState(state), pattern);
  }
});

test('history may retain a deleted routine id', () => {
  const state = Data.createDefaultState();
  state.checks['2024-02-29'] = ['deleted-routine'];
  assert.deepEqual(Data.validateState(state).checks, state.checks);
});

test('damaged and unsupported stored data is never overwritten on load', () => {
  for (const raw of ['{ broken', JSON.stringify({ version: 2 }), JSON.stringify({ ...Data.createDefaultState(), routines: null })]) {
    const storage = memoryStorage(raw);
    assert.throws(() => Data.loadState(storage), /原数据已保留/);
    assert.equal(storage.getItem(Data.STORAGE_KEY), raw);
  }
});

test('read, write and missing-storage errors are explicit', () => {
  assert.throws(() => Data.loadState(null), /本地存储/);
  assert.throws(() => Data.loadState({ getItem() { throw new Error('blocked'); }, setItem() {} }), /无法读取/);
  assert.throws(() => Data.saveState(Data.createDefaultState(), { getItem() {}, setItem() { throw new Error('quota'); } }), /尚未保存/);
});

test('invalid writes leave the previous valid state intact', () => {
  const storage = memoryStorage();
  const state = Data.createDefaultState();
  Data.saveState(state, storage);
  const before = storage.getItem(Data.STORAGE_KEY);
  state.records.push(record({ nextDate: 'not-a-date' }));
  assert.throws(() => Data.saveState(state, storage), /日期/);
  assert.equal(storage.getItem(Data.STORAGE_KEY), before);
});

test('version 1 backups without repeat settings default to daily active routines without changing the backup', () => {
  const legacy = Data.createDefaultState();
  legacy.routines.forEach(item => { delete item.days; delete item.paused; });
  legacy.checks['2024-02-29'] = ['routine-wake'];
  legacy.records.push(record());
  const raw = JSON.stringify(legacy);
  const storage = memoryStorage(raw);
  const loaded = Data.loadState(storage);
  assert.deepEqual(loaded.routines[0].days, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(loaded.routines[0].paused, false);
  assert.deepEqual(loaded.checks, legacy.checks);
  assert.deepEqual(loaded.records, legacy.records);
  assert.equal(storage.getItem(Data.STORAGE_KEY), raw);
  assert.equal(legacy.routines[0].days, undefined);
});

test('weekday schedules and pauses survive storage and never erase historical check-ins', () => {
  const storage = memoryStorage();
  const state = Data.createDefaultState();
  state.routines[0].days = [5, 1, 3];
  state.routines[0].paused = true;
  state.checks['2024-02-29'] = ['routine-wake'];
  Data.saveState(state, storage);
  const loaded = Data.loadState(storage);
  assert.deepEqual(loaded.routines[0].days, [1, 3, 5]);
  assert.equal(loaded.routines[0].paused, true);
  assert.deepEqual(loaded.checks, state.checks);
  assert.deepEqual(state.routines[0].days, [5, 1, 3]);
});

test('schedule matching uses the supplied calendar day, including Sunday and paused routines', () => {
  const routine = { days: [1, 2, 3, 4, 5], paused: false };
  assert.equal(Data.isRoutineScheduled(routine, '2026-10-23'), true);
  assert.equal(Data.isRoutineScheduled(routine, '2026-10-24'), false);
  assert.equal(Data.isRoutineScheduled({ days: [0, 6] }, '2026-10-25'), true);
  assert.equal(Data.isRoutineScheduled({ days: [0, 6], paused: true }, '2026-10-25'), false);
  assert.equal(Data.isRoutineScheduled({}, '2026-10-25'), true);
  assert.throws(() => Data.isRoutineScheduled(routine, '2026-02-30'), /有效日期/);
});

test('invalid repeat settings fail before writing and leave the saved state intact', () => {
  const storage = memoryStorage();
  Data.saveState(Data.createDefaultState(), storage);
  const raw = storage.getItem(Data.STORAGE_KEY);
  for (const days of [[], null, 'all', [1, 1], [-1], [7], [1.5], ['1']]) {
    const state = Data.createDefaultState();
    state.routines[0].days = days;
    assert.throws(() => Data.saveState(state, storage), /星期/);
    assert.equal(storage.getItem(Data.STORAGE_KEY), raw);
  }
  const state = Data.createDefaultState();
  state.routines[0].paused = 'false';
  assert.throws(() => Data.saveState(state, storage), /暂停状态/);
  assert.equal(storage.getItem(Data.STORAGE_KEY), raw);
});
