'use strict';
// ===================== 移动端触控层开关 =====================
// 关键修复: 菜单/部署/结算界面(.screen)打开时, 全屏触控层(#touchUI 内含 #tLook)会盖在
// 菜单(z-index:20)之上并吃掉所有触摸, 导致手机端按钮点不动。故仅在"实战中"(无任何 .screen 可见)
// 才给 body 加 playing 类启用触控层, 其余界面一律隐藏触控层, 让按钮可正常点击。
(function(){
  const screens=['menu','deploy','end'];
  function syncPlaying(){
    const anyVisible=screens.some(id=>{const e=document.getElementById(id);return e&&!e.classList.contains('hidden');});
    document.body.classList.toggle('playing',!anyVisible);
  }
  syncPlaying();
  if(typeof MutationObserver!=='undefined'){
    const obs=new MutationObserver(syncPlaying);
    screens.forEach(id=>{const e=document.getElementById(id);if(e)obs.observe(e,{attributes:true,attributeFilter:['class']});});
  }
})();
// ===================== 移动端触控输入 (专用设计) =====================
// 核心设计:
// 1) 每根手指独立路由: 按钮 / 移动摇杆 / 视角, 互不抢占 —— 按住开火·瞄准时照样转视角
// 2) 开火键滑动 = 边射边转视角 (CODM 式)
// 3) 情境交互键: 只在有互动对象时浮现并显示具体动作(进入坦克/补充弹药/跳伞…)
// 4) 手雷: 点按快投, 按住烹饪; 蹲键长按 = 趴; 摇杆推满 = 疾跑
// 5) 载具内按钮语义自动切换 (主炮/机枪/炮手镜/跳伞)
function applyTouchScale(){
if(!MOBILE) return;
const k=(parseInt(localStorage.getItem('sf_tsize')||'100'))/100;
const ui=document.getElementById('touchUI');
if(ui) ui.style.zoom=k;
}
if(MOBILE){
document.body.classList.add('mobile');
const $=id=>document.getElementById(id);
const ui=$('touchUI');
const stickZone=$('tStickZone'), stickEl=$('tStick'), knob=$('tKnob');
const STICK_R=62; // 摇杆半径(px, zoom前)
// ---------- 触摸路由表 ----------
const claims=new Map(); // touchId -> claim
let sprintLatch=false;
let nadeSel=0; // 0=手雷 1=烟雾 2=AT雷
// ---------- 视角 ----------
function applyLook(dx,dy){
if(!player.alive) return;
const s=0.0052*SETTINGS.sens;
if(player.onVehicle&&player.onVehicle.kind==='plane'){
const pl=player.onVehicle;
pl.gunYaw=clamp((pl.gunYaw||0)-dx*s,-1.2,1.2);
pl.gunPitch=clamp((pl.gunPitch||0)-dy*s,-0.9,0.9);
} else {
player.yaw-=dx*s;
player.pitch-=dy*s;
player.pitch=clamp(player.pitch,-1.45,1.45);
}
player.mouseDX=dx; player.mouseDY=dy;
}
// ---------- 移动摇杆 ----------
function stickHome(){
stickEl.classList.remove('live','sprint');
stickEl.style.left='40px'; stickEl.style.top='';
stickEl.style.bottom='60px';
knob.style.transform='translate(0px,0px)';
}
function setMove(dx,dy){
const r=Math.hypot(dx,dy);
const cl=Math.min(r,STICK_R);
const nx=r>1e-3?dx/r:0, ny=r>1e-3?dy/r:0;
knob.style.transform=`translate(${nx*cl}px,${ny*cl}px)`;
const fx=dx/STICK_R, fy=dy/STICK_R;
keys.KeyW=fy<-0.3; keys.KeyS=fy>0.3;
keys.KeyA=fx<-0.34; keys.KeyD=fx>0.34;
// 推满且大体向前 → 疾跑(锁存, 收回到一半以下解除)
if(r>STICK_R*1.02&&fy<-0.5) sprintLatch=true;
if(r<STICK_R*0.5||fy>-0.1) sprintLatch=false;
keys.ShiftLeft=sprintLatch;
stickEl.classList.toggle('sprint',sprintLatch);
}
function resetMove(){
keys.KeyW=keys.KeyS=keys.KeyA=keys.KeyD=false;
keys.ShiftLeft=false;
sprintLatch=false;
stickHome();
}

// ---------- 按钮动作 ----------
function pressAct(act,claim){
switch(act){
case 'fire':
if(player.alive){ mouseDown=true; claim.fireLook=true; }
break;
case 'ads':
if(!player.alive) break;
if(player.onVehicle&&player.onVehicle.kind==='tank'){ mouse2Down=true; claim.holdAds=true; } // 坦克: 按住=同轴机枪
else if(player.onVehicle&&player.onVehicle.kind==='plane'){ keys.KeyB=true; claim.bombKey=true; } // 飞机: 投弹
break;
case 'crouch': if(player.alive) InputActions.toggleCrouch(); break;
case 'score': {
const sb=$('scoreboard');
const on=sb.style.display==='block';
sb.style.display=on?'none':'block';
if(!on) updateScoreboard();
break;
}
case 'menu': if(player.deployed&&!matchOver) showDeploy(false); break;
}
}
function releaseAct(act,claim){
switch(act){
case 'fire': mouseDown=false; break;
case 'ads':
if(claim.holdAds) mouse2Down=false;
if(claim.bombKey) keys.KeyB=false;
break;
case 'crouch': break;
}
}
// ---------- 触摸事件 ----------
ui.addEventListener('touchstart',e=>{
AudioSys.resume&&AudioSys.resume();
e.preventDefault();
for(const t of e.changedTouches){
const x=t.clientX,y=t.clientY;
const target=document.elementFromPoint(x,y);
const btn=target&&target.closest?target.closest('.tbtn'):null;
if(btn&&!btn.classList.contains('hiddenT')){
const claim={t:'btn',el:btn,act:btn.dataset.act,lx:x,ly:y};
claims.set(t.identifier,claim);
btn.classList.add('press');
pressAct(claim.act,claim);
continue;
}
const zr=stickZone.getBoundingClientRect();
let hasMove=false; for(const c of claims.values()) if(c.t==='move') hasMove=true;
if(!hasMove&&x>=zr.left&&x<=zr.right&&y>=zr.top&&y<=zr.bottom){
const claim={t:'move',ox:x,oy:y};
claims.set(t.identifier,claim);
// 浮动摇杆: 落指处为原点
const ur=ui.getBoundingClientRect();
const k=ui.style.zoom?parseFloat(ui.style.zoom):1;
stickEl.classList.add('live');
stickEl.style.left=((x-ur.left)/k-62)+'px';
stickEl.style.bottom='';
stickEl.style.top=((y-ur.top)/k-62)+'px';
setMove(0,0);
continue;
}
claims.set(t.identifier,{t:'look',lx:x,ly:y});
}
},{passive:false});
ui.addEventListener('touchmove',e=>{
e.preventDefault();
for(const t of e.changedTouches){
const c=claims.get(t.identifier);
if(!c) continue;
const x=t.clientX,y=t.clientY;
if(c.t==='move'){ setMove(x-c.ox,y-c.oy); }
else if(c.t==='look'){ applyLook(x-c.lx,y-c.ly); c.lx=x; c.ly=y; }
else if(c.t==='btn'&&c.fireLook){ applyLook(x-c.lx,y-c.ly); c.lx=x; c.ly=y; }
else if(c.t==='btn'&&c.longT&&Math.hypot(x-c.lx,y-c.ly)>18){ clearTimeout(c.longT); c.longT=null; } // 移出取消长按
}
},{passive:false});
function endTouch(e){
e.preventDefault();
for(const t of e.changedTouches){
const c=claims.get(t.identifier);
if(!c) continue;
claims.delete(t.identifier);
if(c.t==='move') resetMove();
else if(c.t==='btn'){
c.el.classList.remove('press');
releaseAct(c.act,c);
}
}
}
ui.addEventListener('touchend',endTouch,{passive:false});
ui.addEventListener('touchcancel',endTouch,{passive:false});
// ---------- 按钮可见性 / 语义随状态切换 ----------
const show=(id,on)=>{ const b=$(id); if(b._v!==on){ b._v=on; b.classList.toggle('hiddenT',!on); } };
const setLbl=(id,txt)=>{ const b=$(id); const l=b.querySelector('.tLbl'); if(l._t!==txt){ l._t=txt; l.textContent=txt; } };
const setOn=(id,on)=>{ const b=$(id); if(b._on!==on){ b._on=on; b.classList.toggle('on',!!on); } };
window.updateTouchVis=function(){
const p=player;
const inGame=p.deployed&&p.alive&&!matchOver;
const inTank=inGame&&p.onVehicle&&p.onVehicle.kind==='tank';
const inPlane=inGame&&p.onVehicle&&p.onVehicle.kind==='plane';
const inApc=inGame&&p.onVehicle&&p.onVehicle.kind==='apc';
show('tStickZone',inGame);
show('tFire',inGame);
show('tFireL',inGame);
setLbl('tFire',inTank?'主炮':(inPlane||inApc)?'机炮':'开火');
show('tAds',inTank||inPlane);
setLbl('tAds',inTank?'机炮':inPlane?'导弹':'瞄准');
show('tCrouch',inTank);
setLbl('tCrouch',inTank?'炮镜':'');
setOn('tCrouch',inTank&&p.tankView);
show('tScore',p.deployed);
show('tMenu',p.deployed);
};
// 初始化
for(const b of ui.querySelectorAll('.tbtn')) b.classList.add('hiddenT');
stickHome();
applyTouchScale();
addEventListener('resize',stickHome);
}
