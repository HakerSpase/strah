// Процедурный звук: всё синтезируется в Web Audio, без файлов.
// Три шины (эффекты / атмосфера / голоса) → компрессор → лимитер. Каждый короткий звук сам
// отключается после затухания, поэтому звуковой поток не перегружается и не трещит.

const rnd = (a, b) => a + Math.random() * (b - a);

export class Audio {
  constructor() {
    this.ctx = null;
    this.fear = 0;
    this.vol = { master: 0.85, ambience: 0.8, effects: 0.9 };
  }

  start(vol) {
    if (this.ctx) return;
    if (vol) Object.assign(this.vol, vol);
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "playback" }));
    this.master = ctx.createGain();
    this.master.gain.value = this.vol.master;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.25;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1;
    // мягкий «потолок» по верхам: синтез и записи не режут уши (−5 дБ выше 5 кГц)
    const shelf = ctx.createBiquadFilter(); shelf.type = "highshelf"; shelf.frequency.value = 5000; shelf.gain.value = -5;
    this.master.connect(shelf).connect(comp).connect(limit).connect(ctx.destination);

    this.fx = ctx.createGain(); this.fx.gain.value = this.vol.effects; this.fx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = this.vol.ambience; this.amb.connect(this.master);

    // реверберация: квартира (тесно, мягко), подъезд (бетон, длинный хвост), улица (снег глушит, почти сухо)
    this.reverb = ctx.createGain();
    this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
    this.wet.connect(this.fx);
    this.spaces = {};
    for (const [name, sec, decay, damp, pre] of [["room", 1.1, 3.2, 0.55, 0.008], ["stair", 3.2, 2.2, 0.25, 0.03], ["street", 0.9, 4.5, 0.8, 0.0]]) {
      const c = ctx.createConvolver(); c.buffer = this._impulse(sec, decay, damp, pre);
      const g = ctx.createGain(); g.gain.value = name === "room" ? 1 : 0;
      this.reverb.connect(g).connect(c).connect(this.wet);
      this.spaces[name] = g;
    }
    this.space = "room";

    this.noiseBuf = this._noise(4, "white");
    this.brownBuf = this._noise(6, "brown");
    this.pinkBuf = this._noise(6, "pink");
    this.loadSamples();
  }

  // ---------------- записи (public/sounds) ----------------
  // Настоящие звуки (CC0 / CC BY, см. public/sounds/CREDITS.md). Пока файл не загрузился
  // или его нет — играет синтез, так что игра звучит всегда.
  async loadSamples() {
    this.samples = {};
    let man;
    try { man = await (await fetch("/sounds/manifest.json")).json(); } catch (e) { return; }
    await Promise.all(Object.entries(man).map(async ([k, files]) => {
      const bufs = await Promise.all(files.map(async (f) => {
        try { return await this.ctx.decodeAudioData(await (await fetch("/sounds/" + f)).arrayBuffer()); } catch (e) { return null; }
      }));
      const ok = bufs.filter(Boolean);
      if (ok.length) this.samples[k] = ok;
    }));
    if (this._ambStarted) this._ambienceSamples();
  }

  has(k) { return !!(this.samples && this.samples[k]); }
  _pick(k) { const l = this.samples[k]; return l[Math.floor(Math.random() * l.length)]; }

  /** Разовый звук из записи. false — записи нет, нужен синтез. */
  play(k, pos, { vol = 0.5, rate = 1, wet = 0.3, ref = 1.2, hrtf = false, when = 0, filter = null } = {}) {
    if (!this.ctx || !this.has(k)) return false;
    const buf = this._pick(k);
    const out = this._out(pos, { wet, ref, hrtf, life: buf.duration / rate + when + 1.5 }); out.gain.value = vol;
    const s = this._src(buf, false, rate * rnd(0.97, 1.03));
    (filter ? (s.connect(filter), filter.out || filter) : s).connect(out);
    s.start(this.now + when);
    return true;
  }

  /** Петля из записи: {out, src, stop(fade)}. null — записи нет. */
  loopSample(k, pos, { vol = 0.4, rate = 1, wet = 0.3, ref = 1.2, fade = 0.3, bus = "fx", filter = null } = {}) {
    if (!this.ctx || !this.has(k)) return null;
    const buf = this._pick(k);
    const out = this._out(pos, { wet, ref, life: 0, bus }); out.gain.value = 0;
    out.gain.setTargetAtTime(vol, this.now, fade / 3);
    const s = this._src(buf, true, rate);
    (filter ? (s.connect(filter), filter.out || filter) : s).connect(out);
    s.start(0, rnd(0, buf.duration * 0.8));
    return {
      out, src: s,
      stop: (f = 0.3) => { out.gain.setTargetAtTime(0, this.now, f / 3); setTimeout(() => { try { s.stop(); } catch (e) {} out.disconnect(); }, f * 1000 + 300); },
    };
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    if (!this.ctx) return;
    const node = { master: this.master, ambience: this.amb, effects: this.fx }[kind];
    if (node) node.gain.setTargetAtTime(v, this.now, 0.05);
  }

  // ---------------- низкоуровневые помощники ----------------
  /** Импульс помещения: ранние отражения + хвост, который темнеет со временем (damp — поглощение высоких). */
  _impulse(seconds, decay, damp = 0.4, pre = 0.01) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const k = Math.min(0.98, damp * 0.3 + x * damp);        // фильтр закрывается к концу хвоста
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * Math.pow(1 - x, decay) * 0.9;
      }
      // ранние отражения от стен
      for (let r = 0; r < 9; r++) {
        const at = Math.floor((pre + rnd(0.004, 0.06) * (r + 1) * 0.4) * sr);
        if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * rnd(0.2, 0.6) * Math.pow(0.8, r);
      }
    }
    return buf;
  }

  /** Сменить акустику: room | stair | street. */
  setSpace(name) {
    if (!this.spaces || this.space === name) return;
    this.space = name;
    for (const k in this.spaces) this.spaces[k].gain.setTargetAtTime(k === name ? 1 : 0, this.now, 0.4);
  }

  _noise(seconds, color) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (color === "pink") { b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; d[i] = (b0 + b1 + b2 + w * 0.1) * 0.6; }
      else d[i] = w;
    }
    return buf;
  }

  /** Выход звука. pos=null — «в голове». life — через сколько секунд всё отключить (0 = вечный).
   *  hrtf — дорогое объёмное панорамирование, только для важных звуков. */
  _out(pos, { wet = 0.35, ref = 1.2, roll = 1.4, life = 4, hrtf = false, bus = "fx" } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const nodes = [g];
    let tail = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = hrtf ? "HRTF" : "equalpower";
      p.distanceModel = "inverse";
      p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60;
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      // за стеной — глуше и тише (луч от слушателя считает игра)
      const occ = this.occluder ? this.occluder(pos) : 0;
      if (occ > 0) {
        const lp = this._filter("lowpass", 18000 - occ * 16800, 0.7);
        const og = this.ctx.createGain(); og.gain.value = 1 - occ * 0.45;
        g.connect(lp).connect(og).connect(p); nodes.push(lp, og);
      } else g.connect(p);
      tail = p; g.panner = p; nodes.push(p);
    }
    tail.connect(bus === "amb" ? this.amb : this.fx);
    if (wet > 0) {
      const s = ctx.createGain(); s.gain.value = wet;
      tail.connect(s).connect(this.reverb); nodes.push(s);
    }
    if (life > 0) setTimeout(() => nodes.forEach((n) => n.disconnect()), life * 1000);
    return g;
  }

  _src(buf, loop = false, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
    return s;
  }

  _env(param, t, a, peak, d, end = 0.0001) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(end, t + a + d);
  }

  _filter(type, f, q = 1) {
    const b = this.ctx.createBiquadFilter();
    b.type = type; b.frequency.value = f; b.Q.value = q;
    return b;
  }

  _burst(out, t, { f = 1000, q = 1, peak = 0.5, a = 0.002, d = 0.1, buf = null, type = "bandpass", rate = 1 }) {
    const n = this._src(buf || this.noiseBuf, false, rate);
    const fl = this._filter(type, f, q);
    const g = this.ctx.createGain(); this._env(g.gain, t, a, peak, d);
    n.connect(fl).connect(g).connect(out); n.start(t, rnd(0, 3)); n.stop(t + a + d + 0.05);
  }

  _tone(out, t, { f = 200, f2 = null, type = "sine", peak = 0.3, a = 0.003, d = 0.15 }) {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = this.ctx.createGain(); this._env(g.gain, t, a, peak, d);
    o.connect(g).connect(out); o.start(t); o.stop(t + a + d + 0.05);
  }

  get now() { return this.ctx.currentTime; }

  updateListener(pos, fwd, up) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.now;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.03); l.positionY.setTargetAtTime(pos.y, t, 0.03); l.positionZ.setTargetAtTime(pos.z, t, 0.03);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.03); l.forwardY.setTargetAtTime(fwd.y, t, 0.03); l.forwardZ.setTargetAtTime(fwd.z, t, 0.03);
      l.upX.value = up.x; l.upY.value = up.y; l.upZ.value = up.z;
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // ---------------- фоновые петли ----------------
  ambience() {
    const ctx = this.ctx;
    const loop = (buf, filt, gain, bus = this.amb) => {
      const s = this._src(buf, true); const g = ctx.createGain(); g.gain.value = gain;
      s.connect(filt).connect(g).connect(bus); s.start(0, rnd(0, 3)); return g;
    };
    // тишина квартиры
    loop(this.brownBuf, this._filter("lowpass", 160), 0.12);
    // гул ламп 50 Гц — один на всю квартиру, громкость задаёт мир по ближайшим лампам
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0; this.humGain.connect(this.amb);
    for (const [f, a] of [[50, 0.5], [100, 0.4], [150, 0.18], [250, 0.08]]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a * 0.02; o.connect(g).connect(this.humGain); o.start();
    }
    // метель: два слоя ветра с завыванием и порывами
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.25; this.windGain.connect(this.amb);
    const w1 = this._filter("bandpass", 380, 1.2), w2 = this._filter("bandpass", 900, 9);
    this.synthWind = [loop(this.pinkBuf, w1, 0.6, this.windGain), loop(this.noiseBuf, w2, 0.02, this.windGain)];
    for (const [flt, base, depth, rate] of [[w1, 380, 200, 0.06], [w2, 900, 450, 0.09]]) {
      const l = ctx.createOscillator(); l.frequency.value = rate; const lg = ctx.createGain(); lg.gain.value = depth;
      l.connect(lg).connect(flt.frequency); l.start();
    }
    const gust = ctx.createOscillator(); gust.frequency.value = 0.13; const gg = ctx.createGain(); gg.gain.value = 0.12;
    gust.connect(gg).connect(this.windGain.gain); gust.start();
    // фон ужаса: диссонанс 55 / 58.3 / 82.4 Гц, громкость = страх
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const dlp = this._filter("lowpass", 280, 0.5);
    for (const f of [55, 58.27, 82.41]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = rnd(-8, 8);
      const og = ctx.createGain(); og.gain.value = 0.05; o.connect(og).connect(dlp); o.start();
    }
    dlp.connect(this.droneGain); this.droneGain.connect(this.amb);
    this.synthDrone = dlp;
    this._houseTimer = setInterval(() => this._houseSound(), 13000);
    this._music();
    this._ambStarted = true;
    if (this.samples && Object.keys(this.samples).length) this._ambienceSamples();
  }

  // записи вместо синтетических ветра и гула, как только они загрузились
  _ambienceSamples() {
    if (this._ambSamplesOn) return;
    this._ambSamplesOn = true;
    const t = this.now;
    const amb = (k, bus, vol) => {
      if (!this.has(k)) return null;
      const s = this._src(this._pick(k), true); const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(vol, t, 2); s.connect(g).connect(bus); s.start(0, rnd(0, 10)); return g;
    };
    if (amb("wind", this.windGain, 0.9)) for (const g of this.synthWind) g.gain.setTargetAtTime(0, t, 2);
    if (amb("drone", this.droneGain, 1.6)) this.synthDrone.disconnect();
    amb("roomtone", this.amb, 0.35);
  }

  // Партитура: низкий органный пад, «стеклянные» обертоны и редкие колокола; громче и диссонантнее от страха
  _music() {
    const ctx = this.ctx;
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 0.0; this.musicGain.connect(this.amb);
    const lp = this._filter("lowpass", 900, 0.4);
    const send = ctx.createGain(); send.gain.value = 0.6; lp.connect(send).connect(this.reverb);
    lp.connect(this.musicGain);
    this.musicLP = lp;
    const chord = [36.71, 43.65, 55.0, 73.42, 87.31];          // D1 F1 A1 D2 F2 — минор, очень низко
    this.padOsc = chord.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? "sawtooth" : "triangle"; o.frequency.value = f; o.detune.value = rnd(-6, 6);
      const g = ctx.createGain(); g.gain.value = 0.06 / (1 + i * 0.3);
      const l = ctx.createOscillator(); l.frequency.value = rnd(0.03, 0.09); const lg = ctx.createGain(); lg.gain.value = g.gain.value * 0.6;
      l.connect(lg).connect(g.gain); l.start();
      o.connect(g).connect(lp); o.start(); return o;
    });
    // диссонанс — малая секунда, вступает со страхом
    const dis = ctx.createOscillator(); dis.type = "sawtooth"; dis.frequency.value = 77.78;
    this.disGain = ctx.createGain(); this.disGain.gain.value = 0;
    dis.connect(this.disGain).connect(lp); dis.start();
    // редкие ноты высоко — как будто кто-то трогает расстроенное пианино в соседней квартире
    const bellNotes = [587.3, 698.5, 880, 932.3, 1174.7, 622.3];
    this._bellT = setInterval(() => {
      if (!this.ctx || Math.random() < 0.45 || this.quiet) return;
      const t = this.now, f = bellNotes[Math.floor(Math.random() * bellNotes.length)] * (this.fear > 0.6 && Math.random() < 0.5 ? 0.944 : 1);
      const out = this._out(null, { wet: 0.9, life: 7, bus: "amb" }); out.gain.value = 0.05 + this.fear * 0.05;
      for (const [r, a, d] of [[1, 1, 4], [2.01, 0.3, 2], [3.98, 0.12, 1], [0.5, 0.25, 5]]) this._tone(out, t, { f: f * r, peak: a * 0.2, a: 0.004, d });
    }, 9000);
  }

  _houseSound() {
    if (!this.ctx || Math.random() < 0.55 || this.quiet) return;
    const pos = this.housePos ? this.housePos() : null;
    const r = Math.random();
    if (r < 0.35) this.pipes(pos);
    else if (r < 0.6) this.thump(pos, rnd(0.12, 0.25));
    else if (r < 0.75) this.creak(pos, rnd(0.4, 0.9), 0.1);
    else this.windowRattle(pos);
  }

  setFear(f) {
    this.fear = Math.max(0, Math.min(1, f));
    const t = this.now;
    if (this.droneGain) this.droneGain.gain.setTargetAtTime(this.fear * 0.3, t, 1.0);
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0.35 + this.fear * 0.65, t, 2.0);
      this.disGain.gain.setTargetAtTime(Math.max(0, this.fear - 0.45) * 0.09, t, 1.5);
      this.musicLP.frequency.setTargetAtTime(500 + this.fear * 1400, t, 1.5);
    }
  }
  setHum(v) { if (this.humGain) this.humGain.gain.setTargetAtTime(Math.min(1, v), this.now, 0.1); }
  setWind(v) { if (this.windGain) this.windGain.gain.setTargetAtTime(v, this.now, 0.5); }

  // ---------------- шаги и предметы ----------------
  footstep(pos, surface = "wood", run = false) {
    const sk = surface === "snow" ? "step_snow" : surface === "concrete" ? "step_stairs" : "step_wood";
    if (this.play(sk, pos, { vol: (run ? 0.5 : 0.32) * (surface === "carpet" ? 0.55 : 1), wet: 0.15, rate: rnd(0.9, 1.1) })) return;
    const t = this.now, out = this._out(pos, { wet: 0.2, life: 1 });
    out.gain.value = run ? 0.7 : 0.45;
    if (surface === "snow") {
      // хруст: десятки мелких «ломающихся» зёрен за 150 мс
      for (let i = 0; i < 14; i++) this._burst(out, t + i * rnd(0.006, 0.013), { f: rnd(1200, 4200), q: 2, peak: rnd(0.08, 0.22), a: 0.001, d: 0.02 });
      this._burst(out, t, { f: 260, q: 0.8, peak: 0.32, d: 0.16, buf: this.brownBuf });
      return;
    }
    const f = { wood: 650, lino: 1100, tile: 2200, carpet: 350, concrete: 900 }[surface] || 650;
    const soft = surface === "carpet" ? 0.35 : 1;
    this._tone(out, t, { f: 95, f2: 45, peak: 0.3 * soft, d: 0.08 });                                   // каблук
    this._burst(out, t, { f: f * rnd(0.85, 1.15), q: surface === "tile" ? 2.5 : 1.2, peak: 0.22 * soft, a: 0.004, d: 0.07 });
    this._burst(out, t + rnd(0.06, 0.09), { f: f * 1.6 * rnd(0.9, 1.1), q: 1.5, peak: 0.12 * soft, a: 0.003, d: 0.05 }); // носок
    if (surface === "concrete") this._burst(out, t + 0.01, { f: 3500, q: 2, peak: 0.06, d: 0.12 });       // песок на ступенях
    if (surface === "wood" && Math.random() < 0.035) this.creak(pos, rnd(0.25, 0.5), 0.12);
  }

  creak(pos, dur = 0.8, vol = 0.4, pitch = 1) {
    if (this.play("creak", pos, { vol: vol * 1.3, rate: Math.min(1.4, pitch) * rnd(0.9, 1.1), wet: 0.4 })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.35, life: dur + 2 }); out.gain.value = vol;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    const base = rnd(140, 260) * pitch;
    o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * rnd(0.6, 1.5), t + dur);
    const am = ctx.createGain(); am.gain.value = 0;
    const steps = Math.floor(dur * rnd(25, 40));
    for (let i = 0; i < steps; i++) {
      const tt = t + (i / steps) * dur;
      am.gain.setValueAtTime(rnd(0.15, 0.6), tt);
      am.gain.setValueAtTime(0.02, tt + (dur / steps) * 0.5);
    }
    am.gain.setValueAtTime(0, t + dur);
    const b1 = this._filter("bandpass", 900 * pitch, 4), b2 = this._filter("bandpass", 1900 * pitch, 5);
    const mix = ctx.createGain(); mix.gain.value = 0.35;
    o.connect(am); am.connect(b1).connect(mix); am.connect(b2).connect(mix);
    mix.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  latch(pos, vol = 0.5) {
    if (this.play("latch", pos, { vol: vol * 0.9, wet: 0.2 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.2, life: 1 }); out.gain.value = vol;
    this._burst(out, t, { f: 3200, q: 4, peak: 0.5, d: 0.02 });
    this._burst(out, t + 0.05, { f: 2400, q: 5, peak: 0.35, d: 0.03 });
  }

  // разные двери звучат по-разному
  door(pos, kind = "wood", open = true, speed = 1) {
    if (kind !== "fridge" && kind !== "oven" && this.play(open ? "door_open" : "door_close", pos, { vol: kind === "small" ? 0.35 : 0.6, rate: (kind === "small" ? 1.25 : 1) * Math.min(1.2, Math.max(0.75, speed)), wet: 0.4 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.4, life: 3 }); out.gain.value = 0.6;
    if (open) {
      this.latch(pos, 0.4);
      if (kind === "metal") { this._tone(out, t + 0.05, { f: 140, f2: 120, type: "triangle", peak: 0.15, d: 0.5 }); this.creak(pos, 0.8, 0.25, 1.6); }
      else if (kind === "fridge") { this._burst(out, t, { f: 300, q: 0.7, peak: 0.4, d: 0.12, buf: this.brownBuf }); this._burst(out, t + 0.05, { f: 1800, q: 1, peak: 0.12, d: 0.25 }); }
      else if (kind === "small") { this.creak(pos, 0.35, 0.2, 1.8); }
      else if (kind === "oven") { this.creak(pos, 0.45, 0.25, 2.6); this._tone(out, t + 0.45, { f: 520, type: "triangle", peak: 0.15, d: 0.3 }); }
      else if (Math.random() < 0.3 || speed < 1) this.creak(pos, rnd(0.5, 1.1) / Math.max(0.5, speed), 0.22, rnd(0.7, 1.0));
      else this._burst(out, t, { f: 420, q: 0.7, peak: 0.12, d: 0.2, buf: this.brownBuf });
    } else {
      if (kind === "fridge") { this._burst(out, t, { f: 180, q: 0.8, peak: 0.6, d: 0.1, buf: this.brownBuf }); return; }
      if (kind === "oven") { this._tone(out, t, { f: 300, f2: 200, type: "triangle", peak: 0.3, d: 0.2 }); this._burst(out, t, { f: 2500, q: 3, peak: 0.3, d: 0.08 }); return; }
      this._burst(out, t, { f: 500, q: 0.8, peak: 0.35, d: 0.12, buf: this.brownBuf });
      this._tone(out, t, { f: kind === "small" ? 160 : 90, f2: 50, peak: 0.35, d: 0.12 });
      this.latch(pos, 0.35);
    }
  }

  doorSlam(pos) {
    if (this.play("door_slam", pos, { vol: 0.75, wet: 0.6 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.7, life: 3 }); out.gain.value = 0.9;
    this._burst(out, t, { f: 900, type: "lowpass", peak: 0.9, d: 0.35, buf: this.brownBuf });
    this._tone(out, t, { f: 70, f2: 30, peak: 0.7, d: 0.4 });
    this._burst(out, t + 0.01, { f: 4200, q: 5, peak: 0.25, d: 0.12 });
  }

  click(pos, vol = 0.4) {
    const t = this.now, out = this._out(pos, { wet: 0.15, life: 1 }); out.gain.value = vol;
    this._burst(out, t, { f: 1700, q: 2, peak: 0.4, a: 0.002, d: 0.025 });
  }

  // советский выключатель: сухой пластиковый щелчок
  switchClick(pos) {
    if (this.play("switch", pos, { vol: 0.45, wet: 0.25 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.25, life: 1 }); out.gain.value = 0.55;
    this._burst(out, t, { f: 3800, q: 2, peak: 0.6, a: 0.001, d: 0.015 });
    this._tone(out, t, { f: 900, f2: 600, type: "triangle", peak: 0.12, d: 0.03 });
  }

  knock(pos, count = 3, gap = 0.32) {
    if (this.play("knock", pos, { vol: 0.7, wet: 0.45, hrtf: true })) return;
    for (let i = 0; i < count; i++) setTimeout(() => this.ctx && this.thump(pos, 0.7, 180), i * gap * 1000);
  }

  thump(pos, vol = 0.5, f = 110) {
    const t = this.now, out = this._out(pos, { wet: 0.45, life: 2 }); out.gain.value = vol;
    this._tone(out, t, { f, f2: f * 0.5, peak: 0.7, d: 0.13 });
    this._burst(out, t, { f: f * 2.2, q: 2, peak: 0.4, d: 0.06 });
  }

  windowRattle(pos) {
    const t = this.now, out = this._out(pos, { wet: 0.4, life: 3 }); out.gain.value = 0.15;
    for (let i = 0; i < 8; i++) this._burst(out, t + i * rnd(0.04, 0.09), { f: rnd(1800, 3000), q: 6, peak: 0.4, d: 0.03 });
  }

  pipes(pos) {
    if (this.play("pipes", pos, { vol: 0.25, wet: 0.6 })) return;
    const ctx = this.ctx, t = this.now, d = rnd(1.5, 3);
    const out = this._out(pos, { wet: 0.6, life: d + 2 }); out.gain.value = 0.12;
    const n = this._src(this.brownBuf); const bp = this._filter("bandpass", 300, 9);
    bp.frequency.setValueAtTime(rnd(150, 300), t); bp.frequency.linearRampToValueAtTime(rnd(400, 900), t + d);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.3); g.gain.linearRampToValueAtTime(0, t + d);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + d);
  }

  drip(pos) {
    if (this.play("drip", pos, { vol: 0.35, wet: 0.6, ref: 0.6, rate: rnd(0.85, 1.15) })) return;
    const t = this.now, out = this._out(pos, { wet: 0.6, ref: 0.6, life: 1.5 }); out.gain.value = 0.25;
    this._tone(out, t, { f: rnd(1100, 1500), f2: 380, peak: 0.4, a: 0.001, d: 0.06 });
  }

  // ---------------- вода, газ, холодильник ----------------
  /** Струя воды. kind: tap — в мойку, bath — в ванну (ниже и гулче). Возвращает {stop}. */
  water(pos, kind = "tap") {
    const ws = this.loopSample(kind === "bath" ? "water_bath" : "water_tap", pos, { vol: kind === "bath" ? 0.6 : 0.45, ref: 0.8, wet: 0.3 });
    if (ws) return { stop: () => { ws.stop(0.4); for (let i = 0; i < 4; i++) setTimeout(() => this.ctx && this.drip(pos), 300 + i * rnd(250, 600)); } };
    const ctx = this.ctx;
    const out = this._out(pos, { wet: 0.3, life: 0, ref: 0.8 }); out.gain.value = 0;
    out.gain.setTargetAtTime(kind === "bath" ? 0.6 : 0.45, this.now, 0.08);
    // шипение струи
    const n = this._src(this.noiseBuf, true);
    const hp = this._filter("bandpass", kind === "bath" ? 1400 : 2600, 0.6);
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    n.connect(hp).connect(ng).connect(out); n.start(0, rnd(0, 3));
    // бульканье: модулированный по амплитуде розовый шум через резонанс
    const b = this._src(this.pinkBuf, true);
    const bp = this._filter("bandpass", kind === "bath" ? 420 : 700, 5);
    const bg = ctx.createGain(); bg.gain.value = 0.3;
    const lfo = ctx.createOscillator(); lfo.type = "triangle"; lfo.frequency.value = rnd(7, 12);
    const lg = ctx.createGain(); lg.gain.value = 0.25; lfo.connect(lg).connect(bg.gain); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.4; const l2 = ctx.createGain(); l2.gain.value = 150;
    lfo2.connect(l2).connect(bp.frequency); lfo2.start();
    b.connect(bp).connect(bg).connect(out); b.start(0, rnd(0, 3));
    // пузырьки
    const bub = setInterval(() => { if (Math.random() < 0.7) this._tone(out, this.now, { f: rnd(500, 1400), f2: rnd(1500, 2600), peak: 0.06, a: 0.002, d: 0.03 }); }, 60);
    return {
      stop: () => {
        clearInterval(bub);
        out.gain.setTargetAtTime(0, this.now, 0.12);
        setTimeout(() => { n.stop(); b.stop(); lfo.stop(); lfo2.stop(); out.disconnect(); }, 900);
        // последние капли
        for (let i = 0; i < 4; i++) setTimeout(() => this.ctx && this.drip(pos), 300 + i * rnd(250, 600));
      },
    };
  }

  flush(pos) {
    if (this.play("flush", pos, { vol: 0.6, wet: 0.5 })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.5, life: 9 }); out.gain.value = 0.7;
    this.latch(pos, 0.5);
    this._tone(out, t, { f: 300, type: "triangle", peak: 0.1, d: 0.3 });
    const n = this._src(this.pinkBuf); const bp = this._filter("bandpass", 600, 0.8);
    bp.frequency.setValueAtTime(1800, t + 0.2); bp.frequency.exponentialRampToValueAtTime(250, t + 3.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + 3.8);
    // бачок наполняется
    const r = this._src(this.noiseBuf); const hp = this._filter("bandpass", 3200, 2);
    const rg = ctx.createGain(); rg.gain.setValueAtTime(0.0001, t + 3); rg.gain.exponentialRampToValueAtTime(0.25, t + 3.5); rg.gain.exponentialRampToValueAtTime(0.0001, t + 8);
    r.connect(hp).connect(rg).connect(out); r.start(t + 3); r.stop(t + 8.2);
  }

  gas(pos) {
    const ctx = this.ctx;
    const gs = this.loopSample("gas", pos, { vol: 0.3, ref: 0.8, wet: 0.15 });
    if (gs) { this.play("gas_ignite", pos, { vol: 0.5, wet: 0.15 }); return { stop: () => gs.stop(0.3) }; }
    const out = this._out(pos, { wet: 0.15, life: 0, ref: 0.8 }); out.gain.value = 0;
    // поджиг: тик-тик-тик — пф
    const t = this.now;
    for (let i = 0; i < 4; i++) this._burst(out, t + i * 0.12, { f: 4500, q: 3, peak: 0.8, a: 0.001, d: 0.012 });
    this._burst(out, t + 0.5, { f: 400, q: 0.6, peak: 0.9, d: 0.25, buf: this.brownBuf });
    out.gain.setValueAtTime(0.5, t);
    const n = this._src(this.noiseBuf, true); const hp = this._filter("highpass", 2500);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.12, t + 0.6);
    n.connect(hp).connect(ng).connect(out); n.start(t, rnd(0, 3));
    const roar = this._src(this.brownBuf, true); const lp = this._filter("lowpass", 300);
    const rg = ctx.createGain(); rg.gain.setValueAtTime(0, t); rg.gain.linearRampToValueAtTime(0.3, t + 0.7);
    roar.connect(lp).connect(rg).connect(out); roar.start(t, rnd(0, 3));
    return { stop: () => { out.gain.setTargetAtTime(0, this.now, 0.08); setTimeout(() => { n.stop(); roar.stop(); out.disconnect(); }, 600); } };
  }

  fridgeHum(pos) {
    const fs = this.loopSample("fridge", pos, { vol: 0.35, ref: 0.8, wet: 0.1 });
    if (fs) return { stop: () => fs.stop(0.6) };
    const ctx = this.ctx;
    const out = this._out(pos, { wet: 0.1, life: 0, ref: 0.8 }); out.gain.value = 0;
    out.gain.setTargetAtTime(0.35, this.now, 0.3);
    for (const [f, a] of [[50, 0.5], [100, 0.5], [150, 0.25]]) {
      const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = a * 0.08; o.connect(g).connect(out); o.start();
      out.osc = (out.osc || []).concat(o);
    }
    return { stop: () => { out.gain.setTargetAtTime(0, this.now, 0.2); setTimeout(() => { out.osc.forEach((o) => o.stop()); out.disconnect(); }, 800); } };
  }

  // шорох бумаги (записки)
  paper(vol = 0.4) {
    if (this.play("paper", null, { vol, wet: 0.05 })) return;
    this.creak(null, 0.15, vol * 0.25, 3);
  }

  squeak(pos) {
    if (this.play("squeak", pos, { vol: 0.35, wet: 0.2 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.2, life: 1.5 }); out.gain.value = 0.35;
    this._tone(out, t, { f: 900, f2: 1400, type: "triangle", peak: 0.3, a: 0.02, d: 0.25 });
  }

  // ---------------- тело и голоса ----------------
  heartbeat(rate = 1, vol = 0.6) {
    const t = this.now;
    for (const [dt, a] of [[0, 1], [0.28 / rate, 0.7]]) {
      const out = this._out(null, { wet: 0.03, life: 1.5 }); out.gain.value = vol * a;
      this._tone(out, t + dt, { f: 62, f2: 34, peak: 0.8, a: 0.01, d: 0.16 });
    }
  }

  breath(vol = 0.2, exhale = false, dur = 0.7) {
    if (this.play("breath", null, { vol: vol * 1.5, wet: 0.03, rate: rnd(0.95, 1.05) })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(null, { wet: 0.03, life: dur + 1 }); out.gain.value = vol;
    const n = this._src(this.pinkBuf);
    const bp = this._filter("bandpass", exhale ? 900 : 1500, 0.8);
    bp.frequency.setValueAtTime(exhale ? 1100 : 1200, t); bp.frequency.linearRampToValueAtTime(exhale ? 700 : 1900, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(out); n.start(t, rnd(0, 4)); n.stop(t + dur + 0.05);
  }

  whisper(pos, dur = 2.2, vol = 0.45) {
    if (this.play("whisper", pos, { vol: vol * 1.3, wet: 0.45, ref: 0.5, hrtf: true })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.45, ref: 0.5, life: dur + 2, hrtf: true }); out.gain.value = vol;
    const n = this._src(this.noiseBuf);
    const vowels = [[700, 1200, 2600], [400, 2000, 2550], [300, 870, 2240], [500, 1700, 2500], [600, 1000, 2400]];
    const mix = ctx.createGain(); mix.gain.value = 0;
    const filters = [0, 1, 2].map((i) => { const f = this._filter("bandpass", 1000, 12 - i * 3); n.connect(f).connect(mix); return f; });
    const sy = Math.floor(dur * 5);
    for (let i = 0; i < sy; i++) {
      const tt = t + (i / sy) * dur, v = vowels[Math.floor(Math.random() * vowels.length)];
      filters.forEach((f, k) => f.frequency.setTargetAtTime(v[k] * rnd(0.9, 1.1), tt, 0.02));
      mix.gain.setTargetAtTime(rnd(0.4, 1.0), tt, 0.015);
      mix.gain.setTargetAtTime(0.05, tt + (dur / sy) * 0.6, 0.02);
    }
    mix.gain.setTargetAtTime(0, t + dur, 0.05);
    mix.connect(this._filter("highpass", 500)).connect(out);
    n.start(t, rnd(0, 3)); n.stop(t + dur + 0.3);
  }

  // советский телефонный звонок (механический звонок)
  phoneRing(pos) {
    const rs = this.loopSample("phone_ring", pos, { vol: 0.35, ref: 1.5, wet: 0.4, fade: 0.05 });
    if (rs) return { stop: () => rs.stop(0.05) };
    const ctx = this.ctx;
    const out = this._out(pos, { wet: 0.4, ref: 1.5, life: 0 }); out.gain.value = 0.4;
    let alive = true;
    const ringOnce = () => {
      if (!alive || !this.ctx) return;
      const t0 = this.now;
      for (let k = 0; k < 26; k++) {
        const t = t0 + k * 0.04;
        for (const [ratio, amp, dec] of [[1, 1, 0.2], [2.76, 0.4, 0.12], [5.4, 0.2, 0.06]]) {
          this._tone(out, t, { f: (k % 2 ? 940 : 1020) * ratio, peak: amp * 0.12, a: 0.001, d: dec });
        }
      }
    };
    ringOnce();
    const id = setInterval(ringOnce, 4000);
    return { stop: () => { alive = false; clearInterval(id); setTimeout(() => out.disconnect(), 1500); } };
  }

  dialTone() {
    const ctx = this.ctx, t = this.now;
    const out = this._out(null, { wet: 0.03, life: 5 }); out.gain.value = 0;
    const o = ctx.createOscillator(); o.frequency.value = 425; o.connect(out);
    for (let i = 0; i < 6; i++) { out.gain.setValueAtTime(0.06, t + i * 0.7); out.gain.setValueAtTime(0, t + i * 0.7 + 0.35); }
    o.start(t); o.stop(t + 4.2);
  }

  // колыбельная музыкальной шкатулки
  musicBox(pos, { slow = 1, detune = 0, vol = 0.35, loop = false, filter = null, ref = 0.8 } = {}) {
    // запись шкатулки: замедленная и чуть расстроенная — «заводится» сама
    if (this.has("musicbox")) {
      const ms = this.loopSample("musicbox", pos, { vol: vol * 1.2, ref, wet: 0.5, rate: 1 / Math.sqrt(slow), filter, fade: 0.6 });
      if (detune) {
        const l = this.ctx.createOscillator(); l.frequency.value = 0.23; const lg = this.ctx.createGain(); lg.gain.value = detune;
        l.connect(lg).connect(ms.src.detune); l.start();
        return { stop: () => { ms.stop(0.6); setTimeout(() => l.stop(), 1500); } };
      }
      return { stop: () => ms.stop(0.6) };
    }
    const out = this._out(pos, { wet: 0.5, ref, life: 0 }); out.gain.value = vol;
    const notes = [76, 79, 83, 81, 79, 76, 74, 76, 0, 72, 76, 79, 77, 76, 74, 71, 0, 76, 79, 83, 84, 83, 79, 81, 79, 76, 0, 74, 72, 71, 72, 76];
    let alive = true;
    const play = () => {
      if (!alive || !this.ctx) return;
      const t0 = this.now + 0.05;
      notes.forEach((m, i) => {
        if (!m) return;
        const t = t0 + i * 0.32 * slow * (1 + i * 0.004 * slow);
        const f = 440 * Math.pow(2, (m - 69) / 12) * Math.pow(2, (detune * rnd(-1, 1)) / 1200);
        for (const [r, a, d] of [[1, 1, 1.2], [4.02, 0.05, 0.12], [2.0, 0.15, 0.5]]) this._tone(out, t, { f: f * r, peak: a * 0.18, a: 0.002, d });
      });
      if (loop) setTimeout(play, notes.length * 320 * slow + 1800);
    };
    play();
    return { stop: () => { alive = false; out.gain.setTargetAtTime(0, this.now, 0.2); setTimeout(() => out.disconnect(), 3000); } };
  }

  // старый приёмник: тихое шипение эфира + колыбельная «через динамик» (узкая полоса 350–3000 Гц).
  // Включается плавно, без резкой стены шума.
  radio(pos) {
    const ctx = this.ctx;
    const radioEQ = () => { const hp = this._filter("highpass", 350, 0.7); const lp = this._filter("lowpass", 3000, 0.7); hp.connect(lp); hp.out = lp; return hp; };
    let hiss;
    const ls = this.loopSample("radio_static", pos, { vol: 0.12, ref: 3, wet: 0.25, fade: 1.2, filter: this._filter("lowpass", 3500) });
    if (ls) hiss = ls;
    else {
      const out = this._out(pos, { wet: 0.3, ref: 1, life: 0 }); out.gain.value = 0;
      out.gain.setTargetAtTime(0.25, this.now, 0.4);
      const n = this._src(this.pinkBuf, true);
      const ng = ctx.createGain(); ng.gain.value = 0.06;
      n.connect(this._filter("bandpass", 1400, 0.5)).connect(ng).connect(out); n.start();
      hiss = { stop: () => { out.gain.setTargetAtTime(0, this.now, 0.05); setTimeout(() => { n.stop(); out.disconnect(); }, 400); } };
    }
    // музыка идёт через «динамик»
    const mb = this.musicBox(pos, { slow: 1.35, detune: 30, vol: 0.6, loop: true, filter: radioEQ(), ref: 3 });
    return { stop: () => { hiss.stop(0.1); mb.stop(); } };
  }

  tvStatic(pos) {
    const ts = this.loopSample("tv_static", pos, { vol: 0.12, ref: 1, wet: 0.25, filter: this._filter("lowpass", 4500) });
    if (ts) return { stop: () => ts.stop(0.15) };
    const ctx = this.ctx;
    const out = this._out(pos, { wet: 0.25, ref: 1, life: 0 }); out.gain.value = 0.15;
    const n = this._src(this.noiseBuf, true); n.connect(this._filter("highpass", 900)).connect(out); n.start();
    return { stop: () => { out.gain.setTargetAtTime(0, this.now, 0.05); setTimeout(() => { n.stop(); out.disconnect(); }, 300); } };
  }

  bulbPop(pos) {
    if (this.play("bulb_pop", pos, { vol: 0.45, wet: 0.45 })) return;
    const t = this.now, out = this._out(pos, { wet: 0.45, life: 2 }); out.gain.value = 0.55;
    this._burst(out, t, { f: 2000, type: "highpass", peak: 0.9, d: 0.08 });
    for (let i = 0; i < 6; i++) this._tone(out, t + 0.05 + Math.random() * 0.5, { f: rnd(3500, 7500), peak: 0.1, a: 0.001, d: 0.05 });
  }

  // ---------------- машина ----------------
  starter(pos, ok = false) {
    if (this.play(ok ? "car_start" : "car_start_fail", pos, { vol: 0.6, wet: 0.2 })) return;
    const ctx = this.ctx, t = this.now, d = ok ? 1.2 : 1.8;
    const out = this._out(pos, { wet: 0.2, life: d + 1 }); out.gain.value = 0.55;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 38;
    const am = ctx.createGain(); am.gain.value = 0.3;
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.setValueAtTime(5, t); lfo.frequency.linearRampToValueAtTime(ok ? 9 : 3.5, t + d);
    const lg = ctx.createGain(); lg.gain.value = 0.3; lfo.connect(lg).connect(am.gain);
    o.connect(this._filter("lowpass", 500)).connect(am).connect(out);
    o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
    this._burst(out, t, { f: 1800, q: 1, peak: 0.15, d: d, rate: 0.5 });
  }

  engine(pos) {
    const ctx = this.ctx;
    const es = this.loopSample("engine", pos, { vol: 0.5, wet: 0.15, fade: 0.8 });
    if (es) return { rev: (k) => es.src.playbackRate.setTargetAtTime(Math.min(2, 0.8 + k * 0.35), this.now, 0.4), stop: () => es.stop(1.5) };
    const out = this._out(pos, { wet: 0.15, life: 0 }); out.gain.value = 0.0;
    out.gain.setTargetAtTime(0.4, this.now, 0.3);
    const oscs = [];
    for (const [r, a] of [[1, 0.5], [2, 0.3], [3, 0.15]]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 32 * r;
      const g = ctx.createGain(); g.gain.value = a * 0.25; o.connect(g).connect(out); o.start(); oscs.push(o);
    }
    const lp = this._filter("lowpass", 400);
    out.disconnect(); out.connect(lp).connect(this.fx);
    return {
      rev: (k) => oscs.forEach((o, i) => o.frequency.setTargetAtTime(32 * (i + 1) * k, this.now, 0.4)),
      stop: () => { out.gain.setTargetAtTime(0, this.now, 0.5); setTimeout(() => oscs.forEach((o) => o.stop()), 3000); },
    };
  }

  // ---------------- озвучка (ElevenLabs, файлы в /voice) ----------------
  async loadVoices(base = "/voice/") {
    try { this.voiceIdx = await (await fetch(base + "index.json")).json(); this.voiceBase = base; } catch (e) { this.voiceIdx = {}; }
    this.voiceBufs = {};
  }

  /** Сказать реплику по тексту субтитра. Герой — сухо и близко; Аня и «мама» — с обработкой: чужие, неправильные. */
  async speak(key) {
    const v = this.voiceIdx && this.voiceIdx[key];
    if (!v || !this.ctx) return;
    let buf = this.voiceBufs[v.f];
    if (!buf) {
      try { buf = this.voiceBufs[v.f] = await this.ctx.decodeAudioData(await (await fetch(this.voiceBase + v.f)).arrayBuffer()); } catch (e) { return; }
    }
    const ctx = this.ctx, t = this.now;
    if (v.v === "hero" && this.heroSrc) { try { this.heroSrc.stop(); } catch (e) {} }
    const dur = buf.duration;
    if (v.v === "hero") {
      const out = this._out(null, { wet: 0.12, life: dur + 2 }); out.gain.value = 1.1;
      const s = this._src(buf); s.connect(out); s.start(t); this.heroSrc = s;
    } else if (v.v === "child") {
      // детский голос из ниоткуда: тоньше, с эхом квартиры, будто через стену
      const out = this._out(null, { wet: 0.75, life: dur * 1.2 + 3, bus: "fx" }); out.gain.value = 1.0;
      const s = this._src(buf, false, 1.06);
      s.connect(this._filter("highpass", 260)).connect(this._filter("peaking", 2600, 1)).connect(out); s.start(t);
    } else {
      // «мама»: ниже, раздвоено (второй голос чуть отстаёт и ещё ниже), шёпот под ним
      const out = this._out(null, { wet: 0.6, life: dur * 1.3 + 3, hrtf: false }); out.gain.value = 1.2;
      const a = this._src(buf, false, 0.86), b = this._src(buf, false, 0.81);
      const gb = ctx.createGain(); gb.gain.value = 0.45;
      const lp = this._filter("lowpass", 3800, 0.7);
      a.connect(lp); b.connect(gb).connect(lp); lp.connect(out);
      a.start(t); b.start(t + 0.045);
      this.whisper(null, dur * 1.1, 0.25);
    }
    // музыка и гул притихают под голосом
    if (this.musicGain) { this.amb.gain.setTargetAtTime(this.vol.ambience * 0.55, t, 0.2); this.amb.gain.setTargetAtTime(this.vol.ambience, t + dur + 0.3, 0.8); }
  }

  // ---------------- новые звуки ----------------
  /** Ногти по дереву: длинный скрежет с «зацепами». */
  scratch(pos, dur = 1.2) {
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.35, life: dur + 1.5, hrtf: true }); out.gain.value = 0.55;
    const n = this._src(this.noiseBuf);
    const bp = this._filter("bandpass", 2600, 7);
    bp.frequency.setValueAtTime(rnd(1800, 2600), t); bp.frequency.linearRampToValueAtTime(rnd(3000, 4200), t + dur);
    const am = ctx.createGain(); am.gain.value = 0;
    const steps = Math.floor(dur * 60);
    for (let i = 0; i < steps; i++) am.gain.setValueAtTime(Math.random() < 0.7 ? rnd(0.2, 1) : 0.02, t + (i / steps) * dur);
    am.gain.setValueAtTime(0, t + dur);
    n.connect(bp).connect(am).connect(out); n.start(t, rnd(0, 3)); n.stop(t + dur + 0.05);
    this._burst(out, t, { f: 400, q: 1, peak: 0.25, d: 0.1, buf: this.brownBuf });
  }

  /** Кто-то дёргает ручку двери снаружи. */
  handleRattle(pos) {
    const t = this.now, out = this._out(pos, { wet: 0.3, life: 2.5 }); out.gain.value = 0.55;
    for (let i = 0; i < 7; i++) {
      this._burst(out, t + i * rnd(0.07, 0.12), { f: rnd(2200, 3400), q: 6, peak: 0.45, d: 0.03 });
      this._tone(out, t + i * 0.1, { f: 180, f2: 120, peak: 0.12, d: 0.05 });
    }
  }

  /** Шаги сущности: тяжёлая волочащаяся поступь с хрустом суставов. */
  monsterStep(pos, surface = "wood", fast = false) {
    const t = this.now, out = this._out(pos, { wet: 0.35, life: 1.5, ref: 1.6 }); out.gain.value = fast ? 0.9 : 0.7;
    this._tone(out, t, { f: 70, f2: 32, peak: 0.6, d: 0.18 });
    if (surface === "snow") for (let i = 0; i < 12; i++) this._burst(out, t + i * 0.01, { f: rnd(900, 3000), q: 2, peak: 0.18, d: 0.025 });
    else this._burst(out, t, { f: 500, q: 0.9, peak: 0.35, d: 0.1, buf: this.brownBuf });
    // волочит вторую ногу
    if (!fast) this._burst(out, t + 0.18, { f: surface === "snow" ? 1600 : 1100, q: 0.8, peak: 0.08, a: 0.08, d: 0.35 });
    if (Math.random() < 0.25) this.jointCrack(pos, 2);
  }

  /** Лопата в снег: скрежет по насту + глухой ком. */
  shovel(pos) {
    const t = this.now, out = this._out(pos, { wet: 0.1, life: 1.5 }); out.gain.value = 0.8;
    this._burst(out, t, { f: 2600, q: 1.2, peak: 0.35, a: 0.03, d: 0.2 });
    this._tone(out, t, { f: 420, f2: 300, type: "triangle", peak: 0.08, d: 0.15 });
    for (let i = 0; i < 10; i++) this._burst(out, t + 0.05 + i * 0.012, { f: rnd(1200, 3200), q: 2, peak: 0.12, d: 0.02 });
    this._burst(out, t + 0.35, { f: 220, q: 0.7, peak: 0.45, d: 0.18, buf: this.brownBuf });
  }

  swingCreak(pos, amp = 0.3) {
    const t = this.now, out = this._out(pos, { wet: 0.15, life: 2, ref: 2 }); out.gain.value = 0.18 + amp * 0.4;
    const o = this.ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(rnd(600, 700), t); o.frequency.linearRampToValueAtTime(rnd(820, 980), t + 0.45);
    const g = this.ctx.createGain(); this._env(g.gain, t, 0.08, 0.12, 0.4);
    o.connect(this._filter("bandpass", 1500, 6)).connect(g).connect(out); o.start(t); o.stop(t + 0.6);
  }

  dog(pos, n = 3) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!this.ctx) return;
        const t = this.now, out = this._out(pos, { wet: 0.4, life: 1.5, ref: 8, bus: "amb" }); out.gain.value = 0.3;
        const f = rnd(380, 460);
        this._tone(out, t, { f, f2: f * 0.6, type: "sawtooth", peak: 0.25, a: 0.01, d: 0.16 });
        this._burst(out, t, { f: 900, q: 1.5, peak: 0.3, a: 0.01, d: 0.12 });
      }, i * rnd(380, 520));
    }
  }

  trainHorn(pos) {
    const ctx = this.ctx, t = this.now, d = 3.2;
    const out = this._out(pos, { wet: 0.8, life: d + 3, ref: 40, roll: 0.5, bus: "amb" }); out.gain.value = 0.12;
    for (const f of [311, 370, 466]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.15, t + 0.4); g.gain.setValueAtTime(0.15, t + d - 0.6); g.gain.linearRampToValueAtTime(0.0001, t + d);
      o.connect(this._filter("lowpass", 1200)).connect(g).connect(out); o.start(t); o.stop(t + d + 0.1);
    }
  }

  /** Машина проезжает мимо: шум шин по снегу и мотор, позицию двигает мир. */
  carPass() {
    const ctx = this.ctx;
    const out = this._out({ x: 0, y: 0, z: 0 }, { wet: 0.15, life: 0, ref: 4, roll: 1.2 }); out.gain.value = 0.7;
    const n = this._src(this.brownBuf, true); const lp = this._filter("lowpass", 600);
    n.connect(lp).connect(out); n.start();
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 48;
    const og = ctx.createGain(); og.gain.value = 0.1; o.connect(this._filter("lowpass", 300)).connect(og).connect(out); o.start();
    return {
      move: (p) => { out.panner.positionX.value = p.x; out.panner.positionY.value = p.y; out.panner.positionZ.value = p.z; },
      stop: () => { out.gain.setTargetAtTime(0, this.now, 0.3); setTimeout(() => { n.stop(); o.stop(); out.disconnect(); }, 1500); },
    };
  }

  // ---------------- удары ужаса ----------------
  sting(kind = "screech", vol = 0.8) {
    if (this.play(kind === "boom" ? "boom" : "sting", null, { vol: vol * 0.8, wet: 0.5 })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(null, { wet: 0.6, life: 4 }); out.gain.value = vol;
    if (kind === "screech") {
      for (let i = 0; i < 5; i++) {
        const o = ctx.createOscillator(); o.type = "sawtooth";
        const f = rnd(420, 900);
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(0.35, 0.6), t + 1.5);
        const g = ctx.createGain(); this._env(g.gain, t, 0.04, 0.03, 1.6);
        o.connect(this._filter("bandpass", f, 1.5)).connect(g).connect(out); o.start(t); o.stop(t + 1.8);
      }
    }
    this._tone(out, t, { f: 80, f2: 28, peak: 0.8, a: 0.005, d: 1.3 });
    this._burst(out, t, { f: 700, type: "lowpass", peak: 0.7, d: 0.6, buf: this.brownBuf });
  }

  swell(dur = 3, vol = 0.45) {
    if (this.play("riser", null, { vol: vol * 1.1, wet: 0.5 })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(null, { wet: 0.7, life: dur + 2 }); out.gain.value = vol;
    const n = this._src(this.noiseBuf); const bp = this._filter("bandpass", 400, 3);
    bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + dur); g.gain.setValueAtTime(0, t + dur + 0.01);
    n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + dur + 0.05);
  }

  jointCrack(pos, n = 4) {
    if (this.play("bones", pos, { vol: 0.6, wet: 0.35, hrtf: true })) return;
    for (let i = 0; i < n; i++) setTimeout(() => this.ctx && this.click(pos, rnd(0.3, 0.7)), i * rnd(40, 140));
  }

  rattle(pos, dur = 2.5, vol = 0.5) {
    if (this.play("growl", pos, { vol: vol * 1.2, wet: 0.45, ref: 0.8, hrtf: true, rate: rnd(0.85, 1.0) })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.45, ref: 0.8, life: dur + 1, hrtf: true }); out.gain.value = vol;
    const n = this._src(this.pinkBuf); const bp = this._filter("bandpass", 520, 2.5);
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = rnd(24, 34);
    const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(1, t + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(am).connect(g).connect(out); n.start(t, rnd(0, 3)); n.stop(t + dur + 0.1);
  }

  scream(pos, vol = 0.9) {
    if (this.play("scream", pos, { vol: vol * 0.75, wet: 0.5, ref: 2, hrtf: true })) return;
    const ctx = this.ctx, t = this.now;
    const out = this._out(pos, { wet: 0.5, ref: 2, life: 3, hrtf: true }); out.gain.value = vol;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 512) - 1) * 4);
    shaper.curve = curve;
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      const f = rnd(260, 520);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(1.8, 2.4), t + 0.35);
      o.frequency.exponentialRampToValueAtTime(f * rnd(1.2, 1.6), t + 1.5);
      const g = ctx.createGain(); this._env(g.gain, t, 0.03, 0.22, 1.5);
      o.connect(g).connect(shaper); o.start(t); o.stop(t + 1.8);
    }
    this._burst(shaper, t, { f: 1800, q: 1, peak: 0.4, a: 0.02, d: 1.4 });
    const pk = this._filter("peaking", 900, 2); pk.gain.value = 6;
    const lp = this._filter("lowpass", 5000);
    shaper.connect(pk).connect(lp).connect(out);
  }
}
