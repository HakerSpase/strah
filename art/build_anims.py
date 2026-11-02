# Анимации «Жильца»: процедурные кривые, запечённые покадрово в отдельные Actions.
# Ось X каждой кости = «наклон вперёд», Z = «наклон вбок», Y = скручивание (см. align_roll в build_entity.py).
import math
import bpy

rig = bpy.data.objects["Entity"]
FPS = 30
bpy.context.scene.render.fps = FPS
TAU = 2 * math.pi
SIDES = (("L", 1), ("R", -1))
FINGERS = [f"finger{i}{p}.{s}" for i in range(4) for p in "ab" for s in "LR"]


def snap(t, t0, dur):
    """Резкий переход 0→1 начиная с t0 за dur кадров."""
    x = min(1.0, max(0.0, (t - t0) / max(dur, 1e-6)))
    return x * x * (3 - 2 * x)


def tremor(ph, k=1.0):
    return k * (math.sin(ph * 17) + math.sin(ph * 23 + 1.3) + math.sin(ph * 31 + 2.1)) / 3


def base_pose():
    p = {b.name: [0.0, 0.0, 0.0] for b in rig.pose.bones}
    p["spine1"][0] = 0.12; p["spine2"][0] = 0.18; p["chest"][0] = 0.22
    p["neck"][0] = 0.15; p["head"][0] = -0.55
    p["jaw"][0] = 0.12
    for s, sx in SIDES:
        p[f"clav.{s}"][0] = 0.15
        p[f"upperarm.{s}"][0] = 0.12
        p[f"forearm.{s}"][0] = 0.18
        p[f"thigh.{s}"][0] = 0.22
        p[f"shin.{s}"][0] = -0.4
        p[f"foot.{s}"][0] = 0.18
        for i in range(4):
            p[f"finger{i}a.{s}"][0] = 0.2
            p[f"finger{i}b.{s}"][0] = 0.3
    p["__loc"] = [0.0, -0.05, 0.0]   # смещение таза (по локальной Y кости = вверх)
    return p


def idle(t, T):
    ph = TAU * t / T
    p = base_pose()
    p["chest"][0] += 0.04 * math.sin(ph * 2); p["spine2"][0] += 0.02 * math.sin(ph * 2)
    p["head"][2] = 0.1 + 0.45 * snap(t, 25, 2) - 0.75 * snap(t, 70, 2) + 0.3 * snap(t, 96, 20)
    p["head"][1] = 0.3 * snap(t, 38, 18) - 0.4 * snap(t, 58, 2) + 0.1 * snap(t, 88, 26)
    p["head"][0] += tremor(ph, 0.015)
    p["neck"][2] = 0.1 * math.sin(ph)
    p["jaw"][0] = 0.22 + 0.06 * math.sin(ph * 3) + tremor(ph, 0.03)
    for s, sx in SIDES:
        p[f"upperarm.{s}"][0] += 0.04 * math.sin(ph + (0 if sx > 0 else 1.5))
        for i in range(4):
            p[f"finger{i}a.{s}"][0] += 0.12 * math.sin(ph * 2 + i * 0.7 + sx)
            p[f"finger{i}b.{s}"][0] += 0.18 * math.sin(ph * 2 + i * 0.7 + sx + 0.5)
    return p


