/* 分享页：选内容 → 选样式 → 看预览 → 导出图片 / PDF */
(function (global) {
  'use strict';

  var Pages = global.Pages;
  var rootEl = null;
  var cache = null;
  var settings = null;

  var tab = 'note';
  var noteScope = 'one';           // one | book | period | tag
  var noteBookId = null, noteFrom = '', noteTo = '', noteTag = '';
  var planScope = 'year';          // year | month | book
  var planMonth = '', planBookId = null;
  var template = 'plain';
  var templateTouched = false;
  var noteSize = 'square';         // square | long
  var show = { book: true, page: true, date: true, sign: false, target: false };
  var signText = '';
  var previewTimer = null;

  Pages.share = function (root) {
    rootEl = root;
    return load();
  };

  function load() {
    return Promise.all([Data.load(), Store.settings()]).then(function (r) {
      cache = r[0];
      settings = r[1];
      signText = settings.shareSign || '';
      if (!templateTouched && settings.defaultTemplate) template = settings.defaultTemplate;
      if (!planMonth) planMonth = Data.monthKey(U.todayStr());
      render();
    });
  }

  /* ---------- 当前面板内查找，避免两个面板里的同名 id 打架 ---------- */
  function panel() { return U.$('[data-panel="' + tab + '"]', rootEl); }
  function q(sel) { var p = panel(); return p ? p.querySelector(sel) : null; }
  function qa(sel) { var p = panel(); return p ? Array.prototype.slice.call(p.querySelectorAll(sel)) : []; }

  /* ================= 渲染 ================= */
  function render() {
    rootEl.innerHTML =
      Pages.topbar('分享', '<div class="seg" id="shareTabs" style="margin-left:6px">' +
        '<button data-tab="note" class="' + (tab === 'note' ? 'on' : '') + '">分享笔记</button>' +
        '<button data-tab="plan" class="' + (tab === 'plan' ? 'on' : '') + '">分享计划</button>' +
        '</div>') +
      '<div data-panel="note"' + (tab === 'note' ? '' : ' style="display:none"') + '>' + notePanel() + '</div>' +
      '<div data-panel="plan"' + (tab === 'plan' ? '' : ' style="display:none"') + '>' + planPanel() + '</div>';

    wire();
    schedulePreview();
  }

  function tplListHtml() {
    return Object.keys(Share.TEMPLATES).map(function (k) {
      var t = Share.TEMPLATES[k];
      return '<div class="tpl' + (template === k ? ' on' : '') + '" data-sharetpl="' + k + '">' +
        '<i style="background:' + t.bg + ';border:1px solid ' + t.line + '"></i>' + U.escape(t.name) + '</div>';
    }).join('');
  }

  function previewBoxHtml(meta) {
    return '<div class="card" style="padding:12px">' +
      '<div class="card-head" style="margin-bottom:8px"><div class="card-title">3 · 预览</div><div class="spacer"></div>' +
      '<span class="muted small" id="previewMeta">' + U.escape(meta || '') + '</span></div>' +
      '<div id="sharePreview" style="max-height:560px;overflow:auto;display:flex;justify-content:center;background:var(--surface-3);border-radius:var(--r);padding:14px">' +
      '<div class="muted small" style="padding:20px 0">正在画…</div></div>' +
      '</div>';
  }

  /* ---------- 分享笔记 ---------- */
  function notePanel() {
    var books = cache.books;
    var tags = {};
    cache.notes.forEach(function (n) { if (!n.deletedAt) (n.tags || []).forEach(function (t) { tags[t] = 1; }); });
    var tagList = Object.keys(tags);
    if (noteScope === 'book' && !noteBookId && books.length) noteBookId = books[0].id;
    if (noteScope === 'tag' && !noteTag && tagList.length) noteTag = tagList[0];

    return '<div class="split-narrow">' +
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">1 · 选内容</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;font-size:13.5px">' +
      radio('noteScope', 'one', '最近写的那一条', noteScope) +
      radio('noteScope', 'book', '某本书的全部笔记', noteScope) +
      radio('noteScope', 'period', '某段时间', noteScope) +
      radio('noteScope', 'tag', '某个标签', noteScope) +
      '</div>' +
      '<div class="mt14">' +
      (noteScope === 'book'
        ? (books.length
          ? '<select class="input" id="noteBook">' + books.map(function (b) {
            return '<option value="' + b.id + '"' + (noteBookId === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
          }).join('') + '</select>'
          : '<div class="muted small">书单还是空的</div>')
        : '') +
      (noteScope === 'period'
        ? '<div class="row-flex" style="gap:8px"><input class="input" id="noteFrom" type="date" value="' + U.escape(noteFrom) + '"><span class="muted">到</span><input class="input" id="noteTo" type="date" value="' + U.escape(noteTo) + '"></div>'
        : '') +
      (noteScope === 'tag'
        ? (tagList.length
          ? '<select class="input" id="noteTag">' + tagList.map(function (t) {
            return '<option value="' + U.escape(t) + '"' + (noteTag === t ? ' selected' : '') + '>' + U.escape(t) + '</option>';
          }).join('') + '</select>'
          : '<div class="muted small">还没有用过标签</div>')
        : '') +
      '</div>' +
      '<div class="card-foot"><span class="muted small" id="noteCount">' + U.escape(noteCountText()) + '</span></div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><div class="card-title">2 · 选样式</div></div>' +
      '<div class="muted small" style="margin-bottom:7px">模板</div>' +
      '<div class="tpl-list">' + tplListHtml() + '</div>' +
      '<div class="muted small" style="margin:16px 0 7px">尺寸</div>' +
      '<div class="row-flex" style="gap:16px;font-size:13.5px">' +
      '<label class="row-flex" style="gap:6px;cursor:pointer"><input type="radio" name="noteSize" value="square"' + (noteSize === 'square' ? ' checked' : '') + '> 方图 1080 × 1080</label>' +
      '<label class="row-flex" style="gap:6px;cursor:pointer"><input type="radio" name="noteSize" value="long"' + (noteSize === 'long' ? ' checked' : '') + '> 长图 1080 × 自动</label>' +
      '</div>' +
      '<div class="muted small" style="margin:16px 0 7px">卡片上显示什么</div>' +
      '<div class="row-flex" style="gap:16px;font-size:13.5px">' +
      check('showBook', '书名', show.book) +
      check('showPage', '页码', show.page) +
      check('showDate', '日期', show.date) +
      check('showSign', '我的署名', show.sign) +
      check('showTarget', '今年目标', show.target) +
      '</div>' +
      signInputHtml() +
      '<div class="divider"></div>' +
      '<div class="row-flex" style="gap:10px">' +
      '<button class="btn btn-primary" data-act="export-img">导出图片 PNG</button>' +
      '<button class="btn" data-act="export-pdf">导出 PDF</button>' +
      '</div>' +
      '<div class="card-foot"><span class="muted small" id="exportHint">图片和 PDF 都在你电脑上生成，不联网、不上传。</span></div>' +
      '</div>' +

      previewBoxHtml(noteSize === 'long' ? '长图 · ' + collectNotes().length + ' 条' : '第 1 / ' + collectNotes().length + ' 张') +
      '</div>' +
      historyCard();
  }

  /* ---------- 分享计划 ---------- */
  function planPanel() {
    if (planScope === 'book' && !planBookId && cache.books.length) planBookId = cache.books[0].id;

    return '<div class="split-narrow">' +
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">1 · 选内容</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;font-size:13.5px">' +
      radio('planScope', 'year', '年度计划', planScope) +
      radio('planScope', 'month', '月度小结', planScope) +
      radio('planScope', 'book', '单本书的阅读总结', planScope) +
      '</div>' +
      '<div class="mt14">' +
      (planScope === 'month' ? '<input class="input" id="planMonth" type="month" value="' + U.escape(planMonth) + '">' : '') +
      (planScope === 'book'
        ? (cache.books.length
          ? '<select class="input" id="planBook">' + cache.books.map(function (b) {
            return '<option value="' + b.id + '"' + (planBookId === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
          }).join('') + '</select>'
          : '<div class="muted small">书单还是空的</div>')
        : '') +
      '</div>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><div class="card-title">2 · 选样式</div></div>' +
      '<div class="muted small" style="margin-bottom:7px">模板</div>' +
      '<div class="tpl-list">' + tplListHtml() + '</div>' +
      '<div class="muted small" style="margin:16px 0 7px">要不要露出来</div>' +
      '<div style="display:flex;flex-direction:column;gap:9px;font-size:13.5px">' +
      '<label class="row-flex" style="gap:8px;cursor:pointer"><input type="checkbox" id="showBook"' + (show.book ? ' checked' : '') + '> 显示书名（关掉就只写"第 N 本"）</label>' +
      check('showSign', '我的署名', show.sign) +
      '</div>' +
      signInputHtml() +
      '<div class="divider"></div>' +
      '<div class="row-flex" style="gap:10px">' +
      '<button class="btn btn-primary" data-act="export-img">导出图片 PNG</button>' +
      '<button class="btn" data-act="export-pdf">导出 PDF</button>' +
      '</div>' +
      '<div class="card-foot"><span class="muted small" id="exportHint">PDF 是多页的：封面 → 书单 → 月度小结。点一下直接下载，不弹打印框。</span></div>' +
      '</div>' +

      previewBoxHtml('方图 1080 × 1080') +
      '</div>' +
      historyCard();
  }

  function radio(name, value, label, cur) {
    return '<label class="row-flex" style="gap:8px;cursor:pointer"><input type="radio" name="' + name + '" value="' + value + '"' + (cur === value ? ' checked' : '') + '> <span>' + label + '</span></label>';
  }
  function check(name, label, on) {
    return '<label class="row-flex" style="gap:6px;cursor:pointer"><input type="checkbox" id="' + name + '"' + (on ? ' checked' : '') + '> ' + label + '</label>';
  }
  function signInputHtml() {
    return show.sign ? '<div class="mt10"><input class="input" id="signInput" placeholder="署名（写什么都行）" value="' + U.escape(signText) + '"></div>' : '';
  }

  function historyCard() {
    var h = (settings.shareHistory || []).slice(0, 6);
    return '<div class="card mt20">' +
      '<div class="card-head"><div class="card-title">以前的导出</div><div class="spacer"></div>' +
      '<span class="muted small">只记住导出过什么，不重复存文件</span></div>' +
      (h.length ? '<div class="rows">' + h.map(function (x) {
        return '<div class="row"><span class="row-sub">' + U.escape(U.fmtDateTime(x.at)) + '</span><div class="spacer"></div>' +
          '<span>' + U.escape(x.desc) + '</span></div>';
      }).join('') + '</div>' : '<div class="muted small">还没有导出过。</div>') +
      '</div>';
  }

  /* ================= 选出来的内容 ================= */
  function liveNotes() {
    return cache.notes.filter(function (n) { return !n.deletedAt; })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
  }

  function collectNotes() {
    var list = liveNotes();
    if (noteScope === 'one') return list.slice(0, 1);
    if (noteScope === 'book') return noteBookId ? list.filter(function (n) { return n.bookId === noteBookId; }) : list;
    if (noteScope === 'tag') return noteTag ? list.filter(function (n) { return (n.tags || []).indexOf(noteTag) >= 0; }) : list;
    return list.filter(function (n) {
      var d = U.dateStr(new Date(n.createdAt || 0));
      if (noteFrom && d < noteFrom) return false;
      if (noteTo && d > noteTo) return false;
      return true;
    });
  }

  function noteCountText() {
    var n = collectNotes().length;
    if (!n) return '这个范围里还没有笔记';
    return '共 ' + n + ' 条' + (noteSize === 'long' ? ' · 会排成一张长图' : ' · 会生成 ' + n + ' 张图');
  }

  function decorate(notes) {
    return notes.map(function (n) {
      var b = Data.bookById(cache.books, n.bookId);
      return Object.assign({}, n, { _bookTitle: b ? b.title : '' });
    });
  }

  function infoFor(note) {
    var b = Data.bookById(cache.books, note.bookId);
    return {
      template: template,
      showBook: show.book,
      showPage: show.page,
      showDate: show.date,
      showTarget: show.target,
      targetText: targetText(),
      sign: show.sign ? signText : '',
      bookTitle: (note && note._bookTitle) || (b ? b.title : '')
    };
  }

  function targetText() {
    var year = U.parseDate(U.todayStr()).getFullYear();
    var goal = Data.yearGoal(cache.goals, year);
    if (!goal) return '';
    var st = Data.yearStats(cache, year);
    return '今年 ' + st.count + ' / ' + goal + ' 本';
  }

  function scopeTitle() {
    if (noteScope === 'book') {
      var b = Data.bookById(cache.books, noteBookId);
      return b ? b.title : '读书笔记';
    }
    if (noteScope === 'tag') return noteTag || '读书笔记';
    return '读书笔记';
  }

  /* ================= 预览 ================= */
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(buildPreview, 160);
  }

  function buildPreview() {
    var box = q('#sharePreview');
    var meta = q('#previewMeta');
    if (!box) return;

    var canvas = null;
    try {
      if (tab === 'note') {
        var notes = decorate(collectNotes());
        if (!notes.length) {
          box.innerHTML = '<div class="muted small" style="padding:20px 0;text-align:center">这个范围里还没有可分享的笔记。<br>换一个筛选条件，或者先去写一条。</div>';
          if (meta) meta.textContent = '';
          return;
        }
        canvas = (noteSize === 'long')
          ? Share.notesLongImage(notes, Object.assign(infoFor(notes[0]), { headerTitle: scopeTitle(), headerSub: '' }))
          : Share.noteImage(notes[0], infoFor(notes[0]));
        if (meta) meta.textContent = noteSize === 'long' ? ('长图 · ' + notes.length + ' 条') : ('第 1 / ' + notes.length + ' 张');
      } else {
        var view = currentPlanView();
        if (!view) {
          box.innerHTML = '<div class="muted small" style="padding:20px 0;text-align:center">还没有可以分享的内容。</div>';
          if (meta) meta.textContent = '';
          return;
        }
        canvas = Share.planCard(view, { template: template, sign: show.sign ? signText : '' });
        if (meta) meta.textContent = '方图 1080 × 1080';
      }
    } catch (e) {
      box.innerHTML = '<div class="muted small" style="padding:20px 0">预览画不出来：' + U.escape(e.message) + '</div>';
      return;
    }

    var img = new Image();
    img.onload = function () {
      box.innerHTML = '';
      img.style.maxWidth = '100%';
      img.style.borderRadius = '10px';
      img.style.boxShadow = 'var(--sh2)';
      img.style.height = 'auto';
      box.appendChild(img);
    };
    img.onerror = function () {
      box.innerHTML = '<div class="muted small" style="padding:20px 0">图片生成失败</div>';
    };
    img.src = canvas.toDataURL('image/png');
  }

  function currentPlanView() {
    var year = U.parseDate(U.todayStr()).getFullYear();
    if (planScope === 'year') return Share.yearView(cache, year);
    if (planScope === 'month') return Share.monthView(cache, planMonth || Data.monthKey(U.todayStr()));
    return planBookId ? Share.bookView(cache, planBookId) : null;
  }

  /* ================= 导出 ================= */
  function busy(t) { var h = q('#exportHint'); if (h) h.textContent = t; }
  function idle() { busy('图片和 PDF 都在你电脑上生成，不联网、不上传。'); }

  function logExport(desc) {
    var h = (settings.shareHistory || []).slice();
    h.unshift({ at: Date.now(), desc: desc });
    settings.shareHistory = h.slice(0, 10);
    return Store.saveSettings({ shareHistory: settings.shareHistory });
  }

  function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20) || '导出'; }

  function exportImage() {
    if (tab === 'note') {
      var notes = decorate(collectNotes());
      if (!notes.length) { U.toast('没有可分享的笔记'); return; }
      var stamp = Share.stamp();
      if (noteSize === 'long') {
        busy('正在生成长图…');
        var canvas = Share.notesLongImage(notes, Object.assign(infoFor(notes[0]), { headerTitle: scopeTitle(), headerSub: '' }));
        Share.downloadCanvas(canvas, '读书笔记-' + safeName(scopeTitle()) + '-' + stamp + '.png').then(function () {
          idle();
          U.toast('长图导出好了');
          return logExport('《' + scopeTitle() + '》笔记 · 长图 · ' + notes.length + ' 条').then(load);
        });
        return;
      }
      busy('正在生成 ' + notes.length + ' 张图…');
      var i = 0;
      (function next() {
        if (i >= notes.length) {
          idle();
          U.toast('导出好了，共 ' + notes.length + ' 张');
          return logExport('《' + scopeTitle() + '》笔记 · 方图 · ' + notes.length + ' 张').then(load);
        }
        var n = notes[i++];
        var c = Share.noteImage(n, infoFor(n));
        Share.downloadCanvas(c, '读书笔记-' + safeName(scopeTitle()) + '-' + stamp + '-' + U.pad2(i) + '.png').then(function () {
          setTimeout(next, 280);
        });
      })();
      return;
    }

    var view = currentPlanView();
    if (!view) { U.toast('没有可以分享的内容'); return; }
    busy('正在生成卡片…');
    var card = Share.planCard(view, { template: template, sign: show.sign ? signText : '' });
    Share.downloadCanvas(card, '阅读计划-' + safeName(view.title) + '-' + Share.stamp() + '.png').then(function () {
      idle();
      U.toast('导出好了');
      return logExport(view.title + ' · 图片 · ' + template).then(load);
    });
  }

  function exportPdf() {
    var info = { template: template, sign: show.sign ? signText : '' };
    if (tab === 'note') {
      var notes = decorate(collectNotes());
      if (!notes.length) { U.toast('没有可分享的笔记'); return; }
      busy('正在生成 PDF（' + notes.length + ' 页）…');
      var pages = notes.map(function (n) { return Share.notePage(n, infoFor(n)); });
      setTimeout(function () {
        Share.downloadPdf(pages, '读书笔记-' + safeName(scopeTitle()) + '-' + Share.stamp() + '.pdf');
        idle();
        U.toast('PDF 导出好了');
        logExport('《' + scopeTitle() + '》笔记 · PDF · ' + notes.length + ' 页').then(load);
      }, 30);
      return;
    }

    var view = currentPlanView();
    if (!view) { U.toast('没有可以分享的内容'); return; }
    busy('正在生成计划书…');
    var planPages = buildPlanPdfPages(view, info);
    setTimeout(function () {
      Share.downloadPdf(planPages, '阅读计划-' + Share.stamp() + '.pdf');
      idle();
      U.toast('计划书导出好了（' + planPages.length + ' 页）');
      logExport(view.title + ' · PDF · ' + planPages.length + ' 页').then(load);
    }, 30);
  }

  function buildPlanPdfPages(view, info) {
    var pages = [Share.coverPagePublic(view, info)];

    if (planScope === 'year') {
      var year = U.parseDate(U.todayStr()).getFullYear();
      var done = cache.books.filter(function (b) { return b.status === 'done'; });
      var reading = cache.books.filter(function (b) { return b.status === 'reading'; });
      var rows = done.concat(reading).map(function (b, i) {
        var text = show.book
          ? '《' + b.title + '》' + (b.author ? ' · ' + b.author : '')
          : '第 ' + (i + 1) + ' 本';
        return { text: text, tag: b.status === 'done' ? '读完了' : Data.progress(b) + '%', done: b.status === 'done' };
      });
      if (rows.length) pages.push(Share.bookListPagePublic(year + ' 年书单', rows, info));

      for (var m = 1; m <= 12; m++) {
        var mm = year + '-' + U.pad2(m);
        var st = Data.monthStats(cache, mm);
        if (!st.minutes && !st.doneDays) continue;
        pages.push(Share.coverPagePublic(Share.monthView(cache, mm), info));
      }
    } else if (planScope === 'month') {
      // 月度小结本身就是一页封面，不用再加
    } else if (planScope === 'book' && planBookId) {
      var b2 = Data.bookById(cache.books, planBookId);
      var notes = cache.notes.filter(function (n) { return n.bookId === planBookId && !n.deletedAt; })
        .sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0); });
      notes.forEach(function (n) {
        pages.push(Share.notePage(Object.assign({}, n, { _bookTitle: b2 ? b2.title : '' }), {
          template: template, showBook: show.book, showPage: show.page,
          showDate: show.date, sign: show.sign ? signText : '',
          bookTitle: b2 ? b2.title : ''
        }));
      });
    }
    return pages.filter(Boolean);
  }

  /* ================= 事件 ================= */
  function wire() {
    U.$$('#shareTabs button', rootEl).forEach(function (b) {
      b.addEventListener('click', function () {
        tab = b.getAttribute('data-tab');
        render();
      });
    });

    qa('[data-sharetpl]').forEach(function (el) {
      el.addEventListener('click', function () {
        template = el.getAttribute('data-sharetpl');
        templateTouched = true;
        qa('[data-sharetpl]').forEach(function (x) { x.classList.toggle('on', x === el); });
        schedulePreview();
      });
    });

    qa('input[name="noteScope"]').forEach(function (r) {
      r.addEventListener('change', function () { noteScope = r.value; render(); });
    });
    qa('input[name="planScope"]').forEach(function (r) {
      r.addEventListener('change', function () { planScope = r.value; render(); });
    });
    qa('input[name="noteSize"]').forEach(function (r) {
      r.addEventListener('change', function () {
        noteSize = r.value;
        var c = q('#noteCount'); if (c) c.textContent = noteCountText();
        var m = q('#previewMeta'); if (m) m.textContent = noteSize === 'long' ? '长图 · ' + collectNotes().length + ' 条' : '第 1 / ' + collectNotes().length + ' 张';
        schedulePreview();
      });
    });

    [['showBook', 'book'], ['showPage', 'page'], ['showDate', 'date'], ['showSign', 'sign'], ['showTarget', 'target']].forEach(function (pair) {
      var el = q('#' + pair[0]);
      if (!el) return;
      el.addEventListener('change', function () {
        show[pair[1]] = el.checked;
        if (pair[1] === 'sign') render();
        else schedulePreview();
      });
    });

    var signEl = q('#signInput');
    if (signEl) signEl.addEventListener('input', U.debounce(function () {
      signText = signEl.value;
      Store.saveSettings({ shareSign: signText });
      schedulePreview();
    }, 500));

    var bookSel = q('#noteBook');
    if (bookSel) bookSel.addEventListener('change', function () { noteBookId = bookSel.value; updateCount(); schedulePreview(); });
    var tagSel = q('#noteTag');
    if (tagSel) tagSel.addEventListener('change', function () { noteTag = tagSel.value; updateCount(); schedulePreview(); });
    var fromEl = q('#noteFrom'), toEl = q('#noteTo');
    if (fromEl) fromEl.addEventListener('change', function () { noteFrom = fromEl.value; updateCount(); schedulePreview(); });
    if (toEl) toEl.addEventListener('change', function () { noteTo = toEl.value; updateCount(); schedulePreview(); });

    var pm = q('#planMonth');
    if (pm) pm.addEventListener('change', function () { planMonth = pm.value; schedulePreview(); });
    var pb = q('#planBook');
    if (pb) pb.addEventListener('change', function () { planBookId = pb.value; schedulePreview(); });

    qa('[data-act="export-img"]').forEach(function (b) { b.addEventListener('click', exportImage); });
    qa('[data-act="export-pdf"]').forEach(function (b) { b.addEventListener('click', exportPdf); });
  }

  function updateCount() {
    var c = q('#noteCount');
    if (c) c.textContent = noteCountText();
  }
})(window);
