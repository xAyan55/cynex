(function() {
  'use strict';

  var debug = window.location.search.indexOf('cynex_ad_debug=1') !== -1;
  if (debug) console.log('[CynexAds] Debug mode enabled');

  function log(msg, data) {
    if (!debug) return;
    console.log('[CynexAds] ' + msg, data || '');
  }

  function injectAds() {
    var containers = document.querySelectorAll('.cynex-ad-container[data-cynex-ad-zone]');
    log('Found ' + containers.length + ' ad containers');
    if (!containers.length) {
      log('No ad containers found on this page');
      return;
    }

    containers.forEach(function(container) {
      var format = container.getAttribute('data-cynex-ad-format');
      var zoneId = container.getAttribute('data-cynex-ad-zone');
      var placement = container.getAttribute('data-cynex-ad-placement');

      if (!zoneId) {
        log('Skipping ' + placement + ': no zone ID');
        return;
      }

      log('Injecting ' + format + ' ad at ' + placement + ', zone=' + zoneId);

      // Popunder and Social Bar use the adsterra widget approach
      if (format === 'popunder' || format === 'socialbar') {
        var w = window.adsterra_w = window.adsterra_w || {};
        w['zone_' + zoneId] = { id: zoneId };
        var s = document.createElement('script');
        s.type = 'text/javascript';
        s.src = '//www.adsterracdn.com/script.js';
        s.async = true;
        s.setAttribute('data-cynex-ad', '1');
        container.appendChild(s);
        log('Appended adsterra widget script for ' + format);
        return;
      }

      // Smartlink - just render a link
      if (format === 'smartlink') {
        var a = document.createElement('a');
        a.href = '//www.highperformanceformat.com/' + zoneId + '/invoke';
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'ad-smartlink block w-full text-center text-sm text-neutral-500 hover:text-neutral-300 transition py-4';
        a.textContent = 'Sponsored Link';
        container.appendChild(a);
        log('Rendered smartlink for zone ' + zoneId);
        return;
      }

      // All banner formats use the highperformanceformat invoke approach
      var dims = { w: 728, h: 90 };
      switch (format) {
        case '468x60':  dims = { w: 468, h: 60 }; break;
        case '300x250': dims = { w: 300, h: 250 }; break;
        case '160x300': dims = { w: 160, h: 300 }; break;
        case '160x600': dims = { w: 160, h: 600 }; break;
        case '320x50':  dims = { w: 320, h: 50 }; break;
        case '728x90':  dims = { w: 728, h: 90 }; break;
        case 'native':  dims = { w: 300, h: 250 }; break;
        case 'banner':  dims = { w: 728, h: 90 }; break;
      }

      window.atOptions = window.atOptions || {};
      window.atOptions = {
        key: zoneId,
        format: 'iframe',
        height: dims.h,
        width: dims.w,
        params: {}
      };

      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = '//www.highperformanceformat.com/' + zoneId + '/invoke.js';
      s.async = true;
      s.setAttribute('data-cynex-ad', '1');
      container.appendChild(s);
      log('Appended highperformanceformat script for ' + format + ' (' + dims.w + 'x' + dims.h + ')');
    });
  }

  // Run on initial load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAds);
  } else {
    injectAds();
  }

  // Re-run on SPA navigation
  document.addEventListener('al:navigated', function() {
    log('SPA navigation detected, re-injecting ads');
    injectAds();
  });

  // Expose for manual debugging
  window.__cynexReloadAds = injectAds;
  if (debug) {
    console.log('[CynexAds] Ready. Call __cynexReloadAds() to re-inject. Add ?cynex_ad_debug=1 to URL for debug.');
  }
})();
