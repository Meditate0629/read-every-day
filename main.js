/* 启动、路由、主题 */
(function (global) {
  'use strict';

  var ROUTES = ['home', 'plan', 'notes', 'timer', 'reminders', 'share', 'settings'];
  var App = { settings: null };

  /* ---------- 主题 ---------- */
  var mq = global.matchMedia ? global.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolveDark(theme) {
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
    return !!(mq && mq.matches);
  }

  App.applyTheme = function () {
    var theme = (App.settings && App.settings.theme) || 'system';
    var dark = resolveDark(theme);
    document.body.classList.toggle('dark', dark);
    syncThemeIcon(dark);
  };

  /* 顶栏那颗圆按钮的图标要跟着当前外观走：现在是浅色 → 显示月亮（点了变深色） */
  function syncThemeIcon(dark) {
    var uses = document.querySelectorAll('[data-theme-toggle] use');
    for (var i = 0; i < uses.length; i++) {
      uses[i].setAttribute('href', dark ? '#i-sun' : '#i-moon');
    }
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var j = 0; j < btns.length; j++) {
      btns[j].title = dark ? '切换到浅色' : '切换到深色';
    }
  }
  App.syncThemeIcon = syncThemeIcon;

  App.setTheme = function (theme) {
    return Store.saveSettings({ theme: theme }).then(function () {
      App.settings.theme = theme;
      App.applyTheme();
      U.toast('外观已切换');
    });
  };

  App.toggleTheme = function () {
    var isDark = document.body.classList.contains('dark');
    return App.setTheme(isDark ? 'light' : 'dark');
  };

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () {
      if (!App.settings || App.settings.theme === 'system') App.applyTheme();
    });
  }

  /* ---------- 侧边栏状态 ---------- */
  function updateSideStatus() {
    var box = U.$('#sideStatus');
    if (!box || !App.settings) return;
    var last = App.settings.lastBackupAt;
    var stale = !last || (Date.now() - last) > 7 * 86400000;
    box.innerHTML = '<div class="backup-dot' + (stale ? ' warn' : '') + '">' +
      (stale ? '该备份了 · 去设置' : '已备份 · ' + U.escape(U.relative(last))) + '</div>';
    box.firstElementChild.addEventListener('click', function () { location.hash = '#/settings'; });
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    var h = String(location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return ROUTES.indexOf(h) >= 0 ? h : 'home';
  }

  function render() {
    var route = currentRoute();
    U.$$('#nav .nav-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#/' + route);
    });
    var root = U.$('#view');
    global.scrollTo(0, 0);
    try {
      Promise.resolve(Pages[route](root)).then(function () {
        // 页面刚重画过，顶栏那颗深浅色按钮的图标要按当前外观补一次
        syncThemeIcon(document.body.classList.contains('dark'));
      }).catch(showError);
    } catch (e) {
      showError(e);
    }
  }

  function showError(e) {
    U.$('#view').innerHTML = '<div class="card"><h3>这一页没画出来</h3>' +
      '<p class="muted mt6">' + U.escape(e && e.message ? e.message : String(e)) + '</p></div>';
  }

  App.refresh = function () {
    return Store.settings().then(function (s) {
      App.settings = s;
      App.applyTheme();
      updateSideStatus();
      render();
    });
  };

  /* ---------- 全局动作 ---------- */
  function newNote() {
    if (Pages.notesNew) Pages.notesNew();
    if (location.hash === '#/notes') App.refresh();
    else location.hash = '#/notes';
  }
  App.newNote = newNote;

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (t) { App.toggleTheme(); return; }

    var nn = e.target.closest && e.target.closest('[data-new]');
    if (nn) {
      var kind = nn.getAttribute('data-new');
      var mask = nn.closest('.modal-mask');
      if (kind === 'note') {
        if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
        newNote();
      }
      return;
    }

    var pal = e.target.closest && (e.target.closest('#btnPalette') || e.target.closest('[data-palette]'));
    if (pal) {
      if (global.Palette) Palette.open();
      return;
    }

    var n = e.target.closest && e.target.closest('#btnNew');
    if (n) {
      U.modal({
        title: '新建',
        sub: '想到什么就记什么；计划和提醒在各自的页面里加。',
        bodyHtml:
          '<div class="rows">' +
          '<div class="row" style="cursor:pointer" data-new="note"><span>写一条笔记</span><div class="spacer"></div><span class="pill brand">点这里</span></div>' +
          '<div class="row" style="cursor:pointer" data-go="plan"><span>加一条计划</span><div class="spacer"></div><span class="pill">去计划页</span></div>' +
          '<div class="row" style="cursor:pointer" data-go="home"><span>记一条备忘</span><div class="spacer"></div><span class="pill">去首页写</span></div>' +
          '<div class="row" style="cursor:pointer" data-go="reminders"><span>加一条提醒</span><div class="spacer"></div><span class="pill">去提醒页</span></div>' +
          '</div>',
        confirmText: '知道了', cancelText: '关闭'
      });
      return;
    }

    var go = e.target.closest && e.target.closest('[data-go]');
    if (go && go.closest('.modal-mask')) {
      var dest = go.getAttribute('data-go');
      var mask2 = go.closest('.modal-mask');
      if (mask2 && mask2.parentNode) mask2.parentNode.removeChild(mask2);
      location.hash = '#/' + dest;
    }
  });

  /* 不在输入框里的时候按 n，等于新建一条笔记；空格在计时页 = 开始/暂停 */
  document.addEventListener('keydown', function (e) {
    // Ctrl / Cmd + K：命令面板
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (global.Palette) Palette.toggle();
      return;
    }
    if (e.key === 'Escape' && global.Palette && Palette.isOpen()) { Palette.close(); return; }

    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;

    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newNote(); return; }

    if (e.key === ' ' && String(location.hash).indexOf('/timer') >= 0) {
      e.preventDefault();
      if (!global.Timer) return;
      if (!Timer.state()) Timer.start('stopwatch', null, '');
      else if (Timer.isRunning()) Timer.pause();
      else Timer.resume();
      if (App.refresh) App.refresh();
    }
  });

  /* 出了错别装作没事，但也不要刷屏 */
  var seenErrors = {};
  function reportProblem(msg) {
    if (!msg || seenErrors[msg]) return;
    seenErrors[msg] = true;
    U.toast('出了点小问题：' + msg + '（详情在浏览器控制台）');
    if (global.console) console.error('[读书计划]', msg);
  }
  global.addEventListener('error', function (e) { reportProblem(e && e.message); });
  global.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    reportProblem(r && r.message ? r.message : String(r || ''));
  });

  /* 把偏好设置真正应用下去 */
  App.applyPrefs = function (s) {
    s = s || App.settings || {};
    U.hour24 = s.hour24 !== false;
    U.weekStart = Number(s.weekStart) === 0 ? 0 : 1;
    var sizes = { sm: '13px', md: '14px', lg: '15.5px' };
    document.documentElement.style.setProperty('--fs', sizes[s.fontSize] || '14px');
  };

  /* ---------- 启动 ---------- */
  function boot() {
    Store.init().then(function () {
      return Store.settings();
    }).then(function (s) {
      App.settings = s;
      App.applyTheme();
      App.applyPrefs(s);

      global.addEventListener('hashchange', render);
      if (!location.hash) location.hash = '#/home';
      render();
      updateSideStatus();

      // 关掉再打开时，把没走完的计时接着走
      if (global.Timer) {
        Timer.setConfig(s.pomodoro, s.sound);
        Timer.restore(s).catch(function () { });
      }

      // 提醒引擎：只在页面开着时弹，错过的收进收件箱
      if (global.Reminders) {
        Reminders.init(s);
        // 进了提醒页就不让弹窗自动缩起来
        global.addEventListener('hashchange', function () { Reminders.refresh(); });
      }

      // 自动备份放在后面做，别挡着首屏
      setTimeout(function () {
        Backup.auto().then(function (done) {
          if (done) {
            Store.settings().then(function (s2) {
              App.settings = s2;
              updateSideStatus();
              if (currentRoute() === 'settings') render();   // 设置页开着就顺手刷一下
            });
          }
        });
      }, 1500);
    }).catch(function (e) {
      document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif">' +
        '<h2>启动失败</h2><p>' + U.escape(e.message) + '</p></div>';
    });
  }

  global.App = App;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
