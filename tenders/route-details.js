'use strict';
/* פירוט לקו בתוך חלון הקו: ציטוטים מילה במילה ממסמכי המכרז (line-changes.json),
   בלי פסקאות שנכתבו בידי מודל שפה (שלמה 16.09). */
const routeDetailsReady = Promise.resolve();
function renderRouteDetails(id, route) {
  if (typeof quotesFor !== 'function') return '';
  const number = route.number ?? route.key?.[1], catalog = route.catalogNumber ?? route.key?.[0];
  const qs = quotesFor(id, number, catalog);
  if (!qs.length) return '<p class="muted">במסמכי המכרז שנקראו לא נמצאה פסקה על הקו הזה שמזכירה שינוי.</p>';
  return `<section class="route-details"><h3>מה כתוב במסמכי המכרז על הקו</h3>${qs.map(renderQuote).join('')}</section>`;
}
