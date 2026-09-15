/* 计时页：正计时 / 番茄钟 + 今天的记录 */
(function (global) {
  'use strict';

  var Pages = global.Pages;
  var rootEl = null;
  var cache = null;
  var mode = 'stopwatch';       // 没在计时的时候，用户选的模式

  Pages.timer = function (root) {
    rootEl = root;
    return load();
  };

  function load() {
    return Data.load().then(function (d) {
      cache = d;
      render();
    });
  }

  /* ================= 渲染 ================= */
  function render() {
    rootEl.innerHTML =
      Pages.topbar('计时', '<span class="muted small">计时中你可以随便去别的页面，左边底下那条一直跟着走</span>') +
      '<div class="grid-2">' +
      '<div class="col">' + mainCard() + configCard() + '</div>' +
      '<div class="col">' + recordsCard() + tipsCard() + '</div>' +
      '</div>';
    wire();
    syncDial();
  }

  function mainCard() {
    var st = Timer.state();
    var m = st ? st.mode : mode;
    var isPomo = m === 'pomodoro';

    return '<div class="card">' +
      '<div class="timer-wrap">' +
      '<div class="seg" id="modeSeg">' +
      '<button data-mode="stopwatch" class="' + (!isPomo ? 'on' : '') + '"' + (st ? ' disabled' : '') + '>正计时</button>' +
      '<button data-mode="pomodoro" class="' + (isPomo ? 'on' : '') + '"' + (st ? ' disabled' : '') + '>番茄钟</button>' +
      '</div>' +

      '<div class="dial" id="dialTime">' + dialText() + '</div>' +
      '<div class="dial-sub" id="dialSub">' + dialSub() + '</div>' +

      '<div class="timer-actions" id="timerActions">' + actionsHtml() + '</div>' +

      (isPomo
        ? '<div class="tomato-dots" id="tomatoDots">' + dotsHtml() + '</div>'
        : '') +

      '<div class="row-flex" style="justify-content:center;gap:10px">' +
      '<span class="muted small">' + (isPomo ? pomoText() : (st ? '' : '点开始就开始记时间，读多久算多久')) + '</span>' +
      (isPomo ? '<span class="card-link" data-act="edit-pomo">修改 ⌄</span>' : '') +
      '</div>' +
      '</div></div>';
  }

  function pomoText() {
    var c = Timer.config();
    return '专注 ' + c.focus + ' 分 · 休息 ' + c.rest + ' 分 · 长休息 ' + c.longRest + ' 分 · 每 ' + c.rounds + ' 轮一次';
  }

  function dotsHtml() {
    var st = Timer.state();
    var c = Timer.config();
    var n = c.rounds || 4;
    var round = st ? st.round : 0;
    var done = round % n;
    if (round > 0 && done === 0) done = n;
    var html = '';
    for (var i = 0; i < n; i++) html += '<i class="' + (i < done ? 'on' : '') + '"></i>';
    return html;
  }

  function dialText() {
    var st = Timer.state();
    if (!st) return U.fmtClock(0);
    if (st.mode === 'pomodoro') return U.fmtClock(Math.round(Timer.remainingMs() / 1000));
    return U.fmtClock(Math.round(Timer.elapsedMs() / 1000));
  }

  function dialSub() {
    var st = Timer.state();
    if (!st) return '还没有开始 · 点下面的「开始」';
    var book = st.bookTitle ? '《' + st.bookTitle + '》' : '未指定书';
    var where = st.mode === 'pomodoro' ? (st.phase === 'rest' ? '休息中' : '专注中 · 第 ' + (st.round + 1) + ' 个番茄') : '计时中';
    return U.escape(where + ' · ' + book);
  }

  function actionsHtml() {
    var st = Timer.state();
    if (!st) return '<button class="btn btn-lg btn-primary" data-act="start">开始</button>';
    if (st.runStartedAt) {
      return '<button class="btn btn-lg" data-act="pause">暂停</button>' +
        '<button class="btn btn-lg btn-primary" data-act="stop">结束并保存</button>';
    }
    return '<button class="btn btn-lg btn-primary" data-act="resume">继续</button>' +
      '<button class="btn btn-lg" data-act="stop">结束并保存</button>';
  }

  /* 关联书 / 番茄设置 */
  function configCard() {
    var st = Timer.state();
    var bookOpts = '<option value="">（不指定书）</option>' + cache.books.map(function (b) {
      var sel = st ? (st.bookId === b.id) : false;
      return '<option value="' + b.id + '"' + (sel ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">这次读的是哪本</div><div class="spacer"></div>' +
      (st ? '<span class="pill">计时中不能改</span>' : '') + '</div>' +
      '<select class="input" id="bookSelect"' + (st ? ' disabled' : '') + '>' + bookOpts + '</select>' +
      '<div class="card-foot"><span class="muted small">选了书，结束时会自动加到那本书的阅读时间上；不选就只记进当天。</span></div>' +
      '</div>';
  }

  /* 今天的记录 */
  function recordsCard() {
    var today = U.todayStr();
    var list = cache.sessions.filter(function (s) {
      return U.dateStr(new Date(s.startTs || s.createdAt || 0)) === today;
    }).sort(function (a, b) { return (b.startTs || 0) - (a.startTs || 0); });

    var st = Data.dayStats(cache, today);
    var rows = list.length ? list.map(function (s) {
      var book = Data.bookById(cache.books, s.bookId);
      var modeLabel = s.mode === 'pomodoro' ? '番茄' : s.mode === 'manual' ? '补记' : '正计时';
      var line = modeLabel + ' · ' + U.fmtTime(s.startTs) + '–' + U.fmtTime(s.endTs || s.startTs) + ' · ' + U.fmtMinutes(s.minutes) + (s.interrupted ? ' · 中断' : '');
      return '<div class="row" data-sid="' + s.id + '">' +
        '<div style="flex:1;min-width:0">' +
        '<div class="row-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
        (book ? U.escape('《' + book.title + '》') : '<span class="muted">（未指定书）</span>') + '</div>' +
        '<div class="row-sub mono">' + U.escape(line) + '</div>' +
        '</div>' +
        '<span class="card-link" data-act="edit-session">改</span>' +
        '<span class="muted" data-act="del-session" style="cursor:pointer">✕</span>' +
        '</div>';
    }).join('') : '<div class="muted small">今天还没有记录。用上面的计时器读一会儿，或者去计划页点「记时长」补一笔。</div>';

    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">今天的计时记录</div><div class="spacer"></div>' +
      '<span class="pill brand">' + U.escape(U.fmtMinutes(st.minutes)) + (st.pomodoros ? ' · ' + st.pomodoros + ' 番茄' : '') + '</span></div>' +
      '<div class="rows">' + rows + '</div>' +
      '<div class="card-foot"><span class="muted small">点「改」能改时长和挂哪本书；点 ✕ 会同时从统计里扣掉。</span></div>' +
      '</div>';
  }

  function tipsCard() {
    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">几个容易踩的点</div></div>' +
      '<div class="rows">' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">切到别的标签页、电脑休眠</div>' +
      '<div class="row-sub">按真实时间算，不会少算也不会多算</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">中间离开很久</div>' +
      '<div class="row-sub">超过 30 分钟毫无动静，下次打开会问你「这段时间算不算」，默认不算</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">关掉页面再打开</div>' +
      '<div class="row-sub">计时不会丢，会接着走（数据存在本机的）</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">番茄钟中途结束</div>' +
      '<div class="row-sub">这一笔会标成「中断」，时长照样记，但不计入番茄个数</div></div></div>' +
      '</div></div>';
  }

  /* ================= 交互 ================= */
  /* 用事件委托：按钮组的内容会被 syncDial 换掉，逐个绑定会丢监听 */
  var delegated = false;

  function wire() {
    U.$$('#modeSeg button', rootEl).forEach(function (b) {
      b.addEventListener('click', function () {
        if (Timer.state()) return;
        mode = b.getAttribute('data-mode');
        render();
      });
    });

    if (!delegated) {
      delegated = true;
      rootEl.addEventListener('click', onActClick);
    }
  }

  function onActClick(e) {
    // 只有当前显示的是计时页时才处理，免得抢了别的页面的按钮
    if (!rootEl.querySelector('#dialTime')) return;
    var el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');

    if (act === 'start') {
      var sel = U.$('#bookSelect', rootEl);
      var id = sel && sel.value ? sel.value : null;
      var b = Data.bookById(cache.books, id);
      Timer.start(mode, id, b ? b.title : '');
      syncDial();
    } else if (act === 'pause') { Timer.pause(); syncDial(); }
    else if (act === 'resume') { Timer.resume(); syncDial(); }
    else if (act === 'stop') { Timer.stopFlow(); }
    else if (act === 'edit-pomo') { editPomodoro(); }
    else if (act === 'edit-session') { editSession(el.closest('[data-sid]').getAttribute('data-sid')); }
    else if (act === 'del-session') { delSession(el.closest('[data-sid]').getAttribute('data-sid')); }
  }

  function findSession(id) {
    for (var i = 0; i < cache.sessions.length; i++) if (cache.sessions[i].id === id) return cache.sessions[i];
    return null;
  }

  function editSession(id) {
    var s = findSession(id);
    if (!s) return;
    var opts = '<option value="">（不指定书）</option>' + cache.books.map(function (b) {
      return '<option value="' + b.id + '"' + (s.bookId === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
    }).join('');
    U.modal({
      title: '改这条记录',
      sub: U.fmtTime(s.startTs) + ' 开始，原记 ' + U.fmtMinutes(s.minutes),
      confirmText: '保存',
      bodyHtml: '<div class="field"><label>读了多久（分钟）</label>' +
        '<input class="input" id="sMin" type="number" min="1" value="' + s.minutes + '" data-autofocus></div>' +
        '<div class="field"><label>算在哪本书上</label><select class="input" id="sBook">' + opts + '</select></div>',
      onOk: function (mask) {
        var min = Number(U.$('#sMin', mask).value) || 0;
        if (min <= 0) { U.toast('填一个大于 0 的数'); return false; }
        return Store.put('sessions', Object.assign({}, s, {
          minutes: min,
          bookId: U.$('#sBook', mask).value || null
        })).then(function () { U.toast('改好了'); return refresh(); });
      }
    });
  }

  function delSession(id) {
    var s = findSession(id);
    if (!s) return;
    U.confirm('删掉这条记录？', '会同时从今天的统计里扣掉 ' + U.fmtMinutes(s.minutes) + '。', '删掉', true).then(function (ok) {
      if (!ok) return;
      return Store.remove('sessions', id).then(function () { U.toast('删掉了'); return refresh(); });
    });
  }

  function editPomodoro() {
    var c = Timer.config();
    U.modal({
      title: '番茄钟设置',
      sub: '改完对下一次计时生效',
      confirmText: '保存',
      bodyHtml:
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>专注（分钟）</label><input class="input" id="pFocus" type="number" min="1" value="' + c.focus + '"></div>' +
        '<div class="field" style="flex:1"><label>休息（分钟）</label><input class="input" id="pRest" type="number" min="1" value="' + c.rest + '"></div>' +
        '</div>' +
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>长休息（分钟）</label><input class="input" id="pLong" type="number" min="1" value="' + c.longRest + '"></div>' +
        '<div class="field" style="flex:1"><label>每几轮一次长休息</label><input class="input" id="pRounds" type="number" min="1" value="' + c.rounds + '"></div>' +
        '</div>',
      onOk: function (mask) {
        var p = {
          focus: Number(U.$('#pFocus', mask).value) || 25,
          rest: Number(U.$('#pRest', mask).value) || 5,
          longRest: Number(U.$('#pLong', mask).value) || 15,
          rounds: Number(U.$('#pRounds', mask).value) || 4
        };
        return Store.saveSettings({ pomodoro: p }).then(function () {
          if (global.Timer) Timer.setConfig(p);
          if (App.settings) App.settings.pomodoro = p;
          U.toast('改好了');
          if (global.App && App.refresh) App.refresh();
          else refresh();
          return true;
        });
      }
    });
  }

  /* 设置页也要用同一个弹窗 */
  Pages.pomodoroDialog = editPomodoro;

  /* ================= 每秒刷新 ================= */
  function syncDial() {
    var t = U.$('#dialTime', rootEl);
    if (!t) return;
    t.textContent = dialText();
    var sub = U.$('#dialSub', rootEl);
    if (sub) sub.innerHTML = dialSub();

    var act = U.$('#timerActions', rootEl);
    if (act) {
      var want = actionsHtml();
      if (act.innerHTML !== want) act.innerHTML = want;
    }
    var dots = U.$('#tomatoDots', rootEl);
    if (dots) {
      var wantDots = dotsHtml();
      if (dots.innerHTML !== wantDots) dots.innerHTML = wantDots;
    }
  }

  /* 订阅一次就够，页面不在时啥也不做 */
  Timer.subscribe(function () {
    if (!rootEl || !document.body.contains(rootEl)) return;
    syncDial();
  });

  function refresh() {
    return Data.load().then(function (d) { cache = d; render(); });
  }
})(window);
