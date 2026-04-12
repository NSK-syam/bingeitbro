#!/usr/bin/env python3
"""Cinematic logo reveal v2 — heavy animation, 3 s, 1080×1920, 30 fps."""

import math, os, random, shutil, subprocess, tempfile, wave
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance
import numpy as np

W, H       = 1080, 1920
FPS        = 30
DURATION   = 3.0
TOTAL      = int(FPS * DURATION)
LOGO_PATH  = "/Users/syam/.cursor/projects/Users-syam-Movie-Recom/assets/bibicon-2dba35c3-f6ce-4fa2-9974-9adb34b8b99a.png"
OUT_DIR    = "/Users/syam/.cursor/worktrees/Movie_Recom/cvo"
FRAME_DIR  = tempfile.mkdtemp(prefix="bib_v2_")
CX, CY     = W // 2, H // 2 - 60

random.seed(42)

# ── Easing ──────────────────────────────────────────────────────────────
def ease_out_elastic(t):
    if t <= 0: return 0
    if t >= 1: return 1
    p, s = 0.35, 0.35 / 4
    return math.pow(2, -10 * t) * math.sin((t - s) * (2 * math.pi) / p) + 1

def ease_out_cubic(t):
    return 1 - (1 - min(max(t, 0), 1)) ** 3

def ease_out_back(t):
    c = 1.70158
    t = min(max(t, 0), 1)
    return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2)

def ease_in_out_quad(t):
    t = min(max(t, 0), 1)
    return 2 * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 2 / 2

def lerp(a, b, t):
    return a + (b - a) * min(max(t, 0), 1)

# ── Logo ────────────────────────────────────────────────────────────────
raw_logo = Image.open(LOGO_PATH).convert("RGBA")
LOGO_BASE = 480

# ── Particles — two layers ──────────────────────────────────────────────
def make_particles(n, speed_range, r_range, alpha_range):
    ps = []
    for _ in range(n):
        angle = random.uniform(0, 2 * math.pi)
        speed = random.uniform(*speed_range)
        ps.append({
            "x": random.uniform(0, W), "y": random.uniform(0, H),
            "r": random.uniform(*r_range),
            "vx": math.cos(angle) * speed, "vy": math.sin(angle) * speed - 0.4,
            "alpha": random.uniform(*alpha_range),
            "phase": random.uniform(0, 2 * math.pi),
            "freq": random.uniform(0.6, 2.5),
        })
    return ps

DUST   = make_particles(100, (0.2, 0.8), (0.8, 2.5), (0.12, 0.4))
SPARKS = make_particles(50,  (1.5, 4.0), (1.5, 4.0), (0.3, 0.8))

