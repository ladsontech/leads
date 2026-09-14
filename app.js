/* ═══════════════════════════════════════════════
   LeadVault v2 — Mobile App Logic
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── Uganda Phone Config ───────────────────────
  const COUNTRY_CODE = '256';

  const STATUS_CONFIG = [
    { key: 'Not called',      label: 'Not called',      color: '#71717a', icon: '📞' },
    { key: 'Called',          label: 'Called',          color: '#10b981', icon: '📲' },
    { key: 'Messaged',        label: 'Messaged',        color: '#25d366', icon: '💬' },
    { key: 'Call back',       label: 'Call back',       color: '#f97316', icon: '⏳' },
    { key: 'No answer',       label: 'No answer',       color: '#f59e0b', icon: '📴' },
    { key: 'Interested',      label: 'Interested',      color: '#22c55e', icon: '⭐' },
    { key: 'Meeting booked',  label: 'Meeting booked',  color: '#3b82f6', icon: '🤝' },
    { key: 'Won',             label: 'Won',             color: '#a855f7', icon: '🏆' },
    { key: 'Not interested',  label: 'Not interested',  color: '#ef4444', icon: '🚫' },
    { key: 'Lost',            label: 'Lost',            color: '#6b7280', icon: '✖️' }
  ];

  const STATUS_KEYS = STATUS_CONFIG.map(s => s.key);

  const CATEGORY_EMOJIS = {
    'school':       '🏫',
    'education':    '🏫',
    'kindergarten': '🏫',
    'college':      '🏫',
    'church':       '⛪',
    'worship':      '⛪',
    'consultan':    '💼',
    'professional': '💼',
    'health':       '🏥',
    'medical':      '🏥',
    'hospital':     '🏥',
    'clinic':       '🏥',
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
  let messagedCount = 0;
  let activeTab = 'home';
  let currentFilter = { type: 'all', value: null, title: 'All Leads' };
  let expandedLeadId = null;
  let undoLead = null;
  let undoTimer = null;

  // ── DOM References ─────────────────────────
  const homeView        = document.getElementById('home-view');
  const leadsView       = document.getElementById('leads-view');
  const moreView        = document.getElementById('more-view');
  const tabBar          = document.getElementById('tab-bar');

  const homeGreeting    = document.getElementById('home-greeting');
  const homeBadge       = document.getElementById('home-badge');
  const statTotal       = document.getElementById('stat-total');
  const statCalled      = document.getElementById('stat-called');
  const statInterested  = document.getElementById('stat-interested');
  const statWa          = document.getElementById('stat-wa');
  const homeProgress    = document.getElementById('home-progress');

  const timelineCats    = document.getElementById('timeline-cats');
  const statusCats      = document.getElementById('status-cats');
  const segmentCats     = document.getElementById('segment-cats');
  const homeUpload      = document.getElementById('home-upload');
  const uploadZone      = document.getElementById('upload-zone');
  const fileInput       = document.getElementById('file-input');

  const leadsBack       = document.getElementById('leads-back');
  const leadsTitle      = document.getElementById('leads-title');
  const leadsCount      = document.getElementById('leads-count');
  const leadsFilterPill = document.getElementById('leads-filter-pill');
  const searchInput     = document.getElementById('search-input');
  const searchClearBtn  = document.getElementById('search-clear-btn');
  const quickChipsBar   = document.getElementById('quick-chips-bar');
  const leadsList       = document.getElementById('leads-list');

  const btnUploadMore   = document.getElementById('btn-upload-more');
  const btnReloadDefault= document.getElementById('btn-reload-default');
  const btnExport       = document.getElementById('btn-export');
  const btnClearAll     = document.getElementById('btn-clear-all');
  const fileInputMore   = document.getElementById('file-input-more');
  const toastContainer  = document.getElementById('toast-container');

  // ── App Initialization ──────────────────────
  initApp();

  function initApp() {
    loadFromStorage();
    bindEvents();
    registerServiceWorker();

    // If no leads loaded from storage, load bundled leads_current.csv automatically
    if (leads.length === 0) {
      loadDefaultLeads();
    } else {
      renderApp();
    }
  }

  // ── Event Bindings ─────────────────────────
  function bindEvents() {
    // Tab Bar
    tabBar.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        if (target === 'leads' && currentFilter.type !== 'all' && activeTab === 'leads') {
          // If already on leads and user taps Leads tab, reset filter to all
          setFilter({ type: 'all', value: null, title: 'All Leads' });
        }
        switchTab(target);
      });
    });

    // Home Upload Zone
    if (uploadZone) {
      uploadZone.addEventListener('click', () => fileInput.click());
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
    }

    if (fileInput) fileInput.addEventListener('change', handleFile);
    if (fileInputMore) fileInputMore.addEventListener('change', handleFile);

    // Stat cards click -> navigate to leads with filter
    const statsGrid = document.getElementById('stats-grid');
    if (statsGrid) {
      statsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.stat-card');
        if (!card) return;
        if (card.classList.contains('sc-indigo')) {
          setFilter({ type: 'all', value: null, title: 'All Leads' });
        } else if (card.classList.contains('sc-emerald')) {
          setFilter({ type: 'status', value: 'Called', title: 'Called Leads' });
        } else if (card.classList.contains('sc-amber')) {
          setFilter({ type: 'status', value: 'Interested', title: 'Interested Leads' });
        } else if (card.classList.contains('sc-green')) {
          setFilter({ type: 'status', value: 'Messaged', title: 'WhatsApp Messaged' });
        }
        switchTab('leads');
      });
    }

    // Category click on Home (Timeline, Status, Segments)
    [timelineCats, statusCats, segmentCats].forEach(catContainer => {
      if (catContainer) {
        catContainer.addEventListener('click', (e) => {
          const item = e.target.closest('.cat-item');
          if (!item) return;
          const filterType = item.dataset.filterType;
          const filterVal  = item.dataset.filterVal;
          const filterTitle= item.dataset.filterTitle || item.querySelector('.cat-name')?.textContent || 'Leads';

          setFilter({ type: filterType, value: filterVal, title: filterTitle });
          switchTab('leads');
        });
      }
    });

    // Leads View Back Button
    if (leadsBack) {
      leadsBack.addEventListener('click', () => {
        switchTab('home');
      });
    }

    // Filter pill clear button
    if (leadsFilterPill) {
      leadsFilterPill.addEventListener('click', () => {
        setFilter({ type: 'all', value: null, title: 'All Leads' });
        renderLeadsView();
      });
    }

    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', debounce(() => {
        if (searchClearBtn) {
          searchClearBtn.style.display = searchInput.value ? 'block' : 'none';
        }
        renderLeadsView();
      }, 150));
    }

    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        searchClearBtn.style.display = 'none';
        renderLeadsView();
        searchInput.focus();
      });
    }

    // Quick Chips Bar in Leads View
    if (quickChipsBar) {
      quickChipsBar.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        const type = chip.dataset.chip;
        quickChipsBar.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        if (type === 'all') setFilter({ type: 'all', value: null, title: 'All Leads' });
        else if (type === 'today') setFilter({ type: 'timeline', value: 'today', title: "Today's Leads" });
        else if (type === 'yesterday') setFilter({ type: 'timeline', value: 'yesterday', title: "Yesterday's Leads" });
        else if (type === 'not-called') setFilter({ type: 'status', value: 'Not called', title: 'Not Called Leads' });
        else if (type === 'called') setFilter({ type: 'status', value: 'Called', title: 'Called Leads' });
        else if (type === 'interested') setFilter({ type: 'status', value: 'Interested', title: 'Interested Leads' });
        else if (type === 'messaged') setFilter({ type: 'status', value: 'Messaged', title: 'WhatsApp Messaged' });

        renderLeadsView();
      });
    }

    // Leads List Event Delegation
    if (leadsList) {
      leadsList.addEventListener('click', handleLeadListClick);
      leadsList.addEventListener('change', handleLeadListChange);
      leadsList.addEventListener('input', debounce(handleLeadListInput, 400));
    }

    // Settings tab buttons
    if (btnUploadMore) btnUploadMore.addEventListener('click', () => fileInputMore.click());
    if (btnReloadDefault) btnReloadDefault.addEventListener('click', handleReloadDefault);
    if (btnExport) btnExport.addEventListener('click', exportCSV);
    if (btnClearAll) btnClearAll.addEventListener('click', handleClearAll);
  }

  // ── Tab Navigation ─────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    expandedLeadId = null;

    // Update Tab Bar buttons
    tabBar.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Switch Views
    homeView.classList.toggle('active', tab === 'home');
    leadsView.classList.toggle('active', tab === 'leads');
    moreView.classList.toggle('active', tab === 'more');

    // Scroll to top on switch
    window.scrollTo(0, 0);

    if (tab === 'home') renderHomeView();
    else if (tab === 'leads') renderLeadsView();
  }

  function setFilter(filter) {
    currentFilter = filter;
    updateChipsBar();
  }

  function updateChipsBar() {
    if (!quickChipsBar) return;
    quickChipsBar.querySelectorAll('.chip').forEach(c => {
      const chipKey = c.dataset.chip;
      let match = false;
      if (currentFilter.type === 'all' && chipKey === 'all') match = true;
      if (currentFilter.type === 'timeline' && currentFilter.value === chipKey) match = true;
      if (currentFilter.type === 'status') {
        if (currentFilter.value === 'Not called' && chipKey === 'not-called') match = true;
        if (currentFilter.value === 'Called' && chipKey === 'called') match = true;
        if (currentFilter.value === 'Interested' && chipKey === 'interested') match = true;
        if (currentFilter.value === 'Messaged' && chipKey === 'messaged') match = true;
      }
      c.classList.toggle('active', match);
    });
  }

  // ── Render Application ─────────────────────
  function renderApp() {
    renderHomeView();
    if (activeTab === 'leads') renderLeadsView();
  }

  // ═══════════════════════════════════════════
  //  HOME VIEW RENDERING
  // ═══════════════════════════════════════════
  function renderHomeView() {
    // Dynamic Greeting & Date
    const hour = new Date().getHours();
    const greetingText = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    if (homeGreeting) {
      const dateStr = new Intl.DateTimeFormat('en-UG', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());
      homeGreeting.textContent = `${greetingText} • ${dateStr}`;
    }

    const total = leads.length;
    if (homeBadge) homeBadge.textContent = `${total} lead${total !== 1 ? 's' : ''}`;

    // Stats
    const calledLeads = leads.filter(l => l.status === 'Called' || l.calledAt).length;
    const interestedLeads = leads.filter(l => l.status === 'Interested').length;
    const totalMessaged = messagedCount + leads.filter(l => l.status === 'Messaged' || l.messagedAt).length;

    if (statTotal) statTotal.textContent = total;
    if (statCalled) statCalled.textContent = calledLeads;
    if (statInterested) statInterested.textContent = interestedLeads;
    if (statWa) statWa.textContent = totalMessaged;

    // Progress Bar
    if (homeProgress) {
      if (total > 0) {
        const contacted = calledLeads + totalMessaged;
        const pct = Math.min(100, Math.round((contacted / total) * 100));
        homeProgress.style.display = 'block';
        homeProgress.innerHTML = `
          <div class="progress-track">
            <div class="progress-fill" style="width: ${pct}%"></div>
          </div>
          <div class="progress-label">
            <span>Outreach Progress</span>
            <strong>${contacted} of ${total} contacted (${pct}%)</strong>
          </div>`;
      } else {
        homeProgress.style.display = 'none';
        homeProgress.innerHTML = '';
      }
    }

    // Toggle Empty State / Upload Zone
    if (homeUpload) {
      homeUpload.style.display = total === 0 ? 'block' : 'none';
    }

    // Render Categories
    renderTimelineCategories();
    renderStatusCategories();
    renderSegmentCategories();
  }

  // ── Timeline Categories (Today, Yesterday, Earlier) ──
  function renderTimelineCategories() {
    if (!timelineCats) return;
    if (leads.length === 0) {
      timelineCats.innerHTML = '';
      timelineCats.style.display = 'none';
      return;
    }
    timelineCats.style.display = 'block';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;

    let todayCount = 0;
    let yesterdayCount = 0;
    let earlierCount = 0;

    leads.forEach(l => {
      const t = l.importedAt || 0;
      if (t >= todayStart) todayCount++;
      else if (t >= yesterdayStart) yesterdayCount++;
      else earlierCount++;
    });

    timelineCats.innerHTML = `
      <div class="cat-item" data-filter-type="timeline" data-filter-val="today" data-filter-title="Today's Leads">
        <div class="cat-emoji">☀️</div>
        <div class="cat-name">Today's Leads</div>
        <div class="cat-count">${todayCount}</div>
        <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="cat-item" data-filter-type="timeline" data-filter-val="yesterday" data-filter-title="Yesterday's Leads">
        <div class="cat-emoji">🌙</div>
        <div class="cat-name">Yesterday's Leads</div>
        <div class="cat-count">${yesterdayCount}</div>
        <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
      <div class="cat-item" data-filter-type="timeline" data-filter-val="earlier" data-filter-title="Earlier Leads">
        <div class="cat-emoji">🗄️</div>
        <div class="cat-name">Earlier Leads</div>
        <div class="cat-count">${earlierCount}</div>
        <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;
  }

  // ── Status Categories (By Pipeline Stage) ─────
  function renderStatusCategories() {
    if (!statusCats) return;
    if (leads.length === 0) {
      statusCats.innerHTML = '';
      statusCats.style.display = 'none';
      return;
    }
    statusCats.style.display = 'block';

    const counts = {};
    leads.forEach(l => {
      const s = l.status || 'Not called';
      counts[s] = (counts[s] || 0) + 1;
    });

    let html = '';
    STATUS_CONFIG.forEach(cfg => {
      const c = counts[cfg.key] || 0;
      if (c > 0 || ['Not called', 'Called', 'Interested'].includes(cfg.key)) {
        html += `
          <div class="cat-item" data-filter-type="status" data-filter-val="${escapeHtml(cfg.key)}" data-filter-title="${escapeHtml(cfg.label)} Leads">
            <span class="cat-dot" style="background:${cfg.color}"></span>
            <div class="cat-name">${cfg.icon} ${escapeHtml(cfg.label)}</div>
            <div class="cat-count">${c}</div>
            <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </div>`;
      }
    });

    statusCats.innerHTML = html;
  }

  // ── Segment Categories (Industry / Segments) ──
  function renderSegmentCategories() {
    if (!segmentCats) return;
    if (leads.length === 0) {
      segmentCats.innerHTML = '';
      segmentCats.style.display = 'none';
      return;
    }
    segmentCats.style.display = 'block';

    const segMap = {};
    leads.forEach(l => {
      const seg = l.segment ? shortSegment(l.segment) : 'General';
      segMap[seg] = (segMap[seg] || 0) + 1;
    });

    const sortedSegs = Object.keys(segMap).sort((a, b) => segMap[b] - segMap[a]);

    let html = '';
    sortedSegs.forEach(seg => {
      const emoji = getCategoryEmoji(seg);
      html += `
        <div class="cat-item" data-filter-type="segment" data-filter-val="${escapeHtml(seg)}" data-filter-title="${escapeHtml(seg)}">
          <div class="cat-emoji">${emoji}</div>
          <div class="cat-name">${escapeHtml(seg)}</div>
          <div class="cat-count">${segMap[seg]}</div>
          <svg class="cat-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>`;
    });

    segmentCats.innerHTML = html;
  }

  // ═══════════════════════════════════════════
  //  LEADS VIEW RENDERING
  // ═══════════════════════════════════════════
  function renderLeadsView() {
    const q = (searchInput ? searchInput.value.trim().toLowerCase() : '');

    // Title & Filter Pill
    if (leadsTitle) leadsTitle.textContent = currentFilter.title || 'All Leads';

    if (leadsFilterPill) {
      if (currentFilter.type !== 'all') {
        leadsFilterPill.style.display = 'inline-flex';
        leadsFilterPill.innerHTML = `Filter: ${escapeHtml(currentFilter.title)} <span class="pill-x">✕</span>`;
      } else {
        leadsFilterPill.style.display = 'none';
        leadsFilterPill.innerHTML = '';
      }
    }

    // Filter leads
    let filtered = leads.filter(lead => {
      // 1. Text search query
      if (q) {
        const matches = [lead.name, lead.phone, lead.email, lead.company, lead.segment, lead.area, lead.address, lead.notes]
          .some(v => String(v || '').toLowerCase().includes(q));
        if (!matches) return false;
      }

      // 2. Category / Status / Timeline filter
      if (currentFilter.type === 'status') {
        if (currentFilter.value === 'Messaged') return lead.status === 'Messaged' || lead.messagedAt;
        return lead.status === currentFilter.value;
      }

      if (currentFilter.type === 'segment') {
        const leadSeg = lead.segment ? shortSegment(lead.segment) : 'General';
        return leadSeg.toLowerCase().includes(currentFilter.value.toLowerCase());
      }

      if (currentFilter.type === 'timeline') {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const yesterdayStart = todayStart - 86400000;
        const t = lead.importedAt || 0;

        if (currentFilter.value === 'today') return t >= todayStart;
        if (currentFilter.value === 'yesterday') return t >= yesterdayStart && t < todayStart;
        if (currentFilter.value === 'earlier') return t < yesterdayStart;
      }

      return true;
    });

    // Update Counter
    if (leadsCount) {
      leadsCount.textContent = `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`;
    }

    // Empty state
    if (filtered.length === 0) {
      leadsList.innerHTML = `
        <div class="empty-list">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3);margin-bottom:8px">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>${q ? 'No leads match your search' : 'No leads in this category'}</p>
          ${currentFilter.type !== 'all' ? '<button class="clear-filter-btn" id="btn-reset-filters">View All Leads</button>' : ''}
        </div>`;

      const resetBtn = document.getElementById('btn-reset-filters');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          setFilter({ type: 'all', value: null, title: 'All Leads' });
          renderLeadsView();
        });
      }
      return;
    }

    // Render list
    const frag = document.createDocumentFragment();
    filtered.forEach(lead => {
      frag.appendChild(createLeadElement(lead));
    });

    leadsList.innerHTML = '';
    leadsList.appendChild(frag);
  }

  // ── Lead Card DOM Element ──────────────────
  function createLeadElement(lead) {
    const hasPhone = !!lead.phone;
    const canWhatsApp = hasPhone && isMobile(lead.phone);
    const isExpanded = expandedLeadId === lead.id;

    const wrapper = document.createElement('div');
    wrapper.className = 'lead-card-wrapper';
    wrapper.dataset.id = lead.id;

    const initials = getInitials(lead.name);
    const statusCfg = STATUS_CONFIG.find(s => s.key === lead.status) || STATUS_CONFIG[0];

    const metaParts = [];
    if (lead.segment) metaParts.push(shortSegment(lead.segment));
    if (lead.area) metaParts.push(lead.area);
    if (hasPhone && !canWhatsApp) metaParts.push('<span class="tag-landline">Landline</span>');

    const priorityBadge = lead.priority
      ? `<span class="priority-badge ${lead.priority.toLowerCase()}">${escapeHtml(lead.priority)}</span>`
      : '';

    wrapper.innerHTML = `
      <div class="lead-item" data-id="${lead.id}">
        <div class="lead-avatar">${escapeHtml(initials)}</div>
        <div class="lead-info">
          <div class="lead-name">${escapeHtml(lead.name)}${priorityBadge}</div>
          <div class="lead-meta">${metaParts.join(' · ') || 'Kampala Lead'}</div>
        </div>
        <div class="lead-actions">
          <a class="la-btn la-call ${!hasPhone ? 'la-off' : ''}"
             href="${hasPhone ? 'tel:' + telNumber(lead.phone) : '#'}"
             data-call-id="${lead.id}"
             title="Call ${escapeHtml(lead.name)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
          </a>
          <button class="la-btn la-wa ${!canWhatsApp ? 'la-off' : ''}"
             data-wa-id="${lead.id}"
             title="WhatsApp ${escapeHtml(lead.name)} (Auto-Deletes Lead)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="lead-detail ${isExpanded ? 'open' : ''}" data-detail-id="${lead.id}">
        ${hasPhone ? `
          <div class="ld-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
            <strong>${escapeHtml(formatPhone(lead.phone))}</strong>
          </div>` : ''}

        ${lead.address ? `
          <div class="ld-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${escapeHtml(lead.address)}</span>
          </div>` : ''}

        ${lead.email ? `
          <div class="ld-row">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <a href="mailto:${escapeHtml(lead.email)}" style="color:var(--accent-l)">${escapeHtml(lead.email)}</a>
          </div>` : ''}

        <div class="ld-track">
          <select class="ld-select st-${slug(lead.status)}" data-status-for="${lead.id}">
            ${STATUS_CONFIG.map(s => `<option value="${s.key}" ${s.key === lead.status ? 'selected' : ''}>${s.icon} ${s.label}</option>`).join('')}
          </select>
          <input class="ld-note" type="text" data-note-for="${lead.id}"
                 value="${escapeHtml(lead.notes || '')}"
                 placeholder="Add call notes…" />
        </div>

        <div class="ld-footer">
          <a class="ld-link ${lead.mapsUrl ? '' : 'off'}"
             href="${lead.mapsUrl ? escapeHtml(lead.mapsUrl) : '#'}"
             ${lead.mapsUrl ? 'target="_blank" rel="noopener"' : ''}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            Maps
          </a>
          <button class="ld-del" data-delete-id="${lead.id}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </div>
      </div>
    `;

    return wrapper;
  }

  // ═══════════════════════════════════════════
  //  INTERACTIONS & EVENT HANDLERS
  // ═══════════════════════════════════════════
  function handleLeadListClick(e) {
    // 1. WhatsApp Button Click — AUTO DELETE REQUIREMENT
    const waBtn = e.target.closest('[data-wa-id]');
    if (waBtn && !waBtn.classList.contains('la-off')) {
      e.preventDefault();
      e.stopPropagation();
      const id = waBtn.dataset.waId;
      triggerWhatsApp(id);
      return;
    }

    // 2. Call Button Click — Mark as called
    const callBtn = e.target.closest('[data-call-id]');
    if (callBtn && !callBtn.classList.contains('la-off')) {
      const id = callBtn.dataset.callId;
      const lead = leads.find(l => l.id === id);
      if (lead && lead.status === 'Not called') {
        lead.status = 'Called';
        lead.calledAt = Date.now();
        saveToStorage();
        showToast(`Marked ${lead.name} as Called`, 'info');
      }
      return; // allow tel: navigation to proceed naturally
    }

    // 3. Delete button in expanded panel
    const delBtn = e.target.closest('[data-delete-id]');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      deleteLeadWithAnimation(delBtn.dataset.deleteId, 'Lead deleted');
      return;
    }

    // 4. Maps link
    if (e.target.closest('.ld-link')) return;

    // 5. Card click -> Accordion Expand/Collapse
    const leadItem = e.target.closest('.lead-item');
    if (leadItem) {
      const id = leadItem.dataset.id;
      expandedLeadId = (expandedLeadId === id) ? null : id;
      const wrapper = leadItem.closest('.lead-card-wrapper');
      if (wrapper) {
        const detail = wrapper.querySelector('.lead-detail');
        if (detail) {
          detail.classList.toggle('open', expandedLeadId === id);
        }
      }
    }
  }

  function handleLeadListChange(e) {
    const sel = e.target.closest('[data-status-for]');
    if (sel) {
      const id = sel.dataset.statusFor;
      const val = sel.value;
      const lead = leads.find(l => l.id === id);
      if (lead) {
        lead.status = val;
        if (val === 'Called' && !lead.calledAt) lead.calledAt = Date.now();
        sel.className = `ld-select st-${slug(val)}`;
        saveToStorage();
        showToast(`Status updated: ${val}`, 'info');
      }
    }
  }

  function handleLeadListInput(e) {
    const noteInput = e.target.closest('[data-note-for]');
    if (noteInput) {
      const id = noteInput.dataset.noteFor;
      const lead = leads.find(l => l.id === id);
      if (lead) {
        lead.notes = noteInput.value;
        saveToStorage();
      }
    }
  }

  // ── TRIGGER WHATSAPP & AUTO-DELETE LEAD ──────
  function triggerWhatsApp(leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead || !lead.phone) return;

    // 1. Launch WhatsApp URL in new window
    const targetWa = waNumber(lead.phone);
    const waUrl = `https://wa.me/${targetWa}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // 2. Increment messaged outreach count
    messagedCount++;
    localStorage.setItem('leadvault_messaged_count', String(messagedCount));

    // 3. Remove lead immediately with animation and Undo option
    deleteLeadWithAnimation(leadId, `Sent to WhatsApp • Lead removed`);
  }

  // ── DELETE LEAD WITH ANIMATION & UNDO ────────
  function deleteLeadWithAnimation(id, toastMessage) {
    const leadIdx = leads.findIndex(l => l.id === id);
    if (leadIdx === -1) return;

    const removedLead = leads[leadIdx];
    undoLead = { ...removedLead };

    // Clear any active undo timer
    if (undoTimer) {
      clearTimeout(undoTimer);
      undoTimer = null;
    }

    // Animate item slide out
    const wrapper = document.querySelector(`.lead-card-wrapper[data-id="${id}"]`);
    if (wrapper) {
      wrapper.classList.add('removing');
    }

    // Remove from array after animation
    setTimeout(() => {
      leads = leads.filter(l => l.id !== id);
      saveToStorage();

      if (wrapper && wrapper.parentNode) {
        wrapper.remove();
      }

      // Update counter
      if (leadsCount) {
        const remaining = leadsList.querySelectorAll('.lead-card-wrapper').length;
        leadsCount.textContent = `${remaining} lead${remaining !== 1 ? 's' : ''}`;
      }

      // Show toast with Undo button
      showUndoToast(toastMessage || 'Lead removed', () => {
        // Undo callback
        if (undoLead) {
          leads.splice(leadIdx, 0, undoLead);
          saveToStorage();
          undoLead = null;
          renderApp();
          showToast('Lead restored', 'success');
        }
      });

      // Expire undo after 6 seconds
      undoTimer = setTimeout(() => {
        undoLead = null;
        undoTimer = null;
      }, 6000);
    }, 280);
  }

  // ── CLEAR ALL LEADS ────────────────────────
  function handleClearAll() {
    if (leads.length === 0) return;
    const confirmMsg = `Are you sure you want to clear all ${leads.length} leads? You can export your data first.`;
    if (!confirm(confirmMsg)) return;

    leads = [];
    currentFilter = { type: 'all', value: null, title: 'All Leads' };
    saveToStorage();
    renderApp();
    switchTab('home');
    showToast('All leads cleared', 'info');
  }

  // ── RELOAD DEFAULT KAMPALA LEADS ───────────
  function handleReloadDefault() {
    if (leads.length > 0) {
      if (!confirm('This will reload the default 117 Kampala verified leads. Continue?')) return;
    }
    loadDefaultLeads(true);
  }

  function loadDefaultLeads(manual = false) {
    showLoading('Loading verified Kampala leads…');
    fetch('./leads_current.csv')
      .then(res => {
        if (!res.ok) throw new Error('Could not fetch leads_current.csv');
        return res.text();
      })
      .then(csvText => {
        const parsed = parseCSV(csvText);
        if (parsed.length > 0) {
          const mapped = mapToLeads(parsed);
          // Set timestamps for timeline categorization
          const now = Date.now();
          const oneDay = 86400000;
          leads = mapped.map((lead, idx) => {
            // distribute between today, yesterday, and earlier
            let importedAt = now;
            if (idx > 50) importedAt = now - oneDay - 1000; // yesterday
            if (idx > 90) importedAt = now - (oneDay * 3);  // earlier
            return { ...lead, importedAt };
          });

          saveToStorage();
          renderApp();
          hideLoading();
          showToast(`${leads.length} verified Kampala leads loaded`, 'success');
        } else {
          hideLoading();
        }
      })
      .catch(err => {
        console.warn('Default leads fetch failed:', err);
        hideLoading();
        if (manual) showToast('Could not load default leads file', 'error');
      });
  }

  // ── FILE IMPORT (CSV / EXCEL) ──────────────
  function handleFile(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      showToast('Unsupported format. Please upload .csv or .xlsx', 'error');
      return;
    }

    showLoading('Importing your leads…');
    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        const data = ext === 'csv' ? parseCSV(ev.target.result) : parseExcel(ev.target.result);
        if (!data || data.length === 0) {
          hideLoading();
          showToast('No data rows found in file', 'error');
          return;
        }

        const mapped = mapToLeads(data);
        const existingPhones = new Set(leads.map(l => localDigits(l.phone)).filter(Boolean));
        const fresh = [];
        let dupes = 0;

        for (const l of mapped) {
          const phoneKey = localDigits(l.phone);
          if (phoneKey && existingPhones.has(phoneKey)) {
            dupes++;
            continue;
          }
          if (phoneKey) existingPhones.add(phoneKey);
          fresh.push(l);
        }

        leads = [...leads, ...fresh];
        saveToStorage();
        renderApp();
        hideLoading();
        showToast(`Imported ${fresh.length} leads` + (dupes ? ` (${dupes} duplicates skipped)` : ''), 'success');
        switchTab('leads');
      } catch (err) {
        hideLoading();
        console.error(err);
        showToast('Error parsing file. Check format.', 'error');
      }
    };

    if (ext === 'csv') reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  }

  // ── CSV & EXCEL PARSERS ────────────────────
  function parseCSV(text) {
    const clean = text.replace(/^\uFEFF/, ''); // strip BOM
    const lines = clean.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = parseCSVLine(lines[0]);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.some(v => v.trim())) {
        const row = {};
        headers.forEach((h, idx) => {
          row[h.trim()] = (values[idx] || '').trim();
        });
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
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
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

  function parseExcel(buffer) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames.find(n => /lead|call|contact|prospect|sheet/i.test(n)) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
  }

  // ── DATA MAPPING ───────────────────────────
  function mapToLeads(data) {
    if (!data.length) return [];
    const headers = Object.keys(data[0]);
    const m = detectColumns(headers);

    return data.map((row, i) => {
      const rawPhone = getVal(row, m.phone) || getVal(row, m.phoneAlt);
      const statusVal = getVal(row, m.status);

      return {
        id: Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 7),
        name: getVal(row, m.name) || 'Unknown Business',
        phone: rawPhone ? telNumber(rawPhone) : '',
        email: getVal(row, m.email) || '',
        company: getVal(row, m.company) || '',
        segment: getVal(row, m.segment) || 'General',
        category: getVal(row, m.category) || '',
        area: getVal(row, m.area) || 'Kampala',
        address: getVal(row, m.address) || '',
        priority: getVal(row, m.priority) || 'Medium',
        reviews: getVal(row, m.reviews) || '',
        mapsUrl: getVal(row, m.mapsUrl) || '',
        status: STATUS_KEYS.includes(statusVal) ? statusVal : 'Not called',
        notes: getVal(row, m.notes) || '',
        importedAt: Date.now(),
        calledAt: null,
        messagedAt: null
      };
    }).filter(l => (l.name && l.name !== 'Unknown Business') || l.phone);
  }

  function detectColumns(headers) {
    const lower = headers.map(h => h.toLowerCase().trim());
    const f = (...candidates) => {
      for (const c of candidates) {
        const idx = lower.indexOf(c);
        if (idx !== -1) return headers[idx];
      }
      for (const c of candidates) {
        const idx = lower.findIndex(h => h.includes(c));
        if (idx !== -1) return headers[idx];
      }
      return null;
    };

    return {
      name:     f('name', 'business name', 'full name', 'lead name', 'company name'),
      phone:    f('phone', 'mobile', 'tel', 'phone number', 'contact number', 'whatsapp'),
      phoneAlt: f('secondphone', 'phone (local)', 'phone local', 'phonelocal'),
      email:    f('email', 'e-mail', 'mail'),
      company:  f('company', 'organization', 'organisation', 'business'),
      segment:  f('segment', 'industry', 'sector'),
      category: f('category', 'type'),
      area:     f('area', 'location', 'district', 'region', 'city'),
      address:  f('address', 'street'),
      priority: f('priority', 'tier', 'rank'),
      reviews:  f('reviews', 'rating count'),
      mapsUrl:  f('mapsurl', 'maps link', 'maps url', 'google maps', 'map'),
      status:   f('status', 'call status', 'stage'),
      notes:    f('notes', 'note', 'comment', 'remarks')
    };
  }

  function getVal(row, key) {
    if (!key) return '';
    return String(row[key] ?? '').trim();
  }

  // ── EXPORT CSV ─────────────────────────────
  function exportCSV() {
    if (!leads.length) {
      showToast('No leads to export', 'info');
      return;
    }

    const cols = ['Name', 'Phone', 'Email', 'Company', 'Segment', 'Category', 'Area', 'Address', 'Priority', 'Status', 'Notes'];
    const cell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const lines = [cols.join(',')];
    leads.forEach(l => {
      lines.push([l.name, l.phone, l.email, l.company, l.segment, l.category, l.area, l.address, l.priority, l.status, l.notes].map(cell).join(','));
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leadvault-export-${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${leads.length} leads`, 'success');
  }

  // ═══════════════════════════════════════════
  //  PHONE & FORMATTING HELPERS (UGANDA)
  // ═══════════════════════════════════════════
  function localDigits(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith(COUNTRY_CODE)) d = '0' + d.slice(COUNTRY_CODE.length);
    else if (!d.startsWith('0') && d.length === 9) d = '0' + d;
    return d;
  }

  // Bare international format required by wa.me (e.g. 256772123456)
  function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith(COUNTRY_CODE)) return d;
    if (d.startsWith('0')) return COUNTRY_CODE + d.slice(1);
    if (d.length === 9) return COUNTRY_CODE + d;
    return d;
  }

  // Tel format with leading + (+256...)
  function telNumber(phone) {
    const wa = waNumber(phone);
    return wa ? '+' + wa : '';
  }

  // Ugandan mobile prefixes (070-079) vs landlines (041, 039, 031, 020, 042)
  function isMobile(phone) {
    let d = localDigits(phone);
    return /^0(7[0-9])/.test(d);
  }

  function formatPhone(phone) {
    const d = localDigits(phone);
    if (!d) return '';
    if (d.length === 10) return d.replace(/^(\d{4})(\d{3})(\d{3})$/, '$1 $2 $3');
    return d;
  }

  function getInitials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return String(name || '?').slice(0, 2).toUpperCase();
  }

  function getCategoryEmoji(segment) {
    const lower = String(segment || '').toLowerCase();
    for (const [key, emoji] of Object.entries(CATEGORY_EMOJIS)) {
      if (key !== 'default' && lower.includes(key)) return emoji;
    }
    return CATEGORY_EMOJIS.default;
  }

  function shortSegment(s) {
    return String(s || '').split('/')[0].trim();
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
  //  STORAGE
  // ═══════════════════════════════════════════
  function saveToStorage() {
    try {
      localStorage.setItem('leadvault_leads', JSON.stringify(leads));
    } catch (_) {
      showToast('Storage full or unavailable', 'error');
    }
  }

  function loadFromStorage() {
    try {
      const savedCount = localStorage.getItem('leadvault_messaged_count');
      if (savedCount) messagedCount = parseInt(savedCount, 10) || 0;

      const savedLeads = localStorage.getItem('leadvault_leads');
      if (savedLeads) {
        const parsed = JSON.parse(savedLeads);
        if (Array.isArray(parsed) && parsed.length > 0) {
          leads = parsed;
        }
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════
  //  UI NOTIFICATIONS & OVERLAYS
  // ═══════════════════════════════════════════
  function showToast(msg, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${escapeHtml(msg)}`;
    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3200);
  }

  function showUndoToast(msg, onUndo) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast info';
    toast.innerHTML = `
      <span>💬</span>
      <span style="flex:1">${escapeHtml(msg)}</span>
      <button class="undo-btn">Undo</button>
    `;

    const undoBtn = toast.querySelector('.undo-btn');
    undoBtn.addEventListener('click', () => {
      onUndo();
      toast.remove();
    });

    toastContainer.appendChild(toast);
    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5800);
  }

  function showLoading(msg) {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.id = 'loading-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `<div class="spinner"></div><p>${escapeHtml(msg)}</p>`;
  }

  function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.remove();
  }

  // ═══════════════════════════════════════════
  //  SERVICE WORKER REGISTRATION
  // ═══════════════════════════════════════════
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(() => console.log('LeadVault SW active'))
          .catch(err => console.log('SW registration note:', err));
      });
    }
  }

})();
