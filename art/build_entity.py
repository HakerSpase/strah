# «Жилец» — сущность: тело (skin-модификатор), голова, зубы, волосы, платье, скелет, веса, анимации.
# Запуск: exec(open(r"C:\My_pc\strah\art\build_entity.py", encoding="utf-8").read())
import math
import random
import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise
from mathutils.geometry import intersect_point_line

exec(open(r"C:\My_pc\strah\art\lib.py", encoding="utf-8").read())

col = get_collection("Entity")
random.seed(13)

# ---------------- скелет (точки суставов) ----------------
J = {
    "root": (0, 0, 0),
    "pelvis": (0, 0.0, 1.22), "spine1": (0, -0.01, 1.42), "spine2": (0, -0.04, 1.62),
    "chest": (0, -0.08, 1.82), "neck0": (0, -0.13, 1.97), "neck1": (0, -0.19, 2.09),
    "headtop": (0, -0.27, 2.42),
}
for s, sx in (("L", 1), ("R", -1)):
    J.update({
        f"clav{s}": (sx * 0.04, -0.09, 1.93), f"sh{s}": (sx * 0.21, -0.06, 1.89),
        f"el{s}": (sx * 0.27, -0.03, 1.44), f"wr{s}": (sx * 0.29, -0.09, 1.02),
        f"pa{s}": (sx * 0.30, -0.11, 0.92),
        f"hip{s}": (sx * 0.11, 0.0, 1.18), f"kn{s}": (sx * 0.14, -0.07, 0.66),
        f"an{s}": (sx * 0.15, 0.02, 0.09), f"toe{s}": (sx * 0.155, -0.16, 0.025),
    })
    pa = Vector(J[f"pa{s}"])
    for i, ox in enumerate((-0.03, -0.01, 0.01, 0.03)):
        ox *= sx
        b = pa + Vector((ox, -0.005, -0.03))
        m = b + Vector((ox * 0.4, -0.025, -0.13 - 0.02 * (i in (1, 2))))
        t = m + Vector((ox * 0.2, -0.035, -0.12 - 0.02 * (i in (1, 2))))
        J[f"f{i}a{s}"] = tuple(b); J[f"f{i}b{s}"] = tuple(m); J[f"f{i}c{s}"] = tuple(t)
    J[f"th0{s}"] = (sx * 0.29, -0.13, 0.98)
    J[f"th1{s}"] = (sx * 0.275, -0.17, 0.88)
    J[f"th2{s}"] = (sx * 0.265, -0.19, 0.79)

EDGES = [("pelvis", "spine1"), ("spine1", "spine2"), ("spine2", "chest"), ("chest", "neck0"), ("neck0", "neck1")]
for s in "LR":
    EDGES += [("chest", f"clav{s}"), (f"clav{s}", f"sh{s}"), (f"sh{s}", f"el{s}"), (f"el{s}", f"wr{s}"),
              (f"wr{s}", f"pa{s}"), ("pelvis", f"hip{s}"), (f"hip{s}", f"kn{s}"), (f"kn{s}", f"an{s}"),
              (f"an{s}", f"toe{s}"), (f"wr{s}", f"th0{s}"), (f"th0{s}", f"th1{s}"), (f"th1{s}", f"th2{s}")]
    for i in range(4):
        EDGES += [(f"pa{s}", f"f{i}a{s}"), (f"f{i}a{s}", f"f{i}b{s}"), (f"f{i}b{s}", f"f{i}c{s}")]

RAD = {"pelvis": (0.125, 0.085), "spine1": (0.075, 0.062), "spine2": (0.10, 0.072), "chest": (0.135, 0.095),
       "neck0": (0.042, 0.04), "neck1": (0.034, 0.034)}
