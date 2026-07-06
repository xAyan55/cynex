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

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Utils = Utils;
})();
