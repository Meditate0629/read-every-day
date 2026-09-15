/* 数据层：优先用浏览器本地数据库（IndexedDB），不可用时退回 localStorage */
(function (global) {
  'use strict';

  var DB_NAME = 'reading-plan';
  var DB_VERSION = 1;
  var LS_KEY = 'rp:db';
  var TABLES = ['books', 'planItems', 'sessions', 'notes', 'memos', 'reminders', 'reminderLog', 'goals', 'settings'];

  var Store = {};
  var idb = null;
  var lsData = null;
  Store.mode = 'none';
  Store.tables = TABLES;

  /* ================= localStorage 后备 ================= */
  var LS = {
    load: function () {
      if (lsData) return lsData;
      var raw = null;
      try { raw = localStorage.getItem(LS_KEY); } catch (e) { raw = null; }
      var data = {};
      TABLES.forEach(function (t) { data[t] = []; });
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          TABLES.forEach(function (t) { if (Array.isArray(parsed[t])) data[t] = parsed[t]; });
        } catch (e) { /* 数据坏了就从空的开始，备份文件还在 */ }
      }
      lsData = data;
      return lsData;
    },
    flush: function () {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(lsData));
        return true;
      } catch (e) {
        U.toast('保存失败：浏览器本地空间不够了，先去设置里备份一下');
        return false;
      }
    },
    all: function (t) { return LS.load()[t].slice(); },
    put: function (t, doc) {
      var arr = LS.load()[t];
      var i = arr.findIndex(function (d) { return d.id === doc.id; });
      if (i >= 0) arr[i] = doc; else arr.push(doc);
      LS.flush();
      return doc;
    },
    remove: function (t, id) {
      var arr = LS.load()[t];
      var i = arr.findIndex(function (d) { return d.id === id; });
      if (i >= 0) arr.splice(i, 1);
      LS.flush();
    },
    clear: function (t) { LS.load()[t] = []; LS.flush(); }
  };

  /* ================= IndexedDB ================= */
  function idbOpen() {
    return new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { reject(e); return; }
      if (!req) { reject(new Error('indexedDB unavailable')); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        TABLES.forEach(function (t) {
          if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('indexedDB open failed')); };
      req.onblocked = function () { reject(new Error('indexedDB blocked')); };
    });
  }

  function idbAll(table) {
    return new Promise(function (resolve, reject) {
      var t = idb.transaction(table, 'readonly');
      var r = t.objectStore(table).getAll();
      r.onsuccess = function () { resolve(r.result || []); };
      r.onerror = function () { reject(r.error); };
    });
  }
  function idbPut(table, doc) {
    return new Promise(function (resolve, reject) {
      var t = idb.transaction(table, 'readwrite');
      t.objectStore(table).put(doc);
      t.oncomplete = function () { resolve(doc); };
      t.onerror = function () { reject(t.error); };
      t.onabort = function () { reject(t.error || new Error('aborted')); };
    });
  }
  function idbRemove(table, id) {
    return new Promise(function (resolve, reject) {
      var t = idb.transaction(table, 'readwrite');
      t.objectStore(table).delete(id);
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error); };
    });
  }
  function idbClear(table) {
    return new Promise(function (resolve, reject) {
      var t = idb.transaction(table, 'readwrite');
      t.objectStore(table).clear();
      t.oncomplete = function () { resolve(); };
      t.onerror = function () { reject(t.error); };
    });
  }

  /* ================= 对外接口 ================= */
  Store.init = function () {
    return idbOpen().then(function (db) {
      idb = db;
      Store.mode = 'indexeddb';
      return Store.mode;
    }).catch(function () {
      // file:// 直接打开时 Chrome 会拒绝 IndexedDB，这里退回 localStorage
      LS.load();
      Store.mode = 'localstorage';
      return Store.mode;
    });
  };

  Store.all = function (table) {
    if (idb) return idbAll(table);
    return Promise.resolve(LS.all(table));
  };

  Store.get = function (table, id) {
    return Store.all(table).then(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    });
  };

  Store.put = function (table, doc) {
    var now = Date.now();
    if (!doc.id) doc.id = U.uid();
    if (!doc.createdAt) doc.createdAt = now;
    doc.updatedAt = now;
    if (idb) return idbPut(table, doc);
    return Promise.resolve(LS.put(table, doc));
  };

  Store.putMany = function (table, docs) {
    return docs.reduce(function (p, d) { return p.then(function () { return Store.put(table, d); }); }, Promise.resolve());
  };

  Store.remove = function (table, id) {
    if (idb) return idbRemove(table, id);
    LS.remove(table, id);
    return Promise.resolve();
  };

  Store.clear = function (table) {
    if (idb) return idbClear(table);
    LS.clear(table);
    return Promise.resolve();
  };

  Store.clearAll = function () {
    return TABLES.reduce(function (p, t) { return p.then(function () { return Store.clear(t); }); }, Promise.resolve());
  };

  /* ---------- 设置（单独一个文档） ---------- */
  var DEFAULT_SETTINGS = {
    id: 'app',
    schemaVersion: 1,
    theme: 'system',
    fontSize: 'md',
    weekStart: 1,
    hour24: true,
    sound: true,
    autoBackup: true,
    defaultTemplate: 'plain',
    pomodoro: { focus: 25, rest: 5, longRest: 15, rounds: 4 },
    activeTimer: null,
    lastBackupAt: null,
    lastBackupDate: null,
    yearGoal: {},
    seeded: false
  };

  Store.settings = function () {
    return Store.get('settings', 'app').then(function (doc) {
      return Object.assign({}, DEFAULT_SETTINGS, doc || {});
    });
  };

  Store.saveSettings = function (patch) {
    return Store.settings().then(function (cur) {
      var next = Object.assign({}, cur, patch || {});
      return Store.put('settings', next);
    });
  };

  /* ---------- 统计 ---------- */
  Store.counts = function () {
    var names = { books: '书', planItems: '计划', sessions: '计时记录', notes: '笔记', memos: '备忘', reminders: '提醒', reminderLog: '提醒记录', goals: '目标', settings: '设置' };
    return Promise.all(TABLES.map(function (t) {
      return Store.all(t).then(function (l) { return { table: t, name: names[t] || t, count: l.length, size: JSON.stringify(l).length }; });
    })).then(function (list) {
      return {
        items: list,
        total: list.reduce(function (s, x) { return s + x.size; }, 0)
      };
    });
  };

  Store.dump = function () {
    var out = { app: '读书计划', format: 'reading-plan-backup', version: 1, exportedAt: Date.now() };
    return TABLES.reduce(function (p, t) {
      return p.then(function () { return Store.all(t); }).then(function (l) { out[t] = l; });
    }, Promise.resolve()).then(function () { return out; });
  };

  Store.restore = function (data, mode) {
    var tables = TABLES.filter(function (t) { return Array.isArray(data[t]); });
    if (!tables.length) return Promise.reject(new Error('这个文件里没有能识别的数据'));

    var start = mode === 'replace'
      ? Store.clearAll()
      : Promise.resolve();

    return start.then(function () {
      return tables.reduce(function (p, t) {
        return p.then(function () {
          var rows = data[t];
          if (mode === 'replace') return Store.putMany(t, rows);
          // 合并：id 相同就跳过，不覆盖现有数据
          return Store.all(t).then(function (exist) {
            var have = {};
            exist.forEach(function (d) { have[d.id] = true; });
            var add = rows.filter(function (d) { return d && d.id && !have[d.id]; });
            return Store.putMany(t, add);
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return tables.reduce(function (o, t) { o[t] = (data[t] || []).length; return o; }, {});
    });
  };

  Store.defaultSettings = DEFAULT_SETTINGS;

  global.Store = Store;
})(window);
