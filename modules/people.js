'use strict';
/**
 * עובדים פעילים: סטטוס העסקה, הערות וקבוצות מותאמות אישית (מחלקה וירטואלית, משמרת, פרויקט וכו').
 * עובד נכנס לספריית העובדים הפעילים אוטומטית ברגע שמשאבי אנוש אישרו את קליטתו (approved_at).
 */
const EMPLOYMENT = ['active', 'leave', 'notice', 'ended'];
const COLORS = ['#00c875', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#ff158a', '#9cd326', '#66ccff', '#784bd1', '#7f5347'];

module.exports = function people({ db, route, requireUser, readBody, send, HttpError, tx }) {
  // שתי יצירות במקביל עם אותו שם נתקלות באילוץ UNIQUE: מחזירים 409 במקום שגיאת שרת
  const uniqueName = (fn) => { try { return fn(); } catch (e) { if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'כבר קיימת קבוצה בשם הזה'); throw e; } };
  db.exec(`
CREATE TABLE IF NOT EXISTS emp_groups(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT DEFAULT '#579bfc', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS emp_group_members(
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  group_id INTEGER NOT NULL REFERENCES emp_groups(id) ON DELETE CASCADE, PRIMARY KEY(employee_id, group_id));
CREATE INDEX IF NOT EXISTS ix_egm_group ON emp_group_members(group_id);
`);
  const cleanName = (v) => String(v || '').trim().slice(0, 40);
  const cleanColor = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v : COLORS[db.prepare('SELECT COUNT(*) n FROM emp_groups').get().n % COLORS.length]);
  const groupExists = (id) => { if (!db.prepare('SELECT 1 FROM emp_groups WHERE id=?').get(id)) throw new HttpError(404, 'הקבוצה לא נמצאה'); };

  route('GET', '/api/groups', async (req, res) => {
    requireUser(req);
    send(res, 200, db.prepare(`SELECT g.id,g.name,g.color,COUNT(e.id) count FROM emp_groups g
      LEFT JOIN emp_group_members m ON m.group_id=g.id LEFT JOIN employees e ON e.id=m.employee_id AND e.archived=0
      GROUP BY g.id ORDER BY g.name`).all());
  });
  route('POST', '/api/groups', async (req, res) => {
    requireUser(req); const b = await readBody(req);
    const name = cleanName(b.name);
    if (!name) throw new HttpError(400, 'יש לתת שם לקבוצה');
    if (db.prepare('SELECT 1 FROM emp_groups WHERE name=?').get(name)) throw new HttpError(409, 'כבר קיימת קבוצה בשם הזה');
    const r = uniqueName(() => db.prepare('INSERT INTO emp_groups(name,color) VALUES(?,?)').run(name, cleanColor(b.color)));
    send(res, 200, { id: Number(r.lastInsertRowid) });
  });
  route('PUT', '/api/groups/(\\d+)', async (req, res, m) => {
    requireUser(req); const b = await readBody(req);
    groupExists(+m[1]);
    const name = cleanName(b.name);
    if (!name) throw new HttpError(400, 'יש לתת שם לקבוצה');
    if (db.prepare('SELECT 1 FROM emp_groups WHERE name=? AND id!=?').get(name, +m[1])) throw new HttpError(409, 'כבר קיימת קבוצה בשם הזה');
    uniqueName(() => db.prepare('UPDATE emp_groups SET name=?,color=? WHERE id=?').run(name, cleanColor(b.color), +m[1]));
    send(res, 200, { ok: true });
  });
  route('DELETE', '/api/groups/(\\d+)', async (req, res, m) => {
    requireUser(req);
    db.prepare('DELETE FROM emp_groups WHERE id=?').run(+m[1]);
    send(res, 200, { ok: true });
  });
  // שיוך או הסרה של כמה עובדים לקבוצה בבת אחת (מתוך בחירה מרובה בספריית העובדים)
  route('POST', '/api/groups/(\\d+)/members', async (req, res, m) => {
    requireUser(req); const b = await readBody(req);
    groupExists(+m[1]);
    const ids = (Array.isArray(b.employee_ids) ? b.employee_ids : []).map(Number).filter(Number.isInteger).slice(0, 1000);
    const stmt = b.remove ? db.prepare('DELETE FROM emp_group_members WHERE employee_id=? AND group_id=?')
      : db.prepare('INSERT OR IGNORE INTO emp_group_members(employee_id,group_id) SELECT id,? FROM employees WHERE id=? AND archived=0');
    tx(() => ids.forEach((id) => (b.remove ? stmt.run(id, +m[1]) : stmt.run(+m[1], id))));
    send(res, 200, { ok: true });
  });

  // כרטיס עובד: סטטוס העסקה, הערות וקבוצות
  route('POST', '/api/employees/(\\d+)/profile', async (req, res, m) => {
    requireUser(req); const b = await readBody(req);
    const e = db.prepare('SELECT id FROM employees WHERE id=? AND archived=0').get(+m[1]);
    if (!e) throw new HttpError(404, 'עובד לא נמצא');
    tx(() => {
      if (b.employment_status !== undefined) {
        if (!EMPLOYMENT.includes(b.employment_status)) throw new HttpError(400, 'סטטוס העסקה לא תקין');
        db.prepare('UPDATE employees SET employment_status=? WHERE id=?').run(b.employment_status, e.id);
      }
      if (b.notes !== undefined) db.prepare('UPDATE employees SET notes=? WHERE id=?').run(String(b.notes).slice(0, 2000), e.id);
      if (Array.isArray(b.group_ids)) {
        db.prepare('DELETE FROM emp_group_members WHERE employee_id=?').run(e.id);
        const ins = db.prepare('INSERT OR IGNORE INTO emp_group_members(employee_id,group_id) SELECT ?,id FROM emp_groups WHERE id=?');
        b.group_ids.map(Number).forEach((g) => ins.run(e.id, g));
      }
    });
    send(res, 200, { ok: true });
  });
};
