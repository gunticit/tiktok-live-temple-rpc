/**
 * WuxiaCharacters — Stylized Cel-Shaded 3D Martial Arts Character Builder (7 Sects)
 * Modeled after the Thiếu Lâm cel-shaded character design sheet:
 * - 3-band crisp MeshToonMaterial cel-shading + toggleable inverted-hull ink outlines
 * - Heroic articulated anatomy (thighs/baggy pants, wrapped shins xà cạp, martial shoes,
 *   V-tapered cross-collar robe, multi-wrap waist sash, fluttering front/back tabards,
 *   puffed sleeves, wrapped forearms, sculpted hands, expressive procedural faces)
 * - Iconic 3D accessories per sect: Shaolin 16-bead wooden necklace & riveted steel-capped staff,
 *   Wudang Daoist crown & Taiji sword, Duong Gia lamellar armor & crimson cape & tasseled spear,
 *   Ming Sect flame scarf & curved Dadao, Tieu Dao back quiver & recurve bow,
 *   Duong Mon face mask & violet scarf & spinning shuriken, Cai Bang wine gourd & dragon fists.
 */
import * as THREE from 'three';

export const SECT_DESIGNS = {
  thieulam: {
    name: 'Thiếu Lâm',
    primary: '#f5b82e',     // Golden yellow tunic
    secondary: '#e06319',   // Saffron-orange monastic drape
    trim: '#6b3c20',        // Deep walnut brown waist sash & collar
    pants: '#c96f24',       // Ochre baggy trousers
    wrapBase: '#efe5d1',    // Off-white cloth wraps (xà cạp & cổ tay)
    wrapLine: '#a38968',
    shoe: '#6e4023',
    skin: '#f2c19c',
    accent: '#fbbf24',
    hairStyle: 'bald',
    accessory: 'prayerBeads',
    stance: 'shaolin'
  },
  vodang: {
    name: 'Võ Đang',
    primary: '#eef6fc',     // Crisp snow-white Daoist robe
    secondary: '#2563eb',   // Sky-cerulean cross lapel
    trim: '#1e3a8a',        // Deep navy silk sash
    pants: '#cbd5e1',
    wrapBase: '#e2e8f0',
    wrapLine: '#64748b',
    shoe: '#1e293b',
    skin: '#f6d2b8',
    accent: '#38bdf8',
    hairStyle: 'daoistCrown',
    accessory: 'daoistRibbons',
    stance: 'sword'
  },
  duonggia: {
    name: 'Dương Gia',
    primary: '#0f766e',     // Jade-teal war tunic
    secondary: '#d97706',   // Bronze-gold lamellar chest & pauldrons
    trim: '#b91c1c',        // Crimson general sash
    pants: '#134e4a',
    wrapBase: '#d6c5a3',
    wrapLine: '#785a32',
    shoe: '#3b2416',
    skin: '#f1be99',
    accent: '#14b8a6',
    hairStyle: 'redRibbonTopknot',
    accessory: 'warCape',
    stance: 'spear'
  },
  minhgiao: {
    name: 'Minh Giáo',
    primary: '#b91c1c',     // Deep crimson coat
    secondary: '#1e1b2e',   // Obsidian-charcoal inner lapel
    trim: '#f59e0b',        // Sacred gold flame belt
    pants: '#271a24',
    wrapBase: '#3f2e34',
    wrapLine: '#ef4444',
    shoe: '#181114',
    skin: '#efb993',
    accent: '#ef4444',
    hairStyle: 'spikyHeadband',
    accessory: 'flameScarf',
    stance: 'saber'
  },
  tieudao: {
    name: 'Tiêu Dao',
    primary: '#15803d',     // Forest emerald ranger tunic
    secondary: '#ecfdf5',   // Cream inner tunic
    trim: '#78350f',        // Leather belt & archer strap
    pants: '#14532d',
    wrapBase: '#e7dcc5',
    wrapLine: '#856542',
    shoe: '#452817',
    skin: '#f4c7a5',
    accent: '#22c55e',
    hairStyle: 'jadePonytail',
    accessory: 'quiver',
    stance: 'bow'
  },
  duongmon: {
    name: 'Đường Môn',
    primary: '#4c1d95',     // Deep plum-violet assassin garb
    secondary: '#181026',   // Midnight shadow lapel
    trim: '#a855f7',        // Neon amethyst sash
    pants: '#1e1330',
    wrapBase: '#31204a',
    wrapLine: '#a855f7',
    shoe: '#130b1f',
    skin: '#f3c9ad',
    accent: '#a855f7',
    hairStyle: 'assassinMask',
    accessory: 'violetScarf',
    stance: 'shuriken'
  },
  caibang: {
    name: 'Cái Bang',
    primary: '#b45309',     // Rugged amber-brown martial vest
    secondary: '#e7d5b5',   // Tan cloth inner shirt
    trim: '#713f12',        // Thick hemp rope sash
    pants: '#6b4423',
    wrapBase: '#e8dcc6',
    wrapLine: '#927550',
    shoe: '#4a2e19',
    skin: '#edb78e',
    accent: '#eab308',
    hairStyle: 'wildHeadband',
    accessory: 'wineGourd',
    stance: 'fist'
  }
};

// ============================================================================
// SHARED TOON GRADIENT & CACHED TEXTURES / MATERIALS
// ============================================================================
let sharedToonGradient = null;
let sharedInkMat = null;
const sectResourceCache = new Map();

function getToonGradient() {
  if (sharedToonGradient) return sharedToonGradient;
  // Crisp 4-band anime/wuxia cel-shading ramp
  const colors = new Uint8Array([
    105, 105, 118, 255, // Deep cool shadow
    168, 165, 172, 255, // Midtone
    228, 224, 220, 255, // Lit tone
    255, 252, 245, 255  // Crisp highlight
  ]);
  const tex = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  sharedToonGradient = tex;
  return tex;
}

function getInkMaterial() {
  if (!sharedInkMat) {
    sharedInkMat = new THREE.MeshBasicMaterial({
      color: '#1b0f0a',
      side: THREE.BackSide
    });
  }
  return sharedInkMat;
}

function makeToonMat(colorOrParams) {
  const opts = typeof colorOrParams === 'string' ? { color: colorOrParams } : { ...colorOrParams };
  return new THREE.MeshToonMaterial({
    gradientMap: getToonGradient(),
    ...opts
  });
}

function addOutline(mesh, scale = 1.075, outlineBucket = null) {
  const out = new THREE.Mesh(mesh.geometry, getInkMaterial());
  out.scale.setScalar(scale);
  out.userData.isOutline = true;
  mesh.add(out);
  if (outlineBucket) outlineBucket.push(out);
  return out;
}

