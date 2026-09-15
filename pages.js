/* 各个页面的渲染 */
(function (global) {
  'use strict';

  var Pages = {};

  /* ---------- 公共片段 ---------- */
  /* 顶栏分两层：
   *   第一层 = 标题 + 右icon（搜索、深浅色）—— 永远只有一行，不会把图标挤到下面去
   *   第二层 = 副标题（一句话说明）或页面自己的控件（分段器、搜索框、主按钮）
   * 以前不分层，长句子会把「切换深浅色」挤到第三行，孤零零一个圆按钮很难看。
   * 调用：topbar(标题) / topbar(标题, 副标题文字) / topbar(标题, null, 控件html)
   */
  function topbar(title, sub, actions) {
    var iconBtns =
      '<button class="icon-btn" data-palette title="全局搜索"><svg><use href="#i-search"/></svg></button>' +
      '<button class="icon-btn" data-theme-toggle title="切换深浅色"><svg><use href="#i-sun"/></svg></button>';
    return '<div class="topbar">' +
      '<div class="topbar-main">' +
      '<div class="page-title">' + U.escape(title) + '</div>' +
      '<div class="spacer"></div>' +
      (actions || '') +
      iconBtns +
      '</div>' +
      (sub ? '<div class="topbar-sub">' + sub + '</div>' : '') +
      '</div>';
  }
  Pages.topbar = topbar;

  /* （各个模块现在都有自己的文件了，这个文件只留公共片段和设置页） */

  /* ================= 设置（这一版已经做完） ================= */
  Pages.settings = function (root) {
    return Promise.all([Store.settings(), Store.counts()]).then(function (r) {
      var s = r[0], c = r[1];
      root.innerHTML = renderSettings(s, c);
      wireSettings(root, s, c);
    });
  };

  function renderSettings(s, c) {
    var days = s.lastBackupAt ? Math.floor((Date.now() - s.lastBackupAt) / 86400000) : null;
    var stale = days === null || days >= 7;
    var modeNote = Store.mode === 'indexeddb'
      ? '<span class="pill brand">本地数据库</span>'
      : '<span class="pill warn">兼容模式</span>';

    var statRows = c.items.filter(function (x) { return x.table !== 'settings'; }).map(function (x) {
      return '<div class="row"><span class="row-sub">' + U.escape(x.name) + '</span><div class="spacer"></div><span>' + x.count + '</span></div>';
    }).join('');

    return topbar('数据与设置') +

      (Store.mode === 'localstorage'
        ? '<div class="notice"><svg><use href="#i-warn"/></svg><div>' +
          '<b>现在是用"兼容模式"打开的。</b>数据能正常保存，但容量小一些（大约 5 MB）。' +
          '双击 <b>App 文件夹里的「启动.bat」</b> 打开，就能用上容量更大的本地数据库。</div></div>'
        : '') +

      '<div class="grid-auto">' +

      /* ---------- 备份 ---------- */
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">备份</div><div class="spacer"></div>' +
      '<span class="pill ' + (stale ? 'warn' : 'brand') + '">上次备份：' + U.escape(U.relative(s.lastBackupAt)) + '</span>' +
      '</div>' +
      '<div>' +
      '<div class="set-row"><div class="lbl"><b>每天第一次打开时自动备份</b><small>不用你惦记这件事</small></div>' +
      '<div class="spacer"></div><input type="checkbox" id="setAutoBackup"' + (s.autoBackup ? ' checked' : '') + '></div>' +

      '<div class="set-row"><div class="lbl"><b>备份放在哪儿</b><small>浏览器的「下载」文件夹，文件名带日期</small></div>' +
      '<div class="spacer"></div><span class="muted small">读书数据备份-日期.json</span></div>' +

      '<div class="set-row"><div class="lbl"><b>现在备份一次</b><small>存好之后可以自己丢网盘或移动硬盘</small></div>' +
      '<div class="spacer"></div><button class="btn btn-primary btn-sm" id="btnBackupNow">立即备份</button></div>' +
      '</div>' +
      '<div class="card-foot">' +
      (stale
        ? '<span style="color:var(--warn)">⚠ 已经很久没备份了。清理浏览器数据或者重装系统都会把数据清掉，点一下「立即备份」最稳妥。</span>'
        : '<span class="muted">数据只存在这台电脑上，定期备份是唯一的保险。浏览器的「下载」偶尔会被拦下来（比如弹出"是否允许下载多个文件"）——不确定的时候，去下载文件夹看一眼，或者直接点「立即备份」。</span>') +
      '</div></div>' +

      /* ---------- 导入导出 ---------- */
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">导入 / 导出</div></div>' +
      '<div>' +
      '<div class="set-row"><div class="lbl"><b>导出全部数据</b><small>计划、笔记、计时、设置，一个文件全带走</small></div>' +
      '<div class="spacer"></div><button class="btn" id="btnExport">导出</button></div>' +
      '<div class="set-row"><div class="lbl"><b>导入数据</b><small>换电脑、或者从备份里恢复</small></div>' +
      '<div class="spacer"></div><button class="btn" id="btnImport">选择文件…</button></div>' +
      '</div>' +
      '<div class="card-foot"><span class="muted">导入前会先让你看一眼文件里有什么，再决定「合并」还是「覆盖」，不会直接动你现在的数据。</span></div>' +
      '</div>' +

      /* ---------- 存储 ---------- */
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">存储</div><div class="spacer"></div>' + modeNote + '</div>' +
      '<div class="rows">' + statRows + '</div>' +
      '<div class="card-foot"><span class="muted">占了大约 ' + U.escape(U.fmtBytes(c.total)) + ' · 数据存在这台电脑的浏览器里，不会上传到任何地方</span></div>' +
      '<div class="danger-zone mt14">' +
      '<div class="row-flex"><div><b style="color:var(--danger)">清空所有数据</b>' +
      '<div class="small muted mt6">会把上面这些全部删掉，删了找不回来。所以要先备份成功一次，才允许点。</div></div>' +
      '<div class="spacer"></div><button class="btn btn-danger" id="btnWipe">清空…</button></div>' +
      '</div></div>' +

      /* ---------- 偏好 ---------- */
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">偏好设置</div></div>' +
      '<div>' +
      '<div class="set-row"><div class="lbl"><b>外观</b></div><div class="spacer"></div><div class="radio-row" id="setTheme">' +
      themeRadio('system', '跟随系统', s.theme) + themeRadio('light', '浅色', s.theme) + themeRadio('dark', '深色', s.theme) +
      '</div></div>' +

      '<div class="set-row"><div class="lbl"><b>一周从哪天开始</b></div><div class="spacer"></div><div class="radio-row" id="setWeek">' +
      '<label><input type="radio" name="wk" value="1"' + (s.weekStart === 1 ? ' checked' : '') + '> 周一</label>' +
      '<label><input type="radio" name="wk" value="0"' + (s.weekStart === 0 ? ' checked' : '') + '> 周日</label>' +
      '</div></div>' +

      '<div class="set-row"><div class="lbl"><b>正文字号</b><small>觉得字小就调大一号</small></div><div class="spacer"></div>' +
      '<select class="input" style="width:120px" id="setFont">' +
      '<option value="sm"' + (s.fontSize === 'sm' ? ' selected' : '') + '>小</option>' +
      '<option value="md"' + (s.fontSize !== 'sm' && s.fontSize !== 'lg' ? ' selected' : '') + '>中</option>' +
      '<option value="lg"' + (s.fontSize === 'lg' ? ' selected' : '') + '>大</option>' +
      '</select></div>' +

      '<div class="set-row"><div class="lbl"><b>时间制</b></div><div class="spacer"></div><div class="radio-row" id="setHour">' +
      '<label><input type="radio" name="h24" value="1"' + (s.hour24 !== false ? ' checked' : '') + '> 24 小时</label>' +
      '<label><input type="radio" name="h24" value="0"' + (s.hour24 === false ? ' checked' : '') + '> 12 小时</label>' +
      '</div></div>' +

      '<div class="set-row"><div class="lbl"><b>番茄钟默认值</b><small>专注 / 休息 / 长休息 / 每几轮</small></div>' +
      '<div class="spacer"></div>' +
      '<span class="muted mono small">' + (s.pomodoro ? [s.pomodoro.focus, s.pomodoro.rest, s.pomodoro.longRest, s.pomodoro.rounds].join(' · ') : '25 · 5 · 15 · 4') + '</span>' +
      '<button class="btn btn-sm" id="btnPomo">修改</button></div>' +

      '<div class="set-row"><div class="lbl"><b>提醒声音</b><small>管的是番茄结束的提示音和提醒的提示音</small></div>' +
      '<div class="spacer"></div><input type="checkbox" id="setSound"' + (s.sound ? ' checked' : '') + '></div>' +

      '<div class="set-row"><div class="lbl"><b>默认分享模板</b><small>进分享页时先用哪一个</small></div><div class="spacer"></div>' +
      '<select class="input" style="width:120px" id="setTpl">' +
      ['plain', 'warm', 'dark'].map(function (k) {
        var name = { plain: '素雅', warm: '暖色', dark: '深色' }[k];
        return '<option value="' + k + '"' + (s.defaultTemplate === k || (!s.defaultTemplate && k === 'plain') ? ' selected' : '') + '>' + name + '</option>';
      }).join('') +
      '</select></div>' +
      '</div></div>' +

      /* ---------- 关于 ---------- */
      '<div class="card">' +
      '<div class="card-head"><div class="card-title">关于</div><div class="spacer"></div><span class="muted small">版本 1.0</span></div>' +
      '<div class="rows">' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">换一台电脑怎么把数据搬过去</div>' +
      '<div class="row-sub">在旧电脑点「导出」拿到一个文件 → 在新电脑打开这个 App，点「导入数据」选那个文件 → 完事。</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">什么情况下数据会没</div>' +
      '<div class="row-sub">清理浏览器数据、重装系统、换浏览器。所以别关掉「每天自动备份」。</div></div></div>' +
      '<div class="row" style="align-items:flex-start"><div><div class="row-title">这个 App 会不会联网</div>' +
      '<div class="row-sub">不会。它跑在你自己的电脑上，连的地址是 127.0.0.1（就是"本机"的意思），数据不出这台电脑。</div></div></div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="row-flex">' +
      '<div style="flex:1"><b style="font-size:13px">跑一遍自检</b>' +
      '<div class="small muted mt6">把存储、统计、提醒时刻、图片卡片、PDF 生成这些关键功能在你电脑上实测一遍，看有没有坏的。</div></div>' +
      '<button class="btn btn-sm" id="btnSelfTest">开始自检</button>' +
      '</div>' +
      '</div>';
  }

  function themeRadio(value, label, current) {
    return '<label><input type="radio" name="theme" value="' + value + '"' + (current === value ? ' checked' : '') + '> ' + label + '</label>';
  }

  function wireSettings(root, s, c) {
    /* 自动备份开关 */
    var auto = U.$('#setAutoBackup', root);
    if (auto) auto.addEventListener('change', function () {
      Store.saveSettings({ autoBackup: auto.checked }).then(function () {
        U.toast(auto.checked ? '已打开每天自动备份' : '已关闭自动备份');
      });
    });

    /* 立即备份 */
    var bn = U.$('#btnBackupNow', root);
    if (bn) bn.addEventListener('click', function () {
      bn.disabled = true;
      Backup.now(false).then(function () { Pages.settings(root); });
    });

    /* 导出 */
    var be = U.$('#btnExport', root);
    if (be) be.addEventListener('click', function () {
      be.disabled = true;
      Store.dump().then(function (data) {
        var d = new Date(data.exportedAt);
        U.downloadJson(data, '读书数据备份-' + d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()) + '.json');
        return Store.saveSettings({ lastBackupAt: data.exportedAt, lastBackupDate: U.todayStr() });
      }).then(function () {
        U.toast('已导出到「下载」文件夹');
        Pages.settings(root);
      }).catch(function (e) {
        be.disabled = false;
        U.toast('导出失败：' + e.message);
      });
    });

    /* 导入 */
    var bi = U.$('#btnImport', root);
    if (bi) bi.addEventListener('click', function () {
      Backup.importFlow().then(function (done) {
        if (done === true) Pages.settings(root);
      });
    });

    /* 清空 */
    var bw = U.$('#btnWipe', root);
    if (bw) bw.addEventListener('click', function () {
      if (!s.lastBackupAt) {
        U.modal({
          title: '先备份一次再清空',
          sub: '这是为了保护你 —— 万一清空之后后悔了，还有文件能救回来。',
          bodyHtml: '<p class="muted">点下面的按钮会先导出备份文件，导出完再回来点「清空」。</p>',
          confirmText: '现在备份', cancelText: '算了',
          onOk: function () { return Backup.now(false).then(function () { Pages.settings(root); return true; }); }
        });
        return;
      }
      U.modal({
        title: '确定要清空所有数据吗？',
        sub: '会把计划、笔记、计时记录、设置全部删掉，删了找不回来。',
        bodyHtml: '<div class="field"><label>想继续的话，请在下面输入「清空」两个字</label>' +
          '<input class="input" id="wipeWord" placeholder="清空" data-autofocus autocomplete="off"></div>',
        confirmText: '确认清空', danger: true,
        onOk: function (mask) {
          var v = (U.$('#wipeWord', mask).value || '').trim();
          if (v !== '清空') { U.toast('要输入「清空」两个字才能继续'); return false; }
          return Store.clearAll().then(function () {
            U.toast('已经全部清空了');
            Pages.settings(root);
            return true;
          });
        }
      });
    });

    /* 主题 */
    U.$$('#setTheme input', root).forEach(function (input) {
      input.addEventListener('change', function () {
        App.setTheme(input.value);
      });
    });

    /* 一周从哪天 */
    U.$$('#setWeek input', root).forEach(function (input) {
      input.addEventListener('change', function () {
        Store.saveSettings({ weekStart: Number(input.value) }).then(function () {
          if (App.settings) App.settings.weekStart = Number(input.value);
          if (App.applyPrefs) App.applyPrefs(App.settings);
          U.toast('已经改好，日历跟着变');
        });
      });
    });

    /* 正文字号 */
    var fontEl = U.$('#setFont', root);
    if (fontEl) fontEl.addEventListener('change', function () {
      Store.saveSettings({ fontSize: fontEl.value }).then(function () {
        if (App.settings) App.settings.fontSize = fontEl.value;
        if (App.applyPrefs) App.applyPrefs(App.settings);
        U.toast('字号改好了');
      });
    });

    /* 时间制 */
    U.$$('#setHour input', root).forEach(function (input) {
      input.addEventListener('change', function () {
        var v = input.value === '1';
        Store.saveSettings({ hour24: v }).then(function () {
          if (App.settings) App.settings.hour24 = v;
          if (App.applyPrefs) App.applyPrefs(App.settings);
          U.toast(v ? '改成 24 小时制' : '改成 12 小时制');
        });
      });
    });

    /* 默认分享模板 */
    var tplEl = U.$('#setTpl', root);
    if (tplEl) tplEl.addEventListener('change', function () {
      Store.saveSettings({ defaultTemplate: tplEl.value }).then(function () {
        if (App.settings) App.settings.defaultTemplate = tplEl.value;
        U.toast('默认模板改好了');
      });
    });

    /* 声音 */
    var snd = U.$('#setSound', root);
    if (snd) snd.addEventListener('change', function () {
      Store.saveSettings({ sound: snd.checked }).then(function () {
        if (global.Timer) Timer.setConfig(null, snd.checked);
        if (global.Reminders) Reminders.setSound(snd.checked);
        U.toast(snd.checked ? '声音已打开' : '声音已关掉');
      });
    });

    /* 番茄钟默认值 */
    var bp = U.$('#btnPomo', root);
    if (bp) bp.addEventListener('click', function () {
      if (Pages.pomodoroDialog) Pages.pomodoroDialog();
    });

    /* 自检 */
    var bt = U.$('#btnSelfTest', root);
    if (bt) bt.addEventListener('click', function () {
      if (!global.SelfTest) { U.toast('自检模块没加载出来'); return; }
      bt.disabled = true;
      bt.textContent = '自检中…';
      SelfTest.run().then(function (list) {
        if (bt.parentNode) { bt.disabled = false; bt.textContent = '开始自检'; }
        var fails = list.filter(function (x) { return !x.ok; });
        var html = '<div class="rows">' + list.map(function (x) {
          return '<div class="row" style="align-items:flex-start">' +
            '<span style="width:20px;flex:0 0 20px">' + (x.ok ? '✅' : '❌') + '</span>' +
            '<div style="flex:1;min-width:0"><div class="row-title">' + U.escape(x.name) + '</div>' +
            (x.note ? '<div class="row-sub">' + U.escape(x.note) + '</div>' : '') +
            '</div></div>';
        }).join('') + '</div>';
        U.modal({
          title: fails.length ? ('自检发现 ' + fails.length + ' 个问题') : '自检全部通过',
          sub: '一共测了 ' + list.length + ' 项' + (fails.length ? '，下面打 ❌ 的就是不正常的' : ''),
          bodyHtml: html,
          confirmText: '知道了', cancelText: '关闭'
        });
      });
    });
  }

  global.Pages = Pages;
})(window);
