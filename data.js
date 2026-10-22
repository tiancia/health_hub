(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HealthData = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORAGE_KEY = 'shiyi-health-v1';
  const ROUTINE_CATEGORIES = ['morning', 'meal', 'rest', 'move', 'focus', 'other'];
  const RECORD_TYPES = ['dental', 'checkup', 'vaccine', 'other'];
  const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
  const MAX_BYTES = 5 * 1024 * 1024;

  function fail(message) {
    throw new Error(message);
  }

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function dateValue(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      fail((label || '日期') + '格式不正确。');
    }
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      fail((label || '日期') + '不是有效日期。');
    }
    return date.getTime();
  }

  function todayKey(date) {
    const current = date === undefined ? new Date() : date;
    if (!(current instanceof Date) || !Number.isFinite(current.getTime())) {
      fail('无法读取当前日期。');
    }
    return String(current.getFullYear()).padStart(4, '0') + '-' +
      String(current.getMonth() + 1).padStart(2, '0') + '-' +
      String(current.getDate()).padStart(2, '0');
  }

  function dateDiff(target, from) {
    return Math.round((dateValue(target) - dateValue(from === undefined ? todayKey() : from)) / 86400000);
  }

  function isRoutineScheduled(routine, key = todayKey()) {
    const weekday = new Date(dateValue(key)).getUTCDay();
    return !routine.paused && (routine.days || EVERY_DAY).includes(weekday);
  }

  function createDefaultState() {
    return {
      version: 1,
      routines: [
        { id: 'routine-wake', title: '起床', time: '07:30', category: 'morning', note: '' },
        { id: 'routine-breakfast', title: '早餐', time: '08:00', category: 'meal', note: '' },
        { id: 'routine-noon', title: '午间休息', time: '12:30', category: 'rest', note: '' },
        { id: 'routine-move', title: '轻松活动', time: '18:30', category: 'move', note: '' },
        { id: 'routine-sleep', title: '准备休息', time: '23:00', category: 'rest', note: '' }
      ].map(item => ({ ...item, days: [...EVERY_DAY], paused: false })),
      checks: {},
      records: []
    };
  }

  function textValue(value, label, maxLength, allowEmpty) {
    if (typeof value !== 'string') fail(label + '必须是文字。');
    const normalized = value.trim();
    if (!allowEmpty && !normalized) fail('请填写' + label + '。');
    if (normalized.length > maxLength) fail(label + '不能超过 ' + maxLength + ' 个字符。');
    return normalized;
  }

  function idValue(value) {
    return textValue(value, '记录标识', 100, false);
  }

  function validateState(value) {
    if (!isObject(value) || value.version !== 1) fail('数据版本不支持，请使用本项目导出的备份。');
    if (!Array.isArray(value.routines) || value.routines.length > 1000) fail('作息数据不正确，最多支持 1000 项。');
    if (!Array.isArray(value.records) || value.records.length > 10000) fail('健康记录不正确，最多支持 10000 条。');
    if (!isObject(value.checks) || Object.keys(value.checks).length > 3660) fail('打卡数据不正确，最多支持约 10 年的记录。');

    const routineIds = new Set();
    const routines = value.routines.map(function (item) {
      if (!isObject(item)) fail('作息数据不正确。');
      const id = idValue(item.id);
      if (routineIds.has(id)) fail('作息标识重复，请检查备份。');
      routineIds.add(id);
      if (typeof item.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time)) fail('作息时间必须为有效的 24 小时时间。');
      if (!ROUTINE_CATEGORIES.includes(item.category)) fail('作息分类不正确。');
      const days = item.days === undefined ? [...EVERY_DAY] : item.days;
      if (!Array.isArray(days) || !days.length || days.length > 7 ||
          days.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(days).size !== days.length) {
        fail('请至少选择一天，重复星期必须为不重复的有效星期。');
      }
      if (item.paused !== undefined && typeof item.paused !== 'boolean') fail('作息暂停状态不正确。');
      return {
        id: id,
        title: textValue(item.title, '作息名称', 80, false),
        time: item.time,
        category: item.category,
        note: textValue(item.note, '备注', 2000, true),
        days: [...days].sort((a, b) => a - b),
        paused: item.paused === true
      };
    });

    const currentDate = todayKey();
    const checks = {};
    Object.keys(value.checks).forEach(function (day) {
      dateValue(day, '打卡日期');
      if (day > currentDate) fail('不能保存未来的打卡记录。');
      const ids = value.checks[day];
      if (!Array.isArray(ids) || ids.length > 1000) fail('单日打卡数据不正确。');
      const normalized = ids.map(idValue);
      if (new Set(normalized).size !== normalized.length) fail('同一天的打卡记录重复。');
      checks[day] = normalized;
    });

    const recordIds = new Set();
    const records = value.records.map(function (item) {
      if (!isObject(item)) fail('健康记录不正确。');
      const id = idValue(item.id);
      if (recordIds.has(id)) fail('健康记录标识重复，请检查备份。');
      recordIds.add(id);
      if (!RECORD_TYPES.includes(item.type)) fail('健康记录类型不正确。');
      dateValue(item.date, '完成日期');
      if (item.date > currentDate) fail('完成日期不能晚于今天。');
      if (typeof item.nextDate !== 'string') fail('下次日期格式不正确。');
      if (item.nextDate) {
        dateValue(item.nextDate, '下次日期');
        if (item.nextDate < item.date) fail('下次日期不能早于本次完成日期。');
      }
      return {
        id: id,
        title: textValue(item.title, '健康事项名称', 80, false),
        type: item.type,
        date: item.date,
        nextDate: item.nextDate,
        note: textValue(item.note, '备注', 2000, true)
      };
    });

    return { version: 1, routines: routines, checks: checks, records: records };
  }

  function getStorage(storage) {
    try {
      const target = storage === undefined ? globalThis.localStorage : storage;
      if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') fail('当前浏览器无法使用本地存储。');
      return target;
    } catch (_) {
      fail('当前浏览器无法使用本地存储，请检查浏览器隐私设置。');
    }
  }

  function loadState(storage) {
    const target = getStorage(storage);
    let saved;
    try {
      saved = target.getItem(STORAGE_KEY);
    } catch (_) {
      fail('无法读取本地数据，请检查浏览器隐私设置。');
    }
    if (saved === null) return createDefaultState();
    if (typeof saved !== 'string' || saved.length > MAX_BYTES) fail('本地数据格式或大小不正确，原数据已保留。');
    let parsed;
    try {
      parsed = JSON.parse(saved);
    } catch (_) {
      fail('本地数据无法解析，原数据已保留。请先导出原始数据再处理。');
    }
    try {
      return validateState(parsed);
    } catch (error) {
      fail('本地数据未通过检查，原数据已保留。' + error.message);
    }
  }

  function saveState(state, storage) {
    const normalized = validateState(state);
    const serialized = JSON.stringify(normalized);
    if (new TextEncoder().encode(serialized).length > MAX_BYTES) fail('本地数据已超过 5 MB，请先导出备份并精简记录。');
    const target = getStorage(storage);
    try {
      target.setItem(STORAGE_KEY, serialized);
    } catch (_) {
      fail('保存失败，本地存储可能已满或被浏览器禁用。此次更改尚未保存。');
    }
    return normalized;
  }

  return Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    ROUTINE_CATEGORIES: Object.freeze(ROUTINE_CATEGORIES),
    RECORD_TYPES: Object.freeze(RECORD_TYPES),
    todayKey: todayKey,
    dateDiff: dateDiff,
    isRoutineScheduled: isRoutineScheduled,
    createDefaultState: createDefaultState,
    validateState: validateState,
    loadState: loadState,
    saveState: saveState
  });
});
