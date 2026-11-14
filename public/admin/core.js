/* EasyHire: ליבת הדשבורד. מצב, קריאות API, מעטפת (סרגל צד וסרגל עליון), תגיות סטטוס,
   לוח הקליטה (טבלה בקבוצות וקנבן), תיק עובד, פטורים, סל טפסים, סימולטור והגדרות */
const { $e, icon, busy } = Forms;
const root = document.getElementById('root');
let me = null, view = 'pipeline', list = [], groups = [], cfg = { capacity: 180 }, pendingEx = 0, tplCount = 0, simTarget = '', simDevice = 'phone';
let detailId = null, detailTab = '', quietRender = false, renderSeq = 0, navOpen = false;
const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const flt = { q: '', s: '', d: '' };
let boardMode = pref('boardMode', 'table');
const collapsed = new Set(['approved']);

async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { me = null; showLogin(); throw new Error(j.error); }
  if (!r.ok) throw new Error(j.error || 'שגיאה');
  return j;
}
function toast(msg, err) { const t = $e('div', { class: 'toast' + (err ? ' err' : ''), icon: err ? 'alert' : 'checkCircle', text: msg.replace(/\s*✓$/, '') }); document.body.append(t); setTimeout(() => t.remove(), 3400); }
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };
const stop = (ev) => ev.stopPropagation();
const fmt = (s) => s ? new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
// SQLite שומר CURRENT_TIMESTAMP כ-UTC בלי אזור זמן
const utc = (s) => (s && !/[zZ+]/.test(s.slice(10)) ? s.replace(' ', 'T') + 'Z' : s);
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('he-IL') : '—';
const ago = (s) => { if (!s) return '—'; const m = Math.round((Date.now() - new Date(s)) / 60000); if (m < 1) return 'ממש עכשיו'; if (m < 60) return 'לפני ' + m + ' דק׳'; if (m < 1440) return 'לפני ' + Math.round(m / 60) + ' שעות'; return fmt(s); };
const empUrl = (tok) => location.origin + '/e/' + tok;
const initials = (n) => (n || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
const PALETTE = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#ff642e', '#037f4c', '#784bd1', '#ff158a', '#0086c0'];
const tint = (s) => PALETTE[[...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const avatar = (name, lg) => $e('div', { class: 'avatar' + (lg ? ' lg' : ''), style: 'background:' + tint(name), text: initials(name) });
const who = (name, sub) => $e('div', { class: 'who' }, avatar(name), $e('div', { style: 'min-width:0' }, $e('b', { text: name }), sub ? $e('small', { text: sub }) : null));
function modal(content, wide) { const m = $e('div', { class: 'modal', onclick: (e) => e.target === m && m.remove() }, $e('div', { class: 'card', style: wide ? 'max-width:780px' : '' }, content)); document.body.append(m); return m; }
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('הקישור הועתק ✓'); } catch { prompt('העתיקו את הקישור:', text); } }
const waPhone = (p) => (p || '').replace(/\D/g, '').replace(/^0/, '972');
const waLink = (e) => 'https://wa.me/' + waPhone(e.phone) + '?text=' + encodeURIComponent('שלום ' + e.full_name.split(' ')[0] + ', ברוכים הבאים! אנא מלאו את טפסי הקליטה בקישור:\n' + empUrl(e.token));
// כמו replaceChildren, אבל מדלג על ערכים ריקים (null/undefined) במקום להציג אותם כטקסט
const fill = (node, ...kids) => node.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
const validEmail = (v) => /^[^@\s?&#/]+@[^@\s?&#/]+\.[^@\s?&#/]+$/.test(v || '');
const mailto = (email, q = '') => (validEmail(email) ? 'mailto:' + encodeURIComponent(email).replace('%40', '@') + q : null);
const empty = (ic, text) => $e('div', { class: 'empty' }, icon(ic), text);

// ---------- תגיות סטטוס ותפריט בחירה ----------
const STATUS = { new: ['טרם התחיל', 'var(--c-gray)'], progress: ['בתהליך מילוי', 'var(--c-orange)'], review: ['ממתין לאישור', 'var(--c-purple)'], approved: ['הושלם · נקלט', 'var(--c-green)'] };
let openMenu = null;
function closeMenu() { openMenu?.remove(); openMenu = null; }
document.addEventListener('pointerdown', (ev) => { if (openMenu && !openMenu.contains(ev.target)) closeMenu(); }, true);
document.addEventListener('keydown', (ev) => ev.key === 'Escape' && closeMenu());
addEventListener('scroll', closeMenu, true);
addEventListener('resize', closeMenu);
// items: { label, sc, icon, disabled, title, on, run } | 'hr' | { header }
function menu(anchor, items) {
  closeMenu();
  const m = $e('div', { class: 'menu', role: 'menu' }, items.map((it) => {
    if (it === 'hr') return $e('hr');
    if (it.header) return $e('div', { class: 'mh', text: it.header });
    return $e('button', { class: 'opt', role: 'menuitem', disabled: !!it.disabled, title: it.title || '', onclick: () => { closeMenu(); it.run && it.run(); } },
      it.sc ? $e('span', { class: 'sw', style: '--sc:' + it.sc }, it.label, it.on ? ' ✓' : '') : [it.icon ? icon(it.icon) : null, it.label]);
  }));
  document.body.append(m);
  const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
  m.style.top = (r.bottom + h + 8 > innerHeight && r.top - h - 6 > 0 ? r.top - h - 6 : r.bottom + 6) + 'px';
  openMenu = m;
  m.querySelector('.opt:not(:disabled)')?.focus();
}
const pill = (label, sc, opts = {}) => $e('button', { class: 'st' + (opts.sm ? ' sm' : '') + (opts.run ? '' : ' static'), style: '--sc:' + sc, type: 'button', title: opts.title || '', onclick: opts.run ? (ev) => { stop(ev); opts.run(ev.currentTarget); } : null }, label, opts.run ? icon('chevron') : null);
// סטטוס קליטה: new/progress/review נקבעים אוטומטית מהתקדמות המועמד; משאבי אנוש מעבירים ל"נקלט" או מבטלים קליטה
function statusPill(e, after) {
  const [label, sc] = STATUS[e.status];
  return pill(label, sc, { run: (a) => menu(a, [{ header: 'סטטוס קליטה' },
    ...Object.entries(STATUS).map(([k, [l, c]]) => ({ label: l, sc: c, on: k === e.status,
      disabled: k === e.status || !(k === 'approved' && e.status === 'review') && !(k === 'review' && e.status === 'approved'),
      title: k === 'approved' ? (e.status === 'review' ? 'אישור התיק וקליטת העובד' : 'אפשר לקלוט רק אחרי שהמועמד שלח את התיק') : k === 'review' && e.status === 'approved' ? 'ביטול הקליטה והחזרה לבדיקה' : 'מתעדכן אוטומטית לפי התקדמות המועמד',
      run: () => (k === 'approved' ? hire(e, after) : unhire(e, after)) })),
    'hr', { label: 'פתיחת התיק', icon: 'eye', run: () => employeeDetail(e.id) }, { label: 'העתקת קישור אישי', icon: 'copy', run: () => copy(empUrl(e.token)) }]) });
}

// ---------- עדכונים בזמן אמת ----------
let es = null, liveOn = false, livePending = false;
const liveDot = () => $e('span', { class: 'live' + (liveOn ? ' on' : ''), title: liveOn ? 'הנתונים מתעדכנים בזמן אמת' : 'מתחבר מחדש...' }, $e('i'), $e('span', { text: liveOn ? 'עדכון חי' : 'לא מחובר' }));
function connectLive() {
  if (es) es.close();
  es = new EventSource('/api/events');
  const paint = () => document.querySelectorAll('.live').forEach((n) => n.replaceWith(liveDot()));
  es.onopen = () => { liveOn = true; paint(); };
  es.onerror = () => { liveOn = false; paint(); if (!me) es.close(); };
  es.onmessage = () => liveRefresh(true);
}
// לא מרנדרים מחדש באמצע הקלדה, כשחלון או תפריט פתוחים; מנסים שוב כשהמשתמש מסיים
function liveRefresh(fromEvent) {
  if (!me) return;
  // חלון פרטי הודעה מתעדכן רק כשמגיע אירוע אמיתי, לא בניסיונות החוזרים
  if (fromEvent && view !== 'messages') msgModalRefresh?.();
  const a = document.activeElement, typing = a?.tagName === 'TEXTAREA' || (a?.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(a.type));
  const userBusy = document.querySelector('.modal') || openMenu || typing;
  if (userBusy && view !== 'messages') { if (!livePending) { livePending = true; setTimeout(() => { livePending = false; liveRefresh(); }, 1500); } return; }
  const y = scrollY;
  const done = view === 'detail' && detailId ? employeeDetail(detailId, true) : view === 'messages' ? refreshHistory() : ['pipeline', 'directory', 'exemptions'].includes(view) ? go(true) : refreshMeta();
  Promise.resolve(done).then(() => scrollTo(0, y)).catch(() => {});
}

// ---------- כניסה ----------
function showLogin() {
  root.textContent = '';
  const u = $e('input', { type: 'text', autocomplete: 'username', dir: 'ltr' }), p = $e('input', { type: 'password', autocomplete: 'current-password', dir: 'ltr' });
  const btn = $e('button', { class: 'btn', style: 'width:100%;margin-top:22px', text: 'כניסה' });
  const go = guard(() => busy(btn, async () => { await api('/login', 'POST', { username: u.value, password: p.value }); me = await api('/me'); await afterLogin(); }));
  btn.addEventListener('click', go);
  p.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  root.append($e('div', { class: 'login card fade' }, $e('div', { class: 'brand', style: 'padding:0 0 18px' }, $e('div', { class: 'logo', text: 'EH' }), $e('div', {}, $e('b', { text: 'EasyHire' }), $e('small', { text: 'קליטה וניהול עובדים' }))),
    $e('h2', { style: 'margin:0 0 4px', text: 'כניסה למערכת' }), $e('p', { class: 'muted', style: 'margin:0', text: 'הזינו את פרטי המשתמש שקיבלתם ממשאבי אנוש.' }),
    $e('label', { class: 'f', text: 'שם משתמש' }), u, $e('label', { class: 'f', text: 'סיסמה' }), p, btn));
  u.focus();
}

// ---------- מעטפת ----------
function loading() {
  const c = root.querySelector('.content');
  if (c) { c.textContent = ''; c.append($e('div', { class: 'loadbox' }, icon('loader'), 'טוען...')); }
}
const activeCount = () => list.filter((e) => e.status === 'approved').length;
function shell({ title, sub, actions = [] }, ...body) {
  root.textContent = '';
  const navTo = (k) => { view = k; navOpen = false; go(); };
  const section = view === 'detail' ? (list.find((e) => e.id === detailId)?.status === 'approved' ? 'directory' : 'pipeline') : view;
  const item = (k, ic, label, extra) => $e('button', { class: 'nitem' + (section === k ? ' on' : ''), icon: ic, onclick: () => navTo(k) }, $e('span', { text: label }), extra);
  const cnt = (n) => $e('span', { class: 'cnt', text: n });
  const app = $e('div', { class: 'app' + (navOpen ? ' nav-open' : '') },
    $e('aside', { class: 'side noprint' },
      $e('div', { class: 'brand' }, $e('div', { class: 'logo', text: 'EH' }), $e('div', { style: 'min-width:0' }, $e('b', { text: 'EasyHire' }), $e('small', { text: me.company || '', title: me.company || '' }))),
      $e('nav', { class: 'navsec' },
        $e('h6', { text: 'קליטה' }),
        item('pipeline', 'kanban', 'לוח קליטה', cnt(list.length - activeCount())),
        item('exemptions', 'shield', 'אישורי פטור', pendingEx ? $e('span', { class: 'badge', text: pendingEx }) : null),
        item('templates', 'file', 'סל טפסים', cnt(tplCount)),
        $e('h6', { text: 'עובדים' }),
        item('directory', 'briefcase', 'עובדים פעילים', cnt(activeCount())),
        item('messages', 'megaphone', 'מרכז הודעות'),
        $e('h6', { text: 'כלים' }),
        item('sim', 'phone', 'סימולטור נייד'),
        item('settings', 'settings', 'הגדרות')),
      $e('div', { class: 'sidefoot' }, avatar(me.name || me.username), $e('div', { class: 'who' }, $e('b', { text: me.name || me.username }), liveDot()),
        $e('button', { class: 'qb', title: 'יציאה', icon: 'logout', onclick: async () => { await api('/logout', 'POST'); me = null; es?.close(); showLogin(); } }))),
    $e('div', { class: 'scrim', onclick: () => { navOpen = false; app.classList.remove('nav-open'); } }),
    $e('div', { class: 'main' },
      $e('header', { class: 'topbar noprint' },
        $e('button', { class: 'qb burger', title: 'תפריט', icon: 'menu', onclick: () => { navOpen = !navOpen; app.classList.toggle('nav-open', navOpen); } }),
        $e('div', { style: 'min-width:0' }, $e('h1', { text: title }), sub ? $e('div', { class: 'sub', text: sub }) : null),
        $e('span', { class: 'sp' }), actions),
      $e('div', { class: 'content' + (quietRender ? '' : ' fade') }, body)));
  root.append(app);
  quietRender = false;
}
async function refreshMeta() {
  const [l, ex, t, g] = await Promise.all([api('/employees'), api('/exemptions'), api('/templates'), api('/groups')]);
  list = l; groups = g; pendingEx = ex.filter((x) => x.status === 'pending').length; tplCount = t.length;
  return { ex, t };
}
const VIEWS = () => ({ pipeline: pipelineView, directory: directoryView, messages: messagesView, exemptions: exemptionsView, templates: templatesView, sim: simView, settings: settingsView, detail: () => employeeDetail(detailId) });
function go(quiet) { if (view !== 'detail') detailId = null; quietRender = !!quiet; renderSeq++; closeMenu(); if (!quiet) loading(); return VIEWS()[view](); }
async function afterLogin() { cfg.capacity = me.capacity || 180; view = 'pipeline'; await refreshMeta(); go(); connectLive(); }
async function start() { const r = await fetch('/api/me').then((r) => r.json()); if (r.anonymous) showLogin(); else { me = r; await afterLogin(); } }
const newBtn = () => $e('button', { class: 'btn hdr', icon: 'userPlus', onclick: newEmployee }, $e('span', { class: 'bl', text: 'מועמד חדש' }));
const kpi = (ic, sc, label, n, sub, opts = {}) => $e(opts.run ? 'button' : 'div', { class: 'kpi' + (opts.on ? ' on' : ''), type: opts.run ? 'button' : null, onclick: opts.run || null },
  $e('div', { class: 'top' }, $e('span', { class: 'ic', style: 'background:color-mix(in srgb,' + sc + ' 16%,#fff);color:' + sc }, icon(ic)), label),
  $e('div', { class: 'n', text: n }), sub ? $e('small', { text: sub }) : null,
  opts.bar != null ? $e('div', { class: 'bar ok' }, $e('i', { style: 'width:' + opts.bar + '%;background:' + sc })) : null);
const viewSwitch = (cur, onPick, modes = [['table', 'list', 'טבלה'], ['kanban', 'kanban', 'קנבן']]) => {
  const sw = $e('div', { class: 'vsw', role: 'tablist' }, modes.map(([k, ic, label]) => $e('button', { class: cur === k ? 'on' : '', role: 'tab', 'aria-selected': String(cur === k), icon: ic,
    onclick: (ev) => { sw.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b === ev.currentTarget); b.setAttribute('aria-selected', String(b === ev.currentTarget)); }); onPick(k); } }, $e('span', { text: label }))));
  return sw;
};
const search = (value, ph) => { const i = $e('input', { type: 'search', value, placeholder: ph }); return [$e('div', { class: 'srch' }, icon('search'), i), i]; };

