(function () {
  const cfg = window.PLUGIN_MANAGER;
  const Api = window.PluginManager && window.PluginManager.Api;
  const Card = window.PluginManager && window.PluginManager.Card;
  if (!cfg || !Api || !Card) return;

  const installedPluginsMap = new Map();
  const projectAuthors = new Map();

  let currentAbort = null;

  function abortPrevious() {
    if (currentAbort) {
      currentAbort.abort();
    }
    currentAbort = new AbortController();
  }

  const Browser = {
    installedMap: installedPluginsMap,
    authors: projectAuthors,

    async loadInstalled(query) {
      abortPrevious();
      const signal = currentAbort.signal;
      const list = document.getElementById('pmInstalledList');
      const loading = document.getElementById('pmInstalledLoading');
      const empty = document.getElementById('pmInstalledEmpty');
      const count = document.getElementById('pmInstalledCount');
      if (!list) return;

      if (loading) loading.style.display = 'grid';
      if (empty) empty.classList.add('hidden');
      list.innerHTML = '';

      try {
        const params = query ? `?q=${encodeURIComponent(query)}` : '';
        const response = await Api.get(`/installed${params}`, { signal });
        const plugins = response.data || [];

        installedPluginsMap.clear();
        plugins.forEach((p) => {
          if (p.projectId) installedPluginsMap.set(p.projectId, p);
        });

        if (empty) empty.classList.toggle('hidden', plugins.length > 0);
        if (count) count.textContent = `${plugins.length} ${plugins.length === 1 ? 'plugin' : 'plugins'}`;
        plugins.forEach((p) => list.appendChild(Card.renderInstalled(p)));
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (empty) { empty.classList.remove('hidden'); empty.textContent = 'Failed to load installed plugins.'; }
      } finally {
        if (loading) loading.style.display = 'none';
      }
    },

    async loadBrowse(append) {
      abortPrevious();
      const signal = currentAbort.signal;
      const state = Browser.state;
      const results = document.getElementById('pmBrowseResults');
      const loading = document.getElementById('pmBrowseLoading');
      const empty = document.getElementById('pmBrowseEmpty');
      const moreBtn = document.getElementById('pmBrowseMoreBtn');
      if (!results) return;

      if (loading) loading.style.display = 'grid';
      if (empty) empty.classList.add('hidden');
      if (!append) results.innerHTML = '';

      try {
        const params = new URLSearchParams({
          q: state.query,
          page: String(state.page),
          sort: state.sort,
        });
        const response = await Api.get(`/search?${params.toString()}`, { signal });
        const result = response.data || { hits: [], total_hits: 0 };
        state.total = result.total_hits || 0;

        const hits = result.hits || [];
        hits.forEach((hit) => {
          if (hit.author && hit.project_id) {
            projectAuthors.set(hit.project_id, hit.author);
          }
        });

        if (empty) empty.classList.toggle('hidden', hits.length > 0 || append);
        hits.forEach((hit) => {
          const installed = installedPluginsMap.get(hit.project_id);
          results.appendChild(Card.renderBrowse(hit, installed));
        });

        if (moreBtn) {
          const loaded = results.children.length;
          moreBtn.classList.toggle('hidden', loaded >= state.total);
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        if (empty) { empty.classList.remove('hidden'); empty.textContent = 'Search failed. Try again.'; }
      } finally {
        if (loading) loading.style.display = 'none';
      }
    },

    state: {
      page: 1,
      query: '',
      sort: 'relevance',
      total: 0,
    },

    setQuery(q) {
      Browser.state.query = q;
    },

    setSort(s) {
      Browser.state.sort = s;
    },

    resetPage() {
      Browser.state.page = 1;
    },

    nextPage() {
      Browser.state.page += 1;
    },

    clearAuthors() {
      projectAuthors.clear();
    },
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Browser = Browser;
})();
