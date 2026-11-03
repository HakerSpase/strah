# Квартира 14: стены, полы, потолки, двери, окна и вся мебель.
# Запуск: exec(open(r"C:\My_pc\strah\art\build_apartment.py", encoding="utf-8").read())
import math
import bpy
from mathutils import Euler, Matrix, Vector

exec(open(r"C:\My_pc\strah\art\lib.py", encoding="utf-8").read())

H = 2.7          # высота потолка
WT = 0.12        # толщина стены
DOOR_H = 2.05
SILL, WIN_TOP = 0.85, 2.25

ROOMS = {
    # имя: (xmin, xmax, ymin, ymax, стены, пол, потолок)
    "bed":     (-2.2, 2.2, -4.4, 0.0, "Wallpaper", "Parquet", "Ceiling"),
    "corr":    (-0.8, 0.8, 0.0, 12.0, "Wallpaper_Corr", "Parquet", "Ceiling"),
    "vest":    (-0.8, 0.8, 12.0, 13.4, "Paint_Green", "Linoleum", "Ceiling"),
    "mom":     (-4.4, -0.8, 1.0, 5.4, "Wallpaper_Mom", "Parquet", "Ceiling"),
    "bath":    (-2.8, -0.8, 6.4, 8.8, "Tiles", "Tiles_Floor", "Ceiling"),
    "kitchen": (0.8, 4.0, 7.4, 11.6, "Wallpaper_Kitchen", "Linoleum", "Ceiling"),
    "closet":  (0.8, 2.0, 4.0, 6.0, "Paint_Green", "Parquet", "Ceiling"),
    "kids":    (0.8, 4.0, 0.4, 4.0, "Wallpaper_Kids", "Parquet", "Ceiling"),
    "wc":      (-2.0, -0.8, 8.8, 10.2, "Tiles", "Tiles_Floor", "Ceiling"),
    "loggia":  (4.0, 5.3, 7.4, 11.6, "Concrete", "Concrete", "Concrete"),
    "stair":   (-1.6, 1.6, 13.4, 16.6, "Paint_Green", "Concrete", "Concrete"),
}

# стены: (ось, константа, от, до, [(a, b, тип)])  тип: door | window
WALLS = [
    ("y", -4.4, -2.2, 2.2, [(-0.7, 0.7, "window")]),
    ("x", -2.2, -4.4, 0.0, []),
    ("x", 2.2, -4.4, 0.0, []),
    ("y", 0.0, -2.2, 2.2, [(-0.45, 0.45, "door")]),
    ("x", -0.8, 0.0, 12.0, [(2.6, 3.5, "door"), (7.2, 7.95, "door"), (9.15, 9.8, "door")]),
    ("x", 0.8, 0.0, 12.0, [(1.3, 2.15, "door"), (4.35, 5.35, "door"), (8.3, 9.3, "door")]),
    ("y", 12.0, -0.8, 0.8, [(-0.45, 0.45, "door")]),
    ("x", -0.8, 12.0, 13.4, []),
    ("x", 0.8, 12.0, 13.4, []),
    ("y", 13.4, -1.6, 1.6, [(-0.45, 0.45, "door")]),
    ("x", -1.6, 13.4, 16.6, []),
    ("x", 1.6, 13.4, 16.6, []),
    ("y", 16.6, -1.6, 1.6, [(-0.6, 0.6, "window")]),
    ("y", 1.0, -4.4, -0.8, []),
    ("y", 5.4, -4.4, -0.8, []),
    ("x", -4.4, 1.0, 5.4, [(2.6, 3.8, "window")]),
    ("y", 6.4, -2.8, -0.8, []),
    ("y", 8.8, -2.8, -0.8, []),
    ("x", -2.8, 6.4, 8.8, []),
    ("y", 7.4, 0.8, 4.0, []),
    ("y", 11.6, 0.8, 4.0, []),
    ("x", 4.0, 7.4, 11.6, [(9.0, 10.2, "window"), (10.45, 11.2, "door")]),
    ("y", 4.0, 0.8, 4.0, []),
    ("y", 0.4, 0.8, 4.0, []),
    ("x", 4.0, 0.4, 4.0, [(1.6, 2.8, "window")]),
    ("y", 10.2, -2.0, -0.8, []),
    ("x", -2.0, 8.8, 10.2, []),
    ("y", 7.4, 4.0, 5.3, []),
    ("y", 11.6, 4.0, 5.3, []),
    ("x", 5.3, 7.4, 11.6, [(7.5, 11.5, "open")]),
    ("y", 6.0, 0.8, 2.0, []),
    ("x", 2.0, 4.0, 6.0, []),
]


def room_at(x, y):
    for k, (x0, x1, y0, y1, *_rest) in ROOMS.items():
        if x0 <= x <= x1 and y0 <= y <= y1:
            return k
    return None


def wall_mat(f):
    c = f.calc_center_median() + f.normal * 0.07
    r = room_at(c.x, c.y)
    return ROOMS[r][4] if r else "Wallpaper"


def wbox(B, axis, c, a, b, z0, z1, mat, off0=-WT / 2, off1=WT / 2, bevel=0.0):
    """Коробка вдоль стены: a..b вдоль оси стены, off0..off1 поперёк, z0..z1."""
    if axis == "y":   # стена с постоянным y, тянется вдоль x
        B.box((a, c + off0, z0), (b, c + off1, z1), mat, bevel=bevel)
    else:
        B.box((c + off0, a, z0), (c + off1, b, z1), mat, bevel=bevel)


def side_rooms(axis, c, a, b):
    m = (a + b) / 2
    res = []
    for s in (-1, 1):
        p = (m, c + s * 0.3) if axis == "y" else (c + s * 0.3, m)
        res.append((s, room_at(*p)))
    return res


col_arch = get_collection("Apartment")
col_dyn = get_collection("Dynamic")
col_mark = get_collection("Markers")

# ======================= АРХИТЕКТУРА =======================
A = Builder("Architecture", collection=col_arch)
CB = Builder("Colliders", collection=col_arch)      # невидимые простые коробки для столкновений


def colbox(lo, hi):
    CB.box(lo, hi, "Black")

for axis, c, a0, a1, holes in WALLS:
    holes = sorted(holes)
    cuts = [a0 - WT / 2]
    for (ha, hb, t) in holes:
        cuts += [ha, hb]
    cuts.append(a1 + WT / 2)
    # сплошные куски
    for i in range(0, len(cuts), 2):
        wbox(A, axis, c, cuts[i], cuts[i + 1], 0, H, wall_mat)
        wbox(CB, axis, c, cuts[i], cuts[i + 1], 0, H, "Black")
    for (ha, hb, t) in holes:
        if t == "door":
            wbox(A, axis, c, ha, hb, DOOR_H, H, wall_mat)
        elif t == "open":
            wbox(A, axis, c, ha, hb, 0, 1.0, wall_mat)
            wbox(A, axis, c, ha, hb, 1.0, 1.06, "Concrete", -WT / 2 - 0.03, WT / 2 + 0.03, bevel=0.01)
            wbox(A, axis, c, ha, hb, 2.45, H, wall_mat)
            wbox(CB, axis, c, ha, hb, 0, 1.2, "Black")
        else:
            wbox(CB, axis, c, ha, hb, 0, SILL + 0.1, "Black")
            wbox(A, axis, c, ha, hb, 0, SILL, wall_mat)
            wbox(A, axis, c, ha, hb, WIN_TOP, H, wall_mat)
    # плинтусы по обе стороны
    sides = side_rooms(axis, c, a0, a1)
    for s, r in sides:
        if r is None or r == "bath":
            continue
        o0 = s * WT / 2
        o1 = o0 + s * 0.018
        segs = [(cuts[i], cuts[i + 1]) for i in range(0, len(cuts), 2)]
        for (sa, sb) in segs:
            sa2, sb2 = max(sa, ROOMS[r][0] if axis == "y" else ROOMS[r][2]), min(sb, ROOMS[r][1] if axis == "y" else ROOMS[r][3])
            if sb2 - sa2 > 0.05:
                wbox(A, axis, c, sa2, sb2, 0, 0.075, "DarkWood", off0=min(o0, o1), off1=max(o0, o1), bevel=0.004)
        for (ha, hb, t) in holes:
            if t == "window":
                wbox(A, axis, c, ha, hb, 0, 0.075, "DarkWood", off0=min(o0, o1), off1=max(o0, o1), bevel=0.004)

# полы и потолки
for k, (x0, x1, y0, y1, wm, fm, cm) in ROOMS.items():
    if k == "stair":
        A.box((x0, y0, -0.1), (x1, 14.7, 0.0), fm)
        CB.box((x0, y0, -0.3), (x1, 14.7, 0.0), "Black")
        A.box((x0, y0, H), (x1, y1, H + 0.1), cm)
        continue
    A.box((x0, y0, -0.1), (x1, y1, 0.0), fm)
    CB.box((x0, y0, -0.3), (x1, y1, 0.0), "Black")
    A.box((x0, y0, H), (x1, y1, H + 0.1), cm)