// ---------- לוח קליטה ----------
const progress = (e) => { const pct = e.total ? Math.round(100 * e.done / e.total) : 0; return $e('div', {}, $e('div', { class: 'row', style: 'justify-content:space-between;gap:4px;font-size:.78rem' }, $e('span', { class: 'muted', text: e.done + '/' + e.total + ' טפסים' }), $e('b', { style: 'font-weight:600', text: pct + '%' })), $e('div', { class: 'bar' + (pct === 100 ? ' ok' : ''), style: 'margin-top:4px' }, $e('i', { style: 'width:' + pct + '%' }))); };
const quickActions = (e, after) => $e('div', { class: 'quick', onclick: stop },
  $e('button', { class: 'qb', title: 'העתקת קישור אישי', icon: 'copy', onclick: () => copy(empUrl(e.token)) }),
  e.phone ? $e('a', { class: 'qb wa', title: 'שליחת הקישור בוואטסאפ', target: '_blank', rel: 'noopener', href: waLink(e), icon: 'whatsapp' }) : null,
  $e('button', { class: 'qb', title: 'עוד פעולות', icon: 'more', onclick: (ev) => menu(ev.currentTarget, [
    { label: 'פתיחת התיק', icon: 'eye', run: () => employeeDetail(e.id) },
    { label: 'צפייה בסימולטור', icon: 'phone', run: () => { simTarget = e.token; simDevice = 'phone'; view = 'sim'; go(); } },
    { label: 'קישור אישי ושליחה', icon: 'link', run: () => linkModal(e) }, 'hr',
    { label: 'מחיקת המועמד', icon: 'trash', run: guard(async () => { if (confirm('למחוק את ' + e.full_name + ' וכל הנתונים והקבצים שלו? לא ניתן לשחזר.')) { await api('/employees/' + e.id, 'DELETE'); toast('נמחק ✓'); after(); } }) }]) }));

