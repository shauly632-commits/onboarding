/* רכיבי טפסים משותפים: הצגת שדות, חתימה, העלאת קבצים, ולידציה */
(function () {
  const $e = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && n.append(c));
    return n;
  };

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
    const status = $e('div', { class: 'muted', style: 'margin-top:8px' });
    const holder = $e('div');
    const exBox = $e('div', { class: 'exempt' });
    const show = (m) => { status.textContent = ''; status.append('✓ הועלה: ' + (m.filename || 'קובץ') + ' ');
      if (opts.fileUrl) status.append($e('a', { href: opts.fileUrl(m.id), target: '_blank', text: 'צפייה' })); };
    if (existing && existing.id) show(existing);
    const drawEx = () => {
      exBox.textContent = '';
      if (!f.allow_exempt || !opts.exempt) return;
      if (exemption) {
        const st = { approved: 'אושר', rejected: 'נדחה', pending: 'ממתין לאישור משאבי אנוש' }[exemption.status] || '';
        exBox.append($e('div', { class: 'box' }, '📝 בקשת פטור ממסמך זה (' + st + '): ' + exemption.reason + ' ',
          $e('button', { type: 'button', text: 'ביטול הבקשה', onclick: async () => { try { await opts.exempt(f.key, { cancel: true }); exemption = null; onExempt(null); drawEx(); } catch (e) { alert(e.message); } } })));
      } else if (!(existing && existing.id)) {
        exBox.append($e('button', { type: 'button', text: 'אין לי מסמך זה', onclick: async () => {
          const reason = prompt('מדוע אין לכם את המסמך? (הבקשה תועבר לאישור משאבי אנוש)');
          if (!reason || reason.trim().length < 2) return;
          try { const r = await opts.exempt(f.key, { reason }); exemption = r.exemption; onExempt(exemption); drawEx(); } catch (e) { alert(e.message); }
        } }));
      }
    };
    drawEx();
    const input = $e('input', { type: 'file', accept: 'image/*,application/pdf', style: 'width:100%' });
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      status.textContent = 'מעלה...'; holder.textContent = '';
      try {
        const p = await prepareFile(file);
        const meta = await opts.upload(f.key, { filename: file.name, mime: p.mime, data: p.data });
        existing = meta; exemption = null; onExempt(null); drawEx();
        show({ ...meta, filename: file.name }); onUploaded();
        if (p.preview) holder.append($e('img', { src: p.preview, alt: '' }));
      } catch (e) { status.textContent = ''; status.append($e('span', { style: 'color:var(--err)', text: e.message || 'ההעלאה נכשלה' })); }
    });
    return $e('div', { class: 'filebox' }, $e('div', { class: 'muted', text: 'צילום או בחירת קובץ (תמונה / PDF)' }), input, status, holder, exBox);
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
    let timer;
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => opts.onChange && opts.onChange(vals), 700); };
    const flush = () => { clearTimeout(timer); return opts.onChange && opts.onChange(vals); };

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
          f.download ? $e('a', { href: opts.docUrl(f.download), target: '_blank', class: 'btn sec sm', style: 'margin-inline-start:10px', text: '⬇ הורדת PDF' }) : null, dv));
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

  window.Forms = { $e, render, validIsraeliId };
})();
