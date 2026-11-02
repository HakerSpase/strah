import { Color3, Ray, SpotLight, Texture, Vector3 } from "@babylonjs/core";
import { ui } from "./ui.js";
import { B, Cancelled, Token, clock, rnd, until, wait } from "./util.js";

// ---------------- записки ----------------
const NOTES = {
  I_Note1: { text: "12 ноября 1998.\n\nМилиция опять ничего. Говорят, девочка могла уйти сама.\nЕй шесть лет. Она боялась темноты в коридоре. Она бы никуда не ушла одна.\n\nАндрюшу положила спать к себе. В его комнату я его больше не пущу.\nПо ночам там кто-то ходит." },
  I_Note2: { text: "Андрюша.\n\nКлючи от квартиры и от машины — в холодильнике, в маслёнке. Я всегда прятала их там, помнишь?\n«Копейка» во дворе, у подъезда. Заводится с третьего раза.\n\nЗабери ключи и уезжай. Не оставайся на ночь.\nПожалуйста.\n\nМама" },
  I_Note3: { text: "Оно ходит, когда гаснет свет.\nЯ слышу, как оно считает шаги — до моей двери их сорок два.\n\nСвет режет ему глаза. Посвети в лицо — и оно замешкается.\nНо остановит его только дверь.\nОно не умеет открывать то, что держат изнутри.\n\nНе отворачивайся первой." },
  I_Note5: { text: "Оно взяло её платье из шкафа.\nОно носит её платье.\n\nОно научилось звать её голосом.\nВчера ночью оно стояло за дверью ванной и звало меня:\n«Мама. Мама. Мама».\n\nЯ не открыла." },
  I_Note8: { text: "Оно не любит холод.\nПоэтому я держу балкон открытым, поэтому в квартире всегда мёрзло.\n\nЕсли придётся бежать — беги на улицу.\nВ метель оно далеко не пойдёт.\n\nНо оно умеет ждать у подъезда." },
  I_Note4: { text: "Сынок.\n\nДвадцать семь лет я держала его здесь.\nКаждую ночь я разговаривала с ним, чтобы оно не пошло искать тебя.\nОно не уходит из квартиры, пока в ней кто-то живёт.\n\nЯ больная, старая, и скоро меня не станет.\nТогда ему станет скучно.\n\nНе приезжай. Никогда не приезжай." },
  I_Note6: { text: "мама не мама\n\nу мамы такие длиные руки\nи она улыбается когда думает что я сплю\n\nя спрячусь в кладовке и буду сидеть тихо-тихо\nпусть Андрюша меня найдёт\n\nАня", child: true },
  I_Note7: { text: "мой дневник. Аня 6 лет\n\nмама говорит ночью нельзя открывать духовку и холодильник\nтам живёт ТОТ КТО ЕСТ\n\nя видела его в коридоре. у него рот до ушей и он высокий как шкаф\nАндрюша говорит я врушка\n\nя нарисовала его чтобы мама поверила", child: true },
};

const SWITCHES = {
  Switch_Bed: ["Lamp_Bed"], Switch_Corr: ["Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3"], Switch_Kids: ["Lamp_Kids"],
  Switch_Mom: ["Lamp_Mom"], Switch_Bath: ["Lamp_Bath"], Switch_WC: ["Lamp_WC"], Switch_Kitchen: ["Lamp_Kitchen"],
};

const ROOMS = {
  bed: [-2.2, 2.2, -4.4, 0], corr: [-0.8, 0.8, 0, 12], vest: [-0.8, 0.8, 12.15, 13.4], mom: [-4.4, -0.8, 1, 5.4],
  bath: [-2.8, -0.8, 6.4, 8.8], kitchen: [0.8, 4, 7.4, 11.6], closet: [0.8, 2, 4, 6], kids: [0.8, 4, 0.4, 4],
  wc: [-2, -0.8, 8.8, 10.2], loggia: [4, 5.3, 7.4, 11.6], stair: [-1.6, 1.6, 13.45, 16.6],
};

export class Story {
  constructor({ world, player, entity, audio }) {
    this.world = world; this.player = player; this.entity = entity; this.audio = audio;
    this.handlers = {};
    this.loop = 0;
    this.token = null;
    this.fear = 0; this.fearTarget = 0;
    this.dead = false; this.ended = false;
    this.inv = {};
    this.difficulty = "normal";
    this.chapters = ["Звонок", "Колыбельная", "Метель", "Мамина комната", "Не оборачивайся", "Двор"];
  }

  // по сложности: [лёгкая, обычная, тяжёлая]
  diff(easy, normal, hard) { return { easy, normal, hard }[this.difficulty] ?? normal; }

  on(id, label, use) { this.handlers[id] = { label, use }; }
  off(id) { delete this.handlers[id]; }

  // цель. Лёгкая: сразу с подсказкой; обычная: подсказка, если застрял; тяжёлая: только скупая цель (hard)
  goal(text, hint, hard) {
    const d = this.difficulty;
    const shown = d === "hard" ? (hard ?? text) : text;
    ui.objective(shown, d === "easy" ? hint : null);
    this._goal = { text: shown, hint: d === "hard" ? null : hint, t: clock.t, shown: d === "easy" };
  }

  // ---------------- общее ----------------
  async begin(chapter = 0) {
    this.photoTexScratched = new Texture("/textures/photo_family_scratched_albedo.png", this.world.scene, false, false);
    this.famMat = this.world.scene.materials.find((m) => m.name === "Photo_Family");
    this.famTex = this.famMat && this.famMat.albedoTexture;
    this.audio.housePos = () => { const p = this.player.position; return { x: p.x + rnd(-4, 4), y: p.y + rnd(0.2, 2.6), z: p.z + rnd(-4, 4) }; };
    await this.runLoop(chapter);
  }

  async runLoop(n) {
    if (this.token) this.token.cancel();
    const tk = (this.token = new Token());
    this.loop = n;
    this.dead = false;
    this.setup(n);
    // автосохранение: игра продолжится с начала этой главы (и на телефоне тоже — хранится в браузере)
    try { localStorage.setItem("k14-save", JSON.stringify({ chapter: n, at: Date.now() })); } catch (e) {}
    try {
      await [this.ch0, this.ch1, this.ch2, this.ch3, this.ch4, this.ch5][n].call(this, tk);
    } catch (e) {
      if (!(e instanceof Cancelled)) console.error(e);
    }
  }