def draw_particles(img, t, particles, color, burst_t=None):
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fade_in = min(t / 0.5, 1.0)
    for p in particles:
        ft = t
        if burst_t is not None and t > burst_t:
            dt = t - burst_t
            ft = dt
            px = CX + (p["x"] - CX + p["vx"] * ft * FPS * 2.5) 
            py = CY + (p["y"] - CY + p["vy"] * ft * FPS * 2.5)
            env = max(0, 1 - dt / 1.2)
        else:
            px = (p["x"] + p["vx"] * t * FPS) % W
            py = (p["y"] + p["vy"] * t * FPS) % H
            env = fade_in
        flicker = 0.4 + 0.6 * math.sin(p["phase"] + p["freq"] * t * 2 * math.pi)
        a = int(255 * p["alpha"] * flicker * env)
        if a < 2:
            continue
        r = p["r"]
        for ring in range(3):
            rr = r + ring * 1.8
            aa = max(0, a // (ring + 1))
            draw.ellipse([px - rr, py - rr, px + rr, py + rr],
                         fill=(*color, aa))
    return Image.alpha_composite(img, overlay)

# ── Light rays from center ──────────────────────────────────────────────
def draw_rays(img, t):
    if t < 0.7 or t > 2.6:
        return img
    progress = (t - 0.7) / 0.6
    fade = min(progress, 1.0) * max(0, 1 - (t - 1.8) / 0.8)
    if fade <= 0.01:
        return img
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    num_rays = 16
    for i in range(num_rays):
        angle = (i / num_rays) * 2 * math.pi + t * 0.3
        length = 600 + 200 * math.sin(t * 4 + i)
        x2 = CX + math.cos(angle) * length * fade
        y2 = CY + math.sin(angle) * length * fade
        a = int(30 * fade * (0.5 + 0.5 * math.sin(i * 1.3 + t * 5)))
        for w in range(4):
            col = (255, 200, 180, max(0, a - w * 8))
            dx = math.cos(angle + math.pi / 2) * w * 2
            dy = math.sin(angle + math.pi / 2) * w * 2
            draw.line([(CX + dx, CY + dy), (x2 + dx, y2 + dy)], fill=col, width=2)
    return Image.alpha_composite(img, overlay)

# ── Shockwave ring ──────────────────────────────────────────────────────
def draw_shockwave(img, t):
    hit_t = 1.05
    if t < hit_t or t > hit_t + 0.8:
        return img
    dt = t - hit_t
    progress = dt / 0.8
    radius = int(50 + 700 * ease_out_cubic(progress))
    alpha = max(0, 1 - progress) * 0.6
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for w in range(6):
        r = radius + w * 3
        a = int(255 * alpha * (1 - w / 6))
        col = (255, 180 + w * 10, 150 + w * 15, a)
        draw.ellipse([CX - r, CY - r, CX + r, CY + r], outline=col, width=2)
    return Image.alpha_composite(img, overlay)

# ── Lens flare / flash ──────────────────────────────────────────────────
def draw_flash(img, t):
    hit_t = 1.0
    if t < hit_t or t > hit_t + 0.5:
        return img
    dt = t - hit_t
    intensity = max(0, 1 - dt / 0.5) ** 2
    flash = Image.new("RGBA", (W, H), (255, 240, 230, int(120 * intensity)))
    return Image.alpha_composite(img, flash)

# ── Glowing halo behind logo ────────────────────────────────────────────
def draw_halo(img, t, logo_scale):
    if t < 0.6:
        return img
    fade = ease_out_cubic((t - 0.6) / 0.5)
    pulse = 0.7 + 0.3 * math.sin(t * 5)
    sz = int(LOGO_BASE * logo_scale * 1.6)
    halo = Image.new("RGBA", (sz, sz), (0, 0, 0, 0))
    draw = ImageDraw.Draw(halo)
    cx, cy = sz // 2, sz // 2
    for r in range(sz // 2, 0, -2):
        ratio = r / (sz // 2)
        a = int(50 * (1 - ratio) * fade * pulse)
        col_r = int(lerp(255, 220, ratio))
        col_g = int(lerp(140, 100, ratio))
        col_b = int(lerp(100, 180, ratio))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     fill=(col_r, col_g, col_b, a))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=20))
    px = CX - sz // 2
    py = CY - sz // 2
    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tmp.paste(halo, (px, py), halo)
    return Image.alpha_composite(img, tmp)

# ── Metallic shine on logo ──────────────────────────────────────────────
def apply_shine(logo, t):
    if t < 1.2 or t > 2.2:
        return logo
    progress = (t - 1.2) / 1.0
    w, h = logo.size
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    center_y = int(-h * 0.3 + h * 1.6 * progress)
    band = int(h * 0.18)
    for dy in range(-band, band + 1):
        y = center_y + dy
        if 0 <= y < h:
            intensity = max(0, 1.0 - (abs(dy) / band) ** 1.5)
            arr[y, :] = [255, 255, 255, int(120 * intensity)]
    shine = Image.fromarray(arr, "RGBA")
    _, _, _, la = logo.split()
    _, _, _, sa = shine.split()
    masked = Image.fromarray(np.minimum(np.array(la), np.array(sa)), "L")
    shine.putalpha(masked)
    return Image.alpha_composite(logo, shine)

# ── Logo transform for a given time ────────────────────────────────────
def get_logo(t):
    """Returns (image, x, y) — the transformed logo and its paste position."""

    # Phase 1 (0–1.0s): Logo flies in from far away, spinning, with scale overshoot
    # Phase 2 (1.0–1.3s): Elastic bounce settle
    # Phase 3 (1.3–3.0s): Gentle float + slow zoom

    if t < 1.0:
        p = t / 1.0
        ep = ease_out_cubic(p)
        scale = lerp(0.05, 1.15, ep)
        rotation = (1 - ep) * 720  # 2 full spins
        opacity = min(1, p / 0.3)
        offset_y = lerp(-800, 0, ep)
    elif t < 1.35:
        p = (t - 1.0) / 0.35
        bounce = ease_out_elastic(p)
        scale = lerp(1.15, 1.0, bounce)
        rotation = 0
        opacity = 1.0
        offset_y = 0
    else:
        p = (t - 1.35) / (DURATION - 1.35)
        scale = 1.0 + 0.06 * p
        float_y = 8 * math.sin(t * 3.5)
        rotation = 3 * math.sin(t * 2.0)  # gentle wobble
        opacity = 1.0 if t < 2.7 else max(0, 1 - (t - 2.7) / 0.3)
        offset_y = float_y

    sz = max(4, int(LOGO_BASE * scale))
    logo = raw_logo.resize((sz, sz), Image.LANCZOS)

    if abs(rotation) > 0.1:
        logo = logo.rotate(-rotation, resample=Image.BICUBIC, expand=True,
                           fillcolor=(0, 0, 0, 0))

    if opacity < 1:
        r, g, b, a = logo.split()
        a = a.point(lambda v: int(v * opacity))
        logo = Image.merge("RGBA", (r, g, b, a))

    logo = apply_shine(logo, t)

    lw, lh = logo.size
    x = CX - lw // 2
    y = CY - lh // 2 + int(offset_y)
    return logo, x, y, scale

