(function() {
  'use strict';

  var containers = document.querySelectorAll('.cynex-ad-container[data-cynex-ad-zone]');
  if (!containers.length) return;

  var debug = typeof window.__cynexAdDebug !== 'undefined';

  function log(msg, data) {
    if (!debug) return;
    console.log('[CynexAds] ' + msg, data || '');
  }

  function injectAdsterraWidget(container, format, zoneId) {
    if (!zoneId) {
      log('Skipping ' + format + ': no zone ID');
      return;
    }

    log('Injecting ' + format + ' ad, zone=' + zoneId);

    // Popunder and Social Bar use the adsterra widget approach
    if (format === 'popunder' || format === 'socialbar') {
      var w = window.adsterra_w = window.adsterra_w || {};
      w['zone_' + zoneId] = { id: zoneId };
      var s = document.createElement('script');
      s.type = 'text/javascript';
      s.src = '//www.adsterracdn.com/script.js';
      s.async = true;
      container.appendChild(s);
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
    container.appendChild(s);
  }

  containers.forEach(function(container) {
    var format = container.getAttribute('data-cynex-ad-format');
    var zoneId = container.getAttribute('data-cynex-ad-zone');
    injectAdsterraWidget(container, format, zoneId);
  });
})();
