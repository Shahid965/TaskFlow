// ================================================================
// app.js — Main Application Logic
// Handles: Workspaces, Tasks, Dashboard, Settings, Real-time Sync
// ================================================================

'use strict';

/* ================================================================
   SECTION 1: APPLICATION STATE
   Single source of truth for the entire app
   ================================================================ */
const State = {
  user:              null,  // Current Firebase Auth user
  profile:           {},    // User profile from Firestore
  workspaces:        [],    // Array of workspace objects
  currentView:       'dashboard',
  activeWorkspaceId: null,  // Which workspace is open in detail view
  activeTaskFilter:  'all', // 'all' | 'todo' | 'in-progress' | 'done'
  editingWorkspaceId: null, // null = create new
  editingTaskId:     null,  // null = create new
  theme:             'dark',
  listeners:         []     // Firestore unsubscribe functions
};

/* ================================================================
   SECTION 2: CONSTANTS
   ================================================================ */
const EMOJIS = [
  '📁','📚','💼','🏠','💪','🚀','🎯','🎨','🎵','🏋️',
  '🌱','💡','🔬','✈️','🍳','🛒','💰','📊','🤝','❤️',
  '📝','🔧','🎮','🌍','🏃','📱','💻','🎓','🔑','⚡'
];

const COLORS = [
  '#6366F1','#8B5CF6','#EC4899','#EF4444',
  '#F59E0B','#10B981','#06B6D4','#3B82F6',
  '#F97316','#84CC16','#A855F7','#14B8A6'
];

/* ================================================================
   SECTION 3: APP BOOT
   Called when Firebase Auth confirms a user is logged in
   ================================================================ */
async function bootApp(user) {
  State.user = user;

  // Load user profile
  await loadUserProfile();

  // Apply saved theme
  applyTheme(State.theme);

  // Update all UI elements that show user info
  updateUserUI();

  // Start real-time workspace listener
  startWorkspaceListener();

  // Navigate to dashboard
  navigateTo('dashboard');

  // Set up event listeners once
  initGlobalEvents();
}

/** Clean up Firestore listeners when user logs out */
function cleanupListeners() {
  State.listeners.forEach(unsub => unsub());
  State.listeners = [];
  State.workspaces = [];
  State.user = null;
  State.profile = {};
}

/* ================================================================
   SECTION 4: USER PROFILE
   ================================================================ */
async function loadUserProfile() {
  try {
    const doc = await db.collection('users').doc(State.user.uid).get();
    if (doc.exists) {
      State.profile = doc.data();
      State.theme   = State.profile.theme || 'dark';
    } else {
      // Profile doc may not exist yet for old signups — create it
      State.profile = {
        name:  State.user.displayName || 'User',
        email: State.user.email,
        theme: 'dark'
      };
      await db.collection('users').doc(State.user.uid).set(State.profile);
    }
  } catch (err) {
    console.error('Error loading profile:', err);
    State.profile = { name: State.user.displayName || 'User', email: State.user.email };
  }
}

/** Update all DOM elements that display user name/email/avatar */
function updateUserUI() {
  const name  = State.profile.name  || State.user?.displayName || 'User';
  const email = State.profile.email || State.user?.email || '';
  const init  = getInitials(name);

  // Sidebar
  setTextContent('sidebar-user-name', name);
  setTextContent('sidebar-user-email', email);
  setTextContent('sidebar-avatar', init);

  // Topbar
  setTextContent('topbar-avatar', init);

  // Welcome heading
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  setTextContent('welcome-heading', `${greeting}, ${name.split(' ')[0]}! 👋`);

  // Settings
  setTextContent('settings-avatar', init);
  setTextContent('settings-user-name', name);
  setTextContent('settings-user-email', email);
  const nameInput = document.getElementById('settings-name-input');
  if (nameInput) nameInput.value = name;
}

/** Save profile display name */
async function saveProfileName() {
  const input = document.getElementById('settings-name-input');
  const name  = input?.value.trim();
  if (!name) { showToast('Please enter a name', 'warning'); return; }

  try {
    await db.collection('users').doc(State.user.uid).update({ name });
    await State.user.updateProfile({ displayName: name });
    State.profile.name = name;
    updateUserUI();
    showToast('✅ Name saved!', 'success');
  } catch (err) {
    showToast('Error saving name', 'error');
  }
}

