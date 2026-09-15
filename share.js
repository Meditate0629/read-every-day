/* 分享：把笔记和计划画成图片卡片 / PDF
 * 全部用画布自己画，不依赖任何第三方库；预览和导出走的是同一套绘制代码，
 * 所以"预览里看到什么样，导出来就是什么样"。
 */
(function (global) {
  'use strict';

  var Share = {};

  var TEMPLATES = {
    plain: { name: '素雅', bg: '#FCFAF7', fg: '#2B2724', sub: '#8A8079', accent: '#2F6B4F', line: '#E7E2DA', ring: '#EDE9E2' },
    warm: { name: '暖色', bg: '#F8EDDD', fg: '#4A3823', sub: '#8B7355', accent: '#B07B3C', line: '#E7D6BC', ring: '#EFE2CC' },
    dark: { name: '深色', bg: '#26231F', fg: '#EFE9E1', sub: '#9C948A', accent: '#8FBF9F', line: '#3C3833', ring: '#332F2A' }
  };
  Share.TEMPLATES = TEMPLATES;

  var SERIF = '"Songti SC","Source Han Serif SC","SimSun",Georgia,serif';
  var SANS = '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif';

  /* ================= 画布小工具 ================= */
  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function ctxOf(c) {
    var x = c.getContext('2d');
    x.textBaseline = 'top';
    return x;
  }

  /* 按宽度折行：逐字量，中英文都能折 */
  function wrapLines(ctx, text, maxW) {
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      if (!para) { out.push(''); return; }
      var line = '';
      for (var i = 0; i < para.length; i++) {
        var test = line + para[i];
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = para[i]; }
        else line = test;
      }
      if (line) out.push(line);
    });
    return out;
  }
  Share.wrapLines = wrapLines;

  function drawLines(ctx, lines, x, y, lineH, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineH);
    return lines.length * lineH;
  }

  function ellipsis(ctx, text, maxW) {
    var t = String(text || '');
    if (ctx.measureText(t).width <= maxW) return t;
    while (t.length && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }
  Share.ellipsis = ellipsis;

  function drawRing(ctx, cx, cy, r, pct, t, label, sub) {
    ctx.lineWidth = 20;
    ctx.strokeStyle = t.ring;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (pct > 0) {
      ctx.strokeStyle = t.accent;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, pct));
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = t.fg;
    ctx.font = '600 92px ' + SANS;
    ctx.fillText(label, cx, cy - 60);
    if (sub) {
      ctx.fillStyle = t.sub;
      ctx.font = '40px ' + SANS;
      ctx.fillText(sub, cx, cy + 50);
    }
    ctx.textAlign = 'left';
  }

  /* ================= 方图 / 长图的尺寸 ================= */
  Share.SQUARE = 1080;

  /* ================= 笔记卡片 ================= */
  function noteMetrics(ctx, note, opt, maxW) {
    var quote = (note.quote || '').trim();
    var body = (note.body || '').trim();
    var m = { blocks: [], total: 0 };

    if (quote) {
      ctx.font = opt.quoteFont;
      var ql = wrapLines(ctx, quote, maxW);
      m.blocks.push({ kind: 'quote', lines: ql, lineH: opt.quoteLH });
      m.total += ql.length * opt.quoteLH;
    }
    if (body) {
      ctx.font = opt.bodyFont;
      var bl = wrapLines(ctx, body, maxW);
      m.blocks.push({ kind: 'body', lines: bl, lineH: opt.bodyLH, gap: quote ? opt.gap : 0 });
      m.total += (quote ? opt.gap : 0) + bl.length * opt.bodyLH;
    }
    m.total += opt.footerH;
    return m;
  }

  function noteOptions(size) {
    if (size === 'a4') {
      return {
        w: 1240, h: 1754, pad: 130, quoteFont: '58px ' + SERIF, quoteLH: 96,
        bodyFont: '38px ' + SANS, bodyLH: 64, gap: 52, footerH: 150, metaFont: '32px ' + SANS
      };
    }
    return {
      w: 1080, h: 1080, pad: 110, quoteFont: '54px ' + SERIF, quoteLH: 88,
      bodyFont: '36px ' + SANS, bodyLH: 60, gap: 46, footerH: 150, metaFont: '30px ' + SANS
    };
  }

  function drawNote(ctx, note, opt, t, info, top, maxW) {
    var quote = (note.quote || '').trim();
    var body = (note.body || '').trim();
    var y = top;

    if (quote) {
      ctx.font = opt.quoteFont;
      var ql = wrapLines(ctx, quote, maxW);
      drawLines(ctx, ql, opt.pad, y, opt.quoteLH, t.fg);
      y += ql.length * opt.quoteLH;
    }
    if (body) {
      if (quote) y += opt.gap;
      ctx.font = opt.bodyFont;
      var bl = wrapLines(ctx, body, maxW);
      drawLines(ctx, bl, opt.pad, y, opt.bodyLH, quote ? t.sub : t.fg);
      y += bl.length * opt.bodyLH;
    }

    /* 出处 */
    var parts = [];
    if (info.showBook && info.bookTitle) parts.push('《' + info.bookTitle + '》' + (info.showPage && note.page ? ' p.' + note.page : ''));
    else if (info.showPage && note.page) parts.push('p.' + note.page);
    if (info.showDate && note.createdAt) parts.push(U.dateStr(new Date(note.createdAt)).replace(/-/g, '.'));
    if (parts.length) {
      ctx.font = opt.metaFont;
      ctx.fillStyle = t.sub;
      ctx.fillText(ellipsis(ctx, parts.join('　'), maxW), opt.pad, y + opt.gap * 0.6);
    }
    return y;
  }

  /* 一条笔记 → 一张方图 */
  Share.noteImage = function (note, info) {
    var opt = noteOptions('square');
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    var c = makeCanvas(opt.w, opt.h);
    var ctx = ctxOf(c);
    var maxW = opt.w - opt.pad * 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, opt.w, opt.h);

    var m = noteMetrics(ctx, note, opt, maxW);
    var top = Math.max(opt.pad + 40, (opt.h - m.total) / 2);

    ctx.fillStyle = t.accent;
    ctx.fillRect(opt.pad, top - 56, 72, 7);

    drawNote(ctx, note, opt, t, info, top, maxW);

    if (info.sign) {
      ctx.font = opt.metaFont;
      ctx.fillStyle = t.sub;
      ctx.textAlign = 'right';
      ctx.fillText(info.sign, opt.w - opt.pad, opt.h - opt.pad);
      ctx.textAlign = 'left';
    }
    if (info.showTarget && info.targetText) {
      ctx.font = opt.metaFont;
      ctx.fillStyle = t.sub;
      ctx.fillText(info.targetText, opt.pad, opt.h - opt.pad);
    }
    return c;
  };

  /* 多条笔记 → 一张长图 */
  Share.notesLongImage = function (notes, info) {
    var opt = noteOptions('square');
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    var maxW = opt.w - opt.pad * 2;

    // 先用一张临时画布量每一段的高度
    var measure = ctxOf(makeCanvas(10, 10));
    var heights = notes.map(function (n) {
      var m = noteMetrics(measure, n, opt, maxW);
      return Math.max(m.total, 220) + 90;
    });
    var headerH = 240;
    var totalH = headerH + heights.reduce(function (a, b) { return a + b; }, 0) + opt.pad;

    var c = makeCanvas(opt.w, totalH);
    var ctx = ctxOf(c);
    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, opt.w, totalH);

    /* 抬头 */
    ctx.fillStyle = t.accent;
    ctx.fillRect(opt.pad, 110, 72, 7);
    ctx.fillStyle = t.fg;
    ctx.font = '600 56px ' + SANS;
    ctx.fillText(ellipsis(ctx, info.headerTitle || '读书笔记', maxW), opt.pad, 150);
    ctx.fillStyle = t.sub;
    ctx.font = '34px ' + SANS;
    ctx.fillText((info.headerSub || '') + (info.headerSub ? '　' : '') + notes.length + ' 条', opt.pad, 226);

    var y = headerH + 30;
    notes.forEach(function (n, i) {
      drawNote(ctx, n, opt, t, info, y, maxW);
      y += heights[i];
      if (i < notes.length - 1) {
        ctx.strokeStyle = t.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(opt.pad, y - 44);
        ctx.lineTo(opt.w - opt.pad, y - 44);
        ctx.stroke();
      }
    });

    if (info.sign) {
      ctx.font = opt.metaFont;
      ctx.fillStyle = t.sub;
      ctx.fillText(info.sign, opt.pad, totalH - opt.pad);
    }
    return c;
  };

  /* ================= 计划卡片 ================= */
  Share.planCard = function (view, info) {
    var opt = noteOptions('square');
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    var W = opt.w, H = opt.h;
    var c = makeCanvas(W, H);
    var ctx = ctxOf(c);
    var maxW = W - opt.pad * 2;

    ctx.fillStyle = t.bg;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = t.accent;
    ctx.fillRect(opt.pad, 110, 72, 7);

    ctx.fillStyle = t.fg;
    ctx.font = '600 58px ' + SANS;
    ctx.fillText(ellipsis(ctx, view.title, maxW), opt.pad, 152);

    ctx.fillStyle = t.sub;
    ctx.font = '34px ' + SANS;
    ctx.fillText(ellipsis(ctx, view.subtitle || '', maxW), opt.pad, 236);

    drawRing(ctx, W / 2, H / 2 + 30, 190, view.pct || 0, t, view.big || '', view.bigSub || '');

    var y = H - opt.pad - (view.lines || []).length * 56 - 40;
    ctx.font = '34px ' + SANS;
    (view.lines || []).forEach(function (l, i) {
      ctx.fillStyle = i === 0 ? t.fg : t.sub;
      ctx.fillText(ellipsis(ctx, l, maxW), opt.pad, y + i * 56);
    });

    if (info.sign) {
      ctx.font = opt.metaFont;
      ctx.fillStyle = t.sub;
      ctx.textAlign = 'right';
      ctx.fillText(info.sign, W - opt.pad, H - opt.pad);
      ctx.textAlign = 'left';
    }
    return c;
  };

  /* ================= A4 页面（给 PDF 用） ================= */
  function a4() {
    var c = PDF.makePage(150);       // 1240 × 1754
    return { c: c, ctx: ctxOf(c), w: c.width, h: c.height };
  }

  function pageBg(p, t) {
    p.ctx.fillStyle = t.bg;
    p.ctx.fillRect(0, 0, p.w, p.h);
  }

  /* 封面页 */
  function coverPage(view, info) {
    var p = a4();
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    pageBg(p, t);

    p.ctx.fillStyle = t.accent;
    p.ctx.fillRect(130, 200, 90, 8);

    p.ctx.fillStyle = t.fg;
    p.ctx.font = '600 74px ' + SANS;
    p.ctx.fillText(ellipsis(p.ctx, view.title, p.w - 260), 130, 260);

    p.ctx.fillStyle = t.sub;
    p.ctx.font = '40px ' + SANS;
    p.ctx.fillText(ellipsis(p.ctx, view.subtitle || '', p.w - 260), 130, 372);

    drawRing(p.ctx, p.w / 2, 980, 250, view.pct || 0, t, view.big || '', view.bigSub || '');

    var lines = view.lines || [];
    p.ctx.font = '38px ' + SANS;
    lines.forEach(function (l, i) {
      p.ctx.fillStyle = i === 0 ? t.fg : t.sub;
      p.ctx.fillText(ellipsis(p.ctx, l, p.w - 260), 130, 1400 + i * 62);
    });

    if (info.sign) {
      p.ctx.font = '34px ' + SANS;
      p.ctx.fillStyle = t.sub;
      p.ctx.fillText(info.sign, 130, p.h - 150);
    }
    return p.c;
  }

  /* 书单页 */
  function bookListPage(title, rows, info) {
    var p = a4();
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    pageBg(p, t);

    p.ctx.fillStyle = t.accent;
    p.ctx.fillRect(130, 150, 72, 7);
    p.ctx.fillStyle = t.fg;
    p.ctx.font = '600 56px ' + SANS;
    p.ctx.fillText(ellipsis(p.ctx, title, p.w - 260), 130, 190);

    var y = 330;
    var step = 74;
    p.ctx.font = '38px ' + SANS;
    rows.forEach(function (r) {
      if (y > p.h - 200) return;
      p.ctx.fillStyle = t.sub;
      p.ctx.fillText('·', 130, y);
      p.ctx.fillStyle = r.done ? t.sub : t.fg;
      p.ctx.fillText(ellipsis(p.ctx, r.text, p.w - 340), 172, y);
      if (r.tag) {
        p.ctx.fillStyle = t.accent;
        p.ctx.font = '30px ' + SANS;
        p.ctx.textAlign = 'right';
        p.ctx.fillText(r.tag, p.w - 130, y + 4);
        p.ctx.textAlign = 'left';
        p.ctx.font = '38px ' + SANS;
      }
      y += step;
    });
    return p.c;
  }

  /* 一页放笔记 */
  function notePage(note, info) {
    var p = a4();
    var t = TEMPLATES[info.template] || TEMPLATES.plain;
    pageBg(p, t);
    var opt = noteOptions('a4');
    opt.w = p.w; opt.h = p.h;
    var maxW = p.w - opt.pad * 2;
    var m = noteMetrics(p.ctx, note, opt, maxW);
    var top = Math.max(opt.pad + 60, (p.h - m.total) / 2);
    p.ctx.fillStyle = t.accent;
    p.ctx.fillRect(opt.pad, top - 56, 72, 7);
    drawNote(p.ctx, note, opt, t, info, top, maxW);
    if (info.sign) {
      p.ctx.font = opt.metaFont;
      p.ctx.fillStyle = t.sub;
      p.ctx.fillText(info.sign, opt.pad, p.h - opt.pad);
    }
    return p.c;
  }

  /* ================= 导出 ================= */
  function stamp() {
    var d = new Date();
    return d.getFullYear() + U.pad2(d.getMonth() + 1) + U.pad2(d.getDate());
  }
  Share.stamp = stamp;

  function safeName(s) {
    return String(s || '').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 24);
  }

  Share.downloadCanvas = function (canvas, filename) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) {
        if (!blob) { resolve(false); return; }
        U.download(blob, filename);
        resolve(true);
      }, 'image/png');
    });
  };

  Share.downloadPdf = function (canvases, filename) {
    var blob = PDF.build(canvases);
    if (!blob) { U.toast('没有内容可以导出'); return false; }
    U.download(blob, filename);
    return true;
  };

  /* ================= 把数据整理成可画的东西 ================= */
  Share.yearView = function (data, year) {
    var st = Data.yearStats(data, year);
    var goal = Data.yearGoal(data.goals, year);
    var reading = Data.readingBooks(data.books);
    return {
      title: year + ' 年阅读计划',
      subtitle: goal ? '目标 ' + goal + ' 本' : '今年还没设目标',
      big: st.count + (goal ? ' / ' + goal : ''),
      bigSub: '本',
      pct: goal ? st.count / goal : (st.count ? 1 : 0),
      lines: [
        '今年累计读了 ' + U.fmtMinutes(st.minutes),
        reading.length ? '正在读：' + reading.map(function (b) { return '《' + b.title + '》' + Data.progress(b) + '%'; }).join('、') : '暂时没有在读的书',
        st.count ? '最近读完：' + st.finished.slice(0, 3).map(function (b) { return '《' + b.title + '》'; }).join('、') : ''
      ].filter(Boolean)
    };
  };

  Share.monthView = function (data, month) {
    var st = Data.monthStats(data, month);
    var goal = Data.monthGoal(data.goals, month);
    return {
      title: Data.monthTitle(month) + '小结',
      subtitle: '这个月读了多久',
      big: st.minutes + '',
      bigSub: '分钟',
      pct: goal ? st.minutes / goal : (st.minutes ? 1 : 0),
      lines: [
        goal ? '月目标 ' + goal + ' 分钟' : '这个月没设目标',
        st.doneDays ? '有 ' + st.doneDays + ' 天读了书' : '这个月还没记录',
        st.pages ? '一共翻了 ' + st.pages + ' 页' : ''
      ].filter(Boolean)
    };
  };

  Share.bookView = function (data, bookId) {
    var b = Data.bookById(data.books, bookId);
    if (!b) return null;
    var min = 0, times = 0;
    data.sessions.forEach(function (s) { if (s.bookId === b.id) { min += Number(s.minutes) || 0; times++; } });
    var notes = data.notes.filter(function (n) { return n.bookId === b.id && !n.deletedAt; });
    return {
      title: '《' + b.title + '》',
      subtitle: (b.author ? b.author + ' · ' : '') + (Data.STATUS[b.status] || ''),
      big: Data.progress(b) + '%',
      bigSub: b.totalPages ? 'p.' + (b.pageNow || 0) + '/' + b.totalPages : '进度',
      pct: Data.progress(b) / 100,
      lines: [
        min ? '一共读了 ' + U.fmtMinutes(min) + '（' + times + ' 次）' : '还没记录阅读时间',
        '写了 ' + notes.length + ' 条笔记',
        b.finishedAt ? '读完了：' + U.fmtDateCN(b.finishedAt, false) : ''
      ].filter(Boolean)
    };
  };

  Share.planInfo = function (info) { return info; };

  /* 给页面用的几个（A4 页面构造） */
  Share.coverPagePublic = coverPage;
  Share.bookListPagePublic = bookListPage;
  Share.notePage = notePage;

  global.Share = Share;
})(window);
