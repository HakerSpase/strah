# Общие помощники для моделирования через bmesh: материалы, коробки, цилиндры, UV.
import math
import os
import bmesh
import bpy
from mathutils import Matrix, Vector, noise

TEX = r"C:\My_pc\strah\art\textures"

# имя материала -> (текстура, оттенок, повторов на метр, доп. параметры)
MATS = {
    "Wallpaper":         ("wallpaper", (1, 1, 1), 1.0, {}),
    "Wallpaper_Corr":    ("wallpaper", (0.80, 0.86, 0.74), 1.0, {}),
    "Wallpaper_Mom":     ("wallpaper", (0.92, 0.70, 0.70), 1.0, {}),
    "Wallpaper_Kitchen": ("wallpaper", (0.86, 0.92, 0.98), 1.0, {}),
    "Wallpaper_Kids":    ("wallpaper", (1.0, 0.82, 0.86), 1.4, {}),
    "Paint_Green":       ("ph:painted_plaster_wall", (0.55, 0.70, 0.58), 0.5, {}),
    "Parquet":           ("ph:diagonal_parquet", (0.62, 0.50, 0.42), 1 / 2.36, {}),
    "Ceiling":           ("ph:painted_plaster_wall", (0.95, 0.92, 0.85), 0.5, {}),
    "Linoleum":          ("linoleum", (1, 1, 1), 1.0, {}),
    "Tiles":             ("ph:long_white_tiles", (1, 1, 1), 1 / 1.27, {}),
    "Tiles_Floor":       ("ph:dirty_tiles", (1, 1, 1), 1 / 2.26, {}),
    "PaintedWood":       ("painted_wood", (1, 1, 1), 1.5, {}),
    "DarkWood":          ("ph:rosewood_veneer1", (0.55, 0.42, 0.36), 1 / 2.43 * 2, {}),
    "Fabric":            ("fabric", (0.75, 0.75, 0.75), 2.0, {}),
    "Coat":              ("fabric", (0.22, 0.22, 0.26), 2.0, {}),
    "Linen":             ("ceiling", (1.0, 0.97, 0.92), 2.0, {}),
    "Lampshade":         ("ceiling", (0.95, 0.80, 0.55), 2.0, {}),
    "Leatherette":       ("ceiling", (0.16, 0.09, 0.06), 3.0, {"rough": 0.45}),
    "Carpet":            ("carpet", (1, 1, 1), "fit", {}),
    "Enamel":            ("enamel", (1, 1, 1), 1.0, {}),
    "Enamel_Brown":      ("enamel", (0.40, 0.22, 0.13), 1.0, {}),
    "Paper":             ("paper", (1, 1, 1), "fit", {"rough": 0.9}),
    "Photo_Family":      ("photo_family", (1, 1, 1), "fit", {"rough": 0.3}),
    "Photo_Girl":        ("photo_girl", (1, 1, 1), "fit", {"rough": 0.3}),
    "Night":             ("night", (1, 1, 1), "fit", {"emit": True}),
    "Skin":              ("skin", (1, 1, 1), 1.5, {}),
    "Dress":             ("ceiling", (0.52, 0.58, 0.66), 2.0, {}),
    "Drawing1":          ("drawing1", (1, 1, 1), "fit", {"rough": 0.9}),
    "Drawing2":          ("drawing2", (1, 1, 1), "fit", {"rough": 0.9}),
    "Drawing3":          ("drawing3", (1, 1, 1), "fit", {"rough": 0.9}),
    "Plush":             ("fabric", (0.42, 0.28, 0.16), 4.0, {}),
    "PinkBlanket":       ("fabric", (0.85, 0.55, 0.62), 2.0, {}),
    "GasFlame":          (None, (0.2, 0.4, 1.0), 1.0, {"emit_col": (0.25, 0.45, 1.0)}),
    "WaterStream":       (None, (0.7, 0.75, 0.8), 1.0, {"rough": 0.05, "alpha": 0.5}),
    "FridgeInside":      (None, (0.85, 0.86, 0.84), 1.0, {"rough": 0.35}),
    # --- двор ---
    "Asphalt":           ("ph:asphalt_06", (0.55, 0.55, 0.58), 1 / 3, {}),
    "Concrete":          ("ph:concrete", (0.62, 0.62, 0.60), 0.5, {}),
    "Bark":              ("ph:bark_brown_01", (0.45, 0.40, 0.36), 1.0, {}),
    "Facade_A":          ("facade_a", (1, 1, 1), "fit", {}),
    "Facade_B":          ("facade_b", (1, 1, 1), "fit", {}),
    "Facade_C":          ("facade_c", (1, 1, 1), "fit", {}),
    "Facade_Own":        ("facade_own", (1, 1, 1), "fit", {}),
    "Snow":              ("ph:snow_02", (0.85, 0.87, 0.95), 1 / 2, {}),
    "AsphaltSnow":       ("ph:asphalt_snow", (0.8, 0.8, 0.85), 1 / 2, {}),
    "Sky":               ("sky", (1, 1, 1), "fit", {"emit": True}),
    "Rust":              ("enamel", (0.42, 0.24, 0.15), 0.6, {}),
    "CarRed":            ("enamel", (0.45, 0.08, 0.06), 1.0, {}),
    "CarBeige":          ("enamel", (0.75, 0.68, 0.52), 1.0, {}),
    "CarGreen":          ("enamel", (0.15, 0.28, 0.22), 1.0, {}),
    "PipeGreen":         ("enamel", (0.20, 0.35, 0.25), 1.0, {}),
    "Sodium":            (None, (1.0, 0.6, 0.25), 1.0, {"emit_col": (1.0, 0.55, 0.2)}),
    "EntranceLamp":      (None, (1.0, 0.85, 0.6), 1.0, {"emit_col": (1.0, 0.8, 0.5)}),
    "Puddle":            (None, (0.01, 0.01, 0.012), 1.0, {"rough": 0.03}),
    "CarGlass":          (None, (0.02, 0.025, 0.03), 1.0, {"rough": 0.05}),
    "Metal":             (None, (0.50, 0.50, 0.52), 1.0, {"metal": 1.0, "rough": 0.45}),
    "Brass":             (None, (0.60, 0.45, 0.22), 1.0, {"metal": 1.0, "rough": 0.35}),
    "Chrome":            (None, (0.80, 0.80, 0.82), 1.0, {"metal": 1.0, "rough": 0.15}),
    "Black":             (None, (0.02, 0.02, 0.02), 1.0, {"rough": 0.6}),
    "Bakelite":          (None, (0.03, 0.025, 0.02), 1.0, {"rough": 0.25}),
    "Glass":             (None, (0.55, 0.62, 0.60), 1.0, {"rough": 0.05, "alpha": 0.18}),
    "Glass_Frosted":     (None, (0.75, 0.75, 0.70), 1.0, {"rough": 0.6, "alpha": 0.55}),
    "Mirror":            (None, (0.85, 0.85, 0.85), 1.0, {"metal": 1.0, "rough": 0.04}),
    "Bulb":              (None, (1.0, 0.85, 0.6), 1.0, {"emit_col": (1.0, 0.8, 0.5)}),
    "TVScreen":          (None, (0.02, 0.025, 0.025), 1.0, {"rough": 0.1}),
    "Water":             (None, (0.03, 0.025, 0.02), 1.0, {"rough": 0.02}),
    "Teeth":             (None, (0.62, 0.56, 0.42), 1.0, {"rough": 0.35}),
    "Hair":              (None, (0.015, 0.012, 0.01), 1.0, {"rough": 0.7}),
    "Eye":               (None, (0.0, 0.0, 0.0), 1.0, {"rough": 0.35}),
    "Gums":              (None, (0.07, 0.015, 0.015), 1.0, {"rough": 0.25}),
}


