/* EasyHire: מרכז הודעות. הודעה אישית או תפוצתית במייל (נשלח מהשרת לכל נמען בנפרד) או בוואטסאפ
   (קישור wa.me מותאם אישית לכל נמען, נפתח ב-WhatsApp Web או באפליקציה), תבניות מוכנות, תצוגה מקדימה והיסטוריה */
const CAT_META = { events: ['party', 'var(--c-purple)'], policy: ['book', 'var(--c-blue)'], bonus: ['gift', 'var(--c-green)'], holiday: ['sparkles', 'var(--c-orange)'], general: ['megaphone', 'var(--c-gray)'] };
const RSTATUS = { sent: ['נשלח', 'ok'], failed: ['נכשל', 'err'], queued: ['בתור לשליחה', 'gray'], ready: ['ממתין לשליחה', ''], skipped: ['דולג', 'gray'] };
const PH = [['שם', 'שם פרטי'], ['שם_מלא', 'שם מלא'], ['מחלקה', 'מחלקה'], ['תפקיד', 'תפקיד'], ['חברה', 'שם החברה']];
const draft = { channel: pref('msgChannel', 'email'), audience: 'all', group: 0, dept: '', ids: new Set(), candidates: false, subject: '', body: '', cat: 'events' };
let msgTpls = { categories: {}, templates: [] }, smtpReady = false, historyBox = null, msgModalRefresh = null;

const personalize = (text, e) => String(text || '').replace(/\{(שם_מלא|שם|מחלקה|תפקיד|חברה)\}/g, (m, k) => (
  { 'שם': (e.full_name || '').trim().split(/\s+/)[0], 'שם_מלא': e.full_name, 'מחלקה': e.department, 'תפקיד': e.job_title, 'חברה': me.company }[k]) || '');
const rchip = (s) => { const [l, c] = RSTATUS[s] || [s, 'gray']; return $e('span', { class: 'chip ' + c, text: l }); };
const channelIcon = (ch) => $e('span', { class: 'hic ' + (ch === 'whatsapp' ? 'wa' : 'mail') }, icon(ch === 'whatsapp' ? 'whatsapp' : 'mail'));

function composeTo(ids) {
  draft.audience = 'manual'; draft.ids = new Set(ids);
  view = 'messages'; go();
}
function recipients() {
  const staff = list.filter((e) => e.status === 'approved' && e.employment_status !== 'ended');
  const base = draft.candidates ? [...staff, ...list.filter((e) => e.status !== 'approved')] : staff;
  if (draft.audience === 'group') return base.filter((e) => e.groups.includes(draft.group));
  if (draft.audience === 'dept') return draft.dept ? base.filter((e) => e.department === draft.dept) : [];
  if (draft.audience === 'manual') return list.filter((e) => draft.ids.has(e.id));
  return base;
}
const reachable = (e) => (draft.channel === 'email' ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email || '') : waPhone(e.phone).length >= 11);

async function refreshHistory() {
  if (view !== 'messages' || !historyBox) { msgModalRefresh?.(); return; }
  const [msgs] = await Promise.all([api('/messages'), refreshMeta()]);
  historyBox.textContent = '';
  historyBox.append(...(msgs.length ? msgs.map((m) => $e('button', { class: 'hitem', onclick: () => messageModal(m.id) }, channelIcon(m.channel),
    $e('div', { class: 'tx' }, $e('b', { text: (m.subject || m.body.split('\n').find((l) => l.trim()) || 'הודעה').replaceAll('{חברה}', me.company || '') }),
      $e('small', { text: (m.audience || m.total + ' נמענים') + ' · ' + ago(utc(m.created_at)) }),
      $e('div', { class: 'counts' }, Object.keys(RSTATUS).filter((k) => m[k]).map((k) => $e('span', { class: 'chip ' + RSTATUS[k][1], text: RSTATUS[k][0] + ' ' + m[k] })))))) : [empty('inbox', 'עוד לא נשלחו הודעות')]));
  msgModalRefresh?.();
}