async function pipelineView() {
  const seq = renderSeq;
  await refreshMeta();
  if (seq !== renderSeq || view !== 'pipeline') return; // המשתמש עבר למסך אחר בזמן הטעינה
  const n = (s) => list.filter((e) => e.status === s).length;
  const [srch, q] = search(flt.q, 'חיפוש לפי שם, ת.ז., טלפון...');
  const depts = [...new Set(list.map((e) => e.department).filter(Boolean))].sort();
  const fd = $e('select', { 'aria-label': 'מחלקה' }, $e('option', { value: '', text: 'כל המחלקות' }), depts.map((d) => $e('option', { value: d, text: d })));
  fd.value = depts.includes(flt.d) ? flt.d : '';
  const board = $e('div');
  const filtered = () => { const s = q.value.trim().toLowerCase(); return list.filter((e) => (!s || [e.full_name, e.phone, e.email, e.id_number, e.job_title].join(' ').toLowerCase().includes(s)) && (!flt.s || e.status === flt.s) && (!fd.value || e.department === fd.value)); };
  const ORDER = ['review', 'progress', 'new', 'approved'];
  const row = (e) => $e('tr', { onclick: () => employeeDetail(e.id) },
    $e('td', { style: 'min-width:210px' }, who(e.full_name, [e.id_number && 'ת.ז. ' + e.id_number, e.phone].filter(Boolean).join(' · '))),
    $e('td', { class: 'c' }, statusPill(e, pipelineView)),
    $e('td', {}, $e('div', { text: e.job_title || '—' }), $e('small', { class: 'muted', text: e.department || '' })),
    $e('td', { style: 'min-width:150px' }, progress(e)),
    $e('td', { style: 'white-space:nowrap' }, $e('span', { class: 'muted', text: e.opened ? ago(e.last_activity) : 'הקישור טרם נפתח' }),
      e.mail_status === 'failed' ? $e('small', { style: 'display:block;color:var(--err)', text: 'שליחת התיק ליפעת נכשלה' }) : null),
    $e('td', {}, quickActions(e, pipelineView)));
  const draw = () => {
    flt.q = q.value; flt.d = fd.value;
    board.textContent = '';
    const items = filtered();
    if (boardMode === 'kanban') {
      board.append($e('div', { class: 'kanban', style: '--cols:4' }, ['new', 'progress', 'review', 'approved'].map((k) => {
        const [label, sc] = STATUS[k], col = items.filter((e) => e.status === k);
        return $e('div', { class: 'kcol' }, $e('h4', { style: '--sc:' + sc }, $e('span', { text: label }), $e('span', { text: col.length })),
          $e('div', { class: 'kbody' }, col.length ? col.map((e) => $e('div', { class: 'kc', onclick: () => employeeDetail(e.id) },
            who(e.full_name, [e.job_title, e.department].filter(Boolean).join(' · ') || e.phone),
            $e('div', { style: 'margin-top:10px' }, progress(e)),
            $e('div', { class: 'meta' }, $e('span', { text: e.opened ? ago(e.last_activity) : 'טרם נפתח' }), quickActions(e, pipelineView)))) : $e('p', { class: 'muted', style: 'text-align:center;font-size:.85rem;margin:24px 0', text: 'אין מועמדים' })));
      })));
      return;
    }
    const wrap = $e('div', { class: 'groups' });
    ORDER.filter((k) => !flt.s || k === flt.s).forEach((k) => {
      const [label, sc] = STATUS[k], rows = items.filter((e) => e.status === k);
      if (!rows.length && (q.value || fd.value)) return;
      const g = $e('section', { class: 'grp' + (collapsed.has(k) ? ' closed' : ''), style: '--gc:' + sc },
        $e('button', { class: 'grp-h', 'aria-expanded': !collapsed.has(k), onclick: () => { collapsed.has(k) ? collapsed.delete(k) : collapsed.add(k); g.classList.toggle('closed'); } }, icon('chevron'), label, $e('small', { text: rows.length + ' מועמדים' })),
        $e('div', { class: 'tbl' }, rows.length ? $e('table', {}, $e('thead', {}, $e('tr', {}, ['מועמד/ת', 'סטטוס', 'תפקיד ומחלקה', 'התקדמות', 'עדכון אחרון', ''].map((h) => $e('th', { text: h })))), $e('tbody', {}, rows.map(row)))
          : empty('inbox', k === 'review' ? 'אין תיקים שממתינים לאישור' : 'אין מועמדים בשלב הזה')));
      wrap.append(g);
    });
    if (!wrap.children.length) wrap.append(empty('search', list.length ? 'לא נמצאו תוצאות' : 'עדיין לא נוספו מועמדים. לחצו "מועמד חדש" או שלחו את קישור ההרשמה.'));
    board.append(wrap);
  };
  q.addEventListener('input', draw); fd.addEventListener('input', draw); draw();
  const filterBy = (s) => () => { flt.s = flt.s === s ? '' : s; pipelineView(); };
  const cap = cfg.capacity, appr = n('approved');
  shell({ title: 'לוח קליטה', sub: 'מעקב חי אחר מילוי טפסים, חתימות ואישורים',
    actions: [$e('button', { class: 'btn sec hdr', icon: 'link', title: 'העתקת קישור ההרשמה למועמדים', onclick: () => copy(location.origin + '/apply') }, $e('span', { class: 'bl', text: 'קישור הרשמה' })), newBtn()] },
    $e('div', { class: 'kpis' },
      kpi('users', 'var(--c-blue)', 'כל המועמדים', list.length, 'מתוך ' + cap + ' מתוכננים', { bar: Math.min(100, 100 * list.length / cap), run: filterBy(''), on: !flt.s }),
      kpi('clock', 'var(--c-orange)', 'בתהליך מילוי', n('progress'), n('new') + ' טרם התחילו', { run: filterBy('progress'), on: flt.s === 'progress' }),
      kpi('search', 'var(--c-purple)', 'ממתינים לאישור', n('review'), 'שלחו תיק מלא לבדיקה', { run: filterBy('review'), on: flt.s === 'review' }),
      kpi('userCheck', 'var(--c-green)', 'נקלטו', appr, (list.length ? Math.round(100 * appr / list.length) : 0) + '% מהמועמדים', { run: filterBy('approved'), on: flt.s === 'approved' })),
    $e('div', { class: 'board' },
      $e('div', { class: 'tools' }, srch, fd, flt.s ? $e('button', { class: 'gchip on', style: '--gc:' + STATUS[flt.s][1], onclick: filterBy(flt.s) }, STATUS[flt.s][0], ' ✕') : null, $e('span', { class: 'sp' }),
        viewSwitch(boardMode, (k) => { boardMode = k; setPref('boardMode', k); draw(); }),
        $e('a', { class: 'btn ghost sm', href: '/api/export.csv', icon: 'download', text: 'ייצוא' })),
      board));
}

