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
// 模式归属战役, 此处仅载具规模
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
// 联机方式选择: P2P(跨互联网) / 区域网联机(同一局域网/WiFi) — 均走 WebRTC, 仅话术不同
let netMode = '';
const netModeHint = el('netModeHint');
function pickNetMode(mode){
  netMode = mode;
  el('netModeP2P').classList.toggle('sel', mode === 'p2p');
  el('netModeLan').classList.toggle('sel', mode === 'lan');
  // 选中方式后才显示房间面板, 并按所选方式命名 —— 切换方式时旧面板整体替换
  el('netRoom').style.display = 'block';
  el('netRoomTitle').textContent = (mode === 'p2p' ? 'P2P 联机房间' : '区域网联机房间');
  el('netHostBox').style.display = 'none';
  el('netJoinBox').style.display = 'none';
  statusEl.innerHTML = '';
  if (mode === 'p2p') {
    netModeHint.innerHTML = 'P2P：跨互联网直连 · 把房间码发给好友即可';
    stopLanDiscovery();
  } else {
    netModeHint.innerHTML = '区域网联机：同一局域网/WiFi 开黑 · 把房间码告诉同网好友';
    startLanDiscovery();
  }
}

// ---- 区域网自动发现: 从自建信令页拉取本网可加入房间 ----
function lanBase(){
  const c = (typeof NET_CONFIG !== 'undefined') ? NET_CONFIG : null;
  if (!c) return null;
  return (c.secure ? 'https' : 'http') + '://' + c.host + ':' + (c.port || 9000);
}
function startLanDiscovery(){
  if (!(typeof NET_CONFIG !== 'undefined' && NET_CONFIG.lanDiscovery)) { el('netLanList').style.display='none'; return; }
  const box = el('netLanList');
  box.style.display = 'block';
  box.innerHTML = '<div class="secLabel" style="color:#f0d080">正在扫描本区域网可用房间...</div>';
  const refresh = () => {
    const base = lanBase();
    if (!base) { box.style.display='none'; return; }
    fetch(base + '/rooms').then(r => r.json()).then(list => {
      if (!list.length) { box.innerHTML = '<div class="secLabel" style="color:#8a8">本区域网暂无可用房间, 可由好友先创建</div>'; return; }
      box.innerHTML = '<div class="secLabel" style="color:#f0d080">本区域网可加入房间:</div>';
      list.forEach(room => {
        const b = document.createElement('button');
        b.className = 'bigBtn'; b.style.borderColor = '#c8a060'; b.style.color = '#f0d080';
        b.style.width = '100%'; b.style.marginTop = '6px';
        b.textContent = (room.name || room.id) + '  ·  房间码 ' + room.id;
        b.onclick = () => { el('netJoinCode').value = room.id; el('netDoJoinBtn').click(); };
        box.appendChild(b);
      });
    }).catch(() => { box.innerHTML = '<div class="secLabel" style="color:#a88">未能连接信令页, 请手动输入房间码</div>'; });
  };
  refresh();
  window.__lanTimer = setInterval(refresh, 3000);
}
function stopLanDiscovery(){
  if (window.__lanTimer) { clearInterval(window.__lanTimer); window.__lanTimer = null; }
  const box = el('netLanList'); if (box) box.style.display = 'none';
}
el('netModeP2P').onclick = () => pickNetMode('p2p');
el('netModeLan').onclick = () => pickNetMode('lan');
const chatEl = el('chatInput');
const chatBox = el('chatBox');
let mpStarted = false;

