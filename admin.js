const DEFAULT_API_BASE_URL = 'https://wherestrangersmeet-backend.onrender.com';
const TOKEN_KEY = 'matchey_admin_token';
const API_BASE_KEY = 'matchey_admin_api_base_url';
const REPORT_WARNING_HOURS = 20;

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  apiBaseUrl: localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE_URL,
  reports: [],
  selectedReportId: null,
};

const loginCard = document.getElementById('login-card');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginStatus = document.getElementById('login-status');
const reportsList = document.getElementById('reports-list');
const reportCount = document.getElementById('report-count');
const sessionBanner = document.getElementById('session-banner');
const detailEmpty = document.getElementById('report-detail-empty');
const detailPanel = document.getElementById('report-detail');
const detailTitle = document.getElementById('detail-title');
const detailCreatedAt = document.getElementById('detail-created-at');
const detailReporter = document.getElementById('detail-reporter');
const detailReportedUser = document.getElementById('detail-reported-user');
const detailReason = document.getElementById('detail-reason');
const detailProfile = document.getElementById('detail-profile');
const detailConversation = document.getElementById('detail-conversation');
const ejectButton = document.getElementById('eject-button');
const refreshButton = document.getElementById('refresh-reports');
const logoutButton = document.getElementById('logout-button');

function setLoggedIn(loggedIn) {
  loginCard.classList.toggle('hidden', loggedIn);
  dashboard.classList.toggle('hidden', !loggedIn);
}

function setStatus(message, isError = false) {
  sessionBanner.textContent = message;
  sessionBanner.style.background = isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)';
  sessionBanner.style.borderColor = isError ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)';
  sessionBanner.style.color = isError ? '#fecaca' : '#bbf7d0';
}

