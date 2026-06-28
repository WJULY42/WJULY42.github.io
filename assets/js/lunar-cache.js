const LunarCache = {
    // 获取缓存 (maxAge 默认 1 小时)
    get: (key, maxAge = 3600000) => {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > maxAge) return null; // 过期
        return data;
    },
    // 设置缓存
    set: (key, data) => {
        localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
    },
    // 强制刷新
    clear: (key) => localStorage.removeItem(key),
    
    // 核心：SWR 请求封装
    fetchWithSWR: async (url, cacheKey) => {
        const cached = LunarCache.get(cacheKey);
        
        // 1. 如果有缓存，立即返回（实现秒开）
        if (cached) {
            // 后台静默更新
            fetch(url).then(res => res.json()).then(freshData => {
                LunarCache.set(cacheKey, freshData);
                // 触发全局事件，通知页面更新数据
                window.dispatchEvent(new CustomEvent('lunar-data-updated', { detail: { key: cacheKey, data: freshData } }));
            }).catch(e => console.warn('SWR background update failed', e));
            return cached; 
        }
        
        // 2. 无缓存，强制请求并阻塞渲染
        const res = await fetch(url);
        const data = await res.json();
        LunarCache.set(cacheKey, data);
        return data;
    }
};
