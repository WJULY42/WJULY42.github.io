'use strict';
// ===================== 反坦克炮 / 防空炮 (AI自动操控) =====================
// 载具战: 工事由AI自动索敌开火, 不再需要步兵上炮
const ATGUNS=[], AAGUNS=[];
function atGun(x,z,face,team){
const g0=heightAt(x,z);
sandbagWall(x-Math.sin(face)*1.6,z-Math.cos(face)*1.6,3.5,face);
const grp=new THREE.Group(); grp.position.set(x,g0+0.85,z); grp.rotation.y=face;
const yaw=new THREE.Group(); grp.add(yaw);
const pitch=new THREE.Group(); yaw.add(pitch);
const shield=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.95,0.06),MAT.metal);
shield.position.set(0,0.15,0.35); yaw.add(shield);
const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.08,2.6,8),vmMats.gun);
barrel.rotation.x=HPI; barrel.position.z=1.3; pitch.add(barrel);
pitch.add(new THREE.Mesh(new THREE.BoxGeometry(0.32,0.3,0.6),vmMats.gunL));
const wl=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,0.12,12),vmMats.gunL);
wl.rotation.z=HPI; wl.position.set(0.75,-0.35,0); grp.add(wl);
const wr2=wl.clone(); wr2.position.x=-0.75; grp.add(wr2);
grp.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
world.add(grp);
CYLS.push({x,z,r:0.6,y0:g0,y1:g0+1.2});
ATGUNS.push({x,z,y:g0+0.85,face,team,grp,yaw,pitch,cd:0,kind:'at',target:null,tMemT:0,retargetT:0,aimT:0});
}
function aaGun(x,z,team){
const g0=heightAt(x,z);
const grp=new THREE.Group(); grp.position.set(x,g0+1.15,z);
const yaw=new THREE.Group(); grp.add(yaw);
const pitch=new THREE.Group(); pitch.position.y=0.1; yaw.add(pitch);
const b1=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,1.7,8),vmMats.gun);
b1.rotation.x=HPI; b1.position.set(0.22,0,0.85); pitch.add(b1);
const b2=b1.clone(); b2.position.x=-0.22; pitch.add(b2);
pitch.add(new THREE.Mesh(new THREE.BoxGeometry(0.7,0.35,0.7),vmMats.gunL));
const ped=new THREE.Mesh(new THREE.CylinderGeometry(0.2,0.28,1.1,8),vmMats.gunL);
ped.position.y=-0.6; grp.add(ped);
const base=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.0,0.18,10),MAT.metal);
base.position.y=-1.1; grp.add(base);
grp.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
world.add(grp);
CYLS.push({x,z,r:0.7,y0:g0,y1:g0+1.4});
AAGUNS.push({x,z,y:g0+1.25,team,grp,yaw,pitch,cd:0,kind:'aa',target:null,tMemT:0,retargetT:0,aimT:0});
}
// 反坦克炮/防空炮: 按旗点间隔与基地通用摆放
// 工事归属: 靠近那侧基地即为该方; 中点为双方共争(归0方, 但只打敌人)
for(let i=0;i<FLAGS.length-1;i++){
const a=FLAGS[i], b=FLAGS[i+1];
const gx=(a.x+b.x)/2+rand(-8,8), gz=(a.z+b.z)/2+rand(-8,8);
const gTeam=Math.hypot(gx-BASES[0].x,gz-BASES[0].z)<Math.hypot(gx-BASES[1].x,gz-BASES[1].z)?0:1;
atGun(gx,gz,Math.atan2(b.x-a.x,b.z-a.z)+HPI*(i%2?1:-1),gTeam);
}
if(FLAGS.length>2){ const gx=FLAGS[0].x+rand(-12,12), gz=FLAGS[0].z+rand(-12,12); atGun(gx,gz,rand(0,TAU),Math.hypot(gx-BASES[0].x,gz-BASES[0].z)<Math.hypot(gx-BASES[1].x,gz-BASES[1].z)?0:1); }
aaGun(BASES[0].x+(BASES[0].x<0?10:-10),10,0);
aaGun(BASES[1].x+(BASES[1].x<0?10:-10),-10,1);
{ const fm=FLAGS[Math.floor(FLAGS.length/2)]; aaGun(fm.x+rand(-10,10),fm.z+rand(-10,10),Math.hypot(fm.x-BASES[0].x,fm.z-BASES[0].z)<Math.hypot(fm.x-BASES[1].x,fm.z-BASES[1].z)?0:1); }
NAV.refresh();
function findFreeSpawn(x,z){
for(let r=0;r<7;r++){
for(let i=0;i<8;i++){
const px=x+rand(-2,2)+Math.cos(i*0.785)*r*1.6, pz=z+rand(-2,2)+Math.sin(i*0.785)*r*1.6;
if(!occBlocked(px,pz)) return [px,pz];
}
}
return [x,z];
}
// ===== AI 索敌与开火 =====
// 反坦克炮: 攻击最近的敌坦克/装甲
function atAITarget(gun){
let best=null,bs=-1e9,bd=0;
const cand=[...(typeof tanks!=='undefined'?tanks:[]),...(typeof apcs!=='undefined'?apcs:[])];
for(const t of cand){
if(!t.alive||t.team===gun.team) continue;
const d=Math.hypot(t.pos.x-gun.x,t.pos.z-gun.z);
if(d<320){ const sc=260-d*0.5; if(sc>bs){ bs=sc; best=t; bd=d; } }
}
return {v:best,d:bd};
}
// 防空炮: 攻击最近的敌机
function aaAITarget(gun){
let best=null,bs=-1e9,bd=0;
for(const p of (typeof planes!=='undefined'?planes:[])){
if(!p.alive||p.team===gun.team) continue;
const d=Math.hypot(p.pos.x-gun.x,p.pos.z-gun.z);
if(d<320){ const sc=260-d*0.4; if(sc>bs){ bs=sc; best=p; bd=d; } }
}
return {v:best,d:bd};
}
function updateEmplacements(dt){
// ---- 反坦克炮 ----
for(const gun of ATGUNS){
gun.cd-=dt; gun.tMemT-=dt; gun.retargetT-=dt; gun.aimT-=dt;
let tgt=gun.target&&gun.target.alive!==false?gun.target:null;
if((!tgt&&gun.tMemT<=0)||gun.retargetT<=0){
gun.retargetT=0.5;
const r=atAITarget(gun);
if(r.v){ tgt=r.v; gun.target=r.v; gun.tMemT=5; }
else { gun.target=null; }
}
if(!tgt) continue;
const tx=tgt.pos.x+(Math.sin(tgt.yaw||0)*(tgt.vel||0)*clamp(gun.tMemT>0?Math.hypot(tgt.pos.x-gun.x,tgt.pos.z-gun.z)/150:0,0,1));
const tz=tgt.pos.z+(Math.cos(tgt.yaw||0)*(tgt.vel||0)*clamp(gun.tMemT>0?Math.hypot(tgt.pos.x-gun.x,tgt.pos.z-gun.z)/150:0,0,1));
const wantY=Math.atan2(tx-gun.x,tz-gun.z);
const dh=Math.hypot(tx-gun.x,tz-gun.z);
const wantP=clamp(Math.atan2((tgt.pos.y+1.0)-(gun.y+0.3),Math.max(dh,2)),-0.2,0.35);
const dy=angDiff((gun.yaw.rotation.y)+gun.face,wantY);
gun.yaw.rotation.y=angleLerpTo(gun.yaw.rotation.y, wantY-gun.face, 0.9*dt);
gun.pitch.rotation.x=angleLerpTo(gun.pitch.rotation.x, wantP, 0.9*dt);
if(gun.aimT<=0&&Math.abs(angDiff((gun.yaw.rotation.y)+gun.face,wantY))<0.1&&Math.abs(gun.pitch.rotation.x-wantP)<0.1&&gun.cd<=0&&dh>6){
gun.aimT=1.2; gun.cd=22;
// 大削精准度: 散布随距离增大, 远距离经常脱靶; 对移动目标提前量不再精确
const spread=(0.02+dh*0.00011)*0.4;
const sy=wantY+rand(-1,1)*spread*2.5;
const spd=clamp(wantP+rand(-1,1)*spread*1.5,-0.3,0.45);
const o=V3(gun.x+Math.sin(wantY)*2.2,gun.y+0.35,gun.z+Math.cos(wantY)*2.2);
const dir=V3(Math.sin(sy)*Math.cos(spd),Math.sin(spd),Math.cos(sy)*Math.cos(spd));
AudioSys.cannon(dh*1.3);
spawnP(PT.flash,o.x,o.y,o.z,dir.x*3,dir.y*3,dir.z*3,1.0,10,0.12,1,0,true);
spawnP(PT.dark,o.x,o.y,o.z,dir.x*3+rand(-1,1),1.5,dir.z*3+rand(-1,1),1.0,3,0.9,0.7,0.5);
const crew={ name:'反坦克炮', team:gun.team, kills:0, deaths:0, score:0, isPlayer:false, isCrew:true, pos:V3(gun.x,gun.y,gun.z), alive:true, lastFiredT:nowT, damage(){}, vel:V3() };
shells.push({pos:o.clone(),vel:dir.clone().multiplyScalar(135),team:gun.team,owner:crew,life:4,kind:'at',dmgV:320,pen:150,trail:0});
}
}
// ---- 重机枪 (MG42/M1919等) ----
for(const mg of (typeof MG42S!=='undefined'?MG42S:[])){
mg.heat=Math.max(0,mg.heat-dt*0.2); mg.retargetT=(mg.retargetT||0)-dt;
let tgt=mg.target&&mg.target.alive!==false?mg.target:null;
if(!tgt||mg.retargetT<=0){
mg.retargetT=0.6;
let best=null,bs=-1e9;
const cand=[...(typeof tanks!=='undefined'?tanks:[]),...(typeof apcs!=='undefined'?apcs:[])];
for(const t of cand){
if(!t.alive||t.team===mg.team) continue;
const d=Math.hypot(t.pos.x-mg.x,t.pos.z-mg.z);
if(d<100){ const sc=80-d*0.3; if(sc>bs){ bs=sc; best=t; } }
}
if(best) mg.target=best;
else mg.target=null;
}
if(!tgt) continue;
const wantY=Math.atan2(tgt.pos.x-mg.x,tgt.pos.z-mg.z);
const wantP=clamp(Math.atan2((tgt.pos.y+1)-(mg.y+0.15),Math.max(Math.hypot(tgt.pos.x-mg.x,tgt.pos.z-mg.z),2)),-0.2,0.15);
mg.yaw.rotation.y=angleLerpTo(mg.yaw.rotation.y, wantY-mg.face, 3*dt);
mg.pitch.rotation.x=angleLerpTo(mg.pitch.rotation.x, -wantP, 3*dt);
if(mg.heat<1&&Math.abs(angDiff(mg.yaw.rotation.y,wantY-mg.face))<0.08&&Math.abs(mg.pitch.rotation.x+wantP)<0.08){
mg.heat+=0.06*dt;
if(Math.random()<0.04){
const dir=V3(Math.sin(wantY),0,Math.cos(wantY));
const muzz=mg.muzzle||V3(mg.x,mg.y+0.12,mg.z);
const muzz2=muzz.clone().addScaledVector(dir,0.5);
const crew={ name:'重机枪', team:mg.team, kills:0, deaths:0, score:0, isPlayer:false, isCrew:true, pos:V3(mg.x,mg.y,mg.z), alive:true, lastFiredT:nowT, damage(){}, vel:V3() };
fireBullet(crew,muzz2,dir,{dmg:mg.def.dmg||25,headMul:1.9,snd:'mg',tracer:2,vehDmg:12,atrPen:25},muzz2);
}
}
}
// ---- 防空炮 ----
for(const gun of AAGUNS){
gun.cd-=dt; gun.tMemT-=dt; gun.retargetT-=dt; gun.aimT-=dt;
let tgt=gun.target&&gun.target.alive!==false?gun.target:null;
if((!tgt&&gun.tMemT<=0)||gun.retargetT<=0){
gun.retargetT=0.4;
const r=aaAITarget(gun);
if(r.v){ tgt=r.v; gun.target=r.v; gun.tMemT=3.5; }
else { gun.target=null; }
}
if(!tgt) continue;
const tx=tgt.pos.x+Math.sin(tgt.yaw)*Math.cos(tgt.pitch)*tgt.speed*0.3;
const tz=tgt.pos.z+Math.cos(tgt.yaw)*Math.cos(tgt.pitch)*tgt.speed*0.3;
const ty=tgt.pos.y+Math.sin(tgt.pitch)*tgt.speed*0.3;
const wantY=Math.atan2(tx-gun.x,tz-gun.z);
const dh=Math.hypot(tx-gun.x,tz-gun.z);
const wantP=clamp(Math.atan2(ty-(gun.y+0.2),Math.max(dh,2)),-0.5,1.2);
gun.yaw.rotation.y=angleLerpTo(gun.yaw.rotation.y, wantY, 1.1*dt);
gun.pitch.rotation.x=angleLerpTo(gun.pitch.rotation.x, wantP, 1.1*dt);
if(gun.aimT<=0&&Math.abs(angDiff(gun.yaw.rotation.y,wantY))<0.16&&Math.abs(gun.pitch.rotation.x-wantP)<0.16&&gun.cd<=0){
gun.aimT=0.7; gun.cd=0.62;
// 大削: 散布增大, 提前量粗糙, 弹速下降
const sy=wantY+rand(-1,1)*0.05;
const sp=wantP+rand(-1,1)*0.05;
const dir=V3(Math.sin(sy)*Math.cos(sp),Math.sin(sp),Math.cos(sy)*Math.cos(sp));
const crew={ name:'防空炮', team:gun.team, kills:0, deaths:0, score:0, isPlayer:false, isCrew:true, pos:V3(gun.x,gun.y,gun.z), alive:true, lastFiredT:nowT, damage(){}, vel:V3() };
fireFlak(gun,crew,dir);
}
}
}
let nowT=0, matchOver=false, matchTime=15*60;
const tickets=[START_TICKETS,START_TICKETS];
let nadeWarnT=0;
