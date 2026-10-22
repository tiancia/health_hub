(() => {
  'use strict';

  const Data = window.HealthData;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const categories = {
    morning: { label: '晨间', icon: 'sun' }, meal: { label: '饮食', icon: 'meal' },
    move: { label: '活动', icon: 'move' }, rest: { label: '休息', icon: 'moon' },
    focus: { label: '专注', icon: 'clock' }, other: { label: '其他', icon: 'leaf' }
  };
  const recordTypes = {
    dental: { label: '口腔', icon: 'tooth', title: '洗牙' },
    checkup: { label: '体检', icon: 'checkup', title: '体检' },
    vaccine: { label: '疫苗', icon: 'heart', title: '接种疫苗' },
    other: { label: '其他', icon: 'heart', title: '' }
  };
  let state = null;
  let day = Data.todayKey();
  let toastTimer;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  function actionButton(action, label, iconName, id, className = 'icon-button') {
    const button = element('button', className, iconName ? undefined : label);
    button.type = 'button';
    button.dataset.action = action;
    if (id) button.dataset.id = id;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (iconName) button.append(icon(iconName));
    return button;
  }

  function emptyState(title, description, action, label, type) {
    const node = element('div', 'empty-state');
    node.append(icon('leaf'), element('h3', '', title), element('p', '', description));
    if (action) {
      const button = actionButton(action, label, null, null, 'button secondary');
      if (type) button.dataset.type = type;
      node.append(button);
    }
    return node;
  }

  function formatDate(key, includeYear = true) {
    if (!key) return '尚未记录';
    const [year, month, date] = key.split('-').map(Number);
    return (includeYear ? year + ' 年 ' : '') + month + ' 月 ' + date + ' 日';
  }

  function dateStatus(key) {
    const diff = Data.dateDiff(key, day);
    if (diff < 0) return { text: '已到期 ' + Math.abs(diff) + ' 天', className: 'due' };
    if (diff === 0) return { text: '就是今天', className: 'due' };
    return { text: diff + ' 天后', className: diff <= 30 ? 'soon' : 'future' };
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function storageError(message) {
    const banner = $('#storage-error');
    banner.textContent = message + ' 原始内容不会被覆盖。你可以导出原始数据，或导入一份有效备份。';
    banner.hidden = false;
    $('#save-status').classList.add('has-error');
    $('#save-status').lastChild.textContent = '数据待处理';
  }

  function load() {
    try {
      state = Data.loadState();
      $('#storage-error').hidden = true;
      $('#save-status').classList.remove('has-error');
      $('#save-status').lastChild.textContent = '本机保存';
    } catch (error) {
      state = null;
      storageError(error.message);
    }
    render();
  }

  async function persist(mutator, message, form, replace = false) {
    const write = () => {
      const current = replace ? null : Data.loadState();
      const candidate = mutator(current);
      state = Data.saveState(candidate);
    };
    try {
      if (navigator.locks) await navigator.locks.request(Data.STORAGE_KEY, write);
      else write();
      $('#storage-error').hidden = true;
      $('#save-status').classList.remove('has-error');
      $('#save-status').lastChild.textContent = '已保存到本机';
      render();
      showToast(message);
      return true;
    } catch (error) {
      if (form) $('.form-error', form).textContent = error.message;
      else showToast(error.message);
      return false;
    }
  }

  function routineRow(routine, plan = false) {
    const done = (state.checks[day] || []).includes(routine.id);
    const category = categories[routine.category];
    const row = element('div', 'routine-row' + (done && !plan ? ' is-done' : ''));
    const time = element('time', 'routine-time', routine.time);
    time.dateTime = routine.time;
    const marker = element('div', 'category-icon ' + routine.category);
    marker.append(icon(category.icon));
    const body = element('div', 'routine-body');
    body.append(element('h3', '', routine.title));
    if (routine.note) body.append(element('p', '', routine.note));
    row.append(time, marker, body);
    if (plan) {
      row.append(element('span', 'routine-category', category.label));
      const actions = element('div', 'row-actions');
      actions.append(actionButton('edit-routine', '编辑' + routine.title, 'edit', routine.id), actionButton('delete-routine', '删除' + routine.title, 'trash', routine.id));
      row.append(actions);
    } else {
      const check = actionButton('toggle-routine', (done ? '取消打卡：' : '完成：') + routine.title, done ? 'check' : null, routine.id, 'check-button' + (done ? ' is-done' : ''));
      if (!done) check.textContent = '';
      check.setAttribute('aria-pressed', String(done));
      row.append(check);
    }
    return row;
  }

  function renderRoutines() {
    const routines = [...state.routines].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title, 'zh-CN'));
    const todayList = $('#today-routines');
    const planList = $('#plan-routines');
    todayList.replaceChildren(...routines.map(item => routineRow(item)));
    planList.replaceChildren(...routines.map(item => routineRow(item, true)));
    if (!routines.length) {
      todayList.append(emptyState('从一件小事开始', '添一条你想坚持的作息，安排今天的节奏。', 'add-routine', '添加第一条作息'));
      planList.append(emptyState('一天，由你来安排', '起床、用餐、活动和休息，都可以记在这里。', 'add-routine', '添加第一条作息'));
    }
    $('#routine-count').textContent = routines.length + ' 项作息';
    const checked = new Set(state.checks[day] || []);
    const completed = routines.filter(item => checked.has(item.id)).length;
    const percent = routines.length ? Math.round(completed / routines.length * 100) : 0;
    $('#progress-number').replaceChildren(document.createTextNode(String(percent)), element('span', '', '%'));
    $('#progress-caption').textContent = completed + ' / ' + routines.length + ' 项';
    $('#progress-circle').style.strokeDashoffset = String(264 * (1 - percent / 100));

    const clock = new Date();
    const now = String(clock.getHours()).padStart(2, '0') + ':' + String(clock.getMinutes()).padStart(2, '0');
    const next = routines.find(item => !checked.has(item.id) && item.time >= now);
    const pending = routines.find(item => !checked.has(item.id));
    $('#next-label').textContent = next ? '接下来的安排' : pending ? '按自己的节奏，继续今天' : routines.length ? '今天的安排都完成了' : '一天的节奏，由你开始';
    $('#next-time').textContent = (next || pending)?.time || '好好';
    $('#next-title').textContent = (next || pending)?.title || (routines.length ? '把余下的时间，留给自己' : '照顾自己');
    $('#next-note').textContent = (next || pending)?.note || (pending ? '不必赶进度，完成一件就打一个卡。' : '从一个适合自己的小安排开始。');
  }

  function renderUpcoming() {
    const upcoming = state.records.filter(item => item.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const container = $('#upcoming-list');
    container.replaceChildren();
    if (!upcoming.length) {
      container.append(emptyState('暂时没有待办安排', '记录一次体检或洗牙，顺便记下你计划的下次日期。', 'add-record', '记一件健康小事'));
      return;
    }
    upcoming.slice(0, 3).forEach(record => {
      const item = element('div', 'upcoming-item');
      const marker = element('div', 'upcoming-icon ' + record.type);
      marker.append(icon(recordTypes[record.type].icon));
      const body = element('div', 'upcoming-body');
      body.append(element('h3', '', record.title), element('p', '', formatDate(record.nextDate, false)));
      const status = dateStatus(record.nextDate);
      const side = element('div', 'upcoming-side');
      side.append(element('span', 'status-pill ' + status.className, status.text), actionButton('record-again', '记录完成', null, record.id, 'small-link'));
      item.append(marker, body, side);
      container.append(item);
    });
    if (upcoming.length > 3) {
      const link = element('a', 'text-link upcoming-more', '查看全部 ' + upcoming.length + ' 项安排');
      link.href = '#health';
      container.append(link);
    }
  }

  function latestRecord(type) {
    return state.records.filter(record => record.type === type).reverse().sort((a, b) => b.date.localeCompare(a.date))[0];
  }

  function renderQuickHealth() {
    const container = $('#health-quick');
    container.replaceChildren();
    ['dental', 'checkup'].forEach(type => {
      const latest = latestRecord(type);
      const button = actionButton('quick-record', '记录' + recordTypes[type].title, null, latest?.id, 'quick-item');
      button.textContent = '';
      button.dataset.type = type;
      const marker = element('span', 'quick-icon ' + type);
      marker.append(icon(recordTypes[type].icon));
      const info = element('span', 'quick-info');
      info.append(element('strong', '', type === 'dental' ? '上次洗牙 / 口腔护理' : '上次体检'), element('small', '', latest ? formatDate(latest.date) : '还没有记录，点这里记下'));
      const elapsed = element('span', 'elapsed', latest ? '距今 ' + Data.dateDiff(day, latest.date) + ' 天' : '记录时间');
      button.append(marker, info, elapsed, icon('arrow'));
      container.append(button);
    });
  }

  function renderWeek() {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - i);
      const key = Data.todayKey(date);
      dates.push({ date, key, count: (state.checks[key] || []).length });
    }
    const maximum = Math.max(5, ...dates.map(item => item.count));
    const container = $('#week-days');
    container.replaceChildren(...dates.map(item => {
      const node = element('div', 'week-day' + (item.key === day ? ' is-today' : ''));
      node.setAttribute('aria-label', formatDate(item.key, false) + '，打卡 ' + item.count + ' 次');
      const bar = element('div', 'week-bar');
      const fill = element('span');
      fill.style.height = (item.count / maximum * 100) + '%';
      bar.append(fill);
      node.append(element('span', '', item.key === day ? '今天' : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][item.date.getDay()]), bar, element('strong', '', String(item.count)), element('small', '', (item.date.getMonth() + 1) + '/' + item.date.getDate()));
      return node;
    }));
    $('#week-total').textContent = String(dates.reduce((sum, item) => sum + item.count, 0));
  }

  function renderRecords() {
    const summary = $('#health-summary');
    summary.replaceChildren();
    const count = element('div', 'summary-card');
    count.append(element('h3', '', '为自己留下的记录'), element('strong', '', state.records.length + ' 次'), element('p', '', '每一条，都是对自己的关心'));
    summary.append(count);
    ['dental', 'checkup'].forEach(type => {
      const card = element('div', 'summary-card ' + type);
      const latest = latestRecord(type);
      card.append(element('h3', '', '上次' + (type === 'dental' ? '口腔护理' : '体检')), element('strong', '', latest ? formatDate(latest.date, false) : '尚未记录'), element('p', '', latest ? formatDate(latest.date) : '从记下上一次的日期开始'));
      summary.append(card);
    });
    const filter = $('#record-filter').value;
    const records = state.records.filter(record => filter === 'all' || record.type === filter).reverse().sort((a, b) => b.date.localeCompare(a.date));
    const container = $('#health-records');
    container.replaceChildren();
    if (!records.length) {
      container.append(emptyState(state.records.length ? '这个分类还没有记录' : '还记得上次体检是哪天吗？', '记下日期和备注，下次需要时就能轻松找到。', 'add-record', '添加一条记录', filter === 'all' ? 'checkup' : filter));
    }
    records.forEach(record => {
      const row = element('article', 'record-row');
      const marker = element('div', 'record-icon ' + record.type);
      marker.append(icon(recordTypes[record.type].icon));
      const body = element('div', 'record-body');
      body.append(element('h3', '', record.title), element('p', 'record-meta', recordTypes[record.type].label + ' · ' + formatDate(record.date)));
      if (record.note) body.append(element('p', 'record-note', record.note));
      if (record.nextDate) body.append(element('p', 'record-meta', '下次计划：' + formatDate(record.nextDate)));
      const side = element('div', 'record-side');
      if (record.nextDate) {
        const status = dateStatus(record.nextDate);
        side.append(element('span', 'status-pill ' + status.className, status.text));
        side.append(actionButton('record-again', '记录完成', null, record.id, 'small-link'));
      }
      const actions = element('div', 'row-actions');
      actions.append(actionButton('edit-record', '编辑' + record.title, 'edit', record.id), actionButton('delete-record', '删除' + record.title, 'trash', record.id));
      side.append(actions);
      row.append(marker, body, side);
      container.append(row);
    });
  }

  function render() {
    const focused = document.activeElement;
    const focusTarget = focused?.matches('[data-action]') ? { action: focused.dataset.action, id: focused.dataset.id } : null;
    $('#today-date').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long', year: 'numeric' }).format(new Date());
    if (!state) {
      ['#today-routines', '#plan-routines', '#health-records', '#health-quick', '#health-summary', '#upcoming-list', '#week-days'].forEach(selector => {
        $(selector).replaceChildren(emptyState('记录暂时无法读取', '请查看页面上方的提示，先保留原始数据。'));
      });
      return;
    }
    renderRoutines();
    renderUpcoming();
    renderQuickHealth();
    renderWeek();
    renderRecords();
    if (focusTarget && !document.querySelector('dialog[open]')) {
      const replacement = [...document.querySelectorAll('.view:not([hidden]) [data-action]')].find(node => node.dataset.action === focusTarget.action && node.dataset.id === focusTarget.id);
      replacement?.focus({ preventScroll: true });
    }
  }

  function navigate() {
    const view = ['today', 'routine', 'health'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'today';
    const labels = { today: '今日概览', routine: '作息计划', health: '健康档案' };
    document.querySelectorAll('.view').forEach(node => { node.hidden = node.id !== 'view-' + view; });
    document.querySelectorAll('[data-nav]').forEach(node => {
      const active = node.dataset.nav === view;
      node.classList.toggle('active', active);
      if (active) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
    $('#page-label').textContent = labels[view];
    document.title = labels[view] + ' · 时宜';
  }

  function canEdit() {
    if (state) return true;
    showToast('请先处理页面上方的数据读取问题，或导入一份有效备份。');
    return false;
  }

  function showDialog(dialog) {
    const active = document.activeElement;
    dialog.returnFocus = active?.matches('[data-action]') ? { action: active.dataset.action, id: active.dataset.id } : null;
    dialog.showModal();
  }

  function openRoutine(id) {
    if (!canEdit()) return;
    const form = $('#routine-form');
    const item = id ? state.routines.find(routine => routine.id === id) : null;
    form.reset();
    $('.form-error', form).textContent = '';
    ['id', 'title', 'time', 'category', 'note'].forEach(name => {
      if (item) form.elements[name].value = item[name];
    });
    $('#routine-dialog-title').textContent = item ? '编辑作息' : '添加作息';
    showDialog($('#routine-dialog'));
  }

  function openRecord(id, type = 'checkup', again = false) {
    if (!canEdit()) return;
    const form = $('#record-form');
    const item = id ? state.records.find(record => record.id === id) : null;
    form.reset();
    form.dataset.previousId = '';
    $('.form-error', form).textContent = '';
    form.elements.date.max = Data.todayKey();
    form.elements.date.value = Data.todayKey();
    form.elements.type.value = type;
    form.elements.title.value = recordTypes[type].title;
    if (item) {
      if (again) {
        form.elements.type.value = item.type;
        form.elements.title.value = item.title;
        form.dataset.previousId = item.id;
      } else {
        ['id', 'title', 'type', 'date', 'nextDate', 'note'].forEach(name => { form.elements[name].value = item[name]; });
      }
    }
    $('#record-dialog-title').textContent = item && !again ? '编辑健康记录' : item && again ? '记录这一次，留好下一次' : '记录健康事项';
    showDialog($('#record-dialog'));
  }

  function confirmation(title, message, buttonText = '确认删除') {
    const dialog = $('#confirm-dialog');
    if (dialog.open) return Promise.resolve(false);
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-button').textContent = buttonText;
    dialog.returnValue = 'cancel';
    return new Promise(resolve => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      showDialog(dialog);
    });
  }

  async function deleteItem(kind, id) {
    if (!canEdit()) return;
    const list = kind === 'routine' ? 'routines' : 'records';
    const item = state[list].find(entry => entry.id === id);
    if (!item) return;
    const confirmed = await confirmation('删除“' + item.title + '”？', kind === 'routine' ? '这条作息会从计划中移除，过去的打卡次数会保留。' : '这条健康记录及其下次计划将被删除。此操作无法撤销。');
    if (confirmed) await persist(current => {
      current[list] = current[list].filter(entry => entry.id !== id);
      return current;
    }, kind === 'routine' ? '已删除作息，历史打卡已保留' : '已删除健康记录');
  }

  function downloadBackup() {
    try {
      const raw = localStorage.getItem(Data.STORAGE_KEY);
      const contents = state ? JSON.stringify(Data.validateState(Data.loadState())) : raw;
      if (!contents) throw new Error('没有可导出的数据。');
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json;charset=utf-8' }));
      const anchor = element('a');
      anchor.href = url;
      anchor.download = '时宜备份-' + Data.todayKey() + '.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(state ? '已导出备份，请妥善保管其中的个人记录' : '已导出原始数据，内容可能需要修复');
    } catch (error) { showToast('导出失败：' + error.message); }
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('文件不能超过 5 MB。');
      let parsed;
      try { parsed = JSON.parse(await file.text()); }
      catch (_) { throw new Error('文件不是有效的 JSON 备份。'); }
      const imported = Data.validateState(parsed);
      const confirmed = await confirmation('用这份备份替换当前记录？', '备份包含 ' + imported.routines.length + ' 条作息、' + imported.records.length + ' 条健康记录。导入会替换当前浏览器中的全部记录，建议先导出当前备份。', '确认导入并替换');
      if (confirmed) await persist(() => imported, '备份已导入，记录已恢复', null, true);
    } catch (error) { showToast('导入失败：' + error.message + ' 当前数据未改动。'); }
    finally { $('#import-file').value = ''; }
  }

  document.addEventListener('click', async event => {
    const close = event.target.closest('[data-close]');
    if (close) { document.getElementById(close.dataset.close).close(); return; }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const { action, id, type } = button.dataset;
    switch (action) {
      case 'add-routine': openRoutine(); break;
      case 'edit-routine': openRoutine(id); break;
      case 'delete-routine': await deleteItem('routine', id); break;
      case 'toggle-routine':
        await persist(current => {
          if (!current.routines.some(item => item.id === id)) throw new Error('这条作息已在其他页面删除，请刷新后重试。');
          const key = Data.todayKey();
          const checks = new Set(current.checks[key] || []);
          if (checks.has(id)) checks.delete(id); else checks.add(id);
          current.checks[key] = [...checks];
          return current;
        }, '今日打卡已更新');
        break;
      case 'add-record': openRecord(null, type || 'checkup'); break;
      case 'edit-record': openRecord(id); break;
      case 'quick-record': openRecord(id, type, true); break;
      case 'record-again': openRecord(id, type || 'checkup', true); break;
      case 'delete-record': await deleteItem('record', id); break;
      case 'export': downloadBackup(); break;
      case 'import': $('#import-file').click(); break;
    }
  });

  $('#routine-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const id = fields.get('id');
    const item = { id: id || crypto.randomUUID(), title: fields.get('title'), time: fields.get('time'), category: fields.get('category'), note: fields.get('note') };
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    const saved = await persist(current => {
      if (id) {
        const index = current.routines.findIndex(entry => entry.id === id);
        if (index < 0) throw new Error('这条作息已在其他页面删除，请关闭后重试。');
        current.routines[index] = item;
      } else current.routines.push(item);
      return current;
    }, id ? '作息已更新' : '新作息已添加', form);
    submit.disabled = false;
    if (saved) $('#routine-dialog').close();
  });

  $('#record-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const id = fields.get('id');
    const previousId = form.dataset.previousId;
    const item = { id: id || crypto.randomUUID(), title: fields.get('title'), type: fields.get('type'), date: fields.get('date'), nextDate: fields.get('nextDate'), note: fields.get('note') };
    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    const saved = await persist(current => {
      if (id) {
        const index = current.records.findIndex(entry => entry.id === id);
        if (index < 0) throw new Error('这条记录已在其他页面删除，请关闭后重试。');
        current.records[index] = item;
      } else {
        const previous = current.records.find(entry => entry.id === previousId);
        if (previous && item.date < previous.date) throw new Error('这一次的日期不能早于上一次。');
        if (previous) previous.nextDate = '';
        current.records.push(item);
      }
      return current;
    }, id ? '健康记录已更新' : '健康记录已保存', form);
    submit.disabled = false;
    if (saved) $('#record-dialog').close();
  });

  $('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    $('#main').focus();
  });
  $('#record-filter').addEventListener('change', () => { if (state) renderRecords(); });
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
    const target = dialog.returnFocus;
    if (!target || document.querySelector('dialog[open]')) return;
    const candidates = [...document.querySelectorAll('[data-action]')].filter(node => node.offsetParent !== null && node.dataset.action === target.action);
    const opener = candidates.find(node => node.dataset.id === target.id) || candidates[0];
    if (opener) opener.focus({ preventScroll: true });
    else $('#main').focus({ preventScroll: true });
  }));
  $('#import-file').addEventListener('change', event => importBackup(event.target.files[0]));
  window.addEventListener('hashchange', navigate);
  window.addEventListener('storage', event => {
    if (event.key === Data.STORAGE_KEY || event.key === null) {
      load();
      showToast('已同步当前浏览器其他页面的更改');
    }
  });
  setInterval(() => {
    day = Data.todayKey();
    if (document.visibilityState === 'visible') render();
  }, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { day = Data.todayKey(); load(); }
  });
  load();
  navigate();
})();
