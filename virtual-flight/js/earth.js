// 地球：真实比例球体、五大洲四大洋贴图、陆地遮罩与地形高度
import * as THREE from 'three';

export const EARTH_RADIUS = 20000;

// 各地图在地球上的出生点（真实经纬度）
export const SPAWNS = {
  mountain: { lat: 27.5, lon: 111.5, place: '中国湖南丘陵' },
  volcano: { lat: 36.2, lon: 138.4, place: '日本本州' },
  carrier: { lat: 15.0, lon: 130.0, place: '菲律宾海' }
};

const DEG = Math.PI / 180;

export function dirFromLatLon(lat, lon) {
  const phi = Math.PI + lon * DEG;
  const theta = Math.PI / 2 - lat * DEG;
  return new THREE.Vector3(
    -Math.cos(phi) * Math.sin(theta),
    Math.cos(theta),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();
}

export function latLonFromDir(dir) {
  const n = dir.clone().normalize();
  const y = Math.max(-1, Math.min(1, n.y));
  const lat = Math.asin(y) / DEG;
  const theta = Math.acos(y);
  let phi = Math.atan2(n.z, -n.x);
  if (phi < 0) phi += Math.PI * 2;
  let lon = phi / DEG - 180;
  if (lon > 180) lon -= 360;
  return { lat, lon, phi, theta };
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}
function noise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * noise(x * f, y * f);
    f *= 2.03;
    amp *= 0.5;
  }
  return v;
}

// ---------- 大陆轮廓（经度、纬度） ----------
const CONTINENTS = {
  northAmerica: [
    [-168, 66], [-158, 71], [-140, 70], [-125, 72], [-108, 73], [-92, 72], [-80, 68],
    [-64, 60], [-55, 51], [-62, 46], [-70, 42], [-75, 35], [-81, 25], [-83, 22],
    [-90, 29], [-97, 26], [-105, 22], [-110, 24], [-115, 31], [-124, 40], [-128, 52],
    [-140, 60], [-155, 60], [-168, 66]
  ],
  centralAmerica: [
    [-106, 23], [-97, 18], [-90, 15], [-84, 9], [-78, 8], [-80, 14], [-87, 17], [-95, 20], [-106, 23]
  ],
  southAmerica: [
    [-81, 12], [-72, 12], [-62, 10], [-52, 2], [-42, -3], [-35, -8], [-38, -16],
    [-48, -25], [-55, -35], [-62, -41], [-66, -50], [-71, -55], [-75, -47], [-73, -35],
    [-70, -20], [-76, -10], [-81, 0], [-81, 12]
  ],
  africa: [
    [-17, 15], [-8, 8], [0, 5], [8, 4], [9, -1], [13, -8], [16, -20], [20, -34],
    [27, -34], [33, -28], [37, -20], [41, -12], [46, -2], [51, 11], [44, 12], [39, 15],
    [34, 26], [32, 31], [20, 34], [10, 36], [0, 35], [-10, 30], [-17, 15]
  ],
  eurasia: [
    [-10, 36], [-9, 43], [-2, 48], [3, 51], [8, 57], [12, 55], [18, 62], [25, 70],
    [35, 70], [50, 69], [65, 72], [80, 74], [100, 77], [125, 74], [145, 72], [165, 67],
    [180, 63], [178, 58], [160, 55], [148, 47], [140, 42], [132, 35], [124, 31],
    [121, 24], [112, 18], [108, 10], [104, 2], [100, 5], [97, 16], [90, 22],
    [82, 18], [76, 8], [72, 20], [64, 24], [56, 26], [48, 30], [42, 36], [34, 36],
    [28, 40], [22, 38], [14, 41], [7, 44], [0, 42], [-10, 36]
  ],
  australia: [
    [114, -22], [122, -18], [132, -12], [142, -11], [147, -18], [153, -26], [150, -38],
    [139, -38], [130, -32], [118, -35], [114, -22]
  ],
  antarctica: [
    [-180, -68], [-140, -71], [-100, -74], [-60, -70], [-20, -72], [20, -70],
    [60, -68], [100, -67], [140, -68], [180, -68], [180, -90], [-180, -90]
  ],
  greenland: [
    [-46, 60], [-32, 67], [-20, 74], [-26, 81], [-45, 83], [-58, 78], [-56, 68], [-46, 60]
  ],
  japan: [
    [130, 32], [132, 34], [136, 35], [140, 36], [142, 40], [145, 44], [144, 46],
    [141, 44], [139, 39], [136, 37], [132, 34], [129, 33], [130, 32]
  ],
  uk: [[-6, 50], [-2, 51], [1, 53], [-2, 58], [-5, 58], [-6, 55], [-6, 50]],
  ireland: [[-10, 52], [-6, 52], [-6, 55], [-10, 55], [-10, 52]],
  madagascar: [[44, -13], [49, -14], [50, -20], [47, -26], [44, -22], [44, -13]],
  newZealand: [[166, -47], [172, -44], [175, -40], [178, -37], [175, -35], [172, -39], [168, -44], [166, -47]],
  newGuinea: [[131, -2], [141, -3], [150, -6], [147, -10], [139, -9], [132, -6], [131, -2]],
  indonesia: [[95, 5], [105, 1], [115, -2], [125, -2], [135, -3], [140, -5], [136, -8], [126, -8], [116, -8], [106, -7], [96, -3], [95, 5]],
  philippines: [[120, 19], [124, 16], [126, 9], [123, 6], [120, 10], [118, 14], [120, 19]],
  iceland: [[-24, 64], [-15, 64], [-14, 66], [-20, 67], [-24, 66], [-24, 64]],
  sriLanka: [[80, 9], [82, 8], [82, 6], [80, 6], [80, 9]],
  taiwan: [[120, 25], [122, 24], [121, 22], [120, 23], [120, 25]],
  hainan: [[109, 20], [111, 20], [110, 18], [109, 19], [109, 20]]
};

