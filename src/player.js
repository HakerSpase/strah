import {
  Color3, MeshBuilder, Ray, ShadowGenerator, SpotLight, UniversalCamera, Vector3,
} from "@babylonjs/core";
import { B, clamp, lerp, rnd } from "./util.js";

const EYE = 1.62;
const RADIUS = 0.26;

export class Player {
  constructor(scene, audio, world) {
    this.scene = scene;
    this.audio = audio;
    this.world = world;
    this.yaw = 0; this.pitch = 0;
    this.keys = {};
    this.sens = 1;
    this.enabled = false;
    this.frozen = false;
    this.lookTarget = null;      // принудительный взгляд (скример)
    this.stamina = 1;
    this.bob = 0; this.stepPhase = 0;
    this.vel = new Vector3();
    this.shake = 0;
    this.lightOn = false;
    this.hasLight = false;

    this.body = MeshBuilder.CreateBox("playerBody", { size: 0.2 }, scene);
    this.body.isVisible = false;
    this.body.isPickable = false;
    this.body.checkCollisions = false;
    this.body.ellipsoid = new Vector3(RADIUS, EYE / 2 + 0.02, RADIUS);
    this.body.ellipsoidOffset = new Vector3(0, EYE / 2 + 0.02, 0);

    const cam = (this.camera = new UniversalCamera("cam", new Vector3(0, EYE, 0), scene));
    cam.minZ = 0.05; cam.maxZ = 260;      // небо и дальние дома за окном (туман прячет даль)
    cam.fov = 1.08;
    cam.inputs.clear();
    scene.activeCamera = cam;

    this._flashlight();
    this._input();
  }

  _flashlight() {
    const scene = this.scene;
    const s = (this.light = new SpotLight("flash", new Vector3(), new Vector3(0, 0, -1), 0.78, 2, scene));
    s.diffuse = new Color3(0.92, 0.95, 1.0);
    s.specular = new Color3(0.6, 0.6, 0.6);
    s.intensity = 0;
    s.range = 16;
    this.shadows = new ShadowGenerator(512, s);
    this.shadows.usePercentageCloserFiltering = true;
    this.shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    this.shadows.bias = 0.0008;
    this.shadows.normalBias = 0.02;
    this.lightDir = new Vector3(0, 0, -1);
  }

  _input() {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    window.addEventListener("keydown", (e) => {
      this.keys[e.code] = true;
      if (e.code === "KeyF" && this.enabled && this.hasLight) this.toggleLight();
      if ((e.code === "KeyC" || e.code === "ControlLeft") && this.enabled) this.crouch = !this.crouch;
    });
    window.addEventListener("keyup", (e) => (this.keys[e.code] = false));
    // Chrome иногда присылает ложный гигантский рывок мыши при захвате курсора — отбрасываем его
    this._mHist = [];
    document.addEventListener("mousemove", (e) => {
      if (!this.enabled || this.frozen || document.pointerLockElement !== canvas) return;
      const dx = e.movementX, dy = e.movementY, m = Math.hypot(dx, dy);
      const avg = this._mHist.length ? this._mHist.reduce((a, b) => a + b, 0) / this._mHist.length : 0;
      if (m > 400 || (m > 180 && this._mHist.length > 3 && m > avg * 6 + 60)) return;
      this._mHist.push(m); if (this._mHist.length > 8) this._mHist.shift();
      this.addLook(dx, dy);
    });
  }

  addLook(dx, dy) {
    this.yaw -= dx * 0.0022 * this.sens;
    this.pitch = clamp(this.pitch - dy * 0.0022 * this.sens, -1.45, 1.45);
  }

  toggleLight(on = !this.lightOn) {
    this.lightOn = on;

    this.audio.click(null, 0.35);
  }

  teleport(pos, yaw) {
    this.body.position.copyFrom(pos);
    this.body.position.y = pos.y + 0.05;
    this.yaw = yaw; this.pitch = 0;
    this.vel.setAll(0);
  }

  get position() { return this.body.position; }
  get eye() { return this.camera.position; }
  forward() { return this.dir ? this.dir.clone() : new Vector3(0, 0, -1); }

  surface() {
    const p = this.body.position;
    const bx = p.x, by = -p.z;            // обратно в координаты Blender
    if (p.y < -3) return "snow";
    if (by > 13.4 || (bx > 4.0 && by > 7.4 && by < 11.6)) return "concrete";
    if (bx > 0.8 && by > 7.4 && by < 11.6) return "lino";
    if (bx < -0.8 && by > 8.8 && by < 10.2) return "tile";
    if (bx < -0.8 && by > 6.4 && by < 8.8) return "tile";
    if (by > 12) return "lino";
    if (Math.abs(bx) < 0.9 && by > -3.5 && by < -1.0) return "carpet";
    return "wood";
  }