  setup(n) {
    const w = this.world, p = this.player, e = this.entity;
    this.handlers = {};
    this.onFrame = null;
    this.stopLoopSounds();
    w.stopProps();
    e.hide(); e.showWatcher(null); e.blocked.clear();
    w.resetYard();
    w.resetDoors();
    w.repairAll();
    w.setAllLamps(false);
    this.power = true;
    for (const id of Object.keys(NOTES)) w.show(id, false);
    w.show("BathWater", n >= 2);
    w.show("I_Keys", n === 0);
    w.show("I_OvenDoll", n <= 1);
    if (this.famMat) this.famMat.albedoTexture = n >= 1 ? this.photoTexScratched : this.famTex;
    w.setOutside({ windows: [1, 0.9, 0.7, 0.35, 0.05, 0.25][n], lamps: 1, storm: [0.8, 1, 1.4, 1.6, 2, 2.2][n] });
    p.hasLight = true; p.lightOn = false; p.lightPower = 1;
    p.noRun = false; p.speedMul = 1; p.frozen = false; p.lookTarget = null; p.mount = null;
    this.fearTarget = [0.08, 0.25, 0.45, 0.6, 0.85, 0.55][n];
    this.flags = {};
    this.inv = n === 0 ? {} : { keys: true };
    ui.clock("03:33");
    ui.objective(""); this._goal = null;

    // --- записки ---
    for (const [id, note] of Object.entries(NOTES)) {
      this.on(id, "Прочитать", () => {
        ui.showNote(note.text, note.child);
        this.audio.paper(0.4);
        this.flags["read_" + id] = true;
      });
    }
    // --- двери ---
    for (const d of ["Door_Bedroom", "Door_Bath", "Door_WC", "Door_Loggia"]) this._door(d);
    this._door("Wardrobe_DoorL", "Wardrobe_DoorR", "шкаф");
    this._door("Wardrobe_DoorR", "Wardrobe_DoorL", "шкаф");
    this._door("Cab_DoorL", "Cab_DoorR", "шкафчик");
    this._door("Cab_DoorR", "Cab_DoorL", "шкафчик");
    this._door("Oven_Door", null, "духовку");
    this._door("ToyChest_Lid", null, "сундук");
    this._lockedDoor("Door_Mom", "Заперто. Мамина комната — она всегда её запирала.");
    this._lockedDoor("Door_Closet", "Кладовка. Заперто изнутри?..");
    this._lockedDoor("Door_Kids", "Анина комната. Заперто. Мама так и не открыла её.");
    this._lockedDoor("Door_Front", () => this.flags.read_I_Note2
      ? this.diff("Заперто. Ключи — в холодильнике, в маслёнке.", "Заперто. Ключи — где-то на кухне.", "Заперто.")
      : this.diff("Заперто. Ключей не видно. Может, мама оставила записку?", "Заперто. Нужны ключи.", "Заперто."));
    this._lockedDoor("Door_Outer", "Не поддаётся.");
    // --- холодильник ---
    this.on("Fridge_Door", "Открыть холодильник", () => {
      const open = !w.doorOpen("Fridge_Door");
      w.setFridge(open);
      this.handlers.Fridge_Door.label = open ? "Закрыть холодильник" : "Открыть холодильник";
      if (open && n === 0 && !this.inv.keys) ui.say(this.diff("Пусто. Банки… и мамина маслёнка на средней полке.", "Пусто. Банки, маслёнка. Пахнет железом.", "Пахнет железом."), { sec: 3 });
    });
    // --- вода и газ ---
    this.on("I_Tap", "Открыть кран", () => {
      const on = !w.waterOn("tap"); w.setWater("tap", on);
      this.handlers.I_Tap.label = on ? "Закрыть кран" : "Открыть кран";
      if (on && n >= 2) setTimeout(() => ui.say("Вода… ржавая. Почти чёрная.", { sec: 3 }), 900);
    });
    this.on("I_BathTap", "Открыть кран", () => {
      const on = !w.waterOn("bath"); w.setWater("bath", on);
      this.handlers.I_BathTap.label = on ? "Закрыть кран" : "Открыть кран";
    });
    this.on("I_Stove", "Зажечь газ", () => {
      const on = !w.gasOn(); w.setGas(on);
      this.handlers.I_Stove.label = on ? "Выключить газ" : "Зажечь газ";
    });
    this.on("I_Toilet", "Дёрнуть цепочку", () => this.audio.flush(w.xyz("I_Toilet")));
    this.on("I_Bear", "Взять мишку", () => {
      this.audio.squeak(w.xyz("I_Bear"));
      ui.say(["Анин мишка. Я дразнил её, что он страшный.", "Он мокрый. И холодный.", "Пахнет её шампунем. Двадцать семь лет."][Math.floor(Math.random() * 3)], { sec: 3.5 });
    });
    this.on("I_Radio", "Включить радио", () => {
      if (this.radio) { this.radio.stop(); this.radio = null; this.handlers.I_Radio.label = "Включить радио"; return; }
      this.radio = this.audio.radio(w.xyz("I_Radio")); this.handlers.I_Radio.label = "Выключить радио";
    });
    this.on("I_Phone", "Снять трубку", () => { this.audio.click(w.xyz("I_Phone"), 0.4); setTimeout(() => this.audio.dialTone(), 300); });
    this.on("I_FuseBox", "Открыть щиток", () => ui.say("Пробки на месте. Счётчик крутится.", { sec: 2.5 }));
    // --- выключатели ---
    for (const [sw, lamps] of Object.entries(SWITCHES)) {
      this.on(sw, "Выключатель", () => {
        this.audio.switchClick(w.xyz(sw));
        if (!this.power) { ui.say("Щёлк. Ничего. Света нет.", { sec: 2 }); return; }
        const on = !w.lampOn(lamps[0]);
        for (const l of lamps) w.setLamp(l, on);
      });
    }

    // точка старта
    if (n === 5) p.teleport(w.nodes.Exit_Spawn ? w.pos("Exit_Spawn") : B(0.2, -6.0, -6.25), Math.PI);
    else if (n === 0) p.teleport(B(1.0, -2.9), 0.33);
    else { p.teleport(B(0, -0.75), 0); w.setDoor("Door_Bedroom", true, { silent: true, speed: 50 }); }
  }

