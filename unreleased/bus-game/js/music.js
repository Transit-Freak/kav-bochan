// מוזיקת הרקע של משחק הקווים · שלמה הרטמן, 2026 · נוצרה בעזרת בינה מלאכותית
//
// מוזיקת רקע: שלושה קטעים שמנוגנים חי ב-Web Audio (בלי קבצי שמע) ועוברים בלולאה בלי הפסקה.
//   morning — בוקר רגוע (80 bpm), rush — שעת שיא (112 bpm), night — לילה (72 bpm).
// אותם תווים, כלים ומיקס כמו הגרסה שנבנתה ב-Python: פסנתר חשמלי ב-FM, פד, בס, פריטה (משור דרך מסנן), פעמון,
// ותופים (בעיטה, סנר ומצילה מרעש). הד: ConvolverNode עם תגובה שנבנית כאן (אותן השהיות כמו במקור).
// תזמון: התווים נקבעים כ-0.25 שנ' קדימה לפי השעון של AudioContext, והלולאה באורך מדויק של תיבות — בלי סחיפה ובלי רווח.
// מעבר בין קטעים: נדיר ורגוע — רק אחרי שהקטע הרצוי יציב 20 שנ', אחרי שהקטע הנוכחי התנגן לולאה שלמה (או דקה),
// בסוף משפט של 4 תיבות, עם מעבר הדרגתי של 3 שנ'. קטע שחוזרים אליו ממשיך מאיפה שהפסיק. הטמפו לא תלוי במהירות המשחק.
// מהירות המשחק: שכבות נכנסות ויוצאות בתחילת תיבה — ×1 בסיס, ×5 תופים, ×20 מצילה מהירה, ×60 ארפג'ו, ×200 הכול; בלי לשנות טמפו או קטע.
// חתימה: פעם בלולאה, 2.5 שנ' שנגמרות חצי שנייה לפני סוף הלולאה, השם "שלומי" כתוב בספקטרוגרמה (9–16 קה"ץ, שקט מאוד).

const LOOKAHEAD = 0.25, TICK_MS = 60, XFADE = 3, BARS = 16, PHRASE = 4;
const hz = n => 440 * 2 ** ((n - 69) / 12);
const CHORD = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], maj: [0, 4, 7], m: [0, 3, 7], sus: [0, 5, 7] };
const chord = (r, k) => CHORD[k].map(i => r + i);

