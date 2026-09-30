(function(root) {
  function create(host, onChange = () => {}) {
    const doc = host.document;
    let enabled = false, disposed = false, pending = false, lock = null, generation = 0;
    const supported = !!host.navigator?.wakeLock?.request;
    const status = value => { if (!disposed) onChange(value); };
    const release = sentinel => { if (sentinel) Promise.resolve(sentinel.release()).catch(() => {}); };
    async function acquire() {
      if (disposed || !enabled || pending || lock || doc.visibilityState !== 'visible') return;
      if (!supported) { status('unsupported'); return; }
      pending = true;
      const version = generation;
      status('requesting');
      try {
        const sentinel = await host.navigator.wakeLock.request('screen');
        if (disposed || !enabled || version !== generation || doc.visibilityState !== 'visible') {
          release(sentinel); return;
        }
        lock = sentinel;
        sentinel.addEventListener('release', () => {
          if (lock !== sentinel) return;
          lock = null;
          status(enabled ? 'released' : 'off');
        });
        status('active');
      } catch (_) { if (version === generation) status('unavailable'); }
      finally {
        pending = false;
        if (!disposed && enabled && version !== generation) acquire();
      }
    }
    function setEnabled(value) {
      enabled = value; generation++;
      if (!value) { const old = lock; lock = null; release(old); status('off'); }
      else acquire();
    }
    function visibility() {
      if (doc.visibilityState === 'visible') acquire();
      else { generation++; const old = lock; lock = null; release(old); if (enabled) status('released'); }
    }
    doc.addEventListener('visibilitychange', visibility);
    return {supported, setEnabled, retry: acquire, dispose() {
      disposed = true; setEnabled(false); doc.removeEventListener('visibilitychange', visibility);
    }};
  }
  if(typeof module !== 'undefined' && module.exports) module.exports = {create};
  else root.RouteWakeLock = {create};
})(typeof window === 'undefined' ? {} : window);
