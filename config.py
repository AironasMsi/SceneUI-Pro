import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
CLOUD_MODEL_DEFAULT = os.getenv("CLOUD_MODEL_DEFAULT", "gemini-3.1-flash-image")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
DATA_DIR = os.path.join(BASE_DIR, "data")
VAULT_DIR = os.path.join(DATA_DIR, "vault")
PROJECTS_DIR = os.path.join(DATA_DIR, "projects")
PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")
DB_PATH = os.path.join(DATA_DIR, "queue_v2.db")

# NAUJA: Audio, balsų ir foninės muzikos direktorijos
AUDIO_DIR = os.path.join(DATA_DIR, "audio")
VOICES_DIR = os.path.join(DATA_DIR, "voices")
BGM_DIR = os.path.join(DATA_DIR, "bgm")

os.makedirs(VAULT_DIR, exist_ok=True)
PROJECTS_DIR = os.path.join(DATA_DIR, "projects")
os.makedirs(PROJECTS_DIR, exist_ok=True)
os.makedirs(FRONTEND_DIR, exist_ok=True)
os.makedirs(PROMPTS_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(BGM_DIR, exist_ok=True)

def init_db():
    # check_same_thread=False leidžia keliems thread'ams naudoti bazę be klaidų
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    c = conn.cursor()
    
    # Įjungiame Write-Ahead Logging (WAL) Multi-GPU greičiui ir stabilumui
    c.execute("PRAGMA journal_mode=WAL;")
    
    c.execute('''CREATE TABLE IF NOT EXISTS queue (
                    req_id TEXT PRIMARY KEY,
                    project_id TEXT,
                    scene_id TEXT,
                    priority INTEGER,
                    status TEXT,
                    assigned_node TEXT,
                    target_node TEXT,
                    workflow_json TEXT,
                    error_log TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )''')
                
    try:
        c.execute("ALTER TABLE queue ADD COLUMN target_node TEXT")
    except sqlite3.OperationalError:
        pass 
    
    c.execute('''CREATE TABLE IF NOT EXISTS nodes (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    url TEXT,
                    api_key TEXT,
                    status TEXT,
                    locked_proj TEXT,
                    is_active INTEGER DEFAULT 1
                )''')

    c.execute('''CREATE TABLE IF NOT EXISTS bgm_tracks (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    filename TEXT,
                    url TEXT,
                    duration REAL DEFAULT 0,
                    file_size INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )''')

    c.execute("DELETE FROM queue WHERE req_id LIKE 'sfx_%'")
    c.execute("UPDATE queue SET status = 'queued', assigned_node = NULL WHERE status = 'processing'")
    c.execute("UPDATE nodes SET status = 'idle' WHERE status = 'processing'")
    conn.commit()
    conn.close()

init_db()