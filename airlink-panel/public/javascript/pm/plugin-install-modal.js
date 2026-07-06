(function () {
  const cfg = window.PLUGIN_MANAGER;
  const U = window.PluginManager && window.PluginManager.Utils;
  const Api = window.PluginManager && window.PluginManager.Api;
  if (!cfg || !U || !Api) return;

  function close() {
    const modal = document.getElementById('pmInstallModal');
    if (modal) modal.classList.add('hidden');
  }

  function open() {
    const modal = document.getElementById('pmInstallModal');
    if (modal) modal.classList.remove('hidden');
  }

  function escapeHandler(e) {
    if (e.key === 'Escape') close();
  }

  var normalizedMcVersion = U.normalizeVersion(cfg.minecraftVersion);

  function versionIsCompatible(v) {
    if (!v) return false;
    if (!normalizedMcVersion) return true;
    return U.serverVersionMatch(normalizedMcVersion, v.game_versions || []);
  }

  function sortVersions(versions) {
    return [...versions].sort((a, b) => {
      const aCompat = versionIsCompatible(a) ? 1 : 0;
      const bCompat = versionIsCompatible(b) ? 1 : 0;
      if (aCompat !== bCompat) return bCompat - aCompat;
      if (a.version_type !== b.version_type) {
        if (a.version_type === 'release') return -1;
        if (b.version_type === 'release') return 1;
      }
      return new Date(b.date_published || 0) - new Date(a.date_published || 0);
    });
  }

  function renderVersionRow(version, projectId) {
    const compat = versionIsCompatible(version);
    const badge = compat
      ? '<span class="pm-badge bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Compatible</span>'
      : '<span class="pm-badge bg-red-500/10 text-red-500 border border-red-500/20">Incompatible</span>';

    return `
      <div class="flex items-center justify-between gap-3 p-3 rounded-xl border border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10 transition">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-semibold truncate">${U.escapeHtml(version.name || version.version_number)}</span>
            ${badge}
            <span class="text-[10px] text-neutral-400 uppercase border border-neutral-200 dark:border-white/5 px-1.5 py-0.5 rounded-full">${U.escapeHtml(version.version_type)}</span>
          </div>
          <p class="text-xs text-neutral-500 truncate mt-1">${U.escapeHtml((version.game_versions || []).join(', '))} · ${U.escapeHtml((version.loaders || []).join(', '))} · ${U.formatDate(version.date_published)}</p>
        </div>
        <button type="button" class="pm-btn-primary text-xs shrink-0" data-action="install" data-project-id="${U.escapeAttr(projectId)}" data-version-id="${U.escapeAttr(version.id)}" data-force="${!compat}">Install</button>
      </div>`;
  }

  const InstallModal = {
    async open(projectId) {
      const modal = document.getElementById('pmInstallModal');
      const title = document.getElementById('pmInstallTitle');
      const author = document.getElementById('pmInstallAuthor');
      const icon = document.getElementById('pmInstallIcon');
      const serverInfo = document.getElementById('pmInstallServerInfo');
      const recommended = document.getElementById('pmInstallRecommended');
      const allVersions = document.getElementById('pmInstallAllVersions');
      if (!modal) return;

      console.log(`[PM-INSTALL] === Opening install modal ===`);
      console.log(`[PM-INSTALL] projectId=${projectId}`);
      console.log(`[PM-INSTALL] cfg.loader=${cfg.loader}`);
      console.log(`[PM-INSTALL] cfg.minecraftVersion=${cfg.minecraftVersion}`);
      console.log(`[PM-INSTALL] normalizedMcVersion=${normalizedMcVersion}`);

      const response = await Api.get(`/project/${encodeURIComponent(projectId)}`);
      const { project, versions } = response.data;
      const authorName = window.PluginManager.Browser.authors.get(projectId) || 'Unknown';

      console.log(`[PM-INSTALL] Project: "${project.title}" type=${project.project_type}`);
      console.log(`[PM-INSTALL] Versions from API: ${versions.length} total`);

      const sorted = sortVersions(versions);
      const recommendedVersion = sorted.find(v => versionIsCompatible(v) && v.version_type === 'release');

      console.log(`[PM-INSTALL] Sorted: ${sorted.length} versions`);
      console.log(`[PM-INSTALL] Recommended: ${recommendedVersion ? recommendedVersion.version_number : 'NONE'}`);
      sorted.forEach(function (v) {
        console.log(`[PM-INSTALL]   version ${v.version_number} loaders=[${v.loaders.join(',')}] game=[${v.game_versions.join(',')}] type=${v.version_type} compat=${versionIsCompatible(v)}`);
      });

      if (title) title.textContent = project.title || '';
      if (author) author.textContent = `by ${U.escapeHtml(authorName)}`;

      if (icon) {
        if (project.icon_url) {
          icon.src = project.icon_url;
          icon.classList.remove('hidden');
        } else {
          icon.classList.add('hidden');
        }
      }

      if (serverInfo) {
        const chips = [];
        if (cfg.loader) chips.push(`<span class="pm-badge font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900">${U.escapeHtml(cfg.loader)}</span>`);
        if (cfg.minecraftVersion) chips.push(`<span class="pm-badge font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900">MC ${U.escapeHtml(cfg.minecraftVersion)}</span>`);
        chips.push(`<span class="pm-badge font-semibold ${cfg.daemonOnline ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}">Daemon: ${cfg.daemonOnline ? 'Online' : 'Offline'}</span>`);
        serverInfo.innerHTML = chips.join('');
      }

      if (recommended) {
        if (recommendedVersion) {
          recommended.innerHTML = `
            <div class="p-4 rounded-xl border-2 border-emerald-500/30 bg-emerald-500/[0.02]">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <span class="text-xs font-bold text-emerald-500 uppercase tracking-wider">Recommended — Latest Compatible Release</span>
                  <p class="text-sm font-bold mt-1 truncate">${U.escapeHtml(recommendedVersion.name || recommendedVersion.version_number)}</p>
                  <p class="text-xs text-neutral-500 mt-0.5 truncate">
                    ${U.escapeHtml((recommendedVersion.game_versions || []).slice(0, 3).join(', '))} ·
                    ${U.escapeHtml((recommendedVersion.loaders || []).join(', '))} ·
                    ${U.formatDate(recommendedVersion.date_published)} ·
                    ${U.formatNumber((recommendedVersion.downloads || 0))} downloads
                  </p>
                </div>
                <button type="button" class="pm-btn-primary text-sm px-5 py-2.5 shrink-0 font-bold" data-action="install" data-project-id="${U.escapeAttr(project.id)}" data-version-id="${U.escapeAttr(recommendedVersion.id)}" data-force="false">Install</button>
              </div>
            </div>`;
        } else {
          const compatExist = sorted.some(v => versionIsCompatible(v));
          const msg = compatExist
            ? 'Compatible versions exist but none are stable releases. Select a version below.'
            : 'No compatible version found for your server.';

          console.log(`[PM-INSTALL] Fallback message: "${msg}" compatExist=${compatExist} normalizedMcVersion=${normalizedMcVersion}`);

          if (cfg.minecraftVersion && cfg.loader) {
            recommended.innerHTML = `
              <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                <strong>${U.escapeHtml(msg)}</strong><br>
                Server: ${U.escapeHtml(cfg.loader)} ${U.escapeHtml(cfg.minecraftVersion)}
              </div>`;
          } else {
            recommended.innerHTML = `
              <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                ${U.escapeHtml(msg)}
              </div>`;
          }
        }
      }

      if (allVersions) {
        const other = sorted.filter(v => !recommendedVersion || v.id !== recommendedVersion.id);
        if (!other.length) {
          allVersions.innerHTML = '<p class="text-xs text-neutral-500 py-4 text-center">No other versions available.</p>';
        } else {
          allVersions.innerHTML = `
            <h4 class="text-sm font-bold mb-2">All Versions <span class="text-xs font-normal text-neutral-400">(${other.length} total)</span></h4>
            <div class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              ${other.map(v => renderVersionRow(v, project.id)).join('')}
            </div>`;
        }
      }

      modal.classList.remove('hidden');
      document.addEventListener('keydown', escapeHandler);
    },

    close,
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.InstallModal = InstallModal;
})();
