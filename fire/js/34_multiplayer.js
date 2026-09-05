'use strict';
// ============================================================
// 钢铁前线1944 · 多人游戏逻辑模块 (P2P WebRTC)
// ============================================================

const MP = {
  stateTimer: 0,
  stateInterval: 0.05,
  worldTimer: 0,
  worldInterval: 0.08,   // 主机权威世界快照频率(~12.5Hz)
  sentWorldCount: 0,     // 主机已发送世界快照次数(诊断用)
  remoteTracers: [],

  get enabled() { return typeof NET !== 'undefined' && NET.connected; },
  get isClient() { return typeof NET !== 'undefined' && NET.isClient; },

  // 每帧更新
  update(dt) {
    if (!this.enabled) return;

    // 主机: 周期性广播整局世界快照(让客户端镜像同一战场)
    if (NET.isHost) {
      this.worldTimer += dt;
      if (this.worldTimer >= this.worldInterval) { this.worldTimer = 0; this.sendWorld(); }
    }

    // 更新远程玩家渲染
    this.updateRemotePlayers(dt);
    this.interpolateVehicles(dt);

    // 定期发送本地状态
    this.stateTimer += dt;
    if (this.stateTimer >= this.stateInterval) {
      this.stateTimer -= this.stateInterval;
      NET.sendState();
    }

    // 处理远程射击特效
    this.updateRemoteShots(dt);
  },

  // 主机: 采集整局世界状态并广播
  sendWorld() {
    if (typeof tanks === 'undefined') return;
    const r3 = v => Math.round(v * 1000) / 1000;
    const r2 = v => Math.round(v * 100) / 100;
    const tk = (typeof tanks !== 'undefined' ? tanks : []).map(t => [r3(t.pos.x), r3(t.pos.y), r3(t.pos.z), r2(t.yaw), t.alive ? 1 : 0, t.team, Math.round(t.hp || 0)]);
    const pl = (typeof planes !== 'undefined' ? planes : []).map(p => [r3(p.pos.x), r3(p.pos.y), r3(p.pos.z), r2(p.yaw), p.alive ? 1 : 0, p.team, Math.round(p.hp || 0)]);
    const ap = (typeof apcs !== 'undefined' ? apcs : []).map(a => [r3(a.pos.x), r3(a.pos.y), r3(a.pos.z), r2(a.yaw), a.alive ? 1 : 0, a.team, Math.round(a.hp || 0)]);
    const fl = (typeof FLAGS !== 'undefined' ? FLAGS : []).map(f => [f.owner, r2(f.cap), f.capTeam]);
    const tk0 = (typeof tickets !== 'undefined') ? tickets[0] : 0;
    const tk1 = (typeof tickets !== 'undefined') ? tickets[1] : 0;
    const pp0 = (typeof teamPool !== 'undefined') ? Math.floor(teamPool[0]) : 0;
    const pp1 = (typeof teamPool !== 'undefined') ? Math.floor(teamPool[1]) : 0;
    const mt = (typeof matchTime !== 'undefined') ? Math.round(matchTime) : 0;
    const over = (typeof matchOver !== 'undefined' && matchOver) ? 1 : 0;
    this.sentWorldCount++;
    NET.sendWorld({ tk: tk, pl: pl, ap: ap, fl: fl, tk0: tk0, tk1: tk1, mt: mt, over: over, pp0: pp0, pp1: pp1 });
  },

  // 客户端: 消费主机世界快照, 镜像同一战场
  applyWorld(d) {
    if (!d) return;
    const lerp = Math.min(1, 0.3);
    const lerpY = Math.min(1, 0.25);
    // ---- 载具 ----
    const applyVeh = (arr, snap) => {
      for (let i = 0; i < snap.length && i < arr.length; i++) {
          const v = arr[i], x = snap[i];
          const g = v.grp || (v.mesh && v.mesh.root); // 载具用 grp(坦克/飞机/APC), 兜底 mesh.root
          const isSelf = (typeof player !== 'undefined' && player && player.onVehicle === v);
          if (!isSelf) {
            // 记录网络目标位姿, 由每帧插值平滑逼近(修复客机侧其他载具移动卡顿, 并让 v.pos 参与弹道检测)
            v._netX = x[0]; v._netY = x[1]; v._netZ = x[2];
            v._netYaw = (x.length > 3) ? x[3] : v.yaw;
            v._netDirty = true;
            // 首次同步直接落位, 避免从出生点平滑飞过去
            if (!v._netInit) { v._netInit = true; v.pos.set(x[0], x[1], x[2]); v.yaw = v._netYaw; }
          }
          const wasAlive = v.alive;
          v.alive = !!x[4]; v.team = x[5];
        if (x.length >= 7) v.hp = x[6]; // 载具血量(tank/plane/apc 均含)
        if (g) g.visible = v.alive;     // hide dead
        // if client-driven vehicle is killed by host world, kill local player too
        if (wasAlive && !v.alive && typeof player !== 'undefined' && player && player.onVehicle === v && player.alive && typeof player.die === 'function') {
          player.die(null, false);
        }
      }
    };
    if (typeof tanks !== 'undefined') applyVeh(tanks, d.tk);
    if (typeof planes !== 'undefined') applyVeh(planes, d.pl);
    if (typeof apcs !== 'undefined') applyVeh(apcs, d.ap);
    // ---- 旗帜 ----
    if (typeof FLAGS !== 'undefined') {
      for (let i = 0; i < d.fl.length && i < FLAGS.length; i++) {
        const f = FLAGS[i], x = d.fl[i];
        const ownerChanged = f.owner !== x[0];
        f.owner = x[0]; f.cap = x[1]; f.capTeam = x[2];
        if (ownerChanged) {
          if (typeof drawFlagTex === 'function') drawFlagTex(f);
          // 据点归属变化: 若正处于部署界面, 立即刷新可复活据点列表(避免复活的据点已易手)
          if (typeof player !== 'undefined' && !player.alive && player.deployed && typeof buildSpawnList === 'function'){ buildSpawnList(); if(typeof buildVehShop==='function') buildVehShop(); }
        }
        if (f.flagMesh) f.flagMesh.position.y = f.owner !== -1 ? f.poleTop - f.cap * 2 : f.gy + 3.2 + f.cap * 2.4;
      }
    }
    // ---- 票数 / 时间 / 结束 ----
    if (typeof tickets !== 'undefined') { tickets[0] = d.tk0; tickets[1] = d.tk1; }
    if (typeof teamPool !== 'undefined' && d.pp0 !== undefined) { teamPool[0] = d.pp0; teamPool[1] = d.pp1; }
    if (typeof matchTime !== 'undefined') matchTime = d.mt;
    if (d.over && typeof matchOver !== 'undefined' && !matchOver && typeof endMatch === 'function') endMatch();
  },

  // 每帧把非本机载具平滑逼近主机快照位姿(帧率无关指数平滑, 消除 12.5Hz 快照带来的卡顿)
  interpolateVehicles(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const kYaw = 1 - Math.exp(-dt * 16);
    const apply = (arr) => {
      if (!arr) return;
      for (const v of arr) {
        if (!v._netDirty) continue;
        if (typeof player !== 'undefined' && player && player.onVehicle === v) continue;
        v.pos.x += (v._netX - v.pos.x) * k;
        v.pos.y += (v._netY - v.pos.y) * k;
        v.pos.z += (v._netZ - v.pos.z) * k;
        let dy = v._netYaw - v.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        v.yaw += dy * kYaw;
        const g = v.grp || (v.mesh && v.mesh.root);
        if (g) { g.position.copy(v.pos); g.rotation.y = v.yaw; }
      }
    };
    apply(typeof tanks !== 'undefined' ? tanks : null);
    apply(typeof planes !== 'undefined' ? planes : null);
    apply(typeof apcs !== 'undefined' ? apcs : null);
  },

  // 载具战: 远程玩家通过世界快照镜像其载具, 无需步兵模型
  updateRemotePlayers(dt) {
    for (const id in NET.remotePlayers) {
      const rp = NET.remotePlayers[id];
      if (!rp) continue;
      const s = rp.state;
      if (rp.combatant && s.pos) {
        rp.combatant.pos.set(s.pos.x, s.pos.y, s.pos.z);
        rp.combatant.alive = s.alive;
        rp.combatant.hp = s.hp;
        rp.combatant.team = s.team;
        rp.combatant.onVehicle = s.onVehicle || null;
      }
      // 主机权威: 把客机上报的载具位置同步到主机的同一辆载具上
      if (NET.isHost && s.veh && s.vehIdx >= 0) {
        const kind = s.onVehicle;
        const arr = kind === 'tank' ? tanks : (kind === 'plane' ? planes : apcs);
        const v = arr && arr[s.vehIdx];
        if (v) {
          v.remoteDriven = true;
          v.isAI = false;
          v.pos.set(s.veh.x, s.veh.y, s.veh.z);
          v.yaw = s.veh.yaw || v.yaw;
          if (v.turretYaw !== undefined) v.turretYaw = s.veh.turretYaw || v.turretYaw;
          if (v.grp) {
            v.grp.position.copy(v.pos);
            v.grp.rotation.y = v.yaw;
          }
        }
      }
    }
  },

  createRemoteMesh() {},

  updateRemoteAnimation() {},

  // 处理远程射击特效
  updateRemoteShots(dt) {
    for (let i = this.remoteTracers.length - 1; i >= 0; i--) {
      const t = this.remoteTracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        scene.remove(t.line);
        this.remoteTracers.splice(i, 1);
      }
    }
  },

  // 添加远程射击特效
  addRemoteShot(wpnKey, origin, dir) {
    if (typeof spawnP === 'function') {
      spawnP(PT.flash, origin.x, origin.y, origin.z,
        dir.x * 2, dir.y * 2, dir.z * 2, 0.3, 3, 0.08, 0.5, 0, true);
    }
    try {
      AudioSys.gunshot('mg', 0, 0);
    } catch (e) {}
  }
};

