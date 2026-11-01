import { Vector3 } from "@babylonjs/core";

// Координаты из Blender (x, y, z — Z вверх) в сцену Babylon (правосторонняя, Y вверх).
export const B = (x, y, z = 0) => new Vector3(x, z, -y);

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Игровые часы: паузы останавливают и таймеры сюжета.
export const clock = { t: 0, paused: false };

export class Cancelled extends Error {}

// Токен отмены для сценария петли: при смерти/перезапуске все ожидания прерываются.
export class Token {
  constructor() { this.dead = false; }
  check() { if (this.dead) throw new Cancelled(); }
  cancel() { this.dead = true; }
}

export function wait(sec, token) {
  const end = clock.t + sec;
  return new Promise((res, rej) => {
    const tick = () => {
      if (token && token.dead) return rej(new Cancelled());
      if (clock.t >= end) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
}

export function until(cond, token) {
  return new Promise((res, rej) => {
    const tick = () => {
      if (token && token.dead) return rej(new Cancelled());
      if (cond()) return res();
      requestAnimationFrame(tick);
    };
    tick();
  });
}