// Procedural stylized anime/wuxia face texture
function createFaceTexture(sectId, design) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Warm cel-shaded skin base
  ctx.fillStyle = design.skin;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle cheek/chin warmth gradient
  const grad = ctx.createRadialGradient(128, 138, 18, 128, 138, 120);
  grad.addColorStop(0, 'rgba(255, 224, 195, 0.25)');
  grad.addColorStop(1, 'rgba(186, 114, 72, 0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Face features centered around UV front (x=128, y=126)
  // 1. Six Shaolin incense dots on forehead
  if (sectId === 'thieulam') {
    ctx.fillStyle = '#8b573c';
    for (const rowY of [82, 92]) {
      for (const colX of [118, 128, 138]) {
        ctx.beginPath();
        ctx.arc(colX, rowY, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 2. Fierce stylized Wuxia eyebrows
  ctx.strokeStyle = '#1f120d';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(86, 110);
  ctx.quadraticCurveTo(104, 105, 118, 114);
  ctx.moveTo(170, 110);
  ctx.quadraticCurveTo(152, 105, 138, 114);
  ctx.stroke();

  // 3. Sharp anime/wuxia eyes
  const drawEye = (cx, isLeft) => {
    // Sclera
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(cx, 127, 13, 8.5, isLeft ? 0.08 : -0.08, 0, Math.PI * 2);
    ctx.fill();

    // Iris
    ctx.fillStyle = sectId === 'minhgiao' ? '#991b1b' : sectId === 'duongmon' ? '#581c87' : '#2b1810';
    ctx.beginPath();
    ctx.arc(cx + (isLeft ? 1 : -1), 127, 6.2, 0, Math.PI * 2);
    ctx.fill();

    // Pupil + crisp highlight
    ctx.fillStyle = '#090606';
    ctx.beginPath();
    ctx.arc(cx + (isLeft ? 1 : -1), 127, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 2, 124, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Bold upper ink lash line
    ctx.strokeStyle = '#160c09';
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, 124);
    ctx.quadraticCurveTo(cx, 115, cx + 14, 125);
    ctx.stroke();
  };
  drawEye(104, true);
  drawEye(152, false);

  // 4. Nose shadow & determined mouth (or Đường Môn assassin mask!)
  if (sectId === 'duongmon') {
    // Indigo face mask covering nose & mouth
    ctx.fillStyle = '#24143a';
    ctx.beginPath();
    ctx.moveTo(64, 140);
    ctx.quadraticCurveTo(128, 132, 192, 140);
    ctx.lineTo(192, 220);
    ctx.lineTo(64, 220);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(68, 142);
    ctx.quadraticCurveTo(128, 134, 188, 142);
    ctx.stroke();
  } else {
    // Nose bridge ink accent
    ctx.strokeStyle = '#a56746';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(128, 132);
    ctx.lineTo(125, 146);
    ctx.lineTo(131, 148);
    ctx.stroke();

    // Determined hero mouth
    ctx.strokeStyle = '#5c2d1f';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(116, 165);
    ctx.quadraticCurveTo(128, 161, 140, 165);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Procedural cross-collar martial tunic texture (Vạt chéo cổ áo & nếp vải cel-shaded)
function createRobeTexture(sectId, design) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Primary tunic base
  ctx.fillStyle = design.primary;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle cel-shaded side fold shadows
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.fillRect(0, 0, 70, 512);
  ctx.fillRect(442, 0, 70, 512);

  // Diagonal cross-collar lapel (center front is x=256)
  // Left shoulder to right waist diagonal drape (classic Shaolin / Wuxia kasaya lapel!)
  ctx.fillStyle = design.secondary;
  ctx.beginPath();
  ctx.moveTo(130, 0);
  ctx.lineTo(256, 0);
  ctx.lineTo(360, 512);
  ctx.lineTo(175, 512);
  ctx.closePath();
  ctx.fill();

  // Inner chest V-neck skin glimpse at top center
  if (sectId === 'thieulam' || sectId === 'caibang') {
    ctx.fillStyle = design.skin;
    ctx.beginPath();
    ctx.moveTo(222, 0);
    ctx.lineTo(290, 0);
    ctx.lineTo(256, 138);
    ctx.closePath();
    ctx.fill();
  }

  // Bold dark-trimmed V-collar bands with ink lines
  ctx.strokeStyle = design.trim;
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(192, 0);
  ctx.lineTo(298, 250);
  ctx.moveTo(320, 0);
  ctx.lineTo(212, 260);
  ctx.stroke();

  ctx.strokeStyle = '#1b0f0a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(179, 0);
  ctx.lineTo(286, 252);
  ctx.moveTo(205, 0);
  ctx.lineTo(311, 248);
  ctx.moveTo(307, 0);
  ctx.lineTo(200, 258);
  ctx.moveTo(333, 0);
  ctx.lineTo(224, 262);
  ctx.stroke();

  // Sect-specific chest motif
  if (sectId === 'vodang') {
    // Crisp Yin-Yang crest on chest & back
    for (const cx of [256, 0, 512]) {
      ctx.save();
      ctx.translate(cx, 310);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath(); ctx.arc(0, 0, 34, Math.PI / 2, -Math.PI / 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -17, 17, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath(); ctx.arc(0, 17, 17, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1b0f0a'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  } else if (sectId === 'duonggia') {
    // Bronze lamellar armor plates across chest
    ctx.strokeStyle = '#451a03';
    ctx.lineWidth = 4;
    for (let y = 160; y < 440; y += 44) {
      ctx.fillStyle = y % 88 === 0 ? '#d97706' : '#b45309';
      ctx.fillRect(156, y, 200, 34);
      ctx.strokeRect(156, y, 200, 34);
    }
  } else if (sectId === 'minhgiao') {
    // Golden flame crest on chest
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(256, 220);
    ctx.quadraticCurveTo(295, 290, 276, 350);
    ctx.lineTo(256, 326);
    ctx.lineTo(236, 350);
    ctx.quadraticCurveTo(217, 290, 256, 220);
    ctx.fill();
    ctx.strokeStyle = '#1b0f0a'; ctx.lineWidth = 4; ctx.stroke();
  }

  // Stylized comic fabric crease lines
  ctx.strokeStyle = 'rgba(27, 15, 10, 0.35)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(150, 320); ctx.quadraticCurveTo(185, 390, 170, 480);
  ctx.moveTo(360, 310); ctx.quadraticCurveTo(325, 385, 340, 485);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Criss-cross cloth bandage texture (băng quấn cổ tay & xà cạp bắp chân như hình Thiếu Lâm!)
function createWrapTexture(baseColor, lineColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 8;
  for (let i = -256; i < 512; i += 44) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 180);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 180);
    ctx.stroke();
  }

  // Ink shadow lines between wraps
  ctx.strokeStyle = 'rgba(27, 15, 10, 0.42)';
  ctx.lineWidth = 3;
  for (let y = 24; y < 256; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 12);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSectMaterials(sectId) {
  if (sectResourceCache.has(sectId)) return sectResourceCache.get(sectId);
  const design = SECT_DESIGNS[sectId] || SECT_DESIGNS.thieulam;
  const faceTex = createFaceTexture(sectId, design);
  const robeTex = createRobeTexture(sectId, design);
  const wrapTex = createWrapTexture(design.wrapBase, design.wrapLine);

  const mats = {
    design,
    skin: makeToonMat(design.skin),
    face: makeToonMat({ map: faceTex }),
    robe: makeToonMat({ map: robeTex }),
    primary: makeToonMat(design.primary),
    secondary: makeToonMat(design.secondary),
    trim: makeToonMat(design.trim),
    pants: makeToonMat(design.pants),
    wrap: makeToonMat({ map: wrapTex }),
    shoe: makeToonMat(design.shoe),
    shoeSole: makeToonMat('#f5efe0'),
    hair: makeToonMat('#1b1416'),
    gold: makeToonMat({ color: '#f5b82e', emissive: '#6e3f05', emissiveIntensity: 0.18 }),
    steel: makeToonMat({ color: '#cbd5e1', emissive: '#334155', emissiveIntensity: 0.12 }),
    wood: makeToonMat('#6b3b20'),
    beadWood: makeToonMat({ color: '#5c2e14', emissive: '#291005', emissiveIntensity: 0.12 }),
    crimson: makeToonMat({ color: '#dc2626', emissive: '#7f1d1d', emissiveIntensity: 0.22 })
  };
  sectResourceCache.set(sectId, mats);
  return mats;
}

// ============================================================================
// BUILD WEAPONS (CEL-SHADED + INK OUTLINED)
// ============================================================================
function buildStylizedWeapon(weaponType, mats, outlines) {
  const g = new THREE.Group();

  if (weaponType === 'con') {
    // HÀNG MA CÔN THIẾU LÂM (Đúng mẫu hình: Thân gỗ mun + 2 đầu bịt thép bạc có đinh tán!)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 3.85, 10), mats.wood);
    addOutline(shaft, 1.15, outlines);
    g.add(shaft);

    for (const endY of [-1.72, 1.72]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.084, 0.72, 10), mats.steel);
      cap.position.y = endY;
      addOutline(cap, 1.14, outlines);
      g.add(cap);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.022, 6, 12), mats.steel);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = endY > 0 ? endY - 0.34 : endY + 0.34;
      g.add(collar);

      // 2 Đinh tán trên đầu bịt thép
      for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), getInkMaterial());
        rivet.position.set(Math.cos(a) * 0.088, endY + (endY > 0 ? -0.18 : 0.18), Math.sin(a) * 0.088);
        g.add(rivet);
      }
    }
  } else if (weaponType === 'kiem') {
    // THÁI CỰC KIẾM VÕ ĐANG
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.35, 0.045), mats.steel);
    blade.position.y = 1.25;
    addOutline(blade, 1.14, outlines);
    g.add(blade);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 4), mats.steel);
    tip.rotation.y = Math.PI / 4;
    tip.position.y = 2.58;
    addOutline(tip, 1.15, outlines);
    g.add(tip);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.11, 0.14), mats.gold);
    guard.position.y = 0.06;
    addOutline(guard, 1.12, outlines);
    g.add(guard);

    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.48, 8), mats.trim);
    hilt.position.y = -0.22;
    g.add(hilt);

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), mats.gold);
    pommel.position.y = -0.48;
    g.add(pommel);

    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.38, 7), mats.crimson);
    tassel.position.y = -0.7;
    g.add(tassel);
  } else if (weaponType === 'thuong') {
    // PHÁ QUÂN TRƯỜNG THƯƠNG DƯƠNG GIA
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.9, 10), mats.wood);
    shaft.position.y = 0.95;
    addOutline(shaft, 1.16, outlines);
    g.add(shaft);

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 8), mats.gold);
    collar.position.y = 2.86;
    g.add(collar);

    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.52, 10), mats.crimson);
    tassel.rotation.x = Math.PI;
    tassel.position.y = 2.65;
    addOutline(tassel, 1.1, outlines);
    g.add(tassel);

    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 6), mats.steel);
    blade.scale.set(1, 1, 0.35);
    blade.position.y = 3.36;
    addOutline(blade, 1.14, outlines);
    g.add(blade);
  } else if (weaponType === 'dao') {
    // ĐỒ LONG HUYẾT ĐAO MINH GIÁO
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.36, 2.25, 0.065), mats.steel);
    blade.position.set(0.06, 1.2, 0);
    addOutline(blade, 1.12, outlines);
    g.add(blade);

    const fieryEdge = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.2, 0.075), mats.crimson);
    fieryEdge.position.set(0.24, 1.2, 0);
    g.add(fieryEdge);

    const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 10), mats.gold);
    guard.position.y = 0.05;
    addOutline(guard, 1.12, outlines);
    g.add(guard);

    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.52, 8), mats.wood);
    hilt.position.y = -0.25;
    g.add(hilt);
  } else if (weaponType === 'cung') {
    // LẠC NHẬT CUNG TIÊU DAO
    const bowArc = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.065, 8, 22, Math.PI), mats.wood);
    bowArc.rotation.z = -Math.PI / 2;
    addOutline(bowArc, 1.15, outlines);
    g.add(bowArc);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.36, 8), mats.gold);
    grip.position.x = 1.04;
    g.add(grip);

    const bowString = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 2.08, 4),
      new THREE.MeshBasicMaterial({ color: '#fef08a' })
    );
    g.add(bowString);

    // Nocked arrow ready to fire
    const arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), mats.gold);
    arrow.rotation.z = Math.PI / 2;
    arrow.position.x = 0.65;
    g.add(arrow);
  } else if (weaponType === 'tieu') {
    // BÃO VŨ PHI TIÊU ĐƯỜNG MÔN
    const starGroup = new THREE.Group();
    const starMat = makeToonMat({ color: '#c084fc', emissive: '#7e22ce', emissiveIntensity: 0.45 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 4), starMat);
      blade.rotation.z = (i * Math.PI) / 2;
      blade.position.set(Math.sin(i * Math.PI / 2) * 0.22, Math.cos(i * Math.PI / 2) * 0.22, 0);
      addOutline(blade, 1.14, outlines);
      starGroup.add(blade);
    }
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), mats.steel);
    core.rotation.x = Math.PI / 2;
    starGroup.add(core);
    starGroup.position.y = 0.22;
    g.add(starGroup);
  } else {
    // GIÁNG LONG QUYỀN CÁI BANG (Găng tay băng vải + Hào quang Kim Long)
    const fistWrap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), mats.wrap);
    addOutline(fistWrap, 1.12, outlines);
    g.add(fistWrap);

    const qiGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 10, 10),
      new THREE.MeshBasicMaterial({ color: '#fbbf24', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending })
    );
    g.add(qiGlow);
  }

  return g;
}

