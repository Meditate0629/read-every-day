/* 笔记页：左边列表、右边写 */
(function (global) {
  'use strict';

  var Pages = global.Pages;

  var rootEl = null;
  var all = { books: [], notes: [] };
  var filter = 'all';            // all | book | quote | loose | trashed
  var query = '';
  var selectedId = null;
  var draft = null;
  var saveTimer = null;
  var openFolds = { quote: false, loc: false, tags: false };

  Pages.notes = function (root) {
    rootEl = root;
    return load();
  };

  /* 让别处也能"新建一条笔记"（可以顺手带上某本书） */
  Pages.notesNew = function (bookId) {
    draft = { bookId: bookId || null, body: '', quote: '', page: '', location: '', tags: [] };
    selectedId = null;
    openFolds = { quote: false, loc: false, tags: false };
  };

  /* 让别处能直接定位到某一条笔记（命令面板用） */
  Pages.notesSelect = function (id) {
    draft = null;
    selectedId = id;
    var n = null;
    for (var i = 0; i < all.notes.length; i++) if (all.notes[i].id === id) n = all.notes[i];
    openFolds = { quote: !!(n && n.quote), loc: false, tags: !!((n && n.tags) || []).length };
  };

  function load() {
    return Data.load().then(function (d) {
      all = d;
      render();
    });
  }

  /* ================= 渲染 ================= */
  function isMobile() {
    return U.isPhone();
  }

  function render() {
    var editing = !!selectedId || !!draft;
    rootEl.innerHTML = Pages.topbar('笔记',
      '<div class="search"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-linecap="round"><use href="#i-search"/></svg>' +
      '<input id="noteSearch" placeholder="搜正文、摘录、标签、书名…" value="' + U.escape(query) + '"></div>' +
      '<button class="btn btn-primary" id="btnNewNote">＋ 新建笔记</button>') +
      '<div class="split' + (isMobile() && editing ? ' mobile-editing' : '') + '">' +
      '<div class="card" style="padding:12px 10px">' +
      '<div class="filter-pills" id="pills">' + pillsHtml() + '</div>' +
      '<div class="note-list" id="noteList">' + listHtml() + '</div>' +
      '</div>' +
      '<div id="noteEditor"></div>' +
      '</div>';
    wireShell();
    renderEditor();
  }

  function pillsHtml() {
    var live = all.notes.filter(function (n) { return !n.deletedAt; });
    var trashed = all.notes.filter(function (n) { return !!n.deletedAt; });
    function pill(key, label, n) {
      return '<span class="pill' + (filter === key ? ' on' : '') + '" data-filter="' + key + '">' + label + (n == null ? '' : ' ' + n) + '</span>';
    }
    return pill('all', '全部', live.length) +
      pill('book', '按书', live.filter(function (n) { return !!n.bookId; }).length) +
      pill('quote', '有摘录', live.filter(function (n) { return n.quote && n.quote.trim(); }).length) +
      pill('loose', '未挂书', live.filter(function (n) { return !n.bookId; }).length) +
      (trashed.length ? pill('trashed', '最近删除', trashed.length) : '');
  }

  function visibleNotes() {
    var list = all.notes.filter(function (n) { return filter === 'trashed' ? !!n.deletedAt : !n.deletedAt; });
    if (filter === 'book') list = list.filter(function (n) { return !!n.bookId; });
    if (filter === 'quote') list = list.filter(function (n) { return n.quote && n.quote.trim(); });
    if (filter === 'loose') list = list.filter(function (n) { return !n.bookId; });
    if (query) {
      var q = query.toLowerCase();
      list = list.filter(function (n) {
        var book = Data.bookById(all.books, n.bookId);
        var hay = [n.body, n.quote, (n.tags || []).join(' '), n.page, n.location, book ? book.title : ''].join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    return list.sort(function (a, b) {
      return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
    });
  }

  function listHtml() {
    var notes = visibleNotes();
    if (!notes.length) {
      return '<div class="muted small" style="padding:10px 6px">' +
        (query ? '没有找到匹配的笔记。' :
          filter === 'trashed' ? '回收站是空的。' :
            '还没有笔记。<br>读书时想到什么，随手写一句就行。') + '</div>';
    }
    return notes.map(function (n) {
      var book = Data.bookById(all.books, n.bookId);
      var head = (book ? '《' + book.title + '》' : '（未挂书）') + (n.page ? ' p.' + n.page : '');
      var preview = (n.quote && n.quote.trim()) ? n.quote : (n.body || '');
      var tags = (n.tags || []).slice(0, 2).map(function (t) { return '<span class="tag">' + U.escape(t) + '</span>'; }).join('');
      var when = n.createdAt ? U.fmtDateShort(U.dateStr(new Date(n.createdAt))) : '';
      return '<div class="note-item' + (n.id === selectedId ? ' active' : '') + '" data-id="' + n.id + '">' +
        '<div class="t">' + U.escape(head) + '</div>' +
        '<div class="p">' + U.escape(preview.slice(0, 60)) + '</div>' +
        '<div class="m"><span>' + U.escape(when) + '</span>' + tags +
        (n.deletedAt ? '<span class="card-link" data-act="restore">恢复</span><span class="card-link" data-act="purge" style="color:var(--danger)">彻底删掉</span>' : '') +
        '</div></div>';
    }).join('');
  }

  function current() {
    if (draft) return draft;
    if (!selectedId) return null;
    for (var i = 0; i < all.notes.length; i++) if (all.notes[i].id === selectedId) return all.notes[i];
    return null;
  }

  /* ================= 编辑区 ================= */
  function renderEditor() {
    var box = U.$('#noteEditor');
    var n = current();
    if (!n) {
      box.innerHTML = '<div class="card"><div class="empty-hint">' +
        '左边选一条，或者点右上角的「新建笔记」。<br><br>' +
        '<span class="muted">主框写你自己的想法就行；抄下来的原文、页码、标签都收在下面的折叠项里，需要时才展开。</span>' +
        '</div></div>';
      return;
    }

    var bookOpts = '<option value="">（不挂书）</option>' + all.books.map(function (b) {
      return '<option value="' + b.id + '"' + (n.bookId === b.id ? ' selected' : '') + '>' + U.escape(b.title) + '</option>';
    }).join('');

    box.innerHTML = '<div class="card">' +
      '<div class="card-head">' +
      (isMobile() ? '<button class="btn btn-sm btn-ghost" id="btnBackList">‹ 列表</button>' : '') +
      '<select class="input" style="flex:1;min-width:0;max-width:190px" id="edBook">' + bookOpts + '</select>' +
      '<input class="input" style="width:92px" id="edPage" placeholder="页码" value="' + U.escape(n.page || '') + '">' +
      '<div class="spacer"></div>' +
      '<span class="muted small" id="saveStatus">' + (draft ? '还没保存' : '已保存') + '</span>' +
      '</div>' +

      '<textarea class="editor" id="edBody" rows="7" placeholder="想到什么就写什么…">' + U.escape(n.body || '') + '</textarea>' +

      '<div class="mt14">' +
      foldHtml('quote', '原文摘录', openFolds.quote,
        '<textarea class="editor serif" id="edQuote" rows="3" placeholder="抄下来的原文…">' + U.escape(n.quote || '') + '</textarea>' +
        '<div class="muted small mt6">导出分享卡片时，摘录会是大字，正文放在下面做小字。</div>') +
      '</div>' +

      '<div class="mt10">' +
      foldHtml('loc', '位置备注', openFolds.loc,
        '<div class="row-flex" style="gap:8px">' +
        '<input class="input" style="width:240px" id="edLoc" placeholder="第三章 / 12% / 电子书第 340 屏…" value="' + U.escape(n.location || '') + '">' +
        '</div>' +
        '<div class="muted small mt6">页码在上面那一行填，这里放不好写成页码的位置。</div>') +
      '</div>' +

      '<div class="mt10">' +
      foldHtml('tags', '标签', openFolds.tags,
        '<div class="row-flex" style="gap:8px">' +
        (n.tags || []).map(function (t) {
          return '<span class="tag removable" data-tag="' + U.escape(t) + '">' + U.escape(t) + '</span>';
        }).join('') +
        '<input class="input" style="width:140px" id="edTagInput" placeholder="新标签 + 回车">' +
        '</div>') +
      '</div>' +

      '<div class="card-foot">' +
      '<button class="btn btn-sm" id="btnShareNote">分享这条为图片</button>' +
      '<div class="spacer"></div>' +
      '<span class="muted small">Ctrl + Enter 存下并新开一条</span>' +
      '<button class="btn btn-sm btn-ghost" style="color:var(--danger)" id="btnDelNote">删除</button>' +
      '</div>' +
      '</div>';

    wireEditor();
    var body = U.$('#edBody');
    if (body && draft) body.focus();
  }

  function foldHtml(key, label, open, inner) {
    return '<div class="fold' + (open ? ' open' : '') + '" data-fold="' + key + '">' + label + '</div>' +
      (open ? '<div class="fold-body">' + inner + '</div>' : '');
  }

  /* ================= 事件 ================= */
  function wireShell() {
    var s = U.$('#noteSearch');
    if (s) s.addEventListener('input', U.debounce(function () {
      query = s.value.trim();
      refreshList();
    }, 200));

    var nb = U.$('#btnNewNote');
    if (nb) nb.addEventListener('click', function () {
      Pages.notesNew();
      var sp = U.$('.split', rootEl);
      if (sp && isMobile()) sp.classList.add('mobile-editing');
      renderEditor();
      refreshList();
    });

    var pills = U.$('#pills');
    if (pills) pills.addEventListener('click', function (e) {
      var p = e.target.closest('[data-filter]');
      if (!p) return;
      filter = p.getAttribute('data-filter');
      U.$('#pills').innerHTML = pillsHtml();
      refreshList();
    });

    var list = U.$('#noteList');
    if (list) list.addEventListener('click', function (e) {
      var item = e.target.closest('.note-item');
      if (!item) return;
      var id = item.getAttribute('data-id');
      var act = e.target.getAttribute && e.target.getAttribute('data-act');

      if (act === 'restore') {
        var n1 = findNote(id);
        return Store.put('notes', Object.assign({}, n1, { deletedAt: null })).then(function () {
          U.toast('恢复了');
          return reload();
        });
      }
      if (act === 'purge') {
        return U.confirm('彻底删掉这条笔记？', '删了就真的找不回来了。', '彻底删掉', true).then(function (ok) {
          if (!ok) return;
          return Store.remove('notes', id).then(function () {
            if (selectedId === id) selectedId = null;
            U.toast('删掉了');
            return reload();
          });
        });
      }
      selectedId = id;
      draft = null;
      openFolds = { quote: !!findNote(id).quote, loc: false, tags: (findNote(id).tags || []).length > 0 };
      var sp = U.$('.split', rootEl);
      if (sp && isMobile()) sp.classList.add('mobile-editing');   // 手机上：列表收起来，让编辑区占满
      refreshList();
      renderEditor();
    });
  }

  function wireEditor() {
    var n = current();
    if (!n) return;

    /* 手机上的"返回列表" */
    var back = U.$('#btnBackList', rootEl);
    if (back) back.addEventListener('click', function () {
      selectedId = null;
      draft = null;
      var sp = U.$('.split', rootEl);
      if (sp) sp.classList.remove('mobile-editing');
      refreshList();
      renderEditor();
    });

    U.$$('[data-fold]', rootEl).forEach(function (f) {
      f.addEventListener('click', function () {
        var k = f.getAttribute('data-fold');
        openFolds[k] = !openFolds[k];
        flushNow().then(renderEditor);
      });
    });

    ['#edBody', '#edQuote', '#edLoc', '#edPage'].forEach(function (sel) {
      var el = U.$(sel, rootEl);
      if (el) el.addEventListener('input', scheduleSave);
    });

    var book = U.$('#edBook', rootEl);
    if (book) book.addEventListener('change', function () {
      var cur = current();
      if (!cur) return;
      cur.bookId = book.value || null;
      scheduleSave();
    });

    var tagInput = U.$('#edTagInput', rootEl);
    if (tagInput) tagInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.isComposing) return;
      var t = tagInput.value.trim();
      if (!t) return;
      var cur = current();
      cur.tags = (cur.tags || []).concat([t]);
      tagInput.value = '';
      flushNow().then(renderEditor);
    });

    U.$$('[data-tag]', rootEl).forEach(function (tag) {
      tag.addEventListener('click', function () {
        var cur = current();
        if (!cur) return;
        var t = tag.getAttribute('data-tag');
        cur.tags = (cur.tags || []).filter(function (x) { return x !== t; });
        flushNow().then(renderEditor);
      });
    });

    var body = U.$('#edBody', rootEl);
    if (body) body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        flushNow().then(function () {
          Pages.notesNew();
          renderEditor();
          refreshList();
        });
      }
    });

    var sh = U.$('#btnShareNote', rootEl);
    if (sh) sh.addEventListener('click', function () {
      U.toast('分享模块还没做。做好之后，这条能排成一张图片卡片。');
    });

    var del = U.$('#btnDelNote', rootEl);
    if (del) del.addEventListener('click', function () {
      var cur = current();
      if (!cur) return;
      if (!cur.id) { draft = null; selectedId = null; renderEditor(); refreshList(); return; }
      Store.put('notes', Object.assign({}, cur, { deletedAt: Date.now() })).then(function () {
        selectedId = null;
        draft = null;
        U.toast('删掉了，30 天内还能在「最近删除」里找回来');
        return reload();
      });
    });
  }

  /* ================= 保存 ================= */
  function setStatus(text) {
    var el = U.$('#saveStatus');
    if (el) el.textContent = text;
  }

  function scheduleSave() {
    setStatus('正在输入…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { flushNow(); }, 700);
  }

  function flushNow() {
    clearTimeout(saveTimer);
    var n = current();
    if (!n) return Promise.resolve();

    var patch = {};
    function take(sel, key) {
      var el = U.$(sel, rootEl);
      if (el) patch[key] = el.value;
    }
    take('#edBook', 'bookId');
    take('#edBody', 'body');
    take('#edQuote', 'quote');
    take('#edLoc', 'location');
    var p1 = U.$('#edPage', rootEl);
    if (p1) patch.page = p1.value;
    if (patch.bookId === '') patch.bookId = null;

    var doc = Object.assign({}, n, patch);

    return Store.put('notes', doc).then(function (saved) {
      if (draft) { draft = null; selectedId = saved.id; }
      upsertLocal(saved);
      setStatus('已保存 · 刚刚');
      refreshList();
      return saved;
    });
  }

  function upsertLocal(note) {
    var hit = false;
    all.notes = all.notes.map(function (x) {
      if (x.id === note.id) { hit = true; return note; }
      return x;
    });
    if (!hit) all.notes.push(note);
  }

  function findNote(id) {
    for (var i = 0; i < all.notes.length; i++) if (all.notes[i].id === id) return all.notes[i];
    return {};
  }

  function refreshList() {
    var box = U.$('#noteList');
    if (box) box.innerHTML = listHtml();
    var p = U.$('#pills');
    if (p) p.innerHTML = pillsHtml();
  }

  function reload() {
    return Data.load().then(function (d) {
      all = d;
      refreshList();
      renderEditor();
    });
  }
})(window);
