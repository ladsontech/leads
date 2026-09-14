/* ═══════════════════════════════════════════════
   LeadVault — App Logic
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Config ─────────────────────────────────
  const COUNTRY_CODE = '256';            // Uganda
  const MOBILE_RE    = /^0?(7[0-9])/;    // 070-079 -> mobile, WhatsApp-capable
  const STATUSES = [
    'Not called', 'No answer', 'Call back', 'Interested',
    'Not interested', 'Meeting booked', 'Won', 'Lost',
  ];
  const DONE_STATUSES = ['Interested', 'Meeting booked', 'Won'];

  // ── State ──────────────────────────────────
  let leads = [];
  let filteredLeads = [];
  let activeSegment = 'All';
  let activeStatus = 'All';

  // ── DOM refs ───────────────────────────────
  const uploadSection = document.getElementById('upload-section');
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const fileInputMore = document.getElementById('file-input-more');
  const toolbar = document.getElementById('toolbar');
  const searchInput = document.getElementById('search-input');
  const leadsGrid = document.getElementById('leads-grid');
  const emptyState = document.getElementById('empty-state');
  const leadCountEl = document.getElementById('lead-count');
  const btnClearAll = document.getElementById('btn-clear-all');
  const btnUploadMore = document.getElementById('btn-upload-more');
  const btnExport = document.getElementById('btn-export');
  const filtersEl = document.getElementById('filters');
  const progressEl = document.getElementById('progress-bar');
  const toastContainer = document.getElementById('toast-container');

  // ── Init ───────────────────────────────────
  loadFromStorage();
  bindEvents();

  // ── Event Bindings ─────────────────────────
  function bindEvents() {
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFile);
    fileInputMore.addEventListener('change', handleFile);

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('drag-over');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });

    searchInput.addEventListener('input', debounce(applyFilters, 200));
    btnClearAll.addEventListener('click', handleClearAll);
    btnUploadMore.addEventListener('click', () => fileInputMore.click());
    if (btnExport) btnExport.addEventListener('click', exportCSV);

    // Delegated card interactions — survives re-renders
    leadsGrid.addEventListener('click', (e) => {
      const del = e.target.closest('[data-delete]');
      if (del) { e.stopPropagation(); deleteLead(del.dataset.delete); return; }
      const dead = e.target.closest('a.action-btn.disabled');
      if (dead) {
        e.preventDefault();
        showToast(dead.dataset.why || 'Not available for this lead', 'info');
      }
    });
    leadsGrid.addEventListener('change', (e) => {
      const sel = e.target.closest('[data-status-for]');
      if (sel) updateLead(sel.dataset.statusFor, { status: sel.value });
    });
    leadsGrid.addEventListener('input', debounce((e) => {
      const note = e.target.closest('[data-note-for]');
      if (note) updateLead(note.dataset.noteFor, { notes: note.value }, true);
    }, 400));
  }

  // ── Phone helpers (Uganda) ─────────────────

  // Digits only, local form: 0772123456 / 0414267847
  function localDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith(COUNTRY_CODE)) d = '0' + d.slice(COUNTRY_CODE.length);
    else if (!d.startsWith('0') && d.length === 9) d = '0' + d;
    return d;
  }

  // wa.me wants country code + number, digits only, no '+' and no leading zero.
  function waNumber(phone) {
    const d = localDigits(phone);
    return d.startsWith('0') ? COUNTRY_CODE + d.slice(1) : d;
  }

  // tel: is happiest with full international form
  function telNumber(phone) {
    const d = localDigits(phone);
    return d.startsWith('0') ? '+' + COUNTRY_CODE + d.slice(1) : '+' + d;
  }

  // Landlines and fixed VoIP (041/039/031/020/042) cannot receive WhatsApp
  function isMobile(phone) {
    return MOBILE_RE.test(localDigits(phone));
  }

  function formatPhone(phone) {
    const d = localDigits(phone);
    if (!d) return '';
    if (d.length === 10) return d.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
    return d;
  }

  // ── File Handling ──────────────────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      showToast('Unsupported file type. Use .csv or .xlsx', 'error');
      return;
    }

    showLoading('Processing your leads...');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ext === 'csv' ? parseCSV(ev.target.result) : parseExcel(ev.target.result);

        if (!data || data.length === 0) {
          hideLoading();
          showToast('No data found in file', 'error');
          return;
        }

        const mapped = mapToLeads(data);
        const seen = new Set(leads.map(l => localDigits(l.phone)).filter(Boolean));
        const fresh = [];
        let dupes = 0;
        for (const l of mapped) {
          const key = localDigits(l.phone);
          if (key && seen.has(key)) { dupes++; continue; }
          if (key) seen.add(key);
          fresh.push(l);
        }

        leads = [...leads, ...fresh];
        saveToStorage();
        renderApp();
        hideLoading();
        showToast(
          `${fresh.length} leads imported` + (dupes ? ` · ${dupes} duplicate${dupes > 1 ? 's' : ''} skipped` : ''),
          'success'
        );
      } catch (err) {
        hideLoading();
        showToast('Error parsing file. Please check the format.', 'error');
        console.error(err);
      }
    };

    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  // ── Parsers ────────────────────────────────
  function parseCSV(text) {
    const clean = text.replace(/^﻿/, '');       // strip BOM
    const lines = clean.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.some(v => v.trim())) {
        const row = {};
        headers.forEach((h, idx) => { row[h.trim()] = (values[idx] || '').trim(); });
        rows.push(row);
      }
    }
    return rows;
  }

  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  // Workbooks often lead with a Summary sheet — pick the one that holds the data.
  function pickSheet(workbook) {
    const named = workbook.SheetNames.find(n => /lead|call|contact|prospect|data/i.test(n));
    if (named) return named;
    return workbook.SheetNames.reduce((best, n) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[n]).length;
      return rows > best.rows ? { name: n, rows } : best;
    }, { name: workbook.SheetNames[0], rows: -1 }).name;
  }

  function parseExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[pickSheet(workbook)];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // ── Data Mapping ───────────────────────────
  function mapToLeads(data) {
    if (!data.length) return [];

    const headers = Object.keys(data[0]);
    const m = detectColumns(headers);

    return data.map((row, i) => {
      const phone = getVal(row, m.phone) || getVal(row, m.phoneAlt);
      const status = getVal(row, m.status);
      return {
        id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 7),
        name: getVal(row, m.name) || 'Unknown',
        phone: phone ? telNumber(phone) : '',
        email: getVal(row, m.email) || '',
        company: getVal(row, m.company) || '',
        segment: getVal(row, m.segment) || '',
        area: getVal(row, m.area) || '',
        address: getVal(row, m.address) || '',
        priority: getVal(row, m.priority) || '',
        reviews: getVal(row, m.reviews) || '',
        mapsUrl: getVal(row, m.mapsUrl) || '',
        status: STATUSES.includes(status) ? status : 'Not called',
        notes: getVal(row, m.notes) || '',
      };
    }).filter(l => (l.name && l.name !== 'Unknown') || l.phone || l.email);
  }

  function detectColumns(headers) {
    const lower = headers.map(h => h.toLowerCase().trim());
    const f = (...c) => findBestMatch(headers, lower, c);

    return {
      name:     f('name', 'business name', 'full name', 'fullname', 'contact', 'contact name', 'lead name', 'first name', 'person'),
      phone:    f('phone', 'mobile', 'tel', 'telephone', 'cell', 'phone number', 'contact number', 'whatsapp', 'number'),
      phoneAlt: f('phonelocal', 'phone (local)', 'phone local'),
      email:    f('email', 'e-mail', 'mail', 'email address'),
      company:  f('company', 'organization', 'organisation', 'business', 'company name', 'firm'),
      segment:  f('segment', 'type', 'industry', 'sector', 'category'),
      area:     f('area', 'location', 'district', 'region', 'city', 'town'),
      address:  f('address', 'street'),
      priority: f('priority', 'tier', 'rank'),
      reviews:  f('reviews', 'review count', 'rating count'),
      mapsUrl:  f('mapsurl', 'maps link', 'maps url', 'map', 'google maps'),
      status:   f('status', 'call status', 'outcome', 'stage'),
      notes:    f('notes', 'note', 'comment', 'comments', 'remarks'),
    };
  }

  function findBestMatch(headers, lowerHeaders, candidates) {
    for (const c of candidates) {
      const idx = lowerHeaders.indexOf(c);
      if (idx !== -1) return headers[idx];
    }
    for (const c of candidates) {
      const idx = lowerHeaders.findIndex(h => h.includes(c));
      if (idx !== -1) return headers[idx];
    }
    return null;
  }

  function getVal(row, key) {
    if (!key) return '';
    return String(row[key] ?? '').trim();
  }

  // ── Rendering ──────────────────────────────
  function renderApp() {
    const hasLeads = leads.length > 0;

    uploadSection.style.display = hasLeads ? 'none' : '';
    toolbar.style.display = hasLeads ? '' : 'none';
    emptyState.style.display = 'none';

    if (!hasLeads) {
      leadsGrid.innerHTML = '';
      leadCountEl.textContent = '0 leads';
      if (filtersEl) filtersEl.innerHTML = '';
      if (progressEl) progressEl.innerHTML = '';
      return;
    }

    renderFilters();
    renderProgress();
    applyFilters();
  }

  function segments() {
    return [...new Set(leads.map(l => l.segment).filter(Boolean))].sort();
  }

  function renderFilters() {
    if (!filtersEl) return;
    const segs = segments();
    const chip = (label, val, group, count) =>
      `<button class="chip ${ (group === 'seg' ? activeSegment : activeStatus) === val ? 'active' : '' }"
         data-group="${group}" data-val="${escapeHtml(val)}">
         ${escapeHtml(label)}<span class="chip-count">${count}</span>
       </button>`;

    let html = '';
    if (segs.length > 1) {
      html += `<div class="chip-row">` +
        chip('All', 'All', 'seg', leads.length) +
        segs.map(s => chip(shortSegment(s), s, 'seg', leads.filter(l => l.segment === s).length)).join('') +
        `</div>`;
    }
    const used = STATUSES.filter(s => leads.some(l => l.status === s));
    if (used.length > 1 || leads.some(l => l.status !== 'Not called')) {
      html += `<div class="chip-row">` +
        chip('Any status', 'All', 'status', leads.length) +
        used.map(s => chip(s, s, 'status', leads.filter(l => l.status === s).length)).join('') +
        `</div>`;
    }
    filtersEl.innerHTML = html;

    filtersEl.querySelectorAll('.chip').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.group === 'seg') activeSegment = btn.dataset.val;
        else activeStatus = btn.dataset.val;
        renderFilters();
        applyFilters();
      });
    });
  }

  function renderProgress() {
    if (!progressEl) return;
    const total = leads.length;
    const touched = leads.filter(l => l.status && l.status !== 'Not called').length;
    const warm = leads.filter(l => DONE_STATUSES.includes(l.status)).length;
    const pct = total ? Math.round((touched / total) * 100) : 0;
    progressEl.innerHTML = `
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-label">
        <span><strong>${touched}</strong> of ${total} called</span>
        <span class="progress-warm">${warm} interested or better</span>
      </div>`;
  }

  function shortSegment(s) {
    return String(s).split('/')[0].trim();
  }

  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    filteredLeads = leads.filter(l => {
      if (activeSegment !== 'All' && l.segment !== activeSegment) return false;
      if (activeStatus !== 'All' && l.status !== activeStatus) return false;
      if (!q) return true;
      return [l.name, l.email, l.company, l.phone, l.segment, l.area, l.address, l.notes]
        .some(v => String(v || '').toLowerCase().includes(q));
    });

    leadCountEl.textContent = filteredLeads.length === leads.length
      ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}`
      : `${filteredLeads.length} of ${leads.length}`;

    renderLeads(filteredLeads);
  }

  function renderLeads(list) {
    leadsGrid.innerHTML = '';

    if (list.length === 0) {
      leadsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align:center; padding:48px; color:var(--text-muted);">
          <p>No leads match your filters</p>
        </div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    list.forEach((lead, i) => {
      const card = document.createElement('div');
      card.className = 'lead-card' + (lead.status && lead.status !== 'Not called' ? ' is-touched' : '');
      card.style.animationDelay = `${Math.min(i * 0.03, 0.5)}s`;
      card.dataset.id = lead.id;

      const hasPhone = !!lead.phone;
      const canWhatsApp = hasPhone && isMobile(lead.phone);
      const hasEmail = !!lead.email;

      const badges = [
        lead.priority ? `<span class="badge badge-${lead.priority.toLowerCase()}">${escapeHtml(lead.priority)}</span>` : '',
        lead.area ? `<span class="badge">${escapeHtml(lead.area)}</span>` : '',
        hasPhone && !canWhatsApp ? `<span class="badge badge-warn">Landline</span>` : '',
      ].join('');

      card.innerHTML = `
        <div class="lead-card-header">
          <div class="lead-avatar">${escapeHtml(getInitials(lead.name))}</div>
          <div class="lead-info">
            <div class="lead-name" title="${escapeHtml(lead.name)}">${escapeHtml(lead.name)}</div>
            ${lead.company ? `<div class="lead-company" title="${escapeHtml(lead.company)}">${escapeHtml(lead.company)}</div>` : ''}
          </div>
          <button class="lead-delete-btn" title="Remove lead" data-delete="${lead.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        ${badges ? `<div class="lead-badges">${badges}</div>` : ''}

        <div class="lead-details">
          <div class="lead-detail">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            <span class="${!hasPhone ? 'text-muted' : ''}">${hasPhone ? escapeHtml(formatPhone(lead.phone)) : 'No phone'}</span>
          </div>
          ${lead.address ? `
          <div class="lead-detail">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span title="${escapeHtml(lead.address)}">${escapeHtml(lead.address)}</span>
          </div>` : ''}
        </div>

        <div class="lead-actions">
          <a class="action-btn call ${!hasPhone ? 'disabled' : ''}"
             href="${hasPhone ? 'tel:' + telNumber(lead.phone) : '#'}"
             data-why="No phone number on this listing"
             title="Call ${escapeHtml(lead.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            Call
          </a>
          <a class="action-btn whatsapp ${!canWhatsApp ? 'disabled' : ''}"
             href="${canWhatsApp ? 'https://wa.me/' + waNumber(lead.phone) : '#'}"
             ${canWhatsApp ? 'target="_blank" rel="noopener"' : ''}
             data-why="${hasPhone ? 'This is a landline — WhatsApp won\'t reach it' : 'No phone number on this listing'}"
             title="WhatsApp ${escapeHtml(lead.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
          ${hasEmail ? `
          <a class="action-btn email" href="mailto:${escapeHtml(lead.email)}" title="Email ${escapeHtml(lead.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            Email
          </a>` : `
          <a class="action-btn maps ${lead.mapsUrl ? '' : 'disabled'}"
             href="${lead.mapsUrl ? escapeHtml(lead.mapsUrl) : '#'}"
             ${lead.mapsUrl ? 'target="_blank" rel="noopener"' : ''}
             data-why="No Maps link for this lead"
             title="Open ${escapeHtml(lead.name)} on Google Maps">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Maps
          </a>`}
        </div>

        <div class="lead-track">
          <select class="status-select status-${slug(lead.status)}" data-status-for="${lead.id}" title="Call outcome">
            ${STATUSES.map(s => `<option value="${s}" ${s === lead.status ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <input class="note-input" type="text" data-note-for="${lead.id}"
                 value="${escapeHtml(lead.notes || '')}"
                 placeholder="Who answered, what they said…" />
        </div>`;

      frag.appendChild(card);
    });

    leadsGrid.appendChild(frag);
  }

  // ── Actions ────────────────────────────────
  function updateLead(id, patch, quiet) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    Object.assign(lead, patch);
    saveToStorage();
    renderProgress();

    if (!quiet) {
      const card = leadsGrid.querySelector(`[data-id="${id}"]`);
      const sel = card && card.querySelector('.status-select');
      if (sel) sel.className = `status-select status-${slug(lead.status)}`;
      if (card) card.classList.toggle('is-touched', lead.status !== 'Not called');
      renderFilters();
      if (activeStatus !== 'All') applyFilters();
    }
  }

  function deleteLead(id) {
    const card = leadsGrid.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.style.transition = 'all 0.3s ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
    }

    setTimeout(() => {
      leads = leads.filter(l => l.id !== id);
      saveToStorage();
      if (leads.length === 0) renderApp();
      else { renderFilters(); renderProgress(); applyFilters(); }
      showToast('Lead removed', 'info');
    }, 300);
  }

  function handleClearAll() {
    if (leads.length === 0) return;
    const touched = leads.filter(l => l.status !== 'Not called').length;
    const warning = touched
      ? `Delete all ${leads.length} leads? You have call notes on ${touched} of them. Export first if you want to keep them.`
      : 'Delete all leads? This cannot be undone.';
    if (!confirm(warning)) return;

    leads = [];
    filteredLeads = [];
    activeSegment = 'All';
    activeStatus = 'All';
    saveToStorage();
    renderApp();
    showToast('All leads cleared', 'info');
  }

  // Call outcomes live in localStorage — this is how they get back out.
  function exportCSV() {
    if (!leads.length) { showToast('Nothing to export', 'info'); return; }

    const cols = ['Name', 'Phone', 'Email', 'Company', 'Segment', 'Area', 'Address',
                  'Priority', 'Reviews', 'MapsUrl', 'Status', 'Notes'];
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(',')];
    leads.forEach(l => {
      lines.push([l.name, l.phone, l.email, l.company, l.segment, l.area, l.address,
                  l.priority, l.reviews, l.mapsUrl, l.status, l.notes].map(cell).join(','));
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${leads.length} leads with your call notes`, 'success');
  }

  // ── Storage ────────────────────────────────
  function saveToStorage() {
    try {
      localStorage.setItem('leadvault_leads', JSON.stringify(leads));
    } catch (_) {
      showToast('Could not save — browser storage is full or blocked', 'error');
    }
  }

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem('leadvault_leads');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.length) return;
      leads = parsed.map(l => ({ status: 'Not called', notes: '', segment: '', area: '', ...l }));
      renderApp();
    } catch (_) {}
  }

  // ── Utilities ──────────────────────────────
  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  // ── UI Helpers ─────────────────────────────
  function showLoading(msg) {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loading-overlay';
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
    document.body.appendChild(overlay);
  }

  function hideLoading() {
    const el = document.getElementById('loading-overlay');
    if (el) el.remove();
  }

  function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(msg)}`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

})();