for s in "LR":
    RAD.update({f"clav{s}": (0.05, 0.045), f"sh{s}": (0.045, 0.045), f"el{s}": (0.03, 0.03),
                f"wr{s}": (0.02, 0.018), f"pa{s}": (0.028, 0.011), f"hip{s}": (0.07, 0.07),
                f"kn{s}": (0.042, 0.042), f"an{s}": (0.026, 0.026), f"toe{s}": (0.022, 0.014),
                f"th0{s}": (0.011, 0.011), f"th1{s}": (0.009, 0.009), f"th2{s}": (0.005, 0.005)})
    for i in range(4):
        RAD.update({f"f{i}a{s}": (0.0095, 0.0095), f"f{i}b{s}": (0.0075, 0.0075), f"f{i}c{s}": (0.0035, 0.0035)})

names = [n for n in J if n not in ("root", "headtop")]
idx = {n: i for i, n in enumerate(names)}
me = bpy.data.meshes.new("EntityBodyTmp")
me.from_pydata([J[n] for n in names], [(idx[a], idx[b]) for a, b in EDGES], [])
tmp = bpy.data.objects.new("EntityBodyTmp", me)
col.objects.link(tmp)
sk = tmp.modifiers.new("Skin", "SKIN")
sk.branch_smoothing = 0.6
for n, i in idx.items():
    sv = me.skin_vertices[0].data[i]
    sv.radius = RAD[n]
    sv.use_root = (n == "pelvis")
sub = tmp.modifiers.new("Sub", "SUBSURF"); sub.levels = 2; sub.render_levels = 2
dg = bpy.context.evaluated_depsgraph_get()
body_me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
bpy.data.objects.remove(tmp, do_unlink=True); bpy.data.meshes.remove(me)

# рёбра, позвоночник, худоба
bm = bmesh.new(); bm.from_mesh(body_me)
bm.normal_update()
for v in bm.verts:
    p = v.co; n = v.normal
    d = 0.0
    if 1.6 < p.z < 1.9 and abs(p.x) < 0.15:
        ph = (p.z - 1.6) / 0.042
        d += 0.007 * max(0.0, math.sin(ph * 2 * math.pi)) * (1 if p.y < 0.02 or abs(p.x) > 0.08 else 0.3)
    if p.y > 0.03 and abs(p.x) < 0.02 and 1.2 < p.z < 1.95:
        d += 0.006 * max(0.0, math.sin(p.z / 0.035 * 2 * math.pi))
    if 1.3 < p.z < 1.55 and p.y < 0:   # впалый живот
        d -= 0.012
    d += noise.noise(p * 18) * 0.003
    v.co = p + n * d
bm.to_mesh(body_me); bm.free()

# ---------------- голова ----------------
HC = Vector((0, -0.25, 2.24))
HS = Vector((0.092, 0.112, 0.15))
hb = bmesh.new()
bmesh.ops.create_uvsphere(hb, u_segments=40, v_segments=30, radius=1.0)
eyeL, eyeR = Vector((0.37, -0.84, 0.18)).normalized(), Vector((-0.37, -0.84, 0.18)).normalized()
for v in hb.verts:
    p = v.co.copy(); n = p.normalized()
    push = 0.0
    for e in (eyeL, eyeR):
        dd = (n - e).length
        if dd < 0.46:
            push -= 0.6 * (1 - dd / 0.46) ** 1.4
    for c in (Vector((0.62, -0.65, -0.25)), Vector((-0.62, -0.65, -0.25))):
        dd = (n - c.normalized()).length
        if dd < 0.5:
            push -= 0.16 * (1 - dd / 0.5) ** 2
    br = (n - Vector((0, -0.85, 0.42)).normalized()).length
    if br < 0.6:
        push += 0.06 * (1 - br / 0.6)
    if p.z < -0.3:
        p.z *= 1.0 + (-p.z - 0.3) * 0.7     # вытянутая челюсть
    if p.y > 0.2:
        p.y *= 1.12                          # затылок
    p += n * push + n * noise.noise(p * 6) * 0.025
    v.co = p
