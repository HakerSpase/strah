# Текстуры двора: фасады панелек (цвет + карта горящих окон) и ночное небо.
# Запуск: exec(open(r"C:\My_pc\strah\art\gen_exterior_tex.py", encoding="utf-8").read())
RUN_TEX = False
exec(open(r"C:\My_pc\strah\art\gen_textures.py", encoding="utf-8").read())

FLOORS, COLS = 5, 24
PLINTH, FLOOR_H = 1.6, 2.8
TOTAL_H = PLINTH + FLOORS * FLOOR_H


def fbm_wh(w, h, cx, cy, octaves, rng):
    """Неквадратный fbm: растягиваем квадратный шум."""
    n = fbm(max(w, h), cx, cy, octaves, rng)
    return n[:h, :w]


def facade(name, seed, lit_ratio=0.22, cols=None, size=(2048, 512)):
    global COLS
    COLS_SAVE = COLS
    if cols:
        COLS = cols
    rng = np.random.default_rng(seed)
    W, Hh = size
    y, x = np.mgrid[0:Hh, 0:W]
    u = x / W
    v = y / Hh                                   # 0 = низ здания
    zm = v * TOTAL_H
    floor_f = (zm - PLINTH) / FLOOR_H
    fi = np.floor(floor_f).astype(int)
    fv = floor_f - fi                            # 0..1 внутри этажа
    ci = np.floor(u * COLS).astype(int)
    cu = u * COLS - ci
    above = zm > PLINTH
    # бетонные панели
    base = np.array([0.50, 0.50, 0.47])
    n = fbm_wh(W, Hh, 64, 64, 5, rng)
    col = np.ones((Hh, W, 3)) * base * (0.8 + 0.35 * n)[..., None]
    # швы панелей (каждые 2 окна и каждый этаж)
    seam_v = (np.abs(((u * COLS / 2) % 1.0) - 0.0) < 0.004) | (np.abs(((u * COLS / 2) % 1.0) - 1.0) < 0.004)
    seam_h = above & ((fv < 0.012) | (fv > 0.988))
    col[seam_v | seam_h] *= 0.45
    # цоколь темнее
    col[~above] = col[~above] * 0.55
    # окна
    win = above & (cu > 0.22) & (cu < 0.78) & (fv > 0.28) & (fv < 0.80)
    frame = above & (cu > 0.20) & (cu < 0.80) & (fv > 0.26) & (fv < 0.82) & ~win
    stair = (ci % 8 == 4)                         # лестничная клетка: узкие окна между этажами
    swin = stair & above & (cu > 0.4) & (cu < 0.6) & (fv > 0.6) & (fv < 0.95)
    win = (win & ~stair) | swin
    frame = frame & ~stair
    col[frame] = np.array([0.62, 0.60, 0.55])
    glass = np.array([0.025, 0.028, 0.035])
    col[win] = glass
    # подтёки под окнами
    streak = fbm_wh(W, Hh, 256, 6, 3, rng)
    drip = above & (fv < 0.28) & (cu > 0.25) & (cu < 0.75) & (streak > 0.55)
    col[drip] *= np.array([0.7, 0.62, 0.52])
    grime = sstep(0.4, 0.9, fbm_wh(W, Hh, 8, 8, 5, rng))
    col *= (1 - grime * 0.35)[..., None]
    # горящие окна
    emit = np.zeros((Hh, W, 3))
    state = rng.random((FLOORS + 1, COLS + 1))
    hue = rng.random((FLOORS + 1, COLS + 1))
    curtain = rng.random((FLOORS + 1, COLS + 1))
    fcl = np.clip(fi, 0, FLOORS); ccl = np.clip(ci, 0, COLS)
    st = state[fcl, ccl]; hu = hue[fcl, ccl]; cr = curtain[fcl, ccl]
    warm = np.dstack([0.95 + 0 * hu, 0.55 + 0.2 * hu, 0.20 + 0.15 * hu])
    lit = win & ~stair & (st < lit_ratio)
    tv = win & ~stair & (st >= lit_ratio) & (st < lit_ratio + 0.03)
    # шторы: вертикальные складки и тёмные края
    folds = 0.75 + 0.25 * np.sin(cu * 70 + cr * 10)
    edge = np.clip(np.minimum(cu - 0.22, 0.78 - cu) * 12, 0, 1)
    k = (folds * (0.5 + 0.5 * edge))[..., None]
    emit[lit] = (warm * k)[lit] * np.where(cr[lit] > 0.6, 0.55, 1.0)[..., None]
    emit[tv] = np.array([0.18, 0.28, 0.55])
    emit[swin] = np.array([0.30, 0.36, 0.30]) * (state[fcl, ccl][swin] < 0.7)[..., None]
    # лампочки у подъездов
    ent = stair & (zm > 1.0) & (zm < 1.25) & (cu > 0.45) & (cu < 0.55)
    emit[ent] = np.array([1.0, 0.75, 0.4])
    col[lit | tv] = col[lit | tv] * 0.3 + emit[lit | tv] * 0.3
    save(name + "_albedo", col)
    save(name + "_emit", emit)
    COLS = COLS_SAVE


