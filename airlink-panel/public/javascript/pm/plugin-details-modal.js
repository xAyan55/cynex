(function () {
  const cfg = window.PLUGIN_MANAGER;
  const U = window.PluginManager && window.PluginManager.Utils;
  if (!cfg || !U) return;

  let currentVersionData = null;

  function close() {
    const modal = document.getElementById('pmDetailModal');
    if (modal) modal.classList.add('hidden');
    currentVersionData = null;
  }

  function open() {
    const modal = document.getElementById('pmDetailModal');
    if (modal) modal.classList.remove('hidden');
  }

  function escapeHandler(e) {
    if (e.key === 'Escape') close();
  }

  function renderAboutTab(project) {
    const links = [];
    if (project.source_url) links.push(`<a href="${U.escapeAttr(project.source_url)}" target="_blank" rel="noopener" class="text-emerald-500 hover:underline flex items-center gap-1">Source Code</a>`);
    if (project.issues_url) links.push(`<a href="${U.escapeAttr(project.issues_url)}" target="_blank" rel="noopener" class="text-emerald-500 hover:underline flex items-center gap-1">Issue Tracker</a>`);
    if (project.wiki_url) links.push(`<a href="${U.escapeAttr(project.wiki_url)}" target="_blank" rel="noopener" class="text-emerald-500 hover:underline flex items-center gap-1">Wiki</a>`);

    return `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="md:col-span-2 prose prose-sm dark:prose-invert max-w-none text-neutral-600 dark:text-neutral-300 max-h-96 overflow-y-auto pr-2" style="white-space: pre-wrap;">${U.escapeHtml(project.body || project.description || 'No description available.')}</div>
        <div class="space-y-4 bg-neutral-50 dark:bg-white/[0.02] p-4 rounded-xl border border-neutral-200 dark:border-white/5 text-sm h-fit">
          <div>
            <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Followers</h4>
            <p class="font-medium mt-0.5">${U.formatNumber(project.followers)}</p>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Downloads</h4>
            <p class="font-medium mt-0.5">${U.formatNumber(project.downloads)}</p>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">License</h4>
            <p class="font-medium mt-0.5">${U.escapeHtml(project.license ? project.license.name : 'Unknown')}</p>
          </div>
          <div>
            <h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Categories</h4>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(project.categories || []).map(c => `<span class="pm-badge bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-300">${U.escapeHtml(c)}</span>`).join('')}
            </div>
          </div>
          ${links.length ? `<div><h4 class="text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">Links</h4><div class="flex flex-col gap-1.5 mt-2.5">${links.join('')}</div></div>` : ''}
        </div>
      </div>
    `;
  }

  var detailNormalizedMcVersion = U.normalizeVersion(cfg.minecraftVersion);

  function mcMatches(v) {
    if (!detailNormalizedMcVersion) return true;
    return U.serverVersionMatch(detailNormalizedMcVersion, v.game_versions || []);
  }

  function renderVersionsTab(project, versions, filters) {
    const filtered = versions.filter(v => {
      if (filters.game === 'server') {
        if (!mcMatches(v)) return false;
      }
      if (filters.type === 'release' && v.version_type !== 'release') return false;
      if (filters.type === 'beta-alpha' && v.version_type !== 'beta' && v.version_type !== 'alpha') return false;
      return true;
    });

    if (!filtered.length) {
      return '<p class="text-xs text-neutral-500 py-6 text-center">No versions match the selected filters.</p>';
    }

    return filtered.map(v => {
      const isCompatible = mcMatches(v);

      const badge = isCompatible
        ? '<span class="pm-badge bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Compatible</span>'
        : '<span class="pm-badge bg-red-500/10 text-red-500 border border-red-500/20">Incompatible</span>';

      return `
        <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10 transition">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-semibold truncate">${U.escapeHtml(v.name || v.version_number)}</span>
              ${badge}
              <span class="text-[10px] text-neutral-400 uppercase border border-neutral-200 dark:border-white/5 px-1.5 py-0.5 rounded-full">${U.escapeHtml(v.version_type)}</span>
            </div>
            <p class="text-xs text-neutral-500 truncate mt-1">${U.escapeHtml((v.game_versions || []).slice(0, 5).join(', '))} · ${U.escapeHtml((v.loaders || []).slice(0, 5).join(', '))}</p>
          </div>
          <button type="button" class="pm-btn-primary text-xs shrink-0" data-action="install" data-project-id="${U.escapeAttr(project.id)}" data-version-id="${U.escapeAttr(v.id)}" data-force="${!isCompatible}">Install</button>
        </div>
      `;
    }).join('');
  }

  function renderGalleryTab(project) {
    if (!project.gallery || !project.gallery.length) return '';
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[380px] overflow-y-auto pr-2">
        ${project.gallery.map(img => `
          <div class="space-y-1">
            <a href="${U.escapeAttr(img.url)}" target="_blank" rel="noopener">
              <img src="${U.escapeAttr(img.url)}" alt="${U.escapeAttr(img.title || '')}" loading="lazy" class="w-full h-36 rounded-lg object-cover shadow border border-neutral-200 dark:border-white/5 hover:opacity-90 transition">
            </a>
            ${img.title ? `<p class="text-xs font-semibold px-1">${U.escapeHtml(img.title)}</p>` : ''}
            ${img.description ? `<p class="text-[10px] text-neutral-500 px-1 leading-normal line-clamp-2">${U.escapeHtml(img.description)}</p>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }

  const DetailsModal = {
    async open(projectId, defaultTab, authorName) {
      const modal = document.getElementById('pmDetailModal');
      const content = modal ? modal.querySelector('.pm-modal-content') : null;
      if (!modal || !content) return;

      const response = await window.PluginManager.Api.get(`/project/${encodeURIComponent(projectId)}`);
      const { project, versions } = response.data;
      currentVersionData = { project, versions };

      authorName = authorName || window.PluginManager.Browser.authors.get(projectId) || 'Unknown';

      let filters = { game: 'all', type: 'all' };

      content.innerHTML = `
        <div class="flex items-start justify-between gap-4 mb-4">
          <div class="flex items-start gap-3 min-w-0">
            ${project.icon_url ? `<img src="${U.escapeAttr(project.icon_url)}" alt="" class="size-12 rounded-xl object-cover shrink-0">` : '<div class="size-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 shrink-0"></div>'}
            <div class="min-w-0">
              <h2 id="pmDetailModalTitle" class="text-lg font-bold truncate">${U.escapeHtml(project.title)}</h2>
              <p class="text-xs text-neutral-500 mt-1">by ${U.escapeHtml(authorName)} · ${U.formatNumber(project.downloads)} downloads · Latest: ${U.escapeHtml(project.latest_version || 'Unknown')}</p>
            </div>
          </div>
          <button type="button" class="pm-icon-btn shrink-0" data-pm-close aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="flex gap-2 border-b border-neutral-200 dark:border-white/5 pb-2 mb-4">
          <button data-pm-tab-btn="about" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition bg-neutral-100 dark:bg-white/5 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white">About</button>
          <button data-pm-tab-btn="versions" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition text-neutral-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02]">Versions</button>
          ${project.gallery && project.gallery.length ? `<button data-pm-tab-btn="gallery" class="px-3 py-1.5 text-xs font-semibold rounded-lg transition text-neutral-500 hover:bg-neutral-50 dark:hover:bg-white/[0.02]">Gallery</button>` : ''}
        </div>

        <div id="pmDetailTabContent">
          <div data-pm-tab-panel="about" class="">${renderAboutTab(project)}</div>
          <div data-pm-tab-panel="versions" class="hidden">
            <div class="flex flex-wrap gap-2 mb-4 bg-neutral-50 dark:bg-white/[0.02] p-3 rounded-xl border border-neutral-200 dark:border-white/5">
              <div class="flex-1 min-w-[120px]">
                <label class="text-xs font-semibold text-neutral-400 dark:text-neutral-500">Game Version</label>
                <select data-pm-filter="game" class="pm-select w-full mt-1 py-1.5 px-2.5 text-xs bg-white dark:bg-neutral-800">
                  <option value="all">All Versions</option>
                  ${detailNormalizedMcVersion ? `<option value="server">Compatible (${U.escapeHtml(detailNormalizedMcVersion)})</option>` : `<option value="server">Compatible (any)</option>`}
                </select>
              </div>

              <div class="flex-1 min-w-[120px]">
                <label class="text-xs font-semibold text-neutral-400 dark:text-neutral-500">Type</label>
                <select data-pm-filter="type" class="pm-select w-full mt-1 py-1.5 px-2.5 text-xs bg-white dark:bg-neutral-800">
                  <option value="all">All Types</option>
                  <option value="release">Release Only</option>
                  <option value="beta-alpha">Beta / Alpha</option>
                </select>
              </div>
            </div>
            <div data-pm-version-list class="space-y-2 max-h-[340px] overflow-y-auto pr-2">
              ${renderVersionsTab(project, versions, filters)}
            </div>
          </div>
          ${project.gallery && project.gallery.length ? `<div data-pm-tab-panel="gallery" class="hidden">${renderGalleryTab(project)}</div>` : ''}
        </div>

        <div data-pm-dep-container class="hidden mt-4 p-4 border border-emerald-500/20 bg-emerald-500/[0.02] rounded-xl space-y-4">
          <h4 class="text-sm font-semibold text-emerald-500">Dependencies</h4>
          <p class="text-xs text-neutral-500">This plugin requires or suggests installing:</p>
          <ul data-pm-dep-list class="space-y-2 text-xs"></ul>
          <div class="flex justify-end gap-2 pt-2">
            <button data-pm-dep-cancel type="button" class="pm-btn-secondary text-xs">Cancel</button>
            <button data-pm-dep-confirm type="button" class="pm-btn-primary text-xs bg-emerald-600 text-white hover:bg-emerald-700">Confirm & Install</button>
          </div>
        </div>
      `;

      modal.classList.remove('hidden');
      document.addEventListener('keydown', escapeHandler);

      // Tab switching
      content.querySelectorAll('[data-pm-tab-btn]').forEach(btn => {
        btn.addEventListener('click', () => {
          content.querySelectorAll('[data-pm-tab-btn]').forEach(b => {
            b.classList.remove('bg-neutral-100', 'dark:bg-white/5', 'border', 'border-neutral-200', 'dark:border-white/10', 'text-neutral-900', 'dark:text-white');
            b.classList.add('text-neutral-500', 'hover:bg-neutral-50', 'dark:hover:bg-white/[0.02]');
          });
          btn.classList.add('bg-neutral-100', 'dark:bg-white/5', 'border', 'border-neutral-200', 'dark:border-white/10', 'text-neutral-900', 'dark:text-white');
          btn.classList.remove('text-neutral-500', 'hover:bg-neutral-50', 'dark:hover:bg-white/[0.02]');

          content.querySelectorAll('[data-pm-tab-panel]').forEach(p => p.classList.add('hidden'));
          const panel = content.querySelector(`[data-pm-tab-panel="${btn.dataset.pmTabBtn}"]`);
          if (panel) panel.classList.remove('hidden');
        });
      });

      // Close
      content.querySelectorAll('[data-pm-close]').forEach(el => {
        el.addEventListener('click', close);
      });

      // Version filter
      const filterEls = content.querySelectorAll('[data-pm-filter]');
      const versionList = content.querySelector('[data-pm-version-list]');

      function applyFilters() {
        const f = { game: 'all', type: 'all' };
        filterEls.forEach(el => { f[el.dataset.pmFilter] = el.value; });
        if (versionList && currentVersionData) {
          versionList.innerHTML = renderVersionsTab(currentVersionData.project, currentVersionData.versions, f);
        }
      }

      filterEls.forEach(el => el.addEventListener('change', applyFilters));

      // Select default tab
      if (defaultTab) {
        const tabBtn = content.querySelector(`[data-pm-tab-btn="${defaultTab}"]`);
        if (tabBtn) tabBtn.click();
      }
    },

    close,
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.DetailsModal = DetailsModal;
})();
