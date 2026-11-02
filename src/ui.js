// HTML-интерфейс: затемнения, субтитры, цели, записки, экраны.
const $ = (id) => document.getElementById(id);

export const ui = {
  fade(to, sec = 1.2) {
    const f = $("fade");
    f.style.transition = `opacity ${sec}s ease`;
    f.style.opacity = to;
    return new Promise((r) => setTimeout(r, sec * 1000));
  },

  flash(color = "#fff", sec = 0.5, peak = 1) {
    const f = $("flash");
    f.style.background = color;
    f.style.transition = "none";
    f.style.opacity = peak;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transition = `opacity ${sec}s ease`;
      f.style.opacity = 0;
    }));
  },

  _subT: null,
  say(text, { voice = false, sec = 4 } = {}) {
    const s = $("subtitle");
    s.textContent = text;
    s.className = voice ? "voice" : "";
    s.style.opacity = 1;
    clearTimeout(this._subT);
    this._subT = setTimeout(() => (s.style.opacity = 0), sec * 1000);
  },

  objective(text, hint) {
    const o = $("objective");
    o.style.opacity = 0;
    setTimeout(() => {
      o.textContent = text || "";
      if (text && hint) { const h = document.createElement("span"); h.className = "hint-line"; h.textContent = hint; o.appendChild(h); }
      o.style.opacity = text ? 1 : 0;
    }, 700);
  },

  prompt(text) { $("prompt").textContent = text || ""; },

  hud(v) { $("hud").classList.toggle("hidden", !v); },
  clock(text) { $("clock").textContent = text; },

  noteOpen: false,
  showNote(text, child = false) {
    $("note-text").textContent = text;
    $("note-text").className = child ? "child" : "";
    $("note").classList.remove("hidden");
    this.noteOpen = true;
  },
  hideNote() { $("note").classList.add("hidden"); this.noteOpen = false; },

  show(id, v = true) { $(id).classList.toggle("hidden", !v); },

  async typewrite(id, text, cps = 28, token) {
    const el = $(id);
    el.textContent = "";
    for (const ch of text) {
      if (token && token.skip) { el.textContent = text; return; }
      el.textContent += ch;
      const pause = ch === "\n" ? 650 : ".,—…".includes(ch) ? 260 : 1000 / cps;
      await new Promise((r) => setTimeout(r, pause));
    }
  },
};