/* ================================================================
   SECTION 5: NAVIGATION / ROUTING
   ================================================================ */
function navigateTo(view, workspaceId = null) {
  // Hide all views
  document.querySelectorAll('.view').forEach(v => { v.hidden = true; });

  // Update nav item active state
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  // Update sidebar workspace link active state
  document.querySelectorAll('.sidebar-ws-link').forEach(link => {
    link.classList.toggle('active', link.dataset.wsid === workspaceId);
  });

  // Page titles
  const titles = {
    dashboard:          'Dashboard',
    workspaces:         'My Workspaces',
    'workspace-detail': 'Workspace',
    settings:           'Settings'
  };
  setTextContent('page-heading', titles[view] || 'TaskFlow OS');

  // Show target view
  const targetEl = document.getElementById(`view-${view}`);
  if (targetEl) targetEl.hidden = false;

  State.currentView = view;
  closeMobileSidebar();

  // Render the view content
  switch (view) {
    case 'dashboard':         renderDashboard();               break;
    case 'workspaces':        renderWorkspacesGrid();          break;
    case 'workspace-detail':  openWorkspaceDetail(workspaceId); break;
    case 'settings':          renderSettings();                break;
  }
}

/* ================================================================
   SECTION 6: REAL-TIME FIRESTORE LISTENER FOR WORKSPACES
   This listener fires every time workspaces change in Firestore —
   whether from this device or any other logged-in device.
   ================================================================ */
function startWorkspaceListener() {
  if (!State.user) return;

  const unsub = db
    .collection('users').doc(State.user.uid)
    .collection('workspaces')
    .orderBy('createdAt', 'asc')
    .onSnapshot(
      snapshot => {
        State.workspaces = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Re-render sidebar workspace links
        renderSidebarWorkspaceLinks();

        // Re-render current view if it's workspace-related
        if (State.currentView === 'dashboard')  renderDashboard();
        if (State.currentView === 'workspaces') renderWorkspacesGrid();
        if (State.currentView === 'workspace-detail') {
          // Re-render the detail header (task count etc.)
          updateWorkspaceDetailHeader();
        }
      },
      err => {
        console.error('Workspace listener error:', err);
        if (err.code === 'permission-denied') {
          showToast('Permission error. Please check Firebase rules.', 'error');
        }
      }
    );

  State.listeners.push(unsub);
}

/** Render the sidebar workspace quick-links */
function renderSidebarWorkspaceLinks() {
  const container = document.getElementById('sidebar-workspace-links');
  if (!container) return;

  if (State.workspaces.length === 0) {
    container.innerHTML = `<div style="font-size:12px; color:var(--text-3); padding: 8px 12px;">No workspaces yet</div>`;
    return;
  }

  container.innerHTML = State.workspaces.map(ws => `
    <button
      class="sidebar-ws-link ${State.activeWorkspaceId === ws.id && State.currentView === 'workspace-detail' ? 'active' : ''}"
      data-wsid="${ws.id}"
      onclick="navigateTo('workspace-detail', '${ws.id}')"
      aria-label="Open ${escHtml(ws.name)}"
    >
      <span class="sidebar-ws-emoji" style="background: ${ws.color}20; color: ${ws.color};">
        ${ws.emoji || '📁'}
      </span>
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escHtml(ws.name)}</span>
      <span class="sidebar-ws-count" id="sidebar-count-${ws.id}">…</span>
    </button>
  `).join('');

  // Load task counts for sidebar
  State.workspaces.forEach(ws => loadSidebarTaskCount(ws.id));
}

/** Load and display the task count for a workspace in the sidebar */
async function loadSidebarTaskCount(wsId) {
  try {
    const snap = await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(wsId)
      .collection('tasks')
      .get();
    const el = document.getElementById(`sidebar-count-${wsId}`);
    if (el) el.textContent = snap.size;
  } catch {}
}

/* ================================================================
   SECTION 7: DASHBOARD
   ================================================================ */
async function renderDashboard() {
  await renderDashboardStats();
  await renderDashboardWorkspacePreviews();
}

