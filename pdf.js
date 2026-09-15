/* 极简 PDF 生成器：把画布按 JPEG 原样嵌进 PDF，不依赖任何第三方库
 *
 * 为什么这么做：PDF 想显示中文，要么带一套中文字体（好几 MB），
 * 要么把整页当作图片塞进去。这里选后者 —— 点一下就能下载，不弹打印框。
 * 代价：PDF 里的文字不能选中、不能搜索。
 */
(function (global) {
  'use strict';

  var PDF = {};

  PDF.A4 = { w: 595.28, h: 841.89 };      // A4，单位是 PDF 的点（1/72 英寸）

  function fmt(n) { return String(Math.round(n * 100) / 100); }

  function pad10(n) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < 10) s = '0' + s;
    return s;
  }

  function strBytes(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
    return u;
  }

  function jpegOf(canvas, quality) {
    var url = canvas.toDataURL('image/jpeg', quality || 0.92);
    var comma = url.indexOf(',');
    var bin = global.atob(url.slice(comma + 1));
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return { bytes: u8, w: canvas.width, h: canvas.height };
  }

  /* 建一张 A4 比例的画布；dpi 决定清晰度（150 够用，300 更清楚但文件更大） */
  PDF.makePage = function (dpi, landscape) {
    var d = dpi || 150;
    var wPt = landscape ? PDF.A4.h : PDF.A4.w;
    var hPt = landscape ? PDF.A4.w : PDF.A4.h;
    var c = document.createElement('canvas');
    c.width = Math.round(wPt / 72 * d);
    c.height = Math.round(hPt / 72 * d);
    return c;
  };

  /* 把若干张画布合成一个 PDF，返回 Blob */
  PDF.build = function (canvases, opts) {
    opts = opts || {};
    if (!canvases || !canvases.length) return null;
    var pageW = opts.pageWidth || PDF.A4.w;
    var pageH = opts.pageHeight || PDF.A4.h;
    var quality = opts.quality || 0.92;

    var out = [];
    var length = 0;
    var offsets = [];

    function write(s) { var b = strBytes(s); out.push(b); length += b.length; }
    function writeBytes(b) { out.push(b); length += b.length; }
    function mark(num) { offsets[num] = length; }

    write('%PDF-1.4\n');
    writeBytes(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));   // 二进制标记

    var n = Math.max(1, canvases.length);
    var pageIds = [], contentIds = [], imageIds = [];
    for (var i = 0; i < n; i++) {
      pageIds.push(3 + i * 3);
      contentIds.push(4 + i * 3);
      imageIds.push(5 + i * 3);
    }

    mark(1);
    write('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    mark(2);
    write('2 0 obj\n<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') +
      '] /Count ' + n + ' >>\nendobj\n');

    for (var j = 0; j < n; j++) {
      var img = jpegOf(canvases[j], quality);
      var pid = pageIds[j], cid = contentIds[j], iid = imageIds[j];

      mark(pid);
      write(pid + ' 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + fmt(pageW) + ' ' + fmt(pageH) + '] ' +
        '/Resources << /XObject << /Im0 ' + iid + ' 0 R >> /ProcSet [/PDF /ImageC] >> ' +
        '/Contents ' + cid + ' 0 R >>\nendobj\n');

      var content = 'q\n' + fmt(pageW) + ' 0 0 ' + fmt(pageH) + ' 0 0 cm\n/Im0 Do\nQ\n';
      mark(cid);
      write(cid + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n');

      mark(iid);
      write(iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + img.w + ' /Height ' + img.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length +
        ' >>\nstream\n');
      writeBytes(img.bytes);
      write('\nendstream\nendobj\n');
    }

    var total = 3 + n * 3;
    var xrefPos = length;
    var xref = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var k = 1; k < total; k++) xref += pad10(offsets[k] || 0) + ' 00000 n \n';
    xref += 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
    write(xref);

    return new Blob(out, { type: 'application/pdf' });
  };

  /* 生成并直接下载 */
  PDF.save = function (canvases, filename, opts) {
    var blob = PDF.build(canvases, opts);
    if (!blob) { U.toast('没有内容可以导出'); return null; }
    U.download(blob, filename);
    return blob;
  };

  /* ---------- 画布上的小工具（分享模块会用到） ---------- */
  PDF.ctx = function (canvas) {
    var c = canvas.getContext('2d');
    c.textBaseline = 'top';
    return c;
  };

  /* 按宽度自动折行，中英文都能折。返回实际画了几行 */
  PDF.wrapText = function (ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    var lines = [];
    var line = '';
    var chars = String(text || '').split('');
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      var test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
        if (maxLines && lines.length >= maxLines) break;
      } else {
        line = test;
      }
    }
    if (line && (!maxLines || lines.length < maxLines)) lines.push(line);
    if (maxLines && lines.length > maxLines) lines = lines.slice(0, maxLines);
    lines.forEach(function (l, i) { ctx.fillText(l, x, y + i * lineHeight); });
    return lines.length;
  };

  global.PDF = PDF;
})(window);