function linkModal(e) {
  const url = empUrl(e.token);
  const m = modal($e('div', {}, $e('h2', { text: 'קישור אישי ל' + e.full_name }),
    $e('p', { class: 'muted', text: 'הקישור אישי וסודי. כל מי שמחזיק בו יכול למלא את הטפסים של המועמד.' }),
    $e('div', { class: 'linkbox', text: url }),
    $e('div', { class: 'row', style: 'margin-top:14px' },
      $e('button', { class: 'btn', icon: 'copy', text: 'העתקת קישור', onclick: () => copy(url) }),
      e.phone ? $e('a', { class: 'btn sec', href: waLink(e), target: '_blank', rel: 'noopener', icon: 'whatsapp', text: 'וואטסאפ' }) : null,
      mailto(e.email) ? $e('a', { class: 'btn sec', href: mailto(e.email, '?subject=' + encodeURIComponent('טפסי קליטה') + '&body=' + encodeURIComponent('שלום, אנא מלאו את טפסי הקליטה בקישור:\n' + url)), icon: 'mail', text: 'מייל' }) : null,
      $e('span', { class: 'sp' }), $e('button', { class: 'btn ghost', text: 'סגירה', onclick: () => m.remove() }))));
}

const empForm = (e) => {
  const f = {};
  const mk = (k, label, type = 'text', extra = {}) => { f[k] = $e('input', { type, value: e?.[k] || '', ...extra }); return $e('div', {}, $e('label', { class: 'f', text: label }), f[k]); };
  f.gender = $e('select', {}, $e('option', { value: '', text: 'בחרו...' }), $e('option', { value: 'female', text: 'אישה' }), $e('option', { value: 'male', text: 'גבר' })); f.gender.value = e?.gender || '';
  const depts = [...new Set(list.map((x) => x.department).filter(Boolean))];
  const two = (...k) => $e('div', { class: 'pgrid', style: 'gap:0 12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))' }, k);
  const node = $e('div', {}, mk('full_name', 'שם מלא *'),
    two(mk('id_number', 'תעודת זהות'), $e('div', {}, $e('label', { class: 'f', text: 'מגדר * (קובע את טופס המשטרה)' }), f.gender)),
    two(mk('phone', 'טלפון נייד', 'tel'), mk('email', 'דוא"ל', 'email')),
    two(mk('job_title', 'תפקיד'), mk('department', 'מחלקה / מקום עבודה', 'text', { list: 'deptlist' })),
    two(mk('employee_no', 'מספר עובד'), mk('start_date', 'תאריך תחילת עבודה', 'date')),
    $e('datalist', { id: 'deptlist' }, depts.map((d) => $e('option', { value: d }))));
  return { node, vals: () => Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value])) };
};
async function newEmployee() {
  const tpls = await api('/templates'); const form = empForm(null);
  const checks = tpls.map((t) => { const c = $e('input', { type: 'checkbox' }); c.checked = !!t.is_default; return [t, c]; });
  const m = modal($e('div', {}, $e('h2', { text: 'מועמד/ת חדש/ה' }), form.node,
    $e('label', { class: 'f', text: 'טפסים לשליחה' }), $e('div', { class: 'checks' }, checks.map(([t, c]) => $e('label', {}, c, t.title, t.gender_rule === 'male' ? $e('span', { class: 'chip gray', text: 'גברים בלבד' }) : null))),
    $e('p', { class: 'muted', style: 'font-size:.85rem', text: 'טפסים המיועדים לגברים בלבד יוקצו רק למי שסומן כגבר.' }),
    $e('div', { class: 'row', style: 'margin-top:18px' },
      $e('button', { class: 'btn', text: 'יצירה וקבלת קישור', onclick: guard(async (ev) => {
        const e = await busy(ev.currentTarget, () => api('/employees', 'POST', { ...form.vals(), template_ids: checks.filter(([, c]) => c.checked).map(([t]) => t.id) }));
        m.remove(); toast('המועמד נוצר ✓'); view = 'pipeline'; await go(); linkModal(e);
      }) }), $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))));
}

async function hire(e, after) {
  if (!confirm('לקלוט את ' + e.full_name + ' כעובד/ת פעיל/ה? כל הטפסים יסומנו כמאושרים והעובד/ת יעברו לספריית העובדים הפעילים.')) return;
  try { await api('/employees/' + e.id + '/hire', 'POST', {}); toast(e.full_name + ' נקלט/ה ועבר/ה לעובדים הפעילים ✓'); after(); } catch (err) { toast(err.message, true); }
}
async function unhire(e, after) {
  if (!confirm('לבטל את הקליטה של ' + e.full_name + ' ולהחזיר לבדיקה? גם האישורים של הטפסים והמסמכים יבוטלו.')) return;
  try { await api('/employees/' + e.id + '/hire', 'POST', { undo: true }); toast('הקליטה בוטלה'); after(); } catch (err) { toast(err.message, true); }
}