  _door(name, pair, what) {
    const w = this.world;
    // подпись считается по текущему состоянию двери — даже если её открыл сюжет, ветер или сущность
    this.handlers[name] = {
      get label() { const o = w.doorOpen(name); return what ? (o ? "Закрыть " : "Открыть ") + what : o ? "Закрыть" : "Открыть"; },
      use: () => {
        const open = !w.doorOpen(name);
        w.setDoor(name, open);
        if (pair) w.setDoor(pair, open, { silent: true });
        this.flags["opened_" + name] = open;
      },
    };
  }

  _lockedDoor(name, msg) {
    this.on(name, "Открыть", () => {
      const p = this.world.doorPos(name);
      this.audio.latch(p, 0.6); setTimeout(() => this.audio.latch(p, 0.5), 140);
      this.audio.thump(p, 0.2, 160);
      ui.say(typeof msg === "function" ? msg() : msg, { sec: 3 });
    });
  }

  stopLoopSounds() {
    for (const k of ["ring", "radio", "tv", "box", "engine"]) if (this[k]) { this[k].stop(); this[k] = null; }
    clearInterval(this.knockT);
    if (this.headlights) { this.headlights.dispose(); this.headlights = null; }
  }

  inRoom(name) {
    const p = this.player.position, x = p.x, y = -p.z, R = ROOMS[name];
    return p.y > -2 && x > R[0] && x < R[1] && y > R[2] && y < R[3];
  }
  by() { return -this.player.position.z; }
  xyz(v) { return { x: v.x, y: v.y, z: v.z }; }
  at(name, dy = 0) { return this.world.xyz(name, dy); }

  scare(kind = "screech", vol = 0.8) {
    this.audio.sting(kind, vol);
    this.player.shake = 1;
    this.fear = Math.min(1, this.fear + 0.35);
  }

  async use(id, tk) {
    return new Promise((res, rej) => {
      const h = this.handlers[id];
      const prev = h && h.use;
      if (h) h.use = () => { prev && prev(); res(); };
      until(() => tk.dead, tk).catch(rej);
    });
  }

  waitHandler(id, label, tk) {
    return new Promise((res, rej) => { this.on(id, label, () => res()); until(() => tk.dead, tk).catch(rej); });
  }

  // переход в следующую главу через тамбур
  async throughVestibule(tk, next) {
    this.on("Door_Front", "Открыть", () => { this.world.setDoor("Door_Front", true, { speed: 1.2 }); this.off("Door_Front"); });
    await until(() => this.inRoom("vest") && this.by() > 12.55, tk);
    this.world.setLamp("Lamp_Vest", false);
    for (const k in this.world.lamps) this.world.flicker(k, 0.6);
    this.audio.thump(null, 0.4, 60);
    await ui.fade(1, 0.25);
    await wait(1.0, tk);
    this.runLoop(next);
    await new Promise((r) => setTimeout(r, 400));
    ui.fade(0, 1.8);
  }

  // ---------------- смерть ----------------
  async attack() {
    if (this.dead) return;
    if (this.god) return;          // меню разработчика: сущность не убивает
    this.dead = true;
    const p = this.player, e = this.entity;
    if (this.token) this.token.cancel();
    e.state = "attack";
    p.frozen = true;
    const front = p.position.add(p.forward().multiplyByFloats(1, 0, 1).normalize().scale(0.9));
    e.place(new Vector3(front.x, p.position.y, front.z), 0, "Attack");
    e.faceTo(p.position);
    e.play("Attack", 1, false);
    p.lookTarget = e.head().add(new Vector3(0, -0.12, 0));
    p.hasLight = true; p.lightOn = true; p.lightPower = 1.3;
    this.audio.scream(e.headXYZ());
    p.shake = 2.2;
    ui.flash("#5a0000", 1.2, 0.55);
    await new Promise((r) => setTimeout(r, 1100));
    ui.fade(1, 0.05);
    e.hide();
    if (document.exitPointerLock) document.exitPointerLock();
    ui.show("death", true);
  }

  retry() {
    ui.show("death", false);
    ui.fade(0, 1.2);
    this.runLoop(this.loop);
  }

  // стена или закрытая дверь между игроком и сущностью
  _wallBetween() {
    const a = this.entity.chest(), b = this.player.camera.position;
    const d = b.subtract(a), len = d.length();
    const hit = this.world.scene.pickWithRay(new Ray(a, d.normalize(), len - 0.2), (m) => m.checkCollisions);
    return !!(hit && hit.hit);
  }

  // ---------------- кадр ----------------
  update(dt) {
    this.fear += (this.fearTarget - this.fear) * Math.min(1, dt * 0.5);
    const e = this.entity;
    const reach = this.diff(0.95, 1.1, 1.3);
    if (!this.dead && e.visible && /chase|stalk|hunt/.test(e.state) && e.distToPlayer() < reach && !e.atDoor && !this._wallBetween()) this.attack();
    // близость сущности — страх и сердце растут сами
    if (e.visible && /chase|hunt/.test(e.state)) this.fear = Math.max(this.fear, Math.min(1, 1.2 - e.distToPlayer() * 0.08));
    if (this._goal && !this._goal.shown && this._goal.hint && clock.t - this._goal.t > 60) {
      this._goal.shown = true;
      ui.objective(this._goal.text, this._goal.hint);
      ui.say("Подсказка: " + this._goal.hint, { sec: 6 });
    }
    if (this.onFrame) this.onFrame(dt);
  }

