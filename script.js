
// ===== DATA STORE =====
const DB_KEY = 'mattrack_data_v2';
let materials = [];
let currentFilter = 'All';
let currentView = 'dashboard';
let searchQuery = '';
let csvData = [];
let viewingLotsMaterialId = null;

function loadData() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    materials = raw ? JSON.parse(raw) : [];
  } catch(e) { materials = []; }
}

function saveData() {
  localStorage.setItem(DB_KEY, JSON.stringify(materials));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ===== THEME =====
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeLabel').textContent = isDark ? '🌙 Dark Mode' : '☀️ Light Mode';
  localStorage.setItem('mattrack_theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
  const t = localStorage.getItem('mattrack_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeLabel').textContent = t === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode';
}

// ===== NAVIGATION =====
function switchView(view, btnEl) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const titles = { dashboard: 'Dashboard', materials: 'Materials', report: 'Reports' };
  document.getElementById('pageTitle').textContent = titles[view] || view;

  if (view === 'dashboard') refreshDashboard();
  if (view === 'materials') renderMaterials();
  if (view === 'report') renderReport();

  closeMobileSidebar();
}

function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('overlayBg').classList.add('show');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlayBg').classList.remove('show');
}

// ===== CALCULATIONS =====
function calcMaterial(m) {
  const received = (m.lots || []).reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
  const required = parseFloat(m.required) || 0;
  const balance = required - received;
  const pct = required > 0 ? Math.min((received / required) * 100, 100) : 0;
  return { received, required, balance, pct };
}

