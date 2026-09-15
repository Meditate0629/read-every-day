/* 提醒引擎
 * 只在页面开着的时候才真的弹；没开的时候下次打开会把错过的收进"收件箱"。
 */
(function (global) {
  'use strict';

  var Reminders = {};
  var dock = null;
  var collapsed = false;
  var collapseTimer = null;
  var started = false;
  var soundOn = true;

  var WEEK = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  Reminders.WEEK = WEEK;
  Reminders.DEFAULT_TIME = '21:00';

  /* ================= 什么时候该响 ================= */
  /* 1=周一 ... 7=周日 */
  function weekdayOf(dateStr) {
    return ((U.parseDate(dateStr).getDay() + 6) % 7) + 1;
  }

  Reminders.weekdayOf = weekdayOf;

  Reminders.dueAt = function (rm, date, data, now) {
    if (rm.enabled === false) return null;
    var hm = String(rm.time || Reminders.DEFAULT_TIME).split(':');
    var dt = U.parseDate(date);
    dt.setHours(Number(hm[0]) || 0, Number(hm[1]) || 0, 0, 0);
    var ts = dt.getTime();
    var wd = weekdayOf(date);

    if (rm.kind === 'daily') {
      if (rm.weekdays && rm.weekdays.length && rm.weekdays.indexOf(wd) < 0) return null;
      return ts;
    }
    if (rm.kind === 'weekly') {
      return Number(rm.weekday) === wd ? ts : null;
    }
    if (rm.kind === 'once') {
      return rm.date === date ? ts : null;
    }
    if (rm.kind === 'monthEnd') {
      var days = U.monthDays(date);
      var n = Number(rm.lastDays) || 3;
      return U.parseDate(date).getDate() > days - n ? ts : null;
    }
    if (rm.kind === 'progress') {
      var b = Data.bookById(data.books, rm.bookId);
      if (!b) return null;
      var reached = Data.progress(b) >= (Number(rm.threshold) || 50);
      return reached ? (now || Date.now()) : null;
    }
    return null;
  };

  /* ================= 到时候说什么 ================= */
  function weekSummaryText(data) {
    var start = U.addDays(U.todayStr(), -6);
    var today = U.todayStr();
    var min = 0, times = 0;
    data.sessions.forEach(function (s) {
      var d = U.dateStr(new Date(s.startTs || s.createdAt || 0));
      if (d >= start && d <= today) { min += Number(s.minutes) || 0; times++; }
    });
    return '这周读了 ' + times + ' 次，共 ' + (min ? U.fmtMinutes(min) : '0 分钟');
  }

  function monthGapText(data) {
    var month = Data.monthKey(U.todayStr());
    var st = Data.monthStats(data, month);
    var goal = Data.monthGoal(data.goals, month);
    if (!goal) return '这个月还没设目标，去计划页设一个吧';
    var left = goal - st.minutes;
    return left > 0 ? '本月还差 ' + U.fmtMinutes(left) + ' 就到目标了' : '本月目标已经达成了';
  }

  function progressText(rm, data) {
    var b = Data.bookById(data.books, rm.bookId);
    if (!b) return '这本书已经不在书单里了';
    return '《' + b.title + '》已经读到 ' + Data.progress(b) + '% 了';
  }

  Reminders.labelFor = function (rm, data) {
    if (rm.kind === 'weekly') return weekSummaryText(data);
    if (rm.kind === 'monthEnd') return monthGapText(data);
    if (rm.kind === 'progress') return progressText(rm, data);
    return rm.text || '该读书了';
  };

  /* 这条提醒"平时叫什么"，给列表用 */
  Reminders.kindLabel = function (kind) {
    return { daily: '每天', weekly: '每周', once: '一次性', monthEnd: '每月末', progress: '进度' }[kind] || kind;
  };

  /* ================= 定时检查 ================= */
  function keyOf(rmId, date) { return rmId + '@' + date; }

  Reminders.check = function (firstRun) {
    return Promise.all([Store.all('reminders'), Store.all('reminderLog'), Data.load()]).then(function (r) {
      var rems = r[0], logs = r[1], data = r[2];
      var now = Date.now();
      var today = U.todayStr();

      var byKey = {}, byReminder = {};
      logs.forEach(function (l) { byKey[keyOf(l.reminderId, l.date)] = true; byReminder[l.reminderId] = true; });

      var fresh = [];
      rems.forEach(function (rm) {
        if (rm.enabled === false) return;
        var skipped = rm.skippedOn || [];

        // 进度型：达到条件就提醒一次，然后不再重复
        if (rm.kind === 'progress') {
          if (byReminder[rm.id]) return;
          if (skipped.indexOf(today) >= 0) return;
          var dueP = Reminders.dueAt(rm, today, data, now);
          if (dueP) fresh.push(makeLog(rm, today, dueP, false, data));
          return;
        }

        // 今天的：过了点还没生成过记录就算一条
        if (skipped.indexOf(today) < 0 && !byKey[keyOf(rm.id, today)]) {
          var due = Reminders.dueAt(rm, today, data, now);
          if (due && due <= now) {
            // 刚打开 App 时，今天已经过去的那些算"错过"，不弹窗轰炸
            fresh.push(makeLog(rm, today, due, !!firstRun, data));
          }
        }

        // 往回 7 天，把错过的补进收件箱
        // 注意：这条提醒是哪天建的，就只能从那天算起 —— 不然新建一条提醒会凭空"补"出前 7 天的错过
        var bornOn = rm.createdAt ? U.dateStr(new Date(rm.createdAt)) : null;
        for (var i = 1; i <= 7; i++) {
          var d = U.addDays(today, -i);
          if (bornOn && d < bornOn) continue;
          if (skipped.indexOf(d) >= 0) continue;
          if (byKey[keyOf(rm.id, d)]) continue;
          var due2 = Reminders.dueAt(rm, d, data, now);
          if (due2 && due2 <= now) fresh.push(makeLog(rm, d, due2, true, data));
        }
      });

      if (!fresh.length) return [];
      return Store.putMany('reminderLog', fresh).then(function () { return fresh; });
    }).then(function (fresh) {
      if (fresh.length) {
        var live = fresh.filter(function (l) { return !l.missed; });
        if (live.length && soundOn && live.some(function (l) { return l.sound !== false; })) {
          if (Timer && Timer.chime) Timer.chime(2);
        }
      }
      return refreshDock();
    }).catch(function () { /* 出错也不要影响别的功能 */ });
  };

  function makeLog(rm, date, due, missed, data) {
    return {
      reminderId: rm.id,
      date: date,
      dueAt: due,
      kind: rm.kind,
      text: Reminders.labelFor(rm, data),
      sound: rm.sound !== false,
      missed: !!missed,
      handled: null,
      handledAt: null
    };
  }

  /* ================= 未处理的 ================= */
  Reminders.pending = function () {
    return Store.all('reminderLog').then(function (logs) {
      return logs.filter(function (l) { return !l.handled; })
        .sort(function (a, b) { return (b.dueAt || 0) - (a.dueAt || 0); });
    });
  };

  /* ================= 处理 ================= */
  Reminders.handle = function (log, action) {
    if (!log || !log.id) return Promise.resolve();
    if (action === 'snooze') {
      return Store.put('reminderLog', Object.assign({}, log, { snoozeUntil: Date.now() + 15 * 60000 })).then(refreshDock);
    }
    var patch = { handled: action, handledAt: Date.now() };
    var p = Store.put('reminderLog', Object.assign({}, log, patch));
    if (action === 'skipped') {
      p = p.then(function () {
        return Store.get('reminders', log.reminderId).then(function (rm) {
          if (!rm) return;
          var sk = (rm.skippedOn || []).slice();
          if (sk.indexOf(log.date) < 0) sk.push(log.date);
          return Store.put('reminders', Object.assign({}, rm, { skippedOn: sk }));
        });
      });
    }
    return p.then(refreshDock);
  };

  /* 改了提醒的时间之后重新判定今天这一次：
   * 今天你已经被打扰过一次了，所以重新生成的记录直接进收件箱，不再弹窗。 */
  Reminders.rearm = function (reminder) {
    var today = U.todayStr();
    return Store.all('reminderLog').then(function (logs) {
      var mine = logs.filter(function (l) { return l.reminderId === reminder.id && l.date === today; });
      return mine.reduce(function (p, l) {
        return p.then(function () { return Store.remove('reminderLog', l.id); });
      }, Promise.resolve());
    }).then(function () {
      return Data.load();
    }).then(function (data) {
      var due = Reminders.dueAt(reminder, today, data, Date.now());
      if (!due || due > Date.now()) return null;
      return Store.put('reminderLog', {
        reminderId: reminder.id, date: today, dueAt: due,
        kind: reminder.kind, text: Reminders.labelFor(reminder, data),
        sound: reminder.sound !== false, missed: true, handled: null, handledAt: null
      });
    }).then(function () { return refreshDock(); });
  };

  /* 顺延到明天：给明天再排一条一样的 */
  Reminders.deferToTomorrow = function (log) {
    var tomorrow = U.addDays(log.date, 1);
    return Store.put('reminders', {
      kind: 'once', text: log.text, date: tomorrow,
      time: U.fmtTime24(log.dueAt || Date.now()),
      sound: log.sound !== false, enabled: true, skippedOn: []
    }).then(function () {
      return Store.put('reminderLog', Object.assign({}, log, { handled: 'deferred', handledAt: Date.now() }));
    }).then(function () {
      U.toast('明天再提醒你一次');
      return refreshDock();
    });
  };

  /* 补记完成：给那一天补一笔阅读时长 */
  Reminders.logFor = function (log, minutes, bookId) {
    var ts = U.parseDate(log.date); ts.setHours(12, 0, 0, 0);
    return Store.put('sessions', {
      date: log.date, startTs: ts.getTime(), endTs: ts.getTime() + minutes * 60000,
      minutes: minutes, bookId: bookId || null, mode: 'manual', fromReminder: log.id
    }).then(function () {
      return Store.put('reminderLog', Object.assign({}, log, { handled: 'logged', handledAt: Date.now() }));
    }).then(function () {
      U.toast('给 ' + U.fmtDateShort(log.date) + ' 补了 ' + U.fmtMinutes(minutes));
      return refreshDock();
    });
  };

  /* ================= 接下来会响什么 ================= */
  Reminders.upcoming = function (data, limit) {
    var out = [];
    var now = Date.now();
    var today = U.todayStr();
    for (var i = 0; i <= 40; i++) {
      var d = U.addDays(today, i);
      data.reminders.forEach(function (rm) {
        if (rm.enabled === false) return;
        if ((rm.skippedOn || []).indexOf(d) >= 0) return;
        var due = Reminders.dueAt(rm, d, data, now);
        if (!due || due <= now) return;
        out.push({ at: due, date: d, text: Reminders.labelFor(rm, data), kind: rm.kind });
      });
      if (out.length >= (limit || 3) * 3) break;
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, limit || 3);
  };

  /* ================= 右下角弹窗 ================= */
  function refreshDock() {
    if (!dock) return;
    return Reminders.pending().then(function (list) {
      var now = Date.now();
      var live = list.filter(function (l) {
        return !l.missed && (!l.snoozeUntil || l.snoozeUntil <= now);
      });
      if (!live.length) {
        dock.innerHTML = '';
        collapsed = false;
        clearTimeout(collapseTimer);
        return;
      }
      if (collapsed) {
        dock.innerHTML = '<button class="dock-bell" data-dock="expand" title="提醒">' +
          '<svg><use href="#i-bell"/></svg>' +
          (live.length > 1 ? '<span class="badge">' + live.length + '</span>' : '') +
          '</button>';
        return;
      }

      var head, body, actions;
      if (live.length === 1) {
        var l = live[0];
        head = '提醒';
        body = '<p>' + U.escape(l.text) + '</p>';
        actions = '<button class="btn btn-primary" data-dock="timer" data-log="' + l.id + '">开始计时</button>' +
          '<button class="btn" data-dock="snooze" data-log="' + l.id + '">稍后</button>' +
          '<button class="btn btn-ghost" data-dock="known" data-log="' + l.id + '">知道了</button>';
      } else {
        head = '你有 ' + live.length + ' 条提醒';
        body = '<div class="dock-list">' + live.slice(0, 4).map(function (l) {
          return '<div>' + U.escape(l.text) + '</div>';
        }).join('') + (live.length > 4 ? '<div>还有 ' + (live.length - 4) + ' 条…</div>' : '') + '</div>';
        actions = '<button class="btn btn-primary" data-dock="page">去处理</button>' +
          '<button class="btn btn-ghost" data-dock="knownAll">全部知道了</button>';
      }

      dock.innerHTML = '<div class="dock-popup">' +
        '<h4><svg style="width:16px;height:16px;vertical-align:-3px;margin-right:2px"><use href="#i-bell"/></svg>' + U.escape(head) + '</h4>' +
        body +
        '<div class="dock-actions">' + actions + '</div>' +
        '</div>';

      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(function () {
        if (Reminders.isOpenPage && Reminders.isOpenPage()) return;   // 正停在提醒页就不收起来
        collapsed = true;
        refreshDock();
      }, 30000);
    });
  }
  Reminders.refresh = refreshDock;

  function findLog(id) {
    return Store.get('reminderLog', id);
  }

  function onDockClick(e) {
    var el = e.target.closest && e.target.closest('[data-dock]');
    if (!el) return;
    var act = el.getAttribute('data-dock');
    var logId = el.getAttribute('data-log');

    if (act === 'expand') { collapsed = false; refreshDock(); return; }
    if (act === 'page') { location.hash = '#/reminders'; dock.innerHTML = ''; return; }
    if (act === 'knownAll') {
      Reminders.pending().then(function (list) {
        return list.reduce(function (p, l) {
          return p.then(function () { return Store.put('reminderLog', Object.assign({}, l, { handled: 'known', handledAt: Date.now() })); });
        }, Promise.resolve());
      }).then(function () { U.toast('都记下了'); return refreshDock(); });
      return;
    }
    if (!logId) return;
    findLog(logId).then(function (log) {
      if (!log) return refreshDock();
      if (act === 'known') return Reminders.handle(log, 'known');
      if (act === 'snooze') { U.toast('15 分钟后再提醒你'); return Reminders.handle(log, 'snooze'); }
      if (act === 'timer') {
        return Reminders.handle(log, 'known').then(function () {
          if (location.hash === '#/timer') {
            if (global.App && App.refresh) App.refresh();
          } else {
            location.hash = '#/timer';
          }
          setTimeout(function () {
            if (global.Timer && !Timer.state()) Timer.start('stopwatch', null, '');
          }, 220);
        });
      }
    });
  }

  /* ================= 启动 ================= */
  Reminders.init = function (settings) {
    if (started) return;
    started = true;
    dock = document.getElementById('reminderDock');
    soundOn = settings ? settings.sound !== false : true;
    if (dock) dock.addEventListener('click', onDockClick);
    if (global.Timer && Timer.setConfig) Timer.setConfig(null, soundOn);

    Reminders.check(true).then(function () {
      // 检查完了再看看今天后面的
      return refreshDock();
    });
    setInterval(function () {
      Reminders.check(false);
    }, 30000);
  };

  Reminders.setSound = function (on) { soundOn = !!on; };

  /* 正停在提醒页的时候，弹窗不要自己缩成小铃铛 */
  Reminders.isOpenPage = function () { return String(location.hash).indexOf('/reminders') >= 0; };

  global.Reminders = Reminders;
})(window);
