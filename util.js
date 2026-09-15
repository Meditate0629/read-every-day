/* 通用小工具 */
(function (global) {
  'use strict';

  var U = {};

  /* 偏好设置会改这两个：24 小时制 / 一周从哪天开始（1=周一，0=周日） */
  U.hour24 = true;
  U.weekStart = 1;

  /* ---------- 基础 ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  U.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  };

  U.escape = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.uid = function () {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  };

  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 300);
    };
  };

  /* ---------- 日期 ---------- */
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  U.dateStr = function (d) {
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };

  U.todayStr = function () { return U.dateStr(new Date()); };

  U.parseDate = function (s) {
    var p = String(s || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  };

  U.addDays = function (s, n) {
    var d = U.parseDate(s);
    d.setDate(d.getDate() + n);
    return U.dateStr(d);
  };

  U.fmtDateCN = function (s, withWeek) {
    var d = U.parseDate(s);
    var t = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    if (withWeek !== false) t += ' 星期' + WEEK[d.getDay()];
    return t;
  };

  U.fmtDateShort = function (s) {
    var d = U.parseDate(s);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  };

  U.fmtTime = function (ts) {
    var d = new Date(ts);
    if (U.hour24 === false) {
      var h = d.getHours() % 12;
      if (h === 0) h = 12;
      return h + ':' + U.pad2(d.getMinutes()) + (d.getHours() < 12 ? ' AM' : ' PM');
    }
    return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  /* 存进数据库的时间一律用这个（永远是 24 小时制），显示才用 fmtTime */
  U.fmtTime24 = function (ts) {
    var d = new Date(ts);
    return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  /* 是不是手机 / 窄屏。判断条件要和 app.css 里的媒体查询保持一致：
     竖屏看宽度，横屏看高度（手机横过来只有 390 高） */
  U.isPhone = function () {
    try {
      if (global.matchMedia && global.matchMedia('(max-width: 820px), (max-height: 480px) and (pointer: coarse)').matches) return true;
    } catch (e) { }
    return global.innerWidth <= 820;
  };

  /* 日历表头（跟着"一周从哪天开始"走） */
  U.weekOrder = function () {
    var all = ['一', '二', '三', '四', '五', '六', '日'];
    return U.weekStart === 0 ? [all[6]].concat(all.slice(0, 6)) : all;
  };

  /* 某月 1 号前面要空几格 */
  U.leadOffset = function (monthStartStr) {
    var d = U.parseDate(monthStartStr).getDay();   // 0 = 周日
    return U.weekStart === 0 ? d : (d + 6) % 7;
  };

  U.fmtDateTime = function (ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  U.relative = function (ts) {
    if (!ts) return '从没备份过';
    var diff = Date.now() - ts;
    var day = Math.floor(diff / 86400000);
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    if (day === 1) return '昨天';
    if (day < 30) return day + ' 天前';
    return U.fmtDateTime(ts);
  };

  U.monthStart = function (s) { var d = U.parseDate(s); return U.dateStr(new Date(d.getFullYear(), d.getMonth(), 1)); };
  U.monthEnd = function (s) { var d = U.parseDate(s); return U.dateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
  U.monthDays = function (s) { return U.parseDate(U.monthEnd(s)).getDate(); };

  U.weekdayIndexMon = function (s) { return (U.parseDate(s).getDay() + 6) % 7; }; // 周一 = 0

  /* ---------- 时长 ---------- */
  U.fmtMinutes = function (min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
  };

  U.fmtClock = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + ':' + U.pad2(m) + ':' + U.pad2(s);
    return U.pad2(m) + ':' + U.pad2(s);
  };

  U.fmtBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  /* ---------- 下载 / 读取文件 ---------- */
  U.download = function (blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  };

  U.downloadJson = function (obj, filename) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
    U.download(blob, filename);
  };

  U.pickFile = function (accept) {
    return new Promise(function (resolve) {
      var input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.onchange = function () {
        var f = input.files && input.files[0];
        if (!f) { resolve(null); return; }
        var fr = new FileReader();
        fr.onload = function () { resolve({ name: f.name, size: f.size, text: String(fr.result) }); };
        fr.onerror = function () { resolve(null); };
        fr.readAsText(f, 'utf-8');
      };
      input.click();
    });
  };

  /* ---------- 提示 ---------- */
  var toastTimer = null;
  U.toast = function (msg) {
    var t = U.$('#toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2200);
  };

  /* ---------- 弹窗 ---------- */
  U.modal = function (opts) {
    return new Promise(function (resolve) {
      var mask = U.el(
        '<div class="modal-mask">' +
        '<div class="modal">' +
        '<h3>' + U.escape(opts.title || '') + '</h3>' +
        (opts.sub ? '<div class="modal-sub">' + U.escape(opts.sub) + '</div>' : '<div style="height:10px"></div>') +
        '<div class="modal-body">' + (opts.bodyHtml || '') + '</div>' +
        '<div class="modal-actions">' +
        '<button class="btn" data-act="cancel">' + U.escape(opts.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="ok">' + U.escape(opts.confirmText || '确定') + '</button>' +
        '</div></div></div>'
      );
      document.body.appendChild(mask);

      function close(val) {
        document.removeEventListener('keydown', onKey);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(val);
      }
      function onKey(e) { if (e.key === 'Escape') close(null); }

      mask.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'cancel') return close(null);
        if (act === 'ok') {
          if (typeof opts.onOk === 'function') {
            var r = opts.onOk(mask);
            if (r === false) return;   // 校验没过，不关
            if (r && typeof r.then === 'function') { r.then(function (v) { if (v !== false) close(v == null ? true : v); }); return; }
            if (r != null && r !== true) return close(r);
          }
          return close(true);
        }
        if (e.target === mask) close(null);
      });
      document.addEventListener('keydown', onKey);

      var focusEl = mask.querySelector('[data-autofocus]') || mask.querySelector('[data-act="ok"]');
      if (focusEl) focusEl.focus();
    });
  };

  U.confirm = function (title, sub, confirmText, danger) {
    return U.modal({ title: title, sub: sub, confirmText: confirmText || '确定', danger: !!danger });
  };

  global.U = U;
})(window);