function getFilteredMaterials() {
  return materials.filter(m => {
    const matchCat = currentFilter === 'All' || m.category === currentFilter;
    const matchSearch = !searchQuery ||
      m.description.toLowerCase().includes(searchQuery) ||
      m.category.toLowerCase().includes(searchQuery) ||
      m.unit.toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
}

// ===== DASHBOARD =====
function refreshDashboard() {
  renderSummaryStats();
  renderSummaryTable();
  renderShortageTable();
}

function renderSummaryStats() {
  const cats = ['HVAC', 'Civil', 'Electrical', 'IBMS'];
  const all = materials;

  const totalReq = all.reduce((s, m) => s + (parseFloat(m.required) || 0), 0);
  const totalRec = all.reduce((s, m) => s + calcMaterial(m).received, 0);
  const totalBal = totalReq - totalRec;
  const overallPct = totalReq > 0 ? Math.round((totalRec / totalReq) * 100) : 0;
  const shortageCount = all.filter(m => calcMaterial(m).balance > 0).length;

  const statsEl = document.getElementById('summaryStats');
  let html = `
    <div class="stat-card total animate-in">
      <span class="stat-icon">📦</span>
      <div class="stat-label">Total Items</div>
      <div class="stat-value">${all.length}</div>
      <div class="stat-sub">${shortageCount} with shortage</div>
      <span class="stat-badge ${shortageCount === 0 ? 'badge-success' : 'badge-warning'}">${overallPct}% Complete</span>
    </div>
    <div class="stat-card total animate-in">
      <span class="stat-icon">✅</span>
      <div class="stat-label">Total Received</div>
      <div class="stat-value">${fmtNum(totalRec)}</div>
      <div class="stat-sub">of ${fmtNum(totalReq)} required</div>
      <span class="stat-badge badge-neutral">${fmtNum(totalBal > 0 ? totalBal : 0)} pending</span>
    </div>
  `;

  cats.forEach(cat => {
    const items = all.filter(m => m.category === cat);
    const req = items.reduce((s, m) => s + (parseFloat(m.required) || 0), 0);
    const rec = items.reduce((s, m) => s + calcMaterial(m).received, 0);
    const pct = req > 0 ? Math.round((rec / req) * 100) : 0;
    html += `
      <div class="stat-card ${cat.toLowerCase()} animate-in">
        <span class="stat-icon">${catIcon(cat)}</span>
        <div class="stat-label">${cat}</div>
        <div class="stat-value">${items.length}</div>
        <div class="stat-sub">${pct}% received</div>
        <span class="stat-badge ${pct >= 100 ? 'badge-success' : pct >= 50 ? 'badge-warning' : 'badge-danger'}">${pct}% done</span>
      </div>
    `;
  });

  statsEl.innerHTML = html;
}

function renderSummaryTable() {
  const cats = ['HVAC', 'Civil', 'Electrical', 'IBMS'];
  const tbody = document.getElementById('summaryTableBody');
  tbody.innerHTML = cats.map(cat => {
    const items = materials.filter(m => m.category === cat);
    const req = items.reduce((s, m) => s + (parseFloat(m.required) || 0), 0);
    const rec = items.reduce((s, m) => s + calcMaterial(m).received, 0);
    const bal = req - rec;
    const pct = req > 0 ? Math.min(Math.round((rec / req) * 100), 100) : 0;
    const fillClass = pct >= 100 ? 'fill-ok' : pct >= 60 ? 'fill-warn' : 'fill-danger';
    return `
      <tr>
        <td><span class="mc-cat-badge cat-${cat.toLowerCase()}">${cat}</span></td>
        <td class="td-mono">${items.length}</td>
        <td class="td-mono">${fmtNum(req)}</td>
        <td class="td-mono">${fmtNum(rec)}</td>
        <td class="td-mono ${bal > 0 ? 'shortage' : 'surplus'}">${bal > 0 ? fmtNum(bal) : '✓ Fulfilled'}</td>
        <td style="min-width:120px">
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden">
              <div class="progress-bar-fill ${fillClass}" style="width:${pct}%"></div>
            </div>
            <span class="td-mono" style="font-size:.72rem;width:36px;text-align:right">${pct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderShortageTable() {
  const shortages = materials.filter(m => calcMaterial(m).balance > 0)
    .sort((a, b) => calcMaterial(b).balance - calcMaterial(a).balance);

  const tbody = document.getElementById('shortageTableBody');
  const section = document.getElementById('shortageSection');

  if (!shortages.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  tbody.innerHTML = shortages.map(m => {
    const c = calcMaterial(m);
    const pct = Math.round(c.pct);
    return `
      <tr class="shortage-row">
        <td><strong>${m.description}</strong></td>
        <td><span class="mc-cat-badge cat-${m.category.toLowerCase()}">${m.category}</span></td>
        <td class="td-mono">${fmtNum(c.required)} ${m.unit}</td>
        <td class="td-mono">${fmtNum(c.received)} ${m.unit}</td>
        <td class="td-mono shortage"><strong>-${fmtNum(c.balance)} ${m.unit}</strong></td>
        <td>
          <span class="stat-badge ${pct < 30 ? 'badge-danger' : 'badge-warning'}">${pct}% arrived</span>
        </td>
      </tr>
    `;
  }).join('');
}

// ===== MATERIALS GRID =====
function renderMaterials() {
  const filtered = getFilteredMaterials();
  const grid = document.getElementById('materialsGrid');
  document.getElementById('materialCount').textContent =
    `${filtered.length} item${filtered.length !== 1 ? 's' : ''} ${currentFilter !== 'All' ? 'in ' + currentFilter : 'total'}`;

  if (!filtered.length) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📭</div>
        <div class="empty-title">${searchQuery || currentFilter !== 'All' ? 'No results found' : 'No materials yet'}</div>
        <div class="empty-sub">${searchQuery ? 'Try adjusting your search' : 'Add your first material item to get started tracking.'}</div>
        ${!searchQuery ? '<button class="btn btn-primary" onclick="openAddMaterial()">＋ Add First Item</button>' : ''}
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map((m, i) => {
    const c = calcMaterial(m);
    const fillClass = c.pct >= 100 ? 'fill-over' : c.pct >= 75 ? 'fill-ok' : c.pct >= 40 ? 'fill-warn' : 'fill-danger';
    const lots = m.lots || [];
    const lotChips = lots.map((l, li) => `
      <span class="lot-chip" onclick="openViewLots('${m.id}')">
        <span class="lot-dot"></span>
        Lot ${li + 1} — ${fmtNum(l.qty)} ${m.unit}
      </span>
    `).join('');

    return `
      <div class="material-card animate-in" style="animation-delay:${Math.min(i * 0.04, 0.32)}s">
        <div class="mc-header">
          <div>
            <span class="mc-cat-badge cat-${m.category.toLowerCase()}">${m.category}</span>
            <div class="mc-title">${escHtml(m.description)}</div>
            <div class="mc-unit">Unit: ${escHtml(m.unit)}</div>
          </div>
          <div class="mc-actions">
            <button class="btn-icon" title="Edit" onclick="editMaterial('${m.id}')">✏️</button>
            <button class="btn-icon" title="Delete" onclick="deleteMaterial('${m.id}')">🗑</button>
          </div>
        </div>
        <div class="mc-body">
          <div class="progress-row">
            <span class="progress-label">Delivery Progress</span>
            <span class="progress-nums">${fmtNum(c.received)} / ${fmtNum(c.required)} ${m.unit}</span>
          </div>
          <div class="progress-bar-wrap">
            <div class="progress-bar-fill ${fillClass}" style="width:${c.pct}%"></div>
          </div>
          <div class="mc-stats">
            <div class="mc-stat">
              <div class="mc-stat-val">${fmtNum(c.required)}</div>
              <div class="mc-stat-lbl">Required</div>
            </div>
            <div class="mc-stat">
              <div class="mc-stat-val">${fmtNum(c.received)}</div>
              <div class="mc-stat-lbl">Received</div>
            </div>
            <div class="mc-stat">
              <div class="mc-stat-val ${c.balance > 0 ? 'shortage' : 'surplus'}">${c.balance > 0 ? fmtNum(c.balance) : '✓'}</div>
              <div class="mc-stat-lbl">${c.balance > 0 ? 'Shortage' : 'Complete'}</div>
            </div>
          </div>
          <div class="mc-lots">
            <div class="mc-lots-title">${lots.length} Delivery lot${lots.length !== 1 ? 's' : ''}</div>
            ${lotChips}
            <button class="add-lot-btn" onclick="openAddLot('${m.id}')">＋ Add Lot</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== FILTER =====
function setFilter(cat, btnEl) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) { btnEl.classList.add('active'); }
  else {
    const b = document.querySelector(`.filter-btn[data-filter="${cat}"]`);
    if (b) b.classList.add('active');
  }
  if (currentView === 'materials') renderMaterials();
}

function onSearch() {
  searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
  if (currentView === 'materials') renderMaterials();
  else { switchView('materials'); }
}

// ===== MODAL HELPERS =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// ===== ADD/EDIT MATERIAL =====
function openAddMaterial() {
  clearForm();
  document.getElementById('fMaterialId').value = '';
  document.getElementById('modalMaterialTitle').textContent = 'Add Material';
  openModal('modalMaterial');
  setTimeout(() => document.getElementById('fCategory').focus(), 100);
}

function editMaterial(id) {
  const m = materials.find(x => x.id === id);
  if (!m) return;
  clearForm();
  document.getElementById('fMaterialId').value = m.id;
  document.getElementById('fCategory').value = m.category;
  document.getElementById('fUnit').value = m.unit;
  document.getElementById('fDescription').value = m.description;
  document.getElementById('fRequired').value = m.required;
  document.getElementById('fRemarks').value = m.remarks || '';
  document.getElementById('modalMaterialTitle').textContent = 'Edit Material';
  openModal('modalMaterial');
}

function clearForm() {
  ['fCategory','fUnit','fDescription','fRequired','fRemarks'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('error'); }
  });
  document.querySelectorAll('.form-error').forEach(e => e.classList.remove('show'));
}

function saveMaterial() {
  let valid = true;
  const cat = document.getElementById('fCategory').value.trim();
  const unit = document.getElementById('fUnit').value.trim();
  const desc = document.getElementById('fDescription').value.trim();
  const req = document.getElementById('fRequired').value;
  const remarks = document.getElementById('fRemarks').value.trim();

  const setErr = (field, errId, show) => {
    document.getElementById(field).classList.toggle('error', show);
    document.getElementById(errId).classList.toggle('show', show);
    if (show) valid = false;
  };

  setErr('fCategory','errCategory', !cat);
  setErr('fUnit','errUnit', !unit);
  setErr('fDescription','errDescription', !desc);
  setErr('fRequired','errRequired', !req || isNaN(req) || parseFloat(req) < 0);

  if (!valid) return;

  const id = document.getElementById('fMaterialId').value;
  if (id) {
    const m = materials.find(x => x.id === id);
    if (m) { m.category = cat; m.unit = unit; m.description = desc; m.required = parseFloat(req); m.remarks = remarks; m.updatedAt = new Date().toISOString(); }
    toast('Material updated!', 'success');
  } else {
    materials.push({ id: generateId(), category: cat, unit, description: desc, required: parseFloat(req), remarks, lots: [], createdAt: new Date().toISOString() });
    toast('Material added!', 'success');
  }
  saveData();
  closeModal('modalMaterial');
  renderMaterials();
  if (currentView === 'dashboard') refreshDashboard();
}

// ===== ADD LOT =====
function openAddLot(materialId, lotId) {
  const m = materials.find(x => x.id === materialId);
  if (!m) return;
  const c = calcMaterial(m);
  document.getElementById('lotMaterialInfo').innerHTML = `
    <strong>${escHtml(m.description)}</strong> <span class="mc-cat-badge cat-${m.category.toLowerCase()}" style="font-size:.65rem">${m.category}</span><br>
    <span style="color:var(--text-muted);font-size:.8rem">Required: <strong>${fmtNum(c.required)}</strong> ${m.unit} &nbsp;|&nbsp; Received: <strong>${fmtNum(c.received)}</strong> ${m.unit} &nbsp;|&nbsp; Balance: <strong class="${c.balance > 0 ? 'shortage' : 'surplus'}">${fmtNum(Math.abs(c.balance))}</strong></span>
  `;
  document.getElementById('fLotMaterialId').value = materialId;
  document.getElementById('fLotId').value = lotId || '';
  document.getElementById('fLotQty').value = '';
  document.getElementById('fLotDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('fLotRemarks').value = '';
  document.querySelectorAll('#modalLot .form-error').forEach(e => e.classList.remove('show'));
  document.querySelectorAll('#modalLot .form-input').forEach(e => e.classList.remove('error'));

  if (lotId) {
    const m2 = materials.find(x => x.id === materialId);
    const lot = (m2.lots || []).find(l => l.id === lotId);
    if (lot) {
      document.getElementById('fLotQty').value = lot.qty;
      document.getElementById('fLotDate').value = lot.date;
      document.getElementById('fLotRemarks').value = lot.remarks || '';
    }
    document.getElementById('modalLotTitle').textContent = 'Edit Delivery Lot';
  } else {
    const lotNum = ((m.lots || []).length) + 1;
    document.getElementById('modalLotTitle').textContent = `Add Delivery Lot #${lotNum}`;
  }

  openModal('modalLot');
}

function saveLot() {
  const matId = document.getElementById('fLotMaterialId').value;
  const lotId = document.getElementById('fLotId').value;
  const qty = document.getElementById('fLotQty').value;
  const date = document.getElementById('fLotDate').value;
  const remarks = document.getElementById('fLotRemarks').value.trim();
  let valid = true;

  const setErr = (field, errId, show) => {
    document.getElementById(field).classList.toggle('error', show);
    document.getElementById(errId).classList.toggle('show', show);
    if (show) valid = false;
  };
  setErr('fLotQty','errLotQty', !qty || isNaN(qty) || parseFloat(qty) <= 0);
  setErr('fLotDate','errLotDate', !date);
  if (!valid) return;

  const m = materials.find(x => x.id === matId);
  if (!m) return;
  if (!m.lots) m.lots = [];

  if (lotId) {
    const lot = m.lots.find(l => l.id === lotId);
    if (lot) { lot.qty = parseFloat(qty); lot.date = date; lot.remarks = remarks; }
    toast('Lot updated!', 'success');
  } else {
    m.lots.push({ id: generateId(), qty: parseFloat(qty), date, remarks, createdAt: new Date().toISOString() });
    toast(`Lot #${m.lots.length} added!`, 'success');
  }
  saveData();
  closeModal('modalLot');
  renderMaterials();
  if (viewingLotsMaterialId === matId) openViewLots(matId);
  if (currentView === 'dashboard') refreshDashboard();
}

// ===== VIEW LOTS =====
function openViewLots(materialId) {
  viewingLotsMaterialId = materialId;
  const m = materials.find(x => x.id === materialId);
  if (!m) return;
  const c = calcMaterial(m);
  document.getElementById('viewLotsTitle').textContent = m.description;
  document.getElementById('viewLotsSub').textContent = `${m.category} · ${fmtNum(c.received)}/${fmtNum(c.required)} ${m.unit} received`;

  const lots = m.lots || [];
  const list = document.getElementById('lotDetailList');
  if (!lots.length) {
    list.innerHTML = `<div class="empty-state" style="padding:32px 16px"><div class="empty-icon">📬</div><div class="empty-title">No lots yet</div><div class="empty-sub">Add a delivery lot to start tracking received quantities.</div></div>`;
  } else {
    list.innerHTML = lots.map((l, i) => `
      <div class="lot-item">
        <div class="lot-num">${i + 1}</div>
        <div class="lot-info">
          <div class="lot-qty">${fmtNum(l.qty)} ${m.unit}</div>
          <div class="lot-date">📅 ${formatDate(l.date)}</div>
          ${l.remarks ? `<div class="lot-remark">${escHtml(l.remarks)}</div>` : ''}
        </div>
        <div class="lot-actions">
          <button class="btn-icon" title="Edit" onclick="openAddLot('${m.id}','${l.id}')">✏️</button>
          <button class="btn-icon" title="Delete" onclick="deleteLot('${m.id}','${l.id}')">🗑</button>
        </div>
      </div>
    `).join('');
  }
  openModal('modalViewLots');
}

function addLotFromView() {
  closeModal('modalViewLots');
  setTimeout(() => openAddLot(viewingLotsMaterialId), 200);
}

function deleteLot(matId, lotId) {
  if (!confirm('Delete this lot?')) return;
  const m = materials.find(x => x.id === matId);
  if (!m) return;
  m.lots = (m.lots || []).filter(l => l.id !== lotId);
  saveData();
  toast('Lot deleted', 'info');
  renderMaterials();
  if (viewingLotsMaterialId === matId) openViewLots(matId);
  if (currentView === 'dashboard') refreshDashboard();
}

function deleteMaterial(id) {
  if (!confirm('Delete this material and all its lots?')) return;
  materials = materials.filter(m => m.id !== id);
  saveData();
  toast('Material deleted', 'info');
  renderMaterials();
  refreshDashboard();
}

// ===== CSV IMPORT =====
function openUploadModal() { openModal('modalUpload'); csvData = []; document.getElementById('csvPreview').innerHTML = ''; document.getElementById('importBtn').disabled = true; }

function dragOver(e) { e.preventDefault(); document.getElementById('uploadZone').classList.add('drag-over'); }
function dragLeave() { document.getElementById('uploadZone').classList.remove('drag-over'); }
function dropFile(e) { e.preventDefault(); dragLeave(); const f = e.dataTransfer.files[0]; if (f) processCSVFile(f); }
function handleCSVFile(e) { const f = e.target.files[0]; if (f) processCSVFile(f); }

function processCSVFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const rows = text.split('\n').filter(r => r.trim());
    csvData = [];
    const validCats = ['HVAC', 'Civil', 'Electrical', 'IBMS'];
    let errors = 0;

    rows.forEach((row, i) => {
      if (i === 0 && row.toLowerCase().includes('category')) return; // skip header
      const cols = parseCSVRow(row);
      if (cols.length < 4) return;
      const cat = cols[0]?.trim();
      const desc = cols[1]?.trim();
      const unit = cols[2]?.trim();
      const req = parseFloat(cols[3]);
      const remarks = cols[4]?.trim() || '';
      if (!validCats.includes(cat) || !desc || !unit || isNaN(req)) { errors++; return; }
      csvData.push({ category: cat, description: desc, unit, required: req, remarks });
    });

    const preview = document.getElementById('csvPreview');
    if (!csvData.length) {
      preview.innerHTML = `<div style="color:var(--danger);padding:12px;background:var(--danger-soft);border-radius:var(--radius-sm);margin:12px 0;font-size:.83rem">❌ No valid rows found. Check the format.</div>`;
      document.getElementById('importBtn').disabled = true;
    } else {
      preview.innerHTML = `<div style="color:var(--success);padding:12px;background:var(--success-soft);border-radius:var(--radius-sm);margin:12px 0;font-size:.83rem">✅ Found <strong>${csvData.length}</strong> valid items to import. ${errors ? `<span style="color:var(--warning)">(${errors} rows skipped)</span>` : ''}</div>`;
      document.getElementById('importBtn').disabled = false;
    }
  };
  reader.readAsText(file);
}

