(function () {
  const cfg = window.PLUGIN_MANAGER;
  if (!cfg) return;

  const Utils = window.PluginManager && window.PluginManager.Utils;
  const Api = window.PluginManager && window.PluginManager.Api;
  const Browser = window.PluginManager && window.PluginManager.Browser;
  const DetailsModal = window.PluginManager && window.PluginManager.DetailsModal;
  const InstallModal = window.PluginManager && window.PluginManager.InstallModal;
  if (!Utils || !Api || !Browser || !DetailsModal || !InstallModal) return;

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
    browseSearchBtn: document.getElementById('pmBrowseSearchBtn'),
    browseMoreBtn: document.getElementById('pmBrowseMoreBtn'),
    uploadInput: document.getElementById('pmUploadInput'),
    updateAllBtn: document.getElementById('pmUpdateAllBtn'),
    restartBanner: document.getElementById('pmRestartBanner'),
    restartBtn: document.getElementById('pmRestartBtn'),
    restartLaterBtn: document.getElementById('pmRestartLaterBtn'),
    detailModal: document.getElementById('pmDetailModal'),
    installModal: document.getElementById('pmInstallModal'),
    progressModal: document.getElementById('pmProgressModal'),
    progressTitle: document.getElementById('pmProgressTitle'),
    progressStage: document.getElementById('pmProgressStage'),
    progressBar: document.getElementById('pmProgressBar'),
    progressWarnings: document.getElementById('pmProgressWarnings'),
    installedLoading: document.getElementById('pmInstalledLoading'),
    browseLoading: document.getElementById('pmBrowseLoading'),
  };

  function showRestartBanner() {
    if (els.restartBanner) els.restartBanner.classList.remove('hidden');
  }

  function setActiveTab(tab) {
    els.tabs.forEach((btn) => btn.classList.toggle('active', btn.dataset.pmTab === tab));
    if (els.installedPanel) els.installedPanel.classList.toggle('hidden', tab !== 'installed');
    if (els.browsePanel) els.browsePanel.classList.toggle('hidden', tab !== 'browse');
  }

  function openModal(modal) { if (modal) modal.classList.remove('hidden'); }
  function closeModal(modal) { if (modal) modal.classList.add('hidden'); }

  function showProgress(title, stage, progress, warnings) {
    openModal(els.progressModal);
    if (els.progressTitle) els.progressTitle.textContent = title;
    if (els.progressStage) els.progressStage.textContent = stage;
    if (els.progressBar) els.progressBar.style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
    if (els.progressWarnings) {
      els.progressWarnings.innerHTML = (warnings || []).map(w => `<li>${Utils.escapeHtml(w)}</li>`).join('');
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
      } catch { /* ignore */ }
    });
    socket.addEventListener('close', () => {
      closeModal(els.progressModal);
      if (onComplete) onComplete();
    });
    return socket;
  }

  async function installPlugin(projectId, versionId, force, installDependencies, dependencyIds) {
    if (!cfg.daemonOnline) throw new Error('Daemon is offline.');
    const body = {
      projectId,
      versionId,
      force: Boolean(force),
      installDependencies: Boolean(installDependencies),
      dependencyIds: Array.isArray(dependencyIds) ? dependencyIds : [],
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
          await Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : '');
          return;
        }
        if (payload.type === 'error') {
          throw new Error(payload.message || 'Installation failed');
        }
      }
    }
    if (operationId) connectProgressSocket(operationId, () => Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : ''));
  }

  async function handleModalInstall(button) {
    const projectId = button.dataset.projectId;
    const versionId = button.dataset.versionId;
    const force = button.dataset.force === 'true';
    const modal = button.closest('.pm-modal');
    const isInstallModal = modal && modal.id === 'pmInstallModal';

    try {
      const origText = button.textContent;
      button.textContent = 'Checking...';
      button.disabled = true;
      let checkRes;
      try {
        checkRes = await Api.post('/install/check', { versionId });
      } finally {
        button.textContent = origText;
        button.disabled = false;
      }

      const { compatibility, dependencies } = checkRes.data;

      if (compatibility.errors.length > 0 && !compatibility.forceAllowed) {
        throw new Error(`Incompatible: ${compatibility.errors.join(' ')}`);
      }

      let finalForce = force;
      if (compatibility.errors.length > 0 && compatibility.forceAllowed && !force) {
        if (!window.confirm(`Compatibility Warnings:\n${compatibility.errors.join('\n')}\n\nForce install anyway?`)) return;
        finalForce = true;
      }

      const depContainer = isInstallModal
        ? document.getElementById('pmInstallDependencyContainer')
        : document.getElementById('pmDependencyContainer');
      const depList = isInstallModal
        ? document.getElementById('pmInstallDependencyList')
        : document.getElementById('pmDependencyList');

      if (dependencies && dependencies.length > 0 && depContainer && depList) {
        depList.innerHTML = dependencies.map(dep => `
          <li class="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5">
            <label class="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
              <input type="checkbox" data-dep-project-id="${Utils.escapeAttr(dep.projectId)}" ${dep.required ? 'checked disabled' : 'checked'} class="rounded border-neutral-300 dark:border-neutral-700 focus:ring-emerald-500">
              <span class="truncate font-medium">${Utils.escapeHtml(dep.projectName)} <span class="text-[10px] text-neutral-500">(${Utils.escapeHtml(dep.versionNumber)})</span></span>
            </label>
            <span class="pm-badge shrink-0">${dep.required ? 'Required' : 'Optional'}</span>
          </li>
        `).join('');

        depContainer.classList.remove('hidden');
        if (isInstallModal) {
          const av = document.getElementById('pmInstallAllVersions');
          if (av) av.classList.add('hidden');
        } else {
          const vl = modal ? modal.querySelector('[data-pm-version-list]') : null;
          if (vl) vl.classList.add('hidden');
        }

        const cancelBtnId = isInstallModal ? 'pmInstallCancelDeps' : 'pmCancelInstallBtn';
        const confirmBtnId = isInstallModal ? 'pmInstallConfirmDeps' : 'pmConfirmInstallBtn';
        document.getElementById(cancelBtnId).onclick = () => {
          depContainer.classList.add('hidden');
          if (isInstallModal) {
            const av = document.getElementById('pmInstallAllVersions');
            if (av) av.classList.remove('hidden');
          } else {
            const vl = modal ? modal.querySelector('[data-pm-version-list]') : null;
            if (vl) vl.classList.remove('hidden');
          }
        };
        document.getElementById(confirmBtnId).onclick = async () => {
          depContainer.classList.add('hidden');
          closeModal(isInstallModal ? els.installModal : els.detailModal);

          const selectedDeps = [];
          depList.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
            selectedDeps.push(input.dataset.depProjectId);
          });
          try {
            await installPlugin(projectId, versionId, finalForce, true, selectedDeps);
          } catch (err) {
            window.alert(err.message || 'Installation failed');
          }
        };
      } else {
        closeModal(isInstallModal ? els.installModal : els.detailModal);
        await installPlugin(projectId, versionId, finalForce, false, []);
      }
    } catch (error) {
      window.alert(error.message || 'Check failed');
    }
  }

  async function handleInstalledAction(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    try {
      if (action === 'delete') {
        if (!window.confirm(`Delete ${btn.dataset.filename}?`)) return;
        await Api.delete(`/${encodeURIComponent(btn.dataset.filename)}`);
        showRestartBanner();
        await Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : '');
      } else if (action === 'toggle') {
        await Api.post('/toggle', { filename: btn.dataset.filename, enabled: btn.dataset.enabled === '1' });
        showRestartBanner();
        await Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : '');
      } else if (action === 'update') {
        await installPlugin(btn.dataset.projectId, btn.dataset.versionId, false, false, []);
      } else if (action === 'details') {
        await DetailsModal.open(btn.dataset.projectId);
      }
    } catch (error) {
      window.alert(error.message || 'Action failed');
    }
  }

  async function uploadPlugin(file) {
    if (!file || !file.name.toLowerCase().endsWith('.jar')) {
      window.alert('Only .jar files are supported.');
      return;
    }
    const formData = new FormData();
    formData.append('plugin', file);
    showProgress('Uploading plugin', 'Uploading...', 15, []);
    try {
      const response = await fetch(`${cfg.apiBase}/upload`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: cfg.csrfToken ? { 'x-csrf-token': cfg.csrfToken } : {},
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Upload failed');
    } finally {
      closeModal(els.progressModal);
    }
    showRestartBanner();
    await Browser.loadInstalled();
  }

  // ---- Event wiring ----

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      Api.cancelAll();
      setActiveTab(tab.dataset.pmTab);
      if (tab.dataset.pmTab === 'browse' && els.browseResults && !els.browseResults.children.length) {
        Browser.setQuery('');
        Browser.resetPage();
        Browser.loadBrowse(false).catch(() => {});
      }
    });
  });

  if (els.installedSearch) {
    let timer;
    els.installedSearch.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => Browser.loadInstalled(els.installedSearch.value).catch(() => {}), 250);
    });
  }

  if (els.browseSearchBtn) {
    els.browseSearchBtn.addEventListener('click', () => {
      Api.cancelAll();
      Browser.setQuery(els.browseSearch ? els.browseSearch.value : '');
      Browser.setSort(document.getElementById('pmBrowseSort') ? document.getElementById('pmBrowseSort').value : 'relevance');
      Browser.resetPage();
      Browser.loadBrowse(false).catch(() => {});
    });
  }

  if (els.browseMoreBtn) {
    els.browseMoreBtn.addEventListener('click', () => {
      Browser.nextPage();
      Browser.loadBrowse(true).catch(() => {});
    });
  }

  // Installed list actions
  if (els.installedList) els.installedList.addEventListener('click', handleInstalledAction);

  // Modal event delegations
  if (els.detailModal) {
    els.detailModal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'install') handleModalInstall(btn);
    });
  }

  if (els.installModal) {
    els.installModal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'install') handleModalInstall(btn);
      if (action === 'open-install') {
        InstallModal.open(btn.dataset.projectId).catch((err) => window.alert(err.message));
      }
    });
    // Close on backdrop click
    els.installModal.addEventListener('click', (e) => {
      if (e.target === els.installModal || e.target.classList.contains('pm-modal-backdrop')) {
        InstallModal.close();
      }
    });
  }

  // Browse card actions (details + open-install)
  if (els.browseResults) {
    els.browseResults.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const projectId = btn.dataset.projectId;
      try {
        if (action === 'details') {
          await DetailsModal.open(projectId);
        } else if (action === 'open-install') {
          if (btn.disabled) return;
          await InstallModal.open(projectId);
        }
      } catch (err) {
        window.alert(err.message);
      }
    });
  }

  // Direct close buttons on modals
  if (els.detailModal) {
    els.detailModal.addEventListener('click', (e) => {
      if (e.target === els.detailModal || e.target.classList.contains('pm-modal-backdrop') || e.target.closest('[data-pm-close]')) {
        DetailsModal.close();
      }
    });
  }

  if (els.uploadInput) {
    els.uploadInput.addEventListener('change', () => {
      const file = els.uploadInput.files && els.uploadInput.files[0];
      uploadPlugin(file).catch((err) => {
        closeModal(els.progressModal);
        window.alert(err.message || 'Upload failed');
      }).finally(() => { els.uploadInput.value = ''; });
    });
  }

  if (els.updateAllBtn) {
    els.updateAllBtn.addEventListener('click', () => {
      Api.post('/update-all', {}).then((response) => {
        showRestartBanner();
        window.alert(`Started ${response.data.updated} plugin update(s).`);
        return Browser.loadInstalled();
      }).catch((err) => window.alert(err.message || 'Update all failed'));
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

  Browser.loadInstalled().catch(() => {});
})();
