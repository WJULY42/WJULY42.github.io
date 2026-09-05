'use strict';
// ===================== 输入 (纯载具) =====================
const keys={};
let pointerLocked=false;
// ===== 输入动作抽象层: 键鼠与触控共用 =====
const InputActions={
toggleCrouch(){ // C: 坦克炮手镜/飞机机炮镜切换
if(player.onVehicle&&player.onVehicle.kind==='tank'){ player.tankView=!player.tankView; }
else if(player.onVehicle&&player.onVehicle.kind==='plane'){ player.onVehicle.gunView=!player.onVehicle.gunView; }
},
dropBomb(){ // B: 飞机投弹
if(player.onVehicle&&player.onVehicle.kind==='plane'){ /* 由 Plane.playerFly 处理 keys.KeyB */ }
},
};
addEventListener('keydown',e=>{
if(document.activeElement&&document.activeElement.id==='chatBox') return;
if(e.code==='Tab'){ e.preventDefault(); document.getElementById('scoreboard').style.display='block'; updateScoreboard(); }
if(e.repeat) return;
keys[e.code]=true;
if(!player.alive||!pointerLocked) return;
if(e.code==='KeyC') InputActions.toggleCrouch();
if(e.code==='KeyF'){ /* 载具战: 无下车互动 */ }
});
addEventListener('keyup',e=>{
if(document.activeElement&&document.activeElement.id==='chatBox') return;
keys[e.code]=false;
if(e.code==='Tab') document.getElementById('scoreboard').style.display='none';
});
let mouseDown=false, mouse2Down=false;
addEventListener('mousedown',e=>{
if(!pointerLocked){ return; }
if(e.button===0) mouseDown=true;
if(e.button===2){ mouse2Down=true; if(!(player.onVehicle&&player.onVehicle.kind==='plane')){ if(SETTINGS.adsToggle) player.ads=!player.ads; else player.ads=true; } }
});
addEventListener('mouseup',e=>{
if(e.button===0) mouseDown=false;
if(e.button===2){ mouse2Down=false; if(!SETTINGS.adsToggle) player.ads=false; }
});
addEventListener('contextmenu',e=>e.preventDefault());
let lockGraceUntil=0;
addEventListener('mousemove',e=>{
if(!pointerLocked||!player.alive) return;
if(performance.now()<lockGraceUntil) return;
let mx=e.movementX, my=e.movementY;
if(!isFinite(mx)||!isFinite(my)) return;
if(mx>160)mx=160; else if(mx<-160)mx=-160;
if(my>160)my=160; else if(my<-160)my=-160;
const isPlane=player.onVehicle&&player.onVehicle.kind==='plane';
const zoomFac=isPlane?1:(player.ads?0.81:1);
const s=0.0022*SETTINGS.sens*zoomFac;
if(isPlane){
// 飞机: 鼠标控制机炮瞄准方向(枪口相对机头偏移)
const pl=player.onVehicle;
pl.gunYaw=clamp((pl.gunYaw||0)-mx*s,-1.2,1.2);
pl.gunPitch=clamp((pl.gunPitch||0)-my*s,-0.9,0.9);
} else {
player.yaw-=mx*s;
player.pitch-=my*s;
player.pitch=clamp(player.pitch,-1.45,1.45);
}
player.mouseDX=mx; player.mouseDY=my;
});
document.addEventListener('pointerlockchange',()=>{
if(MOBILE) return;
pointerLocked=document.pointerLockElement===renderer.domElement;
lockGraceUntil=performance.now()+120;
if(!pointerLocked&&player.alive&&player.deployed&&!matchOver){
showDeploy(false);
}
});
function lockPointer(){
if(MOBILE){ pointerLocked=true; return; }
try{ const r=renderer.domElement.requestPointerLock(); if(r&&r.catch) r.catch(()=>{}); }catch(e){}
}
