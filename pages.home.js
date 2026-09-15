/* 首页：一屏看完今天该读什么、走到哪了（整体只读，只有快速备忘能写） */
(function (global) {
  'use strict';

  var Pages = global.Pages;
  var rootEl = null;

  Pages.home = function (root) {
    rootEl = root;
    return refresh();
  };

  function refresh() {
    return Data.load().then(function (d) {
      render(d);
    });
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '夜深了';
    if (h < 11) return '早上好';
    if (h < 13) return '中午好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  function todayMinutesGoal(d, today) {
    var n = 0;
    d.planItems.forEach(function (it) {
      if (it.date === today && !it.deferredTo && it.targetType === 'minutes') n += Number(it.targetValue) || 0;
    });
    return n;
  }

  function render(d) {
    var today = U.todayStr();
    var month = Data.monthKey(today);
    var year = U.parseDate(today).getFullYear();

    var st = Data.dayStats(d, today);
    var mst = Data.monthStats(d, month);
    var yst = Data.yearStats(d, year);
    var yearGoal = Data.yearGoal(d.goals, year);
    var dayGoal = todayMinutesGoal(d, today);
    var pct = dayGoal ? Math.min(100, Math.round(st.minutes / dayGoal * 100)) : 0;

    rootEl.innerHTML =
      Pages.topbar('首页', '<span class="muted small">' + U.escape(U.fmtDateCN(today)) + ' · 今年第 ' + weekOfYear(today) + ' 周</span>') +

      '<div class="hero">' +
      '<div class="hero-main">' +
      '<div class="hero-greet">' + greeting() + '</div>' +
      '<div class="hero-sub">' +
      (st.total ? '今天安排了 ' + st.total + ' 件事，已完成 ' + st.doneCount + ' 件' : '今天还没有安排') +
      (st.minutes ? ' · 已读 ' + U.escape(U.fmtMinutes(st.minutes)) : '') +
      (dayGoal ? ' · 目标 ' + dayGoal + ' 分钟' : '') +
      '</div></div>' +
      (dayGoal ? '<div class="ring" style="--v:' + pct + '"><div><b>' + pct + '%</b><small>今日</small></div></div>' : '') +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="col">' +
      onboardCard(d) +
      todayCard(d, st, today) +
      monthCard(d, mst, month, today) +
      yearCard(d, yst, year, yearGoal) +
      '</div>' +
      '<div class="col">' +
      memoCard(d) +
      notesCard(d) +
      reminderCard(d) +
      '</div>' +
      '</div>';

    wire();
  }

  function weekOfYear(date) {
    var d = U.parseDate(date);
    var start = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
  }

  /* ---------- 第一次打开的三步引导 ---------- */
  function onboardCard(d) {
    var s = (global.App && App.settings) || {};
    if (s.seeded) return '';
    if (d.books.length || d.planItems.length) return '';
    var year = U.parseDate(U.todayStr()).getFullYear();

    return '<div class="card" id="onboard">' +
      '<div class="card-head"><div class="card-title">先定三件事，就能开始用了</div><div class="spacer"></div>' +
      '<span class="card-link" data-ob="skip">以后再说</span></div>' +
      '<div class="rows">' +
      '<div class="row"><span style="min-width:132px">' + year + ' 年想读几本</span>' +
      '<input class="input" style="width:88px" id="obBooks" type="number" min="0" placeholder="20">' +
      '<button class="btn btn-sm" data-ob="books">定下来</button></div>' +
      '<div class="row"><span style="min-width:132px">想读的第一本书</span>' +
      '<input class="input" style="flex:1;min-width:120px" id="obBook" placeholder="书名，随手写一个">' +
      '<button class="btn btn-sm" data-ob="book">加进书架</button></div>' +
      '<div class="row"><span style="min-width:132px">每天几点提醒你</span>' +
      '<input class="input" style="width:120px" id="obTime" type="time" value="21:00">' +
      '<button class="btn btn-sm" data-ob="time">设提醒</button></div>' +
      '</div>' +
      '<div class="card-foot"><span class="muted small">三个都可以不填，直接点"以后再说"。</span></div>' +
      '</div>';
  }

  /* ---------- 今日计划（只读） ---------- */
  function todayCard(d, st, today) {
    var rows = st.items.length ? st.items.map(function (it) {
      var book = Data.bookById(d.books, it.bookId);
      return '<div class="row">' +
        '<span class="state ' + (it.done ? 'done' : '') + '"></span>' +
        '<span class="row-title">' + (book ? U.escape('《' + book.title + '》') : '<span class="muted">（不指定书）</span>') + '</span>' +
        '<div class="spacer"></div>' +
        '<span class="row-sub">目标 ' + U.escape(Data.targetText(it)) + '</span>' +
        '<span class="pill' + (it.done ? ' brand' : '') + '">' + (it.done ? '已完成' : '未完成') + '</span>' +
        '</div>';
    }).join('') : '';

    return '<div class="card card-clickable" data-go="plan" data-view="day">' +
      '<div class="card-head"><div class="card-title">今日计划</div><div class="spacer"></div>' +
      '<span class="card-link">去安排 ›</span></div>' +
      (st.items.length ? '<div class="rows">' + rows + '</div>'
        : '<div class="empty-hint">今天还没安排。<br>去计划页挑一本书，或者直接开始读也行。</div>') +
      '<div class="card-foot">今日合计 ' + U.escape(summaryText(st)) + '<div class="spacer"></div>' +
      '<span class="muted">首页只读，点这里去计划页操作</span></div>' +
      '</div>';
  }

  function summaryText(st) {
    var parts = [];
    if (st.minutes) parts.push(U.fmtMinutes(st.minutes));
    if (st.pages) parts.push(st.pages + ' 页');
    if (st.pomodoros) parts.push(st.pomodoros + ' 个番茄');
    return parts.length ? parts.join(' · ') : '还没有记录';
  }

  /* ---------- 本月 ---------- */
  var HEAT_HEAD = '<div class="heat-head"><span>日</span><span>一</span><span>二</span><span>三</span>' +
    '<span>四</span><span>五</span><span>六</span></div>';
  function heatLegend() {
    return '<span class="heat-legend">少' +
      '<i style="background:var(--surface-3)"></i><i style="background:var(--heat1)"></i>' +
      '<i style="background:var(--heat2)"></i><i style="background:var(--heat3)"></i>' +
      '<i style="background:var(--heat4)"></i>多</span>';
  }

  function monthCard(d, mst, month, today) {
    var first = U.monthStart(today);
    var days = U.monthDays(today);
    var lead = U.leadOffset(first);
    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<i class="empty"></i>';
    for (var day = 1; day <= days; day++) {
      var date = month + '-' + U.pad2(day);
      var min = mst.perDay[date] || 0;
      var planned = d.planItems.some(function (it) { return it.date === date && !it.deferredTo; });
      var cls = min === 0 ? (planned ? 'planned' : '') : min < 20 ? 'l1' : min < 40 ? 'l2' : min < 60 ? 'l3' : 'l4';
      if (date === today) cls += ' today';
      cells += '<i class="' + cls + '" title="' + day + ' 日' + (min ? ' · ' + U.fmtMinutes(min) : '') + '"></i>';
    }
    var goal = Data.monthGoal(d.goals, month);

    return '<div class="card card-clickable" data-go="plan" data-view="month">' +
      '<div class="card-head"><div class="card-title">本月 <small>' + U.escape(Data.monthTitle(month)) + '</small></div>' +
      '<div class="spacer"></div>' +
      '<span class="pill brand">已完成 ' + mst.doneDays + ' 天</span></div>' +
      HEAT_HEAD +
      '<div class="heat">' + cells + '</div>' +
      '<div class="card-foot">本月累计 ' + U.escape(U.fmtMinutes(mst.minutes)) + (mst.pages ? ' · ' + mst.pages + ' 页' : '') +
      '<div class="spacer"></div>' +
      (goal ? '<span class="muted">月目标 ' + goal + ' 分钟</span>' : heatLegend()) +
      '</div></div>';
  }

  /* ---------- 今年 ---------- */
  function yearCard(d, yst, year, goal) {
    var pct = goal ? Math.min(100, Math.round(yst.count / goal * 100)) : 0;
    var reading = Data.readingBooks(d.books);
    var want = Data.shelfBooks(d.books);
    var recent = yst.finished.slice(0, 4).map(function (b) { return '《' + b.title + '》'; }).join('');

    return '<div class="card card-clickable" data-go="plan" data-view="year">' +
      '<div class="card-head"><div class="card-title">今年 <small>' + year + '</small></div><div class="spacer"></div>' +
      '<span class="pill brand">' + yst.count + (goal ? ' / ' + goal : '') + ' 本</span></div>' +
      (goal ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      '<div class="rows mt14">' +
      '<div class="row"><span class="row-title">已读完</span><div class="spacer"></div>' +
      '<span class="row-sub">' + (recent || '还没有') + '</span></div>' +
      '<div class="row"><span class="row-title">正在读</span><div class="spacer"></div>' +
      '<span class="row-sub">' + (reading.length ? reading.map(function (b) { return '《' + b.title + '》' + Data.progress(b) + '%'; }).join(' · ') : '还没有') + '</span></div>' +
      '<div class="row"><span class="row-title muted">想读</span><div class="spacer"></div>' +
      '<span class="row-sub">' + want.length + ' 本在书架上</span></div>' +
      '</div>' +
      '<div class="card-foot"><span class="muted">今年累计读了 ' + U.escape(U.fmtMinutes(yst.minutes)) + '</span></div>' +
      '</div>';
  }

  /* ---------- 快速备忘（首页唯一能写的地方） ---------- */
  function memoCard(d) {
    var memos = d.memos.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    var list = memos.slice(0, 4).map(function (m) {
      return '<div class="row" data-memo="' + m.id + '">' +
        '<span class="row-sub" style="flex:1">' + U.escape(m.text) + '</span>' +
        '<span class="card-link" data-memo-act="note">转为笔记</span>' +
        '<span class="muted" data-memo-act="del" style="cursor:pointer">✕</span>' +
        '</div>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">快速备忘 <small>首页唯一能写的地方</small></div></div>' +
      '<input class="input" id="memoInput" placeholder="想到什么先写这儿，回车保存…" autocomplete="off">' +
      (list ? '<div class="rows mt10">' + list + '</div>' : '<div class="muted small mt10">还没有备忘。读书时冒出来的念头，随手扔这儿就行。</div>') +
      (memos.length > 4 ? '<div class="card-foot"><span class="muted small">还有 ' + (memos.length - 4) + ' 条更早的</span></div>' : '') +
      '</div>';
  }

  /* ---------- 最近笔记 ---------- */
  function notesCard(d) {
    var notes = d.notes.filter(function (n) { return !n.deletedAt; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    var list = notes.slice(0, 3).map(function (n) {
      var book = Data.bookById(d.books, n.bookId);
      return '<div class="row" style="align-items:flex-start"><div>' +
        '<div class="row-title">' + (book ? U.escape('《' + book.title + '》') : '<span class="muted">（未挂书）</span>') + '</div>' +
        '<div class="row-sub">' + U.escape((n.quote || n.body || '').slice(0, 34)) + '…</div>' +
        '</div></div>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">最近笔记</div><div class="spacer"></div>' +
      '<span class="muted small">共 ' + notes.length + ' 条</span></div>' +
      (list || '<div class="muted small">还没有笔记。读的时候想到什么，去「笔记」页写下来。</div>') +
      '</div>';
  }

  /* ---------- 提醒 ---------- */
  function reminderCard(d) {
    var missed = (d.reminderLog || []).filter(function (l) { return !l.handled && l.missed; }).length;
    var up = (global.Reminders && global.Reminders.upcoming) ? Reminders.upcoming(d, 1) : [];
    var next = up.length
      ? (U.dateStr(new Date(up[0].at)) === U.todayStr() ? '今天 ' : U.fmtDateShort(U.dateStr(new Date(up[0].at))) + ' ') + U.fmtTime(up[0].at) + '　' + up[0].text
      : '还没有设提醒';

    return '<div class="card card-clickable" data-go="reminders">' +
      '<div class="card-head"><div class="card-title">提醒</div><div class="spacer"></div>' +
      '<a class="card-link" href="#/reminders">去设置 ›</a></div>' +
      '<div class="rows">' +
      '<div class="row"><span class="row-sub">下一次</span><div class="spacer"></div>' +
      '<span style="text-align:right">' + U.escape(next) + '</span></div>' +
      (missed
        ? '<div class="row" style="background:var(--warn-soft)"><span class="pill warn">你错过了 ' + missed + ' 条提醒</span>' +
          '<div class="spacer"></div><span class="card-link">去处理 ›</span></div>'
        : '<div class="row"><span class="row-sub">没有错过的提醒</span></div>') +
      '</div></div>';
  }

  /* ---------- 事件 ---------- */
  function wire() {
    U.$$('[data-ob]', rootEl).forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        var act = el.getAttribute('data-ob');
        var year = U.parseDate(U.todayStr()).getFullYear();
        function done(msg) {
          return Store.saveSettings({ seeded: true }).then(function () {
            if (global.App && App.settings) App.settings.seeded = true;
            if (msg) U.toast(msg);
            return refresh();
          });
        }
        if (act === 'skip') return done('');
        if (act === 'books') {
          var n = Number((U.$('#obBooks', rootEl) || {}).value) || 0;
          if (!n) { U.toast('填个数字，或者直接点"以后再说"'); return; }
          return Data.setYearGoal(year, n).then(function () { return done('今年目标定好了'); });
        }
        if (act === 'book') {
          var t = ((U.$('#obBook', rootEl) || {}).value || '').trim();
          if (!t) { U.toast('写个书名，或者直接点"以后再说"'); return; }
          return Store.put('books', { title: t, status: 'want' }).then(function () { return done('加进书架了'); });
        }
        if (act === 'time') {
          var time = (U.$('#obTime', rootEl) || {}).value || '21:00';
          return Store.put('reminders', {
            kind: 'daily', text: '该读书了', time: time,
            weekdays: null, sound: true, enabled: true, skippedOn: []
          }).then(function () {
            if (global.Reminders) Reminders.check(false);
            return done('每天 ' + time + ' 提醒你');
          });
        }
      });
    });

    U.$$('[data-go]', rootEl).forEach(function (c) {
      c.addEventListener('click', function () {
        var dest = c.getAttribute('data-go');
        if (dest === 'reminders') { location.hash = '#/reminders'; return; }
        if (Pages.planSet) Pages.planSet(c.getAttribute('data-view'), U.todayStr());
        location.hash = '#/plan';
      });
    });

    var input = U.$('#memoInput', rootEl);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.isComposing) return;
        var text = input.value.trim();
        if (!text) return;
        Store.put('memos', { text: text }).then(function () {
          input.value = '';
          U.toast('记下了');
          return refresh();
        });
      });
      input.addEventListener('blur', function () {
        var text = input.value.trim();
        if (!text) return;
        Store.put('memos', { text: text }).then(function () {
          U.toast('记下了');
          return refresh();
        });
      });
    }

    U.$$('[data-memo]', rootEl).forEach(function (row) {
      var id = row.getAttribute('data-memo');
      var memo = null;
      U.$$('[data-memo-act]', row).forEach(function (btn) {
        btn.addEventListener('click', function () {
          Data.load().then(function (d) {
            d.memos.forEach(function (m) { if (m.id === id) memo = m; });
            var act = btn.getAttribute('data-memo-act');
            if (act === 'note') {
              return Store.put('notes', { bookId: null, body: memo ? memo.text : '', quote: '', page: '', tags: [] })
                .then(function () { return Store.remove('memos', id); })
                .then(function () { U.toast('已经存成笔记了'); return refresh(); });
            }
            return Store.remove('memos', id).then(function () { return refresh(); });
          });
        });
      });
    });
  }
})(window);