# лестничный пролёт вниз (правая половина) и вверх (левая), перила
for i in range(7):
    y0 = 14.7 + i * 0.27
    A.box((0.05, y0, -0.17 * (i + 1) - 0.12), (1.55, y0 + 0.27, -0.17 * (i + 1)), "Concrete", bevel=0.01)
    A.box((-1.55, y0, 0.17 * i), (-0.05, y0 + 0.27, 0.17 * (i + 1)), "Concrete", bevel=0.01)
A.box((-0.05, 14.7, -1.3), (0.05, 16.6, 2.7), "Paint_Green")
for i in range(9):
    A.cyl((0.1, 14.75 + i * 0.22, 0.5 - i * 0.12), 0.012, 0.9, "Metal", segs=6)
A.cyl((0.1, 15.6, 0.95 - 0.5), 0.03, 2.2, "DarkWood", axis="Y", segs=8, rot=Euler((-0.55, 0, 0)).to_matrix())
CB.box((0.05, 14.7, -1.4), (1.55, 16.6, -0.6), "Black")
CB.box((-1.6, 14.7, 0.0), (0.0, 16.6, 1.4), "Black")
# почтовые ящики и надписи
for r in range(3):
    for c in range(4):
        A.box((-1.6 + 0.06, 13.6 + c * 0.22, 1.2 + r * 0.25), (-1.6 + 0.2, 13.8 + c * 0.22, 1.42 + r * 0.25), "PipeGreen", bevel=0.005)
A.box((1.53, 13.8, 1.0), (1.535, 14.5, 1.5), "Drawing3", uv="fit")
# полы в дверных проёмах + пороги
for axis, c, a0, a1, holes in WALLS:
    for (ha, hb, t) in holes:
        if t != "door":
            continue
        wbox(A, axis, c, ha, hb, -0.1, 0.0, "Parquet" if c != 4.0 else "Concrete")
        wbox(A, axis, c, ha, hb, 0.0, 0.018, "DarkWood", off0=-WT / 2 - 0.01, off1=WT / 2 + 0.01, bevel=0.006)

# наличники и откосы дверей
for axis, c, a0, a1, holes in WALLS:
    for (ha, hb, t) in holes:
        if t != "door":
            continue
        for s in (-1, 1):
            o0 = s * WT / 2; o1 = o0 + s * 0.02
            lo, hi = min(o0, o1), max(o0, o1)
            wbox(A, axis, c, ha - 0.075, ha, 0, DOOR_H + 0.075, "PaintedWood", lo, hi, bevel=0.006)
            wbox(A, axis, c, hb, hb + 0.075, 0, DOOR_H + 0.075, "PaintedWood", lo, hi, bevel=0.006)
            wbox(A, axis, c, ha - 0.075, hb + 0.075, DOOR_H, DOOR_H + 0.075, "PaintedWood", lo, hi, bevel=0.006)
        wbox(A, axis, c, ha, ha + 0.02, 0, DOOR_H, "PaintedWood")
        wbox(A, axis, c, hb - 0.02, hb, 0, DOOR_H, "PaintedWood")
        wbox(A, axis, c, ha, hb, DOOR_H - 0.02, DOOR_H, "PaintedWood")

# окна
for axis, c, a0, a1, holes in WALLS:
    for (ha, hb, t) in holes:
        if t != "window":
            continue
        sides = dict(side_rooms(axis, c, ha, hb))
        ins = -1 if sides.get(-1) else 1     # сторона комнаты
        out = -ins
        # подоконник
        wbox(A, axis, c, ha - 0.06, hb + 0.06, SILL - 0.03, SILL + 0.01, "PaintedWood",
             *sorted((0.0, ins * (WT / 2 + 0.2))), bevel=0.008)
        # откосы
        wbox(A, axis, c, ha, ha + 0.02, SILL, WIN_TOP, "PaintedWood")
        wbox(A, axis, c, hb - 0.02, hb, SILL, WIN_TOP, "PaintedWood")
        wbox(A, axis, c, ha, hb, WIN_TOP - 0.02, WIN_TOP, "PaintedWood")
        # две рамы (внутренняя и наружная) с переплётом
        for depth in (ins * 0.035, out * 0.035):
            d0, d1 = sorted((depth - 0.025, depth + 0.025))
            fw = 0.055
            wbox(A, axis, c, ha + 0.02, hb - 0.02, SILL, SILL + fw, "PaintedWood", d0, d1, bevel=0.004)
            wbox(A, axis, c, ha + 0.02, hb - 0.02, WIN_TOP - 0.02 - fw, WIN_TOP - 0.02, "PaintedWood", d0, d1, bevel=0.004)
            wbox(A, axis, c, ha + 0.02, ha + 0.02 + fw, SILL, WIN_TOP - 0.02, "PaintedWood", d0, d1, bevel=0.004)
            wbox(A, axis, c, hb - 0.02 - fw, hb - 0.02, SILL, WIN_TOP - 0.02, "PaintedWood", d0, d1, bevel=0.004)
            mid = (ha + hb) / 2
            wbox(A, axis, c, mid - fw / 2, mid + fw / 2, SILL, WIN_TOP - 0.02, "PaintedWood", d0, d1, bevel=0.004)
            wbox(A, axis, c, ha + 0.02, hb - 0.02, 1.78, 1.78 + fw * 0.8, "PaintedWood", d0, d1, bevel=0.004)
        # чугунная батарея под окном
        n = int((hb - ha - 0.3) / 0.085)
        st = (ha + hb) / 2 - n * 0.085 / 2
        for i in range(n):
            o = ins * (WT / 2 + 0.09)
            wbox(A, axis, c, st + i * 0.085 + 0.006, st + (i + 1) * 0.085 - 0.006, 0.12, 0.70, "Enamel",
                 *sorted((o - 0.04, o + 0.04)), bevel=0.018)
        for zz in (0.18, 0.64):
            o = ins * (WT / 2 + 0.09)
            if axis == "y":
                A.cyl((st + n * 0.085 / 2, c + o, zz), 0.018, n * 0.085 + 0.06, "Enamel", axis="X", segs=10)
            else:
                A.cyl((c + o, st + n * 0.085 / 2, zz), 0.018, n * 0.085 + 0.06, "Enamel", axis="Y", segs=10)

A.finish()
print("architecture ok")


# ---------------- выключатели света ----------------
def switch(name, x, y, normal):
    """Советский выключатель-клавиша. normal — куда смотрит лицевая сторона: '+x','-x','+y','-y'."""
    S = Builder(name, origin=(x, y, 1.35), collection=col_dyn)
    d = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[normal]
    if d[0]:
        S.box((x - 0.012 * (d[0] < 0), y - 0.04, 1.29), (x + 0.012 * (d[0] > 0), y + 0.04, 1.41), "Enamel", bevel=0.006)
        S.box((x + d[0] * 0.012, y - 0.022, 1.32), (x + d[0] * 0.022, y + 0.022, 1.38), "Enamel", bevel=0.004)
    else:
        S.box((x - 0.04, y - 0.012 * (d[1] < 0), 1.29), (x + 0.04, y + 0.012 * (d[1] > 0), 1.41), "Enamel", bevel=0.006)
        S.box((x - 0.022, y + d[1] * 0.012, 1.32), (x + 0.022, y + d[1] * 0.022, 1.38), "Enamel", bevel=0.004)
    S.finish()


switch("Switch_Bed", 0.62, -0.06, "-y")
switch("Switch_Corr", 0.74, 0.35, "-x")
switch("Switch_Kids", 0.86, 1.15, "+x")
switch("Switch_Mom", -0.86, 2.45, "-x")
switch("Switch_Bath", -0.74, 7.05, "+x")
switch("Switch_WC", -0.74, 9.0, "+x")
switch("Switch_Kitchen", 0.86, 8.15, "+x")