async function renderDashboardStats() {
  const container = document.getElementById('dashboard-stats');
  if (!container) return;

  let totalTasks = 0, completedTasks = 0, pendingTasks = 0, overdueTasks = 0;
  const today = new Date(); today.setHours(0,0,0,0);

  // Aggregate stats across all workspaces
  for (const ws of State.workspaces) {
    try {
      const snap = await db
        .collection('users').doc(State.user.uid)
        .collection('workspaces').doc(ws.id)
        .collection('tasks').get();

      snap.docs.forEach(doc => {
        const t = doc.data();
        totalTasks++;
        if (t.status === 'done') {
          completedTasks++;
        } else {
          pendingTasks++;
          if (t.dueDate) {
            const due = new Date(t.dueDate);
            due.setHours(0,0,0,0);
            if (due < today) overdueTasks++;
          }
        }
      });
    } catch {}
  }

  const score = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const stats = [
    { label: 'Total Tasks',   value: totalTasks,     color: '#6366F1', sub: `across ${State.workspaces.length} workspace${State.workspaces.length !== 1 ? 's' : ''}` },
    { label: 'Completed',     value: completedTasks,  color: '#10B981', sub: `${score}% completion rate` },
    { label: 'Pending',       value: pendingTasks,    color: '#F59E0B', sub: 'needs attention' },
    { label: 'Overdue',       value: overdueTasks,    color: '#EF4444', sub: overdueTasks === 0 ? '✓ All on track' : 'action needed!' }
  ];

  container.innerHTML = stats.map(s => `
    <div class="stat-card" style="--stat-color: ${s.color};">
      <div class="stat-card-label">${s.label}</div>
      <div class="stat-card-value">${s.value}</div>
      <div class="stat-card-sub">${s.sub}</div>
    </div>
  `).join('');
}

