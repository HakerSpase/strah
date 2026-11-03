// Атмосфера двора: низкое снежное небо с заревом города, горящие окна в готовых панельках, сугробы.
import { Color3, DynamicTexture, MaterialPluginBase, MeshBuilder, StandardMaterial, Texture, Vector3 } from "@babylonjs/core";
import { B } from "./util.js";

// ---------- небо: тучи, подсвеченные снизу натрием, без звёзд ----------
function skyTexture(scene) {
  const W = 512, H = 256;
  const tex = new DynamicTexture("skyTex", { width: W, height: H }, scene, true);
  const ctx = tex.getContext();
  const img = ctx.createImageData(W, H);
  // плавный шум без библиотек: сумма октав value-noise, бесшовный по горизонтали
  const N = 64, grid = new Float32Array(N * N);
  let seed = 3;
  for (let i = 0; i < grid.length; i++) grid[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const g = (a, b) => grid[((b % N) + N) % N * N + ((a % N) + N) % N];
    return (g(xi, yi) * (1 - xf) + g(xi + 1, yi) * xf) * (1 - yf) + (g(xi, yi + 1) * (1 - xf) + g(xi + 1, yi + 1) * xf) * yf;
  };
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);                       // 0 — зенит, 1 — низ сферы
    const h = Math.max(0, Math.min(1, v / 0.5));             // к горизонту (v≈0.5) зарево сильнее
    for (let x = 0; x < W; x++) {
      const u = (x / W) * 16;
      let n = 0, a = 0.5, f = 1;
      for (let o = 0; o < 5; o++) { n += vn(u * f, v * 10 * f) * a; a *= 0.5; f *= 2; }
      const c = Math.max(0, Math.min(1, (n - 0.35) * 1.8));    // рваные тучи
      const glow = Math.pow(h, 2.2);
      // снежные тучи над городом никогда не чёрные: всё небо — тусклое буро-оранжевое зарево, к горизонту ярче
      let r = 0.075 + glow * 0.26 + c * (0.05 + glow * 0.08);
      let g = 0.062 + glow * 0.17 + c * (0.04 + glow * 0.05);
      let b = 0.062 + glow * 0.10 + c * (0.035 + glow * 0.03);
      if (v > 0.52) { r = 0.30; g = 0.21; b = 0.15; }          // ниже горизонта — то же зарево (скрыто землёй)
      const i = (y * W + x) * 4;
      img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  return tex;
}

// ---------- горящие окна: светится только тёмное стекло, вкл/выкл — по ячейкам «этаж × пролёт» ----------
class WindowGlow extends MaterialPluginBase {
  constructor(material) {
    super(material, "WindowGlow", 200, { WINGLOW: false });
    this._enable(true);
    this.k = 1;
  }
  prepareDefines(defines) { defines.WINGLOW = true; }
  getClassName() { return "WindowGlow"; }
  getUniforms() { return { ubo: [{ name: "winK", size: 1, type: "float" }], fragment: "uniform float winK;" }; }
  bindForSubMesh(ubo) { ubo.updateFloat("winK", WindowGlow.k); }
  getCustomCode(type) {
    if (type !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        float wgHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`,
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
        #ifdef WINGLOW
        {
          vec3 wp = vPositionW;
          float lum = dot(surfaceAlbedo.rgb, vec3(0.299, 0.587, 0.114));
          float glass = 1.0 - smoothstep(0.06, 0.16, lum);
          vec3 cell = floor(vec3(wp.x / 2.9, (wp.y + 6.3) / 2.75, wp.z / 2.9));
          float h = wgHash(cell);
          float on = step(0.66, h) * step(-4.2, wp.y);
          vec3 col = h > 0.95 ? vec3(0.35, 0.45, 0.9) : mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.78, 0.45), fract(h * 7.0));
          finalEmissive += col * glass * on * winK * 2.2;
        }
        #endif`,
    };
  }
}
WindowGlow.k = 1;

