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
    console.log(`[PM] WebSocket connect for ${operationId}`);
    const socket = new WebSocket(`${cfg.wsBase}/${encodeURIComponent(operationId)}`);
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        console.log(`[PM] WS message:`, payload);
        if (payload.type === 'progress') {
          showProgress('Installing plugin', payload.stageMessage || payload.stage, payload.overallProgress, payload.warnings);
        }
      } catch { /* ignore */ }
    });
    socket.addEventListener('close', () => {
      console.log(`[PM] WS closed`);
      closeModal(els.progressModal);
      if (onComplete) onComplete();
    });
    return socket;
  }

  async function installPlugin(projectId, versionId, force, installDependencies, dependencyIds) {
    console.log(`[PM] installPlugin()`);
    console.log(`[PM]   projectId=${projectId}`);
    console.log(`[PM]   versionId=${versionId}`);
    console.log(`[PM]   force=${force}`);
    console.log(`[PM]   installDependencies=${installDependencies}`);
    console.log(`[PM]   dependencyIds=`, dependencyIds);
    console.log(`[PM]   daemonOnline=${cfg.daemonOnline}`);

    if (!cfg.daemonOnline) throw new Error('Daemon is offline.');
    const body = {
      projectId,
      versionId,
      force: Boolean(force),
      installDependencies: Boolean(installDependencies),
      dependencyIds: Array.isArray(dependencyIds) ? dependencyIds : [],
    };

    console.log(`[PM] POST ${cfg.apiBase}/install body=`, body);
    const response = await fetch(`${cfg.apiBase}/install`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.csrfToken ? { 'x-csrf-token': cfg.csrfToken } : {}),
      },
      body: JSON.stringify(body),
    });

    console.log(`[PM] POST /install status=${response.status} ${response.statusText}`);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      console.log(`[PM] POST /install error response:`, data);
      throw new Error(data.error || 'Installation failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let operationId = null;

    console.log(`[PM] SSE stream started, reading events...`);
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        console.log(`[PM] SSE stream ended`);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((entry) => entry.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));
        console.log(`[PM] SSE event:`, payload);
        if (payload.operationId) operationId = payload.operationId;
        if (payload.type === 'progress') {
          showProgress('Installing plugin', payload.stageMessage || payload.stage, payload.overallProgress, payload.warnings);
        }
        if (payload.type === 'complete') {
          console.log(`[PM] Install COMPLETE`);
          closeModal(els.progressModal);
          showRestartBanner();
          await Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : '');
          return;
        }
        if (payload.type === 'error') {
          console.log(`[PM] Install ERROR: ${payload.message}`);
          throw new Error(payload.message || 'Installation failed');
        }
      }
    }
    console.log(`[PM] SSE finished, operationId=${operationId}`);
    if (operationId) connectProgressSocket(operationId, () => Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : ''));
  }

  async function handleModalInstall(button) {
    const projectId = button.dataset.projectId;
    const versionId = button.dataset.versionId;
    const force = button.dataset.force === 'true';
    const modal = button.closest('.pm-modal');
    const isInstallModal = modal && modal.id === 'pmInstallModal';

    console.log(`[PM] ===== Install button clicked =====`);
    console.log(`[PM] projectId=${projectId}`);
    console.log(`[PM] versionId=${versionId}`);
    console.log(`[PM] force=${force}`);
    console.log(`[PM] isInstallModal=${isInstallModal}`);

    try {
      const origText = button.textContent;
      button.textContent = 'Checking...';
      button.disabled = true;
      let checkRes;
      try {
        console.log(`[PM] POST /install/check { versionId: ${versionId} }`);
        checkRes = await Api.post('/install/check', { versionId });
        console.log(`[PM] /install/check response:`, checkRes);
      } finally {
        button.textContent = origText;
        button.disabled = false;
      }

      const { compatibility, dependencies } = checkRes.data;

      console.log(`[PM] Compatibility:`, compatibility);
      console.log(`[PM] Dependencies:`, dependencies);

      if (compatibility.errors.length > 0 && !compatibility.forceAllowed) {
        console.log(`[PM] Incompatible (errors present, not admin): ${compatibility.errors.join(' ')}`);
        throw new Error(`Incompatible: ${compatibility.errors.join(' ')}`);
      }

      let finalForce = force;
      if (compatibility.errors.length > 0 && compatibility.forceAllowed && !force) {
        console.log(`[PM] Admin, showing force install confirm dialog`);
        if (!window.confirm(`Compatibility Warnings:\n${compatibility.errors.join('\n')}\n\nForce install anyway?`)) {
          console.log(`[PM] User cancelled force install`);
          return;
        }
        finalForce = true;
      }

      const depContainer = isInstallModal
        ? document.getElementById('pmInstallDependencyContainer')
        : document.getElementById('pmDependencyContainer');
      const depList = isInstallModal
        ? document.getElementById('pmInstallDependencyList')
        : document.getElementById('pmDependencyList');

      if (dependencies && dependencies.length > 0 && depContainer && depList) {
        console.log(`[PM] Showing dependency picker for ${dependencies.length} deps`);
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
          console.log(`[PM] Dependency cancel clicked`);
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
          console.log(`[PM] Dependency confirm clicked`);
          depContainer.classList.add('hidden');
          closeModal(isInstallModal ? els.installModal : els.detailModal);

          const selectedDeps = [];
          depList.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
            selectedDeps.push(input.dataset.depProjectId);
          });
          console.log(`[PM] Selected dependencies:`, selectedDeps);
          try {
            await installPlugin(projectId, versionId, finalForce, true, selectedDeps);
          } catch (err) {
            console.log(`[PM] installPlugin with deps failed: ${err.message}`);
            window.alert(err.message || 'Installation failed');
          }
        };
      } else {
        console.log(`[PM] No dependencies, proceeding directly to install`);
        closeModal(isInstallModal ? els.installModal : els.detailModal);
        await installPlugin(projectId, versionId, finalForce, false, []);
      }
    } catch (error) {
      console.log(`[PM] handleModalInstall ERROR: ${error.message}`);
      console.log(`[PM] Stack: ${error.stack}`);
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

  async function handleUpdateAll() {
    if (!els.installedList) return;
    const outdated = els.installedList.querySelectorAll('[data-action="update"]');
    for (const btn of outdated) {
      try {
        await installPlugin(btn.dataset.projectId, btn.dataset.versionId, false, false, []);
      } catch {
        continue;
      }
    }
  }

  async function handleUpload(file) {
    if (!file || !file.name.toLowerCase().endsWith('.jar')) {
      window.alert('Please select a .jar file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binary);

        await Api.post('/upload', {
          filename: file.name,
          content: base64,
          fileSize: file.size,
        });

        showRestartBanner();
        await Browser.loadInstalled(els.installedSearch ? els.installedSearch.value : '');
      } catch (error) {
        window.alert(error.message || 'Upload failed');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function init() {
    if (els.browseSearchBtn) {
      els.browseSearchBtn.addEventListener('click', () => {
        if (els.browseSearch) Browser.loadBrowse(els.browseSearch.value);
      });
    }

    if (els.browseSearch) {
      els.browseSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') Browser.loadBrowse(els.browseSearch.value);
      });
    }

    if (els.browseMoreBtn) {
      els.browseMoreBtn.addEventListener('click', () => Browser.loadMore());
    }

    if (els.installedSearch) {
      els.installedSearch.addEventListener('input', Utils.debounce(() => {
        Browser.loadInstalled(els.installedSearch.value);
      }, 300));
    }

    if (els.uploadInput) {
      els.uploadInput.addEventListener('change', (e) => {
        if (e.target.files?.[0]) handleUpload(e.target.files[0]);
        e.target.value = '';
      });
    }

    els.tabs.forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.pmTab));
    });

    if (els.updateAllBtn) {
      els.updateAllBtn.addEventListener('click', handleUpdateAll);
    }

    if (els.restartBtn) {
      els.restartBtn.addEventListener('click', () => {
        fetch('/server/' + cfg.serverId + '/restart', { method: 'POST', headers: { 'x-csrf-token': cfg.csrfToken } });
      });
    }

    if (els.restartLaterBtn) {
      els.restartLaterBtn.addEventListener('click', () => {
        if (els.restartBanner) els.restartBanner.classList.add('hidden');
      });
    }

    // Event delegation for all dynamic content
    document.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      // Detail modal install buttons
      if (action === 'install' && btn.closest('#pmDetailModal')) {
        console.log(`[PM] Detail modal install clicked`);
        handleModalInstall(btn);
        return;
      }

      // Install modal install buttons
      if (action === 'install' && btn.closest('#pmInstallModal')) {
        console.log(`[PM] Install modal install clicked`);
        handleModalInstall(btn);
        return;
      }

      // Open install modal from browse card
      if (action === 'open-install') {
        console.log(`[PM] Open install modal for ${btn.dataset.projectId}`);
        InstallModal.open(btn.dataset.projectId);
        return;
      }

      // Legacy detail modal actions
      if (action === 'install' || action === 'details' || action === 'update' || action === 'delete' || action === 'toggle') {
        if (btn.closest('#pmInstalledList')) {
          handleInstalledAction(event);
        }
      }
    });

    Browser.loadBrowse('');
    Browser.loadInstalled('');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