def walk(t, T):
    ph = TAU * t / T
    p = base_pose()
    for s, sx in SIDES:
        f = ph if sx > 0 else ph + math.pi
        p[f"thigh.{s}"][0] += 0.42 * math.sin(f)
        p[f"shin.{s}"][0] += -0.85 * max(0.0, math.cos(f)) - 0.05
        p[f"foot.{s}"][0] += 0.25 * max(0.0, -math.sin(f))
        # руки болтаются в противофазе и с запаздыванием
        p[f"upperarm.{s}"][0] += -0.32 * math.sin(f - 0.6)
        p[f"forearm.{s}"][0] += 0.18 * math.sin(f - 1.2) + 0.1
        p[f"hand.{s}"][0] = 0.2 * math.sin(f - 1.8)
    p["__loc"][1] = -0.07 + 0.025 * math.cos(2 * ph)
    p["pelvis"][1] = 0.1 * math.sin(ph)
    p["spine2"][1] = -0.08 * math.sin(ph)
    p["spine1"][2] = 0.06 * math.sin(ph)
    p["head"][2] = 0.25 * math.sin(ph - 1.0) + 0.35 * (snap(t, 13, 1) - snap(t, 17, 4))
    p["head"][0] += 0.07 * math.sin(2 * ph - 1.5)
    p["jaw"][0] = 0.3 + 0.1 * math.sin(2 * ph)
    return p


def run(t, T):
    ph = TAU * t / T
    p = base_pose()
    p["spine1"][0] += 0.18; p["spine2"][0] += 0.18; p["chest"][0] += 0.12
    p["head"][0] -= 0.4
    for s, sx in SIDES:
        f = ph if sx > 0 else ph + math.pi
        p[f"thigh.{s}"][0] += 0.25 + 0.62 * math.sin(f)
        p[f"shin.{s}"][0] += -1.25 * max(0.0, math.cos(f)) - 0.15
        p[f"foot.{s}"][0] += 0.35 * max(0.0, -math.sin(f))
        # тянется к игроку
        p[f"upperarm.{s}"][0] += 1.4 + 0.22 * math.sin(f + math.pi)
        p[f"upperarm.{s}"][2] = 0.15 * sx
        p[f"forearm.{s}"][0] = 0.12
        for i in range(4):
            p[f"finger{i}a.{s}"][0] = -0.25 + 0.15 * math.sin(f * 2 + i)
            p[f"finger{i}b.{s}"][0] = -0.1
    p["__loc"][1] = -0.1 + 0.045 * math.cos(2 * ph)
    p["pelvis"][1] = 0.14 * math.sin(ph)
    p["head"][2] = 0.18 * math.sin(ph) + tremor(ph, 0.04)
    p["jaw"][0] = 0.75 + 0.15 * math.sin(4 * ph)
    return p


def attack(t, T):
    ph = TAU * t / T
    k1 = snap(t, 0, 7); k2 = snap(t, 9, 5)
    p = base_pose()
    p["chest"][0] += -0.25 * k1 + 0.55 * k2
    p["spine2"][0] += -0.1 * k1 + 0.35 * k2
    p["head"][0] += -0.45 * k1 + 0.25 * k2
    p["head"][2] = 0.35 * k1 - 0.35 * k2 + tremor(ph * 2, 0.05)
    p["jaw"][0] = 0.2 + 0.95 * k1 + 0.3 * k2 + tremor(ph * 3, 0.05)
    for s, sx in SIDES:
        p[f"upperarm.{s}"][0] += 1.6 * k1 - 0.15 * k2
        p[f"upperarm.{s}"][2] = 0.3 * sx * k1 - 0.2 * sx * k2
        p[f"forearm.{s}"][0] += 0.3 * k1 - 0.25 * k2
        for i in range(4):
            p[f"finger{i}a.{s}"][0] = 0.2 - 0.55 * k1 + 0.8 * k2
            p[f"finger{i}b.{s}"][0] = 0.3 - 0.3 * k1 + 0.7 * k2
    p["__loc"][1] = -0.05 - 0.05 * k2
    return p


def peek(t, T):
    ph = TAU * t / T
    p = base_pose()
    p["spine1"][2] = 0.2; p["spine2"][2] = 0.25; p["chest"][2] = 0.2
    p["neck"][2] = 0.3
    p["head"][2] = 1.1 + tremor(ph, 0.03) + 0.06 * math.sin(ph)
    p["jaw"][0] = 0.35 + tremor(ph * 2, 0.04)
    for s, sx in SIDES:
        for i in range(4):
            p[f"finger{i}a.{s}"][0] += 0.2 * math.sin(ph * 3 + i)
    return p