# ── Afterimage trail during spin-in ────────────────────────────────────
def draw_trail(img, t):
    if t > 1.0:
        return img
    trail_count = 5
    for i in range(trail_count, 0, -1):
        tt = max(0, t - i * 0.04)
        if tt <= 0:
            continue
        logo, x, y, _ = get_logo(tt)
        r, g, b, a = logo.split()
        trail_alpha = 0.12 * (1 - i / trail_count)
        a = a.point(lambda v, ta=trail_alpha: int(v * ta))
        ghost = Image.merge("RGBA", (r, g, b, a))
        tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        safe_x = max(-ghost.width + 1, min(x, W - 1))
        safe_y = max(-ghost.height + 1, min(y, H - 1))
        tmp.paste(ghost, (safe_x, safe_y), ghost)
        img = Image.alpha_composite(img, tmp)
    return img

# ── Background ──────────────────────────────────────────────────────────
def make_bg():
    arr = np.zeros((H, W, 3), dtype=np.uint8)
    for y in range(H):
        ratio = y / H
        r = int(6 + 10 * ratio)
        g = int(4 + 8 * ratio)
        b = int(14 + 18 * ratio)
        arr[y, :] = [r, g, b]
    return Image.fromarray(arr, "RGB").convert("RGBA")

BG = make_bg()

# ── Vignette ────────────────────────────────────────────────────────────
print("Pre-computing vignette…")
vig_arr = np.zeros((H, W, 4), dtype=np.uint8)
max_d = math.sqrt((W / 2) ** 2 + (H / 2) ** 2)
ys = np.arange(H)[:, None]
xs = np.arange(W)[None, :]
ds = np.sqrt((xs - W / 2) ** 2 + (ys - H / 2) ** 2) / max_d
vig_arr[:, :, 3] = np.clip(220 * ds ** 1.6, 0, 255).astype(np.uint8)
VIGNETTE = Image.fromarray(vig_arr, "RGBA")

# ── Light sweep ─────────────────────────────────────────────────────────
def draw_sweep(img, t):
    if t < 0.15 or t > 1.6:
        return img
    progress = (t - 0.15) / 1.45
    sweep_x = int(-500 + (W + 1000) * progress)
    beam_w = 300
    fade = math.sin(math.pi * progress)
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    xs = np.arange(W)
    dist = np.abs(xs - sweep_x) / beam_w
    intensity = np.clip(1.0 - dist ** 1.3, 0, 1)
    a = (55 * intensity * fade).astype(np.uint8)
    for ch in range(3):
        arr[:, :, ch] = np.where(a > 0, 255, 0)
    arr[:, :, 3] = np.broadcast_to(a, (H, W))
    layer = Image.fromarray(arr, "RGBA")
    return Image.alpha_composite(img, layer)

# ── Second diagonal sweep ──────────────────────────────────────────────
def draw_sweep2(img, t):
    if t < 1.3 or t > 2.4:
        return img
    progress = (t - 1.3) / 1.1
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    ys = np.arange(H)[:, None]
    xs = np.arange(W)[None, :]
    diag = (xs / W + ys / H) / 2.0
    center = progress
    dist = np.abs(diag - center) / 0.15
    intensity = np.clip(1.0 - dist, 0, 1)
    fade = math.sin(math.pi * progress) * 0.4
    a = (intensity * fade * 255).astype(np.uint8)
    arr[:, :, 0] = 255
    arr[:, :, 1] = 220
    arr[:, :, 2] = 200
    arr[:, :, 3] = a
    layer = Image.fromarray(arr, "RGBA")
    return Image.alpha_composite(img, layer)

