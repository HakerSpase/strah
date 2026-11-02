// Съёмка трейлера (только ?trailer в адресе): сцены ставятся вручную, кадры рендерятся с постоянным шагом
// времени и сохраняются на диск через dev-сервер — видео получается плавным на любой видеокарте.
import { Camera, Color3, SpotLight, Vector3 } from "@babylonjs/core";
import { B } from "./util.js";

const FPS = 30, W = 1080, H = 1920;
const E = 1.62;                                   // высота глаз
const ease = (x) => x * x * (3 - 2 * x);
const L = (a, b, k) => a.add(b.subtract(a).scale(k));

export async function runTrailer(g) {
  const { engine, scene, world: w, player: p, entity: e, audio, frame } = g;
  audio.start({ master: 0, ambience: 0, effects: 0 });
  engine.stopRenderLoop();
  engine.setSize(W, H);
  window.removeEventListener("resize", () => {});
  const cam = p.camera;
  cam.fovMode = Camera.FOVMODE_VERTICAL_FIXED; cam.fov = 1.25;
  p.enabled = false; p.hasLight = true;
  let camPos = B(0, 0, E), look = B(0, 1, E);
  p.mount = () => camPos;
  const aim = () => {
    const d = look.subtract(camPos);
    p.yaw = Math.atan2(-d.x, -d.z); p.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  };
  const status = document.createElement("div");
  status.style.cssText = "position:fixed;left:8px;top:8px;z-index:99;color:#0f0;font:14px monospace;background:#000a;padding:4px";
  document.body.appendChild(status);

  const reset = () => {
    w.stopProps(); w.resetDoors(); w.repairAll(); w.setAllLamps(false); w.resetYard();
    e.hide(); e.showWatcher(null);
    p.lightOn = false; p.lightPower = 1; p.crouch = false; p.shake = 0; p.lightFlicker = 0;
    w.setOutside({ windows: 0.6, lamps: 1, storm: 1.6 });
    if (g.headlights) { g.headlights.dispose(); g.headlights = null; }
  };
  const lamp = (names, on = true) => { for (const n of names) w.setLamp(n, on, { instant: true }); };

  // каждая сцена: setup(), затем upd(k, t) — k от 0 до 1
  const shots = [
    { name: "01_hall", sec: 4.2, setup() { lamp(["Lamp_Corr3"]); w.flicker("Lamp_Corr3", 99); },
      upd(k) { camPos = B(0, L(new Vector3(-0.5, 0, 0), new Vector3(1.2, 0, 0), ease(k)).x, E); look = B(0.05, 12, 1.3); } },
    { name: "02_phone", sec: 2.6, setup() { lamp(["Lamp_Corr2"]); },
      upd(k) { const ph = w.pos("I_Phone"); camPos = ph.add(new Vector3(-0.55 + k * 0.1, 0.45 - k * 0.06, -0.35)); look = ph.add(new Vector3(0, 0.05, 0)); } },
    { name: "03_tap", sec: 2.6, setup() { lamp(["Lamp_Kitchen"]); w.setWater("tap", true); },
      upd(k) { const t = B(1.96, 7.71, 0.85); camPos = t.add(new Vector3(0.15 - k * 0.12, 0.35, -0.75 + k * 0.08)); look = t.add(new Vector3(0, -0.08, 0)); } },
    { name: "04_oven", sec: 3.4, setup() { lamp(["Lamp_Kitchen"]); w.flicker("Lamp_Kitchen", 99); p.lightOn = true; w.setDoor("Oven_Door", true, { speed: 0.55, silent: true }); },
      upd(k) { camPos = B(2.62, 8.95 - k * 0.15, 0.85 - k * 0.05); look = B(2.62, 7.8, 0.36); } },
    { name: "05_kids", sec: 3.2, setup() { p.lightOn = true; },
      upd(k) { camPos = B(1.2, 1.0, E - 0.1); look = L(B(3.9, 3.0, 1.2), B(1.8, 3.9, 0.8), ease(k)); } },
    { name: "06_window", sec: 3.8, setup() { w.setOutside({ windows: 0.3, lamps: 1, storm: 2.2 }); e.showWatcher(w.pos("Watcher_Spot"), B(0.2, -4.4, -4)); lamp(["Lamp_Bed"], false); },
      upd(k) { camPos = B(0.1, -3.2 - k * 0.7, 1.55); look = L(B(0.2, -14.2, -4.0), B(0.2, -14.2, -4.6), k); } },
    { name: "07_peek", sec: 3.4, setup() { lamp(["Lamp_Corr1"]); w.flicker("Lamp_Corr1", 99); p.lightOn = true; e.place(B(0, 0.6, 0), 0, "Peek"); },
      upd(k, t) { camPos = B(0, 7.6 - k * 0.5, E); look = B(0, 0.6, 1.9); e.faceTo(camPos); p.lightFlicker = t > 2.2 ? 1 : 0; } },
    { name: "08_bath", sec: 2.6, setup() { lamp(["Lamp_Bath"]); w.flicker("Lamp_Bath", 99); w.show("BathWater", true); w.setWater("bath", true); },
      upd(k) { camPos = B(-1.3, 7.9 - k * 0.2, 1.45); look = B(-2.39, 7.0, 0.45); } },
    { name: "09_closet", sec: 3.6, setup() { p.lightOn = true; w.setDoor("Door_Closet", false); },
      upd(k, t) {
        camPos = B(1.5, 5.4, E - 0.3 + Math.sin(t * 9) * 0.004); look = B(0.8, 4.95, 1.0);
        // дверь дёргают снаружи
        const jolt = (t > 0.8 && t < 1.0) || (t > 1.9 && t < 2.05) || (t > 2.7 && t < 3.0);
        w.setDoor("Door_Closet", jolt, { amount: 0.05, speed: 6, silent: true });
        if (jolt) p.shake = 0.6;
      } },
    { name: "10_hunt", sec: 3.4, setup() { lamp(["Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3"]); p.lightOn = true; e.place(B(0, 1.0, 0), 0, "Walk"); },
      upd(k, t, dt) {
        e.pos.addInPlace(B(0, 1.6 * dt, 0).subtract(B(0, 0, 0))); e.faceTo(camPos);
        camPos = B(0, 7.2 + k * 0.4, E + Math.sin(t * 11) * 0.02); look = e.head().add(new Vector3(0, -0.3, 0));
        for (const [n, y] of [["Lamp_Corr1", 2.0], ["Lamp_Corr2", 6.0]]) if (!w.lamps[n].broken && -e.pos.z > y - 0.5) w.breakLamp(n);
      } },
    { name: "11_yard", sec: 3.6, setup() { w.setOutside({ windows: 0.25, lamps: 1, storm: 2.4 }); w.yardLife(true); p.lightOn = true; w.setGarage(true); },
      upd(k, t) { camPos = B(-1 - k * 2.2, -8.0 - k * 2.8, -6.3 + E + Math.sin(t * 9) * 0.03); look = B(-6.0, -18.0, -5.2); } },
    { name: "12_garage", sec: 2.8, setup() { w.setOutside({ windows: 0.2, lamps: 1, storm: 2.4 }); w.setGarage(true); p.lightOn = true; },
      upd(k) { camPos = B(-18.6 - k * 0.9, -7.4, -6.3 + E); look = B(-24, -7.6, -5.4); } },
    { name: "13_lights", sec: 3.4, setup() {
      w.setOutside({ windows: 0.05, lamps: 0.2, storm: 2.6 });
      const car = w.nodes.Ext_Car_Drive; w.setDrift(0);
      const hl = (g.headlights = new SpotLight("thl", Vector3.Zero(), new Vector3(0, -0.08, -1), 0.7, 3, scene));
      hl.diffuse = new Color3(1, 0.92, 0.75); hl.range = 40; hl.intensity = 0;
      const m = car.getWorldMatrix();
      hl.position = Vector3.TransformCoordinates(new Vector3(0, 0.65, -2.2), m);
      hl.direction = Vector3.TransformNormal(new Vector3(0, -0.08, -1), m).normalize();
      const ahead = Vector3.TransformCoordinates(new Vector3(0, 0, -6), m);
      e.place(new Vector3(ahead.x, car.position.y, ahead.z), 0, "Peek");
      this.seat = Vector3.TransformCoordinates(new Vector3(-0.35, 1.12, 0.45), m);
      this.ahead = ahead;
    },
      upd(k, t) {
        camPos = this.seat; look = this.ahead.add(new Vector3(0, 1.9, 0)); e.faceTo(camPos);
        g.headlights.intensity = t < 0.9 ? 0 : t < 1.1 ? 30 : t < 1.4 ? 0 : 34 + Math.random() * 6;
      } },
    { name: "14_attack", sec: 1.8, setup() { lamp(["Lamp_Corr2"]); w.flicker("Lamp_Corr2", 99); p.lightOn = true; p.lightPower = 1.3; e.place(B(0, 6.6, 0), 0, "Attack"); e.play("Attack", 1, false); },
      upd(k, t) { camPos = B(0, 5.75, E); look = e.head().add(new Vector3(0, -0.15, 0)); e.faceTo(camPos); p.shake = t > 0.25 ? 1.6 : 0; } },
  ];

  const only = new URLSearchParams(location.search).get("shot");
  const canvas = engine.getRenderingCanvas();
  for (const S of shots) {
    if (only && !S.name.startsWith(only)) continue;
    reset();
    S.setup();
    // прогрев: свет, двери и частицы встают на место
    for (let i = 0; i < 40; i++) { S.upd(0, 0, 1 / 60); aim(); frame(1 / 60); }
    if (S.name === "04_oven") w.setDoor("Oven_Door", true, { speed: 0.55, silent: true });
    const n = Math.round(S.sec * FPS);
    for (let f = 0; f < n; f++) {
      for (let s = 0; s < 2; s++) {
        const t = (f * 2 + s) / (FPS * 2);
        S.upd(t / S.sec, t, 1 / (FPS * 2)); aim(); frame(1 / (FPS * 2));
      }
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      await fetch(`/__frame?shot=${S.name}&i=${f}`, { method: "POST", body: blob });
      status.textContent = `${S.name} ${f + 1}/${n}`;
    }
  }
  status.textContent = "DONE";
  window.trailerDone = true;
}