// ===== 网络事件回调 =====

function onNetworkHosted(msg) {
  // 主机创建房间成功, 自动开始
  console.log('[MP] 你是主机, 等待玩家加入');
}

function onNetworkJoined(msg) {
  // 客户端加入成功
  console.log('[MP] 已加入主机游戏');
}

function onRemotePlayerJoined(msg) {
  if (player.alive && player.deployed) showScorePop('新玩家加入: ' + (msg.name || msg.id));
  
  // 为远程玩家创建可被子弹检测的 combatant 实体
  // (不管本地是否已部署都要创建, 否则部署后对手仍无法被命中/可见)
  const rp = NET.remotePlayers[msg.id];
  if (rp && !rp.combatant) {
    rp.combatant = {
      isPlayer: false,
      isRemote: true,
      remoteId: msg.id,
      name: msg.name || msg.id,
      alive: true,
      hp: 100,
      team: 1 - player.team, // 远程玩家默认敌对阵营
      pos: V3(0, 1, 0),
      vel: V3(),
      onVehicle: null,
      kills: 0,
      deaths: 0,
      score: 0,
      damage: function(amt, attacker, isHead) {
        this.hp -= amt;
        if (this.hp <= 0) {
          this.hp = 0;
          this.alive = false;
        }
        // 任何来源(bot/玩家)的每一枪伤害都同步给远程玩家本人, 让对手实时掉血
        if (typeof NET !== 'undefined' && NET.connected) {
          NET.sendDamage(this.remoteId, amt, isHead);
        }
      },
      die: function() { this.alive = false; this.hp = 0; },
      suppress: function() {},
      lastFiredT: -99,
      mesh: null
    };
    if (typeof combatants !== 'undefined') combatants.push(rp.combatant);
    if (typeof soldiers !== 'undefined') soldiers.push(rp.combatant);
  }
}