// ---------- העיבוד: רשימת אירועים לכל קטע (זמן בשניות מתחילת הלולאה)
function morning() {
  const b = 60 / 80, ev = [];
  const prog = [[53, 'maj7'], [52, 'm7'], [50, 'm7'], [48, 'maj7']];
  const mel = [72, null, 69, 71, 72, null, 76, null, 74, null, 72, 71, 69, null, null, null];
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b;
    chord(r, k).forEach((n, i) => ev.push({ t: t0 + i * 0.012, k: 'epiano', n: n + 12, d: 3.6 * b, v: 0.11, p: -0.2 + i * 0.12 }));
    ev.push({ t: t0, k: 'bass', n: r - 12, d: 1.8 * b, v: 0.35, p: 0 }, { t: t0 + 2.5 * b, k: 'bass', n: r - 5, d: 1.6 * b, v: 0.25, p: 0 });
    for (let q = 0; q < 4; q++) {
      if (q === 0 || q === 2) ev.push({ t: t0 + q * b + (q === 2 && bar % 2 ? 0.5 * b : 0), k: 'kick', v: 0.5, p: 0 });
      if (q === 1 || q === 3) ev.push({ t: t0 + q * b, k: 'snare', v: 0.14, p: 0 });
      ev.push({ t: t0 + q * b + b / 2 + 0.02, k: 'hat', v: 0.06, p: 0.3 });
    }
    if (bar >= 4 && bar % 4 < 2) for (let j = 0; j < 4; j++) {
      const m = mel[(bar % 2) * 8 + j * 2];
      if (m) ev.push({ t: t0 + j * b, k: 'bell', n: m, d: b * 0.9, v: 0.09, p: 0.25 });
    }
  }
  // שכבת אנרגיה (הרצה מהירה): מצילה בשש-עשריות ופריטה עדינה באקורד
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b, ch = chord(r, k);
    for (let s = 1; s < 16; s += 2) ev.push({ t: t0 + s * b / 4, k: 'hat', v: 0.03, p: -0.2, x: 1 });
    [0, 2, 1, 3, 2, 1, 3, 2].forEach((c, s) => ev.push({ t: t0 + s * b / 2, k: 'pluck', n: ch[c] + 12, d: b / 2, v: 0.08, p: s % 2 ? 0.3 : -0.3, x: 1 }));
  }
  return { ev, len: BARS * 4 * b, bar: 4 * b, rev: 0.35, eg: 2.8 };
}
function rush() {
  const b = 60 / 112, ev = [];
  const prog = [[57, 'm'], [53, 'maj'], [48, 'maj'], [55, 'maj']];
  const arp = [0, 1, 2, 1, 0, 2, 1, 2];
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b, ch = chord(r, k);
    for (let s = 0; s < 8; s++) ev.push({ t: t0 + s * b / 2, k: 'pluck', n: ch[arp[s]] + 12, d: b / 2, v: 0.16, p: s % 2 ? 0.35 : -0.35 });
    for (const s of [0, 3, 4, 6]) ev.push({ t: t0 + s * b / 2, k: 'bass', n: r - 12, d: b / 2 * 0.9, v: 0.33, p: 0 });
    for (let q = 0; q < 4; q++) {
      ev.push({ t: t0 + q * b, k: 'kick', v: 0.6, p: 0 });
      if (q === 1 || q === 3) ev.push({ t: t0 + q * b, k: 'snare', v: 0.22, p: 0 });
      ev.push({ t: t0 + q * b + b / 2, k: 'hat', v: 0.07, p: 0 }, { t: t0 + q * b + b / 4, k: 'hat', v: 0.035, p: 0 });
    }
    if (bar >= 8) ch.forEach((n, i) => ev.push({ t: t0, k: 'pad', n, d: 3.8 * b, v: 0.07, p: -0.3 + i * 0.3 }));
  }
  // שכבת אנרגיה: משלימים את השש-עשריות במצילה, וקו פריטה גבוה בין הפריטות
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b, ch = chord(r, k);
    for (let q = 0; q < 4; q++) ev.push({ t: t0 + q * b + 3 * b / 4, k: 'hat', v: 0.03, p: -0.25, x: 1 });
    for (let s = 1; s < 16; s += 2) ev.push({ t: t0 + s * b / 4, k: 'pluck', n: ch[[2, 0, 1, 2][(s >> 1) % 4]] + 24, d: b / 4, v: 0.05, p: 0, x: 1 });
  }
  return { ev, len: BARS * 4 * b, bar: 4 * b, rev: 0.2, eg: 4 };
}
function night() {
  const b = 60 / 72, ev = [];
  const prog = [[62, 'm7'], [58, 'maj7'], [65, 'maj7'], [60, 'sus']];
  const mel = [[74, 77, 76, 74], [74, 72, 70, 69], [72, 74, 77, 79], [76, 74, 72, null]];
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b;
    chord(r, k).forEach((n, i) => ev.push({ t: t0, k: 'pad', n, d: 4 * b, v: 0.07, p: -0.4 + i * 0.25 }));
    ev.push({ t: t0, k: 'bass', n: r - 12, d: 1.9 * b, v: 0.22, p: 0 }, { t: t0 + 2 * b, k: 'bass', n: r - 5, d: 1.6 * b, v: 0.16, p: 0 });
    for (let q = 0; q < 4; q++) {
      ev.push({ t: t0 + q * b + b / 2, k: 'hat', v: 0.035, p: 0.3 });
      if (q === 2) ev.push({ t: t0 + q * b, k: 'snare', v: 0.07, p: 0 });
      if (q === 0) ev.push({ t: t0, k: 'kick', v: 0.3, p: 0 });
    }
    if (bar >= 4) mel[bar % 4].forEach((m, j) => { if (m) ev.push({ t: t0 + j * b, k: 'epiano', n: m + 12, d: b * 0.9, v: 0.10, p: 0.2 }); });
    if (bar % 4 === 3) ev.push({ t: t0 + 3.5 * b, k: 'bell', n: 84, d: b, v: 0.06, p: -0.4 });
  }
  // שכבת אנרגיה: שייקר רך בשש-עשריות (מודגש בשמיניות) וארפג'ו שקט באקורד
  for (let bar = 0; bar < BARS; bar++) {
    const [r, k] = prog[bar % 4], t0 = bar * 4 * b, ch = chord(r, k);
    for (let s = 0; s < 16; s++) ev.push({ t: t0 + s * b / 4, k: 'hat', v: s % 2 ? 0.016 : 0.024, p: -0.3, x: 1 });
    [0, 1, 2, 3, 2, 1, 2, 3].forEach((c, s) => ev.push({ t: t0 + s * b / 2, k: 'pluck', n: ch[c % ch.length], d: b / 2, v: 0.045, p: 0.3, x: 1 }));
  }
  return { ev, len: BARS * 4 * b, bar: 4 * b, rev: 0.4, eg: 3.5 };
}
// עוצמה לכל קטע: שלושתם באותה עוצמה נשמעת (כ-16- LUFS לפני עוצמת המוזיקה במשחק), נמדד ברינדור offline
const NORM = { morning: 1.096, rush: 0.989, night: 1.462 };
const EGG_LEN = 2.5, EGG_END = 0.5, EGG_LEVEL = 0.015 / 0.85;   // כמו ב-egg.py: 0.015 ביחס למיקס ששיאו 0.85
export const TRACKS = {};
for (const [name, fn] of Object.entries({ morning, rush, night })) {
  const T = fn();
  T.ev.push({ t: T.len - EGG_END - EGG_LEN, k: 'egg', v: 0, p: 0 });   // העוצמה נקבעת לפי שיא הקטע (PEAK)
  T.ev.sort((a, b) => a.t - b.t); T.name = name; T.norm = NORM[name]; TRACKS[name] = T;
}
// שיא כל קטע (אחרי NORM, בלי שכבת האנרגיה), נמדד ברינדור offline — כדי שהחתימה תהיה באותו יחס כמו במקור
const PEAK = { morning: 0.88, rush: 0.81, night: 0.74 };
for (const name in TRACKS) TRACKS[name].ev.find(e => e.k === 'egg').v = EGG_LEVEL * PEAK[name] / NORM[name];   // /NORM — הערוץ של הקטע מכפיל בו

