let map = null;
const INIT_CENTER = [128.067, 42.006]; // 天池
const INIT_ZOOM = 8.6;
const TIANCHI = {lng:128.067, lat:42.006};

const BBOX = {lonMin:126.5, lonMax:129.5, latMin:41.0, latMax:43.0};
const GRID_STEP = 0.05;          // ~5km
const LAPSE = -6.0;              // ℃/km 标准直减率

let adding = false;
let anchors = []; // {id,lng,lat,t,rh,marker}

function setMsg(t){ document.getElementById('msg').textContent = t || ''; }
function showLegend(flag){ document.getElementById('legend').style.display = flag?'block':'none'; }
function colorStops(minT, maxT){
  return ["interpolate", ["linear"], ["get","t"],
    minT, "#2c7bb6",
    (minT+maxT)/4, "#abd9e9",
    (minT+maxT)/2, "#ffffbf",
    (minT+3*maxT)/4, "#fdae61",
    maxT, "#d7191c"
  ];
}
function idwValue(x,y, list, key){
  if(!list.length) return null;
  let num=0, den=0, EPS=1e-9;
  for(const a of list){
    const dx = x-a.lng, dy = y-a.lat;
    const d2 = dx*dx + dy*dy;
    if(d2<EPS) return a[key];
    const w = 1.0/d2; // p=2
    num += w * a[key]; den += w;
  }
  return num/den;
}

/* ---------- 可拖拽：给 legend 启用拖动 ---------- */
function setupDraggable(el, handleSelector){
  const handle = el.querySelector(handleSelector) || el;
  let startX=0, startY=0, startLeft=0, startTop=0, dragging=false;

  const getPoint = (ev) => {
    if(ev.touches && ev.touches[0]) return {x:ev.touches[0].clientX, y:ev.touches[0].clientY};
    return {x:ev.clientX, y:ev.clientY};
  };

  const onDown = (ev) => {
    dragging = true;
    document.body.classList.add('dragging');

    // 计算当前 left/top（初始用 right/bottom 定位，需要换算）
    const rect = el.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    const p = getPoint(ev);
    startX = p.x; startY = p.y;

    // 改成 left/top 定位，便于拖动
    el.style.left = startLeft + 'px';
    el.style.top = startTop + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive:false});
    window.addEventListener('touchend', onUp);
    ev.preventDefault();
  };

  const onMove = (ev) => {
    if(!dragging) return;
    const p = getPoint(ev);
    let nx = startLeft + (p.x - startX);
    let ny = startTop + (p.y - startY);

    // 边界限制
    const maxX = window.innerWidth - el.offsetWidth - 8;
    const maxY = window.innerHeight - el.offsetHeight - 8;
    nx = Math.max(8, Math.min(nx, maxX));
    ny = Math.max(8, Math.min(ny, maxY));

    el.style.left = nx + 'px';
    el.style.top = ny + 'px';
    if(ev.cancelable) ev.preventDefault();
  };

  const onUp = () => {
    dragging = false;
    document.body.classList.remove('dragging');
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
  };

  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}

/* ---------- 地图与交互 ---------- */
document.getElementById('btnLoad').onclick = function(){
  if(map){ try{ map.remove(); }catch(e){} map = null; }
  try{
    const styleUrl = '/api/v1/mt/maps/hybrid/style.json';
    map = new maplibregl.Map({
      container: 'map', style: styleUrl,
      center: INIT_CENTER, zoom: INIT_ZOOM, pitch: 60, bearing: -10, hash: true
    });
    map.addControl(new maplibregl.NavigationControl({visualizePitch:true}), 'bottom-right');

    map.on('load', function(){
      setMsg('样式已加载');
      try{
        map.addSource('terrain-dem', {
          type: 'raster-dem',
          url: '/api/v1/mt/tiles/terrain-rgb/tiles.json',
          tileSize: 512, maxzoom: 12
        });
        map.setTerrain({ source: 'terrain-dem', exaggeration: 1.6 });
        try{
          map.setFog({
            'range': [-1, 2], 'horizon-blend': 0.2,
            'color': 'white', 'high-color': '#add8e6',
            'space-color': '#d8f2ff', 'star-intensity': 0.0
          });
        }catch(e){}
        map.fire('styledata'); // 应用中文优先
        setMsg('地图与地形已加载（点击“添加锚点”后在地图上点位置并输入数值）');
      }catch(err){ setMsg('地形未启用：' + err); }
    });

    // 标签中文优先
    map.on('styledata', function () {
      const style = map.getStyle();
      if(!style || !style.layers) return;
      style.layers.forEach(function (layer) {
        if (layer.layout && typeof layer.layout['text-field'] !== 'undefined') {
          map.setLayoutProperty(
            layer.id,
            'text-field',
            ['coalesce', ['get','name:zh'], ['get','name_zh'], ['get','name:en'], ['get','name']]
          );
        }
      });
    });

    // 地图点击：如果在添加模式，就弹输入
    map.on('click', function(e){
      if(!adding) return;
      const tStr = prompt("请输入该锚点温度(℃)：");
      if(tStr===null) return;
      const rhStr = prompt("请输入该锚点相对湿度(0-100%)：");
      if(rhStr===null) return;
      const t = parseFloat(tStr), rh = parseFloat(rhStr);
      if(!Number.isFinite(t) || !Number.isFinite(rh)){ alert("输入无效"); return; }
      const id = Math.random().toString(36).slice(2,9);
      const m = new maplibregl.Marker({ color: '#3e7aff' })
        .setLngLat([e.lngLat.lng, e.lngLat.lat])
        .setPopup(new maplibregl.Popup().setText(`T=${t.toFixed(1)}℃  RH=${rh.toFixed(0)}%`))
        .addTo(map);
      anchors.push({id, lng:e.lngLat.lng, lat:e.lngLat.lat, t, rh, marker:m});
      adding = false;
      document.getElementById('btnAdd').classList.remove('active');
      setMsg(`已添加锚点 ${anchors.length} 个`);
    });

  }catch(err){
    setMsg('创建地图失败：' + err);
  }
};