function saveApiBaseUrl() {
  state.apiBaseUrl = state.apiBaseUrl || DEFAULT_API_BASE_URL;
  localStorage.setItem(API_BASE_KEY, state.apiBaseUrl);
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${state.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const errorMessage = payload.error || payload.message || `Request failed (${response.status})`;
    throw new Error(errorMessage);
  }

  return payload;
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function reportAgeHours(value) {
  if (!value) return 0;
  return (Date.now() - new Date(value).getTime()) / 36e5;
}

function reportAgeLabel(value) {
  const hours = reportAgeHours(value);
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))}m old`;
  }
  return `${hours.toFixed(1)}h old`;
}

function isUrgentReport(value) {
  return reportAgeHours(value) >= REPORT_WARNING_HOURS;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderUserSummary(element, user) {
  element.innerHTML = `
    <div class="detail-kv">
      <div><span>Name</span><strong>${user.name || 'Unknown'}</strong></div>
      <div><span>Email</span><strong>${user.email || '-'}</strong></div>
      <div><span>Public ID</span><strong>${user.publicId || '-'}</strong></div>
      <div><span>Status</span><strong>${user.deleted ? 'Deleted / Ejected' : 'Active'}</strong></div>
    </div>
  `;
}

function renderProfile(report) {
  const user = report.reportedUser;
  const photos = user.photos || [];
  const interests = user.interestTags || [];

  detailProfile.innerHTML = `
    <div class="profile-moderation-grid">
      <div class="detail-kv">
        <div><span>Display name</span><strong>${escapeHtml(user.name || 'Unknown')}</strong></div>
        <div><span>Bio</span><strong>${escapeHtml(user.bio || '-')}</strong></div>
        <div><span>Future goals</span><strong>${escapeHtml(user.futureGoals || '-')}</strong></div>
        <div><span>Occupation title</span><strong>${escapeHtml(user.occupationTitle || '-')}</strong></div>
        <div><span>Occupation description</span><strong>${escapeHtml(user.occupationDescription || '-')}</strong></div>
        <div><span>Institution</span><strong>${escapeHtml(user.institution || '-')}</strong></div>
        <div><span>Occupation year</span><strong>${escapeHtml(user.occupationYear || '-')}</strong></div>
        <div><span>Interests</span><strong>${interests.length ? interests.map(escapeHtml).join(', ') : '-'}</strong></div>
      </div>
      <div class="moderation-action-stack">
        <button type="button" class="ghost-button" data-profile-action="RESET_NAME">Reset display name</button>
        <button type="button" class="ghost-button" data-profile-action="CLEAR_TEXT">Clear bio and profile text</button>
        <button type="button" class="ghost-button" data-profile-action="CLEAR_INTERESTS">Clear interests</button>
      </div>
    </div>
    <div class="photo-moderation-list">
      ${photos.length ? photos.map((photo) => `
        <article class="photo-card">
          <img src="${escapeHtml(photo.url)}" alt="Reported user photo ${photo.id}" />
          <div class="photo-card-footer">
            <span>${formatDate(photo.createdAt)}</span>
            <button type="button" class="danger-button compact-button" data-photo-id="${photo.id}">Remove photo</button>
          </div>
        </article>
      `).join('') : '<p class="muted">No profile photos currently attached to this user.</p>'}
    </div>
  `;

  detailProfile.querySelectorAll('[data-profile-action]').forEach((button) => {
    button.addEventListener('click', () => moderateProfile(user.id, button.getAttribute('data-profile-action')));
  });

  detailProfile.querySelectorAll('[data-photo-id]').forEach((button) => {
    button.addEventListener('click', () => removePhoto(user.id, Number(button.getAttribute('data-photo-id'))));
  });
}

function renderConversation(report, messages) {
  if (!messages.length) {
    detailConversation.innerHTML = '<p class="muted">No recent conversation found between these users.</p>';
    return;
  }

  detailConversation.innerHTML = messages.map((message) => `
    <article class="message-row ${message.deleted ? 'deleted' : ''}">
      <div class="message-meta">
        <span>${message.messageType || 'TEXT'} · ${formatDate(message.createdAt)}</span>
        <span>Sender #${message.senderId}</span>
      </div>
      <div class="message-body">
        ${message.attachmentUrl ? `<img class="message-image" src="${escapeHtml(message.attachmentUrl)}" alt="Message attachment ${message.id}" />` : ''}
        <div>${message.text ? escapeHtml(message.text) : '<span class="muted">No text</span>'}</div>
      </div>
      <div class="message-actions">
        <button type="button" class="danger-button compact-button" data-message-id="${message.id}" ${message.deleted ? 'disabled' : ''}>
          ${message.deleted ? 'Removed' : 'Remove content'}
        </button>
      </div>
    </article>
  `).join('');

  detailConversation.querySelectorAll('[data-message-id]').forEach((button) => {
    button.addEventListener('click', () => removeMessage(report.id, Number(button.getAttribute('data-message-id'))));
  });
}

function renderReports() {
  reportCount.textContent = String(state.reports.length);

  if (!state.reports.length) {
    reportsList.innerHTML = '<div class="empty-state"><p>No reports found.</p></div>';
    return;
  }

  reportsList.innerHTML = state.reports.map((report) => {
    const urgent = isUrgentReport(report.createdAt);
    return `
      <button type="button" class="report-item ${report.id === state.selectedReportId ? 'active' : ''} ${urgent ? 'urgent' : ''}" data-report-id="${report.id}">
        <div class="report-meta">
          <span>${formatDate(report.createdAt)}</span>
          <span class="age-chip ${urgent ? 'urgent' : ''}">${reportAgeLabel(report.createdAt)}</span>
        </div>
        <h4>${escapeHtml(report.reportedUser.name || 'Unknown user')}</h4>
        <p class="muted">Reported by ${escapeHtml(report.reporter.name || 'Unknown')}</p>
        <p>${escapeHtml(report.reason || 'No reason provided')}</p>
      </button>
    `;
  }).join('');

  reportsList.querySelectorAll('[data-report-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const reportId = Number(button.getAttribute('data-report-id'));
      selectReport(reportId);
    });
  });
}

function renderSelectedReport(report) {
  if (!report) {
    detailEmpty.classList.remove('hidden');
    detailPanel.classList.add('hidden');
    return;
  }

  detailEmpty.classList.add('hidden');
  detailPanel.classList.remove('hidden');
  detailTitle.textContent = `Report #${report.id}`;
  detailCreatedAt.textContent = `${formatDate(report.createdAt)} · ${reportAgeLabel(report.createdAt)}`;
  detailCreatedAt.classList.toggle('text-danger', isUrgentReport(report.createdAt));
  detailReason.textContent = report.reason || 'No reason provided';
  renderUserSummary(detailReporter, report.reporter);
  renderUserSummary(detailReportedUser, report.reportedUser);
  renderProfile(report);
  renderConversation(report, report.recentConversation || []);
  ejectButton.dataset.reportId = String(report.id);
  ejectButton.disabled = Boolean(report.reportedUser.deleted);
  ejectButton.textContent = report.reportedUser.deleted ? 'User Already Ejected' : 'Eject User';
}

