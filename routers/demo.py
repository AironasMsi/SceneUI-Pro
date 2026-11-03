import os
import shutil
import json
import uuid
import math
import random
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageDraw, ImageFont

from config import DATA_DIR, VAULT_DIR, AUDIO_DIR, VOICES_DIR, PROJECTS_DIR
from ws_manager import broadcast_system_state

router = APIRouter(prefix="/api/demo", tags=["demo"])

# ============================================================================
# 1. ARTISTIC ASSET GENERATOR (High-Res 1080p Scenes & 672x1568 Characters)
# ============================================================================

def get_best_font(size=36, bold=False):
    """Tries to find good system fonts or falls back to default."""
    font_names = (
        ["arialbd.ttf", "impact.ttf", "segouib.ttf", "courbd.ttf"]
        if bold else
        ["arial.ttf", "segoui.ttf", "calibri.ttf", "cour.ttf"]
    )
    for fn in font_names:
        try:
            return ImageFont.truetype(fn, size)
        except Exception:
            pass
    try:
        return ImageFont.load_default()
    except Exception:
        return None

def draw_cyberpunk_scene(filename, title, subtitle, scene_num, palette="cyan"):
    """Generates a high-resolution 1920x1080 Cyberpunk aesthetic scene image."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"
    
    width, height = 1920, 1080
    img = Image.new("RGB", (width, height), color=(10, 12, 22))
    draw = ImageDraw.Draw(img)
    
    # 1. Background gradient
    c_top = (8, 10, 20)
    c_bot = (18, 14, 38) if palette == "purple" else (12, 28, 45)
    for y in range(height):
        ratio = y / height
        r = int(c_top[0] * (1 - ratio) + c_bot[0] * ratio)
        g = int(c_top[1] * (1 - ratio) + c_bot[1] * ratio)
        b = int(c_top[2] * (1 - ratio) + c_bot[2] * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # 2. Glowing Perspective Grid Floor
    horizon_y = 620
    accent_color = (0, 240, 255) if palette == "cyan" else (255, 0, 180)
    dim_accent = (int(accent_color[0] * 0.3), int(accent_color[1] * 0.3), int(accent_color[2] * 0.3))
    
    for x in range(0, width + 200, 100):
        draw.line([(width // 2, horizon_y), (x - 100, height)], fill=dim_accent, width=1)
    for step in range(1, 10):
        grid_y = int(horizon_y + (height - horizon_y) * (step / 9.0) ** 1.8)
        draw.line([(0, grid_y), (width, grid_y)], fill=dim_accent, width=1)
    
    # 3. City Silhouettes in horizon
    skyline_points = [
        (0, horizon_y), (150, horizon_y - 120), (220, horizon_y - 120), (220, horizon_y - 200),
        (300, horizon_y - 200), (350, horizon_y - 80), (500, horizon_y - 160), (620, horizon_y - 300),
        (720, horizon_y - 300), (760, horizon_y - 140), (950, horizon_y - 220), (1050, horizon_y - 220),
        (1150, horizon_y - 90), (1300, horizon_y - 260), (1420, horizon_y - 260), (1500, horizon_y - 130),
        (1650, horizon_y - 190), (1750, horizon_y - 190), (1850, horizon_y - 90), (width, horizon_y)
    ]
    draw.polygon(skyline_points + [(width, horizon_y), (0, horizon_y)], fill=(14, 18, 32))
    
    # Glowing window dots in city
    rng = random.Random(scene_num * 100 + 42)
    for _ in range(90):
        wx = rng.randint(50, width - 50)
        wy = rng.randint(horizon_y - 280, horizon_y - 30)
        wc = rng.choice([accent_color, (255, 255, 255), (255, 210, 50)])
        draw.rectangle([wx, wy, wx + 4, wy + 6], fill=wc)
    
    # 4. Neon Horizon Glow Line
    draw.line([(0, horizon_y), (width, horizon_y)], fill=accent_color, width=3)
    
    # 5. Cinematic Letterbox & Vignette
    draw.rectangle([(0, 0), (width, 60)], fill=(0, 0, 0))
    draw.rectangle([(0, height - 60), (width, height)], fill=(0, 0, 0))
    
    # 6. HUD / UI Elements & Badges
    font_badge = get_best_font(20, bold=True)
    font_title = get_best_font(52, bold=True)
    font_sub = get_best_font(26, bold=False)
    
    # Scene Pill
    draw.rounded_rectangle([(80, 90), (250, 135)], radius=8, fill=(20, 30, 48), outline=accent_color, width=2)
    if font_badge:
        draw.text((100, 102), f"SCENE {scene_num:02d}", fill=accent_color, font=font_badge)
        draw.text((270, 104), "● 4K CINEMATIC MASTER", fill=(160, 180, 210), font=font_badge)
    
    # Title & Description
    if font_title:
        draw.text((80, 160), title.upper(), fill=(255, 255, 255), font=font_title)
    if font_sub:
        draw.text((80, 230), subtitle, fill=(180, 200, 225), font=font_sub)
    
    # Sci-Fi HUD Corner Crosshairs
    draw.line([(width - 150, 100), (width - 80, 100)], fill=accent_color, width=2)
    draw.line([(width - 80, 100), (width - 80, 170)], fill=accent_color, width=2)
    draw.line([(80, height - 120), (80, height - 190)], fill=accent_color, width=2)
    draw.line([(80, height - 120), (150, height - 120)], fill=accent_color, width=2)
    
    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"

def draw_horror_scene(filename, title, subtitle, scene_num):
    """Generates a high-resolution 1920x1080 Horror/Mystery atmosphere scene."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"
    
    width, height = 1920, 1080
    img = Image.new("RGB", (width, height), color=(8, 8, 12))
    draw = ImageDraw.Draw(img)
    
    # Dark gloomy background
    for y in range(height):
        ratio = y / height
        v = int(6 + 18 * ratio)
        draw.line([(0, y), (width, y)], fill=(v, v + 2, v + 5))
    
    # Full moon and moonlight haze
    moon_cx, moon_cy = 1400, 300
    for r in range(160, 40, -10):
        alpha_v = int(20 * (1 - r / 160.0))
        draw.ellipse([moon_cx - r, moon_cy - r, moon_cx + r, moon_cy + r], fill=(20 + alpha_v, 25 + alpha_v, 35 + alpha_v))
    draw.ellipse([moon_cx - 50, moon_cy - 50, moon_cx + 50, moon_cy + 50], fill=(210, 220, 235))
    
    # Victorian House Silhouette
    draw.polygon([
        (200, 800), (350, 600), (450, 600), (550, 450), (650, 600), (850, 600),
        (850, 800), (1050, 800), (1050, 950), (100, 950)
    ], fill=(12, 12, 18))
    # Weathered fence & dead trees
    for fx in range(50, width, 60):
        draw.line([(fx, 820), (fx, 750)], fill=(20, 20, 28), width=3)
    
    # Blood red & eerie yellow accent
    font_badge = get_best_font(20, bold=True)
    font_title = get_best_font(52, bold=True)
    font_sub = get_best_font(26, bold=False)
    
    draw.rounded_rectangle([(80, 90), (250, 135)], radius=8, fill=(25, 10, 12), outline=(220, 40, 40), width=2)
    if font_badge:
        draw.text((100, 102), f"SCENE {scene_num:02d}", fill=(255, 70, 70), font=font_badge)
        draw.text((270, 104), "● 3:00 AM SUPERNATURAL FILE", fill=(180, 140, 140), font=font_badge)
    
    if font_title:
        draw.text((80, 160), title.upper(), fill=(240, 235, 235), font=font_title)
    if font_sub:
        draw.text((80, 230), subtitle, fill=(180, 170, 170), font=font_sub)
    
    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"