function parseCSVRow(row) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let c of row) {
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += c; }
  }
  result.push(current);
  return result;
}

function importCSV() {
  if (!csvData.length) return;
  csvData.forEach(row => {
    materials.push({ id: generateId(), ...row, lots: [], createdAt: new Date().toISOString() });
  });
  saveData();
  toast(`${csvData.length} items imported!`, 'success');
  closeModal('modalUpload');
  renderMaterials();
  refreshDashboard();
}

// ===== CSV EXPORT =====
function exportCSV() {
  const header = ['Category', 'Description', 'Unit', 'Required Qty', 'Received Qty', 'Balance', '% Complete', 'Remarks'];
  const rows = materials.map(m => {
    const c = calcMaterial(m);
    return [m.category, m.description, m.unit, c.required, fmtNum(c.received), fmtNum(c.balance > 0 ? c.balance : 0), Math.round(c.pct) + '%', m.remarks || ''];
  });
  downloadCSV([header, ...rows], 'mattrack-summary.csv');
}

function exportDetailCSV() {
  const rows = [['Category', 'Description', 'Unit', 'Required', 'Lot #', 'Received Qty', 'Date', 'Remarks']];
  materials.forEach(m => {
    const lots = m.lots || [];
    if (!lots.length) {
      rows.push([m.category, m.description, m.unit, m.required, '-', 0, '-', m.remarks || '']);
    } else {
      lots.forEach((l, i) => {
        rows.push([m.category, m.description, m.unit, m.required, `Lot ${i + 1}`, l.qty, l.date, l.remarks || '']);
      });
    }
  });
  downloadCSV(rows, 'mattrack-lot-detail.csv');
}