  // =====================================================================
  // ГЛАВА 1 — «Звонок»
  // =====================================================================
  async ch0(tk) {
    const w = this.world, a = this.audio, p = this.player;
    for (const k of ["Lamp_Bed", "Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3", "Lamp_Kitchen"]) w.setLamp(k, true, { instant: true });
    w.show("I_Note1", true); w.show("I_Note2", true);
    p.pitch = -0.25;
    await wait(1.5, tk);
    a.heartbeat(0.8, 0.4);
    ui.say("Опять этот сон. Длинный коридор, и кто-то зовёт меня из темноты.", { sec: 5 });
    await wait(5, tk);
    this.ring = a.phoneRing(this.at("I_Phone"));
    this.goal("Звонит телефон. В коридоре, на тумбочке", "телефон стоит в коридоре справа, на деревянной тумбочке");
    ui.say("Кто может звонить на мамин номер? В три часа ночи…", { sec: 3.5 });
    await this.waitHandler("I_Phone", "Снять трубку", tk);
    this.ring.stop(); this.ring = null;
    this.on("I_Phone", "Положить трубку", () => {});
    a.click(null, 0.4);
    await wait(0.8, tk);
    this.tv = a.tvStatic(null);
    a.whisper(null, 2.0, 0.35);
    await wait(1.4, tk);
    ui.say("«…Андрюша?.. Почему ты меня не ищешь? Мне тут темно…»", { voice: true, sec: 5 });
    a.whisper(null, 2.6, 0.4);
    await wait(4.2, tk);
    this.tv.stop(); this.tv = null;
    a.dialTone();
    this.fearTarget = 0.2;
    await wait(1.2, tk);
    ui.say("Аня?.. Нет. Это невозможно. Её нет двадцать семь лет.", { sec: 5 });
    this.goal("Уехать отсюда. Мама оставила записку на кухонном столе", "кухня — в конце коридора справа, записка лежит на столе у окна");
    await until(() => this.flags.read_I_Note2, tk);
    await until(() => !ui.noteOpen, tk);
    this.goal("Ключи — в холодильнике, в маслёнке", "открой холодильник на кухне — ключи на средней полке");
    this.on("I_Keys", "Взять ключи", () => {
      if (!w.doorOpen("Fridge_Door")) return;
      w.show("I_Keys", false); this.off("I_Keys"); this.inv.keys = true;
      a.click(null, 0.4); a.click(null, 0.3);
      ui.say("Ключи от квартиры и от маминой «копейки». Всё. Уезжаю.", { sec: 3.5 });
      this.goal("Входная дверь — в конце коридора. Машина у подъезда", "входная дверь — обитая дерматином, в самом конце коридора");
    });
    this.onFrame = () => {
      if (!this.flags.bathCreep && this.by() > 6.6 && this.by() < 8.6) {
        this.flags.bathCreep = true;
        setTimeout(() => w.setDoor("Door_Bath", true, { speed: 0.35, amount: 0.22 }), 600);
      }
      if (this.inv.keys && !this.flags.knock && this.by() > 4.0 && this.by() < 6.0) {
        this.flags.knock = true;
        a.knock(this.at("Door_Closet", 0.2), 3, 0.45);
      }
    };
    await until(() => this.inv.keys, tk);
    this.on("Door_Front", "Отпереть", async () => {
      this.off("Door_Front");
      const dp = w.doorPos("Door_Front");
      a.latch(dp, 0.7); await wait(0.3); a.latch(dp, 0.7); await wait(0.4);
      w.setDoor("Door_Front", true, { speed: 1.0 });
      ui.say("Тамбур. Ещё одна дверь — и лестница.", { sec: 3 });
    });
    await until(() => this.inRoom("vest") && this.by() > 12.55, tk);
    this.onFrame = null;
    await this._teleport(tk, 1, "…Я же только что вышел. Это снова коридор.");
  }

  async _teleport(tk, next, line) {
    const w = this.world;
    w.setLamp("Lamp_Vest", false);
    for (const k in w.lamps) w.flicker(k, 0.6);
    this.audio.thump(null, 0.4, 60);
    await ui.fade(1, 0.25);
    await wait(1.0, tk);
    this.runLoop(next);
    await new Promise((r) => setTimeout(r, 400));
    ui.fade(0, 1.8);
    if (line) setTimeout(() => ui.say(line, { sec: 4 }), 2200);
  }

  // =====================================================================
  // ГЛАВА 2 — «Колыбельная»
  // =====================================================================
  async ch1(tk) {
    const w = this.world, a = this.audio, p = this.player;
    for (const k of ["Lamp_Bed", "Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3", "Lamp_Kitchen"]) w.setLamp(k, true, { instant: true });
    w.flicker("Lamp_Corr2", 3);
    this.goal("Что-то не так. Осмотрись. [F] — фонарик телефона");
    await wait(6, tk);
    this.radio = a.radio(this.at("I_Radio"));
    ui.say("На кухне заиграло радио. Само. Колыбельная… Мама пела её Ане.", { sec: 4 });
    this.goal("Выключить радио на кухне", "радиоприёмник стоит на подоконнике на кухне");
    await this.waitHandler("I_Radio", "Выключить радио", tk);
    this.radio.stop(); this.radio = null;
    this.on("I_Radio", "Радио", () => ui.say("Не буду его трогать.", { sec: 2 }));
    a.click(this.at("I_Radio"), 0.5);
    await wait(1.6, tk);
    const back = p.position.subtract(p.forward().multiplyByFloats(1, 0, 1).normalize().scale(0.6)).add(new Vector3(0, 1.6, 0));
    a.whisper(this.xyz(back), 2.4, 0.8);
    ui.say("«…ключик там, где тепло… найди меня…»", { voice: true, sec: 4 });
    this.fearTarget = 0.35; this.fear += 0.2;
    await wait(4, tk);
    const kd = this.at("Door_Kids", 0.2);
    a.knock(kd, 3, 0.5);
    this.knockT = setInterval(() => a.knock(kd, 3, 0.5), 8000);
    ui.say("Стук… из Аниной комнаты.", { sec: 3 });
    this.goal("Ключ от Аниной комнаты. «Там, где тепло»", "тепло на кухне — открой духовку газовой плиты, внизу", "«Там, где тепло»");
    // ключ в духовке: кукла с ключом на руке — отдельный предмет
    this.on("I_OvenDoll", "Взять куклу", () => {
      if (!w.doorOpen("Oven_Door")) return;
      w.show("I_OvenDoll", false); this.off("I_OvenDoll");
      this.inv.kidsKey = true;
      a.click(this.at("I_OvenDoll"), 0.4); a.squeak(this.at("I_OvenDoll"));
      ui.say("Кукла тёплая. Будто духовку только что выключили. К её руке ниткой привязан ключ.", { sec: 4.5 });
      this.goal("Открыть Анину комнату", "коридор, первая дверь справа — та, за которой стучат", "Анина комната");
    });
    await until(() => w.doorOpen("Oven_Door"), tk);
    await wait(0.5, tk);
    if (!this.inv.kidsKey) ui.say("В духовке… Анина кукла.", { sec: 3 });
    await until(() => this.inv.kidsKey, tk);
    this.on("Door_Kids", "Отпереть", () => {
      clearInterval(this.knockT);
      a.latch(w.doorPos("Door_Kids"), 0.7);
      this._door("Door_Kids");
      w.setDoor("Door_Kids", true, { speed: 0.8 });
      this.flags.kidsOpen = true;
    });
    await until(() => this.flags.kidsOpen && this.inRoom("kids"), tk);
    w.show("I_Note7", true);
    await wait(1.5, tk);
    a.thump(this.at("ToyChest_Lid"), 0.3, 220); setTimeout(() => a.thump(this.at("ToyChest_Lid"), 0.3, 220), 400);
    ui.say("Здесь всё как тогда. Даже кровать заправлена.", { sec: 3.5 });
    this.goal("Анина комната. Сундук с игрушками… и её дневник на столе");
    await until(() => w.doorOpen("ToyChest_Lid"), tk);
    this.box = a.musicBox(this.at("ToyChest_Lid", 0.2), { slow: 1.2, detune: 25, vol: 0.4 });
    await until(() => this.flags.read_I_Note7, tk);
    await until(() => !ui.noteOpen, tk);
    if (this.box) { this.box.stop(); this.box = null; }
    w.setDoor("Door_Kids", false, { speed: 9 });
    w.setLamp("Lamp_Kids", false);
    this.scare("boom", 0.7);
    await wait(1.5, tk);
    ui.say("«Тот, кто ест». Аня, прости. Я тебе не верил.", { sec: 4 });
    this.goal("Уходи. Сейчас же");
    // зеркало: в отражении кто-то стоит за спиной
    let mirrorDone = false;
    this.onFrame = () => {
      if (mirrorDone) return;
      const by = this.by(), f = p.forward();
      if (by > 9.6 && by < 11.0 && f.x < -0.55) {
        mirrorDone = true;
        this.entity.place(B(0.3, by - 1.7, 0), 0, "Idle");
        this.entity.faceTo(p.position);
        a.rattle(this.entity.headXYZ(), 1.5, 0.3);
        const t0 = clock.t;
        const check = () => {
          if (!this.entity.visible) return;
          if (this.entity.seen(0.5) || clock.t - t0 > 1.4) {
            this.entity.hide(); this.scare("screech", 0.8);
            for (const k of ["Lamp_Corr3", "Lamp_Corr2"]) w.flicker(k, 1.5);
            return;
          }
          requestAnimationFrame(check);
        };
        check();
      }
    };
    await until(() => mirrorDone && !this.entity.visible, tk);
    await wait(1.5, tk);
    ui.say("В зеркале… Нет. Мне показалось.", { sec: 3.5 });
    this.onFrame = null;
    this.goal("Входная дверь");
    await this.throughVestibule(tk, 2);
  }