def draw_tech_scene(filename, title, subtitle, scene_num):
    """Generates a modern 1920x1080 AI / Tech Studio Explainer scene."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"
    
    width, height = 1920, 1080
    img = Image.new("RGB", (width, height), color=(15, 23, 42))
    draw = ImageDraw.Draw(img)
    
    # Modern Gradient
    for y in range(height):
        ratio = y / height
        r = int(15 * (1 - ratio) + 30 * ratio)
        g = int(23 * (1 - ratio) + 58 * ratio)
        b = int(42 * (1 - ratio) + 105 * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))
    
    # Neural Nodes graph
    nodes = [
        (300, 400), (500, 320), (700, 480), (950, 360), (1200, 520), (1450, 380),
        (400, 650), (650, 750), (900, 680), (1150, 720), (1400, 620), (1600, 500)
    ]
    for i, p1 in enumerate(nodes):
        for j, p2 in enumerate(nodes):
            if i < j and math.hypot(p1[0] - p2[0], p1[1] - p2[1]) < 360:
                draw.line([p1, p2], fill=(56, 189, 248, 80), width=2)
    for p in nodes:
        draw.ellipse([p[0] - 12, p[1] - 12, p[0] + 12, p[1] + 12], fill=(56, 189, 248), outline=(255, 255, 255), width=3)
    
    font_badge = get_best_font(20, bold=True)
    font_title = get_best_font(52, bold=True)
    font_sub = get_best_font(26, bold=False)
    
    draw.rounded_rectangle([(80, 90), (250, 135)], radius=8, fill=(15, 35, 60), outline=(56, 189, 248), width=2)
    if font_badge:
        draw.text((100, 102), f"SCENE {scene_num:02d}", fill=(56, 189, 248), font=font_badge)
        draw.text((270, 104), "● NEXT-GEN AI WORKFLOW", fill=(148, 163, 184), font=font_badge)
    
    if font_title:
        draw.text((80, 160), title.upper(), fill=(255, 255, 255), font=font_title)
    if font_sub:
        draw.text((80, 230), subtitle, fill=(203, 213, 225), font=font_sub)
    
    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"

def draw_colorful_scene(filename, title, subtitle, scene_num, palette="sunshine"):
    """Generates a high-resolution 1920x1080 bright, sunny and colorful pop-art anime scene."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"

    width, height = 1920, 1080
    img = Image.new("RGB", (width, height), color=(255, 245, 248))
    draw = ImageDraw.Draw(img)

    # 1. Radiant Colorful Sky Gradient
    c_sky = (0, 198, 255)      # Cyan blue
    c_coral = (255, 107, 129)   # Vibrant coral pink
    c_gold = (255, 235, 59)     # Sunny gold

    for y in range(height):
        r1 = y / height
        if r1 < 0.45:
            sub = r1 / 0.45
            r = int(c_sky[0] * (1 - sub) + c_coral[0] * sub)
            g = int(c_sky[1] * (1 - sub) + c_coral[1] * sub)
            b = int(c_sky[2] * (1 - sub) + c_coral[2] * sub)
        else:
            sub = (r1 - 0.45) / 0.55
            r = int(c_coral[0] * (1 - sub) + c_gold[0] * sub)
            g = int(c_coral[1] * (1 - sub) + c_gold[1] * sub)
            b = int(c_coral[2] * (1 - sub) + c_gold[2] * sub)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # 2. Glowing Sun with Aura
    sun_x, sun_y = 960, 560
    for rad in range(300, 60, -20):
        draw.ellipse([sun_x - rad, sun_y - rad, sun_x + rad, sun_y + rad], fill=(255, 255, 255, 30))
    draw.ellipse([sun_x - 85, sun_y - 85, sun_x + 85, sun_y + 85], fill=(255, 255, 220))

    # 3. Lush Rolling Pop-Art Hills
    draw.chord([-250, 720, 1150, 1500], 180, 360, fill=(0, 230, 180)) # Mint turquoise
    draw.chord([750, 680, 2250, 1500], 180, 360, fill=(155, 90, 255)) # Electric violet
    draw.chord([150, 800, 1850, 1600], 180, 360, fill=(255, 80, 140)) # Hot pink foreground

    # 4. Floating Colorful Confetti & Radiant Sparkles
    rng = random.Random(scene_num * 55 + 13)
    for _ in range(70):
        sx = rng.randint(40, width - 40)
        sy = rng.randint(70, height - 200)
        sc = rng.choice([(255, 255, 255), (255, 235, 59), (0, 240, 255), (255, 64, 129), (118, 255, 3), (255, 171, 0)])
        sz = rng.randint(4, 10)
        draw.rectangle([sx, sy, sx + sz, sy + sz], fill=sc)

    # 5. Clean Top/Bottom Cinematic Bars with Vibrant Color Strips
    draw.rectangle([(0, 0), (width, 55)], fill=(12, 16, 28))
    draw.line([(0, 55), (width, 55)], fill=(255, 64, 129), width=3)
    draw.rectangle([(0, height - 55), (width, height)], fill=(12, 16, 28))
    draw.line([(0, height - 55), (width, height - 55)], fill=(0, 240, 255), width=3)

    # 6. Badges & Typography
    font_badge = get_best_font(20, bold=True)
    font_title = get_best_font(52, bold=True)
    font_sub = get_best_font(26, bold=False)

    draw.rounded_rectangle([(80, 80), (330, 125)], radius=8, fill=(255, 255, 255), outline=(255, 64, 129), width=2)
    if font_badge:
        draw.text((98, 92), f"SCENE {scene_num:02d} • VIBRANT", fill=(255, 20, 100), font=font_badge)
        draw.text((350, 94), "● 4K POP-ART SUNNY MASTER", fill=(255, 255, 255), font=font_badge)

    if font_title:
        draw.text((80, 150), title.upper(), fill=(255, 255, 255), font=font_title)
    if font_sub:
        draw.text((80, 215), subtitle, fill=(255, 245, 190), font=font_sub)

    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"

