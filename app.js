// ============================================================
// People-in-the-News Monitor — frontend logic
// ============================================================
//
// ⚠️ SETUP: paste your deployed Apps Script Web App URL below.
// See README.md for deployment steps.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz-oDlpZoQfvic6pYhjzbsntT0TeMCv4BX_xEOyFVuIbY1_KTyvPPeTSQj42HFkcwwX/exec';

// GDELT Doc 2.0 API — no API key required, CORS-enabled.
// Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

// ---------- State ----------
let currentTestPerson = null;   // { name, company, query }
let people = [];                // cached list from the sheet

// ---------- DOM refs ----------
const $ = (id) => document.getElementById(id);
const setupBanner = $('setup-banner');
const addForm = $('add-form');
const inputName = $('input-name');
const inputCompany = $('input-company');
const addBtn = $('add-btn');
const addStatus = $('add-status');
const tbody = $('people-tbody');
const listStatus = $('list-status');
const testPanel = $('test-panel');
const testName = $('test-name');
const testCompany = $('test-company');
const testClose = $('test-close');
const lookbackSelect = $('lookback');
const testRunBtn = $('test-run');
const testStatus = $('test-status');
const testResults = $('test-results');

// ---------- Setup check ----------
const isConfigured = () =>
  APPS_SCRIPT_URL && !APPS_SCRIPT_URL.startsWith('PASTE_');

// ---------- Utility ----------
function setStatus(el, msg, kind) {
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatAddedDate(v) {
  if (!v) return '';
  // Apps Script serialises Date cells as ISO strings; strings pass through.
  const s = String(v);
  // Already a YYYY-MM-DD?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d) ? s : d.toISOString().slice(0, 10);
}

function formatSeenDate(s) {
  // GDELT seendate: e.g. "20240419T120000Z"
  if (!s) return '';
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s);
  if (!m) return s;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d} ${h}:${mi} UTC`;
}

// ---------- Apps Script calls ----------
// Apps Script Web Apps often reject Content-Type: application/json preflight.
// Sending as text/plain with a JSON string body keeps the request "simple" (no preflight).
async function postAction(action, body) {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchList() {
  const res = await fetch(`${APPS_SCRIPT_URL}?action=list`, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- Render ----------
function renderTable() {
  if (!people.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No people on the watch list yet. Add one above.</td></tr>`;
    return;
  }
  tbody.innerHTML = people.map((p, i) => `
    <tr data-idx="${i}">
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.company)}</td>
      <td>${escapeHtml(formatAddedDate(p.addedDate))}</td>
      <td><button type="button" class="btn-secondary btn-small" data-action="test" data-idx="${i}">Test</button></td>
      <td><button type="button" class="btn-danger btn-small" data-action="remove" data-idx="${i}">Remove</button></td>
    </tr>
  `).join('');
}

async function loadList() {
  setStatus(listStatus, '');
  if (!isConfigured()) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Configure <code>APPS_SCRIPT_URL</code> in app.js to load your watch list.</td></tr>`;
    return;
  }
  tbody.innerHTML = `<tr class="empty-row"><td colspan="5"><span class="loading"></span>Loading…</td></tr>`;
  try {
    const data = await fetchList();
    people = Array.isArray(data) ? data : [];
    renderTable();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Failed to load watch list.</td></tr>`;
    setStatus(listStatus, `Error: ${err.message}`, 'error');
  }
}

// ---------- Add / Remove ----------
addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!isConfigured()) {
    setStatus(addStatus, 'App is not configured yet. See README.', 'error');
    return;
  }
  const name = inputName.value.trim();
  const company = inputCompany.value.trim();
  if (!name || !company) return;

  addBtn.disabled = true;
  setStatus(addStatus, 'Adding…', 'muted');
  try {
    const result = await postAction('add', { name, company });
    if (result && result.success) {
      setStatus(addStatus, `Added ${name} — ${company}.`, 'success');
      addForm.reset();
      await loadList();
    } else {
      setStatus(addStatus, `Error: ${result.error || 'Unknown error'}`, 'error');
    }
  } catch (err) {
    console.error(err);
    setStatus(addStatus, `Error: ${err.message}`, 'error');
  } finally {
    addBtn.disabled = false;
  }
});

