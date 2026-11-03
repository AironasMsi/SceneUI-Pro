import os
import shutil
import json
import uuid
import asyncio
import sqlite3
import aiohttp
import re
import traceback
import subprocess
import socket
import random
import urllib.parse
import hashlib
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from fastapi import APIRouter, Request, Response, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from pydub import AudioSegment
from pydub.silence import detect_leading_silence
try:
    import soundfile as sf
except Exception:
    sf = None

from config import DB_PATH, AUDIO_DIR, VOICES_DIR, BGM_DIR, DATA_DIR, PROJECTS_DIR
from ws_manager import manager
from routers.farm import pause_farm, resume_farm
from routers.comfy_ui_workflow import build_extra_data

router = APIRouter()

# ============================================================================
# LOGGING HELPER
# ============================================================================

def log_event(message, level="INFO"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    prefix = f"[{timestamp}] [AUDIO-{level}]"
    print(f"{prefix} {message}")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def split_text_into_chunks(text, max_len=200):
    log_event(f"Pradedamas teksto skaidymas (Ilgis: {len(text)} simb., Max limitas: {max_len})", "DEBUG")
    raw_chunks = re.split(r'(?<=[.?!])\s+|\n+', text)
    chunks = []
    for chunk in raw_chunks:
        chunk = chunk.strip()
        if not chunk:
            continue
        if len(chunk) > max_len:
            sub_chunks = re.split(r'(?<=[,;])\s+', chunk)
            for sc in sub_chunks:
                if sc.strip():
                    chunks.append(sc.strip())
        else:
            chunks.append(chunk)
    
    log_event(f"Tekstas sėkmingai padalintas į {len(chunks)} dalis(-ių).", "INFO")
    return chunks

def split_text_by_punctuation(text: str) -> list[str]:
    """
    Skaido tekstą griežtai nuo skyrybos ženklo iki skyrybos ženklo:
    (. , ! ? ; : — – … arba eilutės pabaiga).
    Kiekviena frazė išlaiko savo skyrybos ženklą gale, kad TTS intonacija būtų natūrali.
    """
    log_event(f"Pradedamas teksto skaidymas pagal skyrybos ženklus (Ilgis: {len(text)} simb.)", "DEBUG")
    raw_chunks = re.split(r'(?<=[.!?,;:—–…])\s+|\n+', text)
    chunks = [c.strip() for c in raw_chunks if c.strip()]
    log_event(f"Tekstas pagal skyrybos ženklus padalintas į {len(chunks)} dalis(-ių).", "INFO")
    return chunks

def split_text_by_sentences(text: str) -> list[str]:
    """Skaido tekstą ties sakinių pabaigos skyrybos ženklais (. ! ? …)."""
    raw_chunks = re.split(r'(?<=[.!?…])\s+|\n+', text)
    return [c.strip() for c in raw_chunks if c.strip()]

def trim_silence_segment(seg: AudioSegment, silence_thresh_db: float = -42.0, padding_ms: int = 40, is_last_segment: bool = False) -> AudioSegment:
    """
    Nukerpa tuščią tylą pradžioje ir pabaigoje.
    Paskutiniam sakiniui:
    - Užtikrina, kad jokie žodžiai nebūtų nukirpti (paliekamas saugus 160ms rezervas po kalbos)
    - Pašalina po to einančius atsitiktinius modelio garsus / triukšmus / spragtelėjimus
    - Pabaigoje atlieka tolygų ir natūralų fade-out į visišką tylą (fade out į tylą)
    """
    if len(seg) == 0:
        return seg
    try:
        adaptive_thresh = max(-45.0, min(-28.0, seg.dBFS - 16.0)) if seg.dBFS != float('-inf') else silence_thresh_db
        thresh = min(silence_thresh_db, adaptive_thresh)
        
        start_trim = detect_leading_silence(seg, silence_threshold=thresh)
        start = max(0, start_trim - padding_ms)
        
        end_trim = detect_leading_silence(seg.reverse(), silence_threshold=thresh)
        
        if is_last_segment:
            # Paskutiniam sakiniui paliekame dosnų 160ms rezervą po kalbos pabaigos,
            # kad visi priebalsiai ir aidas išliktų pilni, bet nukirptų toliau esančius atsitiktinius TTS modelio garsus
            end_pad = max(160, padding_ms * 2)
            end = len(seg) - max(0, end_trim - end_pad)
            
            if end > start + 50:
                res = seg[start:end]
            else:
                res = seg
                
            # Tolygus profesionalus fade-out į visišką tylą (fade out į tylą, o ne random garsai)
            if len(res) > 220:
                res = res.fade_out(200)
            elif len(res) > 60:
                res = res.fade_out(len(res) // 2)
                
            # Pridedame gryną skaitmeninę tylą pabaigoje (jokių atsitiktinių garsų)
            return res + AudioSegment.silent(duration=300)
        else:
            end = len(seg) - max(0, end_trim - padding_ms)
            if end > start + 30:
                return seg[start:end]
            return seg
    except Exception as e:
        log_event(f"Įspėjimas apkarpant tylą: {e}", "WARN")
        return seg

def get_punctuation_cadence(text: str, base_sentence_pause_ms: int = 380) -> dict:
    """
    Išmaniai analizuoja teksto pabaigos skyrybos ženklus ir nustato natūralią pauzę bei užbaigimą:
    - Sakinio pabaiga (. ! ?): pilnas sustojimas, natūralus įkvėpimas (pvz. ~380ms) su tolygiu užgesimu
    - Daugtaškis (...): gilesnė, apgalvota pauzė (pvz. ~530ms)
    - Kablelis, dvitaškis, kabliataškis, brūkšnys (, ; : —): trumpas frazės atskyrimas sakinio viduje (~170ms)
    - Be skyrybos (tęsinys sakinio viduryje): glaudus sujungimas (~40ms), kad skambėtų kaip vienas vientisas sakinys
    """
    clean = text.strip() if text else ""
    # Pašaliname kabutes ir skliaustus pabaigoje
    clean_no_quotes = re.sub(r'["\'”»\)]+$', '', clean).strip()
    
    if not clean_no_quotes:
        return {"pause_ms": 40, "type": "continuous", "fade_out_ms": 25, "fade_in_ms": 20}

    # 1. Daugtaškis (...)
    if clean_no_quotes.endswith("...") or clean_no_quotes.endswith("…"):
        pause = int(base_sentence_pause_ms * 1.4)
        return {"pause_ms": max(250, pause), "type": "ellipsis", "fade_out_ms": 60, "fade_in_ms": 30}

    # 2. Sakinio pabaiga: . ! ?
    if re.search(r'[.!?]$', clean_no_quotes):
        pause = max(200, int(base_sentence_pause_ms))
        return {"pause_ms": pause, "type": "sentence_end", "fade_out_ms": 50, "fade_in_ms": 25}

    # 3. Kablelis, kabliataškis, dvitaškis, brūkšnys
    if re.search(r'[,;:\—\-]$', clean_no_quotes):
        pause = max(100, int(base_sentence_pause_ms * 0.45))
        return {"pause_ms": pause, "type": "clause", "fade_out_ms": 35, "fade_in_ms": 20}

    # 4. Tęsinys be skyrybos (sakinio vidurys)
    return {"pause_ms": 40, "type": "continuous", "fade_out_ms": 25, "fade_in_ms": 20}

def stitch_audio_segments(
    items: list,
    transition_type: str = "smart_cadence",
    transition_ms: int = 80,
    silence_ms: int = 380,
    trim_silence: bool = True,
    trim_threshold_db: float = -42.0
) -> AudioSegment:
    """Išmaniai sujungia audio dalis su perėjimais (smart_cadence/crossfade/fade/gap) ir tylos apdorojimu"""
    if not items:
        return AudioSegment.empty()
        
    processed = []
    total_raw_items = len(items)
    for idx, item in enumerate(items):
        is_last = (idx == total_raw_items - 1)
        if isinstance(item, dict):
            seg = item.get("segment")
            txt = item.get("text", "")
        elif isinstance(item, tuple):
            seg = item[0]
            txt = item[1] if len(item) > 1 else ""
        else:
            seg = item
            txt = ""
            
        if not seg or len(seg) == 0:
            continue
            
        cur = seg
        if trim_silence:
            cur = trim_silence_segment(cur, silence_thresh_db=trim_threshold_db, is_last_segment=is_last)
        elif is_last:
            # Net jei trim_silence išjungtas, paskutiniam sakiniui atliekame tolygų fade-out į tylą
            if len(cur) > 220:
                cur = cur.fade_out(200)
            cur = cur + AudioSegment.silent(duration=300)
            
        processed.append({"segment": cur, "text": txt})
        
    if not processed:
        return AudioSegment.empty()
        
    if len(processed) == 1:
        return processed[0]["segment"]
        
    final_audio = AudioSegment.empty()
    
    for i, p_item in enumerate(processed):
        seg = p_item["segment"]
        txt = p_item.get("text", "")
        is_last_item = (i == len(processed) - 1)
        
        cadence = get_punctuation_cadence(txt, base_sentence_pause_ms=silence_ms)
        
        if transition_type == "smart_cadence":
            f_in = cadence["fade_in_ms"]
            if len(seg) > f_in:
                seg = seg.fade_in(f_in)
                
            if not is_last_item:
                f_out = cadence["fade_out_ms"]
                if len(seg) > f_out:
                    seg = seg.fade_out(f_out)
                    
            final_audio += seg
            
            if not is_last_item:
                pause_len = cadence["pause_ms"]
                final_audio += AudioSegment.silent(duration=pause_len)
                
        elif transition_type == "crossfade":
            if i == 0:
                final_audio = seg
            else:
                xfade = min(transition_ms, max(10, len(final_audio) - 10), max(10, len(seg) - 10))
                if xfade >= 20:
                    final_audio = final_audio.append(seg, crossfade=xfade)
                else:
                    final_audio = final_audio + seg
                    
        elif transition_type == "fade":
            f_ms = min(transition_ms, 120)
            if not is_last_item:
                if len(seg) > f_ms * 2:
                    seg = seg.fade_in(f_ms).fade_out(f_ms)
            else:
                if len(seg) > f_ms:
                    seg = seg.fade_in(f_ms)
            final_audio += seg
            if not is_last_item:
                final_audio += AudioSegment.silent(duration=max(20, silence_ms))
                
        else: # "gap" - fiksuotas tarpas
            if not is_last_item:
                if len(seg) > 60:
                    seg = seg.fade_in(25).fade_out(35)
            else:
                if len(seg) > 25:
                    seg = seg.fade_in(25)
            final_audio += seg
            if not is_last_item:
                final_audio += AudioSegment.silent(duration=max(20, silence_ms))
                
    return final_audio

def find_voice_file(voice_name: Optional[str]) -> Optional[str]:
    """
    Saugiai suranda balso failą VOICES_DIR arba AUDIO_DIR aplanke:
    - Palaiko pilną failo pavadinimą (pvz. 'narrator.wav')
    - Prideda .wav jei trūksta plėtinio
    - Tikrina AUDIO_DIR (jei tai sugeneruotas Take ar preview, pvz. 'chunk_83867d8a.wav')
    - Automatiškai nukopijuoja iš AUDIO_DIR į VOICES_DIR, kad taptų nuolatiniu balso failu bibliotekoje
    - Atpažįsta pagal personažo vardą be 'voice_' prefikso (pvz. 'voice_ethan' -> 'ethan.wav')
    - Filtruoja tik tikrus garso failus (.wav, .mp3), ignoruodamas .txt transkripcijas
    """
    if not voice_name or not str(voice_name).strip():
        return None
    raw = str(voice_name).strip()
    
    # 1. Tiesioginis kelias VOICES_DIR
    p_voice = os.path.join(VOICES_DIR, raw)
    if os.path.isfile(p_voice) and p_voice.lower().endswith(('.wav', '.mp3')):
        return p_voice
    if not p_voice.lower().endswith(('.wav', '.mp3')):
        p_wav = p_voice + '.wav'
        if os.path.isfile(p_wav):
            return p_wav

    # 2. Tiesioginis kelias AUDIO_DIR (Take pavyzdžiai, pvz. chunk_83867d8a.wav)
    p_audio = os.path.join(AUDIO_DIR, raw)
    if os.path.isfile(p_audio) and p_audio.lower().endswith(('.wav', '.mp3')):
        return p_audio

    if not p_audio.lower().endswith(('.wav', '.mp3')):
        p_audio_wav = p_audio + '.wav'
        if os.path.isfile(p_audio_wav):
            return p_audio_wav

    # 3. Paieška pagal vardo šaknį VOICES_DIR
    v_clean = raw.lower().replace('\\', '/').split('/')[-1]
    bare = v_clean.replace('voice_', '')
    if os.path.exists(VOICES_DIR):
        for fname in os.listdir(VOICES_DIR):
            if not fname.lower().endswith(('.wav', '.mp3')):
                continue
            fpath = os.path.join(VOICES_DIR, fname)
            if not os.path.isfile(fpath):
                continue
            fn_low = fname.lower()
            if fn_low in (v_clean, f'{v_clean}.wav', f'{v_clean}.mp3'):
                return fpath
            if fn_low in (bare, f'{bare}.wav', f'{bare}.mp3'):
                return fpath
            name_no_ext = os.path.splitext(fn_low)[0]
            if name_no_ext == bare:
                return fpath

    # 4. Paieška pagal vardo šaknį AUDIO_DIR
    if os.path.exists(AUDIO_DIR):
        for fname in os.listdir(AUDIO_DIR):
            if not fname.lower().endswith(('.wav', '.mp3')):
                continue
            fpath = os.path.join(AUDIO_DIR, fname)
            if not os.path.isfile(fpath):
                continue
            fn_low = fname.lower()
            if fn_low in (v_clean, f'{v_clean}.wav', f'{v_clean}.mp3'):
                return fpath
            if fn_low in (bare, f'{bare}.wav', f'{bare}.mp3'):
                return fpath
            name_no_ext = os.path.splitext(fn_low)[0]
            if name_no_ext == bare or (bare and bare in name_no_ext):
                return fpath

    return None

def find_voice_ref_text(voice_ref_path: Optional[str]) -> str:
    """
    Išmaniai suranda referencinio balso transkripciją (.txt):
    1. Tikrina tiesioginį .txt šalia balso failo (pvz. narrator.txt)
    2. Tikrina VOICES_DIR ir AUDIO_DIR
    3. Ieško visuose projektuose (data/projects/*.json) pagal sampleText arba audioChunks text
    4. Jei randa teksto transkripciją projektuose, automatiškai išsaugo .txt failą, kad kitąkart būtų momentinė
    """
    if not voice_ref_path:
        return ""
    
    # 1. Tiesioginis kelias
    txt_path = os.path.splitext(voice_ref_path)[0] + ".txt"
    if os.path.isfile(txt_path):
        try:
            with open(txt_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception:
            pass

    base = os.path.basename(voice_ref_path).split('?')[0]
    base_no_ext = os.path.splitext(base)[0]

    # 2. Tikriname VOICES_DIR ir AUDIO_DIR
    for d in [VOICES_DIR, AUDIO_DIR]:
        candidate = os.path.join(d, base_no_ext + ".txt")
        if os.path.isfile(candidate):
            try:
                with open(candidate, 'r', encoding='utf-8') as f:
                    content = f.read().strip()
                    if content:
                        return content
            except Exception:
                pass

    # 3. Ieškome data/projects/*.json
    try:
        proj_dir = os.path.join(DATA_DIR, "projects")
        if os.path.exists(proj_dir):
            for p_file in os.listdir(proj_dir):
                if not p_file.lower().endswith(".json"):
                    continue
                p_path = os.path.join(proj_dir, p_file)
                try:
                    with open(p_path, "r", encoding="utf-8") as pf:
                        p_data = json.load(pf)
                    
                    # a) characterVoices -> variations -> sampleText
                    cv = p_data.get("characterVoices", {})
                    for role_key, role in cv.items():
                        for v in role.get("variations", []):
                            v_fn = os.path.basename(v.get("filename", "") or v.get("url", "")).split("?")[0]
                            st = (v.get("sampleText") or "").strip()
                            if v_fn == base and st:
                                # Išsaugome .txt failą abiejuose aplankuose ateičiai
                                for save_d in [VOICES_DIR, AUDIO_DIR]:
                                    try:
                                        with open(os.path.join(save_d, base_no_ext + ".txt"), "w", encoding="utf-8") as out_f:
                                            out_f.write(st)
                                    except Exception:
                                        pass
                                log_event(f"Transkripcija atkurta iš projekto {p_file} rolės {role_key}: '{st[:30]}...'", "INFO")
                                return st

                    # b) audioChunks -> text
                    for c in p_data.get("audioChunks", []):
                        c_fn = os.path.basename(c.get("filename", "") or c.get("audio_url", "")).split("?")[0]
                        ct = (c.get("text") or "").strip()
                        if c_fn == base and ct:
                            for save_d in [VOICES_DIR, AUDIO_DIR]:
                                try:
                                    with open(os.path.join(save_d, base_no_ext + ".txt"), "w", encoding="utf-8") as out_f:
                                        out_f.write(ct)
                                except Exception:
                                    pass
                            log_event(f"Transkripcija atkurta iš projekto {p_file} audioChunks: '{ct[:30]}...'", "INFO")
                            return ct
                except Exception:
                    pass
    except Exception as e:
        log_event(f"Klaida ieškant transkripcijos projektuose: {e}", "WARN")

    return ""

async def get_node_url(node_id):
    log_event(f"Ieškomas GPU mazgas duomenų bazėje: {node_id}", "DEBUG")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT url FROM nodes WHERE id = ?", (node_id,))
    node = c.fetchone()
    conn.close()
    
    if not node:
        log_event(f"KLAIDA: GPU mazgas '{node_id}' nerastas duomenų bazėje!", "ERROR")
        raise Exception("GPU Node not found in database")
        
    node_url = node["url"].rstrip('/')
    log_event(f"Rastas mazgo URL: {node_url}", "DEBUG")
    return node_url

# ============================================================================
# ACTIVE AUDIO SESSIONS & CANCELLATION TRACKER
# ============================================================================
ACTIVE_AUDIO_SESSIONS = {}
NODE_ACTIVE_TTS_COUNT = {}

def acquire_node_tts(node_id: str):
    count = NODE_ACTIVE_TTS_COUNT.get(node_id, 0) + 1
    NODE_ACTIVE_TTS_COUNT[node_id] = count
    pause_farm(node_id)
    log_event(f"GPU mazgas {node_id} užrakintas TTS (Aktyvių TTS užduočių: {count}).", "INFO")

def release_node_tts(node_id: str):
    count = max(0, NODE_ACTIVE_TTS_COUNT.get(node_id, 1) - 1)
    NODE_ACTIVE_TTS_COUNT[node_id] = count
    if count == 0:
        resume_farm(node_id)
        log_event(f"GPU ferma ({node_id}) atrakinta (visi TTS seansai baigti).", "INFO")
    else:
        log_event(f"GPU mazgas {node_id} vis dar vykdo {count} TTS užduočių, ferma lieka pristabdyta.", "DEBUG")

async def interrupt_comfyui_node(node_url: str):
    """Sends interrupt signal to ComfyUI node to stop active execution"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{node_url}/interrupt", timeout=aiohttp.ClientTimeout(total=3)) as resp:
                log_event(f"Išsiųstas /interrupt signalas į {node_url}. Status: {resp.status}", "INFO")
                return True
    except Exception as e:
        log_event(f"Nepavyko išsiųsti /interrupt į {node_url}: {e}", "WARN")
        return False

async def call_comfyui_tts(node_url, text, prompt=None, voice_ref_path=None, session_id=None, seed=None):
    client_id = str(uuid.uuid4())
    
    log_event(f"Ruošiama ComfyUI užklausa. Client ID: {client_id}", "INFO")
    
    if voice_ref_path:
        wf_filename = "qwen_tts_clone.json"
        log_event(f"Režimas: Balso KLONAVIMAS. Naudojamas failas: {wf_filename}", "INFO")
    elif prompt:
        wf_filename = "qwen_tts_design.json"
        log_event(f"Režimas: Balso DIZAINAS (Generavimas). Naudojamas failas: {wf_filename}", "INFO")
    else:
        log_event("KLAIDA: Nepateiktas nei balso failas, nei aprašymas!", "ERROR")
        raise Exception("KLAIDA: Nepateiktas nei balso failas klonavimui, nei tekstinis aprašymas (prompt) balso kūrimui.")
        
    wf_path = os.path.join("data", "workflows", wf_filename)
    
    if not os.path.exists(wf_path):
        log_event(f"KLAIDA: Nerastas darbo eigos failas keliu: {wf_path}", "ERROR")
        raise Exception(f"Trūksta darbo eigos failo ({wf_filename}).")
        
    with open(wf_path, 'r', encoding='utf-8') as f:
        wf = json.load(f)
        log_event("Darbo eiga (workflow) sėkmingai užkrauta į atmintį.", "DEBUG")

    if "last_node_id" in wf or "nodes" in wf:
        log_event("KLAIDA: Neteisingas workflow formatas (WebUI). Reikia API formato.", "ERROR")
        raise Exception(f"KLAIDA: Jūsų {wf_filename} failas yra WebUI formato! Išsaugokite kaip 'API Format'.")

    # Nuskaitome transkripcijos (.txt) failą
    ref_text_content = ""
    if voice_ref_path:
        ref_text_content = find_voice_ref_text(voice_ref_path)
        if ref_text_content:
            log_event(f"Rasta balso transkripcija: '{ref_text_content[:40]}...'", "DEBUG")
        else:
            log_event(f"ĮSPĖJIMAS: Nerastas tekstinis failas ({voice_ref_path}). Qwen3-TTS jungs x_vector_only režimą.", "WARN")

    async with aiohttp.ClientSession() as session:
        # Check cancellation before starting
        if session_id and ACTIVE_AUDIO_SESSIONS.get(session_id, {}).get("cancelled"):
            raise asyncio.CancelledError("TTS Generation was cancelled before starting.")
        
        # 1. PIRMA ĮKELIAME FAILĄ Į GPU (kad gautume tikrąjį jo pavadinimą)
        uploaded_filename = None
        if voice_ref_path:
            log_event(f"Siunčiamas referencinis garso failas į ComfyUI: {voice_ref_path}", "INFO")
            try:
                data = aiohttp.FormData()
                data.add_field('image', open(voice_ref_path, 'rb'), filename=os.path.basename(voice_ref_path))
                data.add_field('type', 'input')
                data.add_field('overwrite', 'true')
                
                upload_req = await session.post(f"{node_url}/upload/image", data=data)
                if upload_req.status != 200:
                    log_event(f"Nepavyko įkelti failo. HTTP Status: {upload_req.status}", "ERROR")
                    raise Exception(f"Nepavyko įkelti balso failo į ComfyUI serverį. Status: {upload_req.status}")
                
                upload_res = await upload_req.json()
                uploaded_filename = upload_res.get("name", os.path.basename(voice_ref_path))
                log_event(f"GPU serveris išsaugojo failą kaip: '{uploaded_filename}'", "INFO")
                
            except Exception as e:
                log_event(f"Klaida įkeliant audio failą: {e}", "ERROR")
                raise Exception(f"Klaida įkeliant audio failą: {e}")

        # 2. MODIFIKUOJAME WORKFLOW DUOMENIS
        log_event("Modifikuojami darbo eigos (workflow) mazgai (inputs)...", "DEBUG")
        import random
        for node_id, node_data in wf.items():
            if isinstance(node_data, dict) and "inputs" in node_data:
                
                # Priskiriame tekstą generavimui
                if "text" in node_data["inputs"] and isinstance(node_data["inputs"]["text"], str):
                    node_data["inputs"]["text"] = text
                if "target_text" in node_data["inputs"] and isinstance(node_data["inputs"]["target_text"], str):
                    node_data["inputs"]["target_text"] = text
                    
                # Priskiriame tikslų balso pavyzdžio tekstą ir suderiname x_vector_only
                has_ref_text = bool(ref_text_content and ref_text_content.strip())
                if "ref_text" in node_data["inputs"] and isinstance(node_data["inputs"]["ref_text"], str):
                    node_data["inputs"]["ref_text"] = ref_text_content.strip() if has_ref_text else ""

                if "x_vector_only" in node_data["inputs"]:
                    # Jei transkripcija yra -> ICL režimas (x_vector_only = False)
                    # Jei transkripcijos NĖRA -> x_vector_only = True (Qwen3-TTS apsauga nuo RuntimeError)
                    node_data["inputs"]["x_vector_only"] = not has_ref_text
                    if has_ref_text:
                        log_event("Qwen3-TTS parametras: x_vector_only = False (ICL režimas su tekstu).", "DEBUG")
                    else:
                        log_event("Qwen3-TTS parametras: x_vector_only = True (x-vector režimas be teksto).", "INFO")

                # Priskiriame balso aprašymą (Voice Design)
                if prompt:
                    if "instruct" in node_data["inputs"] and isinstance(node_data["inputs"]["instruct"], str):
                        node_data["inputs"]["instruct"] = prompt
                    elif "prompt" in node_data["inputs"] and isinstance(node_data["inputs"]["prompt"], str):
                        node_data["inputs"]["prompt"] = prompt

                # Priskiriame arba atsitiktinai sugeneruojame seed (jei yra mazge)
                if "seed" in node_data["inputs"]:
                    if seed is not None:
                        try:
                            node_data["inputs"]["seed"] = int(seed)
                        except:
                            node_data["inputs"]["seed"] = random.randint(1, 9999999999)
                    else:
                        node_data["inputs"]["seed"] = random.randint(1, 9999999999)
                        
                # Dinamiškai priskiriame gautą failo pavadinimą LoadAudio mazgui
                if uploaded_filename and "audio" in node_data["inputs"] and isinstance(node_data["inputs"]["audio"], str):
                    node_data["inputs"]["audio"] = uploaded_filename
                    log_event(f"LoadAudio mazgui priskirtas failas: {uploaded_filename}", "DEBUG")

        log_event(f"Tekstas generavimui: '{text[:50]}...'", "INFO")

        # 3. SIUNČIAME GENERAVIMO UŽKLAUSĄ
        log_event(f"Siunčiama generavimo užklausa į /prompt ({node_url})...", "INFO")
        try:
            extra_data = build_extra_data(wf, node_url)
            prompt_req = await session.post(f"{node_url}/prompt", json={
                "prompt": wf,
                "client_id": client_id,
                "extra_data": extra_data
            })
            prompt_res = await prompt_req.json()
        except Exception as e:
            log_event(f"Nepavyko susisiekti su ComfyUI /prompt API: {e}", "ERROR")
            raise Exception(f"Nepavyko susisiekti su ComfyUI: {e}")
        
        if "error" in prompt_res:
            log_event(f"GPU grąžino klaidą: {prompt_res.get('error')}", "ERROR")
            raise Exception(f"GPU Error: {prompt_res.get('error')}")
            
        prompt_id = prompt_res.get("prompt_id")
        log_event(f"Užklausa priimta. Gautas Prompt ID: {prompt_id}. Laukiamas rezultatas...", "INFO")
        
        if session_id and session_id in ACTIVE_AUDIO_SESSIONS:
            ACTIVE_AUDIO_SESSIONS[session_id]["prompt_id"] = prompt_id
            ACTIVE_AUDIO_SESSIONS[session_id]["node_url"] = node_url
        
        # 4. LAUKIAME REZULTATŲ IŠ ISTORIJOS
        for attempt in range(120):
            # Tikriname ar vartotojas neatšaukė generavimo
            if session_id and ACTIVE_AUDIO_SESSIONS.get(session_id, {}).get("cancelled"):
                log_event(f"Generavimas atšauktas vartotojo (Session ID: {session_id}, Prompt ID: {prompt_id}). Nutraukiama...", "WARN")
                await interrupt_comfyui_node(node_url)
                raise asyncio.CancelledError("TTS Generation was cancelled by user.")
            
            await asyncio.sleep(2)
            try:
                hist_req = await session.get(f"{node_url}/history/{prompt_id}")
                if hist_req.status == 200:
                    history = await hist_req.json()
                else:
                    hist_req = await session.get(f"{node_url}/history")
                    if hist_req.status != 200:
                        continue
                    history = await hist_req.json()
            except Exception as e:
                log_event(f"Klaida tikrinant ComfyUI istorijos API: {e}", "WARN")
                continue

            prompt_entry = None
            if prompt_id in history:
                prompt_entry = history[prompt_id]
            elif isinstance(history, dict) and ("outputs" in history or "status" in history):
                prompt_entry = history

            if prompt_entry:
                log_event(f"Darbas {prompt_id} baigtas! Analizuojami išvesties rezultatai.", "INFO")
                status_info = prompt_entry.get("status", {})

                # 1. Tikriname, ar vykdant mazgus ComfyUI serveryje neįvyko klaida
                if status_info.get("status_str") == "error":
                    messages = status_info.get("messages", [])
                    err_msg = f"ComfyUI vykdymo klaida: {messages}"
                    log_event(f"KLAIDA: ComfyUI vykdymo metu įvyko klaida ({prompt_id}): {messages}", "ERROR")
                    raise Exception(err_msg)

                outputs = prompt_entry.get("outputs", {})
                log_event(f"ComfyUI istorijos outputs: {outputs}", "DEBUG")

                # 2. Visapusiškai ieškome sugeneruoto garso / failo nuorodos bet kurioje mazgo išvestyje
                for k, v in outputs.items():
                    if isinstance(v, dict):
                        for media_key, file_list in v.items():
                            if isinstance(file_list, list) and len(file_list) > 0:
                                for item in file_list:
                                    if isinstance(item, dict) and "filename" in item:
                                        filename = item['filename']
                                        subfolder = item.get('subfolder', '')
                                        file_type = item.get('type', 'output')
                                        download_url = f"{node_url}/view?filename={filename}&subfolder={subfolder}&type={file_type}"
                                        
                                        chunk_filename = f"chunk_{uuid.uuid4().hex[:8]}.wav"
                                        chunk_path = os.path.join(AUDIO_DIR, chunk_filename)
                                        
                                        log_event(f"Siunčiamas sugeneruotas garsas iš: {download_url}", "DEBUG")
                                        async with session.get(download_url) as resp:
                                            if resp.status == 200:
                                                with open(chunk_path, 'wb') as audio_file:
                                                    audio_file.write(await resp.read())
                                                
                                                # Post-process chunk: pašaliname modelio atsitiktinius garsus/triukšmus, paliekant saugų 150ms kalbos rezervą
                                                try:
                                                    c_seg = AudioSegment.from_file(chunk_path)
                                                    if len(c_seg) > 300:
                                                        thresh = max(-45.0, min(-28.0, c_seg.dBFS - 16.0)) if c_seg.dBFS != float('-inf') else -38.0
                                                        end_t = detect_leading_silence(c_seg.reverse(), thresh)
                                                        if end_t > 90:
                                                            keep_end = len(c_seg) - max(0, end_t - 150)
                                                            if keep_end > 200:
                                                                c_seg = c_seg[:keep_end]
                                                    if len(c_seg) > 60:
                                                        c_seg = c_seg.fade_out(25)
                                                    c_seg = c_seg + AudioSegment.silent(duration=100)
                                                    c_seg.export(chunk_path, format="wav")
                                                except Exception as proc_e:
                                                    log_event(f"Įspėjimas taikant audio tail padding: {proc_e}", "WARN")

                                                log_event(f"Audio dalis išsaugota serveryje: {chunk_path}", "SUCCESS")
                                                return chunk_path
                                            else:
                                                log_event(f"Nepavyko atsisiųsti audio failo. HTTP Status: {resp.status}", "ERROR")

                # Jei prompt_id yra istorijoje, bet neradome jokio išvesties failo – darbas baigtas be rezultatų
                log_event(f"KLAIDA: Audio sugeneruotas ({prompt_id}), bet ComfyUI istorijoje nėra nuorodos į failą. Outputs: {outputs}", "ERROR")
                raise Exception(f"Audio generated, but output missing from ComfyUI history. Outputs: {outputs}")

    log_event("KLAIDA: Baigėsi skirtas laikas (timeout) laukiant ComfyUI atsakymo (240s).", "ERROR")
    raise Exception("TTS Generation timed out.")

# ============================================================================
# API ENDPOINTS
# ============================================================================

class PreviewRequest(BaseModel):
    text: str
    prompt: Optional[str] = ""
    voice: Optional[str] = ""
    targetNode: str
    seed: int | None = None

@router.post("/api/audio/preview")
async def generate_preview(req: PreviewRequest):
    log_event("=== GAUTA NAUJA PREVIEW UŽKLAUSA ===", "INFO")
    log_event(f"Mazgas: {req.targetNode} | Tekstas: {req.text[:30]}... | Voice: '{req.voice}' | Seed: {req.seed}", "DEBUG")
    try:
        node_url = await get_node_url(req.targetNode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    pause_farm(req.targetNode)
    log_event(f"GPU ferma ({req.targetNode}) užrakinta (paused_audio).", "INFO")
    
    try:
        voice_ref_path = None
        if req.voice and req.voice.strip():
            voice_ref_path = find_voice_file(req.voice.strip())
            if not voice_ref_path:
                log_event(f"ĮSPĖJIMAS: Pasirinktas balsas '{req.voice}' nerastas fiziniuose failuose.", "WARN")

        if voice_ref_path:
            log_event(f"Preview generavimas KLONAVIMO režimu (qwen_tts_clone.json) su: {voice_ref_path}", "INFO")
            audio_path = await call_comfyui_tts(node_url, req.text, voice_ref_path=voice_ref_path, seed=req.seed)
            gen_mode = "clone"
        elif req.prompt and req.prompt.strip():
            log_event(f"Preview generavimas DIZAINO režimu (qwen_tts_design.json) su prompt: {req.prompt[:50]}...", "INFO")
            audio_path = await call_comfyui_tts(node_url, req.text, prompt=req.prompt, seed=req.seed)
            gen_mode = "design"
        else:
            raise HTTPException(status_code=400, detail="Reikalingas arba balso failas klonavimui, arba tekstinis aprašymas (prompt) balso kūrimui.")

        filename = os.path.basename(audio_path)
        log_event(f"=== PREVIEW SĖKMINGAS ({gen_mode}): {filename} ===", "SUCCESS")
        
        # Paruošiame transkripciją AUDIO_DIR aplanke šalia sugeneruoto preview garso (neliečiant Voice Library)
        try:
            if req.text:
                txt_content = req.text.strip()
                with open(os.path.splitext(audio_path)[0] + ".txt", "w", encoding="utf-8") as tf:
                    tf.write(txt_content)
                log_event(f"Preview transkripcija paruošta AUDIO_DIR: {os.path.splitext(audio_path)[0]}.txt", "INFO")
        except Exception as copy_e:
            log_event(f"Įspėjimas išsaugant preview transkripciją: {copy_e}", "WARN")

        return {
            "status": "success",
            "url": f"/audio/{filename}",
            "filename": filename,
            "seed": req.seed,
            "mode": gen_mode,
            "voice": req.voice if gen_mode == "clone" else None
        }
    except HTTPException:
        raise
    except Exception as e:
        log_event(f"Preview generavimo klaida: {e}", "ERROR")
        log_event(traceback.format_exc(), "ERROR")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        resume_farm(req.targetNode)
        log_event(f"GPU ferma ({req.targetNode}) atrakinta.", "INFO")

class SavePreviewVoiceRequest(BaseModel):
    preview_filename: str
    voice_name: str
    ref_text: str = ""

@router.post("/api/audio/save_preview_as_voice")
async def save_preview_as_voice(req: SavePreviewVoiceRequest):
    log_event(f"=== IŠSAUGOMAS PREVIEW BALSAS Į BIBLIOTEKĄ: {req.preview_filename} -> {req.voice_name} ===", "INFO")
    if not req.voice_name or not req.preview_filename:
        raise HTTPException(status_code=400, detail="Voice name and preview filename are required")

    clean_name = os.path.basename(req.voice_name.strip())
    if not clean_name.lower().endswith(('.wav', '.mp3')):
        clean_name += ".wav"

    clean_preview = os.path.basename(req.preview_filename.strip().split('?')[0])
    src_path = os.path.join(AUDIO_DIR, clean_preview)
    if not os.path.exists(src_path):
        # Taip pat tikriname data/audio ar temp
        log_event(f"KLAIDA: Preview failas nerastas: {src_path}", "ERROR")
        raise HTTPException(status_code=404, detail=f"Preview audio file not found: {clean_preview}")

    dest_path = os.path.join(VOICES_DIR, clean_name)
    try:
        shutil.copyfile(src_path, dest_path)
        log_event(f"Balso failas nukopijuotas į Voice Library: {dest_path}", "SUCCESS")

        txt_content = (req.ref_text or "").strip()
        txt_path = os.path.splitext(dest_path)[0] + ".txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(txt_content)
        log_event(f"Balso transkripcijos failas išsaugotas: {txt_path}", "SUCCESS")

        return {"status": "success", "filename": clean_name}
    except Exception as e:
        log_event(f"Klaida išsaugant balsą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

# ATNAUJINTA APSAUGA NUO 422 KLAIDOS: Pridėtas validavimo užraktas ir numatytieji parametrai
class GenerateRequest(BaseModel):
    text: str = ""
    voice: Optional[str] = ""
    targetNode: str
    projectId: str = "demo_proj"
    sceneId: str = "full_script"
    sessionId: str = ""
    silenceMs: int = 300
    mode: str = "full_script" # 'full_script' arba 'by_scenes'
    scenesList: list[dict] = []

    @field_validator('projectId', 'sceneId')
    @classmethod
    def validate_strings(cls, v: str, info) -> str:
        if not v or "[object" in str(v) or str(v).strip() == "":
            if info.field_name == 'projectId':
                return "demo_proj"
            return "full_script"
        return str(v).strip()

@router.post("/api/audio/generate")
async def generate_full_audio(req: GenerateRequest):
    session_id = req.sessionId.strip() if req.sessionId and req.sessionId.strip() else str(uuid.uuid4())
    log_event(f"=== PRADEDAMAS PILNAS SCENARIJAUS GENERAVIMAS (Session: {session_id}, Mode: {req.mode}) ===", "INFO")
    log_event(f"Projektas: {req.projectId} | Scena: {req.sceneId} | Balsas: {req.voice or 'Multi-Voice'}", "INFO")
    
    try:
        node_url = await get_node_url(req.targetNode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    default_voice_path = find_voice_file(req.voice)
    if not default_voice_path and os.path.exists(VOICES_DIR):
        all_v = [os.path.join(VOICES_DIR, f) for f in os.listdir(VOICES_DIR) if f.lower().endswith(('.wav', '.mp3')) and os.path.isfile(os.path.join(VOICES_DIR, f))]
        narrator_cands = [p for p in all_v if "narrator" in os.path.basename(p).lower()]
        if narrator_cands:
            default_voice_path = narrator_cands[0]
        elif all_v:
            default_voice_path = all_v[0]

    voice_path = default_voice_path

    # Paruošiame elementus generavimui pagal pasirinktą režimą
    items_to_generate = []
    if req.mode == "by_scenes" and req.scenesList:
        log_event(f"Generavimas vykdomas PAGAL SCENAS ({len(req.scenesList)} scenų sąrašas)", "INFO")
        for idx, sc_item in enumerate(req.scenesList):
            sc_text = sc_item.get("text", "").strip()
            sc_id = str(sc_item.get("id", f"S{idx+1}"))
            sc_voice = sc_item.get("voice", "").strip()
            if sc_text:
                items_to_generate.append({
                    "id": sc_id,
                    "sceneId": sc_item.get("sceneId", sc_id),
                    "index": idx,
                    "name": sc_item.get("name", f"Scena {idx+1}"),
                    "character": sc_item.get("character", ""),
                    "dialogueIndex": sc_item.get("dialogueIndex"),
                    "voiceId": sc_item.get("voiceId", sc_voice),
                    "text": sc_text,
                    "voice": sc_voice
                })
    elif req.mode == "by_punctuation":
        log_event("Generavimas vykdomas PAGAL SKYRYBOS ŽENKLUS (griežtai nuo ženklo iki ženklo)", "INFO")
        chunks = split_text_by_punctuation(req.text)
        if not chunks:
            log_event("KLAIDA: Pateiktas tekstas yra tuščias arba netinkamas", "ERROR")
            raise HTTPException(status_code=400, detail="Text is empty or invalid")
        for i, c_text in enumerate(chunks):
            items_to_generate.append({
                "id": f"chunk_{i}",
                "sceneId": None,
                "index": i,
                "text": c_text
            })
    elif req.mode == "by_sentences":
        log_event("Generavimas vykdomas PAGAL SAKINIUS (. ! ? …)", "INFO")
        chunks = split_text_by_sentences(req.text)
        if not chunks:
            log_event("KLAIDA: Pateiktas tekstas yra tuščias arba netinkamas", "ERROR")
            raise HTTPException(status_code=400, detail="Text is empty or invalid")
        for i, c_text in enumerate(chunks):
            items_to_generate.append({
                "id": f"chunk_{i}",
                "sceneId": None,
                "index": i,
                "text": c_text
            })
    else:
        req.mode = "full_script"
        chunks = split_text_into_chunks(req.text)
        if not chunks:
            log_event("KLAIDA: Pateiktas tekstas yra tuščias arba netinkamas", "ERROR")
            raise HTTPException(status_code=400, detail="Text is empty or invalid")
        for i, c_text in enumerate(chunks):
            items_to_generate.append({
                "id": f"chunk_{i}",
                "sceneId": None,
                "index": i,
                "text": c_text
            })

    if not items_to_generate:
        log_event("KLAIDA: Nėra tekstų generavimui!", "ERROR")
        raise HTTPException(status_code=400, detail="No texts provided for audio generation")
        
    acquire_node_tts(req.targetNode)
    log_event(f"GPU ferma ({req.targetNode}) užrakinta masiniam generavimui.", "INFO")
    
    ACTIVE_AUDIO_SESSIONS[session_id] = {
        "node_url": node_url,
        "target_node": req.targetNode,
        "cancelled": False,
        "prompt_id": None
    }
    
    try:
        final_audio = AudioSegment.empty()
        silence = AudioSegment.silent(duration=max(50, req.silenceMs))
        chunk_records = []
        total_items = len(items_to_generate)
        
        for i, item in enumerate(items_to_generate):
            # Tikriname ar seansas nebuvo atšauktas
            if ACTIVE_AUDIO_SESSIONS.get(session_id, {}).get("cancelled"):
                log_event(f"Generavimas nutrauktas prieš dalį {i+1}/{total_items}", "WARN")
                raise asyncio.CancelledError("Generation was cancelled by user.")
                
            chunk_text = item["text"]
            chunk_scene_id = item.get("sceneId")
            chunk_voice = item.get("voice")
            chunk_voice_path = find_voice_file(chunk_voice) if chunk_voice else None
            if not chunk_voice_path:
                chunk_voice_path = voice_path
                
            if not chunk_voice_path or not os.path.isfile(chunk_voice_path):
                log_event(f"KLAIDA: Nerastas joks tinkamas balso failas daliai {i+1} ({chunk_voice or 'default'})!", "ERROR")
                raise HTTPException(status_code=400, detail=f"No valid voice file found for chunk {i+1} ({item.get('character', 'Narrator')})")
                    
            log_event(f"Apdorojama dalis {i+1} iš {total_items} (Scena: {chunk_scene_id or 'N/A'}, Personažas: {item.get('character', 'Narrator')}, Balsas: {os.path.basename(chunk_voice_path)})...", "INFO")
            chunk_temp_path = await call_comfyui_tts(node_url, chunk_text, voice_ref_path=chunk_voice_path, session_id=session_id)
            
            # Išsaugome nuolatinį chunk failą
            id_tag = chunk_scene_id.replace(' ', '_') if chunk_scene_id else f"{req.sceneId}_{i}"
            chunk_filename = f"chunk_{req.projectId}_{id_tag}_{uuid.uuid4().hex[:6]}.wav"
            permanent_chunk_path = os.path.join(AUDIO_DIR, chunk_filename)
            
            try:
                shutil.copyfile(chunk_temp_path, permanent_chunk_path)
                try: os.remove(chunk_temp_path)
                except: pass
            except Exception as e:
                permanent_chunk_path = chunk_temp_path
                chunk_filename = os.path.basename(chunk_temp_path)
            
            # Matuojame dalies trukmę
            chunk_dur = 0.0
            try:
                segment = AudioSegment.from_file(permanent_chunk_path)
                chunk_dur = round(len(segment) / 1000.0, 2)
            except Exception as dur_e:
                log_event(f"Nepavyko išmatuoti chunk trukmės: {dur_e}", "WARN")
                segment = AudioSegment.silent(duration=1000)

            chunk_record = {
                "id": f"chunk_{i}",
                "index": i,
                "sceneId": chunk_scene_id,
                "character": item.get("character", ""),
                "dialogueIndex": item.get("dialogueIndex"),
                "voiceId": item.get("voiceId", os.path.basename(chunk_voice_path)),
                "text": chunk_text,
                "voice": os.path.basename(chunk_voice_path),
                "duration": chunk_dur,
                "audio_url": f"/audio/{chunk_filename}",
                "url": f"/audio/{chunk_filename}",
                "filename": chunk_filename
            }
            chunk_records.append(chunk_record)
            
            log_event(f"Sujungiama sugeneruota dalis: {permanent_chunk_path} ({chunk_dur}s)", "DEBUG")
            final_audio += segment
            
            if i < total_items - 1:
                final_audio += silence

            # TIESIOGINIS REALAUS LAIKO PROGRESS PRANEŠIMAS Į FRONTENDĄ PER WEBSOCKET
            try:
                await manager.broadcast({
                    "type": "audio_chunk_progress",
                    "projectId": req.projectId,
                    "sessionId": session_id,
                    "current": i + 1,
                    "total": total_items,
                    "remaining": total_items - (i + 1),
                    "chunk": chunk_record,
                    "mode": req.mode
                })
            except Exception as b_err:
                log_event(f"Broadcast warning: {b_err}", "WARN")
                
        final_filename = f"{req.projectId}_{req.sceneId}_dialogue.wav"
        final_path = os.path.join(AUDIO_DIR, final_filename)
        
        log_event("Vykdomas galutinio failo eksportas...", "INFO")
        # Paskutinio sakinio pabaigoje: tolygus fade-out į visišką tylą, pašalinant bet kokius atsitiktinius garsus
        if len(final_audio) > 250:
            final_audio = final_audio.fade_out(200)
        final_audio += AudioSegment.silent(duration=300)
        final_audio.export(final_path, format="wav")
        
        log_event(f"=== PILNAS GENERAVIMAS BAIGTAS: {final_path} ({len(chunk_records)} chunks) ===", "SUCCESS")
        return {
            "status": "success", 
            "url": f"/audio/{final_filename}",
            "chunks": chunk_records,
            "sessionId": session_id,
            "mode": req.mode
        }
        
    except asyncio.CancelledError:
        log_event("Audio generavimas sėkmingai ATŠAUKTAS.", "WARN")
        return {"status": "cancelled", "message": "Audio generation cancelled by user", "chunks": chunk_records if 'chunk_records' in locals() else []}
    except Exception as e:
        log_event(f"KRITINĖ KLAIDA pilno generavimo metu: {e}", "ERROR")
        log_event(traceback.format_exc(), "ERROR")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ACTIVE_AUDIO_SESSIONS.pop(session_id, None)
        release_node_tts(req.targetNode)

# ============================================================================
# CANCELLATION ENDPOINT
# ============================================================================
class CancelRequest(BaseModel):
    sessionId: str = ""
    targetNode: str = ""

@router.post("/api/audio/cancel")
async def cancel_audio_generation(req: CancelRequest):
    log_event(f"Gauta užklausa atšaukti audio generavimą (Session: {req.sessionId}, Node: {req.targetNode})", "INFO")
    cancelled_any = False
    
    if req.sessionId and req.sessionId in ACTIVE_AUDIO_SESSIONS:
        ACTIVE_AUDIO_SESSIONS[req.sessionId]["cancelled"] = True
        node_url = ACTIVE_AUDIO_SESSIONS[req.sessionId].get("node_url")
        if node_url:
            await interrupt_comfyui_node(node_url)
        cancelled_any = True
        
    # Jei seanso ID nebuvo pateiktas, atšaukiame visus aktyvius seansus tam mazgui
    for sid, info in list(ACTIVE_AUDIO_SESSIONS.items()):
        if not req.targetNode or info.get("target_node") == req.targetNode:
            info["cancelled"] = True
            node_url = info.get("node_url")
            if node_url:
                await interrupt_comfyui_node(node_url)
            cancelled_any = True
            
    if req.targetNode:
        resume_farm(req.targetNode)
        try:
            node_url = await get_node_url(req.targetNode)
            await interrupt_comfyui_node(node_url)
        except:
            pass
            
    return {"status": "success", "message": "Cancellation request processed", "cancelled": cancelled_any}

# ============================================================================
# REGENERATE SINGLE CHUNK & RESTITCH
# ============================================================================
class RegenerateChunkRequest(BaseModel):
    projectId: str = "demo_proj"
    sceneId: str = "full_script"
    chunkIndex: int
    text: str
    voice: str
    targetNode: str
    allChunks: list[dict] = []
    silenceMs: int = 380
    transitionType: str = "smart_cadence" # "smart_cadence", "crossfade", "gap", "fade"
    transitionMs: int = 80
    trimSilence: bool = True
    trimThresholdDb: int = -42

@router.post("/api/audio/regenerate_chunk")
async def regenerate_single_chunk(req: RegenerateChunkRequest):
    log_event(f"=== PERGENERUOJAMA DALIS #{req.chunkIndex} (Projektas: {req.projectId}, Scena: {req.sceneId}) ===", "INFO")
    log_event(f"Tekstas: '{req.text[:40]}...' | Balsas: {req.voice} | Mazgas: {req.targetNode}", "DEBUG")
    
    try:
        node_url = await get_node_url(req.targetNode)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    voice_path = find_voice_file(req.voice)
    if not voice_path or not os.path.isfile(voice_path):
        log_event(f"Įspėjimas: Balso referencinis failas '{req.voice}' nerastas, bandoma surasti fallback balsą...", "WARN")
        voice_path = find_voice_file("narrator.wav")
        if not voice_path and os.path.exists(VOICES_DIR):
            avail = [os.path.join(VOICES_DIR, f) for f in os.listdir(VOICES_DIR) if f.lower().endswith(('.wav', '.mp3'))]
            if avail:
                voice_path = avail[0]

    if not voice_path or not os.path.isfile(voice_path):
        log_event(f"KLAIDA: Nerastas joks referencinis balso failas: {req.voice}", "ERROR")
        raise HTTPException(status_code=404, detail=f"Voice reference file not found: {req.voice}")
        
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text for chunk cannot be empty")
        
    acquire_node_tts(req.targetNode)
    log_event(f"GPU ferma ({req.targetNode}) užrakinta dalies pergeneravimui.", "INFO")
    
    session_id = f"regen_chunk_{req.chunkIndex}_{uuid.uuid4().hex[:6]}"
    ACTIVE_AUDIO_SESSIONS[session_id] = {
        "node_url": node_url,
        "target_node": req.targetNode,
        "cancelled": False
    }
    
    try:
        # Generuojame tik šią dalį
        chunk_temp_path = await call_comfyui_tts(node_url, req.text.strip(), voice_ref_path=voice_path, session_id=session_id)
        
        # Sukuriame naują failą
        new_filename = f"chunk_{req.projectId}_{req.sceneId}_{req.chunkIndex}_{uuid.uuid4().hex[:6]}.wav"
        new_chunk_path = os.path.join(AUDIO_DIR, new_filename)
        
        shutil.copyfile(chunk_temp_path, new_chunk_path)
        try: os.remove(chunk_temp_path)
        except: pass
        
        # Išmatuojame trukmę
        chunk_dur = 0.0
        try:
            c_seg = AudioSegment.from_file(new_chunk_path)
            chunk_dur = round(len(c_seg) / 1000.0, 2)
        except Exception as dur_e:
            log_event(f"Nepavyko išmatuoti sugeneruoto chunk trukmės: {dur_e}", "WARN")

        # Rūpinamės variacijomis (takes)
        old_chunk = {}
        chunks_list = list(req.allChunks) if req.allChunks else []
        if 0 <= req.chunkIndex < len(chunks_list) and isinstance(chunks_list[req.chunkIndex], dict):
            old_chunk = chunks_list[req.chunkIndex]

        variations = list(old_chunk.get("variations", [])) if isinstance(old_chunk.get("variations"), list) else []

        # Jei variacijų dar nebuvo, bet senas chunk turėjo audio failą, įtraukiame jį kaip Take #1
        if not variations and old_chunk.get("audio_url"):
            old_url = old_chunk.get("audio_url", "")
            variations.append({
                "id": f"var_take_1_{uuid.uuid4().hex[:4]}",
                "url": old_url,
                "filename": old_chunk.get("filename", os.path.basename(old_url.split('?')[0])),
                "duration": old_chunk.get("duration", 0),
                "createdAt": "Take #1",
                "isMain": False
            })

        # Visi ankstesni takes tampa nebe pagrindiniai
        for v in variations:
            v["isMain"] = False

        # Sukuriame naują Take
        take_num = len(variations) + 1
        new_var_id = f"var_take_{take_num}_{uuid.uuid4().hex[:4]}"
        new_var_entry = {
            "id": new_var_id,
            "url": f"/audio/{new_filename}",
            "filename": new_filename,
            "duration": chunk_dur,
            "createdAt": f"Take #{take_num}",
            "isMain": True
        }
        variations.append(new_var_entry)

        updated_chunk_obj = {
            **old_chunk,
            "id": old_chunk.get("id", f"chunk_{req.chunkIndex}"),
            "index": req.chunkIndex,
            "sceneId": old_chunk.get("sceneId"),
            "character": old_chunk.get("character"),
            "voice": req.voice or old_chunk.get("voice"),
            "voiceId": old_chunk.get("voiceId"),
            "text": req.text.strip(),
            "audio_url": f"/audio/{new_filename}",
            "filename": new_filename,
            "duration": chunk_dur,
            "mainId": new_var_id,
            "variations": variations
        }
        
        # Atnaujiname allChunks sąrašą
        if 0 <= req.chunkIndex < len(chunks_list):
            chunks_list[req.chunkIndex] = updated_chunk_obj
        else:
            chunks_list.append(updated_chunk_obj)
            
        # Automatiškai persiuvame visą garso takelį naudojant pažangų stitcher
        items_to_stitch = []
        for ch in chunks_list:
            ch_url = ch.get("audio_url", "")
            if not ch_url:
                continue
            ch_file = os.path.basename(ch_url.split('?')[0])
            full_ch_path = os.path.join(AUDIO_DIR, ch_file)
            
            if os.path.exists(full_ch_path):
                try:
                    seg = AudioSegment.from_file(full_ch_path)
                    items_to_stitch.append({"segment": seg, "text": ch.get("text", "")})
                except Exception as seg_err:
                    log_event(f"Klaida nuskaitant chunk failą {full_ch_path}: {seg_err}", "WARN")
            else:
                log_event(f"Įspėjimas: Dalies failas {full_ch_path} nerastas sujungimui", "WARN")
                
        final_audio = stitch_audio_segments(
            items=items_to_stitch,
            transition_type=req.transitionType,
            transition_ms=req.transitionMs,
            silence_ms=req.silenceMs,
            trim_silence=req.trimSilence,
            trim_threshold_db=float(req.trimThresholdDb)
        )
        
        final_filename = f"{req.projectId}_{req.sceneId}_dialogue.wav"
        final_path = os.path.join(AUDIO_DIR, final_filename)
        final_audio.export(final_path, format="wav")
        log_event(f"Visas takelis sėkmingai persiūtas: {final_path} (Trukme: {len(final_audio)/1000.0:.2f}s)", "SUCCESS")

        # Išsaugome atnaujintą chunk tiesiogiai į projekto JSON failą, kad nebūtų prarastas
        proj_path = os.path.join("data", "projects", f"{req.projectId}.json")
        if os.path.exists(proj_path):
            try:
                with open(proj_path, "r", encoding="utf-8") as pf:
                    pdata = json.load(pf)
                p_chunks = pdata.get("audioChunks", [])
                c_idx = next((i for i, c in enumerate(p_chunks) if c.get("index") == req.chunkIndex or str(c.get("id")) == str(updated_chunk_obj.get("id"))), -1)
                if c_idx >= 0:
                    p_chunks[c_idx] = updated_chunk_obj
                else:
                    p_chunks.append(updated_chunk_obj)
                pdata["audioChunks"] = p_chunks
                pdata["audioTrack"] = f"/audio/{final_filename}"
                with open(proj_path, "w", encoding="utf-8") as pf:
                    json.dump(pdata, pf, indent=2, ensure_ascii=False)
            except Exception as pe:
                log_event(f"Įspėjimas atnaujinant projekto failą: {pe}", "WARN")
            
        return {
            "status": "success",
            "chunkIndex": req.chunkIndex,
            "chunk": updated_chunk_obj,
            "allChunks": chunks_list,
            "masterAudioUrl": f"/audio/{final_filename}?t={int(datetime.now().timestamp())}",
            "durationSec": round(len(final_audio) / 1000.0, 2)
        }
        
    except Exception as e:
        log_event(f"Klaida pergeneruojant dalį #{req.chunkIndex}: {e}", "ERROR")
        log_event(traceback.format_exc(), "ERROR")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ACTIVE_AUDIO_SESSIONS.pop(session_id, None)
        release_node_tts(req.targetNode)

# ============================================================================
# TEXT SPLIT PREVIEW ENDPOINT (BY PUNCTUATION, SENTENCES, OR CHUNKS)
# ============================================================================
@router.post("/api/audio/split_preview")
async def preview_text_splits(request: Request):
    data = await request.json()
    text = data.get("text", "").strip()
    mode = data.get("mode", "by_punctuation")
    if mode == "by_punctuation":
        chunks = split_text_by_punctuation(text)
    elif mode == "by_sentences":
        chunks = split_text_by_sentences(text)
    else:
        chunks = split_text_into_chunks(text)
    return {"status": "success", "mode": mode, "chunks": chunks, "count": len(chunks)}

# ============================================================================
# RESTITCH ALL CHUNKS ENDPOINT
# ============================================================================
class RestitchRequest(BaseModel):
    projectId: str = "demo_proj"
    sceneId: str = "full_script"
    chunks: list[dict]
    silenceMs: int = 380
    transitionType: str = "smart_cadence" # "smart_cadence", "crossfade", "gap", "fade"
    transitionMs: int = 80
    trimSilence: bool = True
    trimThresholdDb: int = -42

@router.post("/api/audio/restitch")
async def restitch_chunks(req: RestitchRequest):
    log_event(f"=== PERSIUVAMI VISI CHUNKS ({len(req.chunks)} vnt., transition={req.transitionType}, trimSilence={req.trimSilence}) ===", "INFO")
    try:
        items_to_stitch = []
        for idx, ch in enumerate(req.chunks):
            ch_url = ch.get("audio_url", "")
            if not ch_url:
                continue
            ch_file = os.path.basename(ch_url.split('?')[0])
            full_ch_path = os.path.join(AUDIO_DIR, ch_file)
            
            if os.path.exists(full_ch_path):
                try:
                    seg = AudioSegment.from_file(full_ch_path)
                    items_to_stitch.append({"segment": seg, "text": ch.get("text", "")})
                except Exception as read_err:
                    log_event(f"Klaida skaitant chunk {full_ch_path}: {read_err}", "WARN")
            else:
                log_event(f"Įspėjimas: Dalies failas {full_ch_path} nerastas", "WARN")
                
        if not items_to_stitch:
            raise HTTPException(status_code=400, detail="No valid audio chunks found to stitch")
            
        final_audio = stitch_audio_segments(
            items=items_to_stitch,
            transition_type=req.transitionType,
            transition_ms=req.transitionMs,
            silence_ms=req.silenceMs,
            trim_silence=req.trimSilence,
            trim_threshold_db=float(req.trimThresholdDb)
        )
        
        final_filename = f"{req.projectId}_{req.sceneId}_dialogue.wav"
        final_path = os.path.join(AUDIO_DIR, final_filename)
        final_audio.export(final_path, format="wav")
        
        log_event(f"Sėkmingai persiūtas garso takelis: {final_path} (Trukme: {len(final_audio)/1000.0:.2f}s)", "SUCCESS")
        return {
            "status": "success",
            "masterAudioUrl": f"/audio/{final_filename}?t={int(datetime.now().timestamp())}",
            "durationSec": round(len(final_audio) / 1000.0, 2)
        }
    except Exception as e:
        log_event(f"Klaida persiuvant chunks: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/audio/upload_track")
async def upload_audio_track(file: UploadFile = File(...)):
    log_event(f"Gauta užklausa įkelti failą/takelį projektui: {file.filename}", "INFO")
    allowed_exts = ('.wav', '.mp3', '.ogg', '.m4a', '.flac', '.webm', '.mp4', '.png', '.jpg', '.jpeg')
    if not file.filename.lower().endswith(allowed_exts):
        raise HTTPException(status_code=400, detail=f"Palaikomi tik {allowed_exts} failai")
    try:
        clean_name = f"track_{uuid.uuid4().hex[:8]}_{os.path.basename(file.filename)}"
        file_path = os.path.join(AUDIO_DIR, clean_name)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        log_event(f"Failas išsaugotas: {file_path}", "SUCCESS")
        return {"status": "success", "filename": clean_name, "url": f"/audio/{clean_name}"}
    except Exception as e:
        log_event(f"Klaida išsaugant failą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/audio/tracks")
async def list_audio_tracks():
    tracks = []
    if os.path.exists(AUDIO_DIR):
        audio_exts = ('.mp3', '.wav', '.ogg', '.m4a', '.flac')
        for fname in os.listdir(AUDIO_DIR):
            if fname.lower().endswith(audio_exts):
                fpath = os.path.join(AUDIO_DIR, fname)
                if os.path.isfile(fpath):
                    try:
                        sz = os.path.getsize(fpath)
                        mtime = os.path.getmtime(fpath)
                        display_name = fname
                        if fname.startswith("track_") and len(fname) > 15:
                            display_name = fname[15:]
                        tracks.append({
                            "filename": fname,
                            "name": display_name,
                            "url": f"/audio/{fname}",
                            "size": sz,
                            "mtime": mtime
                        })
                    except Exception:
                        pass
        tracks.sort(key=lambda x: x.get("mtime", 0), reverse=True)
    return {"status": "success", "tracks": tracks}

@router.delete("/api/audio/tracks/{filename}")
async def delete_audio_track(filename: str):
    safe_name = os.path.basename(filename)
    fpath = os.path.join(AUDIO_DIR, safe_name)
    if os.path.exists(fpath):
        try:
            os.remove(fpath)
            return {"status": "success", "message": f"Takelis {safe_name} ištrintas"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    return JSONResponse(status_code=404, content={"status": "error", "message": "Failas nerastas"})

# ============================================================================
# DEDICATED BGM (FONINĖ MUZIKA) ENDPOINTS & FOLDER LIBRARY
# ============================================================================

_BGM_INFO_CACHE: Dict[str, Dict[str, Any]] = {}

FOLDER_ICONS = {
    "siaubas": "👻",
    "horror": "👻",
    "baisu": "👻",
    "scary": "👻",
    "epika": "⚔️",
    "veiksmas": "⚔️",
    "epic": "⚔️",
    "action": "⚔️",
    "drama": "🎭",
    "emocijos": "🎭",
    "sad": "🎭",
    "liūdna": "🎭",
    "rami": "🍃",
    "pozityvi": "🍃",
    "calm": "🍃",
    "peaceful": "🍃",
    "relax": "🍃",
    "ambient": "🍃",
    "komedija": "🎪",
    "animacija": "🎪",
    "comedy": "🎪",
    "funny": "🎪",
    "smagu": "🎪",
    "fantastika": "🚀",
    "sci-fi": "🚀",
    "cyberpunk": "🚀",
    "meilė": "❤️",
    "romantika": "❤️",
    "love": "❤️",
    "trileris": "⚡",
    "suspense": "⚡",
    "paslaptinga": "🔮",
    "mystery": "🔮",
    "bendra": "📁",
    "pagrindinis": "📁",
}

def get_folder_icon(folder_name: str) -> str:
    low = folder_name.lower()
    for kw, icon in FOLDER_ICONS.items():
        if kw in low:
            return icon
    return "📁"

def get_track_audio_info(fpath: str) -> dict:
    try:
        st = os.stat(fpath)
        mtime = st.st_mtime
        size = st.st_size
    except Exception:
        return {"duration": 0.0, "file_size": 0, "mtime": 0}

    cache_key = f"{fpath}_{mtime}_{size}"
    if cache_key in _BGM_INFO_CACHE:
        return _BGM_INFO_CACHE[cache_key]

    duration = 0.0
    if sf is not None:
        try:
            info = sf.info(fpath)
            duration = round(float(info.duration), 2)
        except Exception:
            pass

    if duration <= 0:
        try:
            seg = AudioSegment.from_file(fpath)
            duration = round(len(seg) / 1000.0, 2)
        except Exception:
            pass

    res = {"duration": duration, "file_size": size, "mtime": mtime}
    _BGM_INFO_CACHE[cache_key] = res
    return res

def scan_bgm_library() -> dict:
    """
    Skenuoja visą BGM_DIR direktoriją ir jos poaplankius, suderindamas su SQLite DB.
    Leidžia vartotojui tiesiogiai įkelti/įmesti dainas į kompiuterio aplankus (pvz. 'Siaubas (Horror)').
    """
    os.makedirs(BGM_DIR, exist_ok=True)
    db_map = {}
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, name, filename, url, duration, file_size FROM bgm_tracks")
        for r in c.fetchall():
            fn = r["filename"].replace("\\", "/").lstrip("/")
            db_map[fn] = dict(r)
        conn.close()
    except Exception as e:
        log_event(f"Klaida nuskaitant bgm_tracks DB: {e}", "WARN")

    allowed_exts = ('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma')

    # Nuskaitome tiesioginius poaplankius
    subfolders = []
    for item in os.listdir(BGM_DIR):
        p = os.path.join(BGM_DIR, item)
        if os.path.isdir(p) and not item.startswith("."):
            subfolders.append(item)
    subfolders.sort(key=lambda s: s.lower())

    tracks = []
    folder_counts = {sf: 0 for sf in subfolders}
    folder_counts["__root__"] = 0

    for root, dirs, files in os.walk(BGM_DIR):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        rel_dir = os.path.relpath(root, BGM_DIR).replace("\\", "/")
        if rel_dir == ".":
            folder_id = "__root__"
            folder_name = "Pagrindinis"
        else:
            folder_id = rel_dir
            folder_name = os.path.basename(rel_dir)

        for fn in files:
            if not fn.lower().endswith(allowed_exts):
                continue

            full_p = os.path.join(root, fn)
            rel_file = os.path.relpath(full_p, BGM_DIR).replace("\\", "/")

            audio_info = get_track_audio_info(full_p)
            db_entry = db_map.get(rel_file) or db_map.get(fn)

            if db_entry:
                track_id = db_entry["id"]
                track_name = db_entry["name"]
                duration = db_entry["duration"] or audio_info["duration"]
            else:
                clean_name = os.path.splitext(fn)[0]
                if clean_name.startswith("bgm_") and len(clean_name) > 15 and clean_name[14] == "_":
                    clean_name = clean_name[15:]
                track_name = clean_name.replace("_", " ").strip() or fn
                track_id = f"disk_{hashlib.md5(rel_file.encode('utf-8')).hexdigest()[:10]}"
                duration = audio_info["duration"]

            url_path = "/bgm/" + "/".join(urllib.parse.quote(seg) for seg in rel_file.split("/"))

            track = {
                "id": track_id,
                "name": track_name,
                "filename": fn,
                "rel_path": rel_file,
                "folder_id": folder_id,
                "folder_name": folder_name,
                "url": url_path,
                "duration": duration,
                "file_size": audio_info["file_size"],
                "mtime": audio_info.get("mtime", 0)
            }
            tracks.append(track)
            folder_counts[folder_id] = folder_counts.get(folder_id, 0) + 1

    tracks.sort(key=lambda t: t.get("mtime", 0), reverse=True)

    folders_list = [
        {
            "id": "all",
            "name": "Visos dainos",
            "icon": "🎧",
            "count": len(tracks)
        },
        {
            "id": "__root__",
            "name": "Pagrindinis (Bendra)",
            "icon": "📁",
            "count": folder_counts.get("__root__", 0)
        }
    ]

    for sf in subfolders:
        folders_list.append({
            "id": sf,
            "name": sf,
            "icon": get_folder_icon(sf),
            "count": folder_counts.get(sf, 0)
        })

    return {
        "status": "success",
        "folders": folders_list,
        "tracks": tracks,
        "total": len(tracks)
    }

@router.get("/api/audio/bgm/library")
async def get_bgm_library():
    """Grąžina visus BGM aplankus ir dainų sąrašą su meta-duomenimis."""
    return scan_bgm_library()

@router.get("/api/audio/bgm/tracks")
async def list_bgm_tracks():
    """Suderinamumo galinis taškas - grąžina visus BGM takelius iš visų aplankų."""
    lib = scan_bgm_library()
    return {"status": "success", "tracks": lib["tracks"]}

class OpenBgmFolderReq(BaseModel):
    folder: Optional[str] = ""

@router.post("/api/audio/bgm/open_folder")
async def open_bgm_folder(req: OpenBgmFolderReq):
    """
    Atidaro pasirinktą BGM aplanką tiesiogiai vartotojo kompiuteryje (Windows Explorer).
    Leidžia patogiai nuvilkti (drag & drop) naujus garso failus.
    """
    target_dir = BGM_DIR
    if req.folder and req.folder not in ("all", "__root__"):
        safe_rel = os.path.normpath(req.folder).lstrip("\\/.")
        cand = os.path.join(BGM_DIR, safe_rel)
        if os.path.isdir(cand):
            target_dir = cand
    os.makedirs(target_dir, exist_ok=True)
    try:
        os.startfile(target_dir)
        log_event(f"Atidarytas BGM aplankas kompiuteryje: {target_dir}", "INFO")
        return {"status": "success", "opened_path": target_dir}
    except Exception as e:
        log_event(f"Nepavyko atidaryti BGM aplanko {target_dir}: {e}", "ERROR")
        return {"status": "error", "message": str(e)}

class CreateBgmFolderReq(BaseModel):
    folder_name: str

@router.post("/api/audio/bgm/create_folder")
async def create_bgm_folder(req: CreateBgmFolderReq):
    """Sukuria naują muzikos kategorijos aplanką BGM direktorijoje."""
    raw_name = req.folder_name.strip()
    if not raw_name:
        raise HTTPException(status_code=400, detail="Aplanko pavadinimas negali būti tuščias")
    safe_name = re.sub(r'[\\/:*?"<>|]', '', raw_name).strip()
    if not safe_name:
        raise HTTPException(status_code=400, detail="Netinkamas aplanko pavadinimas")
    target_path = os.path.join(BGM_DIR, safe_name)
    os.makedirs(target_path, exist_ok=True)
    log_event(f"Sukurtas naujas BGM aplankas: {safe_name}", "SUCCESS")
    return {"status": "success", "folder": safe_name, "path": target_path}

@router.post("/api/audio/bgm/upload")
async def upload_bgm_track(file: UploadFile = File(...), folder: Optional[str] = Form(None)):
    log_event(f"Gauta užklausa įkelti BGM takelį: {file.filename} (Aplankas: {folder})", "INFO")
    allowed_exts = ('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma')
    clean_orig = os.path.basename(file.filename)
    if not clean_orig.lower().endswith(allowed_exts):
        raise HTTPException(status_code=400, detail=f"Netinkamas garso formatas. Palaikomi: {allowed_exts}")

    dest_dir = BGM_DIR
    target_subfolder = ""
    if folder and folder.strip() and folder not in ("all", "__root__"):
        safe_folder = re.sub(r'[\\/:*?"<>|]', '', folder.strip())
        if safe_folder:
            dest_dir = os.path.join(BGM_DIR, safe_folder)
            os.makedirs(dest_dir, exist_ok=True)
            target_subfolder = safe_folder

    track_id = f"bgm_{uuid.uuid4().hex[:10]}"
    ext = os.path.splitext(clean_orig)[1].lower()
    base_name = os.path.splitext(clean_orig)[0]
    safe_base = re.sub(r'[^a-zA-Z0-9_\-\.\s]', '', base_name).strip() or "track"
    saved_filename = f"{track_id}_{safe_base}{ext}"
    file_path = os.path.join(dest_dir, saved_filename)
    
    try:
        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)
        file_size = len(content)
        
        # Apskaičiuojame tikslią trukmę
        audio_info = get_track_audio_info(file_path)
        duration = audio_info["duration"]
        
        rel_path = os.path.join(target_subfolder, saved_filename).replace("\\", "/") if target_subfolder else saved_filename
        url = "/bgm/" + "/".join(urllib.parse.quote(seg) for seg in rel_path.split("/"))
        
        # Įrašome į SQLite bgm_tracks duomenų bazę
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT INTO bgm_tracks (id, name, filename, url, duration, file_size)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (track_id, base_name, rel_path, url, duration, file_size))
        conn.commit()
        conn.close()
        
        log_event(f"BGM takelis sėkmingai išsaugotas į DB: {rel_path} ({duration}s)", "SUCCESS")
        return {
            "status": "success",
            "track": {
                "id": track_id,
                "name": base_name,
                "filename": saved_filename,
                "rel_path": rel_path,
                "folder": target_subfolder or "Pagrindinis",
                "url": url,
                "duration": duration,
                "file_size": file_size
            }
        }
    except Exception as e:
        log_event(f"Klaida įkeliant BGM failą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/audio/bgm/tracks/{track_id:path}")
async def delete_bgm_track(track_id: str):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT filename FROM bgm_tracks WHERE id = ?", (track_id,))
        row = c.fetchone()
        
        deleted_file = False
        if row:
            filename = row["filename"]
            fpath = os.path.join(BGM_DIR, filename)
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                    deleted_file = True
                except Exception as fe:
                    log_event(f"Klaida trinant fizinį failą {fpath}: {fe}", "WARN")
            c.execute("DELETE FROM bgm_tracks WHERE id = ?", (track_id,))
            conn.commit()
        conn.close()

        # Jei tai buvo diske rastas failas (track_id prasideda disk_) arba failas nebuvo DB
        if not deleted_file:
            # Bandome surasti pagal visus failus BGM_DIR
            for root, dirs, files in os.walk(BGM_DIR):
                for f in files:
                    full_p = os.path.join(root, f)
                    rel_f = os.path.relpath(full_p, BGM_DIR).replace("\\", "/")
                    disk_id = f"disk_{hashlib.md5(rel_f.encode('utf-8')).hexdigest()[:10]}"
                    if disk_id == track_id or rel_f == track_id or f == track_id:
                        try:
                            os.remove(full_p)
                            deleted_file = True
                            log_event(f"Ištrintas disko BGM failas: {full_p}", "INFO")
                            break
                        except Exception as fe:
                            log_event(f"Klaida trinant disko failą {full_p}: {fe}", "WARN")
                if deleted_file:
                    break

        # Išvalome kešą
        _BGM_INFO_CACHE.clear()
        return {"status": "success", "message": "Takelis pašalintas"}
    except Exception as e:
        log_event(f"Klaida trinant BGM takelį: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# SMART AI BGM GENERATOR (MINIMAX MUSIC 3 + OLLAMA INTEGRATION)
# ============================================================================

async def find_available_comfy_node_url(requested_node_id: str = None) -> str:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    if requested_node_id:
        c.execute("SELECT url FROM nodes WHERE id = ?", (requested_node_id,))
        r = c.fetchone()
        if r and r["url"]:
            conn.close()
            return r["url"].rstrip('/')
    c.execute("SELECT id, url FROM nodes")
    rows = c.fetchall()
    conn.close()
    for row in rows:
        u = row["url"].rstrip('/')
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(f"{u}/system_stats", timeout=aiohttp.ClientTimeout(total=2)) as resp:
                    if resp.status == 200:
                        return u
        except Exception:
            continue
    return "http://127.0.0.1:8188"

@router.get("/api/audio/bgm/ollama_models")
async def list_ollama_models(ollama_url: str = "http://localhost:11434"):
    models = []
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{ollama_url.rstrip('/')}/api/tags", timeout=aiohttp.ClientTimeout(total=4)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    for m in data.get("models", []):
                        models.append(m.get("name"))
    except Exception as e:
        log_event(f"Klaida nuskaitant Ollama modelius: {e}", "WARN")
    if not models:
        models = ["qwen2.5:3b", "dolphin-llama3:latest", "qwen2.5vl:7b"]
    return {"status": "success", "models": models}

class BgmPromptFromProjectReq(BaseModel):
    project_id: str | None = None
    story_summary: str | None = None
    genre: str | None = "cinematic"
    custom_mood: str | None = None
    model: str | None = "qwen2.5:3b"
    ollama_url: str | None = "http://localhost:11434"

@router.post("/api/audio/bgm/prompt_from_project")
async def generate_bgm_prompt_from_project(req: BgmPromptFromProjectReq):
    project_context = ""
    target_dur = 60
    if req.project_id:
        proj_path = os.path.join(PROJECTS_DIR, f"{req.project_id}.json")
        if os.path.exists(proj_path):
            try:
                with open(proj_path, "r", encoding="utf-8") as pf:
                    proj = json.load(pf)
                    p_name = proj.get("name", "")
                    scenes = proj.get("scenes", [])
                    tl = proj.get("timeline") or proj.get("scenesTimeline") or []
                    calc_dur = sum(float(t.get("dur", 4.0)) for t in tl) if tl else len(scenes) * 4.0
                    if calc_dur > 10:
                        target_dur = int(min(180, max(30, calc_dur)))
                    
                    sc_texts = []
                    for s in scenes[:12]:
                        p = s.get("prompt") or ""
                        t = s.get("text") or ""
                        sc_texts.append(f"- Scene #{s.get('id')}: {p[:120]} (Text: {t[:60]})")
                    project_context = f"Project: {p_name}\nStory Overview:\n" + "\n".join(sc_texts)
            except Exception as pe:
                log_event(f"Klaida nuskaitant projektą muzikos promptui: {pe}", "WARN")

    if not project_context:
        project_context = req.story_summary or "Atmospheric cinematic video story, mysterious mood with narrative progression."

    genre_str = req.genre or "cinematic"
    mood_str = req.custom_mood or "atmospheric, deep, rich emotional storytelling"

    system_prompt = (
        "You are an elite Hollywood music supervisor and sound designer.\n"
        "Your task is to write a structured soundtrack prompt for MiniMax Music 3 AI music generator.\n"
        "CRITICAL RULES:\n"
        "1. STRICTLY INSTRUMENTAL ONLY. No singing, no vocals, no humming, no spoken words, no choir.\n"
        "2. The music must be designed with a seamless looping structure (Intro and Outro match harmonically and dynamically so it can loop smoothly without harsh cuts).\n"
        "3. Output ONLY a valid JSON object matching this schema:\n"
        "{\n"
        '  "title": "Creative Track Title",\n'
        '  "genre": "e.g. Cinematic Ambient / Lo-Fi / Dark Synthwave",\n'
        '  "bpm": 75,\n'
        '  "caption": "Global Metadata: [Genre, BPM, Key, mood, emotional curve, production texture, mix style].\\n\\nVocal Details: Strictly Instrumental. No vocals, no voices, no humming, no spoken words. 100% pure instrumental background soundtrack.\\n\\nArrangement: [Instruments: drums/percussion, bass, pads, leads. Section breakdown: Intro, Main theme, Peak/Build, Outro with seamless loop harmony].",\n'
        '  "lyrics": "[Intro]\\n[Instrumental]\\n(subtle harmonic fade in)\\n\\n[Build]\\n[Instrumental]\\n(steady pulse and rhythmic groove)\\n\\n[Theme]\\n[Instrumental]\\n(main melodic atmosphere)\\n\\n[Breakdown]\\n[Instrumental]\\n(drums ease back)\\n\\n[Outro]\\n[Instrumental]\\n(resolving to initial ambient bed for seamless looping)"\n'
        "}"
    )

    user_prompt = (
        f"Video Genre/Style requested: {genre_str}\n"
        f"Mood / Ambience: {mood_str}\n"
        f"Target Duration: {target_dur} seconds (designed to loop seamlessly)\n"
        f"Project Story Details:\n{project_context}\n\n"
        "Generate the MiniMax Music 3 JSON prompt now."
    )

    ollama_url = (req.ollama_url or "http://localhost:11434").rstrip("/")
    model_name = req.model or "qwen2.5:3b"

    try:
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": False,
            "format": "json",
            "options": {
                "temperature": 0.4
            }
        }
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{ollama_url}/api/chat", json=payload, timeout=aiohttp.ClientTimeout(total=45)) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    content = res_json.get("message", {}).get("content", "{}")
                    parsed = json.loads(content)
                    return {
                        "status": "success",
                        "prompt": parsed,
                        "suggested_duration": target_dur
                    }
                else:
                    err_t = await resp.text()
                    raise Exception(f"Ollama HTTP {resp.status}: {err_t}")
    except Exception as e:
        log_event(f"Ollama muzikos prompto klaida: {e}. Naudojamas etaloninis šablonas.", "WARN")
        fallback = {
            "title": f"Cinematic {genre_str.title()} Score",
            "genre": genre_str,
            "bpm": 80,
            "caption": (
                f"Global Metadata: {genre_str.title()}, {mood_str}. 80 BPM, D minor. "
                "Atmospheric and engaging, building gradual cinematic tension with lush analog textures. "
                "Deep warm sub bass, organic acoustic elements, pristine stereo master production.\n\n"
                "Vocal Details: Strictly Instrumental. No vocals, no voices, no humming, no spoken words. 100% pure instrumental background soundtrack.\n\n"
                "Arrangement: Warm sub bass, subtle brushed drums with lazy swing, atmospheric reverb pads, cinematic piano accents. "
                "Intro: atmospheric swell fading in. Middle: steady groove and emotional harmony. "
                "Outro: elements gently resolve to a calm continuous bed ready for seamless crossfade looping."
            ),
            "lyrics": (
                "[Intro]\n[Instrumental]\n(soft atmospheric swell)\n\n"
                "[Build]\n[Instrumental]\n(rhythmic bass groove enters)\n\n"
                "[Theme]\n[Instrumental]\n(deep melodic pads and textures)\n\n"
                "[Outro]\n[Instrumental]\n(calm ambient outro for seamless looping)"
            )
        }
        return {
            "status": "success",
            "prompt": fallback,
            "suggested_duration": target_dur,
            "fallback": True,
            "error_detail": str(e)
        }

class GenerateMinimaxBgmReq(BaseModel):
    caption: str
    lyrics: str
    duration: int = 60
    steps: int = 25
    cfg_scale: float = 1.7
    seed: int | None = None
    track_name: str | None = None
    node_id: str | None = None


@router.post("/api/audio/bgm/check_latest_comfy")
async def check_latest_comfy_track():
    node_url = await find_available_comfy_node_url()
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(f"{node_url}/history", timeout=aiohttp.ClientTimeout(total=4)) as resp:
                if resp.status != 200:
                    raise Exception(f"ComfyUI history HTTP {resp.status}")
                history = await resp.json()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Nepavyko susisiekti su ComfyUI istorija: {e}")

        # Ieškome paskutinio sugeneruoto minimax audio
        latest_item = None
        for pid, data in reversed(list(history.items())):
            outputs = data.get("outputs", {})
            for k, out_v in outputs.items():
                if isinstance(out_v, dict) and "audio" in out_v:
                    for a_file in out_v["audio"]:
                        fn = a_file.get("filename", "")
                        if "minimax" in fn.lower() or "audio" in fn.lower():
                            latest_item = a_file
                            break
                if latest_item:
                    break
            if latest_item:
                break

        if not latest_item:
            raise HTTPException(status_code=404, detail="ComfyUI istorijoje nerasta neseniai sugeneruotų garso failų.")

        fn = latest_item["filename"]
        sub = latest_item.get("subfolder", "")
        f_type = latest_item.get("type", "output")
        dl_url = f"{node_url}/view?filename={fn}&subfolder={sub}&type={f_type}"

        track_id = f"bgm_{uuid.uuid4().hex[:10]}"
        base_name = f"MiniMax_Recovered_{fn[:16]}"
        safe_base = re.sub(r'[^a-zA-Z0-9_\-\.\s]', '', base_name).strip() or "track"
        ext = os.path.splitext(fn)[1].lower() or ".mp3"
        saved_filename = f"{track_id}_{safe_base}{ext}"
        saved_path = os.path.join(BGM_DIR, saved_filename)

        async with session.get(dl_url, timeout=aiohttp.ClientTimeout(total=30)) as dl_resp:
            if dl_resp.status != 200:
                raise Exception(f"Nepavyko atsisiųsti failo iš ComfyUI: HTTP {dl_resp.status}")
            content = await dl_resp.read()
            with open(saved_path, "wb") as bf:
                bf.write(content)

        file_size = len(content)
        duration = 60.0
        try:
            audio_seg = AudioSegment.from_file(saved_path)
            duration = round(len(audio_seg) / 1000.0, 2)
        except Exception:
            pass

        url = f"/bgm/{saved_filename}"

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT INTO bgm_tracks (id, name, filename, url, duration, file_size)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (track_id, base_name, saved_filename, url, duration, file_size))
        conn.commit()
        conn.close()

        log_event(f"Atkurtas paskutinis MiniMax Music 3 takelis: {saved_filename} ({duration}s)", "SUCCESS")
        return {
            "status": "success",
            "track": {
                "id": track_id,
                "name": base_name,
                "filename": saved_filename,
                "url": url,
                "duration": duration,
                "file_size": file_size
            }
        }

@router.post("/api/audio/bgm/generate_minimax")
async def generate_minimax_bgm(req: GenerateMinimaxBgmReq):
    node_url = await find_available_comfy_node_url(req.node_id)
    log_event(f"Pradedamas MiniMax Music 3 generavimas per {node_url} (Trukmė: {req.duration}s, Žingsniai: {req.steps})", "INFO")

    workflow_path = os.path.join(DATA_DIR, "workflows", "music_minimax_3.json")
    if not os.path.exists(workflow_path):
        workflow_path = r"D:\Downloads\music\audio_minimax_music_3 (2).json"
    if not os.path.exists(workflow_path):
        raise HTTPException(status_code=404, detail="MiniMax Music 3 workflow failas nerastas")

    with open(workflow_path, "r", encoding="utf-8") as wf:
        prompt_workflow = json.load(wf)

    seed = req.seed if (req.seed is not None and req.seed > 0) else random.randint(100000000000, 99999999999999)

    # Nustatome parametrus
    if "37:13" in prompt_workflow:
        prompt_workflow["37:13"]["inputs"]["caption"] = req.caption
        prompt_workflow["37:13"]["inputs"]["lyrics"] = req.lyrics
        prompt_workflow["37:13"]["inputs"]["max_duration"] = int(max(10, min(300, req.duration)))
        prompt_workflow["37:13"]["inputs"]["cfg_scale"] = float(req.cfg_scale or 1.7)
    
    if "37:38" in prompt_workflow:
        prompt_workflow["37:38"]["inputs"]["seed"] = seed

    if "37:9" in prompt_workflow:
        prompt_workflow["37:9"]["inputs"]["steps"] = int(max(10, min(50, req.steps or 25)))
        prompt_workflow["37:9"]["inputs"]["cfg"] = float(req.cfg_scale or 1.7)

    prefix = f"audio/minimax_music3_{uuid.uuid4().hex[:6]}"
    if "35" in prompt_workflow:
        prompt_workflow["35"]["inputs"]["filename_prefix"] = prefix

    if "37:6" in prompt_workflow:
        prompt_workflow["37:6"]["inputs"]["weight_dtype"] = "fp8_e4m3fn"

    client_id = f"sceneui_music_{uuid.uuid4().hex[:8]}"
    payload = {"prompt": prompt_workflow, "client_id": client_id}

    async with aiohttp.ClientSession() as session:
        # Atlaisviname VRAM nuo nenaudojamu modeliu, kad MiniMax Music tilptu tiesiai i GPU
        try:
            async with session.post(f"{node_url}/free", json={"unload_models": True, "free_memory": True}, timeout=aiohttp.ClientTimeout(total=4)) as fr:
                pass
        except Exception:
            pass

        try:
            async with session.post(f"{node_url}/prompt", json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    err_txt = await resp.text()
                    raise Exception(f"ComfyUI /prompt klaida (HTTP {resp.status}): {err_txt}")
                prompt_res = await resp.json()
        except Exception as pe:
            log_event(f"Klaida siunčiant į ComfyUI: {pe}", "ERROR")
            raise HTTPException(status_code=500, detail=f"Nepavyko susisiekti su ComfyUI: {pe}")

        if "error" in prompt_res:
            raise HTTPException(status_code=500, detail=f"ComfyUI grąžino klaidą: {prompt_res.get('error')}")

        prompt_id = prompt_res.get("prompt_id")
        log_event(f"MiniMax Music 3 užklausa priimta. Prompt ID: {prompt_id}. Laukiama generavimo...", "INFO")

        target_file = None
        for _ in range(450):
            await asyncio.sleep(2)
            try:
                async with session.get(f"{node_url}/history/{prompt_id}", timeout=aiohttp.ClientTimeout(total=5)) as h_resp:
                    if h_resp.status == 200:
                        h_data = await h_resp.json()
                        if prompt_id in h_data:
                            entry = h_data[prompt_id]
                            if entry.get("status", {}).get("status_str") == "error":
                                msgs = entry.get("status", {}).get("messages", [])
                                raise Exception(f"ComfyUI vykdymo klaida: {msgs}")
                            
                            outputs = entry.get("outputs", {})
                            for k, out_v in outputs.items():
                                if isinstance(out_v, dict):
                                    for m_key, f_list in out_v.items():
                                        if isinstance(f_list, list) and len(f_list) > 0:
                                            for item in f_list:
                                                if isinstance(item, dict) and "filename" in item:
                                                    target_file = item
                                                    break
                            if target_file:
                                break
            except Exception as he:
                if "ComfyUI vykdymo klaida" in str(he):
                    raise he
                continue

        if not target_file:
            raise HTTPException(status_code=504, detail="MiniMax Music 3 generavimo laikas baigėsi (timeout).")

        fn = target_file["filename"]
        sub = target_file.get("subfolder", "")
        f_type = target_file.get("type", "output")
        dl_url = f"{node_url}/view?filename={fn}&subfolder={sub}&type={f_type}"

        track_id = f"bgm_{uuid.uuid4().hex[:10]}"
        base_name = req.track_name or "MiniMax Soundtrack"
        safe_base = re.sub(r'[^a-zA-Z0-9_\-\.\s]', '', base_name).strip() or "track"
        ext = os.path.splitext(fn)[1].lower() or ".mp3"
        saved_filename = f"{track_id}_{safe_base}{ext}"
        saved_path = os.path.join(BGM_DIR, saved_filename)

        async with session.get(dl_url, timeout=aiohttp.ClientTimeout(total=30)) as dl_resp:
            if dl_resp.status != 200:
                raise Exception(f"Nepavyko atsisiųsti sugeneruoto audio failo iš ComfyUI: HTTP {dl_resp.status}")
            content = await dl_resp.read()
            with open(saved_path, "wb") as bf:
                bf.write(content)

        file_size = len(content)
        duration = 0.0
        try:
            audio_seg = AudioSegment.from_file(saved_path)
            duration = round(len(audio_seg) / 1000.0, 2)
        except Exception:
            duration = float(req.duration)

        url = f"/bgm/{saved_filename}"

        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT INTO bgm_tracks (id, name, filename, url, duration, file_size)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (track_id, base_name, saved_filename, url, duration, file_size))
        conn.commit()
        conn.close()

        log_event(f"MiniMax Music 3 takelis sėkmingai sukurtas ir išsaugotas: {saved_filename} ({duration}s)", "SUCCESS")
        return {
            "status": "success",
            "track": {
                "id": track_id,
                "name": base_name,
                "filename": saved_filename,
                "url": url,
                "duration": duration,
                "file_size": file_size,
                "seed": seed
            }
        }



@router.post("/api/audio/upload")
async def upload_voice_ref(
    file: UploadFile = File(...), 
    ref_text: str = Form(default="")
):
    log_event(f"Gauta užklausa įkelti naują balsą: {file.filename}", "INFO")
    
    if not file.filename.endswith(('.wav', '.mp3')):
        log_event(f"KLAIDA: Netinkamas failo formatas: {file.filename}", "ERROR")
        raise HTTPException(status_code=400, detail="Only .wav or .mp3 files are allowed")
        
    try:
        file_path = os.path.join(VOICES_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            buffer.write(await file.read())
        log_event(f"Garso failas išsaugotas: {file_path}", "SUCCESS")
            
        if ref_text.strip():
            txt_filename = os.path.splitext(file.filename)[0] + ".txt"
            txt_path = os.path.join(VOICES_DIR, txt_filename)
            with open(txt_path, "w", encoding="utf-8") as txt_file:
                txt_file.write(ref_text.strip())
            log_event(f"Transkripcija išsaugota: {txt_path}", "SUCCESS")
        else:
            log_event("Transkripcija nepateikta (Formoje ref_text tuščias).", "DEBUG")
            
        return {"status": "success", "filename": file.filename}
    except Exception as e:
        log_event(f"Klaida išsaugant balso failą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/audio/voices")
async def list_voices():
    log_event("Gauta užklausa gauti turimų balsų sąrašą.", "DEBUG")
    if not os.path.exists(VOICES_DIR):
        log_event(f"Katalogas {VOICES_DIR} neegzistuoja. Grąžinamas tuščias sąrašas.", "WARN")
        return {"status": "success", "voices": []}
        
    try:
        files = [f for f in os.listdir(VOICES_DIR) if f.endswith(('.wav', '.mp3')) and not f.lower().startswith('chunk_')]
        log_event(f"Rasta {len(files)} balso failų.", "DEBUG")
        return {"status": "success", "voices": sorted(files)}
    except Exception as e:
        log_event(f"Klaida nuskaitant balsų katalogą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# BALSO IŠTRYNIMAS IŠ BIBLIOTEKOS
# ============================================================================
@router.delete("/api/audio/voices/{filename}")
async def delete_voice(filename: str):
    log_event(f"Gauta užklausa ištrinti balsą: {filename}", "INFO")
    
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename format")
        
    file_path = os.path.join(VOICES_DIR, filename)
    
    if not os.path.exists(file_path):
        log_event(f"KLAIDA: Failas nerastas: {file_path}", "ERROR")
        raise HTTPException(status_code=404, detail="Voice file not found")
        
    try:
        os.remove(file_path)
        log_event(f"Garso failas sėkmingai ištrintas: {file_path}", "SUCCESS")
        
        txt_filename = os.path.splitext(filename)[0] + ".txt"
        txt_path = os.path.join(VOICES_DIR, txt_filename)
        
        if os.path.exists(txt_path):
            os.remove(txt_path)
            log_event(f"Susijusi transkripcija sėkmingai ištrinta: {txt_path}", "SUCCESS")
            
        return {"status": "success", "message": f"Voice {filename} deleted successfully"}
    except Exception as e:
        log_event(f"KRITINĖ KLAIDA bandant ištrinti balso failą: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# BUILT-IN WHISPER ALIGNMENT & STATUS ENDPOINTS
# ============================================================================

_WHISPER_MODEL = None

def get_whisper_model():
    global _WHISPER_MODEL
    if _WHISPER_MODEL is None:
        try:
            from faster_whisper import WhisperModel
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            compute_type = "float16" if device == "cuda" else "int8"
            _WHISPER_MODEL = WhisperModel("base", device=device, compute_type=compute_type)
            log_event(f"Faster-Whisper modelis užkrautas ({device}, {compute_type})", "SUCCESS")
        except Exception as e:
            try:
                from faster_whisper import WhisperModel
                _WHISPER_MODEL = WhisperModel("base", device="cpu", compute_type="int8")
                log_event(f"Faster-Whisper modelis užkrautas CPU int8 režimu", "SUCCESS")
            except Exception as e2:
                log_event(f"Nepavyko užkrauti WhisperModel: {e2}", "WARN")
    return _WHISPER_MODEL

class WhisperAlignRequest(BaseModel):
    audioUrl: str = ""
    scenes: list[dict] = []
    text: str = ""
    language: str = "en"

@router.get("/api/audio/whisper_status")
async def whisper_status():
    try:
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        return {"status": "ready", "engine": "faster_whisper", "device": device, "builtIn": True}
    except Exception as e:
        return {"status": "ready", "engine": "faster_whisper", "device": "cpu", "builtIn": True}

def _tok(s: str) -> list[str]:
    import re
    return re.findall(r"[a-z0-9]+", (s or "").lower())

def smart_script_align(script_text: str, words: list[dict]) -> dict:
    import difflib
    num_map = {str(i): w for i, w in zip(range(30), [
        "zero","one","two","three","four","five","six","seven","eight","nine","ten",
        "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
        "eighteen","nineteen","twenty","twentyone","twentytwo","twentythree","twentyfour",
        "twentyfive","twentysix","twentyseven","twentyeight","twentynine"
    ])}
    num_map.update({"30":"thirty", "40":"forty", "50":"fifty", "60":"sixty", "70":"seventy", "80":"eighty", "90":"ninety", "100":"hundred"})

    script_tokens = _tok(script_text)
    trans_tokens = [_tok(w.get("word", ""))[0] if _tok(w.get("word", "")) else "" for w in words]
    
    sc_norm = [num_map.get(t, t) for t in script_tokens]
    tr_norm = [num_map.get(t, t) for t in trans_tokens]
    
    matcher = difflib.SequenceMatcher(None, sc_norm, tr_norm)
    aligned = []
    matched = 0
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                w = words[j1 + k]
                aligned.append({
                    "script_word": script_tokens[i1 + k], 
                    "start": w.get("start"), 
                    "end": w.get("end"), 
                    "confidence": w.get("score"), 
                    "matched": True
                })
                matched += 1
        else:
            for k in range(i1, i2):
                aligned.append({
                    "script_word": script_tokens[k], 
                    "start": None, 
                    "end": None, 
                    "confidence": None, 
                    "matched": False
                })
                
    return {
        "script_word_count": len(script_tokens), 
        "matched_word_count": matched, 
        "match_rate": (matched / max(1, len(script_tokens))), 
        "aligned_words": aligned
    }

@router.post("/api/audio/whisper_align")
async def whisper_align(req: WhisperAlignRequest):
    log_event(f"=== BUILT-IN WHISPER AUDIO ALIGNMENT REQUEST ===", "INFO")
    
    clean_fn = os.path.basename(req.audioUrl.split('?')[0])
    audio_path = os.path.join(AUDIO_DIR, clean_fn)
    if not os.path.exists(audio_path):
        from config import DATA_DIR
        for d in [AUDIO_DIR, VOICES_DIR, DATA_DIR]:
            candidate = os.path.join(d, clean_fn)
            if os.path.exists(candidate):
                audio_path = candidate
                break

    if not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail=f"Audio failas nerastas: {req.audioUrl}")

    try:
        model = get_whisper_model()
        segments_data = []
        words_data = []

        if model is not None:
            segments, info = model.transcribe(audio_path, word_timestamps=True)
            for seg in segments:
                segments_data.append({
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text
                })
                if seg.words:
                    for w in seg.words:
                        words_data.append({
                            "word": w.word.strip(),
                            "start": round(w.start, 2),
                            "end": round(w.end, 2),
                            "score": getattr(w, 'probability', 1.0)
                        })

        total_audio_duration = 0.0
        try:
            seg = AudioSegment.from_file(audio_path)
            total_audio_duration = len(seg) / 1000.0
        except Exception:
            if segments_data:
                total_audio_duration = segments_data[-1]["end"]

        # Build full script text
        full_script = req.text.strip()
        if not full_script and req.scenes:
            full_script = " ".join((sc.get("text") or sc.get("prompt") or "").strip() for sc in req.scenes)

        script_align_res = smart_script_align(full_script, words_data)
        aligned_words = script_align_res.get("aligned_words", [])

        aligned_scenes = []
        token_cursor = 0

        if req.scenes and len(req.scenes) > 0:
            for idx, sc in enumerate(req.scenes):
                sc_text = (sc.get("text") or sc.get("prompt") or "").strip()
                tokens = _tok(sc_text)
                count = len(tokens)

                if count == 0:
                    prev_end = aligned_scenes[-1]["end"] if aligned_scenes else 0.0
                    aligned_scenes.append({
                        "id": sc.get("id"),
                        "start": prev_end,
                        "end": prev_end + 2.0,
                        "duration": 2.0,
                        "dur": 2.0,
                        "originalStart": prev_end,
                        "originalEnd": prev_end + 2.0,
                        "text": ""
                    })
                    continue

                slice_w = aligned_words[token_cursor : token_cursor + count]
                token_cursor += count

                matched_w = [w for w in slice_w if w.get("matched") and w.get("start") is not None and w.get("end") is not None]

                if matched_w:
                    st = matched_w[0]["start"]
                    en = matched_w[-1]["end"]
                    dur = max(0.5, round(en - st, 2))
                    aligned_scenes.append({
                        "id": sc.get("id"),
                        "start": st,
                        "end": en,
                        "duration": dur,
                        "dur": dur,
                        "originalStart": st,
                        "originalEnd": en,
                        "text": sc_text
                    })
                else:
                    prev_end = aligned_scenes[-1]["end"] if aligned_scenes else 0.0
                    dur = max(1.0, round(count * 0.35, 2))
                    aligned_scenes.append({
                        "id": sc.get("id"),
                        "start": prev_end,
                        "end": prev_end + dur,
                        "duration": dur,
                        "dur": dur,
                        "originalStart": prev_end,
                        "originalEnd": prev_end + dur,
                        "text": sc_text
                    })

        return {
            "status": "success",
            "segments": segments_data,
            "word_segments": words_data,
            "duration": total_audio_duration,
            "script_alignment": script_align_res,
            "aligned_scenes": aligned_scenes
        }
    except Exception as e:
        log_event(f"Klaida atliekant Whisper alignment: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WHISPERX EXTERNAL SERVER PROCESS MANAGER (D:\Desktop\Kiti projektai\whisper 2)
# ============================================================================

WHISPER_PROCESS = None
DEFAULT_WHISPER_DIR = r"D:\Desktop\Kiti projektai\whisper 2"
DEFAULT_WHISPER_PORT = 8002

def is_whisper_port_open(host: str = "127.0.0.1", port: int = 8002) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.15):
            return True
    except Exception:
        return False

async def check_whisper_server_health(url: str = "http://127.0.0.1:8002/"):
    # Fast check if port is open to avoid 2s connection timeout delays
    if not is_whisper_port_open("127.0.0.1", 8002):
        return {"online": False}
    
    clean_url = url.rstrip('/') + '/health'
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=1.0)) as session:
            async with session.get(clean_url) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return {"online": True, "data": data}
    except Exception:
        pass
    return {"online": False}

@router.get("/api/whisper/status")
async def get_whisper_status(url: str = "http://127.0.0.1:8002/"):
    health = await check_whisper_server_health(url)
    pid = WHISPER_PROCESS.pid if WHISPER_PROCESS and WHISPER_PROCESS.poll() is None else None
    return {
        "status": "online" if health["online"] else "offline",
        "online": health["online"],
        "cuda": health.get("data", {}).get("cuda", False) if health["online"] else False,
        "pid": pid,
        "url": url,
        "path": DEFAULT_WHISPER_DIR,
        "port": DEFAULT_WHISPER_PORT
    }

@router.post("/api/whisper/start")
async def start_whisper_server():
    global WHISPER_PROCESS
    log_event("Gauta užklausa paleisti WhisperX serverį...", "INFO")
    
    # 1. Check if already online
    health = await check_whisper_server_health("http://127.0.0.1:8002/")
    if health["online"]:
        log_event("WhisperX serveris jau veikia ant porto 8002.", "INFO")
        return {
            "status": "success",
            "message": "WhisperX serveris jau veikia!",
            "online": True,
            "url": "http://127.0.0.1:8002/",
            "cuda": health.get("data", {}).get("cuda", False)
        }

    whisper_dir = DEFAULT_WHISPER_DIR
    if not os.path.exists(whisper_dir):
        raise HTTPException(status_code=404, detail=f"Whisper katalogas nerastas: {whisper_dir}")

    python_exe = os.path.join(whisper_dir, ".venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = "python"

    cmd = [python_exe, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8002"]
    log_event(f"Paleidžiamas WhisperX serveris: {' '.join(cmd)}", "INFO")

    try:
        creationflags = 0
        if os.name == 'nt':
            creationflags = subprocess.CREATE_NO_WINDOW
            
        WHISPER_PROCESS = subprocess.Popen(
            cmd,
            cwd=whisper_dir,
            creationflags=creationflags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        
        # Wait up to 15 seconds for server to respond to /health
        for _ in range(15):
            await asyncio.sleep(1.0)
            h = await check_whisper_server_health("http://127.0.0.1:8002/")
            if h["online"]:
                log_event(f"WhisperX serveris sėkmingai startavo (PID: {WHISPER_PROCESS.pid}, CUDA: {h.get('data', {}).get('cuda')})", "SUCCESS")
                return {
                    "status": "success",
                    "message": "WhisperX serveris sėkmingai paleistas ir veikia!",
                    "online": True,
                    "pid": WHISPER_PROCESS.pid,
                    "url": "http://127.0.0.1:8002/",
                    "cuda": h.get("data", {}).get("cuda", False)
                }

        log_event("WhisperX serveris paleistas, bet dar kraunasi...", "WARN")
        return {"status": "starting", "message": "WhisperX serveris startuoja...", "online": False}

    except Exception as e:
        log_event(f"Klaida paleidžiant WhisperX: {e}", "ERROR")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/whisper/stop")
async def stop_whisper_server():
    global WHISPER_PROCESS
    log_event("Gauta užklausa sustabdyti WhisperX serverį...", "INFO")
    
    if WHISPER_PROCESS and WHISPER_PROCESS.poll() is None:
        try:
            WHISPER_PROCESS.terminate()
            WHISPER_PROCESS.wait(timeout=3)
        except Exception:
            try:
                WHISPER_PROCESS.kill()
            except Exception:
                pass
        WHISPER_PROCESS = None

    if os.name == 'nt':
        try:
            cmd = "Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
            subprocess.run(["powershell", "-Command", cmd], capture_output=True)
        except Exception:
            pass

    log_event("WhisperX serveris sustabdytas.", "SUCCESS")
    return {"status": "success", "message": "WhisperX serveris sustabdytas.", "online": False}