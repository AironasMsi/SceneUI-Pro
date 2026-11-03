import os
import json
import shutil
import re
import aiohttp
import time
from typing import Dict, Any, Optional
from fastapi import APIRouter, Request, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, Response
from config import PROMPTS_DIR, VAULT_DIR, DATA_DIR, PROJECTS_DIR, OPENAI_API_KEY

router = APIRouter(prefix="/api/styles", tags=["Styles & Character DNA Lab"])

# Apsaugoti gamykliniai stiliai
PROTECTED_STYLES = {"peach_skin_style", "master_style"}
LAST_VIDEO_SESSION_FILE = os.path.join(VAULT_DIR, "last_video_session.json")

# Standartiniai šablonai greitam įkvėpimui (Presets)
STYLE_PRESETS: Dict[str, Dict[str, Any]] = {
    "stick_figure": {
        "slug": "stick_figure_cartoon",
        "displayName": "🥊 Minimalist Stick Figure",
        "scene_suffix": "Minimalist 2D stick figure cartoon animation, clean black lineart, flat solid colors, simple expressive hand-drawn cartoon aesthetic, empty scene, no people",
        "scene_negative": "3d render, realistic, photorealistic, blurry, noise, high detail shading, crowd, multiple people",
        "character_negative": "blurry, low quality, crowd, multiple people, extra characters, photography, realistic human skin, 3d render, detailed face, realistic eyes, trousers, pants, jeans, sweatpants, realistic legs",
        "character_prompt_prefix": "make only one character in that exact style, ",
        "character_prompt_suffix": ", same height, thin line limbs, simple style, in the same art style",
        "background_extras_prompt": "(stylized stick figure extras in the same art style)",
        "empty_scene_removals": ["realistic humans", "detailed faces"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, thin line arms and legs, in the same art style",
        "prompt_female": "make woman character in that exact style, neutral gray clothes, black woman hair, thin line arms and legs, in the same art style, small height, same art style, white face",
        "prompt_female_refined": "make her more woman, make up, curvy body, everything else keep the same, same height, same thin line limps",
        "prompt_teen": "make teenager character in that exact style, neutral gray clothes, messy hair, thin line arms and legs, in the same art style, small height",
        "prompt_kid": "make a small simple child character in that exact style, neutral gray clothes, messy black hair, thin line arms and legs, in the same art style, small height, white face",
        "prompt_scene": "make only one scenic background environment in that exact style, boxing gym training ring, empty scene, no people, in the same art style"
    },
    "stick_figure_cartoon": {
        "slug": "stick_figure_cartoon",
        "displayName": "🥊 Minimalist Stick Figure Cartoon",
        "scene_suffix": "Minimalist 2D stick figure cartoon animation, clean black lineart, flat solid colors, simple expressive hand-drawn cartoon aesthetic, empty scene, no people",
        "scene_negative": "3d render, realistic, photorealistic, blurry, noise, high detail shading, crowd, multiple people",
        "character_negative": "blurry, low quality, crowd, multiple people, extra characters, photography, realistic human skin, 3d render, detailed face, realistic eyes, trousers, pants, jeans, sweatpants, realistic legs",
        "character_prompt_prefix": "make only one character in that exact style, ",
        "character_prompt_suffix": ", same height, thin line limbs, simple style, in the same art style",
        "background_extras_prompt": "(stylized stick figure extras in the same art style)",
        "empty_scene_removals": ["realistic humans", "detailed faces"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, thin line arms and legs, in the same art style",
        "prompt_female": "make woman character in that exact style, neutral gray clothes, black woman hair, thin line arms and legs, in the same art style, small height, same art style, white face",
        "prompt_female_refined": "make her more woman, make up, curvy body, everything else keep the same, same height, same thin line limps",
        "prompt_teen": "make teenager character in that exact style, neutral gray clothes, messy hair, thin line arms and legs, in the same art style, small height",
        "prompt_kid": "make a small simple child character in that exact style, neutral gray clothes, messy black hair, thin line arms and legs, in the same art style, small height, white face",
        "prompt_scene": "make only one scenic background environment in that exact style, boxing gym training ring, empty scene, no people, in the same art style"
    },
    "pixar_3d": {
        "slug": "pixar_3d",
        "displayName": "🧸 Pixar 3D Animation",
        "scene_suffix": "Pixar Disney 3D animation style, soft volumetric lighting, subsurface scattering on skin, expressive large lively eyes, smooth stylized shapes, rich color grading, octane render 8k look, charming cinematic atmosphere.",
        "scene_negative": "photorealistic, real photo, 2d flat, grotesque, deformed, blurry, bad anatomy, harsh dark shadows, grain, noise, low quality, watermark, text, signature, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, portrait framing, cropped legs, cut off legs, cropped feet, out of frame legs, photorealistic, real photo, 2d anime, flat illustration, ugly, deformed, extra fingers, malformed limbs, blurry, dark, grain, watermark, logo, text, speech bubbles, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with background stylized 3d animated people, soft friendly features, matching Pixar animation aesthetic)",
        "empty_scene_removals": ["oversized heads", "peach skin", "2D vector art", "flat illustration"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, stylized 3D Pixar proportions, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, stylized 3D Pixar proportions, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, stylized 3D Pixar proportions, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, stylized 3D Pixar proportions, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, cozy neighborhood bakery interior, warm sunlight through wooden windows, empty scene, no people, in the same art style"
    },
    "ghibli_anime": {
        "slug": "ghibli_anime",
        "displayName": "🎌 Studio Ghibli Anime",
        "scene_suffix": "Studio Ghibli aesthetic, hand-drawn anime cel style, Hayao Miyazaki inspired, lush vibrant watercolor backgrounds, warm nostalgic atmospheric lighting, clean ink linework, painterly masterpiece.",
        "scene_negative": "3d cgi, blender render, digital 3d, photorealistic, harsh neon, modern 3d, deformed, blurry, extra limbs, bad anatomy, text, subtitles, watermark, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, cropped legs, cut off feet, 3d render, cgi, photorealistic, realistic skin texture, deformed, extra limbs, bad eyes, bad hands, lowres, watermark, text, signature, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with background townsfolk in classic hand-drawn Ghibli anime style, peaceful atmosphere)",
        "empty_scene_removals": ["oversized heads", "peach skin", "solid white face", "3d render"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, clean 2D Ghibli anime lineart, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, clean 2D Ghibli anime lineart, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, clean 2D Ghibli anime lineart, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, clean 2D Ghibli anime lineart, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, lush hillside overlooking an antique coastal town, rolling green grass, fluffy clouds, empty scene, no people, in the same art style"
    },
    "cyberpunk_noir": {
        "slug": "cyberpunk_noir",
        "displayName": "⚡ Cyberpunk Neon Noir",
        "scene_suffix": "Cyberpunk neon noir cinematic style, rain-slicked reflective streets, high-contrast cyan and magenta neon rim lighting, deep volumetric shadows, Blade Runner 2049 aesthetic, moody film grain, 35mm lens.",
        "scene_negative": "cartoon, 3d pixar, flat vector, sunny, daytime, oversaturated rainbow, deformed, blurry, low quality, bad anatomy, watermark, text, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, cropped legs, cut off feet, cartoon, childish, flat 2d, blurry, deformed, extra limbs, bad hands, poor lighting, watermark, signature, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with background cybernetic pedestrians under umbrella holograms, moody dark atmosphere)",
        "empty_scene_removals": ["peach skin", "round cartoon head", "flat illustration"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, cyberpunk aesthetic with subtle neon rim light, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, cyberpunk aesthetic with subtle neon rim light, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, cyberpunk aesthetic with subtle neon rim light, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, cyberpunk aesthetic with subtle neon rim light, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, rain-soaked alleyway with holographic signs and deep volumetric shadows, empty scene, no people, in the same art style"
    },
    "retro_comic": {
        "slug": "retro_comic",
        "displayName": "📚 Graphic Novel & Comic",
        "scene_suffix": "Vintage graphic novel comic book style, bold black ink outlines, visible Ben-Day dots halftones, dynamic screen tones, high-contrast ink hatching, vibrant retro 4-color palette, classic pulp comic look.",
        "scene_negative": "3d render, cgi, photorealistic, realistic skin, smooth gradient, blurry, deformed, bad anatomy, text bubbles, watermark, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, cropped legs, cut off feet, photorealistic, 3d cgi, blurry, bad linework, deformed, extra limbs, watermark, text, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with background comic-book style sketched silhouettes, retro halftone pattern)",
        "empty_scene_removals": ["peach skin", "solid white face", "3d render"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, bold retro comic ink outlines and halftones, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, bold retro comic ink outlines and halftones, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, bold retro comic ink outlines and halftones, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, bold retro comic ink outlines and halftones, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, vintage diner interior, halftone patterns and comic ink shadows, empty scene, no people, in the same art style"
    },
    "cinematic_35mm": {
        "slug": "cinematic_35mm",
        "displayName": "🎞️ Cinematic 35mm Film",
        "scene_suffix": "Cinematic 35mm film still, Kodak Vision3 color tone, natural organic film grain, shallow depth of field, f/1.4 aperture, realistic cinematic lighting, atmospheric film grading, Panavision anamorphic look.",
        "scene_negative": "cartoon, 3d render, anime, cgi, flat, plastic, oversaturated, deformed, bad eyes, blurry, low resolution, watermark, text, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, cropped legs, cut off feet, cartoon, 3d render, anime, plastic, doll, deformed, malformed, extra limbs, blurry, watermark, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with natural background extras blurred in cinematic bokeh, authentic candid movie scene)",
        "empty_scene_removals": ["peach skin", "solid white face", "cartoon outlines"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, cinematic 35mm film still lighting and grain, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, cinematic 35mm film still lighting and grain, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, cinematic 35mm film still lighting and grain, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, cinematic 35mm film still lighting and grain, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, golden hour train station platform, warm setting sun and soft dust motes, empty scene, no people, in the same art style"
    },
    "claymation": {
        "slug": "claymation",
        "displayName": "🧶 Claymation & Stop-Motion",
        "scene_suffix": "Aardman style stop-motion claymation, handmade plasticine clay texture, subtle fingerprint details on clay surface, tactile miniature craft model, miniature studio lighting, depth of field macro photography, whimsical tactile charm.",
        "scene_negative": "2d drawing, digital smooth vector, photorealistic human, sharp modern cgi, deformed, bad anatomy, blurry, watermark, text, crowd, multiple people",
        "character_negative": "close-up, bust shot, headshot, cropped legs, cut off feet, real human skin, 2d anime, photorealistic, blurry, bad anatomy, watermark, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": "(with background quirky claymation plasticine figurines)",
        "empty_scene_removals": ["peach skin", "solid white face", "flat illustration"],
        "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, handmade stop-motion claymation plasticine textures, in the same art style",
        "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, handmade stop-motion claymation plasticine textures, in the same art style",
        "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, handmade stop-motion claymation plasticine textures, in the same art style",
        "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, handmade stop-motion claymation plasticine textures, in the same art style",
        "prompt_scene": "make only one scenic background environment in that exact style, stop-motion claymation miniature workshop with tiny handcrafted wooden tools, empty scene, no people, in the same art style"
    }
}


def _safe_slug(name: str) -> str:
    """Konvertuoja vartotojo pavadinimą į saugų aplanko vardą."""
    clean = re.sub(r'[^a-zA-Z0-9_\-]', '_', name.strip().lower())
    clean = re.sub(r'_+', '_', clean).strip('_')
    return clean or "custom_style"


# ============================================================================
# 1. VISŲ STILIŲ SĄRAŠAS IR INFORMACIJA
# ============================================================================
@router.get("/list")
async def list_all_styles():
    """Grąžina visų esamų stilių sąrašą su konfigūracijomis ir bazinių failų būsena."""
    if not os.path.exists(PROMPTS_DIR):
        return {"status": "success", "styles": []}
    
    styles = []
    for item in os.listdir(PROMPTS_DIR):
        item_path = os.path.join(PROMPTS_DIR, item)
        if not os.path.isdir(item_path):
            continue
        
        cfg_path = os.path.join(item_path, "style_config.json")
        cfg_data = {}
        if os.path.exists(cfg_path):
            try:
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg_data = json.load(f)
            except Exception:
                pass
        
        base_dir = os.path.join(item_path, "base")
        templates = cfg_data.get("base_templates", {})
        
        base_status = {}
        for role in ["male", "female", "teen", "kid"]:
            target_file = templates.get(role, f"base_{role}.png")
            full_path = os.path.join(base_dir, target_file)
            exists = os.path.exists(full_path)
            # URL statiniam atvaizdavimui naršyklėje
            url = f"/prompts/{item}/base/{target_file}" if exists else ""
            base_status[role] = {
                "filename": target_file,
                "exists": exists,
                "url": url
            }
        
        has_all_bases = all(b["exists"] for b in base_status.values())
        
        # Sukuriame gražų atvaizdavimo pavadinimą
        display_name = item.replace("_", " ").title()
        if item in STYLE_PRESETS:
            display_name = STYLE_PRESETS[item].get("displayName", display_name)
        elif item == "peach_skin_style":
            display_name = "🍑 Peach Skin (Minimal 2D)"
        elif item == "master_style":
            display_name = "⚪ Master Style (Clean Monochromatic)"

        styles.append({
            "slug": item,
            "displayName": display_name,
            "isBuiltin": item in PROTECTED_STYLES,
            "config": cfg_data,
            "baseStatus": base_status,
            "hasAllBases": has_all_bases
        })
    
    # Rūšiuojame: pirma standartiniai/apsaugoti, po to kiti
    styles.sort(key=lambda s: (not s["isBuiltin"], s["slug"]))
    return {"status": "success", "styles": styles, "presets": list(STYLE_PRESETS.keys())}


# ============================================================================
# 1.1. AKTYVI VIDEO INGENT SESIJA IR JOS BŪSENOS IŠSAUGOJIMAS
# ============================================================================
@router.get("/last_video_session")
async def get_last_video_session():
    """
    Grąžina paskutinę išsaugotą video analizės sesiją su visais kadrais ir pasirinkimais.
    Patikrina, ar kadrai vis dar egzistuoja diske.
    """
    if not os.path.exists(LAST_VIDEO_SESSION_FILE):
        return {"status": "empty", "message": "Nėra išsaugotos video sesijos"}
        
    try:
        with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
            sess = json.load(f)
            
        session_id = sess.get("session_id", "")
        frames_dir = os.path.join(VAULT_DIR, f"video_ingest_{session_id}")
        
        # Patikriname ar kadrų aplankas egzistuoja diske
        if not os.path.isdir(frames_dir):
            return {"status": "empty", "message": "Sesijos kadrų aplankas nebeegzistuoja"}
            
        # Filtruojame kadrus, kurie tikrai yra diske
        valid_frames = []
        for fr in sess.get("frames", []):
            fn = fr.get("filename")
            if fn and os.path.isfile(os.path.join(frames_dir, fn)):
                valid_frames.append(fr)
                
        if not valid_frames:
            return {"status": "empty", "message": "Kadrų failai nerasti diske"}
            
        sess["frames"] = valid_frames
        return {"status": "success", "data": sess}
    except Exception as e:
        print(f"[Get Last Video Session Error]: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/update_video_session")
async def update_video_session(request: Request):
    """
    Atnaujina aktyvios video sesijos būseną: sugeneruotus etalonų atvaizdus, redaguotus promptus ir kt.
    """
    data = await request.json()
    sess = {}
    if os.path.exists(LAST_VIDEO_SESSION_FILE):
        try:
            with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                sess = json.load(f)
        except Exception:
            sess = {}
            
    # Atnaujiname laukus
    for k in ["youtube_url", "style_dna", "images", "selected_frame", "aspect_ratio", "variations", "master_character_role", "character_reference_mode"]:
        if k in data:
            if k in ["variations", "images"]:
                sess[k] = data[k]
            elif isinstance(data[k], dict) and isinstance(sess.get(k), dict):
                sess[k].update(data[k])
            else:
                sess[k] = data[k]
                
    import time
    sess["updated_at"] = time.time()
    
    try:
        with open(LAST_VIDEO_SESSION_FILE, "w", encoding="utf-8") as f:
            json.dump(sess, f, ensure_ascii=False, indent=2)
        return {"status": "success", "message": "Sesija atnaujinta diske"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


# ============================================================================
# 2. DETALI VIENO STILIAUS INFORMACIJA
# ============================================================================
@router.get("/{style_slug}")
async def get_style_detail(style_slug: str):
    """Grąžina vieno stiliaus pilną konfigūraciją ir instrukcijas."""
    style_path = os.path.join(PROMPTS_DIR, style_slug)
    if not os.path.exists(style_path):
        raise HTTPException(status_code=404, detail=f"Style '{style_slug}' not found.")
    
    cfg_path = os.path.join(style_path, "style_config.json")
    cfg_data = {}
    if os.path.exists(cfg_path):
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg_data = json.load(f)
            
    chars_txt = ""
    chars_path = os.path.join(style_path, "characters.txt")
    if os.path.exists(chars_path):
        with open(chars_path, "r", encoding="utf-8") as f:
            chars_txt = f.read()

    scenes_txt = ""
    scenes_path = os.path.join(style_path, "scenes.txt")
    if os.path.exists(scenes_path):
        with open(scenes_path, "r", encoding="utf-8") as f:
            scenes_txt = f.read()

    base_dir = os.path.join(style_path, "base")
    base_urls = {}
    templates = cfg_data.get("base_templates", {})
    for role in ["male", "female", "teen", "kid"]:
        tf = templates.get(role, f"base_{role}.png")
        exists = os.path.exists(os.path.join(base_dir, tf))
        base_urls[role] = f"/prompts/{style_slug}/base/{tf}" if exists else ""

    return {
        "status": "success",
        "style": {
            "slug": style_slug,
            "isBuiltin": style_slug in PROTECTED_STYLES,
            "config": cfg_data,
            "charactersTxt": chars_txt,
            "scenesTxt": scenes_txt,
            "baseUrls": base_urls
        }
    }


# ============================================================================
# 3. AI STILIAUS DNR GENERAVIMAS (PER LLM ARBA ŠABLONUS)
# ============================================================================
@router.post("/ai_design")
async def ai_design_style(request: Request):
    """
    Priima vartotojo laisvo teksto idėją arba šablono raktą.
    Sugeneruoja pilną stiliaus DNR: scene_suffix, negatives, 4 bazinių veikėjų promptus ir bandomosios scenos promptą.
    """
    data = await request.json()
    idea = data.get("idea", "").strip()
    preset_key = data.get("preset", "").strip()
    
    # 1. Jei vartotojas pasirinko greitąjį šabloną (Preset)
    if preset_key and preset_key in STYLE_PRESETS:
        preset_info = dict(STYLE_PRESETS[preset_key])
        return {"status": "success", "source": "preset", "data": preset_info}
    
    # 2. Jei idėja atitinka žinomą raktą
    for key, p in STYLE_PRESETS.items():
        if key in idea.lower() or p["displayName"].lower() in idea.lower():
            return {"status": "success", "source": "preset_match", "data": p}

    # 3. Jei turime naują laisvo teksto idėją, klausiame LLM
    provider = data.get("provider", "api")
    target_url = data.get("url", "").strip()
    api_key = data.get("key", "").strip() or OPENAI_API_KEY
    model = data.get("model", "gpt-4o-mini")

    system_instruction = """You are a World-Class Visual Director & Art Stylist for an AI Animation Studio.
Your task is to take the user's artistic idea and design a complete, cohesive "Visual Style DNA" for generating consistent characters and scenes.

CRITICAL PROMPT SYNTAX FOR CHARACTERS:
For image editing and diffusion models (e.g. Qwen Image Edit, Qwen 2.1), character benchmark prompts MUST be concise, direct, and follow this exact proven formula:
"make only one [character role] character in that exact style, neutral gray clothes, [hair/features], [1-2 distinctive anatomical or rendering traits of THIS style], in the same art style"

ALWAYS prepend "make only one" to avoid generating crowds or multiple people!
DO NOT add generic buzzwords like "studio lighting", "8k render", "octane render", or bloated boilerplate.
Extract and use ONLY the real distinctive traits of THIS requested art style (e.g. for stick figure: "thin line arms and legs, flat color fills"; for 3D cartoon: "smooth 3D CGI stylized proportions"; for anime: "clean 2D anime cel shading"; for claymation: "sculpted clay puppet, tactile plasticine texture"; for vintage comic: "vintage halftone dots, bold ink lineart"). If no special limbs or traits are needed, leave it general or empty.

You MUST respond strictly with a valid JSON object with NO markdown around it, conforming to this exact schema:
{
  "slug": "short_snake_case_name",
  "displayName": "Emoji + Stylized Title",
  "art_traits": "1-2 key distinctive traits of this specific style",
  "scene_suffix": "Art style formula appended to all background scenes: lighting, rendering technique, color palette, camera/lens look.",
  "scene_negative": "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, signature, crowd, multiple people",
  "character_negative": "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, signature, photography, realistic human skin, crowd, multiple people",
  "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
  "character_prompt_suffix": ", in the same art style",
  "background_extras_prompt": "(with background extras matching this exact style aesthetic)",
  "empty_scene_removals": ["keywords to remove when a scene has no humans"],
  "prompt_male": "make only one adult man character in that exact style, neutral gray clothes, short black hair, [art_traits], in the same art style",
  "prompt_female": "make only one woman character in that exact style, neutral gray clothes, brown hair, [art_traits], in the same art style",
  "prompt_teen": "make only one teenager character in that exact style, neutral gray clothes, messy hair, [art_traits], in the same art style",
  "prompt_kid": "make only one child character in that exact style, neutral gray clothes, neat hair, [art_traits], in the same art style",
  "prompt_scene": "make only one scenic background environment in that exact style, iconic buildings and atmospheric lighting, empty scene, no people, in the same art style"
}"""

    user_prompt = f"Design a visual style DNA for this concept:\n{idea}"

    # Bandome kviesti LLM
    try:
        if provider == "api" and api_key:
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model or "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.7,
                "response_format": {"type": "json_object"}
            }
            async with aiohttp.ClientSession() as session:
                async with session.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=45) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        raw_content = res_json["choices"][0]["message"]["content"]
                        parsed = json.loads(raw_content)
                        parsed["slug"] = _safe_slug(parsed.get("slug", idea[:15]))
                        traits = parsed.get("art_traits") or parsed.get("style_traits") or ""
                        traits_str = f", {traits}" if traits.strip() else ""
                        for key in ["prompt_male", "prompt_female", "prompt_teen", "prompt_kid"]:
                            if key in parsed and isinstance(parsed[key], str):
                                parsed[key] = (parsed[key]
                                               .replace(", [art_traits]", traits_str)
                                               .replace("[art_traits]", traits)
                                               .replace(", [style_traits]", traits_str)
                                               .replace("[style_traits]", traits)
                                               .replace(", [traits]", traits_str)
                                               .replace("[traits]", traits))
                        return {"status": "success", "source": "llm", "data": parsed}
        elif provider == "local" and target_url:
            payload = {
                "model": model or "llama3",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt}
                ],
                "stream": False,
                "format": "json"
            }
            async with aiohttp.ClientSession() as session:
                endpoint = f"{target_url.rstrip('/')}/api/chat"
                async with session.post(endpoint, json=payload, timeout=60) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        raw_content = res_json.get("message", {}).get("content", "{}")
                        parsed = json.loads(raw_content)
                        parsed["slug"] = _safe_slug(parsed.get("slug", idea[:15]))
                        traits = parsed.get("art_traits") or parsed.get("style_traits") or ""
                        traits_str = f", {traits}" if traits.strip() else ""
                        for key in ["prompt_male", "prompt_female", "prompt_teen", "prompt_kid"]:
                            if key in parsed and isinstance(parsed[key], str):
                                parsed[key] = (parsed[key]
                                               .replace(", [art_traits]", traits_str)
                                               .replace("[art_traits]", traits)
                                               .replace(", [style_traits]", traits_str)
                                               .replace("[style_traits]", traits)
                                               .replace(", [traits]", traits_str)
                                               .replace("[traits]", traits))
                        return {"status": "success", "source": "local_llm", "data": parsed}
    except Exception as e:
        print(f"[Style AI Design] LLM užklausa nepavyko: {e}. Naudojamas išmanusis fallback.")

    # Fallback: jei nėra API rakto arba įvyko tinklo klaida, suformuojame tvarkingą profilį pagal vartotojo tekstą
    clean_slug = _safe_slug(idea[:20])
    fallback_traits = f"{idea} stylized art aesthetic"
    fallback_data = {
        "slug": clean_slug,
        "displayName": f"✨ {idea.capitalize()[:25]}",
        "art_traits": fallback_traits,
        "scene_suffix": f"{idea} art style, high quality visual aesthetic, atmospheric cinematic lighting, 8k resolution.",
        "scene_negative": "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, signature, crowd, multiple people",
        "character_negative": "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, signature, photography, realistic human skin, crowd, multiple people",
        "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
        "character_prompt_suffix": ", in the same art style",
        "background_extras_prompt": f"(with background people matching the {idea} aesthetic)",
        "empty_scene_removals": ["people", "faces", "human bodies"],
        "prompt_male": f"make only one adult man character in that exact style, neutral gray clothes, short black hair, {fallback_traits}, in the same art style",
        "prompt_female": f"make only one woman character in that exact style, neutral gray clothes, brown hair, {fallback_traits}, in the same art style",
        "prompt_teen": f"make only one teenager character in that exact style, neutral gray clothes, messy hair, {fallback_traits}, in the same art style",
        "prompt_kid": f"make only one child character in that exact style, neutral gray clothes, neat hair, {fallback_traits}, in the same art style",
        "prompt_scene": f"make only one scenic background environment in that exact style, iconic buildings and atmospheric lighting, empty scene, no people, in the same art style"
    }
    return {"status": "success", "source": "smart_fallback", "data": fallback_data}


# ============================================================================
# 4. PAVEIKSLĖLIO ĮKĖLIMAS ARCHETIPUI
# ============================================================================
@router.post("/upload_base")
async def upload_archetype_image(
    file: UploadFile = File(...),
    style_slug: str = Form("temp"),
    archetype: str = Form("male")
):
    """
    Priima įkeltą paveikslėlį konkrečiam archetipui (male, female, teen, kid, scene)
    ir išsaugo jį į VAULT_DIR arba stiliaus aplanką.
    """
    try:
        valid_roles = {"male", "female", "teen", "kid", "scene"}
        if archetype not in valid_roles:
            raise HTTPException(status_code=400, detail=f"Invalid archetype: {archetype}")
            
        safe_slug = _safe_slug(style_slug)
        filename = f"{safe_slug}_base_{archetype}.png"
        target_path = os.path.join(VAULT_DIR, filename)
        
        with open(target_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        return {
            "status": "success",
            "archetype": archetype,
            "filename": filename,
            "url": f"/vault/{filename}"
        }
    except Exception as e:
        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)


# ============================================================================
# 5. PILNAS STILIAUS IŠSAUGOJIMAS Į SISTEMĄ
# ============================================================================
@router.post("/save")
async def save_style(request: Request):
    """
    Sukuriamas arba atnaujinamas stilius:
    - prompts/{style_slug}/
    - prompts/{style_slug}/style_config.json
    - prompts/{style_slug}/characters.txt
    - prompts/{style_slug}/scenes.txt
    - prompts/{style_slug}/base/ (nukopijuojami visi 4 baziniai failai)
    """
    data = await request.json()
    raw_slug = data.get("slug", "").strip()
    if not raw_slug:
        return JSONResponse(content={"status": "error", "message": "Nenurodytas stiliaus identifikatorius!"}, status_code=400)
    
    style_slug = _safe_slug(raw_slug)
    style_dir = os.path.join(PROMPTS_DIR, style_slug)
    base_dir = os.path.join(style_dir, "base")
    
    os.makedirs(base_dir, exist_ok=True)
    
    # 1. Paruošiame style_config.json
    config = data.get("config", {})
    base_templates = {
        "male": f"{style_slug}_base_male.png",
        "female": f"{style_slug}_base_female.png",
        "teen": f"{style_slug}_base_teen.png",
        "kid": f"{style_slug}_base_kid.png"
    }
    config["base_templates"] = base_templates
    
    # Default reikšmės jei trūksta
    if "scene_suffix" not in config:
        config["scene_suffix"] = f"{style_slug.replace('_', ' ')} art style."
    if "scene_negative" not in config:
        config["scene_negative"] = "blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text"
    if "character_negative" not in config:
        config["character_negative"] = "blurry, low quality, deformed, extra limbs, bad anatomy, watermark, text"
    if "character_prompt_prefix" not in config:
        config["character_prompt_prefix"] = "make character in that exact style, neutral gray clothes, "
    if "character_prompt_suffix" not in config:
        config["character_prompt_suffix"] = ", in the same art style"
    if "background_extras_prompt" not in config:
        config["background_extras_prompt"] = f"(with background people matching the {style_slug.replace('_', ' ')} style)"
    if "empty_scene_removals" not in config:
        config["empty_scene_removals"] = ["people", "faces", "bodies"]
        
    cfg_file = os.path.join(style_dir, "style_config.json")
    with open(cfg_file, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
        
    # 2. Paruošiame characters.txt ir scenes.txt
    chars_txt = data.get("charactersTxt", "").strip()
    if not chars_txt:
        # Paimame pavyzdį iš master_style jei vartotojas neįvedė specialių taisyklių
        master_chars = os.path.join(PROMPTS_DIR, "master_style", "characters.txt")
        if os.path.exists(master_chars):
            with open(master_chars, "r", encoding="utf-8") as f:
                chars_txt = f.read()
        else:
            chars_txt = f"### SYSTEM ROLE ###\nYou are a Master Character Stylist AI for {style_slug} animation."
            
    with open(os.path.join(style_dir, "characters.txt"), "w", encoding="utf-8") as f:
        f.write(chars_txt)

    scenes_txt = data.get("scenesTxt", "").strip()
    if not scenes_txt:
        master_scenes = os.path.join(PROMPTS_DIR, "master_style", "scenes.txt")
        if os.path.exists(master_scenes):
            with open(master_scenes, "r", encoding="utf-8") as f:
                scenes_txt = f.read()
        else:
            scenes_txt = f"### SYSTEM ROLE ###\nYou are a Master Scene Breakdown Director for {style_slug} animation."

    with open(os.path.join(style_dir, "scenes.txt"), "w", encoding="utf-8") as f:
        f.write(scenes_txt)

    # 3. Išsaugome 4 bazinius paveikslėlius
    images = data.get("images", {})
    for role in ["male", "female", "teen", "kid"]:
        filename_or_url = images.get(role, "")
        target_name = base_templates[role]
        dest_path = os.path.join(base_dir, target_name)
        
        # Surandame šaltinio failą
        clean_src = (filename_or_url or "").replace("/vault/", "").replace("/prompts/", "").strip()
        src_path = None
        
        # Tikriname Vault aplanke tik jei nurodytas failo vardas
        if clean_src:
            candidate1 = os.path.join(VAULT_DIR, clean_src)
            candidate2 = os.path.join(VAULT_DIR, os.path.basename(clean_src))
            candidate3 = os.path.join(PROMPTS_DIR, clean_src)
            if os.path.isfile(candidate1):
                src_path = candidate1
            elif os.path.isfile(candidate2):
                src_path = candidate2
            elif os.path.isfile(candidate3):
                src_path = candidate3
            
        if src_path and os.path.isfile(src_path):
            shutil.copy2(src_path, dest_path)
        else:
            # Jei failo nėra, sugeneruojame procedūrinį placeholderį
            if not os.path.exists(dest_path):
                _create_placeholder_base_image(dest_path, role, style_slug)

    # Sinchronizuojame su frontend/base kad atsirastų ir tiesioginiame statiniame kelyje
    sync_style_base_templates()

    return {
        "status": "success",
        "message": f"Stilius '{style_slug}' sėkmingai išsaugotas!",
        "slug": style_slug,
        "styleDir": f"prompts/{style_slug}"
    }


def _create_placeholder_base_image(path: str, role: str, style_name: str):
    """Sugeneruoja tvarkingą PNG atvaizdą jei naudotojas dar neįkėlė nuotraukos."""
    try:
        from PIL import Image, ImageDraw
        img = Image.new('RGB', (1024, 1024), color=(240, 240, 245))
        draw = ImageDraw.Draw(img)
        draw.ellipse([362, 250, 662, 600], fill=(210, 215, 230), outline=(120, 130, 160), width=6)
        draw.ellipse([300, 580, 724, 950], fill=(190, 200, 220), outline=(120, 130, 160), width=6)
        
        text = f"{style_name.upper()}\nBASE {role.upper()}"
        draw.text((512, 500), text, fill=(50, 60, 80), anchor="mm")
        img.save(path, format="PNG")
    except Exception:
        pass


def sync_style_base_templates():
    """Užtikrina, kad visi stiliai iš prompts/ turėtų savo bazinius failus ir frontend/base/ aplanke."""
    from config import FRONTEND_DIR
    base_dir = os.path.join(FRONTEND_DIR, "base")
    os.makedirs(base_dir, exist_ok=True)
    if not os.path.exists(PROMPTS_DIR):
        return
    
    for style_slug in os.listdir(PROMPTS_DIR):
        s_path = os.path.join(PROMPTS_DIR, style_slug)
        if not os.path.isdir(s_path):
            continue
        src_base = os.path.join(s_path, "base")
        if not os.path.exists(src_base):
            continue
        dst_base = os.path.join(base_dir, style_slug)
        os.makedirs(dst_base, exist_ok=True)
        
        files = os.listdir(src_base)
        for role in ["male", "female", "teen", "kid"]:
            matched = None
            for f in files:
                if not f.endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    continue
                f_lower = f.lower()
                if role == "male":
                    if re.search(r'(?<!fe)male', f_lower):
                        matched = f
                        break
                elif role == "female":
                    if "female" in f_lower:
                        matched = f
                        break
                elif role in f_lower:
                    matched = f
                    break
            if matched:
                src_file = os.path.join(src_base, matched)
                dst_file = os.path.join(dst_base, f"base_{role}.png")
                try:
                    shutil.copy2(src_file, dst_file)
                except Exception:
                    pass


# ============================================================================
# 6. STILIAUS IŠTRYNIMAS
# ============================================================================
@router.delete("/{style_slug}")
async def delete_style(style_slug: str):
    """Ištrina vartotojo sukurtą stilių (apsaugoti gamykliniai stiliai neleidžiami trinti)."""
    if style_slug in PROTECTED_STYLES:
        raise HTTPException(status_code=403, detail="Gamyklinių sistemos stilių trinti negalima.")
        
    style_path = os.path.join(PROMPTS_DIR, style_slug)
    if not os.path.exists(style_path):
        raise HTTPException(status_code=404, detail="Stilius nerastas.")
        
    try:
        shutil.rmtree(style_path)
        return {"status": "success", "message": f"Stilius '{style_slug}' pašalintas."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 7. VIDEO & YOUTUBE STILIAUS IŠTRAUKIMAS BEI VISION ANALIZĖ
# ============================================================================

def _prune_old_video_ingest_dirs(vault_dir: str, keep_latest: int = 2):
    """Išvalo senas video ingest sesijas iš Vault katalogo, paliekant tik 2 naujausias, bet NIEKADA neištrina aktyvios sesijos."""
    try:
        if not os.path.exists(vault_dir):
            return
            
        # Patikriname aktyvios sesijos aplanką, kad jo neištrintume
        active_dir_norm = None
        if os.path.exists(LAST_VIDEO_SESSION_FILE):
            try:
                with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                    s_data = json.load(f)
                    sid = s_data.get("session_id")
                    if sid:
                        active_dir_norm = os.path.normpath(os.path.join(vault_dir, f"video_ingest_{sid}"))
            except Exception:
                pass

        entries = []
        for d in os.listdir(vault_dir):
            if d.startswith("video_ingest_"):
                full_p = os.path.join(vault_dir, d)
                if os.path.isdir(full_p):
                    entries.append((os.path.getmtime(full_p), full_p))
        entries.sort(key=lambda x: x[0], reverse=True)
        for _, old_p in entries[keep_latest:]:
            if active_dir_norm and os.path.normpath(old_p) == active_dir_norm:
                continue
            shutil.rmtree(old_p, ignore_errors=True)
    except Exception as e:
        print(f"[Prune Warning]: {e}")


def _download_youtube_video(url: str, output_dir: str) -> str:
    """Atsisiunčia lengvą YouTube video versiją analizei (video-only srautas be garso)."""
    import yt_dlp
    os.makedirs(output_dir, exist_ok=True)
    out_tmpl = os.path.join(output_dir, "yt_video_%(id)s.%(ext)s")

    # Baziniai nustatymai, apeinantys YouTube 403 Forbidden ir bot apsaugas
    base_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
    }

    # Daugiapakopė atsisiuntimo strategija: jei YouTube blokuoja vieną klientą/formatą su 403, bandoma kita
    attempts = [
        {
            'format': 'bestvideo[height<=480][ext=mp4]/bestvideo[height<=720][ext=mp4]/best[height<=480]/best',
            'extractor_args': {'youtube': {'player_client': ['android', 'ios', 'web']}},
        },
        {
            'format': 'best[height<=720]/bestvideo[height<=720]+bestaudio/best',
            'extractor_args': {'youtube': {'player_client': ['tv_embedded', 'mweb', 'android']}},
        },
        {
            'format': 'best[height<=480]/best[height<=720]/best',
            'extractor_args': {'youtube': {'player_client': ['web']}},
        }
    ]

    last_error = None
    for idx, att in enumerate(attempts):
        ydl_opts = {
            'format': att['format'],
            'outtmpl': out_tmpl,
            'quiet': True,
            'no_warnings': True,
            'max_filesize': 80 * 1024 * 1024,
            'cachedir': False,
            'retries': 4,
            'fragment_retries': 4,
            'extractor_args': att['extractor_args'],
            'http_headers': base_headers,
            'js_runtimes': {'node': {}}
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                raw_fn = ydl.prepare_filename(info)
                if os.path.exists(raw_fn):
                    return raw_fn
                base, _ = os.path.splitext(raw_fn)
                for ext in [".mp4", ".mkv", ".webm"]:
                    if os.path.exists(base + ext):
                        return base + ext
                if os.path.exists(raw_fn):
                    return raw_fn
        except Exception as e:
            last_error = e
            print(f"[YouTube Ingest] Bandymas {idx+1}/{len(attempts)} nepavyko ({e}), bandoma alternatyvi strategija...")

    err_str = str(last_error) if last_error else "Nežinoma klaida"
    if "403" in err_str or "Forbidden" in err_str:
        raise ValueError(
            f"YouTube CDN laikinai apribojo šio video srautą (HTTP 403 Forbidden). "
            f"Tai nutinka, kai YouTube taiko botų ar per dažnų užklausų ribojimus. "
            f"Sprendimas: pabandykite kitą video, palaukite kelias minutes, arba paprasčiausiai įkelkite video failą (MP4) tiesiai iš kompiuterio į SceneUI."
        )
    raise ValueError(f"Nepavyko atsisiųsti YouTube video: {err_str}")


def _extract_and_rank_frames(video_path: str, output_dir: str, max_frames: int = 100):
    """
    Nuskaito video per OpenCV, atrenka geriausius personažų kadrus per visą video trukmę:
    - Atpažįsta tiek tikrus veidus, tiek 2D/animacijos/stick-figure herojus.
    - Svertinis centrinis pastebimumas (saliency) atmeta minias ir triukšmingus fonus.
    - Paskirsto kadrus tolygiai per visą vaizdo įrašo laiką (nuo pradžios iki pabaigos).
    """
    import cv2
    import numpy as np
    os.makedirs(output_dir, exist_ok=True)
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Nepavyko atidaryti video failo.")
        
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    duration_sec = total_frames / fps if fps > 0 else 0
    
    # Tikslus žingsnis, kad paimtume pakankamai kandidatų (250-400) per visą video
    target_samples = max(max_frames * 2, 250)
    if total_frames > target_samples:
        step = max(1, int(total_frames / target_samples))
    elif duration_sec <= 30:
        step = max(1, int(fps * 0.3))
    elif duration_sec <= 120:
        step = max(1, int(fps * 0.6))
    else:
        step = max(1, int(fps * 1.0))
        
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    profile_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_profileface.xml')
    upper_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_upperbody.xml')
    full_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_fullbody.xml')
    
    candidates = []
    frame_idx = 0
    
    while cap.isOpened():
        if frame_idx % step != 0:
            if not cap.grab():
                break
            frame_idx += 1
            continue
            
        ret, frame = cap.read()
        if not ret:
            break
            
        h, w, _ = frame.shape
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(gray.mean())
        
        # Atmetame tamsius arba visiškai baltus/tuščius kadrus
        if 18 <= mean_brightness <= 242:
            sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            
            # Canny kontūrai centrinei ir kraštinei analizei
            edges = cv2.Canny(gray, 50, 150)
            
            # Centrinė zona (vidurinis 70% langas)
            ch1, ch2 = int(0.15 * h), int(0.85 * h)
            cw1, cw2 = int(0.15 * w), int(0.85 * w)
            center_edges = np.count_nonzero(edges[ch1:ch2, cw1:cw2]) / float(max(1, (ch2 - ch1) * (cw2 - cw1)))
            
            # Kraštinė zona (išoriniai 12%)
            border_mask = np.ones((h, w), dtype=bool)
            border_mask[int(0.12 * h):int(0.88 * h), int(0.12 * w):int(0.88 * w)] = False
            border_edges = np.count_nonzero(edges[border_mask]) / float(max(1, np.count_nonzero(border_mask)))
            
            # Centrinio pastebimumo santykis
            saliency_ratio = center_edges / max(0.005, border_edges)
            
            # Vertikalių žmogaus formos kontūrų paieška centre (stick figures, 2D herojai)
            center_sub = edges[int(0.1 * h):int(0.9 * h), int(0.15 * w):int(0.85 * w)]
            contours, _ = cv2.findContours(center_sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            tall_contours = 0
            for cnt in contours:
                _, _, cw_box, ch_box = cv2.boundingRect(cnt)
                if ch_box > 0.18 * h and (ch_box / float(max(1, cw_box))) >= 1.2:
                    tall_contours += 1
                    
            # OpenCV kaskados (optimizuota: atliekame ant sumažinto 480px vaizdo, kad veiktų 40x greičiau)
            scale_w = 480
            scale_f = scale_w / float(max(1, w))
            small_h = int(h * scale_f)
            small_gray = cv2.resize(gray, (scale_w, small_h))
            
            f_faces = len(face_cascade.detectMultiScale(small_gray, 1.15, 3, minSize=(max(16, int(30 * scale_f)), max(16, int(30 * scale_f)))))
            p_faces = len(profile_cascade.detectMultiScale(small_gray, 1.15, 3, minSize=(max(16, int(30 * scale_f)), max(16, int(30 * scale_f)))))
            u_bodies = len(upper_cascade.detectMultiScale(small_gray, 1.15, 3, minSize=(max(24, int(50 * scale_f)), max(24, int(50 * scale_f)))))
            b_bodies = len(full_cascade.detectMultiScale(small_gray, 1.15, 3, minSize=(max(24, int(50 * scale_f)), max(48, int(100 * scale_f)))))
            total_detections = f_faces + p_faces + u_bodies + b_bodies
            
            # Minios atmetimas (jei >4 veidų ar kūnų, tai žiūrovų minia, o ne personažas)
            if f_faces > 4 or b_bodies > 4:
                cascade_score = -2000.0
            elif 1 <= total_detections <= 6:
                cascade_score = 400.0 * min(total_detections, 4)
            else:
                cascade_score = 0.0
                
            # Triukšmingo/perkrauto fono bauda
            border_penalty = (border_edges - 0.06) * 15000.0 if border_edges > 0.06 else 0.0
            
            tall_bonus = min(tall_contours, 4) * 200.0
            effective_sharpness = min(sharpness, 1000.0)
            saliency_bonus = min(saliency_ratio, 8.0) * 150.0
            
            total_score = (effective_sharpness * 0.3) + saliency_bonus + tall_bonus + cascade_score - border_penalty
            
            timestamp = round(frame_idx / fps, 2)
            candidates.append({
                "frame_idx": frame_idx,
                "timestamp": timestamp,
                "sharpness": round(sharpness, 2),
                "has_face": (f_faces > 0 or p_faces > 0),
                "face_count": f_faces + p_faces,
                "tall_contours": tall_contours,
                "saliency_ratio": round(saliency_ratio, 2),
                "score": round(total_score, 2),
                "frame": frame
            })
        frame_idx += 1
        
    cap.release()
    
    if not candidates:
        raise ValueError("Video faile nepavyko rasti tinkamų kadrų.")
        
    candidates.sort(key=lambda c: c["score"], reverse=True)
    
    # 1. Paskirstome kadrus tolygiai per visą video trukmę pagal ideal_gap
    ideal_gap = max(0.5, round(duration_sec / max(1, max_frames * 1.1), 1))
    selected = []
    used_timestamps = []
    
    for c in candidates:
        if any(abs(c["timestamp"] - t) < ideal_gap for t in used_timestamps):
            continue
        selected.append(c)
        used_timestamps.append(c["timestamp"])
        if len(selected) >= max_frames:
            break
            
    # 2. Užpildome likusias vietas iki max_frames aštriausiais kadrais su minimaliu 0.35s tarpu
    if len(selected) < min(max_frames, len(candidates)):
        for c in candidates:
            if c not in selected and not any(abs(c["timestamp"] - t) < 0.35 for t in used_timestamps):
                selected.append(c)
                used_timestamps.append(c["timestamp"])
                if len(selected) >= max_frames:
                    break
                    
    selected.sort(key=lambda c: c["timestamp"])
    
    result_frames = []
    for idx, c in enumerate(selected):
        fname = f"frame_{idx + 1:03d}_{c['timestamp']}s.jpg"
        full_dest = os.path.join(output_dir, fname)
        cv2.imwrite(full_dest, c["frame"], [cv2.IMWRITE_JPEG_QUALITY, 90])
        
        result_frames.append({
            "filename": fname,
            "timestamp": c["timestamp"],
            "score": c["score"],
            "has_face": c["has_face"],
            "face_count": c["face_count"],
            "sharpness": c["sharpness"],
            "saliency": c.get("saliency_ratio", 1.0),
            "full_path": full_dest
        })
        
    return result_frames


async def _analyze_frames_with_ollama(frames_meta: list, vision_model: str = "qwen2.5vl:7b"):
    """
    Išsiunčia reprezentatyvius kadrus į Ollama Vision modelį ir sugeneruoja pažangų Style DNA.
    Grąžina (style_dna, best_frame_dict).
    """
    import base64
    import io
    from PIL import Image
    
    # 1. Randame aukščiausią balą surinkusį kadrą
    sorted_by_score = sorted(frames_meta, key=lambda f: f["score"], reverse=True)
    primary_frame = sorted_by_score[0]
    
    # 2. Atrenkame iki 3 reprezentatyvių kadrų iš skirtingo laiko tarpo analizei
    selected_for_ai = [primary_frame]
    for f in sorted_by_score[1:]:
        if len(selected_for_ai) >= 3:
            break
        if all(abs(f["timestamp"] - sel["timestamp"]) >= 2.5 for sel in selected_for_ai):
            selected_for_ai.append(f)
            
    # Užkoduojame sumažintas miniatiūras (320x320), kad neviršytų Ollama konteksto lango
    b64_images = []
    for f in selected_for_ai:
        try:
            im = Image.open(f["full_path"])
            im.thumbnail((320, 320))
            buf = io.BytesIO()
            im.save(buf, format='JPEG', quality=80)
            b64_images.append(base64.b64encode(buf.getvalue()).decode('utf-8'))
        except Exception as e:
            print(f"[Vision Ingest] Klaida koduojant kadrą {f['filename']}: {e}")
            
    system_prompt = """You are an expert Character Art Director and Style Analyzer for an animation and gaming studio.
Analyze the provided video frames (Frame 1, Frame 2, Frame 3) deconstructing the visual style.
1. Identify the animation medium and art style (e.g. minimalist 2D stick figure cartoon, 3D CGI animation, hand-drawn anime, claymation, etc.).
2. Pick the BEST frame index (1 to 3) that shows the main character most clearly and cleanly in full body or half body.
3. Extract 1-2 key distinctive art style traits (e.g. for stick figure: 'thin line arms and legs'; for 3D: 'smooth 3D CGI surfaces, rounded features'; for anime: 'clean 2D anime lineart'). If the style has no weird limbs/proportions, traits can be empty or general like 'clean stylized lineart'. DO NOT hallucinate traits not present in the frames.
4. Generate Style DNA with prompts following this exact proven formula:
   "make only one [character role] character in that exact style, neutral gray clothes, [hair/features], [style_traits], in the same art style"
   Notice: If [style_traits] is empty or not distinctive, omit it so it becomes:
   "make only one [character role] character in that exact style, neutral gray clothes, [hair/features], in the same art style"

CRITICAL PROMPT SYNTAX:
- Always start with "make only one [role] character in that exact style..." to prevent crowds or multiple characters.
- In prompt_male use: "make only one adult man character in that exact style, neutral gray clothes, short black hair, [style_traits], in the same art style"
- In prompt_female use: "make only one woman character in that exact style, neutral gray clothes, brown hair, [style_traits], in the same art style"
- In prompt_teen use: "make only one teenager character in that exact style, neutral gray clothes, messy hair, [style_traits], in the same art style"
- In prompt_kid use: "make only one child character in that exact style, neutral gray clothes, neat hair, [style_traits], in the same art style"
- In prompt_scene use: "make only one scenic background environment in that exact style, empty scene, no people, in the same art style"

Output strictly valid JSON conforming to this schema:
{
  "displayName": "Emoji + Short Descriptive Title",
  "slug": "short_snake_case_id",
  "best_frame_index": 1,
  "art_style_description": "Precise 1-sentence description of the visual medium and style",
  "style_traits": "1-2 key distinctive traits (e.g. 'thin line arms and legs' or 'soft 3D CGI surfaces')",
  "scene_suffix": "Complete visual formula for background scenes: medium, lighting, shadows, colors, textures, cinematic render look.",
  "scene_negative": "blurry, low quality, deformed, extra limbs, text, watermark, bad lighting, crowd, multiple people",
  "character_negative": "blurry, low quality, crowd, multiple people, extra characters, photography, realistic human skin",
  "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
  "character_prompt_suffix": ", in the same art style",
  "background_extras_prompt": "(stylized background extras in the same art style)",
  "prompt_male": "make adult man character in that art style, neutral gray clothes, short black man hair, in the same art style, [style_traits]",
  "prompt_female": "make woman character in that art style, neutral gray clothes, brown woman hair, in the same art style, [style_traits]",
  "prompt_teen": "make teenager character in that art style, neutral gray clothes, messy teen hair, in the same art style, [style_traits]",
  "prompt_kid": "make child character in that art style, neutral gray clothes, neat child hair, in the same art style, [style_traits]",
  "prompt_scene": "make only one scenic background environment in that exact style, empty scene, no people, in the same art style"
}"""

    user_prompt = "Deconstruct the visual art style and characters from these frames into the Style DNA JSON format."

    style_dna = None
    best_frame = primary_frame
    
    try:
        payload = {
            "model": vision_model or "qwen2.5vl:7b",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt, "images": b64_images}
            ],
            "stream": False,
            "format": "json",
            "options": {
                "num_ctx": 8192,
                "temperature": 0.2
            }
        }
        async with aiohttp.ClientSession() as session:
            async with session.post("http://localhost:11434/api/chat", json=payload, timeout=90) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    content = res_json.get("message", {}).get("content", "{}")
                    parsed = json.loads(content)
                    if parsed and isinstance(parsed, dict) and "scene_suffix" in parsed:
                        style_dna = parsed
                        # Jei Vision AI nurodė geresnį kadrą, atnaujiname etaloną
                        best_idx = parsed.get("best_frame_index")
                        if isinstance(best_idx, int) and 1 <= best_idx <= len(selected_for_ai):
                            best_frame = selected_for_ai[best_idx - 1]
    except Exception as err:
        print(f"[Vision Ingest] Ollama klaida: {err}")

    if not style_dna:
        style_dna = {
            "displayName": "🎬 Video Cinematic Style",
            "slug": "video_extracted_style",
            "art_style_description": "Cinematic animation style extracted from video reference frames.",
            "style_traits": "stylized character proportions, clean lineart",
            "scene_suffix": "Cinematic animation art style, cohesive lighting and color grading, high detail, clean aesthetic.",
            "scene_negative": "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, signature, crowd, multiple people",
            "character_negative": "blurry, low quality, crowd, multiple people, extra characters, photography, realistic human skin",
            "character_prompt_prefix": "make only one character in that exact style, neutral gray clothes, ",
            "character_prompt_suffix": ", in the same art style",
            "background_extras_prompt": "(with background extras matching the video aesthetic)",
            "prompt_male": "make adult man character in that art style, neutral gray clothes, short black man hair, in the same art style, stylized character proportions",
            "prompt_female": "make woman character in that art style, neutral gray clothes, brown woman hair, in the same art style, stylized character proportions",
            "prompt_teen": "make teenager character in that art style, neutral gray clothes, messy teen hair, in the same art style, stylized character proportions",
            "prompt_kid": "make child character in that art style, neutral gray clothes, neat child hair, in the same art style, stylized character proportions",
            "prompt_scene": "make only one scenic background environment in that exact style, empty scene, no people, in the same art style"
        }

    # Saugiklis: jei LLM paliko [style_traits] arba [art_traits] šabloną, pakeičiame jį tikrais požymiais
    raw_traits = (style_dna.get("style_traits") or style_dna.get("art_traits") or "").strip()
    traits_replacement = f", {raw_traits}" if raw_traits else ""
    for key in ["prompt_male", "prompt_female", "prompt_teen", "prompt_kid"]:
        if key in style_dna and isinstance(style_dna[key], str):
            val = (style_dna[key]
                   .replace(", [style_traits]", traits_replacement)
                   .replace("[style_traits]", raw_traits)
                   .replace(", [art_traits]", traits_replacement)
                   .replace("[art_traits]", raw_traits)
                   .replace(", [traits]", traits_replacement)
                   .replace("[traits]", raw_traits))
            val = re.sub(r',\s*,', ',', val)
            val = re.sub(r'\s+', ' ', val).strip()
            style_dna[key] = val

    style_dna["slug"] = _safe_slug(style_dna.get("slug", "video_style"))
    return style_dna, best_frame


@router.post("/video_ingest")
async def ingest_video_for_style(
    youtube_url: Optional[str] = Form(None),
    video_file: Optional[UploadFile] = File(None),
    vision_model: str = Form("qwen2.5vl:7b"),
    max_frames: int = Form(100)
):
    """
    Priima YouTube nuorodą ARBA įkeltą video failą, ištraukia ryškius kadrus su herojais,
    išanalizuoja stilių su Vision AI (Ollama qwen2.5vl) ir paruošia Style DNA bei etaloninį kadrą.
    Automatiškai išvalo didelius video failus ir senas sesijas, kad neterštų disko vietos.
    """
    import uuid
    session_id = f"v_{uuid.uuid4().hex[:10]}"
    temp_dir = os.path.join(DATA_DIR, "temp_video_ingest", session_id)
    os.makedirs(temp_dir, exist_ok=True)
    
    # 0. Išvalome senas video ingest sesijas iš Vault (išsaugome tik 2 naujausias)
    _prune_old_video_ingest_dirs(VAULT_DIR, keep_latest=2)
    
    video_path = None
    
    try:
        # 1. Gauname video failą
        if video_file and video_file.filename:
            safe_fn = f"upload_{session_id}_{video_file.filename}"
            video_path = os.path.join(temp_dir, safe_fn)
            with open(video_path, "wb") as buf:
                shutil.copyfileobj(video_file.file, buf)
        elif youtube_url and youtube_url.strip():
            url = youtube_url.strip()
            video_path = _download_youtube_video(url, temp_dir)
        else:
            raise HTTPException(status_code=400, detail="Pateikite YouTube nuorodą arba įkelkite video failą.")
            
        if not video_path or not os.path.exists(video_path):
            raise HTTPException(status_code=400, detail="Nepavyko gauti video failo.")
            
        # 2. Ištraukiame kadrus į Vault katalogą, kad jie iškart būtų pasiekiami per HTTP
        frames_dir = os.path.join(VAULT_DIR, f"video_ingest_{session_id}")
        frames_meta = _extract_and_rank_frames(video_path, frames_dir, max_frames=max_frames)
        
        # 2.1. IŠKART IŠTRINAME DIDELĮ VIDEO FAILĄ (kad neužimtų gigabaitų vietos diske)
        try:
            if video_path and os.path.exists(video_path):
                os.remove(video_path)
                video_path = None
        except Exception as del_err:
            print(f"[Video Ingest] Įspėjimas trinant video failą: {del_err}")
        
        # 3. Vision AI analizė
        style_dna, best_frame = await _analyze_frames_with_ollama(frames_meta, vision_model=vision_model)
        
        # 4. Nukopijuojame geriausią kadrą kaip pagrindinį Vault etaloną su unikaliu vardu
        slug = style_dna["slug"]
        best_stem = os.path.splitext(best_frame["filename"])[0]
        unique_tag = f"{int(time.time()) % 100000}"
        vault_ref_name = f"{slug}_ref_{best_stem}_{unique_tag}.png"
        vault_ref_path = os.path.join(VAULT_DIR, vault_ref_name)
        shutil.copy2(best_frame["full_path"], vault_ref_path)
        
        comfy_input_dir = "d:/Documents/ComfyUI/input"
        if os.path.exists(comfy_input_dir):
            try:
                shutil.copy2(best_frame["full_path"], os.path.join(comfy_input_dir, vault_ref_name))
            except Exception:
                pass
        
        # Paruošiame URL sąrašą naršyklei
        frames_response = []
        for f in frames_meta:
            frames_response.append({
                "filename": f["filename"],
                "url": f"/vault/video_ingest_{session_id}/{f['filename']}",
                "timestamp": f["timestamp"],
                "has_face": f["has_face"],
                "face_count": f["face_count"],
                "score": f["score"],
                "is_best": f["filename"] == best_frame["filename"]
            })
            
        session_data = {
            "status": "success",
            "session_id": session_id,
            "youtube_url": youtube_url or "",
            "frames": frames_response,
            "selected_frame": {
                "filename": best_frame["filename"],
                "url": f"/vault/video_ingest_{session_id}/{best_frame['filename']}",
                "vault_ref": vault_ref_name
            },
            "style_dna": style_dna,
            "images": {
                "male": "",
                "female": "",
                "teen": "",
                "kid": "",
                "scene": ""
            },
            "updated_at": time.time()
        }
        
        try:
            with open(LAST_VIDEO_SESSION_FILE, "w", encoding="utf-8") as f:
                json.dump(session_data, f, ensure_ascii=False, indent=2)
            print(f"[Video Ingest] Sesija {session_id} sėkmingai išsaugota į {LAST_VIDEO_SESSION_FILE}")
        except Exception as sv_err:
            print(f"[Video Ingest] Klaida išsaugant sesiją: {sv_err}")

        return session_data
        
    except Exception as e:
        print(f"[Video Ingest Error]: {e}")
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
    finally:
        # Išvalome visą laikiną aplanką
        try:
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass


@router.post("/select_reference_frame")
async def select_reference_frame(request: Request):
    """
    Leidžia vartotojui rankiniu būdu pasirinkti kitą kadrą iš galerijos kaip Image 1 (Ref A).
    """
    data = await request.json()
    slug = _safe_slug(data.get("slug", "video_style"))
    frame_url = data.get("url", "")
    
    if not frame_url:
        raise HTTPException(status_code=400, detail="Nenurodytas kadro adresas.")
        
    # /vault/video_ingest_xxx/frame.jpg -> VAULT_DIR/video_ingest_xxx/frame.jpg
    clean_path = frame_url.replace("/vault/", "").lstrip("/\\")
    full_src = os.path.join(VAULT_DIR, clean_path)
    
    if not os.path.exists(full_src):
        raise HTTPException(status_code=404, detail="Kadro failas nerastas diske.")
        
    frame_stem = os.path.splitext(os.path.basename(full_src))[0]
    unique_tag = f"{int(time.time()) % 100000}"
    vault_ref_name = f"{slug}_ref_{frame_stem}_{unique_tag}.png"
    vault_ref_path = os.path.join(VAULT_DIR, vault_ref_name)
    shutil.copy2(full_src, vault_ref_path)

    # Taip pat nukopijuojame tiesiai į vietinį ComfyUI/input/ aplanką
    comfy_input_dir = "d:/Documents/ComfyUI/input"
    if os.path.exists(comfy_input_dir):
        try:
            shutil.copy2(full_src, os.path.join(comfy_input_dir, vault_ref_name))
        except Exception as c_err:
            print(f"[Select Ref] Įspėjimas kopijuojant į ComfyUI input: {c_err}")

    # Išvalome senus šio stiliaus laikinus referencinius failus iš vault ir ComfyUI input
    for target_dir in [VAULT_DIR, comfy_input_dir]:
        if os.path.exists(target_dir):
            for old_fn in os.listdir(target_dir):
                if old_fn.startswith(f"{slug}_ref_") and old_fn.endswith(".png") and old_fn != vault_ref_name:
                    try:
                        os.remove(os.path.join(target_dir, old_fn))
                    except Exception:
                        pass
    
    # Atnaujiname ir last_video_session.json
    if os.path.exists(LAST_VIDEO_SESSION_FILE):
        try:
            with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                sess = json.load(f)
            sess["selected_frame"] = {
                "filename": os.path.basename(full_src),
                "url": frame_url,
                "vault_ref": vault_ref_name
            }
            for fr in sess.get("frames", []):
                fr["is_best"] = (fr.get("filename") == os.path.basename(full_src))
            sess["updated_at"] = time.time()
            with open(LAST_VIDEO_SESSION_FILE, "w", encoding="utf-8") as f:
                json.dump(sess, f, ensure_ascii=False, indent=2)
        except Exception as err:
            print(f"[Select Ref] Įspėjimas atnaujinant sesijos failą: {err}")

    return {
        "status": "success",
        "vault_ref": vault_ref_name,
        "url": f"/vault/{vault_ref_name}",
        "filename": os.path.basename(full_src)
    }


@router.post("/set_master_character")
async def set_master_character(request: Request):
    """
    Nustato vieną iš 4 sugeneruotų veikėjų (pvz. vyras) kaip Master stiliaus etaloną kitiems veikėjams.
    Nukopijuoja atvaizdą į ComfyUI input ir atnaujina sesijos failą.
    """
    data = await request.json()
    role = data.get("role", "male")
    image_url = data.get("image_url", "")
    slug = _safe_slug(data.get("slug", "video_style"))

    if not image_url:
        raise HTTPException(status_code=400, detail="Nenurodytas veikėjo atvaizdas.")

    clean_path = image_url.replace("/vault/", "").replace("/output/", "").lstrip("/\\")
    full_src = os.path.join(VAULT_DIR, clean_path)

    if not os.path.exists(full_src):
        raise HTTPException(status_code=404, detail="Veikėjo atvaizdo failas nerastas diske.")

    fn_stem = os.path.splitext(os.path.basename(full_src))[0]
    master_ref_name = f"{slug}_master_{role}_{fn_stem[:25]}.png"
    master_ref_path = os.path.join(VAULT_DIR, master_ref_name)
    shutil.copy2(full_src, master_ref_path)

    comfy_input_dir = "d:/Documents/ComfyUI/input"
    if os.path.exists(comfy_input_dir):
        try:
            shutil.copy2(full_src, os.path.join(comfy_input_dir, master_ref_name))
            shutil.copy2(full_src, os.path.join(comfy_input_dir, os.path.basename(full_src)))
        except Exception as e:
            print(f"[Master Seed] ComfyUI copy error: {e}")

    # Atnaujiname last_video_session.json
    if os.path.exists(LAST_VIDEO_SESSION_FILE):
        try:
            with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                sess = json.load(f)
            sess["master_character"] = {
                "role": role,
                "url": image_url,
                "filename": os.path.basename(full_src),
                "master_ref": master_ref_name
            }
            sess["updated_at"] = time.time()
            with open(LAST_VIDEO_SESSION_FILE, "w", encoding="utf-8") as f:
                json.dump(sess, f, ensure_ascii=False, indent=2)
        except Exception as err:
            print(f"[Master Seed] Session update error: {err}")

    return {
        "status": "success",
        "role": role,
        "filename": os.path.basename(full_src),
        "master_ref": master_ref_name,
        "url": f"/vault/{master_ref_name}"
    }


@router.post("/adapt_master_prompts")
async def adapt_master_prompts(request: Request):
    """
    Pritaikoma patikrinta auksinė formulė personažų klonavimui iš etalono (Master arba Video kadro):
    make {role} character in that art style, neutral gray clothes, {hair}, in the same art style, {style_traits}
    Ištraukia stiliaus požymius (pvz. 'thin line arms and legs, white face') naudodamas greitą regex ir vietinį LLM (Ollama),
    ir suderina promptus visiems 4 archetipams (Vyras, Moteris, Paauglys, Vaikas).
    """
    data = await request.json()
    source_role = data.get("source_role") or data.get("master_role") or "female"
    source_prompt = data.get("source_prompt") or data.get("master_prompt") or ""
    current_prompts = data.get("current_prompts", {})
    style_traits = (data.get("style_traits") or "").strip()
    use_llm = data.get("use_llm", True)

    candidate_text = source_prompt or current_prompts.get(source_role) or current_prompts.get("female") or current_prompts.get("male") or ""
    extracted_traits = style_traits

    # 1. Regex stiliaus požymių ištraukimas (ypač greitas < 1ms)
    if not extracted_traits and candidate_text:
        # Pirmiausia tikriname po „in the same art style,“ arba „in that art style,“
        m1 = re.search(r'in the same art style[,\s]+(.*?)(?:$|\n)', candidate_text, re.IGNORECASE)
        if m1 and m1.group(1).strip():
            extracted_traits = m1.group(1).strip().rstrip('.,;')
        else:
            # Tikriname prieš „in the same art style“: pvz. „...hair, [traits], in the same art style“
            m2 = re.search(r'(?:hair|clothes)[,\s]+(.*?)[,\s]+in the (?:same|exact) art style', candidate_text, re.IGNORECASE)
            if m2 and m2.group(1).strip():
                extracted_traits = m2.group(1).strip().rstrip('.,;')

    # 2. Vietinis LLM (Ollama) požymių ištraukimui, jei regex nerado arba tekstas sudėtingas
    if not extracted_traits and use_llm and candidate_text:
        for model_name in ["dolphin-llama3:latest", "gemma4:12b", "qwen2.5vl:7b"]:
            try:
                system_prompt = (
                    "You are an AI assistant specialized in image generation prompts.\n"
                    "Extract ONLY the distinctive visual art style traits (e.g. 'thin line arms and legs, white face' or 'Pixar 3D animated surfaces, soft lighting').\n"
                    "Do NOT include gender, age, clothing ('neutral gray clothes'), or hair descriptions.\n"
                    "Return ONLY JSON format: {\"style_traits\": \"...\"}"
                )
                ollama_payload = {
                    "model": model_name,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Extract art style traits from this prompt: {candidate_text}"}
                    ],
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.1, "num_ctx": 2048}
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post("http://localhost:11434/api/chat", json=ollama_payload, timeout=5) as resp:
                        if resp.status == 200:
                            res_json = await resp.json()
                            content = res_json.get("message", {}).get("content", "{}")
                            parsed = json.loads(content)
                            raw_t = parsed.get("style_traits", "")
                            if isinstance(raw_t, list):
                                raw_t = ", ".join([str(x) for x in raw_t if "clothes" not in str(x).lower() and "hair" not in str(x).lower()])
                            if raw_t and isinstance(raw_t, str) and raw_t.strip():
                                extracted_traits = raw_t.strip().rstrip('.,;')
                                break
            except Exception:
                continue

    # 3. Tikriname sesijos failo style_dna jei vis dar tuščia
    if not extracted_traits and os.path.exists(LAST_VIDEO_SESSION_FILE):
        try:
            with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                sess = json.load(f)
                dna = sess.get("style_dna", {})
                extracted_traits = (dna.get("style_traits") or dna.get("art_traits") or "").strip()
        except Exception:
            pass

    # Išvalome stiliaus požymius nuo nereikalingų prefiksų
    clean_traits = re.sub(r'^(?:in the same art style|neutral gray clothes)[,\s]*', '', extracted_traits, flags=re.IGNORECASE).strip().rstrip('.,;')
    traits_suffix = f", {clean_traits}" if clean_traits else ""

    # 4. Sukuriame suderintus promptus pagal patikrintą formulę
    adapted_prompts = {
        "male": f"make adult man character in that art style, neutral gray clothes, short black man hair, in the same art style{traits_suffix}",
        "female": f"make woman character in that art style, neutral gray clothes, brown woman hair, in the same art style{traits_suffix}",
        "teen": f"make teenager character in that art style, neutral gray clothes, messy teen hair, in the same art style{traits_suffix}",
        "kid": f"make child character in that art style, neutral gray clothes, neat child hair, in the same art style{traits_suffix}"
    }

    # Atnaujiname ir sesijos failą
    if os.path.exists(LAST_VIDEO_SESSION_FILE):
        try:
            with open(LAST_VIDEO_SESSION_FILE, "r", encoding="utf-8") as f:
                sess = json.load(f)
            if "style_dna" not in sess:
                sess["style_dna"] = {}
            for r, pr in adapted_prompts.items():
                sess["style_dna"][f"prompt_{r}"] = pr
            if clean_traits:
                sess["style_dna"]["style_traits"] = clean_traits
            sess["updated_at"] = time.time()
            with open(LAST_VIDEO_SESSION_FILE, "w", encoding="utf-8") as f:
                json.dump(sess, f, ensure_ascii=False, indent=2)
        except Exception as err:
            print(f"[Adapt Prompts] Session update error: {err}")

    return {
        "status": "success",
        "style_traits": clean_traits,
        "source_role": source_role,
        "prompts": adapted_prompts
    }