function onRemotePlayerLeft(msg) {
  // 清理该玩家的 combatant
  const rp = NET.remotePlayers[msg.id];
  if (rp && rp.combatant) {
    if (typeof combatants !== 'undefined') {
      const idx = combatants.indexOf(rp.combatant);
      if (idx >= 0) combatants.splice(idx, 1);
    }
    if (typeof soldiers !== 'undefined') {
      const idx = soldiers.indexOf(rp.combatant);
      if (idx >= 0) soldiers.splice(idx, 1);
    }
  }
  NET.removeRemotePlayer(msg.id);
}

function onRemoteShoot(msg) {
  if (!msg.data) return;
  const d = msg.data;
  const origin = V3(d.orig.x, d.orig.y, d.orig.z);
  const dir = V3(d.dir.x, d.dir.y, d.dir.z);
  MP.addRemoteShot(d.wpn, origin, dir);
}

function onRemoteDamageMe(msg) {
  // 远程玩家对我造成伤害
  if (player.alive && !matchOver) {
    player.damage(msg.amount, null, msg.isHead);
  }
}

function onRemoteDamage(msg) {
  // 其他玩家受伤 (视觉效果)
}

function onRemoteKillMe(msg) {
  // 我被远程玩家击杀
  if (player.alive) {
    player.damage(999, { name: msg.id || '远程玩家', pos: player.pos.clone() }, false);
  }
}

