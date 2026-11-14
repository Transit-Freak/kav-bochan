// שמירה בענן (Supabase), רק לפי בחירת השחקן. המכשיר נשאר המקום הראשי (localStorage): המשחק עובד בלי רשת,
// והענן רק מסנכרן. חשבון: שם משתמש וסיסמה (נשמר כ-<שם>@players.kavbochan.app, כמו בבטא של האתר), או בלי חשבון
// (אנונימי) — ואפשר לשדרג אחר כך לשם וסיסמה. התחברות עם Google — מוסתרת עד שתוגדר (GOOGLE).
// הטבלה public.saves: id, user_id (ברירת מחדל auth.uid()), name, mode, data (jsonb, עד ~500KB), created_at, updated_at.
// name = 'auto' לשמירה האוטומטית, או המזהה של שמירה בשם (S…). RLS: כל אחד רואה ומשנה רק את השורות שלו.
export const SB_URL = 'https://nisqpjkxrltodvuicieg.supabase.co';
export const SB_KEY = 'sb_publishable_XM85T3S1d5WOZrWd6go0hQ_k4R9kWoX';
export const GOOGLE = false;                      // להדליק אחרי שמגדירים Google OAuth ב-Supabase
const DOMAIN = 'players.kavbochan.app';
const MAX = 450_000;                              // תווים לשמירה אחת (המגבלה בטבלה ~500KB)
const META = 'busgame.cloud.meta.v1';
const SCRIPT = 'vendor/supabase/supabase-js-2.118.0.umd.js';

export const userOk = u => /^[a-z0-9][a-z0-9_.-]{2,23}$/.test(u);
const toEmail = u => `${u}@${DOMAIN}`;
const fromEmail = e => (e || '').endsWith('@' + DOMAIN) ? e.slice(0, -DOMAIN.length - 1) : (e || '');
const readMeta = () => { try { return JSON.parse(localStorage.getItem(META) || '{}') || {}; } catch { return {}; } };
const writeMeta = m => { try { localStorage.setItem(META, JSON.stringify(m)); } catch { } };
// גיבוב קצר של טקסט — לדעת אם משהו השתנה מאז הסנכרון
export const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

