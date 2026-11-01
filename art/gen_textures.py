# Генерация бесшовных PBR-текстур (albedo / roughness / normal) прямо в Blender.
# Запуск: exec(open(r"C:\My_pc\strah\art\gen_textures.py", encoding="utf-8").read())
import os
import numpy as np
import bpy

OUT = r"C:\My_pc\strah\art\textures"
os.makedirs(OUT, exist_ok=True)
S = 1024


# ---------- шум ----------
def vnoise(size, cx, cy, rng):
    """Бесшовный value-noise: сетка cx*cy, растянутая до size*size."""
    g = rng.random((cy, cx))
    xs = np.arange(size) * cx / size
    ys = np.arange(size) * cy / size
    x0 = np.floor(xs).astype(int); fx = xs - x0; x1 = (x0 + 1) % cx
    y0 = np.floor(ys).astype(int); fy = ys - y0; y1 = (y0 + 1) % cy
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x1)]
    c = g[np.ix_(y1, x0)]; d = g[np.ix_(y1, x1)]
    fx = fx[None, :]; fy = fy[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(size, cx, cy, octaves, rng, gain=0.5):
    out = np.zeros((size, size)); amp = 1.0; tot = 0.0
    for _ in range(octaves):
        out += vnoise(size, min(cx, size), min(cy, size), rng) * amp
        tot += amp; amp *= gain; cx *= 2; cy *= 2
    return out / tot


def blur(a, r=2):
    for _ in range(r):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    return a


def sstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def cracks(size, n, rng, steps=400, width=1):
    m = np.zeros((size, size))
    for _ in range(n):
        x, y = rng.random() * size, rng.random() * size
        ang = rng.random() * 6.283
        for i in range(steps):
            ang += rng.normal(0, 0.35)
            x = (x + np.cos(ang) * 1.4) % size
            y = (y + np.sin(ang) * 1.4) % size
            m[int(y), int(x)] = 1.0
            if rng.random() < 0.01:  # ветвление
                ang += rng.choice([-1, 1]) * 0.9
    m = blur(m, width)
    return np.clip(m * 4, 0, 1)


def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, -dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def lerp(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return np.asarray(a) * (1 - t) + np.asarray(b) * t


def save(name, arr):
    if arr.ndim == 2:
        arr = np.dstack([arr, arr, arr])
    arr = np.clip(arr, 0, 1)
    h, w, _ = arr.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = arr
    img = bpy.data.images.get(name) or bpy.data.images.new(name, w, h, alpha=False)
    if img.size[0] != w:
        img.scale(w, h)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = os.path.join(OUT, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


def tex_set(name, albedo, rough, height, nstrength):
    save(name + "_albedo", albedo)
    save(name + "_rough", rough)
    save(name + "_normal", normal_from_height(height, nstrength))


yy, xx = np.mgrid[0:S, 0:S] / S  # 0..1, строка 0 = низ


# ---------- обои ----------
def wallpaper():
    rng = np.random.default_rng(14)
    rep = 8
    u = (xx * rep) % 1.0; v = (yy * rep * 0.75) % 1.0
    d = np.abs(u - 0.5) + np.abs(v - 0.5)
    ring = sstep(0.035, 0.0, np.abs(d - 0.32))
    petal = sstep(0.06, 0.0, np.abs(np.hypot(u - 0.5, v - 0.5) - 0.09))
    dot = sstep(0.05, 0.0, np.hypot(u - 0.5, v - 0.5))
    corner = sstep(0.06, 0.0, np.minimum(np.hypot(u, v), np.minimum(np.hypot(1 - u, v), np.minimum(np.hypot(u, 1 - v), np.hypot(1 - u, 1 - v)))) - 0.04)
    stripe = sstep(0.012, 0.0, np.abs(((xx * rep * 2) % 1.0) - 0.5) - 0.47)
    motif = np.clip(ring + petal * 0.8 + dot + corner * 0.7, 0, 1)
    base = np.array([0.66, 0.60, 0.43])
    col = lerp(base, [0.47, 0.40, 0.27], motif * 0.85)
    col = lerp(col, [0.50, 0.33, 0.28], stripe * 0.6)
    # старение
    n = fbm(S, 6, 6, 6, rng)
    col *= (0.82 + 0.3 * n)[..., None]
    stains = sstep(0.62, 0.72, fbm(S, 3, 3, 5, rng))
    edge = np.clip(stains - blur(stains, 6), 0, 1) * 3
    col = lerp(col, col * np.array([0.72, 0.58, 0.40]), stains * 0.6)
    col = lerp(col, [0.28, 0.20, 0.12], np.clip(edge, 0, 1) * 0.7)
    mold = sstep(0.74, 0.8, fbm(S, 10, 10, 5, rng)) * sstep(0.55, 0.7, fbm(S, 2, 2, 3, rng))
    col = lerp(col, [0.16, 0.17, 0.12], mold * 0.45)
    # стыки полотен (каждые 0.5 м) и отслоение
    seam = sstep(0.004, 0.0, np.abs(((xx * 2) % 1.0) - 0.0005))
    seam = np.maximum(seam, sstep(0.004, 0.0, np.abs(((xx * 2) % 1.0) - 0.9995)))
    peel = seam * sstep(0.55, 0.7, fbm(S, 1, 8, 4, rng))
    col = lerp(col, [0.20, 0.17, 0.13], seam * 0.6)
    fiber = fbm(S, 128, 128, 2, rng)
    rough = 0.82 + 0.1 * fiber - stains * 0.05
    height = fiber * 0.3 + motif * 0.25 - seam * 0.8 + blur(peel, 3) * 1.5
    tex_set("wallpaper", col, rough, height, 2.5)


# ---------- паркет ----------
def wood_grain(rng, cx=48, cy=3, rings=60.0):
    warp = fbm(S, 4, 2, 4, rng)
    g = fbm(S, cx, cy, 4, rng)
    r = 0.5 + 0.5 * np.sin((xx * rings + warp * 9.0 + g * 2.0) * 6.283)
    return g, r


def parquet():
    rng = np.random.default_rng(3)
    cols = 8; pw = S // cols; pl = S // 2
    tone = np.zeros((S, S)); gap = np.zeros((S, S)); plank_id = np.zeros((S, S))
    for c in range(cols):
        off = rng.integers(0, pl)
        x0, x1 = c * pw, (c + 1) * pw
        yl = (np.arange(S) + off) % pl
        idx = (np.arange(S) + off) // pl
        for k in np.unique(idx):
            rows = idx == k
            tone[rows, x0:x1] = rng.normal(0, 0.12)
            plank_id[rows, x0:x1] = rng.random()
        gy = (yl < 3) | (yl > pl - 3)
        gap[gy, x0:x1] = 1
        gap[:, x0:x0 + 2] = 1
    g, r = wood_grain(rng)
    base = np.array([0.40, 0.24, 0.12])
    col = base * (1 + tone)[..., None] * (0.75 + 0.35 * g)[..., None]
    col = lerp(col, col * 0.65, r * 0.5)
    wear = sstep(0.45, 0.75, fbm(S, 3, 3, 5, rng))
    col = lerp(col, col * np.array([1.35, 1.3, 1.2]), wear * 0.45)
    dirt = fbm(S, 20, 20, 4, rng)
    col *= (0.85 + 0.2 * dirt)[..., None]
    col = lerp(col, [0.05, 0.035, 0.02], blur(gap, 1))
    scratches = cracks(S, 40, rng, steps=120) * 0.5
    col = lerp(col, col * 1.3, scratches)
    rough = 0.38 + wear * 0.35 + gap * 0.4 + scratches * 0.2
    height = -blur(gap, 1) * 2 + r * 0.15 + g * 0.2 - scratches * 0.3
    tex_set("parquet", col, rough, height, 3.0)


# ---------- потолок ----------
def ceiling():
    rng = np.random.default_rng(21)
    n = fbm(S, 8, 8, 6, rng)
    col = np.ones((S, S, 3)) * np.array([0.80, 0.78, 0.72])
    col *= (0.88 + 0.18 * n)[..., None]
    st = fbm(S, 2, 2, 6, rng)
    stain = sstep(0.58, 0.66, st)
    ring = np.clip(stain - blur(stain, 8), 0, 1) * 4
    col = lerp(col, col * np.array([0.85, 0.72, 0.48]), stain * 0.7)
    col = lerp(col, [0.38, 0.27, 0.14], np.clip(ring, 0, 1) * 0.6)
    cr = cracks(S, 7, rng, steps=700)
    col = lerp(col, [0.22, 0.20, 0.18], cr * 0.8)
    soot = sstep(0.5, 0.8, fbm(S, 4, 4, 5, rng))
    col *= (1 - soot * 0.25)[..., None]
    rough = 0.93 + 0.05 * n
    height = n * 0.4 - cr * 1.0 + fbm(S, 64, 64, 3, rng) * 0.3
    tex_set("ceiling", col, rough, height, 2.0)


# ---------- крашеное дерево ----------
def painted_wood():
    rng = np.random.default_rng(7)
    streak = fbm(S, 64, 3, 4, rng)
    col = np.ones((S, S, 3)) * np.array([0.80, 0.77, 0.68])
    col *= (0.9 + 0.12 * streak)[..., None]
    yel = fbm(S, 3, 3, 5, rng)
    col = lerp(col, col * np.array([0.92, 0.85, 0.65]), yel)
    chip_n = fbm(S, 12, 12, 6, rng)
    chips = sstep(0.745, 0.76, chip_n)
    chip_edge = np.clip(sstep(0.73, 0.745, chip_n) - chips, 0, 1)
    g, r = wood_grain(rng, rings=40)
    wood = np.array([0.30, 0.20, 0.11]) * (0.7 + 0.4 * g)[..., None]
    col = lerp(col, wood, chips)
    col = lerp(col, col * 0.55, chip_edge * 0.8)
    grime = sstep(0.4, 0.9, fbm(S, 5, 5, 6, rng))
    col *= (1 - grime * 0.35)[..., None]
    rough = 0.45 + streak * 0.1 + chips * 0.35 + grime * 0.2
    height = streak * 0.25 - chips * 0.6
    tex_set("painted_wood", col, rough, height, 3.0)


# ---------- тёмное дерево мебели ----------
def dark_wood():
    rng = np.random.default_rng(11)
    g, r = wood_grain(rng, cx=64, cy=2, rings=28)
    col = np.array([0.24, 0.13, 0.065]) * (0.7 + 0.5 * g)[..., None]
    col = lerp(col, col * 0.55, r * 0.6)
    sc = cracks(S, 30, rng, steps=90) * 0.6
    col = lerp(col, col * 1.6, sc)
    dust = sstep(0.5, 0.9, fbm(S, 4, 4, 5, rng))
    col = lerp(col, [0.35, 0.32, 0.28], dust * 0.3)
    rough = 0.32 + sc * 0.3 + dust * 0.4
    height = r * 0.2 + g * 0.2 - sc * 0.4
    tex_set("dark_wood", col, rough, height, 2.5)


# ---------- ткань (плед) ----------
def fabric():
    rng = np.random.default_rng(5)
    def band(t, rep, w):
        return sstep(w, w * 0.6, np.abs(((t * rep) % 1.0) - 0.5))
    bx = band(xx, 6, 0.12); by = band(yy, 6, 0.12)
    tx = band(xx, 24, 0.06); ty = band(yy, 24, 0.06)
    col = np.ones((S, S, 3)) * np.array([0.42, 0.13, 0.11])
    col = lerp(col, [0.12, 0.20, 0.14], np.maximum(bx, by) * 0.85)
    col = lerp(col, [0.62, 0.55, 0.40], (tx * ty) * 0.6 + np.maximum(tx, ty) * 0.15)
    weave = 0.5 + 0.25 * np.sin(xx * S * 1.2) * np.sin(yy * S * 1.2)
    fz = fbm(S, 96, 96, 3, rng)
    col *= (0.75 + 0.3 * weave * fz + 0.1)[..., None]
    fade = fbm(S, 3, 3, 4, rng)
    col = lerp(col, col * np.array([1.15, 1.1, 1.05]), fade * 0.4)
    rough = np.full((S, S), 0.97)
    height = weave * 0.6 + fz * 0.4
    tex_set("fabric", col, rough, height, 2.0)


# ---------- линолеум ----------
def linoleum():
    rng = np.random.default_rng(9)
    rep = 4
    u = (xx * rep) % 1.0; v = (yy * rep) % 1.0
    grid = sstep(0.02, 0.008, np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v)))
    diamond = sstep(0.03, 0.0, np.abs(np.abs(u - 0.5) + np.abs(v - 0.5) - 0.35))
    inner = sstep(0.03, 0.0, np.abs(np.maximum(np.abs(u - 0.5), np.abs(v - 0.5)) - 0.12))
    mott = fbm(S, 40, 40, 4, rng)
    col = np.ones((S, S, 3)) * np.array([0.58, 0.48, 0.34])
    col *= (0.8 + 0.35 * mott)[..., None]
    col = lerp(col, [0.38, 0.22, 0.14], np.clip(diamond + inner, 0, 1) * 0.8)
    col = lerp(col, [0.30, 0.22, 0.15], grid * 0.7)
    wear = sstep(0.5, 0.8, fbm(S, 3, 3, 5, rng))
    col = lerp(col, [0.45, 0.40, 0.33], wear * 0.6)
    burns = sstep(0.82, 0.86, fbm(S, 16, 16, 4, rng))
    col = lerp(col, [0.08, 0.06, 0.05], burns * 0.8)
    rough = 0.55 + wear * 0.25
    height = mott * 0.2 - grid * 0.3 - burns * 0.3
    tex_set("linoleum", col, rough, height, 2.0)


# ---------- кафель ----------
def tiles():
    rng = np.random.default_rng(12)
    rep = 10
    u = (xx * rep) % 1.0; v = (yy * rep) % 1.0
    tid = (np.floor(xx * rep) * 31 + np.floor(yy * rep) * 17) % 97 / 97.0
    e = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    grout = sstep(0.04, 0.025, e)
    bevel = sstep(0.09, 0.04, e)
    col = np.ones((S, S, 3)) * np.array([0.86, 0.87, 0.84])
    col *= (0.93 + 0.1 * tid)[..., None]
    col = lerp(col, col * np.array([0.95, 0.9, 0.78]), fbm(S, 4, 4, 5, rng) * 0.6)
    gcol = np.array([0.33, 0.30, 0.25]) * (0.6 + 0.6 * fbm(S, 32, 32, 3, rng))[..., None]
    col = lerp(col, gcol, grout)
    cr = cracks(S, 6, rng, steps=150) * (tid > 0.8)
    col = lerp(col, [0.2, 0.2, 0.18], cr * 0.8)
    grease = sstep(0.55, 0.85, fbm(S, 3, 3, 5, rng))
    col = lerp(col, col * np.array([0.8, 0.7, 0.5]), grease * 0.6)
    rough = 0.12 + grout * 0.8 + grease * 0.25
    height = -grout * 1.0 - bevel * 0.4 - cr * 0.3
    tex_set("tiles", col, rough, height, 3.5)


# ---------- эмаль с ржавчиной ----------
def enamel():
    rng = np.random.default_rng(4)
    col = np.ones((S, S, 3)) * np.array([0.83, 0.81, 0.75])
    col *= (0.94 + 0.08 * fbm(S, 6, 6, 5, rng))[..., None]
    spots = sstep(0.70, 0.76, fbm(S, 10, 10, 6, rng))
    drip = np.clip(blur(spots, 2), 0, 1)
    streaks = sstep(0.45, 0.7, fbm(S, 64, 2, 2, rng))
    for k in range(1, 40):  # подтёки вниз (строка 0 = низ)
        drip = np.maximum(drip, np.roll(spots, -k * 3, 0) * (1 - k / 40) * streaks)
    rust = np.clip(drip, 0, 1)
    rcol = np.array([0.36, 0.17, 0.07]) * (0.6 + 0.6 * fbm(S, 40, 40, 4, rng))[..., None]
    col = lerp(col, rcol, rust * 0.85)
    grime = sstep(0.45, 0.9, fbm(S, 4, 4, 5, rng))
    col *= (1 - grime * 0.3)[..., None]
    rough = 0.3 + rust * 0.6 + grime * 0.2
    height = -spots * 0.8 + fbm(S, 64, 64, 2, rng) * 0.1
    tex_set("enamel", col, rough, height, 3.0)


# ---------- кожа сущности ----------
def skin():
    rng = np.random.default_rng(666)
    n = fbm(S, 6, 6, 7, rng)
    col = np.ones((S, S, 3)) * np.array([0.66, 0.62, 0.57])
    col *= (0.8 + 0.3 * n)[..., None]
    bruise = sstep(0.55, 0.8, fbm(S, 4, 4, 5, rng))
    col = lerp(col, [0.38, 0.30, 0.36], bruise * 0.7)
    rot = sstep(0.62, 0.8, fbm(S, 3, 3, 6, rng))
    col = lerp(col, [0.30, 0.31, 0.22], rot * 0.6)
    vn = fbm(S, 5, 5, 5, rng)
    veins = sstep(0.04, 0.0, np.abs(vn - 0.5)) * sstep(0.3, 0.6, fbm(S, 3, 3, 3, rng))
    vn2 = fbm(S, 12, 12, 4, rng)
    veins = np.maximum(veins, sstep(0.02, 0.0, np.abs(vn2 - 0.5)) * 0.45)
    col = lerp(col, [0.30, 0.26, 0.34], veins * 0.38)
    pores = fbm(S, 256, 256, 2, rng)
    wrink = fbm(S, 8, 96, 3, rng)
    col *= (0.92 + 0.1 * pores)[..., None]
    rough = 0.42 + 0.25 * n - bruise * 0.1
    height = veins * 0.6 + pores * 0.3 + wrink * 0.5
    tex_set("skin", col, rough, height, 3.0)


if globals().get("RUN_TEX", True):
    for fn in (wallpaper, parquet, ceiling, painted_wood, dark_wood, fabric, linoleum, tiles, enamel, skin):
        fn()
        print("ok", fn.__name__)