def draw_colorful_character(filename, name, char_class, role_tag, primary_color=(255, 64, 129), hair_color=(0, 229, 255)):
    """Generates a 672x1568 high-res colorful anime pop-art Character Portrait."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"

    w, h = 672, 1568
    img = Image.new("RGB", (w, h), color=(255, 250, 245))
    draw = ImageDraw.Draw(img)

    # Bright pastel gradient background
    c_top = (255, 230, 240)
    c_bot = (220, 245, 255)
    for y in range(h):
        r1 = y / h
        r = int(c_top[0] * (1 - r1) + c_bot[0] * r1)
        g = int(c_top[1] * (1 - r1) + c_bot[1] * r1)
        b = int(c_top[2] * (1 - r1) + c_bot[2] * r1)
        draw.line([(0, y), (w, y)], fill=(r, g, b))

    # Cheerful sunburst background circles
    cx, cy = w // 2, 600
    for radius in range(320, 100, -30):
        draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(255, 255, 255))

    # Head with colorful hair
    draw.ellipse([cx - 110, cy - 280, cx + 110, cy - 60], fill=hair_color)
    draw.ellipse([cx - 95, cy - 250, cx + 95, cy - 70], fill=(255, 238, 225), outline=primary_color, width=4)

    # Anime eyes
    draw.ellipse([cx - 45, cy - 180, cx - 25, cy - 145], fill=(30, 40, 70))
    draw.ellipse([cx + 25, cy - 180, cx + 45, cy - 145], fill=(30, 40, 70))
    draw.ellipse([cx - 40, cy - 175, cx - 32, cy - 162], fill=(255, 255, 255))
    draw.ellipse([cx + 30, cy - 175, cx + 38, cy - 162], fill=(255, 255, 255))

    # Radiant smile
    draw.arc([cx - 30, cy - 140, cx + 30, cy - 105], 0, 180, fill=primary_color, width=4)
    # Cheeks blush
    draw.ellipse([cx - 65, cy - 145, cx - 45, cy - 130], fill=(255, 140, 170))
    draw.ellipse([cx + 45, cy - 145, cx + 65, cy - 130], fill=(255, 140, 170))

    # Bright colorful hoodie / outfit
    draw.polygon([
        (cx - 80, cy - 50), (cx + 80, cy - 50),
        (cx + 190, cy + 220), (cx + 150, cy + 620),
        (cx - 150, cy + 620), (cx - 190, cy + 220)
    ], fill=(255, 214, 0), outline=primary_color, width=4)

    # Inner shirt
    draw.polygon([
        (cx - 40, cy - 50), (cx + 40, cy - 50),
        (cx + 60, cy + 200), (cx - 60, cy + 200)
    ], fill=primary_color)

    # Pants & sneakers
    draw.rectangle([cx - 130, cy + 620, cx - 20, cy + 860], fill=(60, 130, 240))
    draw.rectangle([cx + 20, cy + 620, cx + 130, cy + 860], fill=(60, 130, 240))
    draw.rounded_rectangle([cx - 140, cy + 860, cx - 10, cy + 910], radius=8, fill=(255, 64, 129))
    draw.rounded_rectangle([cx + 10, cy + 860, cx + 140, cy + 910], radius=8, fill=(0, 229, 255))

    # UI Card Header & Footer
    font_name = get_best_font(38, bold=True)
    font_meta = get_best_font(22, bold=False)

    draw.rounded_rectangle([(30, 40), (w - 30, 125)], radius=12, fill=(255, 255, 255), outline=primary_color, width=3)
    if font_name:
        draw.text((50, 52), name.upper(), fill=(20, 25, 45), font=font_name)
    if font_meta:
        draw.text((50, 92), f"{char_class.upper()} | {role_tag}", fill=primary_color, font=font_meta)

    draw.rounded_rectangle([(30, h - 140), (w - 30, h - 40)], radius=12, fill=(255, 255, 255), outline=primary_color, width=2)
    if font_meta:
        draw.text((50, h - 118), "STYLE: SUNNY VIBRANT POP-ART", fill=(255, 64, 129), font=font_meta)
        draw.text((50, h - 85), "CONSISTENCY: 99.8%  |  COLOR HARMONY: 100%", fill=(60, 80, 120), font=font_meta)

    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"

def draw_character_portrait(filename, name, char_class, role_tag, primary_color=(0, 240, 255)):
    """Generates a 672x1568 high-res Character Reference Portrait."""
    os.makedirs(VAULT_DIR, exist_ok=True)
    out_path = os.path.join(VAULT_DIR, filename)
    if os.path.exists(out_path):
        return f"/vault/{filename}"
    
    w, h = 672, 1568
    img = Image.new("RGB", (w, h), color=(14, 18, 28))
    draw = ImageDraw.Draw(img)
    
    # Background gradient
    for y in range(h):
        r = int(12 + (primary_color[0] * 0.1) * (y / h))
        g = int(16 + (primary_color[1] * 0.1) * (y / h))
        b = int(26 + (primary_color[2] * 0.1) * (y / h))
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    
    # Character Silhouette representation
    cx, cy = w // 2, 600
    
    # Head & glowing outline
    draw.ellipse([cx - 100, cy - 260, cx + 100, cy - 60], fill=(240, 240, 245), outline=primary_color, width=4)
    # Eyes
    draw.ellipse([cx - 40, cy - 170, cx - 25, cy - 150], fill=(20, 20, 30))
    draw.ellipse([cx + 25, cy - 170, cx + 40, cy - 150], fill=(20, 20, 30))
    # Visor / Cyber Eye / Specs
    if "Hacker" in role_tag or "Cyber" in role_tag:
        draw.rounded_rectangle([cx - 60, cy - 180, cx + 60, cy - 145], radius=6, fill=primary_color)
    elif "Investigator" in role_tag:
        draw.arc([cx - 50, cy - 180, cx - 10, cy - 140], 0, 360, fill=(200, 160, 80), width=3)
        draw.arc([cx + 10, cy - 180, cx + 50, cy - 140], 0, 360, fill=(200, 160, 80), width=3)
        draw.line([cx - 10, cy - 160, cx + 10, cy - 160], fill=(200, 160, 80), width=2)
        
    # Torso & Jacket
    draw.polygon([
        (cx - 80, cy - 50), (cx + 80, cy - 50),
        (cx + 180, cy + 220), (cx + 140, cy + 600),
        (cx - 140, cy + 600), (cx - 180, cy + 220)
    ], fill=(25, 32, 48), outline=primary_color, width=3)
    
    # Legs
    draw.rectangle([cx - 120, cy + 600, cx - 20, cy + 850], fill=(18, 22, 34))
    draw.rectangle([cx + 20, cy + 600, cx + 120, cy + 850], fill=(18, 22, 34))
    
    # UI Card Header & Footer
    font_name = get_best_font(38, bold=True)
    font_meta = get_best_font(22, bold=False)
    
    draw.rectangle([(30, 40), (w - 30, 120)], fill=(10, 14, 22), outline=primary_color, width=2)
    if font_name:
        draw.text((50, 52), name.upper(), fill=(255, 255, 255), font=font_name)
    if font_meta:
        draw.text((50, 92), f"{char_class.upper()} | {role_tag}", fill=primary_color, font=font_meta)
    
    # Card Stats bottom
    draw.rectangle([(30, h - 140), (w - 30, h - 40)], fill=(10, 14, 22), outline=(50, 70, 100), width=1)
    if font_meta:
        draw.text((50, h - 120), "CONSISTENCY: 99.4%  |  STATUS: LOCKED", fill=(160, 180, 200), font=font_meta)
        draw.text((50, h - 85), "BASE TEMPLATE: " + char_class.upper(), fill=primary_color, font=font_meta)
    
    img.save(out_path, format="PNG", optimize=True)
    return f"/vault/{filename}"


# ============================================================================
# 2. AUDIO & VOICES ASSET SETUP
# ============================================================================

def setup_demo_audio_files():
    """Ensures realistic demo audio narration files exist in data/audio."""
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(VOICES_DIR, exist_ok=True)
    
    # 1. Cyberpunk Heist Audio
    src_man = os.path.join(VOICES_DIR, "man.wav")
    dst_cyber = os.path.join(AUDIO_DIR, "demo_cyberpunk_heist.wav")
    if os.path.exists(src_man) and not os.path.exists(dst_cyber):
        shutil.copy2(src_man, dst_cyber)
        
    # 2. Horror Cellar Audio
    src_horror = os.path.join(VOICES_DIR, "horror man narrator.wav")
    dst_horror = os.path.join(AUDIO_DIR, "demo_horror_cellar.wav")
    if os.path.exists(src_horror) and not os.path.exists(dst_horror):
        shutil.copy2(src_horror, dst_horror)
        
    # 3. Tech Explainer Audio
    src_cartoon = os.path.join(VOICES_DIR, "cartoon woman.wav")
    dst_tech = os.path.join(AUDIO_DIR, "demo_tech_explainer.wav")
    if os.path.exists(src_cartoon) and not os.path.exists(dst_tech):
        shutil.copy2(src_cartoon, dst_tech)
    elif not os.path.exists(dst_tech) and os.path.exists(src_man):
        shutil.copy2(src_man, dst_tech)

    # 4. Colorful Paradise Audio
    src_narrator = os.path.join(VOICES_DIR, "narrator.wav")
    dst_colorful = os.path.join(AUDIO_DIR, "demo_colorful_paradise.wav")
    if os.path.exists(src_narrator) and not os.path.exists(dst_colorful):
        shutil.copy2(src_narrator, dst_colorful)
    elif not os.path.exists(dst_colorful) and os.path.exists(src_man):
        shutil.copy2(src_man, dst_colorful)


# ============================================================================
# 3. DEMO PRESET DEFINITIONS & BUILDERS
# ============================================================================

def build_cyberpunk_demo():
    """Builds the complete 'The Syndicate Heist' Cyberpunk action demo."""
    setup_demo_audio_files()
    
    # Generate character portraits in Vault
    p1 = draw_character_portrait("demo_char_alex_v1.png", "Alex Vance", "male", "Master Hacker & Netrunner", (0, 240, 255))
    p1_v2 = draw_character_portrait("demo_char_alex_v2.png", "Alex Vance", "male", "Tactical Stealth Gear", (0, 200, 240))
    p2 = draw_character_portrait("demo_char_elena_v1.png", "Elena Cross", "female", "Covert Infiltrator", (255, 0, 180))
    p2_v2 = draw_character_portrait("demo_char_elena_v2.png", "Elena Cross", "female", "Combat Ready Stance", (240, 40, 190))
    
    # Generate scene visuals in Vault
    s1_img = draw_cyberpunk_scene("demo_heist_s01.png", "Neural Terminal Breach", "Alex jacked into the glowing corporate mainframe while rain strikes the glass", 1, "cyan")
    s1_v2 = draw_cyberpunk_scene("demo_heist_s01_v2.png", "Mainframe Overload Angle", "Alternative camera angle showing security alarm reflections", 1, "purple")
    s2_img = draw_cyberpunk_scene("demo_heist_s02.png", "Laser Grid Extraction", "Elena disabling security laser tripwires along the executive corridor", 2, "purple")
    s3_img = draw_cyberpunk_scene("demo_heist_s03.png", "Database Vault Cleared", "Kinetic text overlay: $10,000,000 Acquired, servers purged", 3, "cyan")
    s4_img = draw_cyberpunk_scene("demo_heist_s04.png", "Skyline Speeder Escape", "Cinematic hovercar flying above neon-lit rainy megacity skyscrapers", 4, "cyan")
    s5_img = draw_cyberpunk_scene("demo_heist_s05.png", "Sunrise Horizon", "Alex and Elena disappearing into the golden morning mist with new identities", 5, "purple")
    
    audio_path = "/audio/demo_cyberpunk_heist.wav"
    
    scenes = [
        {
            "id": "S01", "name": "Mainframe Breach", "isKinetic": False,
            "prompt": "Cyberpunk skyscraper server room at midnight, Alex Vance plugging neural cable into pulsating quantum core, blue neon reflections on rain drenched floor-to-ceiling glass window, cinematic wide shot 8k.",
            "negative": "blurry, deformed, cartoon, low quality, daytime",
            "refA": "Alex Vance", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S02", "name": "Laser Corridor Defense", "isKinetic": False,
            "prompt": "Elena Cross in sleek tactical stealth gear crouching beside biometric security door, crisscrossing red laser security beams illuminating misty hallway, tense cinematic lighting.",
            "negative": "blurry, bad anatomy, daylight, low resolution",
            "refA": "Elena Cross", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S03", "name": "Mission Complete Title", "isKinetic": True,
            "prompt": "Solid black background, no texture, typography kinetic text overlay: MISSION COMPLETE, $10,000,000 TRANSFERRED.",
            "negative": "background clutter, texture",
            "refA": "empty_scene.png", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S04", "name": "Megacity Hover Escape", "isKinetic": False,
            "prompt": "Overhead cinematic drone view of glowing cyberpunk metropolis, flying hover vehicles speeding between towering holographic advertisements, neon rain reflections.",
            "negative": "low quality, static, sunny daylight",
            "refA": "empty_scene.png", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S05", "name": "Golden Dawn Departure", "isKinetic": False,
            "prompt": "Alex Vance and Elena Cross inside cockpit of sleek aero-transport speeding towards golden sunrise horizon, city skyline fading behind them, hopeful cinematic lighting.",
            "negative": "darkness, deformed faces, bad anatomy",
            "refA": "Alex Vance", "refB": "Elena Cross", "refC": "", "w": 1920, "h": 1080
        }
    ]
    
    outputs = [
        {
            "sceneId": "S01",
            "params": { "prompt": scenes[0]["prompt"], "refA": "Alex Vance", "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0 },
            "variations": [
                { "id": "var_s01_1", "url": s1_img, "status": "done", "rating": "good", "seed": 8841029 },
                { "id": "var_s01_2", "url": s1_v2, "status": "done", "rating": "unlisted", "seed": 9182371 }
            ],
            "mainId": "var_s01_1", "generating": False
        },
        {
            "sceneId": "S02",
            "params": { "prompt": scenes[1]["prompt"], "refA": "Elena Cross", "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0 },
            "variations": [
                { "id": "var_s02_1", "url": s2_img, "status": "done", "rating": "good", "seed": 4920194 }
            ],
            "mainId": "var_s02_1", "generating": False
        },
        {
            "sceneId": "S03",
            "params": { "prompt": scenes[2]["prompt"], "refA": "empty_scene.png", "w": 1920, "h": 1080 },
            "variations": [
                { "id": "var_s03_1", "url": s3_img, "status": "done", "rating": "good", "seed": 1029481 }
            ],
            "mainId": "var_s03_1", "generating": False, "isKineticText": True
        },
        {
            "sceneId": "S04",
            "params": { "prompt": scenes[3]["prompt"], "refA": "empty_scene.png", "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0 },
            "variations": [
                { "id": "var_s04_1", "url": s4_img, "status": "done", "rating": "good", "seed": 7719203 }
            ],
            "mainId": "var_s04_1", "generating": False
        },
        {
            "sceneId": "S05",
            "params": { "prompt": scenes[4]["prompt"], "refA": "Alex Vance", "refB": "Elena Cross", "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0 },
            "variations": [
                { "id": "var_s05_1", "url": s5_img, "status": "done", "rating": "good", "seed": 3391024 }
            ],
            "mainId": "var_s05_1", "generating": False
        }
    ]
    
    charRefs = {
        "Alex Vance": {
            "template": "male",
            "params": { "prompt": "Cyberpunk hacker male, glowing cyan neural visor, tech collar jacket, sharp undercut, vector illustration style", "negative": "blurry, low quality", "seed": 941027876668241 },
            "variations": [
                { "id": "char_alex_1", "url": p1, "status": "done", "seed": 941027876668241 },
                { "id": "char_alex_2", "url": p1_v2, "status": "done", "seed": 1294819 }
            ],
            "mainId": "char_alex_1", "generating": False
        },
        "Elena Cross": {
            "template": "female",
            "params": { "prompt": "Cyberpunk covert female operative, sleek tactical bodysuit, glowing purple cyber eye, bob haircut, vector illustration style", "negative": "blurry, low quality", "seed": 883910293847291 },
            "variations": [
                { "id": "char_elena_1", "url": p2, "status": "done", "seed": 883910293847291 },
                { "id": "char_elena_2", "url": p2_v2, "status": "done", "seed": 5839201 }
            ],
            "mainId": "char_elena_1", "generating": False
        }
    }
    
    timeline = [
        { "id": "S01", "start": 0.0, "end": 3.2, "dur": 3.2, "status": "MATCHED", "originalStart": 0.0, "originalEnd": 3.2 },
        { "id": "S02", "start": 3.2, "end": 6.8, "dur": 3.6, "status": "MATCHED", "originalStart": 3.2, "originalEnd": 6.8 },
        { "id": "S03", "start": 6.8, "end": 9.6, "dur": 2.8, "status": "MATCHED", "originalStart": 6.8, "originalEnd": 9.6 },
        { "id": "S04", "start": 9.6, "end": 12.4, "dur": 2.8, "status": "MATCHED", "originalStart": 9.6, "originalEnd": 12.4 },
        { "id": "S05", "start": 12.4, "end": 15.12, "dur": 2.72, "status": "MATCHED", "originalStart": 12.4, "originalEnd": 15.12 }
    ]
    
    kineticScenes = [
        {
            "id": "S03",
            "text1": "MISSION SUCCESS:",
            "text2": "$10,000,000 TRANSFERRED & SERVERS PURGED",
            "effect": "neon_glow",
            "font": "'Inter', sans-serif",
            "weight": "bold",
            "textColor": "#00f0ff",
            "bgColor": "#050510",
            "speed": 1.2,
            "intensity": 25,
            "size1": 68,
            "size2": 42,
            "titleRatio": 1.6,
            "duration": 2.8,
            "fps": 30,
            "textAlign": "center",
            "textCase": "uppercase",
            "autoFit": True,
            "transparentBg": False
        }
    ]
    
    sceneTextById = {
        "S01": "I was absolutely certain I was going to prison.",
        "S02": "Elena and I had less than three minutes before the lockdown triggered.",
        "S03": "We walked away with ten million dollars and shut down the servers.",
        "S04": "Completely disappeared into the city skyline without a trace.",
        "S05": "My name doesn't matter anymore. We are free."
    }
    
    return {
        "id": "demo_cyberpunk_heist",
        "name": "🎬 The Syndicate Heist (Cyberpunk Demo)",
        "lastActiveTab": "render",
        "globals": {
            "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "sampler": "euler",
            "seedMode": "random", "fixedSeed": 941027876668241, "fallbackRef": "Alex Vance",
            "workflowMode": "latent_upscale", "charBaseStyle": "default"
        },
        "refs": ["empty_scene.png", "Alex Vance", "Elena Cross"],
        "scenes": scenes,
        "sceneTextById": sceneTextById,
        "outputs": outputs,
        "charRefs": charRefs,
        "timeline": timeline,
        "alignedData": {
            "audio_file": audio_path,
            "duration": 15.12,
            "segments": [
                { "start": 0.0, "end": 3.2, "text": "I was absolutely certain I was going to prison." },
                { "start": 3.2, "end": 6.8, "text": "Elena and I had less than three minutes before lockdown." },
                { "start": 6.8, "end": 9.6, "text": "We walked away with ten million dollars and shut down the servers." },
                { "start": 9.6, "end": 12.4, "text": "Completely disappeared into the city skyline without a trace." },
                { "start": 12.4, "end": 15.12, "text": "My name doesn't matter anymore. We are free." }
            ]
        },
        "kineticScenes": kineticScenes,
        "audioTrack": audio_path
    }

def build_horror_demo():
    """Builds the complete 'Midnight in the Cellar' Horror/Mystery demo."""
    setup_demo_audio_files()
    
    p1 = draw_character_portrait("demo_char_jonathan_v1.png", "Jonathan Reed", "male", "Paranormal Investigator", (200, 160, 80))
    p2 = draw_character_portrait("demo_char_shadow_v1.png", "The Shadow Apparition", "teen", "Basement Manifestation", (220, 50, 50))
    
    s1 = draw_horror_scene("demo_horror_s01.png", "The Lonely Victorian House", "House on the hill under a flash of lightning", 1)
    s2 = draw_horror_scene("demo_horror_s02.png", "The Creaky Wooden Stairs", "Jonathan descending with a brass lantern into darkness", 2)
    s3 = draw_horror_scene("demo_horror_s03.png", "The Chained Cellar Door", "Heavy iron padlocks rattling on ancient oak door", 3)
    s4 = draw_horror_scene("demo_horror_s04.png", "3:00 AM Phenomenon", "Kinetic text: Every night at exactly 3:00 AM the crying began", 4)
    s5 = draw_horror_scene("demo_horror_s05.png", "The Hidden Chamber", "Dust particles floating in the eerie beam of light", 5)
    s6 = draw_horror_scene("demo_horror_s06.png", "The Unspeakable Encounter", "A misty dark figure standing motionless in the corner", 6)
    
    audio_path = "/audio/demo_horror_cellar.wav"
    
    scenes = [
        { "id": "S01", "name": "Victorian Exterior", "prompt": "Isolated Victorian manor on a foggy hill during thunderstorm, lightning flash, gothic atmosphere.", "refA": "empty_scene.png", "w": 1920, "h": 1080 },
        { "id": "S02", "name": "Staircase Descent", "prompt": "Jonathan Reed holding flickering brass lantern walking down creaking basement stairs.", "refA": "Jonathan Reed", "w": 1920, "h": 1080 },
        { "id": "S03", "name": "Chained Oak Door", "prompt": "Heavy antique basement door bound with rusted chains and massive padlocks in cellar shadows.", "refA": "empty_scene.png", "w": 1920, "h": 1080 },
        { "id": "S04", "name": "3 AM Warning", "isKinetic": True, "prompt": "Kinetic text: 3:00 AM - THE CRYING NEVER STOPS.", "refA": "empty_scene.png", "w": 1920, "h": 1080 },
        { "id": "S05", "name": "Subterranean Room", "prompt": "Ancient stone cellar with cracked antique mirror reflecting faint candlelight.", "refA": "Jonathan Reed", "w": 1920, "h": 1080 },
        { "id": "S06", "name": "Entity Revealed", "prompt": "Terrified Jonathan staring at ethereal shadow silhouette emerging from darkness.", "refA": "The Shadow Apparition", "w": 1920, "h": 1080 }
    ]
    
    outputs = [
        { "sceneId": "S01", "params": { "prompt": scenes[0]["prompt"] }, "variations": [{ "id": "v_h1", "url": s1, "status": "done", "rating": "good" }], "mainId": "v_h1" },
        { "sceneId": "S02", "params": { "prompt": scenes[1]["prompt"] }, "variations": [{ "id": "v_h2", "url": s2, "status": "done", "rating": "good" }], "mainId": "v_h2" },
        { "sceneId": "S03", "params": { "prompt": scenes[2]["prompt"] }, "variations": [{ "id": "v_h3", "url": s3, "status": "done", "rating": "good" }], "mainId": "v_h3" },
        { "sceneId": "S04", "params": { "prompt": scenes[3]["prompt"] }, "variations": [{ "id": "v_h4", "url": s4, "status": "done", "rating": "good" }], "mainId": "v_h4", "isKineticText": True },
        { "sceneId": "S05", "params": { "prompt": scenes[4]["prompt"] }, "variations": [{ "id": "v_h5", "url": s5, "status": "done", "rating": "good" }], "mainId": "v_h5" },
        { "sceneId": "S06", "params": { "prompt": scenes[5]["prompt"] }, "variations": [{ "id": "v_h6", "url": s6, "status": "done", "rating": "good" }], "mainId": "v_h6" }
    ]
    
    charRefs = {
        "Jonathan Reed": {
            "template": "male",
            "params": { "prompt": "19th century paranormal investigator in trenchcoat holding lantern", "seed": 4829104 },
            "variations": [{ "id": "char_jonathan_1", "url": p1, "status": "done" }],
            "mainId": "char_jonathan_1"
        },
        "The Shadow Apparition": {
            "template": "teen",
            "params": { "prompt": "Eerie ethereal shadow silhouette with glowing white eyes and mist", "seed": 8192038 },
            "variations": [{ "id": "char_shadow_1", "url": p2, "status": "done" }],
            "mainId": "char_shadow_1"
        }
    }
    
    timeline = [
        { "id": "S01", "start": 0.0, "end": 4.5, "dur": 4.5, "status": "MATCHED" },
        { "id": "S02", "start": 4.5, "end": 9.0, "dur": 4.5, "status": "MATCHED" },
        { "id": "S03", "start": 9.0, "end": 13.5, "dur": 4.5, "status": "MATCHED" },
        { "id": "S04", "start": 13.5, "end": 18.0, "dur": 4.5, "status": "MATCHED" },
        { "id": "S05", "start": 18.0, "end": 22.5, "dur": 4.5, "status": "MATCHED" },
        { "id": "S06", "start": 22.5, "end": 27.23, "dur": 4.73, "status": "MATCHED" }
    ]
    
    kineticScenes = [
        {
            "id": "S04",
            "text1": "EXACTLY 3:00 AM:",
            "text2": "THE CRYING IN THE CELLAR NEVER STOPS",
            "effect": "scary_shake",
            "font": "'Permanent Marker', cursive",
            "weight": "bold",
            "textColor": "#ff2222",
            "bgColor": "#0a0000",
            "speed": 1.6,
            "intensity": 35,
            "size1": 64,
            "size2": 40,
            "titleRatio": 1.5,
            "duration": 4.5,
            "fps": 30
        }
    ]
    
    return {
        "id": "demo_horror_cellar",
        "name": "👻 Midnight in the Cellar (Horror Demo)",
        "lastActiveTab": "timeline",
        "globals": { "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "sampler": "euler", "seedMode": "random" },
        "refs": ["empty_scene.png", "Jonathan Reed", "The Shadow Apparition"],
        "scenes": scenes,
        "sceneTextById": {
            "S01": "I thought the house was empty when I moved in.",
            "S02": "Every night at exactly three in the morning I would hear someone crying.",
            "S03": "The sound came from right behind the chained basement door.",
            "S04": "3:00 AM - THE CRYING NEVER STOPS.",
            "S05": "One night I finally unlocked it and stepped inside.",
            "S06": "It was standing there in the dark... waiting for me."
        },
        "outputs": outputs,
        "charRefs": charRefs,
        "timeline": timeline,
        "kineticScenes": kineticScenes,
        "audioTrack": audio_path
    }

def build_tech_demo():
    """Builds the complete 'AI Studio Pro 2026' Tech Showcase demo."""
    setup_demo_audio_files()
    
    p1 = draw_character_portrait("demo_char_vance_v1.png", "Dr. Marcus Vance", "male", "AI Systems Architect", (56, 189, 248))
    p2 = draw_character_portrait("demo_char_maya_v1.png", "Maya Lin", "female", "Creative Film Director", (245, 158, 11))
    
    s1 = draw_tech_scene("demo_tech_s01.png", "AI Studio Pro Generation", "Next-gen multi-agent storyboard workstation", 1)
    s2 = draw_tech_scene("demo_tech_s02.png", "Instant Kinetic Overlay", "Dynamic typography synchronized with audio frames", 2)
    s3 = draw_tech_scene("demo_tech_s03.png", "Multi-GPU Farm Dispatch", "Parallel rendering across local and cloud nodes", 3)
    s4 = draw_tech_scene("demo_tech_s04.png", "Final 4K Master Video", "Complete multi-layer composition ready for release", 4)
    
    audio_path = "/audio/demo_tech_explainer.wav"
    
    scenes = [
        { "id": "S01", "name": "AI Orchestration Hub", "prompt": "Futuristic workstation display showing AI scene generation network graph, ultra clean slate design.", "refA": "Dr. Marcus Vance", "w": 1920, "h": 1080 },
        { "id": "S02", "name": "Kinetic Typography", "isKinetic": True, "prompt": "Kinetic text: SCENE UI PRO 2026 - NEXT-GEN VIDEO CREATION.", "refA": "empty_scene.png", "w": 1920, "h": 1080 },
        { "id": "S03", "name": "Creative Direction", "prompt": "Maya Lin adjusting parameters on holographic touchscreen with live video preview.", "refA": "Maya Lin", "w": 1920, "h": 1080 },
        { "id": "S04", "name": "4K Video Render Master", "prompt": "Finished video stream rendering seamlessly with glowing audio visualizer bar.", "refA": "empty_scene.png", "w": 1920, "h": 1080 }
    ]
    
    outputs = [
        { "sceneId": "S01", "params": { "prompt": scenes[0]["prompt"] }, "variations": [{ "id": "v_t1", "url": s1, "status": "done", "rating": "good" }], "mainId": "v_t1" },
        { "sceneId": "S02", "params": { "prompt": scenes[1]["prompt"] }, "variations": [{ "id": "v_t2", "url": s2, "status": "done", "rating": "good" }], "mainId": "v_t2", "isKineticText": True },
        { "sceneId": "S03", "params": { "prompt": scenes[2]["prompt"] }, "variations": [{ "id": "v_t3", "url": s3, "status": "done", "rating": "good" }], "mainId": "v_t3" },
        { "sceneId": "S04", "params": { "prompt": scenes[3]["prompt"] }, "variations": [{ "id": "v_t4", "url": s4, "status": "done", "rating": "good" }], "mainId": "v_t4" }
    ]
    
    charRefs = {
        "Dr. Marcus Vance": {
            "template": "male", "params": { "prompt": "Modern AI engineer in blazer with smart glasses", "seed": 1029384 },
            "variations": [{ "id": "c_vance_1", "url": p1, "status": "done" }], "mainId": "c_vance_1"
        },
        "Maya Lin": {
            "template": "female", "params": { "prompt": "Creative director holding digital tablet with warm ambient glow", "seed": 9283741 },
            "variations": [{ "id": "c_maya_1", "url": p2, "status": "done" }], "mainId": "c_maya_1"
        }
    }
    
    timeline = [
        { "id": "S01", "start": 0.0, "end": 3.5, "dur": 3.5, "status": "MATCHED" },
        { "id": "S02", "start": 3.5, "end": 7.0, "dur": 3.5, "status": "MATCHED" },
        { "id": "S03", "start": 7.0, "end": 10.5, "dur": 3.5, "status": "MATCHED" },
        { "id": "S04", "start": 10.5, "end": 14.0, "dur": 3.5, "status": "MATCHED" }
    ]
    
    kineticScenes = [
        {
            "id": "S02",
            "text1": "SCENE UI PRO 2026:",
            "text2": "THE NEXT-GEN MULTI-AGENT VIDEO STUDIO",
            "effect": "typewriter",
            "font": "'Courier Prime', monospace",
            "weight": "bold",
            "textColor": "#38bdf8",
            "bgColor": "#0f172a",
            "speed": 1.1,
            "intensity": 18,
            "size1": 58,
            "size2": 38,
            "titleRatio": 1.5,
            "duration": 3.5,
            "fps": 30
        }
    ]
    
    return {
        "id": "demo_tech_explainer",
        "name": "🚀 AI Studio Pro 2026 (Tech Showcase Demo)",
        "lastActiveTab": "render",
        "globals": { "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "sampler": "euler", "seedMode": "random" },
        "refs": ["empty_scene.png", "Dr. Marcus Vance", "Maya Lin"],
        "scenes": scenes,
        "sceneTextById": {
            "S01": "Welcome to Scene UI Pro. The unified multi-agent cinematic production workstation.",
            "S02": "Generate expressive characters, storyboard scenes, and compose kinetic typography.",
            "S03": "Distribute render jobs seamlessly across local GPUs and cloud farm clusters.",
            "S04": "Preview live multi-track compositions and export professional 4K masters in seconds."
        },
        "outputs": outputs,
        "charRefs": charRefs,
        "timeline": timeline,
        "kineticScenes": kineticScenes,
        "audioTrack": audio_path
    }


def build_colorful_demo():
    """Builds the complete 'Sunny Paradise & Color Symphony' Bright & Colorful Anime/Pop-Art demo."""
    setup_demo_audio_files()

    # Generate character portraits in Vault
    p1 = draw_colorful_character("demo_char_luna_v1.png", "Luna Bright", "female", "Solar Dreamer & Explorer", (255, 64, 129), (0, 229, 255))
    p1_v2 = draw_colorful_character("demo_char_luna_v2.png", "Luna Bright", "female", "Summer Festival Kimono", (255, 171, 0), (255, 64, 129))
    p2 = draw_colorful_character("demo_char_milo_v1.png", "Milo Spark", "teen", "Wonder Guide & Adventurer", (0, 229, 255), (255, 235, 59))
    p2_v2 = draw_colorful_character("demo_char_milo_v2.png", "Milo Spark", "teen", "Rainbow Explorer Cap", (118, 255, 3), (0, 229, 255))

    # Generate scene visuals in Vault
    s1_img = draw_colorful_scene("demo_colorful_s01.png", "Sunny Lagoon & Coral Beach", "Crystal clear turquoise water, pink coral sand, rainbow palms, and golden sunlight", 1, "sunshine")
    s1_v2 = draw_colorful_scene("demo_colorful_s01_v2.png", "Tropical Shoreline Panorama", "Wide cinematic panorama of tropical island with blooming rainbow flowers", 1, "rainbow")
    s2_img = draw_colorful_scene("demo_colorful_s02.png", "Rainbow Blossom Grove", "Luna and Milo discovering giant glowing pastel mushrooms and fluttering butterflies", 2, "pastels")
    s3_img = draw_colorful_scene("demo_colorful_s03.png", "World of Pure Color", "Kinetic typography overlay: Discover Wonder & Pure Joy in Vibrant 4K", 3, "sunshine")
    s4_img = draw_colorful_scene("demo_colorful_s04.png", "Hot Air Balloon Carnival", "Colorful striped hot air balloons floating over candy-colored rolling hills", 4, "rainbow")
    s5_img = draw_colorful_scene("demo_colorful_s05.png", "Sunset Paradise Fiesta", "Celebration under golden hour glow with colorful paper lanterns and sparkles", 5, "sunset")

    audio_path = "/audio/demo_colorful_paradise.wav"

    scenes = [
        {
            "id": "S01", "name": "Sunny Tropical Lagoon", "isKinetic": False,
            "prompt": "Sunny tropical lagoon beach, crystal clear turquoise water, pink coral sand, blooming rainbow hibiscus flowers, radiant golden sunlight rays, flat vibrant pop-art anime style 4k.",
            "negative": "dark, gloomy, monochrome, foggy, gritty, low quality",
            "refA": "Luna Bright", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S02", "name": "Rainbow Blossom Grove", "isKinetic": False,
            "prompt": "Luna Bright and Milo Spark exploring a magical glowing meadow with giant pastel blossoms, fluttering neon blue butterflies, bright sunshine, joyful anime aesthetic.",
            "negative": "dark, horror, dreary, sad, blurry",
            "refA": "Luna Bright", "refB": "Milo Spark", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S03", "name": "Kinetic Color Symphony", "isKinetic": True,
            "prompt": "DISCOVER WONDER: A WORLD OF PURE COLOR & JOY (Kinetic Comic Pop Overlay)",
            "negative": "",
            "refA": "empty_scene.png", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S04", "name": "Hot Air Balloon Carnival", "isKinetic": False,
            "prompt": "Fleet of vibrant rainbow striped hot air balloons floating across candy-colored rolling hills under bright sunny sky with fluffy clouds, high saturation anime pop art.",
            "negative": "storm, rain, dark clouds, desaturated, noisy",
            "refA": "Milo Spark", "refB": "", "refC": "", "w": 1920, "h": 1080
        },
        {
            "id": "S05", "name": "Sunset Paradise Fiesta", "isKinetic": False,
            "prompt": "Joyful sunset festival on tropical paradise island, colorful hanging paper lanterns, sparkling golden confetti in the air, warm radiant glow, celebratory atmosphere.",
            "negative": "dark, depressing, scary, low resolution",
            "refA": "Luna Bright", "refB": "Milo Spark", "refC": "", "w": 1920, "h": 1080
        }
    ]

    outputs = [
        {
            "sceneId": "S01", "isKineticText": False, "mainId": "var_s01_1",
            "params": {"prompt": scenes[0]["prompt"], "negative": scenes[0]["negative"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 9410278, "refA": "Luna Bright"},
            "variations": [
                {"id": "var_s01_1", "url": s1_img, "status": "done", "rating": "good", "prompt": scenes[0]["prompt"], "timestamp": 1786980000, "params": {"prompt": scenes[0]["prompt"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 9410278}},
                {"id": "var_s01_2", "url": s1_v2, "status": "done", "rating": "unlisted", "prompt": "Wide tropical coast panorama angle", "timestamp": 1786980010, "params": {"prompt": "Wide tropical coast panorama angle", "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 1928374}}
            ]
        },
        {
            "sceneId": "S02", "isKineticText": False, "mainId": "var_s02_1",
            "params": {"prompt": scenes[1]["prompt"], "negative": scenes[1]["negative"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 4920194, "refA": "Luna Bright", "refB": "Milo Spark"},
            "variations": [
                {"id": "var_s02_1", "url": s2_img, "status": "done", "rating": "good", "prompt": scenes[1]["prompt"], "timestamp": 1786980020, "params": {"prompt": scenes[1]["prompt"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 4920194}}
            ]
        },
        {
            "sceneId": "S03", "isKineticText": True, "mainId": "var_s03_1",
            "params": {"prompt": scenes[2]["prompt"], "w": 1920, "h": 1080, "refA": "empty_scene.png"},
            "variations": [
                {"id": "var_s03_1", "url": s3_img, "status": "done", "rating": "good", "prompt": scenes[2]["prompt"], "timestamp": 1786980030, "isKineticText": True}
            ]
        },
        {
            "sceneId": "S04", "isKineticText": False, "mainId": "var_s04_1",
            "params": {"prompt": scenes[3]["prompt"], "negative": scenes[3]["negative"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 7719203, "refA": "Milo Spark"},
            "variations": [
                {"id": "var_s04_1", "url": s4_img, "status": "done", "rating": "good", "prompt": scenes[3]["prompt"], "timestamp": 1786980040, "params": {"prompt": scenes[3]["prompt"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 7719203}}
            ]
        },
        {
            "sceneId": "S05", "isKineticText": False, "mainId": "var_s05_1",
            "params": {"prompt": scenes[4]["prompt"], "negative": scenes[4]["negative"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 3391024, "refA": "Luna Bright", "refB": "Milo Spark"},
            "variations": [
                {"id": "var_s05_1", "url": s5_img, "status": "done", "rating": "good", "prompt": scenes[4]["prompt"], "timestamp": 1786980050, "params": {"prompt": scenes[4]["prompt"], "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "seed": 3391024}}
            ]
        }
    ]

    charRefs = {
        "Luna Bright": {
            "template": "female", "gender": "female", "tag": "Solar Dreamer",
            "params": {"prompt": "1girl, Luna Bright, bright sunny yellow hoodie, vivid turquoise hair highlights, radiant anime smile, colorful pastel aesthetic", "negative": "blurry, low quality, dark, gritty", "seed": 941027876668241},
            "variations": [
                {"id": "c1_v1", "url": p1, "status": "done", "note": "Standard Solar Outfit", "seed": 941027876668241},
                {"id": "c1_v2", "url": p1_v2, "status": "done", "note": "Summer Festival Kimono", "seed": 1294819}
            ],
            "mainId": "c1_v1"
        },
        "Milo Spark": {
            "template": "male", "gender": "male", "tag": "Wonder Guide",
            "params": {"prompt": "1boy, Milo Spark, colorful pastel streetwear, rainbow cap, bright sneakers, cheerful expressive anime vector look", "negative": "blurry, low quality, dark, gritty", "seed": 883910293847291},
            "variations": [
                {"id": "c2_v1", "url": p2, "status": "done", "note": "Standard Explorer Gear", "seed": 883910293847291},
                {"id": "c2_v2", "url": p2_v2, "status": "done", "note": "Rainbow Explorer Cap", "seed": 5839201}
            ],
            "mainId": "c2_v1"
        }
    }

    timeline = [
        {"id": "S01", "dur": 3.4, "start": 0.0, "end": 3.4, "status": "MATCHED", "text": "Welcome to the sunny paradise where crystal clear turquoise waves meet pink coral sand."},
        {"id": "S02", "dur": 3.6, "start": 3.4, "end": 7.0, "status": "MATCHED", "text": "Luna and Milo explore the magical rainbow meadow filled with giant pastel blossoms."},
        {"id": "S03", "dur": 3.2, "start": 7.0, "end": 10.2, "status": "MATCHED", "text": "DISCOVER WONDER: A WORLD OF PURE COLOR AND JOY."},
        {"id": "S04", "dur": 3.6, "start": 10.2, "end": 13.8, "status": "MATCHED", "text": "Rainbow hot air balloons rise high above candy-colored hills in the afternoon sun."},
        {"id": "S05", "dur": 3.6, "start": 13.8, "end": 17.417, "status": "MATCHED", "text": "The golden sunset fiesta begins with floating paper lanterns and sparkling joy."}
    ]

    kineticScenes = [
        {
            "id": "S03",
            "text1": "DISCOVER WONDER:",
            "text2": "A WORLD OF PURE COLOR & JOY",
            "animEffect": "comic_pop",
            "effect": "comic_pop",
            "fontFamily": "'Permanent Marker', cursive, sans-serif",
            "font": "'Permanent Marker', cursive, sans-serif",
            "textColor": "#ffea00",
            "bgColor": "#ff007f",
            "duration": 3.2,
            "fps": 30
        }
    ]

    return {
        "id": "demo_colorful_paradise",
        "name": "🌈 Sunny Paradise & Color Symphony",
        "genre": "Bright & Vibrant / Pop-Art Anime",
        "description": "Šviesus, saulėtas ir itin spalvingas pop-art animacinis demo su tropiniais paplūdimiais, oro balionais, ryškiais personažais ir vaivorykštės spalvomis.",
        "badge": "✨ Šviesus & Spalvotas",
        "lastActiveTab": "render",
        "globals": {"w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "sampler": "euler", "seedMode": "random"},
        "refs": ["empty_scene.png", "Luna Bright", "Milo Spark"],
        "scenes": scenes,
        "sceneTextById": {
            "S01": "Welcome to the sunny paradise where crystal clear turquoise waves meet pink coral sand.",
            "S02": "Luna and Milo explore the magical rainbow meadow filled with giant pastel blossoms.",
            "S03": "DISCOVER WONDER: A WORLD OF PURE COLOR AND JOY.",
            "S04": "Rainbow hot air balloons rise high above candy-colored hills in the afternoon sun.",
            "S05": "The golden sunset fiesta begins with floating paper lanterns and sparkling joy."
        },
        "outputs": outputs,
        "charRefs": charRefs,
        "timeline": timeline,
        "kineticScenes": kineticScenes,
        "audioTrack": audio_path
    }

CUSTOM_PRESETS_FILE = os.path.join(DATA_DIR, "demo_custom_presets.json")

def load_custom_presets():
    """Loads user-saved custom demo showcase packages."""
    if os.path.exists(CUSTOM_PRESETS_FILE):
        try:
            with open(CUSTOM_PRESETS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"[Demo] Error loading custom presets: {e}")
            return {}
    return {}

def save_custom_presets(data):
    """Saves custom demo showcase packages to JSON file."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CUSTOM_PRESETS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def convert_to_starter_template(proj_data):
    """
    Converts a complete demo project into a pristine Starter Template:
    - Retains all character prompts, templates, negative prompts, and seeds.
    - Clears pre-rendered character portrait variations.
    - Retains all scene prompts, refA/refB assignments, and dimensions.
    - Clears pre-rendered scene outputs.
    - Retains full voiceover script, audio track, WhisperX timeline, and kinetic typography.
    - Sets active tab to Characters tab so user can immediately generate with ComfyUI.
    """
    starter = json.loads(json.dumps(proj_data))
    
    # 1. Clear scene outputs (ready for ComfyUI generation)
    starter["outputs"] = []
    
    # 2. Reset characters to ungenerated state (ready for ComfyUI generation)
    for cname, cdata in starter.get("charRefs", {}).items():
        cdata["variations"] = []
        cdata["mainId"] = None
        cdata["generating"] = False
        
    starter["lastActiveTab"] = "characters"
    return starter