document.getElementById('btnFly').onclick = function(){
  if(!map){ alert('请先加载地图'); return; }
  map.flyTo({center: INIT_CENTER, zoom: INIT_ZOOM, pitch: 60, bearing: -10});
};

document.getElementById('btnAdd').onclick = function(){
  if(!map){ alert('请先加载地图'); return; }
  adding = true;
  this.classList.add('active');
  setMsg('添加模式：在地图上点击位置并输入温度/湿度');
};

document.getElementById('btnClear').onclick = function(){
  anchors.forEach(a=>{ try{ a.marker.remove(); }catch(e){} });
  anchors = [];
  if(map){
    if(map.getLayer('temp-circles')) map.removeLayer('temp-circles');
    if(map.getSource('temp-points')) map.removeSource('temp-points');
  }
  showLegend(false);
  setMsg('已清空');
};

document.getElementById('btnGen').onclick = function(){
  if(!map){ alert('请先加载地图'); return; }
  if(anchors.length < 1){ alert('请先添加至少 1 个锚点'); return; }

  // 色阶范围
  const minT = Math.min.apply(null, anchors.map(a=>a.t));
  const maxT = Math.max.apply(null, anchors.map(a=>a.t));
  document.getElementById('rng').textContent = `${minT.toFixed(1)} ~ ${maxT.toFixed(1)}`;

  // 规则网格
  const feats = [];
  for(let lat=BBOX.latMin; lat<=BBOX.latMax+1e-9; lat+=GRID_STEP){
    for(let lon=BBOX.lonMin; lon<=BBOX.lonMax+1e-9; lon+=GRID_STEP){
      const t = idwValue(lon,lat,anchors,'t');
      const rh = idwValue(lon,lat,anchors,'rh');
      feats.push({ type:"Feature",
        geometry:{type:"Point", coordinates:[lon,lat]},
        properties:{t, rh}
      });
    }
  }
  const fc = { type:"FeatureCollection", features: feats };

  if(map.getSource('temp-points')) map.getSource('temp-points').setData(fc);
  else{
    map.addSource('temp-points', { type:'geojson', data: fc });
    map.addLayer({
      id:'temp-circles', type:'circle', source:'temp-points',
      paint:{
        'circle-radius': ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 6, 12, 10],
        'circle-color': colorStops(minT, maxT),
        'circle-opacity': 0.65
      }
    });
  }

  // 天池读数 + 现实性校验
  let elev = 0;
  try{ elev = map.queryTerrainElevation(TIANCHI, {exaggerated:false}) || 0; }catch(_){}
  const tCb = idwValue(TIANCHI.lng, TIANCHI.lat, anchors, 't');
  const rhCb = idwValue(TIANCHI.lng, TIANCHI.lat, anchors, 'rh');
  document.getElementById('cbVal').textContent =
    `天池：${tCb?.toFixed(1) ?? '—'} ℃，湿度：${rhCb?.toFixed(0) ?? '—'} %（海拔：${Math.round(elev)} m）`;

  const warnBox = document.getElementById('warn');
  const notes = [];
  if(Number.isFinite(tCb) && Number.isFinite(rhCb)){
    const seaTemps = [];
    for(const a of anchors){
      let ha = 0;
      try{ ha = map.queryTerrainElevation({lng:a.lng, lat:a.lat}, {exaggerated:false}) || 0; }catch(_){}
      seaTemps.push(a.t - (LAPSE/1000.0)*ha);
    }
    if(seaTemps.length){
      const seaMean = seaTemps.reduce((p,c)=>p+c,0)/seaTemps.length;
      const estCb = seaMean + (LAPSE/1000.0)*elev;
      const diff = tCb - estCb;
      if(Math.abs(diff) > 8){
        notes.push(`温度偏差 ${diff.toFixed(1)}℃（估计 ${estCb.toFixed(1)}℃）`);
      }
    }
    if(rhCb<0 || rhCb>100) notes.push(`湿度超界 ${rhCb.toFixed(0)}%`);
    const a=17.625,b=243.04;
    const gamma = Math.log(Math.max(0.01, rhCb/100)) + (a*tCb)/(b+tCb);
    const Td = (b*gamma)/(a-gamma);
    if(Td > tCb + 0.1) notes.push(`露点(${Td.toFixed(1)}℃) > 温度(${tCb.toFixed(1)}℃)`);
  }
  if(notes.length){ warnBox.style.display='block'; warnBox.textContent = '⚠ 现实性校验：' + notes.join('；'); }
  else { warnBox.style.display='none'; warnBox.textContent=''; }

  showLegend(true);
  setMsg('温度场已生成。再次点击“生成温度场”可按当前锚点重算。');
};

/* 启用可拖拽 */
document.addEventListener('DOMContentLoaded', () => {
  const legend = document.getElementById('legend');
  setupDraggable(legend, '.legend-header');
});