# ======================= ДВЕРИ =======================
def door(name, axis, c, ha, hb, open_dir, kind="glass", into=1, hinge_end=False):
    """Дверное полотно с петлёй в начале проёма. Строится в локальных координатах:
    полотно вдоль +X, толщина по Y, затем объект поворачивается под стену."""
    w = (hb - ha) - 0.045
    hinge_a = ha + 0.022
    B = Builder(name, local=True, collection=col_dyn)
    t = 0.02
    if kind == "front":
        B.box((0, -0.03, 0.005), (w, 0.03, 2.0), "PaintedWood", bevel=0.004)
        # дерматин с пуговицами со стороны коридора (-Y)
        B.soft_box((0.04, -0.06, 0.05), (w - 0.04, -0.03, 1.96), "Leatherette", cuts=4, round_=0.05, noise_amp=0.004)
        for row in range(7):
            for col_ in range(3 if row % 2 == 0 else 2):
                x = w / 2 + (col_ - (1 if row % 2 == 0 else 0.5)) * 0.24
                B.sphere((x, -0.062, 0.28 + row * 0.24), 0.012, "Brass", scale=(1, 0.6, 1), segs=8, rings=5)
        for z in (0.06, 1.95):
            B.cyl((w / 2, -0.062, z), 0.006, w - 0.08, "Brass", axis="X", segs=6)
        B.cyl((w - 0.09, -0.07, 1.0), 0.03, 0.012, "Brass", axis="Y", segs=16)
        B.box((w - 0.19, -0.095, 0.99), (w - 0.08, -0.075, 1.01), "Brass", bevel=0.005)
        B.cyl((w / 2, -0.065, 1.55), 0.012, 0.02, "Chrome", axis="Y", segs=12)   # глазок
        B.box((w - 0.1, -0.068, 0.82), (w - 0.07, -0.06, 0.9), "Brass", bevel=0.003)  # личинка замка
    elif kind == "metal":
        B.box((0, -0.03, 0.005), (w, 0.03, 2.0), "Enamel_Brown", bevel=0.006)
        for s in (-1, 1):
            B.box((0.08, s * 0.03 - 0.004, 0.1), (w - 0.08, s * 0.03 + 0.004, 1.9), "Enamel_Brown", bevel=0.003)
        B.cyl((w - 0.09, -0.04, 1.0), 0.03, 0.02, "Metal", axis="Y")
        B.cyl((w - 0.09, 0.04, 1.0), 0.03, 0.02, "Metal", axis="Y")
    else:
        sw = 0.1
        B.box((0, -t, 0.005), (sw, t, 2.0), "PaintedWood", bevel=0.004)
        B.box((w - sw, -t, 0.005), (w, t, 2.0), "PaintedWood", bevel=0.004)
        B.box((sw, -t, 0.005), (w - sw, t, 0.2), "PaintedWood", bevel=0.004)
        B.box((sw, -t, 0.95), (w - sw, t, 1.1), "PaintedWood", bevel=0.004)
        B.box((sw, -t, 1.88), (w - sw, t, 2.0), "PaintedWood", bevel=0.004)
        B.box((sw, -0.008, 0.2), (w - sw, 0.008, 0.95), "PaintedWood", bevel=0.003)
        if kind == "glass":
            B.box((sw, -0.003, 1.1), (w - sw, 0.003, 1.88), "Glass_Frosted")
        else:
            B.box((sw, -0.008, 1.1), (w - sw, 0.008, 1.88), "PaintedWood", bevel=0.003)
        # штапики вокруг филёнок
        for (z0, z1) in ((0.2, 0.95), (1.1, 1.88)):
            for s in (-1, 1):
                y0, y1 = sorted((s * 0.008, s * 0.016))
                B.box((sw, y0, z0), (w - sw, y1, z0 + 0.015), "PaintedWood", bevel=0.003)
                B.box((sw, y0, z1 - 0.015), (w - sw, y1, z1), "PaintedWood", bevel=0.003)
                B.box((sw, y0, z0), (sw + 0.015, y1, z1), "PaintedWood", bevel=0.003)
                B.box((w - sw - 0.015, y0, z0), (w - sw, y1, z1), "PaintedWood", bevel=0.003)
        for s in (-1, 1):
            B.cyl((w - 0.06, s * 0.026, 1.0), 0.026, 0.012, "Brass", axis="Y", segs=16)
            B.box((w - 0.17, s * 0.045 - 0.008, 0.992), (w - 0.06, s * 0.045 + 0.008, 1.008), "Brass", bevel=0.006)
            B.cyl((w - 0.06, s * 0.036, 1.0), 0.008, 0.02, "Brass", axis="Y", segs=8)
    # петли
    for z in (0.25, 1.75):
        B.cyl((0.0, 0.0, z), 0.009, 0.1, "Brass", segs=8)
    ob = B.finish()
    if axis == "y":
        ob.location = (hinge_a, c, 0)
        ob.rotation_euler = (0, 0, 0)
    elif hinge_end:   # петля в конце проёма: полотно идёт назад, к началу
        ob.location = (c, hb - 0.022, 0)
        ob.rotation_euler = (0, 0, -math.pi / 2)
    else:
        ob.location = (c, hinge_a, 0)
        ob.rotation_euler = (0, 0, math.pi / 2)
    ob["open_dir"] = open_dir
    ob["width"] = w
    return ob


door("Door_Bedroom", "y", 0.0, -0.45, 0.45, -1, "glass")
door("Door_Mom", "x", -0.8, 2.6, 3.5, 1, "glass")
door("Door_Bath", "x", -0.8, 7.2, 7.95, 1, "panel")
door("Door_Closet", "x", 0.8, 4.35, 5.35, -1, "panel", hinge_end=True)   # петля у дальнего края: из коридора проём сразу открыт
door("Door_Front", "y", 12.0, -0.45, 0.45, 1, "front")
door("Door_Outer", "y", 13.4, -0.45, 0.45, 1, "metal")
door("Door_Kids", "x", 0.8, 1.3, 2.15, -1, "glass")
door("Door_WC", "x", -0.8, 9.15, 9.8, 1, "panel")
door("Door_Loggia", "x", 4.0, 10.45, 11.2, -1, "glass")
print("doors ok")


# ======================= МЕБЕЛЬ =======================
def chair(B, x, y, rot=0.0, mat="DarkWood"):
    R = Euler((0, 0, rot)).to_matrix()
    def bx(lo, hi, bev=0.006):
        lo = Vector(lo); hi = Vector(hi)
        B.box((x + lo.x, y + lo.y, lo.z), (x + hi.x, y + hi.y, hi.z), mat, bevel=bev, rot=R, pivot=(x, y, 0))
    for sx in (-1, 1):
        for sy in (-1, 1):
            bx((sx * 0.19 - 0.018, sy * 0.19 - 0.018, 0), (sx * 0.19 + 0.018, sy * 0.19 + 0.018, 0.44))
    bx((-0.22, -0.22, 0.44), (0.22, 0.22, 0.475), 0.01)
    for sx in (-1, 1):
        bx((sx * 0.19 - 0.016, 0.19 - 0.016, 0.475), (sx * 0.19 + 0.016, 0.19 + 0.02, 0.95))
    bx((-0.2, 0.18, 0.72), (0.2, 0.215, 0.92), 0.01)
    bx((-0.19, -0.19, 0.12), (0.19, -0.17, 0.15))
    bx((-0.19, 0.17, 0.12), (0.19, 0.19, 0.15))


# ---------- СПАЛЬНЯ ----------
B = Builder("Bedroom_Furniture", collection=col_arch)
# кровать вдоль правой стены, изголовье у окна
bx0, bx1, by0, by1 = 1.18, 2.12, -4.3, -2.2
for (x, y) in ((bx0 + 0.03, by0 + 0.03), (bx1 - 0.03, by0 + 0.03), (bx0 + 0.03, by1 - 0.03), (bx1 - 0.03, by1 - 0.03)):
    B.box((x - 0.03, y - 0.03, 0), (x + 0.03, y + 0.03, 0.42), "DarkWood", bevel=0.008)
B.box((bx0, by0, 0.42), (bx1, by0 + 0.04, 1.05), "DarkWood", bevel=0.012)    # изголовье
B.box((bx0, by1 - 0.04, 0.42), (bx1, by1, 0.75), "DarkWood", bevel=0.012)    # изножье
B.box((bx0, by0, 0.30), (bx0 + 0.03, by1, 0.42), "DarkWood", bevel=0.006)
B.box((bx1 - 0.03, by0, 0.30), (bx1, by1, 0.42), "DarkWood", bevel=0.006)
B.soft_box((bx0 + 0.04, by0 + 0.05, 0.36), (bx1 - 0.04, by1 - 0.05, 0.52), "Linen", cuts=6, round_=0.2, noise_amp=0.006)
B.soft_box((bx0 + 0.12, by0 + 0.08, 0.5), (bx1 - 0.12, by0 + 0.5, 0.64), "Linen", cuts=6, round_=0.9, noise_amp=0.015, seed=2)
B.soft_box((bx0 - 0.02, by0 + 0.55, 0.47), (bx1 + 0.02, by1 - 0.02, 0.58), "Fabric", cuts=10, round_=0.15,
           noise_amp=0.03, noise_scale=4.0, sag=0.05, seed=3)