async function messagesView() {
  const seq = renderSeq;
  const [t, s] = await Promise.all([api('/msg-templates'), api('/settings'), refreshMeta()]);
  if (seq !== renderSeq || view !== 'messages') return;
  msgTpls = t; smtpReady = !!s.smtp_host;
  if (draft.audience === 'group' && !groupById(draft.group)) draft.group = groups[0]?.id || 0;

  // --- ערוץ ---
  const chanBox = $e('div');
  const paintChannel = () => { fill(chanBox, $e('div', { class: 'seg', role: 'tablist' },
    [['email', 'mail', 'מייל'], ['whatsapp', 'whatsapp', 'וואטסאפ']].map(([k, ic, l]) => $e('button', { class: draft.channel === k ? 'on' : '', role: 'tab', 'aria-selected': String(draft.channel === k),
      onclick: () => { draft.channel = k; setPref('msgChannel', k); paintChannel(); paintAudience(); paintPreview(); subjWrap.hidden = k !== 'email'; } }, icon(ic, k === 'whatsapp' ? 'wa' : ''), l))),
    draft.channel === 'email' && !smtpReady ? $e('div', { class: 'notice' }, icon('alert'), $e('div', {}, 'שרת המייל עוד לא הוגדר, לכן אי אפשר לשלוח מיילים. ', $e('a', { href: '#', text: 'להגדרות המייל', onclick: (ev) => { ev.preventDefault(); view = 'settings'; go(); } }), ' או בחרו וואטסאפ.')) : null,
    draft.channel === 'whatsapp' ? $e('div', { class: 'notice info' }, icon('info'), 'לכל נמען נוצר קישור עם ההודעה האישית שלו. הקישור נפתח ב-WhatsApp Web או באפליקציה, ושם לוחצים "שליחה". המערכת עוקבת למי כבר נשלח.') : null); };

  // --- נמענים ---
  const audBox = $e('div');
  const paintAudience = () => {
    const staffCount = list.filter((e) => e.status === 'approved' && e.employment_status !== 'ended').length;
    const depts = [...new Set(list.filter((e) => e.status === 'approved').map((e) => e.department).filter(Boolean))].sort();
    if (draft.audience === 'dept' && !depts.includes(draft.dept)) draft.dept = depts[0] || '';
    const opt = (k, ic, label) => $e('button', { class: 'gchip' + (draft.audience === k ? ' on' : ''), style: '--gc:var(--pri)', icon: ic, onclick: () => { draft.audience = k; paintAudience(); paintPreview(); } }, label);
    const extra = draft.audience === 'group' ? (groups.length ? (() => { const s = $e('select', { style: 'margin-top:10px' }, groups.map((g) => $e('option', { value: g.id, text: g.name + ' (' + g.count + ')' }))); s.value = draft.group; s.addEventListener('input', () => { draft.group = +s.value; paintAudience(); paintPreview(); }); return s; })() : $e('p', { class: 'muted', text: 'עדיין אין קבוצות. אפשר ליצור אותן במסך העובדים הפעילים.' }))
      : draft.audience === 'dept' ? (() => { const s = $e('select', { style: 'margin-top:10px' }, depts.map((d) => $e('option', { value: d, text: d }))); s.value = draft.dept; s.addEventListener('input', () => { draft.dept = s.value; paintAudience(); paintPreview(); }); return depts.length ? s : $e('p', { class: 'muted', text: 'לעובדים הפעילים עוד לא הוגדרו מחלקות.' }); })()
        : draft.audience === 'manual' ? (() => {
          const [srch, q] = search('', 'חיפוש לפי שם...');
          const box = $e('div', { class: 'pick' });
          const paint = () => { box.textContent = ''; const s = q.value.trim(); list.filter((e) => !s || e.full_name.includes(s) || (e.department || '').includes(s)).forEach((e) => {
            const c = $e('input', { type: 'checkbox' }); c.checked = draft.ids.has(e.id);
            c.addEventListener('change', () => { c.checked ? draft.ids.add(e.id) : draft.ids.delete(e.id); paintSummary(); paintPreview(); });
            box.append($e('label', {}, c, who(e.full_name, [e.department, e.status === 'approved' ? null : 'מועמד/ת'].filter(Boolean).join(' · ')), $e('span', { class: 'sp' }), reachable(e) ? null : $e('small', { class: 'muted', text: draft.channel === 'email' ? 'אין מייל' : 'אין טלפון' })));
          }); };
          q.addEventListener('input', paint); paint();
          return $e('div', { style: 'margin-top:10px' }, srch, box);
        })() : null;
    const cand = $e('input', { type: 'checkbox' }); cand.checked = draft.candidates;
    cand.addEventListener('change', () => { draft.candidates = cand.checked; paintSummary(); paintPreview(); });
    fill(audBox, $e('div', { class: 'aud' }, opt('all', 'users', 'כל העובדים הפעילים (' + staffCount + ')'), opt('group', 'layers', 'קבוצה'), opt('dept', 'building', 'מחלקה'), opt('manual', 'user', 'בחירה ידנית')),
      extra, draft.audience !== 'manual' ? $e('label', { class: 'checks', style: 'display:flex;gap:8px;align-items:center;margin-top:8px;font-size:.9rem' }, cand, 'לכלול גם מועמדים שעדיין בתהליך קליטה') : null, sumBox);
    paintSummary();
  };
  const sumBox = $e('div', { class: 'rsum' });
  const paintSummary = () => {
    const rs = recipients(), bad = rs.filter((e) => !reachable(e));
    fill(sumBox, $e('span', { class: 'chip pri', icon: 'users', text: rs.length + ' נמענים' }),
      bad.length ? $e('span', { class: 'chip', title: bad.map((e) => e.full_name).join(', '), text: bad.length + ' בלי ' + (draft.channel === 'email' ? 'כתובת מייל' : 'מספר טלפון') + ' ידלגו' }) : null);
    sendBtn.disabled = !rs.length || rs.length === bad.length;
  };

  // --- תבניות ---
  const tplBox = $e('div');
  const paintTemplates = () => {
    const cats = msgTpls.categories;
    fill(tplBox, $e('div', { class: 'tcats' }, Object.entries(cats).map(([k, l]) => $e('button', { class: 'gchip' + (draft.cat === k ? ' on' : ''), style: '--gc:' + CAT_META[k][1], icon: CAT_META[k][0], onclick: () => { draft.cat = k; paintTemplates(); } }, l))),
      $e('div', { class: 'tpls' }, msgTpls.templates.filter((x) => x.category === draft.cat).map((x) => $e('div', { class: 'tpl', role: 'button', tabindex: '0', style: '--tc:' + CAT_META[x.category][1],
        onclick: () => applyTemplate(x), onkeydown: (ev) => ev.key === 'Enter' && applyTemplate(x) },
        $e('b', {}, icon(CAT_META[x.category][0]), x.title), $e('small', { text: x.body.replace(/\s+/g, ' ') }),
        $e('button', { class: 'qb ed', title: 'עריכת התבנית', icon: 'pen', onclick: (ev) => { stop(ev); templateModal(x); } }))),
      $e('button', { class: 'tpl', style: 'align-items:center;justify-content:center;color:var(--mut);border-style:dashed', onclick: () => templateModal(null) }, $e('b', {}, icon('plus'), 'תבנית חדשה'))));
  };
  const applyTemplate = (x) => {
    if ((body.value.trim() || subject.value.trim()) && (body.value !== x.body) && !confirm('להחליף את התוכן הנוכחי בתבנית "' + x.title + '"?')) return;
    subject.value = draft.subject = x.subject; body.value = draft.body = x.body; paintPreview(); body.focus();
  };

  // --- תוכן ---
  const subject = $e('input', { type: 'text', value: draft.subject, placeholder: 'נושא המייל', maxlength: 200 });
  const body = $e('textarea', { rows: 9, placeholder: 'כתבו את ההודעה כאן, או בחרו תבנית מוכנה למעלה...', style: 'width:100%;line-height:1.6' });
  body.value = draft.body;
  let lastField = body;
  subject.addEventListener('focus', () => lastField = subject); body.addEventListener('focus', () => lastField = body);
  subject.addEventListener('input', () => { draft.subject = subject.value; paintPreview(); });
  body.addEventListener('input', () => { draft.body = body.value; paintPreview(); });
  const subjWrap = $e('div', {}, $e('label', { class: 'f', style: 'margin-top:0', text: 'נושא' }), subject);
  subjWrap.hidden = draft.channel !== 'email';
  const phs = $e('div', { class: 'phs' }, $e('span', { class: 'muted', style: 'font-size:.8rem;align-self:center', icon: 'braces', text: 'שדות אישיים:' }),
    PH.map(([k, l]) => $e('button', { class: 'ph', type: 'button', title: 'מוחלף ב' + l + ' של כל נמען', onclick: () => {
      const f = lastField, s = f.selectionStart ?? f.value.length, tok = '{' + k + '}';
      f.setRangeText(tok, s, f.selectionEnd ?? s, 'end'); f.dispatchEvent(new Event('input')); f.focus();
    } }, '{' + k + '}')));

  // --- תצוגה מקדימה ---
  const prevBox = $e('div');
  const paintPreview = () => {
    const sample = recipients()[0] || { full_name: 'ישראל ישראלי', department: 'מחלקה', job_title: 'תפקיד' };
    const text = personalize(body.value, sample) || 'תוכן ההודעה יופיע כאן';
    fill(prevBox, $e('div', { class: 'muted', style: 'font-size:.8rem;margin-bottom:8px', text: 'תצוגה מקדימה עבור ' + sample.full_name }),
      draft.channel === 'email'
        ? $e('div', { class: 'preview' }, $e('div', { class: 'mailprev' }, $e('div', { class: 'from', text: me.company || '' }), $e('h4', { text: personalize(subject.value, sample) || 'נושא המייל' }), $e('p', { text })))
        : $e('div', { class: 'waprev' }, $e('div', { class: 'bubble' }, $e('p', { text }), $e('span', { class: 'tm', text: new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + ' ✓✓' }))));
  };

  // --- שליחה ---
  const sendBtn = $e('button', { class: 'btn', icon: 'send', text: 'שליחה', onclick: guard(async () => {
    const rs = recipients().filter(reachable);
    if (!body.value.trim()) throw new Error('כתבו תוכן להודעה');
    if (draft.channel === 'email' && !subject.value.trim()) throw new Error('הזינו נושא למייל');
    if (!confirm((draft.channel === 'email' ? 'לשלוח מייל ל-' : 'להכין הודעת וואטסאפ ל-') + rs.length + ' נמענים?')) return;
    const audience = { all: 'כל העובדים הפעילים', group: 'קבוצה: ' + (groupById(draft.group)?.name || ''), dept: 'מחלקה: ' + draft.dept, manual: rs.length === 1 ? rs[0].full_name : 'בחירה ידנית' }[draft.audience];
    const r = await busy(sendBtn, () => api('/messages', 'POST', { channel: draft.channel, subject: draft.channel === 'email' ? subject.value : '', body: body.value, employee_ids: recipients().map((e) => e.id), audience }));
    subject.value = body.value = draft.subject = draft.body = ''; paintPreview();
    toast(draft.channel === 'email' ? 'המיילים נכנסו לתור השליחה ✓' : 'ההודעות מוכנות לשליחה בוואטסאפ ✓');
    refreshHistory(); messageModal(r.id);
  }) });
  const saveTpl = $e('button', { class: 'btn ghost', icon: 'save', text: 'שמירה כתבנית', onclick: () => templateModal({ category: draft.cat, title: '', subject: subject.value, body: body.value }) });

  historyBox = $e('div', { class: 'hist' }, $e('div', { class: 'loadbox', style: 'padding:30px' }, icon('loader')));
  paintChannel(); paintAudience(); paintTemplates(); paintPreview();
  shell({ title: 'מרכז הודעות', sub: 'עדכונים לעובדים במייל או בוואטסאפ, אישית או לקבוצה' },
    $e('div', { class: 'msgs' },
      $e('div', { class: 'card' },
        $e('div', { class: 'step' }, $e('span', { class: 'n', text: '1' }), 'ערוץ שליחה'), chanBox,
        $e('div', { class: 'step' }, $e('span', { class: 'n', text: '2' }), 'למי שולחים'), audBox,
        $e('div', { class: 'step' }, $e('span', { class: 'n', text: '3' }), 'תבנית מוכנה'), tplBox,
        $e('div', { class: 'step' }, $e('span', { class: 'n', text: '4' }), 'תוכן ההודעה'), subjWrap, $e('label', { class: 'f', text: 'הודעה' }), body, phs,
        $e('div', { style: 'margin-top:14px' }, prevBox),
        $e('div', { class: 'row', style: 'margin-top:18px' }, sendBtn, saveTpl)),
      $e('div', { class: 'card', style: 'position:sticky;top:76px' }, $e('h3', { icon: 'history', text: 'היסטוריית שליחה' }), historyBox)));
  refreshHistory();
}

