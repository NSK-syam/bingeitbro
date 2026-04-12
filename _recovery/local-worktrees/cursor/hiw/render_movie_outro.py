#!/usr/bin/env python3
"""
BIB — Movie-Themed Cinematic Outro v3
Cinema-first design:
  • Film leader countdown (scratchy 3-2-1 flash)
  • Red cinema curtains sweep open
  • Dual spotlight beams from upper corners
  • Film strip borders (perforations) left + right
  • Film grain on every frame
  • Star/sparkle particles floating up
  • Letterbox bars (cinematic black top+bottom)
  • Logo drops in through spotlight + bounces
  • Shockwave + star-burst explosion on impact
  • Film projector flicker aesthetic
  • Whoosh + dramatic cinematic thud + film reel audio tail

1080×1920 | 30 fps | 4 s | H.264 + AAC
"""

import math, os, random, wave, shutil, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

# ── Config ────────────────────────────────────────────────────────────────
W, H        = 1080, 1920
FPS         = 30
DURATION    = 4.0
TOTAL       = int(FPS * DURATION)
LOGO_PATH   = "/Users/syam/.cursor/projects/Users-syam-Movie-Recom/assets/bibicon-2dba35c3-f6ce-4fa2-9974-9adb34b8b99a.png"
OUT_DIR     = "/Users/syam/.cursor/worktrees/Movie_Recom/hiw"
FRAME_DIR   = tempfile.mkdtemp(prefix="bib_movie_")

random.seed(42)
np.random.seed(42)
rng = np.random.default_rng(42)

# ── Timeline ──────────────────────────────────────────────────────────────
LEADER_END    = 0.7    # film leader flashes end
CURTAIN_END   = 1.6    # curtains fully open
LOGO_ENTER    = 1.2    # logo starts rising
IMPACT_T      = 2.1    # logo snaps to center
SETTLE_END    = 3.2    # animation settled
LOGO_SIZE     = 480

# ── Easing ────────────────────────────────────────────────────────────────
def ease_out_cubic(t): return 1 - (1 - t) ** 3
def ease_out_expo(t):  return 1 if t >= 1 else 1 - 2 ** (-10 * t)
def ease_in_out(t):    return 3*t*t - 2*t*t*t
def elastic_out(t, amp=1.15, period=0.38):
    if t <= 0: return 0
    if t >= 1: return 1
    s = period / (2*math.pi) * math.asin(1/amp)
    return amp * (2**(-10*t)) * math.sin((t-s)*(2*math.pi)/period) + 1

# ── Load logo ─────────────────────────────────────────────────────────────
raw_logo = Image.open(LOGO_PATH).convert("RGBA")

# ── Dark cinematic background ─────────────────────────────────────────────
def make_bg():
    arr = np.zeros((H, W, 3), dtype=np.uint8)
    for y in range(H):
        f = y / H
        arr[y, :] = [int(6 + 8*f), int(2 + 4*f), int(2 + 6*f)]
    return Image.fromarray(arr, "RGB").convert("RGBA")

BG = make_bg()

# ── Letterbox bars ────────────────────────────────────────────────────────
LETTERBOX_H = 60

def draw_letterbox(base: Image.Image) -> Image.Image:
    draw = ImageDraw.Draw(base)
    draw.rectangle([0, 0, W, LETTERBOX_H], fill=(0, 0, 0, 255))
    draw.rectangle([0, H - LETTERBOX_H, W, H], fill=(0, 0, 0, 255))
    return base

# ── Film strip borders ────────────────────────────────────────────────────
STRIP_W   = 54   # width of strip
HOLE_W    = 28
HOLE_H    = 20
HOLE_GAP  = 14
STRIP_COL = (18, 14, 10, 255)
HOLE_COL  = (0, 0, 0, 255)