def scratch(t, T):
    """Упёрлось лбом в дверь: руки вверх, пальцы скребут, голова бьётся."""
    ph = TAU * t / T
    p = base_pose()
    p["spine1"][0] += 0.1; p["spine2"][0] += 0.15; p["chest"][0] += 0.1
    p["head"][0] += 0.35 + 0.12 * max(0.0, math.sin(ph * 2)) ** 8   # удар лбом
    p["head"][2] = 0.2 * math.sin(ph * 0.5) + tremor(ph, 0.05)
    p["jaw"][0] = 0.45 + 0.25 * math.sin(ph * 3) + tremor(ph * 2, 0.05)
    for s_, sx in SIDES:
        f = ph * 2 + (0 if sx > 0 else math.pi * 0.7)
        p[f"upperarm.{s_}"][0] += 1.9 + 0.12 * math.sin(f)
        p[f"upperarm.{s_}"][2] = 0.25 * sx
        p[f"forearm.{s_}"][0] = 0.5 + 0.35 * math.sin(f)              # скребёт сверху вниз
        p[f"hand.{s_}"][0] = -0.4 + 0.3 * math.sin(f + 0.6)
        for i in range(4):
            p[f"finger{i}a.{s_}"][0] = 0.3 + 0.5 * math.sin(f + i * 0.4)
            p[f"finger{i}b.{s_}"][0] = 0.6 + 0.5 * math.sin(f + i * 0.4 + 0.5)
    p["__loc"][1] = -0.05 + 0.01 * math.sin(ph * 2)
    return p


def hunt(t, T):
    """Охота: рваная, «сломанная» походка — длинный шаг, рывок головы, руки висят до колен."""
    ph = TAU * t / T
    p = walk(t, T)
    p["spine1"][0] += 0.12; p["chest"][0] += 0.1
    p["head"][0] -= 0.25
    p["head"][2] += 0.6 * (snap(t, 8, 1) - snap(t, 12, 6)) - 0.5 * (snap(t, 27, 1) - snap(t, 31, 8))
    p["neck"][1] = 0.4 * (snap(t, 18, 1) - snap(t, 24, 6))
    for s_, sx in SIDES:
        f = ph if sx > 0 else ph + math.pi
        p[f"upperarm.{s_}"][0] = 0.1 - 0.2 * math.sin(f - 0.6)
        p[f"forearm.{s_}"][0] = 0.05
        for i in range(4):
            p[f"finger{i}a.{s_}"][0] = 0.4 + 0.25 * math.sin(ph * 6 + i)
    # хромает: одна нога короче
    p["__loc"][1] += 0.03 * max(0.0, math.sin(ph))
    p["pelvis"][2] = 0.08 * math.sin(ph)
    return p


def bake(name, fn, frames, loop=True):
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    T = frames
    last = frames if loop else frames
    for f in range(0, last + 1):
        tt = f % T if loop else f
        pose = fn(tt, T)
        for pb in rig.pose.bones:
            if pb.name == "root":
                continue
            pb.rotation_euler = pose[pb.name]
            pb.keyframe_insert("rotation_euler", frame=f)
        pb = rig.pose.bones["pelvis"]
        pb.location = pose["__loc"]
        pb.keyframe_insert("location", frame=f)
    act.frame_range = (0, last)
    return act


ACTIONS = [("Idle", idle, 120, True), ("Walk", walk, 40, True), ("Run", run, 22, True),
           ("Attack", attack, 36, False), ("Peek", peek, 60, True), ("Scratch", scratch, 50, True), ("Walk", hunt, 40, True)]
for name, fn, n, loop in ACTIONS:
    bake(name, fn, n, loop)
rig.animation_data.action = bpy.data.actions["Idle"]
print("anims ok", [a.name for a in bpy.data.actions])