def _maps(tex):
    """Пути к картам текстуры: свои PNG или фотосканы Poly Haven (префикс ph:)."""
    if tex.startswith("ph:"):
        base = os.path.join(TEX, "ph", tex[3:])
        return {"albedo": base + "_Diffuse.jpg", "rough": base + "_Rough.jpg", "normal": base + "_nor_gl.jpg"}
    return {k: os.path.join(TEX, tex + "_" + k + ".png") for k in ("albedo", "rough", "normal")}


def _img(path, noncolor=False):
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    return img


def material(name):
    m = bpy.data.materials.get(name)
    if m:
        return m
    tex, tint, _, opt = MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if tex:
        maps = _maps(tex)
        ia = nt.nodes.new("ShaderNodeTexImage"); ia.image = _img(maps["albedo"])
        if tuple(tint) != (1, 1, 1):
            mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
            ins = {s.identifier: s for s in mix.inputs}
            outs = {s.identifier: s for s in mix.outputs}
            ins["Factor_Float"].default_value = 1.0
            ins["B_Color"].default_value = (*tint, 1)
            nt.links.new(ia.outputs[0], ins["A_Color"])
            nt.links.new(outs["Result_Color"], bsdf.inputs["Base Color"])
        else:
            nt.links.new(ia.outputs[0], bsdf.inputs["Base Color"])
        emit_path = maps["albedo"].replace("_albedo.png", "_emit.png")
        if opt.get("emit") or (emit_path != maps["albedo"] and os.path.exists(emit_path)):
            ie = ia
            if os.path.exists(emit_path):
                ie = nt.nodes.new("ShaderNodeTexImage"); ie.image = _img(emit_path)
            nt.links.new(ie.outputs[0], bsdf.inputs["Emission Color"])
            bsdf.inputs["Emission Strength"].default_value = 1.0
        if os.path.exists(maps["rough"]) and "rough" not in opt:
            ir = nt.nodes.new("ShaderNodeTexImage"); ir.image = _img(maps["rough"], True)
            nt.links.new(ir.outputs[0], bsdf.inputs["Roughness"])
        if os.path.exists(maps["normal"]):
            inn = nt.nodes.new("ShaderNodeTexImage"); inn.image = _img(maps["normal"], True)
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(inn.outputs[0], nm.inputs["Color"])
            nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    else:
        bsdf.inputs["Base Color"].default_value = (*tint, 1)
    if "rough" in opt:
        bsdf.inputs["Roughness"].default_value = opt["rough"]
    bsdf.inputs["Metallic"].default_value = opt.get("metal", 0.0)
    if "emit_col" in opt:
        bsdf.inputs["Emission Color"].default_value = (*opt["emit_col"], 1)
        bsdf.inputs["Emission Strength"].default_value = 4.0
    if "alpha" in opt:
        bsdf.inputs["Alpha"].default_value = opt["alpha"]
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
    return m


