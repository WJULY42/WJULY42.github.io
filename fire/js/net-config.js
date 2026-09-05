'use strict';
// ============================================================
// 联机信令配置 (signal-config)
// ------------------------------------------------------------
// 两种玩法, 由"打开方式"自动判断, 一般不用改本文件:
//
// ① 公共云(默认, 零服务器, 可部署 GitHub Pages):
//    直接访问网页 → 自动用 PeerJS 公共信令云 + 6 位房间码。
//    主机点「联机 → P2P → 创建房间」, 把 6 位房间码告诉同学;
//    同学点「联机 → P2P → 加入房间」输码即可。无需任何服务器/双击程序。
//    ⚠️ 依赖 PeerJS 官方公共云(0.peerjs.com), 国内网络偶尔不稳。
//
// ② 自建局域网(机房/无外网时更稳):
//    主机双击 signal/start-server.bat → 服务器会把本机地址注入页面,
//    自动切到"区域网自建"模式; 同学打开主机发的内网网址即可, 全程不连外网。
// ============================================================
window.NET_CONFIG = (function () {
  const autoHost = (typeof window !== 'undefined' && window.__AUTO_HOST) ? window.__AUTO_HOST : '';
  const autoPort = (typeof window !== 'undefined' && window.__AUTO_PORT) ? window.__AUTO_PORT : 9000;
  return {
    // 'cloud' = 公共信令云(零服务器); 'lan' = 自建局域网信令。
    // 留 autoHost 非空时自动为 'lan'。手动固定可改这里。
    mode: autoHost ? 'lan' : 'cloud',
    host: autoHost,        // lan 模式自动填; cloud 模式留空
    port: autoPort,
    path: '/myapp',
    secure: false,         // 自建局域网 http 填 false(公共云由 PeerJS 默认接管)
    lanDiscovery: !!autoHost // 仅自建局域网模式(autoHost 非空)时开; 公共云模式用房间码, 无需发现
  };
})();
