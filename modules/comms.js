'use strict';
/**
 * מרכז הודעות: שליחת עדכונים לעובדים במייל (אישי לכל נמען) או בוואטסאפ (קישור wa.me מותאם אישית לכל נמען),
 * תבניות מוכנות לפי קטגוריה, והיסטוריית שליחה עם סטטוס לכל נמען.
 */
const CATEGORIES = { events: 'אירועי חברה', policy: 'עדכוני מדיניות', bonus: 'בונוסים ותמריצים', holiday: 'ברכות לחגים', general: 'כללי' };
const SEED = [
  ['events', 'הזמנה לאירוע חברה', 'הזמנה: אירוע חברה ב{חברה}',
    'שלום {שם},\n\nאנחנו שמחים להזמין אותך לאירוע החברה שיתקיים ביום [יום ותאריך] בשעה [שעה] ב[מקום].\nבתוכנית: [פירוט קצר].\n\nנודה לאישור הגעה עד [תאריך].\nמחכים לראותך!\n\nצוות משאבי אנוש, {חברה}'],
  ['events', 'תזכורת להתכנסות צוות', 'תזכורת: מפגש צוות {מחלקה}',
    'היי {שם},\n\nתזכורת קטנה: מחר, [תאריך] בשעה [שעה], נתכנס כל צוות {מחלקה} ב[מקום].\nנשמח לראות את כולם.\n\nמשאבי אנוש, {חברה}'],
  ['policy', 'עדכון נוהל חופשות', 'עדכון: נוהל חופשות',
    'שלום {שם},\n\nרצינו לעדכן על שינוי בנוהל החופשות החל מ-[תאריך]:\n• בקשות לחופשה יוגשו לפחות [מספר] ימים מראש.\n• [פירוט נוסף].\n\nלשאלות אפשר לפנות אלינו בכל עת.\nמשאבי אנוש, {חברה}'],
  ['policy', 'עדכון נוהל ימי מחלה', 'עדכון: נוהל ימי מחלה',
    'שלום {שם},\n\nלתשומת לבך, עדכון בנוהל ימי מחלה:\n• יש להודיע למנהל/ת הישיר/ה עד השעה [שעה] ביום ההיעדרות.\n• אישור מחלה יועבר למשאבי אנוש תוך [מספר] ימים.\n\nבריאות טובה!\nמשאבי אנוש, {חברה}'],
  ['policy', 'עדכון נהלים כללי', 'עדכון נהלים בחברה',
    'שלום {שם},\n\nפרסמנו עדכון לנהלי העבודה ב{חברה}. עיקרי השינויים:\n• [שינוי 1]\n• [שינוי 2]\n\nהעדכון נכנס לתוקף ב-[תאריך]. נשמח לענות על כל שאלה.\nמשאבי אנוש'],
  ['bonus', 'הודעה על מענק', 'חדשות טובות: מענק לעובדים',
    'שלום {שם},\n\nבזכות העבודה המצוינת שלך ושל כל הצוות, החלטנו להעניק מענק בסך [סכום] ₪.\nהמענק ישולם במשכורת חודש [חודש].\n\nתודה על המחויבות וההשקעה!\nהנהלת {חברה}'],
  ['bonus', 'תוכנית תמריצים', 'תוכנית תמריצים חדשה',
    'היי {שם},\n\nאנחנו משיקים תוכנית תמריצים חדשה לעובדי {מחלקה}:\n• [יעד] ← [תגמול]\n• [יעד] ← [תגמול]\n\nהתוכנית תקפה מ-[תאריך] עד [תאריך]. בהצלחה!\nמשאבי אנוש, {חברה}'],
  ['holiday', 'ברכת ראש השנה', 'שנה טובה מ{חברה}',
    'שלום {שם},\n\nלקראת ראש השנה, כל צוות {חברה} מאחל לך ולמשפחתך שנה טובה ומתוקה, שנה של בריאות, הצלחה ושמחה.\n\nשנה טובה!'],
  ['holiday', 'ברכת פסח', 'חג פסח שמח',
    'שלום {שם},\n\nמאחלים לך ולכל המשפחה חג פסח כשר ושמח, חג של חירות ומפגשים משפחתיים.\n\nחג שמח!\n{חברה}'],
  ['holiday', 'ברכה לחג', 'חג שמח מ{חברה}',
    'שלום {שם},\n\nלרגל [שם החג], אנו מאחלים לך ולבני משפחתך חג שמח ומלא אור.\nתודה שאת/ה חלק מהצוות שלנו.\n\nבברכה,\n{חברה}'],
];
const PLACEHOLDERS = { 'שם': (e) => (e.full_name || '').trim().split(/\s+/)[0], 'שם_מלא': (e) => e.full_name, 'מחלקה': (e) => e.department, 'תפקיד': (e) => e.job_title };

