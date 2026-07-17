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
    s.onload  = processAdQueue;
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
    var smartlink = e.target.closest('.cynex-ad-smartlink');
    if (smartlink) {
      log('Smartlink clicked');
      triggerPopunder();
    }
  });

  if (debug) {
    console.log('[CynexAds] Ready. Call __cynexReloadAds() to re-scan. Use ?cynex_ad_debug=1 for debug.');
  }
})();
