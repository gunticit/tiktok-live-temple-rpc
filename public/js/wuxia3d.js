/**
 * Wuxia3DEngine — High-Fidelity 3D Sunset Martial Arts Arena (Three.js)
 * - Twilight/Sunset sky dome, sandstone Võ Đài with crisp Red-Gold Bát Quái Yin-Yang medallion
 * - Towering ancient crimson columns, blazing 3D fire braziers, tiered stands & cheering 3D spectators
 * - Articulated stylized 3D martial artists (7 weapons: Kiếm, Thương, Đao, Côn, Cung, Tiêu, Quyền)
 * - Dynamic buff VFX: Kim Chung Tráo dome, Cuồng Nộ flames, Khổng Lồ scaling, Thần Võ halo, Champion Crown
 * - Action VFX: Directional sword slashes, physical flying arrows/shurikens, comic impact numbers, speech bubbles
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createStylizedWuxiaRig,
  animateStylizedRig,
  createStylizedSpectator,
  animateStylizedSpectator
} from '/js/wuxia_characters.js';

const SECT_PALETTE = {
  vodang:   { primary: '#38bdf8', robe: '#e0f2fe', trim: '#0284c7', hair: 'topknot' },
  duonggia: { primary: '#14b8a6', robe: '#0f766e', trim: '#f59e0b', hair: 'bun' },
  minhgiao: { primary: '#ef4444', robe: '#b91c1c', trim: '#1e1b2e', hair: 'ponytail' },
  thieulam: { primary: '#f59e0b', robe: '#ea580c', trim: '#fde047', hair: 'bald' },
  tieudao:  { primary: '#22c55e', robe: '#15803d', trim: '#fbbf24', hair: 'ponytail' },
  duongmon: { primary: '#a855f7', robe: '#4c1d95', trim: '#c084fc', hair: 'headband' },
  caibang:  { primary: '#eab308', robe: '#92400e', trim: '#fbbf24', hair: 'headband' }
};

class Wuxia3DEngine {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Container #${containerId} not found`);

    this.settings = {
      quality: 'high',
      shadows: true,
      kiAura: true,
      slashTrails: true,
      damageNumbers: true,
      spectators: true,
      braziers: true,
      environmentFx: 'embers',
      cameraMode: 'broadcast',
      giftCamZoom: true,
      aspectMode: '9:16',
      showTikTokChrome: true
    };

    this.fighters = new Map(); // uniqueId -> Fighter3D Group
    this.bossMesh = null;
    this.championId = null;
    this.vfxList = [];
    this.projectiles = [];
    this.floatingTexts = [];
    this.spectatorList = [];
    this.brazierFlames = [];
    this.brazierLights = [];
    this.clock = new THREE.Clock();
    this.shakeIntensity = 0;
    this.spectatorCheerTimer = 0;
    this.lastActionPos = new THREE.Vector3(0, 1.5, 0);
    this.currentLookAt = new THREE.Vector3(0, 1.6, -2.0);
    this.giftFocus = null;
    this.onGiftFocusChange = null;
    this.directorAngles = ['broadcast', 'side_left', 'low_hero', 'side_right', 'crowd_pov', 'cinematic', 'topdown'];

    this.initScene();
    this.initSkyDome();
    this.initArena();
    this.initSpectators();
    this.initGiftSpotlightMesh();
    this.initEnvironmentParticles();
    this.initControls();

    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
    this.onResize();

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  // --------------------------------------------------------------------------
  // 1. SCENE, LIGHTING & RENDERER (WARM TWILIGHT / SUNSET ATMOSPHERE)
  // --------------------------------------------------------------------------
  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#2a151b');
    this.scene.fog = new THREE.FogExp2('#3a1d22', 0.0085);

    this.camera = new THREE.PerspectiveCamera(46, 9 / 16, 0.5, 320);
    this.camera.position.set(0, 23.5, 31.5);
    this.camera.lookAt(0, 1.6, -2.0);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(this.container.clientWidth || 540, this.container.clientHeight || 960);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.container.appendChild(this.renderer.domElement);

    // Ánh sáng hoàng hôn ấm áp kết hợp chiều sâu tím xanh
    this.hemiLight = new THREE.HemisphereLight('#ffd59e', '#3d2228', 1.05);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#ffcf87', 2.15);
    this.sunLight.position.set(16, 36, 18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 95;
    this.sunLight.shadow.camera.left = -22;
    this.sunLight.shadow.camera.right = 22;
    this.sunLight.shadow.camera.top = 22;
    this.sunLight.shadow.camera.bottom = -22;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight('#f97316', 0.9);
    this.rimLight.position.set(-18, 16, -24);
    this.scene.add(this.rimLight);
  }

  initSkyDome() {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 512;
    skyCanvas.height = 512;
    const ctx = skyCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, '#131129');  // Deep twilight zenith
    grad.addColorStop(0.32, '#2e1630'); // Dusk plum
    grad.addColorStop(0.55, '#7c282a'); // Sunset crimson
    grad.addColorStop(0.74, '#d96b38'); // Warm sunset orange-gold
    grad.addColorStop(0.88, '#f5a649'); // Horizon glow
    grad.addColorStop(1.0, '#3b1d1b');  // Lower haze
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle twilight stars near zenith
    ctx.fillStyle = 'rgba(255, 245, 220, 0.55)';
    for (let i = 0; i < 65; i++) {
      const sx = Math.random() * 512;
      const sy = Math.random() * 170;
      const sr = Math.random() * 1.6 + 0.4;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }

    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    const skyGeo = new THREE.SphereGeometry(160, 24, 16);
    const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);
  }

  initControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.08;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 55;
    this.controls.target.set(0, 1.4, 1.0);
    this.controls.enabled = false;
  }

  // --------------------------------------------------------------------------
  // 2. VÕ ĐÀI BÁT QUÁI 3D, CỘT ĐỀN ĐỎ, ĐÀI LỬA & KHÁN ĐÀI
  // --------------------------------------------------------------------------
  buildArenaFloorTexture() {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const c = size / 2;

    // 1. Nền đá sa thạch vàng ấm (Warm sandstone martial arts platform)
    const floorGrad = ctx.createRadialGradient(c, c, 120, c, c, c);
    floorGrad.addColorStop(0.0, '#c8a98a');
    floorGrad.addColorStop(0.52, '#b99374');
    floorGrad.addColorStop(0.84, '#9b7457');
    floorGrad.addColorStop(0.94, '#7c533c');
    floorGrad.addColorStop(1.0, '#5a3829');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, 0, size, size);

    // 2. Đường ron gạch đá đồng tâm & nan quạt cổ phong
    ctx.strokeStyle = 'rgba(72, 42, 26, 0.28)';
    ctx.lineWidth = 4;
    for (const r of [460, 620, 770, 910]) {
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * 440, c + Math.sin(a) * 440);
      ctx.lineTo(c + Math.cos(a) * 950, c + Math.sin(a) * 950);
      ctx.stroke();
    }

    // 3. Viền phát sáng cam-đỏ ngoài mép võ đài
    ctx.strokeStyle = '#ff6b35';
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(c, c, 945, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(c, c, 922, 0, Math.PI * 2);
    ctx.stroke();

    // 4. ĐỒ HÌNH BÁT QUÁI ĐỎ - VÀNG KIM TRUNG TÂM (CHUẨN ẢNH MẪU)
    const baguaR = 400;
    // Viền ngoài vàng kim
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(c, c, baguaR + 24, 0, Math.PI * 2);
    ctx.fill();

    // Nền đỏ son Bát Quái
    ctx.fillStyle = '#b92b27';
    ctx.beginPath();
    ctx.arc(c, c, baguaR + 6, 0, Math.PI * 2);
    ctx.fill();

    // Vòng chia vàng kim trong
    ctx.strokeStyle = '#f8d264';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(c, c, baguaR - 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(c, c, 218, 0, Math.PI * 2);
    ctx.stroke();

    // 8 Quẻ Bát Quái (trigrams) bằng vạch liền / đứt màu vàng kim
    const trigrams = [
      [1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1],
      [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]
    ];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(ang);
      ctx.fillStyle = '#fde68a';
      const bars = trigrams[i];
      bars.forEach((solid, idx) => {
        const y = -345 + idx * 34;
        if (solid) {
          ctx.fillRect(-66, y, 132, 18);
        } else {
          ctx.fillRect(-66, y, 56, 18);
          ctx.fillRect(10, y, 56, 18);
        }
      });
      // Tia phân cách bát giác
      ctx.rotate(Math.PI / 8);
      ctx.fillStyle = 'rgba(248, 210, 100, 0.75)';
      ctx.fillRect(-4, -386, 8, 165);
      ctx.restore();
    }

    // Đồ hình Thái Cực Âm Dương trung tâm (Cream White & Deep Obsidian)
    const taiR = 198;
    ctx.save();
    ctx.translate(c, c);

    // Nửa Dương (Kem sáng)
    ctx.fillStyle = '#fff9eb';
    ctx.beginPath();
    ctx.arc(0, 0, taiR, -Math.PI / 2, Math.PI / 2, false);
    ctx.fill();

    // Nửa Âm (Đen huyền)
    ctx.fillStyle = '#1c1218';
    ctx.beginPath();
    ctx.arc(0, 0, taiR, Math.PI / 2, -Math.PI / 2, false);
    ctx.fill();

    // 2 vòng xoáy nhỏ
    ctx.fillStyle = '#fff9eb';
    ctx.beginPath();
    ctx.arc(0, -taiR / 2, taiR / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c1218';
    ctx.beginPath();
    ctx.arc(0, taiR / 2, taiR / 2, 0, Math.PI * 2);
    ctx.fill();

    // 2 mắt Âm Dương
    ctx.fillStyle = '#1c1218';
    ctx.beginPath();
    ctx.arc(0, -taiR / 2, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff9eb';
    ctx.beginPath();
    ctx.arc(0, taiR / 2, 30, 0, Math.PI * 2);
    ctx.fill();

    // Viền vàng bao Thái Cực
    ctx.strokeStyle = '#f8d264';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, taiR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  initArena() {
    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    // 1. Sân Võ Đài tròn cao cấp
    const floorTex = this.buildArenaFloorTexture();
    const stageGeo = new THREE.CylinderGeometry(15.2, 16.4, 2.2, 48);
    const sideMat = new THREE.MeshStandardMaterial({ color: '#6b4938', roughness: 0.85 });
    const topMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72, metalness: 0.08 });
    const stageMesh = new THREE.Mesh(stageGeo, [sideMat, topMat, sideMat]);
    stageMesh.position.y = -1.1;
    stageMesh.receiveShadow = true;
    this.arenaGroup.add(stageMesh);

    // Vòng sáng phát quang nhẹ quanh mép Võ Đài
    const glowRingGeo = new THREE.RingGeometry(14.05, 14.55, 64);
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: '#ff7b3a',
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    this.arenaGlowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    this.arenaGlowRing.rotation.x = -Math.PI / 2;
    this.arenaGlowRing.position.y = 0.03;
    this.arenaGroup.add(this.arenaGlowRing);

    // Nền sân rộng bao ngoài võ đài
    const groundGeo = new THREE.CylinderGeometry(42, 45, 1, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: '#3b2421', roughness: 0.95 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -2.6;
    ground.receiveShadow = true;
    this.arenaGroup.add(ground);

    // 2. Hàng rào gỗ đỏ truyền thống phía sau võ đài
    const railMat = new THREE.MeshStandardMaterial({ color: '#a82721', roughness: 0.55 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 19; i++) {
      const ang = -Math.PI * 0.92 + (i / 18) * (Math.PI * 0.84);
      const r = 15.8;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.2, 0.32), railMat);
      post.position.set(x, 0.8, z);
      post.castShadow = true;
      this.arenaGroup.add(post);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), goldMat);
      cap.position.set(x, 2.0, z);
      this.arenaGroup.add(cap);

      if (i < 18) {
        const nextAng = -Math.PI * 0.92 + ((i + 1) / 18) * (Math.PI * 0.84);
        const nx = Math.cos(nextAng) * r;
        const nz = Math.sin(nextAng) * r;
        const mx = (x + nx) / 2;
        const mz = (z + nz) / 2;
        const segLen = Math.hypot(nx - x, nz - z);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.22, 0.16), railMat);
        bar.position.set(mx, 1.45, mz);
        bar.lookAt(nx, 1.45, nz);
        bar.rotateY(Math.PI / 2);
        this.arenaGroup.add(bar);

        const barLow = bar.clone();
        barLow.position.y = 0.7;
        this.arenaGroup.add(barLow);
      }
    }

    // 3. 6 CỘT TRỤ ĐỎ CỔ KÍNH KHỔNG LỒ PHÍA SAU (CHUẨN ẢNH MẪU)
    const colPositions = [
      [-11.5, -14.5], [-5.2, -16.8], [5.2, -16.8], [11.5, -14.5],
      [-16.2, -7.2], [16.2, -7.2]
    ];
    const colMat = new THREE.MeshStandardMaterial({ color: '#8a1e1a', roughness: 0.48, metalness: 0.1 });
    const baseStoneMat = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.85 });

    colPositions.forEach(([cx, cz]) => {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.75, 1.8, 12), baseStoneMat);
      base.position.set(cx, 0.5, cz);
      base.castShadow = true;
      base.receiveShadow = true;
      this.arenaGroup.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.18, 22, 16), colMat);
      shaft.position.set(cx, 12.2, cz);
      shaft.castShadow = true;
      this.arenaGroup.add(shaft);

      // Vòng đai vàng cổ trên thân cột
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.12, 8, 20), goldMat);
      band.rotation.x = Math.PI / 2;
      band.position.set(cx, 2.2, cz);
      this.arenaGroup.add(band);
    });

    // 4. KHÁN ĐÀI BẬC ĐÁ PHÍA SAU
    const standMat = new THREE.MeshStandardMaterial({ color: '#5c463b', roughness: 0.9 });
    for (let tier = 0; tier < 3; tier++) {
      const stand = new THREE.Mesh(new THREE.BoxGeometry(36, 1.6, 3.6), standMat);
      stand.position.set(0, 0.6 + tier * 1.5, -18.5 - tier * 2.8);
      stand.receiveShadow = true;
      this.arenaGroup.add(stand);
    }

    // 5. ĐÀI LỬA BẬP BÙNG RỰC CHÁY (BURNING TORCHES / BRAZIERS)
    this.braziersGroup = new THREE.Group();
    this.arenaGroup.add(this.braziersGroup);
    const brazierCoords = [
      [-8.5, -13.5], [8.5, -13.5], [-14.2, -3.0], [14.2, -3.0]
    ];
    const bronzeMat = new THREE.MeshStandardMaterial({ color: '#29211e', metalness: 0.75, roughness: 0.4 });

    brazierCoords.forEach(([bx, bz], idx) => {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.9, 2.2, 8), bronzeMat);
      ped.position.set(bx, 1.1, bz);
      ped.castShadow = true;
      this.braziersGroup.add(ped);

      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 0.7, 0.8, 10), bronzeMat);
      bowl.position.set(bx, 2.45, bz);
      this.braziersGroup.add(bowl);

      // Lửa ngoài (cam rực) & lửa lõi (vàng sáng)
      const outerFlame = new THREE.Mesh(
        new THREE.ConeGeometry(1.05, 2.5, 8),
        new THREE.MeshBasicMaterial({ color: '#ff5e1a', transparent: true, opacity: 0.88 })
      );
      outerFlame.position.set(bx, 3.9, bz);
      outerFlame.userData.phase = idx * 1.7;
      this.braziersGroup.add(outerFlame);
      this.brazierFlames.push(outerFlame);

      const innerFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.62, 1.8, 7),
        new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.96 })
      );
      innerFlame.position.set(bx, 3.55, bz);
      innerFlame.userData.phase = idx * 1.7 + 0.8;
      this.braziersGroup.add(innerFlame);
      this.brazierFlames.push(innerFlame);

      // Ánh sáng lửa ấm lập lòe (tạo 2 đèn chính phía sau cho hiệu năng cao)
      if (idx < 2) {
        const light = new THREE.PointLight('#ff7b29', 3.5, 22, 1.5);
        light.position.set(bx, 5.2, bz);
        light.userData.baseIntensity = 3.5;
        light.userData.phase = idx * 2.1;
        this.braziersGroup.add(light);
        this.brazierLights.push(light);
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. KHÁN GIẢ 3D CỔ PHONG CEL-SHADED PHÍA SAU KHÁN ĐÀI (36 NHÂN VẬT 6 CHỦNG LOẠI)
  // --------------------------------------------------------------------------
  initSpectators() {
    this.spectatorsGroup = new THREE.Group();
    this.scene.add(this.spectatorsGroup);

    const showOutlines = this.settings.quality !== 'low';
    let variantCursor = 0;

    for (let tier = 0; tier < 3; tier++) {
      const count = 12;
      for (let i = 0; i < count; i++) {
        // Bố trí vòng cung nhẹ ôm theo võ đài để nhìn đẹp từ mọi góc camera (trước, cánh trái/phải, sau khán đài)
        const norm = (i / (count - 1)) * 2 - 1; // -1 .. +1
        const sx = norm * 15.2 + (Math.random() - 0.5) * 0.7;
        const curveForward = Math.abs(norm) * 1.15;
        const sz = -18.2 - tier * 2.8 + curveForward + (Math.random() - 0.5) * 0.35;
        const sy = 1.42 + tier * 1.5;

        const specRig = createStylizedSpectator(variantCursor++, showOutlines);
        const spec = specRig.root;
        const scale = 0.94 + Math.random() * 0.14;
        spec.scale.setScalar(scale);
        spec.position.set(sx, sy, sz);
        spec.lookAt(0, sy, 0);
        spec.userData.baseY = sy;
        spec.userData.phase = Math.random() * Math.PI * 2;
        spec.userData.specRig = specRig;

        this.spectatorsGroup.add(spec);
        this.spectatorList.push(spec);
      }
    }
  }

  // Vòng hào quang & cột sáng định vị nhân vật đang được camera zoom khi tặng quà
  initGiftSpotlightMesh() {
    const group = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const innerRing = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.58, 32), ringMat);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.09;
    group.add(innerRing);

    const outerRingMat = new THREE.MeshBasicMaterial({
      color: '#f43f5e',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.05, 32), outerRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.07;
    group.add(outerRing);

    const beamMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 18, 20, 1, true), beamMat);
    beam.position.y = 9;
    group.add(beam);

    group.visible = false;
    group.userData = { innerRing, outerRing, ringMat, outerRingMat, beamMat };
    this.giftSpotlightMesh = group;
    this.scene.add(group);
  }

  // --------------------------------------------------------------------------
  // 4. HẠT MÔI TRƯỜNG (EMBERS / SAKURA / SNOW / FOG)
  // --------------------------------------------------------------------------
  initEnvironmentParticles() {
    this.envGroup = new THREE.Group();
    this.scene.add(this.envGroup);
    this.rebuildEnvironmentParticles();
  }

  rebuildEnvironmentParticles() {
    while (this.envGroup.children.length > 0) {
      const obj = this.envGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
      this.envGroup.remove(obj);
    }
    this.envPoints = null;

    const type = this.settings.environmentFx;
    if (type === 'none') return;

    const count = this.settings.quality === 'low' ? 60 : this.settings.quality === 'medium' ? 160 : 320;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count * 3);

    let color = '#ff9f43';
    let size = 0.42;
    if (type === 'sakura') { color = '#f9a8d4'; size = 0.48; }
    else if (type === 'snow') { color = '#f1f5f9'; size = 0.36; }
    else if (type === 'fog') { color = '#cbd5e1'; size = 1.1; }

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 44;
      positions[i * 3 + 1] = Math.random() * 22 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 44;
      speeds[i * 3] = (Math.random() - 0.5) * 0.035;
      speeds[i * 3 + 1] = type === 'embers' ? (0.03 + Math.random() * 0.05) : -(0.025 + Math.random() * 0.04);
      speeds[i * 3 + 2] = (Math.random() - 0.5) * 0.035;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.userData.speeds = speeds;

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size,
      transparent: true,
      opacity: type === 'fog' ? 0.35 : 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.envPoints = new THREE.Points(geo, mat);
    this.envGroup.add(this.envPoints);
  }

  // --------------------------------------------------------------------------
  // 5. NHÂN VẬT ANH HÙNG 3D CEL-SHADED KIẾM HIỆP (7 MÔN PHÁI & 7 BINH KHÍ)
  // --------------------------------------------------------------------------
  createFighterMesh(data) {
    const pal = SECT_PALETTE[data.sect] || SECT_PALETTE.vodang;
    const root = new THREE.Group();
    const rig = createStylizedWuxiaRig(data.sect, data.weaponType, this.settings.shadows);
    const bodyPivot = rig.bodyPivot;
    root.add(bodyPivot);

    // Ẩn nét viền mực ở chất lượng Low để tối ưu máy yếu
    const showOutlines = this.settings.quality !== 'low';
    rig.outlines.forEach((o) => (o.visible = showOutlines));

    root.userData = {
      uniqueId: data.uniqueId,
      sect: data.sect,
      weaponType: data.weaponType,
      rig,
      bodyPivot,
      phaseSeed: (data.uniqueId.charCodeAt(0) || 1) * 0.73 + Math.random() * 4,
      targetPos: new THREE.Vector3(data.x || 0, 0, data.z || 0),
      targetRotY: data.rotY || 0,
      targetScale: data.scale || 1.0,
      speedMag: 0,
      attackAnim: 0,
      hitFlash: 0,
      lastHp: data.hp,
      lastShield: data.shield,
      lastUser: data.user,
      lastChamp: data.isChampion,
      lastSpeech: ''
    };

    // Vòng hào quang chân khí dưới chân
    const auraGeo = new THREE.RingGeometry(0.72, 1.15, 24);
    const auraMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(rig.accent || pal.primary),
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    });
    const aura = new THREE.Mesh(auraGeo, auraMat);
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.05;
    aura.visible = this.settings.kiAura;
    root.add(aura);

    // 1. KIM CHUNG TRÁO (Golden Bell Shield Dome)
    const shieldGroup = new THREE.Group();
    const domeGeo = new THREE.SphereGeometry(1.75, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.65);
    const domeMat = new THREE.MeshBasicMaterial({
      color: '#fbbf24',
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 1.45;
    shieldGroup.add(dome);
    const domeRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.66, 0.065, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#fef08a', transparent: true, opacity: 0.85 })
    );
    domeRing.rotation.x = Math.PI / 2;
    domeRing.position.y = 1.25;
    shieldGroup.add(domeRing);
    shieldGroup.visible = false;
    bodyPivot.add(shieldGroup);

    // 2. CUỒNG NỘ (Crimson Rage Aura Ring)
    const rageRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.09, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#ff3b1f', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
    );
    rageRing.rotation.x = Math.PI / 2;
    rageRing.position.y = 0.28;
    rageRing.visible = false;
    bodyPivot.add(rageRing);

    // 3. THẦN VÕ (Divine Halo Wheel Behind Back)
    const thanVoHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.32, 0.085, 8, 28),
      new THREE.MeshBasicMaterial({ color: '#f5d0fe', transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending })
    );
    thanVoHalo.position.set(0, 1.95, -0.58);
    thanVoHalo.visible = false;
    bodyPivot.add(thanVoHalo);

    // 4. VƯƠNG MIỆN VÕ LÂM MINH CHỦ
    const crown = this.buildChampionCrown();
    crown.position.set(0, 3.22, 0);
    crown.visible = Boolean(data.isChampion);
    bodyPivot.add(crown);

    // 5. Bảng tên + Thanh máu 3D & Bong bóng thoại
    const nameplate = this.buildNameplateSprite(data);
    nameplate.position.y = 3.82;
    root.add(nameplate);

    const speechSprite = this.buildSpeechSprite('');
    speechSprite.position.y = 4.95;
    speechSprite.visible = false;
    root.add(speechSprite);

    root.userData.aura = aura;
    root.userData.shieldGroup = shieldGroup;
    root.userData.rageRing = rageRing;
    root.userData.thanVoHalo = thanVoHalo;
    root.userData.crown = crown;
    root.userData.nameplate = nameplate;
    root.userData.speechSprite = speechSprite;

    root.position.set(data.x || 0, 0, data.z || 0);
    root.rotation.y = data.rotY || 0;
    this.scene.add(root);
    return root;
  }

  buildChampionCrown() {
    const cg = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#fbbf24',
      emissive: '#b45309',
      emissiveIntensity: 0.45,
      metalness: 0.9,
      roughness: 0.15
    });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.28, 12, 1, true), goldMat);
    cg.add(base);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 6), goldMat);
      spike.position.set(Math.cos(a) * 0.48, 0.28, Math.sin(a) * 0.48);
      cg.add(spike);
    }
    return cg;
  }

  // Tạo World Boss Võ Lâm 3D khổng lồ với tạo hình & binh khí riêng theo từng Boss
  createBossMesh(bossData) {
    const colors = bossData.colors || {
      body: '#240b12',
      armor: '#7f1d1d',
      glow: '#ff3b1f',
      accent: '#fb923c'
    };
    const weaponStyle = bossData.weaponStyle || 'greatsword';

    const g = new THREE.Group();
    const bodyPivot = new THREE.Group();
    g.add(bodyPivot);

    const bodyMat = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.45, metalness: 0.35 });
    const armorMat = new THREE.MeshStandardMaterial({ color: colors.armor, roughness: 0.35, metalness: 0.65 });
    const glowMat = new THREE.MeshStandardMaterial({
      color: colors.glow,
      emissive: colors.glow,
      emissiveIntensity: 1.35,
      roughness: 0.2
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: colors.accent,
      emissive: colors.accent,
      emissiveIntensity: 0.6,
      metalness: 0.75,
      roughness: 0.25
    });

    // Thân giáp đồ sộ & chiến bào tà khí
    const lowerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.42, 1.75, 12), bodyMat);
    lowerRobe.position.y = 1.05;
    lowerRobe.castShadow = true;
    bodyPivot.add(lowerRobe);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(1.22, 0.92, 1.95, 10), armorMat);
    torso.position.y = 2.65;
    torso.castShadow = true;
    bodyPivot.add(torso);

    // Lõi chân khí phát sáng trước ngực
    const chestCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), glowMat);
    chestCore.position.set(0, 2.75, 1.05);
    chestCore.scale.set(0.9, 1.25, 0.5);
    bodyPivot.add(chestCore);

    // Áo choàng Ma Tôn bay phía sau
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 3.1),
      new THREE.MeshStandardMaterial({ color: colors.armor, roughness: 0.7, side: THREE.DoubleSide })
    );
    cape.position.set(0, 2.15, -1.08);
    cape.rotation.x = 0.22;
    bodyPivot.add(cape);

    // Giáp vai gai nhọn 2 bên
    [-1, 1].forEach((side) => {
      const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), armorMat);
      pauldron.position.set(side * 1.42, 3.35, 0);
      pauldron.scale.set(1.15, 0.85, 1.0);
      pauldron.castShadow = true;
      bodyPivot.add(pauldron);

      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.85, 6), accentMat);
      spike.position.set(side * 1.75, 3.85, 0);
      spike.rotation.z = -side * 0.55;
      bodyPivot.add(spike);
    });

    // Đầu Ma Đấu + Mũ/Sừng uy nghiêm
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 12, 12), bodyMat);
    head.position.y = 4.25;
    head.castShadow = true;
    bodyPivot.add(head);

    const crownBand = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.1, 8, 16), accentMat);
    crownBand.rotation.x = Math.PI / 2;
    crownBand.position.y = 4.55;
    bodyPivot.add(crownBand);

    const hornGeo = new THREE.ConeGeometry(0.22, 1.45, 8);
    const lHorn = new THREE.Mesh(hornGeo, glowMat);
    lHorn.position.set(-0.62, 5.05, 0.05);
    lHorn.rotation.z = 0.48;
    bodyPivot.add(lHorn);
    const rHorn = lHorn.clone();
    rHorn.position.x = 0.62;
    rHorn.rotation.z = -0.48;
    bodyPivot.add(rHorn);

    // Đôi mắt phát quang rực rỡ
    const eyeGeo = new THREE.SphereGeometry(0.14, 8, 8);
    const lEye = new THREE.Mesh(eyeGeo, glowMat);
    lEye.position.set(-0.26, 4.32, 0.64);
    bodyPivot.add(lEye);
    const rEye = lEye.clone();
    rEye.position.x = 0.26;
    bodyPivot.add(rEye);

    // Hai cánh tay & Binh khí khổng lồ của Boss
    const leftArm = new THREE.Group();
    leftArm.position.set(-1.45, 3.2, 0);
    const lArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 1.65, 8), bodyMat);
    lArmMesh.position.y = -0.75;
    leftArm.add(lArmMesh);
    bodyPivot.add(leftArm);

    const rightArm = new THREE.Group();
    rightArm.position.set(1.45, 3.2, 0);
    const rArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 1.65, 8), bodyMat);
    rArmMesh.position.y = -0.75;
    rightArm.add(rArmMesh);

    // Chế tác vũ khí Boss theo chủng loại
    const weapon = new THREE.Group();
    weapon.position.set(0.1, -1.45, 0.45);
    weapon.rotation.x = Math.PI / 2.2;
    if (weaponStyle === 'mace') {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.4, 8), armorMat);
      handle.position.y = 1.2;
      weapon.add(handle);
      const headMace = new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), glowMat);
      headMace.position.y = 2.95;
      weapon.add(headMace);
    } else if (weaponStyle === 'halberd' || weaponStyle === 'glaive') {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 8), armorMat);
      shaft.position.y = 1.5;
      weapon.add(shaft);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 0.68), glowMat);
      blade.position.set(0, 3.4, 0.22);
      weapon.add(blade);
    } else if (weaponStyle === 'twinblades') {
      const bladeR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.8, 0.42), glowMat);
      bladeR.position.y = 1.4;
      weapon.add(bladeR);
      const leftBlade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.4), glowMat);
      leftBlade.position.set(-0.1, -1.35, 1.2);
      leftBlade.rotation.x = Math.PI / 2.2;
      leftArm.add(leftBlade);
    } else {
      // Cự Kiếm Huyết Ma (greatsword)
      const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.25), accentMat);
      hilt.position.y = 0.2;
      weapon.add(hilt);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.56), glowMat);
      blade.position.y = 2.05;
      weapon.add(blade);
    }
    rightArm.add(weapon);
    bodyPivot.add(rightArm);

    // Vòng hào quang sau lưng Boss
    const backHalo = new THREE.Mesh(
      new THREE.TorusGeometry(2.05, 0.11, 8, 32),
      new THREE.MeshBasicMaterial({
        color: colors.accent,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending
      })
    );
    backHalo.position.set(0, 3.25, -1.15);
    bodyPivot.add(backHalo);

    // Hai vòng ma trận dưới chân Boss xoay ngược chiều
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(1.9, 2.95, 32),
      new THREE.MeshBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.08;
    g.add(aura);

    const outerAura = new THREE.Mesh(
      new THREE.RingGeometry(3.15, 3.48, 32),
      new THREE.MeshBasicMaterial({
        color: colors.accent,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      })
    );
    outerAura.rotation.x = -Math.PI / 2;
    outerAura.position.y = 0.06;
    g.add(outerAura);

    const np = this.buildNameplateSprite({
      user: bossData.user,
      title: bossData.title || 'ĐẠI MA ĐẦU VÕ ĐÀI',
      hp: bossData.hp,
      maxHp: bossData.maxHp,
      shield: 0,
      isChampion: true
    });
    np.position.y = 6.35;
    np.scale.set(5.8, 1.65, 1);
    g.add(np);

    g.position.set(bossData.x || 0, 0, bossData.z || 0);
    g.userData = {
      bossId: bossData.id,
      bodyPivot,
      leftArm,
      rightArm,
      backHalo,
      chestCore,
      nameplate: np,
      aura,
      outerAura,
      glowColor: colors.glow,
      targetPos: new THREE.Vector3(bossData.x || 0, 0, bossData.z || 0),
      targetRotY: bossData.rotY || 0,
      attackAnim: 0,
      hitFlash: 0,
      enraged: Boolean(bossData.enraged),
      lastHp: bossData.hp,
      lastEnraged: Boolean(bossData.enraged)
    };
    this.scene.add(g);
    return g;
  }

  // --------------------------------------------------------------------------
  // 6. BẢNG TÊN 3D SẮC NÉT & BONG BÓNG THOẠI (NAMEPLATE & SPEECH BUBBLE)
  // --------------------------------------------------------------------------
  buildNameplateSprite(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 148;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4.1, 1.18, 1);
    sprite.renderOrder = 20;
    sprite.userData = { canvas, ctx: canvas.getContext('2d'), tex };
    this.drawNameplate(sprite, data);
    return sprite;
  }

  drawNameplate(sprite, data) {
    const { canvas, ctx, tex } = sprite.userData;
    const w = canvas.width;
    ctx.clearRect(0, 0, w, canvas.height);

    // 1. Tên nhân vật nổi bật viền đen (giống DVDL Trường An, Lion_King trong ảnh!)
    ctx.textAlign = 'center';
    ctx.font = '900 40px "Be Vietnam Pro", sans-serif';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    const nameStr = data.isChampion ? `👑 ${data.user}` : data.user;
    ctx.strokeText(nameStr, w / 2, 46);
    ctx.fillStyle = data.isChampion ? '#fde047' : '#ffffff';
    ctx.fillText(nameStr, w / 2, 46);

    // 2. Danh hiệu võ lâm (Thiếu Hiệp / Vô Danh Tiểu Tốt)
    ctx.font = '700 23px "Be Vietnam Pro", sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeText(data.title || 'Thiếu Hiệp', w / 2, 78);
    ctx.fillStyle = data.isChampion ? '#fcd34d' : '#d6d3d1';
    ctx.fillText(data.title || 'Thiếu Hiệp', w / 2, 78);

    // 3. Thanh Máu HP sắc nét kèm con số HP ở giữa
    const bx = 66, by = 92, bw = 380, bh = 32;
    const hp = Math.max(0, data.hp || 0);
    const maxHp = Math.max(1, data.maxHp || 280);
    const ratio = Math.min(1, hp / maxHp);

    ctx.fillStyle = 'rgba(15, 10, 12, 0.88)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.fill();

    // Màu thanh máu: Xanh tươi -> Vàng -> Đỏ
    const hpColor = ratio > 0.55 ? '#4ade80' : ratio > 0.28 ? '#facc15' : '#ef4444';
    ctx.fillStyle = hpColor;
    if (ratio > 0) {
      ctx.beginPath();
      ctx.roundRect(bx + 3, by + 3, Math.max(8, (bw - 6) * ratio), bh - 6, 6);
      ctx.fill();
    }

    // Vạch khiên Kim Chung Tráo màu vàng ánh kim
    if (data.shield > 0) {
      const sRatio = Math.min(1, data.shield / maxHp);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.fillRect(bx + 3, by + 3, (bw - 6) * sRatio, 7);
    }

    ctx.strokeStyle = data.isChampion ? '#fbbf24' : 'rgba(255, 255, 255, 0.72)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8);
    ctx.stroke();

    ctx.font = '800 22px "Be Vietnam Pro", sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    const hpLabel = data.shield > 0 ? `${hp} (+${data.shield})` : `${hp}`;
    ctx.strokeText(hpLabel, w / 2, by + 24);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(hpLabel, w / 2, by + 24);

    tex.needsUpdate = true;
  }

  buildSpeechSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 100;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(4.4, 0.86, 1);
    sprite.renderOrder = 25;
    sprite.userData = { canvas, ctx: canvas.getContext('2d'), tex };
    if (text) this.drawSpeech(sprite, text);
    return sprite;
  }

  drawSpeech(sprite, text) {
    const { canvas, ctx, tex } = sprite.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!text) return;

    ctx.font = '700 28px "Be Vietnam Pro", sans-serif';
    const textW = Math.min(460, ctx.measureText(text).width + 48);
    const x = (canvas.width - textW) / 2;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x, 12, textW, 64, 30);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1c1917';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 54, textW - 24);
    tex.needsUpdate = true;
  }

  // --------------------------------------------------------------------------
  // 7. HIỆU ỨNG CHIẾN ĐẤU 3D (SLASHES, ARROWS, COMIC DAMAGE, SHOCKWAVES)
  // --------------------------------------------------------------------------
  playAttackEvent(evt) {
    const aMesh = evt.attackerId === 'ma_dau_boss' ? this.bossMesh : this.fighters.get(evt.attackerId);
    const tMesh = evt.targetId === 'ma_dau_boss' ? this.bossMesh : this.fighters.get(evt.targetId);

    const fromPos = aMesh ? aMesh.position.clone() : new THREE.Vector3(evt.fromX || 0, 0, evt.fromZ || 0);
    const toPos = tMesh ? tMesh.position.clone() : new THREE.Vector3(evt.toX || 0, 0, evt.toZ || 0);

    if (aMesh && aMesh.userData) {
      aMesh.userData.attackAnim = evt.attackerId === 'ma_dau_boss' ? 0.48 : 0.36;
    }
    if (tMesh && tMesh.userData) {
      tMesh.userData.hitFlash = 0.22;
    }

    this.lastActionPos.copy(toPos);

    // 1. Vũ khí tầm xa (Cung bắn tên / Đường Môn phóng phi tiêu!)
    if (evt.ranged) {
      this.spawnProjectile(fromPos, toPos, evt.projectileType, evt.attackerSect);
    } else if (this.settings.slashTrails) {
      // 2. Vệt chém kiếm quang / thương / đao / cự kiếm Boss định hướng đúng phía mục tiêu
      const angle = Math.atan2(toPos.x - fromPos.x, toPos.z - fromPos.z);
      const yOffset = evt.attackerId === 'ma_dau_boss' ? 2.4 : 1.5;
      this.spawnSlashArc(
        fromPos.clone().add(new THREE.Vector3(0, yOffset, 0)),
        angle,
        evt.attackerSect,
        evt.isCrit || evt.bossAttack,
        evt.bossGlow || null
      );
    }

    // 3. Tia lửa va chạm & số sát thương Comic nổi bật (-12, -15, -27)
    const hitY = evt.targetId === 'ma_dau_boss' ? 2.5 : 1.6;
    this.spawnHitSparks(toPos.clone().add(new THREE.Vector3(0, hitY, 0)), evt.isCrit);

    if (evt.damage > 0) {
      this.spawnComicNumber(
        toPos.clone().add(new THREE.Vector3(0, evt.targetId === 'ma_dau_boss' ? 3.5 : 2.3, 0)),
        `-${evt.damage}`,
        evt.isCrit ? 'crit' : 'damage'
      );
    } else if (evt.blocked > 0) {
      this.spawnComicNumber(
        toPos.clone().add(new THREE.Vector3(0, 2.4, 0)),
        `🛡️ -${evt.blocked}`,
        'shield'
      );
    }

    if (evt.isCrit || evt.isKill) {
      this.shakeIntensity = Math.min(0.65, this.shakeIntensity + (evt.isKill ? 0.45 : 0.25));
    }
    if (evt.isKill) {
      this.spectatorCheerTimer = 2.8;
      this.spawnGoldenQiBurst(toPos, '#fde047', 1.35);
      this.spawnShockwave(toPos, '#f59e0b', 4.8);
    }
  }

  spawnSlashArc(pos, angleY, sect, isCrit, colorOverride = null) {
    const pal = SECT_PALETTE[sect] || SECT_PALETTE.vodang;
    const outerR = colorOverride ? 4.2 : isCrit ? 3.1 : 2.3;
    const geo = new THREE.RingGeometry(outerR - 0.72, outerR, 18, 1, -Math.PI * 0.42, Math.PI * 0.84);
    const mat = new THREE.MeshBasicMaterial({
      color: colorOverride || (isCrit ? '#fef08a' : pal.primary),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.y = angleY + Math.PI / 2;
    mesh.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.45;
    this.scene.add(mesh);

    this.vfxList.push({
      mesh,
      life: 0.22,
      maxLife: 0.22,
      update: (dt, it) => {
        it.mesh.rotation.z -= dt * 9;
        it.mesh.scale.multiplyScalar(1 + dt * 1.8);
        it.mesh.material.opacity = it.life / it.maxLife;
      }
    });
  }

  spawnProjectile(fromPos, toPos, type, sect) {
    const start = fromPos.clone().add(new THREE.Vector3(0, 1.65, 0));
    const end = toPos.clone().add(new THREE.Vector3(0, 1.5, 0));
    const g = new THREE.Group();

    if (type === 'arrow') {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6),
        new THREE.MeshBasicMaterial({ color: '#fef08a' })
      );
      shaft.rotation.x = Math.PI / 2;
      g.add(shaft);
      const trail = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 1.6, 6),
        new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending })
      );
      trail.rotation.x = -Math.PI / 2;
      trail.position.z = -0.9;
      g.add(trail);
    } else {
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshBasicMaterial({ color: '#d8b4fe' })
      );
      star.scale.set(1, 0.22, 1);
      g.add(star);
    }

    g.position.copy(start);
    g.lookAt(end);
    this.scene.add(g);

    this.projectiles.push({
      mesh: g,
      start,
      end,
      t: 0,
      duration: 0.22,
      spin: type === 'shuriken'
    });
  }

  spawnHitSparks(pos, isCrit) {
    const count = this.settings.quality === 'low' ? 10 : isCrit ? 28 : 16;
    const positions = new Float32Array(count * 3);
    const vels = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      vels[i * 3] = (Math.random() - 0.5) * 9;
      vels[i * 3 + 1] = Math.random() * 5.5 + 1.5;
      vels[i * 3 + 2] = (Math.random() - 0.5) * 9;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: isCrit ? '#fef08a' : '#ff9f43',
      size: isCrit ? 0.5 : 0.34,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    this.scene.add(pts);

    this.vfxList.push({
      mesh: pts,
      vels,
      life: 0.38,
      maxLife: 0.38,
      update: (dt, it) => {
        const attr = it.mesh.geometry.attributes.position;
        for (let i = 0; i < attr.count; i++) {
          attr.array[i * 3] += it.vels[i * 3] * dt;
          attr.array[i * 3 + 1] += it.vels[i * 3 + 1] * dt - 12 * dt * dt;
          attr.array[i * 3 + 2] += it.vels[i * 3 + 2] * dt;
        }
        attr.needsUpdate = true;
        it.mesh.material.opacity = it.life / it.maxLife;
      }
    });
  }

  spawnShockwave(pos, hexColor = '#fbbf24', maxScale = 6.0) {
    const geo = new THREE.RingGeometry(0.6, 1.35, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.12, pos.z);
    this.scene.add(ring);

    this.vfxList.push({
      mesh: ring,
      life: 0.55,
      maxLife: 0.55,
      update: (dt, it) => {
        const p = 1 - it.life / it.maxLife;
        const s = 1 + p * maxScale;
        it.mesh.scale.set(s, s, 1);
        it.mesh.material.opacity = (1 - p) * 0.9;
      }
    });
  }

  spawnLightPillar(pos, hexColor = '#4ade80') {
    const geo = new THREE.CylinderGeometry(1.1, 1.4, 24, 16, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set(pos.x, 12, pos.z);
    this.scene.add(beam);

    this.vfxList.push({
      mesh: beam,
      life: 0.9,
      maxLife: 0.9,
      update: (dt, it) => {
        it.mesh.rotation.y += dt * 4;
        it.mesh.material.opacity = (it.life / it.maxLife) * 0.72;
      }
    });
  }

  // Số sát thương Comic nổi bật (-12, -15, -27, -39) giống Ảnh 1 & 2!
  spawnComicNumber(pos, text, style = 'damage') {
    if (!this.settings.damageNumbers) return;

    const canvas = document.createElement('canvas');
    canvas.width = 280;
    canvas.height = 110;
    const ctx = canvas.getContext('2d');

    ctx.textAlign = 'center';
    ctx.font = style === 'crit' ? '900 68px "Be Vietnam Pro", Impact, sans-serif' : '900 58px "Be Vietnam Pro", Impact, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#0f070a';
    ctx.strokeText(text, 140, 76);

    if (style === 'heal') ctx.fillStyle = '#4ade80';
    else if (style === 'crit') ctx.fillStyle = '#fde047';
    else if (style === 'shield') ctx.fillStyle = '#38bdf8';
    else ctx.fillStyle = '#ffffff'; // Crisp white comic numbers like -12, -15, -27 in reference!

    ctx.fillText(text, 140, 76);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.renderOrder = 30;
    const baseScale = style === 'crit' ? 3.5 : 2.8;
    sprite.scale.set(0.2, 0.2, 1);
    sprite.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.3, 0.3, (Math.random() - 0.5) * 1.3));
    this.scene.add(sprite);

    this.floatingTexts.push({
      sprite,
      baseScale,
      vx: (Math.random() - 0.5) * 1.2,
      life: 0.92,
      maxLife: 0.92
    });
  }

  // Bộc phát chân khí tia vàng nhọn (đúng hiệu ứng chân khí góc dưới phải hình Thiếu Lâm!)
  spawnGoldenQiBurst(pos, hexColor = '#fde047', scale = 1.0) {
    const burst = new THREE.Group();
    burst.position.set(pos.x, 0.08, pos.z);

    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const baseRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.55, 28), ringMat);
    baseRing.rotation.x = -Math.PI / 2;
    burst.add(baseRing);

    const spikeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const h = i % 2 === 0 ? 3.4 : 2.3;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.32, h, 4), spikeMat);
      spike.position.set(Math.cos(ang) * 0.78, h * 0.46, Math.sin(ang) * 0.78);
      spike.rotation.z = -Math.cos(ang) * 0.25;
      spike.rotation.x = Math.sin(ang) * 0.25;
      burst.add(spike);
    }
    burst.scale.setScalar(scale * 0.6);
    this.scene.add(burst);

    this.vfxList.push({
      mesh: burst,
      materials: [ringMat, spikeMat],
      baseScale: scale,
      life: 0.65,
      maxLife: 0.65,
      update: (dt, it) => {
        const p = 1 - it.life / it.maxLife;
        it.mesh.rotation.y += dt * 3.5;
        const s = it.baseScale * (0.65 + p * 0.85);
        it.mesh.scale.set(s, s * (1 + Math.sin(p * Math.PI) * 0.4), s);
        const op = Math.max(0, 1 - p * p);
        it.materials.forEach((m) => (m.opacity = op * 0.9));
      }
    });
  }

  focusOnGiftSender(evt) {
    if (!evt || this.settings.giftCamZoom === false) return;
    const fighterId = evt.fighter?.uniqueId || evt.uniqueId;
    if (!fighterId) return;

    const isMajorGift = evt.skillId === 'giant' || evt.skillId === 'thanvo' || evt.giftId === 'giftbox' || evt.giftId === 'heart_hands';
    const durationMs = isMajorGift ? 4600 : 3400;
    const colorMap = {
      rose: '#f43f5e',
      heal: '#4ade80',
      gg: '#4ade80',
      giant: '#60a5fa',
      thanvo: '#c084fc',
      shield: '#fbbf24'
    };
    const accentColor = colorMap[evt.skillId] || colorMap[evt.giftId] || '#fde047';

    const fMesh = this.fighters.get(fighterId);
    const startPos = fMesh
      ? fMesh.position.clone()
      : new THREE.Vector3(evt.fighter?.x || 0, 0, evt.fighter?.z || 0);

    const now = performance.now();
    this.giftFocus = {
      fighterId,
      user: evt.user || evt.fighter?.user || 'Đại Hiệp',
      giftName: evt.giftName || 'Quà Tặng',
      skillLabel: evt.skillLabel || '',
      giftIcon: evt.giftIcon || '🎁',
      iconImg: evt.iconImg || null,
      accentColor,
      startedAt: now,
      expiresAt: now + durationMs,
      lastPos: startPos,
      angleSeed: (Math.random() - 0.5) * 0.55
    };

    if (this.giftSpotlightMesh) {
      const { outerRingMat, beamMat } = this.giftSpotlightMesh.userData;
      outerRingMat.color.set(accentColor);
      beamMat.color.set(accentColor);
      this.giftSpotlightMesh.position.set(startPos.x, 0, startPos.z);
      this.giftSpotlightMesh.visible = true;
    }

    this.spectatorCheerTimer = Math.max(this.spectatorCheerTimer, 3.2);
    if (typeof this.onGiftFocusChange === 'function') {
      this.onGiftFocusChange(this.giftFocus);
    }
  }

  playGiftSkillVfx(evt) {
    const fMesh = evt.fighter ? this.fighters.get(evt.fighter.uniqueId) : null;
    const pos = fMesh
      ? fMesh.position.clone()
      : new THREE.Vector3(evt.fighter?.x || 0, 0, evt.fighter?.z || 0);

    // Tự động zoom camera cận cảnh + chiếu vòng sáng định vị nhân vật vừa tặng quà!
    this.focusOnGiftSender(evt);

    if (evt.skillId === 'heal' || evt.skillId === 'rose' || evt.skillId === 'cake') {
      this.spawnGoldenQiBurst(pos, evt.skillId === 'heal' ? '#fde047' : '#4ade80', 1.15);
      this.spawnLightPillar(pos, '#4ade80');
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 3.2, 0)), evt.skillId === 'heal' ? '+120' : '+20', 'heal');
    } else if (evt.skillId === 'shield') {
      this.spawnGoldenQiBurst(pos, '#fbbf24', 1.3);
      this.spawnShockwave(pos, '#fbbf24', 4.5);
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 3.4, 0)), 'KIM CHUNG TRÁO!', 'crit');
    } else if (evt.skillId === 'revive') {
      this.spawnGoldenQiBurst(pos, '#38bdf8', 1.35);
      this.spawnLightPillar(pos, '#38bdf8');
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 3.4, 0)), 'HỒI SINH!', 'shield');
    } else if (evt.skillId === 'rage') {
      this.spawnGoldenQiBurst(pos, '#ff5e1a', 1.35);
      this.spawnShockwave(pos, '#ff3b1f', 5.5);
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 3.4, 0)), 'CUỒNG NỘ!', 'crit');
    } else if (evt.skillId === 'giant') {
      this.spawnGoldenQiBurst(pos, '#fbbf24', 1.85);
      this.spawnShockwave(pos, '#60a5fa', 7.5);
      this.shakeIntensity = Math.min(0.8, this.shakeIntensity + 0.55);
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 4.2, 0)), 'KHỔNG LỒ!', 'crit');
    } else if (evt.skillId === 'thanvo') {
      this.spawnGoldenQiBurst(pos, '#fde047', 2.2);
      this.spawnLightPillar(pos, '#c084fc');
      this.spawnShockwave(pos, '#fbbf24', 10.5);
      this.shakeIntensity = Math.min(1.0, this.shakeIntensity + 0.75);
      this.spectatorCheerTimer = 4.0;
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 4.4, 0)), '⚡ THẦN VÕ!', 'crit');
    }
  }

  playBossSpawnVfx(boss) {
    const pos = new THREE.Vector3(boss?.x || 0, 0, boss?.z || 0);
    const glow = boss?.colors?.glow || '#ff3b1f';
    const accent = boss?.colors?.accent || '#fde047';
    this.spectatorCheerTimer = 4.5;
    this.shakeIntensity = Math.min(1.1, this.shakeIntensity + 0.85);
    this.spawnLightPillar(pos, glow);
    this.spawnShockwave(pos, glow, 11.5);
    this.spawnGoldenQiBurst(pos, accent, 2.4);
    setTimeout(() => this.spawnShockwave(pos, accent, 8.5), 200);
  }

  playBossAoEVfx(evt) {
    const pos = new THREE.Vector3(evt?.x || 0, 0, evt?.z || 0);
    const color = evt?.color || '#ff3b1f';
    if (this.bossMesh?.userData) {
      this.bossMesh.userData.attackAnim = 0.65;
    }
    this.shakeIntensity = Math.min(1.0, this.shakeIntensity + 0.65);
    this.spawnShockwave(pos, color, (evt?.radius || 7.2) * 1.15);
    this.spawnGoldenQiBurst(pos, color, 2.1);
    if (evt?.skillName) {
      this.spawnComicNumber(pos.clone().add(new THREE.Vector3(0, 5.2, 0)), `⚡ ${evt.skillName}!`, 'crit');
    }
  }

  playBossDefeatedVfx(evt) {
    const pos = new THREE.Vector3(evt?.bossPos?.x || 0, 0, evt?.bossPos?.z || 0);
    const glow = evt?.bossColors?.glow || '#fbbf24';
    this.spectatorCheerTimer = 6.0;
    this.shakeIntensity = Math.min(1.2, this.shakeIntensity + 0.95);
    this.spawnLightPillar(pos, '#fde047');
    this.spawnShockwave(pos, glow, 13);
    this.spawnGoldenQiBurst(pos, '#fde047', 2.8);
    setTimeout(() => this.spawnShockwave(pos, '#fde047', 10), 220);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.spawnHitSparks(
          pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 3.5 + Math.random() * 4, (Math.random() - 0.5) * 8)),
          true
        );
      }, i * 180);
    }
  }

  playCoronationVfx() {
    this.spectatorCheerTimer = 6.0;
    this.spawnLightPillar(new THREE.Vector3(0, 0, 0), '#fbbf24');
    this.spawnShockwave(new THREE.Vector3(0, 0, 0), '#fbbf24', 12);
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        this.spawnHitSparks(new THREE.Vector3((Math.random() - 0.5) * 12, 6 + Math.random() * 4, (Math.random() - 0.5) * 10), true);
      }, i * 320);
    }
  }

  // --------------------------------------------------------------------------
  // 8. ĐỒNG BỘ TRẠNG THÁI 10HZ TỪ SERVER (SMOOTH 60FPS INTERPOLATION)
  // --------------------------------------------------------------------------
  syncFighters(fightersList = [], bossData = null) {
    const aliveSet = new Set();

    fightersList.forEach((data) => {
      if (!data.alive) return;
      aliveSet.add(data.uniqueId);

      if (data.isChampion) this.championId = data.uniqueId;

      let mesh = this.fighters.get(data.uniqueId);
      if (!mesh || mesh.userData.sect !== data.sect) {
        if (mesh) {
          this.scene.remove(mesh);
          this.fighters.delete(data.uniqueId);
        }
        mesh = this.createFighterMesh(data);
        this.fighters.set(data.uniqueId, mesh);
      }

      const ud = mesh.userData;
      ud.targetPos.set(data.x, 0, data.z);
      ud.targetRotY = data.rotY;
      ud.targetScale = data.scale || 1.0;
      ud.speedMag = Math.hypot(data.vx || 0, data.vz || 0);

      // Cập nhật hiển thị Buff 3D
      ud.shieldGroup.visible = Boolean(data.buffs?.shield);
      ud.rageRing.visible = Boolean(data.buffs?.rage);
      ud.thanVoHalo.visible = Boolean(data.buffs?.thanvo);
      ud.crown.visible = Boolean(data.isChampion);
      ud.aura.visible = this.settings.kiAura;

      // Chỉ redraw nameplate khi HP / Shield / Danh hiệu đổi để tối ưu FPS
      if (
        ud.lastHp !== data.hp ||
        ud.lastShield !== data.shield ||
        ud.lastChamp !== data.isChampion ||
        ud.lastUser !== data.user
      ) {
        ud.lastHp = data.hp;
        ud.lastShield = data.shield;
        ud.lastChamp = data.isChampion;
        ud.lastUser = data.user;
        this.drawNameplate(ud.nameplate, data);
      }

      // Bong bóng thoại 3D
      if (data.speech && data.speech !== ud.lastSpeech) {
        ud.lastSpeech = data.speech;
        this.drawSpeech(ud.speechSprite, data.speech);
        ud.speechSprite.visible = true;
      } else if (!data.speech && ud.speechSprite.visible) {
        ud.lastSpeech = '';
        ud.speechSprite.visible = false;
      }
    });

    // Loại bỏ anh hùng đã bị hạ gục khỏi sàn đấu
    for (const [id, mesh] of this.fighters.entries()) {
      if (!aliveSet.has(id)) {
        this.scene.remove(mesh);
        this.fighters.delete(id);
      }
    }

    // Đồng bộ World Boss (tạo mới khi đổi Boss khác nhau, chỉ redraw nameplate khi HP / trạng thái Cuồng Nộ đổi)
    if (bossData && bossData.alive) {
      if (!this.bossMesh || this.bossMesh.userData.bossId !== bossData.id) {
        if (this.bossMesh) {
          this.scene.remove(this.bossMesh);
          this.bossMesh = null;
        }
        this.bossMesh = this.createBossMesh(bossData);
        this.playBossSpawnVfx(bossData);
      }
      const bud = this.bossMesh.userData;
      bud.targetPos.set(bossData.x, 0, bossData.z);
      bud.targetRotY = bossData.rotY;
      bud.enraged = Boolean(bossData.enraged);

      if (bud.lastHp !== bossData.hp || bud.lastEnraged !== bud.enraged) {
        bud.lastHp = bossData.hp;
        bud.lastEnraged = bud.enraged;
        this.drawNameplate(bud.nameplate, {
          user: bossData.user,
          title: bud.enraged ? `🔥 CUỒNG NỘ • ${bossData.title || 'ĐẠI BOSS'}` : (bossData.title || 'ĐẠI MA ĐẦU VÕ ĐÀI'),
          hp: bossData.hp,
          maxHp: bossData.maxHp,
          shield: 0,
          isChampion: true
        });
      }
    } else if (this.bossMesh) {
      this.scene.remove(this.bossMesh);
      this.bossMesh = null;
    }
  }

  // --------------------------------------------------------------------------
  // 9. CÀI ĐẶT ĐỒ HỌA 3D & CAMERA MODES
  // --------------------------------------------------------------------------
  applySettings(newSettings = {}) {
    const prevEnv = this.settings.environmentFx;
    const prevQual = this.settings.quality;
    this.settings = { ...this.settings, ...newSettings };

    if (this.settings.quality === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1);
    } else if (this.settings.quality === 'medium') {
      this.renderer.shadowMap.enabled = Boolean(this.settings.shadows);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    } else {
      this.renderer.shadowMap.enabled = Boolean(this.settings.shadows);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    this.sunLight.castShadow = Boolean(this.settings.shadows) && this.settings.quality !== 'low';
    this.spectatorsGroup.visible = Boolean(this.settings.spectators) && this.settings.quality !== 'low';
    this.braziersGroup.visible = Boolean(this.settings.braziers);

    const showOutlines = this.settings.quality !== 'low';
    for (const f of this.fighters.values()) {
      f.userData.aura.visible = Boolean(this.settings.kiAura);
      if (f.userData.rig?.outlines) {
        f.userData.rig.outlines.forEach((o) => (o.visible = showOutlines));
      }
    }
    for (const sp of this.spectatorList) {
      if (sp.userData.specRig?.outlines) {
        sp.userData.specRig.outlines.forEach((o) => (o.visible = showOutlines));
      }
    }

    if (this.settings.giftCamZoom === false && this.giftFocus) {
      this.giftFocus = null;
      if (this.giftSpotlightMesh) this.giftSpotlightMesh.visible = false;
      if (typeof this.onGiftFocusChange === 'function') this.onGiftFocusChange(null);
    }

    if (prevEnv !== this.settings.environmentFx || prevQual !== this.settings.quality) {
      this.rebuildEnvironmentParticles();
    }

    this.controls.enabled = this.settings.cameraMode === 'orbit';
  }

  resolveAnglePose(angleKey, time) {
    const pos = new THREE.Vector3(0, 23.5, 31.5);
    const look = new THREE.Vector3(0, 1.6, -2.0);

    if (angleKey === 'broadcast') {
      // Góc máy chuẩn Võ Đài TikTok Live 9:16
      pos.set(Math.sin(time * 0.18) * 1.4, 23.5 + Math.sin(time * 0.35) * 0.35, 31.5);
      look.set(0, 1.6, -2.0);
    } else if (angleKey === 'low_hero') {
      // Góc thấp hoành tráng ngước nhìn võ sĩ giữa hàng cột đỏ & bầu trời hoàng hôn
      pos.set(Math.sin(time * 0.22) * 5.2, 7.6 + Math.sin(time * 0.4) * 0.5, 22.8);
      look.set(0, 3.0, -3.2);
    } else if (angleKey === 'side_left') {
      // Góc nghiêng cánh trái 45° tạo chiều sâu đấu trường & khán đài
      pos.set(-23.5 + Math.sin(time * 0.2) * 1.5, 16.0, 20.5);
      look.set(0.8, 1.8, -1.8);
    } else if (angleKey === 'side_right') {
      // Góc nghiêng cánh phải 45°
      pos.set(23.5 + Math.sin(time * 0.2) * 1.5, 16.0, 20.5);
      look.set(-0.8, 1.8, -1.8);
    } else if (angleKey === 'crowd_pov') {
      // Góc nhìn từ phía khán đài 3D nhìn qua dàn khán giả cổ vũ xuống võ đài Bát Quái!
      pos.set(Math.sin(time * 0.16) * 6.5, 12.8, -26.5);
      look.set(0, 1.6, 2.5);
    } else if (angleKey === 'cinematic') {
      const r = 27;
      pos.set(Math.cos(time * 0.16) * r, 16.8 + Math.sin(time * 0.4) * 2.4, Math.sin(time * 0.16) * r);
      look.set(0, 1.8, 0);
    } else if (angleKey === 'champion') {
      const champ = this.championId ? this.fighters.get(this.championId) : null;
      if (champ) {
        pos.copy(champ.position).add(new THREE.Vector3(Math.sin(time * 0.4) * 2.5, 8.6, 10.6));
        look.copy(champ.position).add(new THREE.Vector3(0, 1.9, 0));
      }
    } else if (angleKey === 'action') {
      const focusTarget = this.bossMesh ? this.bossMesh.position : this.lastActionPos;
      pos.copy(focusTarget).add(new THREE.Vector3(Math.sin(time * 0.3) * 3.0, 11.8, 13.0));
      look.copy(focusTarget).add(new THREE.Vector3(0, 1.6, 0));
    } else if (angleKey === 'topdown') {
      pos.set(0, 35, 9);
      look.set(0, 0, 1.2);
    }

    return { pos, look };
  }

  updateCamera(dt, time) {
    const mode = this.settings.cameraMode;
    if (mode === 'orbit') {
      this.controls.update();
      return;
    }

    let desiredPos;
    let desiredLook;
    let targetFov = 46;
    let lerpRate = 4.2;

    // ƯU TIÊN 1: ZOOM CẬN CẢNH VÀO NHÂN VẬT VỪA TẶNG QUÀ ĐỂ DỄ NHẬN BIẾT!
    const nowMs = performance.now();
    if (this.giftFocus && this.settings.giftCamZoom !== false) {
      if (nowMs >= this.giftFocus.expiresAt) {
        this.giftFocus = null;
        if (this.giftSpotlightMesh) this.giftSpotlightMesh.visible = false;
        if (typeof this.onGiftFocusChange === 'function') this.onGiftFocusChange(null);
      } else {
        const targetMesh = this.fighters.get(this.giftFocus.fighterId);
        if (targetMesh) {
          this.giftFocus.lastPos.copy(targetMesh.position);
        }
        const p = this.giftFocus.lastPos;
        const elapsed = (nowMs - this.giftFocus.startedAt) / 1000;
        const sweep = this.giftFocus.angleSeed + Math.sin(elapsed * 0.85) * 0.28;
        const zoomDist = 9.2;
        desiredPos = new THREE.Vector3(
          p.x + Math.sin(sweep) * zoomDist,
          5.6,
          p.z + Math.cos(sweep) * zoomDist
        );
        // Giữ camera trong vùng nhìn đẹp không đâm vào khán đài phía sau
        desiredPos.z = Math.max(-15.5, Math.min(34, desiredPos.z));
        desiredLook = new THREE.Vector3(p.x, 2.25, p.z);
        targetFov = 36;
        lerpRate = 6.2;

        if (this.giftSpotlightMesh) {
          this.giftSpotlightMesh.position.set(p.x, 0, p.z);
          this.giftSpotlightMesh.visible = true;
        }
      }
    }

    // ƯU TIÊN 2: GÓC CAMERA ĐANG CHỌN (HOẶC ĐẠO DIỄN TỰ ĐỘNG ĐẢO GÓC)
    if (!desiredPos) {
      let activeAngle = mode;
      if (mode === 'director') {
        const idx = Math.floor(time / 9.5) % this.directorAngles.length;
        activeAngle = this.directorAngles[idx];
      }
      const pose = this.resolveAnglePose(activeAngle, time);
      desiredPos = pose.pos;
      desiredLook = pose.look;
    }

    // Rung nhẹ màn hình khi bạo kích / tuyệt kỹ
    if (this.shakeIntensity > 0.01) {
      desiredPos.x += (Math.random() - 0.5) * this.shakeIntensity;
      desiredPos.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.4);
    }

    const alpha = Math.min(1, dt * lerpRate);
    this.camera.position.lerp(desiredPos, alpha);
    this.currentLookAt.lerp(desiredLook, Math.min(1, dt * (lerpRate + 1.4)));
    this.camera.lookAt(this.currentLookAt);

    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5.0);
      this.camera.updateProjectionMatrix();
    }
  }

  // --------------------------------------------------------------------------
  // 10. VÒNG LẶP RENDER 60 FPS
  // --------------------------------------------------------------------------
  animate() {
    requestAnimationFrame(this.animate);
    if (document.hidden) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const time = this.clock.getElapsedTime();

    this.updateCamera(dt, time);

    // 1. Lập lòe ngọn lửa Đài Lửa & Viền Võ Đài
    if (this.braziersGroup.visible) {
      for (const fl of this.brazierFlames) {
        const p = fl.userData.phase;
        const s = 0.88 + Math.sin(time * 12 + p) * 0.14 + Math.cos(time * 19 + p) * 0.08;
        fl.scale.set(0.92 + Math.sin(time * 9 + p) * 0.1, s, 0.92 + Math.cos(time * 11 + p) * 0.1);
      }
      for (const lt of this.brazierLights) {
        lt.intensity = lt.userData.baseIntensity + Math.sin(time * 15 + lt.userData.phase) * 0.6;
      }
    }
    if (this.arenaGlowRing) {
      this.arenaGlowRing.material.opacity = 0.58 + Math.sin(time * 3.5) * 0.16;
    }

    // 2. Khán giả 3D cổ phong reo hò, vung tay, phất cờ/quạt/đèn lồng cổ vũ
    if (this.spectatorsGroup.visible) {
      const cheering = this.spectatorCheerTimer > 0;
      if (cheering) this.spectatorCheerTimer -= dt;
      for (const sp of this.spectatorList) {
        if (sp.userData.specRig) {
          animateStylizedSpectator(sp.userData.specRig, time, cheering, sp.userData.phase);
        }
      }
    }

    // 2.5. Xoay & nhấp nháy vòng định vị nhân vật đang được Camera Zoom khi tặng quà
    if (this.giftSpotlightMesh && this.giftSpotlightMesh.visible) {
      const { innerRing, outerRing } = this.giftSpotlightMesh.userData;
      innerRing.rotation.z += dt * 3.4;
      outerRing.rotation.z -= dt * 2.4;
      const pulse = 1 + Math.sin(time * 8) * 0.08;
      outerRing.scale.set(pulse, pulse, 1);
    }

    // 3. Hạt môi trường (tro tàn / hoa đào / tuyết)
    if (this.envPoints) {
      const pos = this.envPoints.geometry.attributes.position;
      const spd = this.envPoints.geometry.userData.speeds;
      for (let i = 0; i < pos.count; i++) {
        pos.array[i * 3] += spd[i * 3];
        pos.array[i * 3 + 1] += spd[i * 3 + 1];
        pos.array[i * 3 + 2] += spd[i * 3 + 2];
        if (pos.array[i * 3 + 1] < 0.2) pos.array[i * 3 + 1] = 22;
        if (pos.array[i * 3 + 1] > 23) pos.array[i * 3 + 1] = 0.4;
      }
      pos.needsUpdate = true;
    }

    // 4. Hoạt họa Anh Hùng 3D (Interpolation + Run Cycle + Weapon Swing)
    for (const mesh of this.fighters.values()) {
      const ud = mesh.userData;
      mesh.position.lerp(ud.targetPos, Math.min(1, dt * 11));

      // Nội suy góc xoay ngắn nhất
      let diff = ud.targetRotY - mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      mesh.rotation.y += diff * Math.min(1, dt * 12);

      // Nội suy kích thước (Khổng lồ / Thần Võ)
      const cs = ud.bodyPivot.scale.x;
      const ns = cs + (ud.targetScale - cs) * Math.min(1, dt * 6);
      ud.bodyPivot.scale.set(ns, ns, ns);
      ud.nameplate.position.y = 3.82 * ns;
      ud.speechSprite.position.y = 4.95 * ns;

      // Hoạt họa khớp xương Cel-Shaded võ học theo môn phái
      if (ud.attackAnim > 0) ud.attackAnim = Math.max(0, ud.attackAnim - dt);
      if (ud.rig) {
        animateStylizedRig(ud.rig, time, ud.speedMag, ud.attackAnim, ud.phaseSeed);
      }

      // Xoay hiệu ứng Buffs & Vương miện Minh Chủ
      if (ud.shieldGroup.visible) ud.shieldGroup.rotation.y += dt * 2.2;
      if (ud.rageRing.visible) ud.rageRing.rotation.z -= dt * 5;
      if (ud.thanVoHalo.visible) ud.thanVoHalo.rotation.z += dt * 3.5;
      if (ud.crown.visible) {
        ud.crown.rotation.y += dt * 2.0;
        ud.crown.position.y = 3.22 + Math.sin(time * 4) * 0.12;
      }
    }

    // 5. Hoạt họa World Boss 3D (nhịp thở uy áp, vung vũ khí, giật lùi khi trúng đòn, cuồng nộ)
    if (this.bossMesh) {
      const bud = this.bossMesh.userData;
      this.bossMesh.position.lerp(bud.targetPos, Math.min(1, dt * 8));

      let bDiff = bud.targetRotY - this.bossMesh.rotation.y;
      while (bDiff > Math.PI) bDiff -= Math.PI * 2;
      while (bDiff < -Math.PI) bDiff += Math.PI * 2;
      this.bossMesh.rotation.y += bDiff * Math.min(1, dt * 9);

      const enragedMult = bud.enraged ? 1.85 : 1.0;
      bud.aura.rotation.z += dt * 2.4 * enragedMult;
      if (bud.outerAura) bud.outerAura.rotation.z -= dt * 1.6 * enragedMult;
      if (bud.backHalo) bud.backHalo.rotation.z += dt * 2.2 * enragedMult;

      if (bud.bodyPivot) {
        const targetBossScale = bud.enraged ? (1.12 + Math.sin(time * 9) * 0.03) : 1.0;
        const curS = bud.bodyPivot.scale.x;
        const nextS = curS + (targetBossScale - curS) * Math.min(1, dt * 6);
        bud.bodyPivot.scale.setScalar(nextS);
        bud.bodyPivot.position.y = Math.sin(time * 3.2) * 0.14;

        if (bud.hitFlash > 0) {
          bud.hitFlash = Math.max(0, bud.hitFlash - dt);
          bud.bodyPivot.rotation.x = -Math.sin((bud.hitFlash / 0.22) * Math.PI) * 0.12;
        } else {
          bud.bodyPivot.rotation.x = 0;
        }
      }

      if (bud.attackAnim > 0) {
        bud.attackAnim = Math.max(0, bud.attackAnim - dt);
        const swing = Math.sin((1 - bud.attackAnim / 0.48) * Math.PI);
        if (bud.rightArm) {
          bud.rightArm.rotation.x = -1.65 * swing;
          bud.rightArm.rotation.z = -0.35 * swing;
        }
        if (bud.leftArm) {
          bud.leftArm.rotation.x = -0.8 * swing;
        }
      } else {
        if (bud.rightArm) {
          bud.rightArm.rotation.x = Math.sin(time * 2.4) * 0.12 - 0.18;
          bud.rightArm.rotation.z = 0.12;
        }
        if (bud.leftArm) {
          bud.leftArm.rotation.x = -Math.sin(time * 2.4) * 0.12;
        }
      }
    }

    // 6. Bay đạn (Mũi tên cung & Phi tiêu Đường Môn)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      const frac = Math.min(1, p.t / p.duration);
      p.mesh.position.lerpVectors(p.start, p.end, frac);
      p.mesh.position.y += Math.sin(frac * Math.PI) * 1.1; // Quỹ đạo vòng cung nhẹ
      if (p.spin) p.mesh.rotation.y += dt * 25;
      if (frac >= 1) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 7. VFX (Slash Arcs, Sparks, Shockwaves, Pillars)
    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const v = this.vfxList[i];
      v.life -= dt;
      v.update(dt, v);
      if (v.life <= 0) {
        this.scene.remove(v.mesh);
        if (v.mesh.geometry) v.mesh.geometry.dispose();
        if (v.mesh.material) v.mesh.material.dispose();
        if (v.materials) v.materials.forEach((m) => m.dispose());
        if (v.mesh.children?.length) {
          v.mesh.children.forEach((c) => {
            if (c.geometry) c.geometry.dispose();
          });
        }
        this.vfxList.splice(i, 1);
      }
    }

    // 8. Số sát thương Comic Pop-up
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      const p = 1 - ft.life / ft.maxLife;
      const pop = p < 0.18 ? (0.4 + (p / 0.18) * 0.85) : (1.25 - (p - 0.18) * 0.35);
      ft.sprite.scale.set(ft.baseScale * pop, (ft.baseScale * 0.39) * pop, 1);
      ft.sprite.position.y += dt * 2.4;
      ft.sprite.position.x += ft.vx * dt;
      ft.sprite.material.opacity = p > 0.65 ? Math.max(0, (1 - p) / 0.35) : 1;
      if (ft.life <= 0) {
        this.scene.remove(ft.sprite);
        if (ft.sprite.material.map) ft.sprite.material.map.dispose();
        if (ft.sprite.material) ft.sprite.material.dispose();
        this.floatingTexts.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.container) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

window.Wuxia3DEngine = Wuxia3DEngine;
export { Wuxia3DEngine };