// ---------- תיק עובד ----------
// מסמך בתיק: תמונה מוקטנת, צפייה ואישור פרטני
function fileNode(fl, empId, submitted) {
  const img = fl.mime && fl.mime.startsWith('image/');
  const btn = submitted ? $e('button', { class: 'btn sm ' + (fl.approved ? 'ok' : 'ghost'), icon: 'check', text: fl.approved ? 'מסמך אושר' : 'אישור מסמך',
    onclick: guard(async () => { await busy(btn, () => api('/files/' + fl.id + '/approve', 'POST', { approved: !fl.approved })); employeeDetail(empId, true); }) }) : null;
  return $e('div', { class: 'fnode' + (fl.approved ? ' ok' : '') },
    $e('a', { href: '/api/files/' + fl.id, target: '_blank', class: 'th', title: 'פתיחה בחלון חדש' }, img ? $e('img', { src: '/api/files/' + fl.id, alt: '', loading: 'lazy' }) : icon('file')),
    $e('a', { href: '/api/files/' + fl.id, target: '_blank', class: 'fn', text: fl.filename || 'קובץ' }), btn);
}
async function employeeDetail(id, silent) {
  // רענון שקט רלוונטי רק אם עדיין מסתכלים על אותו עובד; פתיחה רגילה מבטלת רינדורים ישנים
  if (silent && (view !== 'detail' || detailId !== id)) return;
  const seq = silent ? renderSeq : ++renderSeq;
  if (!silent) { if (detailId !== id) detailTab = ''; view = 'detail'; detailId = id; closeMenu(); loading(); }
  let d, tpls, msgs;
  try { [d, tpls, msgs] = await Promise.all([api('/employees/' + id), api('/templates'), api('/employees/' + id + '/messages'), refreshMeta()]); }
  catch (err) { if (seq !== renderSeq) return; if (silent) { view = 'pipeline'; return go(); } throw err; }
  if (seq !== renderSeq || view !== 'detail' || detailId !== id) return;
  if (silent) quietRender = true;
  const e = d.employee, refresh = () => employeeDetail(id, true);
  const active = e.status === 'approved';
  if (!detailTab) detailTab = active ? 'overview' : 'forms';
  const back = active ? 'directory' : 'pipeline';

  // --- לשונית טפסים ומסמכים ---
  const cards = d.assignments.map((a) => {
    const t = a.template, ok = a.status === 'submitted';
    const fileMap = {}; a.files.forEach((f) => fileMap[f.field_key] = f);
    const dl = $e('dl', { class: 'ans' });
    t.fields.forEach((f) => {
      if (['heading', 'paragraph', 'document'].includes(f.type)) return;
      const v = a.data[f.key]; let node;
      if (f.type === 'signature') node = v ? $e('img', { class: 'sigimg', src: v, alt: 'חתימה' }) : $e('span', { class: 'muted', text: '—' });
      else if (f.type === 'file') node = fileMap[f.key] ? fileNode(fileMap[f.key], id, ok) : a.exemptions[f.key] ? $e('span', { class: 'chip', text: 'פטור (' + ({ approved: 'אושר', rejected: 'נדחה', pending: 'ממתין' })[a.exemptions[f.key].status] + '): ' + a.exemptions[f.key].reason }) : $e('span', { class: 'muted', text: '—' });
      else if (f.type === 'consent') node = v ? $e('span', { class: 'okt', icon: 'check', text: 'אושר' }) : document.createTextNode('—');
      else node = document.createTextNode(v || '—');
      dl.append($e('dt', { text: f.label }), $e('dd', {}, node));
    });
    return $e('div', { class: 'card fcard', id: 'a' + a.id },
      $e('div', { class: 'row' }, $e('h3', { style: 'margin:0', text: t.title }), $e('span', { class: 'chip' + (ok ? ' ok' : ''), text: ok ? 'הוגש ' + fmt(a.submitted_at) : 'ממתין' }), a.approved ? $e('span', { class: 'chip ok', icon: 'check', text: 'אושר ע״י משאבי אנוש' }) : null, $e('span', { class: 'sp' }),
        ok ? $e('button', { class: 'btn sm noprint ' + (a.approved ? 'ghost' : 'sec'), icon: a.approved ? 'undo' : 'check', text: a.approved ? 'ביטול אישור' : 'אישור הטופס', onclick: guard(async () => { await api('/assignments/' + a.id + '/approve', 'POST', { approved: !a.approved }); refresh(); }) }) : null,
        $e('button', { class: 'qb noprint', title: 'עוד', icon: 'more', onclick: (ev) => menu(ev.currentTarget, [
          { label: 'פתיחה מחדש לעריכה', icon: 'undo', disabled: !ok, run: guard(async () => { if (confirm('לפתוח את הטופס לעריכה מחודשת על ידי העובד?')) { await api('/assignments/' + a.id + '/reopen', 'POST'); refresh(); } }) },
          { label: 'הסרת הטופס מהעובד', icon: 'trash', run: guard(async () => { if (confirm('להסיר את הטופס מהעובד? נתונים וקבצים יימחקו.')) { await api('/assignments/' + a.id, 'DELETE'); refresh(); } }) }]) })),
      $e('div', { style: 'margin-top:12px' }, Object.keys(a.data).length || a.files.length ? dl : $e('p', { class: 'muted', text: 'טרם מולא.' })));
  });
  const allFiles = d.assignments.flatMap((a) => a.files), filesOk = allFiles.filter((f) => f.approved).length;
  const allOk = d.assignments.length && d.assignments.every((a) => a.status === 'submitted');
  const hireBar = active
    ? $e('div', { class: 'hirebar noprint', style: 'background:var(--okbg)' }, $e('b', { class: 'okt', icon: 'checkCircle', text: 'נקלט/ה כעובד/ת פעיל/ה' }), $e('span', { class: 'muted', text: fmt(e.approved_at) + (e.approved_by ? ' · אושר ע״י ' + e.approved_by : '') }), $e('span', { class: 'sp' }),
      $e('button', { class: 'btn ghost sm', icon: 'undo', text: 'ביטול קליטה', onclick: () => unhire(e, refresh) }))
    : e.status === 'review'
      ? $e('div', { class: 'hirebar noprint', style: 'background:var(--purbg)' }, $e('div', {}, $e('b', { icon: 'search', text: 'התיק נשלח לבדיקה ' + fmt(e.submitted_at) }), $e('div', { class: 'muted', text: 'אושרו ' + e.approved + '/' + e.total + ' טפסים ו-' + filesOk + '/' + allFiles.length + ' מסמכים. אפשר לאשר כל מסמך בנפרד, או לקלוט ולאשר הכל בבת אחת.' }),
          e.pending_exemptions ? $e('div', { class: 'exwarn', icon: 'alert' }, e.pending_exemptions + ' בקשות פטור ממתינות להחלטה. ', $e('a', { href: '#', text: 'למסך אישורי הפטור', onclick: (ev) => { ev.preventDefault(); view = 'exemptions'; go(); } })) : null), $e('span', { class: 'sp' }),
        $e('button', { class: 'btn okb', icon: 'userCheck', text: 'אישור וקליטה', disabled: !!e.pending_exemptions, title: e.pending_exemptions ? 'יש להחליט על בקשות הפטור לפני הקליטה' : '', onclick: () => hire(e, refresh) }))
      : $e('div', { class: 'hirebar noprint', style: 'background:#f0f1f5' }, $e('span', { class: 'muted', text: allOk ? 'כל הטפסים הוגשו. ממתינים שהמועמד ילחץ "שליחה למשאבי אנוש".' : 'המועמד עדיין ממלא טפסים (' + e.done + '/' + e.total + '). כפתור הקליטה יופעל אחרי שהתיק יישלח.' }));
  const missing = tpls.filter((t) => !d.assignments.some((a) => a.template.id === t.id) && (t.gender_rule !== 'male' || e.gender === 'male'));
  const formsTab = () => [hireBar, cards,
    missing.length ? $e('div', { class: 'card noprint' }, $e('h3', { icon: 'plus', text: 'הוספת טפסים' }), (() => {
      const cs = missing.map((t) => [t, $e('input', { type: 'checkbox' })]);
      return $e('div', {}, $e('div', { class: 'checks' }, cs.map(([t, c]) => $e('label', {}, c, t.title))),
        $e('button', { class: 'btn sec', style: 'margin-top:8px', text: 'הוספה', onclick: guard(async () => { const ids = cs.filter(([, c]) => c.checked).map(([t]) => t.id); if (!ids.length) return; await api('/employees/' + id + '/assign', 'POST', { template_ids: ids }); refresh(); }) }));
    })()) : null];

  const tabs = [['overview', 'user', 'סקירה'], ['forms', 'file', 'טפסים ומסמכים (' + d.assignments.length + ')'], ['comms', 'megaphone', 'תקשורת (' + msgs.length + ')']];
  const body = $e('div');
  const paint = () => { body.textContent = ''; body.append(...[detailTab === 'overview' ? profileOverview(e, d, refresh, () => { detailTab = 'forms'; paint(); tabBar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.k === 'forms')); }) : detailTab === 'comms' ? commsTab(e, msgs) : formsTab()].flat().filter(Boolean)); };
  const tabBar = $e('div', { class: 'tabs noprint', role: 'tablist' }, tabs.map(([k, ic, label]) => $e('button', { class: 'tab' + (detailTab === k ? ' on' : ''), role: 'tab', 'data-k': k, icon: ic, text: label,
    onclick: (ev) => { detailTab = k; tabBar.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); paint(); } })));
  paint();
  shell({ title: active ? 'כרטיס עובד' : 'תיק מועמד', sub: active ? 'עובדים פעילים' : 'לוח קליטה',
    actions: [$e('button', { class: 'btn ghost sm', icon: 'back', text: 'חזרה', onclick: () => { view = back; go(); } })] },
    $e('div', { class: 'card' }, $e('div', { class: 'prof' }, avatar(e.full_name, true),
      $e('div', { style: 'flex:1;min-width:200px' }, $e('h2', { text: e.full_name }), $e('div', { class: 'muted', text: [e.job_title, e.department].filter(Boolean).join(' · ') || 'לא הוגדרו תפקיד ומחלקה' }),
        $e('div', { class: 'row', style: 'margin-top:8px;gap:6px' }, statusPill(e, refresh), active ? empStatusPill(e, refresh) : null, groupTags(e.groups))),
      $e('div', { class: 'row noprint' },
        $e('button', { class: 'btn', icon: 'send', text: 'שליחת הודעה', onclick: () => composeTo([e.id]) }),
        active ? null : $e('button', { class: 'btn sec', icon: 'link', text: 'קישור למועמד', onclick: () => linkModal(e) }),
        $e('button', { class: 'btn ghost', icon: 'pen', text: 'עריכה', onclick: () => editEmployee(e) }),
        $e('button', { class: 'btn ghost icon', title: 'עוד פעולות', icon: 'more', onclick: (ev) => menu(ev.currentTarget, [
          { label: 'הדפסה / PDF של התיק', icon: 'printer', run: () => open('/api/employees/' + id + '/package', '_blank') },
          { label: 'שליחה מחדש ליפעת', icon: 'mail', run: guard(async () => { const r = await api('/employees/' + id + '/resend-mail', 'POST'); toast(r.status === 'sent' ? 'נשלח בהצלחה ✓' : r.error || 'השליחה נכשלה', r.status !== 'sent'); refresh(); }) },
          'hr', { label: 'מחיקת העובד וכל הנתונים', icon: 'trash', run: guard(async () => { if (confirm('למחוק את העובד וכל הנתונים והקבצים שלו? לא ניתן לשחזר.')) { await api('/employees/' + id, 'DELETE'); view = back; go(); } }) }]) }))),
      e.mail_status && e.mail_status !== 'sent' ? $e('div', { class: 'notice', style: 'margin-top:14px' }, icon('alert'), e.mail_status === 'failed' ? 'שליחת התיק ליפעת נכשלה: ' + (e.mail_error || '') : 'התיק לא נשלח במייל כי שרת המייל לא הוגדר.') : null),
    tabBar, body);
}
function editEmployee(e) {
  const form = empForm(e);
  const m = modal($e('div', {}, $e('h2', { text: 'עריכת פרטים' }), form.node,
    $e('div', { class: 'row', style: 'margin-top:18px' }, $e('button', { class: 'btn', text: 'שמירה', onclick: guard(async () => { await api('/employees/' + e.id, 'PUT', form.vals()); m.remove(); toast('נשמר ✓'); employeeDetail(e.id, true); }) }),
      $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))));
}