# ============================================================================
DEMO_HIDDEN_FILE = os.path.join(DATA_DIR, "demo_hidden.json")

def load_hidden_presets():
    if os.path.exists(DEMO_HIDDEN_FILE):
        try:
            with open(DEMO_HIDDEN_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def save_hidden_presets(hidden_set):
    try:
        with open(DEMO_HIDDEN_FILE, "w", encoding="utf-8") as f:
            json.dump(list(hidden_set), f, indent=2)
    except Exception:
        pass

@router.get("/presets")
async def get_demo_presets():
    """Returns standard built-in demo presets along with any user-saved custom presets."""
    hidden = load_hidden_presets()
    standard_presets = [
        {
            "id": "colorful_paradise",
            "name": "🌈 Sunny Paradise & Color Symphony",
            "genre": "Bright & Vibrant / Pop-Art Anime",
            "badge": "✨ Šviesus & Spalvotas",
            "scene_count": 5,
            "char_count": 2,
            "duration": "17.4s",
            "description": "Šviesus, saulėtas ir itin spalvingas pop-art animacinis demo: 2 ryškūs personažai, 5 saulėtos scenos, oro balionai, comic pop kinetiniai titrai ir linksmas garso takelis.",
            "tags": ["Šviesus & Ryškus", "Pop-Art Anime", "2 Veikėjai", "5 Scenos", "Comic Pop FX", "Pilnas Garsas"],
            "thumbnail": "/vault/demo_colorful_s01.png"
        },
        {
            "id": "cyberpunk_heist",
            "name": "🎬 The Syndicate Heist",
            "genre": "Cyberpunk / Action",
            "badge": "⭐ Recommended",
            "scene_count": 5,
            "char_count": 2,
            "duration": "15.1s",
            "description": "High-octane cyberpunk heist: 2 consistent netrunner characters, 5 rendered 1080p scenes, neon kinetic typography, and synced voiceover narration.",
            "tags": ["Full Audio", "2 Characters", "5 Scenes", "Neon Kinetic FX", "Ready to Render"],
            "thumbnail": "/vault/demo_heist_s01.png"
        },
        {
            "id": "horror_cellar",
            "name": "👻 Midnight in the Cellar",
            "genre": "Horror / Mystery",
            "badge": "Creepy Atmosphere",
            "scene_count": 6,
            "char_count": 2,
            "duration": "27.2s",
            "description": "Chilling paranormal mystery: Victorian investigator, shadow apparition, foggy haunted scenes, scary kinetic shake title, and narrator audio track.",
            "tags": ["Voiceover", "Gothic Art", "6 Scenes", "Scary Shake FX", "Timeline Synced"],
            "thumbnail": "/vault/demo_horror_s01.png"
        },
        {
            "id": "tech_explainer",
            "name": "🚀 AI Studio Pro 2026",
            "genre": "Tech / Product Showcase",
            "badge": "Commercial",
            "scene_count": 4,
            "char_count": 2,
            "duration": "14.0s",
            "description": "Clean, modern tech commercial: 2 presenter characters, futuristic node interface visuals, typewriter kinetic titles, and timeline alignment.",
            "tags": ["Product Showcase", "Modern Vector", "Typewriter FX", "Multi-GPU Ready"],
            "thumbnail": "/vault/demo_tech_s01.png"
        }
    ]
    
    # Load user-saved presets and list them at the top
    custom_dict = load_custom_presets()
    custom_presets = []
    for pid, pdata in custom_dict.items():
        custom_presets.append({
            "id": pid,
            "name": pdata.get("name", "Custom Demo"),
            "genre": pdata.get("genre", "Custom AI Generation"),
            "badge": pdata.get("badge", "💾 Mano Išsaugotas Demo"),
            "scene_count": len(pdata.get("scenes", [])),
            "char_count": len(pdata.get("charRefs", {})),
            "duration": f"{round(sum(s.get('dur', 3.5) for s in pdata.get('timeline', [])), 1)}s" if pdata.get("timeline") else "N/A",
            "description": pdata.get("description", "Vartotojo sugeneruotas ir išsaugotas demonstracinis projektas su visais AI kadrais."),
            "tags": ["Custom AI", "Saved Demo", f"{len(pdata.get('scenes', []))} Scenos", "Ready to Play"],
            "thumbnail": pdata.get("thumbnail", "/vault/demo_colorful_s01.png"),
            "is_custom": True
        })
    # Filter standard presets (never hidden by custom dict)
    filtered_standard = [p for p in standard_presets if p["id"] not in hidden]
    all_presets = custom_presets + [p for p in filtered_standard if p["id"] not in [cp["id"] for cp in custom_presets]]
    return JSONResponse(content={"status": "success", "presets": all_presets})

def ensure_project_assets_exist(proj_data):
    """
    Verifies that all image files and character portrait assets referenced
    in proj_data exist in VAULT_DIR. If any referenced file is missing,
    generates or copies a clean artistic image so it never 404s in the UI.
    """
    os.makedirs(VAULT_DIR, exist_ok=True)
    
    # 1. Characters
    char_refs = proj_data.get("charRefs", {})
    for cname, cdata in char_refs.items():
        for v in cdata.get("variations", []):
            url = v.get("url", "")
            if url and url.startswith("/vault/"):
                fname = url.replace("/vault/", "")
                fpath = os.path.join(VAULT_DIR, fname)
                if not os.path.exists(fpath):
                    cn_lower = cname.lower()
                    if "luna" in cn_lower or "bright" in cn_lower:
                        draw_colorful_character(fname, cname, "female", "Solar Dreamer")
                    elif "milo" in cn_lower or "spark" in cn_lower:
                        draw_colorful_character(fname, cname, "teen", "Wonder Guide", (0, 229, 255), (255, 235, 59))
                    elif "alex" in cn_lower:
                        draw_character_portrait(fname, cname, "male", "Master Hacker", (0, 240, 255))
                    elif "elena" in cn_lower:
                        draw_character_portrait(fname, cname, "female", "Covert Infiltrator", (255, 0, 180))
                    elif "jonathan" in cn_lower:
                        draw_character_portrait(fname, cname, "male", "Paranormal Investigator", (200, 160, 80))
                    elif "vance" in cn_lower:
                        draw_character_portrait(fname, cname, "male", "AI Systems Architect", (56, 189, 248))
                    elif "maya" in cn_lower:
                        draw_character_portrait(fname, cname, "female", "Creative Film Director", (245, 158, 11))
                    else:
                        draw_colorful_character(fname, cname, cdata.get("template", "female"), "Character Reference")

    # 2. Scene Outputs
    for out in proj_data.get("outputs", []):
        sc_id = str(out.get("sceneId", "S01"))
        numeric_id = int(''.join(filter(str.isdigit, sc_id)) or 1)
        for v in out.get("variations", []):
            url = v.get("url", "")
            if url and url.startswith("/vault/"):
                fname = url.replace("/vault/", "")
                fpath = os.path.join(VAULT_DIR, fname)
                if not os.path.exists(fpath):
                    p_text = v.get("prompt") or out.get("params", {}).get("prompt", f"Scene {sc_id}")
                    genre = proj_data.get("genre", "").lower()
                    if "heist" in fname or "cyber" in genre or "syndicate" in genre:
                        draw_cyberpunk_scene(fname, f"Scene {sc_id}", p_text[:60], numeric_id)
                    elif "horror" in fname or "horror" in genre or "cellar" in genre:
                        draw_horror_scene(fname, f"Scene {sc_id}", p_text[:60], numeric_id)
                    elif "tech" in fname or "tech" in genre or "explainer" in genre:
                        draw_tech_scene(fname, f"Scene {sc_id}", p_text[:60], numeric_id)
                    else:
                        draw_colorful_scene(fname, f"Scene {sc_id}", p_text[:60], numeric_id)

    # 3. Project thumbnail
    thumb = proj_data.get("thumbnail", "")
    if thumb and thumb.startswith("/vault/"):
        fname = thumb.replace("/vault/", "")
        fpath = os.path.join(VAULT_DIR, fname)
        if not os.path.exists(fpath):
            draw_colorful_scene(fname, proj_data.get("name", "Demo Master"), "Showcase Thumbnail", 1)

def generate_demo_project(preset_id, starter_only=False):
    # Built-in presets ALWAYS use their dedicated clean builders
    builtin_map = {
        "colorful_paradise": build_colorful_demo,
        "colorful": build_colorful_demo,
        "sunny": build_colorful_demo,
        "paradise": build_colorful_demo,
        "cyberpunk_heist": build_cyberpunk_demo,
        "cyberpunk": build_cyberpunk_demo,
        "heist": build_cyberpunk_demo,
        "horror_cellar": build_horror_demo,
        "horror": build_horror_demo,
        "tech_explainer": build_tech_demo,
        "tech": build_tech_demo
    }
    
    if preset_id in builtin_map:
        proj_data = builtin_map[preset_id]()
    else:
        custom_presets = load_custom_presets()
        if preset_id in custom_presets:
            proj_data = json.loads(json.dumps(custom_presets[preset_id]))
        else:
            proj_data = build_colorful_demo()
        
    ensure_project_assets_exist(proj_data)
        
    if starter_only:
        proj_data = convert_to_starter_template(proj_data)
        proj_data["id"] = f"{proj_data['id']}_starter"
        base_name = proj_data['name'].replace('🎬 ', '').replace('🌈 ', '').replace('👻 ', '').replace('🚀 ', '')
        proj_data["name"] = f"🎯 [Starter] {base_name}"
    return proj_data

@router.post("/load")
async def load_demo_preset(request: Request):
    """Loads either a full-rendered demo project or a clean starter prompt project."""
    try:
        data = await request.json()
        preset_id = data.get("preset_id", "colorful_paradise")
        starter_only = bool(data.get("starter_only", False))
        
        proj_data = generate_demo_project(preset_id, starter_only)
            
        proj_id = proj_data["id"]
        os.makedirs(PROJECTS_DIR, exist_ok=True)
        file_path = os.path.join(PROJECTS_DIR, f"{proj_id}.json")
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(proj_data, f, ensure_ascii=False, indent=2)
            
        await broadcast_system_state()
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Demo project '{proj_data['name']}' loaded successfully ({'🎯 Starter Prompt Mode' if starter_only else '🚀 Full Rendered Mode'})!",
            "project_id": proj_id,
            "project": proj_data,
            "starter_only": starter_only
        })
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@router.post("/save_as_preset")
async def save_project_as_demo_preset(request: Request):
    """Saves or overwrites a project into Demo Showcase Presets library."""
    try:
        data = await request.json()
        project_id = data.get("project_id")
        proj_payload = data.get("project")
        target_preset_id = data.get("target_preset_id") or data.get("preset_id")
        preset_name = data.get("name")
        preset_desc = data.get("description", "Vartotojo sugeneruotas demonstracinis paketas.")
        preset_badge = data.get("badge", "💾 Mano Demo")
        preset_genre = data.get("genre", "Custom AI Generation")
        
        proj_data = None
        if proj_payload:
            proj_data = proj_payload
        elif project_id:
            proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
            if os.path.exists(proj_path):
                with open(proj_path, "r", encoding="utf-8") as f:
                    proj_data = json.load(f)
                    
        if not proj_data:
            return JSONResponse(content={"status": "error", "message": "Projektas nerastas arba negauti duomenys."}, status_code=404)
            
        proj_data = json.loads(json.dumps(proj_data))
        
        # Decide preset ID: prevent overwriting built-in standard demo IDs
        if target_preset_id in ["colorful_paradise", "cyberpunk_heist", "horror_cellar", "tech_explainer"]:
            preset_id = f"custom_{target_preset_id}_{uuid.uuid4().hex[:4]}"
        elif target_preset_id and target_preset_id != "new":
            preset_id = target_preset_id
            # Unhide if it was hidden
            hidden = load_hidden_presets()
            if preset_id in hidden:
                hidden.discard(preset_id)
                save_hidden_presets(hidden)
        else:
            preset_id = f"demo_saved_{uuid.uuid4().hex[:6]}"
            
        proj_data["id"] = preset_id
        proj_data["sourceDemoPresetId"] = preset_id
        if preset_name:
            proj_data["name"] = preset_name
        proj_data["description"] = preset_desc
        proj_data["badge"] = preset_badge
        proj_data["genre"] = preset_genre
        proj_data["lastActiveTab"] = "render"
        
        # Pick best thumbnail from generated scene outputs
        thumbnail = "/vault/demo_colorful_s01.png"
        for out in proj_data.get("outputs", []):
            if not out.get("isKineticText") and out.get("variations"):
                for v in reversed(out["variations"]):
                    if v.get("url"):
                        thumbnail = v["url"]
                        break
                if thumbnail != "/vault/demo_colorful_s01.png":
                    break
        proj_data["thumbnail"] = thumbnail
        
        # Save to custom presets dictionary
        custom_presets = load_custom_presets()
        custom_presets[preset_id] = proj_data
        save_custom_presets(custom_presets)
        
        # Also write into projects folder
        out_file = os.path.join(PROJECTS_DIR, f"{preset_id}.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(proj_data, f, ensure_ascii=False, indent=2)
            
        await broadcast_system_state()
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Demo paketas '{proj_data['name']}' sėkmingai išsaugotas!",
            "preset_id": preset_id,
            "project": proj_data
        })
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@router.delete("/preset/{preset_id}")
async def delete_custom_preset(preset_id: str):
    """Deletes or hides a demo preset."""
    try:
        custom_presets = load_custom_presets()
        if preset_id in custom_presets:
            del custom_presets[preset_id]
            save_custom_presets(custom_presets)
            
        hidden = load_hidden_presets()
        hidden.add(preset_id)
        save_hidden_presets(hidden)
            
        await broadcast_system_state()
        return JSONResponse(content={"status": "success", "message": f"Demo paketas '{preset_id}' pašalintas."})
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)

