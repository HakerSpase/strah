// Атмосфера поверх сцены: пыль в луче фонарика, живая вода, ореолы уличных фонарей.
import {
  Color3, Color4, DynamicTexture, Engine, FresnelParameters, MeshBuilder, ParticleSystem, StandardMaterial, Texture, Vector3,
} from "@babylonjs/core";

// объёмный конус: плотный в середине, растворяется к краям силуэта
function softEdges(m) {
  const f = new FresnelParameters();
  f.leftColor = Color3.Black(); f.rightColor = Color3.White(); f.bias = 0.05; f.power = 1.6;
  m.opacityFresnelParameters = f;
}
import { B, rnd } from "./util.js";

function gradientTex(scene, name, stops, w = 4, h = 128) {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, false);
  const ctx = t.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [k, c] of stops) g.addColorStop(k, c);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  t.update(); t.hasAlpha = true;
  t.wrapU = t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}

function dotTex(scene) {
  const t = new DynamicTexture("dot", 32, scene, false);
  const ctx = t.getContext();
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.4, "rgba(255,255,255,0.4)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); t.hasAlpha = true; t.update();
  return t;
}

// карта нормалей для струи: вертикальные волокна, которые бегут вниз
function streakBump(scene) {
  const S = 64, t = new DynamicTexture("waterBump", { width: S, height: S }, scene, true);
  const ctx = t.getContext(), img = ctx.createImageData(S, S);
  const col = Array.from({ length: S }, () => rnd(-1, 1));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const nx = col[x] * 0.6 + Math.sin((y / S) * Math.PI * 6 + col[x] * 3) * 0.4;
    img.data[i] = 128 + nx * 90; img.data[i + 1] = 128 + Math.sin(y * 0.7 + x) * 30; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); t.update();
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  return t;
}