# ковёр на стене над кроватью
B.box((2.12, -4.1, 0.65), (2.14, -1.9, 2.15), "Carpet", uv="fit")
# ковёр на полу
B.box((-0.9, -3.5, 0.0), (0.9, -1.0, 0.008), "Carpet", uv="fit")
# прикроватная тумбочка
B.box((0.62, -4.32, 0.0), (1.12, -3.92, 0.55), "DarkWood", bevel=0.01)
B.box((0.66, -3.925, 0.3), (1.08, -3.91, 0.5), "DarkWood", bevel=0.004)
B.cyl((0.87, -3.9, 0.4), 0.008, 0.03, "Brass", axis="Y", segs=8)
# настольная лампа
B.cyl((0.78, -4.15, 0.565), 0.07, 0.03, "Bakelite", segs=20)
B.cyl((0.78, -4.15, 0.75), 0.008, 0.35, "Brass", segs=8)
B.cyl((0.78, -4.15, 0.95), 0.08, 0.16, "Lampshade", r2=0.13, segs=24)
# платяной шкаф (корпус, двери отдельно)
wx0, wx1, wy0, wy1 = -2.14, -1.52, -1.75, -0.45
B.box((wx0, wy0, 0.08), (wx1, wy0 + 0.02, 2.1), "DarkWood", bevel=0.004)
B.box((wx0, wy1 - 0.02, 0.08), (wx1, wy1, 2.1), "DarkWood", bevel=0.004)
B.box((wx0, wy0, 0.08), (wx0 + 0.02, wy1, 2.1), "DarkWood")
B.box((wx0, wy0, 0.08), (wx1, wy1, 0.1), "DarkWood")
B.box((wx0 - 0.01, wy0 - 0.02, 2.1), (wx1 + 0.03, wy1 + 0.02, 2.16), "DarkWood", bevel=0.01)
B.box((wx0, wy0 + 0.02, 1.75), (wx1 - 0.03, wy1 - 0.02, 1.77), "DarkWood")
B.cyl(((wx0 + wx1) / 2, (wy0 + wy1) / 2, 1.6), 0.012, wy1 - wy0 - 0.04, "Chrome", axis="Y", segs=8)
for (x, y) in ((wx0 + 0.04, wy0 + 0.04), (wx1 - 0.04, wy0 + 0.04), (wx0 + 0.04, wy1 - 0.04), (wx1 - 0.04, wy1 - 0.04)):
    B.cyl((x, y, 0.04), 0.025, 0.08, "DarkWood", r2=0.018, segs=10)
# платье девочки в шкафу
B.cyl(((wx0 + wx1) / 2, -1.1, 1.58), 0.004, 0.18, "Chrome", axis="X", segs=6)
B.soft_box(((wx0 + wx1) / 2 - 0.05, -1.3, 0.85), ((wx0 + wx1) / 2 + 0.05, -0.9, 1.55), "Fabric",
           cuts=6, round_=0.4, noise_amp=0.03, seed=9)
# стул у окна с наброшенной одеждой
chair(B, -1.3, -3.7, rot=0.6)
B.soft_box((-1.5, -3.85, 0.47), (-1.1, -3.45, 0.56), "Coat", cuts=6, round_=0.3, noise_amp=0.04, seed=4)
B.finish()

# двери шкафа: петли на краях, открываются наружу (+X). Филёнка всегда снаружи.
for nm, y_h, rz, face, odir in (("Wardrobe_DoorL", wy0 + 0.01, math.pi / 2, -1, -1),
                                ("Wardrobe_DoorR", wy1 - 0.01, -math.pi / 2, 1, 1)):
    D = Builder(nm, local=True, collection=col_dyn)
    dw = (wy1 - wy0) / 2 - 0.012
    D.box((0, -0.01, 0.1), (dw, 0.01, 2.08), "DarkWood", bevel=0.004)
    f0, f1 = sorted((face * 0.008, face * 0.016))
    D.box((0.06, f0, 0.25), (dw - 0.06, f1, 1.9), "DarkWood", bevel=0.006)
    D.cyl((dw - 0.05, face * 0.03, 1.1), 0.006, 0.15, "Chrome", segs=8)
    for z in (1.025, 1.165):
        h0, h1 = sorted((face * 0.012, face * 0.03))
        D.box((dw - 0.056, h0, z), (dw - 0.044, h1, z + 0.01), "Chrome")
    ob = D.finish()
    ob.location = (wx1 + 0.012, y_h, 0)
    ob.rotation_euler = (0, 0, rz)
    ob["open_dir"] = odir
print("bedroom ok")

# ---------- КОРИДОР ----------
B = Builder("Corridor_Furniture", collection=col_arch)
# вешалка с пальто
B.box((0.72, 10.0, 1.62), (0.78, 11.5, 1.75), "DarkWood", bevel=0.008)
B.box((0.48, 10.0, 1.88), (0.78, 11.5, 1.9), "DarkWood", bevel=0.005)
for i, y in enumerate((10.2, 10.5, 10.85, 11.2)):
    B.cyl((0.68, y, 1.69), 0.007, 0.08, "Brass", axis="X", segs=6)
    if i != 2:
        B.soft_box((0.45, y - 0.22, 0.75), (0.7, y + 0.22, 1.66), "Coat", cuts=8, round_=0.35,
                   noise_amp=0.035, noise_scale=3.0, seed=10 + i)
B.soft_box((0.5, 10.55, 1.9), (0.74, 10.85, 2.0), "Coat", cuts=4, round_=0.7, noise_amp=0.01, seed=20)
# обувь
for i, y in enumerate((10.1, 10.35, 10.6, 11.0)):
    B.soft_box((0.45 + (i % 2) * 0.05, y, 0.0), (0.72, y + 0.11, 0.1), "Bakelite", cuts=3, round_=0.6, noise_amp=0.005, seed=30 + i)
# трюмо с зеркалом слева
B.box((-0.78, 9.9, 0.0), (-0.42, 10.7, 0.75), "DarkWood", bevel=0.01)
B.box((-0.42, 9.95, 0.35), (-0.415, 10.65, 0.7), "DarkWood")
B.box((-0.79, 9.98, 0.85), (-0.76, 10.62, 1.95), "DarkWood", bevel=0.008)
# телефонная тумбочка
B.box((0.36, 5.95, 0.0), (0.78, 6.75, 0.72), "DarkWood", bevel=0.01)
B.box((0.355, 6.0, 0.08), (0.36, 6.7, 0.62), "DarkWood")
# фотографии в рамках
for nm, (x, y, z, mat) in {"P1": (-0.8, 4.2, 1.55, "Photo_Family"), "P2": (-0.8, 4.75, 1.45, "Photo_Girl"),
                           "P3": (0.8, 3.2, 1.5, "Photo_Girl"), "P4": (0.8, 7.0, 1.5, "Photo_Family")}.items():
    s = 1 if x < 0 else -1
    B.box((x + s * 0.06, y - 0.17, z - 0.2), (x + s * 0.08, y + 0.17, z + 0.2), "DarkWood", bevel=0.006)
# электрощиток у двери
B.box((-0.78, 11.55, 1.85), (-0.66, 11.9, 2.35), "Enamel", bevel=0.01)
B.finish()

# фото (отдельно — в игре их можно подменять/переворачивать)
for nm, (x, y, z, mat) in {"Photo_1": (-0.8, 4.2, 1.55, "Photo_Family"), "Photo_2": (-0.8, 4.75, 1.45, "Photo_Girl"),
                           "Photo_3": (0.8, 3.2, 1.5, "Photo_Girl"), "Photo_4": (0.8, 7.0, 1.5, "Photo_Family")}.items():
    s = 1 if x < 0 else -1
    P = Builder(nm, origin=(x + s * 0.08, y, z), collection=col_dyn)
    P.box((x + s * 0.08, y - 0.14, z - 0.17), (x + s * 0.083, y + 0.14, z + 0.17), mat, uv="fit")
    P.finish()

# зеркало
M = Builder("Mirror_Corr", origin=(-0.755, 10.3, 1.4), collection=col_dyn)
M.box((-0.76, 10.02, 0.89), (-0.755, 10.58, 1.91), "Mirror")
M.finish()

# телефон (дисковый)
T = Builder("I_Phone", origin=(0.57, 6.35, 0.72), collection=col_dyn)
T.box((0.47, 6.24, 0.72), (0.67, 6.46, 0.8), "Bakelite", bevel=0.02)
T.box((0.5, 6.27, 0.8), (0.64, 6.43, 0.84), "Bakelite", bevel=0.015)
T.cyl((0.57, 6.35, 0.845), 0.055, 0.01, "Chrome", segs=24)
T.cyl((0.57, 6.35, 0.85), 0.02, 0.008, "Paper", segs=16)
T.cyl((0.57, 6.35, 0.885), 0.022, 0.21, "Bakelite", axis="Y", segs=12)
for s in (-1, 1):
    T.sphere((0.57, 6.35 + s * 0.1, 0.885), 0.035, "Bakelite", scale=(1, 0.8, 0.7))
T.finish()

# щиток (интерактив)
F = Builder("I_FuseBox", origin=(-0.66, 11.72, 2.1), collection=col_dyn)
F.box((-0.665, 11.58, 1.88), (-0.655, 11.87, 2.32), "Enamel", bevel=0.004)
F.box((-0.655, 11.7, 2.05), (-0.63, 11.74, 2.15), "Bakelite", bevel=0.005)
F.finish()
print("corridor ok")

# ---------- КУХНЯ ----------
B = Builder("Kitchen_Furniture", collection=col_arch)
# фартук из кафеля
B.box((0.9, 7.46, 0.85), (2.95, 7.48, 1.55), "Tiles")
# тумба
B.box((0.9, 7.48, 0.0), (1.6, 8.06, 0.85), "PaintedWood", bevel=0.01)
B.box((0.88, 7.46, 0.85), (1.62, 8.1, 0.89), "Linoleum", bevel=0.008)
# мойка
B.box((1.6, 7.48, 0.0), (2.32, 8.06, 0.82), "PaintedWood", bevel=0.01)
for (lo, hi) in (((1.6, 7.48, 0.82), (2.32, 7.56, 0.89)), ((1.6, 8.0, 0.82), (2.32, 8.08, 0.89)),
                 ((1.6, 7.48, 0.82), (1.66, 8.08, 0.89)), ((2.26, 7.48, 0.82), (2.32, 8.08, 0.89)),
                 ((1.66, 7.56, 0.7), (2.26, 8.0, 0.72))):
    B.box(lo, hi, "Chrome", bevel=0.006)
