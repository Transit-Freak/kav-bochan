/* מצגת לשינוי בקו — ייצוא "טבלה לפי יעד" של לו"ז עדכני לקובץ אקסל (.xlsx).
   נכתב כאן בלי ספרייה: הגרסה החינמית של SheetJS לא שומרת צבעים, ובלוח כזה הצבעים הם העיקר —
   פס צבעוני לכל יעד, ושעות של נסיעה בדרך אחרת באדום (באותו תא, כמו בגיליון שכונתי).
   הקובץ: גיליון אחד מימין לשמאל, תאים ממוזגים, רוחב עמודות, הערה (comment) על תא המוצא עם התחנה הראשונה,
   והדפסה ברוחב עמוד אחד. ZIP בלי דחיסה (store) — הקובץ קטן ממילא.
   LCXlsx.board(model) → Blob ; model = LCDeck.boardModel(...) */
var LCXlsx = (function () {
  var enc = new TextEncoder();
  function x(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }

  /* ---------- ZIP (store) ---------- */
  var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    var parts = [], cen = [], off = 0;
    var u16 = function (v) { return [v & 255, (v >>> 8) & 255]; }, u32 = function (v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; };
    files.forEach(function (f) {
      var name = enc.encode(f[0]), data = enc.encode(f[1]), crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
      var lh = new Uint8Array([].concat(u32(0x04034b50), common));
      parts.push(lh, name, data);
      cen.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(off))), name);
      off += lh.length + name.length + data.length;
    });
    var csz = cen.reduce(function (t, a) { return t + a.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(csz), u32(off), u16(0)));
    return new Blob(parts.concat(cen, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- סגנונות: כל שילוב מקבל מספר ---------- */
  function Styles() {
    var fonts = ['<font><sz val="11"/><name val="Arial"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    var borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left style="thin"><color rgb="FFB7C2BD"/></left><right style="thin"><color rgb="FFB7C2BD"/></right><top style="thin"><color rgb="FFB7C2BD"/></top><bottom style="thin"><color rgb="FFB7C2BD"/></bottom><diagonal/></border>'];
    var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], ix = {};
    var add = function (arr, s) { var i = arr.indexOf(s); if (i < 0) { arr.push(s); i = arr.length - 1; } return i; };
    this.get = function (o) {
      var k = JSON.stringify(o); if (ix[k] != null) return ix[k];
      var fo = add(fonts, '<font>' + (o.b ? '<b/>' : '') + '<sz val="' + (o.sz || 11) + '"/><color rgb="FF' + (o.color || '14201B') + '"/><name val="Arial"/></font>');
      var fi = o.fill ? add(fills, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      var al = '<alignment horizontal="' + (o.h || 'right') + '" vertical="center"' + (o.wrap === false ? '' : ' wrapText="1"') + ' readingOrder="2"/>';
      xfs.push('<xf numFmtId="49" fontId="' + fo + '" fillId="' + fi + '" borderId="' + (o.border === false ? 0 : 1) + '" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al + '</xf>');
      return (ix[k] = xfs.length - 1);
    };
    this.xml = function () {
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
        '<borders count="' + borders.length + '">' + borders.join('') + '</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    };
  }
  var COLS = 'ABCDEFGHIJ';
  function ref(c, r) { return COLS.charAt(c) + r; }
  function hexOf(c) { return String(c || '#0f766e').replace('#', '').toUpperCase(); }

  function board(M) {
    var st = new Styles(), rows = [], merges = [], comments = [], heights = {};
    var nC = 3 + M.cols.length + 1, last = nC - 1;   // מפעיל · מס' קו · מוצא · ימים… · הערות
    var W = [11, 8, 22].concat(M.cols.map(function (c, i) { return i === 0 ? 58 : 34; }), [34]);
    var cell = function (r, c, v, s) { (rows[r] = rows[r] || [])[c] = { v: v, s: s }; };
    var R = 1;
    // כותרת ותוקף
    var sT = st.get({ b: 1, sz: 18, fill: 'D9DEDC', h: 'center' }), sV = st.get({ b: 1, sz: 11, color: '8A5A00', fill: 'D9DEDC', h: 'center' });
    cell(R, 0, M.title, sT); merges.push('A' + R + ':' + ref(last, R)); heights[R] = 30; R++;
    var vt = [M.valid ? 'בתוקף מ-' + dmy(M.valid) + (M.until ? ' עד ' + dmy(M.until) : '') : '', M.feed ? 'לפי נתוני משרד התחבורה מ-' + dmy(M.feed) : ''].filter(Boolean).join(' · ');
    cell(R, 0, vt, sV); merges.push('A' + R + ':' + ref(last, R)); R++;
    var sH = st.get({ b: 1, sz: 11, fill: '9BCB3B', h: 'center' });
    ['מפעיל', 'מס\' קו', 'מוצא'].concat(M.cols.map(function (c) { return c.label; }), ['הערות']).forEach(function (t, c) { cell(R, c, t, sH); });
    var head = R; R++;
    var sOp = st.get({ b: 1, sz: 10, h: 'center' }), sLn = st.get({ b: 1, sz: 20, h: 'center' }), sOr = st.get({ b: 1, sz: 10, h: 'center' });
    var sTm = st.get({ sz: 10 }), sOff = st.get({ b: 1, sz: 10, color: '5B6B65', h: 'center' }), sNt = st.get({ sz: 9, color: 'C81E1E' });
    M.bands.forEach(function (b) {
      var bs = st.get({ b: 1, sz: 12, color: 'FFFFFF', fill: hexOf(b.color), h: 'center' });
      cell(R, 0, b.label, bs); merges.push('A' + R + ':' + ref(last, R)); R++;
      var i = 0;
      while (i < b.rows.length) {
        var r0 = b.rows[i], n = 1;
        while (i + n < b.rows.length && b.rows[i + n].p === r0.p) n++;
        if (n > 1) { merges.push('A' + R + ':A' + (R + n - 1)); merges.push('B' + R + ':B' + (R + n - 1)); }
        for (var k = 0; k < n; k++) {
          var r = b.rows[i + k], rr = R + k, lines = 1;
          cell(rr, 0, k ? '' : r.op, sOp);
          cell(rr, 1, k ? '' : r.line, sLn);
          cell(rr, 2, r.origin + (r.toward ? '\n' + r.toward : ''), sOr);
          comments.push({ ref: ref(2, rr), t: r.comment });
          var notes = [];
          r.cells.forEach(function (x, ci) {
            if (!x.ents.length) { cell(rr, 3 + ci, 'אינו פעיל', sOff); return; }
            // השעות בתא אחד, מופרדות ברווח; נסיעה בדרך אחרת — באדום (rich text)
            var runs = x.ents.map(function (e) { return { t: e.t + (e.n > 1 ? '×' + e.n : '') + (e.part ? '(' + e.part + ')' : ''), red: !!e.a }; });
            cell(rr, 3 + ci, { runs: runs }, sTm);
            var per = Math.max(1, Math.floor(W[3 + ci] / 6.6));
            lines = Math.max(lines, Math.ceil(runs.length / per));
            x.notes.forEach(function (nt) { notes.push((M.cols.length > 1 ? M.cols[ci].label + ': ' : '') + nt.times.join(' ') + ' — ' + nt.txt + ' (חלופה)'); });
            var pt = x.ents.filter(function (e) { return e.part; });
            if (pt.length) notes.push(M.cols[ci].label + ': ' + pt.map(function (e) { return e.t + ' ' + e.part + ' בלבד'; }).join(', ').replace(/לא ב([^ ]+) בלבד/g, 'חוץ מ$1'));
          });
          if (!k && r.until) notes.push('הלו״ז בתוקף עד ' + dmy(r.until));
          cell(rr, last, notes.join('\n'), sNt);
          heights[rr] = Math.max(32, lines * 13.5 + 6, notes.length * 12.5 + 6);
        }
        R += n; i += n;
      }
    });
    // עדכונים, מוקדי מידע וקרדיט
    var sL = st.get({ b: 1, sz: 10, fill: 'EEF2F0', h: 'center' }), sU = st.get({ b: 1, sz: 10, color: 'C81E1E' }), sP = st.get({ sz: 10 }), sPb = st.get({ b: 1, sz: 10, h: 'center' });
    cell(R, 0, 'עדכונים', sL); cell(R, 1, M.note || '', sU); merges.push('B' + R + ':' + ref(last, R)); heights[R] = 30; R++;
    cell(R, 0, 'מוקדי מידע', sL); cell(R, 1, 'מפעיל', sL); merges.push('B' + R + ':C' + R); cell(R, 3, 'טלפון', sL); R++;
    M.contacts.forEach(function (c) { cell(R, 1, c[0], sP); merges.push('B' + R + ':C' + R); cell(R, 3, c[1], sPb); R++; });
    var sC = st.get({ sz: 9, color: '5B6B65', border: false });
    cell(R, 0, 'השעות הן שעות היציאה מהתחנה הראשונה · באדום — נסיעה בדרך אחרת · ×2 — שני אוטובוסים · לא פרסום רשמי · הוכן בכלי "מצגת לשינוי בקו" של הקו הבוחן — kavbochan.app', sC);
    merges.push('A' + R + ':' + ref(last, R)); heights[R] = 28;

    // שורות XML
    var sd = rows.map(function (cs, r) {
      if (!cs) return '';
      var out = '';
      for (var c = 0; c < nC; c++) {
        var o = cs[c];
        if (!o) continue;
        var v = o.v, a = ' r="' + ref(c, r) + '" s="' + o.s + '"';
        if (v && v.runs) {
          out += '<c' + a + ' t="inlineStr"><is>' + v.runs.map(function (u, i) {
            return '<r><rPr>' + (u.red ? '<b/>' : '') + '<sz val="10"/><color rgb="FF' + (u.red ? 'C81E1E' : '14201B') + '"/><rFont val="Arial"/></rPr><t xml:space="preserve">' + x(u.t + (i < v.runs.length - 1 ? ' ' : '')) + '</t></r>';
          }).join('') + '</is></c>';
        } else out += '<c' + a + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
      }
      return '<row r="' + r + '"' + (heights[r] ? ' ht="' + heights[r].toFixed(1) + '" customHeight="1"' : '') + '>' + out + '</row>';
    }).join('');
    // תאים ריקים בתוך מיזוג — עם אותו סגנון (כדי שהמסגרת והצבע יופיעו)
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' + ref(last, R) + '"/>' +
      '<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="' + head + '" topLeftCell="A' + (head + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/><cols>' + W.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' +
      '<sheetData>' + sd + '</sheetData><mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' +
      '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
      (comments.length ? '<legacyDrawing r:id="rId2"/>' : '') + '</worksheet>';
    var cmt = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>הקו הבוחן</author></authors><commentList>' +
      comments.map(function (c) { return '<comment ref="' + c.ref + '" authorId="0"><text><r><rPr><sz val="10"/><rFont val="Arial"/></rPr><t xml:space="preserve">' + x(c.t) + '</t></r></text></comment>'; }).join('') + '</commentList></comments>';
    var vml = '<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">' +
      '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout><v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe"><v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>' +
      comments.map(function (c, i) {
        var col = COLS.indexOf(c.ref.charAt(0)), row = +c.ref.slice(1) - 1;
        return '<v:shape id="_x0000_s' + (1025 + i) + '" type="#_x0000_t202" style="position:absolute;margin-left:80pt;margin-top:2pt;width:220pt;height:60pt;z-index:' + (i + 1) + ';visibility:hidden" fillcolor="#ffffe1" o:insetmode="auto">' +
          '<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/><v:textbox style="mso-direction-alt:auto"><div style="text-align:right"></div></v:textbox>' +
          '<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/><x:Anchor>' + (col + 1) + ', 15, ' + row + ', 2, ' + (col + 4) + ', 15, ' + (row + 4) + ', 2</x:Anchor><x:AutoFill>False</x:AutoFill><x:Row>' + row + '</x:Row><x:Column>' + col + '</x:Column></x:ClientData></v:shape>';
      }).join('') + '</xml>';
    var files = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/comments1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView rightToLeft="1"/></bookViews><sheets><sheet name="לוח זמנים" sheetId="1" r:id="rId1"/></sheets>' +
        '<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">\'לוח זמנים\'!$' + head + ':$' + head + '</definedName></definedNames></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', st.xml()],
      ['xl/worksheets/sheet1.xml', sheet],
      ['xl/worksheets/_rels/sheet1.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing" Target="../drawings/vmlDrawing1.vml"/></Relationships>'],
      ['xl/comments1.xml', cmt],
      ['xl/drawings/vmlDrawing1.vml', vml]
    ];
    return zip(files);
  }
  function dmy(iso) { var p = String(iso).split('-'); return +p[2] + '.' + +p[1] + '.' + p[0]; }
  return { board: board };
})();
