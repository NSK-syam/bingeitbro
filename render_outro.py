#!/usr/bin/env python3
"""Cinematic logo reveal renderer — 3 s, 1080×1920 vertical, 30 fps."""

import math, os, random, struct, wave, shutil, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

# ── Config ──────────────────────────────────────────────────────────────
W, H        = 1080, 1920
FPS         = 30
DURATION    = 3.0
TOTAL       = int(FPS * DURATION)  # 90 frames
LOGO_PATH   = "/Users/syam/.cursor/projects/Users-syam-Movie-Recom/assets/bibicon-2dba35c3-f6ce-4fa2-9974-9adb34b8b99a.png"
OUT_DIR     = "/Users/syam/Movie Recom"
FRAME_DIR   = tempfile.mkdtemp(prefix="bib_frames_")

random.seed(42)

# ── Easing helpers ──────────────────────────────────────────────────────
def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_in_out(t):
    return 3 * t * t - 2 * t * t * t

# ── Particle system ─────────────────────────────────────────────────────
NUM_PARTICLES = 80

particles = []
for _ in range(NUM_PARTICLES):
    particles.append({
        "x": random.uniform(0, W),
        "y": random.uniform(0, H),
        "r": random.uniform(1.0, 3.0),
        "vx": random.uniform(-0.3, 0.3),
        "vy": random.uniform(-0.8, -0.15),
        "alpha_base": random.uniform(0.15, 0.55),
        "phase": random.uniform(0, 2 * math.pi),
        "freq": random.uniform(0.8, 2.0),
    })


def draw_particles(img: Image.Image, t: float):
    """Draw softly glowing particles on img (RGBA)."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    fade = min(t / 0.6, 1.0)  # particles fade in over first 0.6 s
    for p in particles:
        px = (p["x"] + p["vx"] * t * FPS) % W
        py = (p["y"] + p["vy"] * t * FPS) % H
        flicker = 0.5 + 0.5 * math.sin(p["phase"] + p["freq"] * t * 2 * math.pi)
        a = int(255 * p["alpha_base"] * flicker * fade)
        r = p["r"]
        for ring in range(3):
            rr = r + ring * 1.5
            aa = max(0, a // (ring + 1))
            col = (220, 200, 240, aa)
            draw.ellipse([px - rr, py - rr, px + rr, py + rr], fill=col)
    return Image.alpha_composite(img, overlay)


# ── Light sweep ─────────────────────────────────────────────────────────
def make_sweep_layer(t: float) -> Image.Image:
    """Diagonal light sweep that crosses the frame between t=0.3 and t=1.5."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    progress = (t - 0.3) / 1.2
    if progress < 0 or progress > 1:
        return layer

    sweep_x = int(-400 + (W + 800) * progress)
    beam_w = 350
    arr = np.zeros((H, W, 4), dtype=np.uint8)

    for dx in range(-beam_w, beam_w + 1):
        x = sweep_x + dx
        if x < 0 or x >= W:
            continue
        dist = abs(dx) / beam_w
        intensity = max(0, 1.0 - dist ** 1.5)
        a = int(45 * intensity)
        arr[:, x] = [255, 245, 255, a]

    layer = Image.fromarray(arr, "RGBA")
    return layer


# ── Logo loader & glow builder ──────────────────────────────────────────
raw_logo = Image.open(LOGO_PATH).convert("RGBA")
LOGO_SIZE = 520

def get_logo_frame(t: float):
    """Return (logo_rgba, glow_rgba) scaled and positioned for time t."""
    # Zoom: 100 % → 105 % over 3 s
    zoom = 1.0 + 0.05 * (t / DURATION)
    sz = int(LOGO_SIZE * zoom)
    logo = raw_logo.resize((sz, sz), Image.LANCZOS)

    # Opacity: fade in from t=0.4 to t=1.2
    opacity = ease_out_cubic(min(max((t - 0.4) / 0.8, 0), 1))

    if opacity < 1:
        r, g, b, a = logo.split()
        a = a.point(lambda v: int(v * opacity))
        logo = Image.merge("RGBA", (r, g, b, a))

    # Glow layer: blurred + boosted alpha, warm tint
    glow = logo.copy()
    glow = glow.filter(ImageFilter.GaussianBlur(radius=28))
    gr, gg, gb, ga = glow.split()
    glow_strength = opacity * (0.5 + 0.2 * math.sin(t * 3))
    ga = ga.point(lambda v: min(255, int(v * glow_strength)))
    # Warm tint shift
    gr = gr.point(lambda v: min(255, v + 40))
    glow = Image.merge("RGBA", (gr, gg, gb, ga))

    return logo, glow, sz


# ── Metallic shine overlay on logo ──────────────────────────────────────
def apply_shine(logo: Image.Image, t: float) -> Image.Image:
    """Horizontal glossy highlight that sweeps across the logo."""
    progress = (t - 0.6) / 1.0
    if progress < 0 or progress > 1:
        return logo
    w, h = logo.size
    shine = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    arr = np.zeros((h, w, 4), dtype=np.uint8)
    center_y = int(-h * 0.3 + h * 1.6 * progress)
    band = int(h * 0.25)
    for dy in range(-band, band + 1):
        y = center_y + dy
        if y < 0 or y >= h:
            continue
        dist = abs(dy) / band
        intensity = max(0, 1.0 - dist ** 2)
        a = int(90 * intensity)
        arr[y, :] = [255, 255, 255, a]
    shine = Image.fromarray(arr, "RGBA")
    # Mask shine to logo alpha
    _, _, _, la = logo.split()
    _, _, _, sa = shine.split()
    masked_a = Image.fromarray(np.minimum(np.array(la), np.array(sa)), "L")
    shine.putalpha(masked_a)
    return Image.alpha_composite(logo, shine)