B.cyl((1.96, 7.78, 0.715), 0.02, 0.012, "Black", segs=12)
# плита: корпус с пустой духовкой (дверца отдельно)
B.box((2.36, 7.48, 0.62), (2.88, 8.06, 0.85), "Enamel", bevel=0.012)
B.box((2.36, 7.48, 0.0), (2.88, 8.06, 0.15), "Enamel", bevel=0.012)
B.box((2.36, 7.48, 0.15), (2.4, 8.06, 0.62), "Enamel")
B.box((2.84, 7.48, 0.15), (2.88, 8.06, 0.62), "Enamel")
B.box((2.4, 7.48, 0.15), (2.84, 7.52, 0.62), "Black")
B.box((2.4, 7.52, 0.15), (2.84, 8.04, 0.16), "Black")
B.box((2.4, 7.52, 0.61), (2.84, 8.04, 0.62), "Black")
B.box((2.42, 7.55, 0.34), (2.82, 8.02, 0.35), "Metal")
B.box((2.36, 7.48, 0.85), (2.88, 7.52, 1.0), "Enamel", bevel=0.01)
for (x, y) in ((2.49, 7.68), (2.75, 7.68), (2.49, 7.92), (2.75, 7.92)):
    B.cyl((x, y, 0.86), 0.075, 0.02, "Black", segs=20)
    B.cyl((x, y, 0.875), 0.035, 0.012, "Metal", segs=12)
# холодильник ЗИЛ: корпус пустой внутри
B.box((3.3, 7.48, 0.04), (3.94, 7.56, 1.55), "Enamel", bevel=0.03)
B.box((3.3, 7.48, 0.04), (3.36, 8.1, 1.55), "Enamel", bevel=0.03)
B.box((3.88, 7.48, 0.04), (3.94, 8.1, 1.55), "Enamel", bevel=0.03)
B.box((3.3, 7.48, 1.47), (3.94, 8.1, 1.58), "Enamel", bevel=0.05, segs=4)
B.box((3.3, 7.48, 0.04), (3.94, 8.1, 0.14), "Enamel", bevel=0.02)
B.box((3.36, 7.56, 0.14), (3.88, 8.08, 0.145), "FridgeInside")
B.box((3.36, 7.56, 0.14), (3.365, 8.08, 1.47), "FridgeInside")
B.box((3.875, 7.56, 0.14), (3.88, 8.08, 1.47), "FridgeInside")
B.box((3.36, 7.56, 0.14), (3.88, 7.565, 1.47), "FridgeInside")
B.box((3.4, 7.6, 1.2), (3.84, 8.0, 1.44), "Metal", bevel=0.01)          # морозилка
for z in (0.55, 0.92):
    B.box((3.37, 7.57, z), (3.87, 8.06, z + 0.012), "Glass")
B.box((3.36, 8.12, 0.0), (3.88, 8.15, 0.12), "Chrome", bevel=0.01)
# в холодильнике: банки, кастрюля, маслёнка
B.cyl((3.48, 7.75, 0.62), 0.05, 0.13, "Glass", segs=12)
B.cyl((3.72, 7.72, 0.66), 0.09, 0.2, "Enamel", segs=18)
B.cyl((3.55, 7.85, 0.95), 0.07, 0.03, "Enamel", segs=16)
B.cyl((3.45, 7.7, 0.24), 0.04, 0.18, "Glass", segs=12)
# навесной шкаф: пустой корпус, дверцы отдельно
B.box((0.9, 7.46, 1.65), (2.3, 7.8, 1.67), "PaintedWood")
B.box((0.9, 7.46, 2.33), (2.3, 7.8, 2.35), "PaintedWood")
B.box((0.9, 7.46, 1.65), (0.92, 7.8, 2.35), "PaintedWood")
B.box((2.28, 7.46, 1.65), (2.3, 7.8, 2.35), "PaintedWood")
B.box((0.92, 7.46, 1.67), (2.28, 7.48, 2.33), "PaintedWood")
B.box((0.92, 7.48, 2.0), (2.28, 7.78, 2.015), "PaintedWood")
for i in range(5):
    B.cyl((1.05 + i * 0.25, 7.62, 1.75), 0.05, 0.16, "Glass", segs=12)
    B.cyl((1.05 + i * 0.25, 7.62, 1.835), 0.052, 0.01, "Metal", segs=12)
for i in range(6):
    B.cyl((1.6, 7.64, 2.03 + i * 0.012), 0.11, 0.01, "Enamel", segs=20)
# стол и стулья
tx0, tx1, ty0, ty1 = 1.5, 2.4, 10.85, 11.54
for (x, y) in ((tx0 + 0.04, ty0 + 0.04), (tx1 - 0.04, ty0 + 0.04), (tx0 + 0.04, ty1 - 0.04), (tx1 - 0.04, ty1 - 0.04)):
    B.box((x - 0.022, y - 0.022, 0), (x + 0.022, y + 0.022, 0.72), "Chrome", bevel=0.008)
B.box((tx0, ty0, 0.72), (tx1, ty1, 0.76), "PaintedWood", bevel=0.01)
B.soft_box((tx0 - 0.03, ty0 - 0.03, 0.755), (tx1 + 0.03, ty1 + 0.03, 0.765), "Fabric", cuts=8, round_=0.02, noise_amp=0.002)
chair(B, 1.95, 10.5, rot=0.0)
chair(B, 1.15, 11.2, rot=math.pi / 2)
# посуда на столе: тарелка и чашка
B.cyl((1.75, 11.2, 0.775), 0.11, 0.015, "Enamel", r2=0.08, segs=24)
B.cyl((2.2, 11.3, 0.81), 0.04, 0.08, "Enamel", r2=0.035, segs=16)
# абажур
B.cyl((2.4, 9.5, 2.35), 0.04, 0.12, "Lampshade", r2=0.25, segs=24)
B.cyl((2.4, 9.5, 2.55), 0.004, 0.3, "Black", segs=6)
# календарь
B.box((2.0, 11.53, 1.3), (2.4, 11.54, 1.9), "Paper", uv="fit")
B.finish()

# кран (интерактив)
T = Builder("I_Tap", origin=(1.96, 7.56, 0.95), collection=col_dyn)
T.cyl((1.96, 7.52, 0.95), 0.015, 0.2, "Chrome", segs=10)
T.cyl((1.96, 7.62, 1.05), 0.012, 0.2, "Chrome", axis="Y", segs=10)
T.cyl((1.96, 7.71, 1.0), 0.012, 0.1, "Chrome", segs=10)
for s_ in (-1, 1):
    T.cyl((1.96 + s_ * 0.08, 7.55, 1.02), 0.025, 0.04, "Chrome", segs=12)
T.finish()
W = Builder("Water_Stream", origin=(1.96, 7.71, 0.83), collection=col_dyn)
W.cyl((1.96, 7.71, 0.835), 0.006, 0.23, "WaterStream", segs=8, r2=0.004)
W.finish()

# дверца холодильника: петля справа, открывается на себя
D = Builder("Fridge_Door", local=True, collection=col_dyn)
dw = 0.62
D.box((0.0, -0.07, 0.04), (dw, 0.0, 1.47), "Enamel", bevel=0.05, segs=4)
D.box((0.03, 0.0, 0.1), (dw - 0.03, 0.02, 1.41), "FridgeInside", bevel=0.01)
for z in (0.35, 0.75, 1.1):
    D.box((0.06, 0.02, z), (dw - 0.06, 0.08, z + 0.012), "FridgeInside")
    D.box((0.06, 0.075, z), (dw - 0.06, 0.08, z + 0.07), "FridgeInside")
D.cyl((0.15, 0.05, 0.4), 0.03, 0.1, "Glass", segs=10)
D.box((dw - 0.08, -0.17, 0.86), (dw - 0.04, -0.07, 1.21), "Chrome", bevel=0.015)
D.box((0.2, -0.08, 1.3), (0.44, -0.07, 1.35), "Chrome", bevel=0.004)
ob = D.finish()
ob.location = (3.93, 8.12, 0); ob.rotation_euler = (0, 0, math.pi); ob["open_dir"] = -1; ob["max"] = 1.7
empty("FridgeLight", (3.62, 7.85, 1.25), 0.0, col_mark)

# дверца духовки: петля снизу, откидывается вниз
D = Builder("Oven_Door", local=True, collection=col_dyn)
D.box((-0.22, -0.012, 0.0), (0.22, 0.012, 0.47), "Enamel", bevel=0.008)
D.box((-0.16, 0.008, 0.15), (0.16, 0.014, 0.4), "Glass")
D.cyl((0.0, 0.05, 0.44), 0.01, 0.38, "Chrome", axis="X", segs=8)
for s_ in (-1, 1):
    D.box((s_ * 0.17 - 0.008, 0.012, 0.42), (s_ * 0.17 + 0.008, 0.05, 0.45), "Chrome")
