(function () {
  const cfg = window.PLUGIN_MANAGER;
  const U = window.PluginManager && window.PluginManager.Utils;
  if (!cfg || !U) return;

  const Card = {};

  Card.renderBrowse = function (hit, installedPlugin) {
    let installText = 'Install';
    let installClass = 'pm-btn-primary text-xs flex-1 py-2 px-3 text-center rounded-lg font-semibold';
    let disabled = false;

    if (installedPlugin) {
      if (installedPlugin.updateAvailable) {
        installText = 'Update';
        installClass = 'pm-btn-primary text-xs flex-1 py-2 px-3 text-center rounded-lg font-semibold bg-amber-500 hover:bg-amber-600 text-white';
      } else {
        installText = 'Installed';
        installClass = 'pm-btn-secondary text-xs flex-1 py-2 px-3 text-center rounded-lg cursor-default opacity-60';
        disabled = true;
      }
    }

    const mcVersions = hit.versions || [];
    const tags = mcVersions.slice(0, 3).join(', ') + (mcVersions.length > 3 ? '...' : '');

    const card = document.createElement('div');
    card.className = 'pm-card flex flex-col justify-between border border-neutral-200 dark:border-white/5 hover:border-neutral-300 dark:hover:border-white/10 transition p-5 h-full';
    card.dataset.projectId = hit.project_id;

    card.innerHTML = `
      <div class="flex items-start gap-4 flex-1">
        ${hit.icon_url
          ? `<img src="${U.escapeAttr(hit.icon_url)}" alt="" loading="lazy" class="size-12 rounded-xl object-cover shrink-0 border border-neutral-200 dark:border-white/5">`
          : '<div class="size-12 rounded-xl bg-neutral-200 dark:bg-neutral-800 shrink-0 border border-neutral-200 dark:border-white/5"></div>'}
        <div class="min-w-0 flex-1">
          <h3 class="font-bold text-sm truncate">${U.escapeHtml(hit.title)}</h3>
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">by <span class="font-medium text-neutral-600 dark:text-neutral-300">${U.escapeHtml(hit.author || 'Unknown')}</span></p>
          <div class="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-[10px] text-neutral-500">
            <span class="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-full">${U.formatNumber(hit.downloads)} downloads</span>
            ${tags ? `<span class="bg-neutral-100 dark:bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[150px]">${U.escapeHtml(tags)}</span>` : ''}
          </div>
        </div>
      </div>
      <p class="text-xs text-neutral-600 dark:text-neutral-400 mt-4 line-clamp-2 leading-relaxed flex-1">${U.escapeHtml(hit.description || '')}</p>
      <div class="flex gap-2 mt-5 pt-3 border-t border-neutral-100 dark:border-white/5 shrink-0">
        <button type="button" class="pm-btn-secondary text-xs flex-1 py-2 px-3 text-center rounded-lg" data-action="details" data-project-id="${U.escapeAttr(hit.project_id)}">Details</button>
        <button type="button" class="${installClass}" data-action="open-install" data-project-id="${U.escapeAttr(hit.project_id)}" ${disabled ? 'disabled' : ''}>${installText}</button>
      </div>
    `;

    return card;
  };

  Card.renderInstalled = function (plugin) {
    const card = document.createElement('div');
    card.className = 'pm-card';
    card.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h3 class="font-medium truncate">${U.escapeHtml(plugin.projectName || plugin.filename)}</h3>
            ${plugin.enabled ? '<span class="pm-badge bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Enabled</span>' : '<span class="pm-badge bg-neutral-500/10 text-neutral-500 border border-neutral-500/20">Disabled</span>'}
            ${plugin.updateAvailable ? '<span class="pm-badge bg-amber-500/10 text-amber-500 border border-amber-500/20">Update Available</span>' : ''}
          </div>
          <p class="text-xs text-neutral-500 mt-1 truncate">${U.escapeHtml(plugin.filename)}</p>
          <p class="text-xs text-neutral-500 mt-1">${U.escapeHtml(plugin.versionNumber || 'Unknown')} · ${U.formatBytes(plugin.size)}${plugin.author ? ` · ${U.escapeHtml(plugin.author)}` : ''}</p>
        </div>
        <div class="flex flex-col gap-2 shrink-0">
          ${plugin.projectId ? `<button type="button" class="pm-btn-secondary text-xs" data-action="details" data-project-id="${U.escapeAttr(plugin.projectId)}">Details</button>` : ''}
          ${plugin.updateAvailable && plugin.latestVersionId ? `<button type="button" class="pm-btn-primary text-xs bg-amber-500 hover:bg-amber-600 text-white" data-action="update" data-project-id="${U.escapeAttr(plugin.projectId)}" data-version-id="${U.escapeAttr(plugin.latestVersionId)}">Update</button>` : ''}
          <button type="button" class="pm-btn-secondary text-xs" data-action="toggle" data-filename="${U.escapeAttr(plugin.filename)}" data-enabled="${plugin.enabled ? '0' : '1'}">${plugin.enabled ? 'Disable' : 'Enable'}</button>
          <button type="button" class="pm-btn-danger text-xs" data-action="delete" data-filename="${U.escapeAttr(plugin.filename)}">Delete</button>
        </div>
      </div>
    `;
    return card;
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Card = Card;
})();
