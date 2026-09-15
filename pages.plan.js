/* 计划页：日 / 月 / 年 —— 同一份数据的三种放大镜 */
(function (global) {
  'use strict';

  var Pages = global.Pages;
  var view = 'day';
  var cursor = U.todayStr();
  var cache = null;
  var rootEl = null;
  var selectedBookId = null;

  Pages.plan = function (root) {
    rootEl = root;
    return refresh();
  };

  /* 让别的地方（首页卡片）也能把计划页开到指定的视图 / 日期 */
  Pages.planSet = function (v, d) {
    if (v) view = v;
    if (d) cursor = d;
  };

  function refresh(keepScroll) {
    var y = global.scrollY;
    return Data.load().then(function (d) {
      cache = d;
      render();
      if (keepScroll) global.scrollTo(0, y);
    });
  }

  /* ================= 骨架 ================= */
  function render() {
    rootEl.innerHTML =
      planTopbar() +
      '<div class="split-wide">' +
      '<div>' + (view === 'day' ? viewDay() : view === 'month' ? viewMonth() : viewYear()) + '</div>' +
      '<div>' + railBooks() + (selectedBookId ? drawer() : '') + '</div>' +
      '</div>';
    wire();
  }

  /* 计划页的顶栏自己拼：标题 | 日/月/年 | 空格 | 翻页 | 主题 */
  function planTopbar() {
    return '<div class="topbar">' +
      '<div class="topbar-main">' +
      '<div class="page-title">计划</div>' +
      '<div class="seg">' +
      '<button data-view="day" class="' + (view === 'day' ? 'on' : '') + '">日</button>' +
      '<button data-view="month" class="' + (view === 'month' ? 'on' : '') + '">月</button>' +
      '<button data-view="year" class="' + (view === 'year' ? 'on' : '') + '">年</button>' +
      '</div>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn" data-palette title="全局搜索"><svg><use href="#i-search"/></svg></button>' +
      '<button class="icon-btn" data-theme-toggle title="切换深浅色"><svg><use href="#i-moon"/></svg></button>' +
      '</div>' +
      '<div class="topbar-sub day-head">' +
      '<button class="nav-btn" data-nav="-1">‹</button>' +
      '<span class="day-label">' + U.escape(cursorLabel()) + '</span>' +
      '<button class="nav-btn" data-nav="1">›</button>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" data-nav="0">' + (view === 'day' ? '今天' : view === 'month' ? '本月' : '今年') + '</button>' +
      '</div>' +
      '</div>';
  }

  function cursorLabel() {
    if (view === 'day') return U.fmtDateCN(cursor);
    if (view === 'month') return Data.monthTitle(Data.monthKey(cursor));
    return U.parseDate(cursor).getFullYear() + ' 年';
  }

  /* ================= 日视图 ================= */
  function viewDay() {
    var st = Data.dayStats(cache, cursor);
    var isToday = cursor === U.todayStr();

    var rows = st.items.length ? st.items.map(function (it) {
      var book = Data.bookById(cache.books, it.bookId);
      var actual = actualText(it, cache);
      return '<div class="row" data-id="' + it.id + '">' +
        '<input type="checkbox" data-act="toggle"' + (it.done ? ' checked' : '') + '>' +
        '<span class="row-title" style="min-width:120px">' + (book ? U.escape('《' + book.title + '》') : '<span class="muted">（不指定书）</span>') + '</span>' +
        '<span class="row-sub">目标 ' + U.escape(Data.targetText(it)) + '</span>' +
        '<div class="spacer"></div>' +
        '<span class="row-sub mono">' + actual + '</span>' +
        '<button class="btn btn-sm" data-act="log">记时长</button>' +
        '<span class="card-link" data-act="more">⋯</span>' +
        '</div>';
    }).join('') : '';

    var deferred = cache.planItems.filter(function (it) { return it.date === cursor && it.deferredTo; });

    return '<div class="card">' +
      '<div class="card-head">' +
      '<div class="card-title">' + U.escape(U.fmtDateCN(cursor)) + (isToday ? ' <small>今天</small>' : '') + '</div>' +
      '<div class="spacer"></div>' +
      (st.total ? '<span class="pill' + (st.doneCount === st.total ? ' brand' : '') + '">完成 ' + st.doneCount + ' / ' + st.total + '</span>' : '') +
      '</div>' +
      (st.items.length
        ? '<div class="rows">' + rows + '</div>'
        : '<div class="empty-hint">这一天还没有安排。<br>点下面的「加一条」，把想读的书放进来。</div>') +
      (deferred.length ? '<div class="muted small mt10">已顺延到后面的：' + deferred.map(function (d) {
        return '<span class="pill">' + U.escape(Data.bookName(cache.books, d.bookId) || '（不指定书）') + ' → ' + U.escape(U.fmtDateShort(d.deferredTo)) + '</span>';
      }).join(' ') + '</div>' : '') +
      '<div class="mt10"><button class="btn btn-ghost btn-sm" data-act="add">＋ 加一条</button></div>' +
      '<div class="card-foot">' +
      '今日合计 ' + U.escape(summaryText(st)) +
      '<div class="spacer"></div>' +
      '<span class="muted">还没用计时器读的，点「记时长」补一笔就行</span>' +
      '</div>' +
      '</div>';
  }

  function actualText(it, data) {
    if (!it.done && it.actual == null) return '—';
    if (it.targetType === 'pages') return '已读 ' + (it.actual != null ? it.actual : it.targetValue) + ' 页';
    if (it.targetType === 'pomodoros') return '完成 ' + (it.actual != null ? it.actual : it.targetValue) + ' 个番茄';
    return it.done ? '已完成' : '—';
  }

  function summaryText(st) {
    var parts = [];
    if (st.minutes) parts.push(U.fmtMinutes(st.minutes));
    if (st.pages) parts.push(st.pages + ' 页');
    if (st.pomodoros) parts.push(st.pomodoros + ' 个番茄');
    return parts.length ? parts.join(' · ') : '还没有记录';
  }

  /* ================= 月视图 ================= */
  function viewMonth() {
    var month = Data.monthKey(cursor);
    var st = Data.monthStats(cache, month);
    var goal = Data.monthGoal(cache.goals, month);
    var first = U.monthStart(cursor);
    var days = U.monthDays(cursor);
    var lead = U.leadOffset(first);
    var today = U.todayStr();

    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<div class="cal-cell blank"></div>';
    for (var d = 1; d <= days; d++) {
      var date = month + '-' + U.pad2(d);
      var min = st.perDay[date] || 0;
      var lv = min === 0 ? '' : min < 20 ? ' h1' : min < 40 ? ' h2' : ' h3';
      var books = cache.planItems.filter(function (it) { return it.date === date && it.bookId; })
        .map(function (it) { return Data.bookById(cache.books, it.bookId); })
        .filter(Boolean);
      var seen = {}, uniq = [];
      books.forEach(function (b) { if (!seen[b.id]) { seen[b.id] = 1; uniq.push(b); } });
      var labels = uniq.slice(0, 2).map(function (b) { return '<span class="bk">' + U.escape(b.title) + '</span>'; }).join('');
      if (uniq.length > 2) labels += '<span class="bk">+' + (uniq.length - 2) + '</span>';
      cells += '<div class="cal-cell' + lv + (date === today ? ' today' : '') + '" data-day="' + date + '">' +
        '<span class="d">' + d + '</span>' + labels + '</div>';
    }

    var pct = goal ? Math.min(100, Math.round(st.minutes / goal * 100)) : 0;
    var left = goal - st.minutes;

    return '<div class="card">' +
      '<div class="card-head">' +
      '<div class="card-title">' + U.escape(Data.monthTitle(month)) + '</div>' +
      '<div class="spacer"></div>' +
      '<span class="row-sub">本月目标</span>' +
      '<span class="card-link" data-act="month-goal">' + (goal ? goal + ' 分钟' : '还没设') + '</span>' +
      '<span class="pill' + (goal && left <= 0 ? ' brand' : '') + '">已完成 ' + st.minutes + ' 分钟</span>' +
      '</div>' +
      (goal ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      '<div class="mt14">' +
      '<div class="cal-head">' + U.weekOrder().map(function (w) { return '<span>' + w + '</span>'; }).join('') + '</div>' +
      '<div class="cal">' + cells + '</div>' +
      '</div>' +
      '<div class="card-foot">' +
      '颜色越深 = 那天读得越久 · 点某一天可以进去补记' +
      '<div class="spacer"></div>' +
      (goal
        ? (left > 0
          ? '<span class="muted">还差 ' + U.fmtMinutes(left) + '</span>'
          : '<span style="color:var(--brand)">本月目标已经达成了</span>')
        : '<span class="muted">点上面的「还没设」可以定一个本月目标</span>') +
      '</div>' +
      '</div>';
  }

  /* ================= 年视图 ================= */
  function viewYear() {
    var year = U.parseDate(cursor).getFullYear();
    var st = Data.yearStats(cache, year);
    var goal = Data.yearGoal(cache.goals, year);
    var pct = goal ? Math.min(100, Math.round(st.count / goal * 100)) : 0;

    var cards = '';
    for (var m = 1; m <= 12; m++) {
      var month = year + '-' + U.pad2(m);
      var books = Data.booksOfMonth(cache.books, month);
      var inner = books.map(function (b) {
        var cls = b.status === 'done' ? ' done' : b.status === 'reading' ? ' current' : '';
        return '<div class="book' + cls + '"' + dragAttr() + ' data-drag="' + b.id + '" data-act="book">' +
          U.escape(b.title) + (b.status === 'reading' ? ' · ' + Data.progress(b) + '%' : '') + '</div>';
      }).join('');
      cards += '<div class="month-card' + (books.length ? '' : ' empty') + '" data-month="' + month + '">' +
        '<h4>' + m + ' 月 <span class="spacer"></span><span>' +
        (books.length ? books.filter(function (b) { return b.status === 'done'; }).length + ' 本读完' : '还没排') +
        '</span></h4>' +
        (books.length ? inner : '<div class="muted small">' +
          actHint('从下面书架拖一本过来 →', '点下面的书，选排到哪个月') + '</div>') +
        '</div>';
    }

    // 书架上 = 没读完、又还没排期的书
    var shelf = cache.books.filter(function (b) {
      return b.status !== 'done' && !b.planMonth;
    });

    return '<div class="card">' +
      '<div class="card-head">' +
      '<div class="card-title">' + year + ' 年</div>' +
      '<div class="spacer"></div>' +
      '<span class="row-sub">目标</span>' +
      '<span class="card-link" data-act="year-goal">' + (goal ? goal + ' 本' : '还没设') + '</span>' +
      '<span class="pill brand">已读完 ' + st.count + ' 本</span>' +
      '</div>' +
      (goal ? '<div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      '<div class="year-grid mt14">' + cards + '</div>' +
      '<div class="shelf" data-shelf>' +
      '<div class="row-flex"><b style="font-size:13px">书架（想读的）</b>' +
      '<span class="muted small">' +
      actHint('拖着放到上面某个月 = 排进那个月；拖回来 = 取消排期',
        '点一本书 → 选排到哪个月；已经排了的可以「取消排期」') + '</span>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-sm" data-act="add-book">＋ 添加一本书</button></div>' +
      (shelf.length
        ? '<div class="shelf-books">' + shelf.map(function (b) {
          return '<span class="book"' + dragAttr() + ' data-drag="' + b.id + '" data-act="book">' + U.escape(b.title) + '</span>';
        }).join('') + '</div>'
        : '<div class="muted small mt10">书架上还没有书。</div>') +
      '</div>' +
      '<div class="card-foot">' +
      '<span class="muted">点某个月可以进去看那个月的安排</span>' +
      '<div class="spacer"></div>' +
      '<span class="muted">今年累计读了 ' + U.escape(U.fmtMinutes(st.minutes)) + '</span>' +
      '</div>' +
      '</div>';
  }

  /* ================= 右栏 ================= */
  function railBooks() {
    var reading = Data.readingBooks(cache.books);
    return '<div class="card">' +
      '<div class="card-head"><div class="card-title">在读的书</div><div class="spacer"></div>' +
      '<span class="muted small">' + (view === 'month' ? actHint('可拖到日历上', '点一下选日期') : '') + '</span></div>' +
      (reading.length ? reading.map(function (b) {
        var p = Data.progress(b);
        return '<div class="book-item"' + dragAttr() + ' data-drag="' + b.id + '" data-act="book">' +
          '<div class="top"><b style="font-size:13px">' + U.escape('《' + b.title + '》') + '</b>' +
          '<div class="spacer"></div><span class="row-sub mono">' + p + '%</span></div>' +
          '<div class="bar thin"><i style="width:' + p + '%"></i></div>' +
          '<div class="row-sub">' + U.escape(bookMeta(b)) + '</div>' +
          '</div>';
      }).join('') : '<div class="muted small">还没有在读的书。</div>') +
      '<div class="mt14"><button class="btn btn-ghost btn-sm" data-act="add-book">＋ 添加一本书</button></div>' +
      '</div>';
  }

  function bookMeta(b) {
    var bits = [];
    if (b.author) bits.push(b.author);
    if (b.totalPages) bits.push('p.' + (b.pageNow || 0) + '/' + b.totalPages);
    if (b.status === 'done') bits.push('已读完');
    return bits.join(' · ') || actHint('点开可以补充信息', '点一下安排到某一天');
  }

  function drawer() {
    var b = Data.bookById(cache.books, selectedBookId);
    if (!b) { selectedBookId = null; return ''; }
    var p = Data.progress(b);
    var notes = cache.notes.filter(function (n) { return n.bookId === b.id && !n.deletedAt; });
    var minutes = 0, times = 0;
    cache.sessions.forEach(function (s) { if (s.bookId === b.id) { minutes += Number(s.minutes) || 0; times += 1; } });

    return '<div class="drawer mt20">' +
      '<h3>' + U.escape('《' + b.title + '》') + '</h3>' +
      '<div class="meta">' + U.escape((b.author || '作者没填') + (b.totalPages ? ' · ' + b.totalPages + ' 页' : '') + ' · ' + (Data.STATUS[b.status] || '在读')) + '</div>' +
      '<div class="kv"><span class="k">总阅读时长</span><span class="v">' + U.escape(minutes ? U.fmtMinutes(minutes) : '还没有记录') + '</span></div>' +
      '<div class="kv"><span class="k">记过几次</span><span class="v">' + times + ' 次</span></div>' +
      '<div class="kv"><span class="k">页码</span><span class="v">' + (b.totalPages ? (b.pageNow || 0) + ' / ' + b.totalPages + '（' + p + '%）' : '没填总页数') + '</span></div>' +
      '<div class="mt10"><div class="bar"><i style="width:' + p + '%"></i></div></div>' +
      '<div class="divider"></div>' +
      '<div class="row-flex" style="gap:8px">' +
      '<button class="btn btn-sm" data-act="edit-book">改信息</button>' +
      '<button class="btn btn-sm" data-act="book-read-done">' + (b.status === 'done' ? '改成在读' : '标记已读完') + '</button>' +
      '<button class="btn btn-sm" data-act="book-progress">更新页码</button>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="small muted">这本书的笔记：' + notes.length + ' 条</div>' +
      (notes.slice(0, 3).map(function (n) {
        return '<div class="row-sub" style="margin-top:4px">' + U.escape(n.page ? 'p.' + n.page + ' ' : '') + U.escape((n.quote || n.body || '').slice(0, 24)) + '…</div>';
      }).join('') || '<div class="muted small mt6">还没有笔记（笔记模块还没做）</div>') +
      '<div class="divider"></div>' +
      '<button class="btn btn-sm btn-ghost" data-act="close-drawer">收起</button>' +
      '</div>';
  }

  /* ================= 事件 ================= */
  function wire() {
    U.$$('[data-view]', rootEl).forEach(function (b) {
      b.addEventListener('click', function () { view = b.getAttribute('data-view'); render(); });
    });

    U.$$('[data-nav]', rootEl).forEach(function (b) {
      b.addEventListener('click', function () { shift(Number(b.getAttribute('data-nav'))); });
    });

    U.$$('[data-day]', rootEl).forEach(function (c) {
      c.addEventListener('click', function () { cursor = c.getAttribute('data-day'); view = 'day'; render(); });
    });

    U.$$('[data-month]', rootEl).forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.target.closest('[data-drag]')) return;
        var m = c.getAttribute('data-month');
        cursor = m + '-01';
        view = 'month';
        render();
      });
    });

    U.$$('[data-act]', rootEl).forEach(function (el) {
      var act = el.getAttribute('data-act');
      if (el.hasAttribute('draggable') || act === 'book') {
        el.addEventListener('click', function (e) {
          if (el.hasAttribute('draggable')) e.stopPropagation();
          if (act !== 'book') return;
          var b = Data.bookById(cache.books, el.getAttribute('data-drag'));
          // 手机上拖拽用不了，改成"点一下选"：
          //   书架里的书 → 选排到哪个月
          //   在读的书  → 安排到哪一天
          if (isTouch() && b && el.closest('[data-shelf]')) return assignMonthPrompt(b);
          if (isTouch() && b && el.closest('.book-item')) return assignDayPrompt(b);
          openDrawer(el.getAttribute('data-drag'));
        });
      }
      if (act === 'toggle' || act === 'log' || act === 'more' || act === 'add' ||
        act === 'add-book' || act === 'close-drawer' || act === 'edit-book' ||
        act === 'book-read-done' || act === 'book-progress' || act === 'month-goal' || act === 'year-goal') {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          onAction(act, el);
        });
      }
    });

    wireDrag();
  }

  function shift(n) {
    if (view === 'day') {
      cursor = n === 0 ? U.todayStr() : U.addDays(cursor, n);
    } else if (view === 'month') {
      var d = n === 0 ? new Date() : new Date(U.parseDate(cursor).getFullYear(), U.parseDate(cursor).getMonth() + n, 1);
      cursor = U.dateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    } else {
      var y = U.parseDate(cursor).getFullYear() + n;
      cursor = y + '-01-01';
    }
    render();
  }

  function nearestItem(el) {
    var row = el.closest('[data-id]');
    if (!row) return null;
    var id = row.getAttribute('data-id');
    for (var i = 0; i < cache.planItems.length; i++) if (cache.planItems[i].id === id) return cache.planItems[i];
    return null;
  }

  function onAction(act, el) {
    var it = nearestItem(el);

    if (act === 'toggle') {
      return Store.put('planItems', Object.assign({}, it, { done: el.checked, doneAt: el.checked ? Date.now() : null }))
        .then(function () { return refresh(true); });
    }

    if (act === 'log') return logSessionDialog(it);
    if (act === 'add') return addItemDialog();
    if (act === 'add-book') return bookDialog(null);
    if (act === 'close-drawer') { selectedBookId = null; render(); return; }
    if (act === 'edit-book') return bookDialog(Data.bookById(cache.books, selectedBookId));
    if (act === 'month-goal') return monthGoalDialog();
    if (act === 'year-goal') return yearGoalDialog();

    if (act === 'more') {
      var book = Data.bookById(cache.books, it.bookId);
      return U.modal({
        title: Data.bookName(cache.books, it.bookId) || '（不指定书）',
        sub: '目标 ' + Data.targetText(it) + (it.deferredTo ? ' · 已顺延到 ' + U.fmtDateShort(it.deferredTo) : ''),
        cancelText: '关闭', confirmText: '保存',
        bodyHtml:
          '<div class="field"><label>读的是哪本书</label>' +
          '<select class="input" id="mBook">' + bookOptions(it.bookId, false) + '</select></div>' +
          '<div class="field"><label>目标</label><div class="row-flex" style="gap:8px">' +
          '<select class="input" style="width:110px" id="mType">' +
          '<option value="minutes"' + (it.targetType === 'minutes' ? ' selected' : '') + '>分钟</option>' +
          '<option value="pages"' + (it.targetType === 'pages' ? ' selected' : '') + '>页数</option>' +
          '<option value="pomodoros"' + (it.targetType === 'pomodoros' ? ' selected' : '') + '>番茄</option>' +
          '</select>' +
          '<input class="input" id="mValue" type="number" min="1" value="' + (it.targetValue || 30) + '"></div></div>' +
          '<div class="row-flex" style="gap:10px;margin-top:6px">' +
          '<button class="btn btn-sm" data-extra="defer" data-item="' + it.id + '" type="button">顺延到明天</button>' +
          '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" data-extra="del" data-item="' + it.id + '" type="button">删掉这条</button>' +
          '</div>',
        onOk: function (mask) {
          var v = {
            bookId: U.$('#mBook', mask).value || null,
            targetType: U.$('#mType', mask).value,
            targetValue: Number(U.$('#mValue', mask).value) || 0
          };
          return Store.put('planItems', Object.assign({}, it, v)).then(function () {
            U.toast('已保存');
            return refresh(true);
          });
        }
      }).then(function () { /* 弹窗里的两个额外按钮在下面处理 */ });
    }

    if (act === 'book-read-done') {
      var b = Data.bookById(cache.books, selectedBookId);
      var nowDone = b.status !== 'done';
      return Store.put('books', Object.assign({}, b, {
        status: nowDone ? 'done' : 'reading',
        finishedAt: nowDone ? U.todayStr() : null,
        pageNow: nowDone && b.totalPages ? b.totalPages : b.pageNow
      })).then(function () {
        U.toast(nowDone ? '记为读完了' : '改回在读');
        return refresh(true);
      });
    }

    if (act === 'book-progress') {
      var bk = Data.bookById(cache.books, selectedBookId);
      return U.modal({
        title: '更新页码', sub: '《' + bk.title + '》',
        bodyHtml: '<div class="field"><label>读到第几页' + (bk.totalPages ? '（共 ' + bk.totalPages + ' 页）' : '') + '</label>' +
          '<input class="input" id="pgNow" type="number" min="0" value="' + (bk.pageNow || 0) + '" data-autofocus></div>' +
          '<div class="field"><label>总页数</label><input class="input" id="pgTotal" type="number" min="0" value="' + (bk.totalPages || '') + '"></div>',
        confirmText: '保存',
        onOk: function (mask) {
          var now = Number(U.$('#pgNow', mask).value) || 0;
          var total = Number(U.$('#pgTotal', mask).value) || 0;
          var done = total > 0 && now >= total;
          return Store.put('books', Object.assign({}, bk, {
            pageNow: now, totalPages: total,
            status: done ? 'done' : (bk.status === 'done' && !done ? 'reading' : bk.status),
            finishedAt: done ? (bk.finishedAt || U.todayStr()) : bk.finishedAt
          })).then(function () { U.toast('已更新'); return refresh(true); });
        }
      });
    }
  }

  function openDrawer(id) {
    selectedBookId = id;
    render();
  }

  /* 手机上没法拖拽，改成点一下选 */
  function isTouch() {
    return U.isPhone();
  }

  /* 手机上不挂 draggable：不然长按会触发拖拽/选中，跟滚动打架 */
  function dragAttr() {
    return isTouch() ? '' : ' draggable="true"';
  }

  /* 提示语也得跟着换：手机上拖不了，别再叫人家"拖" */
  function actHint(desktop, phone) {
    return isTouch() ? phone : desktop;
  }

  function monthOptions(fromMonth, months) {
    var year = Number(String(fromMonth).slice(0, 4));
    var out = [];
    for (var y = year; y <= year + 1; y++) {
      for (var m = 1; m <= 12; m++) out.push(y + '-' + U.pad2(m));
      if (out.length >= (months || 18)) break;
    }
    return out;
  }

  /* 这本书排到哪个月 */
  function assignMonthPrompt(book) {
    var list = monthOptions(Data.monthKey(cursor), 18);
    return U.modal({
      title: '排到哪个月',
      sub: '《' + book.title + '》' + (book.planMonth ? '（现在排在 ' + Data.monthTitle(book.planMonth) + '）' : ''),
      confirmText: '排进去',
      cancelText: '取消',
      bodyHtml:
        '<div class="field"><label>选一个月</label><select class="input" id="pmMonth">' +
        list.map(function (k) {
          return '<option value="' + k + '"' + (book.planMonth === k ? ' selected' : '') + '>' + Data.monthTitle(k) + '</option>';
        }).join('') +
        '</select></div>' +
        (book.planMonth ? '<div class="mt10"><button class="btn btn-sm btn-ghost" data-pm="clear" data-book="' + book.id + '" type="button">取消排期，放回书架</button></div>' : ''),
      onOk: function (mask) {
        var m = U.$('#pmMonth', mask).value;
        return Store.put('books', Object.assign({}, book, { planMonth: m })).then(function () {
          // 排到别的年份的话，把视图跟过去，免得"排完了却看不见"
          if (m.slice(0, 4) !== U.todayStr().slice(0, 4) && String(cursor).slice(0, 4) !== m.slice(0, 4)) {
            cursor = m + '-01';
          }
          U.toast('《' + book.title + '》排到了 ' + Data.monthTitle(m));
          return refresh(true);
        });
      }
    });
  }

  /* 这本书安排到哪一天 */
  function assignDayPrompt(book) {
    return U.modal({
      title: '安排到哪一天读',
      sub: '《' + book.title + '》',
      confirmText: '安排',
      cancelText: '取消',
      bodyHtml:
        '<div class="field"><label>哪一天</label><input class="input" id="pdDate" type="date" value="' + U.todayStr() + '"></div>' +
        '<div class="field"><label>目标</label><div class="row-flex" style="gap:8px">' +
        '<select class="input" style="width:120px" id="pdType">' +
        '<option value="minutes">时长</option><option value="pages">页数</option><option value="pomodoros">番茄</option>' +
        '</select>' +
        '<input class="input" id="pdValue" type="number" min="1" value="30">' +
        '</div></div>',
      onOk: function (mask) {
        var d = U.$('#pdDate', mask).value || U.todayStr();
        var v = Number(U.$('#pdValue', mask).value) || 0;
        if (v <= 0) { U.toast('填一个大于 0 的数'); return false; }
        return Store.put('planItems', {
          date: d, bookId: book.id,
          targetType: U.$('#pdType', mask).value, targetValue: v, done: false
        }).then(function () {
          cursor = d;
          U.toast('给 ' + U.fmtDateShort(d) + ' 安排了《' + book.title + '》');
          return refresh(true);
        });
      }
    });
  }

  function bookOptions(selected, allowNew) {
    var opts = '<option value="">（不指定书）</option>';
    cache.books.forEach(function (b) {
      opts += '<option value="' + b.id + '"' + (selected === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
    });
    if (allowNew !== false) opts += '<option value="__new">＋ 新增一本书…</option>';
    return opts;
  }

  /* ================= 弹窗们 ================= */
  function addItemDialog() {
    return U.modal({
      title: '加一条计划',
      sub: U.fmtDateCN(cursor),
      confirmText: '加进去',
      bodyHtml:
        '<div class="field"><label>读哪本书（可以不选）</label><select class="input" id="itBook">' + bookOptions('') + '</select>' +
        '<input class="input mt6 hidden" id="itNewBook" placeholder="书名，例如：万历十五年"></div>' +
        '<div class="field"><label>目标怎么算</label>' +
        '<div class="row-flex" style="gap:14px">' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="itType" value="minutes" checked> 时长</label>' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="itType" value="pages"> 页数</label>' +
        '<label class="row-flex" style="gap:6px"><input type="radio" name="itType" value="pomodoros"> 番茄</label>' +
        '</div></div>' +
        '<div class="field"><label>多少</label><input class="input" id="itValue" type="number" min="1" value="30"></div>',
      onOk: function (mask) {
        var sel = U.$('#itBook', mask);
        var type = (mask.querySelector('input[name="itType"]:checked') || {}).value || 'minutes';
        var value = Number(U.$('#itValue', mask).value) || 0;
        if (value <= 0) { U.toast('填一个大于 0 的数'); return false; }

        var p = Promise.resolve(null);
        if (sel.value === '__new') {
          var title = (U.$('#itNewBook', mask).value || '').trim();
          if (!title) { U.toast('写一下书名'); return false; }
          p = Store.put('books', { title: title, status: 'reading', pageNow: 0, totalPages: 0 }).then(function (b) {
            refresh(true);
            return b;
          });
        }
        return p.then(function (newBook) {
          return Store.put('planItems', {
            date: cursor,
            bookId: newBook ? newBook.id : (sel.value || null),
            targetType: type,
            targetValue: value,
            done: false
          });
        }).then(function () {
          U.toast('加好了');
          return refresh(true);
        });
      }
    });
  }

  function logSessionDialog(it) {
    var book = Data.bookById(cache.books, it.bookId);
    var guess = it.targetType === 'minutes' ? (it.targetValue || 30) : 30;
    return U.modal({
      title: '记一次阅读',
      sub: U.fmtDateCN(cursor) + (book ? ' · 《' + book.title + '》' : ''),
      confirmText: '记下来',
      bodyHtml:
        '<div class="field"><label>这次读了多久（分钟）</label>' +
        '<input class="input" id="lgMin" type="number" min="1" value="' + guess + '" data-autofocus></div>' +
        (book ? '<div class="field"><label>读到第几页了（可以不填）</label>' +
          '<input class="input" id="lgPage" type="number" min="0" placeholder="' + (book.totalPages ? '共 ' + book.totalPages + ' 页' : '') + '"></div>' : '') +
        '<div class="field"><label>顺便把这条计划打勾吗</label>' +
        '<label class="row-flex" style="gap:8px"><input type="checkbox" id="lgDone" ' + (it.done ? '' : 'checked') + '> 标记为已完成</label></div>',
      onOk: function (mask) {
        var min = Number(U.$('#lgMin', mask).value) || 0;
        if (min <= 0) { U.toast('填一个大于 0 的分钟数'); return false; }
        var pageEl = U.$('#lgPage', mask);
        var page = pageEl ? Number(pageEl.value) || 0 : 0;
        var markDone = U.$('#lgDone', mask).checked;
        var ts = U.parseDate(cursor); ts.setHours(12, 0, 0, 0);

        return Store.put('sessions', {
          date: cursor, startTs: ts.getTime(), minutes: min, bookId: it.bookId || null, mode: 'manual'
        }).then(function () {
          if (book && page > 0) {
            var total = Number(book.totalPages) || 0;
            return Store.put('books', Object.assign({}, book, {
              pageNow: page,
              status: total > 0 && page >= total ? 'done' : 'reading',
              finishedAt: total > 0 && page >= total ? (book.finishedAt || U.todayStr()) : book.finishedAt
            }));
          }
        }).then(function () {
          return Store.put('planItems', Object.assign({}, it, { done: markDone, doneAt: markDone ? Date.now() : it.doneAt }));
        }).then(function () {
          U.toast('记下了 ' + U.fmtMinutes(min));
          return refresh(true);
        });
      }
    });
  }

  function bookDialog(book) {
    var isNew = !book;
    book = book || { title: '', author: '', totalPages: 0, pageNow: 0, status: 'want' };
    return U.modal({
      title: isNew ? '添加一本书' : '改一下这本书',
      sub: isNew ? '只要写书名就行，其它都可以以后补' : '《' + book.title + '》',
      confirmText: isNew ? '加进书架' : '保存',
      bodyHtml:
        '<div class="field"><label>书名</label><input class="input" id="bkTitle" value="' + U.escape(book.title) + '" data-autofocus></div>' +
        '<div class="field"><label>作者（可以不填）</label><input class="input" id="bkAuthor" value="' + U.escape(book.author || '') + '"></div>' +
        '<div class="row-flex" style="gap:12px">' +
        '<div class="field" style="flex:1"><label>总页数</label><input class="input" id="bkTotal" type="number" min="0" value="' + (book.totalPages || '') + '"></div>' +
        '<div class="field" style="flex:1"><label>现在读到</label><input class="input" id="bkNow" type="number" min="0" value="' + (book.pageNow || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label>状态</label><select class="input" id="bkStatus">' +
        ['want', 'reading', 'done', 'paused'].map(function (k) {
          return '<option value="' + k + '"' + (book.status === k ? ' selected' : '') + '>' + Data.STATUS[k] + '</option>';
        }).join('') + '</select></div>',
      onOk: function (mask) {
        var title = (U.$('#bkTitle', mask).value || '').trim();
        if (!title) { U.toast('书名不能空着'); return false; }
        var status = U.$('#bkStatus', mask).value;
        var patch = {
          title: title,
          author: (U.$('#bkAuthor', mask).value || '').trim(),
          totalPages: Number(U.$('#bkTotal', mask).value) || 0,
          pageNow: Number(U.$('#bkNow', mask).value) || 0,
          status: status
        };
        if (status === 'done' && !book.finishedAt) patch.finishedAt = U.todayStr();
        if (status === 'reading' && !book.startedAt) patch.startedAt = U.todayStr();

        var p = isNew ? Store.put('books', Object.assign({ title: '', status: 'want' }, patch)) : Store.put('books', Object.assign({}, book, patch));
        return p.then(function (saved) {
          if (isNew) selectedBookId = saved.id;
          U.toast(isNew ? '加进书架了' : '改好了');
          return refresh(true);
        });
      }
    });
  }

  function monthGoalDialog() {
    var month = Data.monthKey(cursor);
    var goal = Data.monthGoal(cache.goals, month);
    return U.modal({
      title: '本月目标',
      sub: Data.monthTitle(month),
      confirmText: '保存',
      bodyHtml: '<div class="field"><label>这个月打算读多少分钟</label>' +
        '<input class="input" id="gMin" type="number" min="0" value="' + (goal || '') + '" placeholder="例如 400" data-autofocus></div>' +
        '<div class="muted small">按 30 天算，每天大概 ' + Math.round((goal || 0) / 30) + ' 分钟。</div>',
      onOk: function (mask) {
        var v = Number(U.$('#gMin', mask).value) || 0;
        return Data.setMonthGoal(month, v).then(function () { U.toast(v ? '目标定好了' : '目标已清掉'); return refresh(true); });
      }
    });
  }

  function yearGoalDialog() {
    var year = U.parseDate(cursor).getFullYear();
    var goal = Data.yearGoal(cache.goals, year);
    return U.modal({
      title: '今年想读几本',
      sub: year + ' 年',
      confirmText: '保存',
      bodyHtml: '<div class="field"><label>今年的目标本数</label>' +
        '<input class="input" id="gBooks" type="number" min="0" value="' + (goal || '') + '" placeholder="例如 20" data-autofocus></div>',
      onOk: function (mask) {
        var v = Number(U.$('#gBooks', mask).value) || 0;
        return Data.setYearGoal(year, v).then(function () { U.toast(v ? '目标定好了' : '目标已清掉'); return refresh(true); });
      }
    });
  }

  /* ================= 拖拽 ================= */
  function wireDrag() {
    var dragging = null;

    U.$$('[data-drag]', rootEl).forEach(function (el) {
      el.addEventListener('dragstart', function (e) {
        dragging = el.getAttribute('data-drag');
        try { e.dataTransfer.setData('text/plain', dragging); } catch (err) { }
        e.dataTransfer.effectAllowed = 'move';
      });
    });

    U.$$('.month-card', rootEl).forEach(function (card) {
      card.addEventListener('dragover', function (e) {
        if (!dragging) return;
        e.preventDefault();
        card.classList.add('dragover');
      });
      card.addEventListener('dragleave', function () { card.classList.remove('dragover'); });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('dragover');
        var id = dragging || e.dataTransfer.getData('text/plain');
        var month = card.getAttribute('data-month');
        if (!id) return;
        var b = Data.bookById(cache.books, id);
        if (!b) return;
        Store.put('books', Object.assign({}, b, { planMonth: month })).then(function () {
          U.toast('《' + b.title + '》排到了 ' + Data.monthTitle(month));
          dragging = null;
          return refresh(true);
        });
      });
    });

    var shelf = U.$('[data-shelf]', rootEl);
    if (shelf) {
      shelf.addEventListener('dragover', function (e) { if (dragging) { e.preventDefault(); shelf.classList.add('dragover'); } });
      shelf.addEventListener('dragleave', function () { shelf.classList.remove('dragover'); });
      shelf.addEventListener('drop', function (e) {
        e.preventDefault();
        shelf.classList.remove('dragover');
        var id = dragging || e.dataTransfer.getData('text/plain');
        var b = Data.bookById(cache.books, id);
        if (!b) return;
        Store.put('books', Object.assign({}, b, { planMonth: null })).then(function () {
          U.toast('《' + b.title + '》取消了排期');
          dragging = null;
          return refresh(true);
        });
      });
    }

    U.$$('.cal-cell[data-day]', rootEl).forEach(function (cell) {
      cell.addEventListener('dragover', function (e) { if (dragging) { e.preventDefault(); cell.classList.add('today'); } });
      cell.addEventListener('dragleave', function () { cell.classList.remove('today'); });
      cell.addEventListener('drop', function (e) {
        e.preventDefault();
        var id = dragging || e.dataTransfer.getData('text/plain');
        var date = cell.getAttribute('data-day');
        if (!id) return;
        return Store.put('planItems', { date: date, bookId: id, targetType: 'minutes', targetValue: 30, done: false })
          .then(function () {
            var b = Data.bookById(cache.books, id);
            U.toast('给 ' + U.fmtDateShort(date) + ' 安排了《' + (b ? b.title : '') + '》');
            dragging = null;
            return refresh(true);
          });
      });
    });
  }

  /* 「排到哪个月」弹窗里的"取消排期" */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-pm="clear"]');
    if (!btn) return;
    var mask = btn.closest('.modal-mask');
    var target = Data.bookById(cache.books, btn.getAttribute('data-book'));
    if (!target) return;
    Store.put('books', Object.assign({}, target, { planMonth: null })).then(function () {
      if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
      U.toast('《' + target.title + '》放回书架了');
      return refresh(true);
    });
  });

  /* 点「⋯」弹窗里的"顺延 / 删除"（弹窗挂在 body 上，所以用全局委托） */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-extra]');
    if (!btn) return;
    var act = btn.getAttribute('data-extra');
    var id = btn.getAttribute('data-item');
    var mask = btn.closest('.modal-mask');
    if (!mask || !id) return;

    var it = null;
    cache.planItems.forEach(function (x) { if (x.id === id) it = x; });
    if (!it) return;

    function closeMask() { if (mask.parentNode) mask.parentNode.removeChild(mask); }

    if (act === 'del') {
      Store.remove('planItems', id).then(function () {
        closeMask();
        U.toast('删掉了');
        return refresh(true);
      });
      return;
    }
    if (act === 'defer') {
      var next = U.addDays(it.date, 1);
      Store.put('planItems', {
        date: next, bookId: it.bookId, targetType: it.targetType,
        targetValue: it.targetValue, done: false, deferredFrom: it.date
      }).then(function () {
        return Store.put('planItems', Object.assign({}, it, { deferredTo: next }));
      }).then(function () {
        closeMask();
        U.toast('顺延到 ' + U.fmtDateShort(next));
        return refresh(true);
      });
    }
  });
})(window);