def draw_filmstrip(base: Image.Image, t: float) -> Image.Image:
    draw = ImageDraw.Draw(base)
    scroll = int((t * FPS * 6) % (HOLE_H + HOLE_GAP))  # animate scroll

    for side_x in [0, W - STRIP_W]:
        draw.rectangle([side_x, LETTERBOX_H, side_x + STRIP_W, H - LETTERBOX_H], fill=STRIP_COL)
        # perforations
        y = LETTERBOX_H - scroll
        while y < H - LETTERBOX_H:
            hx = side_x + (STRIP_W - HOLE_W) // 2
            draw.rectangle([hx, y, hx + HOLE_W, y + HOLE_H], fill=HOLE_COL)
            y += HOLE_H + HOLE_GAP

    # inner edge line
    for side_x in [STRIP_W, W - STRIP_W - 1]:
        draw.line([(side_x, LETTERBOX_H), (side_x, H - LETTERBOX_H)],
                  fill=(40, 30, 20, 200), width=2)
    return base

# ── Film grain ────────────────────────────────────────────────────────────
def add_grain(base: Image.Image, intensity: float = 0.12) -> Image.Image:
    noise = rng.integers(0, 256, (H, W), dtype=np.uint8)
    alpha = (noise * intensity).clip(0, 255).astype(np.uint8)
    grain = np.zeros((H, W, 4), dtype=np.uint8)
    grain[:, :, 3] = alpha
    grain[:, :, :3] = noise[:, :, np.newaxis]
    grain_img = Image.fromarray(grain, "RGBA")
    return Image.alpha_composite(base, grain_img)

# ── Film projector flicker ────────────────────────────────────────────────
def flicker_alpha(t: float) -> int:
    """Random per-frame brightness variation — simulates projector flicker."""
    random.seed(int(t * FPS * 137))
    flicker = random.uniform(0, 0.07)
    # More flicker during leader, subtle after
    if t < LEADER_END:
        flicker = random.uniform(0, 0.25)
    a = int(flicker * 255)
    return a

# ── Film leader countdown ──────────────────────────────────────────────────
FONT_PATH = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"

def draw_leader(base: Image.Image, t: float) -> Image.Image:
    """Classic film leader: scratchy circles + countdown numbers."""
    if t >= LEADER_END:
        return base

    progress = t / LEADER_END     # 0→1
    frame_n  = int(t * FPS)

    ov   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    cx, cy = W // 2, H // 2

    # Sepia/cream leader background
    alpha_bg = int(255 * (1 - progress * 0.6))
    ov2 = Image.new("RGBA", (W, H), (200, 185, 140, alpha_bg))
    base = Image.alpha_composite(base, ov2)

    draw = ImageDraw.Draw(base)

    # Target circle marks
    for r, a_frac in [(380, 0.4), (240, 0.5), (120, 0.6), (60, 0.9)]:
        a = int(255 * a_frac * (1 - progress * 0.5))
        col = (30, 20, 10, a)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], outline=col, width=3)

    # Cross-hairs
    a_line = int(180 * (1 - progress * 0.5))
    draw.line([(cx - 400, cy), (cx + 400, cy)], fill=(30,20,10,a_line), width=2)
    draw.line([(cx, cy - 400), (cx, cy + 400)], fill=(30,20,10,a_line), width=2)

    # Countdown digit
    digit = str(3 - int(t / (LEADER_END / 3)))
    if digit in ("3", "2", "1"):
        try:
            font = ImageFont.truetype(FONT_PATH, 380)
        except:
            font = ImageFont.load_default()
        bb   = draw.textbbox((0, 0), digit, font=font)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        tx = cx - tw // 2
        ty = cy - th // 2 - 20
        a_digit = int(200 * (1 - (t % (LEADER_END / 3)) / (LEADER_END / 3) * 0.5))
        draw.text((tx, ty), digit, font=font, fill=(30, 20, 10, a_digit))

    # Random film scratch lines
    for _ in range(random.randint(0, 4)):
        sx = random.randint(50, W - 50)
        draw.line([(sx, 0), (sx + random.randint(-10, 10), H)],
                  fill=(255, 255, 200, random.randint(30, 120)), width=1)

    # Dust specs
    for _ in range(random.randint(0, 15)):
        dx = random.randint(0, W)
        dy = random.randint(0, H)
        dr = random.randint(1, 4)
        draw.ellipse([dx-dr, dy-dr, dx+dr, dy+dr],
                     fill=(60, 50, 30, random.randint(80, 180)))

    return base