tbody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const person = people[idx];
  if (!person) return;

  if (btn.dataset.action === 'test') {
    openTestPanel(person);
  } else if (btn.dataset.action === 'remove') {
    if (!confirm(`Remove ${person.name} (${person.company}) from the watch list?`)) return;
    btn.disabled = true;
    setStatus(listStatus, 'Removing…', 'muted');
    try {
      const result = await postAction('remove', { name: person.name, company: person.company });
      if (result && result.success) {
        setStatus(listStatus, `Removed ${person.name}.`, 'success');
        // If we were testing this person, close the panel.
        if (currentTestPerson &&
            currentTestPerson.name === person.name &&
            currentTestPerson.company === person.company) {
          closeTestPanel();
        }
        await loadList();
      } else {
        setStatus(listStatus, `Error: ${result.error || 'Not found'}`, 'error');
        btn.disabled = false;
      }
    } catch (err) {
      console.error(err);
      setStatus(listStatus, `Error: ${err.message}`, 'error');
      btn.disabled = false;
    }
  }
});

// ---------- Test panel ----------
function openTestPanel(person) {
  currentTestPerson = person;
  testName.textContent = person.name;
  testCompany.textContent = person.company;
  lookbackSelect.value = '3';
  setStatus(testStatus, '');
  testResults.innerHTML = '';
  testPanel.classList.add('active');
  testPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeTestPanel() {
  currentTestPerson = null;
  testPanel.classList.remove('active');
  testResults.innerHTML = '';
  setStatus(testStatus, '');
}

testClose.addEventListener('click', closeTestPanel);

testRunBtn.addEventListener('click', async () => {
  if (!currentTestPerson) return;
  const monthsBack = Number(lookbackSelect.value) || 3;
  const range = getDateRange(monthsBack);
  const query = currentTestPerson.query ||
    `"${currentTestPerson.name}" "${currentTestPerson.company}"`;

  testRunBtn.disabled = true;
  testResults.innerHTML = '';
  setStatus(testStatus, 'Searching GDELT…', 'muted');

  try {
    const url = buildGdeltUrl(query, range.start, range.end);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // GDELT occasionally returns an HTML error page or empty body on malformed queries.
      throw new Error('GDELT returned a non-JSON response. Try tightening the query.');
    }
    renderResults(data.articles || []);
  } catch (err) {
    console.error(err);
    setStatus(testStatus, `Error: ${err.message}`, 'error');
  } finally {
    testRunBtn.disabled = false;
  }
});

// ---------- GDELT ----------
function toGdeltDate(date) {
  // YYYYMMDD000000
  return date.toISOString().slice(0, 10).replace(/-/g, '') + '000000';
}

function getDateRange(monthsBack) {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - monthsBack);
  return { start: toGdeltDate(start), end: toGdeltDate(end) };
}

function buildGdeltUrl(queryString, startDate, endDate) {
  const params = new URLSearchParams({
    query: queryString,
    mode: 'ArtList',
    maxrecords: '50',
    startdatetime: startDate,
    enddatetime: endDate,
    format: 'json',
    sort: 'DateDesc',
  });
  return `${GDELT_API}?${params.toString()}`;
}

function renderResults(articles) {
  if (!articles || !articles.length) {
    setStatus(testStatus, '', '');
    testResults.innerHTML = `<p class="status muted" style="margin:0;">No mentions found in this period. Consider broadening the query.</p>`;
    return;
  }
  setStatus(testStatus, `Found ${articles.length} result${articles.length === 1 ? '' : 's'}.`, 'success');
  testResults.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Headline</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        ${articles.map(a => `
          <tr>
            <td>${escapeHtml(formatSeenDate(a.seendate))}</td>
            <td><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title || a.url)}</a></td>
            <td>${escapeHtml(a.domain || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------- Init ----------
(function init() {
  if (!isConfigured()) {
    setupBanner.style.display = 'block';
  }
  loadList();
})();
