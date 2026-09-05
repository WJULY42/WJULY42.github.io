'use strict';
function loop(){
if(typeof NET!=='undefined'&&NET.connected&&NET.isHost){
setTimeout(loop,16);
} else {
requestAnimationFrame(loop);
}
if(document.hidden && !(typeof NET!=='undefined'&&NET.connected&&NET.isHost)) return;
const now=performance.now();
let dt=Math.min((now-lastT)/1000,0.05);
lastT=now;
nowT=now/1000;
if(typeof MP!=='undefined'&&MP.enabled) MP.update(dt);
fpsAcc+=1/Math.max(dt,0.001); fpsN++;
if(fpsN>=30){ fpsShow=Math.round(fpsAcc/fpsN); fpsAcc=0; fpsN=0; el('fps').textContent=fpsShow+' FPS'; }
gunEvents=gunEvents.filter(e=>nowT-e.t<0.6);
NAV.budget=2;
updateNavDirty(dt);
if(MOBILE&&window.updateTouchVis) updateTouchVis();
updatePlayer(dt);
updateCamera(dt);
updateSunShadow();
if(SKY) SKY.position.copy(camera.position);
updateWeather(dt);
updateSmokes(dt);
// 客户端: 仅更新自己正在驾驶的载具, 其余载具由主机世界快照镜像(避免双重模拟)
for(const t of tanks){ if(MP.isClient && t!==player.onVehicle) continue; t.update(dt); }
for(const a of apcs){ if(MP.isClient && a!==player.onVehicle) continue; a.update(dt); }
for(const pl of planes){ if(MP.isClient && pl!==player.onVehicle) continue; pl.update(dt); }
// AI工事自动索敌开火
updateEmplacements(dt);
updateMortars(dt);
// 树倒动画
for(let i=fTrees.length-1;i>=0;i--){
const ft=fTrees[i];
ft.tilt+=dt*2.6;
if(ft.tilt>=1.45){
ft.tilt=1.45;
for(const m2 of ft.meshes) world.remove(m2);
fTrees.splice(i,1);
continue;
}
const angle=ft.tilt, ax=ft.fallX*angle, az=ft.fallZ*angle;
for(const m2 of ft.meshes){
const dx=m2.position.x-ft.x;
const dz=m2.position.z-ft.z;
const dy=m2.position.y-ft.gy;
const c2=Math.cos(angle), s2=Math.sin(angle);
m2.position.x=ft.x+dx*(c2+ax*ax*(1-c2))+dz*ax*az*(1-c2);
m2.position.z=ft.z+dz*(c2+az*az*(1-c2))+dx*ax*az*(1-c2);
m2.position.y=ft.gy+dy*c2;
m2.rotation.set(0,0,Math.atan2(ft.fallX,ft.fallZ?1:0));
}
}
updatePlaneWrecks(dt);
updateShells(dt);
updateFlak(dt);
updateNades(dt);
updateMissiles(dt);
updateParticles(dt);
updateTracers(dt);
updateCasings(dt);
updateBloodDecals(dt);
if(!MP.isClient) updateFlags(dt);
if(flashTimer>0){ flashTimer-=dt; if(flashTimer<=0) flashLight.intensity=0; }
player.mouseDX*=Math.pow(0.0001,dt*3);
player.mouseDY*=Math.pow(0.0001,dt*3);
updateHUD(dt);
renderer.clear();
renderer.render(scene,camera);
if(!player.alive&&player.deployed&&!matchOver){
respawnCd=Math.max(0,respawnCd-dt);
el('respawnTxt').textContent=respawnCd>0?('('+Math.ceil(respawnCd)+')'):'';
const btn=el('deployBtn');
btn.disabled=respawnCd>0;
if(nowT%0.5<0.1) drawDeployMap();
}
}