async function renderDashboardWorkspacePreviews() {
  const container = document.getElementById('dashboard-workspace-previews');
  if (!container) return;

  if (State.workspaces.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 40px;">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p>No workspaces yet. <button class="btn btn-primary btn-sm" onclick="navigateTo('workspaces')">Create one →</button></p>
      </div>
    `;
    return;
  }

  // Build preview cards
  const cards = await Promise.all(State.workspaces.slice(0, 6).map(async ws => {
    let tasks = [], completed = 0;
    try {
      const snap = await db
        .collection('users').doc(State.user.uid)
        .collection('workspaces').doc(ws.id)
        .collection('tasks')
        .orderBy('createdAt', 'desc')
        .limit(3)
        .get();
      tasks = snap.docs.map(d => d.data());

      const allSnap = await db
        .collection('users').doc(State.user.uid)
        .collection('workspaces').doc(ws.id)
        .collection('tasks')
        .where('status', '==', 'done')
        .get();
      completed = allSnap.size;
    } catch {}

    const total   = tasks.length;
    const pct     = total ? Math.round((completed / total) * 100) : 0;

    const taskPreviewHTML = tasks.length
      ? tasks.slice(0, 3).map(t => `
          <div class="dws-task-item">
            <div class="dws-task-dot" style="background: ${t.status === 'done' ? 'var(--success)' : t.status === 'in-progress' ? 'var(--info)' : 'var(--text-3)'};"></div>
            <span style="${t.status === 'done' ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escHtml(t.title)}</span>
          </div>
        `).join('')
      : `<div class="dws-no-tasks">No tasks yet. Click to add some!</div>`;

    return `
      <div class="dashboard-ws-preview-card" onclick="navigateTo('workspace-detail', '${ws.id}')" role="button" aria-label="Open ${escHtml(ws.name)} workspace">
        <div class="dws-header">
          <div class="dws-icon" style="background: ${ws.color}20; color: ${ws.color};">${ws.emoji || '📁'}</div>
          <div>
            <div class="dws-name">${escHtml(ws.name)}</div>
            <div class="dws-count">${total} task${total !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="dws-progress-wrap">
          <div class="dws-progress-bar" style="width: ${pct}%; background: ${ws.color};"></div>
        </div>
        <div class="dws-task-preview">${taskPreviewHTML}</div>
      </div>
    `;
  }));

  container.innerHTML = cards.join('');
}

/* ================================================================
   SECTION 8: WORKSPACES GRID PAGE
   ================================================================ */
function renderWorkspacesGrid() {
  const grid  = document.getElementById('workspaces-grid');
  const empty = document.getElementById('workspaces-empty');
  if (!grid) return;

  if (State.workspaces.length === 0) {
    grid.innerHTML   = '';
    empty.hidden     = false;
    return;
  }

  empty.hidden = true;

  // Render cards and load task counts asynchronously
  grid.innerHTML = State.workspaces.map(ws => renderWorkspaceCard(ws)).join('');

  // Load task counts for each card
  State.workspaces.forEach(ws => loadWorkspaceCardStats(ws));
}

/** Render HTML for one workspace card */
function renderWorkspaceCard(ws) {
  return `
    <div
      class="workspace-card"
      style="--ws-color: ${ws.color};"
      data-ws-id="${ws.id}"
      onclick="navigateTo('workspace-detail', '${ws.id}')"
      role="button"
      tabindex="0"
      aria-label="Open ${escHtml(ws.name)} workspace"
      onkeydown="if(event.key==='Enter') navigateTo('workspace-detail','${ws.id}')"
    >
      <div class="workspace-card-header">
        <div class="workspace-card-icon" style="background: ${ws.color}20; color: ${ws.color};">
          ${ws.emoji || '📁'}
        </div>
        <div class="workspace-card-meta">
          <div class="workspace-card-name">${escHtml(ws.name)}</div>
          <div class="workspace-card-task-count" id="ws-card-count-${ws.id}">Loading...</div>
        </div>
        <button
          class="workspace-card-remove"
          onclick="event.stopPropagation(); confirmDeleteWorkspaceById('${ws.id}', '${escHtml(ws.name)}')"
          title="Delete workspace"
          aria-label="Delete ${escHtml(ws.name)}"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Progress filled by JS -->
      <div class="workspace-card-progress">
        <div class="progress-bar-wrap">
          <div class="progress-bar" id="ws-card-progress-${ws.id}" style="width:0%; background:${ws.color};"></div>
        </div>
        <div class="progress-label">
          <span id="ws-card-progress-label-${ws.id}">— tasks</span>
          <span class="progress-pct" id="ws-card-pct-${ws.id}">0%</span>
        </div>
      </div>

      <div class="workspace-card-footer">
        <div class="workspace-card-open">
          Open workspace
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>
  `;
}

/** Load and display task stats for a workspace card */
async function loadWorkspaceCardStats(ws) {
  try {
    const snap = await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(ws.id)
      .collection('tasks').get();

    const total     = snap.size;
    const completed = snap.docs.filter(d => d.data().status === 'done').length;
    const pct       = total ? Math.round((completed / total) * 100) : 0;

    setTextContent(`ws-card-count-${ws.id}`,          `${total} task${total !== 1 ? 's' : ''}`);
    setTextContent(`ws-card-progress-label-${ws.id}`, `${completed} of ${total} done`);
    setTextContent(`ws-card-pct-${ws.id}`,            `${pct}%`);

    const bar = document.getElementById(`ws-card-progress-${ws.id}`);
    if (bar) bar.style.width = `${pct}%`;
  } catch {}
}

/* ================================================================
   SECTION 9: WORKSPACE DETAIL VIEW
   ================================================================ */

/** Open and render the workspace detail view */
function openWorkspaceDetail(wsId) {
  if (!wsId) return;
  State.activeWorkspaceId = wsId;
  State.activeTaskFilter  = 'all';

  // Reset filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.status === 'all');
  });

  updateWorkspaceDetailHeader();
  startTaskListener(wsId);
}

/** Update workspace detail header info */
function updateWorkspaceDetailHeader() {
  const ws = State.workspaces.find(w => w.id === State.activeWorkspaceId);
  if (!ws) return;

  setTextContent('ws-detail-name', ws.name);
  setInnerHTML('ws-detail-icon', ws.emoji || '📁');
  document.getElementById('ws-detail-icon').style.background = `${ws.color}20`;
  document.getElementById('ws-detail-icon').style.color      = ws.color;
  setTextContent('page-heading', ws.name);

  // Update sidebar active link
  document.querySelectorAll('.sidebar-ws-link').forEach(link => {
    link.classList.toggle('active', link.dataset.wsid === ws.id);
  });
}

/* ================================================================
   SECTION 10: REAL-TIME TASK LISTENER
   ================================================================ */
let taskListenerUnsub = null;

/** Start listening to tasks for a given workspace */
function startTaskListener(wsId) {
  // Detach previous task listener
  if (taskListenerUnsub) { taskListenerUnsub(); taskListenerUnsub = null; }

  const unsub = db
    .collection('users').doc(State.user.uid)
    .collection('workspaces').doc(wsId)
    .collection('tasks')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      snap => {
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderTaskList(tasks, wsId);
        updateWorkspaceDetailProgress(tasks);
      },
      err => { console.error('Task listener error:', err); }
    );

  taskListenerUnsub = unsub;
  // Also push to global listeners so it's cleaned up on logout
  State.listeners.push(unsub);
}

/** Filter tasks and render the task list */
function renderTaskList(allTasks, wsId) {
  const container = document.getElementById('task-list-container');
  const emptyEl   = document.getElementById('tasks-empty');
  const emptyTitle = document.getElementById('tasks-empty-title');
  const emptySub   = document.getElementById('tasks-empty-sub');
  if (!container) return;

  // Apply filter
  const filtered = allTasks.filter(t => {
    if (State.activeTaskFilter === 'all') return true;
    return t.status === State.activeTaskFilter;
  });

  if (filtered.length === 0) {
    container.innerHTML = '';
    emptyEl.hidden = false;
    if (State.activeTaskFilter === 'all') {
      emptyTitle.textContent = 'No tasks yet';
      emptySub.textContent   = 'Add your first task to this workspace.';
    } else {
      emptyTitle.textContent = `No "${formatStatus(State.activeTaskFilter)}" tasks`;
      emptySub.textContent   = 'Try a different filter or add a new task.';
    }
    return;
  }

  emptyEl.hidden = true;

  // Separate: incomplete first, done at bottom
  const incomplete = filtered.filter(t => t.status !== 'done');
  const done       = filtered.filter(t => t.status === 'done');
  const sorted     = [...incomplete, ...done];

  container.innerHTML = sorted.map(task => renderTaskItem(task)).join('');
}

/** Render a single task item */
function renderTaskItem(task) {
  const today = new Date(); today.setHours(0,0,0,0);
  let dueHTML = '';
  if (task.dueDate) {
    const due = new Date(task.dueDate); due.setHours(0,0,0,0);
    const isOverdue = task.status !== 'done' && due < today;
    dueHTML = `
      <span class="due-date-pill ${isOverdue ? 'overdue' : ''}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${isOverdue ? '⚠ ' : ''}${formatDate(task.dueDate)}
      </span>
    `;
  }

  const descHTML = task.description
    ? `<div class="task-item-desc">${escHtml(task.description)}</div>` : '';

  return `
    <div class="task-item ${task.status === 'done' ? 'done' : ''}" data-task-id="${task.id}">
      <input
        type="checkbox"
        class="task-checkbox"
        ${task.status === 'done' ? 'checked' : ''}
        onchange="toggleTaskDone('${task.id}', this.checked)"
        aria-label="Mark ${escHtml(task.title)} as done"
        title="Toggle complete"
      />
      <div class="task-item-body">
        <div class="task-item-title">${escHtml(task.title)}</div>
        ${descHTML}
        <div class="task-item-meta">
          <span class="priority-pill ${task.priority}">${capitalize(task.priority)}</span>
          <span class="status-pill ${task.status}">${formatStatus(task.status)}</span>
          ${dueHTML}
        </div>
      </div>
      <div class="task-item-actions">
        <button class="icon-btn" onclick="openEditTaskModal('${task.id}')" title="Edit task" aria-label="Edit task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="icon-btn" onclick="confirmDeleteTask('${task.id}', '${escHtml(task.title)}')" title="Delete task" style="color: var(--text-3);" aria-label="Delete task">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>
  `;
}

/** Update the workspace detail header progress bar */
async function updateWorkspaceDetailProgress(tasks) {
  const total     = tasks.length;
  const completed = tasks.filter(t => t.status === 'done').length;
  const pct       = total ? Math.round((completed / total) * 100) : 0;

  setTextContent('ws-detail-meta', `${total} task${total !== 1 ? 's' : ''} · ${pct}% done`);
  const bar = document.getElementById('ws-detail-progress');
  if (bar) bar.style.width = `${pct}%`;
}

/** Set the active task filter */
function setTaskFilter(status, btn) {
  State.activeTaskFilter = status;

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.status === status);
  });

  // Re-trigger the listener to re-render with new filter
  if (State.activeWorkspaceId) {
    startTaskListener(State.activeWorkspaceId);
  }
}

/* ================================================================
   SECTION 11: WORKSPACE CRUD
   ================================================================ */

/** Open "Add Workspace" modal */
function openAddWorkspaceModal() {
  State.editingWorkspaceId = null;
  setTextContent('workspace-modal-title', 'New Workspace');
  setTextContent('ws-submit-btn', 'Create Workspace');
  document.getElementById('ws-name-input').value = '';
  document.getElementById('ws-emoji-value').value = EMOJIS[0];
  document.getElementById('ws-color-value').value = COLORS[0];
  clearFormError('ws-name-error');
  renderEmojiPicker(EMOJIS[0]);
  renderColorPicker(COLORS[0]);
  showModal('workspace-modal');
  document.getElementById('ws-name-input').focus();
}

/** Open "Edit Workspace" modal for the currently open workspace */
function openEditWorkspaceModal() {
  const ws = State.workspaces.find(w => w.id === State.activeWorkspaceId);
  if (!ws) return;
  State.editingWorkspaceId = ws.id;
  setTextContent('workspace-modal-title', 'Edit Workspace');
  setTextContent('ws-submit-btn', 'Save Changes');
  document.getElementById('ws-name-input').value = ws.name;
  document.getElementById('ws-emoji-value').value = ws.emoji || EMOJIS[0];
  document.getElementById('ws-color-value').value = ws.color || COLORS[0];
  clearFormError('ws-name-error');
  renderEmojiPicker(ws.emoji || EMOJIS[0]);
  renderColorPicker(ws.color || COLORS[0]);
  showModal('workspace-modal');
}

/** Handle workspace form submit (create or update) */
async function submitWorkspaceForm(event) {
  event.preventDefault();
  const name  = document.getElementById('ws-name-input').value.trim();
  const emoji = document.getElementById('ws-emoji-value').value || '📁';
  const color = document.getElementById('ws-color-value').value || COLORS[0];

  if (!name) {
    showFormError('ws-name-error', 'Workspace name is required');
    return;
  }
  clearFormError('ws-name-error');

  const btn = document.getElementById('ws-submit-btn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    if (State.editingWorkspaceId) {
      // Update existing
      await db
        .collection('users').doc(State.user.uid)
        .collection('workspaces').doc(State.editingWorkspaceId)
        .update({ name, emoji, color });
      showToast('✅ Workspace updated!', 'success');
    } else {
      // Create new
      await db
        .collection('users').doc(State.user.uid)
        .collection('workspaces')
        .add({
          name, emoji, color,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      showToast('✨ Workspace created!', 'success');
    }
    closeModal('workspace-modal');
  } catch (err) {
    showToast('Error saving workspace: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = State.editingWorkspaceId ? 'Save Changes' : 'Create Workspace';
  }
}

/** Confirm and delete a workspace (from workspace grid) */
function confirmDeleteWorkspaceById(wsId, wsName) {
  showConfirmModal(
    'Delete Workspace',
    `Delete "${wsName}" and ALL its tasks? This cannot be undone.`,
    () => deleteWorkspace(wsId)
  );
}

/** Confirm and delete the currently open workspace (from detail view) */
function confirmDeleteWorkspace() {
  const ws = State.workspaces.find(w => w.id === State.activeWorkspaceId);
  if (!ws) return;
  showConfirmModal(
    'Delete Workspace',
    `Delete "${ws.name}" and ALL its tasks? This cannot be undone.`,
    () => deleteWorkspace(ws.id)
  );
}

/** Delete a workspace and all its tasks */
async function deleteWorkspace(wsId) {
  try {
    // Delete all tasks in the workspace first (Firestore doesn't auto-delete subcollections)
    const tasksSnap = await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(wsId)
      .collection('tasks').get();

    const batch = db.batch();
    tasksSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(
      db.collection('users').doc(State.user.uid).collection('workspaces').doc(wsId)
    );
    await batch.commit();

    showToast('🗑 Workspace deleted', 'warning');

    // Navigate back to workspaces grid if we were in detail view
    if (State.currentView === 'workspace-detail' && State.activeWorkspaceId === wsId) {
      State.activeWorkspaceId = null;
      if (taskListenerUnsub) { taskListenerUnsub(); taskListenerUnsub = null; }
      navigateTo('workspaces');
    }
  } catch (err) {
    showToast('Error deleting workspace: ' + err.message, 'error');
  }
}

/* ================================================================
   SECTION 12: TASK CRUD
   ================================================================ */

/** Open "Add Task" modal */
function openAddTaskModal() {
  State.editingTaskId = null;
  setTextContent('task-modal-title', 'New Task');
  setTextContent('task-submit-btn', 'Add Task');

  // Reset form
  document.getElementById('task-id-input').value    = '';
  document.getElementById('task-title-input').value = '';
  document.getElementById('task-desc-input').value  = '';
  document.getElementById('task-status-input').value = 'todo';
  document.getElementById('task-priority-input').value = 'medium';
  document.getElementById('task-due-input').value   = '';
  document.getElementById('task-notes-input').value = '';
  clearFormError('task-title-error');

  showModal('task-modal');
  setTimeout(() => document.getElementById('task-title-input')?.focus(), 100);
}

/** Open "Edit Task" modal */
async function openEditTaskModal(taskId) {
  if (!State.activeWorkspaceId) return;

  try {
    const doc = await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(State.activeWorkspaceId)
      .collection('tasks').doc(taskId)
      .get();

    if (!doc.exists) return;
    const task = doc.data();

    State.editingTaskId = taskId;
    setTextContent('task-modal-title', 'Edit Task');
    setTextContent('task-submit-btn', 'Save Changes');

    document.getElementById('task-id-input').value       = taskId;
    document.getElementById('task-title-input').value    = task.title || '';
    document.getElementById('task-desc-input').value     = task.description || '';
    document.getElementById('task-status-input').value   = task.status || 'todo';
    document.getElementById('task-priority-input').value = task.priority || 'medium';
    document.getElementById('task-due-input').value      = task.dueDate || '';
    document.getElementById('task-notes-input').value    = task.notes || '';
    clearFormError('task-title-error');

    showModal('task-modal');
  } catch (err) {
    showToast('Error loading task', 'error');
  }
}

/** Handle task form submit (create or update) */
async function submitTaskForm(event) {
  event.preventDefault();
  if (!State.activeWorkspaceId) return;

  const title = document.getElementById('task-title-input').value.trim();
  if (!title) {
    showFormError('task-title-error', 'Task title is required');
    return;
  }
  clearFormError('task-title-error');

  const taskData = {
    title,
    description: document.getElementById('task-desc-input').value.trim(),
    status:      document.getElementById('task-status-input').value,
    priority:    document.getElementById('task-priority-input').value,
    dueDate:     document.getElementById('task-due-input').value,
    notes:       document.getElementById('task-notes-input').value.trim(),
    updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
  };

  const btn = document.getElementById('task-submit-btn');
  btn.disabled = true;

  try {
    const tasksRef = db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(State.activeWorkspaceId)
      .collection('tasks');

    if (State.editingTaskId) {
      await tasksRef.doc(State.editingTaskId).update(taskData);
      showToast('✅ Task updated!', 'success');
    } else {
      await tasksRef.add({
        ...taskData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      showToast('✨ Task added!', 'success');
    }

    closeModal('task-modal');
  } catch (err) {
    showToast('Error saving task: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/** Toggle a task's done/undone status */
async function toggleTaskDone(taskId, isDone) {
  if (!State.activeWorkspaceId) return;
  try {
    await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(State.activeWorkspaceId)
      .collection('tasks').doc(taskId)
      .update({
        status:    isDone ? 'done' : 'todo',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    showToast('Error updating task', 'error');
  }
}

/** Confirm and delete a task */
function confirmDeleteTask(taskId, taskTitle) {
  showConfirmModal(
    'Delete Task',
    `Delete "${taskTitle}"? This cannot be undone.`,
    () => deleteTask(taskId)
  );
}

async function deleteTask(taskId) {
  if (!State.activeWorkspaceId) return;
  try {
    await db
      .collection('users').doc(State.user.uid)
      .collection('workspaces').doc(State.activeWorkspaceId)
      .collection('tasks').doc(taskId)
      .delete();
    showToast('🗑 Task deleted', 'warning');
  } catch (err) {
    showToast('Error deleting task: ' + err.message, 'error');
  }
}

/* ================================================================
   SECTION 13: SETTINGS
   ================================================================ */
function renderSettings() {
  updateUserUI();

  // Sync theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.checked = State.theme === 'dark';
  }
}

/* ================================================================
   SECTION 14: THEME
   ================================================================ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  State.theme = theme;

  const moonIcon = document.getElementById('theme-icon-moon');
  const sunIcon  = document.getElementById('theme-icon-sun');
  if (moonIcon) moonIcon.hidden = theme === 'light';
  if (sunIcon)  sunIcon.hidden  = theme === 'dark';

  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.checked = theme === 'dark';

  // Persist to Firestore
  if (State.user) {
    db.collection('users').doc(State.user.uid).update({ theme }).catch(() => {});
  }
}

function toggleTheme() {
  const newTheme = State.theme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

/* ================================================================
   SECTION 15: EMOJI & COLOR PICKERS
   ================================================================ */
function renderEmojiPicker(selected) {
  const container = document.getElementById('emoji-picker');
  if (!container) return;
  container.innerHTML = EMOJIS.map(emoji => `
    <button
      type="button"
      class="emoji-btn ${emoji === selected ? 'selected' : ''}"
      onclick="selectEmoji('${emoji}')"
      aria-label="Select emoji ${emoji}"
    >${emoji}</button>
  `).join('');
}

function selectEmoji(emoji) {
  document.getElementById('ws-emoji-value').value = emoji;
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.textContent === emoji);
  });
}

function renderColorPicker(selected) {
  const container = document.getElementById('color-picker');
  if (!container) return;
  container.innerHTML = COLORS.map(color => `
    <div
      class="color-swatch ${color === selected ? 'selected' : ''}"
      style="background: ${color};"
      onclick="selectColor('${color}')"
      role="radio"
      aria-checked="${color === selected}"
      aria-label="Select color ${color}"
      tabindex="0"
    ></div>
  `).join('');
}

function selectColor(color) {
  document.getElementById('ws-color-value').value = color;
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.classList.toggle('selected', swatch.style.background === color ||
      swatch.style.backgroundColor === color ||
      swatch.getAttribute('aria-label') === `Select color ${color}`);
    // More reliable: use data attr
  });
  // Re-render to update selected state
  renderColorPicker(color);
}

/* ================================================================
   SECTION 16: MODAL SYSTEM
   ================================================================ */
let confirmOkCallback = null;

function showModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = false;
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.hidden = true;
}

function showConfirmModal(title, message, onConfirm) {
  setTextContent('confirm-title',   title);
  setTextContent('confirm-message', message);
  confirmOkCallback = onConfirm;
  showModal('confirm-modal');
}

/* ================================================================
   SECTION 17: TOAST SYSTEM
   ================================================================ */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = {
    success: '✅',
    error:   '❌',
    warning: '⚠️',
    info:    'ℹ️'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = `${icons[type] || ''} ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/* ================================================================
   SECTION 18: MOBILE SIDEBAR
   ================================================================ */
function openMobileSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
  document.body.style.overflow = '';
}

/* ================================================================
   SECTION 19: GLOBAL EVENT LISTENERS
   ================================================================ */
let eventsInitialized = false;

function initGlobalEvents() {
  if (eventsInitialized) return;
  eventsInitialized = true;

  // Sidebar close button (mobile)
  document.getElementById('sidebar-close-btn')?.addEventListener('click', closeMobileSidebar);

  // Confirm modal OK button
  document.getElementById('confirm-ok-btn')?.addEventListener('click', () => {
    if (typeof confirmOkCallback === 'function') {
      confirmOkCallback();
      confirmOkCallback = null;
    }
    closeModal('confirm-modal');
  });

  // Close modals on overlay click
  ['workspace-modal', 'task-modal', 'confirm-modal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) closeModal(id);
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['workspace-modal', 'task-modal', 'confirm-modal'].forEach(id => closeModal(id));
    }
  });
}

/* ================================================================
   SECTION 20: UTILITY FUNCTIONS
   ================================================================ */

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function getInitials(name) {
  return (name || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function formatStatus(status) {
  return { 'todo': 'To Do', 'in-progress': 'In Progress', 'done': 'Done' }[status] || capitalize(status);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function setTextContent(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setInnerHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function showFormError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
  const inputId = id.replace('-error', '-input');
  const input = document.getElementById(inputId);
  if (input) input.classList.add('error');
}

function clearFormError(id) {
  const el = document.getElementById(id);
  if (el) el.textContent = '';
  const inputId = id.replace('-error', '-input');
  const input = document.getElementById(inputId);
  if (input) input.classList.remove('error');
}
