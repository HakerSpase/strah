import {
  Color3, Color4, DefaultRenderingPipeline, Engine, ImageProcessingConfiguration, Ray, Scene, SSAO2RenderingPipeline,
} from "@babylonjs/core";
import { Audio } from "./audio.js";
import { Entity } from "./entity.js";
import { Player } from "./player.js";
import { Story } from "./story.js";
import { ui } from "./ui.js";
import { clock } from "./util.js";
import { World } from "./world.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const isTouch = matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;
if (isTouch) document.body.classList.add("touch");

// ---------------- настройки (сохраняются в браузере) ----------------
const engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: "high-performance" }, false);
const weakGpu = isTouch || /Radeon\(TM\) Graphics|Radeon Graphics|Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU/i.test(engine.getGlInfo().renderer);
const DEFAULTS = { sens: 1, bright: 1, master: 0.85, ambience: 0.8, effects: 0.9, quality: weakGpu ? "low" : "medium" };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem("k14-settings") || "{}")); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem("k14-settings", JSON.stringify(settings)); } catch (e) {} };
const bootQuality = settings.quality;
const lightModels = bootQuality === "low";

const scene = new Scene(engine);
scene.useRightHandedSystem = true;
scene.clearColor = new Color4(0, 0, 0, 1);
scene.collisionsEnabled = true;
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.075;
scene.fogColor = new Color3(0.01, 0.01, 0.012);
scene.skipPointerMovePicking = true;
scene.autoClear = true;

const audio = new Audio();
const world = new World(scene, audio);
const player = new Player(scene, audio, world);
const entity = new Entity(scene, audio, world, player);
const story = new Story({ world, player, entity, audio });
window.game = { scene, world, player, entity, story, audio };   // для отладки из консоли

// ---------------- постобработка ----------------
const pipe = new DefaultRenderingPipeline("pipe", !lightModels, scene, [player.camera]);
pipe.fxaaEnabled = true;
pipe.bloomThreshold = 0.75; pipe.bloomWeight = 0.35; pipe.bloomKernel = 32; pipe.bloomScale = 0.5;
pipe.grainEnabled = true; pipe.grain.animated = true; pipe.grain.intensity = 10;
pipe.imageProcessingEnabled = true;
const ip = pipe.imageProcessing;
ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
ip.contrast = 1.25;
ip.vignetteEnabled = true; ip.vignetteWeight = 3.2; ip.vignetteStretch = 0.3;
ip.vignetteColor = new Color4(0, 0, 0, 0); ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
let ssao = null;

function applyQuality(q) {
  engine.setHardwareScalingLevel(q === "low" ? (isTouch ? 1.15 : 1.35) : 1);
  pipe.bloomEnabled = q !== "low";
  pipe.chromaticAberrationEnabled = q !== "low";
  if (pipe.chromaticAberrationEnabled) pipe.chromaticAberration.aberrationAmount = 6;
  if (q === "high" && !ssao) {
    try {
      ssao = new SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [player.camera]);
      ssao.radius = 0.6; ssao.totalStrength = 1.0; ssao.samples = 8; ssao.maxZ = 25;
    } catch (e) { console.warn("SSAO недоступен", e); }
  } else if (q !== "high" && ssao) {
    scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline("ssao", [player.camera]);
    ssao.dispose(); ssao = null;
  }
  world.mirrorsAllowed = q !== "low";
  player.light.shadowEnabled = q !== "low";
  player.shadows.getShadowMap().refreshRate = q === "high" ? 1 : 2;
  for (const ps of world.snow || []) ps.emitRate = (q === "low" ? 160 : 420) * world.outside.storm;
}

function applySettings() {
  player.sens = settings.sens;
  ip.exposure = settings.bright;
  for (const k of ["master", "ambience", "effects"]) audio.setVolume(k, settings[k]);
  applyQuality(settings.quality);
  $("reload-note").classList.toggle("hidden", (settings.quality === "low") === lightModels);
}