  // =====================================================================
  // ГЛАВА 3 — «Метель»
  // =====================================================================
  async ch2(tk) {
    const w = this.world, a = this.audio, p = this.player, e = this.entity;
    this.power = false;
    w.show("I_Note3", true); w.show("I_Note5", true); w.show("I_Note8", true);
    w.setDoor("Door_Bath", true, { silent: true, speed: 50, amount: 0.35 });
    w.setOutside({ lamps: 0.6 });
    await wait(2, tk);
    ui.say("Света нет. Совсем. И метель за окнами воет всё сильнее.", { sec: 4 });
    this.goal("Темно. [F] — фонарик телефона");
    await until(() => p.lightOn, tk);
    this.goal("Электрощиток — у входной двери, слева", "щиток висит на стене в конце коридора слева, высоко");
    await wait(2.5, tk);
    a.swell(2.5, 0.45);
    await wait(2.2, tk);
    e.place(B(0, 11.2, 0), Math.PI, "Idle");
    e.faceTo(p.position);
    a.rattle(e.headXYZ(), 3, 0.45);
    const t0 = clock.t;
    let seenT = 0;
    await until(() => {
      if (e.seen(0.45) && p.litByFlashlight(e.chest()) && e.distToPlayer() < 12) seenT += 1 / 60;
      return seenT > 0.35 || clock.t - t0 > 18;
    }, tk);
    if (seenT > 0.35) { p.lightFlicker = 0.8; this.scare("screech", 0.9); ui.flash("#000", 0.4, 0.9); }
    e.hide();
    a.heartbeat(1.3, 0.7); setTimeout(() => a.heartbeat(1.4, 0.6), 800);
    await wait(2.5, tk);
    ui.say("Там… в конце коридора. Высокое. В платье.", { sec: 4 });
    await this.waitHandler("I_FuseBox", "Включить рубильник", tk);
    this.on("I_FuseBox", "Щиток", () => ui.say("Рубильник включён.", { sec: 2 }));
    a.thump(this.at("I_FuseBox"), 0.5, 140); a.switchClick(this.at("I_FuseBox"));
    this.power = true;
    for (const k of ["Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3", "Lamp_Bath", "Lamp_Vest"]) { w.setLamp(k, true); w.flicker(k, 1.2); }
    await wait(2.5, tk);
    w.setWater("bath", true);
    this.handlers.I_BathTap.label = "Закрыть кран";
    ui.say("В ванной… сама включилась вода.", { sec: 3 });
    w.setDoor("Door_Bath", true, { speed: 0.5 });
    this.goal("Ванная. Закрыть воду", "ванная — в коридоре слева, кран над ванной");
    await until(() => !w.waterOn("bath"), tk);
    await wait(0.8, tk);
    ui.say("Ванна полна. Вода чёрная, как нефть. Записка на раковине.", { sec: 4 });
    await until(() => this.flags.read_I_Note5, tk);
    await until(() => !ui.noteOpen, tk);
    w.setAllLamps(false); this.power = false;
    a.thump(null, 0.35, 50);
    await wait(1.0, tk);
    e.place(B(-0.95, 7.6, 0), -Math.PI / 2, "Peek");
    e.faceTo(p.position);
    a.whisper(e.headXYZ(), 2.2, 0.6);
    ui.say("«…мама…»", { voice: true, sec: 2.5 });
    const t1 = clock.t;
    await until(() => e.seen(0.55) || clock.t - t1 > 6, tk);
    e.hide(); this.scare("screech", 0.9); p.lightFlicker = 0.6;
    await wait(1.2, tk);
    this.power = true;
    for (const k of ["Lamp_Corr1", "Lamp_Corr3", "Lamp_Kitchen"]) w.setLamp(k, true);
    // ветер распахивает балкон
    await wait(2, tk);
    w.setDoor("Door_Loggia", true, { speed: 7 });
    a.doorSlam(w.doorPos("Door_Loggia"));
    w.setOutside({ storm: 2 });
    ui.say("Грохот на кухне. Ветер распахнул балкон.", { sec: 3.5 });
    this.goal("Закрыть балконную дверь на кухне", "дверь на лоджию — на кухне, рядом с окном", "Балкон");
    // пока записка не прочитана — не закрывается (на стуле листок); изнутри лоджии закрыть нельзя
    this.handlers.Door_Loggia = {
      get label() { return w.doorOpen("Door_Loggia") ? "Закрыть балкон" : "Открыть балкон"; },
      use: () => {
        const open = w.doorOpen("Door_Loggia");
        if (open && !this.flags.read_I_Note8) {
          ui.say("Стоп. На балконе, на стуле — листок. Мамин почерк.", { sec: 3.5 });
          this.flags.noteHint = true;
          this.goal("На балконе, на стуле — мамина записка", "выйди на лоджию: листок лежит на стуле", "Листок на балконе");
          return;
        }
        if (open && this.inRoom("loggia")) { ui.say("Сначала вернуться на кухню. Не запирать же себя на морозе.", { sec: 3.5 }); return; }
        w.setDoor("Door_Loggia", !open);
      },
    };
    await until(() => this.inRoom("loggia"), tk);
    // во дворе под фонарём — оно
    const spot = this.world.nodes.Watcher_Spot ? this.world.pos("Watcher_Spot") : B(0.2, -14.2, -6.3);
    let wSeen = 0;
    const lookOut = () => {
      const d = spot.add(new Vector3(0, 1.8, 0)).subtract(p.camera.position).normalize();
      return Vector3.Dot(d, p.forward()) > 0.93;
    };
    e.showWatcher(spot, B(0.5, -4.6, 0));
    await until(() => { if (lookOut()) wSeen += 1 / 60; return wSeen > 1.2 || this.flags.read_I_Note8; }, tk);
    if (wSeen > 1.2) { ui.say("Во дворе… под фонарём. Оно смотрит прямо на меня.", { sec: 4 }); a.heartbeat(1.5, 0.7); }
    if (!this.flags.read_I_Note8) this.goal("Записка на стуле", "листок лежит на стуле на лоджии", "Записка");
    await until(() => this.flags.read_I_Note8 && !ui.noteOpen, tk);
    this.goal("Зайти на кухню и закрыть балкон", "встань на кухне у балконной двери и закрой её [E]", "Закрыть балкон");
    await until(() => !w.doorOpen("Door_Loggia") && !this.inRoom("loggia"), tk);
    e.showWatcher(null);
    w.setOutside({ storm: 1.4 });
    this._door("Door_Loggia");
    a.heartbeat(1.2, 0.5);
    this.goal("Уходить. Входная дверь", "из кухни налево по коридору до конца — обитая дерматином дверь", "Выход");
    await this.throughVestibule(tk, 3);
  }

