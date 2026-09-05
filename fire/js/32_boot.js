'use strict';

applyQuality();
// 载具战: 世界工事/炮阵地部署 (需在所有脚本加载后执行, 依赖 vmMats/nadeGeoAT 等)
if(typeof deployWorldArtillery==='function') deployWorldArtillery();
initMenuUI();
loop();
