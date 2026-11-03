import os
import asyncio
import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.responses import FileResponse

# 1. Importuojame konfigūraciją iš config.py
from config import BASE_DIR, FRONTEND_DIR, VAULT_DIR, AUDIO_DIR, VOICES_DIR, DATA_DIR, PROMPTS_DIR, BGM_DIR

# 2. Importuojame tikruosius maršrutizatorius (Routers)
from routers.projects import router as projects_router, sync_demo_assets
from routers.farm import router as farm_router, node_manager_loop, node_health_checker_loop
from routers.llm import router as llm_router
from routers.audio import router as audio_router
from routers.render import router as render_router, RENDERS_DIR
from routers.demo import router as demo_router
from routers.styles import router as styles_router
from routers.cloud_gen import router as cloud_gen_router

# 3. Importuojame WebSocket managerį
from ws_manager import manager

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("--- Initializing GPU Node Manager & Health Checker ---")
    
    # Užtikriname, kad visi duomenų aplankai egzistuoja
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(VOICES_DIR, exist_ok=True)
    os.makedirs(AUDIO_DIR, exist_ok=True)
    os.makedirs(BGM_DIR, exist_ok=True)
    os.makedirs(RENDERS_DIR, exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "workflows"), exist_ok=True)
    os.makedirs(os.path.join(DATA_DIR, "projects"), exist_ok=True)
    try:
        sync_demo_assets()
    except Exception as _e:
        print(f"[Lifespan Demo Sync Error]: {_e}")

    # Išvalome pakibusias būsenas po ankstesnio serverio perkrovimo/nutrūkimo
    try:
        import sqlite3
        from config import DB_PATH
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE queue SET status = 'error', error_log = 'SceneUI serveris buvo perkrautas užduoties vykdymo metu' WHERE status = 'processing'")
        c.execute("UPDATE nodes SET status = 'idle' WHERE status = 'processing'")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[Lifespan DB Cleanup Error]: {e}")
    
    # Paleidžiame originalias fonines užduotis
    asyncio.create_task(node_manager_loop())
    asyncio.create_task(node_health_checker_loop())
    yield

app = FastAPI(title="Scene UI Pro Edition", lifespan=lifespan)

# 4. CORS nustatymai maksimaliam stabilumui
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Paruošiame Jinja2 šablonų variklį (kad veiktų {% include %} index.html faile)
templates = Jinja2Templates(directory=FRONTEND_DIR)

# 6. Prijungiame maršrutus, kurie tikrai egzistuoja
app.include_router(projects_router)
app.include_router(farm_router)
app.include_router(llm_router)
app.include_router(audio_router)
app.include_router(render_router)
app.include_router(demo_router)
app.include_router(styles_router)
app.include_router(cloud_gen_router)

# 7. Statinių failų aptarnavimas (Mounting)
app.mount("/base", StaticFiles(directory=os.path.join(FRONTEND_DIR, "base")), name="base")
app.mount("/vault", StaticFiles(directory=VAULT_DIR), name="vault")
app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
app.mount("/voices", StaticFiles(directory=VOICES_DIR), name="voices")

# PATAISYMAS: Pridėtas /audio statinis maršrutas, kad naršyklė sėkmingai užkrautų sugeneruotus chunk failus
app.mount("/audio", StaticFiles(directory=AUDIO_DIR), name="audio")
app.mount("/audio_files", StaticFiles(directory=AUDIO_DIR), name="audio_files")
app.mount("/bgm", StaticFiles(directory=BGM_DIR), name="bgm")
app.mount("/prompts", StaticFiles(directory=PROMPTS_DIR), name="prompts")
app.mount("/renders", StaticFiles(directory=RENDERS_DIR), name="renders")

# 8. Pagrindinis maršrutas naudojant Jinja2Templates
@app.get("/")
async def serve_index(request: Request):
    return templates.TemplateResponse(
        request=request, 
        name="index.html", 
        context={"request": request}
    )

# Stiliaus failo aptarnavimas
@app.get("/style.css")
async def serve_css():
    return FileResponse(os.path.join(FRONTEND_DIR, "style.css"))

@app.post("/api/save_project")
async def save_project_proxy(request: Request):
    import json
    form = await request.form()
    state_str = form.get("state")
    if not state_str:
        return {"success": False, "error": "No state"}
    
    dest_dirs = [
        r"d:\Desktop\Kiti projektai\mini programos\edit sowtare\editinimas_backup_resolve - Copy\static\persistent_project",
        os.path.join(BASE_DIR, "persistent_project")
    ]
    for d in dest_dirs:
        try:
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "project_state.json"), "w", encoding="utf-8") as f:
                f.write(state_str)
        except Exception as e:
            print("Error writing state to", d, e)
            
    return {"success": True}

@app.get("/api/load_project")
async def load_project_proxy():
    import json
    target_file = r"d:\Desktop\Kiti projektai\mini programos\edit sowtare\editinimas_backup_resolve - Copy\static\persistent_project\project_state.json"
    if os.path.exists(target_file):
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                return {"success": True, "state": json.load(f)}
        except Exception:
            pass
    return {"success": False}



def find_available_port(host="0.0.0.0", start_port=8001, max_attempts=50):
    import socket
    for p in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind((host, p))
                return p
            except OSError:
                continue
    return start_port

if __name__ == "__main__":
    import webbrowser
    import threading
    import time

    active_port = find_available_port(host="0.0.0.0", start_port=8001)
    print(f"\n🚀 SCENE UI SERVER STARTED (PRO EDITION) on http://127.0.0.1:{active_port} (Port: {active_port})")
    
    def _open_browser():
        time.sleep(1.2)
        try:
            webbrowser.open(f"http://127.0.0.1:{active_port}")
        except Exception:
            pass
    threading.Thread(target=_open_browser, daemon=True).start()

    # Watch code directories (routers & frontend) to avoid reloading on data writes
    uvicorn.run("server:app", host="0.0.0.0", port=active_port, reload=True, reload_dirs=[os.path.join(BASE_DIR, "routers"), os.path.join(BASE_DIR, "frontend")])
