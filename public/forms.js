/* רכיבי טפסים משותפים: הצגת שדות, חתימה, העלאת קבצים, ולידציה */
(function () {
  // ---------- אייקונים (בסגנון Lucide, SVG מוטמע ללא תלות חיצונית) ----------
  const P = {
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    userCheck: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7"/><path d="M12 7v4"/><path d="M16 7v9"/>',
    back: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    next: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    idcard: '<rect width="20" height="16" x="2" y="4" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M5 17c.5-1.5 1.7-2 3-2s2.5.5 3 2"/><path d="M14 10h5"/><path d="M14 14h3"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    install: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 7v7"/><path d="m9 11 3 3 3-3"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  };
  const icon = (name, cls = '') => {
    const t = document.createElement('template');
    t.innerHTML = `<svg class="i ${name === 'loader' ? 'spin ' : ''}${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
    return t.content.firstChild;
  };
  const $e = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'icon') continue;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && n.append(c));
    if (props.icon) n.prepend(icon(props.icon));
    return n;
  };
  // כפתור במצב טעינה: מציג ספינר ונועל את הכפתור עד לסיום הפעולה
  async function busy(btn, fn) {
    const keep = [...btn.childNodes];
    btn.disabled = true; btn.classList.add('loading'); btn.prepend(icon('loader'));
    try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('loading'); btn.replaceChildren(...keep); }
  }

  function validIsraeliId(v) {
    const s = String(v || '').replace(/\D/g, '');
    if (s.length < 5 || s.length > 9) return false;
    const p = s.padStart(9, '0');
    let sum = 0;
    for (let i = 0; i < 9; i++) { let n = +p[i] * ((i % 2) + 1); if (n > 9) n -= 9; sum += n; }
    return sum % 10 === 0;
  }
  const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ---------- חתימה ----------
  function sigPad(initial, onChange) {
    const cv = $e('canvas');
    const ph = $e('div', { class: 'ph', text: 'חתמו כאן באצבע או בעכבר' });
    const box = $e('div', { class: 'sigbox' }, cv, ph);
    const ctx = cv.getContext('2d');
    let drawing = false, points = 0, saved = initial || '';
    function setup() {
      const r = cv.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(170 * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      if (saved) { const im = new Image(); im.onload = () => { ctx.drawImage(im, 0, 0, r.width, 170); ph.style.display = 'none'; }; im.src = saved; }
    }
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; ph.style.display = 'none'; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.01, y + 0.01); ctx.stroke(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); points++; });
    const end = () => { if (!drawing) return; drawing = false; if (points > 8) { saved = cv.toDataURL('image/png'); onChange(saved); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    new ResizeObserver(() => { if (!drawing) setup(); }).observe(box);
    const clear = $e('button', { type: 'button', class: 'btn ghost sm', style: 'margin-top:8px', text: 'ניקוי חתימה', onclick: () => { saved = ''; points = 0; setup(); ctx.clearRect(0, 0, cv.width, cv.height); ph.style.display = ''; onChange(''); } });
    return $e('div', {}, box, clear);
  }

  // ---------- קבצים ----------
  const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function prepareFile(file) {
    if (file.type === 'application/pdf') return { mime: file.type, data: await toB64(file), preview: null };
    if (!file.type.startsWith('image/')) throw new Error('יש להעלות תמונה או PDF');
    try {
      const bmp = await createImageBitmap(file);
      const max = 1800, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      return { mime: 'image/jpeg', data: await toB64(blob), preview: URL.createObjectURL(blob) };
    } catch { return { mime: file.type, data: await toB64(file), preview: null }; }
  }
  function fileField(f, existing, opts, onUploaded, exemption, onExempt) {
    const exBox = $e('div', { class: 'exempt' });
    const input = $e('input', { type: 'file', accept: 'image/*,application/pdf', class: 'sr' });
    const drop = $e('div', { class: 'drop', role: 'button', tabindex: 0, 'aria-label': (f.label || 'קובץ') + ': העלאת קובץ' });
    let preview = null;
    // מצב ריק: אזור גרירה. מצב מלא: כרטיס קובץ עם תצוגה מקדימה והחלפה
    const draw = (state, msg) => {
      drop.textContent = ''; drop.className = 'drop' + (state ? ' ' + state : '');
      if (state === 'busy') { drop.append(icon('loader', 'lg'), $e('b', { text: 'מעלה את הקובץ...' })); return; }
      if (existing && existing.id) {
        const thumb = preview || (opts.fileUrl && /^image\//.test(existing.mime || 'image/') ? opts.fileUrl(existing.id) : null);
        drop.classList.add('has');
        drop.append(thumb && existing.mime !== 'application/pdf' ? $e('img', { src: thumb, alt: '' }) : $e('span', { class: 'fic' }, icon('file')),
          $e('span', { class: 'meta' }, $e('b', { icon: 'checkCircle', text: 'הקובץ הועלה' }), $e('small', { class: 'muted', text: existing.filename || 'קובץ' }),
            opts.fileUrl ? $e('a', { href: opts.fileUrl(existing.id), target: '_blank', text: 'צפייה', onclick: (e) => e.stopPropagation() }) : ''),
          $e('span', { class: 'btn ghost sm', icon: 'refresh', text: 'החלפה' }));
        return;
      }
      drop.append($e('span', { class: 'dic' }, icon('upload')), $e('b', { text: 'גררו קובץ לכאן או לחצו לבחירה' }),
        $e('small', { class: 'muted', text: 'בטלפון אפשר לצלם ישירות · תמונה או PDF עד 10MB' }));
      if (msg) drop.append($e('small', { class: 'dropErr', icon: 'alert', text: msg }));
    };
    const drawEx = () => {
      exBox.textContent = '';
      if (!f.allow_exempt || !opts.exempt) return;
      if (exemption) {
        const st = { approved: 'אושר', rejected: 'נדחה', pending: 'ממתין לאישור משאבי אנוש' }[exemption.status] || '';
        exBox.append($e('div', { class: 'box' }, icon('info'), ' בקשת פטור ממסמך זה (' + st + '): ' + exemption.reason + ' ',
          $e('button', { type: 'button', text: 'ביטול הבקשה', onclick: async () => { try { await opts.exempt(f.key, { cancel: true }); exemption = null; onExempt(null); drawEx(); } catch (e) { alert(e.message); } } })));
      } else if (!(existing && existing.id)) {
        exBox.append($e('button', { type: 'button', text: 'אין לי מסמך זה', onclick: async () => {
          const reason = prompt('מדוע אין לכם את המסמך? (הבקשה תועבר לאישור משאבי אנוש)');
          if (!reason || reason.trim().length < 2) return;
          try { const r = await opts.exempt(f.key, { reason }); exemption = r.exemption; onExempt(exemption); drawEx(); } catch (e) { alert(e.message); }
        } }));
      }
    };
    const handle = async (file) => {
      if (!file) return;
      if (!/^image\/|^application\/pdf$/.test(file.type)) return draw('', 'יש להעלות תמונה או PDF');
      if (file.size > 25 * 1024 * 1024) return draw('', 'הקובץ גדול מדי');
      draw('busy');
      try {
        const p = await prepareFile(file);
        const meta = await opts.upload(f.key, { filename: file.name, mime: p.mime, data: p.data });
        existing = { ...meta, filename: file.name, mime: p.mime }; preview = p.preview; exemption = null;
        onExempt(null); drawEx(); onUploaded(); draw('');
      } catch (e) { draw('', e.message || 'ההעלאה נכשלה'); }
    };
    drop.addEventListener('click', (e) => { if (e.target.closest('a') || drop.classList.contains('busy')) return; e.preventDefault(); input.click(); });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'dragend'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); handle(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { handle(input.files[0]); input.value = ''; });
    draw(''); drawEx();
    return $e('div', { class: 'filebox' }, drop, input, exBox);
  }

  // ---------- רינדור טופס ----------
  /**
   * opts: { data, files:[{id,field_key,filename}], prefill:{full_name,phone,email}, onChange(vals), upload(key,payload)->meta, fileUrl(id) }
   * מחזיר { vals, collect(), validate(), showErrors(map), hasFile(key) }
   */
  function render(container, tpl, opts) {
    container.textContent = '';
    const vals = { ...(opts.data || {}) };
    const files = new Map((opts.files || []).map((x) => [x.field_key, x]));
    const exemptions = { ...(opts.exemptions || {}) };
    const nodes = new Map();
    let timer, lastSaved = JSON.stringify(opts.data || {});
    // שומרים רק כשמשהו באמת השתנה מאז השמירה האחרונה
    const save = () => { const j = JSON.stringify(vals); if (j === lastSaved || !opts.onChange) return; lastSaved = j; return opts.onChange(vals); };
    const changed = () => { clearTimeout(timer); timer = setTimeout(save, 700); };
    const flush = () => { clearTimeout(timer); return save(); };

    for (const f of tpl.fields) {
      if (vals[f.key] === undefined) {
        if (f.default === 'today') vals[f.key] = todayStr();
        else if (f.prefill && opts.prefill && opts.prefill[f.prefill]) vals[f.key] = opts.prefill[f.prefill];
      }
      if (f.type === 'heading') { container.append($e('h3', { style: 'margin-top:22px', text: f.label })); continue; }
      if (f.type === 'paragraph') { container.append($e('div', { class: 'para', style: 'margin-top:14px', text: f.text || f.label })); continue; }
      if (f.type === 'document') {
        const dv = $e('div', { class: 'docview' });
        for (let i = 1; i <= (f.pages || 1); i++) dv.append($e('img', { src: opts.docUrl(f.doc + '-' + i + '.jpg'), alt: (f.label || 'מסמך') + ' עמוד ' + i, loading: 'lazy' }));
        container.append($e('div', { style: 'margin-top:14px' }, $e('b', { text: f.label || 'מסמך' }),
          f.download ? $e('a', { href: opts.docUrl(f.download), target: '_blank', class: 'btn sec sm', style: 'margin-inline-start:10px', icon: 'download', text: 'הורדת PDF' }) : null, dv));
        continue;
      }
      const wrap = $e('div', { class: 'field', 'data-key': f.key });
      const err = $e('div', { class: 'err-msg', hidden: true });
      const lbl = (txt) => $e('label', { class: 'f' }, txt, f.required ? $e('span', { class: 'req', text: '*' }) : null);
      let ctl;
      const bind = (el, ev = 'input') => el.addEventListener(ev, () => { vals[f.key] = el.type === 'checkbox' ? el.checked : el.value; changed(); wrap.classList.remove('invalid'); err.hidden = true; });
      switch (f.type) {
        case 'text': case 'phone': case 'email': case 'number': case 'date': case 'idnumber': {
          const t = { phone: 'tel', email: 'email', number: 'number', date: 'date' }[f.type] || 'text';
          ctl = $e('input', { type: t, value: vals[f.key] ?? '', inputmode: f.type === 'idnumber' ? 'numeric' : null, maxlength: f.type === 'idnumber' ? 9 : null,
            autocomplete: { phone: 'tel', email: 'email' }[f.type] || 'off' });
          if (['phone', 'email', 'idnumber', 'number'].includes(f.type)) ctl.setAttribute('dir', 'ltr'), ctl.style.textAlign = 'right';
          bind(ctl); wrap.append(lbl(f.label), ctl); break;
        }
        case 'textarea': ctl = $e('textarea', { rows: 3 }); ctl.value = vals[f.key] ?? ''; bind(ctl); wrap.append(lbl(f.label), ctl); break;
        case 'select': {
          ctl = $e('select', {}, $e('option', { value: '', text: 'בחרו...' }), (f.options || []).map((o) => $e('option', { value: o, text: o })));
          ctl.value = vals[f.key] ?? ''; bind(ctl, 'change'); wrap.append(lbl(f.label), ctl); break;
        }
        case 'radio': {
          const g = $e('div', { class: 'radios' });
          (f.options || []).forEach((o) => {
            const r = $e('input', { type: 'radio', name: 'r_' + f.key, value: o }); r.checked = vals[f.key] === o;
            r.addEventListener('change', () => { vals[f.key] = o; changed(); wrap.classList.remove('invalid'); err.hidden = true; });
            g.append($e('label', {}, r, o));
          });
          wrap.append(lbl(f.label), g); break;
        }
        case 'consent': {
          const c = $e('input', { type: 'checkbox' }); c.checked = !!vals[f.key]; bind(c, 'change');
          wrap.append($e('label', { class: 'consent', style: 'margin-top:14px' }, c, $e('span', {}, f.label, f.required ? $e('span', { class: 'req', style: 'color:var(--err)', text: ' *' }) : null))); break;
        }
        case 'signature': {
          wrap.append(lbl(f.label), sigPad(vals[f.key], (v) => { vals[f.key] = v; wrap.classList.remove('invalid'); err.hidden = true; flush(); })); break;
        }
        case 'file': {
          wrap.append(lbl(f.label), fileField(f, files.get(f.key), opts, () => { files.set(f.key, { field_key: f.key }); wrap.classList.remove('invalid'); err.hidden = true; },
            exemptions[f.key], (ex) => { if (ex) exemptions[f.key] = ex; else delete exemptions[f.key]; wrap.classList.remove('invalid'); err.hidden = true; })); break;
        }
      }
      wrap.append(err); nodes.set(f.key, { wrap, err });
      container.append(wrap);
    }

    function validate() {
      const errors = {};
      for (const f of tpl.fields) {
        if (['heading', 'paragraph', 'document'].includes(f.type)) continue;
        const v = vals[f.key];
        const empty = v === undefined || v === null || String(v).trim() === '' || v === false;
        if (f.type === 'file') { if (f.required && !files.has(f.key) && !(exemptions[f.key] && exemptions[f.key].status !== 'rejected')) errors[f.key] = 'חובה להעלות קובץ או לבקש פטור'; continue; }
        if (f.type === 'signature') { if (f.required && !v) errors[f.key] = 'נדרשת חתימה'; continue; }
        if (empty) { if (f.required) errors[f.key] = f.type === 'consent' ? 'יש לאשר כדי להמשיך' : 'שדה חובה'; continue; }
        if (f.type === 'idnumber' && !validIsraeliId(v)) errors[f.key] = 'מספר תעודת זהות לא תקין';
        if (f.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) errors[f.key] = 'כתובת דוא"ל לא תקינה';
        if (f.type === 'phone' && String(v).replace(/\D/g, '').length < 9) errors[f.key] = 'מספר טלפון לא תקין';
      }
      return errors;
    }
    function showErrors(errors) {
      let first = null;
      nodes.forEach(({ wrap, err }, key) => {
        if (errors[key]) { wrap.classList.add('invalid'); err.textContent = errors[key]; err.hidden = false; first = first || wrap; }
        else { wrap.classList.remove('invalid'); err.hidden = true; }
      });
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return { vals, collect: () => vals, validate, showErrors, flush };
  }

  window.Forms = { $e, icon, busy, render, validIsraeliId };
})();