// ============================================================================
// BUILD ICONIC SECT HAIR & ACCESSORIES
// ============================================================================
function buildHair(headGroup, style, mats, outlines) {
  if (style === 'bald') return;

  // Hair cap covering cranium
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.395, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.58),
    mats.hair
  );
  cap.position.y = 0.05;
  cap.rotation.x = -0.18;
  addOutline(cap, 1.07, outlines);
  headGroup.add(cap);

  if (style === 'daoistCrown') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mats.hair);
    bun.position.set(0, 0.48, -0.06);
    addOutline(bun, 1.1, outlines);
    headGroup.add(bun);

    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.18, 8), mats.secondary);
    crown.position.set(0, 0.5, -0.06);
    addOutline(crown, 1.1, outlines);
    headGroup.add(crown);

    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.62, 6), mats.gold);
    pin.rotation.z = Math.PI / 2;
    pin.position.set(0, 0.52, -0.06);
    headGroup.add(pin);

    // Flowing long Daoist back hair
    const backHair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.14), mats.hair);
    backHair.position.set(0, -0.15, -0.34);
    backHair.rotation.x = 0.18;
    addOutline(backHair, 1.09, outlines);
    headGroup.add(backHair);
  } else if (style === 'redRibbonTopknot') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), mats.hair);
    bun.position.set(0, 0.48, -0.05);
    addOutline(bun, 1.1, outlines);
    headGroup.add(bun);

    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.04), mats.crimson);
    ribbon.position.set(0, 0.25, -0.35);
    ribbon.rotation.x = 0.55;
    addOutline(ribbon, 1.12, outlines);
    headGroup.add(ribbon);
  } else if (style === 'spikyHeadband' || style === 'wildHeadband') {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.065, 8, 18), style === 'spikyHeadband' ? mats.crimson : mats.gold);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.15;
    addOutline(band, 1.08, outlines);
    headGroup.add(band);

    for (let i = 0; i < 5; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.44, 6), mats.hair);
      spike.position.set((i - 2) * 0.14, 0.38, -0.18 - Math.abs(i - 2) * 0.04);
      spike.rotation.x = -0.6;
      addOutline(spike, 1.1, outlines);
      headGroup.add(spike);
    }
  } else if (style === 'jadePonytail' || style === 'assassinMask') {
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), mats.hair);
    tail.position.set(0, 0.06, -0.44);
    tail.rotation.x = 0.48;
    addOutline(tail, 1.09, outlines);
    headGroup.add(tail);

    const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), style === 'jadePonytail' ? mats.gold : mats.trim);
    clasp.position.set(0, 0.34, -0.32);
    clasp.rotation.x = 0.6;
    headGroup.add(clasp);
  }
}