// ---------- פטורים ----------
async function exemptionsView() {
  const seq = renderSeq;
  const { ex } = await refreshMeta();
  if (seq !== renderSeq || view !== 'exemptions') return;
  const rows = ex.map((x) => $e('div', { class: 'exrow' },
    $e('div', { style: 'flex:1;min-width:240px' }, who(x.employee, x.template + ' · ' + x.field), $e('div', { style: 'margin-top:6px', text: 'סיבה: ' + x.reason }), $e('small', { class: 'muted', text: fmt(x.at) })),
    x.status === 'pending' ? $e('div', { class: 'row' },
      $e('button', { class: 'btn okb sm', icon: 'check', text: 'אישור פטור', onclick: guard(async () => { await api('/exemptions/' + x.assignment_id + '/decide', 'POST', { field: x.field_key, decision: 'approved' }); exemptionsView(); }) }),
      $e('button', { class: 'btn ghost sm', icon: 'x', text: 'דחייה (יתבקש להעלות)', onclick: guard(async () => { await api('/exemptions/' + x.assignment_id + '/decide', 'POST', { field: x.field_key, decision: 'rejected' }); exemptionsView(); }) }))
      : pill(x.status === 'approved' ? 'אושר' : 'נדחה', x.status === 'approved' ? 'var(--c-green)' : 'var(--c-red)', { sm: true }),
    $e('button', { class: 'btn sec sm', text: 'פתיחת תיק', onclick: () => employeeDetail(x.employee_id) })));
  shell({ title: 'אישורי פטור ממסמך', sub: 'מועמדים שאין להם מסמך מסוים מבקשים פטור עם סיבה' },
    $e('div', { class: 'card' }, rows.length ? rows : empty('shield', 'אין בקשות פטור כרגע')));
}

