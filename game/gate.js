/* משחק הקווים · גרסת בטא — הכניסה (שלמה 09.11.2026).
   כניסה והרשמה עם שם משתמש וסיסמה דרך Supabase Auth. Supabase דורש מייל, אז שם המשתמש הופך לכתובת פנימית
   <שם>@players.kavbochan.app שאף אחד לא רואה ולא מקבל אליה דואר (לכן "Confirm email" כבוי בפרויקט).
   רק שני הנרשמים הראשונים נכנסים: הטבלה public.beta_testers, וטריגר בצד השרת דוחה את השלישי ('beta full'),
   ואז הנרשם נכנס לרשימת ההמתנה (public.beta_waitlist). ה-SQL ב-supabase-beta.sql.
   המשחק עצמו (js/main.js) נטען רק אחרי שבודק מאושר נכנס.
   חשוב לדעת: קבצי המשחק סטטיים ב-GitHub Pages — הכניסה שולטת בגישה דרך האתר, אבל לא מסתירה את הקבצים עצמם.
   המפתח כאן הוא המפתח הציבורי (publishable) של הפרויקט — מותר שיהיה בדפדפן; ההרשאות נקבעות ב-RLS. */
(function () {
  'use strict';
  var SB_URL = 'https://nisqpjkxrltodvuicieg.supabase.co';
  var SB_KEY = 'sb_publishable_XM85T3S1d5WOZrWd6go0hQ_k4R9kWoX';
  var DOMAIN = 'players.kavbochan.app';
  var USER_RE = /^[A-Za-z0-9_]{3,20}$/;
  var FULL_MSG = 'מקומות הבטא נתפסו — נעדכן כשתיפתח גרסה חדשה';

  var $ = function (s) { return document.querySelector(s); };
  var gate = $('#gate'), wait = $('#gWait'), forms = $('#gForms'), err = $('#gErr'), msg = $('#gMsg');
  var who = $('#gWho'), out = $('#gOut');
  var fLogin = $('#fLogin'), fSignup = $('#fSignup'), tLogin = $('#tLogin'), tSignup = $('#tSignup');

  var sb;
  try {
    sb = window.__gateClient || window.supabase.createClient(SB_URL, SB_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'kb-game-auth' }
    });
  } catch (e) { sb = null; }

  var emailOf = function (u) { return u.toLowerCase() + '@' + DOMAIN; };
  var nameOf = function (user) {
    var m = user && user.user_metadata && user.user_metadata.username;
    return m || String(user && user.email || '').split('@')[0];
  };
  var isFull = function (e) { return !!e && /beta full/i.test((e.message || '') + ' ' + (e.details || '') + ' ' + (e.hint || '')); };

  function show(state) {
    wait.hidden = state !== 'wait';
    forms.hidden = state !== 'forms';
    msg.hidden = state !== 'msg';
  }
  function setErr(t) { err.textContent = t || ''; err.hidden = !t; }
  function setUser(user) {
    who.hidden = out.hidden = !user;
    who.textContent = user ? 'מחובר/ת: ' + nameOf(user) : '';
  }
  function message(t) { msg.textContent = t; show('msg'); }
  function tab(which) {
    var login = which === 'login';
    tLogin.setAttribute('aria-selected', login); tSignup.setAttribute('aria-selected', !login);
    fLogin.hidden = !login; fSignup.hidden = login; setErr('');
  }
  tLogin.addEventListener('click', function () { tab('login'); });
  tSignup.addEventListener('click', function () { tab('signup'); });

  var started = false;
  function startGame(user) {
    if (started) return; started = true;
    gate.hidden = true;
    // "יציאה" ו"משחק הקווים · גרסה 0.1" עוברים ללשונית "קופה", בתיבה "משחק" (נראית גם בטלפון)
    var box = document.querySelector('#moneyPane .game-box');
    if (box) {
      var row = document.createElement('div'); row.className = 'g-acct';
      var t = document.createElement('span'); t.textContent = 'מחובר/ת: ' + nameOf(user);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'g-out'; b.textContent = 'יציאה';
      b.addEventListener('click', logout);
      row.appendChild(t); row.appendChild(b);
      var v = document.getElementById('kb-ver'); if (v) row.appendChild(v);
      box.appendChild(row);
    }
    import('./js/main.js?v=18').catch(function (e) {
      var lm = document.getElementById('loadMsg'); if (lm) lm.textContent = 'המשחק לא נטען: ' + (e && e.message || e);
    });
  }

  async function logout() {
    try { if (sb) await sb.auth.signOut(); } catch (e) { }
    location.reload();
  }
  out.addEventListener('click', logout);

  /* האם המשתמש בין הבודקים? אם לא, ואינו ברשימת ההמתנה — מנסים לתפוס מקום (למשל אם ההרשמה נקטעה באמצע) */
  async function access(user) {
    setUser(user); show('wait');
    var r = await sb.from('beta_testers').select('user_id').eq('user_id', user.id).maybeSingle();
    if (r.error) return fail('לא הצלחנו לבדוק את ההרשאה: ' + r.error.message);
    if (r.data) return startGame(user);
    var w = await sb.from('beta_waitlist').select('user_id').eq('user_id', user.id).maybeSingle();
    if (w.data) return message(FULL_MSG);
    var name = nameOf(user);
    var ins = await sb.from('beta_testers').insert({ user_id: user.id, username: name });
    if (!ins.error) return startGame(user);
    if (isFull(ins.error)) {
      await sb.from('beta_waitlist').insert({ user_id: user.id, username: name });   // כפילות — לא משנה
      return message(FULL_MSG);
    }
    return fail('לא הצלחנו לרשום אותך לבטא: ' + ins.error.message);
  }
  function fail(t) { show('forms'); setErr(t); }

  function busy(form, on) { [].forEach.call(form.querySelectorAll('button,input'), function (x) { x.disabled = on; }); }

  fLogin.addEventListener('submit', async function (e) {
    e.preventDefault(); setErr('');
    var u = fLogin.u.value.trim(), p = fLogin.p.value;
    if (!USER_RE.test(u)) return setErr('שם משתמש: 3–20 תווים, אותיות באנגלית, ספרות ו-_');
    if (!p) return setErr('חסרה סיסמה');
    busy(fLogin, true);
    try {
      var r = await sb.auth.signInWithPassword({ email: emailOf(u), password: p });
      if (r.error) return setErr(/invalid login/i.test(r.error.message) ? 'שם משתמש או סיסמה שגויים' : 'הכניסה נכשלה: ' + r.error.message);
      await access(r.data.user);
    } catch (x) { setErr('הכניסה נכשלה: ' + (x && x.message || x)); }
    finally { busy(fLogin, false); }
  });

  fSignup.addEventListener('submit', async function (e) {
    e.preventDefault(); setErr('');
    var u = fSignup.u.value.trim(), p = fSignup.p.value;
    if (!USER_RE.test(u)) return setErr('שם משתמש: 3–20 תווים, אותיות באנגלית, ספרות ו-_');
    if (p.length < 8) return setErr('הסיסמה צריכה להיות באורך 8 תווים לפחות');
    if (!fSignup.ok.checked) return setErr('צריך לאשר את הודעת הפרטיות');
    busy(fSignup, true);
    try {
      var name = u.toLowerCase();
      var r = await sb.auth.signUp({ email: emailOf(u), password: p, options: { data: { username: name } } });
      if (r.error) return setErr(/already|registered|exists/i.test(r.error.message) ? 'שם המשתמש הזה כבר תפוס' : 'ההרשמה נכשלה: ' + r.error.message);
      if (!r.data.session) return setErr('ההרשמה נקלטה אבל לא הושלמה (אימות מייל פעיל בהגדרות). כתבו לשלמה.');
      await access(r.data.user);
    } catch (x) { setErr('ההרשמה נכשלה: ' + (x && x.message || x)); }
    finally { busy(fSignup, false); }
  });

  (async function boot() {
    if (!sb) { show('forms'); return setErr('שירות הכניסה לא נטען. נסו לרענן את הדף.'); }
    try {
      var s = await sb.auth.getSession();
      var user = s.data && s.data.session && s.data.session.user;
      if (user) return access(user);
    } catch (e) { }
    show('forms');
  })();
})();
