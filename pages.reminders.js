/* 提醒页：日常提醒 + 节点提醒 + 错过的提醒收件箱 */
(function (global) {
  'use strict';

  var Pages = global.Pages;
  var rootEl = null;
  var cache = null;

  Pages.reminders = function (root) {
    rootEl = root;
    return load();
  };

  function load() {
    return Data.load().then(function (d) {
      return Store.all('reminders').then(function (rems) {
        cache = d;
        cache.rems = rems;
        return Reminders.pending().then(function (pending) {
          cache.pending = pending;
          render();
        });
      });
    });
  }

  function render() {
    var daily = cache.rems.filter(function (r) { return r.kind === 'daily' || r.kind === 'weekly'; });
    var nodes = cache.rems.filter(function (r) { return r.kind !== 'daily' && r.kind !== 'weekly'; });

    rootEl.innerHTML =
      Pages.topbar('提醒', '<span class="muted small">' + (cache.pending.length ? '有 ' + cache.pending.length + ' 条待处理' : '没有待处理的') + '</span>') +
      '<div class="notice"><svg><use href="#i-warn"/></svg><div>' +
      '<b>这个 App 只在页面开着的时候才会弹出提醒。</b>' +
      '没开的时候提醒不会响，但下次打开会把错过的收进下面的收件箱，你可以一条条处理（顺延、补记或跳过）。' +
      '</div></div>' +
      '<div class="grid-2">' +
      '<div class="col">' + dailyCard(daily) + nodeCard(nodes) + '</div>' +
      '<div class="col">' + inboxCard() + upcomingCard() + rulesCard() + '</div>' +
      '</div>';

    wire();
  }

  /* ================= 日常 ================= */
  function dailyCard(list) {
    var rows = list.length ? list.map(function (r) {
      var repeat = (r.kind === 'weekly')
        ? '每周' + Reminders.WEEK[r.weekday]
        : (r.weekdays && r.weekdays.length ? r.weekdays.map(function (w) { return Reminders.WEEK[w]; }).join(' ') : '每天');
      return '<div class="row" data-rid="' + r.id + '">' +
        '<input type="checkbox" data-act="toggle"' + (r.enabled === false ? '' : ' checked') + '>' +
        '<b class="mono" style="font-size:15px;min-width:56px">' + U.escape(r.time || Reminders.DEFAULT_TIME) + '</b>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.escape(r.text || '(没写提示语)') + '</span>' +
        '<span class="pill">' + U.escape(repeat) + '</span>' +
        '<span class="muted small">' + (r.sound === false ? '🔇' : '🔊') + '</span>' +
        '<span class="card-link" data-act="edit">改</span>' +
        '<span class="muted" data-act="del" style="cursor:pointer">✕</span>' +
        '</div>';
    }).join('') : '<div class="muted small">还没有日常提醒。加一条"每天 21:00 该读书了"，它会成为你每天的固定信号。</div>';

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">日常提醒</div><div class="spacer"></div>' +
      '<button class="btn btn-sm" data-act="add-daily">＋ 加一条</button></div>' +
      '<div class="rows">' + rows + '</div>' +
      '<div class="card-foot"><span class="muted small">"每周"那种适合做周报：到点会自动算出"这周读了几次、多少分钟"。</span></div>' +
      '</div>';
  }

  /* ================= 节点 ================= */
  function nodeCard(list) {
    var rows = list.length ? list.map(function (r) {
      var desc;
      if (r.kind === 'once') desc = U.fmtDateCN(r.date, false) + ' ' + U.escape(r.time || '09:00');
      else if (r.kind === 'monthEnd') desc = '每月最后 ' + (r.lastDays || 3) + ' 天 ' + U.escape(r.time || '21:00');
      else if (r.kind === 'progress') {
        var b = Data.bookById(cache.books, r.bookId);
        desc = (b ? '《' + b.title + '》' : '某本书') + ' 读到 ' + (r.threshold || 50) + '% 时';
      } else desc = '';
      return '<div class="row" data-rid="' + r.id + '">' +
        '<input type="checkbox" data-act="toggle"' + (r.enabled === false ? '' : ' checked') + '>' +
        '<span class="pill brand">' + U.escape(Reminders.kindLabel(r.kind)) + '</span>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.escape(r.text || '') + '</span>' +
        '<span class="row-sub">' + desc + '</span>' +
        '<span class="card-link" data-act="edit">改</span>' +
        '<span class="muted" data-act="del" style="cursor:pointer">✕</span>' +
        '</div>';
    }).join('') : '<div class="muted small">还没有节点提醒。</div>';

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">节点提醒</div><div class="spacer"></div>' +
      '<button class="btn btn-sm" data-act="add-node">＋ 加一条</button></div>' +
      '<div class="rows">' + rows + '</div>' +
      '<div class="card-foot"><span class="muted small">第一版只给几个现成模板，不让你自己拼条件 —— 免得设出一个自己也看不懂的规则。</span></div>' +
      '</div>';
  }

  /* ================= 收件箱 ================= */
  function inboxCard() {
    var list = cache.pending;
    var rows = list.length ? list.map(function (l) {
      var when = U.fmtDateShort(l.date) + ' ' + U.fmtTime(l.dueAt || Date.now());
      // 注意：按钮必须和数据行在同一个 [data-lid] 容器里，否则取不到 id、按钮会变成死的
      return '<div class="row" data-lid="' + l.id + '" style="align-items:flex-start;flex-wrap:wrap;background:var(--warn-soft)">' +
        '<div style="flex:1 1 100%;min-width:0">' +
        '<div class="row-title">' + U.escape(when) + ' · ' + U.escape(l.text) + '</div>' +
        '<div class="row-sub">' + (l.missed ? '这条响的时候你没打开 App' : '还没处理') + '</div>' +
        '</div>' +
        '<div class="row-flex" style="gap:6px;margin-left:auto">' +
        '<button class="btn btn-sm" data-act="known">知道了</button>' +
        '<button class="btn btn-sm" data-act="defer">顺延到明天</button>' +
        '<button class="btn btn-sm btn-primary" data-act="logdone">补记完成</button>' +
        '</div>' +
        '</div>';
    }).join('') : '<div class="muted small">都处理完了，收件箱是空的。</div>';

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">待处理的提醒</div><div class="spacer"></div>' +
      (list.length ? '<span class="pill warn">' + list.length + ' 条待处理</span>' : '<span class="pill">空</span>') + '</div>' +
      '<div class="rows">' + rows + '</div>' +
      '</div>';
  }

  /* ================= 即将触发 ================= */
  function upcomingCard() {
    var up = Reminders.upcoming(cache, 3);
    var rows = up.length ? up.map(function (u) {
      var d = U.dateStr(new Date(u.at)) === U.todayStr() ? '今天' : U.fmtDateShort(U.dateStr(new Date(u.at)));
      var diff = u.at - Date.now();
      var left = diff < 3600000 ? Math.max(1, Math.round(diff / 60000)) + ' 分钟后' : Math.round(diff / 3600000) + ' 小时后';
      if (diff > 86400000) left = Math.round(diff / 86400000) + ' 天后';
      return '<div class="row"><span class="row-sub" style="min-width:96px">' + U.escape(d + ' ' + U.fmtTime(u.at)) + '</span>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + U.escape(u.text) + '</span>' +
        '<span class="pill">' + U.escape(left) + '</span></div>';
    }).join('') : '<div class="muted small">接下来 40 天没有安排提醒。</div>';

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">即将触发</div></div>' +
      '<div class="rows">' + rows + '</div>' +
      '</div>';
  }

  function rulesCard() {
    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">处理规则</div></div>' +
      '<div class="rows">' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">知道了</div>' +
      '<div class="row-sub">从收件箱拿掉，数据一点不动</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">顺延到明天</div>' +
      '<div class="row-sub">明天同一时间再提醒你一次（今晚 + 明天各一次）</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">补记完成</div>' +
      '<div class="row-sub">可以填"我昨天其实读了 40 分钟"，补进那一天</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">今天跳过</div>' +
      '<div class="row-sub">在右下角的弹窗里，今天就不再打扰你</div></div></div>' +
      '</div></div>';
  }

  /* ================= 交互 ================= */
  function findRem(id) {
    for (var i = 0; i < cache.rems.length; i++) if (cache.rems[i].id === id) return cache.rems[i];
    return null;
  }
  function findLog(id) {
    for (var i = 0; i < cache.pending.length; i++) if (cache.pending[i].id === id) return cache.pending[i];
    return null;
  }

  function wire() {
    U.$$('[data-act]', rootEl).forEach(function (el) {
      var act = el.getAttribute('data-act');
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var rid = el.closest('[data-rid]') && el.closest('[data-rid]').getAttribute('data-rid');
        var lid = el.closest('[data-lid]') && el.closest('[data-lid]').getAttribute('data-lid');

        if (act === 'add-daily') return editReminder(null, 'daily');
        if (act === 'add-node') return pickTemplate();
        if (act === 'edit') return editReminder(findRem(rid), null);
        if (act === 'del') return delReminder(findRem(rid));
        if (act === 'known') return Reminders.handle(findLog(lid), 'known').then(load);
        if (act === 'defer') return Reminders.deferToTomorrow(findLog(lid)).then(load);
        if (act === 'logdone') return logDone(findLog(lid));
      });
    });

    U.$$('[data-act="toggle"]', rootEl).forEach(function (box) {
      box.addEventListener('change', function () {
        var rid = box.closest('[data-rid]').getAttribute('data-rid');
        var r = findRem(rid);
        if (!r) return;
        Store.put('reminders', Object.assign({}, r, { enabled: box.checked })).then(function () {
          U.toast(box.checked ? '已打开' : '已暂停');
          return Reminders.check(false);
        }).then(load);
      });
    });
  }

  function delReminder(r) {
    if (!r) return;
    return U.confirm('删掉这条提醒？', r.text || '', '删掉', true).then(function (ok) {
      if (!ok) return;
      return Store.remove('reminders', r.id).then(function () {
        U.toast('删掉了');
        return load();
      });
    });
  }

  /* ---------- 模板选择 ---------- */
  function pickTemplate() {
    return U.modal({
      title: '加一条节点提醒',
      sub: '选一个模板，参数填一下就行',
      confirmText: '知道了', cancelText: '关闭',
      bodyHtml:
        '<div class="rows">' +
        '<div class="row" style="cursor:pointer" data-tpl="once"><span style="flex:1">某一天提醒我</span><span class="row-sub">比如 3 月 15 日该读完《xx》</span></div>' +
        '<div class="row" style="cursor:pointer" data-tpl="monthEnd"><span style="flex:1">每月最后几天告诉我目标还差多少</span><span class="row-sub">自动算</span></div>' +
        '<div class="row" style="cursor:pointer" data-tpl="weekly"><span style="flex:1">每周固定一天汇报</span><span class="row-sub">这周读了几次、多少分钟</span></div>' +
        '<div class="row" style="cursor:pointer" data-tpl="progress"><span style="flex:1">某本书读到一半时提醒一次</span><span class="row-sub">只提醒一次</span></div>' +
        '</div>'
    }).then(function () { /* 点了哪一行由下面的委托处理 */ });
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-tpl]');
    if (!t) return;
    var mask = t.closest('.modal-mask');
    if (!mask) return;                       // 只在"选模板"弹窗里生效
    var kind = t.getAttribute('data-tpl');
    if (['once', 'monthEnd', 'weekly', 'progress'].indexOf(kind) < 0) return;
    if (mask.parentNode) mask.parentNode.removeChild(mask);
    editReminder(null, kind);
  });

  /* ---------- 加 / 改一条提醒 ---------- */
  function editReminder(r, forcedKind) {
    var isNew = !r;
    var kind = r ? r.kind : (forcedKind || 'daily');
    r = r || { kind: kind, text: '', time: Reminders.DEFAULT_TIME, sound: true, enabled: true };

    var body = '';
    var title = '';

    if (kind === 'daily') {
      title = isNew ? '加一条日常提醒' : '改这条日常提醒';
      var wd = r.weekdays || [];
      body =
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>几点</label><input class="input" id="rmTime" type="time" value="' + U.escape(r.time || Reminders.DEFAULT_TIME) + '"></div>' +
        '<div class="field" style="flex:1"><label>提示语</label><input class="input" id="rmText" value="' + U.escape(r.text || '') + '" placeholder="该读书了"></div>' +
        '</div>' +
        '<div class="field"><label>哪几天</label>' +
        '<div class="row-flex" style="gap:10px">' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="rmRep" value="all"' + (!wd.length ? ' checked' : '') + '> 每天</label>' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="rmRep" value="work"' + (wd.length === 5 && wd.indexOf(6) < 0 ? ' checked' : '') + '> 工作日</label>' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="rmRep" value="pick"> 自己挑</label>' +
        '</div></div>' +
        '<div class="field" id="rmPickBox"><label>挑星期（可多选）</label><div class="row-flex" style="gap:10px;flex-wrap:wrap">' +
        [1, 2, 3, 4, 5, 6, 7].map(function (w) {
          return '<label class="row-flex" style="gap:5px"><input type="checkbox" data-wd="' + w + '"' + (wd.indexOf(w) >= 0 ? ' checked' : '') + '>' + Reminders.WEEK[w] + '</label>';
        }).join('') + '</div></div>';
    } else if (kind === 'weekly') {
      title = isNew ? '加一条周报提醒' : '改这条周报提醒';
      body =
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>星期几</label><select class="input" id="rmWeekday">' +
        [1, 2, 3, 4, 5, 6, 7].map(function (w) { return '<option value="' + w + '"' + (Number(r.weekday) === w ? ' selected' : '') + '>' + Reminders.WEEK[w] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field" style="flex:1"><label>几点</label><input class="input" id="rmTime" type="time" value="' + U.escape(r.time || '18:00') + '"></div>' +
        '</div>' +
        '<div class="muted small">到点会告诉你"这周读了 N 次，共 X 分钟"，不用自己写提示语。</div>';
    } else if (kind === 'monthEnd') {
      title = isNew ? '加一条月末提醒' : '改这条月末提醒';
      body =
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>提前几天提醒</label><input class="input" id="rmLastDays" type="number" min="1" max="15" value="' + (r.lastDays || 3) + '"></div>' +
        '<div class="field" style="flex:1"><label>几点</label><input class="input" id="rmTime" type="time" value="' + U.escape(r.time || Reminders.DEFAULT_TIME) + '"></div>' +
        '</div>' +
        '<div class="muted small">到点会告诉你"本月还差多少分钟就到目标"，不用自己写提示语。</div>';
    } else if (kind === 'progress') {
      title = isNew ? '加一条进度提醒' : '改这条进度提醒';
      body =
        '<div class="field"><label>哪本书</label><select class="input" id="rmBook">' +
        cache.books.map(function (b) { return '<option value="' + b.id + '"' + (r.bookId === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>读到百分之多少时提醒</label><input class="input" id="rmThreshold" type="number" min="1" max="99" value="' + (r.threshold || 50) + '"></div>' +
        (cache.books.length ? '' : '<div class="muted small">书单还是空的，先去计划页加一本书。</div>');
    } else {
      title = isNew ? '加一条一次性提醒' : '改这条提醒';
      body =
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>哪一天</label><input class="input" id="rmDate" type="date" value="' + U.escape(r.date || U.addDays(U.todayStr(), 1)) + '"></div>' +
        '<div class="field" style="flex:1"><label>几点</label><input class="input" id="rmTime" type="time" value="' + U.escape(r.time || '09:00') + '"></div>' +
        '</div>' +
        '<div class="field"><label>提示语</label><input class="input" id="rmText" value="' + U.escape(r.text || '') + '" placeholder="比如：该读完《万历十五年》了"></div>';
    }

    body += '<div class="row-flex mt10" style="gap:8px"><input type="checkbox" id="rmSound"' + (r.sound === false ? '' : ' checked') + '> <span class="small">有声音</span></div>';

    return U.modal({
      title: title,
      confirmText: isNew ? '加进去' : '保存',
      bodyHtml: body,
      onOk: function (mask) {
        var patch = { kind: kind, sound: U.$('#rmSound', mask).checked, enabled: true };
        var timeEl = U.$('#rmTime', mask);
        if (timeEl) patch.time = timeEl.value || Reminders.DEFAULT_TIME;

        if (kind === 'daily') {
          var rep = (mask.querySelector('input[name="rmRep"]:checked') || {}).value || 'all';
          patch.text = (U.$('#rmText', mask).value || '').trim() || '该读书了';
          if (rep === 'all') patch.weekdays = null;
          else if (rep === 'work') patch.weekdays = [1, 2, 3, 4, 5];
          else {
            var picked = U.$$('[data-wd]', mask).filter(function (c) { return c.checked; })
              .map(function (c) { return Number(c.getAttribute('data-wd')); });
            if (!picked.length) { U.toast('至少挑一天'); return false; }
            patch.weekdays = picked;
          }
        } else if (kind === 'weekly') {
          patch.weekday = Number(U.$('#rmWeekday', mask).value) || 5;
          patch.text = '这周读了多久';
        } else if (kind === 'monthEnd') {
          patch.lastDays = Number(U.$('#rmLastDays', mask).value) || 3;
          patch.text = '本月目标还差多少';
        } else if (kind === 'progress') {
          var sel = U.$('#rmBook', mask);
          if (!sel || !sel.value) { U.toast('先去计划页加一本书'); return false; }
          patch.bookId = sel.value;
          patch.threshold = Number(U.$('#rmThreshold', mask).value) || 50;
          patch.text = '读到一半了';
        } else {
          patch.date = U.$('#rmDate', mask).value || U.addDays(U.todayStr(), 1);
          patch.text = (U.$('#rmText', mask).value || '').trim() || '别忘了';
        }

        var p = r.id ? Store.put('reminders', Object.assign({}, r, patch)) : Store.put('reminders', patch);
        var timeChanged = !!(r.id && r.time !== patch.time);
        return p.then(function (saved) {
          U.toast(isNew ? '加好了' : '改好了');
          // 改了时间的话，今天这一次要按新时间重新判定
          if (timeChanged && Reminders.rearm) return Reminders.rearm(saved);
          return Reminders.check(false);
        }).then(load).then(function () { return true; });
      }
    });
  }

  /* ---------- 补记完成 ---------- */
  function logDone(log) {
    if (!log) return;
    var opts = '<option value="">（不指定书）</option>' + cache.books.map(function (b) {
      return '<option value="' + b.id + '">' + U.escape(b.title) + '</option>';
    }).join('');
    return U.modal({
      title: '补记 ' + U.fmtDateShort(log.date) + ' 的阅读',
      sub: '这条提醒是 ' + U.escape(log.text),
      confirmText: '记下来',
      bodyHtml:
        '<div class="field"><label>那天读了多久（分钟）</label>' +
        '<input class="input" id="lgMin" type="number" min="1" value="30" data-autofocus></div>' +
        '<div class="field"><label>算在哪本书上</label><select class="input" id="lgBook">' + opts + '</select></div>',
      onOk: function (mask) {
        var min = Number(U.$('#lgMin', mask).value) || 0;
        if (min <= 0) { U.toast('填一个大于 0 的数'); return false; }
        return Reminders.logFor(log, min, U.$('#lgBook', mask).value || null).then(function () {
          return load();
        }).then(function () { return true; });
      }
    });
  }
})(window);