# прорезь рта
mouth = [f for f in hb.faces if (lambda c: c.y < -0.45 and ((abs(c.x) < 0.66 and -0.66 < c.z < -0.3) or (0.3 < c.x < 0.8 and -0.45 < c.z < -0.08 + (0.8 - c.x) * -0.2)))(f.calc_center_median())]
bmesh.ops.delete(hb, geom=mouth, context="FACES")
for v in hb.verts:
    v.co = HC + Vector((v.co.x * HS.x, v.co.y * HS.y, v.co.z * HS.z))
head_me = bpy.data.meshes.new("EntityHeadTmp"); hb.to_mesh(head_me); hb.free()


def mesh_obj(name, me, mats):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    ob = bpy.data.objects.new(name, me)
    for m in mats:
        me.materials.append(material(m))
    col.objects.link(ob)
    return ob


def box_uv(me, scale=1.5):
    uvl = me.uv_layers.new(name="UVMap") if not me.uv_layers else me.uv_layers[0]
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = ((0, 1), (1, 2), (0, 2))[[2, 0, 1].index(ax)]
        for li in poly.loop_indices:
            c = me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = (c[a] * scale + ax * 0.31, c[b] * scale)
    for poly in me.polygons:
        poly.use_smooth = True


body_me.name = "EntityBody"; box_uv(body_me)
head_me.name = "EntityHead"; box_uv(head_me, 3.0)
body = mesh_obj("Entity_Body", body_me, ["Skin"])
head = mesh_obj("Entity_Head", head_me, ["Skin"])

# ---------------- рот: глотка, зубы, глаза ----------------
X = Builder("Entity_Mouth", collection=col)


def front_y(x, z):
    u = (x / HS.x) ** 2 + ((z - HC.z) / (HS.z * 1.15)) ** 2
    return HC.y - HS.y * math.sqrt(max(0.0, 1 - u))


X.sphere((0, HC.y - 0.055, HC.z - 0.07), 0.05, "Gums", scale=(1.0, 0.7, 0.9))
for row, (zt, sgn) in enumerate(((HC.z - 0.052, -1), (HC.z - 0.09, 1))):
    n = 15
    for i in range(n):
        t = (i / (n - 1)) * 2 - 1
        x = t * 0.052
        z = zt + abs(t) ** 2 * 0.012 * (-sgn)
        y = front_y(x, HC.z - 0.06) + 0.01 + abs(t) * 0.01
        L = random.uniform(0.014, 0.026) * (1.25 if i % 4 == 0 else 1)
        rot = Euler((0.0 if sgn > 0 else math.pi, random.uniform(-0.25, 0.25), random.uniform(-0.2, 0.2))).to_matrix()
        X.cyl((x, y, z + sgn * L / 2), 0.0042, L, "Teeth", r2=0.0006, segs=6, rot=rot)
for e in (eyeL, eyeR):
    p = HC + Vector((e.x * HS.x * 0.3, e.y * HS.y * 0.3, e.z * HS.z * 0.3))
    X.sphere(tuple(p), 0.024, "Eye", segs=14, rings=10, scale=(1, 0.8, 1.15))
mouth_ob = X.finish()

# ---------------- волосы ----------------
hm = bmesh.new()
uvh = hm.loops.layers.uv.new("UVMap")
for k in range(420):
    a = random.uniform(-math.pi, math.pi)                  # 0 = затылок
    el = random.uniform(0.05, 1.0)
    d = Vector((math.sin(a) * math.cos(el * 1.45), math.cos(a) * math.cos(el * 1.45), math.sin(el * 1.45))).normalized()
    if d.y < 0.08:
        continue                                           # лицо открыто
    root = HC + Vector((d.x * HS.x, d.y * HS.y * 1.12, d.z * HS.z)) * 0.99
    length = random.uniform(0.35, 0.9) * (0.6 if d.y < 0 else 1.0)
    pts = []
    p = root.copy()
    out = Vector((d.x, d.y, 0))
    out = out.normalized() if out.length > 1e-3 else Vector((0, 1, 0))
    for i in range(12):
        t = i / 11
        pts.append(p.copy())
        if i < 2:
            p += d * 0.012
        else:
            p += Vector((0, 0, -length / 10)) + out * (0.012 * (1 - t)) + noise.noise_vector(p * 5 + Vector((k * 0.37, 0, 0))) * 0.008
    w = random.uniform(0.0025, 0.0065)
    side = out.cross(Vector((0, 0, 1))).normalized()
    prev = None
    for i, q in enumerate(pts):
        ww = w * (1 - i / 13)
        v1 = hm.verts.new(q - side * ww); v2 = hm.verts.new(q + side * ww)
        if prev:
            f = hm.faces.new((prev[0], prev[1], v2, v1))
            for l, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                l[uvh].uv = uv
        prev = (v1, v2)