# ── Render single frame ────────────────────────────────────────────────
def render_frame(i):
    t = i / FPS
    frame = BG.copy()

    # Background dust particles
    frame = draw_particles(frame, t, DUST, (180, 170, 210))

    # Light sweep
    frame = draw_sweep(frame, t)

    # Light rays from center
    frame = draw_rays(frame, t)

    # Halo behind logo
    logo_img, lx, ly, scale = get_logo(t)
    frame = draw_halo(frame, t, scale)

    # Afterimage trail during spin
    frame = draw_trail(frame, t)

    # Main logo
    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    safe_x = max(-logo_img.width + 1, min(lx, W - 1))
    safe_y = max(-logo_img.height + 1, min(ly, H - 1))
    tmp.paste(logo_img, (safe_x, safe_y), logo_img)
    frame = Image.alpha_composite(frame, tmp)

    # Shockwave on landing
    frame = draw_shockwave(frame, t)

    # Flash
    frame = draw_flash(frame, t)

    # Second sweep
    frame = draw_sweep2(frame, t)

    # Spark burst particles after impact
    frame = draw_particles(frame, t, SPARKS, (255, 200, 140), burst_t=1.05)

    # Vignette
    frame = Image.alpha_composite(frame, VIGNETTE)

    # Fade from / to black
    overlay_alpha = 0
    if t < 0.2:
        overlay_alpha = int(255 * (1 - t / 0.2))
    elif t > DURATION - 0.2:
        overlay_alpha = int(255 * ((t - (DURATION - 0.2)) / 0.2))
    if overlay_alpha > 0:
        frame = Image.alpha_composite(frame,
                    Image.new("RGBA", (W, H), (0, 0, 0, overlay_alpha)))

    frame.convert("RGB").save(os.path.join(FRAME_DIR, f"frame_{i:04d}.png"))

# ── Audio ───────────────────────────────────────────────────────────────
def generate_audio(path):
    sr = 44100
    n = int(sr * DURATION)
    out = np.zeros(n, dtype=np.float64)

    for i in range(n):
        t = i / sr

        # Rising whoosh 0→1.0 s
        if t < 1.05:
            p = t / 1.05
            env = (p ** 1.5) * 0.45
            freq = 150 + 3500 * p
            out[i] += env * math.sin(2 * math.pi * freq * t + 6 * math.sin(t * 17))
            out[i] += env * 0.25 * (random.random() * 2 - 1)

        # Hard impact 1.05 s
        if 1.0 < t < 2.0:
            dt = t - 1.05
            if dt > 0:
                env = math.exp(-dt * 8) * 0.9
                out[i] += env * math.sin(2 * math.pi * 45 * dt)
                out[i] += env * 0.5 * math.sin(2 * math.pi * 90 * dt)
                out[i] += env * 0.3 * math.sin(2 * math.pi * 135 * dt)

        # Shimmer / tonal ring-out 1.1→2.8
        if 1.1 < t < 2.8:
            dt = t - 1.1
            env = math.exp(-dt * 2.5) * 0.2
            out[i] += env * math.sin(2 * math.pi * 440 * dt)
            out[i] += env * 0.5 * math.sin(2 * math.pi * 660 * dt)

        # Sub rumble tail
        if 1.3 < t < 3.0:
            dt = t - 1.3
            env = math.exp(-dt * 2) * 0.12
            out[i] += env * math.sin(2 * math.pi * 55 * dt)

    peak = np.max(np.abs(out))
    if peak > 0:
        out = out / peak * 0.88
    samples = (out * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())

# ── Main ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Rendering {TOTAL} frames …")
    for i in range(TOTAL):
        render_frame(i)
        if (i + 1) % 10 == 0 or i == TOTAL - 1:
            print(f"  {i + 1}/{TOTAL}")

    audio_path = os.path.join(FRAME_DIR, "audio.wav")
    print("Generating audio …")
    generate_audio(audio_path)

    out_path = os.path.join(OUT_DIR, "bib-cinematic-outro-v2.mp4")
    print("Encoding …")
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(FRAME_DIR, "frame_%04d.png"),
        "-i", audio_path,
        "-c:v", "libx264", "-preset", "slow", "-crf", "17",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-t", str(DURATION),
        out_path,
    ], check=True)

    shutil.rmtree(FRAME_DIR)
    sz = os.path.getsize(out_path)
    print(f"\n✓  {out_path}  ({sz // 1024} KB)")
