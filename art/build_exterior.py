# Ночной двор вокруг квартиры: панельки, фонари, деревья, машины, гаражи, площадка, лужи, небо.
# Квартира на 3-м этаже: пол квартиры z=0, земля z=-6.3.
# Запуск: exec(open(r"C:\My_pc\strah\art\build_exterior.py", encoding="utf-8").read())
import math
import random
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

exec(open(r"C:\My_pc\strah\art\lib.py", encoding="utf-8").read())

G = -6.3                 # уровень земли
FLOORS, COLS, PLINTH, FLOOR_H, COLW = 5, 24, 1.6, 2.8, 2.5
BH = PLINTH + FLOORS * FLOOR_H
random.seed(1984)
col = get_collection("Exterior")
mark = bpy.data.collections.get("Markers")

# ---------------- земля, бордюры, лужи ----------------
X = Builder("Ext_Ground", collection=col)
X.box((-90, -90, G - 0.2), (90, 90, G), "Snow")
for (lo, hi) in [((-20, -40, G), (-11, 45, G + 0.02)), ((10, -8, G), (14, 45, G + 0.02)),
                 ((-11, -11, G), (14, -7, G + 0.02)), ((-11, -30, G), (14, -26, G + 0.02))]:
    X.box(lo, hi, "AsphaltSnow")
for (lo, hi) in [((-11.3, -26, G), (-11, 45, G + 0.18)), ((-20.3, -40, G), (-20, 45, G + 0.18)), ((9.7, -7, G), (10, 45, G + 0.18))]:
    X.box(lo, hi, "Concrete", bevel=0.03)
X.finish()

# сугробы
P = Builder("Ext_Drifts", collection=col)
DRIFTS = [(-10.5, -20, 2.5, 1.2, 0.6), (13, -15, 2, 1.5, 0.5), (-6, -7.2, 4, 1.0, 0.55), (8, -7.3, 2, 0.9, 0.5),
          (-19.5, 5, 1.2, 4, 0.7), (-19.5, 20, 1.2, 5, 0.8), (-12, 12, 1.0, 3, 0.5), (16, 4, 2, 2, 0.6), (20, 25, 3, 2, 0.7),
          (0, -27, 5, 1, 0.6), (-25, -10, 2, 3, 0.9)]
for i, (x, y, sx, sy, h) in enumerate(DRIFTS):
    P.soft_box((x - sx, y - sy, G - 0.2), (x + sx, y + sy, G + h), "Snow", cuts=6, round_=0.9, noise_amp=0.12, noise_scale=0.6, seed=i)
P.finish()

