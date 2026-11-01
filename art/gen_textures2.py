# Особые текстуры: ковёр, ночной дом за окном, фотографии, бумага.
# Запуск: exec(open(r"C:\My_pc\strah\art\gen_textures2.py", encoding="utf-8").read())
RUN_TEX = False
exec(open(r"C:\My_pc\strah\art\gen_textures.py", encoding="utf-8").read())


def grid(w, h):
    y, x = np.mgrid[0:h, 0:w]
    return x / w, y / h


def save_wh(name, arr):
    save(name, arr)


# ---------- ковёр на стену ----------
def carpet():
    rng = np.random.default_rng(1977)
    u, v = xx, yy
    # расстояние до края
    e = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    red = np.array([0.42, 0.05, 0.05]); navy = np.array([0.05, 0.07, 0.17])
    beige = np.array([0.72, 0.60, 0.40]); black = np.array([0.04, 0.03, 0.03])
    col = np.ones((S, S, 3)) * red
    # бордюры
    col = lerp(col, navy, sstep(0.085, 0.08, e) * sstep(0.03, 0.035, e))
    col = lerp(col, beige, sstep(0.034, 0.03, e) * sstep(0.02, 0.024, e))
    col = lerp(col, beige, sstep(0.095, 0.09, e) * sstep(0.085, 0.088, e))
    # узор в бордюре
    bu = (np.where(np.minimum(u, 1 - u) < np.minimum(v, 1 - v), v, u) * 18) % 1.0
    bord_m = sstep(0.06, 0.0, np.abs(np.abs(bu - 0.5) + np.abs((e - 0.0575) / 0.025) * 0.25 - 0.25))
    col = lerp(col, beige * 0.9, bord_m * (e > 0.036) * (e < 0.08))
    # центральный медальон
    cu, cv = (u - 0.5) * 1.4, (v - 0.5)
    dm = np.abs(cu) + np.abs(cv)
    col = lerp(col, navy, sstep(0.34, 0.33, dm) * (e > 0.1))
    col = lerp(col, beige, sstep(0.012, 0.0, np.abs(dm - 0.3)))
    col = lerp(col, red * 1.2, sstep(0.22, 0.21, dm))
    col = lerp(col, black, sstep(0.01, 0.0, np.abs(dm - 0.2)))
    star = np.abs(np.sin(np.arctan2(cv, cu) * 4)) * 0.08 + 0.06
    col = lerp(col, beige, sstep(0.01, 0.0, np.hypot(cu, cv) - star))
    # поле мелких ромбов
    fu = (u * 14) % 1.0; fv = (v * 10) % 1.0
    small = sstep(0.05, 0.0, np.abs(np.abs(fu - 0.5) + np.abs(fv - 0.5) - 0.25))
    field = (e > 0.1) & (dm > 0.35)
    col = lerp(col, navy * 1.5, small * field)
    # углы
    for cx, cy in ((0.1, 0.1), (0.9, 0.1), (0.1, 0.9), (0.9, 0.9)):
        dd = np.abs(u - cx) * 1.4 + np.abs(v - cy)
        col = lerp(col, navy, sstep(0.13, 0.12, dd) * (e > 0.09))
    # ворс и выцветание
    fz = fbm(S, 200, 200, 2, rng)
    col *= (0.7 + 0.45 * fz)[..., None]
    fade = sstep(0.3, 0.9, fbm(S, 3, 3, 4, rng))
    col = lerp(col, col * 1.25 + 0.04, fade * 0.5)
    dust = fbm(S, 6, 6, 5, rng)
    col *= (0.8 + 0.2 * dust)[..., None]
    rough = np.full((S, S), 0.98)
    height = fz * 0.8 + bord_m * 0.1
    tex_set("carpet", col, rough, height, 2.0)


# ---------- ночная панелька за окном ----------
def night_building():
    rng = np.random.default_rng(33)
    col = np.zeros((S, S, 3))
    sky = lerp(np.array([0.02, 0.025, 0.04]), np.array([0.07, 0.07, 0.09]), yy)
    sky *= (0.8 + 0.4 * fbm(S, 4, 2, 5, rng))[..., None]
    col[:] = sky
    # здание напротив: занимает низ 85%
    bmask = (yy < 0.85) & (xx > 0.05) & (xx < 0.95)
    wall = np.array([0.018, 0.018, 0.02]) * (0.8 + 0.4 * fbm(S, 30, 30, 3, rng))[..., None]
    col[bmask] = wall[bmask]
    cols, rows = 10, 9
    wu = ((xx - 0.05) / 0.9 * cols) % 1.0
    wv = (yy / 0.85 * rows) % 1.0
    ci = np.floor((xx - 0.05) / 0.9 * cols).astype(int)
    ri = np.floor(yy / 0.85 * rows).astype(int)
    win = bmask & (wu > 0.25) & (wu < 0.75) & (wv > 0.3) & (wv < 0.75)
    lit = rng.random((rows + 1, cols + 1))
    state = lit[np.clip(ri, 0, rows), np.clip(ci, 0, cols - 1)]
    wcol = np.where((state > 0.93)[..., None], np.array([0.85, 0.55, 0.22]), np.array([0.01, 0.012, 0.016]))
    wcol = np.where(((state > 0.905) & (state <= 0.93))[..., None], np.array([0.25, 0.35, 0.55]), wcol)
    # переплёт окна
    frame = (np.abs(wu - 0.5) < 0.012) | (np.abs(wv - 0.6) < 0.012)
    wcol = np.where(frame[..., None], np.array([0.01, 0.01, 0.01]), wcol)
    col[win] = wcol[win]
    tex_set("night", col, np.full((S, S), 1.0), np.zeros((S, S)), 0.0)


