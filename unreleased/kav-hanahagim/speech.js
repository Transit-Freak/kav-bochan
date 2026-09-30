// Hebrew speech for prepared instructions. No directions are inferred from geometry.
(function(root) {
  const directions = {left:'פנו שמאלה',right:'פנו ימינה','keep-left':'היצמדו לשמאל','keep-right':'היצמדו לימין'};
  function spokenText(text) {
    return String(text).replace(/(^|[\s/·,:()])שד(?:[׳’'.])?(?=$|[\s/·,:()])/g, '$1שדרות');
  }
  function instruction(m) {
    if (!m) return '';
    if (m.kind === 'roundabout') return Number.isInteger(m.exit) && m.exit > 0
      ? `בכיכר צאו ביציאה מספר ${m.exit}` : 'כיכר בהמשך. מספר היציאה אינו זמין';
    const first = directions[m.kind];
    return first ? first + (directions[m.then] ? ', ואז ' + directions[m.then] : '') : '';
  }
  function stopLabel(stop) {
    if (!stop) return '';
    const name = stop.name || '';
    const platform = stop.platform || stop.platform_code;
    return name + (platform && !name.includes('רציף') ? ` · רציף ${platform}` : '');
  }
  function nextTurn(rows, f, total) {
    if (!Number.isFinite(f) || !Number.isFinite(total) || total <= 0) return null;
    const candidates = rows.filter(m => Number.isFinite(m.f) && instruction(m) && (m.f - f) * total >= -10)
      .sort((a,b) => a.f-b.f);
    const m = candidates[0];
    return m ? {...m, meters: Math.max(0, (m.f-f)*total)} : null;
  }
  function arrivalLead(speed, seconds) {
    return Math.max(10, Math.min(45, Math.max(0, speed || 0) * (Math.max(0, seconds || 0) + 1.2)));
  }
  function stationFirst(stop, f, total, turn) {
    return !!(stop && Number.isFinite(stop.f) && stop.f > f && total > 0 &&
      (!turn || (turn.f-stop.f)*total >= 200 - 0.01));
  }
  function tracker() {
    const seen = new Map();
    const shortApproaches = new Set();
    const lastSpoken = new Map();
    const stopProgress = new Map();
    return {reset(){seen.clear();shortApproaches.clear();lastSpoken.clear();stopProgress.clear();}, nextStop(stop, f, total, options = {}) {
      if (!stop || !stop.name || !Number.isFinite(stop.f) || stop.f <= f) return null;
      const key = JSON.stringify(['stop',stop.id,stop.seq,stop.f]);
      if (!Number.isFinite(total) || total <= 0) {
        if (seen.has(key)) return null;
        seen.set(key,1);
        return 'התחנה הבאה: ' + stopLabel(stop);
      }
      const meters = (stop.f-f)*total;
      const previous = stopProgress.get(key);
      const time = options.nowMs ?? Date.now();
      if (meters <= 20.01) {
        if (previous?.arrived) return null;
        stopProgress.set(key,{meters,time,near:true,arrived:true});
        return 'עצרו בתחנה ' + stopLabel(stop);
      }
      if (previous?.arrived) return null;
      if (previous) {
        const approaching = meters <= 250 && !previous.near;
        const progressed = meters > 250 && previous.meters-meters >= 500;
        if ((!approaching && !progressed) || time-previous.time < 20000 || previous.meters-meters < 30) return null;
      }
      stopProgress.set(key,{meters,time,near:meters<=250 || !!previous?.near});
      const distance = meters >= 1000 ? `${(meters/1000).toFixed(1)} קילומטר` : `${Math.max(10,Math.round(meters/10)*10)} מטר`;
      return options.continueRoute
        ? `${options.straight ? 'המשיכו ישר' : 'המשיכו במסלול'} ועצרו בתחנה ${stopLabel(stop)} בעוד ${distance}`
        : `התחנה הבאה: ${stopLabel(stop)}, בעוד ${distance}`;
    }, next(m, f, total, segmentMeters, timing) {
      if (!m || !Number.isFinite(f) || !Number.isFinite(total) || total <= 0) return null;
      const meters = (m.f - f) * total;
      if (!Number.isFinite(meters) || meters < -10 || meters > 300 || !instruction(m)) return null;
      const key = JSON.stringify([m.f,m.kind,m.exit,m.then]);
      // A small crossing between GPS samples may skip the exact junction.
      // Only finish a previously observed approach, never announce an old turn on startup.
      if (meters < 0 && !seen.has(key)) return null;
      if (!seen.has(key) && (Number.isFinite(segmentMeters) ? segmentMeters < 100 : meters < 99.99)) shortApproaches.add(key);
      const lead = timing?.arrivalMeters ?? 10;
      let stage = meters <= lead + 0.01 ? 4 : shortApproaches.has(key) ? 1 : meters <= 20.01 ? 3 : meters <= 50 ? 2 : 1;
      if (timing && meters > lead + 0.01) {
        const speed = Math.max(1, timing.speedMps || 0);
        const remaining = (meters - lead) / speed;
        const required = Math.max(1, timing.seconds || 0) + 2;
        const time = timing.nowMs;
        if (remaining + 0.01 < required || remaining > Math.max(15, required + 8)) return null;
        const previous = seen.get(key) || 0;
        stage = previous ? 2 : 1;
        if (previous && (shortApproaches.has(key) || previous >= 2 || remaining > 8 || time - lastSpoken.get(key) < 8000)) return null;
      }
      if ((seen.get(key) || 0) >= stage) return null;
      seen.set(key, stage);
      if (timing) lastSpoken.set(key, timing.nowMs);
      return (meters <= lead + 0.01 ? '' : `בעוד ${Math.max(10,Math.round(meters/10)*10)} מטר, `) + instruction(m);
    }};
  }
  // All controllers on this page share one channel, including route changes.
  const channels = new WeakMap();
  function create(host, onError, now = Date.now, onTiming = () => {}) {
    const synth = host.speechSynthesis;
    const supported = !!(synth && host.SpeechSynthesisUtterance);
    if (supported && !channels.has(synth)) channels.set(synth, {active:null, readyAt:0});
    const channel = supported ? channels.get(synth) : {active:null, readyAt:0};
    let current = null;
    let currentPriority = 0;
    let secondsPerCharacter = 1 / 12;
    const estimate = text => Math.max(1, spokenText(text).length * secondsPerCharacter) + 0.5;
    const voice = () => supported && synth.getVoices().find(v => /^(he|iw)([-_]|$)/i.test(v.lang));
    const busy = () => !!(channel.active || synth?.speaking || synth?.pending || now() < channel.readyAt);
    function cancel() {
      if (!current) return;
      current.onstart = null; current.onend = null; current.onerror = null;
      if (channel.active === current) {
        channel.active = null;
        channel.readyAt = now() + 300;
        synth.cancel();
      }
      current = null;
    }
    return { supported, voice, cancel, busy, estimate,
      interruptFor(priority) { if (current && currentPriority < priority) cancel(); },
      speak(text, priority = 0) {
      // Never cancel-and-speak in one tick: mobile engines may still be audible.
      // No queue: the caller re-evaluates the current position when we are idle.
      if (busy()) return false;
      const selected = voice();
      if (!selected) { onError('לא נמצא קול עברי במכשיר. יש להתקין קול עברי בהגדרות הדיבור ולנסות שוב.'); return false; }
      try {
        const utterance = new host.SpeechSynthesisUtterance(spokenText(text));
        utterance.voice = selected; utterance.lang = selected.lang; utterance.rate = 1;
        current = utterance; currentPriority = priority; channel.active = utterance;
        let startedAt = null;
        utterance.onstart = () => { if (channel.active === utterance) startedAt = now(); };
        const finish = error => {
          if (channel.active !== utterance) return;
          current = null; channel.active = null; channel.readyAt = now() + 200;
          if (error) onError('הכריזה נכשלה. נסו להפעיל אותה שוב.');
          else if (startedAt !== null) {
            const seconds = (now() - startedAt) / 1000;
            if (seconds > 0 && utterance.text?.length) secondsPerCharacter = Math.max(secondsPerCharacter, seconds / utterance.text.length);
            onTiming({seconds});
          }
        };
        utterance.onend = () => finish(false);
        utterance.onerror = () => finish(true);
        synth.speak(utterance); return true;
      } catch (_) {
        if (channel.active === current) channel.active = null;
        current = null; channel.readyAt = now() + 300;
        onError('הכריזה אינה זמינה בדפדפן הזה.'); return false;
      }
    }};
  }
  const api = {stationFirst,arrivalLead,nextTurn,spokenText,instruction,stopLabel,tracker,create};
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RouteSpeech = api;
})(typeof window === 'undefined' ? {} : window);