# ---------------- панельные дома ----------------
def building(name, origin, axis, facade_mat, length=COLS * COLW, depth=12.0, plinth=PLINTH, cols=COLS):
    """Фасад смотрит на квартиру. axis='S' — фасад вдоль X, смотрит на +Y;
    'W' — вдоль Y, смотрит на +X; 'E' — вдоль Y, смотрит на -X."""
    B_ = Builder(name, collection=col)
    ox, oy = origin

    def P_(a, b, z):
        # a — вдоль фасада, b — вглубь от фасада (наружу от двора), в мировые координаты
        if axis == "S": return (ox + a, oy - b, z)
        if axis == "W": return (ox - b, oy + a, z)
        if axis == "N": return (ox + a, oy + b, z)
        return (ox + b, oy - a, z)

    def box(a0, a1, b0, b1, z0, z1, mat, bev=0.0):
        p0, p1 = P_(a0, b0, z0), P_(a1, b1, z1)
        lo = tuple(min(p0[i], p1[i]) for i in range(3)); hi = tuple(max(p0[i], p1[i]) for i in range(3))
        B_.box(lo, hi, mat, bevel=bev)

    # корпус: лицевая грань — фасадная текстура, остальное бетон
    def facemat(f):
        n = f.normal
        want = {"S": Vector((0, 1, 0)), "W": Vector((1, 0, 0)), "E": Vector((-1, 0, 0)), "N": Vector((0, -1, 0))}[axis]
        return facade_mat if n.dot(want) > 0.9 else "Concrete"
    bh = plinth + FLOORS * FLOOR_H
    colw = length / cols
    p0, p1 = P_(0, 0, G), P_(length, depth, G + bh)
    lo = tuple(min(p0[i], p1[i]) for i in range(3)); hi = tuple(max(p0[i], p1[i]) for i in range(3))
    B_.box(lo, hi, facemat, uv="fit")
    # крыша с парапетом и будками
    box(-0.2, length + 0.2, -0.2, depth + 0.2, G + bh, G + bh + 0.5, "Concrete")
    box(-0.1, length + 0.1, -0.1, depth + 0.1, G + bh + 0.5, G + bh + 0.75, "Snow")
    for k in range(max(1, cols // 8)):
        a = length * (k + 1) / (cols // 8 + 1)
        box(a - 1.5, a + 1.5, 3, 7, G + bh + 0.5, G + bh + 2.6, "Concrete")
        box(a - 1.45, a + 1.45, 3.05, 6.95, G + bh + 2.6, G + bh + 2.8, "Snow")
    # балконы
    for f in range(1, FLOORS):
        z = G + plinth + f * FLOOR_H
        for c in range(cols):
            if c % 8 == 4 or (c + f) % 3 or axis == "N":
                continue
            a0, a1 = c * colw + 0.15, (c + 1) * colw - 0.15
            box(a0, a1, -1.15, 0, z - 0.15, z, "Concrete", 0.02)
            box(a0 + 0.05, a1 - 0.05, -1.12, -0.02, z, z + 0.08, "Snow")
            if random.random() < 0.45:      # остеклённый деревянными рамами
                box(a0, a1, -1.15, -1.05, z, z + 1.0, "Concrete", 0.01)
                box(a0, a1, -1.12, -1.08, z + 1.0, z + 2.4, "PaintedWood")
            else:
                box(a0, a1, -1.15, -1.1, z, z + 1.0, "Rust")
                for i in range(9):
                    aa = a0 + (a1 - a0) * i / 8
                    box(aa - 0.015, aa + 0.015, -1.14, -1.11, z, z + 1.0, "Metal")
    # подъезды: козырёк, дверь, скамейка
    for c in range(4, cols, 8):
        a = (c + 0.5) * colw
        box(a - 1.4, a + 1.4, -1.6, 0, G + 2.35, G + 2.5, "Concrete", 0.03)
        box(a - 1.35, a + 1.35, -1.55, 0, G + 2.5, G + 2.62, "Snow")
        box(a - 0.6, a + 0.6, -0.05, 0.0, G, G + 2.1, "Rust")
        box(a - 0.15, a + 0.15, -0.35, -0.15, G + 2.18, G + 2.3, "EntranceLamp")
        box(a + 1.8, a + 3.4, -1.9, -1.5, G + 0.42, G + 0.48, "DarkWood")
        box(a + 1.8, a + 3.4, -1.55, -1.5, G + 0.48, G + 0.9, "DarkWood")
        for aa in (a + 1.9, a + 3.3):
            box(aa - 0.04, aa + 0.04, -1.9, -1.6, G, G + 0.42, "Concrete")
    return B_.finish()


building("Ext_House_S", (-30, -30), "S", "Facade_A")
building("Ext_House_W", (-42, -25), "W", "Facade_B")
building("Ext_House_E", (34, 40), "E", "Facade_C")
# наш дом: узкая секция вокруг квартиры, фасад смотрит во двор (-Y); квартира на 3-м этаже
building("Ext_House_Own", (-5.2, -4.65), "N", "Facade_Own", length=10.9, depth=21.5, plinth=0.7, cols=4)
O = Builder("Ext_OwnEntrance", collection=col)
O.box((-1.2, -6.3, G + 2.3), (1.6, -4.65, G + 2.45), "Concrete", bevel=0.03)
O.box((-1.15, -6.25, G + 2.45), (1.55, -4.65, G + 2.57), "Snow")
O.box((-0.35, -4.7, G), (0.75, -4.64, G + 2.1), "Rust", bevel=0.01)
O.box((0.05, -4.98, G + 2.15), (0.35, -4.78, G + 2.27), "EntranceLamp")
for st in range(3):
    O.box((-1.0, -5.0 - st * 0.3, G), (1.4, -4.65, G + 0.15 * (3 - st)), "Concrete", bevel=0.01)
O.finish()
empty("Exit_Spawn", (0.2, -6.0, G + 0.05), 0.0, col)

# ---------------- фонари ----------------
L = Builder("Ext_Lamps", collection=col)
LAMPS = [(0.5, -13.0, 0.0), (-13.5, 3.0, 90.0), (13.0, 9.0, -90.0), (-13.5, -16.0, 90.0), (12.0, -18.0, 180.0), (-13.5, 22.0, 90.0)]
for i, (x, y, rz) in enumerate(LAMPS):
    R = Euler((0, 0, math.radians(rz))).to_matrix()
    L.cyl((x, y, G + 3.6), 0.09, 7.2, "PipeGreen", segs=10, r2=0.06)
    arm = Vector((0, -1.5, 0)); arm.rotate(R)
    L.cyl((x + arm.x / 2, y + arm.y / 2, G + 7.15), 0.04, 1.6, "PipeGreen", axis="Y", segs=8, rot=R)
    hx, hy = x + arm.x, y + arm.y
    L.box((hx - 0.22, hy - 0.35, G + 7.0), (hx + 0.22, hy + 0.35, G + 7.2), "PipeGreen", bevel=0.05, rot=R, pivot=(hx, hy, G + 7.1))
    L.box((hx - 0.16, hy - 0.26, G + 6.97), (hx + 0.16, hy + 0.26, G + 7.0), "Sodium", rot=R, pivot=(hx, hy, G + 7.0))
    empty(f"SL_{i}", (hx, hy, G + 6.85), 0.0, col)
L.finish()

# ---------------- голые деревья ----------------
T = Builder("Ext_Trees", collection=col)


def branch(p, d, length, r, depth):
    end = p + d * length
    T.cyl(tuple((p + end) / 2), r, length, "Bark", segs=6 if depth > 1 else 4, r2=r * 0.7,
          rot=d.to_track_quat("Z", "Y").to_matrix())
    if depth == 0:
        return
    n = random.choice((2, 3, 3))
    for _ in range(n):
        nd = d.copy()
        nd.rotate(Euler((random.uniform(-0.7, 0.7), random.uniform(-0.7, 0.7), random.uniform(0, 6.28))))
        nd = (nd + Vector((0, 0, 0.25))).normalized()
        branch(end, nd, length * random.uniform(0.6, 0.78), r * 0.62, depth - 1)


TREES = [(-8, -20), (7, -23), (-3, -14.5), (9.5, -14), (-17, -6), (-17, 12), (-16.5, 28), (17, 0), (18, 18), (16, 30), (-5, -28), (22, -10)]
for (x, y) in TREES:
    h = random.uniform(3.5, 5.5)
    branch(Vector((x, y, G)), Vector((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 1)).normalized(), h, 0.22, 4)
T.finish()

# ---------------- машины ----------------
C = Builder("Ext_Cars", collection=col)
CARS = [(-15.5, -4.0, 90, "CarRed"), (-15.5, 1.5, 90, "CarBeige"), (-15.5, 8.5, 92, "CarGreen"), (-15.5, 17.5, 88, "CarRed")]


def car(C, x, y, rz, mat, snow=True, interior=False):
    R = Euler((0, 0, math.radians(rz))).to_matrix()
    piv = (x, y, G)
    def cb(lo, hi, m, bev=0.04):
        C.box((x + lo[0], y + lo[1], G + lo[2]), (x + hi[0], y + hi[1], G + hi[2]), m, bevel=bev, rot=R, pivot=piv)
    cb((-0.82, -2.05, 0.28), (0.82, 2.05, 0.85), mat, 0.08)
    cb((-0.74, -0.85, 0.85), (0.74, 0.95, 1.38), mat, 0.06)
    cb((-0.70, -0.88, 0.9), (0.70, 0.98, 1.33), "CarGlass", 0.03)
    cb((-0.6, 2.04, 0.55), (0.6, 2.07, 0.72), "Chrome", 0.01)
    cb((-0.8, -2.08, 0.32), (0.8, 2.08, 0.42), "Black", 0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wp = Vector((sx * 0.72, sy * 1.3, 0.3)); wp.rotate(R)
            C.cyl((x + wp.x, y + wp.y, G + 0.3), 0.3, 0.2, "Black", axis="X", segs=14, rot=R)
    if snow:
        C.soft_box((x - 0.7, y - 0.8, G + 1.33), (x + 0.7, y + 0.9, G + 1.48), "Snow", cuts=4, round_=0.5, noise_amp=0.03)
        C.soft_box((x - 0.78, y + 1.0, G + 0.8), (x + 0.78, y + 2.0, G + 0.92), "Snow", cuts=4, round_=0.5, noise_amp=0.03)
        C.soft_box((x - 0.78, y - 2.0, G + 0.8), (x + 0.78, y - 1.0, G + 0.92), "Snow", cuts=4, round_=0.5, noise_amp=0.03)
    if interior:
        cb((-0.62, -0.75, 0.45), (-0.08, -0.25, 0.6), "Coat", 0.05)
        cb((-0.62, -0.78, 0.6), (-0.08, -0.62, 1.15), "Coat", 0.05)
        cb((0.08, -0.75, 0.45), (0.62, -0.25, 0.6), "Coat", 0.05)
        cb((-0.72, 0.55, 0.6), (0.72, 0.9, 0.95), "Bakelite", 0.04)
        cb((-0.45, 0.5, 0.86), (-0.2, 0.56, 0.93), "Glass", 0.005)
        C.cyl((x - 0.35, y + 0.42, G + 0.95), 0.19, 0.03, "Bakelite", axis="Y", segs=20, rot=Euler((0.35, 0, 0)).to_matrix())


for (x, y, rz, mat) in CARS:
    car(C, x, y, rz, mat)
C.finish()
# машина для побега: отдельный объект с салоном
CD = Builder("Ext_Car_Drive", origin=(5.0, -9.5, G), collection=col)
car(CD, 5.0, -9.5, 0, "CarBeige", snow=False, interior=True)
CD.finish()
empty("Car_Seat", (5.0 - 0.35, -9.5 - 0.45, G + 1.12), 0.0, col)
empty("Car_Headlights", (5.0, -9.5 + 2.1, G + 0.65), 0.0, col)

# сугроб, в котором увязла «копейка»
CDR = Builder("Ext_CarDrift", origin=(5.0, -9.5, G), collection=col)
for sy in (-1.3, 1.3):
    for sx in (-0.82, 0.82):
        CDR.soft_box((5.0 + sx - 0.35, -9.5 + sy - 0.55, G - 0.1), (5.0 + sx + 0.35, -9.5 + sy + 0.55, G + 0.5), "Snow", cuts=5, round_=0.9, noise_amp=0.05, seed=int(sx * 10 + sy * 3))
CDR.soft_box((5.0 - 1.4, -9.5 - 2.4, G - 0.1), (5.0 + 1.4, -9.5 + 2.4, G + 0.28), "Snow", cuts=6, round_=0.9, noise_amp=0.06, seed=11)
CDR.finish()

# машина, которая проезжает по улице и не останавливается
PC = Builder("Ext_PassCar", origin=(12.0, -200.0, G), collection=col)
car(PC, 12.0, -200.0, 0, "CarGreen", snow=True)
for sx in (-0.55, 0.55):
    PC.box((12.0 + sx - 0.12, -200.0 + 2.05, G + 0.58), (12.0 + sx + 0.12, -200.0 + 2.09, G + 0.7), "EntranceLamp")
PC.finish()

# таксофон-автомат у дорожки
TP = Builder("I_Payphone", origin=(-7.5, -12.2, G), collection=col)
TP.box((-7.55, -12.25, G), (-7.45, -12.15, G + 1.2), "PipeGreen")
TP.box((-7.85, -12.35, G + 1.1), (-7.15, -12.05, G + 2.2), "Rust", bevel=0.02)
TP.box((-7.8, -12.05, G + 1.15), (-7.2, -12.0, G + 2.15), "PipeGreen", bevel=0.01)
TP.box((-7.66, -11.99, G + 1.45), (-7.34, -11.95, G + 1.9), "Metal", bevel=0.01)
TP.box((-7.62, -11.95, G + 1.75), (-7.52, -11.88, G + 1.88), "Black", bevel=0.01)
TP.cyl((-7.4, -11.92, G + 1.6), 0.03, 0.25, "Black", segs=8)
TP.box((-7.85, -12.35, G + 2.2), (-7.15, -12.0, G + 2.3), "Snow")
TP.finish()

# ---------------- гаражи ----------------
GR = Builder("Ext_Garages", collection=col)
OPEN_I = 4
for i in range(9):
    y0 = -22 + i * 3.2
    if i == OPEN_I:
        # стены, крыша, пол — пустая коробка
        GR.box((-27, y0, G), (-26.85, y0 + 3.1, G + 2.4), "Rust")
        GR.box((-27, y0, G), (-21, y0 + 0.12, G + 2.4), "Rust")
        GR.box((-27, y0 + 2.98, G), (-21, y0 + 3.1, G + 2.4), "Rust")
        GR.box((-27, y0, G + 2.28), (-21, y0 + 3.1, G + 2.4), "Rust")
        GR.box((-26.85, y0 + 0.12, G), (-21, y0 + 2.98, G + 0.03), "Concrete")
        # ворота подняты и перекошены
        GR.box((-21.6, y0 + 0.3, G + 2.05), (-20.3, y0 + 2.8, G + 2.12), "Rust", rot=Euler((0, math.radians(-12), 0)).to_matrix(), pivot=(-21, y0 + 1.55, G + 2.1))
        # верстак, канистры, покрышки, полки
        GR.box((-26.8, y0 + 0.2, G + 0.85), (-25.8, y0 + 2.9, G + 0.92), "DarkWood", bevel=0.01)
        for yy in (y0 + 0.25, y0 + 2.8):
            GR.box((-26.7, yy - 0.04, G), (-26.62, yy + 0.04, G + 0.85), "Metal")
        for k in range(3):
            GR.box((-26.8, y0 + 0.2, G + 1.3 + k * 0.4), (-26.5, y0 + 2.9, G + 1.33 + k * 0.4), "DarkWood")
        GR.box((-26.5, y0 + 0.4, G + 0.92), (-26.15, y0 + 0.65, G + 1.3), "PipeGreen", bevel=0.02)
        GR.box((-26.4, y0 + 2.2, G + 0.92), (-26.1, y0 + 2.45, G + 1.25), "Rust", bevel=0.02)
        for k in range(3):
            GR.cyl((-24.6, y0 + 2.6, G + 0.1 + k * 0.2), 0.32, 0.19, "Black", segs=18)
        GR.cyl((-24, y0 + 1.55, G + 2.12), 0.006, 0.3, "Black", segs=4)
        GR.sphere((-24, y0 + 1.55, G + 1.93), 0.04, "Bulb", segs=10, rings=8)
        continue
    GR.box((-27, y0, G), (-21, y0 + 3.1, G + 2.4), "Rust", bevel=0.02)
    GR.box((-21.02, y0 + 0.3, G + 0.1), (-20.98, y0 + 2.8, G + 2.2), "Rust" if i % 3 else "PipeGreen", bevel=0.01)
    GR.box((-27.2, y0 - 0.05, G + 2.4), (-20.8, y0 + 3.15, G + 2.5), "Concrete")
    GR.box((-27.15, y0, G + 2.5), (-20.85, y0 + 3.1, G + 2.7), "Snow")
GR.finish()
gy0 = -22 + OPEN_I * 3.2
empty("Garage_Light", (-24, gy0 + 1.55, G + 1.9), 0.0, col)
# лопата у стены гаража
SH = Builder("I_Shovel", origin=(-22.2, gy0 + 0.35, G), collection=col)
R_ = Euler((math.radians(14), 0, 0)).to_matrix()
SH.cyl((-22.2, gy0 + 0.42, G + 0.75), 0.018, 1.25, "DarkWood", segs=8, rot=R_)
SH.box((-22.38, gy0 + 0.22, G + 0.0), (-22.02, gy0 + 0.26, G + 0.36), "Metal", bevel=0.01, rot=R_, pivot=(-22.2, gy0 + 0.24, G + 0.18))
SH.box((-22.29, gy0 + 0.55, G + 1.36), (-22.11, gy0 + 0.6, G + 1.4), "DarkWood", rot=R_, pivot=(-22.2, gy0 + 0.58, G + 1.38))
SH.finish()

# ---------------- детская площадка ----------------
PL = Builder("Ext_Playground", collection=col)
sx0, sy0 = -6.0, -18.0
for dx in (-1.2, 1.2):
    for dy in (-0.7, 0.7):
        PL.cyl((sx0 + dx, sy0 + dy * 0.6, G + 1.2), 0.04, 2.6, "PipeGreen", segs=8,
               rot=Euler((dy * 0.35, 0, 0)).to_matrix())
PL.cyl((sx0, sy0, G + 2.45), 0.05, 2.6, "PipeGreen", axis="X", segs=8)
SW = Builder("Ext_Swing", origin=(sx0, sy0, G + 2.45), collection=col)
for dx in (-0.25, 0.25):
    SW.cyl((sx0 + dx, sy0, G + 1.5), 0.008, 1.9, "Metal", segs=4)
SW.box((sx0 - 0.3, sy0 - 0.2, G + 0.52), (sx0 + 0.3, sy0 + 0.2, G + 0.56), "DarkWood", bevel=0.01)
SW.box((sx0 - 0.28, sy0 - 0.18, G + 0.56), (sx0 + 0.28, sy0 + 0.18, G + 0.6), "Snow")
SW.finish()
# горка
hx, hy = 5.0, -19.0
for dx in (-0.4, 0.4):
    PL.cyl((hx + dx, hy - 0.8, G + 0.75), 0.04, 1.5, "PipeGreen", segs=8)
PL.box((hx - 0.45, hy - 1.1, G + 1.45), (hx + 0.45, hy - 0.5, G + 1.5), "Rust")
PL.box((hx - 0.35, hy - 0.5, G + 0.2), (hx + 0.35, hy + 1.6, G + 0.24), "Chrome",
       rot=Euler((math.radians(-35), 0, 0)).to_matrix(), pivot=(hx, hy + 0.55, G + 0.8))
# песочница
for (lo, hi) in [((-1, -23, G), (2, -22.85, G + 0.3)), ((-1, -20.15, G), (2, -20, G + 0.3)),
                 ((-1, -23, G), (-0.85, -20, G + 0.3)), ((1.85, -23, G), (2, -20, G + 0.3))]:
    PL.box(lo, hi, "PaintedWood", bevel=0.02)
# трансформаторная будка
PL.box((15, -6, G), (18, -3, G + 2.8), "Concrete", bevel=0.03)
PL.box((14.98, -5.2, G + 0.1), (15.0, -3.8, G + 2.0), "Rust")
PL.finish()

# ---------------- небо ----------------
sb = bmesh.new()
bmesh.ops.create_uvsphere(sb, u_segments=48, v_segments=24, radius=170, calc_uvs=True)
for f in sb.faces:
    f.normal_flip()
sky_me = bpy.data.meshes.new("Ext_Sky"); sb.to_mesh(sky_me); sb.free()
sky_me.materials.append(material("Sky"))
old = bpy.data.objects.get("Ext_Sky")
if old:
    bpy.data.objects.remove(old, do_unlink=True)
sky = bpy.data.objects.new("Ext_Sky", sky_me)
sky.location = (0, 4, G)
col.objects.link(sky)

# простые коллайдеры двора (финал: выходим на улицу)
EC = Builder("Ext_Colliders", collection=col)
for lo, hi in [((-90, -90, G - 0.3), (90, 90, G)), ((-5.2, -4.65, G), (5.7, 16.85, G + 16)),
               ((-30, -42, G), (30, -30, G + 16)), ((-54, -25, G), (-42, 35, G + 16)), ((34, -20, G), (46, 40, G + 16)),
               ((4.1, -11.6, G), (5.9, -7.4, G + 1.4)), ((-16.4, -6.1, G), (-14.6, 19.6, G + 1.4)),
               ((-27, -22, G), (-21, -9.2, G + 2.6)), ((-27, -6.1, G), (-21, 7, G + 2.6)),
               ((-27, -9.2, G), (-26.8, -6.1, G + 2.6)), ((-27, -9.2, G), (-21, -9.08, G + 2.6)), ((-27, -6.22, G), (-21, -6.1, G + 2.6)),
               ((-26.8, -9.0, G), (-25.8, -6.3, G + 0.92)), ((-7.85, -12.35, G), (-7.15, -12.05, G + 2.3)), ((15, -6, G), (18, -3, G + 2.8)), ((-1, -23, G), (2, -20, G + 0.3)),
               ((-90, -90, G), (90, -60, G + 5)), ((-90, 50, G), (90, 90, G + 5)), ((-90, -90, G), (-60, 90, G + 5)), ((60, -90, G), (90, 90, G + 5))]:
    EC.box(lo, hi, "Black")
EC.finish()

# фигура во дворе будет стоять здесь
empty("Watcher_Spot", (0.2, -14.2, G), 0.0, col)
print("exterior ok", len(col.objects))
