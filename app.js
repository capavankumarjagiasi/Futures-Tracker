/* === NSE F&O Tracker PWA === */

// Configuration
const CONFIG = {
  CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com', // Replace with your Google Cloud Client ID
  SCOPES: 'https://www.googleapis.com/auth/drive.file',
  SYNC_FOLDER: 'NSE_FO_Tracker_Sync',
  DEMO_DATA: false
};

// State
let appData = null;
let accessToken = null;
let currentScreen = 'dashboard';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initFilters();
  initGoogleSignIn();
  loadCachedData();
});

// Navigation
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const screen = btn.dataset.screen;
      showScreen(screen);
    });
  });

  document.getElementById('syncBtn').addEventListener('click', syncFromDrive);
}

function showScreen(screen) {
  currentScreen = screen;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(screen + 'Screen').classList.add('active');
  document.querySelector(`[data-screen="${screen}"]`).classList.add('active');
  renderScreen(screen);
}

// Google Sign In
function initGoogleSignIn() {
  const signInPrompt = document.getElementById('signInPrompt');
  const googleBtn = document.getElementById('googleSignIn');
  const demoBtn = document.getElementById('useDemo');

  // Check if we have a cached token
  const cachedToken = localStorage.getItem('gdrive_token');
  if (cachedToken) {
    accessToken = cachedToken;
    signInPrompt.classList.remove('active');
    syncFromDrive();
    return;
  }

  // Show sign in prompt
  signInPrompt.classList.add('active');

  googleBtn.addEventListener('click', () => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: (tokenResponse) => {
        accessToken = tokenResponse.access_token;
        localStorage.setItem('gdrive_token', accessToken);
        signInPrompt.classList.remove('active');
        syncFromDrive();
      }
    });
    client.requestAccessToken();
  });

  demoBtn.addEventListener('click', () => {
    CONFIG.DEMO_DATA = true;
    signInPrompt.classList.remove('active');
    loadDemoData();
  });
}

// Sync from Google Drive
async function syncFromDrive() {
  if (!accessToken) {
    document.getElementById('signInPrompt').classList.add('active');
    return;
  }

  updateSyncStatus('Syncing...', '');

  try {
    // Find sync folder
    const folderQuery = `mimeType='application/vnd.google-apps.folder' and name='${CONFIG.SYNC_FOLDER}' and trashed=false`;
    const folderRes = await driveApi('files?q=' + encodeURIComponent(folderQuery));
    const folders = folderRes.files || [];

    if (folders.length === 0) {
      updateSyncStatus('No sync folder found', 'Upload from desktop first');
      return;
    }

    const folderId = folders[0].id;

    // Find JSON snapshots
    const fileQuery = `'${folderId}' in parents and name contains 'Snapshot' and mimeType='application/json' and trashed=false`;
    const fileRes = await driveApi('files?q=' + encodeURIComponent(fileQuery) + '&orderBy=modifiedTime desc');
    const files = fileRes.files || [];

    if (files.length === 0) {
      updateSyncStatus('No snapshot found', 'Export JSON from desktop');
      return;
    }

    // Download latest snapshot
    const latestFile = files[0];
    const content = await driveDownload(latestFile.id);
    appData = JSON.parse(content);

    // Cache locally
    localStorage.setItem('fo_tracker_data', JSON.stringify(appData));
    localStorage.setItem('fo_tracker_sync_time', new Date().toISOString());

    updateSyncStatus('Synced', formatDate(appData.meta?.analysis_date));
    renderScreen(currentScreen);

  } catch (err) {
    console.error('Sync error:', err);
    updateSyncStatus('Sync failed', err.message);
  }
}

// Drive API helper
async function driveApi(endpoint) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${endpoint}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json();
}