function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported!', 'success');
}

// ===== REPORT VIEW =====
function renderReport() {
  const cats = ['HVAC', 'Civil', 'Electrical', 'IBMS'];
  const reportEl = document.getElementById('reportContent');
  const now = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  let html = `
    <div style="margin-bottom:24px;padding:20px;background:var(--bg-card);border-radius:var(--radius-lg);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:1.3rem;font-weight:700">Material Status Report</div>
          <div style="font-size:.83rem;color:var(--text-muted);margin-top:4px">Generated: ${now}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.75rem;color:var(--text-muted)">Total Items</div>
          <div style="font-size:1.6rem;font-weight:700;font-family:var(--font-mono)">${materials.length}</div>
        </div>
      </div>
    </div>
  `;

  cats.forEach(cat => {
    const items = materials.filter(m => m.category === cat);
    if (!items.length) return;
    html += `
      <div class="report-section">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          <span class="mc-cat-badge cat-${cat.toLowerCase()}" style="font-size:.8rem;padding:5px 14px">${cat}</span>
          <span style="font-size:.85rem;color:var(--text-muted)">${items.length} items</span>
        </div>
        <div class="table-card">
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th>Required</th>
                  <th>Received</th>
                  <th>Balance</th>
                  <th>Lots</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((m, i) => {
                  const c = calcMaterial(m);
                  const fillClass = c.pct >= 100 ? 'fill-over' : c.pct >= 60 ? 'fill-ok' : c.pct >= 30 ? 'fill-warn' : 'fill-danger';
                  return `
                    <tr ${c.balance > 0 ? 'class="shortage-row"' : ''}>
                      <td class="td-mono" style="color:var(--text-muted)">${i+1}</td>
                      <td><strong>${escHtml(m.description)}</strong>${m.remarks ? `<br><span style="font-size:.72rem;color:var(--text-muted)">${escHtml(m.remarks)}</span>` : ''}</td>
                      <td class="td-mono">${m.unit}</td>
                      <td class="td-mono">${fmtNum(c.required)}</td>
                      <td class="td-mono">${fmtNum(c.received)}</td>
                      <td class="td-mono ${c.balance > 0 ? 'shortage' : 'surplus'}">${c.balance > 0 ? '-' + fmtNum(c.balance) : '✓'}</td>
                      <td class="td-mono">${(m.lots||[]).length}</td>
                      <td style="min-width:100px">
                        <div style="display:flex;align-items:center;gap:6px">
                          <div style="flex:1;height:5px;background:var(--bg-input);border-radius:99px;overflow:hidden">
                            <div class="progress-bar-fill ${fillClass}" style="width:${c.pct}%"></div>
                          </div>
                          <span class="td-mono" style="font-size:.7rem;width:32px">${Math.round(c.pct)}%</span>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  });

  if (!materials.length) {
    html += `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No data to report</div><div class="empty-sub">Add materials first to generate a report.</div></div>`;
  }

  reportEl.innerHTML = html;
}

