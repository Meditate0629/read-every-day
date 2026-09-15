/* Ctrl+K 命令面板：搜笔记、找书、跳页面、跑动作 */
(function (global) {
  'use strict';

  var Palette = {};
  var mask = null;
  var input = null;
  var listEl = null;
  var items = [];
  var active = 0;
  var data = { books: [], notes: [] };

  var PAGES = [
    { title: '首页', hash: '#/home', icon: '🏠' },
    { title: '计划', hash: '#/plan', icon: '📅' },
    { title: '笔记', hash: '#/notes', icon: '📝' },
    { title: '计时', hash: '#/timer', icon: '⏱' },
    { title: '提醒', hash: '#/reminders', icon: '🔔' },
    { title: '分享', hash: '#/share', icon: '🖼' },
    { title: '数据与设置', hash: '#/settings', icon: '⚙' }
  ];

  Palette.isOpen = function () { return !!mask; };

  Palette.open = function () {
    if (mask) return;
    mask = U.el(
      '<div class="modal-mask">' +
      '<div class="modal palette">' +
      '<input class="input" id="paletteInput" placeholder="搜笔记内容、找书、跳页面…" autocomplete="off">' +
      '<div class="palette-list" id="paletteList"></div>' +
      '<div class="muted small" style="margin-top:10px">↑ ↓ 选择　·　Enter 打开　·　Esc 关闭</div>' +
      '</div></div>'
    );
    document.body.appendChild(mask);
    input = mask.querySelector('#paletteInput');
    listEl = mask.querySelector('#paletteList');

    input.addEventListener('input', function () { render(input.value); });
    input.addEventListener('keydown', onKey);
    mask.addEventListener('click', function (e) {
      if (e.target === mask) return close();
      var row = e.target.closest && e.target.closest('[data-idx]');
      if (row) run(Number(row.getAttribute('data-idx')));
    });

    render('');
    input.focus();

    Data.load().then(function (d) {
      data = d;
      if (mask) render(input.value);
    });
  };

  function close() {
    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
    mask = null; input = null; listEl = null; items = []; active = 0;
  }
  Palette.close = close;
  Palette.toggle = function () { mask ? close() : Palette.open(); };

  /* ================= 结果 ================= */
  function buildItems(query) {
    var q = String(query || '').trim().toLowerCase();
    var out = [];

    /* 动作 */
    var actions = [
      { icon: '✎', title: '写一条新笔记', sub: '动作', run: function () { if (App.newNote) App.newNote(); } },
      { icon: '▶', title: '现在开始计时', sub: '动作', run: function () { location.hash = '#/timer'; setTimeout(function () { if (global.Timer && !Timer.state()) Timer.start('stopwatch', null, ''); }, 200); } },
      { icon: '↓', title: '立刻备份一份数据', sub: '动作', run: function () { Backup.now(false); } }
    ];

    /* 页面 */
    PAGES.forEach(function (p) {
      out.push({ icon: p.icon, title: p.title, sub: '页面', run: function () { location.hash = p.hash; } });
    });

    /* 书 */
    data.books.forEach(function (b) {
      out.push({
        icon: '📖', title: '《' + b.title + '》',
        sub: '书 · ' + (Data.STATUS[b.status] || '') + (b.author ? ' · ' + b.author : ''),
        run: function () { location.hash = '#/plan'; }
      });
    });

    /* 笔记 */
    data.notes.filter(function (n) { return !n.deletedAt; }).forEach(function (n) {
      var t = (n.quote || n.body || '').replace(/\s+/g, ' ').slice(0, 40);
      var b = Data.bookById(data.books, n.bookId);
      out.push({
        icon: '📝', title: t || '（空笔记）',
        sub: '笔记 · ' + (b ? '《' + b.title + '》' : '未挂书') + (n.page ? ' p.' + n.page : ''),
        run: function () {
          if (Pages.notesSelect) Pages.notesSelect(n.id);
          location.hash = '#/notes';
          if (location.hash === '#/notes' && App.refresh) App.refresh();
        }
      });
    });

    actions.forEach(function (a) { a.sub = '动作'; });

    if (!q) {
      // 没输入时：先给动作和页面，再给最近的书和笔记
      return out.slice(0, 14);
    }

    var scored = [];
    out.forEach(function (it) {
      var hay = (it.title + ' ' + (it.sub || '')).toLowerCase();
      var idx = hay.indexOf(q);
      if (idx < 0) return;
      var isAction = it.sub === '动作';
      var score = idx + (isAction ? -50 : 0) + (it.title.toLowerCase().indexOf(q) === 0 ? -20 : 0);
      scored.push({ it: it, s: score });
    });
    scored.sort(function (a, b) { return a.s - b.s; });
    return scored.slice(0, 20).map(function (x) { return x.it; });
  }

  function render(query) {
    if (!listEl) return;
    items = buildItems(query);
    active = 0;
    if (!items.length) {
      listEl.innerHTML = '<div class="muted small" style="padding:12px 6px">没有找到。试试别的词，或者换个说法。</div>';
      return;
    }
    listEl.innerHTML = items.map(function (it, i) {
      return '<div class="palette-item' + (i === active ? ' on' : '') + '" data-idx="' + i + '">' +
        '<span class="ico">' + it.icon + '</span>' +
        '<span class="txt"><b>' + U.escape(it.title) + '</b>' + (it.sub ? '<small>' + U.escape(it.sub) + '</small>' : '') + '</span>' +
        '</div>';
    }).join('');
  }

  function move(delta) {
    if (!items.length) return;
    active = (active + delta + items.length) % items.length;
    U.$$('.palette-item', listEl).forEach(function (el, i) {
      el.classList.toggle('on', i === active);
      if (i === active && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function run(i) {
    var it = items[i];
    if (!it) return;
    close();
    setTimeout(function () { it.run(); }, 0);
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') { e.preventDefault(); run(active); return; }
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  }

  global.Palette = Palette;
})(window);
