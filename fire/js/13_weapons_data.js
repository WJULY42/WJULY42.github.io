'use strict';
// ===== 枪械专用 SVG 纹理: 细腻木纹 / 发蓝钢 / 磷化钢 / 胶木 (载具/工事材质使用) =====
TEX.gunwood=(function(){
const R=texRng(201); let grain='';
for(let i=0;i<34;i++){
const y=R()*128;
grain+='<path d="M0 '+y.toFixed(1)+' C 32 '+((y+(R()-0.5)*7).toFixed(1))+', 96 '+((y+(R()-0.5)*7).toFixed(1))+', 128 '+((y+(R()-0.5)*10).toFixed(1))+'" stroke="rgba(66,44,24,'+(0.25+R()*0.3).toFixed(2)+')" stroke-width="'+(0.5+R()*0.9).toFixed(1)+'" fill="none"/>';
}
grain+='<ellipse cx="'+(30+R()*70).toFixed(0)+'" cy="'+(R()*128).toFixed(0)+'" rx="4" ry="7" fill="rgba(52,32,16,.5)"/>';
const body='<defs>'+svgGrain('gwn','0.5 0.04','3',7)+'</defs>'+
'<rect width="128" height="128" fill="#7a5a34"/>'+grain+
'<rect width="128" height="128" filter="url(#gwn)" opacity="0.22" style="mix-blend-mode:multiply"/>';
return svgTex(128,128,body,1,1,'#7a5a34');
})();
TEX.gunwoodD=(function(){
const R=texRng(211); let grain='';
for(let i=0;i<30;i++){
const y=R()*128;
grain+='<path d="M0 '+y.toFixed(1)+' C 40 '+((y+(R()-0.5)*8).toFixed(1))+', 90 '+((y+(R()-0.5)*8).toFixed(1))+', 128 '+((y+(R()-0.5)*11).toFixed(1))+'" stroke="rgba(38,24,12,'+(0.3+R()*0.3).toFixed(2)+')" stroke-width="'+(0.6+R()*1).toFixed(1)+'" fill="none"/>';
}
const body='<defs>'+svgGrain('gwdn','0.5 0.05','3',9)+'</defs>'+
'<rect width="128" height="128" fill="#573e22"/>'+grain+
'<rect width="128" height="128" filter="url(#gwdn)" opacity="0.24" style="mix-blend-mode:multiply"/>';
return svgTex(128,128,body,1,1,'#573e22');
})();
TEX.blued=(function(){
const R=texRng(221); let wear='';
for(let i=0;i<10;i++){
wear+='<line x1="'+(R()*128).toFixed(0)+'" y1="'+(R()*128).toFixed(0)+'" x2="'+(R()*128).toFixed(0)+'" y2="'+(R()*128).toFixed(0)+'" stroke="rgba(150,155,160,'+(0.06+R()*0.1).toFixed(2)+')" stroke-width="0.7"/>';
}
const body='<defs>'+svgGrain('bln','0.04 0.5','3',5)+'</defs>'+
'<rect width="128" height="128" fill="#25282b"/>'+
'<rect width="128" height="128" filter="url(#bln)" opacity="0.12" style="mix-blend-mode:screen"/>'+wear;
return svgTex(128,128,body,1,1,'#25282b');
})();
TEX.park=(function(){
const R=texRng(231); let wear='';
for(let i=0;i<8;i++){
wear+='<circle cx="'+(R()*128).toFixed(0)+'" cy="'+(R()*128).toFixed(0)+'" r="'+(1+R()*2.4).toFixed(1)+'" fill="rgba(120,124,116,'+(0.1+R()*0.14).toFixed(2)+')"/>';
}
const body='<defs>'+svgGrain('pkn','0.7','2',15)+'</defs>'+
'<rect width="128" height="128" fill="#3d423c"/>'+
'<rect width="128" height="128" filter="url(#pkn)" opacity="0.14" style="mix-blend-mode:overlay"/>'+wear;
return svgTex(128,128,body,1,1,'#3d423c');
})();
const vmMats = {
wood: new THREE.MeshLambertMaterial({map:TEX.gunwood}),
woodD: new THREE.MeshLambertMaterial({map:TEX.gunwoodD}),
gun: new THREE.MeshLambertMaterial({map:TEX.blued}),
gunL: new THREE.MeshLambertMaterial({color:0x44484a}),
park: new THREE.MeshLambertMaterial({map:TEX.park}),
bakelite: new THREE.MeshLambertMaterial({color:0x6b3f26}),
brass: new THREE.MeshLambertMaterial({color:0xb89440}),
sleeve0: new THREE.MeshLambertMaterial({color:0x4d5240}),
sleeve1: new THREE.MeshLambertMaterial({color:0x4a4d52}),
skin: new THREE.MeshLambertMaterial({color:0xc09878}),
nade: new THREE.MeshLambertMaterial({color:0x3a4232}),
};
vmMats.sleeve0.color.set(TEAM_FACTION[0].sleeve);
vmMats.sleeve1.color.set(TEAM_FACTION[1].sleeve);