  // =====================================================================
  // ГЛАВА 4 — «Мамина комната»
  // =====================================================================
  async ch3(tk) {
    const w = this.world, a = this.audio, p = this.player, e = this.entity;
    for (const k of ["Lamp_Corr1", "Lamp_Corr3"]) w.setLamp(k, true, { instant: true });
    w.flicker("Lamp_Corr3", 99);
    w.show("I_Note4", true); w.show("I_Note6", true);
    w.setTV(true);
    this.tv = a.tvStatic(this.at("TV_Screen"));
    w.setDoor("Door_Mom", true, { silent: true, speed: 50, amount: 0.25 });
    this._door("Door_Mom");
    await wait(2, tk);
    ui.say("Мамина дверь приоткрыта. Там кто-то включил телевизор.", { sec: 4.5 });
    this.goal("Мамина комната — коридор, вторая дверь слева");
    // окна дома напротив гаснут одно за другим
    let dark = 0.35;
    this.onFrame = (dt) => { dark = Math.max(0, dark - dt * 0.01); w.setOutside({ windows: dark }); };
    await until(() => this.flags.read_I_Note4, tk);
    await until(() => !ui.noteOpen, tk);
    w.setTV(false); this.tv.stop(); this.tv = null;
    this.onFrame = null;
    a.thump(null, 0.3, 60);
    await wait(1.2, tk);
    ui.say("Она знала. Все эти годы — знала. И кормила его собой.", { sec: 4 });
    await wait(2.5, tk);
    // кладовка сама приоткрывается — и в коридоре гаснет свет
    w.setDoor("Door_Closet", true, { speed: 0.4, amount: 0.5 });
    this._door("Door_Closet");
    this.goal("Кладовка. Аня пряталась там", "дверь справа в коридоре, напротив маминой комнаты", "Кладовка");
    await until(() => this.inRoom("corr"), tk);
    for (const k of ["Lamp_Corr1", "Lamp_Corr3"]) w.flicker(k, 1.5);
    a.swell(2, 0.45);
    await wait(1.5, tk);
    w.setLamp("Lamp_Corr1", false);
    e.place(B(0, 0.4, 0), 0, "Peek");
    e.faceTo(p.position);
    a.jointCrack(e.headXYZ(), 6);
    a.whisper(e.headXYZ(), 1.6, 0.5);
    ui.say("«Андрюша. Иди к маме».", { voice: true, sec: 3 });
    this.fearTarget = 0.8;
    await wait(this.diff(3.2, 2.2, 1.4), tk);
    // охота: дверь кладовки — единственное, что его держит
    e.blocked.add("Door_Closet");
    e.hunt(this.diff(1.45, 1.8, 2.1));
    a.rattle(e.headXYZ(), 1.8, 0.7);
    this.goal("Спрячься в кладовке и закрой дверь!", "кладовка справа по коридору; зайди внутрь и закрой дверь [E]", "Спрячься");
    // прятки: внутри, дверь закрыта — оно скребётся, зовёт и уходит
    let hidT = 0, doorT = 0, opened = false;
    this.onFrame = (dt) => {
      const hidden = this.inRoom("closet") && !w.doorOpen("Door_Closet");
      hidT = hidden ? hidT + dt : 0;
      if (e.atDoor === "Door_Closet") {
        doorT += dt;
        if (!this.flags.callOut && doorT > 2.5) {
          this.flags.callOut = true;
          a.whisper(this.at("Door_Closet", 0.5), 2.5, 0.7);
          ui.say(this.diff("«Анечка. Открой маме». Не открывай. Жди.", "«Анечка. Открой маме».", "«Открой».") , { voice: true, sec: 4 });
        }
      }
      // открыл, пока оно за дверью — бросок
      if (e.atDoor === "Door_Closet" && w.doorOpen("Door_Closet") && !opened) { opened = true; e.blocked.delete("Door_Closet"); e.chase(3.4); }
    };
    await until(() => doorT > this.diff(6, 8, 10) && hidT > 2, tk);
    // уходит: шаги удаляются к входной двери, хлопок
    e.hide();
    this.onFrame = null;
    const from = this.at("Door_Closet");
    for (let i = 0; i < 7; i++) setTimeout(() => this.audio.ctx && a.monsterStep({ x: from.x - 0.6, y: 0.1, z: from.z - i * 1.1 }, "wood", false), 400 + i * 700);
    await wait(5.8, tk);
    a.doorSlam(w.doorPos("Door_Front"));
    await wait(2.0, tk);
    ui.say("Ушло. Кажется, ушло. Здесь… её записка.", { sec: 4 });
    this.fearTarget = 0.55;
    this.goal("Записка на полке в кладовке", "листок на нижней полке слева", "");
    await until(() => this.flags.read_I_Note6, tk);
    await until(() => !ui.noteOpen, tk);
    for (const k in w.lamps) w.flicker(k, 1);
    this.scare("boom", 0.8);
    this.box = a.musicBox(this.at("I_Note6", 0.4), { slow: 1.6, detune: 30, vol: 0.3 });
    await wait(3, tk);
    ui.say("Аня, прости меня. Я не искал. Я просто уехал — и жил.", { sec: 5 });
    this.goal("Входная дверь");
    await this.throughVestibule(tk, 4);
  }