def sky():
    rng = np.random.default_rng(99)
    W, Hh = 2048, 1024
    y, x = np.mgrid[0:Hh, 0:W]
    u = x / W; v = y / Hh                        # v: 0 = низ, 0.5 = горизонт
    alt = (v - 0.5) * 2                          # -1..1
    top = np.array([0.035, 0.028, 0.032]); hor = np.array([0.16, 0.10, 0.07])
    t = np.clip(alt, 0, 1) ** 0.45
    col = (hor * (1 - t)[..., None] + top * t[..., None])
    # облака, подсвеченные городом снизу
    c = fbm_wh(W, Hh, 12, 6, 6, rng)
    cl = sstep(0.3, 0.7, c) * np.clip(1.2 - alt, 0, 1) * (alt > -0.02)
    col = col * (1 - cl[..., None] * 0.5) + np.array([0.13, 0.085, 0.055])[None, None] * cl[..., None] * np.clip(1 - alt * 1.5, 0.15, 1)[..., None]
    # горизонт: силуэты далёких домов с огоньками
    sil = np.zeros((Hh, W), bool)
    xpos = 0
    lights = np.zeros((Hh, W, 3))
    while xpos < W:
        bw = int(rng.integers(30, 140)); bh = rng.uniform(0.01, 0.06)
        x1 = min(W, xpos + bw)
        m = (x >= xpos) & (x < x1) & (alt < bh) & (alt > -0.2)
        sil |= m
        # окошки
        for _ in range(int(bw * bh * 30)):
            wx = int(rng.integers(xpos, max(xpos + 1, x1 - 1)))
            wy = int((0.5 + rng.uniform(0, bh) / 2) * Hh)
            if rng.random() < 0.5:
                lights[wy, wx] = np.array([0.9, 0.6, 0.3]) * rng.uniform(0.3, 1)
        xpos = x1 + int(rng.integers(0, 40))
    # труба ТЭЦ с красным огнём
    cx = int(W * 0.31)
    chim = (np.abs(x - cx) < 4) & (alt < 0.16) & (alt > -0.1)
    sil |= chim
    lights[int((0.5 + 0.16 / 2) * Hh) + 1, cx - 1:cx + 2] = np.array([1.0, 0.05, 0.02])
    col[sil] = np.array([0.008, 0.008, 0.01])
    col += lights
    col[alt < -0.02] = np.array([0.01, 0.009, 0.008])
    save("sky_albedo", col)
    save("sky_emit", col)


facade("facade_a", 1)
facade("facade_b", 2, 0.18)
facade("facade_c", 3, 0.26)
facade("facade_own", 4, 0.2, cols=4, size=(512, 768))
sky()
print("exterior textures ok")