// одни и те же настройки — на титуле и в паузе
function buildSettings(el) {
  const rows = [
    ["sens", "Чувствительность", 0.3, 3, 0.05],
    ["bright", "Яркость", 0.6, 1.8, 0.05],
    ["master", "Громкость: общая", 0, 1, 0.05],
    ["ambience", "Атмосфера и ветер", 0, 1, 0.05],
    ["effects", "Эффекты и голоса", 0, 1, 0.05],
  ];
  el.innerHTML = "";
  for (const [key, label, min, max, step] of rows) {
    const l = document.createElement("label");
    l.textContent = label + " ";
    const i = document.createElement("input");
    Object.assign(i, { type: "range", min, max, step, value: settings[key] });
    i.addEventListener("input", () => { settings[key] = +i.value; saveSettings(); applySettings(); syncSettings(); });
    i.dataset.key = key;
    l.appendChild(i); el.appendChild(l);
  }
  const l = document.createElement("label");
  l.textContent = "Графика ";
  const s = document.createElement("select");
  s.innerHTML = '<option value="low">Низкая (быстро)</option><option value="medium">Средняя</option><option value="high">Высокая</option>';
  s.value = settings.quality; s.dataset.key = "quality";
  s.addEventListener("change", () => { settings.quality = s.value; saveSettings(); applySettings(); syncSettings(); });
  l.appendChild(s); el.appendChild(l);
}
function syncSettings() {
  for (const el of document.querySelectorAll(".settings [data-key]")) el.value = settings[el.dataset.key];
}
buildSettings($("settings"));
buildSettings($("pause-settings"));
$("reload-link").addEventListener("click", (e) => { e.preventDefault(); location.reload(); });

// ---------------- загрузка ----------------
async function boot() {
  const base = lightModels ? "/models/mobile/" : "/models/";
  await world.load((f) => { $("loading-bar").style.width = `${Math.round(f * 80)}%`; }, base, lightModels);
  $("loading-text").textContent = "она ждёт…";
  await entity.load(base);
  $("loading-bar").style.width = "100%";
  const all = scene.meshes.filter((m) => m.isEnabled() && m.isVisible && m.name !== "playerBody" && !world.extMeshes.includes(m));
  world.setMirrorRenderList(all);
  applySettings();
  // камера во время меню смотрит в коридор
  player.teleport(world.pos("Spawn_Loop"), 0);
  world.setAllLamps(false);
  world.setLamp("Lamp_Corr3", true, { instant: true });
  world.flicker("Lamp_Corr3", 999);
  $("loading-text").classList.add("hidden");
  $("loading").classList.add("hidden");
  $("start").classList.remove("hidden");
  const save = loadSave();
  if (save && save.chapter > 0 && save.chapter < 5) {
    $("continue").textContent = `Продолжить — глава ${save.chapter + 1}`;
    $("continue").classList.remove("hidden");
    $("start").textContent = "Новая игра";
  }
  $("settings").classList.remove("hidden");
  engine.runRenderLoop(frame);
}

// ---------------- игровой цикл ----------------
let last = performance.now(), heartT = 0, playing = false, frameN = 0, hovered = null;
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frameN++;
  if (!clock.paused) clock.t += dt;
  const t = clock.t;
  if (!clock.paused) {
    player.update(dt, t);
    world.update(dt, t, player.position);
    entity.update(dt, t);
    if (playing) story.update(dt);
  }
  const f = playing ? story.fear : 0.1;
  if (audio.ctx) audio.setFear(f);
  pipe.grain.intensity = 9 + f * 26;
  if (pipe.chromaticAberrationEnabled) pipe.chromaticAberration.aberrationAmount = 5 + f * 40 + player.shake * 40;
  ip.vignetteWeight = 3 + f * 3.5;
  if (playing && f > 0.45 && audio.ctx && !clock.paused) {
    heartT -= dt;
    if (heartT <= 0) { audio.heartbeat(0.8 + f, 0.2 + f * 0.45); heartT = 1.25 - f * 0.65; }
  }
  // взаимодействие (луч раз в 3 кадра)
  if (playing && !player.frozen && !ui.noteOpen) {
    if (frameN % 3 === 0) {
      const id = lookAtId();
      hovered = id && story.handlers[id] ? id : null;
      const h = hovered && story.handlers[hovered];
      ui.prompt(h ? (isTouch ? h.label : `[E] ${h.label}`) : "");
      $("t-act").classList.toggle("ready", !!h);
    }
  } else { ui.prompt(""); hovered = null; }
  // зеркала перерисовываем, только когда игрок рядом
  for (const M of world.mirrors) {
    const near = world.mirrorsAllowed && Math.hypot(M.pos.x - player.position.x, M.pos.z - player.position.z) < 3.2;
    if (near !== M.near) { M.rt.refreshRate = near ? 3 : 0; M.rt.resetRefreshCounter(); M.near = near; }
  }
  scene.render();
}

