'use strict';
// ===================== 玩家更新 (纯载具驾驶) =====================
let camTrauma=0, dmgFlash=0;
function addTrauma(x){ camTrauma=Math.min(1.2,camTrauma+x); }
function updatePlayer(dt){
if(!player.alive) return;
const p=player;
p.suppressV=Math.max(0,p.suppressV-dt*0.8);
p.recoilPitch*=Math.pow(0.0001,dt*0.7);
p.recoilYaw*=Math.pow(0.0001,dt*0.7);
if(p.onVehicle){
if(p.onVehicle.kind==='plane') updatePlayerPlane(dt);
else if(p.onVehicle.kind==='apc') updatePlayerApcDriver(dt);
else updatePlayerTank(dt);
}
}
function updatePlayerTank(dt){
const p=player, t=p.onVehicle;
if(!t.alive){ p.onVehicle=null; p.tankView=false; return; }
const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
const turn=(keys.KeyD?1:0)-(keys.KeyA?1:0);
const spdMul=(t.engineHitT>0?0.35:1)*(t.crewDown&&t.crewDown('driver')?0:1);
t.vel=dampF(t.vel,(fwd<0?-t.def.rev:fwd*t.def.spd)*spdMul,2.5,dt);
t.yaw-=turn*t.def.turn*dt*(fwd<0?-1:1);
let wantTY=angDiff(t.yaw,p.yaw+Math.PI);
if(t.def.casemate){
wantTY=clamp(wantTY,-0.21,0.21);
}
t.turretYaw=angleLerpTo(t.turretYaw,wantTY,t.def.tRate*dt);
let wantPitch=clamp(p.pitch,-0.12,0.32);
if(p.tankView){
const cd=camForward(), co=camera.position.clone();
let D=320;
const wr2=raycastWorld(co,cd,D);
if(wr2) D=wr2.dist;
for(const t2 of tanks){
if(t2===t||!t2.alive) continue;
const r2=rayCyl(co,cd,{x:t2.pos.x,z:t2.pos.z,r:2.3,y0:t2.pos.y,y1:t2.pos.y+2.6},D);
if(r2) D=r2.t;
}
wantPitch=clamp(p.pitch+3.5*D/(2*130*130),-0.12,0.35);
}
t.turretPitch=dampF(t.turretPitch,wantPitch,6,dt);
p.fireT=0;
if(mouseDown&&t.cannonCd<=0&&!matchOver){ t.fireCannon(); }
if(mouse2Down&&!matchOver){
const cd=camForward();
const co=camera.position.clone();
let aimD=200;
const wr=raycastWorld(co,cd,aimD);
if(wr) aimD=wr.dist;
const aimP=co.addScaledVector(cd,aimD);
const dir=aimP.sub(t.coaxMuzzle()).normalize();
if(dir.dot(t.aimDir())>0.85){
dir.x+=rand(-0.012,0.012); dir.y+=rand(-0.009,0.009); dir.z+=rand(-0.012,0.012); dir.normalize();
t.firePlayerMG(dir);
}
}
p.pos.copy(t.pos);
p.vel.set(0,0,0);
const pip=document.getElementById('tankPip');
{
const dir2=t.aimDir();
const o2=t.muzzle.clone();
let D2=140;
const wr3=raycastWorld(o2,dir2,D2);
if(wr3) D2=wr3.dist;
const hitP=o2.addScaledVector(dir2,Math.max(6,D2));
const v=hitP.project(camera);
if(v.z<1){
pip.style.display='block';
pip.style.left=((v.x*0.5+0.5)*innerWidth)+'px';
pip.style.top=((1-(v.y*0.5+0.5))*innerHeight)+'px';
} else pip.style.display='none';
}
document.getElementById('mgPip').style.display='none';
document.getElementById('tankSight').style.display='block';
document.getElementById('heatFill').style.width=(clamp(1-t.cannonCd/t.def.reload,0,1)*100)+'%';
document.getElementById('heatFill').style.background=t.cannonCd<=0?'#8fd18f':'linear-gradient(90deg,#e8c56a,#e83a1a)';
}
function updatePlayerPlane(dt){
const p=player, pl=p.onVehicle;
if(!pl.alive){ p.onVehicle=null; return; }
document.getElementById('heatFill').style.width=(pl.bombs/pl.def.bombs*100)+'%';
document.getElementById('heatFill').style.background='#9fc0e8';
document.getElementById('tankSight').style.display='none';
document.getElementById('tankPip').style.display='none';
// 机炮准星: 投影机炮瞄准方向落点(第三人称时显示, 机炮镜时隐藏)
const pip=document.getElementById('mgPip');
if(!pl.gunView){
const dir=pl.gunDir();
const o=pl.pos.clone().addScaledVector(dir,2.4);
let D=220;
const wr=raycastWorld(o,dir,D);
if(wr) D=wr.dist;
const hitP=o.addScaledVector(dir,Math.max(5,D));
const v=hitP.project(camera);
if(v.z<1){
pip.style.display='block';
pip.style.left=((v.x*0.5+0.5)*innerWidth)+'px';
pip.style.top=((1-(v.y*0.5+0.5))*innerHeight)+'px';
} else pip.style.display='none';
} else pip.style.display='none';
}
function updatePlayerApcDriver(dt){
const p=player, a=p.onVehicle;
if(!a.alive){ p.onVehicle=null; return; }
const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
const turn=(keys.KeyD?1:0)-(keys.KeyA?1:0);
a.vel=dampF(a.vel,fwd<0?-a.def.rev:fwd*a.def.spd,2.5,dt);
a.yaw-=turn*a.def.turn*dt;
if(mouseDown&&!matchOver){ a.fireMG(camForward()); }
p.pos.copy(a.pos);
p.vel.set(0,0,0);
p.yaw=a.yaw+Math.PI;
document.getElementById('tankSight').style.display='none';
document.getElementById('tankPip').style.display='none';
document.getElementById('mgPip').style.display='none';
}
