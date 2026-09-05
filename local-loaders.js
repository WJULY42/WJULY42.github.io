// Shared data loaders for the lunarHope site.
//
// Pair with local-data.js:
//     <script src="local-loaders.js"></script>   <- load this on any page that calls a loader
//     <script src="local-data.js"></script>      <- only on pages that read the embedded store
//
// local-data.js is a single global (window.__localStore, data/*.json only) generated
// by generate_local_data.py. It is deliberately kept separate so that pages which only
// need loadLocalText (blog/read.html) never have to download the ~23 KB index.
//
// loadLocalData looks window.__localStore up at call time, so if the store script is
// missing the call simply falls through to fetch(). Order between the two scripts is
// therefore not critical.

function __normalizeLocalKey(key) {
    if (!key) return key;
    while (key.indexOf('../') === 0) key = key.substring(3);
    while (key.indexOf('./') === 0) key = key.substring(2);
    const qIndex = key.indexOf('?');
    if (qIndex !== -1) key = key.substring(0, qIndex);
    return key;
}

// JSON: served from the embedded store under file:, fetched otherwise.
window.loadLocalData = function(key, url) {
    const normalized = __normalizeLocalKey(key);
    return new Promise(function(resolve, reject) {
        if (window.location.protocol === 'file:' && window.__localStore && normalized in window.__localStore) {
            resolve(window.__localStore[normalized]);
        } else {
            fetch(url).then(function(r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            }).then(resolve).catch(reject);
        }
    });
};

// Plain text: post bodies are never embedded, so this is always a fetch.
// `key` is kept for symmetry with loadLocalData.
window.loadLocalText = function(key, url) {
    return new Promise(function(resolve, reject) {
        fetch(url).then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        }).then(resolve).catch(reject);
    });
};