// ---------- סל טפסים ----------
const TYPES = { text: 'טקסט קצר', textarea: 'טקסט ארוך', number: 'מספר', date: 'תאריך', phone: 'טלפון', email: 'דוא"ל', idnumber: 'תעודת זהות', select: 'רשימה נפתחת', radio: 'בחירה יחידה', consent: 'תיבת אישור', file: 'העלאת קובץ / צילום', signature: 'חתימה', heading: 'כותרת', paragraph: 'פסקת טקסט (נוסח הצהרה)' };
const CATS = ['פרטים אישיים ושכר', 'בטחון ומשטרה', 'העסקה והסכמים', 'מסמכים', 'כללי'];
const ICONS = { 'בטחון ומשטרה': 'shield', 'פרטים אישיים ושכר': 'idcard', 'העסקה והסכמים': 'pen', 'מסמכים': 'folder' };
async function templatesView() {
  const seq = renderSeq;
  const { t: tpls } = await refreshMeta();
  if (seq !== renderSeq || view !== 'templates') return;
  const cards = tpls.map((t, i) => {
    const flds = t.fields.filter((f) => !['heading', 'paragraph', 'document'].includes(f.type));
    return $e('div', { class: 'card tcard', onclick: () => editTemplate(t) },
      $e('div', { class: 'h' }, $e('div', { class: 'ic' }, icon(ICONS[t.category] || 'file')), $e('div', { class: 'chips' }, t.mandatory ? $e('span', { class: 'chip err', text: 'חובה' }) : $e('span', { class: 'chip gray', text: 'רשות' }), $e('span', { class: 'chip pri', text: t.category }), t.gender_rule === 'male' ? $e('span', { class: 'chip gray', text: 'גברים בלבד' }) : null)),
      $e('h3', { text: (i + 1) + '. ' + t.title }), $e('p', { text: t.description }),
      $e('div', { class: 'fl' }, 'שדות כלולים (' + flds.length + '):'),
      $e('div', { class: 'chips' }, flds.slice(0, 4).map((f) => $e('span', { class: 'chip gray', style: 'font-weight:500', text: f.label.slice(0, 26) })), flds.length > 4 ? $e('span', { class: 'chip gray', text: '+' + (flds.length - 4) + ' עוד' }) : null),
      $e('div', { class: 'f', onclick: stop },
        $e('span', { class: 'row', style: 'gap:2px' }, $e('button', { class: 'qb', title: 'מחיקה', icon: 'trash', onclick: guard(async () => { if (confirm('למחוק את הטופס "' + t.title + '"? (אם כבר הוקצה לעובדים הוא יוסתר ונתוני העבר יישמרו)')) { await api('/templates/' + t.id, 'DELETE'); templatesView(); } }) }),
          $e('button', { class: 'qb', title: 'הזזה למעלה', icon: 'up', disabled: i === 0, onclick: guard(async () => { await api('/templates/' + t.id + '/move', 'POST', { dir: 'up' }); templatesView(); }) }),
          $e('button', { class: 'qb', title: 'הזזה למטה', icon: 'down', disabled: i === tpls.length - 1, onclick: guard(async () => { await api('/templates/' + t.id + '/move', 'POST', { dir: 'down' }); templatesView(); }) })),
        $e('span', { class: 'row', style: 'gap:4px' }, icon('clock'), 'כ-' + Math.max(1, Math.round(flds.length / 4)) + ' דקות מילוי')));
  });
  shell({ title: 'סל טפסים', sub: 'הטפסים שכל מועמד ממלא מהנייד או מהמחשב. לחצו על טופס לעריכה.', actions: [$e('button', { class: 'btn hdr', icon: 'plus', onclick: () => editTemplate(null) }, $e('span', { class: 'bl', text: 'טופס חדש' }))] },
    $e('div', { class: 'cards' }, cards));
}
function editTemplate(t) {
  const model = t ? JSON.parse(JSON.stringify(t)) : { title: '', description: '', is_default: 1, mandatory: 1, category: 'כללי', gender_rule: 'all', fields: [] };
  const fieldsBox = $e('div');
  const title = $e('input', { type: 'text', value: model.title }), desc = $e('input', { type: 'text', value: model.description || '' });
  const cat = $e('select', {}, CATS.map((c) => $e('option', { value: c, text: c }))); cat.value = model.category;
  const gr = $e('select', {}, $e('option', { value: 'all', text: 'כל העובדים' }), $e('option', { value: 'male', text: 'גברים בלבד' })); gr.value = model.gender_rule || 'all';
  const def = $e('input', { type: 'checkbox' }); def.checked = !!model.is_default;
  const man = $e('input', { type: 'checkbox' }); man.checked = !!model.mandatory;
  const redraw = () => {
    fieldsBox.textContent = '';
    model.fields.forEach((f, i) => {
      if (f.type === 'document') { fieldsBox.append($e('div', { class: 'fb' }, $e('div', { class: 'r' }, $e('b', { icon: 'file', text: 'מסמך להצגה: ' + (f.label || f.doc) + ' (' + f.pages + ' עמ׳)' }), $e('span', { class: 'sp' }), $e('span', { class: 'muted', text: 'קבוע (צילום המסמך המקורי)' })))); return; }
      const isText = ['heading', 'paragraph'].includes(f.type);
      const lab = $e(f.type === 'paragraph' ? 'textarea' : 'input', { type: 'text', placeholder: f.type === 'paragraph' ? 'הטקסט להצגה' : 'שם השדה', style: 'flex:1;min-width:160px' });
      lab.value = f.type === 'paragraph' ? (f.text || '') : (f.label || '');
      lab.addEventListener('input', () => { if (f.type === 'paragraph') f.text = lab.value; else f.label = lab.value; });
      const ty = $e('select', { style: 'width:auto' }, Object.entries(TYPES).map(([k, v]) => $e('option', { value: k, text: v })));
      ty.value = f.type; ty.addEventListener('change', () => { f.type = ty.value; if (['select', 'radio'].includes(f.type) && !f.options) f.options = ['אפשרות 1', 'אפשרות 2']; if (f.type === 'signature' && !f.label) f.label = 'חתימה'; redraw(); });
      const req = $e('input', { type: 'checkbox' }); req.checked = !!f.required; req.addEventListener('change', () => f.required = req.checked);
      const ex = $e('input', { type: 'checkbox' }); ex.checked = !!f.allow_exempt; ex.addEventListener('change', () => f.allow_exempt = ex.checked);
      const box = $e('div', { class: 'fb' }, $e('div', { class: 'r' }, lab, ty,
        isText ? null : $e('label', { style: 'display:flex;gap:4px;align-items:center' }, req, 'חובה'),
        f.type === 'file' ? $e('label', { style: 'display:flex;gap:4px;align-items:center' }, ex, 'אפשר לבקש פטור') : null,
        $e('button', { class: 'qb', title: 'למעלה', icon: 'up', disabled: i === 0, onclick: () => { [model.fields[i - 1], model.fields[i]] = [model.fields[i], model.fields[i - 1]]; redraw(); } }),
        $e('button', { class: 'qb', title: 'למטה', icon: 'down', disabled: i === model.fields.length - 1, onclick: () => { [model.fields[i + 1], model.fields[i]] = [model.fields[i], model.fields[i + 1]]; redraw(); } }),
        $e('button', { class: 'qb', title: 'הסרת שדה', icon: 'x', onclick: () => { model.fields.splice(i, 1); redraw(); } })));
      if (['select', 'radio'].includes(f.type)) {
        const op = $e('input', { type: 'text', style: 'margin-top:8px', placeholder: 'אפשרויות מופרדות בפסיק', value: (f.options || []).join(', ') });
        op.addEventListener('input', () => f.options = op.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean)); box.append(op);
      }
      fieldsBox.append(box);
    });
    if (!model.fields.length) fieldsBox.append($e('p', { class: 'muted', text: 'עדיין אין שדות. הוסיפו שדה ראשון.' }));
  };
  redraw();
  const add = $e('select', { style: 'width:auto' }, $e('option', { value: '', text: '+ הוספת שדה...' }), Object.entries(TYPES).map(([k, v]) => $e('option', { value: k, text: v })));
  add.addEventListener('change', () => { if (!add.value) return; model.fields.push({ key: 'f' + Date.now().toString(36), type: add.value, label: add.value === 'signature' ? 'חתימה' : '', required: false, options: ['select', 'radio'].includes(add.value) ? ['אפשרות 1', 'אפשרות 2'] : undefined }); add.value = ''; redraw(); });
  const att = $e('input', { type: 'file', accept: 'application/pdf,image/*' });
  const m = modal($e('div', {}, $e('h2', { text: t ? 'עריכת טופס' : 'טופס חדש' }),
    $e('label', { class: 'f', text: 'שם הטופס *' }), title, $e('label', { class: 'f', text: 'תיאור קצר' }), desc,
    $e('div', { class: 'row', style: 'margin-top:12px' }, $e('div', { style: 'flex:1;min-width:180px' }, $e('label', { class: 'f', style: 'margin-top:0', text: 'קטגוריה' }), cat), $e('div', { style: 'flex:1;min-width:180px' }, $e('label', { class: 'f', style: 'margin-top:0', text: 'מיועד ל' }), gr)),
    $e('div', { class: 'checks', style: 'margin-top:10px' }, $e('label', {}, def, 'להקצות אוטומטית לכל מועמד חדש'), $e('label', {}, man, 'טופס חובה')),
    $e('label', { class: 'f', text: 'שדות הטופס' }), fieldsBox, add,
    t ? $e('div', {}, $e('label', { class: 'f', text: 'קובץ מצורף לעובד (למשל טופס PDF להורדה)' }), t.attachment ? $e('p', {}, icon('clip'), ' ' + t.attachment.name + ' ', $e('a', { href: '/api/templates/' + t.id + '/attachment', target: '_blank', text: 'צפייה' }), ' ',
      $e('button', { class: 'btn ghost sm', text: 'הסרה', onclick: guard(async () => { await api('/templates/' + t.id + '/attachment', 'DELETE'); m.remove(); templatesView(); }) })) : null, att) : $e('p', { class: 'muted', text: 'ניתן לצרף קובץ לאחר שמירת הטופס.' }),
    $e('div', { class: 'row', style: 'margin-top:22px' },
      $e('button', { class: 'btn', text: 'שמירה', onclick: guard(async () => {
        const body = { title: title.value, description: desc.value, is_default: def.checked ? 1 : 0, mandatory: man.checked ? 1 : 0, category: cat.value, gender_rule: gr.value, fields: model.fields };
        let id = t && t.id;
        if (t) await api('/templates/' + id, 'PUT', body); else id = (await api('/templates', 'POST', body)).id;
        if (att.files[0]) {
          const file = att.files[0], b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(file); });
          await api('/templates/' + id + '/attachment', 'POST', { filename: file.name, mime: file.type, data: b64 });
        }
        m.remove(); toast('נשמר ✓'); templatesView();
      }) }), $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))), true);
}