function buildAccessory(torsoGroup, accessoryType, mats, outlines) {
  if (accessoryType === 'prayerBeads') {
    // TRÀNG HẠT GỖ KHỔNG LỒ ĐEO CỔ THIẾU LÂM (16 hạt gỗ nâu bóng như hình mẫu!)
    const beadGroup = new THREE.Group();
    const beadGeo = new THREE.SphereGeometry(0.115, 10, 10);
    const count = 16;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      // Vòng cổ cao phía sau gáy, rủ dài xuống trước ngực
      const x = Math.sin(t) * 0.37;
      const z = Math.cos(t) * 0.28 + 0.08;
      const y = 1.94 - Math.max(0, Math.cos(t)) * 0.48;
      const bead = new THREE.Mesh(beadGeo, mats.beadWood);
      bead.position.set(x, y, z);
      addOutline(bead, 1.15, outlines);
      beadGroup.add(bead);
    }
    torsoGroup.add(beadGroup);
  } else if (accessoryType === 'warCape' || accessoryType === 'flameScarf' || accessoryType === 'violetScarf') {
    const capeMat = accessoryType === 'violetScarf' ? mats.trim : mats.crimson;
    const w = accessoryType === 'warCape' ? 0.92 : 0.42;
    const h = accessoryType === 'warCape' ? 1.55 : 1.15;
    const cape = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), capeMat);
    cape.position.set(0, 1.88 - h / 2, -0.38);
    cape.rotation.x = 0.22;
    addOutline(cape, 1.08, outlines);
    torsoGroup.add(cape);
    return cape;
  } else if (accessoryType === 'quiver') {
    // Ống tên đeo chéo sau lưng Tiêu Dao
    const qGroup = new THREE.Group();
    qGroup.position.set(-0.18, 1.58, -0.36);
    qGroup.rotation.z = -0.45;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.95, 8), mats.trim);
    addOutline(tube, 1.12, outlines);
    qGroup.add(tube);
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2;
      const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.24, 5), mats.secondary);
      fletch.position.set(Math.cos(ang) * 0.055, 0.56, Math.sin(ang) * 0.055);
      qGroup.add(fletch);
    }
    torsoGroup.add(qGroup);
  } else if (accessoryType === 'wineGourd') {
    // Hồ lô rượu đeo hông Cái Bang
    const gGroup = new THREE.Group();
    gGroup.position.set(-0.46, 1.05, -0.1);
    gGroup.rotation.z = 0.35;
    const lower = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), mats.gold);
    addOutline(lower, 1.12, outlines);
    gGroup.add(lower);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), mats.gold);
    upper.position.y = 0.27;
    addOutline(upper, 1.12, outlines);
    gGroup.add(upper);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 8), mats.crimson);
    cork.position.y = 0.42;
    gGroup.add(cork);
    torsoGroup.add(gGroup);
  } else if (accessoryType === 'daoistRibbons') {
    const ribL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.03), mats.secondary);
    ribL.position.set(-0.36, 1.32, -0.34);
    ribL.rotation.x = 0.18;
    addOutline(ribL, 1.12, outlines);
    torsoGroup.add(ribL);
    const ribR = ribL.clone();
    ribR.position.x = 0.36;
    torsoGroup.add(ribR);
  }
  return null;
}

