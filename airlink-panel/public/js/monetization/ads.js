(function() {
  'use strict';

  var debug = window.location.search.indexOf('cynex_ad_debug=1') !== -1;
  if (debug) console.log('[CynexAds] Debug mode enabled');

  function log(msg) {
    if (!debug) return;
    console.log('[CynexAds] ' + msg);
  }

  var injectedScripts = {};

  function removeContainer(container) {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      log('Removed failed ad container');
    }
  }

  function injectAd(container) {
    if (!container) return;
    var format = container.getAttribute('data-cynex-format');
    var zoneId = container.getAttribute('data-cynex-zone');
    var placement = container.getAttribute('data-cynex-placement');

    if (!zoneId || zoneId.trim() === '') {
      log('Skipping ' + placement + ': no zone ID');
      removeContainer(container);
      return;
    }

    log('Injecting ' + format + ' at ' + placement + ' zone=' + zoneId);

    if (format === 'smartlink') {
      var wrapper = document.createElement('div');
      wrapper.className = 'cynex-ad-inline';
      var a = document.createElement('a');
      a.href = 'https://www.highperformanceformat.com/' + encodeURIComponent(zoneId) + '/invoke';
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-sm font-medium transition border border-neutral-700/50';
      a.textContent = 'Sponsored';
      wrapper.appendChild(a);
      container.appendChild(wrapper);
      return;
    }

    var scriptSrc = null;
    var adsterraWidget = false;

    if (format === 'popunder' || format === 'socialbar') {
      adsterraWidget = true;
      scriptSrc = 'https://www.adsterracdn.com/script.js';
    } else {
      scriptSrc = 'https://www.highperformanceformat.com/' + encodeURIComponent(zoneId) + '/invoke.js';
    }

    if (injectedScripts[scriptSrc]) {
      log('Script already loaded: ' + scriptSrc);
      return;
    }

    try {
      if (adsterraWidget) {
        var w = window.adsterra_w = window.adsterra_w || {};
        w['zone_' + zoneId] = { id: zoneId };
      } else {
        var dims = { w: 728, h: 90 };
        var attrW = container.getAttribute('data-cynex-width');
        var attrH = container.getAttribute('data-cynex-height');
        if (attrW) dims.w = parseInt(attrW, 10);
        if (attrH) dims.h = parseInt(attrH, 10);
        window.atOptions = window.atOptions || {};
        window.atOptions = {
          key: zoneId,
          format: 'iframe',
          height: dims.h,
          width: dims.w,
          params: {}
        };
      }

      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = scriptSrc;
      s.async = true;
      s.setAttribute('data-cynex-ad-placement', placement);
      s.onerror = function() {
        log('Script load error for ' + placement + ' at ' + scriptSrc);
        removeContainer(container);
      };

      injectedScripts[scriptSrc] = true;
      container.appendChild(s);
      log('Script appended for ' + placement);

      var cleanupTimer = setTimeout(function() {
        var hasContent = container.querySelector('iframe, a, img, object, embed');
        if (!hasContent && container.childNodes.length <= 1) {
          log('No ad content detected after timeout, cleaning up ' + placement);
          removeContainer(container);
        }
      }, 8000);

      s.onload = function() {
        clearTimeout(cleanupTimer);
        log('Script loaded for ' + placement);
      };
    } catch (err) {
      log('Error injecting ad: ' + (err.message || err));
      removeContainer(container);
    }
  }

  function injectAllAds() {
    var wrappers = document.querySelectorAll('.cynex-ad-wrapper[data-cynex-zone]');
    log('Found ' + wrappers.length + ' ad wrappers');
    wrappers.forEach(function(w) {
      if (w.getAttribute('data-cynex-injected') === '1') return;
      w.setAttribute('data-cynex-injected', '1');
      injectAd(w);
    });
  }

  function run() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectAllAds);
    } else {
      injectAllAds();
    }
  }

  run();

  document.addEventListener('al:navigated', function() {
    log('SPA navigation - re-injecting');
    run();
  });

  window.__cynexReloadAds = injectAllAds;
  if (debug) {
    console.log('[CynexAds] Ready. Call __cynexReloadAds() to re-inject. Use ?cynex_ad_debug=1 for debug.');
  }
})();