function lookAtId() {
  const ray = new Ray(player.camera.position, player.forward(), 2.1);
  const hit = scene.pickWithRay(ray, (m) => m.isPickable && m.isEnabled() && m.isVisible && m.name !== "playerBody");
  return hit && hit.pickedMesh && hit.pickedMesh.metadata && hit.pickedMesh.metadata.id;
}

function interact() {
  if (ui.noteOpen) { ui.hideNote(); return; }
  if (hovered && story.handlers[hovered]) story.handlers[hovered].use();
}

// ---------------- мышь и клавиатура ----------------
function lockPointer() {
  if (isTouch) return;
  // обычный захват: «сырой» режим (unadjustedMovement) поддерживается не везде и молча ломал мышь
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* захват сработает по следующему клику */ }
}

window.addEventListener("keydown", (e) => {
  if (!playing) return;
  if (e.code === "KeyE") interact();
});
canvas.addEventListener("mousedown", () => {
  if (!playing || isTouch) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  interact();
});
$("note").addEventListener("pointerdown", () => ui.hideNote());

function setPaused(p) {
  if (!playing || story.dead || story.ended) return;
  clock.paused = p;
  ui.show("pause", p);
  if (audio.ctx) p ? audio.ctx.suspend() : audio.ctx.resume();
}
document.addEventListener("pointerlockchange", () => { if (!isTouch) setPaused(document.pointerLockElement !== canvas); });
$("resume").addEventListener("click", () => { if (isTouch) setPaused(false); else lockPointer(); });
$("pause-btn").addEventListener("click", () => setPaused(true));
$("retry").addEventListener("click", () => { lockPointer(); story.retry(); });
$("restart-ch").addEventListener("click", () => { setPaused(false); lockPointer(); story.runLoop(story.loop); });

// ---------------- сенсорное управление ----------------
function setupTouch() {
  ui.show("touch", true);
  player.touch = { x: 0, y: 0, run: false };
  const base = $("stick-base"), knob = $("stick-knob");
  let stickId = null, sx = 0, sy = 0, lookId = null, lx = 0, ly = 0;
  $("stick-zone").addEventListener("pointerdown", (e) => {
    stickId = e.pointerId; sx = e.clientX; sy = e.clientY;
    base.style.left = sx + "px"; base.style.top = sy + "px"; base.classList.add("on");
    e.target.setPointerCapture(e.pointerId);
  });
  $("stick-zone").addEventListener("pointermove", (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx, dy = e.clientY - sy;
    const m = Math.hypot(dx, dy), r = 50;
    if (m > r) { dx *= r / m; dy *= r / m; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.touch.x = dx / r; player.touch.y = -dy / r;
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; player.touch.x = player.touch.y = 0;
    knob.style.transform = ""; base.classList.remove("on");
  };
  $("stick-zone").addEventListener("pointerup", endStick);
  $("stick-zone").addEventListener("pointercancel", endStick);
  $("look-zone").addEventListener("pointerdown", (e) => { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; e.target.setPointerCapture(e.pointerId); });
  $("look-zone").addEventListener("pointermove", (e) => {
    if (e.pointerId !== lookId || player.frozen) return;
    player.addLook((e.clientX - lx) * 1.6, (e.clientY - ly) * 1.6);
    lx = e.clientX; ly = e.clientY;
  });
  const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
  $("look-zone").addEventListener("pointerup", endLook);
  $("look-zone").addEventListener("pointercancel", endLook);
  $("t-act").addEventListener("pointerdown", (e) => { e.preventDefault(); interact(); });
  $("t-light").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (player.hasLight) { player.toggleLight(); $("t-light").classList.toggle("on", player.lightOn); }
  });
  $("t-run").addEventListener("pointerdown", (e) => { e.preventDefault(); player.touch.run = !player.touch.run; $("t-run").classList.toggle("on", player.touch.run); });
}

