'use strict';
// ============================================================
// 钢铁前线1944 · 一键联机服务器(极小信令页 + 游戏托管)
// ------------------------------------------------------------
// 这台电脑 = 主机。双击"开始联机.bat"即可，同学只用在浏览器打开
// 屏幕上显示的网址，点房间加入——不用装软件、不用改配置、不用记 IP。
//   局域网/WiFi 内可用，全程不走外网、不连任何公共云。
// ============================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const { ExpressPeerServer } = require('peerjs-server');

const PORT = parseInt(process.env.PORT || '9000', 10);
const PEER_PATH = '/myapp';
const GAME_DIR = path.join(__dirname, '..');   // 游戏根目录(fire/)
const STUN_PORT = PORT; // STUN 与 HTTP 同端口(不同协议: UDP vs TCP), 方便防火墙放行

// ---- 简易本地 STUN 服务器 ----
// 用于局域网 WebRTC 直连时暴露真实 LAN IP,
// 避免 Chrome 在非安全上下文中使用 mDNS 候选(`xxx.local`)导致连接失败。
function startStunServer() {
  const stun = dgram.createSocket('udp4');
  stun.on('message', (msg, rinfo) => {
    if (msg.length < 20) return;
    const type = msg.readUInt16BE(0);
    if (type !== 0x0001) return; // Binding Request
    // 构造 Binding Success Response (RFC 5389)
    const resp = Buffer.alloc(32);
    resp.writeUInt16BE(0x0101, 0);          // type: Binding Success Response
    resp.writeUInt16BE(12, 2);              // message length (attributes total)
    resp.writeUInt32BE(0x2112A442, 4);      // magic cookie
    msg.copy(resp, 8, 8, 20);               // 12-byte transaction id
    // XOR-MAPPED-ADDRESS attribute (type 0x0020, length 8, family IPv4)
    const addr = rinfo.address.split('.').map(Number);
    const xport = rinfo.port ^ 0x2112;       // XOR with top 16 bits of magic cookie
    const xaddr = Buffer.from([
      addr[0] ^ 0x21, addr[1] ^ 0x12, addr[2] ^ 0xA4, addr[3] ^ 0x42
    ]);
    resp.writeUInt16BE(0x0020, 20);          // attribute type
    resp.writeUInt16BE(8, 22);               // attribute length
    resp.writeUInt8(0, 24);                  // reserved
    resp.writeUInt8(0x01, 25);               // family: IPv4
    resp.writeUInt16BE(xport, 26);
    resp.writeUInt32BE(xaddr.readUInt32BE(0), 28);
    stun.send(resp, rinfo.port, rinfo.address);
  });
  stun.on('listening', () => {
    const addr = stun.address();
    console.log('  STUN 服务器:  udp://0.0.0.0:' + addr.port);
  });
  stun.on('error', (err) => {
    console.error('STUN 错误:', err.message);
  });
  try { stun.bind(STUN_PORT); } catch (e) { console.error('无法绑定 STUN 端口', e.message); }
}

startStunServer();

const app = express();
app.use(cors());
app.use(express.json());

// ---- 房间登记(区域网自动发现用) ----
const rooms = new Map(); // id -> { id, name, ts }

app.post('/announce', (req, res) => {
  const id = req.body && req.body.id;
  const name = req.body && req.body.name;
  if (!id) return res.status(400).json({ ok: false, error: 'missing id' });
  rooms.set(id, { id, name: name || id, ts: Date.now() });
  res.json({ ok: true });
});

app.post('/leave', (req, res) => {
  const id = req.body && req.body.id;
  if (id) rooms.delete(id);
  res.json({ ok: true });
});

app.get('/rooms', (req, res) => {
  const now = Date.now();
  const list = [];
  for (const [k, v] of rooms) {
    if (now - v.ts > 6000) rooms.delete(k); // 6 秒无心跳即过期
    else list.push({ id: v.id, name: v.name });
  }
  res.json(list);
});