  // =====================================================================
  // ГЛАВА 5 — «Не оборачивайся»
  // =====================================================================
  async ch4(tk) {
    const w = this.world, a = this.audio, p = this.player, e = this.entity;
    const red = new Color3(1.0, 0.32, 0.22);
    for (const k of ["Lamp_Corr1", "Lamp_Corr2", "Lamp_Corr3", "Lamp_Vest", "Lamp_Bed", "Lamp_Stair"]) {
      w.setLamp(k, true, { instant: true }); w.lampColor(k, red);
    }
    p.hasLight = true; p.lightOn = true;
    w.setDoor("Door_Front", true, { silent: true, speed: 50 });
    this.off("Door_Front"); this.off("Door_Outer");
    await wait(1.8, tk);
    a.whisper(this.xyz(p.position.add(new Vector3(0, 1.6, 2.0))), 2.4, 0.9);
    ui.say("«Андрюша… обернись. Это я. Это мама».", { voice: true, sec: 4 });
    this.goal("Беги. Не оборачивайся. Вниз по лестнице — к машине");
    await wait(2.4, tk);
    e.place(B(0, -2.4, 0), 0, "Run");
    a.rattle(e.headXYZ(), 2, 0.8);
    e.chase(3.0);
    this.fearTarget = 1;
    let looked = false;
    this.onFrame = () => {
      for (const [k, y] of [["Lamp_Corr1", 2.0], ["Lamp_Corr2", 6.0], ["Lamp_Corr3", 10.0]]) {
        if (!w.lamps[k].broken && -e.pos.z > y - 0.5) w.breakLamp(k);
      }
      if (!looked && e.seen(0.5)) { looked = true; e.speed = 3.6; this.scare("screech", 0.7); }
      if (!w.doorOpen("Door_Outer") && this.by() > 12.4) { w.setDoor("Door_Outer", true, { speed: 6 }); }
    };
    // вниз по лестнице
    await until(() => this.by() > 15.0 && p.position.y < -0.3, tk);
    this.onFrame = null;
    e.hide();
    await ui.fade(1, 0.4);
    p.frozen = true;
    for (let i = 0; i < 10; i++) setTimeout(() => this.audio.ctx && a.footstep(null, "concrete", true), i * 260);
    ui.say("Третий этаж… второй… первый…", { sec: 3 });
    await wait(3, tk);
    a.doorSlam(null);
    this.runLoop(5);
  }

  // =====================================================================
  // ГЛАВА 6 — «Двор»
  // =====================================================================
  async ch5(tk) {
    const w = this.world, a = this.audio, p = this.player, e = this.entity;
    p.speedMul = 0.9; p.lightOn = true;
    w.setOutside({ storm: 2.2, lamps: 1 });
    w.yardLife(true);
    const sub = this.devSub; this.devSub = null;
    await ui.fade(0, 1.2);
    if (sub === "drive") { await this.drive(tk); return; }
    if (sub !== "car") {
      ui.say("Улица. Метель такая, что не видно соседнего дома. Мамина «копейка» — у подъезда.", { sec: 4.5 });
      this.goal("Машина у подъезда", "бежевая машина в нескольких шагах справа от подъезда", "Машина");
      // фигура ждёт под дальним фонарём
      e.showWatcher(B(-12.4, -15.8, -6.3), p.position);
      await this.waitHandler("I_Car", "Сесть в машину", tk);
      a.thump(w.xyz("Ext_Car_Drive", 0.6), 0.4, 90);
      ui.say("Дверь примёрзла, а колёса — по ступицу в снегу. Без лопаты не выехать.", { sec: 4.5 });
      await wait(2.5, tk);
      ui.say("У гаражей один бокс открыт — там горит свет. Дядя Коля всегда держал там лопату.", { sec: 5 });
      w.setGarage(true);
      this.goal("Лопата — в открытом гараже", "гаражи слева за детской площадкой; светится единственный открытый", "Найти, чем откопать машину");
      this.on("I_Car", "Машина", () => ui.say("Без лопаты не откопать.", { sec: 2 }));
      // таксофон звонит, когда проходишь мимо
      this.ring = a.phoneRing(w.xyz("I_Payphone", 1.4), true);
      this.on("I_Payphone", "Снять трубку", async () => {
        this.off("I_Payphone");
        if (this.ring) { this.ring.stop(); this.ring = null; }
        a.click(w.xyz("I_Payphone", 1.4), 0.5);
        await wait(0.8);
        this.tv = a.tvStatic(null);
        ui.say("«…Андрюша. Не уезжай без меня. Я же тут, в машине. Я тебя жду».", { voice: true, sec: 5 });
        a.whisper(null, 3, 0.45);
        await wait(4.5);
        if (this.tv) { this.tv.stop(); this.tv = null; }
        a.dialTone();
        this.fear = Math.min(1, this.fear + 0.3);
      });
      await this.waitHandler("I_Shovel", "Взять лопату", tk);
      if (this.ring) { this.ring.stop(); this.ring = null; }
      this.off("I_Payphone");
      w.show("I_Shovel", false);
      a.thump(w.xyz("I_Shovel", 0.5), 0.3, 200);
      await wait(0.8, tk);
      w.setGarage(false, true);
      a.bulbPop(w.xyz("I_Shovel", 2));
      e.showWatcher(null);
      p.lightFlicker = 0.6;
      await wait(1.6, tk);
      a.scream(this.xyz(B(-17, 12, -4.5)), 0.5);
      ui.say("Под фонарём больше никого нет. А за гаражами — хруст снега.", { sec: 4 });
    } else w.setGarage(false, true);
    // охота во дворе: свет фонаря тормозит его, фонари гаснут, когда оно проходит
    this.inv.shovel = true;
    e.place(B(-17, 12, -6.3), 0, "Walk");
    e.hunt(this.diff(1.6, 1.95, 2.25));
    this.fearTarget = 0.9;
    this.goal("Откопать машину. Бегом!", "к машине у подъезда; свети на него фонариком — свет его тормозит", "Машина");
    this.onFrame = () => w.dimNear(e.pos, 5);
    let dug = 0;
    const need = this.diff(3, 5, 7);
    this.on("I_Car", "Откопать колёса", () => {
      if (this.digBusy) return;
      this.digBusy = true;
      a.shovel(w.xyz("Ext_Car_Drive", 0.3));
      p.shake = Math.max(p.shake, 0.25);
      setTimeout(() => { this.digBusy = false; }, 650);
      dug++;
      w.setDrift(1 - dug / need);
      if (dug < need) this.handlers.I_Car.label = `Откопать колёса (${dug}/${need})`;
      else { this.off("I_Car"); this.flags.dug = true; }
    });
    await until(() => this.flags.dug, tk);
    w.setDrift(0);
    a.doorSlam(w.xyz("Ext_Car_Drive", 0.8));
    this.goal("В машину!");
    await this.waitHandler("I_Car", "Сесть в машину", tk);
    this.onFrame = null;
    e.hide();
    await this.drive(tk);
  }

