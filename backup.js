/* 备份与恢复 */
(function (global) {
  'use strict';

  var Backup = {};

  function fileName(ts) {
    var d = new Date(ts);
    return '读书数据备份-' + d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate()) + '.json';
  }

  /* 备份一次：导出成文件 + 记录时间 */
  Backup.now = function (silent) {
    return Store.dump().then(function (data) {
      U.downloadJson(data, fileName(data.exportedAt));
      return Store.saveSettings({ lastBackupAt: data.exportedAt, lastBackupDate: U.todayStr() });
    }).then(function () {
      if (!silent) U.toast('已备份到「下载」文件夹');
      return true;
    }).catch(function (e) {
      if (!silent) U.toast('备份失败：' + e.message);
      return false;
    });
  };

  /* 每天第一次打开时自动备份（浏览器若拦截自动下载，可以手动点"立即备份"） */
  Backup.auto = function () {
    return Store.settings().then(function (s) {
      if (!s.autoBackup) return false;
      if (s.lastBackupDate === U.todayStr()) return false;
      return Backup.now(true);
    });
  };

  /* 导入：先给用户看清楚里面有什么，再选合并还是覆盖 */
  Backup.importFlow = function () {
    return U.pickFile('.json,application/json').then(function (file) {
      if (!file) return false;

      var data;
      try {
        data = JSON.parse(file.text);
      } catch (e) {
        return U.modal({
          title: '这个文件读不出来',
          sub: file.name,
          bodyHtml: '<p class="muted">它不是一个有效的备份文件（内容不是标准格式）。请确认选的是「读书数据备份-日期.json」。</p>',
          confirmText: '知道了', cancelText: '关闭'
        }).then(function () { return false; });
      }

      var names = { books: '本书', planItems: '条计划', sessions: '次计时记录', notes: '条笔记', memos: '条备忘', reminders: '条提醒', reminderLog: '条提醒记录', goals: '个目标' };
      var lines = [];
      Object.keys(names).forEach(function (t) {
        if (Array.isArray(data[t]) && data[t].length) lines.push('<b>' + data[t].length + '</b> ' + names[t]);
      });
      if (!lines.length) {
        return U.modal({
          title: '这个文件里没有数据',
          sub: file.name,
          bodyHtml: '<p class="muted">文件格式对，但里面是空的。</p>',
          confirmText: '知道了', cancelText: '关闭'
        }).then(function () { return false; });
      }

      var when = data.exportedAt ? U.fmtDateTime(data.exportedAt) : '未知时间';
      var body =
        '<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:13px;line-height:2">' +
        '这个文件里有：' + lines.join(' · ') + '<br>' +
        '<span class="muted">备份时间：' + U.escape(when) + '</span>' +
        '</div>' +
        '<div style="margin-top:16px;display:flex;flex-direction:column;gap:10px;font-size:13.5px">' +
        '<label class="row-flex" style="gap:8px;cursor:pointer"><input type="radio" name="imp" value="merge" checked> <span><b>合并</b> —— 保留现在的数据，把文件里的并进来（同样的记录会跳过）</span></label>' +
        '<label class="row-flex" style="gap:8px;cursor:pointer"><input type="radio" name="imp" value="replace"> <span><b>覆盖</b> —— 清空现在的，完全换成文件里的</span></label>' +
        '</div>';

      return U.modal({
        title: '导入数据',
        sub: file.name,
        bodyHtml: body,
        confirmText: '开始导入',
        onOk: function (mask) {
          var picked = mask.querySelector('input[name="imp"]:checked');
          var mode = picked ? picked.value : 'merge';
          return Store.restore(data, mode).then(function () {
            U.toast(mode === 'replace' ? '已经整体替换成文件里的数据' : '已经合并进来，重复的跳过了');
            return true;
          }).catch(function (e) {
            U.toast('导入失败：' + e.message);
            return false;
          });
        }
      });
    });
  };

  global.Backup = Backup;
})(window);