const waNumber = (phone) => { const d = String(phone || '').replace(/\D/g, ''); return d.startsWith('0') ? '972' + d.slice(1) : d; };

module.exports = function comms({ db, route, requireUser, readBody, send, HttpError, tx, now, esc, setting, smtpCfg, sendMail, broadcast }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS msg_templates(id INTEGER PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, subject TEXT DEFAULT '', body TEXT NOT NULL, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, channel TEXT NOT NULL, subject TEXT DEFAULT '', body TEXT NOT NULL, audience TEXT DEFAULT '',
  sent_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS message_recipients(id INTEGER PRIMARY KEY, message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL, name TEXT, address TEXT, status TEXT DEFAULT 'queued', error TEXT, sent_at TEXT);
CREATE INDEX IF NOT EXISTS ix_mr_msg ON message_recipients(message_id);
`);
  if (!db.prepare('SELECT 1 FROM msg_templates LIMIT 1').get()) {
    const ins = db.prepare('INSERT INTO msg_templates(category,title,subject,body,position) VALUES(?,?,?,?,?)');
    SEED.forEach((t, i) => ins.run(...t, i));
  }

  const personalize = (text, e) => String(text || '').replace(/\{(שם_מלא|שם|מחלקה|תפקיד|חברה)\}/g, (m, k) => (k === 'חברה' ? setting('company_name') : PLACEHOLDERS[k](e)) || '');
  const emailHtml = (subject, body) => `<!doctype html><html lang="he" dir="rtl"><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 14px"><div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e6e9ef">
<div style="font-size:12px;color:#676879;margin-bottom:6px">${esc(setting('company_name'))}</div>
<h2 style="margin:0 0 16px;color:#323338;font-size:20px">${esc(subject)}</h2>
<div style="color:#323338;font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(body)}</div></div></div></body></html>`;
  const cleanTpl = (b) => {
    const t = { category: CATEGORIES[b.category] ? b.category : 'general', title: String(b.title || '').trim().slice(0, 80), subject: String(b.subject || '').slice(0, 200), body: String(b.body || '').slice(0, 5000) };
    if (!t.title || !t.body.trim()) throw new HttpError(400, 'לתבנית חייבים להיות שם ותוכן');
    return t;
  };

  // ---------- תבניות ----------
  route('GET', '/api/msg-templates', async (req, res) => {
    requireUser(req);
    send(res, 200, { categories: CATEGORIES, templates: db.prepare('SELECT * FROM msg_templates ORDER BY position,id').all() });
  });
  route('POST', '/api/msg-templates', async (req, res) => {
    requireUser(req); const t = cleanTpl(await readBody(req));
    const pos = db.prepare('SELECT COALESCE(MAX(position),0)+1 p FROM msg_templates').get().p;
    const r = db.prepare('INSERT INTO msg_templates(category,title,subject,body,position) VALUES(?,?,?,?,?)').run(t.category, t.title, t.subject, t.body, pos);
    send(res, 200, { id: Number(r.lastInsertRowid) });
  });
  route('PUT', '/api/msg-templates/(\\d+)', async (req, res, m) => {
    requireUser(req); const t = cleanTpl(await readBody(req));
    db.prepare('UPDATE msg_templates SET category=?,title=?,subject=?,body=? WHERE id=?').run(t.category, t.title, t.subject, t.body, +m[1]);
    send(res, 200, { ok: true });
  });
  route('DELETE', '/api/msg-templates/(\\d+)', async (req, res, m) => {
    requireUser(req);
    db.prepare('DELETE FROM msg_templates WHERE id=?').run(+m[1]);
    send(res, 200, { ok: true });
  });

  // ---------- שליחה ----------
  const queue = [];
  let running = false, sentSinceBroadcast = 0;
  const kick = () => drain().catch((e) => { running = false; console.error('message queue:', e); });
  // שליחה סדרתית, נמען אחרי נמען. מסירה "לפחות פעם אחת": נפילה בין השליחה לעדכון הסטטוס תשלח שוב אחרי הפעלה מחדש
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const rid = queue.shift();
        const r = db.prepare(`SELECT r.*,m.subject,m.body,e.full_name,e.department,e.job_title FROM message_recipients r JOIN messages m ON m.id=r.message_id
          LEFT JOIN employees e ON e.id=r.employee_id WHERE r.id=? AND r.status='queued'`).get(rid);
        if (!r) continue;
        const e = { full_name: r.full_name || r.name, department: r.department, job_title: r.job_title };
        const subject = personalize(r.subject, e), body = personalize(r.body, e);
        try {
          await sendMail(smtpCfg(), { to: r.address, subject, html: emailHtml(subject, body), text: body });
          db.prepare("UPDATE message_recipients SET status='sent',error=NULL,sent_at=? WHERE id=?").run(now(), rid);
        } catch (err) {
          db.prepare("UPDATE message_recipients SET status='failed',error=? WHERE id=?").run(String(err.message || err.code || 'השליחה נכשלה').slice(0, 300), rid);
        }
        // עדכון הדשבורדים כל 10 נמענים ובסוף התור, כדי לא להציף אותם בשליחה גדולה
        if (++sentSinceBroadcast >= 10 || !queue.length) { sentSinceBroadcast = 0; broadcast(); }
      }
    } finally { running = false; }
  }
  // הודעות שנשארו בתור (למשל אחרי הפעלה מחדש של השרת) ממשיכות להישלח
  db.prepare("SELECT id FROM message_recipients WHERE status='queued'").all().forEach((r) => queue.push(r.id));
  if (queue.length) setTimeout(kick, 3000).unref();

  const recipientsView = (messageId) => db.prepare(`SELECT r.id,r.employee_id,r.name,r.address,r.status,r.error,r.sent_at,m.channel,m.body,e.full_name,e.department,e.job_title
    FROM message_recipients r JOIN messages m ON m.id=r.message_id LEFT JOIN employees e ON e.id=r.employee_id WHERE r.message_id=? ORDER BY r.id`).all(messageId)
    .map((r) => ({ id: r.id, employee_id: r.employee_id, name: r.name, address: r.address, status: r.status, error: r.error, sent_at: r.sent_at,
      // בוואטסאפ כל נמען מקבל קישור עם ההודעה המותאמת אליו; הלחיצה פותחת את WhatsApp Web או את האפליקציה
      wa: r.channel === 'whatsapp' && r.address ? 'https://wa.me/' + r.address + '?text=' + encodeURIComponent(personalize(r.body, { full_name: r.full_name || r.name, department: r.department, job_title: r.job_title })) : undefined }));

  route('POST', '/api/messages', async (req, res) => {
    const u = requireUser(req); const b = await readBody(req);
    const channel = b.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const subject = String(b.subject || '').trim().slice(0, 200), body = String(b.body || '').slice(0, 5000);
    if (!body.trim()) throw new HttpError(400, 'תוכן ההודעה ריק');
    if (channel === 'email' && !subject) throw new HttpError(400, 'יש להזין נושא למייל');
    const ids = [...new Set((Array.isArray(b.employee_ids) ? b.employee_ids : []).map(Number).filter(Number.isInteger))].slice(0, 1000);
    if (!ids.length) throw new HttpError(400, 'לא נבחרו נמענים');
    if (channel === 'email' && !smtpCfg().host) throw new HttpError(400, 'שרת המייל (SMTP) עוד לא הוגדר. אפשר להגדיר אותו במסך ההגדרות, או לשלוח בוואטסאפ.');
    const emps = ids.map((id) => db.prepare('SELECT id,full_name,phone,email FROM employees WHERE id=? AND archived=0').get(id)).filter(Boolean);
    const msgId = tx(() => {
      const r = db.prepare('INSERT INTO messages(channel,subject,body,audience,sent_by) VALUES(?,?,?,?,?)').run(channel, subject, body, String(b.audience || '').slice(0, 120), u.name || u.username);
      const mid = Number(r.lastInsertRowid);
      const ins = db.prepare('INSERT INTO message_recipients(message_id,employee_id,name,address,status,error) VALUES(?,?,?,?,?,?)');
      emps.forEach((e) => {
        const addr = channel === 'email' ? (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.email) ? e.email : '') : (waNumber(e.phone).length >= 11 ? waNumber(e.phone) : '');
        const rr = ins.run(mid, e.id, e.full_name, addr, addr ? (channel === 'email' ? 'queued' : 'ready') : 'skipped',
          addr ? null : channel === 'email' ? 'אין כתובת דוא"ל תקינה' : 'אין מספר טלפון תקין');
        if (addr && channel === 'email') queue.push(Number(rr.lastInsertRowid));
      });
      return mid;
    });
    kick();
    send(res, 200, { id: msgId, recipients: recipientsView(msgId) });
  });
  route('GET', '/api/messages', async (req, res) => {
    requireUser(req);
    send(res, 200, db.prepare(`SELECT m.id,m.channel,m.subject,m.body,m.audience,m.sent_by,m.created_at,COUNT(r.id) total,
      SUM(r.status='sent') sent,SUM(r.status='failed') failed,SUM(r.status='queued') queued,SUM(r.status='ready') ready,SUM(r.status='skipped') skipped
      FROM messages m LEFT JOIN message_recipients r ON r.message_id=m.id GROUP BY m.id ORDER BY m.id DESC LIMIT 200`).all());
  });
  route('GET', '/api/messages/(\\d+)', async (req, res, m) => {
    requireUser(req);
    const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(+m[1]);
    if (!msg) throw new HttpError(404, 'ההודעה לא נמצאה');
    send(res, 200, { ...msg, recipients: recipientsView(msg.id) });
  });
  // היסטוריית התקשורת של עובד מסוים (לשונית "תקשורת" בכרטיס העובד)
  route('GET', '/api/employees/(\\d+)/messages', async (req, res, m) => {
    requireUser(req);
    const e = db.prepare('SELECT full_name,department,job_title FROM employees WHERE id=?').get(+m[1]) || {};
    send(res, 200, db.prepare(`SELECT m.id,m.channel,m.subject,m.body,m.sent_by,m.created_at,r.status,r.error,r.sent_at FROM message_recipients r
      JOIN messages m ON m.id=r.message_id WHERE r.employee_id=? ORDER BY m.id DESC LIMIT 100`).all(+m[1])
      .map((x) => ({ ...x, subject: personalize(x.subject, e), body: personalize(x.body, e) })));
  });
  // וואטסאפ: משאבי אנוש מסמנים ידנית שההודעה נשלחה מהמכשיר שלהם (sent:false מבטל את הסימון)
  route('POST', '/api/messages/(\\d+)/recipients/(\\d+)/sent', async (req, res, m) => {
    requireUser(req); const b = await readBody(req);
    const wa = "AND message_id IN (SELECT id FROM messages WHERE channel='whatsapp')";
    if (b.sent === false) db.prepare(`UPDATE message_recipients SET status='ready',sent_at=NULL WHERE id=? AND message_id=? AND status='sent' ${wa}`).run(+m[2], +m[1]);
    else db.prepare(`UPDATE message_recipients SET status='sent',sent_at=? WHERE id=? AND message_id=? AND status='ready' ${wa}`).run(now(), +m[2], +m[1]);
    send(res, 200, { ok: true });
  });
  route('POST', '/api/messages/(\\d+)/retry', async (req, res, m) => {
    requireUser(req);
    if (!smtpCfg().host) throw new HttpError(400, 'שרת המייל (SMTP) עוד לא הוגדר');
    const failed = db.prepare("SELECT id FROM message_recipients WHERE message_id=? AND status='failed'").all(+m[1]);
    db.prepare("UPDATE message_recipients SET status='queued',error=NULL WHERE message_id=? AND status='failed'").run(+m[1]);
    failed.forEach((r) => queue.push(r.id));
    kick();
    send(res, 200, { retried: failed.length });
  });
};