# ── Cinema curtains ────────────────────────────────────────────────────────
CURTAIN_COL1 = (120, 10, 10)   # deep red
CURTAIN_COL2 = (80,  5,  5)    # darker shadow
GOLD_COL     = (180, 140, 40)

def draw_curtains(base: Image.Image, t: float) -> Image.Image:
    if t >= CURTAIN_END:
        return base
    if t < LEADER_END:
        return base

    progress = ease_out_expo((t - LEADER_END) / (CURTAIN_END - LEADER_END))
    # Each curtain travels from center outward
    open_dist = int((W // 2 + 80) * progress)

    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)

    curtain_top    = LETTERBOX_H
    curtain_bottom = H - LETTERBOX_H
    content_left   = STRIP_W
    content_right  = W - STRIP_W

    for side in ("left", "right"):
        if side == "left":
            right_edge = content_left + (content_right - content_left) // 2 - open_dist
            left_edge  = content_left
        else:
            left_edge  = content_left + (content_right - content_left) // 2 + open_dist
            right_edge = content_right

        if side == "left" and right_edge <= left_edge:
            continue
        if side == "right" and left_edge >= right_edge:
            continue

        # Main curtain body
        points = []
        num_folds = 8
        fold_amp  = 18
        for i in range(num_folds + 1):
            y = curtain_top + i * (curtain_bottom - curtain_top) / num_folds
            if side == "left":
                x = right_edge + fold_amp * math.sin(i * math.pi * 1.2)
            else:
                x = left_edge - fold_amp * math.sin(i * math.pi * 1.2)
            points.append((x, y))

        if side == "left":
            poly = [(left_edge, curtain_top)] + points + [(left_edge, curtain_bottom)]
        else:
            poly = [(right_edge, curtain_top)] + list(reversed(points)) + [(right_edge, curtain_bottom)]

        draw.polygon(poly, fill=(*CURTAIN_COL1, 240))

        # Highlight fold stripe
        for fi in range(num_folds):
            y1 = curtain_top + fi * (curtain_bottom - curtain_top) / num_folds
            y2 = y1 + (curtain_bottom - curtain_top) / num_folds
            if side == "left":
                x1 = right_edge - 12
                x2 = right_edge
            else:
                x1 = left_edge
                x2 = left_edge + 12
            draw.rectangle([x1, y1, x2, y2], fill=(*CURTAIN_COL2, 180))

        # Gold trim edge
        if side == "left":
            trimx = right_edge
        else:
            trimx = left_edge
        draw.line([(trimx, curtain_top), (trimx, curtain_bottom)],
                  fill=(*GOLD_COL, 200), width=4)

    return Image.alpha_composite(base, ov)

# ── Spotlight beams ────────────────────────────────────────────────────────
def draw_spotlights(base: Image.Image, t: float) -> Image.Image:
    if t < LEADER_END:
        return base

    progress = min((t - LEADER_END) / 1.0, 1.0)
    intensity = ease_out_expo(progress) * 0.85
    # After impact, spotlights dim slightly
    if t > IMPACT_T:
        dt = t - IMPACT_T
        intensity *= max(0.3, 1.0 - dt * 0.3)

    ov  = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    arr = np.zeros((H, W, 4), dtype=np.float32)
    cx  = W // 2
    cy_logo = H // 2

    # Two spotlight sources: upper-left and upper-right
    sources = [
        (int(W * 0.2), LETTERBOX_H + 10),
        (int(W * 0.8), LETTERBOX_H + 10),
    ]
    half_angle = 0.35  # radians

    for sx, sy in sources:
        # Angle from source to logo center
        base_angle = math.atan2(cy_logo - sy, cx - sx)
        for y in range(sy, H - LETTERBOX_H):
            for x_off in np.linspace(-200, 200, 60):
                x = int(cx + x_off)
                if x < STRIP_W or x >= W - STRIP_W:
                    continue
                angle = math.atan2(y - sy, x - sx)
                diff  = abs(angle - base_angle)
                if diff > half_angle:
                    continue
                fall_off = 1 - diff / half_angle
                dist_fac = 1 - (y - sy) / (H - sy)
                a = intensity * fall_off ** 1.8 * max(0, dist_fac) * 60
                arr[y, x, 0] += 255
                arr[y, x, 1] += 240
                arr[y, x, 2] += 200
                arr[y, x, 3] += a

    arr[:, :, 3] = np.clip(arr[:, :, 3], 0, 200)
    arr[:, :, :3] = np.clip(arr[:, :, :3], 0, 255)
    spot_img = Image.fromarray(arr.astype(np.uint8), "RGBA")
    spot_blurred = spot_img.filter(ImageFilter.GaussianBlur(radius=12))
    return Image.alpha_composite(base, spot_blurred)

# ── Star/sparkle particles ────────────────────────────────────────────────
NUM_STARS = 70
stars = [{
    "x": random.uniform(STRIP_W + 10, W - STRIP_W - 10),
    "y": random.uniform(LETTERBOX_H + 10, H - LETTERBOX_H - 10),
    "size": random.uniform(1.5, 4.5),
    "phase": random.uniform(0, 2*math.pi),
    "freq":  random.uniform(1.0, 3.5),
    "ab":    random.uniform(0.1, 0.6),
    "vx":    random.uniform(-0.15, 0.15),
    "vy":    random.uniform(-0.5, -0.05),
} for _ in range(NUM_STARS)]

def draw_stars(base: Image.Image, t: float) -> Image.Image:
    if t < LEADER_END:
        return base
    ov   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    fade = min((t - LEADER_END) / 0.5, 1.0)
    for s in stars:
        px = (s["x"] + s["vx"] * (t - LEADER_END) * FPS) % (W - STRIP_W*2) + STRIP_W
        py = (s["y"] + s["vy"] * (t - LEADER_END) * FPS - LETTERBOX_H) % (H - LETTERBOX_H*2) + LETTERBOX_H
        twinkle = 0.4 + 0.6 * abs(math.sin(s["phase"] + s["freq"] * t * math.pi))
        a = int(255 * s["ab"] * twinkle * fade)
        r = s["size"]
        # 4-point star shape
        for angle in [0, 90, 45, 135]:
            rad = math.radians(angle)
            tip  = r * 2.5
            thin = r * 0.3
            ex1 = px + math.cos(rad) * tip
            ey1 = py + math.sin(rad) * tip
            ex2 = px - math.cos(rad) * tip
            ey2 = py - math.sin(rad) * tip
            draw.line([(ex1, ey1), (ex2, ey2)],
                      fill=(255, 240, 160, a), width=max(1, int(thin)))
        # Center glow dot
        draw.ellipse([px-r, py-r, px+r, py+r], fill=(255, 255, 200, a))
    return Image.alpha_composite(base, ov)

# ── Explosion particles (movie-themed: stars + film reels) ─────────────────
NUM_EXP = 100
exp_pts = []
for _ in range(NUM_EXP):
    angle = random.uniform(0, 2*math.pi)
    speed = random.uniform(5, 20)
    exp_pts.append({
        "vx":   math.cos(angle) * speed,
        "vy":   math.sin(angle) * speed,
        "r":    random.uniform(2, 6),
        "life": random.uniform(0.4, 1.0),
        "col":  random.choice([
            (255, 215, 0),    # gold
            (255, 50, 50),    # red
            (255, 255, 255),  # white
            (255, 170, 30),   # amber
            (200, 80, 255),   # purple
        ]),
        "type": random.choice(["star", "dot", "dot", "star"]),
    })

def draw_explosion(base: Image.Image, t: float) -> Image.Image:
    dt = t - IMPACT_T
    if dt < 0 or dt > 1.4:
        return base
    ov   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    cx, cy = W // 2, H // 2
    for p in exp_pts:
        if dt > p["life"]: continue
        progress = dt / p["life"]
        sf = ease_out_expo(1 - progress)
        px = cx + p["vx"] * dt * FPS * sf * 0.55
        py = cy + p["vy"] * dt * FPS * sf * 0.55
        fade = (1 - progress)**1.4
        r = p["r"] * (1 + progress * 0.3)
        a = int(255 * fade * 0.95)
        col = (*p["col"], a)
        if p["type"] == "star":
            for ang in [0, 72, 144, 216, 288]:
                rad = math.radians(ang)
                ex1 = px + math.cos(rad) * r * 2.5
                ey1 = py + math.sin(rad) * r * 2.5
                ex2 = px - math.cos(rad) * r * 2.5
                ey2 = py - math.sin(rad) * r * 2.5
                draw.line([(ex1, ey1), (ex2, ey2)], fill=col, width=2)
        draw.ellipse([px-r, py-r, px+r, py+r], fill=col)
    return Image.alpha_composite(base, ov)

# ── Shockwave ─────────────────────────────────────────────────────────────
def draw_shockwave(base: Image.Image, t: float) -> Image.Image:
    dt = t - IMPACT_T
    if dt < 0 or dt > 0.8:
        return base
    ov   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    cx, cy = W // 2, H // 2
    for delay, max_r, col in [
        (0.00, 460, (255, 215, 0)),
        (0.07, 370, (255, 255, 255)),
        (0.14, 280, (255, 150, 30)),
    ]:
        wt = dt - delay
        if wt < 0: continue
        progress = min(wt / 0.6, 1.0)
        radius   = int(max_r * ease_out_expo(progress))
        alpha    = int(240 * (1 - progress)**2)
        if alpha < 2 or radius < 1: continue
        thick = max(1, int(9 * (1 - progress)))
        for th in range(thick):
            r = radius + th
            draw.ellipse([cx-r, cy-r, cx+r, cy+r],
                         outline=(*col, alpha // (th+1)), width=2)
    return Image.alpha_composite(base, ov)

# ── Lens flare ────────────────────────────────────────────────────────────
def draw_flare(base: Image.Image, t: float) -> Image.Image:
    dt = t - IMPACT_T
    if dt < 0 or dt > 0.35:
        return base
    intensity = (1 - (dt/0.35)**2)
    ov   = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)
    cx, cy = W // 2, H // 2
    for angle_deg in range(0, 360, 18):
        ang = math.radians(angle_deg)
        length = int(600 * intensity)
        ex = int(cx + math.cos(ang) * length)
        ey = int(cy + math.sin(ang) * length)
        a  = int(140 * intensity)
        draw.line([(cx, cy), (ex, ey)],
                  fill=(255, 240, 180, a // 2), width=2)
    for rad, a_f in [(150, 0.5), (90, 0.55), (45, 0.5), (20, 0.95)]:
        r = int(rad * intensity)
        a = int(255 * a_f * intensity)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(255, 250, 220, a))
    return Image.alpha_composite(base, ov)

# ── Glow around logo ──────────────────────────────────────────────────────
def make_glow(logo: Image.Image, strength: float) -> Image.Image:
    g = logo.filter(ImageFilter.GaussianBlur(radius=32))
    r, gr, b, a = g.split()
    a  = a.point(lambda v: min(255, int(v * strength)))
    r  = r.point(lambda v: min(255, v + 60))
    gr = gr.point(lambda v: min(255, v + 30))
    return Image.merge("RGBA", (r, gr, b, a))

# ── Logo transform ────────────────────────────────────────────────────────
def logo_transform(t: float):
    """Returns (scale, y_offset, opacity)"""
    if t < LOGO_ENTER:
        return (0.5, H * 0.45, 0.0)

    if t < IMPACT_T:
        progress = (t - LOGO_ENTER) / (IMPACT_T - LOGO_ENTER)
        ep = ease_out_cubic(progress)
        y_off = H * 0.45 * (1 - ep)
        scale = 0.5 + 0.5 * ep
        op    = min(1.0, progress * 2.2)
        return (scale, y_off, op)

    dt = t - IMPACT_T
    # Elastic bounce
    if dt < 0.8:
        bp    = dt / 0.8
        escl  = elastic_out(bp)
        scale = 1.0 + 0.22 * (1 - escl)
        if dt < 0.07:
            sq    = dt / 0.07
            scale = 1.22 - 0.22 * ease_out_cubic(sq)
        return (scale, 0.0, 1.0)

    # Heartbeat after settle
    dt2 = t - (IMPACT_T + 0.8)
    bs  = 1.0
    for bt, ba in [(0.0, 0.06), (0.25, 0.035)]:
        bd = dt2 - bt
        if 0 <= bd < 0.18:
            bs += ba * math.sin(math.pi * bd / 0.18)
    return (bs, 0.0, 1.0)

# ── Vignette ──────────────────────────────────────────────────────────────
def make_vignette():
    cx, cy = W/2, H/2
    xs = np.arange(W); ys = np.arange(H)
    xx, yy = np.meshgrid(xs, ys)
    d = np.sqrt((xx-cx)**2 + (yy-cy)**2) / math.sqrt(cx**2+cy**2)
    a = np.clip(220 * d**1.9, 0, 255).astype(np.uint8)
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    arr[:,:,3] = a
    return Image.fromarray(arr, "RGBA")

print("Pre-computing vignette…")
VIGNETTE = make_vignette()

# ── Render frame ──────────────────────────────────────────────────────────
def render_frame(i: int):
    t     = i / FPS
    frame = BG.copy()

    # Film leader (replaces most content early on)
    frame = draw_leader(frame, t)

    # Stars
    frame = draw_stars(frame, t)

    # Spotlights
    frame = draw_spotlights(frame, t)

    # Curtains
    frame = draw_curtains(frame, t)

    # Logo
    scale, y_off, opacity = logo_transform(t)
    sz   = int(LOGO_SIZE * max(0.01, scale))
    logo = raw_logo.resize((sz, sz), Image.LANCZOS)

    if opacity < 1.0:
        r2, g2, b2, a2 = logo.split()
        a2 = a2.point(lambda v: int(v * opacity))
        logo = Image.merge("RGBA", (r2, g2, b2, a2))

    lw, lh = logo.size
    cx, cy = W//2, H//2
    lx = cx - lw//2
    ly = cy - lh//2 + int(y_off)

    # Glow
    dt_imp = t - IMPACT_T
    if dt_imp < 0:
        gs = 0.25 * opacity
    elif dt_imp < 0.15:
        gs = 0.25 + 2.5 * (1 - dt_imp/0.15)
    else:
        gs = 0.45 + 0.2 * math.sin(t * 2.2)

    glow = make_glow(logo, gs)
    gw, gh = glow.size
    gx = cx - gw//2
    gy = cy - gh//2 + int(y_off)
    gc = Image.new("RGBA", (W, H), (0,0,0,0))
    if 0 <= gx and 0 <= gy and gx+gw <= W and gy+gh <= H:
        gc.paste(glow, (gx, gy), glow)
    frame = Image.alpha_composite(frame, gc)

    # Shockwave + explosion + flare
    frame = draw_shockwave(frame, t)
    frame = draw_explosion(frame, t)
    frame = draw_flare(frame, t)

    # Logo on top
    lc = Image.new("RGBA", (W, H), (0,0,0,0))
    if 0 <= lx and 0 <= ly and lx+lw <= W and ly+lh <= H:
        lc.paste(logo, (lx, ly), logo)
    else:
        ox = max(0,-lx); oy = max(0,-ly)
        sx2 = max(0,lx); sy2 = max(0,ly)
        ex2 = min(W,lx+lw); ey2 = min(H,ly+lh)
        if ex2>sx2 and ey2>sy2:
            crop = logo.crop((ox,oy,ox+(ex2-sx2),oy+(ey2-sy2)))
            lc.paste(crop,(sx2,sy2),crop)
    frame = Image.alpha_composite(frame, lc)

    # Vignette
    frame = Image.alpha_composite(frame, VIGNETTE)

    # Film strip
    frame = draw_filmstrip(frame, t)

    # Letterbox
    frame = draw_letterbox(frame)

    # Film grain
    frame = add_grain(frame, 0.09 if t > LEADER_END else 0.18)

    # Projector flicker overlay
    fa = flicker_alpha(t)
    if fa > 0:
        frame = Image.alpha_composite(frame,
                    Image.new("RGBA", (W, H), (255, 250, 230, fa)))

    # Global fade in/out
    ba = 0
    if t < 0.1:
        ba = int(255 * (1 - t/0.1))
    elif t > DURATION - 0.4:
        ba = int(255 * (t - (DURATION-0.4)) / 0.4)
    if ba > 0:
        frame = Image.alpha_composite(frame,
                    Image.new("RGBA", (W, H), (0, 0, 0, ba)))

    frame.convert("RGB").save(os.path.join(FRAME_DIR, f"frame_{i:04d}.png"))

# ── Audio ─────────────────────────────────────────────────────────────────
def generate_audio(path: str):
    sr = 44100
    n  = int(sr * DURATION)
    smp = np.zeros(n, dtype=np.float64)
    arng = np.random.default_rng(77)

    # Film projector clatter (leader)
    for i in range(int(sr * LEADER_END)):
        t = i / sr
        smp[i] += 0.15 * (arng.random()*2-1) * math.exp(-((t % 0.033) / 0.033))
        smp[i] += 0.08 * math.sin(2*math.pi*48*t)

    # Curtain whoosh (0.7 → 1.6 s)
    for i in range(int(0.7*sr), int(1.6*sr)):
        t  = i / sr
        p  = (t - 0.7) / 0.9
        env = math.sin(math.pi * p) * 0.40
        freq = 150 + 2200 * float(p**1.3)
        smp[i] += env * (math.sin(2*math.pi*freq*t)*0.55 + (arng.random()*2-1)*0.45)

    # Rising suspense tone (1.2 → 2.1 s)
    for i in range(int(1.2*sr), int(2.1*sr)):
        t  = i / sr
        p  = (t - 1.2) / 0.9
        env = p**2 * 0.3
        smp[i] += env * math.sin(2*math.pi*(60 + 180*p)*t)

    # IMPACT thud at 2.1 s
    for i in range(n):
        t  = i / sr
        dt = t - IMPACT_T
        if 0 <= dt < 0.7:
            env = math.exp(-dt*9) * 1.0
            smp[i] += env*(math.sin(2*math.pi*38*dt)+0.5*math.sin(2*math.pi*75*dt)+0.3*math.sin(2*math.pi*150*dt))
        if 0 <= dt < 0.06:
            smp[i] += (1-dt/0.06)*0.8*(arng.random()*2-1)

    # Metallic ring resonance after impact
    for i in range(n):
        t  = i / sr
        dt = t - IMPACT_T
        if 0 < dt < 1.5:
            smp[i] += math.exp(-dt*2.5)*0.2*math.sin(2*math.pi*350*dt+0.4*math.sin(dt*19))

    # Film reel whirr tail (2.5 → 4.0 s)
    for i in range(int(2.5*sr), n):
        t  = i / sr
        dt = t - 2.5
        env = math.exp(-dt*2.0) * 0.12
        smp[i] += env*(arng.random()*2-1)*0.7
        smp[i] += env*math.sin(2*math.pi*120*t)

    peak = np.max(np.abs(smp))
    if peak > 0:
        smp = smp / peak * 0.88

    int_s = (smp * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1); wf.setsampwidth(2)
        wf.setframerate(sr); wf.writeframes(int_s.tobytes())

# ── Main ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Rendering {TOTAL} frames → {FRAME_DIR}")
    for i in range(TOTAL):
        render_frame(i)
        if (i+1) % 12 == 0 or i == TOTAL-1:
            pct = int((i+1)/TOTAL*100)
            bar = "█"*(pct//5)+"░"*(20-pct//5)
            print(f"  [{bar}] {pct}%  frame {i+1}/{TOTAL}")

    ap = os.path.join(FRAME_DIR, "audio.wav")
    print("\nGenerating audio…")
    generate_audio(ap)

    out = os.path.join(OUT_DIR, "bib-movie-outro.mp4")
    print("Encoding…")
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(FRAME_DIR, "frame_%04d.png"),
        "-i", ap,
        "-c:v", "libx264", "-preset", "slow", "-crf", "15",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-t", str(DURATION),
        out,
    ], check=True)

    shutil.rmtree(FRAME_DIR)
    print(f"\n✓  {out}  ({os.path.getsize(out)//1024} KB)")
