(function () {
  const cfg = window.PLUGIN_MANAGER;
  if (!cfg) return;

  const inFlight = new Map();

  function buildUrl(path) {
    return `${cfg.apiBase}${path}`;
  }

  function getHeaders(options) {
    const headers = {
      Accept: 'application/json',
    };
    if (options && options.body instanceof FormData) {
      // Let browser set Content-Type with boundary
    } else {
      headers['Content-Type'] = 'application/json';
    }
    if (cfg.csrfToken) headers['x-csrf-token'] = cfg.csrfToken;
    return headers;
  }

  function dedupKey(method, path, body) {
    return `${method}:${path}:${body || ''}`;
  }

  async function request(method, path, options) {
    const url = buildUrl(path);
    console.log(`[API] request ${method} ${url}`, options ? { body: options.body } : '');

    if (options && options.signal) {
      return doFetch(method, url, options);
    }

    const key = dedupKey(method, path, options ? options.body : null);
    if (inFlight.has(key)) {
      console.log(`[API] dedup hit for ${key}`);
      return inFlight.get(key);
    }

    const promise = doFetch(method, url, options).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  async function doFetch(method, url, options) {
    const signal = options ? options.signal : undefined;
    const controller = signal ? null : new AbortController();

    const fetchOptions = {
      method,
      credentials: 'same-origin',
      headers: getHeaders(options),
      signal: signal || (controller ? controller.signal : undefined),
    };

    if (options && options.body) {
      fetchOptions.body = options.body;
    }

    if (controller) {
      setTimeout(() => controller.abort(), 30000);
    }

    console.log(`[API] fetch ${method} ${url}`, { headers: fetchOptions.headers, body: options ? options.body : undefined });
    try {
      const response = await fetch(url, fetchOptions);
      console.log(`[API] response ${method} ${url} status=${response.status}`);
      const data = await response.json().catch(() => ({}));
      console.log(`[API] response data:`, data);
      if (!response.ok) {
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      return data;
    } catch (error) {
      console.log(`[API] fetch error ${method} ${url}: ${error.message}`);
      throw error;
    }
  }

  const Api = {
    get(path, options) {
      return request('GET', path, options);
    },
    post(path, body, options) {
      const opts = { ...options };
      if (body && typeof body === 'object' && !(body instanceof FormData)) {
        opts.body = JSON.stringify(body);
      } else if (body) {
        opts.body = body;
      }
      return request('POST', path, opts);
    },
    delete(path, options) {
      return request('DELETE', path, options);
    },
    cancelAll() {
      inFlight.clear();
    },
  };

  window.PluginManager = window.PluginManager || {};
  window.PluginManager.Api = Api;
})();