// ============================================================================
// MAIN BUILDER: CONSTRUCT FULL ARTICULATED STYLIZED 3D HERO
// ============================================================================
export function createStylizedWuxiaRig(sectId, weaponType, castShadow = true) {
  const mats = getSectMaterials(sectId);
  const design = mats.design;
  const outlines = [];

  const bodyPivot = new THREE.Group();
  const upperBody = new THREE.Group();
  bodyPivot.add(upperBody);

  // --------------------------------------------------------------------------
  // 1. CHÂN (QUẦN RỘNG VÕ THUẬT + XÀ CẠP QUẤN BẮP CHÂN + GIÀY VẢI ĐẾ TRẮNG)
  // --------------------------------------------------------------------------
  const buildLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.23, 1.02, 0);

    // Đùi quần phồng rộng (baggy martial trousers)
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.22, 0.52, 10), mats.pants);
    thigh.position.y = -0.24;
    thigh.castShadow = castShadow;
    addOutline(thigh, 1.08, outlines);
    hip.add(thigh);

    // Khớp gối + Ống chân quấn xà cạp chéo (wrapped shins!)
    const knee = new THREE.Group();
    knee.position.y = -0.48;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.105, 0.48, 10), mats.wrap);
    shin.position.y = -0.22;
    shin.castShadow = castShadow;
    addOutline(shin, 1.09, outlines);
    knee.add(shin);

    // Giày vải võ thuật nâu + đế trắng
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.38), mats.shoe);
    shoe.position.set(0, -0.46, 0.08);
    shoe.castShadow = castShadow;
    addOutline(shoe, 1.09, outlines);
    knee.add(shoe);

    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.045, 0.4), mats.shoeSole);
    sole.position.set(0, -0.52, 0.08);
    knee.add(sole);

    hip.add(knee);
    return { hip, knee };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  bodyPivot.add(leftLeg.hip);
  bodyPivot.add(rightLeg.hip);

  // --------------------------------------------------------------------------
  // 2. THÂN TRÊN (ÁO VẠT CHÉO + ĐAI LƯNG QUẤN NHIỀU LỚP + TÀ ÁO XẺ TRƯỚC/SAU)
  // --------------------------------------------------------------------------
  // Hông / Pelvis
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.26, 10), mats.pants);
  pelvis.position.y = 1.06;
  pelvis.castShadow = castShadow;
  bodyPivot.add(pelvis);

  // Thân áo chữ V lực lưỡng
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.34, 0.96, 12), mats.robe);
  torso.position.y = 1.62;
  torso.rotation.y = Math.PI; // Mặt trước cross-collar hướng +Z
  torso.castShadow = castShadow;
  torso.receiveShadow = true;
  addOutline(torso, 1.065, outlines);
  upperBody.add(torso);

  // Đai lưng vải quấn 3 tầng + Nút thắt rủ bên hông (y hệt Thiếu Lâm trong hình!)
  for (let i = 0; i < 3; i++) {
    const sashRing = new THREE.Mesh(new THREE.TorusGeometry(0.355 + i * 0.008, 0.065, 7, 16), mats.trim);
    sashRing.rotation.x = Math.PI / 2;
    sashRing.position.y = 1.12 + i * 0.075;
    addOutline(sashRing, 1.09, outlines);
    upperBody.add(sashRing);
  }
  const beltKnot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mats.trim);
  beltKnot.position.set(0.24, 1.18, 0.36);
  addOutline(beltKnot, 1.12, outlines);
  upperBody.add(beltKnot);

  const beltTail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.56, 0.04), mats.trim);
  beltTail.position.set(0.27, 0.88, 0.38);
  beltTail.rotation.z = -0.14;
  addOutline(beltTail, 1.12, outlines);
  upperBody.add(beltTail);

  // Tà áo xẻ dài phía trước & phía sau (Front & Back Split Robe Tabards)
  const frontTabard = new THREE.Group();
  frontTabard.position.set(0, 1.12, 0.32);
  const fPanel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.045), mats.primary);
  fPanel.position.y = -0.36;
  fPanel.castShadow = castShadow;
  addOutline(fPanel, 1.08, outlines);
  frontTabard.add(fPanel);
  upperBody.add(frontTabard);

  const backTabard = new THREE.Group();
  backTabard.position.set(0, 1.12, -0.32);
  const bPanel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.76, 0.045), mats.secondary);
  bPanel.position.y = -0.38;
  bPanel.castShadow = castShadow;
  addOutline(bPanel, 1.08, outlines);
  backTabard.add(bPanel);
  upperBody.add(backTabard);

  // 2 tà hông mở rộng (side flaps)
  for (const s of [-1, 1]) {
    const sideFlap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.68, 0.38), mats.secondary);
    sideFlap.position.set(s * 0.42, 0.8, 0);
    sideFlap.rotation.z = s * 0.16;
    addOutline(sideFlap, 1.1, outlines);
    upperBody.add(sideFlap);
  }

  // Giáp vai (chỉ rõ rệt với Dương Gia / Minh Giáo, các phái khác vai áo phồng tự nhiên)
  if (sectId === 'duonggia' || sectId === 'minhgiao') {
    for (const s of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), mats.gold);
      pauldron.position.set(s * 0.52, 2.02, 0);
      pauldron.rotation.z = -s * 0.45;
      addOutline(pauldron, 1.09, outlines);
      upperBody.add(pauldron);
    }
  }

  // --------------------------------------------------------------------------
  // 3. CỔ, ĐẦU, KHUÔN MẶT VẼ CEL-SHADED & TÓC MÔN PHÁI
  // --------------------------------------------------------------------------
  const headGroup = new THREE.Group();
  headGroup.position.y = 2.44;
  upperBody.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.24, 10), mats.skin);
  neck.position.y = -0.3;
  headGroup.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.37, 18, 16), mats.face);
  head.scale.set(0.94, 1.06, 0.96);
  head.rotation.y = -Math.PI / 2; // Căn đúng mặt vẽ hướng về +Z
  head.castShadow = castShadow;
  addOutline(head, 1.065, outlines);
  headGroup.add(head);

  // Đôi tai
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 8), mats.skin);
    ear.scale.set(0.55, 1.1, 0.8);
    ear.position.set(s * 0.35, -0.02, -0.02);
    headGroup.add(ear);
  }

  buildHair(headGroup, design.hairStyle, mats, outlines);

  // Phụ kiện đặc trưng môn phái (Tràng hạt Thiếu Lâm, Áo choàng Dương Gia, Ống tên Tiêu Dao, Hồ lô Cái Bang...)
  const capeMesh = buildAccessory(upperBody, design.accessory, mats, outlines);

  // --------------------------------------------------------------------------
  // 4. ĐÔI TAY 2 KHỚP (TAY ÁO PHỒNG + BĂNG QUẤN CỔ TAY + BÀN TAY + BINH KHÍ)
  // --------------------------------------------------------------------------
  const buildArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.52, 1.96, 0);

    // Ống tay áo phồng rộng tới khuỷu tay
    const upperSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.2, 0.44, 10), mats.primary);
    upperSleeve.position.y = -0.18;
    upperSleeve.castShadow = castShadow;
    addOutline(upperSleeve, 1.09, outlines);
    shoulder.add(upperSleeve);

    // Khớp khuỷu + Cẳng tay quấn băng vải (wrapped forearm!)
    const elbow = new THREE.Group();
    elbow.position.y = -0.38;
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.1, 0.42, 10), mats.wrap);
    forearm.position.y = -0.2;
    forearm.castShadow = castShadow;
    addOutline(forearm, 1.1, outlines);
    elbow.add(forearm);

    // Bàn tay / Nắm đấm
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), mats.skin);
    hand.position.y = -0.44;
    addOutline(hand, 1.12, outlines);
    elbow.add(hand);

    shoulder.add(elbow);
    return { shoulder, elbow, hand };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);
  upperBody.add(leftArm.shoulder);
  upperBody.add(rightArm.shoulder);

  // Gắn Binh Khí vào đúng tay & đúng thế đứng môn phái!
  const weapon = buildStylizedWeapon(weaponType, mats, outlines);
  if (weaponType === 'cung') {
    weapon.position.set(0, -0.44, 0.12);
    leftArm.elbow.add(weapon);
  } else if (weaponType === 'quyen') {
    weapon.position.set(0, -0.46, 0);
    rightArm.elbow.add(weapon);
    const offFist = buildStylizedWeapon('quyen', mats, outlines);
    offFist.position.set(0, -0.46, 0);
    leftArm.elbow.add(offFist);
  } else if (weaponType === 'con') {
    // Thiếu Lâm: Cầm côn chéo ngang hông/lưng đúng tư thế trong ảnh mẫu!
    weapon.position.set(0.04, -0.46, 0.12);
    weapon.rotation.set(0.55, 0.15, 0.72);
    rightArm.elbow.add(weapon);
  } else {
    weapon.position.set(0, -0.46, 0.12);
    weapon.rotation.x = Math.PI / 2.2;
    rightArm.elbow.add(weapon);
  }

  return {
    bodyPivot,
    upperBody,
    headGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    frontTabard,
    backTabard,
    capeMesh,
    weapon,
    outlines,
    stance: design.stance,
    accent: design.accent
  };
}

