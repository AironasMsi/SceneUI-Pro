import os

import json

import zipfile

import io

import shutil

import uuid

import sqlite3

import time

import subprocess

from fastapi import APIRouter, Request, UploadFile, File

from fastapi.responses import JSONResponse, Response, StreamingResponse



# Importuojame nustatymus iš centrinio konfigūracijos failo

from config import VAULT_DIR, PROJECTS_DIR, PROMPTS_DIR, DB_PATH, FRONTEND_DIR, DATA_DIR

from ws_manager import broadcast_system_state




def sync_demo_assets():
    demo_assets_dir = os.path.join(DATA_DIR, "demo_assets")
    if not os.path.exists(demo_assets_dir):
        os.makedirs(demo_assets_dir, exist_ok=True)
    
    src_dirs = [demo_assets_dir, r'D:\Downloads\11 03 - 04_18', r'D:\Downloads\New folder (6)']
    audio_dir = os.path.join(DATA_DIR, "audio")
    renders_dir = os.path.join(DATA_DIR, "renders")
    os.makedirs(audio_dir, exist_ok=True)
    os.makedirs(renders_dir, exist_ok=True)
    os.makedirs(VAULT_DIR, exist_ok=True)

    for sdir in src_dirs:
        if os.path.exists(sdir):
            for filename in os.listdir(sdir):
                sp = os.path.join(sdir, filename)
                if os.path.isfile(sp):
                    da_p = os.path.join(demo_assets_dir, filename)
                    if not os.path.exists(da_p):
                        try: shutil.copy2(sp, da_p)
                        except: pass
                    vp = os.path.join(VAULT_DIR, filename)
                    if not os.path.exists(vp):
                        try: shutil.copy2(sp, vp)
                        except: pass
                    if filename.endswith('.wav') or filename.endswith('.mp3'):
                        ap = os.path.join(audio_dir, filename)
                        if not os.path.exists(ap):
                            try: shutil.copy2(sp, ap)
                            except: pass
                    if 'render_' in filename and filename.endswith('.mp4'):
                        rp = os.path.join(renders_dir, filename)
                        if not os.path.exists(rp):
                            try: shutil.copy2(sp, rp)
                            except: pass

# Sync on startup
try:
    sync_demo_assets()
except Exception as _e:
    print("[sync_demo_assets init error]:", _e)

router = APIRouter()



# ============================================================================

# 0. SESIJOS IŠSAUGOJIMAS (Paskutinis aktyvus projektas + kiti nustatymai)

# ============================================================================

SESSION_FILE = os.path.join(DATA_DIR, "session.json")



def _load_session() -> dict:

    try:

        # Fallback to legacy nested path if it exists

        legacy_path = os.path.join(DATA_DIR, "data", "session.json")

        target_path = SESSION_FILE if os.path.exists(SESSION_FILE) else (legacy_path if os.path.exists(legacy_path) else SESSION_FILE)

        if os.path.exists(target_path):

            with open(target_path, "r", encoding="utf-8") as f:

                return json.load(f)

    except Exception:

        pass

    return {}



def _save_session(data: dict):

    os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)

    try:

        existing = _load_session()

        existing.update(data)

        with open(SESSION_FILE, "w", encoding="utf-8") as f:

            json.dump(existing, f, ensure_ascii=False, indent=2)

    except Exception as e:

        print(f"[Session] Klaida išsaugant sesiją: {e}")



@router.get("/api/session")

async def get_session():

    return JSONResponse(content={"status": "success", "session": _load_session()})



@router.post("/api/session")

async def save_session(request: Request):

    data = await request.json()

    _save_session(data)

    return JSONResponse(content={"status": "success"})



# ============================================================================

# 1. PROJEKTŲ PAGRINDINIS VALDYMAS (Save, Load, Delete)

# ============================================================================



@router.get("/api/projects")

async def load_all_projects():

    projects = {}

    if not os.path.exists(PROJECTS_DIR):

        return JSONResponse(content={"status": "success", "projects": {}})

        

    for filename in os.listdir(PROJECTS_DIR):

        if filename.endswith(".json"):

            file_path = os.path.join(PROJECTS_DIR, filename)

            try:

                with open(file_path, "r", encoding="utf-8") as f:

                    proj_data = json.load(f)

                    proj_id = proj_data.get("id", filename.replace(".json", ""))

                    projects[proj_id] = proj_data

            except Exception:

                pass

    return Response(content=json.dumps({"status": "success", "projects": projects}, ensure_ascii=False), media_type="application/json")



@router.post("/api/projects/save")