# ---------- фотографии ----------
def photo(name, scratched=False, girl_only=False):
    rng = np.random.default_rng(1998)
    col = np.ones((S, S, 3)) * np.array([0.55, 0.46, 0.34])
    col *= (0.75 + 0.35 * fbm(S, 3, 3, 5, rng))[..., None]
    # стена / комната на фоне
    col = lerp(col, col * 0.6, sstep(0.4, 0.2, yy))

    def person(cx, height, width, tone):
        nonlocal col
        top = 0.12 + height
        hy = top - width * 0.55
        head = sstep(0.012, -0.01, np.hypot((xx - cx) / 0.85, yy - hy) - width * 0.42)
        body_w = width * (0.55 + (hy - yy) * 0.9)
        body = sstep(0.012, -0.01, np.abs(xx - cx) - body_w) * (yy < hy - width * 0.35) * (yy > 0.0)
        col = lerp(col, np.array(tone), np.clip(body, 0, 1) * 0.9)
        col = lerp(col, np.array(tone) * 1.6, head * 0.95)
        # тёмные провалы глаз
        for ex in (-0.3, 0.3):
            eye = sstep(0.01, 0.0, np.hypot(xx - cx - ex * width * 0.5, yy - hy - width * 0.05) - width * 0.07)
            col = lerp(col, np.array([0.08, 0.06, 0.04]), eye * 0.85)
        return head, hy

    if girl_only:
        head, hy = person(0.5, 0.62, 0.2, [0.30, 0.24, 0.18])
        heads = [(0.5, hy, 0.2)]
    else:
        person(0.26, 0.74, 0.17, [0.20, 0.16, 0.12])   # мать
        person(0.52, 0.44, 0.13, [0.36, 0.28, 0.20])   # девочка
        person(0.74, 0.52, 0.14, [0.26, 0.22, 0.17])   # мальчик
        heads = [(0.52, 0.12 + 0.44 - 0.13 * 0.55, 0.13)]
    col = blur(col.transpose(2, 0, 1).reshape(3, S, S).transpose(1, 2, 0), 2) if False else col
    if scratched:
        for (cx, cy, w) in heads:
            m = np.zeros((S, S))
            for _ in range(60):
                a = rng.random() * 6.283; r0 = rng.random() * w * 0.7
                x0 = cx + np.cos(a) * r0; y0 = cy + np.sin(a) * r0
                b = rng.random() * 6.283
                for t in np.linspace(-w * 0.5, w * 0.5, 120):
                    px = int(((x0 + np.cos(b) * t) % 1) * S); py = int(((y0 + np.sin(b) * t) % 1) * S)
                    m[py, px] = 1
            m = np.clip(blur(m, 1) * 4, 0, 1)
            col = lerp(col, np.array([0.03, 0.02, 0.02]), m)
    # зерно, виньетка, сепия, потёртости
    col *= (0.85 + 0.25 * fbm(S, 256, 256, 1, rng))[..., None]
    vig = np.clip(1 - np.hypot(xx - 0.5, yy - 0.5) * 1.2, 0, 1)
    col *= (0.4 + 0.6 * vig)[..., None]
    scr = cracks(S, 25, rng, steps=80) * 0.4
    col = lerp(col, np.array([0.8, 0.75, 0.65]), scr)
    border = sstep(0.04, 0.035, np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy)))
    col = lerp(col, np.array([0.80, 0.76, 0.66]), border)
    save(name + "_albedo", col)


# ---------- тетрадный лист ----------
def paper():
    rng = np.random.default_rng(8)
    col = np.ones((S, S, 3)) * np.array([0.84, 0.82, 0.74])
    col *= (0.9 + 0.12 * fbm(S, 8, 8, 5, rng))[..., None]
    lines = sstep(0.003, 0.0, np.abs(((yy * 26) % 1.0) - 0.5) - 0.045)
    col = lerp(col, np.array([0.45, 0.55, 0.75]), lines * 0.4)
    margin = sstep(0.003, 0.0, np.abs(xx - 0.12))
    col = lerp(col, np.array([0.75, 0.3, 0.3]), margin * 0.5)
    # «почерк»
    ink = np.zeros((S, S))
    for row in range(3, 24):
        y = (row + 0.25) / 26
        x = 0.14
        end = 0.9 - rng.random() * 0.3
        while x < end:
            ph = rng.random() * 6.283
            for t in range(int(rng.integers(8, 30))):
                px = x + t * 0.0025
                py = y + 0.007 * np.sin(t * 1.3 + ph) + rng.normal(0, 0.0008)
                ink[int(np.clip(py, 0, 0.999) * S), int(np.clip(px, 0, 0.999) * S)] = 1
            x += 0.0025 * 30 + 0.012
    ink = np.clip(blur(ink, 1) * 3.5, 0, 1)
    col = lerp(col, np.array([0.10, 0.12, 0.30]), ink * 0.85)
    stain = sstep(0.6, 0.7, fbm(S, 2, 2, 5, rng))
    col = lerp(col, col * np.array([0.85, 0.75, 0.55]), stain * 0.6)
    save("paper_albedo", col)


for fn in (carpet, night_building, paper):
    fn(); print("ok", fn.__name__)
photo("photo_family"); photo("photo_family_scratched", scratched=True); photo("photo_girl", girl_only=True)
print("ok photos")
