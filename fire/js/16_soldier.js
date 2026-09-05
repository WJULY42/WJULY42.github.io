'use strict';
// ===================== 共享基础 (载具战) =====================
// 原步兵系统已移除: 保留全局数组/角度助手/乘员制服材质(坦克乘员模型使用)
const soldiers=[];
const combatants=[];
let gunEvents=[];
function angleLerpTo(cur,tgt,maxStep){
let d=tgt-cur;
while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU;
return cur+clamp(d,-maxStep,maxStep);
}
function angDiff(a,b){ let d=b-a; while(d>Math.PI)d-=TAU; while(d<-Math.PI)d+=TAU; return d; }
// 乘员制服材质 (坦克/运兵车乘员)
const uniformMats=[0,1].map(t=>{
const F=TEAM_FACTION[t];
return {
coat:new THREE.MeshLambertMaterial({color:F.coat}), pants:new THREE.MeshLambertMaterial({color:F.pants}),
helm:new THREE.MeshLambertMaterial({color:F.helm}), skin:new THREE.MeshLambertMaterial({color:F.skin}),
};
});