ob = D.finish()
ob.location = (2.62, 8.07, 0.15); ob["open_dir"] = -1; ob["axis"] = "x"; ob["max"] = 1.45

# дверцы навесного шкафа
for nm, hx, rz, odir in (("Cab_DoorL", 0.92, 0.0, 1), ("Cab_DoorR", 2.28, math.pi, -1)):
    D = Builder(nm, local=True, collection=col_dyn)
    face = 1 if rz == 0 else -1
    f0, f1 = sorted((0, face * 0.02))
    D.box((0.0, f0, 1.67), (0.68, f1, 2.33), "PaintedWood", bevel=0.006)
    k0, k1 = sorted((face * 0.02, face * 0.05))
    D.cyl((0.62, (k0 + k1) / 2, 1.75), 0.01, 0.03, "Chrome", axis="Y", segs=8)
    ob = D.finish()
    ob.location = (hx, 7.8, 0); ob.rotation_euler = (0, 0, rz); ob["open_dir"] = odir

# ручки газа (интерактив) и пламя
K = Builder("I_Stove", origin=(2.62, 8.08, 0.76), collection=col_dyn)
for i in range(4):
    K.cyl((2.44 + i * 0.12, 8.08, 0.76), 0.018, 0.03, "Bakelite", axis="Y", segs=10)
    K.box((2.44 + i * 0.12 - 0.003, 8.09, 0.745), (2.44 + i * 0.12 + 0.003, 8.1, 0.775), "Enamel")
K.finish()
F = Builder("Gas_Flames", origin=(2.62, 7.8, 0.9), collection=col_dyn)
for (x, y) in ((2.49, 7.68), (2.75, 7.68), (2.49, 7.92), (2.75, 7.92)):
    for k in range(12):
        a_ = k / 12 * math.tau
        F.cyl((x + math.cos(a_) * 0.032, y + math.sin(a_) * 0.032, 0.9), 0.006, 0.03, "GasFlame", r2=0.0005, segs=5)
F.finish()

# радиоприёмник на подоконнике
R = Builder("I_Radio", origin=(3.95, 9.3, 0.86), collection=col_dyn)
R.box((3.86, 9.1, 0.86), (4.06, 9.5, 1.08), "DarkWood", bevel=0.015)
R.box((3.855, 9.13, 0.89), (3.86, 9.33, 1.05), "Coat")
R.box((3.855, 9.35, 0.98), (3.86, 9.47, 1.04), "Glass")
for z in (0.92, 0.95):
    R.cyl((3.85, 9.41 + (z - 0.92) * 2, 0.92), 0.012, 0.015, "Bakelite", axis="X", segs=12)
R.cyl((4.0, 9.45, 1.2), 0.003, 0.25, "Chrome", segs=6, rot=Euler((0.4, 0, 0)).to_matrix())
R.finish()
# в духовке — Анина кукла, к руке ниткой привязан ключ (отдельный предмет)
DL = Builder("I_OvenDoll", origin=(2.62, 7.8, 0.36), collection=col_dyn)
DL.sphere((2.62, 7.9, 0.4), 0.05, "Enamel", scale=(1, 1.05, 0.95), segs=14, rings=10)          # фарфоровая голова, лежит на боку
DL.sphere((2.6, 7.94, 0.43), 0.012, "Black", segs=8, rings=6)                                    # глаз
DL.sphere((2.645, 7.94, 0.425), 0.012, "Black", segs=8, rings=6)
DL.soft_box((2.57, 7.6, 0.355), (2.67, 7.86, 0.41), "Dress", cuts=3, round_=0.5, noise_amp=0.006)   # платье
DL.soft_box((2.6, 7.88, 0.43), (2.66, 7.97, 0.46), "Hair", cuts=2, round_=0.6, noise_amp=0.004) if "Hair" in MATS else None
for sx in (-1, 1):
    DL.cyl((2.62 + sx * 0.065, 7.78, 0.37), 0.011, 0.12, "Enamel", axis="Y", segs=8)            # руки
    DL.cyl((2.6 + sx * 0.025, 7.55, 0.36), 0.012, 0.12, "Enamel", axis="Y", segs=8)             # ноги
DL.cyl((2.705, 7.72, 0.365), 0.0015, 0.08, "Coat", axis="Y", segs=4)                             # нитка
DL.cyl((2.72, 7.66, 0.36), 0.014, 0.004, "Brass", segs=14)                                       # ключ: кольцо, стержень, бородка
DL.box((2.715, 7.58, 0.358), (2.725, 7.65, 0.363), "Brass")
DL.box((2.715, 7.58, 0.358), (2.74, 7.595, 0.363), "Brass")
DL.finish()

# ключи
K = Builder("I_Keys", origin=(3.55, 7.85, 0.97), collection=col_dyn)
K.cyl((3.55, 7.85, 0.968), 0.026, 0.005, "Brass", segs=16)
K.box((3.44, 7.82, 0.966), (3.5, 7.88, 0.99), "PipeGreen", bevel=0.006)
K.box((3.55, 7.84, 0.966), (3.62, 7.853, 0.971), "Brass")
K.box((3.52, 7.865, 0.966), (3.58, 7.9, 0.971), "Metal")
K.cyl((3.5, 7.83, 0.972), 0.012, 0.004, "Chrome", segs=10)
K.finish()
print("kitchen ok")

# ---------- ВАННАЯ ----------
B = Builder("Bath_Furniture", collection=col_arch)
vx0, vx1, vy0, vy1 = -2.74, -2.04, 6.46, 8.16
B.box((vx0, vy0, 0.0), (vx1, vy1, 0.08), "Enamel", bevel=0.02)
B.box((vx0, vy0, 0.08), (vx0 + 0.06, vy1, 0.58), "Enamel", bevel=0.025)
B.box((vx1 - 0.06, vy0, 0.08), (vx1, vy1, 0.58), "Enamel", bevel=0.025)
B.box((vx0, vy0, 0.08), (vx1, vy0 + 0.06, 0.58), "Enamel", bevel=0.025)
B.box((vx0, vy1 - 0.06, 0.08), (vx1, vy1, 0.58), "Enamel", bevel=0.025)
B.cyl((-2.39, 6.52, 1.2), 0.012, 0.7, "Chrome", segs=8)
# раковина
B.box((-1.65, 8.5, 0.72), (-1.15, 8.76, 0.86), "Enamel", bevel=0.03)
B.cyl((-1.4, 8.62, 0.5), 0.05, 0.45, "Enamel", segs=16)
B.cyl((-1.4, 8.72, 0.95), 0.012, 0.12, "Chrome", axis="Y", segs=8)
# трубы
for x in (-0.95, -1.0):
    B.cyl((x, 8.72, H / 2), 0.02, H, "Enamel", segs=10)
B.finish()
M = Builder("Mirror_Bath", origin=(-1.4, 8.74, 1.4), collection=col_dyn)
M.box((-1.62, 8.735, 1.1), (-1.18, 8.74, 1.7), "Mirror")
M.finish()
W = Builder("BathWater", origin=(-2.39, 7.3, 0.45), collection=col_dyn)
W.box((vx0 + 0.06, vy0 + 0.06, 0.44), (vx1 - 0.06, vy1 - 0.06, 0.45), "Water")
W.finish()
BT = Builder("I_BathTap", origin=(-2.39, 6.55, 0.85), collection=col_dyn)
BT.cyl((-2.39, 6.55, 0.85), 0.014, 0.2, "Chrome", axis="Y", segs=8)
for s_ in (-1, 1):
    BT.cyl((-2.39 + s_ * 0.09, 6.48, 0.86), 0.024, 0.04, "Chrome", axis="Y", segs=10)
BT.finish()
BS = Builder("Bath_Stream", origin=(-2.39, 6.64, 0.6), collection=col_dyn)
BS.cyl((-2.39, 6.64, 0.62), 0.008, 0.42, "WaterStream", segs=8, r2=0.006)
BS.finish()
print("bath ok")

# ---------- ТУАЛЕТ ----------
B = Builder("WC_Furniture", collection=col_arch)
B.cyl((-1.4, 9.95, 0.2), 0.16, 0.4, "Enamel", r2=0.12, segs=20)
B.soft_box((-1.6, 9.62, 0.38), (-1.2, 10.1, 0.44), "Enamel", cuts=4, round_=0.6)
B.box((-1.62, 9.6, 0.44), (-1.18, 10.12, 0.46), "Bakelite", bevel=0.01)
B.box((-1.65, 10.05, 1.8), (-1.15, 10.18, 2.15), "Enamel", bevel=0.02)   # бачок под потолком
B.cyl((-1.4, 10.12, 1.1), 0.02, 1.4, "Enamel", segs=8)
for x in (-1.9, -1.85):
    B.cyl((x, 10.12, H / 2), 0.02, H, "Enamel", segs=8)
B.box((-1.99, 9.2, 1.2), (-1.97, 9.5, 1.55), "Paper", uv="fit")      # газета на гвозде
B.finish()
CH = Builder("I_Toilet", origin=(-1.25, 10.1, 1.5), collection=col_dyn)
for i in range(12):
    CH.sphere((-1.25, 10.1, 1.78 - i * 0.03), 0.006, "Chrome", segs=6, rings=4)