function updateNetHUD() {
  if (!NET.connected) { hudEl.style.display='none'; chatEl.style.display='none'; return; }
  hudEl.style.display='block';
  const role = NET.isHost ? '主机' : '客机';
  const rem = Object.keys(NET.remotePlayers || {}).length;
  const nb = (typeof soldiers !== 'undefined' && soldiers) ? soldiers.length : 0;
  const wc = NET.isHost ? ('已发:' + (typeof MP!=='undefined' ? MP.sentWorldCount||0 : 0)) : ('收到:' + (NET.recvWorldCount||0));
  el('netPing').textContent = `Ping:${NET.ping}ms · ${role} · 世界${wc} · 士兵:${nb} · 远程:${rem}`;
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

// ---- 主机: 创建房间 ----
el('netHostBtn').onclick = async () => {
  if (!netMode) { statusEl.innerHTML = '<span style="color:#f88">请先选择上方联机方式</span>'; return; }
  const name = el('netName').value.trim() || (netMode === 'lan' ? '房主' : '主机');
  SETTINGS.team = 0;
  el('netHostBox').style.display = 'block';
  el('netJoinBox').style.display = 'none';
  el('netHostWait').textContent = '正在创建房间...';
  statusEl.innerHTML = '';

  const code = await NET.host(name);
  if (!code) {
    el('netHostBox').style.display = 'none';
    statusEl.innerHTML = '<span style="color:#f88">房间创建失败, 请重试</span>';
    return;
  }
  el('netRoomCode').value = code;
  el('netRoomCode').select();
  el('netHostWait').textContent = '房间已创建! 把房间码发给好友 ↓';
  statusEl.innerHTML = '<span style="color:#8f8">等待好友加入...</span>';
  try { await navigator.clipboard.writeText(code); el('netCopyBtn').textContent = '✓ 已复制!'; }
  catch (e) { el('netCopyBtn').textContent = '复制'; }

  // 等待好友加入(连接建立)后开战
  if (window.__netHostWait) { clearInterval(window.__netHostWait); window.__netHostWait = null; }
  window.__netHostWait = setInterval(() => {
    if (NET.connected) {
      clearInterval(window.__netHostWait); window.__netHostWait = null;
      statusEl.innerHTML = '<span style="color:#8f8">好友已加入! 进入战场...</span>';
      startMpGame();
    }
  }, 300);
  setTimeout(() => { if (window.__netHostWait) { clearInterval(window.__netHostWait); window.__netHostWait = null; if (!NET.connected) statusEl.innerHTML = '<span style="color:#f88">等待超时, 可重新创建房间</span>'; } }, 60000);
};

el('netCopyBtn').onclick = () => {
  el('netRoomCode').select();
  const code = el('netRoomCode').value;
  try { navigator.clipboard.writeText(code); el('netCopyBtn').textContent = '✓ 已复制!'; }
  catch (e) { el('netCopyBtn').textContent = '请手动复制'; }
};

// ---- 客机: 加入房间 ----
el('netJoinBtn').onclick = () => {
  el('netHostBox').style.display = 'none';
  el('netJoinBox').style.display = 'block';
  statusEl.innerHTML = '';
  el('netJoinCode').focus();
};

el('netDoJoinBtn').onclick = async () => {
  if (!netMode) { statusEl.innerHTML = '<span style="color:#f88">请先选择上方联机方式</span>'; return; }
  const code = el('netJoinCode').value.trim().toUpperCase();
  if (!code) { statusEl.innerHTML = '<span style="color:#f88">请输入房间码</span>'; return; }
  const name = el('netName').value.trim() || '士兵';
  SETTINGS.team = 1;
  el('netDoJoinBtn').disabled = true;
  statusEl.innerHTML = '<span style="color:#f0d080">正在加入房间...</span>';

  const ok = await NET.join(code, name);
  el('netDoJoinBtn').disabled = false;
  if (!ok) { statusEl.innerHTML = '<span style="color:#f88">加入失败, 请检查房间码</span>'; return; }

  if (window.__netJoinWait) { clearInterval(window.__netJoinWait); window.__netJoinWait = null; }
  window.__netJoinWait = setInterval(() => {
    if (NET.connected) {
      clearInterval(window.__netJoinWait); window.__netJoinWait = null;
      statusEl.innerHTML = '<span style="color:#8f8">连接成功! 进入战场...</span>';
      startMpGame();
    }
  }, 300);
  setTimeout(() => { if (window.__netJoinWait) { clearInterval(window.__netJoinWait); window.__netJoinWait = null; if (!NET.connected) statusEl.innerHTML = '<span style="color:#f88">连接超时, 请确认房间码</span>'; } }, 15000);
};

// ---- 游戏中分享按钮: 复制房间码 ----
el('netShareBtn').onclick = () => {
  const code = NET.getShareUrl();
  if (!code) { showScorePop('房间码不可用'); return; }
  try {
    navigator.clipboard.writeText(code);
    showScorePop('房间码已复制: ' + code + ' (发给好友即可联机)');
  } catch(e) {
    const ta = document.createElement('textarea');
    ta.value = code; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); showScorePop('房间码已复制: ' + code); } catch(e2) { showScorePop('复制失败, 房间码: ' + code); }
    document.body.removeChild(ta);
  }
};

// 聊天: Enter 打开输入框, 发送/ Esc 关闭(收起)
function openChat(){ chatEl.style.display='block'; chatBox.focus(); }
function closeChat(){ chatEl.style.display='none'; chatBox.value=''; chatBox.blur(); }

