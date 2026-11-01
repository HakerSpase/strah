import {
  Axis, Color3, Color4, DynamicTexture, HemisphericLight, LoadAssetContainerAsync, Material, MirrorTexture,
  ParticleSystem, Plane, PointLight, Quaternion, StandardMaterial, Vector3,
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
    const maxLights = mobile ? 4 : 6;
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
      const l = new PointLight("L_" + name, p, this.scene);
      l.diffuse = new Color3(1.0, 0.72, 0.42);
      l.specular = new Color3(0.9, 0.7, 0.5);
      l.intensity = 0; l.range = 8;
      l.setEnabled(false);
      let bulb = null;
      for (const m of this.meshesOf(name)) {
        if (m.material && m.material.name === "Bulb") { bulb = bulb || m.material.clone("Bulb_" + name); m.material = bulb; }
      }
      this.lamps[name] = { light: l, bulb, base: 2.6 * k, level: 0, target: 0, flicker: 0, broken: false, color: l.diffuse.clone() };
    }
    this._lampT = 0;
  }

  setLamp(name, on, { instant = false } = {}) {
    const L = this.lamps[name]; if (!L || L.broken) return;
    L.target = on ? 1 : 0;
    if (instant) L.level = L.target;
  }
  lampOn(name) { const L = this.lamps[name]; return !!L && L.target > 0.5 && !L.broken; }
  setAllLamps(on, except = []) { for (const k in this.lamps) if (!except.includes(k)) this.setLamp(k, on, { instant: true }); }
  flicker(name, amount = 1) { const L = this.lamps[name]; if (L) L.flicker = Math.max(L.flicker, amount); }
  lampColor(name, c) { const L = this.lamps[name]; if (L) { L.color = c; L.light.diffuse = c; } }
  breakLamp(name) {
    const L = this.lamps[name]; if (!L || L.broken) return;
    if (this.audio.ctx) this.audio.bulbPop(this.xyzOf(L.light.position));
    L.broken = true; L.target = 0; L.level = 0;
  }
  repairAll() { for (const k in this.lamps) { this.lamps[k].broken = false; this.lampColor(k, new Color3(1.0, 0.72, 0.42)); } }

  // включены только K ближайших ламп: число огней в шейдере постоянно, ничего не пересобирается
  _chooseLamps(p) {
    const arr = Object.values(this.lamps).map((L) => ({ L, d: Vector3.DistanceSquared(L.light.position, p) - (L.target > 0 ? 6 : 0) }));
    arr.sort((a, b) => a.d - b.d);
    arr.forEach((o, i) => { const on = i < this.lampK; if (o.L.light.isEnabled() !== on) o.L.light.setEnabled(on); });
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
      m.maxSimultaneousLights = 6;
      for (const ms of meshes) ms.material = m;
      this.mirrors.push({ name: d.name, rt, pos, mesh: meshes[0] });
    }
  }

  setMirrorRenderList(meshes) { for (const M of this.mirrors) M.rt.renderList = meshes.filter((m) => m !== M.mesh); }

  // ---------------- предметы: вода, газ, холодильник, ТВ ----------------
  _setupProps() {
    for (const n of ["Water_Stream", "Bath_Stream", "Gas_Flames"]) this.show(n, false);
    const mk = (name, p, col, range) => {
      const l = new PointLight(name, p, this.scene);
      l.diffuse = col; l.intensity = 0; l.range = range; l.setEnabled(false);
      return l;
    };
    this.fridgeLight = mk("fridgeLight", this.nodes.FridgeLight ? this.pos("FridgeLight") : B(3.62, 7.85, 1.25), new Color3(0.85, 0.95, 1.0), 2.5);
    this.gasLight = mk("gasLight", B(2.62, 7.8, 1.0), new Color3(0.3, 0.5, 1.0), 2.5);
    this.tvLight = mk("tvLight", B(-2.5, 2.1, 0.9), new Color3(0.6, 0.7, 1), 5);
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
    this.facadeMats = [];
    for (const m of c.materials) {
      m.fogEnabled = false;
      m.backFaceCulling = true;          // стены нашего дома не видны изнутри квартиры
      m.maxSimultaneousLights = this.mobile ? 3 : 5;
      if (m.name === "Sky") { m.disableLighting = true; m.emissiveColor = new Color3(1, 1, 1); m.backFaceCulling = false; }
      if (/^Facade/.test(m.name)) { this.facadeMats.push(m); m.emissiveColor = new Color3(1, 1, 1); }
      if (m.name === "Sodium") this.sodiumMat = m;
    }
    for (const m of meshes) {
      m.isPickable = false; m.checkCollisions = false; m.receiveShadows = false;
      const top = this._top(m);
      if (top && top.name === "Ext_Colliders") { m.isVisible = false; m.checkCollisions = true; }
      if (top && top.name === "Ext_Car_Drive") { m.metadata = { id: "I_Car" }; m.isPickable = true; }
      else m.freezeWorldMatrix();
    }
    // натриевые фонари светят только на улицу
    this.street = [];
    const n = this.mobile ? 3 : 6;
    for (let i = 0; i < n; i++) {
      if (!this.nodes["SL_" + i]) continue;
      const l = new PointLight("SL" + i, this.pos("SL_" + i), scene);
      l.diffuse = new Color3(1.0, 0.55, 0.22); l.specular = new Color3(1.0, 0.6, 0.3);
      l.intensity = 120; l.range = 30;
      l.includedOnlyMeshes = meshes;
      this.street.push({ light: l, base: 120, level: 1, flicker: 0 });
    }
    const moon = (this.moon = new HemisphericLight("moon", new Vector3(0.3, 1, 0.2), scene));
    moon.intensity = 0.25; moon.diffuse = new Color3(0.55, 0.6, 0.8); moon.groundColor = new Color3(0.12, 0.08, 0.07);
    moon.specular = Color3.Black();
    moon.includedOnlyMeshes = meshes;
    for (const L of Object.values(this.lamps)) L.light.excludedMeshes = meshes;
    for (const l of [this.ambient, this.fridgeLight, this.gasLight, this.tvLight]) l.excludedMeshes = meshes;
    this.outside = { windows: 1, lamps: 1, storm: 1 };
    this._blizzard();
  }

  _blizzard() {
    const scene = this.scene;
    const tex = new DynamicTexture("flake", 32, scene, false);
    const ctx = tex.getContext();
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(240,244,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); tex.hasAlpha = true; tex.update();
    // метель вокруг дома: ветер несёт снег с запада на восток
    const zones = [
      [B(-14, -26, -6), B(14, -4.6, 8)],     // двор (окно спальни, подъезд)
      [B(-20, -4, -6), B(-5.2, 16, 8)],      // запад (мамино окно)
      [B(5.6, -4, -6), B(20, 16, 8)],        // восток (кухня, детская, лоджия)
    ];
    this.snow = zones.map(([a, b]) => {
      const ps = new ParticleSystem("snow", this.mobile ? 500 : 1800, scene);
      ps.particleTexture = tex;
      ps.emitter = new Vector3(0, 0, 0);
      ps.minEmitBox = new Vector3(Math.min(a.x, b.x), Math.max(a.y, b.y), Math.min(a.z, b.z));
      ps.maxEmitBox = new Vector3(Math.max(a.x, b.x), Math.max(a.y, b.y) + 2, Math.max(a.z, b.z));
      ps.direction1 = new Vector3(3.5, -1.2, -0.8); ps.direction2 = new Vector3(6.0, -2.0, 0.8);
      ps.minEmitPower = 2.5; ps.maxEmitPower = 5;
      ps.minLifeTime = 4; ps.maxLifeTime = 7;
      ps.minSize = 0.06; ps.maxSize = 0.14;
      ps.emitRate = this.mobile ? 120 : 420;
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
      if (L.bulb) L.bulb.emissiveColor = L.color.scale(clamp(v, 0, 1.2) * 1.6);
      if (playerPos) hum += v / (1 + Vector3.DistanceSquared(L.light.position, playerPos));
    }
    if (this.audio.ctx) this.audio.setHum(hum * 0.8);
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
    if (this.street) {
      const o = this.outside;
      for (const S of this.street) {
        S.level += (o.lamps - S.level) * Math.min(1, dt * 3);
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
