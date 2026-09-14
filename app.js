/* ═══════════════════════════════════════════════
   LeadVault — PWA App Logic
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

  const CATEGORY_EMOJIS = {
    'school':       '🏫',
    'education':    '🏫',
    'church':       '⛪',
    'worship':      '⛪',
    'consultancy':  '💼',
    'professional': '💼',
    'health':       '🏥',
    'medical':      '🏥',
    'restaurant':   '🍽️',
    'food':         '🍽️',
    'hotel':        '🏨',
    'technology':   '💻',
    'finance':      '🏦',
    'transport':    '🚗',
    'default':      '📁',
  };

  // ── State ──────────────────────────────────
  let leads = [];
  let activeTab = 'leads';
  let expandedLeadId = null;
  let undoTimer = null;
  let undoLead = null;

  // ── DOM refs ───────────────────────────────
  const appHeader     = document.getElementById('app-header');
  const searchBar     = document.getElementById('search-bar');
  const searchInput   = document.getElementById('search-input');
  const leadCountEl   = document.getElementById('lead-count');
  const tabBar        = document.getElementById('tab-bar');
  const uploadSection = document.getElementById('upload-section');
  const uploadZone    = document.getElementById('upload-zone');
  const fileInput     = document.getElementById('file-input');
  const fileInputMore = document.getElementById('file-input-more');
  const leadsView     = document.getElementById('leads-view');
  const leadsList     = document.getElementById('leads-list');
  const categoriesView= document.getElementById('categories-view');
  const categoriesList= document.getElementById('categories-list');
  const settingsView  = document.getElementById('settings-view');
  const btnUploadMore = document.getElementById('btn-upload-more');
  const btnExport     = document.getElementById('btn-export');
  const btnClearAll   = document.getElementById('btn-clear-all');
  const toastContainer= document.getElementById('toast-container');

  // ── Init ───────────────────────────────────
  loadFromStorage();
  bindEvents();
  registerServiceWorker();

  // ── Event Bindings ─────────────────────────
  function bindEvents() {
    // Upload zone
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

    // Search
    searchInput.addEventListener('input', debounce(() => renderCurrentView(), 200));

    // Settings buttons
    btnUploadMore.addEventListener('click', () => fileInputMore.click());
    btnExport.addEventListener('click', exportCSV);
    btnClearAll.addEventListener('click', handleClearAll);

    // Tab bar
    tabBar.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Lead list interactions (delegated)
    leadsList.addEventListener('click', handleLeadClick);
    leadsList.addEventListener('change', handleLeadChange);
    leadsList.addEventListener('input', debounce(handleLeadInput, 400));

    // Category list interactions (delegated)
    categoriesList.addEventListener('click', handleCategoryClick);
    categoriesList.addEventListener('change', handleLeadChange);
    categoriesList.addEventListener('input', debounce(handleLeadInput, 400));
  }

  // ── Tab Navigation ─────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    expandedLeadId = null;

    // Update tab buttons
    tabBar.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Hide ALL views (including upload)
    [uploadSection, leadsView, categoriesView, settingsView].forEach(v => v.classList.remove('active'));

    // Show/hide search bar
    searchBar.style.display = (tab === 'settings') ? 'none' : '';

    if (tab === 'leads') {
      if (leads.length === 0) {
        uploadSection.classList.add('active');
      } else {
        leadsView.classList.add('active');
        renderLeadsView();
      }
    } else if (tab === 'categories') {
      categoriesView.classList.add('active');
      renderCategoriesView();
    } else if (tab === 'settings') {
      settingsView.classList.add('active');
    }
  }

  function renderCurrentView() {
    if (activeTab === 'leads') renderLeadsView();
    else if (activeTab === 'categories') renderCategoriesView();
  }

  // ── App Render ─────────────────────────────
  function renderApp() {
    const hasLeads = leads.length > 0;

    // Always show tab bar (so user can access Settings even with 0 leads)
    tabBar.style.display = '';
    leadCountEl.textContent = hasLeads
      ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}`
      : '0 leads';

    switchTab(activeTab);
  }

  // ── Phone helpers (Uganda) ─────────────────
  function localDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith(COUNTRY_CODE)) d = '0' + d.slice(COUNTRY_CODE.length);
    else if (!d.startsWith('0') && d.length === 9) d = '0' + d;
    return d;
  }

  function waNumber(phone) {
    const d = localDigits(phone);
    return d.startsWith('0') ? COUNTRY_CODE + d.slice(1) : d;
  }

  function telNumber(phone) {
    const d = localDigits(phone);
    return d.startsWith('0') ? '+' + COUNTRY_CODE + d.slice(1) : '+' + d;
  }

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
    const clean = text.replace(/^﻿/, '');
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
        importedAt: Date.now(),
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


  // ═══════════════════════════════════════════
  //  LEADS VIEW — Time-Grouped List
  // ═══════════════════════════════════════════

  function renderLeadsView() {
    const q = searchInput.value.trim().toLowerCase();
    let filtered = leads;

    if (q) {
      filtered = leads.filter(l =>
        [l.name, l.email, l.company, l.phone, l.segment, l.area, l.address, l.notes]
          .some(v => String(v || '').toLowerCase().includes(q))
      );
    }

    // Update count
    leadCountEl.textContent = filtered.length === leads.length
      ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}`
      : `${filtered.length} of ${leads.length}`;

    if (filtered.length === 0) {
      leadsList.innerHTML = `
        <div class="empty-list">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>${q ? 'No leads match your search' : 'No leads yet'}</p>
        </div>`;
      return;
    }

    // Group by time
    const groups = groupByTime(filtered);
    const frag = document.createDocumentFragment();

    for (const group of groups) {
      // Time header
      const header = document.createElement('div');
      header.className = 'time-group-header';
      header.innerHTML = `${escapeHtml(group.label)}<span class="count">(${group.leads.length})</span>`;
      frag.appendChild(header);

      // Lead items
      for (const lead of group.leads) {
        frag.appendChild(createLeadItem(lead));
        frag.appendChild(createLeadDetailPanel(lead));
      }
    }

    leadsList.innerHTML = '';
    leadsList.appendChild(frag);
  }

  function groupByTime(list) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    const today = [];
    const yesterday = [];
    const olderMap = {};

    for (const lead of list) {
      const t = lead.importedAt || 0;
      if (t >= todayStart) {
        today.push(lead);
      } else if (t >= yesterdayStart) {
        yesterday.push(lead);
      } else {
        const dateKey = t ? formatDateLabel(new Date(t)) : 'Imported earlier';
        if (!olderMap[dateKey]) olderMap[dateKey] = [];
        olderMap[dateKey].push(lead);
      }
    }

    const groups = [];
    if (today.length)     groups.push({ label: 'Today', leads: today });
    if (yesterday.length) groups.push({ label: 'Yesterday', leads: yesterday });

    // Sort older groups by date descending
    const olderKeys = Object.keys(olderMap).sort((a, b) => {
      // "Imported earlier" goes last
      if (a === 'Imported earlier') return 1;
      if (b === 'Imported earlier') return -1;
      return 0;
    });
    for (const key of olderKeys) {
      groups.push({ label: key, leads: olderMap[key] });
    }

    return groups;
  }

  function formatDateLabel(date) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]} ${date.getDate()}`;
  }

  function createLeadItem(lead) {
    const hasPhone = !!lead.phone;
    const canWhatsApp = hasPhone && isMobile(lead.phone);
    const isExpanded = expandedLeadId === lead.id;

    const item = document.createElement('div');
    item.className = 'lead-item';
    item.dataset.id = lead.id;
    if (isExpanded) item.style.background = 'var(--bg-card)';

    const meta = [];
    if (lead.segment) meta.push(shortSegment(lead.segment));
    if (lead.area) meta.push(lead.area);
    if (hasPhone && !canWhatsApp) meta.push('<span class="landline-tag">Landline</span>');

    const priorityBadge = lead.priority
      ? `<span class="priority-badge ${lead.priority.toLowerCase()}">${escapeHtml(lead.priority)}</span>`
      : '';

    item.innerHTML = `
      <div class="lead-item-avatar">${escapeHtml(getInitials(lead.name))}</div>
      <div class="lead-item-info">
        <div class="lead-item-name">${escapeHtml(lead.name)}${priorityBadge}</div>
        <div class="lead-item-meta">${meta.join(' · ')}</div>
      </div>
      <div class="lead-item-actions">
        <a class="lead-action call ${!hasPhone ? 'disabled' : ''}"
           href="${hasPhone ? 'tel:' + telNumber(lead.phone) : '#'}"
           title="Call">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
          </svg>
        </a>
        <a class="lead-action whatsapp ${!canWhatsApp ? 'disabled' : ''}"
           href="${canWhatsApp ? 'https://wa.me/' + waNumber(lead.phone) : '#'}"
           ${canWhatsApp ? 'target="_blank" rel="noopener"' : ''}
           data-wa-id="${lead.id}"
           title="WhatsApp">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      </div>`;

    return item;
  }

  function createLeadDetailPanel(lead) {
    const hasPhone = !!lead.phone;
    const isExpanded = expandedLeadId === lead.id;

    const panel = document.createElement('div');
    panel.className = `lead-detail-panel${isExpanded ? ' open' : ''}`;
    panel.dataset.detailId = lead.id;

    let rows = '';
    if (hasPhone) {
      rows += `<div class="lead-detail-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
        <span>${escapeHtml(formatPhone(lead.phone))}</span>
      </div>`;
    }
    if (lead.address) {
      rows += `<div class="lead-detail-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>${escapeHtml(lead.address)}</span>
      </div>`;
    }
    if (lead.email) {
      rows += `<div class="lead-detail-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span>${escapeHtml(lead.email)}</span>
      </div>`;
    }
    if (lead.company) {
      rows += `<div class="lead-detail-row">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>${escapeHtml(lead.company)}</span>
      </div>`;
    }

    panel.innerHTML = `
      ${rows}
      <div class="lead-detail-track">
        <select class="status-select status-${slug(lead.status)}" data-status-for="${lead.id}">
          ${STATUSES.map(s => `<option value="${s}" ${s === lead.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <input class="note-input" type="text" data-note-for="${lead.id}"
               value="${escapeHtml(lead.notes || '')}"
               placeholder="Call notes…" />
      </div>
      <div class="lead-detail-extra">
        <a class="lead-detail-link ${lead.mapsUrl ? '' : 'disabled'}"
           href="${lead.mapsUrl ? escapeHtml(lead.mapsUrl) : '#'}"
           ${lead.mapsUrl ? 'target="_blank" rel="noopener"' : ''}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Maps
        </a>
        <button class="lead-delete-btn" data-delete="${lead.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          Delete
        </button>
      </div>`;

    return panel;
  }


  // ═══════════════════════════════════════════
  //  CATEGORIES VIEW
  // ═══════════════════════════════════════════

  function renderCategoriesView() {
    const q = searchInput.value.trim().toLowerCase();
    let filtered = leads;

    if (q) {
      filtered = leads.filter(l =>
        [l.name, l.email, l.company, l.phone, l.segment, l.area, l.address, l.notes]
          .some(v => String(v || '').toLowerCase().includes(q))
      );
    }

    // Update count
    leadCountEl.textContent = filtered.length === leads.length
      ? `${leads.length} lead${leads.length !== 1 ? 's' : ''}`
      : `${filtered.length} of ${leads.length}`;

    // Group by segment
    const segMap = {};
    for (const lead of filtered) {
      const seg = lead.segment || 'Uncategorized';
      if (!segMap[seg]) segMap[seg] = [];
      segMap[seg].push(lead);
    }

    const segments = Object.keys(segMap).sort((a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      return segMap[b].length - segMap[a].length;
    });

    if (segments.length === 0) {
      categoriesList.innerHTML = `
        <div class="empty-list">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
          </svg>
          <p>No categories to show</p>
        </div>`;
      return;
    }

    const frag = document.createDocumentFragment();

    for (const seg of segments) {
      const section = document.createElement('div');
      section.className = 'category-section';
      section.dataset.segment = seg;

      const emoji = getCategoryEmoji(seg);

      section.innerHTML = `
        <div class="category-header" data-toggle-cat="${seg}">
          <div class="category-header-left">
            <div class="category-icon">${emoji}</div>
            <h3>${escapeHtml(shortSegment(seg))}</h3>
          </div>
          <div class="category-header-right">
            <span class="category-count">${segMap[seg].length}</span>
            <svg class="category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
        <div class="category-leads"></div>`;

      // Fill the leads container
      const leadsContainer = section.querySelector('.category-leads');
      for (const lead of segMap[seg]) {
        leadsContainer.appendChild(createLeadItem(lead));
        leadsContainer.appendChild(createLeadDetailPanel(lead));
      }

      frag.appendChild(section);
    }

    categoriesList.innerHTML = '';
    categoriesList.appendChild(frag);
  }

  function getCategoryEmoji(segment) {
    const lower = segment.toLowerCase();
    for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
      if (key !== 'default' && lower.includes(key)) return emoji;
    }
    return CATEGORY_EMOJIS.default;
  }


  // ═══════════════════════════════════════════
  //  EVENT HANDLERS
  // ═══════════════════════════════════════════

  function handleLeadClick(e) {
    // WhatsApp button click — auto-delete
    const waBtn = e.target.closest('[data-wa-id]');
    if (waBtn && !waBtn.classList.contains('disabled')) {
      const id = waBtn.dataset.waId;
      // Let the link open normally, then delete
      setTimeout(() => deleteLeadWithUndo(id, 'Sent to WhatsApp — lead removed'), 100);
      return;
    }

    // Call button — don't interfere
    const callBtn = e.target.closest('.lead-action.call');
    if (callBtn) return;

    // Delete button
    const delBtn = e.target.closest('[data-delete]');
    if (delBtn) {
      e.preventDefault();
      deleteLead(delBtn.dataset.delete);
      return;
    }

    // Maps link
    const mapsLink = e.target.closest('.lead-detail-link');
    if (mapsLink) return;

    // Expand/collapse lead
    const item = e.target.closest('.lead-item');
    if (item) {
      const id = item.dataset.id;
      expandedLeadId = (expandedLeadId === id) ? null : id;
      renderCurrentView();
    }
  }

  function handleCategoryClick(e) {
    // Toggle category section
    const toggle = e.target.closest('[data-toggle-cat]');
    if (toggle) {
      const section = toggle.closest('.category-section');
      section.classList.toggle('open');
      return;
    }

    // Delegate to lead click handler
    handleLeadClick(e);
  }

  function handleLeadChange(e) {
    const sel = e.target.closest('[data-status-for]');
    if (sel) {
      updateLead(sel.dataset.statusFor, { status: sel.value });
      sel.className = `status-select status-${slug(sel.value)}`;
    }
  }

  function handleLeadInput(e) {
    const note = e.target.closest('[data-note-for]');
    if (note) updateLead(note.dataset.noteFor, { notes: note.value }, true);
  }


  // ═══════════════════════════════════════════
  //  ACTIONS
  // ═══════════════════════════════════════════

  function updateLead(id, patch, quiet) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;
    Object.assign(lead, patch);
    saveToStorage();
    if (!quiet) showToast(`Status: ${patch.status}`, 'info');
  }

  function deleteLead(id) {
    const item = document.querySelector(`.lead-item[data-id="${id}"]`);
    const panel = document.querySelector(`[data-detail-id="${id}"]`);

    if (item) item.classList.add('removing');
    if (panel) panel.style.display = 'none';

    setTimeout(() => {
      leads = leads.filter(l => l.id !== id);
      saveToStorage();
      if (leads.length === 0) renderApp();
      else {
        leadCountEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
        renderCurrentView();
      }
      showToast('Lead removed', 'info');
    }, 350);
  }

  function deleteLeadWithUndo(id, message) {
    const lead = leads.find(l => l.id === id);
    if (!lead) return;

    // Cancel any previous undo
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
      undoLead = null;
    }

    // Animate out
    const item = document.querySelector(`.lead-item[data-id="${id}"]`);
    const panel = document.querySelector(`[data-detail-id="${id}"]`);
    if (item) item.classList.add('removing');
    if (panel) panel.style.display = 'none';

    // Remove from state
    setTimeout(() => {
      undoLead = { ...lead };
      leads = leads.filter(l => l.id !== id);
      saveToStorage();

      if (leads.length === 0) renderApp();
      else {
        leadCountEl.textContent = `${leads.length} lead${leads.length !== 1 ? 's' : ''}`;
        renderCurrentView();
      }

      // Show undo toast
      showUndoToast(message || 'Lead removed', () => {
        // Restore lead
        if (undoLead) {
          leads.push(undoLead);
          leads.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
          saveToStorage();
          undoLead = null;
          renderApp();
          showToast('Lead restored', 'success');
        }
      });

      // Clear undo after 5 seconds
      undoTimer = setTimeout(() => {
        undoLead = null;
        undoTimer = null;
      }, 5000);
    }, 350);
  }

  function handleClearAll() {
    if (leads.length === 0) return;
    const touched = leads.filter(l => l.status !== 'Not called').length;
    const warning = touched
      ? `Delete all ${leads.length} leads? You have call notes on ${touched} of them. Export first if you want to keep them.`
      : 'Delete all leads? This cannot be undone.';
    if (!confirm(warning)) return;

    leads = [];
    activeTab = 'leads';
    expandedLeadId = null;
    saveToStorage();
    renderApp();
    showToast('All leads cleared', 'info');
  }

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
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${leads.length} leads`, 'success');
  }


  // ═══════════════════════════════════════════
  //  STORAGE
  // ═══════════════════════════════════════════

  function saveToStorage() {
    try {
      localStorage.setItem('leadvault_leads', JSON.stringify(leads));
    } catch (_) {
      showToast('Could not save — storage full or blocked', 'error');
    }
  }

  function loadFromStorage() {
    try {
      const saved = localStorage.getItem('leadvault_leads');
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || !parsed.length) return;
      leads = parsed.map(l => ({
        status: 'Not called',
        notes: '',
        segment: '',
        area: '',
        importedAt: 0,
        ...l,
      }));
      renderApp();
    } catch (_) {}
  }


  // ═══════════════════════════════════════════
  //  UTILITIES
  // ═══════════════════════════════════════════

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z]+/g, '-');
  }

  function shortSegment(s) {
    return String(s).split('/')[0].trim();
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


  // ═══════════════════════════════════════════
  //  UI HELPERS
  // ═══════════════════════════════════════════

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

  function showUndoToast(msg, onUndo) {
    const toast = document.createElement('div');
    toast.className = 'toast info';
    toast.style.animation = 'toastIn 0.3s var(--ease)';
    toast.innerHTML = `<span>ℹ</span> ${escapeHtml(msg)} <button class="undo-btn">Undo</button>`;

    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.addEventListener('click', () => {
      onUndo();
      toast.remove();
    });

    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 5000);
  }


  // ═══════════════════════════════════════════
  //  SERVICE WORKER
  // ═══════════════════════════════════════════

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(() => console.log('SW registered'))
          .catch(err => console.log('SW registration failed:', err));
      });
    }
  }

})();
