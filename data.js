/* 业务数据的小工具：统计、进度、书本状态 */
(function (global) {
  'use strict';

  var Data = {};

  Data.load = function () {
    return Promise.all([
      Store.all('books'),
      Store.all('planItems'),
      Store.all('sessions'),
      Store.all('notes'),
      Store.all('goals'),
      Store.all('memos'),
      Store.all('reminders'),
      Store.all('reminderLog')
    ]).then(function (r) {
      return {
        books: r[0], planItems: r[1], sessions: r[2], notes: r[3],
        goals: r[4], memos: r[5], reminders: r[6], reminderLog: r[7]
      };
    });
  };

  /* ---------- 状态文字 ---------- */
  Data.STATUS = {
    want: '想读',
    reading: '在读',
    done: '读完',
    paused: '搁置'
  };

  /* ---------- 书本 ---------- */
  Data.bookById = function (books, id) {
    if (!id) return null;
    for (var i = 0; i < books.length; i++) if (books[i].id === id) return books[i];
    return null;
  };

  Data.bookName = function (books, id) {
    var b = Data.bookById(books, id);
    return b ? '《' + b.title + '》' : '';
  };

  Data.progress = function (book) {
    if (!book) return 0;
    if (book.status === 'done') return 100;
    var total = Number(book.totalPages) || 0;
    var now = Number(book.pageNow) || 0;
    if (total > 0) return Math.max(0, Math.min(100, Math.round(now / total * 100)));
    return 0;
  };

  Data.readingBooks = function (books) {
    return books.filter(function (b) { return b.status === 'reading'; });
  };

  Data.shelfBooks = function (books) {
    return books.filter(function (b) { return b.status === 'want'; });
  };

  Data.booksOfMonth = function (books, month) {
    return books.filter(function (b) { return b.planMonth === month; });
  };

  /* ---------- 计时时间戳落在哪一天 ---------- */
  function dayOfSession(s) {
    var ts = s.startTs || s.endTs || s.createdAt || 0;
    return U.dateStr(new Date(ts));
  }

  /* ---------- 某天的统计 ---------- */
  Data.dayStats = function (data, date) {
    var minutes = 0, pomodoros = 0;
    data.sessions.forEach(function (s) {
      if (dayOfSession(s) !== date) return;
      minutes += Number(s.minutes) || 0;
      if (s.mode === 'pomodoro' && !s.interrupted) pomodoros += 1;
    });

    var items = data.planItems.filter(function (it) { return it.date === date && !it.deferredTo; });
    var pages = 0, doneCount = 0;
    items.forEach(function (it) {
      if (!it.done) return;
      doneCount += 1;
      if (it.targetType === 'pages') pages += Number(it.actual != null ? it.actual : it.targetValue) || 0;
      if (it.targetType === 'pomodoros' && !pomodoros) pomodoros += Number(it.actual != null ? it.actual : it.targetValue) || 0;
    });

    return {
      date: date,
      minutes: minutes,
      pages: pages,
      pomodoros: pomodoros,
      items: items,
      doneCount: doneCount,
      total: items.length
    };
  };

  /* ---------- 某月 ---------- */
  Data.monthKey = function (date) { return String(date).slice(0, 7); };

  Data.monthStats = function (data, month) {
    var minutes = 0, days = 0, pages = 0;
    var perDay = {};
    data.sessions.forEach(function (s) {
      var d = dayOfSession(s);
      if (Data.monthKey(d) !== month) return;
      minutes += Number(s.minutes) || 0;
      perDay[d] = (perDay[d] || 0) + (Number(s.minutes) || 0);
    });
    var doneDays = {};
    data.planItems.forEach(function (it) {
      if (Data.monthKey(it.date) !== month) return;
      if (it.targetType === 'pages' && it.done) pages += Number(it.actual != null ? it.actual : it.targetValue) || 0;
      if (it.done) doneDays[it.date] = true;
    });
    days = Object.keys(doneDays).length;
    return { month: month, minutes: minutes, pages: pages, doneDays: days, perDay: perDay };
  };

  /* ---------- 某年 ---------- */
  Data.yearStats = function (data, year) {
    var y = String(year);
    var minutes = 0;
    data.sessions.forEach(function (s) {
      if (String(dayOfSession(s)).slice(0, 4) === y) minutes += Number(s.minutes) || 0;
    });
    var finished = data.books.filter(function (b) {
      return b.status === 'done' && String(b.finishedAt || '').slice(0, 4) === y;
    });
    return { year: y, minutes: minutes, finished: finished, count: finished.length };
  };

  /* ---------- 目标 ---------- */
  Data.yearGoalId = function (year) { return 'year-' + year; };
  Data.monthGoalId = function (month) { return 'month-' + month; };

  Data.getGoal = function (goals, id) {
    for (var i = 0; i < goals.length; i++) if (goals[i].id === id) return goals[i];
    return null;
  };

  Data.yearGoal = function (goals, year) {
    var g = Data.getGoal(goals, Data.yearGoalId(year));
    return (g && Number(g.books)) || 0;
  };

  Data.monthGoal = function (goals, month) {
    var g = Data.getGoal(goals, Data.monthGoalId(month));
    return (g && Number(g.minutes)) || 0;
  };

  Data.setYearGoal = function (year, books) {
    return Store.put('goals', { id: Data.yearGoalId(year), year: String(year), books: Number(books) || 0 });
  };

  Data.setMonthGoal = function (month, minutes) {
    return Store.put('goals', { id: Data.monthGoalId(month), month: month, minutes: Number(minutes) || 0 });
  };

  /* ---------- 标题格式 ---------- */
  Data.monthTitle = function (month) {
    var p = String(month).split('-');
    return p[0] + ' 年 ' + Number(p[1]) + ' 月';
  };

  Data.targetText = function (it) {
    if (it.targetType === 'pages') return (it.targetValue || 0) + ' 页';
    if (it.targetType === 'pomodoros') return (it.targetValue || 0) + ' 个番茄';
    return (it.targetValue || 0) + ' 分钟';
  };

  global.Data = Data;
})(window);