  update(dt, t) {
    const cam = this.camera;
    let speed = 0;
    if (this.enabled && !this.frozen) {
      const k = this.keys;
      const fwd = new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).scale(-1);
      const right = new Vector3(-fwd.z, 0, fwd.x);
      const mv = new Vector3();
      if (k.KeyW || k.ArrowUp) mv.addInPlace(fwd);
      if (k.KeyS || k.ArrowDown) mv.subtractInPlace(fwd);
      if (k.KeyD || k.ArrowRight) mv.addInPlace(right);
      if (k.KeyA || k.ArrowLeft) mv.subtractInPlace(right);
      // сенсорный джойстик
      if (this.touch && (this.touch.x || this.touch.y)) { mv.addInPlace(fwd.scale(this.touch.y)); mv.addInPlace(right.scale(this.touch.x)); }
      const moving = mv.lengthSquared() > 0.01;
      const run = moving && (k.ShiftLeft || k.ShiftRight || (this.touch && this.touch.run)) && this.stamina > 0.05 && !this.noRun;
      const target = moving ? (run && !this.crouch ? 3.4 : this.crouch ? 0.9 : 1.55) * (this.speedMul || 1) * (this.devSpeed || 1) * Math.min(1, mv.length()) : 0;
      if (moving) mv.normalize();
      this.vel.x = lerp(this.vel.x, mv.x * target, Math.min(1, dt * 9));
      this.vel.z = lerp(this.vel.z, mv.z * target, Math.min(1, dt * 9));
      this.stamina = clamp(this.stamina + (run ? -dt * 0.16 : dt * 0.1), 0, 1);
      if (run && this.stamina < 0.3 && Math.random() < dt * 2) this.audio.breath(0.3, Math.random() < 0.5, 0.5);
    } else {
      this.vel.scaleInPlace(0.8);
    }
    if (!this.mount) {
      this.vel.y -= 9.8 * dt;
      const before = this.body.position.y;
      this.body.moveWithCollisions(this.vel.scale(dt));
      if (Math.abs(this.body.position.y - before) < 1e-4 && this.vel.y < 0) this.vel.y = -0.5;
      if (this.body.position.y < -12) this.body.position.y = 0.1;
    } else this.vel.setAll(0);

    speed = Math.hypot(this.vel.x, this.vel.z);
    // покачивание головы и шаги
    const prev = this.stepPhase;
    this.stepPhase += speed * dt * 1.9;
    if (Math.floor(prev) !== Math.floor(this.stepPhase) && speed > 0.4) {
      const p = this.body.position;
      this.audio.footstep({ x: p.x, y: p.y + 0.05, z: p.z }, this.surface(), speed > 2.5);
    }
    const bobAmt = Math.min(1, speed / 1.6);
    const bobY = Math.sin(this.stepPhase * Math.PI * 2) * 0.035 * bobAmt;
    const bobX = Math.cos(this.stepPhase * Math.PI) * 0.025 * bobAmt;
    // дыхание в покое
    const idle = Math.sin(t * 1.3) * 0.006;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    const sh = this.shake * this.shake;

    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    if (this.mount) cam.position.copyFrom(this.mount());
    // присед: глаза опускаются плавно, ходьба медленнее
    this.eyeH = this.eyeH ?? EYE;
    this.eyeH += ((this.crouch ? 0.95 : EYE) - this.eyeH) * Math.min(1, dt * 8);
    if (this.mount) {}
    else cam.position.copyFrom(this.body.position).addInPlace(new Vector3(0, this.eyeH + bobY + idle, 0)).addInPlace(right.scale(bobX));
    cam.position.addInPlaceFromFloats(rnd(-1, 1) * sh * 0.03, rnd(-1, 1) * sh * 0.03, rnd(-1, 1) * sh * 0.03);

    let yaw = this.yaw, pitch = this.pitch;
    if (this.lookTarget) {
      const d = this.lookTarget.subtract(cam.position);
      const ty = Math.atan2(-d.x, -d.z), tp = Math.atan2(d.y, Math.hypot(d.x, d.z));
      let dy = ty - this.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      this.yaw += dy * Math.min(1, dt * 10); this.pitch += (tp - this.pitch) * Math.min(1, dt * 10);
      yaw = this.yaw; pitch = this.pitch;
    }
    const dir = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    cam.setTarget(cam.position.add(dir));
    this.dir = dir;

    // фонарик чуть запаздывает за взглядом, как в руке
    this.lightDir = Vector3.Lerp(this.lightDir, dir, Math.min(1, dt * 11)).normalize();
    const L = this.light;
    L.position.copyFrom(cam.position).addInPlace(right.scale(0.12)).addInPlaceFromFloats(0, -0.1, 0);
    L.direction.copyFrom(this.lightDir);
    const want = this.lightOn ? (this.lightPower ?? 1) : 0;
    let li = want * 42;
    if (this.lightOn && this.lightFlicker > 0) {
      this.lightFlicker -= dt;
      if (Math.random() < 0.4) li *= Math.random() < 0.6 ? 0 : 0.4;
    }
    L.intensity = li;
    // индикатор фонарика на экране и на сенсорной кнопке
    if (this._shownOn !== this.lightOn) {
      this._shownOn = this.lightOn;
      const ind = document.getElementById("light-ind");
      if (ind) { ind.classList.toggle("on", this.lightOn); ind.firstChild.textContent = this.lightOn ? "фонарик: вкл " : "фонарик: выкл "; }
      const btn = document.getElementById("t-light");
      if (btn) btn.classList.toggle("on", this.lightOn);
    }
    if (L.isEnabled() !== this.hasLight) L.setEnabled(this.hasLight);

    const fwd = dir, up = new Vector3(0, 1, 0);
    this.audio.updateListener(cam.position, fwd, up);
    return speed;
  }

  // видит ли игрок точку (в конусе взгляда и без препятствий)
  canSee(point, cone = 0.55, blockers = null) {
    const cam = this.camera;
    const d = point.subtract(cam.position);
    const dist = d.length();
    d.normalize();
    const f = this.forward();
    if (Vector3.Dot(f, d) < Math.cos(cone)) return false;
    const ray = new Ray(cam.position, d, dist - 0.3);
    const hit = this.scene.pickWithRay(ray, (m) => m.checkCollisions && (!blockers || blockers(m)));
    return !(hit && hit.hit);
  }

  // освещена ли точка фонариком
  litByFlashlight(point) {
    if (!this.lightOn || this.light.intensity < 2) return false;
    const d = point.subtract(this.light.position).normalize();
    return Vector3.Dot(d, this.lightDir) > Math.cos(0.42);
  }
}
