/* 计时引擎：正计时 + 番茄钟
 * 它是全局的 —— 你在哪个页面都照走，侧边栏底下一直有一条迷你计时条。
 * 全部按真实时间戳算，切标签页、电脑休眠都不会算错。
 */
(function (global) {
  'use strict';

  var Timer = {};
  var state = null;
  var handle = null;
  var subs = [];
  var lastSig = '';
  var chimeCtx = null;
  var soundOn = true;
  var cfg = { focus: 25, rest: 5, longRest: 15, rounds: 4 };
  var GAP_LIMIT = 30 * 60000;      // 离开超过 30 分钟就问一句

  /* ================= 基本读数 ================= */
  Timer.state = function () { return state; };
  Timer.isRunning = function () { return !!(state && state.runStartedAt); };

  Timer.elapsedMs = function () {
    if (!state) return 0;
    return (state.accumulatedMs || 0) + (state.runStartedAt ? Date.now() - state.runStartedAt : 0);
  };

  Timer.targetMs = function () {
    if (!state || state.mode !== 'pomodoro') return 0;
    var c = state.pomodoro || cfg;
    if (state.phase === 'rest') {
      var isLong = c.rounds > 0 && state.round > 0 && state.round % c.rounds === 0;
      return (isLong ? c.longRest : c.rest) * 60000;
    }
    return c.focus * 60000;
  };

  /* 还剩多少毫秒（正计时返回 0） */
  Timer.remainingMs = function () {
    if (!state || state.mode !== 'pomodoro') return 0;
    return Math.max(0, Timer.targetMs() - Timer.elapsedMs());
  };

  Timer.subscribe = function (fn) {
    subs.push(fn);
    return function () { subs = subs.filter(function (f) { return f !== fn; }); };
  };
  function emit() { subs.forEach(function (f) { try { f(state); } catch (e) { } }); }

  Timer.setConfig = function (pomodoro, sound) {
    if (pomodoro) cfg = Object.assign({}, cfg, pomodoro);
    if (sound != null) soundOn = !!sound;
  };
  Timer.config = function () { return cfg; };

  /* ================= 控制 ================= */
  Timer.start = function (mode, bookId, bookTitle) {
    if (state) return false;
    state = {
      mode: mode || 'stopwatch',
      phase: 'focus',
      accumulatedMs: 0,
      runStartedAt: Date.now(),
      startedAt: Date.now(),
      round: 0,
      bookId: bookId || null,
      bookTitle: bookTitle || '',
      lastTick: Date.now(),
      lastSaved: 0,
      pomodoro: Object.assign({}, cfg)
    };
    warmUpAudio();
    beginTick();
    lastSig = '';
    renderMini();
    emit();
    return persist();
  };

  Timer.pause = function () {
    if (!state || !state.runStartedAt) return;
    state.accumulatedMs = Timer.elapsedMs();
    state.runStartedAt = null;
    lastSig = '';
    renderMini(); emit(); persist();
  };

  Timer.resume = function () {
    if (!state || state.runStartedAt) return;
    state.runStartedAt = Date.now();
    warmUpAudio();
    lastSig = '';
    renderMini(); emit(); persist();
  };

  /* 停掉并返回这笔记录（不写库，交给调用方决定） */
  Timer.stop = function () {
    if (!state) return null;
    var ms = Timer.elapsedMs();
    var target = Timer.targetMs();
    var s = {
      date: U.dateStr(new Date(state.startedAt)),
      startTs: state.startedAt,
      endTs: Date.now(),
      minutes: Math.round(ms / 60000),
      bookId: state.bookId || null,
      bookTitle: state.bookTitle || '',
      mode: state.mode,
      interrupted: state.mode === 'pomodoro' && ms < target - 1000
    };
    state = null;
    endTick();
    lastSig = '';
    renderMini();
    emit();
    persist();
    return s;
  };

  /* 页面/迷你条统一走这个：停掉 + 弹结算框 */
  Timer.stopFlow = function () {
    var s = Timer.stop();
    if (!s) return null;
    settlement(s);
    return s;
  };

  /* 直接丢掉当前计时（不记） */
  Timer.discard = function () {
    state = null;
    endTick();
    lastSig = '';
    renderMini();
    emit();
    persist();
  };

  /* ================= 计时循环 ================= */
  function beginTick() {
    endTick();
    handle = setInterval(tick, 1000);
  }
  function endTick() {
    if (handle) { clearInterval(handle); handle = null; }
  }

  function tick() {
    if (!state) { endTick(); return; }
    if (state.mode === 'pomodoro' && state.runStartedAt) {
      if (Timer.elapsedMs() >= Timer.targetMs()) {
        completePhase();
        return;
      }
    }
    if (state.runStartedAt && Date.now() - (state.lastSaved || 0) > 30000) persist();
    renderMini();
    emit();
  }

  /* ================= 番茄钟的两个阶段 ================= */
  function completePhase() {
    var target = Timer.targetMs();
    var phase = state.phase;
    var running = state.runStartedAt;
    var phaseStart = running || Date.now();
    var bookId = state.bookId, bookTitle = state.bookTitle, round = state.round;

    // 阶段结束，先停下来
    state.accumulatedMs = 0;
    state.runStartedAt = null;
    lastSig = '';
    chime(phase === 'focus' ? 2 : 1);

    if (phase === 'focus') {
      Store.put('sessions', {
        date: U.dateStr(new Date(phaseStart)),
        startTs: phaseStart,
        endTs: Date.now(),
        minutes: Math.round(target / 60000),
        bookId: bookId,
        mode: 'pomodoro',
        interrupted: false
      }).then(function () {
        state.round = round + 1;
        persist();
        renderMini();
        emit();
        finishFocusModal(bookTitle, state.round);
      });
      return;
    }

    renderMini();
    emit();
    restDoneModal();
  }

  function finishFocusModal(bookTitle, round) {
    var n = cfg.rounds;
    var isLong = n > 0 && round > 0 && round % n === 0;
    U.modal({
      title: '番茄完成',
      sub: (bookTitle ? '《' + bookTitle + '》 · ' : '') + '已经记下第 ' + round + ' 个番茄',
      confirmText: '开始休息' + (isLong ? '（长休息）' : ''),
      cancelText: '今天先到这',
      bodyHtml:
        '<div class="tomato-dots" style="justify-content:flex-start">' +
        Array.from({ length: n }, function (_, i) { return '<i class="' + (i < (round % n || n) ? 'on' : '') + '"></i>'; }).join('') +
        '</div>' +
        '<div class="mt14"><button class="btn btn-sm" data-pomo="next" type="button">直接下一个专注</button></div>',
      onOk: function () { startRest(); return true; }
    }).then(function () {
      // 用户点了"今天先到这"（取消）→ 结束计时
      if (state && !state.runStartedAt && state.phase === 'focus') Timer.discard();
    });
  }

  function startRest() {
    if (!state) return;
    state.phase = 'rest';
    state.accumulatedMs = 0;
    state.runStartedAt = Date.now();
    lastSig = '';
    renderMini(); emit(); persist();
  }

  function startFocus() {
    if (!state) return;
    state.phase = 'focus';
    state.accumulatedMs = 0;
    state.runStartedAt = Date.now();
    lastSig = '';
    renderMini(); emit(); persist();
  }

  function restDoneModal() {
    U.modal({
      title: '休息结束',
      sub: '准备好就读下一个番茄吧。',
      confirmText: '开始下一个专注',
      cancelText: '今天先到这',
      onOk: function () { startFocus(); return true; }
    });
  }

  /* ================= 迷你计时条 ================= */
  function bookLabel() {
    if (!state) return '';
    return state.bookTitle ? '《' + state.bookTitle + '》' : '未指定书';
  }

  function renderMini() {
    var box = U.$('#miniTimer');
    if (!box) return;
    if (!state) { if (box.innerHTML) box.innerHTML = ''; lastSig = ''; return; }

    var isRest = state.mode === 'pomodoro' && state.phase === 'rest';
    var running = !!state.runStartedAt;
    var sig = state.mode + '|' + state.phase + '|' + (running ? 'r' : 'p') + '|' + bookLabel();

    var text = state.mode === 'pomodoro'
      ? U.fmtClock(Math.round(Timer.remainingMs() / 1000))
      : U.fmtClock(Math.round(Timer.elapsedMs() / 1000));

    if (sig !== lastSig) {
      lastSig = sig;
      box.innerHTML =
        '<div class="mini-timer' + (isRest ? ' rest' : '') + '">' +
        '<div class="mini-timer-time">' + text + '</div>' +
        '<div class="mini-timer-meta">' + U.escape((isRest ? '休息中' : state.mode === 'pomodoro' ? '专注中' : '计时中') + ' · ' + bookLabel()) + '</div>' +
        '<div class="mini-timer-actions">' +
        '<button data-timer="' + (running ? 'pause' : 'resume') + '">' + (running ? '暂停' : '继续') + '</button>' +
        '<button data-timer="stop">结束</button>' +
        '</div></div>';
    } else {
      var tEl = box.querySelector('.mini-timer-time');
      if (tEl) tEl.textContent = text;
    }
  }

  /* ================= 结算 ================= */
  function settlement(s) {
    if (!s) return;
    if (s.minutes <= 0) { U.toast('不到一分钟，这次就不记了'); return; }

    U.modal({
      title: '这次读了 ' + U.fmtMinutes(s.minutes),
      sub: (s.bookTitle ? '《' + s.bookTitle + '》' : '没有指定书') + (s.interrupted ? ' · 中途结束' : ''),
      confirmText: '记下来',
      cancelText: '丢弃这次记录',
      bodyHtml:
        '<div class="muted small">· 会计进今天的阅读时长' + (s.bookTitle ? '，也会加到这本书头上' : '') + '</div>' +
        (s.bookTitle
          ? '<div class="row-flex mt14" style="gap:8px"><input type="checkbox" id="stPage"> <span class="small">顺手更新这本书的页码</span>' +
            '<input class="input" style="width:96px" id="stPageNum" placeholder="p. ___"></div>'
          : '') +
        '<div class="row-flex mt10" style="gap:8px"><input type="checkbox" id="stNote"> <span class="small">顺手写一条笔记</span></div>',
      onOk: function (mask) {
        return Store.put('sessions', {
          date: s.date, startTs: s.startTs, endTs: s.endTs,
          minutes: s.minutes, bookId: s.bookId || null,
          mode: s.mode, interrupted: !!s.interrupted
        }).then(function () {
          var pg = U.$('#stPage', mask);
          var pgNum = U.$('#stPageNum', mask);
          var wantPage = pg && pg.checked && pgNum && Number(pgNum.value) > 0;
          if (wantPage) {
            return Store.get('books', s.bookId).then(function (b) {
              if (!b) return;
              var now = Number(pgNum.value);
              var total = Number(b.totalPages) || 0;
              var done = total > 0 && now >= total;
              return Store.put('books', Object.assign({}, b, {
                pageNow: now,
                status: done ? 'done' : (b.status === 'done' ? 'reading' : b.status),
                finishedAt: done ? (b.finishedAt || U.todayStr()) : b.finishedAt
              }));
            });
          }
        }).then(function () {
          U.toast('记下了 ' + U.fmtMinutes(s.minutes));
          var noteEl = U.$('#stNote', mask);
          if (noteEl && noteEl.checked) {
            if (Pages.notesNew) Pages.notesNew(s.bookId || null);
            location.hash = '#/notes';
          }
          if (location.hash === '#/timer' && App.refresh) App.refresh();
          return true;
        });
      }
    });
  }

  /* ================= 声音 ================= */
  Timer.chime = function (times) { chime(times); };

  function warmUpAudio() {
    if (!soundOn) return;
    try {
      if (!chimeCtx) chimeCtx = new (global.AudioContext || global.webkitAudioContext)();
      if (chimeCtx.state === 'suspended') chimeCtx.resume();
    } catch (e) { chimeCtx = null; }
  }

  function chime(times) {
    if (!soundOn) return;
    try {
      warmUpAudio();
      if (!chimeCtx) return;
      var t = chimeCtx.currentTime;
      for (var i = 0; i < (times || 1); i++) {
        var o = chimeCtx.createOscillator();
        var g = chimeCtx.createGain();
        o.type = 'sine';
        o.frequency.value = i % 2 === 0 ? 880 : 660;
        o.connect(g); g.connect(chimeCtx.destination);
        g.gain.setValueAtTime(0.0001, t + i * 0.28);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.03 + i * 0.28);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 + i * 0.28);
        o.start(t + i * 0.28);
        o.stop(t + 0.6 + i * 0.28);
      }
    } catch (e) { /* 出不了声不影响计时 */ }
  }

  /* ================= 存取 ================= */
  function persist() {
    if (state) state.lastSaved = Date.now();
    return Store.saveSettings({ activeTimer: state }).catch(function () { });
  }

  /* 关掉再打开时把计时恢复回来 */
  Timer.restore = function (settings) {
    Timer.setConfig(settings.pomodoro, settings.sound);
    var a = settings.activeTimer;
    if (!a) return Promise.resolve(false);
    state = a;
    state.lastSaved = a.lastSaved || 0;
    beginTick();
    lastSig = '';

    var gap = a.runStartedAt ? Date.now() - (a.lastTick || a.lastSaved || a.runStartedAt) : 0;
    if (a.runStartedAt && gap > GAP_LIMIT) {
      // 注意：state 和 a 是同一个对象，必须先取值再改，否则算出来会是从 1970 年开始的时长
      var from = a.runStartedAt;
      var acc = a.accumulatedMs || 0;
      var lastMove = a.lastTick || a.lastSaved || from;
      state.runStartedAt = null;   // 先停住，等用户决定
      renderMini(); emit();
      return U.modal({
        title: '你刚才离开了一段时间',
        sub: '计时器还开着，但中间有 ' + U.fmtMinutes(Math.round(gap / 60000)) + ' 完全没动静。',
        confirmText: '不算进去',
        cancelText: '算进去',
        onOk: function () {
          // 只算到"最后一次有动静"的时候
          state.accumulatedMs = acc + Math.max(0, lastMove - from);
          return true;
        }
      }).then(function (v) {
        if (!v) {
          // 用户选了"算进去"：把整段空白也算上，并继续走
          state.accumulatedMs = acc + Math.max(0, Date.now() - from);
          state.runStartedAt = Date.now();
        }
        lastSig = '';
        renderMini(); emit(); persist();
        return true;
      });
    }

    if (a.runStartedAt) { lastSig = ''; renderMini(); emit(); }
    return Promise.resolve(true);
  };

  /* ================= 迷你条上的按钮 ================= */
  document.addEventListener('click', function (e) {
    var p = e.target.closest && e.target.closest('[data-pomo="next"]');
    if (p) {
      var mask = p.closest('.modal-mask');
      if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
      startFocus();
      return;
    }
    var b = e.target.closest && e.target.closest('[data-timer]');
    if (!b) return;
    var act = b.getAttribute('data-timer');
    if (act === 'pause') Timer.pause();
    else if (act === 'resume') Timer.resume();
    else if (act === 'stop') Timer.stopFlow();
  });

  global.Timer = Timer;
})(window);