  // финал: машина, стартер, оно в свете фар, уезжаем
  async drive(tk) {
    const w = this.world, a = this.audio, p = this.player, e = this.entity, scene = w.scene;
    const car = w.nodes.Ext_Car_Drive;
    w.setDrift(0);
    const seatLocal = new Vector3(-0.35, 1.12, 0.45);
    p.frozen = true; p.lightOn = false;
    p.mount = () => Vector3.TransformCoordinates(seatLocal, car.getWorldMatrix());
    p.yaw = 0; p.pitch = -0.05;
    a.doorSlam(this.xyz(car.position));
    this.goal("");
    this.fearTarget = 0.9;
    // фары
    const hl = (this.headlights = new SpotLight("headlights", Vector3.Zero(), new Vector3(0, -0.08, -1), 0.7, 3, scene));
    hl.diffuse = new Color3(1, 0.92, 0.75); hl.intensity = 0; hl.range = 40;
    const syncLights = () => {
      const m = car.getWorldMatrix();
      hl.position = Vector3.TransformCoordinates(new Vector3(0, 0.65, -2.2), m);
      hl.direction = Vector3.TransformNormal(new Vector3(0, -0.08, -1), m).normalize();
    };
    syncLights();
    await wait(1.2, tk);
    ui.say("Ключ… Ну же. С третьего раза, мама говорила.", { sec: 3.5 });
    await wait(1.5, tk);
    a.starter(this.xyz(car.position), false);
    hl.intensity = 6;
    await wait(2.2, tk);
    hl.intensity = 0;
    ui.say("Давай… давай!", { sec: 2 });
    await wait(1.2, tk);
    a.starter(this.xyz(car.position), false);
    hl.intensity = 8;
    // в свете фар — оно
    const ahead = Vector3.TransformCoordinates(new Vector3(0, 0, -7), car.getWorldMatrix());
    e.place(new Vector3(ahead.x, car.position.y, ahead.z), 0, "Peek");
    e.faceTo(p.camera.position);
    this.scare("screech", 0.9);
    await wait(2.0, tk);
    hl.intensity = 0;
    e.hide();
    await wait(0.8, tk);
    a.starter(this.xyz(car.position), true);
    await wait(1.0, tk);
    this.engine = a.engine(this.xyz(car.position));
    hl.intensity = 40;
    // оно бежит на машину
    e.place(new Vector3(ahead.x, car.position.y, ahead.z), 0, "Run");
    e.faceTo(p.camera.position);
    a.scream(e.headXYZ(), 0.8);
    ui.say("Поехали!", { sec: 2 });
    // путь: от подъезда на дорогу и прочь со двора (координаты Blender)
    const path = [[5.0, -9.5], [5.0, -8.6], [7.5, -8.9], [12.0, -8.4], [12.0, 0], [12.0, 20], [12.0, 45]].map(([x, y]) => B(x, y, -6.3));
    let seg = 0, speed = 0, t = 0;
    const eStart = e.pos.clone();
    await until(() => {
      const dt = 1 / 60; t += dt;
      speed = Math.min(9, speed + dt * 3.5);
      this.engine.rev(1 + speed * 0.25);
      const target = path[seg + 1];
      const d = target.subtract(car.position); d.y = 0;
      const len = d.length();
      if (len < 0.3) { seg++; return seg >= path.length - 1; }
      car.position.addInPlace(d.scale(Math.min(len, speed * dt) / len));
      const want = Math.atan2(-d.x, -d.z);
      let dy = want - (car.rotation.y || 0); while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      if (car.rotationQuaternion) car.rotationQuaternion = null;
      car.rotation.y = (car.rotation.y || 0) + dy * Math.min(1, dt * 3);
      p.yaw = car.rotation.y;
      syncLights();
      // оно гонится и отстаёт
      if (e.visible) {
        const toCar = car.position.subtract(e.pos); toCar.y = 0;
        e.pos.addInPlace(toCar.normalize().scale(dt * 3.2));
        e.faceTo(car.position, 0.2);
        if (t > 3.5) e.hide();
      }
      return seg >= path.length - 1 || t > 14;
    }, tk);
    this.ended = true;
    ui.flash("#fff", 2.5, 0.9);
    await ui.fade(1, 2.0);
    this.stopLoopSounds();
    this.onEnding && this.onEnding();
  }
}
