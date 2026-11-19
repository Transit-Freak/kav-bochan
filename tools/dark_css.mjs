// מצב לילה — בונה את dark/<כלי>.css מתוך העיצוב הבהיר של כל כלי.
//
// איך זה עובד: פותחים כל עמוד בדפדפן (Playwright), קוראים את כל כללי ה-CSS שהעמוד באמת
// טוען (קבצים, <style> בדף, וסגנונות שסקריפטים מזריקים), ולכל הצהרת צבע כותבים גרסה כהה
// תחת html.kb-dark (theme-boot.js שם את המחלקה כשהתאורה כהה). רקעים בהירים נעשים כהים,
// טקסט כהה נעשה בהיר, צבעים עזים ורקעים כהים נשארים. ההמרה ב-OKLCH: הגוון נשמר, רק הבהירות זזה.
// כל הצהרת צבע נכתבת גם כשהיא לא משתנה, כדי שסדר הכללים והעדיפויות יישארו כמו בבהיר.
// בסוף כל קובץ — תיקונים ידניים מ-tools/dark-extra/<כלי>.css (צבעים שנכתבים מתוך JS וכו').
//
// מריצים אחרי שינוי עיצוב בכלי:  NODE_PATH=$(npm root -g) node tools/dark_css.mjs [כלי ...]
// (בלי שמות — כל הכלים). העמודים נטענים מ-kavbochan.app, וקבצים שקיימים בעותק המקומי מוגשים ממנו.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = 'https://kavbochan.app/';

// כלי → עמוד. line-changes: יש לו מצב כהה משלו — מקבל רק את הרכיבים המשותפים.
const PAGES = {
  home: '', 'line-history': 'line-history/', fleet: 'fleet/', bus: 'bus/', rail: 'rail/',
  reception: 'rail/reception/', feeder: 'feeder/', alerts: 'alerts/', 'bus-speed': 'bus-speed/',
  fares: 'fares/', ratzif: 'ratzif/', 'skip-stops': 'skip-stops/', 'next-station': 'next-station/',
  parks: 'parks/', accessibility: 'accessibility.html', terms: 'terms.html', links: 'links.html',
  'line-changes': 'line-changes/',
};
const OWN_DARK = new Set(['line-changes']);
const REMAP = new Set(['bus-speed']);
// סגנונות שיש להם מצב כהה משלהם (כפתור הנגישות והתאורה)
const SKIP_IDS = ['kb-a11y-css', 'kb-theme-boot'];

/* ---------------- צבעים ---------------- */
const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255],
  gray: [128, 128, 128], grey: [128, 128, 128], silver: [192, 192, 192], yellow: [255, 255, 0],
  orange: [255, 165, 0], navy: [0, 0, 128], whitesmoke: [245, 245, 245], gainsboro: [220, 220, 220],
  lightgray: [211, 211, 211], lightgrey: [211, 211, 211], darkgray: [169, 169, 169], darkgrey: [169, 169, 169],
  dimgray: [105, 105, 105], dimgrey: [105, 105, 105], ivory: [255, 255, 240], beige: [245, 245, 220],
  linen: [250, 240, 230], snow: [255, 250, 250], aliceblue: [240, 248, 255], ghostwhite: [248, 248, 255],
  honeydew: [240, 255, 240], mintcream: [245, 255, 250], azure: [240, 255, 255], lavender: [230, 230, 250],
  crimson: [220, 20, 60], darkred: [139, 0, 0], maroon: [128, 0, 0], purple: [128, 0, 128], teal: [0, 128, 128],
  gold: [255, 215, 0], tomato: [255, 99, 71], darkgreen: [0, 100, 0], darkblue: [0, 0, 139], royalblue: [65, 105, 225],
  steelblue: [70, 130, 180], slategray: [112, 128, 144], lightyellow: [255, 255, 224], seashell: [255, 245, 238],
  floralwhite: [255, 250, 240], oldlace: [253, 245, 230], cornsilk: [255, 248, 220], lemonchiffon: [255, 250, 205],
};
const NAMES_RE = Object.keys(NAMED).join('|');
const COLOR_RE = new RegExp(
  '#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|(?:rgba?|hsla?)\\((?:[^()]|\\([^()]*\\))*\\)|(?<![-\\w.#])(?:' + NAMES_RE + ')(?![-\\w])', 'gi');