// ============================================================================
// DYNAMIC MARTIAL ANIMATION CONTROLLER (IDLE STANCES, RUN CYCLE, WEAPON STRIKES)
// ============================================================================
export function animateStylizedRig(rig, time, speedMag, attackAnim, phaseSeed) {
  const moving = speedMag > 0.32;

  // 1. Chân bước chạy / tấn đứng võ học
  if (moving) {
    const stride = Math.sin(time * 13 + phaseSeed);
    rig.leftLeg.hip.rotation.x = stride * 0.68;
    rig.rightLeg.hip.rotation.x = -stride * 0.68;
    rig.leftLeg.knee.rotation.x = Math.max(0, -stride) * 0.65;
    rig.rightLeg.knee.rotation.x = Math.max(0, stride) * 0.65;
    rig.bodyPivot.position.y = Math.abs(Math.sin(time * 13 + phaseSeed)) * 0.14;
    rig.upperBody.rotation.x = 0.12;
  } else {
    // Thế đứng mã bộ võ thuật vững chãi
    rig.leftLeg.hip.rotation.x = -0.14;
    rig.rightLeg.hip.rotation.x = 0.14;
    rig.leftLeg.hip.rotation.z = -0.1;
    rig.rightLeg.hip.rotation.z = 0.1;
    rig.leftLeg.knee.rotation.x = 0.22;
    rig.rightLeg.knee.rotation.x = 0.18;
    rig.bodyPivot.position.y = Math.sin(time * 3 + phaseSeed) * 0.035;
    rig.upperBody.rotation.x = 0.03;
  }

  // 2. Tà áo & áo choàng bay phấp phới
  const sway = moving ? 0.35 + Math.sin(time * 13 + phaseSeed) * 0.18 : 0.06 + Math.sin(time * 2.8 + phaseSeed) * 0.04;
  rig.frontTabard.rotation.x = -sway * 0.7;
  rig.backTabard.rotation.x = sway;
  if (rig.capeMesh) {
    rig.capeMesh.rotation.x = 0.2 + sway * 0.9;
  }

  // 3. Thế tay theo từng môn phái & hoạt họa tung chiêu!
  if (attackAnim > 0) {
    const p = 1 - attackAnim / 0.36; // 0 -> 1
    const swing = Math.sin(p * Math.PI);

    if (rig.stance === 'shaolin') {
      // Quét côn mạnh mẽ kết hợp đẩy chưởng trái
      rig.upperBody.rotation.y = (p - 0.5) * 1.1;
      rig.rightArm.shoulder.rotation.set(-1.35 * swing, 0, -0.55 * swing);
      rig.rightArm.elbow.rotation.x = -0.4;
      rig.leftArm.shoulder.rotation.set(-1.3 * swing, 0.3, 0.15);
      rig.leftArm.elbow.rotation.x = -0.2;
    } else if (rig.stance === 'bow') {
      rig.leftArm.shoulder.rotation.set(-1.45, 0.2, 0);
      rig.rightArm.shoulder.rotation.set(-1.4, -0.35, -0.2);
      rig.rightArm.elbow.rotation.x = -1.2 * (1 - p);
    } else if (rig.stance === 'fist') {
      rig.upperBody.rotation.y = Math.sin(p * Math.PI * 2) * 0.6;
      rig.rightArm.shoulder.rotation.x = -1.6 * swing;
      rig.leftArm.shoulder.rotation.x = -1.6 * Math.cos(p * Math.PI);
    } else if (rig.stance === 'spear') {
      rig.upperBody.rotation.y = -0.45 * swing;
      rig.rightArm.shoulder.rotation.set(-1.55 * swing, 0, -0.15);
      rig.rightArm.elbow.rotation.x = -0.15;
    } else {
      // Kiếm / Đao / Tiêu chém vòng cung uy lực
      rig.upperBody.rotation.y = (0.5 - p) * 1.1;
      rig.rightArm.shoulder.rotation.set(-1.85 * swing, 0, -0.65 * swing);
      rig.rightArm.elbow.rotation.x = -0.35;
    }
  } else {
    rig.upperBody.rotation.y *= 0.85;
    if (rig.stance === 'shaolin') {
      // ĐÚNG TƯ THẾ THIẾU LÂM TRONG ẢNH MẪU:
      // Tay trái dựng đơn chưởng trước ngực, tay phải cầm côn chéo bên hông!
      rig.leftArm.shoulder.rotation.set(-0.82, 0.55, 0.24);
      rig.leftArm.elbow.rotation.x = -1.15;
      rig.rightArm.shoulder.rotation.set(0.22, -0.1, -0.35);
      rig.rightArm.elbow.rotation.x = -0.52;
    } else if (rig.stance === 'bow') {
      rig.leftArm.shoulder.rotation.set(-1.35, 0.2, 0.08);
      rig.leftArm.elbow.rotation.x = -0.12;
      rig.rightArm.shoulder.rotation.set(-0.9, -0.25, -0.2);
      rig.rightArm.elbow.rotation.x = -0.95;
    } else if (rig.stance === 'sword') {
      // Võ Đang: Tay trái bắt kiếm chỉ trước ngực, tay phải cầm Thái Cực Kiếm
      rig.leftArm.shoulder.rotation.set(-0.7, 0.45, 0.25);
      rig.leftArm.elbow.rotation.x = -0.9;
      rig.rightArm.shoulder.rotation.set(-0.35, 0, -0.28);
      rig.rightArm.elbow.rotation.x = -0.45;
    } else if (rig.stance === 'fist') {
      rig.leftArm.shoulder.rotation.set(-0.95, 0.3, 0.22);
      rig.leftArm.elbow.rotation.x = -1.05;
      rig.rightArm.shoulder.rotation.set(-0.85, -0.25, -0.22);
      rig.rightArm.elbow.rotation.x = -0.95;
    } else {
      const armSwing = moving ? Math.sin(time * 13 + phaseSeed) * 0.45 : 0;
      rig.leftArm.shoulder.rotation.set(-0.35 - armSwing, 0.15, 0.2);
      rig.leftArm.elbow.rotation.x = -0.55;
      rig.rightArm.shoulder.rotation.set(-0.45 + armSwing * 0.5, -0.1, -0.28);
      rig.rightArm.elbow.rotation.x = -0.5;
    }
  }
}

// ============================================================================
// KHÁN GIẢ 3D CỔ PHONG KIẾM HIỆP (STYLIZED CEL-SHADED WUXIA SPECTATORS)
// 6 tạo hình đặc sắc (Đệ tử cầm cờ, Lãng khách nón trúc, Nữ hiệp quạt xếp,
// Trưởng lão đèn lồng, Võ tăng tràng hạt, Công tử giang hồ) dùng chung cache
// geometry & texture để 36+ khán giả vẫn giữ mượt 60 FPS!
// ============================================================================
const SPECTATOR_ARCHETYPES = [
  {
    id: 'disciple_flag',
    robe: '#b91c1c',
    lapel: '#fef3c7',
    sash: '#f59e0b',
    sleeve: '#991b1b',
    skin: '#f4c59f',
    faceStyle: 'excited',
    headgear: 'headband',
    prop: 'flag',
    flagColor: '#dc2626',
    flagTrim: '#fde047'
  },
  {
    id: 'ronin_hat',
    robe: '#0f766e',
    lapel: '#134e4a',
    sash: '#d97706',
    sleeve: '#115e59',
    skin: '#efbe96',
    faceStyle: 'happy',
    headgear: 'bambooHat',
    prop: 'none'
  },
  {
    id: 'heroine_fan',
    robe: '#e11d48',
    lapel: '#fff1f2',
    sash: '#fbbf24',
    sleeve: '#fb7185',
    skin: '#f9d5bb',
    faceStyle: 'happy',
    headgear: 'twinBuns',
    prop: 'fan',
    fanColor: '#fef08a'
  },
  {
    id: 'elder_lantern',
    robe: '#e2e8f0',
    lapel: '#1d4ed8',
    sash: '#1e3a8a',
    sleeve: '#cbd5e1',
    skin: '#f2c8a6',
    faceStyle: 'elder',
    headgear: 'daoistCap',
    prop: 'lantern'
  },
  {
    id: 'shaolin_monk',
    robe: '#ea580c',
    lapel: '#facc15',
    sash: '#7c2d12',
    sleeve: '#c2410c',
    skin: '#f1be94',
    faceStyle: 'excited',
    headgear: 'monk',
    prop: 'beads'
  },
  {
    id: 'noble_scholar',
    robe: '#4338ca',
    lapel: '#e0e7ff',
    sash: '#c084fc',
    sleeve: '#3730a3',
    skin: '#f7d2b6',
    faceStyle: 'happy',
    headgear: 'topknotRibbon',
    prop: 'flag',
    flagColor: '#15803d',
    flagTrim: '#fde047'
  }
];

let spectatorCache = null;