async function driveDownload(fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Download error: ${res.status}`);
  return res.text();
}

// Load cached data
function loadCachedData() {
  const cached = localStorage.getItem('fo_tracker_data');
  const syncTime = localStorage.getItem('fo_tracker_sync_time');
  if (cached) {
    appData = JSON.parse(cached);
    updateSyncStatus('Cached', syncTime ? formatDateShort(syncTime) : '');
    renderScreen('dashboard');
  }
}

// Demo data
function loadDemoData() {
  appData = {
    meta: { analysis_date: '05062026', exported_at: new Date().toISOString() },
    futures_tracker: [
      { symbol: 'RELIANCE', expiry: '26-Jun-2026', type: 'STK', lot: 250, spot: 2450.50, ltp: 2465.00, basis_pct: 0.59, oi: 12500000, oi_chg: 850000, trend: 'LB', pattern: '🔥 Strong LB (3d)', alerts: '⚡OI Spike | 🎯Conv(5d)', ban_status: '' },
      { symbol: 'TCS', expiry: '26-Jun-2026', type: 'STK', lot: 150, spot: 3890.00, ltp: 3875.00, basis_pct: -0.39, oi: 8500000, oi_chg: -420000, trend: 'SB', pattern: '🐻 Strong SB (2d)', alerts: '🔻Hi Disc', ban_status: '' },
      { symbol: 'NIFTY', expiry: '26-Jun-2026', type: 'IDX', lot: 50, spot: 23500.00, ltp: 23580.00, basis_pct: 0.34, oi: 45000000, oi_chg: 1200000, trend: 'LB', pattern: 'LB×2', alerts: '', ban_status: '' },
    ],
    oi_movers: {
      gainers: [
        { symbol: 'RELIANCE', signal: 'Long Buildup', oi: 12500000, oi_chg: 850000, price_chg: 12.5 },
        { symbol: 'NIFTY', signal: 'Long Buildup', oi: 45000000, oi_chg: 1200000, price_chg: 45.0 },
      ],
      losers: [
        { symbol: 'TCS', signal: 'Short Buildup', oi: 8500000, oi_chg: -420000, price_chg: -15.0 },
      ]
    },
    signal_breakdown: { LB: [{ symbol: 'RELIANCE', oi: 12500000, oi_chg: 850000 }], SB: [{ symbol: 'TCS', oi: 8500000, oi_chg: -420000 }], LU: [], SC: [] },
    basis_summary: { deep_discount: 2, discount: 8, parity: 45, premium: 12, deep_premium: 3 },
    ban_list: { current: ['ZEEL', 'IBULHSGFIN'], previous: ['ZEEL'], out_of_ban: ['IBULHSGFIN'] }
  };
  updateSyncStatus('Demo', 'Sample data');
  renderScreen('dashboard');
}

// Render screens
function renderScreen(screen) {
  if (!appData) return;
  switch (screen) {
    case 'dashboard': renderDashboard(); break;
    case 'tracker': renderTracker(); break;
    case 'oi': renderOI(); break;
    case 'basis': renderBasis(); break;
    case 'ban': renderBan(); break;
  }
}

// Dashboard
function renderDashboard() {
  const ft = appData.futures_tracker || [];
  const counts = { LB: 0, SB: 0, LU: 0, SC: 0 };
  ft.forEach(r => { if (r.trend) counts[r.trend] = (counts[r.trend] || 0) + 1; });

  document.getElementById('dashLB').textContent = counts.LB || 0;
  document.getElementById('dashSB').textContent = counts.SB || 0;
  document.getElementById('dashLU').textContent = counts.LU || 0;
  document.getElementById('dashSC').textContent = counts.SC || 0;

  const bs = appData.basis_summary || {};
  document.getElementById('barDD').innerHTML = (bs.deep_discount || 0) + '<small>DD</small>';
  document.getElementById('barD').innerHTML = (bs.discount || 0) + '<small>D</small>';
  document.getElementById('barP').innerHTML = (bs.parity || 0) + '<small>P</small>';
  document.getElementById('barPm').innerHTML = (bs.premium || 0) + '<small>Pm</small>';
  document.getElementById('barDP').innerHTML = (bs.deep_premium || 0) + '<small>DP</small>';

  const ban = appData.ban_list || {};
  document.getElementById('banCount').textContent = (ban.current || []).length;
  const outOfBan = ban.out_of_ban || [];
  document.getElementById('banOut').textContent = outOfBan.length ? `🟢 Out of ban: ${outOfBan.join(', ')}` : '';

  // Top alerts
  const alertsDiv = document.getElementById('topAlerts');
  const alerts = [];
  ft.forEach(r => {
    if (r.alerts) {
      r.alerts.split(' | ').forEach(a => {
        if (a.trim()) alerts.push({ symbol: r.symbol, alert: a.trim() });
      });
    }
  });
  alertsDiv.innerHTML = alerts.slice(0, 10).map(a =>
    `<div class="alert-item"><strong>${a.symbol}</strong> — ${a.alert}</div>`
  ).join('') || '<div class="empty-state">No alerts</div>';
}

// Tracker
function initFilters() {
  document.getElementById('trackerSearch').addEventListener('input', renderTracker);
  document.getElementById('trackerSignal').addEventListener('change', renderTracker);
  document.getElementById('trackerType').addEventListener('change', renderTracker);
  document.getElementById('basisFilter').addEventListener('change', renderBasis);

  document.querySelectorAll('.oi-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.oi-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderOI();
    });
  });
}

function renderTracker() {
  if (!appData) return;
  const search = document.getElementById('trackerSearch').value.toUpperCase();
  const signal = document.getElementById('trackerSignal').value;
  const type = document.getElementById('trackerType').value;

  let rows = appData.futures_tracker || [];
  if (search) rows = rows.filter(r => r.symbol.includes(search));
  if (signal !== 'all') rows = rows.filter(r => r.trend === signal);
  if (type !== 'all') rows = rows.filter(r => r.type === type);

  const list = document.getElementById('trackerList');
  if (rows.length === 0) {
    list.innerHTML = '<div class="empty-state">No matching symbols</div>';
    return;
  }

  list.innerHTML = rows.map(r => createSymbolCard(r)).join('');
}

function createSymbolCard(r) {
  const trendLabels = { LB: 'Long Buildup', SB: 'Short Buildup', LU: 'Long Unwinding', SC: 'Short Covering' };
  const badgeClass = r.trend ? `badge-${r.trend}` : '';
  const badgeText = trendLabels[r.trend] || '—';

  return `
    <div class="symbol-card" onclick="showDetail('${r.symbol}')">
      <div class="card-header">
        <span class="card-symbol">${r.ban_status ? r.ban_status + ' ' : ''}${r.symbol}</span>
        <span class="card-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="card-body">
        <div class="card-stat"><span class="card-stat-label">Spot</span><span class="card-stat-value">${fmt(r.spot)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Fut</span><span class="card-stat-value">${fmt(r.ltp)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Basis%</span><span class="card-stat-value" style="color:${r.basis_pct > 0 ? 'var(--green)' : r.basis_pct < 0 ? 'var(--red)' : ''}">${fmtPct(r.basis_pct)}</span></div>
        <div class="card-stat"><span class="card-stat-label">OI</span><span class="card-stat-value">${fmtOI(r.oi)}</span></div>
        <div class="card-stat"><span class="card-stat-label">OI Chg</span><span class="card-stat-value" style="color:${(r.oi_chg||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSgn(r.oi_chg)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Conv★</span><span class="card-stat-value">${r.conv_score || '—'}</span></div>
      </div>
      ${r.alerts ? `<div class="card-alerts">${r.alerts}</div>` : ''}
    </div>
  `;
}

// OI Movers
function renderOI() {
  if (!appData) return;
  const tab = document.querySelector('.oi-tab.active').dataset.oi;
  const rows = (appData.oi_movers || {})[tab] || [];

  const list = document.getElementById('oiList');
  if (rows.length === 0) {
    list.innerHTML = '<div class="empty-state">No data</div>';
    return;
  }

  list.innerHTML = rows.map(r => `
    <div class="symbol-card">
      <div class="card-header">
        <span class="card-symbol">${r.symbol}</span>
        <span class="card-badge badge-${r.signal === 'Long Buildup' ? 'LB' : r.signal === 'Short Buildup' ? 'SB' : r.signal === 'Long Unwinding' ? 'LU' : 'SC'}">${r.signal}</span>
      </div>
      <div class="card-body">
        <div class="card-stat"><span class="card-stat-label">OI</span><span class="card-stat-value">${fmtOI(r.oi)}</span></div>
        <div class="card-stat"><span class="card-stat-label">OI Chg</span><span class="card-stat-value" style="color:${(r.oi_chg||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSgn(r.oi_chg)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Price</span><span class="card-stat-value">${fmtSgn(r.price_chg)}</span></div>
      </div>
    </div>
  `).join('');
}

// Basis
function renderBasis() {
  if (!appData) return;
  const filter = document.getElementById('basisFilter').value;
  let rows = appData.futures_tracker || [];

  if (filter !== 'all') {
    rows = rows.filter(r => {
      const bp = r.basis_pct || 0;
      if (filter === 'deep_discount') return bp < -1.5;
      if (filter === 'discount') return bp >= -1.5 && bp < -0.3;
      if (filter === 'parity') return bp >= -0.3 && bp <= 0.3;
      if (filter === 'premium') return bp > 0.3 && bp <= 1.5;
      if (filter === 'deep_premium') return bp > 1.5;
      return true;
    });
  }

  rows.sort((a, b) => (a.basis_pct || 0) - (b.basis_pct || 0));

  const list = document.getElementById('basisList');
  if (rows.length === 0) {
    list.innerHTML = '<div class="empty-state">No data</div>';
    return;
  }

  list.innerHTML = rows.map(r => `
    <div class="symbol-card" onclick="showDetail('${r.symbol}')">
      <div class="card-header">
        <span class="card-symbol">${r.symbol}</span>
        <span class="card-badge" style="background:${r.basis_pct < -1.5 ? 'var(--red)' : r.basis_pct < -0.3 ? 'var(--orange)' : r.basis_pct > 1.5 ? 'var(--green)' : r.basis_pct > 0.3 ? 'var(--blue)' : '#5a6a7a'};color:#fff">${fmtPct(r.basis_pct)}</span>
      </div>
      <div class="card-body">
        <div class="card-stat"><span class="card-stat-label">Spot</span><span class="card-stat-value">${fmt(r.spot)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Fut</span><span class="card-stat-value">${fmt(r.ltp)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Fair Val</span><span class="card-stat-value">${fmt(r.fair_value)}</span></div>
        <div class="card-stat"><span class="card-stat-label">FV Diff</span><span class="card-stat-value" style="color:${(r.fv_diff||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSgn(r.fv_diff)}</span></div>
        <div class="card-stat"><span class="card-stat-label">OI</span><span class="card-stat-value">${fmtOI(r.oi)}</span></div>
        <div class="card-stat"><span class="card-stat-label">Conv★</span><span class="card-stat-value">${r.conv_score || '—'}</span></div>
      </div>
    </div>
  `).join('');
}

// Ban List
function renderBan() {
  if (!appData) return;
  const ban = appData.ban_list || {};
  const current = ban.current || [];
  const outOfBan = ban.out_of_ban || [];

  const list = document.getElementById('banList');
  let html = '';

  if (outOfBan.length > 0) {
    html += `<div class="section-title">🟢 Out of Ban (Fresh Positions Allowed)</div>`;
    html += outOfBan.map(s => `
      <div class="symbol-card" style="border-left:3px solid var(--green)">
        <div class="card-header">
          <span class="card-symbol">🔴🟢 ${s}</span>
          <span class="card-badge badge-LB">Tradeable</span>
        </div>
      </div>
    `).join('');
  }

  if (current.length > 0) {
    html += `<div class="section-title">🔴 Currently Banned</div>`;
    html += current.map(s => `
      <div class="symbol-card" style="border-left:3px solid var(--red)">
        <div class="card-header">
          <span class="card-symbol">🔴 ${s}</span>
          <span class="card-badge badge-SB">No Fresh</span>
        </div>
        <div style="font-size:12px;color:var(--text-dim);padding:8px 0">Only position reduction allowed</div>
      </div>
    `).join('');
  }

  list.innerHTML = html || '<div class="empty-state">No ban data</div>';
}

// Symbol Detail Modal
function showDetail(symbol) {
  if (!appData) return;
  const r = appData.futures_tracker.find(x => x.symbol === symbol);
  if (!r) return;

  document.getElementById('modalSymbol').textContent = symbol;

  const trendColors = { LB: 'var(--green)', SB: 'var(--red)', LU: 'var(--orange)', SC: 'var(--purple)' };
  const trendLabels = { LB: '🔥 Long Buildup', SB: '🐻 Short Buildup', LU: '💧 Long Unwinding', SC: '⚡ Short Covering' };

  document.getElementById('modalBody').innerHTML = `
    <div class="detail-signal" style="background:${trendColors[r.trend] || '#5a6a7a'}20;color:${trendColors[r.trend] || '#fff'}">
      ${trendLabels[r.trend] || '—'}
    </div>
    <div class="detail-grid">
      <div class="detail-item"><div class="detail-label">Spot Price</div><div class="detail-value">₹${fmt(r.spot)}</div></div>
      <div class="detail-item"><div class="detail-label">Fut Price</div><div class="detail-value">₹${fmt(r.ltp)}</div></div>
      <div class="detail-item"><div class="detail-label">Basis %</div><div class="detail-value" style="color:${r.basis_pct > 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(r.basis_pct)}</div></div>
      <div class="detail-item"><div class="detail-label">Fair Value</div><div class="detail-value">₹${fmt(r.fair_value)}</div></div>
      <div class="detail-item"><div class="detail-label">FV Diff</div><div class="detail-value" style="color:${(r.fv_diff||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSgn(r.fv_diff)}</div></div>
      <div class="detail-item"><div class="detail-label">Conv★</div><div class="detail-value">${r.conv_score || '—'}</div></div>
      <div class="detail-item"><div class="detail-label">Open Interest</div><div class="detail-value">${fmtOI(r.oi)}</div></div>
      <div class="detail-item"><div class="detail-label">OI Change</div><div class="detail-value" style="color:${(r.oi_chg||0) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtSgn(r.oi_chg)}</div></div>
    </div>
    ${r.pattern && r.pattern !== '—' ? `<div class="detail-item" style="margin-bottom:12px"><div class="detail-label">Pattern</div><div style="font-size:16px;font-weight:600">${r.pattern}</div></div>` : ''}
    ${r.alerts ? `<div class="detail-item"><div class="detail-label">Alerts</div><div style="font-size:14px;color:var(--text-dim);line-height:1.6">${r.alerts}</div></div>` : ''}
  `;

  document.getElementById('detailModal').classList.add('active');
}

function closeModal() {
  document.getElementById('detailModal').classList.remove('active');
}

// Formatters
function fmt(n) { return n ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—'; }
function fmtSgn(n) { if (n == null) return '—'; return (n >= 0 ? '+' : '') + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtPct(n) { if (n == null) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'; }
function fmtOI(n) { if (!n) return '—'; if (n >= 10000000) return (n / 10000000).toFixed(1) + 'Cr'; if (n >= 100000) return (n / 100000).toFixed(1) + 'L'; return n.toLocaleString(); }
function formatDate(ds) { if (!ds || ds.length !== 8) return ds; return `${ds.slice(0, 2)}-${ds.slice(2, 4)}-${ds.slice(4)}`; }
function formatDateShort(iso) { const d = new Date(iso); return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }); }

function updateSyncStatus(status, detail) {
  document.getElementById('syncText').textContent = status;
  document.getElementById('syncDate').textContent = detail;
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed:', err));
}