def uv_scale(mat):
    return MATS[mat][2]


class Builder:
    """Собирает один меш из многих деталей. Координаты деталей мировые,
    либо локальные (если local=True) относительно origin."""

    def __init__(self, name, origin=(0, 0, 0), local=False, collection=None):
        self.name = name
        self.origin = Vector(origin)
        self.local = local
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.tag = self.bm.faces.layers.int.new("done")
        self.mats = []
        self.collection = collection

    def _mi(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def _finish_part(self, mat, uv="world", smooth=False, fit_axes=None):
        bm = self.bm
        new = [f for f in bm.faces if f[self.tag] == 0]
        if not new:
            return
        verts = {v for f in new for v in f.verts}
        if uv == "fit":
            lo = Vector((min(v.co.x for v in verts), min(v.co.y for v in verts), min(v.co.z for v in verts)))
            hi = Vector((max(v.co.x for v in verts), max(v.co.y for v in verts), max(v.co.z for v in verts)))
            ext = hi - lo
        for f in new:
            f.normal_update()
            m = mat(f) if callable(mat) else mat
            f.material_index = self._mi(m)
            sc = uv_scale(m)
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for l in f.loops:
                c = l.vert.co
                if ax == 2:
                    a, b = (0, 1)
                elif ax == 0:
                    a, b = (1, 2)
                else:
                    a, b = (0, 2)
                if uv == "fit" or sc == "fit":
                    if uv != "fit":
                        lo_ = Vector((min(v.co.x for v in f.verts), min(v.co.y for v in f.verts), min(v.co.z for v in f.verts)))
                        hi_ = Vector((max(v.co.x for v in f.verts), max(v.co.y for v in f.verts), max(v.co.z for v in f.verts)))
                        lo, ext = lo_, hi_ - lo_
                    u = (c[a] - lo[a]) / max(ext[a], 1e-6)
                    v = (c[b] - lo[b]) / max(ext[b], 1e-6)
                    # зеркалим, чтобы картинка читалась с лицевой стороны
                    if (ax == 0 and n[0] < 0) or (ax == 1 and n[1] > 0):
                        u = 1 - u
                    l[self.uv].uv = (u, v)
                else:
                    off = 0.37 * ax
                    l[self.uv].uv = (c[a] * sc + off, c[b] * sc + off)
            f.smooth = smooth
            f[self.tag] = 1

    def _xf(self, verts, M):
        bmesh.ops.transform(self.bm, matrix=M, verts=list(verts))

    def box(self, lo, hi, mat, bevel=0.0, segs=2, rot=None, pivot=None, uv="world", smooth=None):
        lo, hi = Vector(lo), Vector(hi)
        size = hi - lo
        ret = bmesh.ops.create_cube(self.bm, size=1.0)
        vs = ret["verts"]
        S = Matrix.Diagonal((*size, 1.0))
        T = Matrix.Translation((lo + hi) / 2)
        M = T @ S
        if rot is not None:
            p = Vector(pivot) if pivot is not None else (lo + hi) / 2
            R = Matrix.Translation(p) @ rot.to_4x4() @ Matrix.Translation(-p)
            M = R @ M
        self._xf(vs, M)
        if bevel > 0:
            edges = list({e for v in vs for e in v.link_edges})
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=segs, affect="EDGES",
                            profile=0.5, clamp_overlap=True)
        self._finish_part(mat, uv=uv, smooth=(bevel > 0) if smooth is None else smooth)

    def cyl(self, center, r, depth, mat, axis="Z", segs=20, r2=None, rot=None, bevel=0.0, smooth=True):
        ret = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                    radius1=r, radius2=r if r2 is None else r2, depth=depth)
        vs = ret["verts"]
        R = Matrix.Identity(4)
        if axis == "X":
            R = Matrix.Rotation(math.pi / 2, 4, "Y")
        elif axis == "Y":
            R = Matrix.Rotation(math.pi / 2, 4, "X")
        if rot is not None:
            R = rot.to_4x4() @ R
        self._xf(vs, Matrix.Translation(Vector(center)) @ R)
        if bevel > 0:
            edges = [e for e in {e for v in vs for e in v.link_edges} if e.calc_face_angle(0) > 0.6]
            bmesh.ops.bevel(self.bm, geom=edges, offset=bevel, segments=2, affect="EDGES", profile=0.5, clamp_overlap=True)
        self._finish_part(mat, smooth=smooth)

    def sphere(self, center, r, mat, scale=(1, 1, 1), segs=16, rings=10, rot=None):
        ret = bmesh.ops.create_uvsphere(self.bm, u_segments=segs, v_segments=rings, radius=r)
        vs = ret["verts"]
        M = Matrix.Translation(Vector(center))
        if rot is not None:
            M = M @ rot.to_4x4()
        M = M @ Matrix.Diagonal((*scale, 1.0))
        self._xf(vs, M)
        self._finish_part(mat, smooth=True)

    def soft_box(self, lo, hi, mat, cuts=6, round_=0.6, noise_amp=0.0, noise_scale=3.0, sag=0.0, seed=0):
        """Мягкий предмет (подушка, одеяло, пальто): подразделённый и скруглённый куб с шумом."""
        lo, hi = Vector(lo), Vector(hi)
        ret = bmesh.ops.create_cube(self.bm, size=2.0)
        vs = set(ret["verts"])
        edges = list({e for v in vs for e in v.link_edges})
        bmesh.ops.subdivide_edges(self.bm, edges=edges, cuts=cuts, use_grid_fill=True)
        vs = {v for f in self.bm.faces if f[self.tag] == 0 for v in f.verts}
        c = (lo + hi) / 2; h = (hi - lo) / 2
        off = Vector((seed * 1.7, seed * 3.1, seed * 0.7))
        for v in vs:
            p = v.co.copy()
            sp = p.normalized() if p.length > 0 else p
            p = p.lerp(sp * 1.0, round_ * 0.5)
            w = Vector((p.x * h.x, p.y * h.y, p.z * h.z))
            if noise_amp:
                w += noise.noise_vector(w * noise_scale + off) * noise_amp
            if sag:
                w.z -= sag * (1 - min(1, (p.x * p.x + p.y * p.y)))
            v.co = c + w
        self._finish_part(mat, smooth=True)

    def finish(self, sharp_angle=40.0):
        bm = self.bm
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(sharp_angle):
                e.smooth = False
        if not self.local:
            bmesh.ops.translate(bm, vec=-self.origin, verts=bm.verts)
        bm.faces.layers.int.remove(self.tag)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for m in self.mats:
            me.materials.append(material(m))
        old = bpy.data.objects.get(self.name)
        if old:
            bpy.data.objects.remove(old, do_unlink=True)
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.origin
        (self.collection or bpy.context.scene.collection).objects.link(ob)
        return ob


def empty(name, loc, rot_z=0.0, collection=None, **props):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    ob.empty_display_size = 0.2
    for k, v in props.items():
        ob[k] = v
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def get_collection(name, clear=True):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(col)
    elif clear:
        for ob in list(col.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
    return col
