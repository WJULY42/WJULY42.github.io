'use strict';
function initMenuUI(){
// 主菜单导航
const showPanel=(id)=>{
el('mHome').classList.toggle('hidden',id!=='mHome');
['mPlay','mCamp','mSet','mNet'].forEach(pid=>el(pid).classList.toggle('hidden',pid!==id));
};
document.querySelectorAll('.navBtn').forEach(b=>{
b.onclick=()=>{ AudioSys.resume&&AudioSys.resume(); showPanel(b.dataset.p); };
});
document.querySelectorAll('.backBtn').forEach(b=>{ b.onclick=()=>showPanel('mHome'); });
// 触控按键大小
{
const stored=parseInt(localStorage.getItem('sf_tsize')||'100');
el('tsizeRange').value=stored;
el('tsizeVal').textContent=stored+'%';
el('tsizeRange').oninput=e=>{
localStorage.setItem('sf_tsize',e.target.value);
el('tsizeVal').textContent=e.target.value+'%';
applyTouchScale();
};
}
// 战役选择: 切换后存档并重载页面重建世界
const campRow=el('campRow');
CAMPAIGNS.forEach((c,i)=>{
const b=document.createElement('button');
b.className='optBtn'+(i===CAMPAIGN_IDX?' sel':'');
b.innerHTML=`<b>${c.title}</b><br><span style="font-size:10px;opacity:.8;color:#c0d8e0">${c.modeName}</span><br><span style="font-size:11px;opacity:.7">${c.sub}</span>`;
b.style.minWidth='150px';
b.onclick=()=>{
if(i===CAMPAIGN_IDX) return;
localStorage.setItem('sf_campaign',String(i));
location.reload();
};
campRow.appendChild(b);
});
el('menuSub').textContent=`—— ${CAMPAIGN.title} · ${CAMPAIGN.sub} ——`;
el('teamUS').innerHTML=`${TEAM_FACTION[0].sym} ${TEAM_FACTION[0].short} · ${TEAM_FACTION[0].name}`;
el('teamGER').innerHTML=`${TEAM_FACTION[1].sym} ${TEAM_FACTION[1].short} · ${TEAM_FACTION[1].name}`;
document.querySelector('.t0h').textContent=TEAM_NAME[0];
document.querySelector('.t1h').textContent=TEAM_NAME[1];
// 模式归属战役, 此处仅兵力规模
document.querySelectorAll('.sizeBtn').forEach(b=>{
b.classList.toggle('sel',+b.dataset.s===SIZE_IDX);
b.onclick=()=>{
SIZE_IDX=+b.dataset.s;
localStorage.setItem('sf_size',b.dataset.s);
document.querySelectorAll('.sizeBtn').forEach(x=>x.classList.toggle('sel',x===b));
};
});
// 操控模式切换 (自动检测/强制触屏/强制键鼠)
{
const ov=localStorage.getItem('sf_mobile');
const lbl=ov==='1'?'操控: 触屏':(ov==='0'?'操控: 键鼠':'操控: 自动'+(MOBILE?'(触屏)':'(键鼠)'));
el('ctrlModeBtn').textContent=lbl;
el('ctrlModeBtn').onclick=()=>{
const cur=localStorage.getItem('sf_mobile');
const next=cur===null||cur===''?'1':(cur==='1'?'0':'');
if(next==='') localStorage.removeItem('sf_mobile'); else localStorage.setItem('sf_mobile',next);
location.reload();
};
}
el('teamUS').onclick=()=>{ SETTINGS.team=0; el('teamUS').classList.add('sel'); el('teamGER').classList.remove('sel'); };
el('teamGER').onclick=()=>{ SETTINGS.team=1; el('teamGER').classList.add('sel'); el('teamUS').classList.remove('sel'); };
document.querySelectorAll('.diffBtn').forEach(b=>b.onclick=()=>{
SETTINGS.diff=+b.dataset.d;
document.querySelectorAll('.diffBtn').forEach(x=>x.classList.toggle('sel',x===b));
});
document.querySelectorAll('.qualBtn').forEach(b=>b.onclick=()=>{
SETTINGS.quality=+b.dataset.q;
document.querySelectorAll('.qualBtn').forEach(x=>x.classList.toggle('sel',x===b));
applyQuality();
});
el('sensRange').oninput=e=>{ SETTINGS.sens=e.target.value/100; el('sensVal').textContent=SETTINGS.sens.toFixed(1); };
// 右键瞄准方式: 按住 / 切换
{
const syncAdsBtn=()=>{ el('adsModeBtn').textContent=SETTINGS.adsToggle?'切换瞄准':'按住瞄准'; };
syncAdsBtn();
el('adsModeBtn').onclick=()=>{
SETTINGS.adsToggle=!SETTINGS.adsToggle;
try{ localStorage.setItem('sf_adsmode',SETTINGS.adsToggle?'toggle':'hold'); }catch(e){}
syncAdsBtn();
};
}
el('volRange').oninput=e=>{ SETTINGS.vol=e.target.value/100; el('volVal').textContent=e.target.value; AudioSys.setVol(SETTINGS.vol); };
el('startBtn').onclick=()=>{
AudioSys.init();
player.team=SETTINGS.team;
BOTS_PER_TEAM=SIZE_OPTS[SIZE_IDX].bots;
tickets[0]=SIZE_OPTS[SIZE_IDX].tk;
tickets[1]=SIZE_OPTS[SIZE_IDX].tk;
startMatch();
el('menu').classList.add('hidden');
showDeploy(true);
};
el('againBtn').onclick=()=>location.reload();
// ===== 联机菜单逻辑 (P2P WebRTC, 可分享链接) =====
{
const statusEl = el('netStatus');
const hudEl = el('netHud');
const chatEl = el('chatInput');
const chatBox = el('chatBox');
let mpStarted = false;

function updateNetHUD() {
  if (!NET.connected) { hudEl.style.display='none'; chatEl.style.display='none'; return; }
  hudEl.style.display='block';
  el('netPing').textContent='Ping: '+NET.ping+'ms';
  el('netShareBtn').style.display=NET.isHost?'inline-block':'none';
}

function startMpGame() {
  AudioSys.init();
  player.team = SETTINGS.team;
  BOTS_PER_TEAM = SIZE_OPTS[SIZE_IDX].bots;
  tickets[0] = SIZE_OPTS[SIZE_IDX].tk;
  tickets[1] = SIZE_OPTS[SIZE_IDX].tk;
  startMatch();
  el('menu').classList.add('hidden');
  showDeploy(true);
  chatEl.style.display='block';
  hudEl.style.display='block';
  mpStarted = true;
  updateNetHUD();
  showScorePop('联机对战开始! 按 Enter 聊天');
}

setInterval(() => {
  if (typeof NET !== 'undefined' && NET.connected) updateNetHUD();
}, 2000);

// 智能解析: URL → 提取 SDP; 纯文本 → 直接当 SDP 用
function extractSdp(text) {
  let t = text.trim();
  // 如果是 URL (以 http 开头 或 包含 #join=)
  const m = t.match(/#join=([A-Za-z0-9\-_]+)/);
  if (m) { t = m[1]; } // 提取 hash 中的编码 SDP
  // 如果以 http 开头但没有 hash, 可能是整个 URL 其他格式, 跳过
  if (t.startsWith('http') && !t.includes('#join=')) return null;
  // 原始 SDP 包含换行符和空格, 直接返回不解码
  if (t.includes('\n') || t.includes('\r') || (t.match(/ /g)||[]).length > 5) return t;
  // base64 解码尝试 (干净字符串可能是编码后的 SDP)
  if (typeof urlToSdp === 'function') {
    const dec = urlToSdp(t);
    if (dec) return dec;
  }
  return t; // 当作原始 SDP
}

// ---- 主机: 创建主机 ----
el('netHostBtn').onclick = async () => {
  const name = el('netName').value.trim() || '主机';
  SETTINGS.team = 0;
  statusEl.innerHTML = '<span style="color:#f0d080">正在生成邀请链接...</span>';

  const sdp = await NET.host(name);
  if (!sdp) {
    statusEl.innerHTML = '<span style="color:#f88">P2P 连接创建失败, 请重试</span>';
    return;
  }
  el('netStep1').style.display = 'none';
  el('netStepJoin').style.display = 'none';
  el('netStepHost').style.display = 'block';

  const shareUrl = NET.getShareUrl();
  el('netSdpOut').value = shareUrl;
  el('netSdpOut').select();
  statusEl.innerHTML = '<span style="color:#8f8">邀请链接已生成!</span>';

  // 自动复制链接
  try {
    await navigator.clipboard.writeText(shareUrl);
    el('netCopyBtn').textContent = '✓ 已复制到剪贴板! 发给朋友吧';
  } catch(e) {
    el('netCopyBtn').textContent = '复制邀请链接';
  }
};

el('netCopyBtn').onclick = () => {
  el('netSdpOut').select();
  const url = el('netSdpOut').value;
  try { navigator.clipboard.writeText(url); el('netCopyBtn').textContent='✓ 已复制! 发给朋友吧'; }
  catch(e) { el('netCopyBtn').textContent='请手动 Ctrl+C 复制'; }
};

// 主机接受客机 answer
el('netAcceptBtn').onclick = async () => {
  const raw = el('netAnswerIn').value.trim();
  if (!raw) { statusEl.innerHTML='<span style="color:#f88">请先粘贴朋友的确认码</span>'; return; }
  const answer = extractSdp(raw) || raw;
  statusEl.innerHTML = '<span style="color:#f0d080">正在建立 P2P 直连...</span>';
  const ok = await NET.acceptAnswer(answer);
  if (!ok) {
    statusEl.innerHTML = '<span style="color:#f88">连接失败, 请检查确认码是否正确</span>';
    return;
  }
  const wait = setInterval(() => {
    if (NET.connected) {
      clearInterval(wait);
      statusEl.innerHTML = '<span style="color:#8f8">连接成功! 进入战场...</span>';
      startMpGame();
    }
  }, 200);
  setTimeout(() => { clearInterval(wait); if(!NET.connected) statusEl.innerHTML='<span style="color:#f88">连接超时</span>'; }, 15000);
};

// ---- 客机: 加入 ----
el('netJoinBtn').onclick = () => {
  el('netStep1').style.display = 'none';
  el('netStepHost').style.display = 'none';
  el('netStepJoin').style.display = 'block';
  statusEl.innerHTML = '';
};

// 客机粘贴邀请后点击加入
el('netDoJoinBtn').onclick = async () => {
  const raw = el('netOfferIn').value.trim();
  if (!raw) { statusEl.innerHTML='<span style="color:#f88">请先粘贴邀请链接或连接码</span>'; return; }
  const offer = extractSdp(raw) || raw;
  const name = el('netJoinName').value.trim() || '士兵';
  SETTINGS.team = 1;
  statusEl.innerHTML = '<span style="color:#f0d080">正在加入主机...</span>';

  const answer = await NET.join(offer, name);
  if (!answer) {
    statusEl.innerHTML = '<span style="color:#f88">连接失败, 请检查邀请链接是否正确</span>';
    return;
  }
  el('netStepJoin2').style.display = 'block';
  el('netAnswerOut').value = answer;
  el('netAnswerOut').select();
  statusEl.innerHTML = '<span style="color:#f0d080">确认码已生成, 复制发给主机</span>';

  try {
    await navigator.clipboard.writeText(answer);
    el('netCopyAnsBtn').textContent = '✓ 已复制! 发给主机吧';
  } catch(e) {
    el('netCopyAnsBtn').textContent = '复制确认码';
  }

  const wait2 = setInterval(() => {
    if (NET.connected) {
      clearInterval(wait2);
      statusEl.innerHTML = '<span style="color:#8f8">连接成功! 进入战场...</span>';
      startMpGame();
    }
  }, 200);
  setTimeout(() => { clearInterval(wait2); if(!NET.connected) statusEl.innerHTML='<span style="color:#f88">连接超时</span>'; }, 15000);
};

el('netCopyAnsBtn').onclick = () => {
  el('netAnswerOut').select();
  try { navigator.clipboard.writeText(el('netAnswerOut').value); el('netCopyAnsBtn').textContent='✓ 已复制!'; }
  catch(e) { el('netCopyAnsBtn').textContent='请手动 Ctrl+C 复制'; }
};

// ---- 链接邀请: 自动检测 URL hash ----
(function checkAutoInvite() {
  if (typeof autoJoinSdp === 'undefined' || !autoJoinSdp) return;
  // 显示提示
  el('netStep1').querySelectorAll('.rowFlex').forEach(r => r.style.display = 'none');
  el('netInvitedHint').style.display = 'block';
  
  el('netAcceptInviteBtn').onclick = async () => {
    el('netInvitedHint').style.display = 'none';
    el('netStep1').style.display = 'none';
    el('netStepJoin').style.display = 'block';
    el('netOfferIn').value = autoJoinSdp;
    statusEl.innerHTML = '<span style="color:#f0d080">已加载邀请, 输入名字后点加入</span>';
    // 滚动到加入面板
    el('netOfferIn').focus();
  };
})();

// ---- 游戏中分享按钮 ----
el('netShareBtn').onclick = () => {
  const url = NET.getShareUrl();
  if (!url) { showScorePop('无法生成分享链接'); return; }
  try {
    navigator.clipboard.writeText(url);
    showScorePop('邀请链接已复制! 发给朋友即可联机');
  } catch(e) {
    // 降级: 选中文本
    const ta = document.createElement('textarea');
    ta.value = url; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showScorePop('邀请链接已复制!'); } catch(e2) { showScorePop('复制失败, 请手动复制'); }
    document.body.removeChild(ta);
  }
};

// 聊天
chatBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && chatBox.value.trim()) {
    NET.sendChat(chatBox.value.trim());
    chatBox.value = ''; chatBox.blur();
  }
  if (e.key === 'Escape') chatBox.blur();
});

addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !e.repeat && typeof NET !== 'undefined' && NET.connected && player.alive && player.deployed) {
    if (document.activeElement !== chatBox) { e.preventDefault(); chatBox.focus(); }
  }
});
}
const grid=el('classGrid');
CLASSES.forEach((c,i)=>{
const d=document.createElement('div');
d.className='classCard'+(i===0?' sel':'');
d.innerHTML=`<div class="cname">${c.name}</div><div class="cwpn" id="cw${i}"></div><div class="cwpn">手雷 ×${c.nades}</div>`;
d.onclick=()=>{
player.cls=i;
document.querySelectorAll('.classCard').forEach(x=>x.classList.toggle('sel',x===d));
};
grid.appendChild(d);
});
el('deployBtn').onclick=()=>{
if(respawnCd>0||matchOver) return;
deployPlayer();
};
el('resumeBtn').onclick=()=>{
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
};
renderer.domElement.addEventListener('click',()=>{
if(player.alive&&player.deployed&&!pointerLocked&&!matchOver) lockPointer();
});
}
function showDeploy(isDead){
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('deploy').classList.remove('hidden');
el('blackOv').style.opacity=0;
CLASSES.forEach((c,i)=>{
const ws=TEAM_FACTION[player.team].cls[i];
let d2=ws.map(k=>WPN_DEFS[k].name).join(' · ');
if(i===2) d2+=' · AT雷×2';
if(i===4) d2+=' · 医疗箱[B] · 绷带×6';
if(i===5) d2+=' · AT雷×'+(TEAM_FACTION[player.team].atn5||3);
el('cw'+i).textContent=d2;
});
el('deathInfo').innerHTML=(()=>{ 
if(!isDead) return '';
const lifeT=Math.max(0,nowT-(player.lifeStartT||nowT));
const mm2=Math.floor(lifeT/60), ss3=Math.floor(lifeT%60);
const lk=player.lifeKills||0, ls=(player.score||0)-(player.lifeScoreStart||0);
return (player.killerName?`你被 <b>${player.killerName}</b> 击杀了<br>`:'')+
`<span style="font-size:13px;color:#cdd8c8">本次存活 ${mm2}:${ss3<10?'0':''}${ss3} · 击杀 <b>${lk}</b> · 获得 <b>+${ls}</b> 分 &nbsp;|&nbsp; 本局总计 ${player.kills} 杀 / ${player.deaths} 死 / ${player.score} 分</span>`;
})();
el('resumeBtn').style.display=(player.alive&&player.deployed)?'inline-block':'none';
el('deployBtn').style.display=player.alive&&player.deployed?'none':'inline-block';
buildSpawnList();
drawDeployMap();
}
function buildSpawnList(){
const list=el('spawnList');
list.innerHTML='';
const opts=[{name:'主基地',x:BASES[player.team].x,z:BASES[player.team].z,id:-1}];
FLAGS.forEach((f,i)=>{ if(f.owner===player.team) opts.push({name:f.id+' 点',x:f.x,z:f.z,id:i}); });
// 载具出生选项
const vehs=[...tanks,...planes].filter(v=>v.team===player.team);
vehs.forEach((v,i)=>{
const id='V'+i;
const busy=v.playerDriven;
const ready=v.alive&&!busy;
opts.push({name:(v.kind==='plane'?'✈ ':'▣ ')+v.name+(ready?'':(busy?' (占用)':' (重生 '+Math.ceil(v.respawnT)+'s)')),id,veh:v,disabled:!ready});
});
if(!opts.some(o=>!o.disabled&&(o.id===selectedSpawn))) selectedSpawn=-1;
opts.forEach(o=>{
const b=document.createElement('button');
b.className='spawnBtn'+(o.id===selectedSpawn?' sel':'');
b.textContent='◈ '+o.name;
if(o.disabled){ b.disabled=true; b.style.opacity=0.45; }
else b.onclick=()=>{ selectedSpawn=o.id; document.querySelectorAll('.spawnBtn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); };
list.appendChild(b);
});
}
function drawDeployMap(){
const c=el('deployMap').getContext('2d');
const S=300;
c.fillStyle='#141a10'; c.fillRect(0,0,S,S);
const toM=(x,z)=>[S/2+x/(MAP_SIZE/2+10)*S/2, S/2+z/(MAP_SIZE/2+10)*S/2];
c.strokeStyle='rgba(150,130,90,.5)'; c.lineWidth=4;
if(CAMPAIGN.sineRoad){
c.beginPath();
for(let x=-155;x<=155;x+=10){ const [px,py]=toM(x,3*Math.sin(x*0.02)); x===-155?c.moveTo(px,py):c.lineTo(px,py); }
c.stroke();
}
for(const r of CAMPAIGN.roads){
c.beginPath();
const [ax,ay]=toM(r[0],r[1]), [bx2,by2]=toM(r[2],r[3]);
c.moveTo(ax,ay); c.lineTo(bx2,by2);
c.stroke();
}
[0,1].forEach(t=>{
const [px,py]=toM(BASES[t].x,BASES[t].z);
c.fillStyle=t===0?'#4a70b0':'#b05a4a';
c.fillRect(px-8,py-8,16,16);
c.fillStyle='#fff'; c.font='10px sans-serif'; c.textAlign='center';
c.fillText(TEAM_NAME[t][0],px,py+3);
});
for(const f of FLAGS){
const [px,py]=toM(f.x,f.z);
c.beginPath(); c.arc(px,py,13,0,TAU);
c.fillStyle=f.owner===0?'rgba(90,140,220,.85)':f.owner===1?'rgba(220,110,90,.85)':'rgba(150,150,140,.7)';
c.fill();
c.fillStyle='#fff'; c.font='bold 13px sans-serif'; c.textAlign='center';
c.fillText(f.id,px,py+4);
}
for(const s of soldiers){
if(!s.alive||s.onVehicle) continue;
const [px,py]=toM(s.pos.x,s.pos.z);
c.fillStyle=s.team===0?'#7da8e8':'#e8907d';
c.beginPath(); c.arc(px,py,2,0,TAU); c.fill();
}
}
function deployPlayer(){
const p=player;
// 载具出生
let vehSpawn=null;
if(typeof selectedSpawn==='string'&&selectedSpawn[0]==='V'){
const vehs=[...tanks,...planes].filter(v=>v.team===p.team);
const v=vehs[+selectedSpawn.slice(1)];
if(v&&v.alive&&!v.playerDriven) vehSpawn=v;
}
let sx,sz;
if(vehSpawn){ sx=vehSpawn.pos.x; sz=vehSpawn.pos.z; }
else if(selectedSpawn===-1||typeof selectedSpawn==='string'){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else {
const f=FLAGS[selectedSpawn];
if(f.owner!==p.team){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else { sx=f.x; sz=f.z; }
}
const fp2=findFreeSpawn(sx,sz);
p.pos.set(fp2[0],0,fp2[1]);
p.pos.y=standHeight(p.pos.x,p.pos.z,10);
p.vel.set(0,0,0);
p.hp=100; p.alive=true; p.deployed=true; p.crouch=false; p.prone=false; p.chute=false;
p.stamina=1; p.suppressV=0; p.bloom=0;
p.ads=false; p.holdBreath=false; VM.adsBlend=0;
document.getElementById('scopeOv').style.display='none';
p.yaw=Math.atan2(-sx,-sz); p.pitch=0;
const wkeys=TEAM_FACTION[p.team].cls[p.cls];
p.slots=wkeys.map(k=>({key:k,def:WPN_DEFS[k],mag:WPN_DEFS[k].mag,reserve:WPN_DEFS[k].reserve}));
p.curSlot=0; p.curW=p.slots[0];
p.nadeCount=CLASSES[p.cls].nades;
p.atNades=p.cls===5?(TEAM_FACTION[p.team].atn5||3):(p.cls===2?2:0);
p.maxBandages=p.cls===4?6:2;
p.bandages=p.maxBandages;
p.smokeCount=CLASSES[p.cls].smoke||0;
p.bandaging=0;
p.medkitUsed=false; p.grabAction=null;
p.deathRag=null; p.deathCamT=0;
p.lifeStartT=nowT; p.lifeKills=0; p.lifeScoreStart=p.score||0;
p.onMortar=null; p.mortarPlaced=false; p.buildCount=6; p.buildSel=0; p.pendingBuild=null;
p.nadeIsAT=false; p.nadeHeld=false; p.nadeIsSmoke=false;
p.onVehicle=null; p.onMG=null; p.onAT=null; p.onAA=null; p.tankView=false; p.braced=false;
ensurePlayerBody();
document.getElementById('deathQuote').style.opacity='0';
document.getElementById('heatWrap').style.display='none';
vmEquip(p.curW.key,p.team);
VM.root.visible=true;
if(p.cls===4) showScorePop(MOBILE?'医护兵 · 左侧「医疗箱」放置 · 「绷带」自疗':'医护兵 · 按 B 放置医疗箱 / H 包扎');
else if(p.cls===6) showScorePop(MOBILE?'迫击炮兵 · 左侧「架炮」架设 · 靠近后点「上迫击炮」':'迫击炮兵 · 按 B 架设迫击炮, F 上炮开火');
else if(p.cls===7) showScorePop(MOBILE?'工程兵 · 「工事」选类型 · 「建造」锤击建造':'工程兵 · 按 5 选择工事, 按 B 锤击建造');
if(vehSpawn){
if(vehSpawn.crewBot){
const cb=vehSpawn.crewBot;
if(vehSpawn.kind==='plane'){
vehSpawn.crewBot=null;
cb.onVehicle=null;
cb.chuting=true;
cb.pos.set(vehSpawn.pos.x,Math.max(vehSpawn.pos.y-2,heightAt(vehSpawn.pos.x,vehSpawn.pos.z)+3),vehSpawn.pos.z);
if(cb.mesh) cb.mesh.root.visible=true;
cb.path=null; cb.state='idle'; cb.target=null;
} else cb.dismountVehicle(false);
}
vehSpawn.playerDriven=true;
if(vehSpawn.kind==='tank'){ vehSpawn.isAI=false; vehSpawn.vel=0; p.yaw=vehSpawn.yaw+vehSpawn.turretYaw+Math.PI; }
else { p.yaw=vehSpawn.yaw+Math.PI; p.pitch=vehSpawn.pitch; }
p.onVehicle=vehSpawn;
p.pos.copy(vehSpawn.pos);
VM.root.visible=false;
document.getElementById('heatWrap').style.display='block';
}
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('blackOv').style.opacity=0;
lockPointer();
// 联机: 广播重生
if(typeof NET!=='undefined'&&NET.connected){
NET.sendSpawn(p.cls, p.team);
}
}
function startMatch(){
const names0=[...TEAM_FACTION[0].names].sort(()=>Math.random()-0.5);
const names1=[...TEAM_FACTION[1].names].sort(()=>Math.random()-0.5);
const nameIdx=[0,0];
const nextName=t=>(t===0?names0:names1)[nameIdx[t]++%(t===0?names0:names1).length];
for(let t=0;t<2;t++){
const n=t===player.team?BOTS_PER_TEAM-1:BOTS_PER_TEAM;
for(let i=0;i<n;i++){
const cls=CLS_POOL[randi(0,CLS_POOL.length-1)];
const bot=new Bot(t,cls,nextName(t));
bot.spawn();
}
}
// 旗帜初始归属 (征服: 靠近各自基地的旗点归属该方; 攻防/破袭: 防守方全部据守)
el('flagIcons').innerHTML=FLAGS.map(f=>`<span id="fi${f.id}">${f.id}</span>`).join('');
if(GAMEMODE==='conquest'){
const sorted=[...FLAGS].sort((a,b)=>Math.hypot(a.x-BASES[0].x,a.z-BASES[0].z)-Math.hypot(b.x-BASES[0].x,b.z-BASES[0].z));
sorted[0].owner=0;
sorted[sorted.length-1].owner=1;
if(sorted.length>=5){ sorted[1].owner=0; sorted[sorted.length-2].owner=1; }
FLAGS.forEach(f=>drawFlagTex(f));
} else {
// 攻防/破袭: 防守方(DEF)据守全部旗点
assaultIdx=0;
FLAGS.forEach(f=>{ f.owner=DEF; f.cap=0; f.capTeam=-1; drawFlagTex(f); });
tickets[DEF]=Infinity;
matchTime=GAMEMODE==='assault'?18*60:16*60;
}
// 组建玩家小队: 挑3名本方步兵
for(const s of soldiers){
if(SQUAD.members.length>=3) break;
if(s.team===player.team&&!s.onVehicle&&!s.pilotOf){
s.inSquad=true;
SQUAD.members.push(s);
s.mesh.tag.material.color.set(0x86ffa6);
}
}
new Tank(0,0); new Tank(0,1); new Tank(1,0); new Tank(1,1);
if(TEAM_FACTION[0].tanks[2]) new Tank(0,2);
if(TEAM_FACTION[1].tanks[2]) new Tank(1,2);
new APC(0); new APC(1);
new Plane(0,0); new Plane(0,1); new Plane(1,0); new Plane(1,1);
// 每辆载具塞入一名真正的AI乘员(算一个人, 可下车/跳伞)
for(const t of tanks){
const b=new Bot(t.team,CLS_POOL[randi(0,CLS_POOL.length-1)],nextName(t.team));
b.spawnInVehicle(t);
}
for(const a of apcs){
const b=new Bot(a.team,CLS_POOL[randi(0,CLS_POOL.length-1)],nextName(a.team));
b.spawnInVehicle(a);
}
for(const pl of planes){
const b=new Bot(pl.team,CLS_POOL[randi(0,CLS_POOL.length-1)],nextName(pl.team));
b.pilotOf=pl;
pl.pilotBot=b;
b.spawnInVehicle(pl);
}
}
let lastT=performance.now(), fpsAcc=0, fpsN=0, fpsShow=0;
