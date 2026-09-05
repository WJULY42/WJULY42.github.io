'use strict';
const MORTARS=[];
let wires=[]; function isWire(x,z){for(const w of wires){if(Math.hypot(w.x-x,w.z-z)<w.r) return w;}return null;}
// ===== 世界迫击炮阵地 (AI自动炮击) =====
function worldMortar(x,z,face,team){
const gh=heightAt(x,z);
const grp=new THREE.Group();
grp.position.set(x,gh,z); grp.rotation.y=face;
world.add(grp);
const base=new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.34,0.09,10),vmMats.gun);
base.position.set(0,0.05,-0.1); base.rotation.x=0.08; grp.add(base);
const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.056,0.062,0.78,8),vmMats.gun);
tube.position.set(0,0.42,0.06); tube.rotation.x=0.62; grp.add(tube);
const ring=new THREE.Mesh(new THREE.TorusGeometry(0.064,0.012,6,10),vmMats.gunL);
ring.position.set(0,0.42+Math.cos(0.62)*0.39,0.06+Math.sin(0.62)*0.39);
ring.rotation.x=0.62+HPI; grp.add(ring);
const bipL=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.42,5),vmMats.gunL);
bipL.position.set(-0.15,0.28,0.3); bipL.rotation.z=0.4; bipL.rotation.x=-0.22; grp.add(bipL);
const bipR=new THREE.Mesh(new THREE.CylinderGeometry(0.018,0.018,0.42,5),vmMats.gunL);
bipR.position.set(0.15,0.28,0.3); bipR.rotation.z=-0.4; bipR.rotation.x=-0.22; grp.add(bipR);
const cross=new THREE.Mesh(new THREE.CylinderGeometry(0.014,0.014,0.32,5),vmMats.gunL);
cross.position.set(0,0.34,0.28); cross.rotation.z=HPI; grp.add(cross);
grp.traverse(o=>{ if(o.isMesh) o.castShadow=true; });
coverPoints.push({x,z});
MORTARS.push({x,z,y:gh,face,team,grp,tube,cd:rand(2,6),target:null,tMemT:0,retargetT:0,aimT:0,alive:true});
}
function mortarFireAI(m,tgt){
// 高抛曲射弹: 抬起炮管, 朝目标抛物线投弹
const team=m.team;
const o=V3(m.x,m.y+0.9,m.z);
const dx=tgt.pos.x-m.x, dz=tgt.pos.z-m.z;
const dh=Math.max(Math.hypot(dx,dz),8);
const dir=V3(dx/dh,0,dz/dh);
// 抛射初速: 依据距离选弹道 (v_h = R/t, t≈2*v_up/g, v_up≈24)
const vup=24;
const t=2*vup/9.8;
const vh=clamp(dh/t,14,46);
const vel=V3(dir.x*vh,Math.max(vup,10),dir.z*vh);
AudioSys.mortarThunk(dh);
const shell=new THREE.Mesh(nadeGeoAT,vmMats.gun);
shell.castShadow=true; shell.position.copy(o); scene.add(shell);
const crew={ name:'迫击炮', team, kills:0, deaths:0, score:0, isPlayer:false, isCrew:true, pos:V3(m.x,m.y,m.z), alive:true, lastFiredT:nowT, damage(){}, vel:V3() };
nades.push({m:shell,pos:o.clone(),vel,fuse:9,thrower:crew,team,spin:V3(3,0,0.5),bounces:0,mortar:true});
spawnP(PT.dark,o.x,o.y,o.z,dir.x,1.5,dir.z,0.6,2,0.7,0.6,0.3);
}
function updateMortars(dt){
for(const m of MORTARS){
m.cd-=dt; m.tMemT-=dt; m.retargetT-=dt;
let tgt=m.target&&m.target.alive!==false?m.target:null;
if((!tgt&&m.tMemT<=0)||m.retargetT<=0){
m.retargetT=1.2;
let best=null,bs=-1e9;
const cand=[...(typeof tanks!=='undefined'?tanks:[]),...(typeof apcs!=='undefined'?apcs:[])];
for(const t of cand){
if(!t.alive||t.team===m.team) continue;
const d=Math.hypot(t.pos.x-m.x,t.pos.z-m.z);
if(d>240) continue;
const sc=170-d*0.4;
if(sc>bs){ bs=sc; best=t; }
}
if(best){ m.target=best; m.tMemT=4; } else m.target=null;
}
if(tgt&&m.cd<=0){
// 距目标越近越准; 弹着散布随距离增大
const d=Math.max(Math.hypot(tgt.pos.x-m.x,tgt.pos.z-m.z),8);
mortarFireAI(m,tgt);
m.cd=clamp(4+d*0.03,5,11);
}
}
}
// 世界部署: 每个旗点后方各一门迫击炮 + 各旗点机枪 (延迟到所有脚本加载后执行)
function deployWorldArtillery(){
FLAGS.forEach((f,i)=>{
const bx=BASES[i%2];
const dx=f.x-bx.x, dz=f.z-bx.z;
const bl=Math.hypot(dx,dz)||1;
// 炮位归属: 面向那侧基地即为该方炮阵地
worldMortar(f.x-dx/bl*55,f.z-dz/bl*55,Math.atan2(dx,dz),i%2);
});
FLAGS.forEach((f,i)=>{
const tgt=BASES[i%2];
const face=Math.atan2(f.x-tgt.x,f.z-tgt.z);
mg42(f.x+rand(-9,9),f.z+rand(-9,9),face);
});
if(FLAGS.length>=3){
const fm=FLAGS[Math.floor(FLAGS.length/2)];
mg42(fm.x+rand(-14,14),fm.z+rand(-14,14),rand(0,TAU));
}
}
buildOccupancy();
buildSpatialIndex();