hair_me = bpy.data.meshes.new("EntityHair"); hm.to_mesh(hair_me); hm.free()
for p_ in hair_me.polygons:
    p_.use_smooth = True
hair = mesh_obj("Entity_Hair", hair_me, ["Hair"])

# ---------------- платье ----------------
db = bmesh.new()
uvd = db.loops.layers.uv.new("UVMap")
rings_, segs_ = 16, 36
z_top, z_bot = 1.9, 0.92
grid = []
for r in range(rings_ + 1):
    t = r / rings_
    z = z_top + (z_bot - z_top) * t
    # обхват по телу + расклёшенность книзу
    if z > 1.55:
        rx, ry = 0.15, 0.108
    elif z > 1.3:
        rx, ry = 0.13 + (1.55 - z) * 0.2, 0.1 + (1.55 - z) * 0.12
    else:
        rx, ry = 0.18 + (1.3 - z) * 0.6, 0.13 + (1.3 - z) * 0.5
    cy = -0.08 + (1.82 - z) * 0.08 if z > 1.62 else -0.04 + (1.62 - z) * 0.1
    cy = max(cy, -0.06) if z < 1.4 else cy
    row = []
    for s_ in range(segs_):
        a = s_ / segs_ * 2 * math.pi
        x = math.sin(a) * rx; y = cy - math.cos(a) * ry
        p = Vector((x, y, z))
        p += noise.noise_vector(p * 7) * 0.012 * (0.4 + t)
        if r == rings_:
            p.z += random.uniform(-0.07, 0.04)
        row.append(db.verts.new(p))
    grid.append(row)
for r in range(rings_):
    for s_ in range(segs_):
        if r > rings_ - 5 and random.random() < 0.08:
            continue                                          # дыры и прорехи
        a, b = grid[r][s_], grid[r][(s_ + 1) % segs_]
        c, d = grid[r + 1][(s_ + 1) % segs_], grid[r + 1][s_]
        f = db.faces.new((a, d, c, b))
        for l, uv in zip(f.loops, ((s_ / segs_ * 3, r / rings_ * 2), (s_ / segs_ * 3, (r + 1) / rings_ * 2),
                                   ((s_ + 1) / segs_ * 3, (r + 1) / rings_ * 2), ((s_ + 1) / segs_ * 3, r / rings_ * 2))):
            l[uvd].uv = uv
# бретельки
for sx in (1, -1):
    for i in range(6):
        pass
dress_me = bpy.data.meshes.new("EntityDress"); db.to_mesh(dress_me); db.free()
for p_ in dress_me.polygons:
    p_.use_smooth = True
dress = mesh_obj("Entity_Dress", dress_me, ["Dress"])

# ---------------- арматура ----------------
old = bpy.data.objects.get("Entity")
if old:
    bpy.data.objects.remove(old, do_unlink=True)
