import { LoadAssetContainerAsync, Quaternion, TransformNode, Vector3 } from "@babylonjs/core";
import { B, rnd } from "./util.js";

// граф путей по квартире (координаты Blender)
const NAV = {
  bedC: [0, -2.2], bedDoor: [0, -0.35], c0: [0, 0.6], c1: [0, 2.0], c2: [0, 3.05], c3: [0, 4.95], c4: [0, 6.4],
  c5: [0, 7.6], c6: [0, 8.8], c7: [0, 10.0], c8: [0, 11.4], vest: [0, 12.8],
  momDoor: [-1.1, 3.05], momC: [-2.4, 3.2], closetDoor: [1.3, 4.95], closetC: [1.45, 5.3],
  bathDoor: [-1.1, 7.6], bathC: [-1.7, 7.6], kitDoor: [1.2, 8.8], kitC: [2.3, 9.4],
  kidsDoor: [1.1, 1.72], kidsC: [2.2, 2.0], wcDoor: [-1.1, 9.47], wcC: [-1.4, 9.5],
  logDoor: [3.7, 10.8], logC: [4.65, 9.5], stairL: [0, 14.0],
};
const EDGES = [
  ["bedC", "bedDoor"], ["bedDoor", "c0"], ["c0", "c1"], ["c1", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "c5"],
  ["c5", "c6"], ["c6", "c7"], ["c7", "c8"], ["c8", "vest"], ["c2", "momDoor"], ["momDoor", "momC"],
  ["c3", "closetDoor"], ["closetDoor", "closetC"], ["c5", "bathDoor"], ["bathDoor", "bathC"], ["c6", "kitDoor"], ["kitDoor", "kitC"],
  ["c1", "kidsDoor"], ["kidsDoor", "kidsC"], ["c6", "wcDoor"], ["wcDoor", "wcC"], ["kitC", "logDoor"], ["logDoor", "logC"], ["vest", "stairL"],
];
// какие двери стоят на каком ребре графа
const DOOR_ON = { "bedDoor-c0": "Door_Bedroom", "c2-momDoor": "Door_Mom", "c3-closetDoor": "Door_Closet", "c5-bathDoor": "Door_Bath", "c8-vest": "Door_Front",
  "c1-kidsDoor": "Door_Kids", "c6-wcDoor": "Door_WC", "kitC-logDoor": "Door_Loggia", "vest-stairL": "Door_Outer" };

export class Entity {
  constructor(scene, audio, world, player) {
    this.scene = scene; this.audio = audio; this.world = world; this.player = player;
    this.state = "hidden";
    this.speed = 0;
    this.path = [];
    this.adj = {};
    for (const [a, b] of EDGES) { (this.adj[a] ||= []).push(b); (this.adj[b] ||= []).push(a); }
    this.nav = Object.fromEntries(Object.entries(NAV).map(([k, [x, y]]) => [k, B(x, y, 0)]));
    this.crackT = 0;
    this.blocked = new Set();      // двери, которые оно не может открыть (игрок держит / заперлись)
    this.atDoor = null;            // упёрлось в закрытую дверь из blocked
    this.twitch = { t: 0, k: 0, q: Quaternion.Identity() };
  }

  async load(base = "/models/") {
    const c = await LoadAssetContainerAsync(base + "entity.glb", this.scene);
    // «наблюдатель» — вторая копия (со своими материалами): стоит во дворе под фонарём
    const inst = c.instantiateModelsToScene((n) => "W_" + n, true);
    c.addAllToScene();
    this.holder = new TransformNode("entity", this.scene);
    const root = c.meshes.find((m) => m.name === "__root__");
    root.parent = this.holder;
    this.meshes = c.meshes.filter((m) => m !== root);
    for (const m of this.meshes) {
      m.isPickable = false;
      m.receiveShadows = true;
      if (m.material) {
        m.material.maxSimultaneousLights = 8;
        if (/Hair|Dress/.test(m.material.name)) m.material.backFaceCulling = false;
        // кожа: серее и влажнее — под фонарём не пересвечивается в белое пятно
        if (/Skin/.test(m.material.name) && m.material.albedoColor && !m.material._k14) {
          m.material._k14 = true; m.material.albedoColor.scaleInPlace(0.62); m.material.roughness = 0.42; m.material.metallic = 0;
        }
      }
      this.player.shadows.addShadowCaster(m);
    }
    this.anims = {};
    for (const g of c.animationGroups) { g.stop(); this.anims[g.name] = g; }
    this.watcher = new TransformNode("watcher", this.scene);
    inst.rootNodes[0].parent = this.watcher;
    for (const m of this.watcher.getChildMeshes(false)) { m.isPickable = false; m.receiveShadows = false; if (m.material) m.material.fogEnabled = false; }
    this.watcherAnims = inst.animationGroups;
    for (const g of this.watcherAnims) g.stop();
    const idle = this.watcherAnims.find((g) => /Idle/.test(g.name));
    if (idle) idle.start(true, 0.8);
    this.watcher.setEnabled(false);
    // кости головы и челюсти — для резких «ломаных» подёргиваний поверх анимации
    const nodes = this.holder.getDescendants(false);
    this.headNode = nodes.find((n) => n.name === "head");
    this.jawNode = nodes.find((n) => n.name === "jaw");
    this.scene.onAfterAnimationsObservable.add(() => this._twitch());
    this.hide();
  }