async def save_project(request: Request):

    data = await request.json()

    project_id = data.get("id")

    if not project_id: 

        return JSONResponse(content={"status": "error", "message": "No project ID"}, status_code=400)

        

    file_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    

    # Merge with existing file: only preserve keys that were omitted in data,

    # but honor explicitly cleared fields (empty arrays, strings, etc.)

    if os.path.exists(file_path):

        try:

            with open(file_path, "r", encoding="utf-8") as f:

                existing = json.load(f)

            

            for key, val in existing.items():

                if key not in data:

                    data[key] = val



            # Apsauga nuo SFX variacijų praradimo: išlaikome iš disko, jei atsiųsti tušti

            for sfx_key in ["sceneSfxById", "sceneSfxVarsById"]:

                if sfx_key in existing and isinstance(existing[sfx_key], dict):

                    if sfx_key not in data or not isinstance(data[sfx_key], dict):

                        data[sfx_key] = existing[sfx_key]

                    else:

                        for k, v in existing[sfx_key].items():

                            if k not in data[sfx_key] or not data[sfx_key][k]:

                                data[sfx_key][k] = v

        except Exception as e:

            print(f"[SaveProject] Merge exception: {e}")

    

    with open(file_path, "w", encoding="utf-8") as f:

        json.dump(data, f, ensure_ascii=False, indent=2)

    return JSONResponse(content={"status": "success"})



@router.post("/api/projects/delete")

async def delete_project(request: Request):

    data = await request.json()

    project_id = data.get("id")

    file_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    if os.path.exists(file_path): 

        os.remove(file_path)

    return JSONResponse(content={"status": "success"})



# ============================================================================

# 2. EKSPORTAS IR IMPORTAS (.sceneui failai)

# ============================================================================



@router.get("/api/projects/export/{project_id}")

async def export_full_project(project_id: str):

    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    if not os.path.exists(proj_path):

        return JSONResponse(content={"status": "error", "message": "Project not found"}, status_code=404)



    memory_file = io.BytesIO()

    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:

        zf.write(proj_path, f"{project_id}.json")

        with open(proj_path, "r", encoding="utf-8") as f: 

            proj_data = json.load(f)

            

        # Surenkame visus susijusius failus iš Vault

        files_to_zip = set()

        for ref in proj_data.get("refs", []): files_to_zip.add(ref)

        

        # Tikriname generacijų rezultatus

        for out in proj_data.get("outputs", []):

            for var in out.get("variations", []):

                url = var.get("url", "")

                if url.startswith("/vault/"): 

                    files_to_zip.add(url.replace("/vault/", ""))

                    

        # Tikriname veikėjų variacijas

        for char_name, char_data in proj_data.get("charRefs", {}).items():

            for var in char_data.get("variations", []):

                url = var.get("url", "")

                if url.startswith("/vault/"): 

                    files_to_zip.add(url.replace("/vault/", ""))



        for filename in files_to_zip:

            local_path = os.path.join(VAULT_DIR, filename)

            if os.path.exists(local_path): 

                zf.write(local_path, f"vault/{filename}")



    memory_file.seek(0)

    safe_name = proj_data.get("name", project_id).replace(" ", "_")

    return StreamingResponse(memory_file, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={safe_name}_backup.sceneui"})



@router.post("/api/projects/import")

async def import_full_project(file: UploadFile = File(...)):

    if not file.filename.endswith(('.zip', '.sceneui')):

        return JSONResponse(content={"status": "error", "message": "Invalid format."}, status_code=400)

    try:

        contents = await file.read()

        zip_file = zipfile.ZipFile(io.BytesIO(contents))

        new_project_id = f"proj_{uuid.uuid4().hex[:8]}"

        imported_name = "Imported Project"

        

        for item in zip_file.namelist():

            if item.endswith(".json") and "/" not in item:

                with zip_file.open(item) as f: 

                    proj_data = json.loads(f.read().decode('utf-8'))

                proj_data["id"] = new_project_id

                old_name = proj_data.get("name", "Project")

                if not old_name.endswith("(Imported)"): 

                    proj_data["name"] = f"{old_name} (Imported)"

                imported_name = proj_data["name"]

                

                new_json_path = os.path.join(PROJECTS_DIR, f"{new_project_id}.json")

                with open(new_json_path, "w", encoding="utf-8") as out_f: 

                    json.dump(proj_data, out_f, ensure_ascii=False, indent=2)

                    

            elif item.startswith("vault/") and not item.endswith("/"):

                filename = item.replace("vault/", "")

                save_path = os.path.join(VAULT_DIR, filename)

                with open(save_path, "wb") as out_f: 

                    out_f.write(zip_file.read(item))

                    

        return JSONResponse(content={"status": "success", "message": f"'{imported_name}' imported!", "project_id": new_project_id})

    except Exception as e:

        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)



