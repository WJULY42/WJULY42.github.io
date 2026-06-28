// assets/js/lunar-cache.js
const LunarCache = {
  // ============ 基础缓存操作 ============
  get(key, maxAge = 3600000) {
    const cached = localStorage.getItem(`lunar_${key}`);
    if (!cached) return null;
    try {
      const { data, timestamp, etag } = JSON.parse(cached);
      if (Date.now() - timestamp > maxAge) {
        // 过期但仍返回（用于 SWR 的 stale 阶段）
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
      staleTime = 0,          // 0 = 立即视为 stale，触发后台更新
      revalidateTime = 300000, // 5分钟内不重复验证
      forceRefresh = false
    } = options;

    const cached = this.get(cacheKey, staleTime);

    // 场景1：有缓存且未过期，直接返回（秒开）
    if (cached && !cached.stale && !forceRefresh) {
      return { data: cached.data, fromCache: true, fresh: true };
    }

    // 场景2：有缓存但已过期 → 立即返回缓存（秒开），后台静默更新
    if (cached && cached.stale) {
      this._backgroundRevalidate(url, cacheKey, cached.etag);
      return { data: cached.data, fromCache: true, fresh: false };
    }

    // 场景3：无缓存 → 阻塞请求
    try {
      const res = await fetch(url);
      this._updateRateLimit(res);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // 304 Not Modified：使用缓存
      if (res.status === 304 && cached) {
        this.set(cacheKey, cached.data, cached.etag);
        return { data: cached.data, fromCache: true, fresh: true };
      }

      const data = await res.json();
      const etag = res.headers.get('ETag');
      this.set(cacheKey, data, etag);
      return { data, fromCache: false, fresh: true };
    } catch (err) {
      // 网络失败时，降级返回过期缓存
      if (cached) {
        console.warn('[LunarCache] Network failed, using stale cache:', err.message);
        return { data: cached.data, fromCache: true, fresh: false, degraded: true };
      }
      throw err;
    }
  },

  // ============ 后台静默更新（不阻塞 UI） ============
  async _backgroundRevalidate(url, cacheKey, etag) {
    // 速率限制保护：接近限额时跳过
    if (this.isRateLimited()) {
      console.warn('[LunarCache] Rate limit approaching, skip revalidation');
      return;
    }

    try {
      const headers = {};
      if (etag) headers['If-None-Match'] = etag;

      const res = await fetch(url, { headers });
      this._updateRateLimit(res);

      // 304：数据未变，只刷新时间戳
      if (res.status === 304) {
        const cached = this.get(cacheKey, Infinity);
        if (cached) this.set(cacheKey, cached.data, etag);
        return;
      }

      if (!res.ok) return;

      const freshData = await res.json();
      const newEtag = res.headers.get('ETag');
      const oldCached = this.get(cacheKey, Infinity);

      // 比较数据是否真的变化了
      const changed = !oldCached ||
        JSON.stringify(oldCached.data) !== JSON.stringify(freshData);

      this.set(cacheKey, freshData, newEtag);

      if (changed) {
        // 触发全局事件，通知页面局部刷新
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
    // 速率限制降级：直接返回缓存
    if (this.isRateLimited()) {
      const cached = this.get(cacheKey, Infinity);
      if (cached) {
        console.warn('[LunarCache] Rate limited, serving from cache');
        return { data: cached.data, fromCache: true, degraded: true };
      }
    }
    return this.fetchWithSWR(apiUrl, cacheKey, options);
  }
};

// 暴露到全局
window.LunarCache = LunarCache;