function onRemoteDeath(msg) {
  // 其他玩家死亡
  const rp = NET.remotePlayers[msg.id];
  if (rp) {
    rp.state.alive = false;
    rp.state.hp = 0;
  }
}

function onRemoteSpawn(msg) {
  const rp = NET.remotePlayers[msg.id];
  if (rp && msg.data) {
    rp.state.alive = true;
    rp.state.hp = 100;
    rp.state.team = msg.data.team || 0;
    rp.state.cls = msg.data.cls || 0;
  }
}

function onRemoteFlagCapture(msg) {
  // 同步旗帜
  if (!NET.isHost && msg.flagId !== undefined) {
    const f = FLAGS.find(fl => fl.id === msg.flagId);
    if (f) {
      f.owner = msg.owner;
      f.cap = 0;
      f.capTeam = -1;
      try { drawFlagTex(f); } catch (e) {}
    }
  }
}

function onRemoteVehicleEnter(msg) {
  // 主机: 客机报告其驾驶了某辆载具, 停止该载具的 AI 并标记为远程驾驶
  if (!NET.isHost || !msg.data) return;
  const kind = msg.data.kind;
  const idx = msg.data.idx;
  const arr = kind === 'tank' ? tanks : (kind === 'plane' ? planes : apcs);
  const v = arr && arr[idx];
  if (v) {
    v.remoteDriven = true;
    v.isAI = false;
  }
}

function onRemoteVehicleLeave(msg) {}

function onRemoteWeaponChange(msg) {}

// 主机: 客机上报其命中了某 bot/载具, 在权威世界上施加伤害
function onRemoteHit(msg) {
  if (typeof NET === 'undefined' || !NET.isHost) return;
  let ent = null;
  if (msg.kind === 'tank') { if (typeof tanks !== 'undefined') ent = tanks[msg.idx]; }
  else if (msg.kind === 'apc') { if (typeof apcs !== 'undefined') ent = apcs[msg.idx]; }
  else if (msg.kind === 'plane') { if (typeof planes !== 'undefined') ent = planes[msg.idx]; }
  if (!ent || !ent.alive) return;
  const attacker = { isPlayer: true, name: (typeof NET !== 'undefined' ? NET.playerName : '玩家'), remoteId: (typeof NET !== 'undefined' ? NET.myId : null) };
  if (typeof ent.takeDmg === 'function') { ent.takeDmg(msg.dmg, attacker); }
}

// 重载 showScorePop 以支持网络聊天显示
const _origShowScorePop = typeof showScorePop === 'function' ? showScorePop : null;
