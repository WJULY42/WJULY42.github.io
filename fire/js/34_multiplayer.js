'use strict';
// ============================================================
// 钢铁前线1944 · 多人游戏逻辑模块 (P2P WebRTC)
// ============================================================

const MP = {
  stateTimer: 0,
  stateInterval: 0.05,
  remoteTracers: [],

  get enabled() { return typeof NET !== 'undefined' && NET.connected; },

  // 每帧更新
  update(dt) {
    if (!this.enabled) return;

    // 更新远程玩家渲染
    this.updateRemotePlayers(dt);

    // 定期发送本地状态
    this.stateTimer += dt;
    if (this.stateTimer >= this.stateInterval) {
      this.stateTimer -= this.stateInterval;
      NET.sendState();
    }

    // 处理远程射击特效
    this.updateRemoteShots(dt);
  },

  // 渲染远程玩家模型
  updateRemotePlayers(dt) {
    for (const id in NET.remotePlayers) {
      const rp = NET.remotePlayers[id];
      if (!rp) continue;

      const s = rp.state;
      // 同步 combatant 位置(用于弹道检测)
      if (rp.combatant && s.pos) {
        rp.combatant.pos.set(s.pos.x, s.pos.y, s.pos.z);
        rp.combatant.alive = s.alive;
        rp.combatant.hp = s.hp;
        rp.combatant.crouch = s.crouch;
        rp.combatant.prone = s.prone;
        rp.combatant.team = s.team;
      }
      // 位置插值
      if (rp.mesh) {
        const lerpFactor = Math.min(1, dt * 15); // 平滑因子
        rp.mesh.root.position.lerp(rp.lerpPos, lerpFactor);
        // 朝向平滑
        const targetYaw = rp.lerpYaw + Math.PI; // 模型面朝方向
        let dy = targetYaw - rp.mesh.root.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        rp.mesh.root.rotation.y += dy * Math.min(1, dt * 12);
      }

      // 创建/重建网格
      if (!rp.mesh && s.team !== undefined) {
        this.createRemoteMesh(rp);
      }

      // 更新网格可见性
      if (rp.mesh) {
        const shouldShow = s.alive && s.pos && !s.onVehicle;
        if (rp.mesh.root.visible !== shouldShow) {
          rp.mesh.root.visible = shouldShow;
        }
        // 更新名字标签
        if (rp.nameTag) {
          rp.nameTag.position.copy(rp.mesh.root.position);
          rp.nameTag.position.y += 2.2;
          rp.nameTag.visible = shouldShow;
        }
      }

      // 更新玩家动画
      if (rp.mesh && s.alive) {
        this.updateRemoteAnimation(rp, dt);
      }
    }
  },

  createRemoteMesh(rp) {
    const s = rp.state;
    try {
      rp.mesh = buildSoldierMesh(s.team, '玩家');
      // 设定颜色标记远程玩家
      rp.mesh.tag.material.color.set(s.team === 0 ? 0x88bbff : 0xff9988);
      scene.add(rp.mesh.root);
      rp.mesh.root.position.copy(s.pos || V3(0, 1, 0));

      // 名字标签
      const tagCanvas = document.createElement('canvas');
      tagCanvas.width = 128;
      tagCanvas.height = 32;
      const ctx = tagCanvas.getContext('2d');
      ctx.fillStyle = s.team === 0 ? '#88bbff' : '#ff9988';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rp.id, 64, 20);
      const tagTex = new THREE.CanvasTexture(tagCanvas);
      const tagMat = new THREE.SpriteMaterial({ map: tagTex, transparent: true, depthTest: false });
      rp.nameTag = new THREE.Sprite(tagMat);
      rp.nameTag.scale.set(1.8, 0.45, 1);
      rp.nameTag.position.copy(rp.mesh.root.position);
      rp.nameTag.position.y += 2.2;
      scene.add(rp.nameTag);
    } catch (e) {
      console.error('[MP] 创建远程玩家模型失败:', e);
    }
  },

  updateRemoteAnimation(rp, dt) {
    if (!rp.mesh) return;
    const s = rp.state;
    const m = rp.mesh;
    const speed = s.vel ? Math.hypot(s.vel.x || 0, s.vel.z || 0) : 0;
    rp._animT = (rp._animT || 0) + dt * (3 + speed * 1.9);
    const t = rp._animT;
    const moving = speed > 0.4 && s.onGround;

    if (s.prone) {
      const sw = Math.min(speed / 1.2, 1) * 0.35;
      m.pelvis.position.y = dampF(m.pelvis.position.y, 0.22, 12, dt);
      m.pelvis.rotation.x = dampF(m.pelvis.rotation.x, 1.5, 8, dt);
      m.legL.hip.rotation.x = dampF(m.legL.hip.rotation.x, 0.04 + Math.sin(t) * sw * 0.5, 10, dt);
      m.legR.hip.rotation.x = dampF(m.legR.hip.rotation.x, 0.04 - Math.sin(t) * sw * 0.5, 10, dt);
    } else if (s.crouch) {
      m.pelvis.position.y = dampF(m.pelvis.position.y, 0.6, 12, dt);
      m.pelvis.rotation.x = dampF(m.pelvis.rotation.x, 0.14, 8, dt);
      m.legL.hip.rotation.x = dampF(m.legL.hip.rotation.x, -1.05, 10, dt);
      m.legR.hip.rotation.x = dampF(m.legR.hip.rotation.x, -0.5, 10, dt);
      m.legL.knee.rotation.x = dampF(m.legL.knee.rotation.x, 1.3, 10, dt);
      m.legR.knee.rotation.x = dampF(m.legR.knee.rotation.x, 0.95, 10, dt);
    } else {
      const sw = Math.min(speed / 4, 1.3) * 0.62;
      const runB = moving ? sw : 0;
      m.pelvis.position.y = dampF(m.pelvis.position.y, 0.94 + runB * (Math.abs(Math.cos(t)) * 0.06 - 0.036), 12, dt);
      m.pelvis.rotation.x = dampF(m.pelvis.rotation.x, 0.05, 8, dt);
      const gait = (ph) => {
        const s2 = Math.sin(ph);
        return [
          (s2 > 0 ? s2 * 1.0 : s2 * 0.72) * sw * 0.85,
          Math.pow(Math.max(0, Math.sin(ph - 2.85)), 1.15) * 1.45 * sw + 0.07
        ];
      };
      const [hL, kL] = gait(t), [hR, kR] = gait(t + Math.PI);
      m.legL.hip.rotation.x = hL; m.legR.hip.rotation.x = hR;
      m.legL.knee.rotation.x = kL; m.legR.knee.rotation.x = kR;
    }
  },

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
    // 枪口闪光
    if (typeof spawnP === 'function') {
      spawnP(PT.flash, origin.x, origin.y, origin.z,
        dir.x * 2, dir.y * 2, dir.z * 2, 0.3, 3, 0.08, 0.5, 0, true);
    }
    // 声音
    try {
      AudioSys.gunshot(WPN_DEFS[wpnKey] ? WPN_DEFS[wpnKey].snd : 'rifle', 0, 0);
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
  if (!player.alive || !player.deployed) return;
  showScorePop('新玩家加入: ' + (msg.name || msg.id));
  
  // 为远程玩家创建可被子弹检测的 combatant 实体
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
      crouch: false,
      prone: false,
      onVehicle: null,
      onMG: null,
      kills: 0,
      deaths: 0,
      score: 0,
      damage: function(amt, attacker, isHead) {
        this.hp -= amt;
        if (this.hp <= 0) {
          this.hp = 0;
          this.alive = false;
          if (attacker && attacker.isPlayer) {
            // 本地玩家击杀了远程玩家, 通知网络
            NET.sendDamage(this.remoteId, amt, isHead);
          }
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

function onRemoteVehicleEnter(msg) {}

function onRemoteVehicleLeave(msg) {}

function onRemoteWeaponChange(msg) {}

// 重载 showScorePop 以支持网络聊天显示
const _origShowScorePop = typeof showScorePop === 'function' ? showScorePop : null;
