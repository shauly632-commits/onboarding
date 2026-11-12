'use strict';
/**
 * מערכת קליטת עובדים - שרת
 * ללא תלויות חיצוניות: Node 22+ (http + node:sqlite).
 * תומך בריבוי משתמשים במקביל (SQLite במצב WAL + busy_timeout).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const seedTemplates = require('./seed');
const { sendMail } = require('./mailer');

const PORT = +process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DOCS_DIR = path.join(__dirname, 'docs');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const MAX_BODY = 20 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;
const SESSION_MS = 12 * 3600 * 1000;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'onboarding.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA busy_timeout=8000; PRAGMA foreign_keys=ON; PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT, salt TEXT NOT NULL, hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS templates(
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', fields TEXT NOT NULL,
  is_default INTEGER DEFAULT 0, active INTEGER DEFAULT 1, position INTEGER DEFAULT 0,
  category TEXT DEFAULT 'כללי', mandatory INTEGER DEFAULT 1, gender_rule TEXT DEFAULT 'all', institute_doc TEXT,
  attachment_name TEXT, attachment_path TEXT, attachment_mime TEXT);
CREATE TABLE IF NOT EXISTS employees(
  id INTEGER PRIMARY KEY, token TEXT UNIQUE NOT NULL, full_name TEXT NOT NULL, id_number TEXT DEFAULT '',
  gender TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '', job_title TEXT DEFAULT '',
  department TEXT DEFAULT '', employee_no TEXT DEFAULT '', start_date TEXT DEFAULT '',
  source TEXT DEFAULT 'admin', opened_at TEXT, mail_status TEXT DEFAULT '', mail_at TEXT, mail_error TEXT,
  created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, archived INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS assignments(
  id INTEGER PRIMARY KEY, employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES templates(id), status TEXT DEFAULT 'pending',
  data TEXT DEFAULT '{}', exemptions TEXT DEFAULT '{}', updated_at TEXT, submitted_at TEXT, submit_ip TEXT,
  UNIQUE(employee_id, template_id));
CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY, assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL, filename TEXT, mime TEXT, path TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_assign_emp ON assignments(employee_id);
CREATE INDEX IF NOT EXISTS ix_files_assign ON files(assignment_id);
CREATE INDEX IF NOT EXISTS ix_emp_idnum ON employees(id_number);
`);
// הרחבות סכמה (אישור קליטה, הגשה סופית ואישור טופס על ידי משאבי אנוש)
const addColumn = (sql) => { try { db.exec(sql); return true; } catch { return false; /* העמודה כבר קיימת */ } };
if (addColumn('ALTER TABLE employees ADD COLUMN submitted_at TEXT')) {
  // עובדים שסיימו את כל הטפסים בגרסה הקודמת (שבה החבילה נשלחה אוטומטית) נחשבים כמי ששלחו את התיק
  db.exec(`UPDATE employees SET submitted_at=(SELECT MAX(submitted_at) FROM assignments WHERE employee_id=employees.id)
    WHERE id IN (SELECT employee_id FROM assignments GROUP BY employee_id HAVING COUNT(*)>0 AND COUNT(*)=SUM(status='submitted'))`);
}
['ALTER TABLE employees ADD COLUMN approved_at TEXT', 'ALTER TABLE employees ADD COLUMN approved_by TEXT',
  'ALTER TABLE assignments ADD COLUMN approved INTEGER DEFAULT 0', 'ALTER TABLE files ADD COLUMN approved INTEGER DEFAULT 0'].forEach(addColumn);

// ---------- helpers ----------
const now = () => new Date().toISOString();
const rand = (n = 24) => crypto.randomBytes(n).toString('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const safeEq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const tx = (fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class HttpError extends Error { constructor(code, msg) { super(msg); this.code = code; } }

function validIsraeliId(v) {
  const s = String(v || '').replace(/\D/g, '');
  if (s.length < 5 || s.length > 9) return false;
  const p = s.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) { let n = +p[i] * ((i % 2) + 1); if (n > 9) n -= 9; sum += n; }
  return sum % 10 === 0;
}
const normId = (v) => String(v || '').replace(/\D/g, '').padStart(9, '0');

// ---------- settings ----------
const ENV_MAP = { hr_email: 'HR_EMAIL', smtp_host: 'SMTP_HOST', smtp_port: 'SMTP_PORT', smtp_user: 'SMTP_USER', smtp_pass: 'SMTP_PASS', smtp_from: 'SMTP_FROM' };
const DEFAULTS = { company_name: 'אודי מרילי פתרונות תעסוקה יצירתיים בע"מ', company_line: 'צמיחה אישית. דרך. תעסוקה', apply_enabled: '1', capacity: '180', smtp_port: '465' };
function setting(k) {
  if (ENV_MAP[k] && process.env[ENV_MAP[k]]) return process.env[ENV_MAP[k]];
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? r.value : (DEFAULTS[k] ?? '');
}
const putSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v ?? ''));
const smtpCfg = () => ({ host: setting('smtp_host'), port: +setting('smtp_port') || 465, user: setting('smtp_user'), pass: setting('smtp_pass'), from: setting('smtp_from') });

// ---------- first run ----------
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  const pw = process.env.ADMIN_PASSWORD || rand(5);
  const salt = rand(16);
  db.prepare('INSERT INTO users(username,name,salt,hash) VALUES(?,?,?,?)').run('admin', 'יפעת (מנהלת)', salt, hashPw(pw, salt));
  console.log('\n================ הפעלה ראשונה ================');
  console.log(' משתמש: admin');
  console.log(' סיסמה: ' + pw);
  console.log(' (מומלץ להחליף סיסמה במסך "הגדרות")');
  console.log('==============================================\n');
}
if (!db.prepare('SELECT 1 FROM templates LIMIT 1').get()) {
  const ins = db.prepare('INSERT INTO templates(title,description,fields,is_default,position,category,mandatory,gender_rule,institute_doc) VALUES(?,?,?,?,?,?,?,?,?)');
  seedTemplates.forEach((t, i) => ins.run(t.title, t.description, JSON.stringify(t.fields), t.is_default ? 1 : 0, i, t.category || 'כללי', t.mandatory ? 1 : 0, t.gender_rule || 'all', t.institute_doc || null));
}

// ---------- sessions & rate limit ----------
function getUser(req) {
  const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const s = db.prepare('SELECT s.sid,s.expires,u.id,u.username,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.sid=?').get(m[1]);
  if (!s || s.expires < Date.now()) return null;
  return s;
}
const requireUser = (req) => { const u = getUser(req); if (!u) throw new HttpError(401, 'יש להתחבר'); return u; };
const hits = new Map();
function limit(bucket, ip, max, windowMs, msg) {
  const k = bucket + ip;
  const a = (hits.get(k) || []).filter((t) => t > Date.now() - windowMs);
  if (a.length >= max) throw new HttpError(429, msg);
  a.push(Date.now()); hits.set(k, a);
}
setInterval(() => { db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); for (const [k, v] of hits) if (!v.some((t) => t > Date.now() - 3600e3)) hits.delete(k); }, 3600 * 1000).unref();