  _twitch() {
    if (!this.visible || !this.headNode || !this.headNode.rotationQuaternion || this.wasFrozen) return;
    const T = this.twitch, dt = this.scene.getEngine().getDeltaTime() / 1000;
    T.t -= dt;
    const calm = this.state === "hidden" || this.state === "attack";
    if (T.t <= 0) {
      T.t = calm ? 99 : rnd(0.35, 2.2);
      const a = rnd(0.25, 0.7) * (Math.random() < 0.5 ? -1 : 1);
      T.q = Quaternion.RotationYawPitchRoll(rnd(-0.3, 0.3) * a, rnd(-0.4, 0.4) * a, a);
      T.k = 1;
      if (this.audio.ctx && Math.random() < 0.5) this.audio.jointCrack(this.headXYZ(), 2);
    }
    if (T.k <= 0.001) return;
    // рывок мгновенный, возврат — медленный: так двигаются сломанные вещи
    T.k = Math.max(0, T.k - dt * 2.2);
    const q = Quaternion.Slerp(Quaternion.Identity(), T.q, T.k * T.k);
    this.headNode.rotationQuaternion.multiplyInPlace(q);
    if (this.jawNode && this.jawNode.rotationQuaternion) this.jawNode.rotationQuaternion.multiplyInPlace(Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.35 * T.k));
  }

  showWatcher(p, faceTo) {
    this.watcher.setEnabled(!!p);
    if (!p) return;
    this.watcher.position.copyFrom(p);
    if (faceTo) { const d = faceTo.subtract(p); this.watcher.rotation.y = Math.atan2(d.x, d.z); }
  }

  play(name, speed = 1, loop = true) {
    if (this.cur === name && this.anims[name] && this.anims[name].isPlaying) { this.anims[name].speedRatio = speed; return; }
    for (const k in this.anims) this.anims[k].stop();
    const g = this.anims[name]; if (!g) return;
    g.start(loop, speed, g.from, g.to, false);
    this.cur = name;
  }

  pause(p) { const g = this.anims[this.cur]; if (g) p ? g.pause() : g.play(g.loopAnimation); }

  hide() { this.holder.setEnabled(false); this.state = "hidden"; this.atDoor = null; this.goal = null; this.wasFrozen = false; for (const k in this.anims) this.anims[k].stop(); this.cur = null; }

  place(p, yaw = 0, anim = "Idle") {
    this.holder.setEnabled(true);
    this.holder.position.copyFrom(p);
    this.holder.rotation.y = yaw;
    this.play(anim);
  }

  get visible() { return this.holder.isEnabled(); }
  get pos() { return this.holder.position; }
  head() { return this.holder.position.add(new Vector3(0, 2.15, 0)); }
  chest() { return this.holder.position.add(new Vector3(0, 1.5, 0)); }

  faceTo(p, k = 1) {
    const d = p.subtract(this.holder.position);
    const want = Math.atan2(d.x, d.z);
    let dy = want - this.holder.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    this.holder.rotation.y += dy * k;
  }

  // видит ли игрок сущность прямо сейчас
  seen(cone = 0.6) {
    if (!this.visible) return false;
    return this.player.canSee(this.head(), cone) || this.player.canSee(this.chest(), cone);
  }

  distToPlayer() { const a = this.holder.position, b = this.player.position; return Math.hypot(a.x - b.x, a.z - b.z); }

  _nearest(p) {
    let best = null, bd = 1e9;
    for (const k in this.nav) { const v = this.nav[k]; const d = Math.hypot(v.x - p.x, v.z - p.z); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  _route(fromP, toP) {
    const s = this._nearest(fromP), g = this._nearest(toP);
    const prev = { [s]: null }, q = [s];
    while (q.length) { const n = q.shift(); if (n === g) break; for (const m of this.adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
    const path = []; let n = g;
    while (n) { path.unshift(n); n = prev[n]; }
    return path;
  }

  // погоня: state = chase
  chase(speed = 3.0) { this.state = "chase"; this.speed = speed; this.play("Run", 1.15); this.repath = 0; }

  // «не смотри на него»: двигается, только когда игрок не смотрит
  stalk(speed = 1.4) { this.state = "stalk"; this.speed = speed; this.play("Walk", 1); this.repath = 0; }

  // охота: идёт на игрока всегда; свет фонарика в лицо его тормозит, вблизи — бросок
  hunt(speed = 1.8) { this.state = "hunt"; this.speed = speed; this.baseSpeed = speed; this.play("Walk", 1.2); this.repath = 0; }

  // упёрлось в дверь: скребётся и дёргает ручку
  _atDoor(dt) {
    this.play(this.anims.Scratch ? "Scratch" : "Idle", 1);
    this.scratchT = (this.scratchT || 0) - dt;
    if (this.scratchT <= 0 && this.audio.ctx) {
      this.scratchT = rnd(0.9, 2.4);
      const p = this.world.doorPos(this.atDoor);
      const r = Math.random();
      if (r < 0.45) this.audio.scratch(p, rnd(0.8, 1.8));
      else if (r < 0.75) this.audio.handleRattle(p);
      else this.audio.thump(p, 0.55, 120);
    }
  }

  update(dt, t) {
    if (!this.visible) return;
    if (this.state === "hunt") {
      const lit = this.player.litByFlashlight(this.chest()) && this.seen(0.5);
      const d = this.distToPlayer();
      const want = (lit ? 0.45 : 1) * this.baseSpeed * (d < 3.2 && !lit ? 1.45 : 1);
      this.speed += (want - this.speed) * Math.min(1, dt * 4);
      if (!this.atDoor) this.play(this.speed > 2.2 ? "Run" : "Walk", this.speed > 2.2 ? 1.1 : 0.7 + this.speed * 0.3);
      if (lit && !this.wasLit && this.audio.ctx) this.audio.rattle(this.headXYZ(), 1.2, 0.55);
      this.wasLit = lit;
    }
    if (this.state === "chase" || this.state === "stalk" || this.state === "hunt") {
      const frozen = this.state === "stalk" && this.seen(0.7);
      if (this.state === "stalk") {
        if (frozen !== this.wasFrozen) {
          this.pause(frozen);
          if (frozen) this.audio.jointCrack(this.headXYZ(), 3);
        }
        this.wasFrozen = frozen;
      }
      if (!frozen) this._move(dt);
      if (this.atDoor) this._atDoor(dt);
      // хруст суставов и хрип
      this.crackT -= dt;
      if (this.crackT <= 0) {
        this.crackT = rnd(0.6, 2.2);
        if (!frozen) Math.random() < 0.6 ? this.audio.jointCrack(this.headXYZ(), Math.floor(rnd(2, 6))) : this.audio.rattle(this.headXYZ(), rnd(1.2, 2.2), 0.5);
      }
    }
  }

  headXYZ() { const h = this.head(); return { x: h.x, y: h.y, z: h.z }; }

  _move(dt) {
    // на улице граф квартиры не нужен — идём прямо
    if (this.player.position.y < -3) {
      this.atDoor = null;
      const d = (this.goal || this.player.position).subtract(this.pos); d.y = 0;
      const len = d.length();
      if (len > 0.01) { const step = Math.min(len, this.speed * dt); this.pos.addInPlace(d.scale(step / len)); this.faceTo(this.pos.add(d), Math.min(1, dt * 8)); }
      this.pos.y = -6.3;
      this._steps(Math.min(len, this.speed * dt), "snow");
      return;
    }
    this.repath -= dt;
    if (this.repath <= 0 || !this.path.length) {
      this.path = this._route(this.holder.position, this.player.position);
      this.repath = 0.5;
    }
    let target = this.player.position;
    // идём к первому узлу пути, если он не позади нас
    const doorOn = (a, b) => DOOR_ON[`${a}-${b}`] || DOOR_ON[`${b}-${a}`];
    while (this.path.length > 1) {
      const n = this.nav[this.path[0]];
      const dn = doorOn(this.path[0], this.path[1]);
      // за запертую дверь не проходим: держимся у неё
      if (dn && this.blocked.has(dn) && !this.world.doorOpen(dn)) break;
      if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 0.35) this.path.shift(); else break;
    }
    if (this.path.length > 1) target = this.nav[this.path[0]];
    // дверь на пути: обычную распахивает, через запертую (blocked) пройти не может
    this.atDoor = null;
    if (this.path.length > 1) {
      const key1 = `${this.path[0]}-${this.path[1]}`, key2 = `${this.path[1]}-${this.path[0]}`;
      const dname = DOOR_ON[key1] || DOOR_ON[key2];
      if (dname && this.blocked.has(dname) && !this.world.doorOpen(dname)) {
        const n = this.nav[this.path[0]];
        if (Math.hypot(n.x - this.pos.x, n.z - this.pos.z) < 0.4) {
          this.atDoor = dname;
          const dp = this.world.doorPos(dname); this.faceTo(new Vector3(dp.x, 0, dp.z), Math.min(1, dt * 6));
          return;
        }
      } else if (dname && !this.world.doorOpen(dname)) this.world.setDoor(dname, true, { speed: 9 });
    }
    const d = target.subtract(this.pos); d.y = 0;
    const len = d.length();
    if (len > 0.01) {
      const step = Math.min(len, this.speed * dt);
      this.pos.addInPlace(d.scale(step / len));
      this.faceTo(this.pos.add(d), Math.min(1, dt * 8));
      this._steps(step, "wood");
    }
  }

  // шаги сущности: тяжёлые, волочащиеся, с хрустом
  _steps(step, surface) {
    this.stepT = (this.stepT || 0) - step;
    if (this.stepT > 0 || !this.audio.ctx) return;
    const fast = this.speed > 2.2;
    this.stepT = fast ? 0.95 : 0.78;
    const p = this.pos, at = { x: p.x, y: p.y + 0.1, z: p.z };
    this.audio.monsterStep(at, surface, fast);
  }
}