# ============================================================================

# 3. VAULT IR PAGALBINIAI ĮRANKIAI

# ============================================================================



@router.post("/api/upload_vault")

async def upload_to_vault(file: UploadFile = File(...)):

    try:

        filename = file.filename.replace(" ", "_")

        

        # PATAISYMAS: Normalizuojame plėtinį (mažosios raidės, jpeg -> jpg) NLE suderinamumui

        base, ext = os.path.splitext(filename)

        ext = ext.lower()

        if ext == ".jpeg":

            ext = ".jpg"

        if not ext:

            ext = ".png"

        safe_filename = f"{base}{ext}"

        

        file_location = os.path.join(VAULT_DIR, safe_filename)

        with open(file_location, "wb+") as file_object:

            shutil.copyfileobj(file.file, file_object)

        return JSONResponse(content={"url": f"/vault/{safe_filename}", "status": "success"})

    except Exception as e:

        return JSONResponse(content={"status": "error", "message": str(e)}, status_code=500)



@router.post("/api/zip")

async def create_zip(request: Request):

    data = await request.json()

    files_to_zip = data.get("files", [])

    zip_name = data.get("name", "SceneUI_Export.zip")

    memory_file = io.BytesIO()

    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:

        for f in files_to_zip:

            filename = f.get("filename", "")

            prefix = f.get("prefix", "img")

            

            # PATAISYMAS: Išvalome URL užklausas ir kelius, kad gautume tikrą failo pavadinimą fone

            filename = filename.split("/")[-1].split("?")[0]

            local_path = os.path.join(VAULT_DIR, filename)

            

            if os.path.exists(local_path):

                _, ext = os.path.splitext(filename)

                ext = ext.replace(".", "").lower()

                if ext == "jpeg": 

                    ext = "jpg"

                if not ext or len(ext) > 4: 

                    ext = "png"

                zf.write(local_path, f"{prefix}.{ext}")

                

    memory_file.seek(0)

    return StreamingResponse(memory_file, media_type="application/zip", headers={"Content-Disposition": f"attachment; filename={zip_name}"})



@router.post("/api/factory_reset")
async def factory_reset():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM queue")
    conn.commit()
    conn.close()
    
    demo_assets_dir = os.path.join(DATA_DIR, "demo_assets")
    demo_files = set(os.listdir(demo_assets_dir)) if os.path.exists(demo_assets_dir) else set()

    for folder in [PROJECTS_DIR, VAULT_DIR]:
        if os.path.exists(folder):
            for filename in os.listdir(folder):
                if folder == VAULT_DIR and filename in demo_files:
                    continue  # Keep demo files safe from deletion
                file_path = os.path.join(folder, filename)
                try:
                    if os.path.isfile(file_path): os.remove(file_path)
                except: pass
            
    try:
        sync_demo_assets()
    except Exception as _e:
        print("[factory_reset sync error]:", _e)

    await broadcast_system_state()
    return JSONResponse(content={"status": "success"})



# ============================================================================

# 4. STILIŲ IR PROMPTŲ KONFIGŪRACIJA (Būtina Frontend'ui)

# ============================================================================



@router.get("/api/prompts")

async def list_prompts():

    if not os.path.exists(PROMPTS_DIR):

        return {"status": "success", "prompts": []}

    dirs = [d for d in os.listdir(PROMPTS_DIR) if os.path.isdir(os.path.join(PROMPTS_DIR, d))]

    return {"status": "success", "prompts": dirs}



@router.get("/api/style_config")

async def get_style_config(style: str = ""):

    if not style: 

        return JSONResponse(content={"status": "error", "message": "No style name provided"}, status_code=400)

    

    config_path = os.path.join(PROMPTS_DIR, style, "style_config.json")

    if os.path.exists(config_path):

        with open(config_path, "r", encoding="utf-8") as f:

            data = json.load(f)

            return Response(content=json.dumps({"status": "success", "data": data}, ensure_ascii=False), media_type="application/json")

            

    return JSONResponse(content={"status": "error", "message": "Style config not found"}, status_code=404)



@router.get("/api/base_styles")

