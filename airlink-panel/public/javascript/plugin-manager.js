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

  const projectAuthors = new Map();
  const installedPluginsMap = new Map();

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
    const url = `${cfg.apiBase}${path}`;
    console.log('[PM] api() calling:', url, 'options:', options);
    const headers = {
      Accept: 'application/json',
      ...(options && options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    };
    if (cfg.csrfToken) headers['x-csrf-token'] = cfg.csrfToken;

    return fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...headers, ...(options && options.headers ? options.headers : {}) },
    }).then(async (response) => {
      console.log('[PM] fetch response:', response.status, response.url);
      const data = await response.json().catch(() => ({}));
      console.log('[PM] response data:', data);
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }
      return data;
    }).catch((err) => {
      console.log('[PM] fetch error:', err);
      throw err;
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
    if (hit.author && hit.project_id) {
      projectAuthors.set(hit.project_id, hit.author);
    }
    
    const installed = installedPluginsMap.get(hit.project_id);
    let buttonText = 'Install';
    let buttonClass = 'pm-btn-primary';
    if (installed) {
      if (installed.updateAvailable) {
        buttonText = 'Update';
        buttonClass = 'pm-btn-primary !bg-amber-500 hover:!bg-amber-600 !text-white';
      } else {
        buttonText = 'Installed';
        buttonClass = 'pm-btn-secondary !cursor-default opacity-80';
      }
    }

    const card = document.createElement('div');
    card.className = 'pm-card flex flex-col justify-between border border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10 transition p-5 h-full';
    
    const versionsList = hit.versions || [];
    const formattedVersions = versionsList.slice(0, 3).join(', ') + (versionsList.length > 3 ? '...' : '');

    card.innerHTML = `
      <div class="flex items-start gap-4 flex-1">
        ${hit.icon_url ? `<img src="${escapeAttr(hit.icon_url)}" alt="" class="size-12 rounded-xl object-cover shrink-0 border border-neutral-200 dark:border-white/5">` : '<div class="size-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 shrink-0 border border-neutral-200 dark:border-white/5"></div>'}
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-sm truncate">${escapeHtml(hit.title)}</h3>
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">by <span class="font-medium text-neutral-600 dark:text-neutral-300">${escapeHtml(hit.author || 'Unknown')}</span></p>
          <div class="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-[10px] text-neutral-500">
            <span class="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-full">${Number(hit.downloads || 0).toLocaleString()} downloads</span>
            ${formattedVersions ? `<span class="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[150px]">MC: ${escapeHtml(formattedVersions)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="text-xs text-neutral-600 dark:text-neutral-400 mt-4 line-clamp-2 leading-relaxed flex-1">${escapeHtml(hit.description || '')}</p>
      <div class="flex gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-white/5 shrink-0">
        <button type="button" class="pm-btn-secondary text-xs flex-1 py-2 px-3 text-center rounded-lg" data-action="details" data-project-id="${escapeAttr(hit.project_id)}">Details</button>
        <button type="button" class="${buttonClass} text-xs flex-1 py-2 px-3 text-center rounded-lg font-semibold" data-action="install-shortcut" data-project-id="${escapeAttr(hit.project_id)}">${buttonText}</button>
      </div>
    `;
    
    card.querySelector('[data-action="details"]').addEventListener('click', () => {
      openProjectDetails(hit.project_id, 'about').catch((error) => {
        console.error('Failed to open project details:', error);
        window.alert(error.message || 'Failed to load details');
      });
    });
    
    const instBtn = card.querySelector('[data-action="install-shortcut"]');
    console.log('[PM] renderBrowseCard for', hit.project_id, 'instBtn:', instBtn, 'exists:', !!instBtn);
    instBtn.addEventListener('click', (e) => {
      console.log('[PM] INSTALL-SHORTCUT CLICKED! project_id:', hit.project_id);
      openProjectDetails(hit.project_id, 'versions').catch((error) => {
        console.error('[PM] Failed to open project details:', error);
        window.alert(error.message || 'Failed to load details');
      });
    });

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
      
      // Update installed plugins map!
      installedPluginsMap.clear();
      plugins.forEach((plugin) => {
        if (plugin.projectId) {
          installedPluginsMap.set(plugin.projectId, plugin);
        }
      });

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

  function updateVersionsList(listContainer, project, versions, gameFilter, loaderFilter, typeFilter) {
    if (!listContainer) return;
    
    const filtered = versions.filter(version => {
      if (gameFilter === 'server' && cfg.minecraftVersion) {
        if (!version.game_versions.includes(cfg.minecraftVersion)) return false;
      }
      if (loaderFilter === 'server' && cfg.loader) {
        const matches = version.loaders.some(l => l.toLowerCase() === cfg.loader.toLowerCase());
        if (!matches) return false;
      }
      if (typeFilter === 'release') {
        if (version.version_type !== 'release') return false;
      } else if (typeFilter === 'beta-alpha') {
        if (version.version_type !== 'beta' && version.version_type !== 'alpha') return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      listContainer.innerHTML = `<p class="text-xs text-neutral-500 py-6 text-center">No compatible versions match the selected filters.</p>`;
      return;
    }

    listContainer.innerHTML = filtered.map(version => {
      const installed = installedPluginsMap.get(project.id);
      let actionHtml = '';
      
      const matchesMC = !cfg.minecraftVersion || version.game_versions.includes(cfg.minecraftVersion);
      const matchesLoader = !cfg.loader || version.loaders.some(l => l.toLowerCase() === cfg.loader.toLowerCase());
      const isCompatible = matchesMC && matchesLoader;
      
      let badgeHtml = '';
      if (!isCompatible) {
        badgeHtml = `<span class="pm-badge !bg-red-500/10 !text-red-500 border border-red-500/10">Incompatible</span>`;
      } else {
        badgeHtml = `<span class="pm-badge !bg-emerald-500/10 !text-emerald-500 border border-emerald-500/10">Compatible</span>`;
      }

      if (installed) {
        if (installed.versionId === version.id) {
          actionHtml = `
            <span class="text-xs text-neutral-400 dark:text-neutral-500 font-medium mr-2">Installed</span>
            <button type="button" class="pm-btn-secondary text-xs" data-action="install" data-project-id="${escapeAttr(project.id)}" data-version-id="${escapeAttr(version.id)}" data-force="${!isCompatible}">Reinstall</button>
          `;
        } else {
          const isNewer = installed.updateAvailable && installed.latestVersionId === version.id;
          actionHtml = `
            ${isNewer ? '<span class="text-xs text-amber-500 font-medium mr-2">Update Available</span>' : ''}
            <button type="button" class="pm-btn-primary text-xs" data-action="install" data-project-id="${escapeAttr(project.id)}" data-version-id="${escapeAttr(version.id)}" data-force="${!isCompatible}">${isNewer ? 'Update' : 'Install'}</button>
          `;
        }
      } else {
        actionHtml = `
          <button type="button" class="pm-btn-primary text-xs" data-action="install" data-project-id="${escapeAttr(project.id)}" data-version-id="${escapeAttr(version.id)}" data-force="${!isCompatible}">Install</button>
        `;
      }

      return `
        <div class="pm-card !p-3 flex items-center justify-between gap-3 border border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10 transition">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <p class="text-sm font-semibold truncate">${escapeHtml(version.name || version.version_number)}</p>
              ${badgeHtml}
              <span class="text-[10px] text-neutral-400 border border-neutral-200 dark:border-white/5 px-1.5 py-0.5 rounded-full uppercase">${escapeHtml(version.version_type)}</span>
            </div>
            <p class="text-xs text-neutral-500 truncate mt-1">${escapeHtml((version.game_versions || []).slice(0, 5).join(', '))} · ${escapeHtml((version.loaders || []).slice(0, 5).join(', '))}</p>
          </div>
          <div class="flex items-center shrink-0 ml-2">
            ${actionHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderProjectModal(container, project, versions, authorName, defaultTab = 'about') {
    container.innerHTML = `
      <div class="flex items-start justify-between gap-4 mb-4">
        <div class="flex items-start gap-3 min-w-0">
          ${project.icon_url ? `<img src="${escapeAttr(project.icon_url)}" alt="" class="size-12 rounded-xl object-cover shrink-0">` : '<div class="size-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 shrink-0"></div>'}
          <div class="min-w-0">
            <h2 class="text-lg font-bold truncate">${escapeHtml(project.title)}</h2>
            <p class="text-xs text-neutral-500 mt-1">by ${escapeHtml(authorName)} · ${project.downloads?.toLocaleString() || 0} downloads</p>
          </div>
        </div>
        <button type="button" class="pm-icon-btn shrink-0" data-pm-close aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div class="flex gap-2 border-b border-neutral-200 dark:border-white/5 pb-2 mb-4">
        <button data-pm-modal-tab="about" class="pm-modal-tab ${defaultTab === 'about' ? 'active bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white' : 'text-neutral-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02]'} px-3 py-1.5 text-xs font-semibold rounded-lg transition">About</button>
        <button data-pm-modal-tab="versions" class="pm-modal-tab ${defaultTab === 'versions' ? 'active bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white' : 'text-neutral-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02]'} px-3 py-1.5 text-xs font-semibold rounded-lg transition">Versions</button>
        ${project.gallery && project.gallery.length > 0 ? `<button data-pm-modal-tab="gallery" class="pm-modal-tab text-neutral-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02] px-3 py-1.5 text-xs font-semibold rounded-lg transition">Gallery</button>` : ''}
      </div>

      <div id="pmModalTabContent">
        <div id="pmModalTabContent-about" class="pm-modal-tab-panel ${defaultTab === 'about' ? '' : 'hidden'}">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-2 prose prose-sm dark:prose-invert max-w-none text-neutral-600 dark:text-neutral-300 max-h-96 overflow-y-auto pr-2" style="white-space: pre-wrap;">${escapeHtml(project.body || project.description || 'No description available.')}</div>
            <div class="space-y-4 bg-neutral-50 dark:bg-white/[0.02] p-4 rounded-xl border border-neutral-200 dark:border-white/5 text-sm h-fit">
              <div>
                <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Followers</h4>
                <p class="font-medium mt-0.5">${project.followers?.toLocaleString() || 0}</p>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">License</h4>
                <p class="font-medium mt-0.5">${escapeHtml(project.license?.name || 'Unknown')}</p>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Categories</h4>
                <div class="flex flex-wrap gap-1 mt-1">
                  ${(project.categories || []).map(cat => `<span class="pm-badge">${escapeHtml(cat)}</span>`).join('')}
                </div>
              </div>
              <div>
                <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Links</h4>
                <div class="flex flex-col gap-1.5 mt-2.5">
                  ${project.source_url ? `<a href="${escapeAttr(project.source_url)}" target="_blank" class="text-emerald-500 hover:underline flex items-center gap-1">Source Code</a>` : ''}
                  ${project.issues_url ? `<a href="${escapeAttr(project.issues_url)}" target="_blank" class="text-emerald-500 hover:underline flex items-center gap-1">Issue Tracker</a>` : ''}
                  ${project.wiki_url ? `<a href="${escapeAttr(project.wiki_url)}" target="_blank" class="text-emerald-500 hover:underline flex items-center gap-1">Wiki</a>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="pmModalTabContent-versions" class="pm-modal-tab-panel ${defaultTab === 'versions' ? '' : 'hidden'}">
          <div class="flex flex-wrap gap-2 mb-4 bg-neutral-50 dark:bg-white/[0.02] p-3 rounded-xl border border-neutral-200 dark:border-white/5">
            <div class="flex-1 min-w-[120px]">
              <label class="text-xs font-semibold text-neutral-400 dark:text-neutral-500">Game Version</label>
              <select id="pmFilterGame" class="pm-select w-full mt-1 py-1.5 px-2.5 text-xs bg-white dark:bg-neutral-800">
                <option value="all">All Versions</option>
                ${cfg.minecraftVersion ? `<option value="server" selected>Compatible (${cfg.minecraftVersion})</option>` : ''}
              </select>
            </div>
            <div class="flex-1 min-w-[120px]">
              <label class="text-xs font-semibold text-neutral-400 dark:text-neutral-500">Loader</label>
              <select id="pmFilterLoader" class="pm-select w-full mt-1 py-1.5 px-2.5 text-xs bg-white dark:bg-neutral-800">
                <option value="all">All Loaders</option>
                ${cfg.loader ? `<option value="server" selected>Compatible (${cfg.loader})</option>` : ''}
              </select>
            </div>
            <div class="flex-1 min-w-[120px]">
              <label class="text-xs font-semibold text-neutral-400 dark:text-neutral-500">Type</label>
              <select id="pmFilterType" class="pm-select w-full mt-1 py-1.5 px-2.5 text-xs bg-white dark:bg-neutral-800">
                <option value="all">All Types</option>
                <option value="release" selected>Release Only</option>
                <option value="beta-alpha">Beta / Alpha</option>
              </select>
            </div>
          </div>

          <div id="pmModalVersionsList" class="space-y-2 max-h-[340px] overflow-y-auto pr-2">
          </div>
        </div>

        ${project.gallery && project.gallery.length > 0 ? `
          <div id="pmModalTabContent-gallery" class="pm-modal-tab-panel hidden">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-2">
              ${project.gallery.map(img => `
                <div class="space-y-1">
                  <a href="${escapeAttr(img.url)}" target="_blank">
                    <img src="${escapeAttr(img.url)}" alt="${escapeAttr(img.title || '')}" class="w-full h-36 rounded-lg object-cover shadow border border-neutral-200 dark:border-white/5 hover:opacity-90 transition">
                  </a>
                  ${img.title ? `<p class="text-xs font-semibold px-1">${escapeHtml(img.title)}</p>` : ''}
                  ${img.description ? `<p class="text-[10px] text-neutral-500 px-1 leading-normal line-clamp-2">${escapeHtml(img.description)}</p>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>

      <div id="pmDependencyContainer" class="hidden mt-4 p-4 border border-emerald-500/20 bg-emerald-500/[0.02] rounded-xl space-y-4">
        <h4 class="text-sm font-semibold text-emerald-500 flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path><path d="M12 6v12"></path><path d="M8 10h8"></path></svg>
          Dependency Installation Confirmation
        </h4>
        <p class="text-xs text-neutral-500 leading-normal">
          This plugin requires or suggests installing the following dependencies to function correctly. Choose which ones to install:
        </p>
        <ul id="pmDependencyList" class="space-y-2 text-xs">
        </ul>
        <div class="flex justify-end gap-2 pt-2">
          <button id="pmCancelInstallBtn" type="button" class="pm-btn-secondary text-xs">Cancel</button>
          <button id="pmConfirmInstallBtn" type="button" class="pm-btn-primary text-xs bg-emerald-600 text-white hover:bg-emerald-700">Confirm & Install</button>
        </div>
      </div>
    `;

    container.querySelectorAll('[data-pm-close]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(els.detailModal));
    });

    const tabs = container.querySelectorAll('[data-pm-modal-tab]');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.classList.remove('active', 'bg-neutral-100', 'dark:bg-white/5', 'border', 'border-neutral-200', 'dark:border-white/10', 'text-neutral-900', 'dark:text-white');
          t.classList.add('text-neutral-500', 'hover:bg-neutral-50', 'dark:hover:bg-white/[0.02]');
        });
        tab.classList.add('active', 'bg-neutral-100', 'dark:bg-white/5', 'border', 'border-neutral-200', 'dark:border-white/10', 'text-neutral-900', 'dark:text-white');
        tab.classList.remove('text-neutral-500', 'hover:bg-neutral-50', 'dark:hover:bg-white/[0.02]');
        
        container.querySelectorAll('.pm-modal-tab-panel').forEach(p => p.classList.add('hidden'));
        const panelId = `pmModalTabContent-${tab.dataset.pmModalTab}`;
        container.querySelector(`#${panelId}`).classList.remove('hidden');
      });
    });

    const filterGame = container.querySelector('#pmFilterGame');
    const filterLoader = container.querySelector('#pmFilterLoader');
    const filterType = container.querySelector('#pmFilterType');
    
    const onFilterChange = () => {
      updateVersionsList(
        container.querySelector('#pmModalVersionsList'),
        project,
        versions,
        filterGame ? filterGame.value : 'all',
        filterLoader ? filterLoader.value : 'all',
        filterType ? filterType.value : 'all'
      );
    };

    if (filterGame) filterGame.addEventListener('change', onFilterChange);
    if (filterLoader) filterLoader.addEventListener('change', onFilterChange);
    if (filterType) filterType.addEventListener('change', onFilterChange);

    onFilterChange();
  }

  async function openProjectDetails(projectId, defaultTab = 'about') {
    console.log('[PM] openProjectDetails called. projectId:', projectId, 'tab:', defaultTab);
    const response = await api(`/project/${encodeURIComponent(projectId)}`);
    console.log('[PM] API response received:', response);
    const { project, versions } = response.data;
    state.selectedProject = project;
    console.log('[PM] Project loaded:', project?.title, 'versions:', versions?.length);
    
    const authorName = projectAuthors.get(projectId) || 'Unknown';
    const modalContent = document.querySelector('#pmDetailModal .pm-modal-content');
    console.log('[PM] modalContent element:', modalContent);
    if (!modalContent) {
      console.log('[PM] FATAL: #pmDetailModal .pm-modal-content not found!');
      return;
    }

    renderProjectModal(modalContent, project, versions, authorName, defaultTab);
    openModal(els.detailModal);
    console.log('[PM] Modal opened');
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

  async function installPlugin(projectId, versionId, force, installDependencies = true, dependencyIds = []) {
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

  async function handleModalAction(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const projectId = button.dataset.projectId;
    const versionId = button.dataset.versionId;
    const force = button.dataset.force === 'true';

    if (action === 'install') {
      try {
        const checkBtnText = button.textContent;
        button.textContent = 'Checking...';
        button.disabled = true;
        
        let checkRes;
        try {
          checkRes = await api('/install/check', {
            method: 'POST',
            body: JSON.stringify({ versionId }),
          });
        } finally {
          button.textContent = checkBtnText;
          button.disabled = false;
        }

        const { compatibility, dependencies } = checkRes.data;

        if (compatibility.errors.length > 0 && !compatibility.forceAllowed) {
          throw new Error(`Incompatible: ${compatibility.errors.join(' ')}`);
        }

        if (compatibility.errors.length > 0 && compatibility.forceAllowed && !force) {
          if (!window.confirm(`Compatibility Warnings:\n${compatibility.errors.join('\n')}\n\nDo you want to force install anyway?`)) {
            return;
          }
        }

        const depContainer = document.getElementById('pmDependencyContainer');
        const depList = document.getElementById('pmDependencyList');
        
        if (dependencies && dependencies.length > 0 && depContainer && depList) {
          depList.innerHTML = dependencies.map(dep => `
            <li class="flex items-center justify-between p-2 rounded-lg bg-neutral-50 dark:bg-white/[0.02] border border-neutral-200 dark:border-white/5">
              <label class="flex items-center gap-2 cursor-pointer min-w-0 flex-1">
                <input type="checkbox" data-dep-project-id="${escapeAttr(dep.projectId)}" ${dep.required ? 'checked disabled class="text-neutral-400"' : 'checked class="text-emerald-500"'} class="rounded border-neutral-300 dark:border-neutral-700 focus:ring-emerald-500">
                <span class="truncate font-medium">${escapeHtml(dep.projectName)} <span class="text-[10px] text-neutral-500">(${escapeHtml(dep.versionNumber)})</span></span>
              </label>
              <span class="pm-badge shrink-0">${dep.required ? 'Required' : 'Optional'}</span>
            </li>
          `).join('');

          depContainer.classList.remove('hidden');
          document.getElementById('pmModalVersionsList').classList.add('hidden');

          const cancelBtn = document.getElementById('pmCancelInstallBtn');
          const confirmBtn = document.getElementById('pmConfirmInstallBtn');

          const cleanupListeners = () => {
            depContainer.classList.add('hidden');
            document.getElementById('pmModalVersionsList').classList.remove('hidden');
          };

          cancelBtn.onclick = cleanupListeners;
          confirmBtn.onclick = async () => {
            cleanupListeners();
            closeModal(els.detailModal);

            const selectedDeps = [];
            depList.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
              selectedDeps.push(input.dataset.depProjectId);
            });

            try {
              await installPlugin(projectId, versionId, force, true, selectedDeps);
            } catch (err) {
              window.alert(err.message || 'Installation failed');
            }
          };
        } else {
          closeModal(els.detailModal);
          await installPlugin(projectId, versionId, force, false, []);
        }
      } catch (error) {
        window.alert(error.message || 'Check failed');
      }
    }
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
  if (els.detailModal) {
    els.detailModal.addEventListener('click', handleModalAction);
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
