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

  Utils.mcVersionMatch = function (serverVersion, gameVersion) {
    if (!serverVersion || !gameVersion) return false;
    var sv = String(serverVersion).toLowerCase().trim();
    var gv = String(gameVersion).toLowerCase().trim();
    if (sv === 'latest' || sv === 'stable' || sv === 'nightly' || sv === 'rolling') return true;
    sv = sv.replace(/^mc\.?/i, '').replace(/^paper[\s_-]*/i, '').replace(/^spigot[\s_-]*/i, '').replace(/^bukkit[\s_-]*/i, '').trim();
    gv = gv.replace(/\.x$/i, '').replace(/\+$/, '');
    var parseMc = function (v) {
      var parts = v.split('.').map(Number);
      return { major: parts[0] || 0, minor: parts[1] ?? 0, patch: parts[2] };
    };
    var parsedSv = parseMc(sv);
    var parsedGv = parseMc(gv);
    if (isNaN(parsedSv.major) || isNaN(parsedGv.major)) return false;
    if (parsedSv.major !== parsedGv.major) return false;
    if (parsedSv.minor !== parsedGv.minor) return false;
    if (parsedGv.patch === undefined) return true;
    return (parsedSv.patch ?? 0) >= parsedGv.patch;
  };

  Utils.serverVersionMatch = function (serverVersion, gameVersions) {
    if (!serverVersion || !gameVersions || !gameVersions.length) return false;
    return gameVersions.some(function (gv) { return Utils.mcVersionMatch(serverVersion, gv); });
  };

  Utils.normalizeVersion = function (version) {
    if (!version) return null;
    var v = String(version).toLowerCase().trim();
    if (v === 'latest' || v === 'stable' || v === 'nightly' || v === 'rolling') return null;
    return v.replace(/^mc\.?/i, '').replace(/^paper[\s_-]*/i, '').replace(/^spigot[\s_-]*/i, '').replace(/^bukkit[\s_-]*/i, '').trim();
  };

  Utils.debounce = function (fn, delay) {
    var timer = null;
    return function () {
      var context = this;
      var args = arguments;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, delay || 300);
    };
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Utils = Utils;
})();