// ---- 极小信令页(状态页, 备用查看) ----
app.get('/signal', (req, res) => {
  const html = [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
    '<title>联机状态</title><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<style>body{font-family:system-ui,\'Microsoft YaHei\',sans-serif;background:#11161c;color:#cfe;margin:0;padding:24px}h1{color:#8f8}code{background:#223;padding:2px 6px;border-radius:4px;color:#ffd479}#list{margin-top:16px}#list div{background:#1b232c;border:1px solid #2d3a45;padding:8px 12px;border-radius:6px;margin:6px 0}</style>',
    '</head><body>',
    '<h1>联机服务器 · 运行中</h1>',
    '<p>把游戏网址 <code>http://&lt;本机IP&gt;:' + PORT + '</code> 发给同学即可。同学打开后点「联机 → 区域网」会自动看到房间。</p>',
    '<p>本机可加入房间:</p>',
    '<div id="list">加载中...</div>',
    '<script>',
    'async function refresh(){',
    '  try{',
    '    var r=await fetch("/rooms"); var list=await r.json(); var el=document.getElementById("list");',
    '    if(!list.length){ el.innerHTML="<i>当前没有可加入的房间</i>"; return; }',
    '    var html=""; for(var i=0;i<list.length;i++){ var x=list[i]; var nm=(x.name||"").replace(/</g,""); html+="<div>房间码 <b style=\'color:#ffd479;font-family:monospace\'>"+x.id+"</b> · "+nm+"</div>"; }',
    '    el.innerHTML=html;',
    '  }catch(e){ document.getElementById("list").textContent="读取失败: "+e; }',
    '}',
    'refresh(); setInterval(refresh,3000);',
    '<\/script></body></html>'
  ].join('\n');
  res.type('html').send(html);
});

// ---- 游戏首页: 自动注入联机地址, 让同学打开即连 ----
app.get('/', (req, res) => {
  const indexPath = path.join(GAME_DIR, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) { res.status(500).send('游戏文件缺失'); return; }
    const host = req.hostname;                 // 同学打开时即为主机内网 IP
    // 主机用 localhost 打开时, 分享网址要换成局域网 IP, 同学才连得上
    let shareUrl;
    if (host === 'localhost' || host === '127.0.0.1') {
      const ip = lanIPv4();
      shareUrl = 'http://' + (ip || 'localhost') + ':' + PORT;
    } else {
      shareUrl = req.protocol + '://' + req.get('host');
    }
    // 注入: 自动填好信令 host, 并显示"把本页网址发给同学"的横幅
    const inject = '<script>window.__AUTO_HOST=' + JSON.stringify(host) +
      ';window.__AUTO_PORT=' + PORT + ';<\/script>';
    const banner = '<div id="lanHint" onclick="this.style.display=\'none\'" ' +
      'style="position:fixed;top:0;left:0;right:0;z-index:99999;cursor:pointer;' +
      'background:#1f7a3d;color:#eafff0;font:14px/1.4 system-ui,\'Microsoft YaHei\',sans-serif;' +
      'padding:8px 12px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.4)">' +
      '🌐 联机已就绪：把本页网址 <b style="font-family:monospace">' + shareUrl + '</b> 发给同学，' +
      '他们打开后点「联机 → 区域网」就能看到你的房间并加入（点此关闭提示）</div>';
    let out = html.replace('</head>', inject + '</head>');
    out = out.replace('<body>', '<body>' + banner);
    res.type('html').send(out);
  });
});

// ---- 静态游戏资源 ----
app.use(express.static(GAME_DIR));

// ---- PeerJS 信令(挂载到 /myapp) ----
const server = http.createServer(app);
const peerServer = ExpressPeerServer(server, { path: PEER_PATH, allow_discovery: true, debug: true });
app.use(PEER_PATH, peerServer);

peerServer.on('connection', (clientId) => {
  console.log('[signal] peer connected:', clientId);
});

// 取本机第一个局域网 IPv4(用于给主机显示"发给同学的网址")
function lanIPv4() {
  const ifs = os.networkInterfaces();
  for (const k in ifs) for (const a of ifs[k]) {
    if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

peerServer.on('disconnect', (client) => {
  if (client && client.getId) rooms.delete(client.getId());
});

server.listen(PORT, () => {
  const ips = [];
  const ifs = os.networkInterfaces();
  for (const k in ifs) for (const a of ifs[k]) {
    if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
  }
  console.log('================================================');
  console.log('  钢铁前线1944 · 联机服务器已启动');
  console.log('  本机打开:  http://localhost:' + PORT);
  if (ips.length) console.log('  同学打开:  http://' + ips[0] + ':' + PORT + '   (把这个网址发给同学)');
  else console.log('  (未检测到局域网 IP, 请确认已连 WiFi/网线)');
  console.log('  信令路径:  ' + PEER_PATH);
  console.log('================================================');
});
