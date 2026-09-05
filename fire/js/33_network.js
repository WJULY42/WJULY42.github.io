'use strict';
// ============================================================
// 钢铁前线1944 · 联机网络模块 (WebRTC via PeerJS, 短房间码)
// 默认走 PeerJS 公共信令云(零服务器, 可部署 GitHub Pages): 主机生成 ≤6 位房间码, 客机输入即可直连。
// 也可切到自建局域网信令(js/net-config.js 里 mode='lan' 且填 host), 仅用于握手, 不传输游戏数据。
// ============================================================

const NET = {
  peer: null,
  conn: null,            // PeerJS DataConnection
  connected: false,
  myId: null,
  isHost: false,
  get isClient() { return this.connected && !this.isHost; },
  playerName: '玩家',
  roomCode: '',
  msgQueue: [],
  remotePlayers: {},
  sentBytes: 0,
  recvBytes: 0,
  recvWorldCount: 0,    // 收到的世界快照数(诊断用)
  recvStateCount: 0,    // 收到的玩家状态数(诊断用)
  ping: 0,
  pingTimer: null,

  // 可读字符集(去掉易混淆的 0/O/1/I/L), 6 位 ≈ 6 亿组合
  _ALPHABET: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',

  _genCode(len) {
    let s = '';
    const a = this._ALPHABET;
    for (let i = 0; i < len; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  },

  // PeerJS 未加载时动态注入(优先 jsDelivr 国内镜像, 失败回退 unpkg)
  _ensurePeer() {
    if (typeof Peer !== 'undefined') return Promise.resolve(true);
    const cdns = [
      'vendor/peerjs.min.js',
      'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
      'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
    ];
    const tryLoad = (i) => new Promise((resolve, reject) => {
      if (i >= cdns.length) { reject(new Error('PeerJS 加载失败(请检查网络, 或改用自建信令)')); return; }
      const s = document.createElement('script');
      s.src = cdns[i];
      s.onload = () => resolve(true);
      s.onerror = () => { try { document.head.removeChild(s); } catch (e) {} tryLoad(i + 1).then(resolve, reject); };
      document.head.appendChild(s);
    });
    return tryLoad(0);
  },

  // 读取 net-config.js 中的信令配置。
  // mode='lan' 且有 host → 返回自建信令参数; 否则返回 null(= 用 PeerJS 公共云, 零服务器)。
  _signalOpts() {
    const c = (typeof NET_CONFIG !== 'undefined' && NET_CONFIG) ? NET_CONFIG : null;
    if (!c) return null;
    if (c.mode === 'lan' && c.host) {
      return {
        host: c.host,
        port: c.port || (c.secure ? 443 : 9000),
        path: c.path || '/myapp',
        secure: !!c.secure
      };
    }
    return null; // cloud 模式或未配置 → 公共云
  },

  // 区域网自动发现: 向自建信令页登记/注销本房间(仅 lanDiscovery 时生效)
  _announceRoom(code, name) {
    const c = (typeof NET_CONFIG !== 'undefined') ? NET_CONFIG : null;
    if (!c || c.mode !== 'lan' || !c.lanDiscovery || !code) return;
    const base = (c.secure ? 'https' : 'http') + '://' + c.host + ':' + (c.port || 9000);
    const body = JSON.stringify({ id: code, name: name || '房主' });
    const post = () => { try { fetch(base + '/announce', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); } catch (e) {} };
    post();
    if (this._announceTimer) clearInterval(this._announceTimer);
    this._announceTimer = setInterval(post, 2500); // 心跳保活
  },
  _leaveRoom() {
    const c = (typeof NET_CONFIG !== 'undefined') ? NET_CONFIG : null;
    if (!c || c.mode !== 'lan' || !c.lanDiscovery || !this.roomCode) return;
    const base = (c.secure ? 'https' : 'http') + '://' + c.host + ':' + (c.port || 9000);
    try { fetch(base + '/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: this.roomCode }) }); } catch (e) {}
    if (this._announceTimer) { clearInterval(this._announceTimer); this._announceTimer = null; }
  },

  _err(msg) { if (typeof showScorePop === 'function') showScorePop(msg); console.error('[NET]', msg); },

  _destroyPeer() {
    this._leaveRoom();
    if (this.conn) { try { this.conn.close(); } catch (e) {} this.conn = null; }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} this.peer = null; }
    this.connected = false;
  },

  // ---- 公开 API ----
  /** 主机: 创建房间, 返回 Promise<房间码字符串> */
  async host(playerName) {
    this.playerName = playerName || '主机';
    this.isHost = true;
    this.myId = 'HOST';
    this.remotePlayers = {};
    this._destroyPeer();
    const opts = this._signalOpts();
    try { await this._ensurePeer(); } catch (e) { this._err(e.message); return null; }

    const create = (code) => new Promise((resolve) => {
      let settled = false;
      const peerOpts = { debug: 0 };
      if (opts) {
        Object.assign(peerOpts, opts); // self-hosted signaling: LAN
          // local STUN: expose real LAN IP, avoid mDNS candidate issues
          peerOpts.config = { iceServers: [{ urls: 'stun:' + opts.host + ':' + opts.port }] };
      }
      const peer = new Peer(code, peerOpts);
      peer.on('open', () => {
        if (settled) return; settled = true;
        this.peer = peer; this.roomCode = code;
        if (typeof onNetworkHosted === 'function') onNetworkHosted({ id: this.myId });
        this._announceRoom(code, this.playerName); // 区域网自动发现: 登记本房间
        resolve(code);
      });
      peer.on('connection', (c) => this._setupConn(c));
      peer.on('error', (err) => {
        if (settled) return;
        if (err && err.type === 'unavailable-id') {
          peer.destroy();
          resolve(this.host(playerName)); // 房间码冲突, 换一个重试
        } else {
          settled = true;
          this._err('创建房间失败: ' + (err && err.type || '未知错误'));
          resolve(null);
        }
      });
    });
    return create(this._genCode(6));
  },

  /** 客机: 加入房间, 返回 Promise<true/false> */
  join(code, playerName) {
    this.playerName = playerName || '士兵';
    this.isHost = false;
    this.myId = 'CLIENT';
    this.remotePlayers = {};
    this._destroyPeer();
    code = (code || '').trim().toUpperCase();
    this.roomCode = code; // 记录房间码(供地图不一致重载后自动重连)

    return this._ensurePeer().then(() => new Promise((resolve) => {
      let settled = false;
      const opts = this._signalOpts();
      const peerOpts = { debug: 0 };
      if (opts) {
        Object.assign(peerOpts, opts); // self-hosted signaling: LAN
          // local STUN: expose real LAN IP, avoid mDNS candidate issues
          peerOpts.config = { iceServers: [{ urls: 'stun:' + opts.host + ':' + opts.port }] };
      }
      // client uses self-generated Peer ID, avoids HTTP ID endpoint (disabled in old peerjs-server)
      const peer = new Peer(this._genCode(10), peerOpts);
      this.peer = peer;
      const fail = (m) => { if (settled) return; settled = true; this._err(m); resolve(false); };

      peer.on('open', () => {
        if (settled) return;
        // 显式 JSON 序列化(避免二进制编码歧义导致消息静默丢失)
        const conn = peer.connect(code, { reliable: true, serialization: 'json' });
        this._setupConn(conn);
        conn.on('open', () => { if (!settled) { settled = true; resolve(true); } });
        conn.on('error', () => fail('连接失败, 请检查房间码'));
      });
      peer.on('error', (err) => {
        if (err && err.type === 'peer-unavailable') fail('房间不存在或已关闭, 请确认房间码');
        else fail('加入失败: ' + (err && err.type || '未知错误'));
      });
      setTimeout(() => fail('连接超时(15s), 请确认房间码与网络'), 15000);
    }));
  },

  _setupConn(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.connected = true;
      this.startPing();
      // 带上对战参数(地图/载具/难度), 让客机据此对齐, 保证"同一局"
      this.send({
        type: 'hello', name: this.playerName, id: this.myId,
        camp: (typeof CAMPAIGN_IDX !== 'undefined' ? CAMPAIGN_IDX : -1),
        size: (typeof SIZE_IDX !== 'undefined' ? SIZE_IDX : -1),
        diff: (typeof SETTINGS !== 'undefined' && SETTINGS.diff !== undefined ? SETTINGS.diff : 1)
      });
      // 连接一打开就立即同步一次自身状态, 让对方尽快看到自己(20Hz 循环会继续补发)
      if (typeof player !== 'undefined' && player && player.alive) this.sendState();
    });
    conn.on('data', (data) => {
      let msg;
      // 兼容多种返回形态: object(json serialization) / string(手动序列化) / 二进制数组
      if (typeof data === 'string') {
        try { msg = JSON.parse(data); } catch (e) { return; }
      } else if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        try { msg = JSON.parse(new TextDecoder().decode(data)); } catch (e) { return; }
      } else if (data && typeof data === 'object' && !Array.isArray(data)) {
        msg = data;
      } else {
        return;
      }
      this.recvBytes += JSON.stringify(msg).length;
      this._handle(msg);
    });
    conn.on('close', () => {
      this.connected = false; this.stopPing();
      if (typeof showScorePop === 'function') showScorePop('联机连接断开');
    });
    conn.on('error', (e) => { console.error('[NET] 连接错误', e); });
  },

  send(msg) {
    if (!this.conn || !this.conn.open) {
      if (this.msgQueue.length < 200) this.msgQueue.push(msg);
      return;
    }
    while (this.msgQueue.length > 0) {
      try { this.conn.send(this.msgQueue.shift()); } catch (e) { break; }
    }
    try {
      this.sentBytes += JSON.stringify(msg).length;
      this.conn.send(msg); // 直接发对象(serialization=json 时由 PeerJS 统一 JSON 序列化)
    } catch (e) { console.error('[NET] 发送失败', e); }
  },

  disconnect() { this._destroyPeer(); this.remotePlayers = {}; this.roomCode = ''; },

  // 分享用: 返回房间码 (游戏中"分享"按钮复制)
  getShareUrl() { return this.roomCode || ''; },

  // ---- 消息处理 ----
  _handle(msg) {
    // P2P 仅两人, 对方消息即 remote
    if (!msg.id) msg.id = (this.isHost ? 'CLIENT' : 'HOST');

    switch (msg.type) {
      case 'hello': {
        // 对方发来了身份 —— 双方都要为本端登记对方的可命中实体
        const rp = this.ensureRemotePlayer(msg.id);
        const isNew = !rp._helloDone;
        rp._helloDone = true;
        if (!this.isHost) {
          // 客户端: 服从主机的对战参数(地图/载具规模), 不一致则写 localSt 并重载对齐
          let needReload = false;
          if (msg.camp !== undefined && msg.camp >= 0 && typeof CAMPAIGN_IDX !== 'undefined' && msg.camp !== CAMPAIGN_IDX) {
            try { localStorage.setItem('sf_campaign', String(msg.camp)); } catch (e) {}
            needReload = true;
          }
          if (msg.size !== undefined && msg.size >= 0 && typeof SIZE_IDX !== 'undefined' && msg.size !== SIZE_IDX) {
            try { localStorage.setItem('sf_size', String(msg.size)); } catch (e) {}
            needReload = true;
          }
          if (msg.diff !== undefined && typeof SETTINGS !== 'undefined') SETTINGS.diff = msg.diff;
          if (needReload) {
            try {
              localStorage.setItem('sf_autjoin', JSON.stringify({
                room: this.roomCode || '', name: this.playerName || '',
                mode: (typeof NET_CONFIG !== 'undefined' && NET_CONFIG.mode === 'lan') ? 'lan' : 'p2p'
              }));
            } catch (e) {}
            if (typeof showScorePop === 'function') showScorePop('已同步主机的地图/载具, 正在重载...');
            setTimeout(() => { try { location.reload(); } catch (e) {} }, 400);
            return;
          }
          this.connected = true;
          if (typeof showScorePop === 'function') showScorePop('已连接到主机!');
          if (typeof onNetworkJoined === 'function') onNetworkJoined({ id: this.myId, clients: [{ id: msg.id }] });
        } else {
          if (typeof showScorePop === 'function') showScorePop((msg.name || '客机') + ' 已连接!');
        }
        // 此前仅主机侧调用 onRemotePlayerJoined, 客机无法命中主机; 现已双向补齐
        if (isNew && typeof onRemotePlayerJoined === 'function') onRemotePlayerJoined({ id: msg.id, name: msg.name });
        break;
      }

      case 'state':
        this.recvStateCount++;
        if (msg.id !== this.myId) this.updateRemoteState(msg.id, msg.data);
        break;

      case 'shoot':
        if (msg.id !== this.myId && typeof onRemoteShoot === 'function') onRemoteShoot(msg);
        break;

      case 'damage':
        if (msg.targetId === this.myId && typeof onRemoteDamageMe === 'function') onRemoteDamageMe(msg);
        else if (typeof onRemoteDamage === 'function') onRemoteDamage(msg);
        break;

      case 'death':
        if (msg.targetId === this.myId && typeof onRemoteKillMe === 'function') onRemoteKillMe(msg);
        else if (typeof onRemoteDeath === 'function') onRemoteDeath(msg);
        break;

      case 'spawn':
        if (msg.id !== this.myId && typeof onRemoteSpawn === 'function') onRemoteSpawn(msg);
        break;

      case 'pool':
        if (this.isHost && typeof teamPool !== 'undefined' && msg.data) { teamPool[msg.data.team] = Math.max(0, (teamPool[msg.data.team] || 0) - msg.data.amount); }
        break;

      case 'chat':
        if (typeof addChatMsg === 'function') addChatMsg(msg.name || msg.id, msg.text, false);
        break;

      case 'world':
        if (this.isHost) return; // 仅客户端消费
        this.recvWorldCount++;
        if (typeof MP !== 'undefined' && MP.applyWorld) MP.applyWorld(msg.data);
        break;

      case 'hit':
        if (!this.isHost) return; // 仅主机处理
        if (typeof onRemoteHit === 'function') onRemoteHit(msg);
        break;

      case 'ping':
        // 收到对方 ping, 立即回 pong(测延迟)
        this.send({ type: 'pong', sendTime: msg.sendTime });
        break;

      case 'pong':
        this.ping = Date.now() - (msg.sendTime || 0);
        break;

      case 'flag_capture':
        if (typeof onRemoteFlagCapture === 'function') onRemoteFlagCapture(msg);
        break;

      case 'vehicle_enter':
        if (typeof onRemoteVehicleEnter === 'function') onRemoteVehicleEnter(msg);
        break;

      case 'vehicle_leave':
        if (typeof onRemoteVehicleLeave === 'function') onRemoteVehicleLeave(msg);
        break;

      case 'weapon_change':
        if (typeof onRemoteWeaponChange === 'function') onRemoteWeaponChange(msg);
        break;
    }
  },

  // ---- 远程玩家管理 ----
  ensureRemotePlayer(id) {
    if (this.remotePlayers[id]) return;
    this.remotePlayers[id] = {
      id: id,
      state: {
        pos: V3(0, 1, 0), vel: V3(),
        yaw: 0, pitch: 0, hp: 100, alive: false,
        team: 0,
        onVehicle: null
      },
      lastUpdate: 0, mesh: null, nameTag: null,
      lerpPos: V3(0, 1, 0), lerpYaw: 0
    };
  },

  updateRemoteState(id, data) {
    if (!id) return;
    const rp = this.remotePlayers[id];
    if (!rp) return;
    const s = rp.state;
    if (data.pos) {
      rp.lerpPos.set(data.pos.x, data.pos.y, data.pos.z);
      s.pos.set(data.pos.x, data.pos.y, data.pos.z); // 同步 state.pos(供 combatant 弹道检测)
    }
    if (data.vel) s.vel.set(data.vel.x || 0, data.vel.y || 0, data.vel.z || 0);
    if (data.yaw !== undefined) rp.lerpYaw = data.yaw;
    if (data.pitch !== undefined) s.pitch = data.pitch;
    if (data.hp !== undefined) s.hp = data.hp;
    if (data.alive !== undefined) s.alive = data.alive;
    s.team = data.team || 0;
    s.onVehicle = data.onVehicle || null;
    // 保存载具快照字段: 主机据此把客机驾驶的载具位置镜像到权威世界(占点/索敌依赖)
    if (data.veh) s.veh = data.veh;
    if (data.vehIdx !== undefined) s.vehIdx = data.vehIdx;
    rp.lastUpdate = nowT;
  },

  removeRemotePlayer(id) {
    const rp = this.remotePlayers[id];
    if (rp) {
      if (rp.mesh) { scene.remove(rp.mesh.root); rp.mesh = null; }
      if (rp.nameTag) { scene.remove(rp.nameTag); rp.nameTag = null; }
      delete this.remotePlayers[id];
    }
  },

  // ---- 发送游戏数据 ----
  sendState() {
    if (!this.connected) return; // 只要连上就发(含 alive:false), 让对手及时知道你阵亡/部署
    const p = player;
    let vehIdx = -1;
    let veh = null;
    if (p.onVehicle) {
      const kind = p.onVehicle.kind;
      const arr = kind === 'tank' ? tanks : (kind === 'plane' ? planes : apcs);
      if (arr) {
        vehIdx = arr.indexOf(p.onVehicle);
        veh = {
          x: p.onVehicle.pos.x, y: p.onVehicle.pos.y, z: p.onVehicle.pos.z,
          yaw: p.onVehicle.yaw || 0,
          turretYaw: p.onVehicle.turretYaw || 0,
          hp: p.onVehicle.hp, alive: p.onVehicle.alive
        };
      }
    }
    this.send({
      type: 'state',
      data: {
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        vel: { x: p.vel.x, y: p.vel.y, z: p.vel.z },
        yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive,
        team: p.team,
        onVehicle: p.onVehicle ? p.onVehicle.kind : null,
        vehIdx: vehIdx,
        veh: veh
      }
    });
  },

  sendShoot(wpnKey, origin, dir) {
    this.send({
      type: 'shoot',
      data: { wpn: wpnKey, orig: { x: origin.x, y: origin.y, z: origin.z }, dir: { x: dir.x, y: dir.y, z: dir.z } }
    });
  },

  sendDamage(targetId, amount, isHead) {
    this.send({ type: 'damage', targetId: targetId, amount: amount, isHead: isHead });
  },

  sendDeath(killerId) {
    this.send({ type: 'death', targetId: killerId });
  },

  sendSpawn(cls, team) {
    this.send({ type: 'spawn', data: { cls: cls, team: team } });
  },
    sendVehicleEnter(idx, kind) {
      this.send({ type: 'vehicle_enter', data: { idx: idx, kind: kind } });
    },

  sendPool(amount, team) {
    this.send({ type: 'pool', data: { amount: amount, team: team } });
  },

  sendChat(text) {
    this.send({ type: 'chat', text: String(text).substring(0, 200), name: this.playerName });
  },

  // 主机权威: 广播整局世界快照(仅主机发送)
  sendWorld(w) {
    this.send({ type: 'world', data: w });
  },

  // 客机命中主机的 bot/载具, 上报主机以更新其权威世界
  sendHit(kind, idx, dmg, head) {
    this.send({ type: 'hit', kind: kind, idx: idx, dmg: dmg, head: !!head });
  },

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: 'ping', sendTime: Date.now() });
    }, 3000);
  },

  stopPing() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }
};