// פרטי הודעה: סטטוס לכל נמען, שליחה בוואטסאפ אחד אחרי השני, ושליחה חוזרת של מיילים שנכשלו
async function messageModal(id) {
  const box = $e('div', {}, $e('div', { class: 'loadbox', style: 'padding:30px' }, icon('loader')));
  const m = modal(box, true);
  const opened = new Set(); // קישורי וואטסאפ שנפתחו בחלון הזה ועדיין לא סומנו כנשלחו
  const paint = async () => {
    if (!m.isConnected) { msgModalRefresh = null; return; }
    const msg = await api('/messages/' + id);
    const rs = msg.recipients, done = rs.filter((r) => r.status === 'sent').length, ready = rs.filter((r) => r.status === 'ready');
    // ההודעה נשלחת מהמכשיר של משאבי אנוש, ולכן הסימון "נשלח" ידני (ואפשר לבטל אותו)
    const mark = (r, sent) => guard(async () => { await api('/messages/' + id + '/recipients/' + r.id + '/sent', 'POST', { sent }); opened.delete(r.id); await paint(); })();
    const openWa = (r) => { opened.add(r.id); setTimeout(() => paint().catch(() => {}), 300); };
    const next = ready.find((r) => !opened.has(r.id)), pendingMark = ready.find((r) => opened.has(r.id));
    const wa = msg.channel === 'whatsapp';
    const keepOpen = box.querySelector('details')?.open;
    fill(box, 
      $e('div', { class: 'row' }, channelIcon(msg.channel), $e('div', { style: 'flex:1;min-width:0' }, $e('h2', { style: 'margin:0', text: msg.subject.replaceAll('{חברה}', me.company || '') || (wa ? 'הודעת וואטסאפ' : 'מייל') }),
        $e('div', { class: 'muted', style: 'font-size:.85rem', text: (msg.audience ? msg.audience + ' · ' : '') + fmt(utc(msg.created_at)) + (msg.sent_by ? ' · ' + msg.sent_by : '') })),
        $e('button', { class: 'qb', title: 'סגירה', icon: 'x', onclick: () => m.remove() })),
      $e('div', { style: 'margin:14px 0' }, $e('div', { class: 'row', style: 'justify-content:space-between;font-size:.85rem' }, $e('span', { class: 'muted', text: 'נשלחו ' + done + ' מתוך ' + rs.length }), $e('b', { text: (rs.length ? Math.round(100 * done / rs.length) : 0) + '%' })),
        $e('div', { class: 'bar ok', style: 'margin-top:6px' }, $e('i', { style: 'width:' + (rs.length ? 100 * done / rs.length : 0) + '%' }))),
      wa && ready.length ? $e('div', { class: 'notice info', style: 'margin:0 0 10px;flex-wrap:wrap' }, icon('info'), $e('div', { style: 'flex:1;min-width:200px' }, 'פותחים את הקישור, לוחצים "שליחה" בוואטסאפ, חוזרים לכאן ומסמנים "נשלח".'),
        pendingMark ? $e('button', { class: 'btn sm okb', icon: 'check', text: 'נשלח ל' + pendingMark.name, onclick: () => mark(pendingMark, true) })
          : next ? $e('a', { class: 'btn sm', style: 'background:#25a85a', href: next.wa, target: '_blank', rel: 'noopener', icon: 'whatsapp', text: 'פתיחה: ' + next.name, onclick: () => openWa(next) }) : null) : null,
      !wa && rs.some((r) => r.status === 'failed') ? $e('div', { class: 'notice', style: 'margin:0 0 10px' }, icon('alert'), $e('div', { style: 'flex:1', text: 'חלק מהמיילים לא נשלחו. אפשר לבדוק את הגדרות המייל ולנסות שוב.' }),
        $e('button', { class: 'btn sm', icon: 'refresh', text: 'שליחה חוזרת', onclick: guard(async () => { const r = await api('/messages/' + id + '/retry', 'POST'); toast(r.retried + ' מיילים נשלחים שוב ✓'); paint(); }) })) : null,
      $e('div', { class: 'rlist' }, rs.map((r) => $e('div', { class: 'rrow' }, avatar(r.name), $e('div', { class: 'tx' }, $e('b', { text: r.name }), $e('small', { text: r.error || (wa && r.address ? '+' + r.address : r.address) || '' })),
        rchip(r.status),
        wa && r.wa ? $e('a', { class: 'qb wa', href: r.wa, target: '_blank', rel: 'noopener', title: 'פתיחה בוואטסאפ', icon: 'whatsapp', onclick: () => r.status === 'ready' && openWa(r) }) : null,
        wa && r.status === 'ready' ? $e('button', { class: 'btn sm ' + (opened.has(r.id) ? 'okb' : 'ghost'), icon: 'check', text: 'נשלח', title: 'סימון שההודעה נשלחה', onclick: () => mark(r, true) }) : null,
        wa && r.status === 'sent' ? $e('button', { class: 'qb', title: 'ביטול הסימון "נשלח"', icon: 'undo', onclick: () => mark(r, false) }) : null))),
      $e('details', { style: 'margin-top:14px', open: !!keepOpen }, $e('summary', { class: 'muted', style: 'cursor:pointer', text: 'תוכן ההודעה (התבנית לפני התאמה אישית)' }), $e('p', { style: 'white-space:pre-wrap;background:#f5f6f8;border-radius:10px;padding:12px;font-size:.9rem', text: msg.body })));
  };
  msgModalRefresh = () => paint().catch(() => {});
  await paint().catch((e) => { m.remove(); toast(e.message, true); });
}

