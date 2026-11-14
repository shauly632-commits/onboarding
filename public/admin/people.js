/* EasyHire: ספריית העובדים הפעילים. עובד שהקליטה שלו אושרה עובר לכאן אוטומטית.
   סינון לפי מחלקה, סטטוס העסקה, ותק וקבוצות מותאמות; שיוך מרובה לקבוצות; קנבן לפי סטטוס העסקה עם גרירה */
const EMP_STATUS = { active: ['פעיל/ה', 'var(--c-green)'], leave: ['בחופשה', 'var(--c-blue)'], notice: ['בהודעה מוקדמת', 'var(--c-orange)'], ended: ['סיים/ה העסקה', 'var(--c-gray)'] };
const TENURE = { '': 'כל הוותק', new: 'עד 3 חודשים', year: '3–12 חודשים', mid: '1–3 שנים', senior: '3 שנים ומעלה' };
const GROUP_COLORS = ['#00c875', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#ff158a', '#9cd326', '#66ccff', '#784bd1', '#7f5347'];
const dflt = { q: '', d: '', es: '', t: '', g: 0, by: pref('dirGroupBy', 'department') };
let dirMode = pref('dirMode', 'table');
const selected = new Set();

const startOf = (e) => e.start_date || e.approved_at || e.created_at;
const months = (e) => { const s = new Date(startOf(e)); return Math.max(0, (Date.now() - s) / (30.44 * 864e5)); };
const tenureKey = (e) => { const m = months(e); return m < 3 ? 'new' : m < 12 ? 'year' : m < 36 ? 'mid' : 'senior'; };
function tenure(e) {
  const m = Math.floor(months(e)), y = Math.floor(m / 12), r = m % 12;
  if (m < 1) return 'חדש/ה';
  if (!y) return m === 1 ? 'חודש' : m + ' חודשים';
  return (y === 1 ? 'שנה' : y === 2 ? 'שנתיים' : y + ' שנים') + (r ? ' ו-' + r + ' ח׳' : '');
}
const groupById = (id) => groups.find((g) => g.id === id);
const groupTags = (ids = []) => ids.length ? $e('div', { class: 'gtags' }, ids.map(groupById).filter(Boolean).map((g) => $e('span', { class: 'gtag', style: '--gc:' + g.color, text: g.name }))) : null;
const setProfile = (e, body, after) => guard(async () => { await api('/employees/' + e.id + '/profile', 'POST', body); after(); })();
function empStatusPill(e, after, sm) {
  const [label, sc] = EMP_STATUS[e.employment_status] || EMP_STATUS.active;
  return pill(label, sc, { sm, title: 'סטטוס העסקה', run: (a) => menu(a, [{ header: 'סטטוס העסקה' },
    ...Object.entries(EMP_STATUS).map(([k, [l, c]]) => ({ label: l, sc: c, on: k === e.employment_status, disabled: k === e.employment_status,
      run: () => setProfile(e, { employment_status: k }, () => { toast(e.full_name + ': ' + l + ' ✓'); after(); }) }))]) });
}

// ---------- קבוצות ----------
function groupModal(g, after) {
  let color = g?.color || GROUP_COLORS[groups.length % GROUP_COLORS.length];
  const name = $e('input', { type: 'text', value: g?.name || '', placeholder: 'למשל: משמרת בוקר, צוות צפון, ותיקים', maxlength: 40 });
  const sw = $e('div', { class: 'swatches' }, GROUP_COLORS.map((c) => $e('button', { class: 'swatch' + (c === color ? ' on' : ''), style: '--gc:' + c, type: 'button', title: c, onclick: (ev) => { color = c; sw.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); } })));
  const m = modal($e('div', {}, $e('h2', { text: g ? 'עריכת קבוצה' : 'קבוצה חדשה' }),
    $e('p', { class: 'muted', style: 'margin-top:0', text: 'קבוצות עוזרות לסנן עובדים ולשלוח להם הודעות יחד. עובד יכול להיות בכמה קבוצות.' }),
    $e('label', { class: 'f', text: 'שם הקבוצה' }), name, $e('label', { class: 'f', text: 'צבע' }), sw,
    $e('div', { class: 'row', style: 'margin-top:22px' },
      $e('button', { class: 'btn', text: 'שמירה', onclick: guard(async (ev) => {
        const r = await busy(ev.currentTarget, () => (g ? api('/groups/' + g.id, 'PUT', { name: name.value, color }) : api('/groups', 'POST', { name: name.value, color })));
        m.remove(); toast('הקבוצה נשמרה ✓'); await refreshMeta(); await after(g ? g.id : r.id);
      }) }),
      g ? $e('button', { class: 'btn ghost', icon: 'trash', text: 'מחיקת הקבוצה', onclick: guard(async () => { if (!confirm('למחוק את הקבוצה "' + g.name + '"? העובדים עצמם לא יימחקו.')) return; await api('/groups/' + g.id, 'DELETE'); m.remove(); if (dflt.g === g.id) dflt.g = 0; toast('נמחקה'); after(); }) }) : null,
      $e('span', { class: 'sp' }), $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))));
  name.focus();
}
// עריכת הקבוצות של עובד אחד (מתוך הכרטיס)
function editGroups(e, after) {
  const cs = groups.map((g) => { const c = $e('input', { type: 'checkbox' }); c.checked = e.groups.includes(g.id); return [g, c]; });
  const m = modal($e('div', {}, $e('h2', { text: 'קבוצות של ' + e.full_name }),
    groups.length ? $e('div', { class: 'checks' }, cs.map(([g, c]) => $e('label', {}, c, $e('span', { class: 'gtag', style: '--gc:' + g.color, text: g.name })))) : $e('p', { class: 'muted', text: 'עדיין אין קבוצות.' }),
    $e('button', { class: 'gchip add', style: 'margin-top:10px', icon: 'plus', text: 'קבוצה חדשה', onclick: () => { const keep = cs.filter(([, c]) => c.checked).map(([g]) => g.id); m.remove(); groupModal(null, async (gid) => { await api('/employees/' + e.id + '/profile', 'POST', { group_ids: [...keep, gid] }); after(); }); } }),
    $e('div', { class: 'row', style: 'margin-top:20px' },
      $e('button', { class: 'btn', text: 'שמירה', onclick: guard(async () => { await api('/employees/' + e.id + '/profile', 'POST', { group_ids: cs.filter(([, c]) => c.checked).map(([g]) => g.id) }); m.remove(); toast('נשמר ✓'); after(); }) }),
      $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))));
}

