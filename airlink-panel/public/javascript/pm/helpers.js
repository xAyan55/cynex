(function () {
  const Utils = {};

  Utils.escapeHtml = function (value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  Utils.escapeAttr = function (value) {
    return Utils.escapeHtml(value).replace(/'/g, '&#39;');
  };

  Utils.formatBytes = function (bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes);
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  };

  Utils.formatDate = function (dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  Utils.formatNumber = function (n) {
    return Number(n || 0).toLocaleString();
  };

  Utils.pluralize = function (count, singular, plural) {
    return count === 1 ? singular : plural || singular + 's';
  };

  Utils.BUKKIT_LOADERS = new Set(['paper', 'purpur', 'spigot', 'bukkit', 'folia']);
  Utils.MOD_LOADERS = new Set(['fabric', 'forge', 'neoforge', 'quilt']);

  Utils.getCompatibleLoaders = function (serverLoader) {
    if (!serverLoader) return [];
    var lower = serverLoader.toLowerCase();
    if (Utils.BUKKIT_LOADERS.has(lower)) return Array.from(Utils.BUKKIT_LOADERS);
    if (Utils.MOD_LOADERS.has(lower)) return [lower];
    return [lower];
  };

  Utils.loaderIsCompatible = function (serverLoader, versionLoaders) {
    if (!serverLoader || !versionLoaders || !versionLoaders.length) return false;
    var compatible = Utils.getCompatibleLoaders(serverLoader);
    return versionLoaders.some(function (l) { return compatible.indexOf(l.toLowerCase()) !== -1; });
  };

  Utils.mcVersionMatch = function (serverVersion, gameVersion) {
    if (!serverVersion || !gameVersion) return false;
    gameVersion = gameVersion.replace(/\.x$/i, '');
    var parseMc = function (v) {
      var parts = v.split('.').map(Number);
      return { major: parts[0] || 0, minor: parts[1] ?? 0, patch: parts[2] };
    };
    var sv = parseMc(serverVersion);
    var gv = parseMc(gameVersion);
    if (sv.major !== gv.major) return false;
    if (sv.minor !== gv.minor) return false;
    if (gv.patch === undefined) return true;
    return (sv.patch ?? 0) >= gv.patch;
  };

  Utils.serverVersionMatch = function (serverVersion, gameVersions) {
    if (!serverVersion || !gameVersions || !gameVersions.length) return false;
    return gameVersions.some(function (gv) { return Utils.mcVersionMatch(serverVersion, gv); });
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Utils = Utils;
})();
