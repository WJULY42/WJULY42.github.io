'use strict';
// ===== 载具战相机: 坦克/飞机/运兵车第三人称 + 车长镜 + 简化死亡视角 =====
const DEATH_QUOTES=[
'"战争没有胜利者，只有不同程度的失败者。" —— 张伯伦',
'"老兵永远不死，只是慢慢凋零。" —— 麦克阿瑟',
'"战争是死神的盛宴。" —— 欧洲谚语',
'"你可能不关心战争，但战争关心你。" —— 托洛茨基',
'"子弹是不长眼睛的，但开枪的人长着眼睛。" —— 无名步兵',
'"战场上没有无神论者。" —— 战地记者威廉·卡明斯',
'"勇气不是不恐惧，而是明知恐惧仍然前进。" —— 巴顿',
'"我不知道第三次世界大战用什么武器，但第四次一定用石头和木棍。" —— 爱因斯坦',
'"士兵的墓碑，是和平最沉重的基石。" —— 佚名',
'"钢铁会生锈，土地会愈合，人心的弹孔不会。" —— 佚名',
'"将军们在地图上移动的每一寸，都是士兵用身体丈量的。" —— 前线通讯员',
];
function pickDeathQuote(){
const el2=document.getElementById('deathQuote');
if(!el2) return;
el2.textContent=DEATH_QUOTES[randi(0,DEATH_QUOTES.length-1)];
el2.style.opacity='0';
}
function deathOverlayUpdate(t,dur){
const black=document.getElementById('blackOv');
const k1=clamp((t-(dur-1.7))/1.3,0,1);
black.style.opacity=(k1*k1*0.96).toFixed(3);
const q=document.getElementById('deathQuote');
if(q){
const fadeIn=clamp((t-1.0)/0.6,0,1);
const fadeOut=1-clamp((t-(dur-0.35))/0.35,0,1);
q.style.opacity=(fadeIn*fadeOut).toFixed(2);
}
if(t>=dur+0.2&&!player._deployShown&&!player.alive&&!matchOver){
player._deployShown=true;
showDeploy(true);
}
}
function updateCamera(dt){
const p=player;
if(!p.alive){
// 死亡: 高视角环顾战场 + 渐黑 + 名言
p.deathCamT-=dt;
const t=nowT*0.06;
camera.position.set(Math.sin(t)*70,36,Math.cos(t)*70);
camera.lookAt(0,4,0);
if(p.deathCamDur) deathOverlayUpdate(p.deathCamDur-p.deathCamT,p.deathCamDur);
return;
}
if(p.onVehicle&&p.onVehicle.kind==='apc'){
const t=p.onVehicle;
camTrauma=Math.max(0,camTrauma-dt*2.2);
const sh=camTrauma*camTrauma*0.04;
const anchor=V3(t.pos.x,t.pos.y+2.4,t.pos.z);
camera.rotation.order='YXZ';
camera.rotation.set(p.pitch+Math.sin(nowT*53)*sh, p.yaw+Math.sin(nowT*67)*sh, 0);
const fwdV=V3(-Math.sin(p.yaw)*Math.cos(p.pitch),Math.sin(p.pitch),-Math.cos(p.yaw)*Math.cos(p.pitch));
const back=fwdV.clone().negate(); back.y+=0.32; back.normalize();
let camD=9;
const hit=raycastWorld(anchor,back,camD);
if(hit) camD=Math.max(2.4,hit.dist-0.5);
camera.position.copy(anchor).addScaledVector(back,camD);
camera.fov=dampF(camera.fov,70,10,dt);
camera.updateProjectionMatrix();
return;
}
if(p.onVehicle){
const t=p.onVehicle;
camTrauma=Math.max(0,camTrauma-dt*2.2);
const sh=camTrauma*camTrauma*0.04;
if(t.kind==='plane'){
if(t.gunView){
// 机炮镜: 机头第一人称, 正对机炮瞄准方向
const dir=t.gunDir();
const anchor=t.pos.clone().addScaledVector(dir,2.2).add(V3(0,0.15,0));
camera.position.copy(anchor);
camera.lookAt(anchor.x+dir.x*60,anchor.y+dir.y*60,anchor.z+dir.z*60);
camera.fov=dampF(camera.fov,40,10,dt);
camera.updateProjectionMatrix();
document.getElementById('scopeOv').style.display='block';
return;
}
document.getElementById('scopeOv').style.display='none';
const fd=t.fwdDir();
const anchor=V3(t.pos.x,t.pos.y,t.pos.z);
const back=fd.clone().negate(); back.y+=0.34; back.normalize();
camera.position.copy(anchor).addScaledVector(back,13).add(V3(Math.sin(nowT*53)*sh,Math.sin(nowT*67)*sh,0));
camera.lookAt(anchor.x+fd.x*22,anchor.y+fd.y*22,anchor.z+fd.z*22);
camera.fov=dampF(camera.fov,72+t.speed*0.2,6,dt);
camera.updateProjectionMatrix();
return;
}
if(p.tankView){
t.pitchG.visible=false;
const a=t.yaw+t.turretYaw;
camera.rotation.order='YXZ';
camera.rotation.set(p.pitch+Math.sin(nowT*53)*sh*0.5, p.yaw+Math.sin(nowT*67)*sh*0.5, 0);
camera.position.set(t.pos.x+Math.sin(a)*1.8, t.pos.y+1.95, t.pos.z+Math.cos(a)*1.8);
camera.fov=dampF(camera.fov,30,10,dt);
camera.updateProjectionMatrix();
document.getElementById('scopeOv').style.display='block';
return;
}
document.getElementById('scopeOv').style.display='none';
if(t.pitchG) t.pitchG.visible=true;
const anchor=V3(t.pos.x,t.pos.y+2.6,t.pos.z);
camera.rotation.order='YXZ';
camera.rotation.set(p.pitch+Math.sin(nowT*53)*sh, p.yaw+Math.sin(nowT*67)*sh, 0);
const fwdV=V3(-Math.sin(p.yaw)*Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw)*Math.cos(p.pitch));
const back=fwdV.clone().negate(); back.y+=0.35; back.normalize();
let camD=10.5;
const hit=raycastWorld(anchor,back,camD);
if(hit) camD=Math.max(2.5,hit.dist-0.5);
camera.position.copy(anchor).addScaledVector(back,camD);
camera.fov=dampF(camera.fov,68,10,dt);
camera.updateProjectionMatrix();
return;
}
// 兜底(不应出现): 上帝视角
const t=nowT*0.05;
camera.position.set(Math.sin(t)*80,42,Math.cos(t)*80);
camera.lookAt(0,2,0);
}
