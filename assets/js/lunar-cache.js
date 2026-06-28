// assets/js/lunar-cache.js
const LunarCache = {
  // ============ 基础缓存操作 ============
  get(key, maxAge = 3600000) {
    const cached = localStorage.getItem(`lunar_${key}`);
    if (!cached) return null;
    try {
      const { data, timestamp, etag } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAge) {
        return { data, stale: true, etag };
      }
      return { data, stale: false, etag };
    } catch { return null; }
  },

  set(key, data, etag = null) {
    localStorage.setItem(`lunar_${key}`, JSON.stringify({
      data,
      timestamp: Date.now(),
      etag
    }));
  },

  clear(key) {
    localStorage.removeItem(`lunar_${key}`);
  },

  // ============ 速率限制监控 ============
  _rateLimit: { remaining: Infinity, reset: 0 },

  _updateRateLimit(res) {
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const reset = res.headers.get('X-RateLimit-Reset');
    if (remaining !== null) {
      this._rateLimit.remaining = parseInt(remaining);
      this._rateLimit.reset = parseInt(reset) * 1000;
    }
  },

  isRateLimited() {
    return this._rateLimit.remaining < 5;
  },

  getRateLimitInfo() {
    return { ...this._rateLimit };
  },

  // ============ 核心：SWR 请求封装 ============
  async fetchWithSWR(url, cacheKey, options = {}) {
    const {
      staleTime = 0,
      revalidateTime = 300000,
      forceRefresh = false
    } = options;

    const cached = this.get(cacheKey, staleTime);

    if (cached && !cached.stale && !forceRefresh) {
      return { data: cached.data, fromCache: true, fresh: true };
    }

    if (cached && cached.stale) {
      this._backgroundRevalidate(url, cacheKey, cached.etag);
      return { data: cached.data, fromCache: true, fresh: false };
    }

    try {
      const res = await fetch(url);
      this._updateRateLimit(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (res.status === 304 && cached) {
        this.set(cacheKey, cached.data, cached.etag);
        return { data: cached.data, fromCache: true, fresh: true };
      }

      const data = await res.json();
      const etag = res.headers.get('ETag');
      this.set(cacheKey, data, etag);
      return { data, fromCache: false, fresh: true };
    } catch (err) {
      if (cached) {
        console.warn('[LunarCache] Network failed, using stale cache:', err.message);
        return { data: cached.data, fromCache: true, fresh: false, degraded: true };
      }
      throw err;
    }
  },

  // ============ 后台静默更新 ============
  async _backgroundRevalidate(url, cacheKey, etag) {
    if (this.isRateLimited()) {
      console.warn('[LunarCache] Rate limit approaching, skip revalidation');
      return;
    }

    try {
      const headers = {};
      if (etag) headers['If-None-Match'] = etag;

      const res = await fetch(url, { headers });
      this._updateRateLimit(res);

      if (res.status === 304) {
        const cached = this.get(cacheKey, Infinity);
        if (cached) this.set(cacheKey, cached.data, etag);
        return;
      }

      if (!res.ok) return;

      const freshData = await res.json();
      const newEtag = res.headers.get('ETag');
      const oldCached = this.get(cacheKey, Infinity);

      const changed = !oldCached ||
        JSON.stringify(oldCached.data) !== JSON.stringify(freshData);

      this.set(cacheKey, freshData, newEtag);

      if (changed) {
        window.dispatchEvent(new CustomEvent('lunar-data-updated', {
          detail: { key: cacheKey, data: freshData }
        }));
      }
    } catch (err) {
      console.warn('[LunarCache] Background revalidation failed:', err);
    }
  },

  // ============ GitHub API 专用封装 ============
  async fetchGitHub(apiUrl, cacheKey, options = {}) {
    if (this.isRateLimited()) {
      const cached = this.get(cacheKey, Infinity);
      if (cached) {
        console.warn('[LunarCache] Rate limited, serving from cache');
        return { data: cached.data, fromCache: true, degraded: true };
      }
    }
    return this.fetchWithSWR(apiUrl, cacheKey, options);
  },

  // ============ 安全 GitHub 请求（用于写操作） ============
  async safeGitHubRequest(url, options = {}) {
    if (this.isRateLimited()) {
      const info = this.getRateLimitInfo();
      const resetMin = Math.ceil((info.reset - Date.now()) / 60000);
      throw new Error(`GitHub API 配额已用尽，请 ${resetMin} 分钟后重试`);
    }

    const res = await fetch(url, options);
    this._updateRateLimit(res);

    if (res.status === 403 && res.headers.get('X-RateLimit-Remaining') === '0') {
      const reset = parseInt(res.headers.get('X-RateLimit-Reset')) * 1000;
      const resetMin = Math.ceil((reset - Date.now()) / 60000);
      throw new Error(`触发 GitHub 速率限制，${resetMin} 分钟后自动恢复`);
    }

    return res;
  }
};

window.LunarCache = LunarCache;