// ---------- io ----------
function send(res, code, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body), isStr = typeof body === 'string';
  const out = isBuf || isStr ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': isBuf || isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', ...headers });
  res.end(out);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'הקובץ גדול מדי')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'בקשה לא תקינה')); }
    });
    req.on('error', reject);
  });
}
// מאחורי פרוקסי/מנהרה (Cloudflare, nginx) יש להגדיר TRUST_PROXY=1 כדי שמגבלת הקצב תחושב לפי כתובת המבקר האמיתית
const clientIp = (req) => ((process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-for']) || req.socket.remoteAddress || '').toString().split(',')[0].trim();

// ---------- domain ----------
const parseTpl = (t) => ({ id: t.id, title: t.title, description: t.description, fields: JSON.parse(t.fields), is_default: t.is_default,
  active: t.active, position: t.position, category: t.category, mandatory: t.mandatory, gender_rule: t.gender_rule,
  attachment: t.attachment_name ? { name: t.attachment_name, mime: t.attachment_mime } : null });

function cleanFields(fields) {
  if (!Array.isArray(fields) || fields.length > 80) throw new HttpError(400, 'רשימת שדות לא תקינה');
  const types = ['text', 'textarea', 'number', 'date', 'phone', 'email', 'idnumber', 'select', 'radio', 'consent', 'file', 'signature', 'heading', 'paragraph', 'document'];
  const seen = new Set();
  return fields.map((f, i) => {
    if (!types.includes(f.type)) throw new HttpError(400, 'סוג שדה לא נתמך');
    let key = String(f.key || '').replace(/[^a-zA-Z0-9_]/g, '') || 'f' + (i + 1) + rand(2);
    while (seen.has(key)) key += 'x'; seen.add(key);
    const o = { key, type: f.type, label: String(f.label || '').slice(0, 200), required: !!f.required };
    if (f.text) o.text = String(f.text).slice(0, 5000);
    if (['select', 'radio'].includes(f.type)) o.options = (f.options || []).map((x) => String(x).slice(0, 100)).filter(Boolean).slice(0, 40);
    if (f.default === 'today') o.default = 'today';
    if (f.prefill && ['full_name', 'phone', 'email', 'id_number', 'gender'].includes(f.prefill)) o.prefill = f.prefill;
    if (f.type === 'file' && f.allow_exempt) o.allow_exempt = true;
    if (f.type === 'document') {
      o.doc = String(f.doc || '').replace(/[^a-z0-9]/g, '').slice(0, 40);
      o.pages = Math.min(20, Math.max(1, +f.pages || 1));
      if (f.download && /^[a-z0-9-]+\.pdf$/.test(f.download)) o.download = f.download;
      o.required = false;
    }
    if (['heading', 'paragraph'].includes(f.type)) o.required = false;
    return o;
  });
}

const genderOk = (rule, gender) => rule !== 'male' || gender === 'male';
function employeeRow(e) {
  const a = db.prepare("SELECT COUNT(*) total, SUM(status='submitted') done, SUM(approved=1) approved, SUM(data!='{}' OR status='submitted') touched, MAX(updated_at) last FROM assignments WHERE employee_id=?").get(e.id);
  const done = a.done || 0;
  // new → progress → review (המועמד שלח את התיק) → approved (נקלט כעובד פעיל)
  const status = e.approved_at ? 'approved' : e.submitted_at ? 'review' : (done || a.touched || e.opened_at ? 'progress' : 'new');
  return { id: e.id, token: e.token, full_name: e.full_name, id_number: e.id_number, gender: e.gender, phone: e.phone, email: e.email,
    job_title: e.job_title, department: e.department, employee_no: e.employee_no, start_date: e.start_date, source: e.source,
    created_at: e.created_at, total: a.total, done, approved: a.approved || 0, pending_exemptions: pendingExemptions(e.id), status, submitted_at: e.submitted_at, approved_at: e.approved_at, approved_by: e.approved_by, last_activity: a.last || e.opened_at || e.created_at,
    opened: !!e.opened_at, mail_status: e.mail_status, mail_at: e.mail_at, mail_error: e.mail_error };
}
function assignTemplates(empId, ids, gender) {
  const ins = db.prepare('INSERT OR IGNORE INTO assignments(employee_id,template_id,updated_at) VALUES(?,?,?)');
  let added = 0;
  ids.forEach((id) => {
    const t = db.prepare('SELECT gender_rule FROM templates WHERE id=? AND active=1').get(id);
    if (t && genderOk(t.gender_rule, gender)) added += Number(ins.run(empId, id, now()).changes);
  });
  return added;
}
const defaultTemplateIds = (gender) => db.prepare('SELECT id,gender_rule FROM templates WHERE active=1 AND is_default=1 ORDER BY position,id').all().filter((t) => genderOk(t.gender_rule, gender)).map((t) => t.id);
function assignmentView(a) {
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id);
  return { id: a.id, status: a.status, approved: !!a.approved, data: JSON.parse(a.data || '{}'), exemptions: JSON.parse(a.exemptions || '{}'), updated_at: a.updated_at,
    submitted_at: a.submitted_at, template: parseTpl(t), files: db.prepare('SELECT id,field_key,filename,mime,approved FROM files WHERE assignment_id=?').all(a.id).map((f) => ({ ...f, approved: !!f.approved })) };
}
const prefillFor = (e) => ({ full_name: e.full_name, phone: e.phone, email: e.email, id_number: e.id_number, gender: e.gender === 'male' ? 'גבר' : e.gender === 'female' ? 'אישה' : '' });

function validateSubmission(tpl, data, files, exemptions) {
  const errors = {};
  for (const f of tpl.fields) {
    if (['heading', 'paragraph', 'document'].includes(f.type)) continue;
    const v = data[f.key];
    const empty = v === undefined || v === null || String(v).trim() === '' || v === false;
    if (f.type === 'file') {
      const ex = exemptions[f.key];
      if (f.required && !files.some((x) => x.field_key === f.key) && !(ex && ex.status !== 'rejected')) errors[f.key] = 'חובה להעלות קובץ';
      continue;
    }
    if (f.type === 'signature') {
      if (f.required && (typeof v !== 'string' || !v.startsWith('data:image/png;base64,') || v.length < 600)) errors[f.key] = 'נדרשת חתימה';
      continue;
    }
    if (empty) { if (f.required) errors[f.key] = f.type === 'consent' ? 'יש לאשר כדי להמשיך' : 'שדה חובה'; continue; }
    if (f.type === 'idnumber' && !validIsraeliId(v)) errors[f.key] = 'מספר תעודת זהות לא תקין';
    if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[f.key] = 'כתובת דוא"ל לא תקינה';
    if (f.type === 'phone' && String(v).replace(/\D/g, '').length < 9) errors[f.key] = 'מספר טלפון לא תקין';
    if (['select', 'radio'].includes(f.type) && !(f.options || []).includes(v)) errors[f.key] = 'בחירה לא תקינה';
  }
  return errors;
}
function sanitizeData(tpl, data) {
  const out = {};
  for (const f of tpl.fields) {
    if (['heading', 'paragraph', 'file', 'document'].includes(f.type)) continue;
    let v = data[f.key];
    if (v === undefined) continue;
    if (f.type === 'consent') v = !!v;
    else if (f.type === 'signature') v = typeof v === 'string' && v.startsWith('data:image/png;base64,') && v.length < 400000 ? v : '';
    else v = String(v).slice(0, f.type === 'textarea' ? 4000 : 300);
    out[f.key] = v;
  }
  return out;
}
function saveFile(assignmentId, field, body) {
  const mime = String(body.mime || '');
  if (!ALLOWED_MIME.includes(mime)) throw new HttpError(400, 'סוג קובץ לא נתמך (תמונה או PDF בלבד)');
  const buf = Buffer.from(String(body.data || ''), 'base64');
  if (!buf.length || buf.length > MAX_FILE) throw new HttpError(400, 'הקובץ ריק או גדול מ-10MB');
  const name = rand(16);
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  return tx(() => {
    const old = db.prepare('SELECT id,path FROM files WHERE assignment_id=? AND field_key=?').all(assignmentId, field);
    old.forEach((o) => { db.prepare('DELETE FROM files WHERE id=?').run(o.id); fs.rm(path.join(UPLOAD_DIR, o.path), () => {}); });
    const r = db.prepare('INSERT INTO files(assignment_id,field_key,filename,mime,path) VALUES(?,?,?,?,?)')
      .run(assignmentId, field, String(body.filename || 'file').slice(0, 120), mime, name);
    // העלאת קובץ מבטלת בקשת פטור קיימת לאותו שדה
    const a = db.prepare('SELECT exemptions FROM assignments WHERE id=?').get(assignmentId);
    const ex = JSON.parse(a.exemptions || '{}');
    if (ex[field]) { delete ex[field]; db.prepare('UPDATE assignments SET exemptions=? WHERE id=?').run(JSON.stringify(ex), assignmentId); }
    return { id: Number(r.lastInsertRowid), field_key: field, filename: body.filename, mime };
  });
}
function streamFile(res, p, mime, name, inline = true) {
  if (!fs.existsSync(p)) throw new HttpError(404, 'הקובץ לא נמצא');
  res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name || 'file')}` });
  fs.createReadStream(p).pipe(res);
}
const streamUpload = (res, rel, mime, name, inline) => streamFile(res, path.join(UPLOAD_DIR, path.basename(rel)), mime, name, inline);
const streamDoc = (res, file) => {
  if (!/^[a-z0-9-]+\.(jpg|pdf)$/.test(file)) throw new HttpError(404, 'לא נמצא');
  streamFile(res, path.join(DOCS_DIR, file), file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', file, !file.endsWith('.pdf'));
};
const STATUS_HE = { new: 'טרם התחיל', progress: 'בתהליך מילוי', review: 'ממתין לבדיקה', approved: 'נקלט ואושר' };
const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

// ---------- חבילת טפסים (מייל / הדפסה) ----------
function buildPackage(empId, mode) {
  const e = db.prepare('SELECT * FROM employees WHERE id=?').get(empId);
  const as = db.prepare('SELECT a.* FROM assignments a JOIN templates t ON t.id=a.template_id WHERE a.employee_id=? ORDER BY t.position,t.id').all(empId).map(assignmentView);
  const inline = [], attachments = [];
  let bytes = 0, skipped = 0, sigN = 0;
  const company = setting('company_name');
  const th = 'style="text-align:right;padding:6px 10px;color:#666;font-weight:normal;width:34%;vertical-align:top;border-bottom:1px solid #eee"';
  const td = 'style="text-align:right;padding:6px 10px;border-bottom:1px solid #eee"';
  const emp = (e.full_name || '').replace(/[\\/:*?"<>|]/g, '');
  let body = '';
  as.forEach((a, idx) => {
    const t = a.template, ok = a.status === 'submitted';
    let rows = '';
    for (const f of t.fields) {
      if (['heading', 'paragraph', 'document'].includes(f.type)) continue;
      const v = a.data[f.key]; let cell;
      if (f.type === 'signature') {
        if (!v) cell = '—';
        else if (mode === 'email') { const cid = 'sig' + (++sigN) + '@pkg'; inline.push({ cid, mime: 'image/png', data: Buffer.from(v.split(',')[1], 'base64') }); cell = `<img src="cid:${cid}" alt="חתימה" style="max-width:240px;border:1px solid #ddd;border-radius:6px;background:#fff">`; }
        else cell = `<img src="${v}" alt="חתימה" style="max-width:240px;border:1px solid #ddd;border-radius:6px;background:#fff">`;
      } else if (f.type === 'file') {
        const fl = a.files.find((x) => x.field_key === f.key);
        const ex = a.exemptions[f.key];
        if (fl) {
          if (mode === 'email') {
            const row = db.prepare('SELECT path FROM files WHERE id=?').get(fl.id);
            const buf = fs.existsSync(path.join(UPLOAD_DIR, row.path)) ? fs.readFileSync(path.join(UPLOAD_DIR, row.path)) : null;
            const ext = fl.mime === 'application/pdf' ? 'pdf' : fl.mime.split('/')[1].replace('jpeg', 'jpg');
            const fname = `${String(idx + 1).padStart(2, '0')}_${(f.label || f.key).replace(/[\\/:*?"<>|]/g, '')}_${emp}.${ext}`;
            if (buf && bytes + buf.length < 18 * 1024 * 1024) { bytes += buf.length; attachments.push({ filename: fname, mime: fl.mime, data: buf }); cell = '📎 מצורף: ' + esc(fname); }
            else { skipped++; cell = '📎 הקובץ זמין במערכת (חריגה ממגבלת גודל המייל)'; }
          } else cell = `<a href="/api/files/${fl.id}" target="_blank">📎 ${esc(fl.filename)}</a>` + (fl.mime.startsWith('image/') ? `<br><img src="/api/files/${fl.id}" style="max-width:260px;margin-top:6px;border-radius:6px">` : '');
        } else if (ex) cell = `פטור ממסמך (${ex.status === 'approved' ? 'אושר' : ex.status === 'rejected' ? 'נדחה' : 'ממתין לאישור'}): ${esc(ex.reason)}`;
        else cell = '—';
      } else if (f.type === 'consent') cell = v ? '✓ אושר' : '—';
      else cell = esc(v || '—').replace(/\n/g, '<br>');
      rows += `<tr><th ${th}>${esc(f.label)}</th><td ${td}>${cell}</td></tr>`;
    }
    body += `<h3 style="margin:26px 0 6px;font-size:16px">${idx + 1}. ${esc(t.title)} <span style="font-size:12px;font-weight:normal;color:${ok ? '#15935a' : '#b7791f'}">${ok ? '✓ הוגש ' + new Date(a.submitted_at).toLocaleString('he-IL') : '● לא הוגש'}</span></h3><table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`;
    const full = db.prepare('SELECT institute_doc FROM templates WHERE id=?').get(t.id);
    if (mode === 'email' && full.institute_doc && fs.existsSync(path.join(DOCS_DIR, full.institute_doc)) && !attachments.some((x) => x.filename === full.institute_doc)) {
      const data = fs.readFileSync(path.join(DOCS_DIR, full.institute_doc));
      attachments.push({ filename: `תעודת_מוסד_${t.title.includes('מין') ? 'עבירות_מין' : 'אלימות'}.pdf`, mime: 'application/pdf', data });
    }
  });
  const done = as.filter((a) => a.status === 'submitted').length;
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>תיק קליטה - ${esc(e.full_name)}</title>${mode === 'web' ? '<style>body{font-family:Arial,sans-serif;max-width:820px;margin:20px auto;padding:0 14px}@media print{h3{break-after:avoid}table{break-inside:avoid}}</style>' : ''}</head>
<body style="font-family:Arial,Helvetica,sans-serif;direction:rtl;color:#1c2236;background:#f6f7fb;margin:0;padding:${mode === 'email' ? '16px' : '0'}">
<div style="max-width:780px;margin:auto;background:#fff;border-radius:14px;padding:22px;border:1px solid #e3e7f1">
<div style="font-size:12px;color:#6b7390">${esc(company)}</div>
<h2 style="margin:4px 0 2px">תיק קליטת עובד: ${esc(e.full_name)}</h2>
<div style="color:#6b7390;font-size:14px">${[e.job_title, e.department, e.id_number && 'ת.ז. ' + e.id_number, e.phone, e.email].filter(Boolean).map(esc).join(' · ')}</div>
<div style="margin:10px 0;padding:10px 14px;border-radius:10px;background:${done === as.length ? '#e3f6ec' : '#fdf3dc'};font-size:14px">${done === as.length ? '✅ העובד השלים את כל הטפסים' : `הוגשו ${done} מתוך ${as.length} טפסים`} · ${attachments.length ? attachments.length + ' קבצים מצורפים למייל' : ''}${skipped ? ` · ${skipped} קבצים לא צורפו (גודל), זמינים במערכת` : ''}</div>
${body}</div></body></html>`;
  return { employee: e, html, inline, attachments, done, total: as.length };
}

async function sendPackage(empId) {
  const cfg = smtpCfg(), to = setting('hr_email');
  const set = (status, err) => db.prepare('UPDATE employees SET mail_status=?,mail_at=?,mail_error=? WHERE id=?').run(status, now(), err || null, empId);
  if (!cfg.host || !to) { set('not_configured', 'לא הוגדר שרת מייל או כתובת משאבי אנוש'); return 'not_configured'; }
  try {
    const p = buildPackage(empId, 'email');
    await sendMail(cfg, { to, subject: `תיק קליטה הושלם: ${p.employee.full_name}`, html: p.html,
      text: `תיק הקליטה של ${p.employee.full_name} הושלם (${p.done}/${p.total} טפסים). פרטים בגוף המייל ובקבצים המצורפים.`, inline: p.inline, attachments: p.attachments });
    set('sent'); return 'sent';
  } catch (e) { console.error('mail failed:', e.message); set('failed', e.message); return 'failed'; }
}
setInterval(async () => {
  for (const e of db.prepare("SELECT id FROM employees WHERE mail_status='failed' AND archived=0").all()) await sendPackage(e.id);
}, 10 * 60 * 1000).unref();

const allSubmitted = (empId) => { const c = db.prepare("SELECT COUNT(*) t, SUM(status='submitted') d FROM assignments WHERE employee_id=?").get(empId); return c.t > 0 && c.t === c.d; };
// כל שינוי בטופס מחזיר את התיק ממצב "נשלח לבדיקה" למילוי
const unsubmit = (empId) => db.prepare('UPDATE employees SET submitted_at=NULL,approved_at=NULL,approved_by=NULL WHERE id=?').run(empId);
const pendingExemptions = (empId) => db.prepare("SELECT exemptions FROM assignments WHERE employee_id=? AND exemptions!='{}'").all(empId)
  .reduce((n, a) => n + Object.values(JSON.parse(a.exemptions)).filter((x) => x.status === 'pending').length, 0);
// עריכה של המועמד אחרי שהתיק נשלח מחזירה אותו למילוי; אחרי קליטה העריכה חסומה
function candidateEdit(e) {
  if (e.approved_at) throw new HttpError(409, 'התיק כבר אושר על ידי משאבי אנוש. לשינוי פנו אליהם.');
  if (e.submitted_at) db.prepare('UPDATE employees SET submitted_at=NULL WHERE id=?').run(e.id);
}

// ---------- עדכונים בזמן אמת לדשבורד (Server-Sent Events) ----------
const listeners = new Map(); // res → sid
let pushTimer = null;
function broadcast() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; for (const r of listeners.keys()) r.write(`data: ${Date.now()}\n\n`); }, 250);
}
// פינג כל 25 שניות; זרם שהסשן שלו פג או נמחק (יציאה, מחיקת משתמש) נסגר
setInterval(() => {
  for (const [r, sid] of listeners) {
    const s = db.prepare('SELECT expires FROM sessions WHERE sid=?').get(sid);
    if (!s || s.expires < Date.now()) { listeners.delete(r); r.end(); } else r.write(': ping\n\n');
  }
}, 25000).unref();

// ---------- routes ----------
const routes = [];
const route = (method, re, fn) => routes.push({ method, re: new RegExp('^' + re + '$'), fn });

// auth
route('POST', '/api/login', async (req, res) => {
  limit('login', clientIp(req), 10, 600e3, 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות');
  const b = await readBody(req);
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(b.username || '').trim());
  if (!u || !safeEq(hashPw(String(b.password || ''), u.salt), u.hash)) throw new HttpError(401, 'שם משתמש או סיסמה שגויים');
  const sid = rand(24);
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(sid, u.id, Date.now() + SESSION_MS);
  send(res, 200, { ok: true, name: u.name || u.username }, { 'Set-Cookie': `sid=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}` });
});
route('POST', '/api/logout', async (req, res) => {
  const m = /sid=([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (m) db.prepare('DELETE FROM sessions WHERE sid=?').run(m[1]);
  send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
});
route('GET', '/api/me', async (req, res) => {
  const u = getUser(req);
  send(res, 200, u ? { username: u.username, name: u.name, company: setting('company_name'), company_line: setting('company_line'), capacity: +setting('capacity') || 180 } : { anonymous: true });
});
route('POST', '/api/password', async (req, res) => {
  const u = requireUser(req); const b = await readBody(req);
  const cur = db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
  if (!safeEq(hashPw(String(b.current || ''), cur.salt), cur.hash)) throw new HttpError(400, 'הסיסמה הנוכחית שגויה');
  if (String(b.next || '').length < 8) throw new HttpError(400, 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
  const salt = rand(16);
  db.prepare('UPDATE users SET salt=?,hash=? WHERE id=?').run(salt, hashPw(b.next, salt), u.id);
  send(res, 200, { ok: true });
});
route('GET', '/api/users', async (req, res) => { requireUser(req); send(res, 200, db.prepare('SELECT id,username,name,created_at FROM users').all()); });
route('POST', '/api/users', async (req, res) => {
  requireUser(req); const b = await readBody(req);
  const un = String(b.username || '').trim();
  if (!/^[a-zA-Z0-9_.@-]{3,40}$/.test(un)) throw new HttpError(400, 'שם משתמש: 3-40 תווים באנגלית/ספרות');
  if (String(b.password || '').length < 8) throw new HttpError(400, 'סיסמה: לפחות 8 תווים');
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(un)) throw new HttpError(409, 'שם המשתמש תפוס');
  const salt = rand(16);
  db.prepare('INSERT INTO users(username,name,salt,hash) VALUES(?,?,?,?)').run(un, String(b.name || un).slice(0, 80), salt, hashPw(b.password, salt));
  send(res, 200, { ok: true });
});
route('DELETE', '/api/users/(\\d+)', async (req, res, m) => {
  const u = requireUser(req);
  if (+m[1] === u.id) throw new HttpError(400, 'לא ניתן למחוק את המשתמש המחובר');
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(+m[1]);
  db.prepare('DELETE FROM users WHERE id=?').run(+m[1]);
  send(res, 200, { ok: true });
});

// settings & mail
route('GET', '/api/settings', async (req, res) => {
  requireUser(req);
  send(res, 200, { hr_email: setting('hr_email'), smtp_host: setting('smtp_host'), smtp_port: setting('smtp_port'), smtp_user: setting('smtp_user'),
    smtp_from: setting('smtp_from'), has_pass: !!setting('smtp_pass'), company_name: setting('company_name'), company_line: setting('company_line'),
    apply_enabled: setting('apply_enabled') === '1', capacity: setting('capacity'), env_locked: Object.keys(ENV_MAP).filter((k) => process.env[ENV_MAP[k]]) });
});
route('PUT', '/api/settings', async (req, res) => {
  requireUser(req); const b = await readBody(req);
  for (const k of ['hr_email', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_from', 'company_name', 'company_line', 'capacity']) if (b[k] !== undefined) putSetting(k, String(b[k]).trim().slice(0, 200));
  if (b.smtp_pass) putSetting('smtp_pass', String(b.smtp_pass).slice(0, 200));
  if (b.apply_enabled !== undefined) putSetting('apply_enabled', b.apply_enabled ? '1' : '0');
  send(res, 200, { ok: true });
});
route('POST', '/api/settings/test-mail', async (req, res) => {
  requireUser(req);
  try {
    await sendMail(smtpCfg(), { to: setting('hr_email'), subject: 'בדיקת שליחה ממערכת קליטת עובדים', html: '<div dir="rtl">המייל הגיע בהצלחה ✅<br>מעכשיו חבילות הטפסים של עובדים שהשלימו קליטה יישלחו לכתובת זו.</div>', text: 'המייל הגיע בהצלחה' });
    send(res, 200, { ok: true });
  } catch (e) { throw new HttpError(400, 'השליחה נכשלה: ' + e.message); }
});

// templates (admin)
route('GET', '/api/templates', async (req, res) => {
  requireUser(req);
  send(res, 200, db.prepare('SELECT * FROM templates WHERE active=1 ORDER BY position,id').all().map(parseTpl));
});
const tplBody = (b) => {
  if (!String(b.title || '').trim()) throw new HttpError(400, 'חסר שם לטופס');
  return [String(b.title).trim().slice(0, 140), String(b.description || '').slice(0, 400), JSON.stringify(cleanFields(b.fields || [])), b.is_default ? 1 : 0,
    String(b.category || 'כללי').slice(0, 60), b.mandatory === 0 || b.mandatory === false ? 0 : 1, b.gender_rule === 'male' ? 'male' : 'all'];
};
route('POST', '/api/templates', async (req, res) => {
  requireUser(req); const b = await readBody(req);
  const pos = (db.prepare('SELECT MAX(position) p FROM templates').get().p || 0) + 1;
  const r = db.prepare('INSERT INTO templates(title,description,fields,is_default,category,mandatory,gender_rule,position) VALUES(?,?,?,?,?,?,?,?)').run(...tplBody(b), pos);
  send(res, 200, { id: Number(r.lastInsertRowid) });
});
route('PUT', '/api/templates/(\\d+)', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  db.prepare('UPDATE templates SET title=?,description=?,fields=?,is_default=?,category=?,mandatory=?,gender_rule=? WHERE id=?').run(...tplBody(b), +m[1]);
  send(res, 200, { ok: true });
});
route('POST', '/api/templates/(\\d+)/move', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const list = db.prepare('SELECT id FROM templates WHERE active=1 ORDER BY position,id').all().map((x) => x.id);
  const i = list.indexOf(+m[1]); const j = i + (b.dir === 'up' ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) return send(res, 200, { ok: true });
  [list[i], list[j]] = [list[j], list[i]];
  tx(() => list.forEach((id, idx) => db.prepare('UPDATE templates SET position=? WHERE id=?').run(idx, id)));
  send(res, 200, { ok: true });
});
route('DELETE', '/api/templates/(\\d+)', async (req, res, m) => {
  requireUser(req);
  const used = db.prepare('SELECT COUNT(*) c FROM assignments WHERE template_id=?').get(+m[1]).c;
  if (used) db.prepare('UPDATE templates SET active=0,is_default=0 WHERE id=?').run(+m[1]); // נשמר להיסטוריה
  else db.prepare('DELETE FROM templates WHERE id=?').run(+m[1]);
  send(res, 200, { ok: true });
});
route('POST', '/api/templates/(\\d+)/attachment', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  if (b.mime !== 'application/pdf' && !String(b.mime).startsWith('image/')) throw new HttpError(400, 'PDF או תמונה בלבד');
  const buf = Buffer.from(String(b.data || ''), 'base64');
  if (!buf.length || buf.length > MAX_FILE) throw new HttpError(400, 'קובץ ריק או גדול מ-10MB');
  const name = rand(16); fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  const old = db.prepare('SELECT attachment_path p FROM templates WHERE id=?').get(+m[1]);
  if (old?.p) fs.rm(path.join(UPLOAD_DIR, old.p), () => {});
  db.prepare('UPDATE templates SET attachment_name=?,attachment_path=?,attachment_mime=? WHERE id=?').run(String(b.filename || 'file').slice(0, 120), name, b.mime, +m[1]);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/templates/(\\d+)/attachment', async (req, res, m) => {
  requireUser(req);
  db.prepare('UPDATE templates SET attachment_name=NULL,attachment_path=NULL,attachment_mime=NULL WHERE id=?').run(+m[1]);
  send(res, 200, { ok: true });
});
route('GET', '/api/templates/(\\d+)/attachment', async (req, res, m) => {
  requireUser(req);
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(+m[1]);
  if (!t?.attachment_path) throw new HttpError(404, 'אין קובץ');
  streamUpload(res, t.attachment_path, t.attachment_mime, t.attachment_name);
});
route('GET', '/api/docs/([a-z0-9.-]+)', async (req, res, m) => { requireUser(req); streamDoc(res, m[1]); });

route('GET', '/api/events', async (req, res) => {
  const u = requireUser(req);
  if (listeners.size >= 200) throw new HttpError(503, 'יותר מדי חיבורים פתוחים');
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  listeners.set(res, u.sid);
  req.on('close', () => listeners.delete(res));
});

// employees (admin)
route('GET', '/api/employees', async (req, res) => {
  requireUser(req);
  send(res, 200, db.prepare('SELECT * FROM employees WHERE archived=0 ORDER BY id DESC').all().map(employeeRow));
});
const empFields = (b) => [String(b.full_name || '').trim().slice(0, 100), String(b.id_number || '').replace(/\D/g, '').slice(0, 9), b.gender === 'male' || b.gender === 'female' ? b.gender : '',
  String(b.phone || '').slice(0, 30), String(b.email || '').slice(0, 100), String(b.job_title || '').slice(0, 100), String(b.department || '').slice(0, 100),
  String(b.employee_no || '').slice(0, 30), String(b.start_date || '').slice(0, 10)];
route('POST', '/api/employees', async (req, res) => {
  const u = requireUser(req); const b = await readBody(req);
  const f = empFields(b);
  if (!f[0]) throw new HttpError(400, 'חסר שם עובד');
  if (!f[2]) throw new HttpError(400, 'יש לבחור מגדר (קובע אם יוקצה טופס המשטרה לגברים)');
  if (f[1] && !validIsraeliId(f[1])) throw new HttpError(400, 'מספר תעודת זהות לא תקין');
  if (f[1] && db.prepare('SELECT 1 FROM employees WHERE id_number=? AND archived=0').get(f[1])) throw new HttpError(409, 'כבר קיים עובד עם תעודת זהות זו');
  const ids = Array.isArray(b.template_ids) ? b.template_ids.map(Number) : defaultTemplateIds(f[2]);
  const emp = tx(() => {
    const r = db.prepare('INSERT INTO employees(token,full_name,id_number,gender,phone,email,job_title,department,employee_no,start_date,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(rand(18), ...f, u.id);
    assignTemplates(Number(r.lastInsertRowid), ids, f[2]);
    return db.prepare('SELECT * FROM employees WHERE id=?').get(Number(r.lastInsertRowid));
  });
  send(res, 200, employeeRow(emp));
});
route('GET', '/api/employees/(\\d+)', async (req, res, m) => {
  requireUser(req);
  const e = db.prepare('SELECT * FROM employees WHERE id=? AND archived=0').get(+m[1]);
  if (!e) throw new HttpError(404, 'עובד לא נמצא');
  const as = db.prepare('SELECT a.* FROM assignments a JOIN templates t ON t.id=a.template_id WHERE a.employee_id=? ORDER BY t.position,t.id').all(e.id);
  send(res, 200, { employee: employeeRow(e), assignments: as.map(assignmentView) });
});
route('PUT', '/api/employees/(\\d+)', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const f = empFields(b);
  if (f[1] && !validIsraeliId(f[1])) throw new HttpError(400, 'מספר תעודת זהות לא תקין');
  const cur = db.prepare('SELECT gender FROM employees WHERE id=?').get(+m[1]);
  db.prepare('UPDATE employees SET full_name=?,id_number=?,gender=?,phone=?,email=?,job_title=?,department=?,employee_no=?,start_date=? WHERE id=?')
    .run(f[0] || 'ללא שם', f[1], f[2] || cur?.gender || '', f[3], f[4], f[5], f[6], f[7], f[8], +m[1]);
  send(res, 200, { ok: true });
});
route('POST', '/api/employees/(\\d+)/assign', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const e = db.prepare('SELECT gender FROM employees WHERE id=?').get(+m[1]);
  if (!e) throw new HttpError(404, 'עובד לא נמצא');
  // טופס חדש פותח מחדש את התיק: הוא כבר לא "נשלח" או "נקלט"
  if (assignTemplates(+m[1], (b.template_ids || []).map(Number), e.gender)) unsubmit(+m[1]);
  send(res, 200, { ok: true });
});
route('DELETE', '/api/employees/(\\d+)', async (req, res, m) => {
  requireUser(req);
  const fl = db.prepare('SELECT f.path FROM files f JOIN assignments a ON a.id=f.assignment_id WHERE a.employee_id=?').all(+m[1]);
  db.prepare('DELETE FROM employees WHERE id=?').run(+m[1]);
  fl.forEach((f) => fs.rm(path.join(UPLOAD_DIR, f.path), () => {}));
  send(res, 200, { ok: true });
});
route('POST', '/api/employees/(\\d+)/resend-mail', async (req, res, m) => {
  requireUser(req);
  const st = await sendPackage(+m[1]);
  const e = db.prepare('SELECT mail_error FROM employees WHERE id=?').get(+m[1]);
  send(res, 200, { status: st, error: e?.mail_error });
});
route('GET', '/api/employees/(\\d+)/package', async (req, res, m) => {
  requireUser(req);
  if (!db.prepare('SELECT 1 FROM employees WHERE id=?').get(+m[1])) throw new HttpError(404, 'עובד לא נמצא');
  send(res, 200, buildPackage(+m[1], 'web').html, { 'Content-Type': 'text/html; charset=utf-8' });
});
route('POST', '/api/assignments/(\\d+)/reopen', async (req, res, m) => {
  requireUser(req);
  const a = db.prepare('SELECT employee_id FROM assignments WHERE id=?').get(+m[1]);
  if (!a) throw new HttpError(404, 'הטופס לא נמצא');
  db.prepare("UPDATE assignments SET status='pending',approved=0,submitted_at=NULL,updated_at=? WHERE id=?").run(now(), +m[1]);
  db.prepare('UPDATE files SET approved=0 WHERE assignment_id=?').run(+m[1]);
  unsubmit(a.employee_id);
  send(res, 200, { ok: true });
});
route('POST', '/api/assignments/(\\d+)/approve', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const a = db.prepare('SELECT status FROM assignments WHERE id=?').get(+m[1]);
  if (!a) throw new HttpError(404, 'הטופס לא נמצא');
  if (b.approved && a.status !== 'submitted') throw new HttpError(400, 'ניתן לאשר רק טופס שהוגש');
  db.prepare('UPDATE assignments SET approved=? WHERE id=?').run(b.approved ? 1 : 0, +m[1]);
  send(res, 200, { ok: true });
});
route('POST', '/api/employees/(\\d+)/hire', async (req, res, m) => {
  const u = requireUser(req); const b = await readBody(req);
  const e = db.prepare('SELECT * FROM employees WHERE id=? AND archived=0').get(+m[1]);
  if (!e) throw new HttpError(404, 'עובד לא נמצא');
  if (b.undo) {
    tx(() => {
      db.prepare('UPDATE employees SET approved_at=NULL,approved_by=NULL WHERE id=?').run(e.id);
      db.prepare('UPDATE assignments SET approved=0 WHERE employee_id=?').run(e.id);
      db.prepare('UPDATE files SET approved=0 WHERE assignment_id IN (SELECT id FROM assignments WHERE employee_id=?)').run(e.id);
    });
    return send(res, 200, { ok: true });
  }
  if (!e.submitted_at || !allSubmitted(e.id)) throw new HttpError(400, 'ניתן לקלוט רק לאחר שהמועמד השלים ושלח את כל הטפסים');
  const pend = pendingExemptions(e.id);
  if (pend) throw new HttpError(400, `יש ${pend} בקשות פטור ממסמך שממתינות להחלטה. אשרו או דחו אותן לפני הקליטה.`);
  tx(() => {
    db.prepare('UPDATE assignments SET approved=1 WHERE employee_id=?').run(e.id);
    db.prepare('UPDATE files SET approved=1 WHERE assignment_id IN (SELECT id FROM assignments WHERE employee_id=?)').run(e.id);
    db.prepare('UPDATE employees SET approved_at=?,approved_by=? WHERE id=?').run(now(), u.name || u.username, e.id);
  });
  send(res, 200, { ok: true });
});
route('DELETE', '/api/assignments/(\\d+)', async (req, res, m) => {
  requireUser(req);
  const fl = db.prepare('SELECT path FROM files WHERE assignment_id=?').all(+m[1]);
  db.prepare('DELETE FROM assignments WHERE id=?').run(+m[1]);
  fl.forEach((f) => fs.rm(path.join(UPLOAD_DIR, f.path), () => {}));
  send(res, 200, { ok: true });
});
// אישור מסמך בודד על ידי משאבי אנוש (רק לאחר שהטופס הוגש)
route('POST', '/api/files/(\\d+)/approve', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const f = db.prepare('SELECT f.id,a.status FROM files f JOIN assignments a ON a.id=f.assignment_id WHERE f.id=?').get(+m[1]);
  if (!f) throw new HttpError(404, 'הקובץ לא נמצא');
  if (b.approved && f.status !== 'submitted') throw new HttpError(400, 'ניתן לאשר מסמך רק לאחר שהטופס הוגש');
  db.prepare('UPDATE files SET approved=? WHERE id=?').run(b.approved ? 1 : 0, f.id);
  send(res, 200, { ok: true });
});
route('GET', '/api/files/(\\d+)', async (req, res, m) => {
  requireUser(req);
  const f = db.prepare('SELECT * FROM files WHERE id=?').get(+m[1]);
  if (!f) throw new HttpError(404, 'הקובץ לא נמצא');
  streamUpload(res, f.path, f.mime, f.filename);
});
route('GET', '/api/export.csv', async (req, res) => {
  requireUser(req);
  const tpls = db.prepare('SELECT id,title FROM templates WHERE active=1 ORDER BY position,id').all();
  const rows = [['מס׳ עובד', 'שם', 'סטטוס', 'ת.ז.', 'תפקיד', 'מחלקה', 'טלפון', 'דוא"ל', 'תאריך תחילת עבודה', 'נוצר', ...tpls.map((t) => t.title)].map(csvCell).join(',')];
  for (const e of db.prepare('SELECT * FROM employees WHERE archived=0 ORDER BY id').all()) {
    const st = Object.fromEntries(db.prepare('SELECT template_id,status,submitted_at FROM assignments WHERE employee_id=?').all(e.id).map((a) => [a.template_id, a]));
    rows.push([e.employee_no, e.full_name, STATUS_HE[employeeRow(e).status], e.id_number, e.job_title, e.department, e.phone, e.email, e.start_date, e.created_at.slice(0, 10),
      ...tpls.map((t) => (st[t.id] ? (st[t.id].status === 'submitted' ? 'הוגש ' + st[t.id].submitted_at.slice(0, 10) : 'ממתין') : '-'))].map(csvCell).join(','));
  }
  send(res, 200, '﻿' + rows.join('\r\n'), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="employees.csv"' });
});

// פטור ממסמך (admin)
route('GET', '/api/exemptions', async (req, res) => {
  requireUser(req);
  const out = [];
  for (const a of db.prepare("SELECT a.id,a.exemptions,a.template_id,e.id eid,e.full_name FROM assignments a JOIN employees e ON e.id=a.employee_id WHERE a.exemptions!='{}' AND e.archived=0").all()) {
    const t = parseTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id));
    for (const [k, ex] of Object.entries(JSON.parse(a.exemptions))) {
      const f = t.fields.find((x) => x.key === k);
      out.push({ assignment_id: a.id, employee_id: a.eid, employee: a.full_name, template: t.title, field_key: k, field: f ? f.label : k, ...ex });
    }
  }
  out.sort((x, y) => (x.status === 'pending' ? 0 : 1) - (y.status === 'pending' ? 0 : 1) || String(y.at).localeCompare(String(x.at)));
  send(res, 200, out);
});
route('POST', '/api/exemptions/(\\d+)/decide', async (req, res, m) => {
  requireUser(req); const b = await readBody(req);
  const a = db.prepare('SELECT * FROM assignments WHERE id=?').get(+m[1]);
  const ex = JSON.parse(a?.exemptions || '{}');
  if (!ex[b.field] || !['approved', 'rejected'].includes(b.decision)) throw new HttpError(400, 'בקשה לא תקינה');
  ex[b.field].status = b.decision; ex[b.field].decided_at = now();
  db.prepare('UPDATE assignments SET exemptions=?,updated_at=? WHERE id=?').run(JSON.stringify(ex), now(), a.id);
  if (b.decision === 'rejected') { db.prepare("UPDATE assignments SET status='pending',approved=0,submitted_at=NULL WHERE id=?").run(a.id); db.prepare('UPDATE files SET approved=0 WHERE assignment_id=?').run(a.id); unsubmit(a.employee_id); } // חוזר לעובד להשלמה
  send(res, 200, { ok: true });
});

// הרשמה עצמית של מועמד (ציבורי)
route('GET', '/api/apply/info', async (req, res) => send(res, 200, { company: setting('company_name'), line: setting('company_line'), enabled: setting('apply_enabled') === '1' }));
route('POST', '/api/apply', async (req, res) => {
  if (setting('apply_enabled') !== '1') throw new HttpError(403, 'ההרשמה העצמית סגורה כרגע. פנו אל משאבי אנוש.');
  limit('apply', clientIp(req), 40, 3600e3, 'יותר מדי ניסיונות. נסו שוב מאוחר יותר');
  const b = await readBody(req);
  const f = empFields({ ...b, job_title: '', department: '' });
  if (f[0].split(/\s+/).filter(Boolean).length < 2) throw new HttpError(400, 'יש להזין שם פרטי ושם משפחה');
  if (!validIsraeliId(f[1])) throw new HttpError(400, 'מספר תעודת זהות לא תקין');
  if (!f[2]) throw new HttpError(400, 'יש לבחור מגדר');
  if (f[3].replace(/\D/g, '').length < 9) throw new HttpError(400, 'מספר טלפון לא תקין');
  const id = normId(f[1]);
  if (db.prepare('SELECT 1 FROM employees WHERE id_number=? AND archived=0').get(id)) throw new HttpError(409, 'כבר נפתח תיק עם תעודת זהות זו. השתמשו בקישור שנשלח אליכם, או פנו אל משאבי אנוש.');
  const emp = tx(() => {
    const r = db.prepare("INSERT INTO employees(token,full_name,id_number,gender,phone,email,source) VALUES(?,?,?,?,?,?,'apply')").run(rand(18), f[0], id, f[2], f[3], f[4]);
    assignTemplates(Number(r.lastInsertRowid), defaultTemplateIds(f[2]), f[2]);
    return db.prepare('SELECT token FROM employees WHERE id=?').get(Number(r.lastInsertRowid));
  });
  send(res, 200, { token: emp.token });
});

// employee-facing (token)
const empByToken = (t) => {
  const e = db.prepare('SELECT * FROM employees WHERE token=? AND archived=0').get(t);
  if (!e) throw new HttpError(404, 'הקישור אינו תקף');
  return e;
};
route('GET', '/api/e/([a-f0-9]+)', async (req, res, m) => {
  const e = empByToken(m[1]);
  if (!e.opened_at && !getUser(req)) { db.prepare('UPDATE employees SET opened_at=? WHERE id=?').run(now(), e.id); broadcast(); }
  const as = db.prepare('SELECT a.* FROM assignments a JOIN templates t ON t.id=a.template_id WHERE a.employee_id=? ORDER BY t.position,t.id').all(e.id);
  send(res, 200, { employee: { full_name: e.full_name, job_title: e.job_title, department: e.department, start_date: e.start_date, ...prefillFor(e) },
    submitted_at: e.submitted_at, approved: !!e.approved_at, company: setting('company_name'), assignments: as.map(assignmentView) });
});
// הגשה סופית של תיק הקליטה למשאבי אנוש: רק אחרי שכל הטפסים הוגשו ועברו בדיקה
route('POST', '/api/e/([a-f0-9]+)/submit', async (req, res, m) => {
  const e = empByToken(m[1]);
  if (e.submitted_at) return send(res, 200, { ok: true, submitted_at: e.submitted_at });
  if (!allSubmitted(e.id)) throw new HttpError(400, 'יש להשלים ולהגיש את כל הטפסים לפני השליחה למשאבי אנוש');
  const pend = db.prepare("SELECT exemptions FROM assignments WHERE employee_id=? AND exemptions!='{}'").all(e.id)
    .some((a) => Object.values(JSON.parse(a.exemptions)).some((x) => x.status === 'rejected'));
  if (pend) throw new HttpError(400, 'בקשת פטור נדחתה. יש להעלות את המסמך החסר');
  const at = now();
  db.prepare('UPDATE employees SET submitted_at=? WHERE id=?').run(at, e.id);
  sendPackage(e.id).then(broadcast).catch(() => {});
  send(res, 200, { ok: true, submitted_at: at });
});
route('GET', '/api/e/([a-f0-9]+)/manifest.json', async (req, res, m) => {
  const e = empByToken(m[1]);
  send(res, 200, { name: 'קליטת עובדים', short_name: 'קליטה', lang: 'he', dir: 'rtl', start_url: `/e/${m[1]}`, scope: '/e/', display: 'standalone',
    background_color: '#f4f5fb', theme_color: '#4f46e5', description: 'טפסי קליטה עבור ' + e.full_name,
    icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] },
  { 'Content-Type': 'application/manifest+json; charset=utf-8' });
});
function ownAssignment(token, tplId) {
  const e = empByToken(token);
  const a = db.prepare('SELECT * FROM assignments WHERE employee_id=? AND template_id=?').get(e.id, +tplId);
  if (!a) throw new HttpError(404, 'הטופס לא נמצא');
  return { e, a };
}
route('PUT', '/api/e/([a-f0-9]+)/forms/(\\d+)', async (req, res, m) => {
  const { e, a } = ownAssignment(m[1], m[2]);
  if (a.status === 'submitted') throw new HttpError(409, 'הטופס כבר הוגש');
  const b = await readBody(req);
  const tpl = parseTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id));
  const data = sanitizeData(tpl, b.data || {});
  candidateEdit(e);
  if (b.submit) {
    const files = db.prepare('SELECT field_key FROM files WHERE assignment_id=?').all(a.id);
    const errors = validateSubmission(tpl, data, files, JSON.parse(a.exemptions || '{}'));
    if (Object.keys(errors).length) return send(res, 422, { error: 'יש למלא את כל שדות החובה', errors });
    db.prepare("UPDATE assignments SET data=?,status='submitted',submitted_at=?,updated_at=?,submit_ip=? WHERE id=?").run(JSON.stringify(data), now(), now(), clientIp(req), a.id);
    // סנכרון נתוני העובד מהטופס, והתאמת טפסים מותנים למגדר
    const g = data.gender === 'גבר' ? 'male' : data.gender === 'אישה' ? 'female' : null;
    if (g) {
      db.prepare('UPDATE employees SET gender=? WHERE id=?').run(g, e.id);
      assignTemplates(e.id, defaultTemplateIds(g), g);
      if (g !== 'male') db.prepare("DELETE FROM assignments WHERE employee_id=? AND status='pending' AND data='{}' AND template_id IN (SELECT id FROM templates WHERE gender_rule='male')").run(e.id);
    }
    if (data.id_number && validIsraeliId(data.id_number) && !e.id_number) db.prepare('UPDATE employees SET id_number=? WHERE id=?').run(normId(data.id_number), e.id);
  } else {
    db.prepare('UPDATE assignments SET data=?,updated_at=? WHERE id=?').run(JSON.stringify(data), now(), a.id);
  }
  send(res, 200, { ok: true });
});
route('POST', '/api/e/([a-f0-9]+)/forms/(\\d+)/files', async (req, res, m) => {
  const { e, a } = ownAssignment(m[1], m[2]);
  if (a.status === 'submitted') throw new HttpError(409, 'הטופס כבר הוגש');
  const b = await readBody(req);
  const tpl = parseTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id));
  if (!tpl.fields.some((f) => f.key === b.field && f.type === 'file')) throw new HttpError(400, 'שדה קובץ לא קיים');
  candidateEdit(e);
  send(res, 200, saveFile(a.id, b.field, b));
});
route('POST', '/api/e/([a-f0-9]+)/forms/(\\d+)/exempt', async (req, res, m) => {
  const { e, a } = ownAssignment(m[1], m[2]);
  if (a.status === 'submitted') throw new HttpError(409, 'הטופס כבר הוגש');
  const b = await readBody(req);
  const tpl = parseTpl(db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id));
  if (!tpl.fields.some((f) => f.key === b.field && f.type === 'file' && f.allow_exempt)) throw new HttpError(400, 'לא ניתן לבקש פטור לשדה זה');
  candidateEdit(e);
  const ex = JSON.parse(a.exemptions || '{}');
  if (b.cancel) delete ex[b.field];
  else {
    const reason = String(b.reason || '').trim().slice(0, 300);
    if (reason.length < 2) throw new HttpError(400, 'יש לציין סיבה');
    ex[b.field] = { reason, status: 'pending', at: now() };
  }
  db.prepare('UPDATE assignments SET exemptions=?,updated_at=? WHERE id=?').run(JSON.stringify(ex), now(), a.id);
  send(res, 200, { ok: true, exemption: ex[b.field] || null });
});
route('GET', '/api/e/([a-f0-9]+)/files/(\\d+)', async (req, res, m) => {
  const e = empByToken(m[1]);
  const f = db.prepare('SELECT f.* FROM files f JOIN assignments a ON a.id=f.assignment_id WHERE f.id=? AND a.employee_id=?').get(+m[2], e.id);
  if (!f) throw new HttpError(404, 'הקובץ לא נמצא');
  streamUpload(res, f.path, f.mime, f.filename);
});
route('GET', '/api/e/([a-f0-9]+)/docs/([a-z0-9.-]+)', async (req, res, m) => { empByToken(m[1]); streamDoc(res, m[2]); });
route('GET', '/api/e/([a-f0-9]+)/templates/(\\d+)/attachment', async (req, res, m) => {
  const { a } = ownAssignment(m[1], m[2]);
  const t = db.prepare('SELECT * FROM templates WHERE id=?').get(a.template_id);
  if (!t.attachment_path) throw new HttpError(404, 'אין קובץ');
  streamUpload(res, t.attachment_path, t.attachment_mime, t.attachment_name, false);
});

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };
function serveStatic(req, res, pathname) {
  const file = pathname === '/' || pathname === '/admin' ? '/admin.html' : pathname === '/apply' || pathname === '/apply/' ? '/apply.html'
    : /^\/e\/[a-f0-9]+\/?$/.test(pathname) ? '/app.html' : pathname;
  const p = path.normalize(path.join(PUBLIC_DIR, file));
  if (!p.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(p) || !fs.statSync(p).isFile()) return send(res, 404, 'Not found');
  const ext = path.extname(p);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache', 'Referrer-Policy': 'no-referrer',
    ...(file === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
  fs.createReadStream(p).pipe(res);
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        const o = req.headers.origin;
        if (o && new URL(o).host !== req.headers.host) throw new HttpError(403, 'מקור לא מורשה');
      }
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(pathname);
        if (!m) continue;
        await r.fn(req, res, m);
        if (req.method !== 'GET' && !['/api/login', '/api/logout', '/api/password'].includes(pathname)) broadcast();
        return;
      }
      throw new HttpError(404, 'לא נמצא');
    }
    if (req.method !== 'GET') throw new HttpError(405, 'Method not allowed');
    serveStatic(req, res, pathname);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (!res.headersSent) send(res, e.code || 500, { error: e instanceof HttpError ? e.message : 'שגיאת שרת' });
  }
});
server.keepAliveTimeout = 65000;
server.listen(PORT, '0.0.0.0', () => console.log(`שרת קליטת עובדים פעיל: http://localhost:${PORT}`));
process.on('SIGTERM', () => { server.close(); db.close(); process.exit(0); });
module.exports = { server };
