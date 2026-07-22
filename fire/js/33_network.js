'use strict';
// ============================================================
// 钢铁前线1944 · P2P 联机网络模块 (WebRTC, 纯浏览器)
// 无需服务器 — 主机生成连接码, 客机粘贴即可直连
// ============================================================

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const NET = {
  pc: null,          // RTCPeerConnection
  dc: null,          // RTCDataChannel (主机创建, 客机接收)
  connected: false,
  myId: null,
  isHost: false,
  playerName: '玩家',
  msgQueue: [],
  remotePlayers: {},
  sentBytes: 0,
  recvBytes: 0,
  ping: 0,
  pingTimer: null,

  // ---- 公开 API (与旧版兼容) ----
  /** 主机: 创建 P2P 邀请 */
  async host(playerName) {
    this.playerName = playerName || '主机';
    this.isHost = true;
    this.myId = 'HOST';
    this.remotePlayers = {};
    this._setupPC();

    // 主机创建 DataChannel
    this.dc = this.pc.createDataChannel('steelfront', { ordered: true });
    this._setupDC(this.dc);

    // 生成 SDP offer
    try {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      console.log('[P2P] 主机 offer 已生成, 等待客机连接...');
      return offer.sdp;
    } catch (e) {
      console.error('[P2P] 创建 offer 失败:', e);
      return null;
    }
  },

  /** 客机: 加入主机 */
  async join(hostSdp, playerName) {
    this.playerName = playerName || '士兵';
    this.isHost = false;
    this.myId = 'CLIENT';
    this.remotePlayers = {};
    this._setupPC();

    // 客机监听 DataChannel
    this.pc.ondatachannel = (ev) => {
      this.dc = ev.channel;
      this._setupDC(this.dc);
    };

    // 设置远端 SDP
    try {
      await this.pc.setRemoteDescription({ type: 'offer', sdp: hostSdp });
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      console.log('[P2P] 客机 answer 已生成, 发送回主机...');
      return answer.sdp;
    } catch (e) {
      console.error('[P2P] 加入失败:', e);
      return null;
    }
  },

  /** 主机: 接收客机的 answer */
  async acceptAnswer(answerSdp) {
    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      console.log('[P2P] 主机已接收 answer, 等待 DataChannel 开启...');
      return true;
    } catch (e) {
      console.error('[P2P] 设置 answer 失败:', e);
      return false;
    }
  },

  // ---- 内部 ----
  _setupPC() {
    this.pc = new RTCPeerConnection(ICE_SERVERS);

    this.pc.oniceconnectionstatechange = () => {
      console.log('[P2P] ICE 状态:', this.pc.iceConnectionState);
      if (this.pc.iceConnectionState === 'disconnected' ||
          this.pc.iceConnectionState === 'failed') {
        if (this.connected) {
          this.connected = false;
          showScorePop('P2P 连接断开');
        }
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[P2P] 连接状态:', this.pc.connectionState);
      if (this.pc.connectionState === 'connected') {
        // DataChannel 可能还没开, 等待 dc.onopen
      }
    };

    // ICE candidate 收集完成后可以开始交换
    // 对于 LAN, ICE 通常瞬间完成
  },

  _setupDC(channel) {
    channel.onopen = () => {
      console.log('[P2P] DataChannel 已开启!');
      this.connected = true;
      this.startPing();

      // 发送身份信息
      this.send({
        type: 'hello',
        name: this.playerName,
        id: this.myId
      });

      // 通知上层
      if (this.isHost) {
        if (typeof onNetworkHosted === 'function') onNetworkHosted({ id: this.myId });
      } else {
        // 客机收到 host 的 hello 后, 会触发 joined
        // 但我们需要先通知 UI 已连接
      }
    };

    channel.onmessage = (ev) => {
      let text;
      if (ev.data instanceof ArrayBuffer) {
        text = new TextDecoder().decode(ev.data);
      } else if (typeof ev.data === 'string') {
        text = ev.data;
      } else { return; }
      this.recvBytes += text.length;
      try {
        const msg = JSON.parse(text);
        this._handle(msg);
      } catch (e) {
        console.error('[P2P] 消息解析失败:', e);
      }
    };

    channel.onclose = () => {
      console.log('[P2P] DataChannel 关闭');
      this.connected = false;
      this.stopPing();
    };

    channel.onerror = (e) => {
      console.error('[P2P] DataChannel 错误:', e);
    };
  },

  send(msg) {
    if (!this.dc || this.dc.readyState !== 'open') {
      if (this.msgQueue.length < 200) {
        this.msgQueue.push(msg);
      }
      return;
    }
    // 先发送队列
    while (this.msgQueue.length > 0) {
      try { this.dc.send(JSON.stringify(this.msgQueue.shift())); } catch (e) { break; }
    }
    try {
      const text = JSON.stringify(msg);
      this.sentBytes += text.length;
      this.dc.send(text);
    } catch (e) {
      console.error('[P2P] 发送失败:', e);
    }
  },

  disconnect() {
    this._manualDisconnect = true;
    this.stopPing();
    if (this.dc) { try { this.dc.close(); } catch (e) {} this.dc = null; }
    if (this.pc) { try { this.pc.close(); } catch (e) {} this.pc = null; }
    this.connected = false;
    this.myId = null;
    this.remotePlayers = {};
  },

  _handle(msg) {
    // 为消息附加发送者ID (P2P 只有两人, 对方的消息就是 remote)
    if (!msg.id) msg.id = (this.isHost ? 'CLIENT' : 'HOST');

    switch (msg.type) {
      case 'hello':
        // 对方发来了身份
        if (!this.isHost) {
          // 客机收到主机的 hello
          this.connected = true;
          this.ensureRemotePlayer(msg.id);
          showScorePop('已连接到主机!');
          if (typeof onNetworkJoined === 'function') onNetworkJoined({ id: this.myId, clients: [{ id: msg.id }] });
        }
        // 主机也记录客机
        this.ensureRemotePlayer(msg.id);
        if (this.isHost) {
          showScorePop((msg.name || '客机') + ' 已连接!');
          if (typeof onRemotePlayerJoined === 'function') onRemotePlayerJoined({ id: msg.id, name: msg.name });
        }
        break;

      case 'state':
        if (msg.id !== this.myId) {
          this.updateRemoteState(msg.id, msg.data);
        }
        break;

      case 'shoot':
        if (msg.id !== this.myId && typeof onRemoteShoot === 'function') onRemoteShoot(msg);
        break;

      case 'damage':
        if (msg.targetId === this.myId && typeof onRemoteDamageMe === 'function') {
          onRemoteDamageMe(msg);
        } else if (typeof onRemoteDamage === 'function') {
          onRemoteDamage(msg);
        }
        break;

      case 'death':
        if (msg.targetId === this.myId && typeof onRemoteKillMe === 'function') {
          onRemoteKillMe(msg);
        } else if (typeof onRemoteDeath === 'function') {
          onRemoteDeath(msg);
        }
        break;

      case 'spawn':
        if (msg.id !== this.myId && typeof onRemoteSpawn === 'function') onRemoteSpawn(msg);
        break;

      case 'chat':
        showScorePop('[' + (msg.name || msg.id) + ']: ' + msg.text);
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
        team: 0, cls: 0,
        crouch: false, prone: false, sprinting: false, ads: false,
        onGround: true, onVehicle: null
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
    if (data.pos) { rp.lerpPos.set(data.pos.x, data.pos.y, data.pos.z); }
    if (data.vel) s.vel.set(data.vel.x || 0, data.vel.y || 0, data.vel.z || 0);
    if (data.yaw !== undefined) rp.lerpYaw = data.yaw;
    if (data.pitch !== undefined) s.pitch = data.pitch;
    if (data.hp !== undefined) s.hp = data.hp;
    if (data.alive !== undefined) s.alive = data.alive;
    s.crouch = data.crouch || false;
    s.prone = data.prone || false;
    s.sprinting = data.sprinting || false;
    s.ads = data.ads || false;
    s.onGround = data.onGround !== false;
    s.team = data.team || 0;
    s.cls = data.cls || 0;
    s.onVehicle = data.onVehicle || null;
    s.weapon = data.weapon || null;
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
    if (!this.connected || !player.alive) return;
    const p = player;
    this.send({
      type: 'state',
      data: {
        pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        vel: { x: p.vel.x, y: p.vel.y, z: p.vel.z },
        yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive,
        team: p.team, cls: p.cls,
        crouch: p.crouch, prone: p.prone, sprinting: p.sprinting, ads: p.ads,
        onGround: p.onGround,
        onVehicle: p.onVehicle ? p.onVehicle.kind : null,
        weapon: p.curW ? p.curW.key : null
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

  sendChat(text) {
    this.send({ type: 'chat', text: String(text).substring(0, 200), name: this.playerName });
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