function templateModal(t) {
  const cat = $e('select', {}, Object.entries(msgTpls.categories).map(([k, l]) => $e('option', { value: k, text: l }))); cat.value = t?.category || draft.cat;
  const title = $e('input', { type: 'text', value: t?.title || '', placeholder: 'למשל: הזמנה למסיבת חנוכה', maxlength: 80 });
  const subj = $e('input', { type: 'text', value: t?.subject || '', placeholder: 'נושא (למייל)' });
  const body = $e('textarea', { rows: 8, style: 'width:100%' }); body.value = t?.body || '';
  const m = modal($e('div', {}, $e('h2', { text: t?.id ? 'עריכת תבנית' : 'תבנית חדשה' }),
    $e('label', { class: 'f', text: 'קטגוריה' }), cat, $e('label', { class: 'f', text: 'שם התבנית' }), title, $e('label', { class: 'f', text: 'נושא' }), subj, $e('label', { class: 'f', text: 'תוכן' }), body,
    $e('p', { class: 'muted', style: 'font-size:.82rem', text: 'אפשר להשתמש בשדות אישיים: ' + PH.map(([k]) => '{' + k + '}').join(' ') + '. סוגריים מרובעים כמו [תאריך] הם תזכורת למלא לפני שליחה.' }),
    $e('div', { class: 'row', style: 'margin-top:18px' },
      $e('button', { class: 'btn', text: 'שמירה', onclick: guard(async () => {
        const b = { category: cat.value, title: title.value, subject: subj.value, body: body.value };
        if (t?.id) await api('/msg-templates/' + t.id, 'PUT', b); else await api('/msg-templates', 'POST', b);
        m.remove(); toast('התבנית נשמרה ✓'); draft.cat = cat.value; msgTpls = await api('/msg-templates'); if (view === 'messages') messagesView();
      }) }),
      t?.id ? $e('button', { class: 'btn ghost', icon: 'trash', text: 'מחיקה', onclick: guard(async () => { if (!confirm('למחוק את התבנית "' + t.title + '"?')) return; await api('/msg-templates/' + t.id, 'DELETE'); m.remove(); toast('נמחקה'); messagesView(); }) }) : null,
      $e('span', { class: 'sp' }), $e('button', { class: 'btn ghost', text: 'ביטול', onclick: () => m.remove() }))));
}

// לשונית "תקשורת" בכרטיס העובד
function commsTab(e, msgs) {
  return $e('div', { class: 'card' }, $e('div', { class: 'row', style: 'margin-bottom:6px' }, $e('h3', { style: 'margin:0', icon: 'megaphone', text: 'הודעות שנשלחו ל' + e.full_name }), $e('span', { class: 'sp' }),
    $e('button', { class: 'btn sm', icon: 'send', text: 'הודעה חדשה', onclick: () => composeTo([e.id]) })),
    msgs.length ? $e('div', { class: 'hist' }, msgs.map((m) => $e('button', { class: 'hitem', onclick: () => messageModal(m.id) }, channelIcon(m.channel),
      $e('div', { class: 'tx' }, $e('b', { text: m.subject || m.body.split('\n').find((l) => l.trim()) || 'הודעה' }), $e('small', { text: fmt(utc(m.created_at)) + (m.sent_by ? ' · ' + m.sent_by : '') + (m.error ? ' · ' + m.error : '') })),
      rchip(m.status)))) : empty('inbox', 'עוד לא נשלחו הודעות לעובד/ת הזה/ו'));
}
