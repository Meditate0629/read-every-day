/* 自检：把关键功能在本机跑一遍，列出通过/失败
 * 用来在没有开发者工具的情况下确认"这个 App 是好的"。
 */
(function (global) {
  'use strict';

  var SelfTest = {};

  function ok(list, name, note) { list.push({ name: name, ok: true, note: note || '' }); }
  function bad(list, name, note) { list.push({ name: name, ok: false, note: note || '' }); }

  function sync(list, name, fn) {
    try {
      var r = fn();
      if (r === false) bad(list, name, '没通过');
      else ok(list, name, typeof r === 'string' ? r : '');
    } catch (e) {
      bad(list, name, e && e.message ? e.message : String(e));
    }
  }

  function step(list, name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(function (r) {
        if (r === false) bad(list, name, '没通过');
        else ok(list, name, typeof r === 'string' ? r : '');
      })
      .catch(function (e) {
        bad(list, name, e && e.message ? e.message : String(e));
      });
  }

  SelfTest.run = function () {
    var list = [];

    /* ---------- 1. 各个模块在不在 ---------- */
    sync(list, '所有模块都加载了', function () {
      var need = ['U', 'Store', 'Backup', 'Data', 'PDF', 'Share', 'Timer', 'Reminders', 'Palette', 'Pages', 'App'];
      var miss = need.filter(function (k) { return !global[k]; });
      if (miss.length) throw new Error('缺：' + miss.join('、'));
      return need.length + ' 个';
    });

    /* ---------- 2. 存储 ---------- */
    sync(list, '数据存储方式', function () {
      return Store.mode === 'indexeddb' ? '本地数据库（容量大）' : '兼容模式（localStorage，容量小一些）';
    });

    /* ---------- 3. 主题 / 偏好 ---------- */
    sync(list, '深浅色切换', function () {
      var was = document.body.classList.contains('dark');
      document.body.classList.toggle('dark');
      var changed = document.body.classList.contains('dark') !== was;
      document.body.classList.toggle('dark');
      if (!changed) throw new Error('切不动');
      return '正常';
    });
    sync(list, '偏好设置已应用', function () {
      if (typeof U.hour24 !== 'boolean') throw new Error('时间制没生效');
      if (U.weekStart !== 0 && U.weekStart !== 1) throw new Error('一周起始没生效');
      return (U.hour24 ? '24 小时制' : '12 小时制') + ' · ' + (U.weekStart === 1 ? '周一起' : '周日起');
    });

    /* ---------- 4. 日历 / 统计 ---------- */
    sync(list, '日历表头跟着设置走', function () {
      var w = U.weekOrder();
      if (w.length !== 7) throw new Error('表头不是 7 格');
      return w.join('');
    });
    sync(list, '月度前导空格算得出来', function () {
      var off = U.leadOffset(U.monthStart(U.todayStr()));
      if (off < 0 || off > 6) throw new Error('算出来是 ' + off);
      return String(off);
    });

    /* ---------- 5. 写一条 → 读出来 → 删掉 ---------- */
    var probeId = null;
    return step(list, '写入一条测试数据', function () {
      return Store.put('memos', { text: '__selftest__' }).then(function (d) {
        probeId = d.id;
        if (!d.id) throw new Error('没拿到 id');
        return '写入成功';
      });
    }).then(function () {
      return step(list, '再读出来', function () {
        return Store.get('memos', probeId).then(function (d) {
          if (!d || d.text !== '__selftest__') throw new Error('读出来不对');
          return '读到了';
        });
      });
    }).then(function () {
      return step(list, '删掉它', function () {
        return Store.remove('memos', probeId).then(function () {
          return Store.get('memos', probeId).then(function (d) {
            if (d) throw new Error('没删干净');
            return '删干净了';
          });
        });
      });
    }).then(function () {
      return step(list, '读取全部业务数据', function () {
        return Data.load().then(function (d) {
          return '书 ' + d.books.length + ' · 计划 ' + d.planItems.length +
            ' · 笔记 ' + d.notes.length + ' · 计时 ' + d.sessions.length +
            ' · 提醒 ' + d.reminders.length + ' · 备忘 ' + d.memos.length;
        });
      });
    })

      /* ---------- 6. 统计函数不炸 ---------- */
      .then(function () {
        return step(list, '今日 / 本月 / 今年统计', function () {
          return Data.load().then(function (d) {
            var day = Data.dayStats(d, U.todayStr());
            var mon = Data.monthStats(d, Data.monthKey(U.todayStr()));
            var yr = Data.yearStats(d, U.parseDate(U.todayStr()).getFullYear());
            return '今天 ' + day.minutes + ' 分 · 本月 ' + mon.minutes + ' 分 · 今年 ' + yr.count + ' 本';
          });
        });
      })

      /* ---------- 7. 提醒计算 ---------- */
      .then(function () {
        return step(list, '提醒时刻能算出来', function () {
          return Data.load().then(function (d) {
            var t = U.todayStr();
            var due = Reminders.dueAt({ kind: 'daily', time: '21:00', enabled: true }, t, d, Date.now());
            if (!due) throw new Error('每天 21:00 算不出时刻');
            var none = Reminders.dueAt({ kind: 'daily', time: '21:00', weekdays: [7], enabled: true }, t, d, Date.now());
            return '每天型正常' + (none === null ? ' · 星期过滤正常' : '');
          });
        });
      })

      /* ---------- 8. 图片卡片 ---------- */
      .then(function () {
        return step(list, '笔记卡片画得出来', function () {
          var c = Share.noteImage({ quote: '测试摘录', body: '测试正文', page: '12', createdAt: Date.now() }, { template: 'plain', showBook: true, showPage: true, showDate: true, bookTitle: '测试书' });
          if (c.width !== 1080 || c.height !== 1080) throw new Error('尺寸不对：' + c.width + '×' + c.height);
          return '1080 × 1080';
        });
      })
      .then(function () {
        return step(list, '长图画得出来', function () {
          var notes = [
            { quote: '第一条摘录', body: '', createdAt: Date.now() },
            { quote: '', body: '第二条正文', createdAt: Date.now() }
          ];
          var c = Share.notesLongImage(notes, { template: 'warm', headerTitle: '测试', showBook: false, showPage: false, showDate: false });
          if (c.width !== 1080 || c.height < 500) throw new Error('尺寸不对：' + c.width + '×' + c.height);
          return '1080 × ' + c.height;
        });
      })
      .then(function () {
        return step(list, '计划卡片画得出来', function () {
          return Data.load().then(function (d) {
            var v = Share.yearView(d, U.parseDate(U.todayStr()).getFullYear());
            var c = Share.planCard(v, { template: 'dark' });
            if (c.width !== 1080) throw new Error('宽度不对');
            return '1080 × 1080';
          });
        });
      })

      /* ---------- 9. A4 页面与 PDF ---------- */
      .then(function () {
        return step(list, 'A4 页面尺寸', function () {
          var c = PDF.makePage(150);
          if (c.width !== 1240 || c.height !== 1754) throw new Error('是 ' + c.width + '×' + c.height);
          return '1240 × 1754（150dpi）';
        });
      })
      .then(function () {
        return step(list, 'PDF 文件生成合法', function () {
          var c = PDF.makePage(72);
          var x = c.getContext('2d');
          x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          x.fillStyle = '#000'; x.font = '24px sans-serif'; x.fillText('自检', 40, 40);
          var blob = PDF.build([c]);
          if (!blob) throw new Error('没生成出来');
          return blob.arrayBuffer().then(function (buf) {
            var head = String.fromCharCode.apply(null, new Uint8Array(buf.slice(0, 8)));
            if (head !== '%PDF-1.4') throw new Error('文件头不对：' + head);
            var all = new Uint8Array(buf);
            var tail = '';
            for (var i = Math.max(0, all.length - 120); i < all.length; i++) tail += String.fromCharCode(all[i]);
            if (tail.indexOf('%%EOF') < 0) throw new Error('结尾不完整');
            var m = tail.match(/startxref\s+(\d+)/);
            if (!m) throw new Error('没有 startxref');
            var at = Number(m[1]);
            var four = '';
            for (var j = at; j < at + 4 && j < all.length; j++) four += String.fromCharCode(all[j]);
            if (four !== 'xref') throw new Error('交叉引用表位置不对');
            return '两页结构正常 · ' + Math.round(blob.size / 1024) + ' KB';
          });
        });
      })

      /* ---------- 10. 页面都能渲染 ---------- */
      .then(function () {
        return step(list, '七个页面都有对应的渲染函数', function () {
          var need = ['home', 'plan', 'notes', 'timer', 'reminders', 'share', 'settings'];
          var miss = need.filter(function (k) { return typeof Pages[k] !== 'function'; });
          if (miss.length) throw new Error('缺：' + miss.join('、'));
          return '7 个都在';
        });
      })

      /* ---------- 11. 备份数据能拼出来 ---------- */
      .then(function () {
        return step(list, '备份文件能拼出来', function () {
          return Store.dump().then(function (d) {
            if (d.format !== 'reading-plan-backup') throw new Error('格式标记不对');
            var n = 0;
            Object.keys(d).forEach(function (k) { if (Array.isArray(d[k])) n += d[k].length; });
            return '共 ' + n + ' 条记录';
          });
        });
      })

      .then(function () { return list; })
      .catch(function (e) {
        bad(list, '自检本身出错了', e && e.message ? e.message : String(e));
        return list;
      });
  };

  global.SelfTest = SelfTest;
})(window);