async def get_base_styles():

    try:

        from routers.styles import sync_style_base_templates, STYLE_PRESETS

        sync_style_base_templates()

    except Exception:

        STYLE_PRESETS = {}



    base_dir = os.path.join(FRONTEND_DIR, "base")

    found_slugs = set()

    styles = []



    # 1. Stiliai iš prompts/

    if os.path.exists(PROMPTS_DIR):

        for name in os.listdir(PROMPTS_DIR):

            item_path = os.path.join(PROMPTS_DIR, name)

            if os.path.isdir(item_path):

                found_slugs.add(name)

                # Ieškome displayName

                cfg_path = os.path.join(item_path, "style_config.json")

                display_name = name.replace("_", " ").title()

                if name in STYLE_PRESETS:

                    display_name = STYLE_PRESETS[name].get("displayName", display_name)

                elif name == "peach_skin_style":

                    display_name = "🍑 Peach Skin (Minimal 2D)"

                elif name == "master_style":

                    display_name = "⚪ Master Style (Clean Monochromatic)"

                

                if os.path.exists(cfg_path):

                    try:

                        with open(cfg_path, "r", encoding="utf-8") as f:

                            cfg = json.load(f)

                            if cfg.get("displayName"):

                                display_name = cfg["displayName"]

                    except Exception:

                        pass

                

                styles.append({

                    "slug": name,

                    "displayName": display_name

                })



    # 2. Papildomi stiliai iš frontend/base

    if os.path.exists(base_dir):

        for name in os.listdir(base_dir):

            if os.path.isdir(os.path.join(base_dir, name)) and name not in found_slugs:

                found_slugs.add(name)

                display_name = name.replace("_", " ").title()

                if name == "default":

                    display_name = "Default 2D Style"

                elif name == "master":

                    display_name = "Master Style"

                styles.append({

                    "slug": name,

                    "displayName": display_name

                })



    # Užtikriname 'default' stilių sąrašo viršuje jei yra

    styles.sort(key=lambda s: (0 if s["slug"] == "default" else 1, s["displayName"]))

    

    # Taip pat pateikiame paprastą sąrašą slug'ų atgaliniam suderinamumui

    slug_list = [s["slug"] for s in styles]

    return {"status": "success", "styles": styles, "slugs": slug_list}



# ============================================================================

# 8. VIDEO ATKARPOS IŠPJOVIMAS IR NAUJOS VARIACIJOS FAILO SUKŪRIMAS (FFMPEG CUT)

# ============================================================================

@router.post("/api/video/cut")

async def cut_video_endpoint(request: Request):

    try:

        data = await request.json()

        scene_id = data.get("sceneId", "S1")

        video_url = data.get("videoUrl", "")

        start_sec = float(data.get("start", 0.0))

        end_sec = float(data.get("end", 0.0))

        

        if not video_url:

            return JSONResponse(status_code=400, content={"status": "error", "message": "Nenurodytas videoUrl"})

        

        # Resolving local file

        clean_url = video_url.split("?")[0]

        input_path = None

        if clean_url.startswith("/vault/"):

            input_path = os.path.join(VAULT_DIR, clean_url.replace("/vault/", "").lstrip("/\\"))

        elif clean_url.startswith("/renders/"):

            input_path = os.path.join(DATA_DIR, "renders", clean_url.replace("/renders/", "").lstrip("/\\"))

        elif os.path.isabs(clean_url) and os.path.exists(clean_url):

            input_path = clean_url

        else:

            candidate = os.path.join(VAULT_DIR, os.path.basename(clean_url))

            if os.path.exists(candidate):

                input_path = candidate

                

        if not input_path or not os.path.exists(input_path):

            return JSONResponse(status_code=404, content={"status": "error", "message": f"Video failas nerastas: {clean_url}"})

            

        dur = max(0.1, round(end_sec - start_sec, 2))

        clean_sc = str(scene_id).replace("S", "")

        cut_filename = f"cut_S{clean_sc}_{int(time.time()*1000)}.mp4"

        output_path = os.path.join(VAULT_DIR, cut_filename)

        

        # ffmpeg accurate cut with ultrafast re-encoding & faststart

        cmd = [

            "ffmpeg", "-y",

            "-ss", str(start_sec),

            "-to", str(end_sec),

            "-i", input_path,

            "-c:v", "libx264",

            "-preset", "ultrafast",

            "-crf", "18",

            "-pix_fmt", "yuv420p",

            "-movflags", "+faststart",

            output_path

        ]

        

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30)

        if proc.returncode != 0 or not os.path.exists(output_path):

            print(f"[Video Cut Error]: {proc.stderr}")

            return JSONResponse(status_code=500, content={"status": "error", "message": f"FFmpeg klaida: {proc.stderr[-200:]}"})

            

        return JSONResponse(content={

            "status": "success",

            "url": f"/vault/{cut_filename}",

            "filename": cut_filename,

            "duration": dur,

            "start": start_sec,

            "end": end_sec

        })

    except Exception as e:

        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})