@router.post("/edit_preset")
async def edit_demo_preset(request: Request):
    """Edits demo preset name and description."""
    try:
        data = await request.json()
        preset_id = data.get("id")
        new_name = data.get("name")
        new_desc = data.get("description")
        
        custom_dict = load_custom_presets()
        if preset_id in custom_dict:
            if new_name: custom_dict[preset_id]["name"] = new_name
            if new_desc: custom_dict[preset_id]["description"] = new_desc
            save_custom_presets(custom_dict)
            return JSONResponse({"status": "success", "message": "Demo paketas atnaujintas."})
        else:
            try:
                full_proj = generate_demo_project(preset_id, starter_only=False)
                if new_name: full_proj["name"] = new_name
                if new_desc: full_proj["description"] = new_desc
                custom_dict[preset_id] = full_proj
                save_custom_presets(custom_dict)
                return JSONResponse({"status": "success", "message": "Demo paketas atnaujintas."})
            except Exception as ex:
                return JSONResponse({"status": "error", "message": str(ex)}, status_code=500)
    except Exception as e:
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.post("/create_custom")
async def create_custom_demo(request: Request):
    """Dynamically creates a custom 3-scene mini demo project for any theme."""
    try:
        data = await request.json()
        theme = data.get("theme", "Sci-Fi Space Odyssey").strip()
        custom_id = f"demo_custom_{uuid.uuid4().hex[:6]}"
        
        setup_demo_audio_files()
        
        # Build custom scenes
        s1_img = draw_cyberpunk_scene(f"{custom_id}_s01.png", f"{theme} - Act I", "Establishing setting and main protagonist", 1, "cyan")
        s2_img = draw_cyberpunk_scene(f"{custom_id}_s02.png", f"{theme} - Act II", "Kinetic Typography Highlight", 2, "purple")
        s3_img = draw_cyberpunk_scene(f"{custom_id}_s03.png", f"{theme} - Finale", "Climax and resolution of the story", 3, "cyan")
        
        char_img = draw_character_portrait(f"{custom_id}_hero.png", "Hero", "male", f"Protagonist of {theme}", (0, 240, 255))
        
        proj_data = {
            "id": custom_id,
            "name": f"✨ Demo: {theme}",
            "lastActiveTab": "render",
            "globals": { "w": 1920, "h": 1080, "steps": 4, "cfg": 1.0, "sampler": "euler", "seedMode": "random" },
            "refs": ["empty_scene.png", "Hero"],
            "scenes": [
                { "id": "S01", "name": "Opening Scene", "prompt": f"Cinematic shot of {theme}, establishing wide angle, 8k resolution.", "refA": "Hero", "w": 1920, "h": 1080 },
                { "id": "S02", "name": "Title Highlight", "isKinetic": True, "prompt": f"Kinetic typography text: {theme.upper()}", "refA": "empty_scene.png", "w": 1920, "h": 1080 },
                { "id": "S03", "name": "Epic Conclusion", "prompt": f"Epic finale cinematic shot of {theme}, dramatic lighting.", "refA": "Hero", "w": 1920, "h": 1080 }
            ],
            "sceneTextById": {
                "S01": f"In the beginning of {theme}, everything changed.",
                "S02": f"{theme.upper()} - THE JOURNEY BEGINS NOW.",
                "S03": "And so, a new legend was born."
            },
            "outputs": [
                { "sceneId": "S01", "params": { "prompt": f"Cinematic {theme}" }, "variations": [{ "id": "v1", "url": s1_img, "status": "done", "rating": "good" }], "mainId": "v1" },
                { "sceneId": "S02", "params": { "prompt": f"Kinetic {theme}" }, "variations": [{ "id": "v2", "url": s2_img, "status": "done", "rating": "good" }], "mainId": "v2", "isKineticText": True },
                { "sceneId": "S03", "params": { "prompt": f"Finale {theme}" }, "variations": [{ "id": "v3", "url": s3_img, "status": "done", "rating": "good" }], "mainId": "v3" }
            ],
            "charRefs": {
                "Hero": {
                    "template": "male", "params": { "prompt": f"Main character for {theme}", "seed": 941027876668241 },
                    "variations": [{ "id": "c1", "url": char_img, "status": "done" }], "mainId": "c1"
                }
            },
            "timeline": [
                { "id": "S01", "start": 0.0, "end": 4.0, "dur": 4.0, "status": "MATCHED" },
                { "id": "S02", "start": 4.0, "end": 8.0, "dur": 4.0, "status": "MATCHED" },
                { "id": "S03", "start": 8.0, "end": 12.0, "dur": 4.0, "status": "MATCHED" }
            ],
            "kineticScenes": [
                {
                    "id": "S02",
                    "text1": theme.upper(),
                    "text2": "NOW PLAYING IN CINEMATIC 4K",
                    "effect": "neon_glow",
                    "font": "'Inter', sans-serif",
                    "weight": "bold",
                    "textColor": "#00f0ff",
                    "bgColor": "#050510",
                    "speed": 1.0,
                    "intensity": 25,
                    "size1": 60,
                    "size2": 36,
                    "titleRatio": 1.5,
                    "duration": 4.0,
                    "fps": 30
                }
            ],
            "audioTrack": "/audio/demo_cyberpunk_heist.wav"
        }
        
        os.makedirs(PROJECTS_DIR, exist_ok=True)
        file_path = os.path.join(PROJECTS_DIR, f"{custom_id}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(proj_data, f, ensure_ascii=False, indent=2)
            
        await broadcast_system_state()
        
        return JSONResponse(content={
            "status": "success",
            "message": f"Custom demo '{theme}' created successfully!",
            "project_id": custom_id,
            "project": proj_data
        })
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)