// החתימה: הטקסט מצויר ב-canvas (העברית מימין לשמאל — הדפדפן מסדר לבד), כל שורת פיקסלים היא גל סינוס
// (השורה העליונה — התדר הגבוה), כל עמודה — רגע בזמן. נבנית פעם אחת כ-AudioBuffer, בשיא 1
function eggBuffer(c, txt = 'שלומי') {
  const H = 44, font = 'bold 34px "DejaVu Sans", Arial, "Noto Sans Hebrew", sans-serif';
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas');
  let g = cv.getContext('2d'); g.font = font;
  const W = Math.ceil(g.measureText(txt).width) + 12;
  cv.width = W; cv.height = H; g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = font; g.textBaseline = 'middle'; g.direction = 'rtl'; g.textAlign = 'right';
  g.fillText(txt, W - 6, H / 2);
  const px = g.getImageData(0, 0, W, H).data;
  const sr = c.sampleRate, n = Math.round(EGG_LEN * sr), b = c.createBuffer(1, n, sr), out = b.getChannelData(0);
  const amp = new Float32Array(n), R = rng(1);
  for (let r = 0; r < H; r++) {
    let any = false;
    for (let x = 0; x < W; x++) if (px[(r * W + x) * 4] > 25) { any = true; break; }
    if (!any) continue;
    // עוצמה לאורך הזמן: מעבר ליניארי בין העמודות (בערך 15 מ"ש לעמודה — בלי קליקים)
    for (let i = 0; i < n; i++) {
      const u = i / n * W - 0.5, x0 = Math.max(0, Math.floor(u)), x1 = Math.min(W - 1, x0 + 1), f = Math.min(1, Math.max(0, u - x0));
      amp[i] = (px[(r * W + x0) * 4] * (1 - f) + px[(r * W + x1) * 4] * f) / 255;
    }
    // סינוס בתדר השורה בסיבוב רקורסיבי (בלי Math.sin לכל דגימה)
    const fr = 16000 - (16000 - 9000) * r / (H - 1), w = 2 * Math.PI * fr / sr, cw = Math.cos(w), sw = Math.sin(w), ph = R.u() * 6.28;
    let s = Math.sin(ph), co = Math.cos(ph);
    for (let i = 0; i < n; i++) { if (amp[i]) out[i] += amp[i] * s; const s2 = s * cw + co * sw; co = co * cw - s * sw; s = s2; }
  }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(out[i]));
  const fade = 0.3 * sr;
  for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / fade, (n - 1 - i) / fade) / (pk || 1);
  return b;
}

// ---------- המנוע: כלים, הד, ניגון קטע בלולאה. משמש גם לניגון חי וגם לרינדור offline
function rng(seed) {      // mulberry32 + Box-Muller: רעש גאוסי קבוע (אותו צליל בכל פעם)
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return { u, g: () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()) };
}
const onepole = (x, cut, sr) => { const a = Math.exp(-2 * Math.PI * cut / sr); let p = 0; for (let i = 0; i < x.length; i++) { p = (1 - a) * x[i] + a * p; x[i] = p; } return x; };