// ---------- לשונית "סקירה" בכרטיס העובד ----------
function profileOverview(e, d, refresh, showForms) {
  const fact = (ic, label, value) => [$e('dt', {}, icon(ic), label), $e('dd', {}, value || '—')];
  const notes = $e('textarea', { rows: 4, placeholder: 'הערות שרק צוות משאבי אנוש רואה...', style: 'width:100%' });
  notes.value = e.notes || '';
  let saved = notes.value;
  notes.addEventListener('blur', () => { if (notes.value === saved) return; saved = notes.value; setProfile(e, { notes: notes.value }, () => toast('ההערה נשמרה ✓')); });
  const hist = d.assignments.map((a) => {
    const ok = a.status === 'submitted', signed = a.template.fields.some((f) => f.type === 'signature');
    return $e('li', {}, $e('span', { class: 'tic' + (a.approved ? ' ok' : '') }, icon(a.approved ? 'checkCircle' : ok ? (signed ? 'pen' : 'file') : 'clock')),
      $e('div', { class: 'tx' }, $e('b', { text: a.template.title }), $e('small', { text: ok ? (signed ? 'נחתם ' : 'הוגש ') + fmt(a.submitted_at) + (a.files.length ? ' · ' + a.files.length + ' מסמכים' : '') : 'טרם הוגש' })),
      a.approved ? $e('span', { class: 'chip ok', text: 'אושר' }) : ok ? $e('span', { class: 'chip pur', text: 'ממתין לאישור' }) : $e('span', { class: 'chip gray', text: 'פתוח' }));
  });
  const active = e.status === 'approved';
  return $e('div', { class: 'pgrid' },
    $e('div', { class: 'card' }, $e('h3', { icon: 'user', text: 'פרטים אישיים' }),
      $e('dl', { class: 'facts' }, fact('idcard', 'ת.ז.', e.id_number), fact('user', 'מגדר', { male: 'גבר', female: 'אישה' }[e.gender]),
        fact('phone', 'טלפון', e.phone ? $e('a', { href: 'tel:' + e.phone, dir: 'ltr', text: e.phone }) : null),
        fact('mail', 'דוא"ל', e.email ? $e('a', { href: mailto(e.email), text: e.email }) : null), fact('tag', 'מס׳ עובד', e.employee_no))),
    $e('div', { class: 'card' }, $e('h3', { icon: 'briefcase', text: 'העסקה' }),
      $e('dl', { class: 'facts' }, fact('building', 'מחלקה', e.department), fact('briefcase', 'תפקיד', e.job_title),
        fact('calendar', 'תחילת עבודה', e.start_date ? fmtDate(e.start_date) : null), active ? fact('clock', 'ותק', tenure(e)) : null,
        active ? fact('checkCircle', 'סטטוס העסקה', empStatusPill(e, refresh, true)) : fact('clock', 'סטטוס', 'בתהליך קליטה'),
        fact('layers', 'קבוצות', $e('div', { class: 'row', style: 'gap:6px' }, groupTags(e.groups), $e('button', { class: 'gchip add', icon: e.groups.length ? 'pen' : 'plus', text: e.groups.length ? 'עריכה' : 'שיוך לקבוצה', onclick: () => editGroups(e, refresh) }))),
        active ? fact('userCheck', 'נקלט/ה', fmtDate(e.approved_at) + (e.approved_by ? ' · ע״י ' + e.approved_by : '')) : null)),
    $e('div', { class: 'card' }, $e('h3', { icon: 'history', text: 'טפסים ומסמכים חתומים' }),
      hist.length ? $e('ul', { class: 'timeline' }, hist) : $e('p', { class: 'muted', text: 'לא הוקצו טפסים.' }),
      $e('button', { class: 'btn ghost sm', style: 'margin-top:10px', icon: 'file', text: 'לכל הטפסים והמסמכים', onclick: showForms })),
    $e('div', { class: 'card' }, $e('h3', { icon: 'pen', text: 'הערות פנימיות' }), notes, $e('small', { class: 'muted', text: 'נשמר אוטומטית ביציאה מהשדה.' })));
}