// ---------------- старт ----------------
function loadSave() { try { return JSON.parse(localStorage.getItem("k14-save") || "null"); } catch (e) { return null; } }
$("start").addEventListener("click", () => {
  const s = loadSave();
  if (s && s.chapter > 0 && !confirm(`Начать заново? Сохранение (глава ${s.chapter + 1}) будет стёрто.`)) return;
  try { localStorage.removeItem("k14-save"); } catch (e) {}
  startGame(0);
});
$("continue").addEventListener("click", () => { const s = loadSave(); startGame(s ? s.chapter : 0); });

async function startGame(chapter) {
  audio.start({ master: settings.master, ambience: settings.ambience, effects: settings.effects });
  audio.ambience();
  applySettings();
  if (isTouch) {
    try { await document.documentElement.requestFullscreen(); } catch (e) {}
    try { await screen.orientation.lock("landscape"); } catch (e) {}
  } else lockPointer();
  ui.show("title", false);
  ui.show("intro", true);
  document.body.classList.add("playing");
  const skip = { skip: chapter > 0 };
  const onSkip = () => (skip.skip = true);
  window.addEventListener("keydown", onSkip, { once: true });
  $("intro").addEventListener("pointerdown", onSkip, { once: true });
  await ui.typewrite("intro-text",
    "Декабрь. Мама умерла сорок дней назад.\n\n" +
    "Я не был в этой квартире с девяносто восьмого года — с той ночи, когда пропала моя сестра Аня.\n" +
    "Мне было десять. Ей — шесть.\n\n" +
    "Нотариус сказал: заберите вещи и мамину машину.\n" +
    "Я приехал вечером, в метель. Хотел только переночевать.", 30, skip);
  await new Promise((r) => setTimeout(r, skip.skip ? 300 : 2200));
  ui.show("intro", false);
  ui.fade(1, 0.01);
  ui.hud(true);
  if (isTouch) setupTouch();
  playing = true;
  player.enabled = true;
  setTimeout(() => ui.fade(0, 3), 300);
  story.onEnding = ending;
  story.begin(chapter);
}

async function ending() {
  try { localStorage.removeItem("k14-save"); } catch (e) {}
  playing = false;
  player.enabled = false;
  ui.hud(false);
  ui.show("touch", false);
  if (document.exitPointerLock) document.exitPointerLock();
  ui.show("ending", true);
  await ui.typewrite("ending-text",
    "Я гнал до самого утра, не глядя в зеркало заднего вида.\n\n" +
    "Через неделю квартиру 14 продали.\n" +
    "Новые жильцы — молодая пара с дочкой.\n" +
    "Девочке шесть лет.", 26);
  await new Promise((r) => setTimeout(r, 3500));
  const ring = audio.phoneRing(null);
  await ui.typewrite("ending-text", "Входящий вызов:\n\nМАМА", 8);
  await new Promise((r) => setTimeout(r, 6000));
  ring.stop();
  $("ending-text").innerHTML = "";
  await ui.typewrite("ending-text", "КВАРТИРА 14\n\nспасибо, что дошёл до конца\n\nразработчик — @w_dtc", 14);
  const a = document.createElement("p");
  a.className = "credits";
  a.innerHTML = '<a href="https://t.me/w_dtc" target="_blank" rel="noopener">написать разработчику в Telegram</a>';
  $("ending-text").appendChild(a);
}

boot().catch((e) => {
  console.error(e);
  $("loading-text").textContent = "ошибка загрузки: " + e.message;
});

window.addEventListener("resize", () => engine.resize());
