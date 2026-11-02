import {
  Axis, Color3, Color4, DynamicTexture, HemisphericLight, LoadAssetContainerAsync, Material, MirrorTexture,
  MeshBuilder, ParticleSystem, Plane, PointLight, Quaternion, StandardMaterial, TransformNode, Vector3,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { B, clamp, rnd } from "./util.js";

const LAMPS = {
  Lamp_Bed: 1.0, Lamp_Corr1: 1.0, Lamp_Corr2: 1.0, Lamp_Corr3: 1.0, Lamp_Kitchen: 1.1, Lamp_Bath: 0.8, Lamp_Mom: 0.9,
  Lamp_Vest: 0.6, Lamp_Closet: 0.6, Lamp_Kids: 0.9, Lamp_WC: 0.6, Lamp_Loggia: 0.7, Lamp_Stair: 0.7,
};
// у каждой двери/дверцы свой звук и своя ось
const DOORS = {
  Door_Bedroom: "wood", Door_Mom: "wood", Door_Bath: "wood", Door_Closet: "wood", Door_Front: "wood", Door_Outer: "metal",
  Door_Kids: "wood", Door_WC: "wood", Door_Loggia: "wood", Wardrobe_DoorL: "small", Wardrobe_DoorR: "small",
  Fridge_Door: "fridge", Oven_Door: "oven", Cab_DoorL: "small", Cab_DoorR: "small", ToyChest_Lid: "small",
};
// окна: откуда в квартиру слышна метель (координаты Blender)
const WINDOWS = [[0, -4.4], [-4.4, 3.2], [4.0, 9.6], [4.0, 2.2], [4.65, 9.5], [0, 16.6]];

// Источник света без собственного огня в сцене. Настоящих огней — постоянное число «прокси»,
// они переезжают к ближайшим горящим источникам: шейдеры не пересобираются, фризов нет.
class Src {
  constructor(position, diffuse, range = 8) {
    this.position = position; this.diffuse = diffuse; this.range = range;
    this.intensity = 0; this.enabled = true;
  }
  setEnabled(v) { this.enabled = v; }
  isEnabled() { return this.enabled; }
  get power() { return this.enabled ? this.intensity : 0; }
}

export class World {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.nodes = {};
    this.lamps = {};
    this.doors = {};
    this.mirrors = [];
    this.props = {};
    this.lampK = 4;
    this.mirrorsAllowed = true;
  }

  async load(onProgress, base = "/models/", mobile = false) {
    const scene = this.scene;
    this.mobile = mobile;
    this.lampK = mobile ? 2 : 4;
    const maxLights = this.lampK + 3;      // прокси (K+1) + фонарик + фоновый свет
    const c = await LoadAssetContainerAsync(base + "apartment.glb", scene, {
      onProgress: (e) => e.lengthComputable && onProgress(e.loaded / e.total),
    });
    c.addAllToScene();
    for (const n of [...c.transformNodes, ...c.meshes]) this.nodes[n.name] = n;

    for (const m of c.materials) {
      m.maxSimultaneousLights = maxLights;
      if (/^Glass|WaterStream/.test(m.name)) { m.transparencyMode = Material.MATERIAL_ALPHABLEND; m.backFaceCulling = false; }
      if (m.name === "TVScreen") this.tvMat = m;
      if (m.name === "GasFlame") { m.disableLighting = true; m.emissiveColor = new Color3(0.3, 0.55, 1.4); }
    }
    for (const mesh of c.meshes) {
      const top = this._top(mesh);
      mesh.receiveShadows = !mobile;
      if (top) mesh.metadata = { ...(mesh.metadata || {}), id: top.name };
      mesh.checkCollisions = false;
      if (top && top.name === "Colliders") { mesh.isVisible = false; mesh.checkCollisions = true; mesh.isPickable = true; mesh.metadata.id = "wall"; }
      if (top && DOORS[top.name]) mesh.checkCollisions = /^Door_/.test(top.name);
    }
    this.collidable = c.meshes.filter((m) => m.checkCollisions);

    this.ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
    this.ambient.intensity = 0.03;
    this.ambient.diffuse = new Color3(0.55, 0.6, 0.75);
    this.ambient.groundColor = new Color3(0.1, 0.08, 0.07);
    this.ambient.specular = Color3.Black();

    this._setupLamps();
    this._setupDoors();
    // дверца холодильника стоит у стены: открываем не дальше ~75°, иначе уходит в стену
    if (this.doors.Fridge_Door) this.doors.Fridge_Door.max = 1.3;
    // кладовка узкая: дверь открывается в коридор, иначе изнутри её не закрыть
    if (this.doors.Door_Closet) { this.doors.Door_Closet.dir = 1; this.doors.Door_Closet.max = 1.45; }
    this._setupMirrors();
    this._setupProps();
    this.tvTex = new DynamicTexture("tvsnow", { width: 128, height: 96 }, scene, false);
    await this._loadExterior(base);
    // неподвижное больше не пересчитывает матрицы каждый кадр
    for (const mesh of c.meshes) {
      const top = this._top(mesh);
      if (top && /_Furniture$|^Architecture$|^Colliders$/.test(top.name)) { mesh.freezeWorldMatrix(); mesh.doNotSyncBoundingInfo = true; }
    }
    return c;
  }

  _top(mesh) {
    let n = mesh;
    while (n.parent && n.parent.name !== "__root__") n = n.parent;
    return n.name === "__root__" ? null : n;
  }

  meshesOf(name) {
    const n = this.nodes[name]; if (!n) return [];
    return n.getChildMeshes(false).concat(n.getClassName() === "Mesh" ? [n] : []);
  }

  pos(name) { const n = this.nodes[name]; n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }
  xyz(name, dy = 0) { const p = this.pos(name); return { x: p.x, y: p.y + dy, z: p.z }; }
  xyzOf(v) { return { x: v.x, y: v.y, z: v.z }; }
  show(name, v) { const n = this.nodes[name]; if (n) n.setEnabled(v); }

  // ---------------- лампы ----------------
  _setupLamps() {
    for (const [name, k] of Object.entries(LAMPS)) {
      if (!this.nodes[name]) continue;
      const p = this.pos(name).add(new Vector3(0, -0.12, 0));
      const l = new Src(p, new Color3(1.0, 0.72, 0.42), 8);
      let bulb = null;
      for (const m of this.meshesOf(name)) {
        if (m.material && m.material.name === "Bulb") { bulb = bulb || m.material.clone("Bulb_" + name); m.material = bulb; }
      }
      this.lamps[name] = { light: l, bulb, base: 2.6 * k, level: 0, target: 0, flicker: 0, broken: false, color: l.diffuse.clone() };
    }
    this._lampT = 0;
    this.proxies = [];
    for (let i = 0; i < this.lampK + 1; i++) {
      const l = new PointLight("proxy" + i, Vector3.Zero(), this.scene);
      l.diffuse = new Color3(1, 0.72, 0.42); l.specular = new Color3(0.9, 0.7, 0.5);
      l.intensity = 0; l.range = 8;
      this.proxies.push({ light: l, src: null });
    }
  }

  setLamp(name, on, { instant = false } = {}) {
    const L = this.lamps[name]; if (!L || L.broken) return;
    L.target = on ? 1 : 0;
    if (instant) L.level = L.target;
  }
  lampOn(name) { const L = this.lamps[name]; return !!L && L.target > 0.5 && !L.broken; }
  setAllLamps(on, except = []) { for (const k in this.lamps) if (!except.includes(k)) this.setLamp(k, on, { instant: true }); }
  flicker(name, amount = 1) { const L = this.lamps[name]; if (L) L.flicker = Math.max(L.flicker, amount); }
  lampColor(name, c) { const L = this.lamps[name]; if (L) { L.color = c.clone(); L.light.diffuse = c.clone(); } }
  breakLamp(name) {
    const L = this.lamps[name]; if (!L || L.broken) return;
    if (this.audio.ctx) this.audio.bulbPop(this.xyzOf(L.light.position));
    L.broken = true; L.target = 0; L.level = 0;
  }
  repairAll() { for (const k in this.lamps) { this.lamps[k].broken = false; this.lampColor(k, new Color3(1.0, 0.72, 0.42)); } }

  // прокси-огни занимают самые заметные источники рядом с игроком
  _chooseLamps(p) {
    const srcs = Object.values(this.lamps).map((L) => L.light).concat(this.extraSrc || []);
    const scored = srcs.map((S) => ({ S, k: (S.power > 0.02 ? 1 : 0.001) / (1 + Vector3.DistanceSquared(S.position, p)) }));
    scored.sort((a, b) => b.k - a.k);
    const want = scored.slice(0, this.proxies.length).map((o) => o.S);
    // те, кто уже на месте, остаются на своих прокси — без скачков
    const free = this.proxies.filter((P) => !want.includes(P.src));
    for (const S of want) if (!this.proxies.some((P) => P.src === S)) { const P = free.shift(); if (P) P.src = S; }
  }

  _syncProxies() {
    for (const P of this.proxies) {
      const S = P.src;
      if (!S) { P.light.intensity = 0; continue; }
      P.light.position.copyFrom(S.position);
      P.light.diffuse.copyFrom(S.diffuse);
      P.light.range = S.range;
      P.light.intensity = S.power;
    }
  }

  // ---------------- двери ----------------
  _setupDoors() {
    for (const [name, kind] of Object.entries(DOORS)) {
      const n = this.nodes[name]; if (!n) continue;
      if (!n.rotationQuaternion) n.rotationQuaternion = Quaternion.FromEulerVector(n.rotation);
      const ex = (n.metadata && n.metadata.gltf && n.metadata.gltf.extras) || {};
      this.doors[name] = {
        node: n, base: n.rotationQuaternion.clone(), dir: ex.open_dir || 1, axis: ex.axis === "x" ? Axis.X : Axis.Y,
        angle: 0, target: 0, speed: 1.6, kind, max: ex.max || (name.startsWith("Wardrobe") ? 1.9 : 1.55),
      };
    }
  }

  setDoor(name, open, { speed = 1.8, silent = false, amount = 1 } = {}) {
    const d = this.doors[name]; if (!d) return;
    const t = open ? d.max * amount : 0;
    if (Math.abs(t - d.target) < 0.01) return;
    d.target = t; d.speed = speed;
    if (!silent && this.audio.ctx) {
      const p = this.doorPos(name);
      if (speed > 6 && !open && d.kind === "wood") this.audio.doorSlam(p);
      else if (open) this.audio.door(p, d.kind, true, speed / 1.8);
      else d.closing = true;      // звук закрытия — когда дверь действительно закроется
    }
  }

  doorOpen(name) { const d = this.doors[name]; return !!d && d.target > 0.4; }

  doorPos(name) {
    const n = this.doors[name].node;
    n.computeWorldMatrix(true);
    const p = n.getAbsolutePosition();
    return { x: p.x, y: p.y + 1.0, z: p.z };
  }

  resetDoors() {
    for (const k in this.doors) {
      const d = this.doors[k];
      d.target = d.angle = 0; d.closing = false;
      d.node.rotationQuaternion = d.base.clone();
    }
  }

  // ---------------- зеркала ----------------
  _setupMirrors() {
    const defs = [{ name: "Mirror_Corr", normal: new Vector3(1, 0, 0) }, { name: "Mirror_Bath", normal: new Vector3(0, 0, 1) }];
    for (const d of defs) {
      const meshes = this.meshesOf(d.name); if (!meshes.length) continue;
      const pos = this.pos(d.name);
      const rt = new MirrorTexture("mt_" + d.name, { ratio: this.mobile ? 0.2 : 0.35 }, this.scene, true);
      rt.mirrorPlane = Plane.FromPositionAndNormal(pos, d.normal.scale(-1));
      rt.level = 0.85; rt.refreshRate = 0;
      const m = new StandardMaterial("mm_" + d.name, this.scene);
      m.diffuseColor = new Color3(0.03, 0.03, 0.03);
      m.specularColor = new Color3(0.3, 0.3, 0.3);
      m.reflectionTexture = rt;
      m.maxSimultaneousLights = this.lampK + 3;
      for (const ms of meshes) ms.material = m;
      this.mirrors.push({ name: d.name, rt, pos, mesh: meshes[0] });
    }
  }

  setMirrorRenderList(meshes) { for (const M of this.mirrors) M.rt.renderList = meshes.filter((m) => m !== M.mesh); }

  // ---------------- предметы: вода, газ, холодильник, ТВ ----------------
  _setupProps() {
    for (const n of ["Water_Stream", "Bath_Stream", "Gas_Flames"]) this.show(n, false);
    const mk = (name, p, col, range) => { const l = new Src(p, col, range); l.enabled = false; return l; };
    this.fridgeLight = mk("fridgeLight", this.nodes.FridgeLight ? this.pos("FridgeLight") : B(3.62, 7.85, 1.25), new Color3(0.85, 0.95, 1.0), 2.5);
    this.gasLight = mk("gasLight", B(2.62, 7.8, 1.0), new Color3(0.3, 0.5, 1.0), 2.5);
    this.tvLight = mk("tvLight", B(-2.5, 2.1, 0.9), new Color3(0.6, 0.7, 1), 5);
    this.extraSrc = [this.fridgeLight, this.gasLight, this.tvLight];
  }

  setWater(which, on) {
    const name = which === "bath" ? "Bath_Stream" : "Water_Stream";
    const key = "water_" + which;
    if (!!this.props[key] === on) return;
    this.show(name, on);
    if (on) this.props[key] = this.audio.water(this.xyz(which === "bath" ? "I_BathTap" : "I_Tap"), which);
    else { this.props[key].stop(); this.props[key] = null; }
  }
  waterOn(which) { return !!this.props["water_" + which]; }

  setGas(on) {
    if (!!this.props.gas === on) return;
    this.show("Gas_Flames", on);
    this.gasLight.setEnabled(on);
    this.gasLight.intensity = on ? 0.8 : 0;
    if (on) this.props.gas = this.audio.gas(this.xyz("I_Stove"));
    else { this.props.gas.stop(); this.props.gas = null; }
  }
  gasOn() { return !!this.props.gas; }

  setFridge(open) {
    this.setDoor("Fridge_Door", open, { speed: 2.2 });
    this.fridgeLight.setEnabled(open);
    this.fridgeLight.intensity = open ? 1.2 : 0;
    if (open && !this.props.fridge) this.props.fridge = this.audio.fridgeHum(this.xyz("FridgeLight"));
    if (!open && this.props.fridge) { this.props.fridge.stop(); this.props.fridge = null; }
  }

  setTV(on) {
    this.tvOn = on;
    this.tvLight.setEnabled(on);
    const m = this.tvMat; if (!m) return;
    if (on) { m.emissiveTexture = this.tvTex; m.emissiveColor = new Color3(0.9, 0.95, 1); }
    else { m.emissiveTexture = null; m.emissiveColor = Color3.Black(); }
  }

  stopProps() {
    this.setWater("tap", false); this.setWater("bath", false); this.setGas(false); this.setFridge(false); this.setTV(false);
  }

  // ---------------- двор за окнами ----------------
  async _loadExterior(base) {
    const scene = this.scene;
    const c = await LoadAssetContainerAsync(base + "exterior.glb", scene);
    c.addAllToScene();
    const meshes = (this.extMeshes = c.meshes.filter((m) => m.name !== "__root__"));
    for (const n of [...c.transformNodes, ...c.meshes]) this.nodes[n.name] = n;
    const houseMats = await this._loadHouses(base, meshes);
    this.facadeMats = [];
    this.extMats = c.materials.concat(houseMats);
    for (const m of c.materials) {
      m.fogEnabled = false;
      m.backFaceCulling = true;          // стены нашего дома не видны изнутри квартиры
      m.maxSimultaneousLights = this.mobile ? 6 : 8;       // фонарик + фонари + луна + гараж + фары; больше — не влезает в лимит шейдера
      if (m.name === "Sky") { m.disableLighting = true; m.emissiveColor = new Color3(1, 1, 1); m.backFaceCulling = false; }
      if (/^Facade/.test(m.name)) { this.facadeMats.push(m); m.emissiveColor = new Color3(1, 1, 1); }
      if (m.name === "Sodium") this.sodiumMat = m;
    }
    for (const m of meshes) {
      m.isPickable = false; m.checkCollisions = false; m.receiveShadows = false;
      const top = this._top(m);
      if (top && top.name === "Ext_Colliders") { m.isVisible = false; m.checkCollisions = true; }
      if (top && top.name === "Ext_Car_Drive") { m.metadata = { id: "I_Car" }; m.isPickable = true; }
      else if (top && /^I_/.test(top.name)) { m.metadata = { id: top.name }; m.isPickable = true; }
      else if (!(top && /^Ext_(Swing|PassCar|CarDrift)$/.test(top.name))) m.freezeWorldMatrix();
    }
    // натриевые фонари светят только на улицу
    this.street = [];
    // настоящий свет — только у фонарей, где идёт игра; остальные просто светятся
    for (const i of this.mobile ? [0, 3] : [0, 1, 3, 4]) {
      if (!this.nodes["SL_" + i]) continue;
      const l = new PointLight("SL" + i, this.pos("SL_" + i), scene);
      l.diffuse = new Color3(1.0, 0.55, 0.22); l.specular = new Color3(1.0, 0.6, 0.3);
      l.intensity = 120; l.range = 30;
      l.includedOnlyMeshes = meshes;
      this.street.push({ light: l, base: 120, level: 1, flicker: 0, dead: false });
    }
    // свет в открытом гараже (огонь всегда включён, меняется только яркость — без пересборки шейдеров)
    const gp = this.nodes.Garage_Light ? this.pos("Garage_Light") : B(-24, -7.65, -4.2);
    this.garageLight = new PointLight("garageL", gp, scene);
    this.garageLight.diffuse = new Color3(1.0, 0.75, 0.45); this.garageLight.intensity = 0; this.garageLight.range = 9;
    this.garageLight.includedOnlyMeshes = meshes;
    this.garageOn = 0;
    // фары проезжающей машины
    this.passLight = new PointLight("passL", B(12, -40, -5.6), scene);
    this.passLight.diffuse = new Color3(1, 0.9, 0.7); this.passLight.intensity = 0; this.passLight.range = 14;
    this.passLight.includedOnlyMeshes = meshes;
    const moon = (this.moon = new HemisphericLight("moon", new Vector3(0.3, 1, 0.2), scene));
    moon.intensity = 0.25; moon.diffuse = new Color3(0.55, 0.6, 0.8); moon.groundColor = new Color3(0.12, 0.08, 0.07);
    moon.specular = Color3.Black();
    moon.includedOnlyMeshes = meshes;
    for (const P of this.proxies) P.light.excludedMeshes = meshes;
    this.ambient.excludedMeshes = meshes;
    this.outside = { windows: 1, lamps: 1, storm: 1 };
    this._horizon(c.materials);
    this._blizzard();
  }

  // Готовые модели двора (Sketchfab, CC BY): панельки, школа, ели, деревья, площадка — вместо самодельных коробок.
  // Каждая подгоняется по длине (len) или высоте (h), ставится на землю, получает невидимый коллайдер.
  async _loadHouses(base, meshes) {
    const PI = Math.PI;
    const P = [
      { f: "house_a", x: 0, y: -36.5, len: 60, yaw: PI, hide: "Ext_House_S", col: false },
      { f: "house_b", x: -48, y: 5, len: 60, yaw: PI / 2, hide: "Ext_House_W", col: false },
      { f: "house_a", x: 40, y: 10, len: 60, yaw: -PI / 2, hide: "Ext_House_E", col: false },
      // просветы между домами — ещё дома и школа: края карты не видно
      { f: "school", x: 0, y: 46, len: 42, yaw: 0, col: false },
      { f: "house_b", x: -30, y: 47, len: 34, yaw: 0, col: false },
      { f: "house_b", x: 28, y: 50, len: 34, yaw: 0, col: false },
      { f: "house_b", x: 41, y: -34, len: 24, yaw: -PI / 2, col: false },
      { f: "house_b", x: -40, y: -36, len: 22, yaw: PI / 2, col: false },
      // детская площадка
      { f: "swings", x: -6, y: -18, h: 2.6, yaw: 0 },
      { f: "slide", x: 5, y: -19.5, h: 2.6, yaw: PI / 2 },
      { f: "seesaw", x: -2.6, y: -16.4, h: 0.9, yaw: 0.3 },
      { f: "bench", x: -9.6, y: -20.5, h: 0.85, yaw: PI / 2 },
      { f: "bench", x: -3.2, y: -24.6, h: 0.85, yaw: 0 },
      { f: "bench", x: 2.8, y: -13.4, h: 0.85, yaw: PI },
    ];
    // ели и голые деревья: по краям двора и между дорожками, не на тропе игрока
    let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const firs = [[-16, -24], [8.5, -25], [-18.5, 12], [-18.5, 24], [16.5, 22], [20, 8], [-9.5, 22], [9, 26], [-17, -14], [12.5, -24], [-9, 4], [8.5, 2], [22, -12], [-24, 14]];
    for (const [x, y] of firs) P.push({ f: "firs", keep: r() < 0.5 ? /SnowTree1/ : /SnowTree2/, x, y, h: 6 + r() * 4, yaw: r() * 6.28, colR: 0.35 });
    const avoid = [[-6, -18, 3], [5, -19.5, 3], [0.5, -21.5, 2.5], [-2.6, -16.4, 2.2], [-7.5, -12.2, 2], [0.5, -13, 1.5], [-12, -16, 1.5]];
    const onPath = (x, y) => (y > -12.2 && y < -5.8) || x < -19.5 || avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar);
    let n = 0;
    for (let i = 0; i < 400 && n < 34; i++) {
      const x = -19 + r() * 28, y = -26 + r() * 54;
      if (onPath(x, y) || (x > -6 && x < 6.5 && y > -6 && y < 17.5) || (x > -11.5 && x < -10.5)) continue;   // не в нашем доме и не на дороге
      if (x > -20.5 && x < -10.8 && y > -7) continue;                                                       // западная дорога
      P.push({ f: r() < 0.6 ? "tree_dead" : "tree_winter", x, y, h: 5 + r() * 4, yaw: r() * 6.28, colR: 0.3 });
      n++;
    }
    for (const o of ["Ext_Trees", "Ext_Playground", "Ext_Swing"]) if (this.nodes[o]) this.nodes[o].setEnabled(false);
    // трансформаторная будка была частью старой площадки — ставим её заново простым бетонным блоком
    const concrete = this.scene.materials.find((m) => m.name === "Concrete");
    const tb = MeshBuilder.CreateBox("transformer", { width: 3, height: 2.8, depth: 3 }, this.scene);
    tb.position.copyFrom(B(16.5, -4.5, -6.3 + 1.4)); tb.material = concrete; meshes.push(tb);

    const mats = [], cache = {};
    for (const o of P) {
      let C = cache[o.f];
      if (C === undefined) {
        try { C = cache[o.f] = await LoadAssetContainerAsync(base + o.f + ".glb", this.scene); } catch (e) { console.warn("модель не загрузилась", o.f, e); cache[o.f] = null; continue; }
        for (const m of C.materials) { mats.push(m); m.maxSimultaneousLights = this.mobile ? 6 : 8; }
      }
      if (!C) continue;
      const tag = (o.hide || o.f) + "_" + Math.round(o.x) + "_" + Math.round(o.y);
      const inst = C.instantiateModelsToScene((nm) => tag + "_" + nm, false);
      const holder = new TransformNode(tag, this.scene), inner = new TransformNode(tag + "_fit", this.scene);
      for (const rn of inst.rootNodes) rn.parent = inner;
      inner.parent = holder;
      // из пака оставляем только нужное дерево; землю и кусты пака — прочь
      for (const m of inner.getChildMeshes(false)) {
        if (/Plane|Bush/i.test(m.name) || (o.keep && !o.keep.test(m.name))) m.setEnabled(false);
      }
      const vis = () => inner.getChildMeshes(false).filter((m) => m.isEnabled() && m.getTotalVertices() > 0);
      const bounds = () => {
        holder.computeWorldMatrix(true); inner.computeWorldMatrix(true);
        let mn = new Vector3(1e9, 1e9, 1e9), mx = new Vector3(-1e9, -1e9, -1e9);
        for (const m of vis()) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; mn = Vector3.Minimize(mn, b.minimumWorld); mx = Vector3.Maximize(mx, b.maximumWorld); }
        return { min: mn, max: mx };
      };
      let bb = bounds();
      const sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, sy = bb.max.y - bb.min.y;
      if (o.len && sz > sx) inner.rotation.y = PI / 2;
      inner.scaling.setAll(o.len ? o.len / Math.max(sx, sz) : o.h / Math.max(0.01, sy));
      bb = bounds();
      inner.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      holder.position.copyFrom(B(o.x, o.y, -6.3));
      holder.rotation.y = o.yaw || 0;
      for (const m of inner.getChildMeshes(false)) { m.isPickable = false; m.receiveShadows = false; meshes.push(m); m.freezeWorldMatrix(); }
      if (o.hide && this.nodes[o.hide]) this.nodes[o.hide].setEnabled(false);
      // коллайдер: ствол — цилиндр, реквизит — коробка по габаритам
      if (o.col !== false) {
        bb = bounds();
        const c = o.colR
          ? MeshBuilder.CreateCylinder(tag + "_col", { diameter: o.colR * 2, height: 3 }, this.scene)
          : MeshBuilder.CreateBox(tag + "_col", { width: bb.max.x - bb.min.x, height: Math.min(2.5, bb.max.y - bb.min.y), depth: bb.max.z - bb.min.z }, this.scene);
        c.position.set(o.colR ? holder.position.x : (bb.min.x + bb.max.x) / 2, -6.3 + 1.25, o.colR ? holder.position.z : (bb.min.z + bb.max.z) / 2);
        c.isVisible = false; c.isPickable = false; c.checkCollisions = true;
      }
    }
    return mats;
  }

  // земля до горизонта и кольцо далёких панелек — чтобы из окна не был виден край карты
  _horizon(mats) {
    const scene = this.scene, G = -6.3;
    const snow = mats.find((m) => m.name === "Snow");
    const facades = mats.filter((m) => /^Facade_[ABC]$/.test(m.name));
    const ground = MeshBuilder.CreateGround("farGround", { width: 320, height: 320 }, scene);
    ground.position.y = G - 0.05;
    if (snow) ground.material = snow;
    ground.isPickable = false;
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // два плотных кольца домов внахлёст — сквозь просветы не видно края
    const ring = [];
    for (let i = 0; i < 44; i++) ring.push([i / 44, 92 + r() * 12, 50 + r() * 20, 15.6 + (r() < 0.35 ? 14 : 0)]);
    for (let i = 0; i < 40; i++) ring.push([(i + 0.5) / 40, 135 + r() * 10, 70 + r() * 25, 30 + r() * 15]);
    for (let i = 0; i < ring.length; i++) {
      const [frac, dist, w, h] = ring[i];
      const a = frac * Math.PI * 2;
      const d = 14;
      const b = MeshBuilder.CreateBox("farHouse" + i, { width: w, height: h, depth: d }, scene);
      b.position.set(Math.cos(a) * dist, G + h / 2, -4 + Math.sin(a) * dist);
      b.rotation.y = -a + Math.PI / 2;
      b.material = facades[i % facades.length];
      b.isPickable = false;
      b.freezeWorldMatrix();
    }
  }

  _blizzard() {
    const scene = this.scene;
    const tex = new DynamicTexture("flake", 32, scene, false);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(250,252,255,0.95)"); g.addColorStop(0.55, "rgba(235,240,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); tex.hasAlpha = true; tex.update();
    // метель вокруг дома: ветер несёт снег с запада на восток
    const zones = [
      [B(-14, -26, -6), B(14, -4.6, 8)],     // двор (окно спальни, подъезд)
      [B(-20, -4, -6), B(-5.2, 16, 8)],      // запад (мамино окно)
      [B(5.6, -4, -6), B(20, 16, 8)],        // восток (кухня, детская, лоджия)
    ];
    this.snow = zones.map(([a, b]) => {
      const ps = new ParticleSystem("snow", this.mobile ? 300 : 1800, scene);
      ps.particleTexture = tex;
      ps.emitter = new Vector3(0, 0, 0);
      ps.minEmitBox = new Vector3(Math.min(a.x, b.x), Math.max(a.y, b.y), Math.min(a.z, b.z));
      ps.maxEmitBox = new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y) + 2, Math.max(a.z, b.z));
      ps.direction1 = new Vector3(3.5, -1.2, -0.8); ps.direction2 = new Vector3(6.0, -2.0, 0.8);
      ps.minEmitPower = 2.5; ps.maxEmitPower = 5;
      ps.minLifeTime = 4; ps.maxLifeTime = 7;
      ps.minSize = 0.12; ps.maxSize = 0.26;
      ps.emitRate = this.mobile ? 80 : 420;
      ps.color1 = new Color4(1, 1, 1, 0.85); ps.color2 = new Color4(0.85, 0.85, 0.95, 0.6);
      ps.colorDead = new Color4(1, 1, 1, 0);
      ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      ps.gravity = new Vector3(0, -0.6, 0);
      ps.preWarmCycles = 60; ps.preWarmStepOffset = 5;
      // снежинки не проходят сквозь стены: всё, что залетело в объём нашего дома, исчезает
      const base = ps.updateFunction;
      ps.updateFunction = (particles) => {
        base(particles);
        for (const p of particles) {
          const q = p.position;
          if (q.x > -5.3 && q.x < 5.8 && q.z > -16.95 && q.z < 4.75 && q.y > -6.4 && q.y < 9.5) { p.age = p.lifeTime; p.color.a = 0; }
        }
      };
      ps.start();
      return ps;
    });
  }

  // ---------------- живой двор ----------------
  resetYard() {
    this.yard = null;
    this.setGarage(false);
    this.setDrift(1);
    this.show("I_Shovel", true);
    if (this.street) for (const S of this.street) S.dead = false;
    if (this.passCar) { this.passCar.stop(); this.passCar = null; }
  }

  // качели скрипят, собака лает, по улице проезжает машина, кто-то в окне
  yardLife(on) {
    this.yard = on ? { t: 0, bark: 6, horn: 40, pass: 12, swing: 0, amp: 0.25 } : null;
  }

  setGarage(on, broken = false) { this.garageOn = on ? 1 : 0; this.garageBroken = broken; }

  setDrift(k) {
    const n = this.nodes.Ext_CarDrift; if (!n) return;
    n.setEnabled(k > 0.02);
    n.scaling.y = Math.max(0.05, k);
  }

  // фонари рядом с сущностью гаснут навсегда
  dimNear(p, r = 5) {
    if (!this.street) return;
    for (const S of this.street) {
      if (S.dead) continue;
      const q = S.light.position;
      if (Math.hypot(q.x - p.x, q.z - p.z) < r) { S.dead = true; S.flicker = 0.8; if (this.audio.ctx) this.audio.bulbPop(this.xyzOf(q)); }
    }
  }

  _yardUpdate(dt, t, pp) {
    const Y = this.yard; if (!Y || !this.audio.ctx) return;
    Y.t += dt;
    // качели
    const sw = this.nodes.Ext_Swing;
    if (sw) {
      Y.amp += (Math.sin(Y.t * 0.13) * 0.18 + 0.28 - Y.amp) * dt * 0.3;
      const prev = Y.swing;
      Y.swing = Math.sin(Y.t * 1.55) * Y.amp;
      if (!sw.rotationQuaternion) sw.rotation.x = Y.swing;
      else sw.rotationQuaternion = Quaternion.RotationAxis(Axis.X, Y.swing);
      if (Math.sign(Y.swing - prev) !== Math.sign(Y.last || 0) && pp && Vector3.Distance(sw.position, pp) < 30) this.audio.swingCreak(this.xyz("Ext_Swing", -0.2), Y.amp);
      Y.last = Y.swing - prev;
    }
    // собака где-то за домами
    Y.bark -= dt;
    if (Y.bark <= 0) { Y.bark = rnd(9, 22); this.audio.dog(this.xyzOf(B(rnd(-60, 60), rnd(30, 70), -5.5)), Math.floor(rnd(2, 5))); }
    // далёкий гудок поезда
    Y.horn -= dt;
    if (Y.horn <= 0) { Y.horn = rnd(50, 90); this.audio.trainHorn(this.xyzOf(B(-80, 60, 0))); }
    // машина въезжает по дороге с севера, останавливается в конце двора, светит фарами — и уезжает обратно.
    // Маршрут только по пустой дороге x=12 (Blender): ни через дома, ни через фонари и сугробы.
    Y.pass -= dt;
    const car = this.nodes.Ext_PassCar;
    if (car && Y.pass <= 0 && !Y.driving) { Y.driving = { y: 85, yaw: Math.PI, phase: "in", t: 0 }; Y.pass = rnd(55, 90); this.passCar = this.audio.carPass(); }
    if (car && Y.driving) {
      const D = Y.driving;
      D.t += dt;
      if (D.phase === "in") { const v = Math.max(1.5, Math.min(12, (D.y + 3) * 0.6)); D.y -= v * dt; if (D.y <= -3) { D.phase = "wait"; D.t = 0; } }
      else if (D.phase === "wait") { if (D.t > 4.5) { D.phase = "turn"; D.t = 0; } }
      else if (D.phase === "turn") { const k = Math.min(1, D.t / 3); D.yaw = Math.PI * (1 - k); D.y += dt * 1.2; if (k >= 1) { D.phase = "out"; D.t = 0; } }
      else { D.y += dt * Math.min(12, 2 + D.t * 4); }
      const x = 12 + (D.phase === "turn" ? Math.sin(Math.min(1, D.t / 3) * Math.PI) * 1.4 : 0);
      car.position.copyFrom(B(x, D.y, -6.3).subtract(B(12, -200, -6.3)).add(this._passBase || (this._passBase = car.position.clone())));
      car.rotationQuaternion = Quaternion.RotationAxis(Axis.Y, D.yaw);
      // фары смотрят туда же, куда машина
      const fx = -Math.sin(D.yaw), fz = -Math.cos(D.yaw);
      this.passLight.position.copyFrom(B(x, D.y, -5.6)).addInPlaceFromFloats(fx * 4, 0, fz * 4);
      this.passLight.intensity = D.phase === "wait" ? 55 : 40;
      if (this.passCar) this.passCar.move(this.xyzOf(B(x, D.y, -5.8)));
      if (D.phase === "out" && D.y > 85) { Y.driving = null; this.passLight.intensity = 0; if (this.passCar) { this.passCar.stop(); this.passCar = null; } car.position.copyFrom(this._passBase); }
    }
  }

  setOutside({ windows, lamps, storm } = {}) {
    if (windows !== undefined) this.outside.windows = windows;
    if (lamps !== undefined) this.outside.lamps = lamps;
    if (storm !== undefined) {
      this.outside.storm = storm;
      for (const ps of this.snow) { ps.emitRate = (this.mobile ? 120 : 420) * storm; ps.minEmitPower = 1 + storm * 1.5; ps.maxEmitPower = 2 + storm * 3; }
    }
  }

  // ---------------- кадр ----------------
  update(dt, t, playerPos) {
    this._lampT -= dt;
    if (this._lampT <= 0 && playerPos) { this._lampT = 0.25; this._chooseLamps(playerPos); }
    let hum = 0;
    for (const k in this.lamps) {
      const L = this.lamps[k];
      L.level += (L.target - L.level) * Math.min(1, dt * 12);
      let v = L.level;
      if (L.flicker > 0) {
        L.flicker = Math.max(0, L.flicker - dt * 0.8);
        if (Math.random() < 0.35) v *= Math.random() < 0.5 ? 0.05 : rnd(0.4, 1.2);
        if (Math.random() < 0.04 && this.audio.ctx) this.audio.click(this.xyzOf(L.light.position), 0.12);
      }
      v *= 0.95 + 0.05 * Math.sin(t * 7.3 + L.base) * Math.sin(t * 2.1);
      L.light.intensity = L.base * v;
      if (L.bulb) L.color.scaleToRef(clamp(v, 0, 1.2) * 1.6, L.bulb.emissiveColor);
      if (playerPos) hum += v / (1 + Vector3.DistanceSquared(L.light.position, playerPos));
    }
    if (this.audio.ctx) this.audio.setHum(hum * 0.8);
    this._syncProxies();
    for (const k in this.doors) {
      const d = this.doors[k];
      if (Math.abs(d.target - d.angle) > 0.0005) {
        const step = d.speed * dt;
        d.angle += clamp(d.target - d.angle, -step, step);
        d.node.rotationQuaternion = d.base.multiply(Quaternion.RotationAxis(d.axis, d.angle * d.dir));
        if (d.closing && d.angle < 0.02) { d.closing = false; if (this.audio.ctx) this.audio.door(this.doorPos(k), d.kind, false); }
      }
    }
    if (this.tvOn && Math.random() < 0.6) {
      const ctx = this.tvTex.getContext();
      const img = ctx.createImageData(128, 96);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0); this.tvTex.update();
      this.tvLight.intensity = rnd(0.6, 1.5);
    }
    if (this.garageLight) {
      let g = this.garageOn;
      if (g && Math.random() < 0.06) g *= rnd(0.2, 0.8);
      this.garageLight.intensity += (g * 9 - this.garageLight.intensity) * Math.min(1, dt * 20);
    }
    this._yardUpdate(dt, t, playerPos);
    if (this.street) {
      const o = this.outside;
      for (const S of this.street) {
        S.level += ((S.dead ? 0 : o.lamps) - S.level) * Math.min(1, dt * (S.dead ? 1.2 : 3));
        let v = S.level;
        if (o.lamps > 0 && Math.random() < 0.002) S.flicker = 0.6;
        if (S.flicker > 0) { S.flicker -= dt; if (Math.random() < 0.4) v *= 0.1; }
        S.light.intensity = S.base * v;
      }
      if (this.sodiumMat) this.sodiumMat.emissiveColor = new Color3(1, 0.55, 0.2).scale(o.lamps * 2);
      for (const m of this.facadeMats) {
        const cur = m.emissiveColor.r, want = o.windows;
        if (Math.abs(cur - want) > 0.002) m.emissiveColor = new Color3(1, 1, 1).scale(cur + (want - cur) * Math.min(1, dt * 1.5));
      }
      // ветер громче у окон и снаружи
      if (playerPos && this.audio.ctx) {
        const bx = playerPos.x, by = -playerPos.z;
        let near = playerPos.y < -3 ? 1 : 0;
        for (const [wx, wy] of WINDOWS) near = Math.max(near, 1 / (1 + ((bx - wx) ** 2 + (by - wy) ** 2) * 0.35));
        if (bx > 4.0 && by > 7.4 && by < 11.6) near = 1;   // лоджия
        this.audio.setWind((0.12 + near * 0.5) * (0.4 + o.storm * 0.6));
      }
    }
  }
}