// ---------- ספריית העובדים הפעילים ----------
async function directoryView() {
  const seq = renderSeq;
  await refreshMeta();
  if (seq !== renderSeq || view !== 'directory') return;
  const staff = list.filter((e) => e.status === 'approved');
  for (const id of selected) if (!staff.some((e) => e.id === id)) selected.delete(id);
  if (dflt.g && !groupById(dflt.g)) dflt.g = 0;
  const [srch, q] = search(dflt.q, 'חיפוש עובד...');
  const sel = (opts, val, label) => { const s = $e('select', { 'aria-label': label }, Object.entries(opts).map(([k, v]) => $e('option', { value: k, text: v }))); s.value = val in opts ? val : ''; return s; };
  const depts = [...new Set(staff.map((e) => e.department).filter(Boolean))].sort();
  const fd = sel({ '': 'כל המחלקות', ...Object.fromEntries(depts.map((d) => [d, d])) }, dflt.d, 'מחלקה');
  const fes = sel({ '': 'כל הסטטוסים', ...Object.fromEntries(Object.entries(EMP_STATUS).map(([k, v]) => [k, v[0]])) }, dflt.es, 'סטטוס העסקה');
  const ft = sel(TENURE, dflt.t, 'ותק');
  const by = sel({ department: 'קיבוץ לפי מחלקה', employment: 'קיבוץ לפי סטטוס', none: 'ללא קיבוץ' }, dflt.by, 'קיבוץ'); if (!by.value) by.value = 'department';
  const board = $e('div'), bulkBox = $e('div');
  const filtered = () => { const s = q.value.trim().toLowerCase(); return staff.filter((e) => (!s || [e.full_name, e.phone, e.email, e.job_title, e.department, e.employee_no].join(' ').toLowerCase().includes(s))
    && (!fd.value || e.department === fd.value) && (!fes.value || e.employment_status === fes.value) && (!ft.value || tenureKey(e) === ft.value) && (!dflt.g || e.groups.includes(dflt.g))); };

  const bulk = () => {
    bulkBox.textContent = '';
    if (!selected.size) return;
    const ids = [...selected];
    const groupMenu = (remove) => (ev) => menu(ev.currentTarget, [{ header: remove ? 'הסרה מקבוצה' : 'שיוך לקבוצה' },
      ...groups.map((g) => ({ label: g.name, icon: 'tag', run: guard(async () => { await api('/groups/' + g.id + '/members', 'POST', { employee_ids: ids, remove }); toast((remove ? 'הוסרו מ' : 'שויכו ל') + '"' + g.name + '" ✓'); directoryView(); }) })),
      ...(remove ? [] : ['hr', { label: 'קבוצה חדשה...', icon: 'plus', run: () => groupModal(null, async (gid) => { await api('/groups/' + gid + '/members', 'POST', { employee_ids: ids }); directoryView(); }) }])]);
    const hidden = ids.filter((id) => !filtered().some((e) => e.id === id)).length;
    bulkBox.append($e('div', { class: 'bulk', role: 'toolbar' }, $e('b', { text: selected.size + ' נבחרו' + (hidden ? ' (' + hidden + ' מוסתרים בסינון)' : '') }),
      $e('button', { class: 'btn sm', icon: 'send', text: 'שליחת הודעה', onclick: () => composeTo(ids) }),
      $e('button', { class: 'btn ghost sm', icon: 'tag', text: 'שיוך לקבוצה', onclick: groupMenu(false) }),
      groups.length ? $e('button', { class: 'btn ghost sm', icon: 'x', text: 'הסרה מקבוצה', onclick: groupMenu(true) }) : null,
      $e('button', { class: 'qb', style: 'color:#fff', title: 'ניקוי הבחירה', icon: 'x', onclick: () => { selected.clear(); draw(); } })));
  };
  const check = (e) => { const c = $e('input', { type: 'checkbox', 'aria-label': 'בחירת ' + e.full_name, onclick: stop, onchange: () => { c.checked ? selected.add(e.id) : selected.delete(e.id); c.closest('tr')?.classList.toggle('sel', c.checked); bulk(); syncAll(); } }); c.checked = selected.has(e.id); return c; };
  let syncAll = () => {};
  const actions = (e) => $e('div', { class: 'quick', onclick: stop },
    $e('button', { class: 'qb', title: 'שליחת הודעה', icon: 'send', onclick: () => composeTo([e.id]) }),
    e.phone ? $e('a', { class: 'qb wa', title: 'צ׳אט בוואטסאפ', target: '_blank', rel: 'noopener', href: 'https://wa.me/' + waPhone(e.phone), icon: 'whatsapp' }) : null,
    mailto(e.email) ? $e('a', { class: 'qb', title: 'מייל', href: mailto(e.email), icon: 'mail' }) : null);
  const row = (e) => $e('tr', { class: selected.has(e.id) ? 'sel' : '', onclick: () => employeeDetail(e.id) },
    $e('td', { class: 'chk', onclick: stop }, check(e)),
    $e('td', { style: 'min-width:200px' }, who(e.full_name, e.phone || e.email || '')),
    $e('td', {}, e.job_title || '—'),
    $e('td', {}, e.department || '—'),
    $e('td', { class: 'c' }, empStatusPill(e, directoryView)),
    $e('td', { style: 'min-width:120px' }, groupTags(e.groups) || $e('span', { class: 'muted', text: '—' })),
    $e('td', { style: 'white-space:nowrap' }, $e('div', { text: tenure(e) }), $e('small', { class: 'muted', text: 'מ-' + fmtDate(startOf(e)) })),
    $e('td', {}, actions(e)));
  const table = (rows) => {
    const all = $e('input', { type: 'checkbox', 'aria-label': 'בחירת כולם' });
    const sync = () => { all.checked = rows.length > 0 && rows.every((e) => selected.has(e.id)); all.indeterminate = !all.checked && rows.some((e) => selected.has(e.id)); };
    all.addEventListener('change', () => { rows.forEach((e) => (all.checked ? selected.add(e.id) : selected.delete(e.id))); draw(); });
    const prev = syncAll; syncAll = () => { prev(); sync(); }; sync();
    return $e('table', {}, $e('thead', {}, $e('tr', {}, $e('th', { class: 'chk' }, all), ['עובד/ת', 'תפקיד', 'מחלקה', 'סטטוס העסקה', 'קבוצות', 'ותק', ''].map((h) => $e('th', { text: h })))), $e('tbody', {}, rows.map(row)));
  };
  const draw = () => {
    Object.assign(dflt, { q: q.value, d: fd.value, es: fes.value, t: ft.value, by: by.value }); setPref('dirGroupBy', by.value);
    board.textContent = ''; syncAll = () => {};
    const items = filtered();
    by.hidden = dirMode === 'kanban';
    if (!staff.length) { board.append(empty('briefcase', 'עדיין אין עובדים פעילים. מועמד שהקליטה שלו מאושרת בלוח הקליטה עובר לכאן אוטומטית.')); bulk(); return; }
    if (dirMode === 'kanban') {
      board.append($e('div', { class: 'kanban', style: '--cols:4' }, Object.entries(EMP_STATUS).map(([k, [label, sc]]) => {
        const col = items.filter((e) => e.employment_status === k);
        const c = $e('div', { class: 'kcol', 'data-k': k,
          ondragover: (ev) => { if (!ev.dataTransfer.types.includes('application/x-emp-id')) return; ev.preventDefault(); c.classList.add('over'); }, ondragleave: () => c.classList.remove('over'),
          ondrop: (ev) => { ev.preventDefault(); c.classList.remove('over'); const e = staff.find((x) => x.id === +ev.dataTransfer.getData('application/x-emp-id')); if (e && e.employment_status !== k) setProfile(e, { employment_status: k }, () => { toast(e.full_name + ': ' + label + ' ✓'); directoryView(); }); } },
          $e('h4', { style: '--sc:' + sc }, $e('span', { text: label }), $e('span', { text: col.length })),
          $e('div', { class: 'kbody' }, col.length ? col.map((e) => $e('div', { class: 'kc', draggable: 'true', title: 'אפשר לגרור לעמודה אחרת כדי לשנות סטטוס', onclick: () => employeeDetail(e.id),
            ondragstart: (ev) => { ev.dataTransfer.setData('application/x-emp-id', String(e.id)); ev.currentTarget.classList.add('drag'); }, ondragend: (ev) => ev.currentTarget.classList.remove('drag') },
            who(e.full_name, [e.job_title, e.department].filter(Boolean).join(' · ')), e.groups.length ? $e('div', { style: 'margin-top:8px' }, groupTags(e.groups)) : null,
            $e('div', { class: 'meta' }, $e('span', { text: 'ותק: ' + tenure(e) }), actions(e)))) : $e('p', { class: 'muted', style: 'text-align:center;font-size:.85rem;margin:24px 0', text: 'גררו לכאן עובד' })));
        return c;
      })));
      bulk(); return;
    }
    const wrap = $e('div', { class: 'groups' });
    const buckets = by.value === 'employment' ? Object.entries(EMP_STATUS).map(([k, [l, c]]) => [l, c, items.filter((e) => e.employment_status === k)])
      : by.value === 'department' ? [...new Set(items.map((e) => e.department || ''))].sort((a, b) => !a - !b || a.localeCompare(b, 'he')).map((d) => [d || 'ללא מחלקה', d ? tint(d) : 'var(--c-gray)', items.filter((e) => (e.department || '') === d)])
        : [['כל העובדים', 'var(--pri)', items]];
    buckets.filter(([, , rows]) => rows.length).forEach(([label, gc, rows]) => {
      const key = 'dir:' + label;
      const g = $e('section', { class: 'grp' + (collapsed.has(key) ? ' closed' : ''), style: '--gc:' + gc },
        $e('button', { class: 'grp-h', 'aria-expanded': String(!collapsed.has(key)), onclick: () => { collapsed.has(key) ? collapsed.delete(key) : collapsed.add(key); g.classList.toggle('closed'); } }, icon('chevron'), label, $e('small', { text: rows.length + ' עובדים' })),
        $e('div', { class: 'tbl' }, table(rows)));
      wrap.append(g);
    });
    if (!wrap.children.length) wrap.append(empty('search', 'לא נמצאו עובדים שמתאימים לסינון'));
    board.append(wrap); bulk();
  };
  [q, fd, fes, ft, by].forEach((x) => x.addEventListener('input', draw));
  const gchips = $e('div', { class: 'gbar' }, $e('span', { class: 'muted', style: 'font-size:.85rem', icon: 'layers', text: 'קבוצות:' }),
    $e('button', { class: 'gchip' + (dflt.g ? '' : ' on'), style: '--gc:var(--ink)', onclick: () => { dflt.g = 0; directoryView(); } }, 'כולם', $e('small', { text: staff.length })),
    groups.map((g) => $e('button', { class: 'gchip' + (dflt.g === g.id ? ' on' : ''), style: '--gc:' + g.color, onclick: () => { dflt.g = dflt.g === g.id ? 0 : g.id; directoryView(); }, oncontextmenu: (ev) => { ev.preventDefault(); groupModal(g, () => directoryView()); } },
      $e('i', { class: 'dot' }), g.name, $e('small', { text: staff.filter((e) => e.groups.includes(g.id)).length }))),
    $e('button', { class: 'gchip add', icon: 'plus', text: 'קבוצה חדשה', onclick: () => groupModal(null, () => directoryView()) }),
    groups.length ? $e('button', { class: 'qb', title: 'ניהול קבוצות', icon: 'settings', onclick: (ev) => menu(ev.currentTarget, [{ header: 'עריכת קבוצה' }, ...groups.map((g) => ({ label: g.name, icon: 'pen', run: () => groupModal(g, () => directoryView()) }))]) }) : null);
  draw();
  const by30 = staff.filter((e) => e.approved_at && Date.now() - new Date(e.approved_at) < 30 * 864e5).length;
  const cntS = (k) => staff.filter((e) => e.employment_status === k).length;
  const fS = (k) => () => { dflt.es = dflt.es === k ? '' : k; directoryView(); };
  shell({ title: 'עובדים פעילים', sub: 'כל מי שנקלט ואושר. כרטיס אישי, קבוצות וסטטוס העסקה',
    actions: [$e('button', { class: 'btn hdr', icon: 'send', onclick: () => composeTo(filtered().map((e) => e.id)) }, $e('span', { class: 'bl', text: 'הודעה לכולם' }))] },
    $e('div', { class: 'kpis' },
      kpi('briefcase', 'var(--c-green)', 'עובדים פעילים', cntS('active'), 'מתוך ' + staff.length + ' בספרייה', { run: fS('active'), on: dflt.es === 'active' }),
      kpi('sun', 'var(--c-blue)', 'בחופשה', cntS('leave'), 'כרגע לא בעבודה', { run: fS('leave'), on: dflt.es === 'leave' }),
      kpi('clock', 'var(--c-orange)', 'בהודעה מוקדמת', cntS('notice'), 'לקראת סיום העסקה', { run: fS('notice'), on: dflt.es === 'notice' }),
      kpi('sparkles', 'var(--c-purple)', 'הצטרפו החודש', by30, 'ב-30 הימים האחרונים')),
    $e('div', { class: 'board' }, gchips,
      $e('div', { class: 'tools' }, srch, fd, fes, ft, by, $e('span', { class: 'sp' }),
        viewSwitch(dirMode, (k) => { dirMode = k; setPref('dirMode', k); draw(); })),
      board),
    bulkBox);
}