function makeSpectatorFaceTex(style, skinHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = skinHex;
  ctx.fillRect(0, 0, 128, 128);

  // Má hồng ấm nhẹ
  ctx.fillStyle = 'rgba(244, 114, 114, 0.28)';
  ctx.beginPath();
  ctx.arc(46, 73, 8, 0, Math.PI * 2);
  ctx.arc(82, 73, 8, 0, Math.PI * 2);
  ctx.fill();

  // Lông mày
  ctx.strokeStyle = style === 'elder' ? '#e2e8f0' : '#1f120d';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(42, 52);
  ctx.quadraticCurveTo(51, 47, 58, 52);
  ctx.moveTo(86, 52);
  ctx.quadraticCurveTo(77, 47, 70, 52);
  ctx.stroke();

  // Đôi mắt biểu cảm cổ phong
  if (style === 'excited') {
    ctx.strokeStyle = '#180d09';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.arc(51, 63, 5.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(77, 63, 5.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
  } else {
    for (const cx of [51, 77]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, 62, 6, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e120d';
      ctx.beginPath();
      ctx.arc(cx, 62, 3.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 1, 60.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Nụ cười cổ vũ (và râu bạc cho Trưởng Lão)
  if (style === 'elder') {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(48, 76);
    ctx.quadraticCurveTo(64, 71, 80, 76);
    ctx.quadraticCurveTo(72, 86, 64, 96);
    ctx.quadraticCurveTo(56, 86, 48, 76);
    ctx.fill();
  } else if (style === 'excited') {
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(64, 77, 6.5, 0, Math.PI);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#7c2d12';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(64, 74, 6, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSpectatorRobeTex(arch) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = arch.robe;
  ctx.fillRect(0, 0, 256, 256);

  // Vạt áo chéo chữ Y truyền thống (mặt trước nằm quanh x = 128)
  ctx.fillStyle = arch.lapel;
  ctx.beginPath();
  ctx.moveTo(100, 0);
  ctx.lineTo(156, 0);
  ctx.lineTo(146, 130);
  ctx.lineTo(116, 130);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = arch.sash;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(104, 0);
  ctx.lineTo(144, 130);
  ctx.moveTo(152, 0);
  ctx.lineTo(124, 92);
  ctx.stroke();

  // Đai lưng bản rộng
  ctx.fillStyle = arch.sash;
  ctx.fillRect(0, 128, 256, 30);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(114, 132, 28, 22);

  // Vạch nếp vải cel-shaded dưới tà áo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(0, 158, 38, 98);
  ctx.fillRect(218, 158, 38, 98);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function getSpectatorSharedResources() {
  if (spectatorCache) return spectatorCache;

  const geos = {
    skirt: new THREE.CylinderGeometry(0.35, 0.54, 0.86, 10),
    torso: new THREE.CylinderGeometry(0.41, 0.34, 0.78, 10),
    shoulder: new THREE.SphereGeometry(0.18, 8, 8),
    arm: new THREE.CylinderGeometry(0.13, 0.11, 0.64, 8),
    hand: new THREE.SphereGeometry(0.11, 7, 7),
    head: new THREE.SphereGeometry(0.32, 12, 10),
    hairCap: new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
    bun: new THREE.SphereGeometry(0.14, 8, 8),
    bambooHat: new THREE.ConeGeometry(0.76, 0.36, 16),
    bambooRim: new THREE.TorusGeometry(0.73, 0.035, 6, 18),
    daoistCap: new THREE.CylinderGeometry(0.16, 0.2, 0.24, 8),
    beard: new THREE.ConeGeometry(0.12, 0.34, 6),
    flagPole: new THREE.CylinderGeometry(0.03, 0.03, 1.55, 6),
    flagCloth: new THREE.PlaneGeometry(0.86, 0.54),
    fanGeo: new THREE.CircleGeometry(0.42, 10, -Math.PI * 0.35, Math.PI * 0.7),
    lanternBody: new THREE.SphereGeometry(0.24, 10, 8),
    lanternCap: new THREE.CylinderGeometry(0.11, 0.11, 0.07, 8)
  };

  const mats = {
    hairDark: makeToonMat('#1b1414'),
    hairWhite: makeToonMat('#e2e8f0'),
    gold: makeToonMat('#f59e0b'),
    jade: makeToonMat('#2dd4bf'),
    wood: makeToonMat('#78350f'),
    bamboo: makeToonMat('#d6b26f'),
    hatDarkTrim: makeToonMat('#29201b'),
    lanternRed: new THREE.MeshBasicMaterial({ color: '#ff5228' }),
    lanternGlow: new THREE.MeshBasicMaterial({ color: '#fde047' }),
    faces: {
      happy: makeToonMat({ map: makeSpectatorFaceTex('happy', '#f5c9a4') }),
      excited: makeToonMat({ map: makeSpectatorFaceTex('excited', '#f1be94') }),
      elder: makeToonMat({ map: makeSpectatorFaceTex('elder', '#f2c8a6') })
    }
  };

  const archMats = {};
  for (const a of SPECTATOR_ARCHETYPES) {
    archMats[a.id] = {
      robe: makeToonMat({ map: makeSpectatorRobeTex(a) }),
      sleeve: makeToonMat(a.sleeve),
      sash: makeToonMat(a.sash),
      skin: makeToonMat(a.skin),
      flag: a.flagColor ? makeToonMat({ color: a.flagColor, side: THREE.DoubleSide }) : null,
      fan: a.fanColor ? makeToonMat({ color: a.fanColor, side: THREE.DoubleSide }) : null
    };
  }

  spectatorCache = { geos, mats, archMats };
  return spectatorCache;
}

export function createStylizedSpectator(variantIndex = 0, showOutlines = true) {
  const { geos, mats, archMats } = getSpectatorSharedResources();
  const arch = SPECTATOR_ARCHETYPES[variantIndex % SPECTATOR_ARCHETYPES.length];
  const am = archMats[arch.id];
  const outlines = [];

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // 1. Váy/tà võ phục cổ phong + thân áo vạt chéo
  const skirt = new THREE.Mesh(geos.skirt, am.robe);
  skirt.position.y = 0.44;
  bodyPivot.add(skirt);

  const torso = new THREE.Mesh(geos.torso, am.robe);
  torso.position.y = 1.15;
  if (showOutlines) addOutline(torso, 1.07, outlines);
  bodyPivot.add(torso);

  // 2. Đầu + Khuôn mặt biểu cảm + Mũ/Tóc đặc trưng từng nhân vật
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.78;
  bodyPivot.add(headGroup);

  const head = new THREE.Mesh(geos.head, mats.faces[arch.faceStyle] || mats.faces.happy);
  // Xoay nhẹ UV sphere để mặt hướng đúng về +Z (nhìn thẳng ra võ đài)
  head.rotation.y = -Math.PI / 2;
  if (showOutlines) addOutline(head, 1.08, outlines);
  headGroup.add(head);

  if (arch.headgear === 'bambooHat') {
    const hat = new THREE.Mesh(geos.bambooHat, mats.bamboo);
    hat.position.y = 0.27;
    if (showOutlines) addOutline(hat, 1.05, outlines);
    headGroup.add(hat);
    const rim = new THREE.Mesh(geos.bambooRim, mats.hatDarkTrim);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.11;
    headGroup.add(rim);
  } else if (arch.headgear === 'twinBuns') {
    const cap = new THREE.Mesh(geos.hairCap, mats.hairDark);
    cap.position.y = 0.04;
    headGroup.add(cap);
    [-0.28, 0.28].forEach((bx) => {
      const b = new THREE.Mesh(geos.bun, mats.hairDark);
      b.position.set(bx, 0.26, -0.02);
      headGroup.add(b);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 5), mats.gold);
      pin.position.set(bx * 1.1, 0.29, -0.02);
      pin.rotation.z = bx > 0 ? -0.55 : 0.55;
      headGroup.add(pin);
    });
  } else if (arch.headgear === 'daoistCap') {
    const cap = new THREE.Mesh(geos.hairCap, mats.hairWhite);
    cap.position.y = 0.04;
    headGroup.add(cap);
    const crown = new THREE.Mesh(geos.daoistCap, mats.gold);
    crown.position.y = 0.34;
    headGroup.add(crown);
    const beard = new THREE.Mesh(geos.beard, mats.hairWhite);
    beard.position.set(0, -0.24, 0.24);
    beard.rotation.x = Math.PI;
    headGroup.add(beard);
  } else if (arch.headgear === 'headband') {
    const cap = new THREE.Mesh(geos.hairCap, mats.hairDark);
    cap.position.y = 0.04;
    headGroup.add(cap);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.045, 6, 16), am.sash);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.14;
    headGroup.add(band);
    const bun = new THREE.Mesh(geos.bun, mats.hairDark);
    bun.position.set(0, 0.35, -0.06);
    headGroup.add(bun);
  } else if (arch.headgear === 'topknotRibbon') {
    const cap = new THREE.Mesh(geos.hairCap, mats.hairDark);
    cap.position.y = 0.04;
    headGroup.add(cap);
    const bun = new THREE.Mesh(geos.bun, mats.hairDark);
    bun.position.set(0, 0.36, -0.04);
    headGroup.add(bun);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12), mats.jade);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 0.33, -0.04);
    headGroup.add(ring);
  } else if (arch.headgear === 'monk') {
    // Tràng hạt gỗ đeo cổ Võ Tăng
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mats.wood);
      bead.position.set(Math.cos(a) * 0.34, -0.28, Math.sin(a) * 0.24 + 0.06);
      headGroup.add(bead);
    }
  }

  // 3. Hai cánh tay linh hoạt để vẫy cổ vũ, phất cờ, quạt xếp hoặc cầm đèn lồng!
  const buildSpecArm = (side) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(side * 0.45, 1.44, 0);

    const sh = new THREE.Mesh(geos.shoulder, am.sleeve);
    armPivot.add(sh);

    const sleeve = new THREE.Mesh(geos.arm, am.sleeve);
    sleeve.position.y = -0.32;
    armPivot.add(sleeve);

    const hand = new THREE.Mesh(geos.hand, am.skin);
    hand.position.y = -0.66;
    armPivot.add(hand);

    bodyPivot.add(armPivot);
    return armPivot;
  };

  const leftArm = buildSpecArm(-1);
  const rightArm = buildSpecArm(1);

  // 4. Đạo cụ cổ vũ (Cờ lệnh võ đài / Quạt xếp cổ phong / Đèn lồng đỏ)
  let propObj = null;
  if (arch.prop === 'flag' && am.flag) {
    const flagGroup = new THREE.Group();
    flagGroup.position.set(0, -0.66, 0.05);
    const pole = new THREE.Mesh(geos.flagPole, mats.wood);
    pole.position.y = 0.72;
    flagGroup.add(pole);
    const cloth = new THREE.Mesh(geos.flagCloth, am.flag);
    cloth.position.set(0.44, 1.18, 0);
    flagGroup.add(cloth);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), mats.gold);
    tip.position.y = 1.52;
    flagGroup.add(tip);
    rightArm.add(flagGroup);
    propObj = cloth;
  } else if (arch.prop === 'fan' && am.fan) {
    const fan = new THREE.Mesh(geos.fanGeo, am.fan);
    fan.position.set(0, -0.68, 0.24);
    fan.rotation.y = Math.PI / 2;
    rightArm.add(fan);
    propObj = fan;
  } else if (arch.prop === 'lantern') {
    const lGroup = new THREE.Group();
    lGroup.position.set(0, -0.78, 0.28);
    const lBody = new THREE.Mesh(geos.lanternBody, mats.lanternRed);
    lBody.scale.set(1, 1.25, 1);
    lGroup.add(lBody);
    const topCap = new THREE.Mesh(geos.lanternCap, mats.gold);
    topCap.position.y = 0.3;
    lGroup.add(topCap);
    const botCap = new THREE.Mesh(geos.lanternCap, mats.gold);
    botCap.position.y = -0.3;
    lGroup.add(botCap);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), mats.lanternGlow);
    tassel.position.y = -0.42;
    lGroup.add(tassel);
    rightArm.add(lGroup);
    propObj = lGroup;
  }

  return {
    root,
    bodyPivot,
    headGroup,
    leftArm,
    rightArm,
    propObj,
    propType: arch.prop,
    archetype: arch.id,
    outlines
  };
}