export function setupFX(scene, world, player, low) {
  const fx = { q: low ? "low" : "medium" };
  const dot = dotTex(scene);

  // ---------- пыль: видна только в луче ----------
  const dust = new ParticleSystem("dust", low ? 120 : 380, scene);
  dust.particleTexture = dot;
  dust.emitter = player.camera.position;
  dust.minEmitBox = new Vector3(-2.5, -1.4, -2.5); dust.maxEmitBox = new Vector3(2.5, 1.2, 2.5);
  dust.minSize = 0.006; dust.maxSize = 0.016;
  dust.minLifeTime = 6; dust.maxLifeTime = 12;
  dust.emitRate = low ? 15 : 45;
  dust.direction1 = new Vector3(-0.03, -0.02, -0.03); dust.direction2 = new Vector3(0.03, 0.03, 0.03);
  dust.minEmitPower = 0.2; dust.maxEmitPower = 0.5;
  dust.gravity = new Vector3(0, -0.003, 0);
  dust.blendMode = ParticleSystem.BLENDMODE_ADD;
  dust.color1 = dust.color2 = new Color4(1, 0.95, 0.85, 0); dust.colorDead = new Color4(0, 0, 0, 0);
  dust.preWarmCycles = 80;
  const baseU = dust.updateFunction;
  const tmp = new Vector3();
  dust.updateFunction = (ps) => {
    baseU(ps);
    const lp = player.light.position, ld = player.lightDir, on = player.lightOn && player.light.intensity > 2;
    for (const p of ps) {
      let a = 0;
      if (on) {
        p.position.subtractToRef(lp, tmp);
        const d = tmp.length();
        if (d > 0.15 && d < 4.5) { const c = Vector3.Dot(tmp, ld) / d; if (c > 0.9) a = (c - 0.9) * 10 * (1 - d / 4.5) * 0.9; }
      }
      p.color.set(1, 0.95, 0.85, a);
    }
  };
  dust.start();
  fx.dust = dust;

  // ---------- вода: бегущие волокна в струе и брызги ----------
  const bump = streakBump(scene);
  for (const m of scene.materials) {
    if (m.name === "WaterStream") {
      m.bumpTexture = bump; bump.uScale = 3; bump.vScale = 1.5; m.bumpTexture.level = 0.8;
      if ("roughness" in m) { m.roughness = 0.02; m.metallic = 0; }
      m.alpha = 0.55;
    }
    if (m.name === "Water" && "roughness" in m) { m.roughness = 0.03; m.metallic = 0.1; }
  }
  const splash = (at) => {
    const ps = new ParticleSystem("splash", 90, scene);
    ps.particleTexture = dot; ps.emitter = at;
    ps.minEmitBox = new Vector3(-0.01, 0, -0.01); ps.maxEmitBox = new Vector3(0.01, 0, 0.01);
    ps.direction1 = new Vector3(-0.35, 0.6, -0.35); ps.direction2 = new Vector3(0.35, 1.0, 0.35);
    ps.minEmitPower = 0.4; ps.maxEmitPower = 0.9; ps.gravity = new Vector3(0, -9.8, 0);
    ps.minSize = 0.004; ps.maxSize = 0.012; ps.minLifeTime = 0.12; ps.maxLifeTime = 0.3; ps.emitRate = 160;
    ps.color1 = new Color4(0.8, 0.85, 0.9, 0.7); ps.color2 = new Color4(0.6, 0.65, 0.7, 0.5); ps.colorDead = new Color4(0.5, 0.5, 0.5, 0);
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    return ps;
  };
  fx.splashes = { tap: splash(B(1.96, 7.71, 0.72)), bath: splash(B(-2.39, 6.64, 0.45)) };

  // ---------- ореолы уличных фонарей в метели ----------
  fx.halos = [];
  const hm = new StandardMaterial("haloMat", scene);
  hm.disableLighting = true; hm.emissiveColor = new Color3(1, 0.55, 0.22);
  hm.opacityTexture = gradientTex(scene, "haloGrad", [[0, "rgba(255,255,255,0.0)"], [0.08, "rgba(255,255,255,1)"], [1, "rgba(255,255,255,0)"]]);
  softEdges(hm);
  hm.alphaMode = Engine.ALPHA_ADD; hm.alpha = 0.09; hm.backFaceCulling = false; hm.disableDepthWrite = true; hm.fogEnabled = false;
  for (const S of world.street || []) {
    const h = 6.8;
    const c = MeshBuilder.CreateCylinder("halo", { height: h, diameterTop: 0.5, diameterBottom: 6.5, tessellation: 20, cap: 0 }, scene);
    c.material = hm.clone("haloMat_" + fx.halos.length);
    c.position.copyFrom(S.light.position).addInPlaceFromFloats(0, -h / 2 + 0.1, 0);
    c.isPickable = false;
    fx.halos.push({ mesh: c, S });
  }

  // ---------- улица: метель вокруг игрока и позёмка у земли ----------
  const flake = dot;
  const near = new ParticleSystem("nearSnow", low ? 500 : 2200, scene);
  near.particleTexture = flake; near.emitter = new Vector3();
  near.minEmitBox = new Vector3(-14, 2, -14); near.maxEmitBox = new Vector3(14, 9, 14);
  near.direction1 = new Vector3(4.5, -2.5, -1.2); near.direction2 = new Vector3(8, -3.5, 1.2);
  near.minEmitPower = 1; near.maxEmitPower = 1.6;
  near.minLifeTime = 2.2; near.maxLifeTime = 3.6;
  near.minSize = 0.012; near.maxSize = 0.04;
  near.emitRate = low ? 220 : 900;
  near.color1 = new Color4(1, 1, 1, 0.9); near.color2 = new Color4(0.8, 0.85, 0.95, 0.7); near.colorDead = new Color4(1, 1, 1, 0);
  near.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  const drift = new ParticleSystem("drift", low ? 150 : 600, scene);
  drift.particleTexture = flake; drift.emitter = new Vector3();
  drift.minEmitBox = new Vector3(-16, 0.02, -12); drift.maxEmitBox = new Vector3(-6, 0.5, 12);
  drift.direction1 = new Vector3(6, 0.1, -1); drift.direction2 = new Vector3(10, 0.5, 1);
  drift.minEmitPower = 1; drift.maxEmitPower = 1.5;
  drift.minLifeTime = 1.5; drift.maxLifeTime = 3;
  drift.minSize = 0.008; drift.maxSize = 0.02;          // мелкая снежная пыль, которую ветер гонит по насту
  drift.emitRate = low ? 60 : 260;
  drift.color1 = new Color4(1, 1, 1, 0.35); drift.color2 = new Color4(0.85, 0.9, 1, 0.2); drift.colorDead = new Color4(1, 1, 1, 0);
  const fogIn = { d: scene.fogDensity, c: scene.fogColor.clone() };
  let outside = null;

  fx.quality = (q) => {
    fx.q = q;
    dust.emitRate = q === "low" ? 15 : 45;
  };

  fx.update = (dt, t) => {
    // улица: туман метели на всём дворе, снег и позёмка вокруг игрока (дом сам себя не туманит изнутри)
    const out = player.position.y < -3;
    if (out !== outside) {
      outside = out;
      for (const m of world.extMats || []) m.fogEnabled = out;
      scene.fogDensity = out ? 0.026 : fogIn.d;
      scene.fogColor = out ? new Color3(0.19, 0.17, 0.17) : fogIn.c;      // метель, подсвеченная натриевыми фонарями
      if (out) { near.start(); drift.start(); } else { near.stop(); drift.stop(); }
    }
    if (out) {
      const pp = player.position, storm = world.outside ? world.outside.storm : 1;
      near.emitter.copyFrom(pp); drift.emitter.copyFrom(pp);
      near.emitRate = (fx.q === "low" ? 220 : 900) * Math.min(1.4, storm * 0.6);
    }
    // вода
    bump.vOffset = (bump.vOffset + dt * 2.6) % 1;
    for (const [k, ps] of Object.entries(fx.splashes)) {
      const w = world.waterOn(k);
      if (w && !ps.isStarted()) ps.start(); else if (!w && ps.isStarted()) ps.stop();
    }
    // ореолы: следуют за яркостью фонаря и плотностью метели
    const storm = world.outside ? world.outside.storm : 1;
    for (const H of fx.halos) H.mesh.material.alpha = 0.05 * H.S.level * Math.min(1.6, 0.5 + storm * 0.5) * (0.92 + Math.random() * 0.08);
  };
  return fx;
}