async function loadReports() {
  const payload = await apiFetch('/api/admin/moderation/reports');
  state.reports = payload;

  if (!state.selectedReportId && state.reports.length) {
    state.selectedReportId = state.reports[0].id;
  } else if (state.selectedReportId && !state.reports.some((report) => report.id === state.selectedReportId)) {
    state.selectedReportId = state.reports.length ? state.reports[0].id : null;
  }

  renderReports();
  await selectReport(state.selectedReportId);
}

async function selectReport(reportId) {
  state.selectedReportId = reportId;
  renderReports();

  if (!reportId) {
    renderSelectedReport(null);
    return;
  }

  const report = await apiFetch(`/api/admin/moderation/reports/${reportId}`);
  renderSelectedReport(report);
}

async function moderateProfile(userId, action) {
  const confirmed = window.confirm(`Apply moderation action "${action}" to this profile?`);
  if (!confirmed) return;

  try {
    await apiFetch(`/api/admin/moderation/users/${userId}/profile/moderate`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    setStatus(`Profile moderation action ${action} completed.`);
    await selectReport(state.selectedReportId);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removePhoto(userId, photoId) {
  const confirmed = window.confirm('Remove this profile photo?');
  if (!confirmed) return;

  try {
    await apiFetch(`/api/admin/moderation/users/${userId}/photos/${photoId}`, {
      method: 'DELETE',
    });
    setStatus(`Photo #${photoId} removed.`);
    await selectReport(state.selectedReportId);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function removeMessage(reportId, messageId) {
  const confirmed = window.confirm('Remove this message or attachment from the conversation?');
  if (!confirmed) return;

  try {
    await apiFetch(`/api/admin/moderation/reports/${reportId}/messages/${messageId}/remove`, {
      method: 'POST',
    });
    setStatus(`Message #${messageId} removed.`);
    await selectReport(reportId);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function login(event) {
  event.preventDefault();
  saveApiBaseUrl();
  loginStatus.textContent = 'Signing in...';

  try {
    const payload = await fetch(`${state.apiBaseUrl}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
      }),
    }).then(async (response) => {
      const text = await response.text();
      const data = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      return data;
    });

    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    setLoggedIn(true);
    setStatus(`Signed in as ${payload.username}. Session expires at ${formatDate(payload.expiresAt)}.`);
    loginForm.reset();
    await loadReports();
  } catch (error) {
    loginStatus.textContent = error.message;
  }
}

async function logout() {
  try {
    if (state.token) {
      await apiFetch('/api/admin/auth/logout', { method: 'POST' });
    }
  } catch (_) {
    // Best effort logout.
  }

  state.token = '';
  state.reports = [];
  state.selectedReportId = null;
  localStorage.removeItem(TOKEN_KEY);
  setLoggedIn(false);
  loginStatus.textContent = 'Use your internal admin credentials configured on the backend.';
}

async function ejectSelectedUser() {
  const reportId = Number(ejectButton.dataset.reportId);
  if (!reportId) return;

  const confirmed = window.confirm('Eject this reported user and blacklist the email?');
  if (!confirmed) return;

  try {
    await apiFetch(`/api/admin/moderation/reports/${reportId}/eject`, { method: 'POST' });
    setStatus(`User linked to report #${reportId} has been ejected and the email was blacklisted.`);
    await loadReports();
  } catch (error) {
    setStatus(error.message, true);
  }
}

loginForm.addEventListener('submit', login);
refreshButton.addEventListener('click', () => loadReports().catch((error) => setStatus(error.message, true)));
logoutButton.addEventListener('click', logout);
ejectButton.addEventListener('click', ejectSelectedUser);

if (state.token) {
  setLoggedIn(true);
  setStatus('Restored previous admin session.');
  loadReports().catch((error) => {
    setStatus(error.message, true);
    logout();
  });
} else {
  setLoggedIn(false);
}