// שכבות לפי מהירות המשחק: base (אקורדים, בס, מנגינה) תמיד; drm — תופים; hat — מצילה מהירה (שכבת האנרגיה); arp — ארפג'ו (שכבת האנרגיה)
const layerOf = e => e.x ? (e.k === 'pluck' ? 'arp' : 'hat') : (e.k === 'kick' || e.k === 'snare' || e.k === 'hat') ? 'drm' : null;
const LAYERS = ['drm', 'hat', 'arp'];
// רמה לפי מהירות: 1 — ×1 בסיס בלבד, 2 — ×5 עם תופים (כמו הקטע הרגיל), 3 — ×20 + מצילה מהירה, 4 — ×60 + ארפג'ו, 5 — ×200 הכול במלוא העוצמה
const LEVEL_GAIN = { drm: [0, 0, 1, 1, 1, 1], hat: [0, 0, 0, 1, 1, 1], arp: [0, 0, 0, 0, 0.6, 1] };
const layerGain = (tr, L, lv) => LEVEL_GAIN[L][lv] * (L === 'drm' ? 1 : tr.T.eg);
const busKey = e => (layerOf(e) || '') + e.p + (e.k === 'pluck' ? 'f' : '');

class Engine {
  constructor(ctx, out) {
    const c = this.ctx = ctx, sr = c.sampleRate, R = this.r = rng(7);
    this.master = c.createGain(); this.master.connect(out);
    const wave = (re, im) => c.createPeriodicWave(Float32Array.from(re), Float32Array.from(im), { disableNormalization: true });
    this.cosW = wave([0, 1], [0, 0]);                                   // מאפנן ה-FM של הפסנתר
    this.bassW = wave([0, 0, 0], [0, 1, 0.25]);                         // sin f + 0.25 sin 2f
    // פד: שלושה מתנדים מעט לא מכוונים בפאזה אקראית (שליש כל אחד), והאמצעי עם הרמוניה שנייה 0.3
    this.padW = []; this.padC = [];
    for (let i = 0; i < 8; i++) {
      const ph = R.u() * 6, s = Math.sin(ph) / 3, co = Math.cos(ph) / 3;
      this.padW.push(wave([0, s], [0, co])); this.padC.push(wave([0, s, 0], [0, co, 0.3]));
    }
    // תופים: אותן נוסחאות כמו במקור, נבנים פעם אחת כ-AudioBuffer (בעוצמה 1; העוצמה של כל מכה ב-Gain)
    const buf = (sec, f) => { const n = Math.floor(sec * sr), b = c.createBuffer(1, n, sr), x = b.getChannelData(0); f(x, n); return b; };
    this.kickB = buf(0.35, (x, n) => { let ph = 0; for (let i = 0; i < n; i++) { const t = i / sr; ph += 2 * Math.PI * (110 * Math.exp(-t * 25) + 45) / sr; x[i] = Math.sin(ph) * Math.exp(-t * 9); } for (let i = 0; i < 64; i++) x[n - 1 - i] *= i / 64; });
    this.hatB = []; this.snareB = [];
    for (let v = 0; v < 6; v++) this.hatB.push(buf(0.06, (x, n) => {
      const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = x[i] = R.g();
      onepole(w, 6000, sr); for (let i = 0; i < n; i++) x[i] = (x[i] - w[i]) * Math.exp(-i / sr * 60);
    }));
    for (let v = 0; v < 4; v++) this.snareB.push(buf(0.2, (x, n) => {
      for (let i = 0; i < n; i++) { const t = i / sr; x[i] = R.g() * Math.exp(-t * 22) + 0.5 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30); }
      onepole(x, 5000, sr);
    }));
    // הד: השהיות עם משוב (כמו Track.reverb), ימין ארוך פי 1.07, דרך מסנן 4 קה"ץ — כתגובת הלם אחת לכל ערוץ
    const taps = [[0.031, .5], [0.047, .45], [0.071, .4], [0.113, .35], [0.167, .3], [0.241, .25]];
    const irN = Math.ceil(0.241 * 1.07 * 4 * sr) + Math.ceil(0.01 * sr), ir = c.createBuffer(2, irN, sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (const [dly, g] of taps) {
        const d = Math.floor(dly * sr * (ch ? 1.07 : 1)), a = 0.6 * g, co = [1, 3 * a, 3 * a * a, a * a * a];
        for (let k = 0; k < 4; k++) x[d * (k + 1)] += g * co[k];
      }
      onepole(x, 4000, sr);
      for (let i = 0; i < irN; i++) x[i] /= 3;
    }
    this.verb = c.createConvolver(); this.verb.normalize = false; this.verb.buffer = ir; this.verb.connect(this.master);
    this.pluckA = Math.exp(-2 * Math.PI * 2500 / sr);
    // החתימה נבנית כשנייה וחצי אחרי ההתחלה (לא ברגע הלחיצה — שלא תהיה גמגום); היא נדרשת רק כמה עשרות שניות אחר כך
    this.eggB = null;
    const mk = () => { try { this.eggB = eggBuffer(c); } catch { } };
    if (typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext) mk(); else setTimeout(mk, 1500);
    this.tracks = {}; this.active = [];
  }
  // ערוץ לקטע: כל הקולות → (פאן) → out (עוצמה × מעבר) → master, ושליחה להד. שכבות המהירות (drm/hat/arp) → lg[שכבה] → out
  track(name) {
    if (this.tracks[name]) return this.tracks[name];
    const c = this.ctx, T = TRACKS[name], tr = { T, buses: new Map(), pos: 0 };
    tr.out = c.createGain(); tr.out.gain.value = 0; tr.out.connect(this.master);
    tr.lg = {}; for (const L of LAYERS) { const g = c.createGain(); g.gain.value = 0; g.connect(tr.out); tr.lg[L] = g; }
    tr.send = c.createGain(); tr.send.gain.value = T.rev; tr.out.connect(tr.send); tr.send.connect(this.verb);
    // פאן כמו במקור: שמאל ×(1-pan)·0.7, ימין ×(1+pan)·0.7. ערוץ אחד לכל ערך פאן (ולפריטה — עם מסנן חד-קוטבי)
    for (const e of T.ev) {
      const key = busKey(e);
      if (tr.buses.has(key)) continue;
      const m = c.createChannelMerger(2), L = c.createGain(), Rg = c.createGain();
      L.gain.value = (1 - e.p) * 0.7; Rg.gain.value = (1 + e.p) * 0.7;
      L.connect(m, 0, 0); Rg.connect(m, 0, 1); m.connect(layerOf(e) ? tr.lg[layerOf(e)] : tr.out);
      let inp = c.createGain();
      inp.connect(L); inp.connect(Rg);
      if (e.k === 'pluck') { const f = c.createIIRFilter([1 - this.pluckA], [1, -this.pluckA]); f.connect(inp); inp = f; }
      tr.buses.set(key, inp);
    }
    return (this.tracks[name] = tr);
  }
  // התחלת קטע בזמן at: ממשיך מהמקום שבו נעצר בפעם הקודמת (tr.pos), עם עלייה הדרגתית
  start(name, at, fade = XFADE, lv = 2) {
    const tr = this.track(name), g = tr.out.gain, v = tr.T.norm, ev = tr.T.ev;
    g.cancelScheduledValues(at); g.setValueAtTime(fade ? 0 : v, at); if (fade) g.linearRampToValueAtTime(v, at + fade);
    let i = 0; while (i < ev.length && ev[i].t < tr.pos - 1e-6) i++;
    const p = { tr, name, loop0: at - tr.pos, i: i % ev.length, stopAt: Infinity, started: at, lv, win: {} };
    for (const L of LAYERS) { const v = layerGain(tr, L, lv), g = tr.lg[L].gain; g.cancelScheduledValues(at); g.setValueAtTime(v, at); p.win[L] = v ? [-Infinity, Infinity] : [Infinity, Infinity]; }
    if (i >= ev.length) p.loop0 += tr.T.len;
    this.active = this.active.filter(a => a.tr !== tr); this.active.push(p);
    return p;
  }
  // סיום קטע: ירידה הדרגתית מ-at (תחילת משפט), ואחריה לא נקבעים תווים חדשים. המקום נשמר לפעם הבאה
  stop(p, at, fade = XFADE) {
    const g = p.tr.out.gain; g.cancelScheduledValues(at); g.setValueAtTime(p.tr.T.norm, at); g.linearRampToValueAtTime(0, at + fade);
    p.stopAt = at + fade; p.tr.pos = ((at - p.loop0) % p.tr.T.len + p.tr.T.len) % p.tr.T.len;
  }
  // רמת השכבות: כל שכבה שנכנסת — עלייה של 2 שנ' מ-at (תחילת תיבה); שכבה שיוצאת — ירידה של 3 שנ'
  setLevel(p, lv, at) {
    for (const L of LAYERS) {
      const from = layerGain(p.tr, L, p.lv), to = layerGain(p.tr, L, lv); if (from === to) continue;
      const g = p.tr.lg[L].gain, up = to > from;
      g.cancelScheduledValues(at); g.setValueAtTime(from, at); g.linearRampToValueAtTime(to, at + (up ? 2 : 3));
      if (up) { if (!(p.win[L][0] <= at && p.win[L][1] > at)) p.win[L] = [at, Infinity]; else p.win[L][1] = Infinity; }
      else if (!to) p.win[L][1] = at + 3;
    }
    p.lv = lv;
  }
  nextBar(p, t, bars = 1) { const B = p.tr.T.bar * bars; return p.loop0 + Math.ceil((t - p.loop0) / B - 1e-9) * B; }
  // קביעת כל התווים שמתחילים לפני until (תווי שכבת האנרגיה — רק בזמן שהיא פעילה)
  schedule(until) {
    for (const p of this.active) {
      const ev = p.tr.T.ev, len = p.tr.T.len;
      for (;;) {
        const e = ev[p.i], t = p.loop0 + e.t;
        if (t >= until || t >= p.stopAt) break;
        const L = layerOf(e);
        if (!L || (t >= p.win[L][0] && t < p.win[L][1])) this.voice(p.tr, e, t);
        if (++p.i >= ev.length) { p.i = 0; p.loop0 += len; }
      }
    }
    const now = this.ctx.currentTime;
    if (this.active.some(p => p.stopAt < now)) this.active = this.active.filter(p => p.stopAt >= now);
  }
  voice(tr, e, t) {
    const c = this.ctx, bus = tr.buses.get(busKey(e)), R = this.r;
    const end = (src, last, ...nodes) => { src.onended = () => { for (const n of nodes) n.disconnect(); }; last.connect(bus); };
    if (e.k === 'egg') {
      if (!this.eggB) return;
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = this.eggB; g.gain.value = e.v / 0.7; s.connect(g); end(s, g, g); s.start(t); return;   // /0.7 — מבטל את הפאן
    }
    if (e.k === 'kick' || e.k === 'hat' || e.k === 'snare') {
      const s = c.createBufferSource(), g = c.createGain();
      s.buffer = e.k === 'kick' ? this.kickB : e.k === 'hat' ? this.hatB[(R.u() * 6) | 0] : this.snareB[(R.u() * 4) | 0];
      g.gain.value = e.v; s.connect(g); end(s, g, g); s.start(t); return;
    }
    const f = hz(e.n), env = c.createGain(), G = env.gain;
    // ADSR כמו env() במקור: עלייה ליניארית, ירידה ל-s, החזקה עד סוף התו, שחרור ליניארי ל-0
    const adsr = (a, d, s, r) => {
      const hold = t + Math.max(e.d, a + d);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(e.v, t + a); G.linearRampToValueAtTime(e.v * s, t + a + d);
      G.setValueAtTime(e.v * s, hold); G.linearRampToValueAtTime(0, hold + r); return hold + r;
    };
    const osc = (fr, w) => { const o = c.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); o.frequency.value = fr; return o; };
    if (e.k === 'epiano') {        // FM: sin(ωt + 1.2·e^(-3t)·sin ωt) — המאפנן מזיז את התדר של הנושא
      const car = osc(f, 'sine'), mod = osc(f, this.cosW), mg = c.createGain();
      mg.gain.setValueAtTime(1.2 * f, t); mg.gain.setTargetAtTime(0, t, 1 / 3);
      mod.connect(mg); mg.connect(car.frequency); car.connect(env);
      const stop = adsr(0.005, 0.6, 0.35, 0.9); mod.start(t); car.start(t); mod.stop(stop); car.stop(stop);
      end(car, env, env, mg);
    } else if (e.k === 'pad') {
      const o1 = osc(f * 0.996, this.padW[(R.u() * 8) | 0]), o2 = osc(f, this.padC[(R.u() * 8) | 0]), o3 = osc(f * 1.005, this.padW[(R.u() * 8) | 0]);
      o1.connect(env); o2.connect(env); o3.connect(env);
      const stop = adsr(0.8, 0.5, 0.8, 1.6); for (const o of [o1, o2, o3]) { o.start(t); o.stop(stop); }
      end(o2, env, env);
    } else if (e.k === 'bass') {
      const o = osc(f, this.bassW); o.connect(env);
      const stop = adsr(0.01, 0.2, 0.7, 0.15); o.start(t); o.stop(stop); end(o, env, env);
    } else if (e.k === 'pluck') {  // משור × e^(-9t), עלייה של 3 מ"ש; המסנן בערוץ
      const o = osc(f, 'sawtooth'), stop = t + e.d + 0.25; o.connect(env);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(e.v, t + 0.003); G.setTargetAtTime(0, t + 0.003, 1 / 9); G.setValueAtTime(e.v * Math.exp(-9 * (e.d + 0.25)), stop - 0.01); G.linearRampToValueAtTime(0, stop);
      o.start(t); o.stop(stop); end(o, env, env);
    } else if (e.k === 'bell') {   // sin f + 0.4 sin 2.76f, דעיכה e^(-2.2t)
      const o1 = osc(f, 'sine'), o2 = osc(f * 2.76, 'sine'), g2 = c.createGain(), stop = t + e.d + 1.2;
      g2.gain.value = 0.4; o1.connect(env); o2.connect(g2); g2.connect(env);
      G.setValueAtTime(0, t); G.linearRampToValueAtTime(e.v, t + 0.004); G.setTargetAtTime(0, t + 0.004, 1 / 2.2); G.setValueAtTime(e.v * Math.exp(-2.2 * (e.d + 1.2)), stop - 0.02); G.linearRampToValueAtTime(0, stop);
      o1.start(t); o2.start(t); o1.stop(stop); o2.stop(stop); end(o1, env, env, g2);
    }
  }
}

