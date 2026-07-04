(function () {
  const cfg = window.PLUGIN_MANAGER;
  if (!cfg) return;

  const state = {
    browsePage: 1,
    browseQuery: '',
    browseSort: 'relevance',
    browseTotal: 0,
    selectedProject: null,
  };

  const els = {
    tabs: document.querySelectorAll('[data-pm-tab]'),
    installedPanel: document.getElementById('pmInstalledPanel'),
    browsePanel: document.getElementById('pmBrowsePanel'),
    installedList: document.getElementById('pmInstalledList'),
    installedEmpty: document.getElementById('pmInstalledEmpty'),
    installedSearch: document.getElementById('pmInstalledSearch'),
    installedCount: document.getElementById('pmInstalledCount'),
    browseResults: document.getElementById('pmBrowseResults'),
    browseEmpty: document.getElementById('pmBrowseEmpty'),
    browseSearch: document.getElementById('pmBrowseSearch'),
    browseSort: document.getElementById('pmBrowseSort'),
    browseSearchBtn: document.getElementById('pmBrowseSearchBtn'),
    browseMoreBtn: document.getElementById('pmBrowseMoreBtn'),
    uploadInput: document.getElementById('pmUploadInput'),
    updateAllBtn: document.getElementById('pmUpdateAllBtn'),
    restartBanner: document.getElementById('pmRestartBanner'),
    restartBtn: document.getElementById('pmRestartBtn'),
    restartLaterBtn: document.getElementById('pmRestartLaterBtn'),
    detailModal: document.getElementById('pmDetailModal'),
    detailTitle: document.getElementById('pmDetailTitle'),
    detailMeta: document.getElementById('pmDetailMeta'),
    detailBody: document.getElementById('pmDetailBody'),
    detailIcon: document.getElementById('pmDetailIcon'),
    detailVersions: document.getElementById('pmDetailVersions'),
    detailActions: document.getElementById('pmDetailActions'),
    progressModal: document.getElementById('pmProgressModal'),
    progressTitle: document.getElementById('pmProgressTitle'),
    progressStage: document.getElementById('pmProgressStage'),
    progressBar: document.getElementById('pmProgressBar'),
    progressWarnings: document.getElementById('pmProgressWarnings'),
    installedLoading: document.getElementById('pmInstalledLoading'),
    browseLoading: document.getElementById('pmBrowseLoading'),
  };

  function api(path, options) {
    const headers = {
      Accept: 'application/json',
      ...(options && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    };
    if (cfg.csrfToken) headers['x-csrf-token'] = cfg.csrfToken;

    return fetch(`${cfg.apiBase}${path}`, {
      credentials: 'same-origin',
      ...options,
      headers: { ...headers, ...(options && options.headers ? options.headers : {}) },
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    });
  }

  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function showRestartBanner() {
    if (els.restartBanner) els.restartBanner.classList.remove('hidden');
  }

  function setActiveTab(tab) {
    els.tabs.forEach((button) => {
      button.classList.toggle('active', button.dataset.pmTab === tab);
    });
    if (els.installedPanel) els.installedPanel.classList.toggle('hidden', tab !== 'installed');
    if (els.browsePanel) els.browsePanel.classList.toggle('hidden', tab !== 'browse');
  }

  function openModal(modal) {
    if (modal) modal.classList.remove('hidden');
  }

  function closeModal(modal) {
    if (modal) modal.classList.add('hidden');
  }

  function renderInstalledCard(plugin) {
    const card = document.createElement('div');
    card.className = 'pm-card';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-medium truncate">${escapeHtml(plugin.projectName || plugin.filename)}</h3>
            ${plugin.enabled ? '<span class="pm-badge">Enabled</span>' : '<span class="pm-badge">Disabled</span>'}
            ${plugin.updateAvailable ? '<span class="pm-badge">Update Available</span>' : ''}
          </div>
          <p class="text-xs text-neutral-500 mt-1 truncate">${escapeHtml(plugin.filename)}</p>
          <p class="text-xs text-neutral-500 mt-1">${escapeHtml(plugin.versionNumber || 'Unknown version')} · ${formatBytes(plugin.size)}${plugin.author ? ` · ${escapeHtml(plugin.author)}` : ''}</p>
        </div>
        <div class="flex flex-col gap-2 shrink-0">
          ${plugin.projectId ? `<button type="button" class="pm-btn-secondary text-xs" data-action="details" data-project-id="${escapeAttr(plugin.projectId)}">Details</button>` : ''}
          ${plugin.updateAvailable && plugin.latestVersionId ? `<button type="button" class="pm-btn-primary text-xs" data-action="update" data-project-id="${escapeAttr(plugin.projectId)}" data-version-id="${escapeAttr(plugin.latestVersionId)}">Update</button>` : ''}
          <button type="button" class="pm-btn-secondary text-xs" data-action="toggle" data-filename="${escapeAttr(plugin.filename)}" data-enabled="${plugin.enabled ? '0' : '1'}">${plugin.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" class="pm-btn-secondary text-xs" data-action="delete" data-filename="${escapeAttr(plugin.filename)}">Delete</button>
        </div>
      </div>
    `;
    return card;
  }

  function renderBrowseCard(hit) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pm-card text-left w-full hover:border-neutral-300 dark:hover:border-white/20';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        ${hit.icon_url ? `<img src="${escapeAttr(hit.icon_url)}" alt="" class="size-10 rounded-lg object-cover shrink-0">` : '<div class="size-10 rounded-lg bg-neutral-200 dark:bg-neutral-800 shrink-0"></div>'}
        <div class="min-w-0 flex-1">
          <h3 class="font-medium truncate">${escapeHtml(hit.title)}</h3>
          <p class="text-xs text-neutral-500 mt-1 line-clamp-2">${escapeHtml(hit.description || '')}</p>
          <p class="text-xs text-neutral-400 mt-2">${Number(hit.downloads || 0).toLocaleString()} downloads</p>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openProjectDetails(hit.project_id));
    return card;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  async function loadInstalled(query) {
    if (!els.installedList) return;
    if (els.installedLoading) els.installedLoading.style.display = 'grid';
    if (els.installedEmpty) els.installedEmpty.classList.add('hidden');
    els.installedList.innerHTML = '';
    try {
      const params = query ? `?q=${encodeURIComponent(query)}` : '';
      const response = await api(`/installed${params}`);
      const plugins = response.data || [];
      if (els.installedEmpty) els.installedEmpty.classList.toggle('hidden', plugins.length > 0);
      if (els.installedCount) els.installedCount.textContent = `${plugins.length} plugin${plugins.length === 1 ? '' : 's'}`;
      plugins.forEach((plugin) => els.installedList.appendChild(renderInstalledCard(plugin)));
    } finally {
      if (els.installedLoading) els.installedLoading.style.display = 'none';
    }
  }

  async function loadBrowse(append) {
    if (!els.browseResults) return;
    if (els.browseLoading) els.browseLoading.style.display = 'grid';
    if (els.browseEmpty) els.browseEmpty.classList.add('hidden');
    if (!append) {
      els.browseResults.innerHTML = '';
      state.browsePage = 1;
    }
    try {
      const params = new URLSearchParams({
        q: state.browseQuery,
        page: String(state.browsePage),
        sort: state.browseSort,
      });
      const response = await api(`/search?${params.toString()}`);
      const results = response.data || { hits: [], total_hits: 0 };
      state.browseTotal = results.total_hits || 0;
      const hits = results.hits || [];
      if (els.browseEmpty) els.browseEmpty.classList.toggle('hidden', hits.length > 0 || append);
      hits.forEach((hit) => els.browseResults.appendChild(renderBrowseCard(hit)));
      if (els.browseMoreBtn) {
        const loaded = els.browseResults.children.length;
        els.browseMoreBtn.classList.toggle('hidden', loaded >= state.browseTotal);
      }
    } finally {
      if (els.browseLoading) els.browseLoading.style.display = 'none';
    }
  }

  async function openProjectDetails(projectId) {
    const response = await api(`/project/${encodeURIComponent(projectId)}`);
    const { project, versions } = response.data;
    state.selectedProject = project;
    if (els.detailTitle) els.detailTitle.textContent = project.title;
    if (els.detailMeta) {
      els.detailMeta.textContent = `${project.downloads?.toLocaleString?.() || project.downloads || 0} downloads · ${project.license?.name || 'Unknown license'}`;
    }
    if (els.detailBody) els.detailBody.textContent = project.description || project.body || 'No description available.';
    if (els.detailIcon) {
      if (project.icon_url) {
        els.detailIcon.src = project.icon_url;
        els.detailIcon.classList.remove('hidden');
      } else {
        els.detailIcon.classList.add('hidden');
      }
    }
    if (els.detailVersions) {
      els.detailVersions.innerHTML = versions.slice(0, 8).map((version) => `
        <div class="pm-card !p-3 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium truncate">${escapeHtml(version.version_number)}</p>
            <p class="text-xs text-neutral-500 truncate">${escapeHtml((version.game_versions || []).join(', '))} · ${escapeHtml((version.loaders || []).join(', '))}</p>
          </div>
          <button type="button" class="pm-btn-primary text-xs" data-action="install" data-project-id="${escapeAttr(project.id)}" data-version-id="${escapeAttr(version.id)}">Install</button>
        </div>
      `).join('');
    }
    if (els.detailActions) els.detailActions.innerHTML = '';
    openModal(els.detailModal);
  }

  function showProgress(title, stage, progress, warnings) {
    openModal(els.progressModal);
    if (els.progressTitle) els.progressTitle.textContent = title;
    if (els.progressStage) els.progressStage.textContent = stage;
    if (els.progressBar) els.progressBar.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
    if (els.progressWarnings) {
      els.progressWarnings.innerHTML = (warnings || []).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('');
    }
  }

  function connectProgressSocket(operationId, onComplete) {
    const socket = new WebSocket(`${cfg.wsBase}/${encodeURIComponent(operationId)}`);
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'progress') {
          showProgress('Installing plugin', payload.stageMessage || payload.stage, payload.overallProgress, payload.warnings);
        }
      } catch {
        // Ignore malformed websocket payloads.
      }
    });
    socket.addEventListener('close', () => {
      closeModal(els.progressModal);
      if (onComplete) onComplete();
    });
    return socket;
  }

  async function installPlugin(projectId, versionId, force) {
    if (!cfg.daemonOnline) throw new Error('Daemon is offline.');
    const body = {
      projectId,
      versionId,
      force: Boolean(force),
      installDependencies: true,
    };

    const response = await fetch(`${cfg.apiBase}/install`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.csrfToken ? { 'x-csrf-token': cfg.csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Installation failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let operationId = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.operationId) operationId = payload.operationId;
        if (payload.type === 'progress') {
          showProgress('Installing plugin', payload.stageMessage || payload.stage, payload.overallProgress, payload.warnings);
        }
        if (payload.type === 'complete') {
          closeModal(els.progressModal);
          showRestartBanner();
          await loadInstalled(els.installedSearch ? els.installedSearch.value : '');
          return;
        }
        if (payload.type === 'error') {
          throw new Error(payload.message || 'Installation failed');
        }
      }
    }

    if (operationId) connectProgressSocket(operationId, () => loadInstalled(els.installedSearch ? els.installedSearch.value : ''));
  }

  async function handleInstalledAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete ${button.dataset.filename}?`)) return;
        await api(`/${encodeURIComponent(button.dataset.filename)}`, { method: 'DELETE' });
        showRestartBanner();
        await loadInstalled(els.installedSearch ? els.installedSearch.value : '');
      }
      if (action === 'toggle') {
        await api('/toggle', {
          method: 'POST',
          body: JSON.stringify({
            filename: button.dataset.filename,
            enabled: button.dataset.enabled === '1',
          }),
        });
        showRestartBanner();
        await loadInstalled(els.installedSearch ? els.installedSearch.value : '');
      }
      if (action === 'update' || action === 'install') {
        await installPlugin(button.dataset.projectId, button.dataset.versionId, false);
      }
      if (action === 'details') {
        await openProjectDetails(button.dataset.projectId);
      }
    } catch (error) {
      window.alert(error.message || 'Action failed');
    }
  }

  async function uploadPlugin(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.jar')) {
      window.alert('Only .jar files are supported.');
      return;
    }
    const formData = new FormData();
    formData.append('plugin', file);
    showProgress('Uploading plugin', 'Uploading...', 15, []);
    await fetch(`${cfg.apiBase}/upload`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: cfg.csrfToken ? { 'x-csrf-token': cfg.csrfToken } : {},
      body: formData,
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      return data;
    });
    closeModal(els.progressModal);
    showRestartBanner();
    await loadInstalled();
  }

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setActiveTab(tab.dataset.pmTab);
      if (tab.dataset.pmTab === 'browse' && els.browseResults && !els.browseResults.children.length) {
        state.browseQuery = '';
        loadBrowse(false).catch((error) => window.alert(error.message));
      }
    });
  });

  if (els.installedSearch) {
    let searchTimer;
    els.installedSearch.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        loadInstalled(els.installedSearch.value).catch((error) => window.alert(error.message));
      }, 250);
    });
  }

  if (els.browseSearchBtn) {
    els.browseSearchBtn.addEventListener('click', () => {
      state.browseQuery = els.browseSearch ? els.browseSearch.value : '';
      state.browseSort = els.browseSort ? els.browseSort.value : 'relevance';
      loadBrowse(false).catch((error) => window.alert(error.message));
    });
  }

  if (els.browseMoreBtn) {
    els.browseMoreBtn.addEventListener('click', () => {
      state.browsePage += 1;
      loadBrowse(true).catch((error) => window.alert(error.message));
    });
  }

  if (els.installedList) els.installedList.addEventListener('click', handleInstalledAction);
  if (els.detailVersions) els.detailVersions.addEventListener('click', handleInstalledAction);
  if (els.detailModal) {
    els.detailModal.querySelectorAll('[data-pm-close]').forEach((button) => {
      button.addEventListener('click', () => closeModal(els.detailModal));
    });
  }

  if (els.uploadInput) {
    els.uploadInput.addEventListener('change', () => {
      const file = els.uploadInput.files && els.uploadInput.files[0];
      uploadPlugin(file).catch((error) => {
        closeModal(els.progressModal);
        window.alert(error.message || 'Upload failed');
      }).finally(() => {
        els.uploadInput.value = '';
      });
    });
  }

  if (els.updateAllBtn) {
    els.updateAllBtn.addEventListener('click', () => {
      api('/update-all', { method: 'POST', body: JSON.stringify({}) })
        .then((response) => {
          showRestartBanner();
          window.alert(`Started ${response.data.updated} plugin update(s).`);
          return loadInstalled();
        })
        .catch((error) => window.alert(error.message || 'Update all failed'));
    });
  }

  if (els.restartBtn) {
    els.restartBtn.addEventListener('click', () => {
      fetch(`/server/${cfg.serverId}/power/restart`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: cfg.csrfToken ? { 'x-csrf-token': cfg.csrfToken } : {},
      }).then(() => {
        if (els.restartBanner) els.restartBanner.classList.add('hidden');
      }).catch(() => window.alert('Failed to restart server.'));
    });
  }

  if (els.restartLaterBtn && els.restartBanner) {
    els.restartLaterBtn.addEventListener('click', () => els.restartBanner.classList.add('hidden'));
  }

  loadInstalled().catch((error) => window.alert(error.message || 'Failed to load plugins'));
})();