// ---------- чистый свежий снег: мягкие волны наста, без грязных разводов ----------
function snowTextures(scene) {
  const S = 256;
  const N = 32, grid = new Float32Array(N * N);
  let seed = 9;
  for (let i = 0; i < grid.length; i++) grid[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {      // бесшовный value-noise
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const g = (a, b) => grid[((b % N) + N) % N * N + ((a % N) + N) % N];
    return (g(xi, yi) * (1 - xf) + g(xi + 1, yi) * xf) * (1 - yf) + (g(xi, yi + 1) * (1 - xf) + g(xi + 1, yi + 1) * xf) * yf;
  };
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let n = 0, a = 0.55, f = 4 / S * 4;
    for (let o = 0; o < 4; o++) { n += vn(x * f * (N / 16), y * f * (N / 16)) * a; a *= 0.5; f *= 2; }
    H[y * S + x] = n;
  }
  const alb = new DynamicTexture("snowAlb", S, scene, true), nrm = new DynamicTexture("snowNrm", S, scene, true);
  const ca = alb.getContext(), cn = nrm.getContext();
  const ia = ca.createImageData(S, S), inn = cn.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, h = H[i];
    const sparkle = Math.random() < 0.004 ? 0.12 : 0;
    const v = 0.86 + (h - 0.5) * 0.12 + sparkle;
    ia.data[i * 4] = v * 228; ia.data[i * 4 + 1] = v * 234; ia.data[i * 4 + 2] = v * 250; ia.data[i * 4 + 3] = 255;
    const hx = H[y * S + ((x + 1) % S)] - H[y * S + ((x + S - 1) % S)], hy = H[((y + 1) % S) * S + x] - H[((y + S - 1) % S) * S + x];
    let nx = -hx * 3, ny = -hy * 3, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    inn.data[i * 4] = (nx * 0.5 + 0.5) * 255; inn.data[i * 4 + 1] = (ny * 0.5 + 0.5) * 255; inn.data[i * 4 + 2] = (nz * 0.5 + 0.5) * 255; inn.data[i * 4 + 3] = 255;
  }
  ca.putImageData(ia, 0, 0); cn.putImageData(inn, 0, 0); alb.update(); nrm.update();
  for (const t of [alb, nrm]) { t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.uScale = t.vScale = 0.5; }
  return { alb, nrm };
}

// ---------- завесы метели: слои летящего снега (текстура скользит вниз и по ветру) ----------
function flakeCanvas(n, rMin, rMax, seed) {
  const W = 256, H = 512, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r() * H, rad = rMin + r() * r() * (rMax - rMin), a = 0.35 + r() * 0.65;
    for (const [dx, dy] of [[0, 0], [W, 0], [-W, 0], [0, H], [0, -H]]) {      // бесшовно
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.45, `rgba(255,255,255,${a * 0.6})`); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  return c.toDataURL();
}

function snowVeils(world) {
  const scene = world.scene, low = world.mobile;
  // слой: ближние крупные хлопья, средние, дальняя пелена; скорость падения и ветер — свои
  const LAYERS = [
    { url: flakeCanvas(220, 2.5, 6, 5), u: 1.5, v: 1, fall: 0.55, wind: 0.18, op: 1 },
    { url: flakeCanvas(900, 1.4, 3.2, 8), u: 3, v: 2, fall: 0.9, wind: 0.32, op: 0.95 },
    { url: flakeCanvas(2200, 0.9, 2.0, 13), u: 6, v: 4, fall: 1.4, wind: 0.5, op: 0.85 },
  ];
  const mats = LAYERS.map((L, i) => {
    const t = new Texture(L.url, scene, true, false);
    t.hasAlpha = true; t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.uScale = L.u; t.vScale = L.v;
    const m = new StandardMaterial("veil" + i, scene);
    m.disableLighting = true; m.emissiveColor = new Color3(0.9, 0.84, 0.8);     // снег в зареве фонарей
    m.diffuseTexture = t; m.opacityTexture = t; m.useAlphaFromDiffuseTexture = true;
    m.alpha = L.op; m.backFaceCulling = false; m.disableDepthWrite = true;
    m.fogEnabled = true;
    return { m, t, L };
  });

  // за окнами квартиры: плоскости снаружи, изнутри видны только сквозь стекло
  // [x, y окна (Blender), нормаль наружу nx, ny]
  const WIN = [[0, -4.4, 0, -1], [-4.4, 3.2, -1, 0], [4.0, 9.6, 1, 0], [4.0, 2.2, 1, 0], [5.3, 9.5, 1, 0], [0, 16.6, 0, 1]];
  const inside = [];
  for (const [x, y, nx, ny] of WIN) {
    [[1.6, 7, 6], [4.5, 16, 12], [11, 36, 26]].forEach(([d, w, h], i) => {
      const p = MeshBuilder.CreatePlane("veilWin", { width: w, height: h }, scene);
      p.position.copyFrom(B(x + nx * d, y + ny * d, 1.5));
      p.rotation.y = Math.atan2(nx, -ny);
      p.material = mats[i].m; p.isPickable = false;
      p.freezeWorldMatrix();
      inside.push(p);
    });
  }
  // на улице: три цилиндра вокруг игрока
  const outside = [[3.5, 10], [8, 16], [17, 28]].map(([r, h], i) => {
    const c = MeshBuilder.CreateCylinder("veilOut", { diameter: r * 2, height: h, tessellation: 24, cap: 0, sideOrientation: 2 }, scene);
    const L = mats[i].L, t = new Texture(L.url, scene, true, false);
    t.hasAlpha = true; t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
    t.vScale = Math.max(1, Math.round(h / 6)) * (i + 1); t.uScale = Math.round(t.vScale * (2 * Math.PI * r / h) * 2);
    const m = mats[i].m.clone("veilOut" + i); m.diffuseTexture = t; m.opacityTexture = t;
    mats.push({ m, t, L });
    c.material = m; c.isPickable = false; c.setEnabled(false);
    c.metadata = { h };
    return c;
  });
  let out = null;
  world.updateVeils = (dt, playerPos, storm = 1) => {
    for (const { t, L } of mats) {
      t.vOffset = (t.vOffset + dt * L.fall * (0.6 + storm * 0.5)) % 1;
      t.uOffset = (t.uOffset - dt * L.wind * storm) % 1;
    }
    mats.forEach(({ m, L }) => (m.alpha = L.op * Math.min(1, 0.35 + storm * 0.55)));
    if (!playerPos) return;
    const o = playerPos.y < -3;
    if (o !== out) { out = o; for (const p of inside) p.setEnabled(!o); for (const c of outside) c.setEnabled(o); }
    if (o) for (const c of outside) c.position.set(playerPos.x, -6.3 + c.metadata.h / 2 - 0.5, playerPos.z);
  };
}