// רינדור offline של קטע (לבדיקות): מתחילת הלולאה, sec שניות; energy — עם שכבת האנרגיה מההתחלה;
// once — רק התווים של לולאה אחת (הזנב אחריה מתקפל להתחלה, כמו בגרסת ה-Python)
export async function renderTrack(name, sec, { sr = 44100, energy = false, level, steps, once = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.round(sec * sr), sr), eng = new Engine(ctx, ctx.destination);
  const p = eng.start(name, 0, 0, level ?? (energy ? 5 : 2));
  for (const [t, lv] of steps || []) eng.setLevel(p, lv, eng.nextBar(p, t));   // steps: [[שנייה, רמה], …] — הדגמה של מעבר בין מהירויות
  if (once) p.stopAt = TRACKS[name].len;
  eng.schedule(sec);
  return ctx.startRendering();
}

// ---------- הנגן במשחק: מתחיל אחרי מגע/לחיצה ראשונים, השתקה נשמרת במכשיר, נעצר כשהלשונית מוסתרת
const KEY = 'busgame-music';          // לא busgame.* — כדי ש"התחל מחדש" לא ימחק את ההעדפה
const VOL = 0.25, DUCK = 0.5;
const HOLD_MOOD = 20, MIN_PLAY = 60, HOLD_LEVEL = 4;   // שניות אמיתיות
export class Music {
  constructor() {
    const q = new URLSearchParams(location.search);
    let off = false; try { off = localStorage.getItem(KEY) === 'off'; } catch { }
    this.disabled = q.has('nomusic') || !(window.AudioContext || window.webkitAudioContext);
    this.muted = off; this.want = null; this.cur = null; this.busyUntil = 0;
    this.pend = null; this.pendT = 0; this.lvl = 2; this.lvlPend = 2; this.lvlT = 0; this.duck = false;
    this.listeners = []; this.switches = [];
    if (q.has('musicdebug')) { this.dbg = document.createElement('div'); this.dbg.style.cssText = 'position:fixed;bottom:4px;left:4px;z-index:99;background:rgba(0,0,0,.7);color:#fff;font:11px/1.4 monospace;padding:3px 6px;border-radius:6px;direction:ltr;pointer-events:none'; document.body.appendChild(this.dbg); }
    if (this.disabled) return;
    const go = () => { this.gesture = true; if (!this.muted) this.wake(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, go, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => this.sync());
  }
  get playing() { return !!this.ctx && this.ctx.state === 'running'; }
  get track() { return this.cur?.name || null; }
  onChange(f) { this.listeners.push(f); f(this); }
  toggle() {
    if (this.disabled) return;
    this.muted = !this.muted;
    try { localStorage.setItem(KEY, this.muted ? 'off' : 'on'); } catch { }
    if (!this.muted) { this.gesture = true; this.wake(); } else this.sync();
    for (const f of this.listeners) f(this);
  }
  // המצב במשחק (נקרא כמה פעמים בשנייה): mood — הקטע המתאים, lvl — רמת השכבות לפי המהירות (1–5; null — בלי שינוי),
  // duck — עצירה או חלון פתוח (חצי עוצמה)
  update(mood, lvl, duck) {
    if (this.disabled || !TRACKS[mood]) return;
    const now = performance.now() / 1000;
    if (mood !== this.pend) { this.pend = mood; this.pendT = now; }
    if (!this.want) this.want = mood;
    if (mood !== this.want && now - this.pendT >= HOLD_MOOD) this.want = mood;
    if (lvl != null && lvl !== this.lvlPend) { this.lvlPend = lvl; this.lvlT = now; }
    if (this.lvlPend !== this.lvl && now - this.lvlT >= HOLD_LEVEL) this.lvl = this.lvlPend;
    if (duck !== this.duck) { this.duck = duck; this.level(0.6); }
    if (this.playing) this.pump();
    if (this.dbg) this.debug(now);
  }
  debug(now) {
    const c = this.cur, t = this.ctx?.currentTime ?? 0;
    const playLeft = c ? Math.max(0, Math.min(c.tr.T.len, MIN_PLAY) - (t - c.started)) : 0;
    const holdLeft = this.pend !== this.want ? Math.max(0, HOLD_MOOD - (now - this.pendT)) : 0;
    this.dbg.textContent = `music ${this.muted ? 'muted' : this.ctx?.state || 'idle'} | track ${c?.name || '-'} | want ${this.want} (pending ${this.pend}) | switch in ${this.want !== c?.name ? Math.ceil(Math.max(playLeft, holdLeft)) : holdLeft ? Math.ceil(holdLeft) : '-'}s | level ${c?.lv ?? '-'} (want ${this.lvl}) | duck ${this.duck ? 'on' : 'off'} | switches ${this.switches.length}`;
  }
  wake() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC({ latencyHint: 'playback' });
        this.out = this.ctx.createGain(); this.out.gain.value = 0; this.out.connect(this.ctx.destination);
        this.eng = new Engine(this.ctx, this.out);
      } catch (err) { console.warn('music', err); this.disabled = true; return; }
    }
    this.sync();
  }
  level(sec) {
    const c = this.ctx; if (!c || c.state !== 'running' || this.muted || document.hidden) return;
    const g = this.out.gain, t = c.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(VOL * (this.duck ? DUCK : 1), t + sec);
  }
  // מנגן רק כשלא מושתק והלשונית גלויה; אחרת AudioContext מושהה (בלי עומס) וממשיך מאותו מקום כשחוזרים
  sync() {
    const c = this.ctx; if (!c) return;
    const on = !this.muted && !document.hidden && this.gesture, g = this.out.gain, t = c.currentTime;
    clearTimeout(this.offT);
    if (on) {
      const p = c.state !== 'running' ? c.resume() : Promise.resolve();
      p.then(() => {
        this.level(0.4);
        if (!this.timer) this.timer = setInterval(() => this.pump(), TICK_MS);
        this.pump();
      }).catch(() => { });
    } else {
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.15);
      clearInterval(this.timer); this.timer = 0;
      this.offT = setTimeout(() => { if (c.state === 'running') c.suspend().catch(() => { }); }, 250);
    }
  }
  pump() {
    const c = this.ctx, eng = this.eng; if (!c || c.state !== 'running' || !this.want) return;
    const now = c.currentTime, ahead = now + LOOKAHEAD;
    if (!this.cur) this.cur = eng.start(this.want, now + 0.1, 1.5, this.lvl);
    else if (this.want !== this.cur.name && now >= this.busyUntil && now - this.cur.started >= Math.min(this.cur.tr.T.len, MIN_PLAY)) {
      // מעבר: בסוף משפט של 4 תיבות בקטע הנוכחי, 3 שנ' של מעבר הדרגתי. הקטע החדש ממשיך מאיפה שעצר בפעם הקודמת
      const at = eng.nextBar(this.cur, ahead, PHRASE), from = this.cur.name, lv = this.cur.lv;
      eng.stop(this.cur, at); this.cur = eng.start(this.want, at, XFADE, lv);
      this.busyUntil = at + XFADE + 0.1;
      this.switches.push({ at: performance.now() / 1000, from, to: this.want });
      for (const f of this.listeners) f(this);
    }
    if (this.lvl !== this.cur.lv && now >= this.busyUntil) eng.setLevel(this.cur, this.lvl, eng.nextBar(this.cur, ahead));
    eng.schedule(ahead);
  }
}