# ── Background gradient ─────────────────────────────────────────────────
def make_bg() -> Image.Image:
    arr = np.zeros((H, W, 3), dtype=np.uint8)
    for y in range(H):
        ratio = y / H
        r = int(8 + 14 * ratio)
        g = int(6 + 10 * ratio)
        b = int(16 + 20 * ratio)
        arr[y, :] = [r, g, b]
    return Image.fromarray(arr, "RGB").convert("RGBA")

BG = make_bg()


# ── Vignette ────────────────────────────────────────────────────────────
def make_vignette() -> Image.Image:
    vig = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    arr = np.zeros((H, W, 4), dtype=np.uint8)
    cx, cy = W / 2, H / 2
    max_dist = math.sqrt(cx ** 2 + cy ** 2)
    for y in range(H):
        for x in range(W):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / max_dist
            a = int(min(255, 200 * d ** 1.8))
            arr[y, x] = [0, 0, 0, a]
    return Image.fromarray(arr, "RGBA")

print("Pre-computing vignette…")
VIGNETTE = make_vignette()


# ── Frame renderer ──────────────────────────────────────────────────────
def render_frame(i: int):
    t = i / FPS
    frame = BG.copy()

    # Particles
    frame = draw_particles(frame, t)

    # Light sweep
    sweep = make_sweep_layer(t)
    frame = Image.alpha_composite(frame, sweep)

    # Logo + glow
    logo, glow, sz = get_logo_frame(t)
    logo = apply_shine(logo, t)

    lx = (W - sz) // 2
    ly = (H - sz) // 2 - 40  # slightly above centre

    # Paste glow first (underneath), then sharp logo
    frame.paste(glow, (lx - 14, ly - 14), glow)  # glow is slightly larger from blur
    frame = Image.alpha_composite(frame, Image.new("RGBA", (W, H), (0, 0, 0, 0)))
    tmp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    tmp.paste(logo, (lx, ly), logo)
    frame = Image.alpha_composite(frame, tmp)

    # Vignette
    frame = Image.alpha_composite(frame, VIGNETTE)

    # Final fade-in from black (first 0.35 s) and fade-out (last 0.25 s)
    overlay_alpha = 0
    if t < 0.35:
        overlay_alpha = int(255 * (1 - t / 0.35))
    elif t > DURATION - 0.25:
        overlay_alpha = int(255 * ((t - (DURATION - 0.25)) / 0.25))
    if overlay_alpha > 0:
        black = Image.new("RGBA", (W, H), (0, 0, 0, overlay_alpha))
        frame = Image.alpha_composite(frame, black)

    frame.convert("RGB").save(os.path.join(FRAME_DIR, f"frame_{i:04d}.png"))


# ── Audio: whoosh + impact ──────────────────────────────────────────────
def generate_audio(path: str):
    sr = 44100
    n = int(sr * DURATION)
    samples = np.zeros(n, dtype=np.float64)

    # Whoosh: filtered noise sweep from t=0.2 to t=2.0
    for i in range(n):
        t = i / sr
        if 0.2 < t < 2.0:
            progress = (t - 0.2) / 1.8
            env = math.sin(math.pi * progress) * 0.35
            freq = 200 + 2000 * progress
            samples[i] += env * math.sin(2 * math.pi * freq * t + 8 * math.sin(t * 13))
            samples[i] += env * 0.3 * (random.random() * 2 - 1)

    # Sub-bass impact at t ≈ 2.0
    for i in range(n):
        t = i / sr
        if 1.8 < t < 2.8:
            dt = t - 1.95
            if dt > 0:
                env = math.exp(-dt * 6) * 0.7
                samples[i] += env * math.sin(2 * math.pi * 55 * dt)
                samples[i] += env * 0.4 * math.sin(2 * math.pi * 110 * dt)

    # Soft tail reverb-like decay
    for i in range(n):
        t = i / sr
        if 2.0 < t < 3.0:
            dt = t - 2.0
            env = math.exp(-dt * 3) * 0.15
            samples[i] += env * math.sin(2 * math.pi * 80 * dt + 0.5 * math.sin(dt * 7))

    # Normalize
    peak = np.max(np.abs(samples))
    if peak > 0:
        samples = samples / peak * 0.85

    int_samples = (samples * 32767).astype(np.int16)
    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(int_samples.tobytes())


# ── Main ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"Rendering {TOTAL} frames to {FRAME_DIR} …")
    for i in range(TOTAL):
        render_frame(i)
        if (i + 1) % 10 == 0 or i == TOTAL - 1:
            print(f"  frame {i + 1}/{TOTAL}")

    audio_path = os.path.join(FRAME_DIR, "audio.wav")
    print("Generating audio …")
    generate_audio(audio_path)

    out_path = os.path.join(OUT_DIR, "bib-cinematic-outro.mp4")
    print("Encoding MP4 …")
    subprocess.run([
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(FRAME_DIR, "frame_%04d.png"),
        "-i", audio_path,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-t", str(DURATION),
        out_path,
    ], check=True)

    shutil.rmtree(FRAME_DIR)
    sz = os.path.getsize(out_path)
    print(f"\n✓  {out_path}  ({sz // 1024} KB)")