// ---------- סימולטור ----------
async function simView() {
  await refreshMeta();
  const sel = $e('select', { style: 'max-width:280px;width:auto' }, $e('option', { value: '', text: 'דף הרשמת מועמד (apply)' }), list.map((e) => $e('option', { value: e.token, text: e.full_name })));
  sel.value = simTarget;
  const url = () => simTarget ? '/e/' + simTarget : '/apply';
  const frame = $e('iframe', { src: url(), title: 'סימולטור' });
  const wrap = $e('div', { class: simDevice === 'phone' ? 'phone' : 'desk' }, frame);
  sel.addEventListener('change', () => { simTarget = sel.value; frame.src = url(); });
  shell({ title: 'סימולטור נייד', sub: 'כך המועמד רואה את התהליך. מילוי בסימולטור של מועמד קיים נשמר בתיק שלו.' },
    $e('div', { class: 'row', style: 'margin-bottom:16px' }, sel, $e('span', { class: 'sp' }),
      viewSwitch(simDevice, (k) => { simDevice = k; wrap.className = k === 'phone' ? 'phone' : 'desk'; }, [['phone', 'phone', 'נייד'], ['desk', 'monitor', 'מחשב']])),
    wrap);
}

// ---------- הגדרות ----------
async function settingsView() {
  const [users, s] = await Promise.all([api('/users'), api('/settings')]);
  const inp = (k, ph, type = 'text', dir = 'ltr') => $e('input', { type, value: s[k] ?? '', placeholder: ph || '', dir, disabled: (s.env_locked || []).includes(k) });
  const f = { hr_email: inp('hr_email', 'hr@example.com'), smtp_host: inp('smtp_host', 'smtp.gmail.com'), smtp_port: inp('smtp_port', '465'), smtp_user: inp('smtp_user', 'sender@gmail.com'), smtp_from: inp('smtp_from', 'קליטת עובדים <sender@gmail.com>'),
    smtp_pass: $e('input', { type: 'password', dir: 'ltr', placeholder: s.has_pass ? '•••••••• (שמורה, השאירו ריק כדי לא לשנות)' : 'סיסמת אפליקציה' }),
    company_name: inp('company_name', '', 'text', 'rtl'), company_line: inp('company_line', '', 'text', 'rtl'), capacity: inp('capacity', '180', 'number') };
  const apply = $e('input', { type: 'checkbox' }); apply.checked = s.apply_enabled;
  const pw = { current: $e('input', { type: 'password' }), next: $e('input', { type: 'password' }) };
  const nu = { username: $e('input', { type: 'text', dir: 'ltr', placeholder: 'שם משתמש (אנגלית)' }), name: $e('input', { type: 'text', placeholder: 'שם מלא' }), password: $e('input', { type: 'password', dir: 'ltr', placeholder: 'סיסמה (8+ תווים)' }) };
  const row = (label, el) => [$e('label', { class: 'f', text: label }), el];
  const save = guard(async () => { const b = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value])); b.apply_enabled = apply.checked; await api('/settings', 'PUT', b); toast('ההגדרות נשמרו ✓'); me.company = b.company_name; cfg.capacity = +b.capacity || 180; });
  shell({ title: 'הגדרות', sub: 'מייל, פרטי הארגון ומשתמשי המערכת' },
    $e('div', { class: 'pgrid' },
      $e('div', { class: 'card' }, $e('h3', { icon: 'mail', text: 'שרת מייל ושליחת תיקים' }),
        $e('p', { class: 'muted', style: 'margin-top:0', text: 'משמש לשליחת תיק הקליטה ליפעת ולהודעות לעובדים ממרכז ההודעות. ב-Gmail צריך סיסמת אפליקציה.' }),
        row('כתובת מייל של משאבי אנוש (היעד)', f.hr_email),
        $e('div', { class: 'row' }, $e('div', { style: 'flex:2;min-width:180px' }, row('שרת SMTP', f.smtp_host)), $e('div', { style: 'flex:1;min-width:90px' }, row('פורט', f.smtp_port))),
        $e('div', { class: 'row' }, $e('div', { style: 'flex:1;min-width:180px' }, row('משתמש SMTP', f.smtp_user)), $e('div', { style: 'flex:1;min-width:180px' }, row('סיסמה', f.smtp_pass))),
        row('שם ותצורת השולח (לא חובה)', f.smtp_from),
        (s.env_locked || []).length ? $e('p', { class: 'muted', text: 'חלק מהשדות נקבעים במשתני סביבה בשרת ולכן נעולים.' }) : null),
      $e('div', { class: 'card' }, $e('h3', { icon: 'building', text: 'פרטי הארגון והרשמה' }), row('שם הארגון', f.company_name), row('תת-כותרת', f.company_line), row('מספר העובדים המתוכנן', f.capacity),
        $e('label', { class: 'checks', style: 'display:flex;gap:8px;margin-top:14px;align-items:center' }, apply, 'לאפשר הרשמה עצמית של מועמדים בקישור /apply'),
        $e('div', { class: 'row', style: 'margin-top:18px' }, $e('button', { class: 'btn', text: 'שמירת הגדרות', onclick: save }),
          $e('button', { class: 'btn sec', icon: 'send', text: 'מייל בדיקה', onclick: guard(async () => { await save(); await api('/settings/test-mail', 'POST'); toast('מייל הבדיקה נשלח ✓'); }) }))),
      $e('div', { class: 'card' }, $e('h3', { icon: 'users', text: 'משתמשי מערכת (צוות משאבי אנוש)' }),
        $e('p', { class: 'muted', style: 'margin-top:0', text: 'כל משתמש נכנס עם שם וסיסמה משלו, וכולם עובדים במקביל על אותם נתונים.' }),
        users.map((u) => $e('div', { class: 'rrow' }, avatar(u.name || u.username), $e('div', { class: 'tx' }, $e('b', { text: u.name || u.username }), $e('small', { text: u.username })),
          u.username === me.username ? $e('span', { class: 'chip gray', text: 'אתם' }) : $e('button', { class: 'btn ghost sm', text: 'הסרה', onclick: guard(async () => { if (confirm('להסיר את המשתמש?')) { await api('/users/' + u.id, 'DELETE'); settingsView(); } }) }))),
        $e('h4', { style: 'margin:18px 0 8px', text: 'הוספת משתמש' }), $e('div', { class: 'row' }, nu.username, nu.name, nu.password),
        $e('button', { class: 'btn', style: 'margin-top:12px', text: 'הוספה', onclick: guard(async () => { await api('/users', 'POST', { username: nu.username.value, name: nu.name.value, password: nu.password.value }); toast('המשתמש נוסף ✓'); settingsView(); }) })),
      $e('div', { class: 'card' }, $e('h3', { icon: 'lock', text: 'החלפת סיסמה' }), row('סיסמה נוכחית', pw.current), row('סיסמה חדשה (8+ תווים)', pw.next),
        $e('button', { class: 'btn', style: 'margin-top:14px', text: 'עדכון', onclick: guard(async () => { await api('/password', 'POST', { current: pw.current.value, next: pw.next.value }); pw.current.value = pw.next.value = ''; toast('הסיסמה עודכנה ✓'); }) }))));
}