CH.cyl((-1.25, 10.1, 1.38), 0.015, 0.06, "Bakelite", segs=8)
CH.finish()
print("wc ok")

# ---------- ДЕТСКАЯ ----------
B = Builder("Kids_Furniture", collection=col_arch)
kx0, kx1, ky0, ky1 = 2.3, 3.92, 3.22, 3.94
for (x, y) in ((kx0 + 0.03, ky0 + 0.03), (kx1 - 0.03, ky0 + 0.03), (kx0 + 0.03, ky1 - 0.03), (kx1 - 0.03, ky1 - 0.03)):
    B.box((x - 0.03, y - 0.03, 0), (x + 0.03, y + 0.03, 0.35), "PaintedWood", bevel=0.008)
B.box((kx1 - 0.04, ky0, 0.25), (kx1, ky1, 0.85), "PaintedWood", bevel=0.01)
B.box((kx0, ky0, 0.25), (kx0 + 0.04, ky1, 0.6), "PaintedWood", bevel=0.01)
B.soft_box((kx0 + 0.04, ky0 + 0.02, 0.3), (kx1 - 0.04, ky1 - 0.02, 0.44), "Linen", cuts=6, round_=0.2, noise_amp=0.006)
B.soft_box((kx1 - 0.42, ky0 + 0.08, 0.42), (kx1 - 0.08, ky1 - 0.08, 0.54), "Linen", cuts=5, round_=0.9, noise_amp=0.01, seed=11)
B.soft_box((kx0 - 0.02, ky0 - 0.03, 0.4), (kx1 - 0.45, ky1 + 0.0, 0.49), "PinkBlanket", cuts=8, round_=0.15, noise_amp=0.025, seed=12)
# стол, стульчик, полка с куклами
B.box((2.6, 0.46, 0.0), (3.6, 1.0, 0.6), "PaintedWood", bevel=0.01)
chair(B, 3.1, 1.25, rot=math.pi, mat="PaintedWood")
B.box((2.5, 0.46, 1.35), (3.7, 0.7, 1.38), "PaintedWood", bevel=0.005)
for i, x in enumerate((2.65, 2.95, 3.25, 3.55)):
    B.soft_box((x - 0.06, 0.52, 1.38), (x + 0.06, 0.64, 1.56), "Dress", cuts=3, round_=0.5, noise_amp=0.006, seed=20 + i)
    B.sphere((x, 0.58, 1.6), 0.05, "Enamel")