const OCEAN_LABELS = [
  { name: '太平洋', lon: -150, lat: 5, size: 52 },
  { name: '大西洋', lon: -30, lat: 25, size: 44 },
  { name: '印度洋', lon: 78, lat: -20, size: 44 },
  { name: '北冰洋', lon: 0, lat: 82, size: 36 },
  { name: '南大洋', lon: 20, lat: -58, size: 34 }
];

const CONTINENT_LABELS = [
  { name: '亚洲', lon: 90, lat: 48, size: 42 },
  { name: '欧洲', lon: 18, lat: 52, size: 28 },
  { name: '非洲', lon: 20, lat: 5, size: 38 },
  { name: '北美洲', lon: -105, lat: 45, size: 34 },
  { name: '南美洲', lon: -60, lat: -15, size: 32 },
  { name: '大洋洲', lon: 134, lat: -25, size: 28 }
];

function lonToX(lon, w) { return ((lon + 180) / 360) * w; }
function latToY(lat, h) { return ((90 - lat) / 180) * h; }

function tracePolygon(ctx, points, w, h) {
  points.forEach(([lon, lat], i) => {
    const x = lonToX(lon, w);
    const y = latToY(lat, h);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawLandShapes(ctx, w, h) {
  ctx.beginPath();
  for (const poly of Object.values(CONTINENTS)) tracePolygon(ctx, poly, w, h);
}

function buildCanvasTexture() {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 海洋：赤道偏浅，两极偏深
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#123d63');
  ocean.addColorStop(0.18, '#145887');
  ocean.addColorStop(0.5, '#1677a8');
  ocean.addColorStop(0.82, '#145887');
  ocean.addColorStop(1, '#123d63');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // 海洋纹理（洋流与深浅）
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 18 + Math.random() * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = Math.random() < 0.5;
    g.addColorStop(0, light ? 'rgba(74,151,186,0.12)' : 'rgba(4,36,68,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 陆地底色
  ctx.save();
  ctx.fillStyle = '#4c7f3f';
  drawLandShapes(ctx, W, H);
  ctx.fill('evenodd');
  ctx.restore();

  // 只在陆地内部绘制气候色斑
  ctx.save();
  ctx.beginPath();
  for (const poly of Object.values(CONTINENTS)) tracePolygon(ctx, poly, W, H);
  ctx.clip('evenodd');

  const blobs = [
    [-100, 39, 190, 80, '#7d9155'], [-112, 33, 120, 60, '#b59a68'],
    [-62, -5, 160, 100, '#2f6b34'], [-65, -25, 100, 140, '#5b7f45'],
    [15, 22, 330, 95, '#c8a96d'], [45, 23, 120, 80, '#c2a06b'],
    [70, 43, 240, 120, '#b7a06b'], [100, 58, 300, 120, '#557b4a'],
    [133, -25, 200, 110, '#b58a5c'], [-42, 72, 160, 90, '#dfe9ee'],
    [104, 30, 130, 70, '#4a7c42'], [80, 20, 110, 70, '#4e7f3e']
  ];
  for (const [lon, lat, rx, ry, color] of blobs) {
    const x = lonToX(lon, W);
    const y = latToY(lat, H);
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 森林/山地细碎纹理
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = 3 + Math.random() * 14;
    const dark = Math.random() < 0.55;
    ctx.fillStyle = dark ? 'rgba(24,66,34,0.10)' : 'rgba(190,190,140,0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 极地冰雪
  const north = ctx.createLinearGradient(0, 0, 0, latToY(64, H));
  north.addColorStop(0, 'rgba(246,251,255,0.98)');
  north.addColorStop(0.55, 'rgba(233,245,252,0.9)');
  north.addColorStop(1, 'rgba(233,245,252,0)');
  ctx.fillStyle = north;
  ctx.fillRect(0, 0, W, latToY(64, H));
  const south = ctx.createLinearGradient(0, latToY(-62, H), 0, H);
  south.addColorStop(0, 'rgba(240,248,252,0)');
  south.addColorStop(0.3, 'rgba(240,248,252,0.96)');
  south.addColorStop(1, '#f2f9fd');
  ctx.fillStyle = south;
  ctx.fillRect(0, latToY(-62, H), W, H - latToY(-62, H));

  // 海洋与大陆标注
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 46px "PingFang SC", "Microsoft YaHei", sans-serif';
  for (const o of OCEAN_LABELS) {
    ctx.font = `600 ${o.size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = 'rgba(201,235,255,0.42)';
    ctx.fillText(o.name, lonToX(o.lon, W), latToY(o.lat, H));
  }
  for (const c of CONTINENT_LABELS) {
    ctx.font = `700 ${c.size}px "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = 'rgba(28,58,28,0.52)';
    ctx.fillText(c.name, lonToX(c.lon, W), latToY(c.lat, H));
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return { texture: tex, canvas, W, H };
}

function buildMask(W = 1024, H = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  drawLandShapes(ctx, W, H);
  ctx.fill('evenodd');
  // 极地算陆地（冰面）
  ctx.fillRect(0, 0, W, latToY(72, H));
  ctx.fillRect(0, latToY(-68, H), W, H - latToY(-68, H));
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = data[i * 4] > 127 ? 1 : 0;
  return { mask, W, H };
}

let earthAssets = null;
function getEarthAssets() {
  if (!earthAssets) {
    const tex = buildCanvasTexture();
    const mask = buildMask();
    earthAssets = {
      texture: tex.texture,
      canvas: tex.canvas,
      mask: mask.mask,
      maskW: mask.W,
      maskH: mask.H
    };
  }
  return earthAssets;
}

export function isLandAt(lat, lon) {
  const a = getEarthAssets();
  const u = ((lon + 180) / 360 + 1) % 1;
  const v = (90 - lat) / 180;
  const x = Math.min(a.maskW - 1, Math.max(0, Math.floor(u * a.maskW)));
  const y = Math.min(a.maskH - 1, Math.max(0, Math.floor(v * a.maskH)));
  return a.mask[y * a.maskW + x] === 1;
}

export function isLandDir(dir) {
  const { lat, lon } = latLonFromDir(dir);
  return isLandAt(lat, lon);
}

// 地形高度（单位：世界单位，地球半径 20000 时约等于 30~100 米级）
export function makeElevation(spawnDir, mapId) {
  return function elevationAt(lat, lon) {
    if (!isLandAt(lat, lon)) return 0;
    const n1 = fbm(lon * 0.055 + 17, lat * 0.055 - 9, 4);
    const n2 = fbm(lon * 0.16 - 3, lat * 0.16 + 21, 3);
    let h = Math.max(0, n1 - 0.42) * 150 + Math.max(0, n2 - 0.58) * 40;
    // 几条主要山脉
    const himalaya = Math.exp(-Math.pow((lat - 32) / 7, 2)) * Math.exp(-Math.pow((lon - 85) / 22, 2));
    const andes = Math.exp(-Math.pow((lon + 70) / 6, 2)) * Math.exp(-Math.pow((lat + 20) / 28, 2));
    const rockies = Math.exp(-Math.pow((lon + 110) / 8, 2)) * Math.exp(-Math.pow((lat - 43) / 18, 2));
    h += (himalaya * 80 + andes * 55 + rockies * 45);
    if (mapId === 'volcano') h += 25;
    const dir = dirFromLatLon(lat, lon);
    const d = Math.acos(Math.max(-1, Math.min(1, dir.dot(spawnDir))));
    const flatten = smoothstep(0.028, 0.11, d);
    return h * flatten;
  };
}

export function getEarthTexture() {
  return getEarthAssets().texture;
}
