(function() {
  'use strict';

  var debug = window.location.search.indexOf('cynex_ad_debug=1') !== -1;
  function log(msg) { if (debug) console.log('[CynexAds] ' + msg); }

  function removeContainer(container) {
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      log('Removed empty container');
    }
  }

  var socialInjected = false;
  var popunderReady = false;
  var popunderCooldown = false;

  /* ── Ad format dimensions for atOptions ────────────────── */
  var AD_DIMENSIONS = {
    native:   { w: 300, h: 300 },
    banner:   { w: 728, h: 90 },
    '728x90': { w: 728, h: 90 },
    '300x250': { w: 300, h: 250 },
    '468x60': { w: 468, h: 60 },
    '160x300': { w: 160, h: 300 },
    '160x600': { w: 160, h: 600 },
    '320x50': { w: 320, h: 50 },
  };

  /* ── Ad queue (all atOptions-based formats) ────────────── */
  /* Process one container at a time so window.atOptions is  */
  /* correct for each invoke.js (avoids overwrite bug).      */

  /**
   * After invoke.js creates an iframe inside the container,
   * watch for load errors and hide the container if the ad
   * was blocked (e.g. by Adsterra domain validation, CSP,
   * or ad-blocker).
   */
  function watchContainerForBlockedAd(container) {
    // Give invoke.js a moment to inject its iframe
    setTimeout(function() {
      var iframe = container.querySelector('iframe');
      if (!iframe) {
        // invoke.js didn't create an iframe — remove container
        log('No iframe created for ' + (container.getAttribute('data-cynex-placement') || '?'));
        removeContainer(container);
        return;
      }

      // Check if the iframe has zero dimensions (another blocked signal)
      function checkIframe() {
        try {
          var rect = iframe.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            log('Zero-size iframe detected, removing');
            removeContainer(container);
            return;
          }
        } catch (e) { /* cross-origin — expected */ }

        // Try to detect the Chrome "This content is blocked" page
        // by checking if the iframe body is essentially empty / error page
        try {
          var doc = iframe.contentDocument || iframe.contentWindow.document;
          if (doc && doc.body) {
            var text = doc.body.textContent || '';
            if (text.indexOf('content is blocked') !== -1 || text.indexOf('ERR_BLOCKED') !== -1) {
              log('Blocked content detected in iframe, removing');
              removeContainer(container);
            }
          }
        } catch (e) {
          // Cross-origin — can't inspect. That's fine — means it loaded from
          // Adsterra's domain which is normal successful behavior.
        }
      }

      // Check after the iframe has had time to load
      iframe.addEventListener('load', function() {
        setTimeout(checkIframe, 500);
      });

      // Also check on error
      iframe.addEventListener('error', function() {
        log('Iframe error event, removing');
        removeContainer(container);
      });

      // Fallback: check after a generous timeout in case load event already fired
      setTimeout(checkIframe, 3000);
    }, 1000);
  }

  function processAdQueue() {
    var container = document.querySelector(
      '[data-cynex-format]:not([data-cynex-done])' +
      ':not([data-cynex-format="socialbar"])' +
      ':not([data-cynex-format="popunder"])'
    );
    if (!container) return;

    container.setAttribute('data-cynex-done', '1');
    var zoneId = container.getAttribute('data-cynex-zone');
    if (!zoneId) { removeContainer(container); processAdQueue(); return; }

    var format = container.getAttribute('data-cynex-format');
    var dims = AD_DIMENSIONS[format] || AD_DIMENSIONS['728x90'];

    log('Injecting ' + format + ' at ' + (container.getAttribute('data-cynex-placement') || '?'));

    window.atOptions = {
      key: zoneId,
      format: 'iframe',
      height: dims.h,
      width: dims.w,
      params: {}
    };

    var s = document.createElement('script');
    s.src = 'https://www.highperformanceformat.com/' + encodeURIComponent(zoneId) + '/invoke.js';
    s.onload  = function() { watchContainerForBlockedAd(container); processAdQueue(); };
    s.onerror = function() { log('Script error for ' + format); removeContainer(container); processAdQueue(); };
    container.appendChild(s);
  }

  /* ── Social bar ────────────────────────────────────────── */
  function injectSocial() {
    if (socialInjected) return;

    var wrappers = document.querySelectorAll('[data-cynex-format="socialbar"]');
    if (wrappers.length === 0) return;

    log('Injecting social bar');
    socialInjected = true;

    var w = window.adsterra_w = window.adsterra_w || {};
    Array.prototype.forEach.call(wrappers, function(wrapper) {
      var zoneId = wrapper.getAttribute('data-cynex-zone');
      if (zoneId) w['zone_' + zoneId] = { id: zoneId };
    });

    var s = document.createElement('script');
    s.src = 'https://www.adsterracdn.com/script.js';
    s.async = true;
    s.onerror = function() { log('Social bar script error'); };
    document.body.appendChild(s);
  }

  /* ── Popunder ──────────────────────────────────────────── */
  function injectPopunder() {
    if (popunderCooldown) return;

    var wrappers = document.querySelectorAll('[data-cynex-format="popunder"]');
    if (wrappers.length === 0) return;

    log('Preparing popunder trigger');
    popunderReady = true;

    var w = window.adsterra_w = window.adsterra_w || {};
    Array.prototype.forEach.call(wrappers, function(wrapper) {
      var zoneId = wrapper.getAttribute('data-cynex-zone');
      if (zoneId) w['zone_' + zoneId] = { id: zoneId };
    });
  }

  function triggerPopunder() {
    if (!popunderReady || popunderCooldown) return;
    popunderCooldown = true;

    log('Triggering popunder');

    var s = document.createElement('script');
    s.src = 'https://www.adsterracdn.com/script.js';
    s.async = true;
    s.onerror = function() { log('Popunder script error'); };
    document.body.appendChild(s);

    var cooldownEl = document.querySelector('[data-cynex-placement="popunderCooldownSeconds"]');
    var seconds = cooldownEl ? parseInt(cooldownEl.textContent, 10) : 300;
    setTimeout(function() { popunderCooldown = false; }, seconds * 1000);
  }

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    log('Scanning for ad wrappers');
    injectSocial();
    injectPopunder();
    processAdQueue();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('al:navigated', function() {
    log('SPA navigation - re-scanning');
    init();
  });

  window.__cynexReloadAds       = init;
  window.__cynexTriggerPopunder = triggerPopunder;

  document.addEventListener('click', function(e) {
    triggerPopunder();
    var smartlink = e.target.closest('.cynex-ad-smartlink');
    if (smartlink) {
      log('Smartlink clicked');
    }
  });

  // Optional: auto-trigger on a timer if configured (some browsers may block this)
  setTimeout(function() {
    log('Auto-triggering popunder via timer');
    triggerPopunder();
  }, 10000); // 10 second timer

  if (debug) {
    console.log('[CynexAds] Ready. Call __cynexReloadAds() to re-scan. Use ?cynex_ad_debug=1 for debug.');
  }
})();
