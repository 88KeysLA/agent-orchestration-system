/**
 * Villa Portal — HITL Approval Panel
 * Shows pending tasks that need human approval, with approve/reject actions
 */
(function () {
  'use strict';
  const VP = window.VillaPortal;

  let els = {};
  let pending = [];
  let pollTimer = null;

  function renderPending() {
    if (!pending.length) {
      els.list.innerHTML = '<div class="hitl-empty">No pending approvals</div>';
      updateBadge(0);
      return;
    }
    els.list.innerHTML = pending.map(p => `
      <div class="hitl-card" data-id="${p.id}">
        <div class="hitl-task">${escapeHtml(p.task)}</div>
        <div class="hitl-id">${p.id}</div>
        <div class="hitl-actions">
          <button class="hitl-approve" data-id="${p.id}">Approve</button>
          <button class="hitl-reject" data-id="${p.id}">Reject</button>
        </div>
      </div>
    `).join('');
    updateBadge(pending.length);
  }

  function updateBadge(count) {
    let badge = document.getElementById('hitl-badge');
    if (!badge) {
      const tab = document.querySelector('[data-panel="hitl"]');
      if (!tab) return;
      badge = document.createElement('span');
      badge.id = 'hitl-badge';
      badge.className = 'hitl-badge';
      tab.appendChild(badge);
    }
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function fetchPending() {
    try {
      const data = await VP.apiFetch('/api/hitl/pending');
      pending = data.pending || [];
      renderPending();
    } catch {}
  }

  async function approve(id) {
    try {
      await VP.apiFetch(`/api/hitl/${id}/approve`, { method: 'POST', body: '{}' });
      pending = pending.filter(p => p.id !== id);
      renderPending();
    } catch (err) {
      console.error('Approve failed:', err);
    }
  }

  async function reject(id) {
    try {
      await VP.apiFetch(`/api/hitl/${id}/reject`, { method: 'POST', body: '{"reason":"rejected via portal"}' });
      pending = pending.filter(p => p.id !== id);
      renderPending();
    } catch (err) {
      console.error('Reject failed:', err);
    }
  }

  VP.modules.hitl = {
    init() {
      const panel = document.getElementById('panel-hitl');
      panel.innerHTML = `
        <div class="hitl-panel">
          <h2>Pending Approvals</h2>
          <p class="hitl-desc">Tasks matching destructive patterns (delete, destroy, shutdown, reboot) require your approval before execution. Tasks auto-reject after 60 seconds.</p>
          <div class="hitl-list" id="hitl-list"></div>
        </div>
      `;
      els.list = document.getElementById('hitl-list');

      // Delegate clicks
      els.list.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;
        if (btn.classList.contains('hitl-approve')) approve(id);
        if (btn.classList.contains('hitl-reject')) reject(id);
      });

      fetchPending();
    },

    onActivate() {
      fetchPending();
      // Poll every 3s while panel is active
      clearInterval(pollTimer);
      pollTimer = setInterval(fetchPending, 3000);
    },

    onDeactivate() {
      clearInterval(pollTimer);
      pollTimer = null;
    },

    onWSMessage(msg) {
      if (msg.type === 'hitl_pending') {
        pending = msg.pending || [];
        renderPending();
        // Flash the tab if not active
        if (VP.activePanel !== 'hitl' && pending.length > 0) {
          const tab = document.querySelector('[data-panel="hitl"]');
          if (tab) {
            tab.classList.add('flash');
            setTimeout(() => tab.classList.remove('flash'), 2000);
          }
        }
      }
    }
  };
})();