// דחיסה: שמירה גדולה (מעל 150KB) נדחסת ב-gzip ונשמרת כ-base64
async function pack(obj) {
  const s = JSON.stringify(obj);
  if (s.length < 150_000 || typeof CompressionStream === 'undefined') return s.length > MAX ? null : obj;
  const buf = await new Response(new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  let bin = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  const b = btoa(bin);
  return b.length > MAX ? null : { z: 'gzip', b };
}
async function unpack(d) {
  if (!d || d.z !== 'gzip') return d;
  const bin = atob(d.b), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return JSON.parse(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
}

export class Cloud {
  constructor(onChange) { this.onChange = onChange || (() => { }); this.sb = null; this.user = null; this.err = ''; this.busy = false; this.list = []; this.ids = new Map(); }
  get on() { return !!this.user; }
  get anon() { return !!this.user?.is_anonymous; }
  get username() { return this.anon ? '' : fromEmail(this.user?.email); }
  // הספרייה נטענת רק כשצריך (מי שלא משתמש בענן — לא מוריד אותה)
  async lib() {
    if (this.sb) return this.sb;
    if (!window.supabase) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = SCRIPT; s.onload = ok; s.onerror = () => no(new Error('load')); document.head.appendChild(s); });
    this.sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'busgame.auth' } });
    this.sb.auth.onAuthStateChange((ev, session) => { this.user = session?.user || null; this.onChange(); });
    return this.sb;
  }
  // בטעינה: אם כבר יש חיבור שמור במכשיר — מתחברים (בלי זה לא נוגעים ברשת)
  async resume() {
    let had = false; try { had = !!localStorage.getItem('busgame.auth'); } catch { }
    if (!had) return false;
    try { const sb = await this.lib(); const { data } = await sb.auth.getSession(); this.user = data.session?.user || null; this.onChange(); return this.on; }
    catch (e) { this.fail(e); return false; }
  }
  fail(e, quiet) { this.err = String(e?.message || e || 'שגיאה'); if (!quiet) this.onChange(); return false; }
  ok() { if (this.err) { this.err = ''; this.onChange(); } return true; }
  async run(f) { this.busy = true; this.onChange(); try { const r = await f(await this.lib()); this.ok(); return r; } catch (e) { this.fail(e); return null; } finally { this.busy = false; this.onChange(); } }
  // ---------- חשבון
  startAnon() { return this.run(async sb => { const { data, error } = await sb.auth.signInAnonymously(); if (error) throw error; this.user = data.user; return true; }); }
  signIn(u, p) { return this.run(async sb => { const { data, error } = await sb.auth.signInWithPassword({ email: toEmail(u), password: p }); if (error) throw error; this.user = data.user; return true; }); }
  // הרשמה. משתמש אנונימי — משדרגים אותו (השמירות שלו נשארות). אם ב-Supabase מופעל "אישור מייל" — אין חיבור עד אישור
  signUp(u, p) {
    return this.run(async sb => {
      if (this.anon) { const { data, error } = await sb.auth.updateUser({ email: toEmail(u), password: p }); if (error) throw error; this.user = data.user; return this.user.email ? true : 'confirm'; }
      const { data, error } = await sb.auth.signUp({ email: toEmail(u), password: p }); if (error) throw error;
      this.user = data.session?.user || null; return data.session ? true : 'confirm';
    });
  }
  google() { return this.run(async sb => { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } }); if (error) throw error; return true; }); }
  signOut() { return this.run(async sb => { await sb.auth.signOut(); this.user = null; this.list = []; this.ids.clear(); writeMeta({}); return true; }); }
  // מחיקת כל השמירות של המשתמש בענן (החשבון עצמו נמחק רק על ידי מנהל — ראו README)
  deleteAll() { return this.run(async sb => { const { error } = await sb.from('saves').delete().eq('user_id', this.user.id); if (error) throw error; this.list = []; this.ids.clear(); writeMeta({}); return true; }); }
  // ---------- שמירות
  async refresh() {
    if (!this.on) return [];
    const r = await this.run(async sb => {
      const { data, error } = await sb.from('saves').select('id,name,mode,updated_at,title:data->>title,money:data->money,time:data->time,nl:data->nl').order('updated_at', { ascending: false });
      if (error) throw error; return data;
    });
    if (r) { this.list = r; this.ids = new Map(r.map(x => [x.name, x.id])); }
    return this.list;
  }
  async put(name, obj, mode) {
    if (!this.on) return false;
    const d = await pack(obj); if (!d) return this.fail('השמירה גדולה מדי לענן');
    return this.run(async sb => {
      let id = this.ids.get(name);
      if (!id) { const { data } = await sb.from('saves').select('id').eq('name', name).limit(1); id = data?.[0]?.id; }
      const row = { name, mode, data: d };
      const q = id ? sb.from('saves').update(row).eq('id', id).select('id,updated_at') : sb.from('saves').insert(row).select('id,updated_at');
      const { data, error } = await q; if (error) throw error;
      this.ids.set(name, data[0].id); return data[0];
    });
  }
  async get(name) {
    const r = await this.run(async sb => { const { data, error } = await sb.from('saves').select('id,name,mode,data,updated_at').eq('name', name).order('updated_at', { ascending: false }).limit(1); if (error) throw error; return data[0] || null; });
    if (r) r.data = await unpack(r.data);
    return r;
  }
  del(name) { const id = this.ids.get(name); if (!id || !this.on) return; this.ids.delete(name); return this.run(async sb => { await sb.from('saves').delete().eq('id', id); return true; }); }
  // יציאה מהדף: שליחה אחרונה בלי לחכות (keepalive), רק אם השתנה משהו
  async beacon(obj, mode) {
    const id = this.ids.get('auto'); if (!this.on || !id || !this.sb) return;
    try {
      const { data } = await this.sb.auth.getSession(); const tok = data.session?.access_token; if (!tok) return;
      const s = JSON.stringify({ name: 'auto', mode, data: obj }); if (s.length > MAX) return;
      fetch(`${SB_URL}/rest/v1/saves?id=eq.${id}`, { method: 'PATCH', keepalive: true, body: s,
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Prefer: 'return=minimal' } });
    } catch { }
  }
  meta() { return readMeta(); }
  setMeta(m) { writeMeta({ ...readMeta(), ...m }); }
}