// ===== TOAST =====
function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'fadeOut .3s forwards';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ===== UTILS =====
function fmtNum(n) {
  if (n === undefined || n === null) return '0';
  const num = parseFloat(n);
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? num.toLocaleString() : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try { return new Date(dateStr).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); } catch { return dateStr; }
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function catIcon(cat) {
  return { HVAC:'🌬', Civil:'🏗', Electrical:'⚡', IBMS:'📡' }[cat] || '📦';
}

// ===== SEED DATA =====
function seedSampleData() {
  if (materials.length) return;
  const sample = [
    { cat:'HVAC', desc:'AHU (Air Handling Unit) - 10TR', unit:'Nos', req:12, rem:'Main floors' },
    { cat:'HVAC', desc:'Chilled Water Insulated Pipes 3"', unit:'m', req:1500, rem:'' },
    { cat:'HVAC', desc:'FCU - Ceiling Concealed 1.5TR', unit:'Nos', req:80, rem:'Zone B' },
    { cat:'HVAC', desc:'Ductwork GI Sheet 0.8mm', unit:'kg', req:8500, rem:'' },
    { cat:'Civil', desc:'Ready Mix Concrete M25 Grade', unit:'m³', req:2200, rem:'Slab & Beams' },
    { cat:'Civil', desc:'TMT Steel Bar Fe500 - 16mm', unit:'MT', req:85, rem:'' },
    { cat:'Civil', desc:'AAC Blocks 600x200x150mm', unit:'Nos', req:45000, rem:'Partition walls' },
    { cat:'Electrical', desc:'LT Panel Main Incomer 2000A', unit:'Nos', req:4, rem:'Substation' },
    { cat:'Electrical', desc:'XLPE Cable 3.5C×95 sqmm', unit:'m', req:3200, rem:'' },
    { cat:'Electrical', desc:'LED Fixtures 40W Surface', unit:'Nos', req:320, rem:'Office areas' },
    { cat:'Electrical', desc:'MCB Distribution Board 8-Way', unit:'Nos', req:42, rem:'' },
    { cat:'IBMS', desc:'IP Camera 4MP Outdoor Dome', unit:'Nos', req:48, rem:'Perimeter' },
    { cat:'IBMS', desc:'Access Control Reader RFID', unit:'Nos', req:26, rem:'Entry points' },
    { cat:'IBMS', desc:'Fire Alarm Addressable Panel', unit:'Nos', req:3, rem:'' },
    { cat:'IBMS', desc:'Smoke Detector Addressable', unit:'Nos', req:180, rem:'All floors' },
  ];

  const lots = [
    [[10, '2024-11-05'], [1, '2024-12-10', 'Second delivery']],
    [[800, '2024-11-20']],
    [[20, '2024-12-01'], [15, '2025-01-10']],
    [[3000, '2024-11-15'], [2200, '2024-12-20']],
    [[500, '2024-11-10'], [600, '2024-12-15'], [400, '2025-01-05']],
    [[30, '2024-12-05'], [25, '2025-01-20']],
    [[15000, '2024-11-25'], [12000, '2025-01-15']],
    [[2, '2024-12-20']],
    [[1200, '2024-12-01'], [800, '2025-01-10']],
    [[100, '2025-01-05'], [80, '2025-01-25']],
    [[15, '2025-01-10']],
    [[20, '2024-12-15'], [10, '2025-01-20']],
    [[10, '2025-01-05']],
    [[1, '2025-01-15']],
    [[60, '2024-12-10'], [50, '2025-01-20']],
  ];

  sample.forEach((s, i) => {
    const mLots = (lots[i] || []).map(l => ({
      id: generateId(), qty: l[0], date: l[1], remarks: l[2] || '', createdAt: new Date().toISOString()
    }));
    materials.push({
      id: generateId(), category: s.cat, description: s.desc, unit: s.unit,
      required: s.req, remarks: s.rem, lots: mLots, createdAt: new Date().toISOString()
    });
  });
  saveData();
}

// ===== INIT =====
loadData();
loadTheme();
seedSampleData();
refreshDashboard();
renderMaterials();

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => closeModal(m.id));
  }
});