export function animateStylizedSpectator(specRig, time, cheering, phase) {
  if (!specRig) return;
  if (cheering) {
    // Reo hò nhiệt huyết: nhảy bật lên + vung cao hai tay + phất cờ/quạt rực rỡ!
    const jump = Math.abs(Math.sin(time * 10.5 + phase)) * 0.42;
    specRig.bodyPivot.position.y = jump;
    specRig.bodyPivot.rotation.z = Math.sin(time * 8 + phase) * 0.08;
    specRig.headGroup.rotation.y = Math.sin(time * 5 + phase) * 0.14;

    specRig.leftArm.rotation.x = -2.45 + Math.sin(time * 13 + phase) * 0.42;
    specRig.leftArm.rotation.z = 0.32;
    specRig.rightArm.rotation.x = -2.55 + Math.cos(time * 13 + phase) * 0.45;
    specRig.rightArm.rotation.z = -0.32;

    if (specRig.propObj && specRig.propType === 'flag') {
      specRig.propObj.rotation.y = Math.sin(time * 16 + phase) * 0.45;
    } else if (specRig.propObj && specRig.propType === 'fan') {
      specRig.propObj.rotation.z = Math.sin(time * 18 + phase) * 0.55;
    }
  } else {
    // Cổ vũ nhẹ tự nhiên: nhún thở, xoay đầu theo dõi trận đấu, phất quạt/đèn lồng dịu nhẹ
    specRig.bodyPivot.position.y = Math.abs(Math.sin(time * 2.4 + phase)) * 0.05;
    specRig.bodyPivot.rotation.z = Math.sin(time * 1.4 + phase) * 0.03;
    specRig.headGroup.rotation.y = Math.sin(time * 1.2 + phase) * 0.24;

    specRig.leftArm.rotation.x = -0.35 + Math.sin(time * 2.2 + phase) * 0.14;
    specRig.leftArm.rotation.z = 0.16;

    if (specRig.propType === 'flag') {
      specRig.rightArm.rotation.x = -1.65 + Math.sin(time * 3.1 + phase) * 0.22;
      specRig.rightArm.rotation.z = -0.18;
      if (specRig.propObj) specRig.propObj.rotation.y = Math.sin(time * 5.2 + phase) * 0.28;
    } else if (specRig.propType === 'fan') {
      specRig.rightArm.rotation.x = -1.15 + Math.sin(time * 4.5 + phase) * 0.2;
      specRig.rightArm.rotation.z = -0.22;
      if (specRig.propObj) specRig.propObj.rotation.z = Math.sin(time * 6.5 + phase) * 0.32;
    } else if (specRig.propType === 'lantern') {
      specRig.rightArm.rotation.x = -1.35 + Math.sin(time * 2.0 + phase) * 0.1;
      specRig.rightArm.rotation.z = -0.2;
      if (specRig.propObj) specRig.propObj.rotation.z = Math.sin(time * 3.0 + phase) * 0.14;
    } else {
      specRig.rightArm.rotation.x = -0.42 + Math.cos(time * 2.4 + phase) * 0.16;
      specRig.rightArm.rotation.z = -0.16;
    }
  }
}