# сундук с игрушками (крышка отдельно)
B.box((1.0, 3.4, 0.0), (1.6, 3.94, 0.04), "PaintedWood")
B.box((1.0, 3.4, 0.0), (1.6, 3.43, 0.45), "PaintedWood", bevel=0.005)
B.box((1.0, 3.91, 0.0), (1.6, 3.94, 0.45), "PaintedWood", bevel=0.005)
B.box((1.0, 3.4, 0.0), (1.03, 3.94, 0.45), "PaintedWood", bevel=0.005)
B.box((1.57, 3.4, 0.0), (1.6, 3.94, 0.45), "PaintedWood", bevel=0.005)
for i in range(5):
    B.sphere((1.1 + (i % 3) * 0.18, 3.55 + (i // 3) * 0.2, 0.2), 0.07, ["Dress", "PinkBlanket", "Plush"][i % 3])
B.box((1.0, 0.6, 0.0), (2.2, 2.6, 0.008), "Carpet", uv="fit")
# рисунки на стенах
B.box((2.5, 3.985, 1.1), (2.9, 3.99, 1.5), "Drawing1", uv="fit")
B.box((3.1, 3.985, 1.15), (3.45, 3.99, 1.5), "Drawing2", uv="fit")
B.finish()
LID = Builder("ToyChest_Lid", local=True, collection=col_dyn)
LID.box((-0.3, -0.54, 0.0), (0.3, 0.0, 0.035), "PaintedWood", bevel=0.008)
ob = LID.finish(); ob.location = (1.3, 3.94, 0.45); ob["open_dir"] = -1; ob["axis"] = "x"; ob["max"] = 1.3
BEAR = Builder("I_Bear", origin=(2.9, 3.6, 0.55), collection=col_dyn)
BEAR.sphere((2.9, 3.6, 0.58), 0.09, "Plush", scale=(1, 0.85, 1.1))
BEAR.sphere((2.9, 3.6, 0.74), 0.07, "Plush")
for s_ in (-1, 1):
    BEAR.sphere((2.9 + s_ * 0.05, 3.6, 0.8), 0.025, "Plush")
    BEAR.sphere((2.9 + s_ * 0.08, 3.55, 0.56), 0.035, "Plush", scale=(1, 1, 1.4))
    BEAR.sphere((2.9 + s_ * 0.025, 3.535, 0.75), 0.008, "Bakelite")
BEAR.finish()
print("kids ok")

# ---------- ЛОДЖИЯ ----------
B = Builder("Loggia_Furniture", collection=col_arch)
chair(B, 4.7, 8.0, rot=0.4)
for i in range(4):
    B.box((4.15, 7.5 + i * 0.32, 0.0), (4.45, 7.78 + i * 0.32, 0.3), "DarkWood", bevel=0.01)
    for k in range(3):
        B.cyl((4.22 + k * 0.08, 7.64 + i * 0.32, 0.38), 0.035, 0.16, "Glass", segs=10)
for k, x in enumerate((4.2, 4.3)):
    B.box((x, 11.45, 0.0), (x + 0.06, 11.52, 1.8), "CarRed" if k else "CarGreen", bevel=0.02,
          rot=Euler((0.12, 0, 0)).to_matrix(), pivot=(x, 11.5, 0))
B.cyl((4.65, 9.5, 2.3), 0.006, 4.0, "Black", axis="Y", segs=4)
B.soft_box((4.62, 8.6, 1.4), (4.66, 9.3, 2.29), "Linen", cuts=6, round_=0.05, noise_amp=0.02, seed=31)
B.soft_box((4.62, 9.6, 1.6), (4.66, 9.95, 2.29), "Dress", cuts=4, round_=0.1, noise_amp=0.02, seed=32)
B.finish()
print("loggia ok")

# ---------- МАМИНА КОМНАТА ----------
B = Builder("Mom_Furniture", collection=col_arch)
# кресло лицом в угол
ax_, ay_ = -3.85, 4.85
rotc = Euler((0, 0, math.radians(-135))).to_matrix()
def abox(lo, hi, mat="Fabric", bev=0.03):
    B.box((ax_ + lo[0], ay_ + lo[1], lo[2]), (ax_ + hi[0], ay_ + hi[1], hi[2]), mat, bevel=bev, rot=rotc, pivot=(ax_, ay_, 0))
abox((-0.35, -0.35, 0.1), (0.35, 0.35, 0.42))
abox((-0.35, 0.25, 0.42), (0.35, 0.4, 1.05))
abox((-0.42, -0.35, 0.1), (-0.3, 0.4, 0.62))
abox((0.3, -0.35, 0.1), (0.42, 0.4, 0.62))
for sx in (-1, 1):
    for sy in (-1, 1):
        abox((sx * 0.35 - 0.03, sy * 0.33 - 0.03, 0), (sx * 0.35 + 0.03, sy * 0.33 + 0.03, 0.1), "DarkWood", 0.005)
# сервант
B.box((-4.32, 1.06, 0.0), (-3.0, 1.5, 1.9), "DarkWood", bevel=0.012)
B.box((-4.28, 1.5, 0.95), (-3.04, 1.505, 1.82), "Glass")
for i in range(5):
    B.cyl((-4.15 + i * 0.25, 1.3, 1.25), 0.08, 0.012, "Enamel", segs=20, rot=Euler((math.pi / 2 - 0.2, 0, 0)).to_matrix())
    B.cyl((-4.15 + i * 0.25, 1.32, 1.5), 0.035, 0.1, "Glass", segs=12)
# тумба с телевизором
B.box((-2.85, 1.06, 0.0), (-2.05, 1.5, 0.6), "DarkWood", bevel=0.01)
B.box((-2.75, 1.1, 0.6), (-2.15, 1.55, 1.08), "DarkWood", bevel=0.03)
B.box((-2.7, 1.548, 0.66), (-2.33, 1.556, 1.02), "Black")
for z in (0.95, 0.85, 0.75):
    B.cyl((-2.24, 1.56, z), 0.018, 0.02, "Bakelite", axis="Y", segs=10)
B.cyl((-2.45, 1.3, 1.2), 0.004, 0.35, "Chrome", segs=6, rot=Euler((0, 0.5, 0)).to_matrix())
B.cyl((-2.45, 1.3, 1.2), 0.004, 0.35, "Chrome", segs=6, rot=Euler((0, -0.5, 0)).to_matrix())
# кровать
for (x, y) in ((-2.4, 3.6), (-1.0, 3.6), (-2.4, 5.3), (-1.0, 5.3)):
    B.box((x - 0.03, y - 0.03, 0), (x + 0.03, y + 0.03, 0.4), "DarkWood", bevel=0.008)
B.box((-2.45, 3.55, 0.3), (-0.95, 5.35, 0.42), "DarkWood", bevel=0.01)
B.box((-2.45, 5.3, 0.3), (-0.95, 5.34, 1.0), "DarkWood", bevel=0.012)
B.soft_box((-2.42, 3.58, 0.38), (-0.98, 5.3, 0.55), "Linen", cuts=8, round_=0.2, noise_amp=0.01)
B.soft_box((-2.3, 4.9, 0.52), (-1.1, 5.25, 0.66), "Linen", cuts=6, round_=0.9, noise_amp=0.015, seed=5)
B.finish()
TVS = Builder("TV_Screen", origin=(-2.515, 1.557, 0.84), collection=col_dyn)
TVS.box((-2.69, 1.555, 0.67), (-2.34, 1.559, 1.01), "TVScreen", uv="fit")
TVS.finish()
# стена фотографий над кроватью
P = Builder("Mom_Photos", origin=(-1.7, 5.34, 1.7), collection=col_dyn)
for i in range(4):
    for j in range(3):
        x = -2.4 + i * 0.42 + (j % 2) * 0.05
        z = 1.25 + j * 0.38
        P.box((x - 0.15, 5.32, z - 0.15), (x + 0.15, 5.34, z + 0.15), "DarkWood", bevel=0.005)
        P.box((x - 0.12, 5.318, z - 0.12), (x + 0.12, 5.32, z + 0.12), "Photo_Girl", uv="fit")
P.finish()
print("mom ok")

# ---------- КЛАДОВКА ----------
B = Builder("Closet_Furniture", collection=col_arch)
for z in (0.5, 1.0, 1.5, 2.0):
    B.box((1.6, 4.06, z), (1.94, 5.94, z + 0.025), "PaintedWood", bevel=0.004)
import random
random.seed(5)
for z in (0.525, 1.025, 1.525):
    y = 4.15
    while y < 5.8:
        r = random.uniform(0.04, 0.07); h = random.uniform(0.12, 0.25)
        B.cyl((1.77, y + r, z + h / 2), r, h, "Glass", segs=12)
        B.cyl((1.77, y + r, z + h + 0.01), r * 0.9, 0.02, "Metal", segs=12)
        y += r * 2 + random.uniform(0.02, 0.08)
# детский стульчик лицом к стене
chair(B, 1.15, 5.7, rot=math.pi)
B.finish()
DR = Builder("Drawing", origin=(1.4, 5.99, 1.0), collection=col_dyn)
DR.box((1.25, 5.985, 0.8), (1.55, 5.99, 1.2), "Drawing2", uv="fit")
DR.finish()
print("closet ok")

# ---------- ТАМБУР ----------
B = Builder("Vest_Furniture", collection=col_arch)
B.box((-0.78, 12.1, 0.0), (-0.45, 13.2, 0.45), "DarkWood", bevel=0.01)
B.box((0.55, 12.2, 1.6), (0.78, 13.3, 2.4), "Enamel", bevel=0.01)  # счётчики
B.finish()

# ---------- ЛАМПЫ ----------
LAMPS = {"Lamp_Bed": (0, -2.2), "Lamp_Corr1": (0, 2.0), "Lamp_Corr2": (0, 6.0), "Lamp_Corr3": (0, 10.0),
         "Lamp_Kitchen": (2.4, 9.5), "Lamp_Bath": (-1.8, 7.6), "Lamp_Mom": (-2.6, 3.2), "Lamp_Vest": (0, 12.7),
         "Lamp_Closet": (1.4, 5.0), "Lamp_Kids": (2.4, 2.2), "Lamp_WC": (-1.4, 9.5), "Lamp_Loggia": (4.65, 10.8),
         "Lamp_Stair": (0.0, 14.2)}
for nm, (x, y) in LAMPS.items():
    zb = 2.25 if nm == "Lamp_Kitchen" else 2.35
    L = Builder(nm, origin=(x, y, zb), collection=col_dyn)
    if nm != "Lamp_Kitchen":
        L.cyl((x, y, (zb + H) / 2 + 0.03), 0.004, H - zb - 0.06, "Black", segs=6)
        L.cyl((x, y, zb + 0.05), 0.018, 0.05, "Bakelite", segs=10)
    L.sphere((x, y, zb), 0.032, "Bulb", scale=(1, 1, 1.3), segs=12, rings=8)
    L.finish()

# ---------- ЗАПИСКИ ----------
NOTES = {"I_Note1": (0.85, -4.1, 0.553, 0.3), "I_Note2": (2.0, 11.05, 0.766, -0.2),
         "I_Note3": (0.1, 7.0, 0.002, 1.1), "I_Note4": (-3.8, 4.8, 0.43, 0.6),
         "I_Note5": (-1.3, 8.55, 0.865, 0.1), "I_Note6": (1.7, 4.3, 0.528, 0.0),
         "I_Note7": (3.2, 0.75, 0.602, 0.4), "I_Note8": (4.7, 8.0, 0.477, 0.2)}
for nm, (x, y, z, r) in NOTES.items():
    N = Builder(nm, origin=(x, y, z), collection=col_dyn)
    N.box((x - 0.074, y - 0.105, z), (x + 0.074, y + 0.105, z + 0.0015), "Paper", uv="fit",
          rot=Euler((0, 0, r)).to_matrix(), pivot=(x, y, z))
    N.finish()

# ---------- КОЛЛАЙДЕРЫ МЕБЕЛИ ----------
for lo, hi in [
    ((1.18, -4.3, 0), (2.12, -2.2, 0.6)), ((0.62, -4.32, 0), (1.12, -3.92, 0.55)), ((-2.14, -1.75, 0), (-1.52, -0.45, 2.16)),
    ((-1.55, -3.95, 0), (-1.05, -3.45, 0.95)), ((-0.5, -4.4, 0), (0.5, -4.15, 0.7)),
    ((0.45, 10.0, 0), (0.78, 11.5, 2.0)), ((-0.78, 9.9, 0), (-0.42, 10.7, 0.75)), ((0.36, 5.95, 0), (0.78, 6.75, 0.72)),
    ((0.9, 7.46, 0), (2.88, 8.1, 0.9)), ((3.3, 7.48, 0), (3.94, 8.12, 1.58)), ((1.5, 10.85, 0), (2.4, 11.6, 0.77)),
    ((1.73, 10.28, 0), (2.17, 10.72, 0.95)), ((0.93, 10.98, 0), (1.37, 11.42, 0.95)), ((3.6, 9.0, 0), (4.0, 10.2, 0.7)),
    ((-2.74, 6.46, 0), (-2.04, 8.16, 0.58)), ((-1.65, 8.5, 0), (-1.15, 8.76, 0.86)),
    ((-4.3, 4.4, 0), (-3.4, 5.3, 1.05)), ((-4.32, 1.06, 0), (-3.0, 1.5, 1.9)), ((-2.85, 1.06, 0), (-2.05, 1.55, 1.1)),
    ((-2.45, 3.55, 0), (-0.95, 5.35, 1.0)), ((-4.4, 2.6, 0), (-4.15, 3.8, 0.7)),
    ((1.6, 4.06, 0), (1.94, 5.94, 2.05)), ((0.93, 5.48, 0), (1.37, 5.92, 0.95)), ((-0.78, 12.1, 0), (-0.45, 13.2, 0.45)),
    ((-1.62, 9.6, 0), (-1.18, 10.12, 0.46)),
    ((2.3, 3.22, 0), (3.92, 3.94, 0.85)), ((2.6, 0.46, 0), (3.6, 1.0, 0.6)), ((2.88, 1.03, 0), (3.32, 1.47, 0.95)),
    ((1.0, 3.4, 0), (1.6, 3.94, 0.48)), ((3.75, 1.6, 0), (4.0, 2.8, 0.7)),
    ((4.15, 7.5, 0), (4.45, 8.8, 0.45)), ((4.45, 7.75, 0), (4.95, 8.25, 0.95)), ((4.2, 11.4, 0), (4.4, 11.6, 1.8)),
]:
    colbox(lo, hi)
CB.finish()

# ---------- МАРКЕРЫ ----------
empty("Spawn_Start", (1.0, -2.9, 0), math.radians(160), col_mark)
empty("Spawn_Loop", (0.0, -0.7, 0), 0.0, col_mark)
for nm, p in {"EP_CorrEnd": (0.0, 11.3, 0), "EP_KitchenDoor": (1.2, 8.8, 0), "EP_MomDoor": (-1.3, 3.0, 0),
              "EP_BedCorner": (-1.8, -4.0, 0), "EP_BathDoor": (-1.3, 7.6, 0), "EP_CorrMid": (0.0, 6.5, 0),
              "EP_CorrStart": (0.0, 0.7, 0), "Vest_Trigger": (0.0, 12.9, 0), "Stair_Down": (0.8, 15.6, -0.9)}.items():
    empty(nm, p, 0.0, col_mark)
print("ALL OK", len(bpy.data.objects))