export function setupAtmosphere(world, houseMats) {
  const scene = world.scene;
  const snowMat = scene.materials.find((x) => x.name === "Snow");
  if (snowMat && snowMat.getClassName() === "PBRMaterial") {
    const t = snowTextures(scene);
    snowMat.albedoTexture = t.alb; snowMat.bumpTexture = t.nrm; snowMat.metallicTexture = null;
    snowMat.albedoColor = new Color3(1, 1, 1); snowMat.metallic = 0; snowMat.roughness = 0.78;
  }
  // небо
  const skyMesh = scene.getMeshByName("Ext_Sky");
  if (skyMesh) {
    const m = new StandardMaterial("skyNight", scene);
    m.disableLighting = true; m.backFaceCulling = false; m.fogEnabled = false;
    m.emissiveTexture = skyTexture(scene);
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
    skyMesh.material = m;
    world.extMats.push(m);
  }
  // окна в домах-моделях (свой дом — тоже: квартиры соседей)
  for (const m of houseMats) if (m.getClassName() === "PBRMaterial") new WindowGlow(m);
  world.setWindowGlow = (k) => { WindowGlow.k = k; };
  snowVeils(world);

  // сугробы: вдоль цоколей домов и обочин, мягкие сплющенные полусферы с тем же снегом
  const snow = scene.materials.find((x) => x.name === "Snow");
  const base = MeshBuilder.CreateSphere("bank", { diameter: 1, segments: world.mobile ? 6 : 10 }, scene);
  base.material = snow; base.isPickable = false; base.position.y = -100;
  world.extMeshes.push(base);
  let seed = 21; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lines = [
    // [x0, y0, x1, y1, шаг] — Blender
    [-33, -32.2, 31, -32.2, 2.6], [-33.2, -36, -33.2, 37, 2.6], [21.2, -29, 21.2, 37, 2.6],
    [-10, -5.4, 8.2, -5.4, 2.2],
    [-10.6, -25, -10.6, 40, 3.2], [9.4, -6, 9.4, 40, 3.0], [14.6, -6, 14.6, 40, 3.4],
  ];
  // не на дорожках, не у подъезда и таксофона
  const near = (x, y) => (x > -8.5 && x < -6.5 && y > -13 && y < -11) || (Math.abs(x - 0.2) < 1.8 && y > -7 && y < -4.4) ||
    (y > -11.6 && y < -6.4) || (y > -30.6 && y < -25.4);
  for (const [x0, y0, x1, y1, step] of lines) {
    const len = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(len / step);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n), x = x0 + (x1 - x0) * t + (r() - 0.5) * 0.8, y = y0 + (y1 - y0) * t + (r() - 0.5) * 0.8;
      if (near(x, y)) continue;
      const k = base.createInstance("bank" + i);
      const along = Math.abs(x1 - x0) > Math.abs(y1 - y0);
      const L = step * (1.3 + r() * 0.8), D = 1.2 + r() * 1.4, Hh = 0.5 + r() * 0.7;
      k.scaling = along ? new Vector3(L, Hh, D) : new Vector3(D, Hh, L);
      k.position = B(x, y, -6.3 - Hh * 0.12);
      k.rotation.y = (r() - 0.5) * 0.3;
      k.isPickable = false;
      k.freezeWorldMatrix();
    }
  }
}