chatBox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.stopPropagation(); e.preventDefault();
    const v = chatBox.value.trim();
    if (v) {
      NET.sendChat(v);
      if (typeof addChatMsg === 'function') addChatMsg(NET.playerName || '你', v, true); // 本地回显自己发的
    }
    closeChat();
  } else if (e.key === 'Escape') {
    e.stopPropagation(); e.preventDefault();
    closeChat();
  }
});

addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !e.repeat && typeof NET !== 'undefined' && NET.connected && player.alive && player.deployed) {
    if (document.activeElement !== chatBox) { e.preventDefault(); openChat(); }
  }
});

// 自动重连: 客户端因"地图/载具与主机不一致"被重载后, 自动填名字/模式/房间码并重新加入
try {
  const aj = JSON.parse(localStorage.getItem('sf_autjoin') || 'null');
  if (aj && aj.room) {
    localStorage.removeItem('sf_autjoin');
    setTimeout(() => {
      el('netName').value = aj.name || '士兵';
      pickNetMode(aj.mode === 'lan' ? 'lan' : 'p2p');
      el('netJoinCode').value = aj.room;
      el('netDoJoinBtn').click();
    }, 700);
  }
} catch (e) {}
}
// 载具战: 无兵种卡, 部署=选择载具出生
el('deployBtn').onclick=()=>{
if(respawnCd>0||matchOver) return;
deployPlayer();
};
el('resumeBtn').onclick=()=>{
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
lockPointer();
};
el('redeployBtn').onclick=()=>{
if(!player.alive||!player.deployed||matchOver) return;
// 自杀: 立即死亡, 回到部署界面重新选择出生点
player.damage(9999, null, false);
};
renderer.domElement.addEventListener('click',()=>{
if(player.alive&&player.deployed&&!pointerLocked&&!matchOver) lockPointer();
});
}
function showDeploy(isDead){
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('deploy').classList.remove('hidden');
el('blackOv').style.opacity=0;
el('deathInfo').innerHTML=(()=>{ 
const camp='<div style="color:#f0d080;margin-bottom:6px;font-size:15px">你的阵营：<b>'+TEAM_FACTION[player.team].name+'</b>（'+TEAM_NAME[player.team]+'）</div>';
if(!isDead) return camp;
const lifeT=Math.max(0,nowT-(player.lifeStartT||nowT));
const mm2=Math.floor(lifeT/60), ss3=Math.floor(lifeT%60);
const lk=player.lifeKills||0, ls=(player.score||0)-(player.lifeScoreStart||0);
return camp+(player.killerName?'你被 <b>'+player.killerName+'</b> 击杀了<br>':'')+
'<span style="font-size:13px;color:#cdd8c8">本次存活 '+mm2+':'+(ss3<10?'0':'')+ss3+' · 击杀 <b>'+lk+'</b> · 获得 <b>+'+ls+'</b> 分 &nbsp;|&nbsp; 本局总计 '+player.kills+' 杀 / '+player.deaths+' 死 / '+player.score+' 分</span>';
})();
const aliveDeployed = player.alive && player.deployed;
el('resumeBtn').style.display = aliveDeployed ? 'inline-block' : 'none';
el('redeployBtn').style.display = aliveDeployed ? 'inline-block' : 'none';
el('deployBtn').style.display = aliveDeployed ? 'none' : 'inline-block';
buildSpawnList();
buildVehShop();
drawDeployMap();
}
// ========== 载具商店: 积分购买复活载具 ==========
function vehCostOf(kind,def){
if(kind==='apc') return 150;
if(kind==='plane') return 300;
const cls=(def&&def.cls)||'medium';
if(cls==='light') return 200;
if(cls==='heavy') return 450;
if(cls==='td') return 380;
return 300;
}
function vehShopTypes(){
const p=player, F=TEAM_FACTION[p.team];
const types=[];
(F.tanks||[]).forEach((d,i)=>types.push({kind:'tank',variant:i,def:d}));
(F.planes||[]).forEach((d,i)=>types.push({kind:'plane',variant:i,def:d}));
types.push({kind:'apc',variant:0,def:(F.trucks&&F.trucks[0])||{name:'军用卡车',cls:'apc',hp:300,spd:8,rev:4,turn:1.1,seats:6,open:true,col:0x5a5f50}});
return types;
}
function vehOfType(kind,variant){
const arr=kind==='tank'?tanks:kind==='plane'?planes:apcs;
if(!arr) return [];
return arr.filter(v=>v.team===player.team&&v.alive&&!v.playerDriven&&(kind==='apc'||v.variant===variant));
}
function buildVehShop(){
const p=player;
el('ptsNow').textContent='积分 '+Math.max(0,Math.floor(p.points||0))+' · 池 '+Math.floor(teamPoolGet(p.team));
const types=vehShopTypes();
const list=el('vehShop');
list.innerHTML='';
const inMP=typeof MP!=='undefined'&&MP.enabled;
types.forEach((o,idx)=>{
const cost=vehCostOf(o.kind,o.def);
const canAfford=(p.points||0)>=cost;
const avail=inMP?vehOfType(o.kind,o.variant).length>0:true;
const b=document.createElement('button');
b.className='vehShopBtn'+(selectedVeh===idx?' sel':'');
const icon=o.kind==='plane'?'✈':o.kind==='apc'?'▢':'▣';
b.innerHTML=icon+' '+o.def.name+'<span class="vcost">'+cost+' 分</span>';
const needPool=canAfford?0:(cost-(p.points||0));
const poolCover=!canAfford&&teamPoolGet(p.team)>=needPool;
b.disabled=false;
b.style.opacity=canAfford?1:(poolCover?0.85:0.5);
if(inMP&&!avail) b.style.opacity=0.6;
b.title=(canAfford?'':(poolCover?(cost+' 分, 积分池垫付 '+needPool):('积分不足 · 需要 '+cost+' 分 (需池 '+needPool+(teamPoolGet(p.team)<needPool?', 池不足':''))))+(inMP&&!avail?' · 该型载具暂无可用':'');
b.onclick=()=>{
if(!canAfford&&!poolCover){ showScorePop('积分不足 (需 '+cost+' 分, 积分池也不够)'); return; }
if(inMP&&!avail){ showScorePop('该型载具暂无可用, 等待重生'); return; }
selectedVeh=idx;
document.querySelectorAll('.vehShopBtn').forEach(x=>x.classList.remove('sel'));
b.classList.add('sel');
};
list.appendChild(b);
});
if(selectedVeh===null||selectedVeh>=types.length) selectedVeh=0;
}
function buildSpawnList(){
const list=el('spawnList');
list.innerHTML='';
const opts=[{name:'主基地',x:BASES[player.team].x,z:BASES[player.team].z,id:-1}];
FLAGS.forEach((f,i)=>{ if(f.owner===player.team) opts.push({name:f.id+' 点',x:f.x,z:f.z,id:i}); });
if(!opts.some(o=>o.id===selectedSpawn)) selectedSpawn=-1;
opts.forEach(o=>{
const b=document.createElement('button');
b.className='spawnBtn'+(o.id===selectedSpawn?' sel':'');
b.textContent='◈ '+o.name;
b.onclick=()=>{ selectedSpawn=o.id; document.querySelectorAll('.spawnBtn').forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); };
list.appendChild(b);
});
}
function drawDeployMap(){
const cv=el('deployMap');
const c=cv.getContext('2d');
const S=cv.width;
c.fillStyle='#141a10'; c.fillRect(0,0,S,S);
const toM=(x,z)=>[S/2+x/(MAP_SIZE/2+10)*S/2, S/2+z/(MAP_SIZE/2+10)*S/2];
c.strokeStyle='rgba(150,130,90,.5)'; c.lineWidth=3;
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
c.fillRect(px-6,py-6,12,12);
c.fillStyle='#fff'; c.font='8px sans-serif'; c.textAlign='center';
c.fillText(TEAM_NAME[t][0],px,py+3);
});
for(const f of FLAGS){
const [px,py]=toM(f.x,f.z);
c.beginPath(); c.arc(px,py,9,0,TAU);
c.fillStyle=f.owner===0?'rgba(90,140,220,.85)':f.owner===1?'rgba(220,110,90,.85)':'rgba(150,150,140,.7)';
c.fill();
c.fillStyle='#fff'; c.font='bold 9px sans-serif'; c.textAlign='center';
c.fillText(f.id,px,py+3);
}
for(const v of [...tanks,...planes,...apcs]){
if(!v.alive) continue;
const [px,py]=toM(v.pos.x,v.pos.z);
c.fillStyle=v.team===0?'#7da8e8':'#e8907d';
c.beginPath(); c.arc(px,py,2,0,TAU); c.fill();
}
}
function deployPlayer(){
const p=player;
const types=vehShopTypes();
const veh=(selectedVeh!==null&&selectedVeh!==undefined&&types[selectedVeh])?types[selectedVeh]:null;
if(!veh){ showScorePop('请选择载具'); return; }
const cost=vehCostOf(veh.kind,veh.def);
let need=Math.max(0,cost-(p.points||0));
if(need>0){
if(teamPoolGet(p.team)<need){ showScorePop('积分不足 (需 '+cost+' 分, 公共池仅 '+Math.floor(teamPoolGet(p.team))+' 分)'); return; }
showScorePop('从团队积分池借用 '+Math.round(need)+' 分');
}
const inMP=typeof MP!=='undefined'&&MP.enabled;
let sx,sz;
if(selectedSpawn===-1){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else {
const f=FLAGS[selectedSpawn];
if(f.owner!==p.team){ sx=BASES[p.team].x; sz=BASES[p.team].z; }
else { sx=f.x; sz=f.z; }
}
let v=null;
if(inMP){
// 联机: 世界快照按索引对齐, 只能接管本方现役载具, 不能新建载具
v=vehOfType(veh.kind,veh.variant).sort((a,b)=>a.pos.distanceTo(V3(sx,0,sz))-b.pos.distanceTo(V3(sx,0,sz)))[0]||null;
if(!v){ showScorePop('该型载具暂无可用, 等待重生'); return; }
}else{
// 单人: 优先接管现役 AI 载具(保持总规模与界面一致), 无现役才新建
const cand=vehOfType(veh.kind,veh.variant).sort((a,b)=>a.pos.distanceTo(V3(sx,0,sz))-b.pos.distanceTo(V3(sx,0,sz)))[0]||null;
if(cand) v=cand;
else if(veh.kind==='tank') v=new Tank(p.team,veh.variant);
else if(veh.kind==='plane') v=new Plane(p.team,veh.variant);
else v=new APC(p.team);
v.pos.set(sx,0,sz);
if(veh.kind==='plane'){ v.pos.y=65; v.yaw=Math.atan2(-sx,-sz); v.pitch=0; v.speed=44; v.target=null; }
else { v.pos.y=heightAt(sx,sz); v.yaw=Math.atan2(-sx,-sz); v.turretYaw=0; v.isAI=false; v.vel=0; }
v.grp.position.copy(v.pos);
v.grp.rotation.set(veh.kind==='plane'?0:v.grp.rotation.x,v.yaw,0);
v.respawnT=0;
}
p.points=Math.max(0,(p.points||0)+need-cost);
if(need>0&&typeof teamPool!=='undefined'){ teamPool[p.team]=Math.max(0,teamPool[p.team]-need); if(typeof NET!=='undefined'&&NET.connected&&NET.isClient) NET.sendPool(need, p.team); }
v.playerDriven=true;
if(v.kind==='tank'){ v.isAI=false; v.vel=0; p.yaw=v.yaw+v.turretYaw+Math.PI; }
else { p.yaw=v.yaw+Math.PI; p.pitch=v.pitch||0; }
p.onVehicle=v; p.tankView=false;
if(v.kind==='plane'){ v.gunYaw=0; v.gunPitch=0; v.gunView=false; }
p.pos.copy(v.pos);
p.hp=100; p.alive=true; p.deployed=true; p.suppressV=0;
document.getElementById('scopeOv').style.display='none';
document.getElementById('deathQuote').style.opacity='0';
document.getElementById('heatWrap').style.display='block';
p.lifeStartT=nowT; p.lifeKills=0; p.lifeScoreStart=p.score||0;
document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));
el('blackOv').style.opacity=0;
lockPointer();
  if(typeof NET!=='undefined'&&NET.connected){
  const _arr=v.kind==='tank'?tanks:v.kind==='plane'?planes:apcs;
  NET.sendVehicleEnter(_arr.indexOf(v), v.kind);
  NET.sendSpawn(0, p.team);
  }
}

function startMatch(){
// 每局初始积分: 供购买载具
if(player) player.points=500;
// 每局开局重置团队共享积分池
if(typeof teamPool!=='undefined'){ teamPool[0]=POOL_START; teamPool[1]=POOL_START; }
// 载具战: 双方生成固定数量的 AI 载具(坦克/飞机/运兵车)
// 主机/客户端的载具序列完全一致, 联机世界快照按索引对齐才不会错位
const tCount=SIZE_IDX===0?2:(SIZE_IDX===1?3:4); // 每方坦克数
const aCount=SIZE_IDX===0?1:2;                     // 每方运兵车数
const pCount=2;                                    // 每方飞机数
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
// 生成双方载具
for(let t=0;t<2;t++){
for(let i=0;i<tCount;i++) new Tank(t,i%TEAM_FACTION[t].tanks.length);
for(let i=0;i<aCount;i++) new APC(t);
for(let i=0;i<pCount;i++) new Plane(t,i%TEAM_FACTION[t].planes.length);
}
}
let lastT=performance.now(), fpsAcc=0, fpsN=0, fpsShow=0;