arm_data = bpy.data.armatures.new("EntityRig")
rig = bpy.data.objects.new("Entity", arm_data)
col.objects.link(rig)
BONES = [  # имя, голова, хвост, родитель
    ("root", "root", (0, 0, 0.3), None),
    ("pelvis", "pelvis", "spine1", "root"), ("spine1", "spine1", "spine2", "pelvis"),
    ("spine2", "spine2", "chest", "spine1"), ("chest", "chest", "neck0", "spine2"),
    ("neck", "neck0", "neck1", "chest"), ("head", "neck1", "headtop", "neck"),
    ("jaw", (0, -0.21, 2.17), (0, -0.33, 2.11), "head"),
]
for s in "LR":
    BONES += [(f"clav.{s}", f"clav{s}", f"sh{s}", "chest"), (f"upperarm.{s}", f"sh{s}", f"el{s}", f"clav.{s}"),
              (f"forearm.{s}", f"el{s}", f"wr{s}", f"upperarm.{s}"), (f"hand.{s}", f"wr{s}", f"pa{s}", f"forearm.{s}"),
              (f"thigh.{s}", f"hip{s}", f"kn{s}", "pelvis"), (f"shin.{s}", f"kn{s}", f"an{s}", f"thigh.{s}"),
              (f"foot.{s}", f"an{s}", f"toe{s}", f"shin.{s}"),
              (f"thumb1.{s}", f"wr{s}", f"th1{s}", f"hand.{s}"), (f"thumb2.{s}", f"th1{s}", f"th2{s}", f"thumb1.{s}")]
    for i in range(4):
        BONES += [(f"finger{i}a.{s}", f"f{i}a{s}", f"f{i}b{s}", f"hand.{s}"),
                  (f"finger{i}b.{s}", f"f{i}b{s}", f"f{i}c{s}", f"finger{i}a.{s}")]


def P(x):
    return Vector(J[x]) if isinstance(x, str) else Vector(x)


bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects:
    o.select_set(False)
rig.select_set(True)
with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[rig]):
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones
    for name, h, t, par in BONES:
        b = eb.new(name)
        b.head = P(h); b.tail = P(t)
        b.align_roll(Vector((0, -1, 0)) if abs((P(t) - P(h)).normalized().y) < 0.9 else Vector((0, 0, 1)))
        if par:
            b.parent = eb[par]
            b.use_connect = False
        b.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")

# ---------------- веса ----------------
segs = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in arm_data.bones if b.use_deform}


def seg_dist(p, a, b):
    q, t = intersect_point_line(p, a, b)
    t = min(1, max(0, t))
    return (p - (a + (b - a) * t)).length


def auto_weights(ob, allowed=None, sharp=4.0, top=3, override=None):
    for g in list(ob.vertex_groups):
        ob.vertex_groups.remove(g)
    groups = {n: ob.vertex_groups.new(name=n) for n in segs}
    names_ = [n for n in segs if (allowed is None or n in allowed)]
    for v in ob.data.vertices:
        if override:
            o = override(v.co)
            if o:
                for n, w in o.items():
                    groups[n].add([v.index], w, "REPLACE")
                continue
        ds = sorted(((seg_dist(v.co, *segs[n]), n) for n in names_))[:top]
        ws = [(1.0 / (d ** sharp + 1e-9), n) for d, n in ds]
        tot = sum(w for w, _ in ws)
        for w, n in ws:
            if w / tot > 0.02:
                groups[n].add([v.index], w / tot, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE"); mod.object = rig
    ob.parent = rig


auto_weights(body, allowed=[n for n in segs if n not in ("head", "jaw")])


def head_w(p):
    rel = p - HC
    if rel.z < -0.07 and rel.y < -0.02:
        k = min(1.0, (-0.07 - rel.z) / 0.03)
        return {"jaw": k, "head": 1 - k} if k < 1 else {"jaw": 1.0}
    if p.z < 2.13:
        k = min(1.0, (2.13 - p.z) / 0.05)
        return {"neck": k, "head": 1 - k} if k < 1 else {"neck": 1.0}
    return {"head": 1.0}


auto_weights(head, override=head_w)
auto_weights(mouth_ob, override=lambda p: {"jaw": 1.0} if (p - HC).z < -0.072 and (p - HC).y < -0.02 else {"head": 1.0})
auto_weights(hair, override=lambda p: {"head": 1.0} if p.z > 1.95 else {"head": 0.6, "neck": 0.4})
auto_weights(dress, allowed=["chest", "spine2", "spine1", "pelvis", "thigh.L", "thigh.R"], sharp=2.0)
print("rig ok", len(arm_data.bones))
