'use strict';
// ===================== 玩家 (载具指挥官) =====================
// 载具战: 玩家出生即在载具内; 载具被毁则阵亡回部署界面
const player = {
isPlayer:true, name:'你', team:0,
pos:V3(-118,1,0), vel:V3(), yaw:HPI, pitch:0,
hp:100, alive:false, deployed:false, onGround:true,
mouseDX:0, mouseDY:0,
lastDmgT:-99, deathT:0,
recoilPitch:0, recoilYaw:0,
kills:0, deaths:0, score:0, points:500,
suppressV:0,
onVehicle:null, tankView:false,
eyeH:1.62,
lastFiredT:-99, killerName:'',
suppress(a){ this.suppressV=Math.min(1,this.suppressV+a); },
damage(amt,attacker,isHead){
if(!this.alive||matchOver) return;
this.hp-=amt;
this.lastDmgT=nowT;
AudioSys.hurt();
dmgFlash=Math.min(1,dmgFlash+0.5);
addTrauma(0.25);
if(attacker){
const a=Math.atan2(attacker.pos.x-this.pos.x,attacker.pos.z-this.pos.z);
addDirHit(a);
}
if(this.hp<=0){
this.hp=0;
this.die(attacker,isHead);
}
},
die(attacker,isHead){
this.alive=false;
this.deaths++;
this.deathT=nowT;
tickets[this.team]=Math.max(0,tickets[this.team]-1);
this.killerName=attacker?(attacker.name||'敌军'):'';
if(attacker&&attacker!==this){ attacker.kills=(attacker.kills||0)+1; attacker.score=(attacker.score||0)+100; attacker.points=(attacker.points||0)+100; if(typeof poolShare==='function') poolShare(attacker.team,25); addKillfeed(attacker,this,false); }
if(typeof NET!=='undefined'&&NET.connected){
NET.sendDeath(attacker?(attacker.name||attacker.id):null);
}
this.onVehicle=null;
this.ads=false; this.braced=false;
document.exitPointerLock&&document.exitPointerLock();
// 载具战: 死亡即黑屏 + 部署冷却, 无布娃娃
this.deathCamDur=1.2;
this.deathCamT=this.deathCamDur;
this._deployShown=false;
this.deathCamYaw=this.yaw+Math.PI;
this.deathPos=this.pos.clone();
this.deathPos.y+=2;
respawnCd=8;
},
};
combatants.push(player);
