'use strict';
/**
 * שולח מייל SMTP מינימלי ללא תלויות (SSL ישיר בפורט 465 או STARTTLS בפורט 587).
 * תומך בגוף HTML, תמונות מוטמעות (cid) וקבצים מצורפים.
 */
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

const b64 = (b) => Buffer.from(b).toString('base64').replace(/(.{76})/g, '$1\r\n');
const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const addr = (s) => (/<(.+)>/.exec(s) || [, s])[1].trim();

function buildMessage({ from, to, subject, html, text, inline = [], attachments = [] }) {
  const id = crypto.randomBytes(8).toString('hex');
  const mixed = 'mix' + id, rel = 'rel' + id, alt = 'alt' + id;
  const fromHdr = /<.+>/.test(from) ? from.replace(/^(.*?)\s*</, (m, n) => (n ? enc(n.replace(/"/g, '')) + ' <' : '<')) : from;
  const L = [];
  L.push(`From: ${fromHdr}`, `To: ${to}`, `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}@onboarding.local>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${mixed}"`, '');
  L.push(`--${mixed}`, `Content-Type: multipart/related; boundary="${rel}"`, '');
  L.push(`--${rel}`, `Content-Type: multipart/alternative; boundary="${alt}"`, '');
  L.push(`--${alt}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text || subject));
  L.push(`--${alt}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html), `--${alt}--`);
  for (const p of inline) L.push(`--${rel}`, `Content-Type: ${p.mime}; name="${p.cid}"`, 'Content-Transfer-Encoding: base64', `Content-ID: <${p.cid}>`, 'Content-Disposition: inline', '', b64(p.data));
  L.push(`--${rel}--`);
  for (const a of attachments) {
    const name = `=?UTF-8?B?${Buffer.from(a.filename, 'utf8').toString('base64')}?=`;
    L.push(`--${mixed}`, `Content-Type: ${a.mime}; name="${name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${name}"`, '', b64(a.data));
  }
  L.push(`--${mixed}--`, '');
  return L.join('\r\n');
}

function smtpSend(cfg, msg) {
  const { host, port = 465, user, pass, from, to } = cfg;
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiter = null, done = false;
    const fail = (e) => { if (done) return; done = true; try { sock && sock.destroy(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); };
    const timer = setTimeout(() => fail(new Error('תם הזמן בשליחת המייל')), 45000);
    const onData = (d) => {
      buf += d.toString('utf8');
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) {
        const reply = lines.slice(0, i + 1).join('\n'); buf = lines.slice(i + 1).join('\r\n');
        if (waiter) { const w = waiter; waiter = null; w(reply); }
        return;
      }
    };
    const read = () => new Promise((r) => { waiter = r; onData(''); });
    const cmd = async (c, ok) => {
      if (c !== null) sock.write(c + '\r\n');
      const r = await read();
      if (!ok.includes(+r.slice(0, 3))) throw new Error('SMTP: ' + r.split('\n').pop());
      return r;
    };
    const attach = (s) => { sock = s; s.on('data', onData); s.on('error', fail); s.on('close', () => !done && fail(new Error('החיבור לשרת המייל נסגר'))); };
    (async () => {
      const implicit = +port === 465;
      if (implicit) { attach(tls.connect({ host, port: +port, servername: host })); await new Promise((r, j) => sock.once('secureConnect', r).once('error', j)); }
      else { attach(net.connect({ host, port: +port })); await new Promise((r, j) => sock.once('connect', r).once('error', j)); }
      await cmd(null, [220]);
      await cmd('EHLO onboarding.local', [250]);
      if (!implicit) {
        await cmd('STARTTLS', [220]);
        sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error');
        const plain = sock; buf = '';
        attach(tls.connect({ socket: plain, servername: host }));
        await new Promise((r, j) => sock.once('secureConnect', r).once('error', j));
        await cmd('EHLO onboarding.local', [250]);
      }
      if (user) {
        await cmd('AUTH LOGIN', [334]);
        await cmd(Buffer.from(user).toString('base64'), [334]);
        await cmd(Buffer.from(pass || '').toString('base64'), [235]);
      }
      await cmd(`MAIL FROM:<${addr(from)}>`, [250]);
      for (const t of String(to).split(',')) await cmd(`RCPT TO:<${addr(t)}>`, [250, 251]);
      await cmd('DATA', [354]);
      sock.write(msg.replace(/^\./gm, '..') + '\r\n.\r\n');
      await cmd(null, [250]);
      sock.write('QUIT\r\n');
      done = true; clearTimeout(timer); sock.end(); resolve(true);
    })().catch((e) => { clearTimeout(timer); fail(e); });
  });
}

async function sendMail(cfg, mail) {
  if (!cfg.host) throw new Error('שרת המייל (SMTP) לא הוגדר');
  const to = mail.to; if (!to) throw new Error('לא הוגדרה כתובת מייל של משאבי אנוש');
  const from = cfg.from || cfg.user;
  return smtpSend({ ...cfg, from, to }, buildMessage({ ...mail, from, to }));
}

module.exports = { sendMail, buildMessage };