function parse(tok) {
  const t = tok.toLowerCase();
  if (t[0] === '#') {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  if (NAMED[t]) { const [r, g, b] = NAMED[t]; return { r, g, b, a: 1 }; }
  const m = /^(rgba?|hsla?)\((.*)\)$/i.exec(t);
  if (!m) return null;
  let body = m[2].trim(), alpha = null;
  const slash = body.indexOf('/');
  let parts;
  if (slash >= 0) { alpha = body.slice(slash + 1).trim(); parts = body.slice(0, slash).trim().split(/[\s,]+/); }
  else { parts = body.split(/\s*,\s*|\s+/).filter(Boolean); if (parts.length === 4) alpha = parts.pop(); }
  if (parts.length !== 3 || parts.some(p => /var\(|calc\(/.test(p))) return null;
  let a = 1, aRaw = null;
  if (alpha != null) {
    if (/var\(|calc\(/.test(alpha)) aRaw = alpha; else a = alpha.endsWith('%') ? parseFloat(alpha) / 100 : parseFloat(alpha);
  }
  if (m[1].startsWith('rgb')) {
    const v = parts.map(p => p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    return { r: v[0], g: v[1], b: v[2], a, aRaw };
  }
  const hh = parseFloat(parts[0]), s = parseFloat(parts[1]) / 100, l = parseFloat(parts[2]) / 100;
  const k = n => (n + hh / 30) % 12, q = s * Math.min(l, 1 - l);
  const f = n => l - q * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a, aRaw };
}
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const delin = c => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toOklch({ r, g, b }) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, Bb), h: Math.atan2(Bb, A) };
}
function fromOklch(L, C, h) {
  for (let i = 0; i < 40; i++) {
    const A = C * Math.cos(h), B = C * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    if ((R >= -0.0005 && R <= 1.0005 && G >= -0.0005 && G <= 1.0005 && Bl >= -0.0005 && Bl <= 1.0005) || C < 0.001) {
      const cl = v => Math.round(Math.max(0, Math.min(255, delin(Math.max(0, Math.min(1, v))))));
      return { r: cl(R), g: cl(G), b: cl(Bl) };
    }
    C *= 0.92;
  }
  return { r: 0, g: 0, b: 0 };
}
const hex2 = n => n.toString(16).padStart(2, '0');
function fmt(c, a, aRaw) {
  if (aRaw) return `rgb(${c.r} ${c.g} ${c.b} / ${aRaw})`;
  if (a >= 0.999) return '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
  return `rgba(${c.r},${c.g},${c.b},${+a.toFixed(3)})`;
}

// role: bg | fg | border | svg | shadow
function darken(c, role) {
  const o = toOklch(c);
  let { L, C, h } = o;
  const a = c.a;
  const keep = () => null;
  const bg = () => {
    if (L < 0.3 && a >= 0.9) { L = 0.27 + L * 0.3; C = Math.min(C, 0.07); return fromOklch(L, C, h); } // פס כהה / כפתור כהה — קצת יותר בהיר מהרקע, שיבלוט
    if (L < 0.6 || C > 0.1) return keep(); // צבע עז (תג, מקרא, צבע מותג) נשאר
    if (C < 0.012) { C = 0.012; h = 4.6; } // לבן/אפור — גוון כחלחל עדין
    L = 0.215 + (1 - L) * 0.33; C = Math.min(C, 0.075);
    return fromOklch(L, C, h);
  };
  const fg = () => {
    if (L > 0.66) return keep();
    L = 0.955 - L * 0.48; C = Math.min(C, 0.2);
    return fromOklch(L, C, h);
  };
  let out = null, na = a;
  if (role === 'bg') {
    if (L < 0.3 && a <= 0.25 && !c.aRaw) { out = { r: 255, g: 255, b: 255 }; na = Math.min(0.5, a * 1.6); } // הצללה שקופה על בהיר → הבהרה שקופה על כהה
    else if (L >= 0.6 && a < 0.35 && !c.aRaw) out = null; // הבהרה שקופה — נשארת
    else out = bg();
  } else if (role === 'fg') out = fg();
  else if (role === 'border') {
    if (L >= 0.6 && C > 0.1) out = null;
    else if (L >= 0.6) { if (C < 0.012) { C = 0.012; h = 4.6; } L = 0.33 + (1 - L) * 0.35; C = Math.min(C, 0.09); out = fromOklch(L, C, h); }
    else if (L < 0.36) out = fg();
  } else if (role === 'svg') {
    if (L >= 0.85) out = bg(); else if (L <= 0.4) out = fg();
  } else if (role === 'shadow') {
    if (L >= 0.6 && a >= 0.35) out = bg();
    else if (L < 0.6) { out = { r: 0, g: 0, b: 0 }; na = Math.min(0.65, a * 2.2); }
  }
  if (!out) return null;
  return fmt(out, na, c.aRaw);
}

function mapColors(value, role) {
  // לא נוגעים בתוך url(...)
  const urls = [];
  let v = value.replace(/url\((?:[^()]|\([^()]*\))*\)/gi, m => { urls.push(m); return `\u0000${urls.length - 1}\u0000`; });
  v = v.replace(COLOR_RE, tok => {
    if (/^(?:transparent|currentcolor)$/i.test(tok)) return tok;
    const c = parse(tok);
    if (!c) return tok;
    return darken(c, role) || tok;
  });
  return v.replace(/\u0000(\d+)\u0000/g, (_, i) => urls[+i]);
}
function lightness(value) {
  const m = value.match(COLOR_RE);
  if (!m) return null;
  const c = parse(m[0]);
  return c ? toOklch(c).L : null;
}

const ROLE = p => {
  if (p.startsWith('--')) return 'var';
  if (/^background/.test(p)) return 'bg';
  if (/^(color|-webkit-text-fill-color|caret-color|text-decoration(-color)?|-webkit-text-stroke(-color)?|text-emphasis-color)$/.test(p)) return 'fg';
  if (/^(border|outline|column-rule)/.test(p) && (/color$/.test(p) || /^(border|outline|column-rule)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$/.test(p))) return 'border';
  if (/^(fill|stroke|stop-color|flood-color|lighting-color)$/.test(p)) return 'svg';
  if (/^(box-shadow|text-shadow|-webkit-box-shadow)$/.test(p)) return 'shadow';
  return null;
};

/* ---------------- בחירת הכללים מהדף ---------------- */
async function collect(page) {
  return page.evaluate(({ SKIP_IDS }) => {
    const COLOR_LONG = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color',
      'border-left-color', 'outline-color', 'text-decoration-color', 'fill', 'stroke', 'box-shadow', 'text-shadow', 'caret-color',
      'column-rule-color', '-webkit-text-fill-color', '-webkit-text-stroke-color', 'stop-color', 'flood-color', 'text-emphasis-color',
      'border-block-start-color', 'border-block-end-color', 'border-inline-start-color', 'border-inline-end-color'];
    const SHORT = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'outline',
      'text-decoration', 'border-block', 'border-inline', 'border-block-start', 'border-block-end', 'border-inline-start', 'border-inline-end',
      'border-block-color', 'border-inline-color', '-webkit-text-stroke'];
    function decls(st) {
      const out = [], seen = new Set();
      for (let i = 0; i < st.length; i++) {
        const p = st[i];
        if (p.startsWith('--')) { out.push([p, st.getPropertyValue(p).trim(), st.getPropertyPriority(p)]); continue; }
        if (p === 'color-scheme') { out.push([p, st.getPropertyValue(p), st.getPropertyPriority(p)]); continue; }
        if (!COLOR_LONG.includes(p)) continue;
        const v = st.getPropertyValue(p);
        if (v) { out.push([p, v, st.getPropertyPriority(p)]); seen.add(p); }
      }
      // תכונות רקע שאינן צבע, כשהן כתובות בנפרד — כדי שקיצור background בכלל אחר לא ידרוס אותן במצב כהה
      for (const p of ['background-repeat', 'background-position', 'background-size', 'background-attachment', 'background-origin', 'background-clip']) {
        const v = st.getPropertyValue(p);
        if (v && new RegExp('(^|;\\s*)' + p + '\\s*:').test(st.cssText)) out.push([p, v, st.getPropertyPriority(p)]);
      }
      for (const s of SHORT) {
        const v = st.getPropertyValue(s);
        if (v && /var\(/.test(v)) out.push([s, v, st.getPropertyPriority(s)]);
      }
      return out;
    }
    function walk(rules) {
      const out = [];
      for (const r of rules) {
        if (r.type === 1) { const d = decls(r.style); if (d.length || /data-theme/.test(r.selectorText)) out.push({ t: 's', sel: r.selectorText, d, css: r.cssText }); }
        else if (r.type === 4) { const k = walk(r.cssRules); if (k.length) out.push({ t: 'm', at: '@media ' + r.media.mediaText, k }); }
        else if (r.type === 12) { const k = walk(r.cssRules); if (k.length) out.push({ t: 'm', at: '@supports ' + r.conditionText, k }); }
        else if (r.cssRules && r.type !== 7) { const k = walk(r.cssRules); if (k.length) out.push(...k); } // @layer וכו'
      }
      return out;
    }
    const sheets = [];
    for (const sh of document.styleSheets) {
      const own = sh.ownerNode;
      if (own && SKIP_IDS.includes(own.id)) continue;
      if (sh.href && (/\/dark\//.test(sh.href) || !sh.href.startsWith(location.origin))) continue;
      let rules;
      try { rules = sh.cssRules; } catch (e) { continue; }
      if (sh.media && sh.media.mediaText && /print/.test(sh.media.mediaText) && !/screen/.test(sh.media.mediaText)) continue;
      sheets.push({ key: sh.href ? sh.href.replace(/\?.*$/, '') : 'inline:' + (own && own.textContent || '').length + ':' + (own && own.textContent || '').slice(0, 200), text: own && !sh.href ? own.textContent : null, rules: walk(rules) });
    }
    return sheets;
  }, { SKIP_IDS });
}

/* ---------------- כתיבת הקובץ הכהה ---------------- */
function scopeSel(sel) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map(s => {
    s = s.trim();
    if (/^html(?![-\w])/i.test(s)) return 'html.kb-dark' + s.slice(4);
    if (/^:root(?![-\w])/.test(s)) return ':root.kb-dark' + s.slice(5);
    return 'html.kb-dark ' + s;
  }).join(',');
}

const SHORT_COLOR = { background: 'background-color', border: 'border-color', 'border-top': 'border-top-color', 'border-right': 'border-right-color',
  'border-bottom': 'border-bottom-color', 'border-left': 'border-left-color', 'border-color': 'border-color', outline: 'outline-color',
  'text-decoration': 'text-decoration-color', 'border-block': 'border-block-color', 'border-inline': 'border-inline-color',
  'border-block-start': 'border-block-start-color', 'border-block-end': 'border-block-end-color', 'border-inline-start': 'border-inline-start-color',
  'border-inline-end': 'border-inline-end-color', '-webkit-text-stroke': '-webkit-text-stroke-color' };
function compactBorders(lines) {
  const sides = ['top', 'right', 'bottom', 'left'].map(x => `border-${x}-color:`);
  const idx = sides.map(sd => lines.findIndex(l => l.startsWith(sd)));
  if (idx.some(i => i < 0)) return;
  const vals = idx.map((i, k) => lines[i].slice(sides[k].length));
  if (vals.some(v => v !== vals[0])) return;
  idx.sort((a, b) => b - a).forEach(i => lines.splice(i, 1));
  lines.splice(Math.min(...idx), 0, 'border-color:' + vals[0]);
}
// כלי שיש לו כבר מצב כהה משלו ב-[data-theme=dark] — רק מחברים אותו גם ל-kb-dark (בחירה "לפי הטלפון")
function remap(sheets) {
  const out = [];
  const walkR = (rules, wrap) => rules.forEach(r => {
    if (r.t === 'm') return walkR(r.k, [...wrap, r.at]);
    if (!/\[data-theme="?dark"?\]/.test(r.sel)) return;
    let css = r.css.replace(/\[data-theme="?dark"?\]/g, '.kb-dark');
    for (const w of [...wrap].reverse()) css = `${w}{${css}}`;
    out.push(css);
  });
  sheets.forEach(s => walkR(s.rules, []));
  return out.join('\n') + '\n';
}

function build(sheets) {
  // תפקיד של כל משתנה: איפה הוא משמש (רקע / טקסט / מסגרת ...)
  const usage = {};
  const varDefs = {};
  const visit = (rules, fn) => rules.forEach(r => r.t === 's' ? fn(r) : visit(r.k, fn));
  const all = sheets.flatMap(s => s.rules);
  visit(all, r => r.d.forEach(([p, v]) => {
    const role = ROLE(p);
    for (const m of v.matchAll(/var\((--[\w-]+)/g)) {
      const u = usage[m[1]] || (usage[m[1]] = {});
      if (role === 'var') (u['@' + p] = 1); else if (role) u[role] = (u[role] || 0) + 1;
    }
    if (p.startsWith('--')) (varDefs[p] = varDefs[p] || []).push(v);
  }));
  // משתנה שמוגדר ממשתנה אחר — מעביר אליו את התפקידים שלו
  for (let it = 0; it < 4; it++) {
    for (const [name, u] of Object.entries(usage)) {
      for (const k of Object.keys(u)) if (k.startsWith('@')) {
        const from = usage[k.slice(1)];
        if (from) for (const [rk, rv] of Object.entries(from)) if (!rk.startsWith('@')) u[rk] = Math.max(u[rk] || 0, rv);
      }
    }
  }
  const varRole = {};
  const need = {}; // משתנה → תפקידים נוספים שצריך להם עותק
  for (const [name, defs] of Object.entries(varDefs)) {
    const L = lightness(defs[0] || '');
    if (L == null) continue;
    const u = usage[name] || {};
    const roles = Object.keys(u).filter(k => !k.startsWith('@'));
    let main;
    if (!roles.length) main = L >= 0.6 ? 'bg' : L < 0.4 ? 'fg' : null;
    else if (roles.length === 1) main = roles[0];
    else {
      const pref = L >= 0.6 ? ['bg', 'border', 'svg', 'shadow', 'fg'] : ['fg', 'svg', 'border', 'bg', 'shadow'];
      main = pref.find(r => roles.includes(r));
    }
    varRole[name] = main;
    for (const r of roles) if (r !== main) (need[name] = need[name] || new Set()).add(r);
  }
  // טקסט על רקע צבעוני שנשאר כמו שהוא (כפתור עז, פס כהה) — גם הטקסט נשאר כמו בבהיר
  function keptBg(r) {
    const bgd = r.d.find(([p]) => p === 'background-color' || p === 'background');
    if (!bgd) return false;
    const bv = bgd[1].trim();
    const vm = /^var\((--[\w-]+)\)$/.exec(bv);
    const c = vm ? parse(((varDefs[vm[1]] || [''])[0].match(COLOR_RE) || [''])[0]) : (() => {
      const m = bv.match(COLOR_RE); return m && m.length === 1 && !/gradient|url\(/.test(bv) ? parse(m[0]) : null; })();
    COLOR_RE.lastIndex = 0;
    return !!c && c.a >= 0.9 && !darken(c, 'bg');
  }
  visit(all, r => { if (keptBg(r)) r.d.forEach(([p, v]) => { if (ROLE(p) === 'fg') for (const m of v.matchAll(/var\((--[\w-]+)(?![\w-])/g)) if (varRole[m[1]] !== undefined) (need[m[1]] = need[m[1]] || new Set()).add('keep'); }); });
  const emit = (rules, depthPrefix) => {
    let out = '';
    for (const r of rules) {
      if (r.t === 'm') { const inner = emit(r.k); if (inner) out += `${r.at}{\n${inner}}\n`; continue; }
      const lines = [];
      const bgKept = keptBg(r);
      for (const [p, v, prio] of r.d) {
        const role = ROLE(p);
        const imp = prio ? ' !important' : '';
        if (role === 'var') {
          const vr = varRole[p];
          if (vr === undefined) continue; // לא צבע
          lines.push(`${p}:${vr ? mapColors(v, vr) : v}${imp}`);
          if (need[p]) for (const extra of need[p]) lines.push(`${p}--kb-${extra}:${extra === 'keep' ? v : mapColors(v, extra)}${imp}`);
          continue;
        }
        if (p === 'color-scheme') { lines.push(`color-scheme:${/light/.test(v) && !/dark/.test(v) ? 'dark' : v}${imp}`); continue; }
        if (/^background-(repeat|position|size|attachment|origin|clip)$/.test(p)) { lines.push(`${p}:${v}${imp}`); continue; }
        if (!role) continue;
        // משתנה שמשמש כאן בתפקיד אחר מהתפקיד הראשי שלו — עובר לעותק שלו
        // קיצור (background / border ...) עם משתנה צבע אחד — כותבים רק את הצבע, כדי לא לאפס
        // תכונות אחרות (חזרה של תמונת רקע, עובי מסגרת) שכלל אחר קבע
        const sh = SHORT_COLOR[p];
        if (sh && p !== 'background') {
          const toks = v.trim().split(/\s+(?![^(]*\))/);
          if (toks.length === 1 || (p !== 'background' && toks.length <= 3)) {
            const cvars = toks.filter(t => /^var\(--/.test(t) && varRole[(t.match(/var\((--[\w-]+)/) || [])[1]] !== undefined);
            const col = toks.filter(t => /^var\(--/.test(t) ? cvars.includes(t) : COLOR_RE.test(t) && (COLOR_RE.lastIndex = 0, true));
            COLOR_RE.lastIndex = 0;
            if (col.length === 1) {
              const n = (col[0].match(/var\((--[\w-]+)/) || [])[1];
              const cv = n && need[n] && need[n].has(role) && varRole[n] !== role ? col[0].replace(n, n + '--kb-' + role) : col[0];
              lines.push(`${sh}:${mapColors(cv, role)}${imp}`);
              continue;
            }
          }
        }
        const val = v.replace(/var\((--[\w-]+)(?![\w-])/g, (m, n) => (need[n] && need[n].has(role) && varRole[n] !== role) ? `var(${n}--kb-${role}` : m);
        const keepV = bgKept && role === 'fg' ? v.replace(/var\((--[\w-]+)\)/g, (m, n) => varRole[n] !== undefined ? `var(${n}--kb-keep, var(${n}))` : m) : null;
        lines.push(`${p}:${keepV != null ? keepV : mapColors(val, role)}${imp}`);
      }
      compactBorders(lines);
      if (lines.length) out += `${scopeSel(r.sel)}{${lines.join(';')}}\n`;
    }
    return out;
  };
  return emit(all);
}

/* ---------------- הרצה ---------------- */
function localFile(url) {
  const u = new URL(url);
  if (u.origin !== new URL(SITE).origin) return null;
  let p = decodeURIComponent(u.pathname).replace(/^\/+/, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null;
}
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const want = process.argv.slice(2);
const names = want.length ? want : Object.keys(PAGES);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
await ctx.route('**/*', route => {
  const url = route.request().url();
  if (url === SITE + '__blank.html') {
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"></head><body><main>x</main>' +
      ['home-link.js', 'version.js', 'hagim.js', 'april.js', 'birthday.js', 'nav-restore.js'].map(s => `<script src="/${s}"></script>`).join('') + '</body></html>' });
  }
  const f = localFile(url);
  if (f) return route.fulfill({ path: f, contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  return route.continue();
});

async function sheetsOf(rel) {
  const page = await ctx.newPage();
  await page.goto(SITE + rel, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const s = await collect(page);
  await page.close();
  return s;
}
const common = await sheetsOf('__blank.html');
const commonKeys = new Set(common.map(s => s.key));
const HEAD = '/* מצב לילה — נבנה אוטומטית ב-tools/dark_css.mjs מתוך העיצוב הבהיר. לא לערוך ביד: תיקונים ב-tools/dark-extra/. */\n';
const BASE = fs.readFileSync(path.join(ROOT, 'tools/dark-extra/_common.css'), 'utf8');
fs.mkdirSync(path.join(ROOT, 'dark'), { recursive: true });
for (const name of names) {
  const rel = PAGES[name];
  if (rel === undefined) { console.error('לא מוכר:', name); continue; }
  let sheets = await sheetsOf(rel);
  sheets = sheets.filter(s => !commonKeys.has(s.key));
  if (OWN_DARK.has(name)) sheets = sheets.filter(s => !/line-changes\//.test(s.key) && s.key.startsWith('inline:') === false);
  const extraF = path.join(ROOT, 'tools/dark-extra', name + '.css');
  const extra = fs.existsSync(extraF) ? '\n/* ידני */\n' + fs.readFileSync(extraF, 'utf8') : '';
  const own = REMAP.has(name) ? remap(sheets) : build(sheets);
  // כלי עם מצב כהה משלו (מצגת לשינוי בקו) — בלי היפוך המפה: המפות בשקפים יורדות כ-PDF ותמונה, ונשארות בהירות
  const css = HEAD + '\n/* משותף */\n' + build(common) + (OWN_DARK.has(name) ? '' : BASE) + '\n/* ' + name + ' */\n' + own + extra;
  fs.writeFileSync(path.join(ROOT, 'dark', name + '.css'), css);
  console.log(name, (css.length / 1024).toFixed(1) + 'KB', sheets.map(s => s.key.replace(SITE, '').slice(0, 40)).join(' | '));
}
await browser.close();
