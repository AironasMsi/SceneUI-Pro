import os

import json

import uuid

import asyncio

import sqlite3

import aiohttp

import random

import time

import traceback

from datetime import datetime

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect, Response



from config import DB_PATH, VAULT_DIR, FRONTEND_DIR, PROMPTS_DIR, AUDIO_DIR, VOICES_DIR, PROJECTS_DIR, DATA_DIR

from ws_manager import manager, broadcast_system_state

from routers.comfy_ui_workflow import build_extra_data



import subprocess



class SubprocessResult:

    def __init__(self, returncode, stdout, stderr):

        self.returncode = returncode

        self.stdout = stdout

        self.stderr = stderr

    async def communicate(self):

        return self.stdout, self.stderr



async def run_subprocess(*cmd):

    """

    Saugus subprocess vykdymas Windows aplinkoje su bet kuria asyncio EventLoop politika.

    Apsaugo nuo NotImplementedError po Uvicorn reload.

    """

    flat_cmd = []

    for arg in cmd:

        if isinstance(arg, (list, tuple)):

            flat_cmd.extend([str(x) for x in arg])

        else:

            flat_cmd.append(str(arg))

    res = await asyncio.to_thread(subprocess.run, flat_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    return SubprocessResult(res.returncode, res.stdout, res.stderr)





router = APIRouter()

NODE_FILE_CACHE = {}

ACTIVE_WORKERS = {}



# ============================================================================

# 1. WEBSOCKETS ROUTE (Real-time UI updates)

# ============================================================================

@router.websocket("/ws")

async def websocket_endpoint(websocket: WebSocket):

    await manager.connect(websocket)

    try:

        while True:

             await websocket.receive_text()

    except WebSocketDisconnect:

        manager.disconnect(websocket)



# ============================================================================

# 2. HELPER FUNCTIONS & FILE SYNC (JIT)

# ============================================================================

def extract_required_images(workflow_json):

    images = set()

    def scan_dict(d):

        for k, v in d.items():

            if k in ["image", "image1", "image2", "image3", "audio", "video"] and isinstance(v, str) and v.strip():

                images.add(v.strip())

            elif isinstance(v, dict): scan_dict(v)

            elif isinstance(v, list):

                for item in v:

                    if isinstance(item, dict): scan_dict(item)

    scan_dict(workflow_json)

    return images



def sanitize_comfy_filename(filename: str) -> str:

    """ComfyUI LoadImage nesutaria su tarpais failo varduose. Keičiame tarpus į '_'."""

    import re

    base = os.path.basename(filename)

    safe = re.sub(r'[^a-zA-Z0-9._\-]', '_', base)

    # Prefix back any subfolder path

    if '/' in filename.replace('\\', '/'):

        parts = filename.replace('\\', '/').split('/')

        prefix = '/'.join(parts[:-1])

        return f"{prefix}/{safe}"

    return safe



def find_scene_audio_file(project_id: str, scene_id: str) -> str:

    """Ieško scenos balso audio failo projekto duomenyse arba data/audio kataloge."""

    clean_id = str(scene_id).replace("S", "").replace("s", "").strip()

    norm_s = f"S{clean_id}"



    # 1. Tikriname projekto json failą

    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    if os.path.exists(proj_path):

        try:

            with open(proj_path, "r", encoding="utf-8") as f:

                proj_data = json.load(f)

            

            # audioChunks

            chunks = proj_data.get("audioChunks", [])

            for c in chunks:

                if str(c.get("sceneId")) in [scene_id, norm_s, clean_id]:

                    a_url = c.get("audio_url") or c.get("url") or c.get("filename")

                    if a_url:

                        fname = os.path.basename(str(a_url).split("?")[0])

                        for d in [AUDIO_DIR, VAULT_DIR, os.path.join("data", "audio")]:

                            cand = os.path.join(d, fname)

                            if os.path.exists(cand) and os.path.getsize(cand) > 0:

                                return cand



            # Match chunk by index if clean_id is numeric

            if clean_id.isdigit():

                s_idx = int(clean_id) - 1

                if 0 <= s_idx < len(chunks):

                    c = chunks[s_idx]

                    a_url = c.get("audio_url") or c.get("url") or c.get("filename")

                    if a_url:

                        fname = os.path.basename(str(a_url).split("?")[0])

                        for d in [AUDIO_DIR, VAULT_DIR, os.path.join("data", "audio")]:

                            cand = os.path.join(d, fname)

                            if os.path.exists(cand) and os.path.getsize(cand) > 0:

                                return cand



            # sceneAudioById

            s_audio = proj_data.get("sceneAudioById", {})

            for k in [scene_id, norm_s, clean_id]:

                if k in s_audio:

                    fname = os.path.basename(str(s_audio[k]).split("?")[0])

                    for d in [AUDIO_DIR, VAULT_DIR, os.path.join("data", "audio")]:

                        cand = os.path.join(d, fname)

                        if os.path.exists(cand) and os.path.getsize(cand) > 0:

                            return cand



            # scenes list audio / audioUrl

            for s in proj_data.get("scenes", []):

                if str(s.get("id")) in [scene_id, norm_s, clean_id]:

                    a_url = s.get("audioUrl") or s.get("audio") or s.get("audio_url")

                    if a_url:

                        fname = os.path.basename(str(a_url).split("?")[0])

                        for d in [AUDIO_DIR, VAULT_DIR, os.path.join("data", "audio")]:

                            cand = os.path.join(d, fname)

                            if os.path.exists(cand) and os.path.getsize(cand) > 0:

                                return cand

        except Exception as e:

            print("Klaida nuskaitant projekto audio:", e)



    # 2. Ieškome data/audio kataloge pagal šablonus

    for ad in [AUDIO_DIR, os.path.join("data", "audio")]:

        if os.path.exists(ad):

            patterns = [

                f"chunk_{project_id}_{norm_s}_",

                f"chunk_{project_id}_{scene_id}_",

                f"chunk_{project_id}_{clean_id}_",

                f"chunk_{norm_s}_",

                f"chunk_{scene_id}_",

                f"chunk_{clean_id}_",

                f"voice_{norm_s}",

                f"audio_{norm_s}",

                f"{norm_s}_audio"

            ]

            for f in os.listdir(ad):

                if f.lower().endswith(('.wav', '.mp3', '.m4a', '.ogg')):

                    for pat in patterns:

                        if pat.lower() in f.lower():

                            return os.path.join(ad, f)



    return None



async def get_video_info(video_path: str):

    dur = 0.0

    fps = 24.0

    try:

        cmd = [

            "ffprobe", "-v", "error",

            "-select_streams", "v:0",

            "-show_entries", "stream=r_frame_rate,duration:format=duration",

            "-of", "json",

            video_path

        ]

        proc = await run_subprocess(*cmd)

        stdout, _ = await proc.communicate()

        if proc.returncode == 0:

            info = json.loads(stdout.decode('utf-8', errors='ignore'))

            fmt_dur = info.get("format", {}).get("duration")

            if fmt_dur:

                dur = float(fmt_dur)

            streams = info.get("streams", [])

            if streams:

                s_dur = streams[0].get("duration")

                if s_dur and not dur:

                    dur = float(s_dur)

                r_fps = streams[0].get("r_frame_rate", "24/1")

                if "/" in r_fps:

                    num, den = r_fps.split("/")

                    if float(den) > 0:

                        fps = float(num) / float(den)

                else:

                    fps = float(r_fps)

    except Exception as e:

        print(f"[VideoProbe] FFprobe klaida: {e}")



    if dur <= 0.05:

        try:

            import cv2

            cap = cv2.VideoCapture(video_path)

            c_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0

            cnt = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0

            cap.release()

            if c_fps > 0 and cnt > 0:

                dur = cnt / c_fps

                fps = c_fps

        except Exception:

            pass



    return dur, fps



async def fit_video_to_duration(video_path: str, target_dur: float, target_fps: float = None):

    """

    Jei sugeneruotas video yra trumpesnis nei tikslinė trukmė (scenos trukmė + perėjimų buferis),

    sklandžiai sulėtina (smooth slowdown via setpts) video iki tikslinės trukmės.

    Jei sugeneruotas video yra ilgesnis nei tikslinė trukmė,

    sumažina trukmę apkerpant (-t target_dur) be jokio greitinimo.

    Išlaiko nustatytą kadrų dažnį (FPS), pvz. 8 fps claymation/stop-motion.

    """

    dur, fps = await get_video_info(video_path)

    if dur <= 0.1 or target_dur <= 0.1:

        return False



    out_fps = target_fps if (target_fps and target_fps > 0) else fps



    if abs(dur - target_dur) <= 0.15:

        print(f"[VideoDuration] Video trukmė ({dur:.2f}s) jau atitinka tikslinę ({target_dur:.2f}s). Keitimas nereikalingas.")

        return False



    if dur < (target_dur - 0.15):

        factor = target_dur / dur

        print(f"[VideoDuration] Video per trumpas ({dur:.2f}s < {target_dur:.2f}s). Sklandžiai sulėtinama {factor:.3f}x.")

        temp_out = video_path + ".slow.mp4"

        try:

            has_audio = False

            try:

                p_probe = await run_subprocess(

                    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", video_path)

                p_stdout, _ = await p_probe.communicate()

                if p_probe.returncode == 0:

                    p_data = json.loads(p_stdout.decode('utf-8', errors='ignore'))

                    has_audio = any(s.get('codec_type') == 'audio' for s in p_data.get('streams', []))

            except Exception:

                pass



            if has_audio:

                audio_filters = []

                cur_speed = 1.0 / factor

                while cur_speed < 0.5:

                    audio_filters.append("atempo=0.5")

                    cur_speed /= 0.5

                while cur_speed > 2.0:

                    audio_filters.append("atempo=2.0")

                    cur_speed /= 2.0

                audio_filters.append(f"atempo={cur_speed:.4f}")

                af_str = ",".join(audio_filters)



                cmd = [

                    "ffmpeg", "-y",

                    "-i", video_path,

                    "-filter:v", f"setpts={factor:.4f}*PTS",

                    "-filter:a", af_str,

                    "-r", f"{out_fps:.2f}",

                    "-c:v", "libx264",

                    "-pix_fmt", "yuv420p",

                    "-preset", "fast",

                    "-crf", "18",

                    "-c:a", "aac",

                    "-b:a", "192k",

                    temp_out

                ]

            else:

                cmd = [

                    "ffmpeg", "-y",

                    "-i", video_path,

                    "-filter:v", f"setpts={factor:.4f}*PTS",

                    "-r", f"{out_fps:.2f}",

                    "-c:v", "libx264",

                    "-pix_fmt", "yuv420p",

                    "-preset", "fast",

                    "-crf", "18",

                    "-an",

                    temp_out

                ]

            proc = await run_subprocess(*cmd)

            stdout, stderr = await proc.communicate()

            if proc.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:

                os.replace(temp_out, video_path)

                print(f"[VideoDuration] Sėkmingai sulėtintas video iki {target_dur:.2f}s @ {out_fps:.2f}fps: {video_path}")

                return True

            else:

                if os.path.exists(temp_out):

                    os.remove(temp_out)

                print(f"[VideoDuration] FFmpeg klaida sulėtinant: {stderr.decode(errors='ignore')}")

                return False

        except Exception as ex:

            if os.path.exists(temp_out):

                try: os.remove(temp_out)

                except: pass

            print(f"[VideoDuration] Klaida sulėtinant: {ex}")

            return False

    else:

        print(f"[VideoDuration] Video per ilgas ({dur:.2f}s > {target_dur:.2f}s). Sumažinama trukmė apkerpant iki {target_dur:.2f}s (be jokio pagreitinimo).")

        temp_out = video_path + ".trim.mp4"

        try:

            cmd = [

                "ffmpeg", "-y",

                "-i", video_path,

                "-t", f"{target_dur:.3f}",

                "-r", f"{out_fps:.2f}",

                "-c:v", "libx264",

                "-pix_fmt", "yuv420p",

                "-preset", "fast",

                "-crf", "18",

                "-map", "0:v:0",

                "-map", "0:a?",

                "-c:a", "copy",

                temp_out

            ]

            proc = await run_subprocess(*cmd)

            stdout, stderr = await proc.communicate()

            if proc.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:

                os.replace(temp_out, video_path)

                print(f"[VideoDuration] Sėkmingai sumažinta trukmė iki {target_dur:.2f}s @ {out_fps:.2f}fps: {video_path}")

                return True

            else:

                if os.path.exists(temp_out):

                    os.remove(temp_out)

                print(f"[VideoDuration] FFmpeg klaida trumpinant: {stderr.decode(errors='ignore')}")

                return False

        except Exception as ex:

            if os.path.exists(temp_out):

                try: os.remove(temp_out)

                except: pass

            print(f"[VideoDuration] Klaida trumpinant: {ex}")

            return False



async def mux_scene_audio_to_video(video_path: str, project_id: str, scene_id: str, buffer_offset: float = 0.5, sound_volume: float = 1.0):

    """

    Sujungia sugeneruotą video failą su scenos balso takeliu per FFmpeg.

    buffer_offset: laiko poslinkis (sekundėmis), atitinkantis perėjimo buferį pradžioje.

    sound_volume: garso stiprumo koeficientas (0.0 iki 1.0 ar daugiau).

    """

    audio_path = find_scene_audio_file(project_id, scene_id)

    if not audio_path or not os.path.exists(audio_path):

        print(f"[AudioMux] Scenai {scene_id} nerastas audio failas, paliekamas originalus video.")

        return False



    vid_dur, _ = await get_video_info(video_path)

    temp_out = video_path + ".muxed.mp4"

    try:

        cmd = [

            "ffmpeg", "-y",

            "-i", video_path,

        ]

        if buffer_offset and buffer_offset > 0.05:

            cmd.extend(["-itsoffset", f"{buffer_offset:.3f}"])

        cmd.extend([

            "-i", audio_path,

            "-map", "0:v:0",

            "-map", "1:a:0",

            "-c:v", "copy",

        ])

        if abs(sound_volume - 1.0) > 0.01:

            cmd.extend(["-filter:a", f"volume={sound_volume:.2f}"])

        cmd.extend([

            "-c:a", "aac",

            "-b:a", "192k",

        ])

        if vid_dur and vid_dur > 0.2:

            cmd.extend(["-t", f"{vid_dur:.3f}"])

        cmd.append(temp_out)



        proc = await run_subprocess(*cmd)

        stdout, stderr = await proc.communicate()



        if proc.returncode == 0 and os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:

            os.replace(temp_out, video_path)

            print(f"[AudioMux] Sėkmingai prijungtas audio prie video: {video_path}")

            return True

        else:

            if os.path.exists(temp_out):

                os.remove(temp_out)

            print(f"[AudioMux] FFmpeg klaida: {stderr.decode(errors='ignore')}")

            return False

    except Exception as ex:

        if os.path.exists(temp_out):

            try: os.remove(temp_out)

            except: pass

        print(f"[AudioMux] Klaida jungiant audio: {ex}")

        return False



async def generate_sfx_for_video(session, node_url, video_filename, sfx_prompt="", node_id=None, project_id=None, scene_id=None, ignore_lips=True):

    """

    Workflow 19: Generuoja fizinius aplinkos garsus (SFX) per MMAudio V2 ir prijungia prie video failo.

    SVARBU: Niekada neperrašo paties video vaizdo su 512x512 kvadratiniu MMAudio preview video!

    Atsisiunčia TIK garso takelį (Node 98 audio) ir per ffmpeg (-c:v copy) sujungia su originaliu video.

    Jei video jau turi lūpų sinchronizacijos kalbos balsą, amix sujungia balsą + SFX išlaikant 100% video kokybę ir rezoliuciją.

    """

    try:

        wf_path = os.path.join(DATA_DIR, "workflows", "19_MMAudio_Video_Arba_Vaizdo_I_Scenos_Garsus_SFX_api.json")

        if not os.path.exists(wf_path):

            print(f"[MMAudio SFX] Nerastas workflow failas: {wf_path}")

            return False

            

        with open(wf_path, "r", encoding="utf-8") as f:

            wf = json.load(f)

            

        # 1. JIT įkeliame video į ComfyUI

        ok, safe_video_name = await jit_upload_to_node(session, node_url, video_filename, node_id or "local")

        if not ok:

            safe_video_name = video_filename

            

        wf["91"]["inputs"]["video"] = safe_video_name

        clean_sfx = sfx_prompt.strip() if sfx_prompt else ""

        if not clean_sfx:

            clean_sfx = "cinematic ambient room tone, subtle footsteps, realistic physical foley environment sound effects"

        import re

        clean_sfx = re.sub(r'\b(speech|talking|voice|dialogue|says|speaks|whispers|music|song|melody|soundtrack|orchestra|beat)\b', '', clean_sfx, flags=re.I).strip()

        full_sfx_prompt = f"pure realistic physical foley sound effects only, real world natural ambient environment sound, zero music, zero instruments, zero soundtrack, zero speech: {clean_sfx}"

        wf["92"]["inputs"]["prompt"] = full_sfx_prompt

        wf["92"]["inputs"]["negative_prompt"] = "music, musical instruments, soundtrack, song, songs, melody, melodies, score, tunes, background music, synth, synthesizer, beat, drums, bass, guitar, piano, singing, vocals, vocalization, humming, orchestra, choir, rhythm, audio track, speech, voice, words, conversation, dialogue, talking, chatter, monologue, whisper, mouth sounds"

        wf["92"]["inputs"]["seed"] = random.randint(1000, 999999999)



        # Jei pasirinkta 'ignore_lips' (arba LipSync scena): atjungiame vaizdo kadrus nuo MMAudioSampler,

        # kad Synchformer nematytų judančių lūpų ir NIEKADA nebandytų kalbėti ar leisti vokalų!

        if ignore_lips:

            wf["92"]["inputs"].pop("images", None)

            # Tiksliai nustatome video trukmę sekundėmis

            save_path = os.path.join(VAULT_DIR, video_filename)

            vid_dur = 4.0

            if os.path.exists(save_path):

                try:

                    p_probe = await run_subprocess(

                        "ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", save_path)

                    p_out, _ = await p_probe.communicate()

                    if p_probe.returncode == 0:

                        p_data = json.loads(p_out.decode('utf-8', errors='ignore'))

                        vid_dur = float(p_data.get('format', {}).get('duration', 4.0))

                except Exception:

                    pass

            wf["92"]["inputs"]["duration"] = vid_dur

            print(f"[MMAudio SFX] Vykdomas švarus T2A SFX generavimas be lūpų sekimo (trukmė: {vid_dur}s)")

        

        client_id = f"sfx_{uuid.uuid4().hex[:8]}"

        extra_data = build_extra_data(wf, node_url)

        prompt_req = await session.post(f"{node_url}/prompt", json={

            "prompt": wf,

            "client_id": client_id,

            "extra_data": extra_data

        })

        p_res = await prompt_req.json()

        prompt_id = p_res.get("prompt_id")

        if not prompt_id:

            print("[MMAudio SFX] Nepavyko gauti prompt_id iš ComfyUI:", p_res)

            return False

            

        # Palaukiame kol sugeneruos

        for _ in range(180):

            await asyncio.sleep(2.0)

            async with session.get(f"{node_url}/history/{prompt_id}") as h_res:

                if h_res.status == 200:

                    h_data = await h_res.json()

                    if prompt_id in h_data:

                        entry = h_data[prompt_id]

                        if entry.get("status", {}).get("status_str") == "error":

                            print("[MMAudio SFX] ComfyUI klaida:", entry.get("status"))

                            return False

                        outputs = entry.get("outputs", {})

                        

                        # 1. Paimame gryną SFX audio failą iš Node 98 (PreviewAudio)

                        a_out = outputs.get("98", {}).get("audio", [])

                        sfx_temp_download = os.path.join(AUDIO_DIR, f"temp_sfx_{uuid.uuid4().hex[:6]}.flac")

                        os.makedirs(AUDIO_DIR, exist_ok=True)

                        

                        downloaded_audio = False

                        if a_out:

                            a_info = a_out[0]

                            dl_url = f"{node_url}/view?filename={a_info['filename']}&subfolder={a_info.get('subfolder', '')}&type={a_info.get('type', 'temp')}"

                            downloaded_audio = await download_image_from_node(session, dl_url, sfx_temp_download)

                            

                        # Jei Node 98 negautas, bet yra Node 97 video, ištraukiame garsą iš Node 97

                        if not downloaded_audio or not os.path.exists(sfx_temp_download) or os.path.getsize(sfx_temp_download) == 0:

                            v_out = outputs.get("97", {}).get("gifs", []) or outputs.get("97", {}).get("videos", [])

                            if v_out:

                                m_info = v_out[0]

                                dl_v_url = f"{node_url}/view?filename={m_info['filename']}&subfolder={m_info.get('subfolder', '')}&type={m_info.get('type', 'output')}"

                                temp_v_path = os.path.join(VAULT_DIR, f"temp_v_{uuid.uuid4().hex[:6]}.mp4")

                                if await download_image_from_node(session, dl_v_url, temp_v_path):

                                    p_ext = await run_subprocess(

                                        "ffmpeg", "-y", "-i", temp_v_path, "-vn", "-c:a", "pcm_s16le", sfx_temp_download)

                                    await p_ext.communicate()

                                    try: os.remove(temp_v_path)

                                    except: pass

                                    if os.path.exists(sfx_temp_download) and os.path.getsize(sfx_temp_download) > 0:

                                        downloaded_audio = True



                        if not downloaded_audio or not os.path.exists(sfx_temp_download):

                            print("[MMAudio SFX] Nepavyko parsiųsti sugeneruoto SFX audio failo iš ComfyUI.")

                            return False



                                                # 2. Sukuriame švarų galutinį WAV failą su unikalia variacija (Take #N) į data/audio

                        clean_base = os.path.splitext(video_filename)[0]

                        clean_sid = str(scene_id).replace("S", "").replace("s", "").strip() if scene_id else ""

                        sid_key = f"s{clean_sid}" if clean_sid else "s1"

                        

                        existing_vars = []

                        proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json") if project_id else None

                        pjson = None

                        if proj_path and os.path.exists(proj_path):

                            try:

                                with open(proj_path, "r", encoding="utf-8") as pf:

                                    pjson = json.load(pf)

                                if "sceneSfxVarsById" not in pjson:

                                    pjson["sceneSfxVarsById"] = {}

                                existing_vars = list(pjson["sceneSfxVarsById"].get(sid_key, []))

                                # Jei turime sena sceneSfxById ir nera variaciju sarase, itraukiame ji kaip Take #1

                                old_url = pjson.get("sceneSfxById", {}).get(sid_key)

                                if old_url and not existing_vars:

                                    existing_vars.append({

                                        "id": f"var_sfx_legacy_{uuid.uuid4().hex[:6]}",

                                        "url": old_url,

                                        "name": "Take #1",

                                        "createdAt": "Pradinis",

                                        "isMain": False,

                                        "prompt": "Pradinis SFX"

                                    })

                            except Exception as pe:

                                print(f"[MMAudio SFX] Klaida nuskaitant variacijas: {pe}")

                        

                        take_num = len(existing_vars) + 1

                        take_id = f"var_sfx_{int(time.time())}_{uuid.uuid4().hex[:4]}"

                        final_sfx_name = f"sfx_{clean_base}_take{take_num}_{uuid.uuid4().hex[:4]}.wav"

                        final_sfx_path = os.path.join(AUDIO_DIR, final_sfx_name)

                        

                        try:

                            p_wav = await run_subprocess(

                                "ffmpeg", "-y", "-i", sfx_temp_download, "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", final_sfx_path)

                            await p_wav.communicate()

                        finally:

                            if os.path.exists(sfx_temp_download):

                                try: os.remove(sfx_temp_download)

                                except: pass



                        if not os.path.exists(final_sfx_path) or os.path.getsize(final_sfx_path) == 0:

                            print(f"[MMAudio SFX] Nepavyko paruošti galutinio SFX failo: {final_sfx_path}")

                            return False, None, []



                        # 3. Prijungiame SFX prie originalaus video failo, jei video neturi garso

                        save_path = os.path.join(VAULT_DIR, video_filename)

                        if os.path.exists(save_path):

                            has_audio_stream = False

                            try:

                                p_probe = await run_subprocess(

                                    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", save_path)

                                p_stdout, _ = await p_probe.communicate()

                                if p_probe.returncode == 0:

                                    p_data = json.loads(p_stdout.decode('utf-8', errors='ignore'))

                                    has_audio_stream = any(s.get('codec_type') == 'audio' for s in p_data.get('streams', []))

                            except Exception:

                                pass



                            temp_mux = save_path + ".sfx_mux.mp4"

                            if not has_audio_stream:

                                mux_cmd = [

                                    "ffmpeg", "-y",

                                    "-i", save_path,

                                    "-i", final_sfx_path,

                                    "-map", "0:v",

                                    "-map", "1:a",

                                    "-c:v", "copy",

                                    "-c:a", "aac",

                                    "-b:a", "192k",

                                    "-shortest",

                                    temp_mux

                                ]

                                p_mux = await run_subprocess(*mux_cmd)

                                p_mux_out, p_mux_err = await p_mux.communicate()

                                if p_mux.returncode == 0 and os.path.exists(temp_mux) and os.path.getsize(temp_mux) > 0:

                                    os.replace(temp_mux, save_path)

                                    print(f"[MMAudio SFX] Sėkmingai prijungtas SFX prie nebylo video ({video_filename})!")

                                else:

                                    if os.path.exists(temp_mux):

                                        try: os.remove(temp_mux)

                                        except: pass



                        # 4. Atnaujiname projekto duomenis (sceneSfxById ir sceneSfxVarsById)

                        from datetime import datetime

                        new_var_url = f"/audio/{final_sfx_name}"

                        new_var_obj = {

                            "id": take_id,

                            "url": new_var_url,

                            "name": f"Take #{take_num}",

                            "createdAt": datetime.now().strftime("%H:%M:%S"),

                            "isMain": True,

                            "prompt": sfx_prompt

                        }

                        for v in existing_vars:

                            v["isMain"] = False

                        existing_vars.append(new_var_obj)



                        if pjson is not None:

                            try:

                                if "sceneSfxById" not in pjson:

                                    pjson["sceneSfxById"] = {}

                                if "sceneSfxVarsById" not in pjson:

                                    pjson["sceneSfxVarsById"] = {}

                                

                                for k in [scene_id, sid_key, f"S{clean_sid}", clean_sid]:

                                    if k:

                                        pjson["sceneSfxById"][k] = new_var_url

                                        pjson["sceneSfxVarsById"][k] = existing_vars

                                        

                                with open(proj_path, "w", encoding="utf-8") as pf:

                                    json.dump(pjson, pf, indent=2, ensure_ascii=False)

                            except Exception as pe:

                                print(f"[MMAudio SFX] Klaida išsaugant SFX variacijas: {pe}")



                        return True, new_var_url, existing_vars

        return False

    except Exception as e:

        print("[MMAudio SFX] Klaida generuojant SFX:", e)

        traceback.print_exc()

        return False, None, []



async def jit_upload_to_node(session, node_url, filename, node_id):

    if not filename or filename.strip() == "":

        return True, filename

    if node_id not in NODE_FILE_CACHE: NODE_FILE_CACHE[node_id] = set()



    file_path = os.path.join(VAULT_DIR, filename)

    if not os.path.exists(file_path):

        for ad in [AUDIO_DIR, VOICES_DIR, os.path.join("data", "audio"), os.path.join("data", "voices")]:

            cand = os.path.join(ad, filename)

            if os.path.exists(cand):

                file_path = cand

                break



    if not os.path.exists(file_path):

        # 1. Bandome su .png galūne

        if not filename.endswith(('.png', '.jpg', '.jpeg', '.webp')) and os.path.exists(os.path.join(VAULT_DIR, f"{filename}.png")):

            file_path = os.path.join(VAULT_DIR, f"{filename}.png")

        else:

            # 2. Bandome rasti pagal veikėjo vardo atitikimą Vault kataloge

            found_vault = False

            if os.path.exists(VAULT_DIR):

                clean_stem = filename.replace('.png', '').replace('.jpg', '').strip()

                for vf in os.listdir(VAULT_DIR):

                    if clean_stem.lower() in vf.lower():

                        file_path = os.path.join(VAULT_DIR, vf)

                        found_vault = True

                        break

            

            if not found_vault:

                file_path = os.path.join(FRONTEND_DIR, "base", filename)

                if not os.path.exists(file_path):

                    # Paieškome visuose prompts aplankų subkataloguose

                    found = False

                    if os.path.exists(PROMPTS_DIR):

                        for style_dir in os.listdir(PROMPTS_DIR):

                            style_path = os.path.join(PROMPTS_DIR, style_dir)

                            if os.path.isdir(style_path):

                                possible_path = os.path.join(style_path, "base", filename)

                                if os.path.exists(possible_path):

                                    file_path = possible_path

                                    found = True

                                    break

                                possible_path = os.path.join(style_path, filename)

                                if os.path.exists(possible_path):

                                    file_path = possible_path

                                    found = True

                                    break

                    if not found:

                        print(f"[JIT Sync] Įspėjimas: Failas '{filename}' nerastas serveryje.")

                        return False, filename



    # Tikriname failo pakeitimo laiką (mtime), kad pakeisti ar atnaujinti failai (pvz. naujas kadras) visada būtų iš naujo įkelti į ComfyUI

    mtime = os.path.getmtime(file_path) if os.path.exists(file_path) else 0

    cache_key = f"{filename}_{mtime}"

    safe_cached = sanitize_comfy_filename(filename)

    if cache_key in NODE_FILE_CACHE[node_id]:

        return True, safe_cached

    

    upload_url = f"{node_url}/upload/image"

    try:

        with open(file_path, 'rb') as f:

            data = aiohttp.FormData()

            # Extract subfolder if filename contains subdirectories, and sanitize filename for ComfyUI

            clean_filename = filename.replace('\\', '/')

            if '/' in clean_filename:

                parts = clean_filename.split('/')

                just_name = sanitize_comfy_filename(parts[-1])

                subfolder = '/'.join(parts[:-1])

                data.add_field('image', f, filename=just_name)

                data.add_field('subfolder', subfolder)

                upload_safe_name = f"{subfolder}/{just_name}"

            else:

                safe_name = sanitize_comfy_filename(filename)

                data.add_field('image', f, filename=safe_name)

                upload_safe_name = safe_name

                

            data.add_field('type', 'input')

            data.add_field('overwrite', 'true')

            async with session.post(upload_url, data=data) as resp:

                if resp.status == 200:

                    NODE_FILE_CACHE[node_id].add(cache_key)

                    NODE_FILE_CACHE[node_id].add(filename)

                    NODE_FILE_CACHE[node_id].add(upload_safe_name)

                    return True, upload_safe_name  # Return the safe name for workflow update

                return False, filename

    except Exception as e:

        print(f"[JIT Sync] Klaida siunčiant '{filename}' į {node_url}: {e}")

        return False, filename



async def download_image_from_node(session, url, save_path):

    async with session.get(url) as response:

        if response.status == 200:

            with open(save_path, 'wb') as f: f.write(await response.read())

            return True

    return False



def update_node_status(node_id, status):

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("UPDATE nodes SET status = ? WHERE id = ?", (status, node_id))

    conn.commit()

    conn.close()



# NAUJA: Apsauginiai užraktai Audio moduliui

def pause_farm(node_id,):

    """Sustabdo fermos užduotis priskirdamas specialų statusą"""

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("UPDATE nodes SET status = 'paused_audio' WHERE id = ?", (node_id,))

    conn.commit()

    conn.close()



def resume_farm(node_id,):

    """Atrakina GPU po audio generavimo"""

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    # Atrakiname tik tada, jei statusas nebuvo pakeistas į error/offline dėl kitų priežasčių

    c.execute("UPDATE nodes SET status = 'idle' WHERE id = ? AND status = 'paused_audio'", (node_id,))

    conn.commit()

    conn.close()



# ============================================================================

# 3. HEARTBEAT CHECKER (New background task)

# ============================================================================

async def check_node_health(session, node):

    node_id = node['id']

    url = f"{node['url'].rstrip('/')}/system_stats"

    try:

        async with session.get(url, timeout=aiohttp.ClientTimeout(total=4)) as resp:

            if resp.status == 200:

                if node['status'] == 'offline':

                    update_node_status(node_id, 'idle')

                    return True

                

                # Auto-heal zombie 'processing' status:

                # Jei mazgas pažymėtas kaip 'processing', bet eilėje nėra aktyvios processing užduoties šiam mazgui

                if node['status'] == 'processing':

                    conn = sqlite3.connect(DB_PATH, timeout=30.0)

                    c = conn.cursor()

                    c.execute("SELECT COUNT(*) FROM queue WHERE status = 'processing' AND assigned_node = ?", (node_id,))

                    in_progress_count = c.fetchone()[0]

                    conn.close()

                    

                    worker_alive = (node_id in ACTIVE_WORKERS and not ACTIVE_WORKERS[node_id].done())

                    if in_progress_count == 0 or not worker_alive:

                        update_node_status(node_id, 'idle')

                        return True

                return False

            else:

                raise Exception("Bad HTTP status")

    except Exception:

        # Jei mazgas nepasiekiamas ir nėra paused_audio, pažymime offline

        if node['status'] not in ['offline', 'paused_audio']:

            update_node_status(node_id, 'offline')

            return True

        return False



# ============================================================================

# 4. GPU NODE WORKER LOGIC

# ============================================================================

async def node_worker(node):

    node_id = node['id']

    node_url = node['url'].rstrip('/')

    client_id = str(uuid.uuid4())

    timeout = aiohttp.ClientTimeout(total=None, sock_connect=30, sock_read=30)

    

    async with aiohttp.ClientSession(timeout=timeout) as session:

        while True:

            conn = sqlite3.connect(DB_PATH, timeout=30.0)

            conn.row_factory = sqlite3.Row

            c = conn.cursor()

            c.execute("SELECT * FROM nodes WHERE id = ?", (node_id,))

            current_node = c.fetchone()

            

            if not current_node or current_node['is_active'] == 0:

                conn.close()

                update_node_status(node_id, "offline")

                break

                

            # NAUJA: SAFEGUARD - Neimame render užduočių, jei GPU yra 'paused_audio' arba 'offline'

            if current_node['status'] in ['offline', 'paused_audio']:

                conn.close()

                await asyncio.sleep(2)

                continue

                

            locked_proj = current_node['locked_proj']

            task = None

            

            c.execute("SELECT * FROM queue WHERE status = 'queued' AND target_node = ? ORDER BY priority ASC, created_at ASC LIMIT 1", (node_id,))

            task = c.fetchone()

            

            if not task:

                if locked_proj:

                    c.execute("SELECT * FROM queue WHERE status = 'queued' AND project_id = ? AND target_node IS NULL ORDER BY priority ASC, created_at ASC LIMIT 1", (locked_proj,))

                    task = c.fetchone()

                else:

                    c.execute("SELECT locked_proj FROM nodes WHERE locked_proj IS NOT NULL AND is_active = 1")

                    locked_projects_by_others = [r[0] for r in c.fetchall()]

                    if locked_projects_by_others:

                        placeholders = ','.join(['?']*len(locked_projects_by_others))

                        query = f"SELECT * FROM queue WHERE status = 'queued' AND target_node IS NULL AND project_id NOT IN ({placeholders}) ORDER BY priority ASC, created_at ASC LIMIT 1"

                        c.execute(query, locked_projects_by_others)

                    else:

                        c.execute("SELECT * FROM queue WHERE status = 'queued' AND target_node IS NULL ORDER BY priority ASC, created_at ASC LIMIT 1")

                        task = c.fetchone()

                        

            if not task:

                if current_node['status'] not in ['offline', 'paused_audio']:

                    if current_node['status'] != 'idle':

                        update_node_status(node_id, "idle")

                        await broadcast_system_state()

                conn.close()

                await asyncio.sleep(2)

                continue

                

            req_id = task['req_id']

            project_id = task['project_id']

            scene_id = task['scene_id']

            workflow = json.loads(task['workflow_json'])

            _sceneui_meta = workflow.pop("_sceneui_meta", {}) if isinstance(workflow, dict) else {}

            

            c.execute("UPDATE queue SET status = 'processing', assigned_node = ? WHERE req_id = ?", (node_id, req_id))

            c.execute("UPDATE nodes SET status = 'processing' WHERE id = ?", (node_id,))

            conn.commit()

            conn.close()

            

            await broadcast_system_state()

            

            try:

                # 0. LipSync (Node 940 LoadAudio) garso takelio automatinis patikrinimas ir priskyrimas

                if "940" in workflow and isinstance(workflow["940"], dict) and "inputs" in workflow["940"]:

                    cur_audio = workflow["940"]["inputs"].get("audio")

                    clean_cur = os.path.basename(str(cur_audio).split("?")[0]) if cur_audio else ""

                    exists = False

                    if clean_cur and (not clean_cur.startswith("chunk_") or len(clean_cur) > 15):

                        for d in [AUDIO_DIR, VAULT_DIR, VOICES_DIR, os.path.join("data", "audio")]:

                            if os.path.exists(os.path.join(d, clean_cur)):

                                exists = True

                                break

                    if not exists:

                        found_audio = find_scene_audio_file(project_id, scene_id)

                        if found_audio and os.path.exists(found_audio):

                            resolved_fname = os.path.basename(found_audio)

                            workflow["940"]["inputs"]["audio"] = resolved_fname

                            print(f"[Farm LipSync] Automatiškai rastas ir priskirtas scenos {scene_id} garso failas: {resolved_fname}")

                        elif not exists and clean_cur:

                            raise Exception(f"Scena {scene_id} neturi sugeneruoto garso failo ({clean_cur} nerastas)! LipSync lūpų sinchronizacijai (Node 940 LoadAudio) būtinas garso takelis. Pirmiausia sugeneruokite veikėjo balsą Audio skiltyje.")

                        elif not exists:

                            raise Exception(f"Scena {scene_id} neturi sugeneruoto garso failo! LipSync lūpų sinchronizacijai (Node 940 LoadAudio) būtinas garso takelis. Pirmiausia sugeneruokite veikėjo balsą Audio skiltyje.")



                # 1. Surenkame ir išsiunčiame reikalingas nuotraukas ir audio failus į ComfyUI

                required_images = extract_required_images(workflow)

                filename_remap = {}

                for img in required_images:

                    result = await jit_upload_to_node(session, node_url, img, node_id)

                    ok, safe_name = result if isinstance(result, tuple) else (result, img)

                    if ok and safe_name != img:

                        filename_remap[img] = safe_name

                

                # Jei reikia - atnaujiname workflow su saugiais vardais

                if filename_remap:

                    wf_str = json.dumps(workflow)

                    for orig, safe in filename_remap.items():

                        wf_str = wf_str.replace(json.dumps(orig)[1:-1], json.dumps(safe)[1:-1])

                    workflow = json.loads(wf_str)

                    

                final_filename = None

                download_url = None

                ws_url = node_url.replace("https://", "wss://").replace("http://", "ws://") + f"/ws?clientId={client_id}"

                

                # 2. PIRMIAUSIA prisijungiame prie WebSocket (su heartbeat=30s, kad neatsijungtų per ilgą H3 generavimą!)

                async with session.ws_connect(ws_url, heartbeat=30.0, timeout=aiohttp.ClientTimeout(total=None)) as comfy_ws:

                    

                    # 3. TIK TADA siunčiame promptą į ComfyUI (su pilnaverčiu UI workflow metaduomenims)

                    extra_data = build_extra_data(workflow, node_url)

                    prompt_req = await session.post(f"{node_url}/prompt", json={

                        "prompt": workflow,

                        "client_id": client_id,

                        "extra_data": extra_data

                    })

                    prompt_res = await prompt_req.json()

                    

                    # Iškoduojame tikrąją ComfyUI atmetimo priežastį, jei formatas blogas

                    if "error" in prompt_res: 

                        err_data = prompt_res["error"]

                        err_msg = err_data.get("message", str(err_data)) if isinstance(err_data, dict) else str(err_data)

                        node_errors = prompt_res.get("node_errors", {})

                        if node_errors:

                            details = []

                            for nid, nerr in node_errors.items():

                                details.append(f"Node {nid} ({nerr.get('class_type', '')}): {json.dumps(nerr.get('errors', []))}")

                            err_msg += " -> " + "; ".join(details)

                        raise Exception(f"ComfyUI Validation Error: {err_msg}")

                        

                    prompt_id = prompt_res.get("prompt_id")

                    if not prompt_id: 

                        raise Exception("Failed to get prompt_id from GPU.")

                    

                    # Informuojame vartotoją, kad ComfyUI priėmė užduotį ir ruošia / krauna modelį į VRAM

                    await manager.broadcast({

                        "type": "task_stage", "reqId": req_id, "projectId": project_id, 

                        "sceneId": scene_id, "stage": "loading_model", "nodeId": node_id

                    })



                    # 4. Klausomės realaus laiko progreso ir klaidų (su pilna apsauga nuo None reikšmių!)

                    async for msg in comfy_ws:

                        if msg.type == aiohttp.WSMsgType.TEXT:

                            try:

                                data = json.loads(msg.data)

                            except Exception:

                                continue

                            if not isinstance(data, dict):

                                continue



                            msg_type = data.get('type')

                            payload = data.get('data')

                            if not isinstance(payload, dict):

                                payload = {}



                            if msg_type == 'executing':

                                curr_node = payload.get('node')

                                if curr_node is not None:

                                    node_str = str(curr_node)

                                    node_info = workflow.get(node_str, {}) if isinstance(workflow, dict) else {}

                                    node_title = node_info.get('_meta', {}).get('title') or node_info.get('class_type') or f"Node {node_str}"

                                    

                                    stage_desc = f"Vykdoma: {node_title}"

                                    if "UNET" in node_title:

                                        stage_desc = "⏳ Kraunamas MiniMax H3 modelis (12GB)..."

                                    elif "CLIP" in node_title:

                                        stage_desc = "⏳ Kraunamas Qwen3-VL 32B CLIP modelis..."

                                    elif "VAE" in node_title and "Audio" not in node_title:

                                        stage_desc = "⏳ Kraunamas VAE..."

                                    elif "Audio VAE" in node_title or "AudioVAE" in node_title:

                                        stage_desc = "⏳ Kraunamas Audio VAE..."

                                    elif "ReferenceToVideo" in node_title:

                                        stage_desc = "🖼️ Apdorojamas scenos kadras (H3 Ref)..."

                                    elif "SongMasked" in node_title or "AVContext" in node_title:

                                        stage_desc = "🎵 Sinchronizuojamas balso garso takelis..."

                                    elif "Sampler" in node_title:

                                        stage_desc = "⚡ Generuojami video kadrai (Sampling)..."

                                    elif "VAEDecode" in node_title:

                                        stage_desc = "🎞️ Iškoduojamas video vaizdas (VAE Decode)..."

                                    elif "VideoCombine" in node_title:

                                        stage_desc = "🎬 Koduojamas galutinis MP4 video..."



                                    await manager.broadcast({

                                        "type": "task_stage", "reqId": req_id, "projectId": project_id, 

                                        "sceneId": scene_id, "stage": stage_desc, "nodeId": node_id

                                    })

                            elif msg_type == 'progress':

                                step_val = payload.get('value', 0)

                                max_val = payload.get('max', 0)

                                await manager.broadcast({

                                    "type": "task_progress", "reqId": req_id, "projectId": project_id, 

                                    "sceneId": scene_id, "step": step_val, "max": max_val, "nodeId": node_id

                                })

                            elif msg_type == 'execution_interrupted':

                                if payload.get('prompt_id') == prompt_id:

                                    raise Exception("ComfyUI generavimas buvo nutrauktas.")

                            elif msg_type == 'execution_error':

                                err_msg = payload.get('exception_message', 'Unknown Node failure')

                                node_crashed = payload.get('node_id', 'Unknown ID')

                                raise Exception(f"ComfyUI Execution Error in node {node_crashed}: {err_msg}")

                            elif msg_type == 'executed' and payload.get('prompt_id') == prompt_id:

                                out_data = payload.get('output', {})

                                if isinstance(out_data, dict):

                                    media_items = out_data.get("videos") or out_data.get("images") or out_data.get("gifs") or []

                                    if media_items and len(media_items) > 0:

                                        m_info = media_items[0]

                                        download_url = f"{node_url}/view?filename={m_info['filename']}&subfolder={m_info.get('subfolder', '')}&type={m_info.get('type', 'output')}"

                                        ext = os.path.splitext(m_info['filename'])[1] or ".png"

                                        final_filename = f"{project_id}_{scene_id}_{prompt_id}{ext}"

                                break



                # Fallback, jei netyčia atsijungė WebSocket (laukiame kol ComfyUI pabaigs, iki 20 minučių!)

                if not final_filename:

                    consecutive_not_in_queue = 0

                    for _ in range(600): # 600 * 2s = 1200s (20 minučių)

                        await asyncio.sleep(2)

                        # 1. Tikriname history

                        try:

                            async with session.get(f"{node_url}/history/{prompt_id}", timeout=aiohttp.ClientTimeout(total=5)) as hist_res:

                                if hist_res.status == 200:

                                    history = await hist_res.json()

                                    if isinstance(history, dict) and prompt_id in history:

                                        entry = history.get(prompt_id) or {}

                                        outputs = entry.get("outputs", {})

                                        if isinstance(outputs, dict):

                                            for k, v in outputs.items():

                                                if isinstance(v, dict):

                                                    media_items = v.get("videos") or v.get("images") or v.get("gifs") or []

                                                    if media_items and len(media_items) > 0:

                                                        m_info = media_items[0]

                                                        download_url = f"{node_url}/view?filename={m_info['filename']}&subfolder={m_info.get('subfolder', '')}&type={m_info.get('type', 'output')}"

                                                        ext = os.path.splitext(m_info['filename'])[1] or ".png"

                                                        final_filename = f"{project_id}_{scene_id}_{prompt_id}{ext}"

                                                        break

                                        if final_filename:

                                            break

                        except aiohttp.ClientConnectorError:

                            raise Exception("ComfyUI serveris nepasiekiamas (išjungtas arba perkraunamas).")

                        except Exception:

                            pass



                        if final_filename:

                            break



                        # 2. Tikriname ar užduotis vis dar vykdoma ComfyUI eilėje

                        try:

                            async with session.get(f"{node_url}/queue", timeout=aiohttp.ClientTimeout(total=5)) as q_res:

                                if q_res.status == 200:

                                    q_data = await q_res.json()

                                    if isinstance(q_data, dict):

                                        running = q_data.get("queue_running", [])

                                        pending = q_data.get("queue_pending", [])

                                        is_in_comfy = any(item[1] == prompt_id for item in running if isinstance(item, (list, tuple)) and len(item) > 1) or                                                       any(item[1] == prompt_id for item in pending if isinstance(item, (list, tuple)) and len(item) > 1)

                                        if is_in_comfy:

                                            consecutive_not_in_queue = 0

                                        else:

                                            consecutive_not_in_queue += 1

                                            # Tik jei 5 kartus iš eilės (10s) nėra eilėje IR nėra history - tik tada keliame klaidą

                                            if consecutive_not_in_queue >= 5:

                                                await asyncio.sleep(1)

                                                async with session.get(f"{node_url}/history/{prompt_id}", timeout=aiohttp.ClientTimeout(total=5)) as last_h:

                                                    if last_h.status == 200:

                                                        h_chk = await last_h.json()

                                                        if isinstance(h_chk, dict) and prompt_id in h_chk:

                                                            continue

                                                raise Exception("ComfyUI eilė tuščia arba užduotis buvo nutraukta / serveris perkrautas.")

                        except aiohttp.ClientConnectorError:

                            raise Exception("ComfyUI serveris nepasiekiamas (išjungtas arba perkraunamas).")

                        except Exception as q_err:

                            if "tuščia arba užduotis buvo nutraukta" in str(q_err):

                                raise q_err

                            pass



                if final_filename and download_url:

                    save_path = os.path.join(VAULT_DIR, final_filename)

                    if await download_image_from_node(session, download_url, save_path):

                        # Video apdorojimas (sulėtinimas ir audio prijungimas)

                        if final_filename.lower().endswith(('.mp4', '.webm', '.mov')):
                            is_lipsync = bool(_sceneui_meta.get("is_lipsync", False))
                            with_sfx = bool(_sceneui_meta.get("with_sfx", False))
                            sfx_prompt = str(_sceneui_meta.get("sfx_prompt", ""))

                            # Patikriname ar scena turi dialogą / personažo kalbą
                            has_dialogue = is_lipsync
                            if not has_dialogue and project_id and scene_id:
                                try:
                                    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
                                    if os.path.exists(proj_path):
                                        with open(proj_path, "r", encoding="utf-8") as pf:
                                            pj_chk = json.load(pf)
                                        clean_sid_chk = str(scene_id).replace("S", "").replace("s", "").strip()
                                        sc_match = next((s for s in pj_chk.get("scenes", []) if str(s.get("id", "")).replace("S", "").replace("s", "").strip() == clean_sid_chk), None)
                                        if sc_match and (sc_match.get("speaker") or sc_match.get("text") or sc_match.get("h3_prompt")):
                                            has_dialogue = True
                                except Exception:
                                    pass

                            # Sulėtinimas taikomas TIK ne-LipSync video (kad nesugadintų lūpų sinchronizacijos!)
                            if not is_lipsync and _sceneui_meta.get("slowdown_if_short", True):
                                scene_dur = float(_sceneui_meta.get("scene_duration", 0.0))
                                buf = float(_sceneui_meta.get("transition_buffer", 1.0))
                                target_dur = scene_dur + buf
                                if target_dur > 0.5:
                                    meta_fps = float(_sceneui_meta.get("fps", 0.0))
                                    await fit_video_to_duration(save_path, target_dur, target_fps=meta_fps if meta_fps > 0 else None)

                            # Patikriname ar video turi integruotą (native) audio takelį
                            has_audio_stream = False
                            try:
                                p_probe = await run_subprocess(
                                    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", save_path)
                                p_stdout, _ = await p_probe.communicate()
                                if p_probe.returncode == 0:
                                    p_data = json.loads(p_stdout.decode('utf-8', errors='ignore'))
                                    has_audio_stream = any(s.get('codec_type') == 'audio' for s in p_data.get('streams', []))
                            except Exception:
                                pass

                            latest_sfx_url = None
                            latest_sfx_vars = []

                            # NATIVE SFX IŠTRAUKIMAS: Jei scena neturi dialogo, o video turi integruotą garsą
                            if not has_dialogue and has_audio_stream:
                                clean_base = os.path.splitext(final_filename)[0]
                                native_sfx_name = f"sfx_{clean_base}_native_take1.wav"
                                native_sfx_path = os.path.join(AUDIO_DIR, native_sfx_name)
                                try:
                                    p_ext = await run_subprocess("ffmpeg", "-y", "-i", save_path, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", native_sfx_path)
                                    await p_ext.communicate()
                                    if os.path.exists(native_sfx_path) and os.path.getsize(native_sfx_path) > 0:
                                        print(f"[Native SFX] Sėkmingai ištrauktas natūralus video garsas kaip SFX Take #1: {native_sfx_name}")
                                        clean_sid = str(scene_id).replace("S", "").replace("s", "").strip()
                                        sid_key = f"s{clean_sid}" if clean_sid else "s1"
                                        native_var = {
                                            "id": f"var_sfx_native_{uuid.uuid4().hex[:6]}",
                                            "url": f"/audio/{native_sfx_name}",
                                            "name": "Take #1 (Native Video SFX)",
                                            "createdAt": datetime.now().strftime("%H:%M:%S"),
                                            "isMain": True,
                                            "isNative": True,
                                            "prompt": "Native Model Audio"
                                        }
                                        latest_sfx_url = native_var["url"]
                                        latest_sfx_vars = [native_var]

                                        proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")
                                        if os.path.exists(proj_path):
                                            try:
                                                with open(proj_path, "r", encoding="utf-8") as pf:
                                                    pj = json.load(pf)
                                                if "sceneSfxById" not in pj: pj["sceneSfxById"] = {}
                                                if "sceneSfxVarsById" not in pj: pj["sceneSfxVarsById"] = {}
                                                for k in [scene_id, sid_key, f"S{clean_sid}", clean_sid]:
                                                    if k:
                                                        pj["sceneSfxById"][k] = latest_sfx_url
                                                        pj["sceneSfxVarsById"][k] = latest_sfx_vars
                                                with open(proj_path, "w", encoding="utf-8") as pf:
                                                    json.dump(pj, pf, indent=2, ensure_ascii=False)
                                            except Exception as pe:
                                                print(f"[Native SFX] Klaida išsaugant native SFX variaciją: {pe}")
                                except Exception as e_ext:
                                    print(f"[Native SFX] Klaida ištraukiant native garsą: {e_ext}")

                            # Jei pasirinktas scenos SFX aplinkos generavimas (Workflow 19 - MMAudio)
                            if with_sfx:
                                print(f"[MMAudio SFX] Vykdomas SFX generavimas video failui: {final_filename}")
                                sfx_res = await generate_sfx_for_video(session, node_url, final_filename, sfx_prompt=sfx_prompt, node_id=node_id, project_id=project_id, scene_id=scene_id)
                                if isinstance(sfx_res, tuple):
                                    sfx_ok, sfx_url, sfx_vars = sfx_res
                                    if sfx_ok and sfx_url:
                                        latest_sfx_url = sfx_url
                                        latest_sfx_vars = sfx_vars

                            # Jei turime SFX (Native arba MMAudio) – iškart išsiunčiame sfx_progress pranešimą!
                            if latest_sfx_url:
                                await manager.broadcast({
                                    "type": "sfx_progress", "sceneId": scene_id, "status": "done",
                                    "reqId": req_id, "projectId": project_id, "sfxUrl": latest_sfx_url,
                                    "variations": latest_sfx_vars
                                })

                            # Standartinis nebylių modelių audio muxinimas (jei ne LipSync IR jei buvo pažymėta with_audio IR video neturi audio)
                            if _sceneui_meta.get("with_audio") and not is_lipsync and not has_audio_stream:
                                buf_off = float(_sceneui_meta.get("audio_offset", 0.5))
                                sound_vol = float(_sceneui_meta.get("sound_volume", 1.0))
                                await mux_scene_audio_to_video(save_path, project_id, scene_id, buffer_offset=buf_off, sound_volume=sound_vol)
                            elif has_audio_stream and abs(float(_sceneui_meta.get("sound_volume", 1.0)) - 1.0) > 0.05:
                                sound_vol = float(_sceneui_meta.get("sound_volume", 1.0))
                                temp_vol = save_path + ".vol.mp4"
                                try:
                                    p_vol = await run_subprocess(
                                        "ffmpeg", "-y", "-i", save_path, "-c:v", "copy", "-filter:a", f"volume={sound_vol:.2f}", "-c:a", "aac", temp_vol)
                                    await p_vol.communicate()
                                    if p_vol.returncode == 0 and os.path.exists(temp_vol):
                                        os.replace(temp_vol, save_path)
                                except Exception:
                                    if os.path.exists(temp_vol):
                                        try: os.remove(temp_vol)
                                        except: pass

                        # Atnaujiname projekto failą tiesiogiai diske kaip apsaugą

                        try:

                            proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

                            if os.path.exists(proj_path):

                                with open(proj_path, "r", encoding="utf-8") as pf:

                                    pj = json.load(pf)

                                clean_sid = str(scene_id).replace("S", "").replace("s", "").strip()

                                for out in pj.get("outputs", []):

                                    if str(out.get("sceneId", "")).replace("S", "").replace("s", "").strip() == clean_sid:

                                        v = next((x for x in out.get("variations", []) if x.get("id") == req_id), None)

                                        if v:

                                            v["url"] = f"/vault/{final_filename}"

                                            v["status"] = "done"

                                            out["mainId"] = v["id"]

                                        out["generating"] = any(x.get("status") in ("queued", "processing") for x in out.get("variations", []))

                                        break

                                with open(proj_path, "w", encoding="utf-8") as pf:

                                    json.dump(pj, pf, indent=2, ensure_ascii=False)

                        except Exception as pje:

                            print(f"[node_worker] Warning: could not update project json: {pje}")



                        conn = sqlite3.connect(DB_PATH, timeout=30.0)

                        c = conn.cursor()

                        c.execute("SELECT status FROM queue WHERE req_id = ?", (req_id,))

                        task_row = c.fetchone()

                        if task_row:

                            c.execute("UPDATE queue SET status = 'done' WHERE req_id = ?", (req_id,))

                        c.execute("UPDATE nodes SET status = 'idle' WHERE id = ?", (node_id,))

                        conn.commit()

                        conn.close()

                        await manager.broadcast({

                            "type": "task_complete", "projectId": project_id, "reqId": req_id, 
                            "sceneId": scene_id, "vaultUrl": f"/vault/{final_filename}", "nodeId": node_id,
                            "sfxUrl": latest_sfx_url, "sfxVariations": latest_sfx_vars
                        })

                    else: raise Exception("Error transferring image from GPU to Vault.")

                else: raise Exception("GPU did not return an image (failed to parse filename).")

                

            except Exception as e:

                conn = sqlite3.connect(DB_PATH, timeout=30.0)

                c = conn.cursor()

                c.execute("SELECT status FROM queue WHERE req_id = ?", (req_id,))

                task_row = c.fetchone()

                if task_row:

                    c.execute("UPDATE queue SET status = 'error', error_log = ? WHERE req_id = ?", (str(e), req_id))

                

                # SVARBIAUSIAS PATAISYMAS: Jei lūžo generavimas, nenumušame pačio GPU serverio į 'offline'!

                # ComfyUI vis dar veikia, todėl grąžiname GPU į 'idle', kad priimtų kitas užduotis.

                if "ClientConnectorError" in str(e) or "Cannot connect" in str(e) or "serveris nepasiekiamas" in str(e):

                    c.execute("UPDATE nodes SET status = 'offline' WHERE id = ?", (node_id,))

                else:

                    c.execute("UPDATE nodes SET status = 'idle' WHERE id = ?", (node_id,))

                    

                conn.commit()

                conn.close()

                await manager.broadcast({

                    "type": "task_error", "projectId": project_id, "reqId": req_id, 

                    "sceneId": scene_id, "error": str(e), "nodeId": node_id

                })

            finally:

                await broadcast_system_state()

                await asyncio.sleep(1)



@router.get("/api/farm/debug")

async def farm_debug():

    workers_status = {}

    for k, v in ACTIVE_WORKERS.items():

        workers_status[k] = {"done": v.done(), "cancelled": v.cancelled()}

        if not v.done():

            stack = [f"{f.f_code.co_filename}:{f.f_lineno} in {f.f_code.co_name}" for f in v.get_stack()]

            workers_status[k]["stack"] = stack

        elif not v.cancelled():

            exc = v.exception()

            workers_status[k]["exception"] = str(exc) if exc else None

    return {"status": "ok", "active_workers": workers_status}



# ============================================================================

# 5. ORCHESTRATOR (Exported to main.py)

# ============================================================================

async def node_manager_loop():

    while True:

        conn = sqlite3.connect(DB_PATH, timeout=30.0)

        conn.row_factory = sqlite3.Row

        c = conn.cursor()

        c.execute("SELECT * FROM nodes WHERE is_active = 1")

        active_nodes = c.fetchall()

        conn.close()

        

        current_node_ids = set()

        for node in active_nodes:

            nid = node['id']

            current_node_ids.add(nid)

            if nid not in ACTIVE_WORKERS or ACTIVE_WORKERS[nid].done():

                ACTIVE_WORKERS[nid] = asyncio.create_task(node_worker(dict(node)))

                

        workers_to_cancel = [wid for wid in ACTIVE_WORKERS if wid not in current_node_ids]

        for wid in workers_to_cancel:

            ACTIVE_WORKERS[wid].cancel()

            del ACTIVE_WORKERS[wid]

            

        await asyncio.sleep(5)



# ============================================================================

# 6. HEARTBEAT LOOP (New wrapper to fix missing loop in server.py)

# ============================================================================

async def node_health_checker_loop():

    timeout = aiohttp.ClientTimeout(total=5)

    async with aiohttp.ClientSession(timeout=timeout) as session:

        while True:

            conn = sqlite3.connect(DB_PATH, timeout=30.0)

            conn.row_factory = sqlite3.Row

            c = conn.cursor()

            c.execute("SELECT * FROM nodes WHERE is_active = 1")

            active_nodes = c.fetchall()

            conn.close()



            changed = False

            for node in active_nodes:

                if await check_node_health(session, dict(node)):

                    changed = True

            

            if changed:

                await broadcast_system_state()

            

            await asyncio.sleep(15)



# ============================================================================

# 7. API ROUTES: FARM & QUEUE MANAGEMENT

# ============================================================================

@router.get("/api/nodes")

async def get_nodes():

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    conn.row_factory = sqlite3.Row

    c = conn.cursor()

    c.execute("SELECT * FROM nodes")

    nodes = [dict(n) for n in c.fetchall()]

    conn.close()

    return {"status": "success", "nodes": nodes}



@router.post("/api/nodes/update")

async def update_node(request: Request):

    data = await request.json()

    node_id = data.get("id")

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    if data.get("is_new"):

        locked_proj = data.get("locked_proj", None)

        is_active = data.get("is_active", 1)

        c.execute("INSERT INTO nodes (id, name, url, api_key, status, locked_proj, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",

                  (node_id, data.get("name"), data.get("url"), data.get("api_key", ""), "offline", locked_proj, is_active))

    else:

        updates = []

        params = []

        for key in ["name", "url", "api_key", "locked_proj", "is_active", "status"]:

            if key in data:

                updates.append(f"{key} = ?")

                params.append(data[key])

        if updates:

            params.append(node_id,)

            c.execute(f"UPDATE nodes SET {', '.join(updates)} WHERE id = ?", tuple(params))

    conn.commit()

    conn.close()

    await broadcast_system_state()

    return {"status": "success"}



@router.post("/api/nodes/delete")

async def delete_node(request: Request):

    data = await request.json()

    node_id = data.get("id")

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("DELETE FROM nodes WHERE id = ?", (node_id,))

    conn.commit()

    conn.close()

    await broadcast_system_state()

    return {"status": "success"}



@router.post("/api/queue/assign")

async def assign_task_node(request: Request):

    data = await request.json()

    req_id = data.get("req_id")

    target_node = data.get("target_node")

    if not target_node: target_node = None

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("UPDATE queue SET target_node = ? WHERE req_id = ?", (target_node, req_id))

    conn.commit()

    conn.close()

    await broadcast_system_state()

    return {"status": "success"}



@router.post("/api/queue/cancel")

async def cancel_task(request: Request):

    data = await request.json()

    req_id = data.get("req_id")

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    conn.row_factory = sqlite3.Row

    c = conn.cursor()

    c.execute("SELECT * FROM queue WHERE req_id = ?", (req_id,))

    task = c.fetchone()

    

    deleted = 0

    assigned_node_id = None

    if task:

        assigned_node_id = task["assigned_node"] if task["status"] == "processing" else None

        c.execute("DELETE FROM queue WHERE req_id = ?", (req_id,))

        deleted = c.rowcount

        if assigned_node_id:

            c.execute("UPDATE nodes SET status = 'idle' WHERE id = ?", (assigned_node_id,))

    conn.commit()

    conn.close()



    if assigned_node_id:

        conn = sqlite3.connect(DB_PATH, timeout=30.0)

        conn.row_factory = sqlite3.Row

        c = conn.cursor()

        c.execute("SELECT url FROM nodes WHERE id = ?", (assigned_node_id,))

        node_row = c.fetchone()

        conn.close()

        if node_row:

            node_url = node_row["url"].rstrip('/')

            try:

                async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as session:

                    await session.post(f"{node_url}/interrupt")

            except Exception:

                pass



    await broadcast_system_state()

    if deleted > 0: return {"status": "success", "message": "Task canceled"}

    else: return {"status": "error", "message": "Task not found"}



@router.post("/api/queue/vip")

async def vip_task(request: Request):

    data = await request.json()

    req_id = data.get("req_id")

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("UPDATE queue SET priority = 0 WHERE req_id = ?", (req_id,))

    conn.commit()

    conn.close()

    await broadcast_system_state()

    return {"status": "success"}



@router.post("/api/queue/add")

async def add_to_queue(request: Request):

    data = await request.json()

    req_id = str(uuid.uuid4())

    target_node = data.get("targetNode", None)

    wf = data.get("workflow", {})

    if isinstance(wf, dict):

        wf["_sceneui_meta"] = {

            "with_audio": bool(data.get("withAudio", False)),

            "audio_offset": float(data.get("audioOffset", 0.5)),

            "sound_volume": float(data.get("soundVolume", 1.0)),

            "scene_duration": float(data.get("sceneDuration", 0.0)),

            "slowdown_if_short": bool(data.get("slowdownIfShort", True)),

            "transition_buffer": float(data.get("transitionBuffer", 1.0)),

            "fps": float(data.get("fps", 0.0)),

            "is_lipsync": bool(data.get("isLipsync", False)),

            "with_sfx": bool(data.get("withSfx", False)),

            "sfx_prompt": str(data.get("sfxPrompt", ""))

        }

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    c = conn.cursor()

    c.execute("INSERT INTO queue (req_id, project_id, scene_id, priority, status, target_node, workflow_json) VALUES (?, ?, ?, ?, ?, ?, ?)",

              (req_id, data.get("projectId", "default"), data.get("sceneId", "Unknown"), data.get("priority", 2), "queued", target_node, json.dumps(wf)))

    conn.commit()

    conn.close()

    await broadcast_system_state()

    return Response(content=json.dumps({"status": "success", "reqId": req_id}, ensure_ascii=False), media_type="application/json")



@router.post("/api/video/regenerate_sfx")

async def regenerate_sfx(request: Request):

    data = await request.json()

    project_id = data.get("projectId", "default")

    scene_id = data.get("sceneId", "")

    sfx_prompt = data.get("sfxPrompt", "")

    video_filename = data.get("videoFilename", "")

    

    if not video_filename and scene_id:

        proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

        if os.path.exists(proj_path):

            try:

                with open(proj_path, "r", encoding="utf-8") as f:

                    pdata = json.load(f)

                clean_sid = str(scene_id).replace("S", "").replace("s", "").strip()

                out = next((o for o in pdata.get("outputs", []) if str(o.get("sceneId", "")).replace("S", "").replace("s", "").strip() == clean_sid), None)

                if out:

                    vars = out.get("variations", [])

                    main_var = next((v for v in vars if v.get("id") == out.get("mainId")), None)

                    if not (main_var and main_var.get("url", "").lower().endswith(('.mp4', '.mov', '.webm', '.mkv'))):

                        video_var = next((v for v in reversed(vars) if v.get("url", "").lower().endswith(('.mp4', '.mov', '.webm', '.mkv'))), None)

                        if video_var:

                            main_var = video_var

                        elif not main_var and vars:

                            main_var = vars[-1]

                    if main_var and main_var.get("url"):

                        video_filename = os.path.basename(main_var["url"].split("?")[0])

            except Exception as e:

                print("Klaida ieškant video failo:", e)



    if not video_filename:

        return Response(content=json.dumps({"status": "error", "message": "Scena neturi sugeneruoto video failo!"}), media_type="application/json", status_code=400)



    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    conn.row_factory = sqlite3.Row

    c = conn.cursor()

    c.execute("SELECT id, url FROM nodes WHERE is_active = 1 AND status != 'offline' LIMIT 1")

    node_row = c.fetchone()

    conn.close()



    if not node_row:

        return Response(content=json.dumps({"status": "error", "message": "Nėra aktyvaus ComfyUI mazgo!"}), media_type="application/json", status_code=503)



    node_id = node_row["id"]

    node_url = node_row["url"].rstrip('/')

    

    req_id = f"sfx_{uuid.uuid4().hex[:8]}"

    # Įtraukiame į aktyvių užduočių eilę, kad visa SceneUI sistema ir kortelės realiu laiku matytų SFX generavimo būseną

    try:

        conn = sqlite3.connect(DB_PATH, timeout=30.0)

        c = conn.cursor()

        c.execute("INSERT INTO queue (req_id, project_id, scene_id, priority, status, target_node, assigned_node, workflow_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",

                  (req_id, project_id, scene_id, 1, "processing", node_id, node_id, json.dumps({"type": "sfx_regen", "sfx_prompt": sfx_prompt})))

        conn.commit()

        conn.close()

        await broadcast_system_state()

        await manager.broadcast({

            "type": "sfx_progress", "sceneId": scene_id, "status": "processing",

            "reqId": req_id, "projectId": project_id

        })

    except Exception as q_err:

        print("[regenerate_sfx] Error registering task in queue:", q_err)



    try:

        async with aiohttp.ClientSession() as session:

            # Save sfx_prompt to project json for this scene

            if project_id and scene_id and sfx_prompt:

                try:

                    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

                    if os.path.exists(proj_path):

                        with open(proj_path, "r", encoding="utf-8") as pf:

                            pjson = json.load(pf)

                        for sc in pjson.get("scenes", []):

                            if str(sc.get("id")) in [str(scene_id), str(scene_id).replace("S","").replace("s","")]:

                                sc["sfx_prompt"] = sfx_prompt

                        with open(proj_path, "w", encoding="utf-8") as pf:

                            json.dump(pjson, pf, indent=2, ensure_ascii=False)

                except Exception as pe:

                    print(f"[regenerate_sfx] Error saving sfx_prompt: {pe}")



            ignore_lips = bool(data.get("ignoreLips", True))

            res = await generate_sfx_for_video(session, node_url, video_filename, sfx_prompt=sfx_prompt, node_id=node_id, project_id=project_id, scene_id=scene_id, ignore_lips=ignore_lips)

            if isinstance(res, tuple):

                ok, sfx_url, all_vars = res

            else:

                ok = bool(res)

                sfx_url = f"/audio/sfx_{os.path.splitext(video_filename)[0]}.wav"

                all_vars = []

                

            if ok:

                await manager.broadcast({

                    "type": "sfx_progress", "sceneId": scene_id, "status": "done",

                    "reqId": req_id, "projectId": project_id, "sfxUrl": sfx_url,

                    "variations": all_vars

                })

                return Response(content=json.dumps({

                    "status": "success",

                    "message": "SFX sėkmingai atnaujintas!",

                    "video": video_filename,

                    "sfxUrl": sfx_url,

                    "variations": all_vars

                }), media_type="application/json")

            else:

                await manager.broadcast({

                    "type": "sfx_progress", "sceneId": scene_id, "status": "error",

                    "reqId": req_id, "projectId": project_id, "message": "MMAudio SFX generavimas nepavyko."

                })

                return Response(content=json.dumps({"status": "error", "message": "MMAudio SFX generavimas nepavyko."}), media_type="application/json", status_code=500)

    finally:

        try:

            conn = sqlite3.connect(DB_PATH, timeout=30.0)

            c = conn.cursor()

            c.execute("DELETE FROM queue WHERE req_id = ?", (req_id,))

            conn.commit()

            conn.close()

            await broadcast_system_state()

        except Exception:

            pass



@router.get("/api/queue/status")

async def get_queue_status():

    await broadcast_system_state()

    return {"status": "ok"}



@router.post("/api/queue/clear")

async def clear_queue():

    conn = sqlite3.connect(DB_PATH, timeout=30.0)

    conn.row_factory = sqlite3.Row

    c = conn.cursor()

    c.execute("SELECT id, url FROM nodes WHERE is_active = 1")

    active_nodes = [dict(r) for r in c.fetchall()]

    c.execute("DELETE FROM queue")

    c.execute("UPDATE nodes SET status = 'idle' WHERE status = 'processing'")

    conn.commit()

    conn.close()



    try:

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=2)) as session:

            for n in active_nodes:

                nurl = n["url"].rstrip('/')

                try:

                    await session.post(f"{nurl}/interrupt")

                    await session.post(f"{nurl}/queue", json={"clear": True})

                except Exception:

                    pass

    except Exception:

        pass



    await broadcast_system_state()

    return Response(content=json.dumps({"status": "success"}), media_type="application/json")



@router.post("/api/video/sfx_variations/set_main")

async def set_main_sfx_variation(request: Request):

    data = await request.json()

    project_id = data.get("projectId", "default")

    scene_id = str(data.get("sceneId", ""))

    var_id = str(data.get("varId", ""))

    

    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    if not os.path.exists(proj_path):

        return Response(content=json.dumps({"status": "error", "message": "Projektas nerastas"}), media_type="application/json", status_code=404)

        

    try:

        with open(proj_path, "r", encoding="utf-8") as f:

            pjson = json.load(f)

            

        clean_sid = scene_id.replace("S", "").replace("s", "").strip()

        sid_key = f"s{clean_sid}"

        

        all_vars = pjson.get("sceneSfxVarsById", {}).get(sid_key, [])

        selected_url = None

        for v in all_vars:

            if v.get("id") == var_id:

                v["isMain"] = True

                selected_url = v.get("url")

            else:

                v["isMain"] = False

                

        if not selected_url:

            return Response(content=json.dumps({"status": "error", "message": "Variacija nerasta"}), media_type="application/json", status_code=404)

            

        if "sceneSfxById" not in pjson:

            pjson["sceneSfxById"] = {}

        if "sceneSfxVarsById" not in pjson:

            pjson["sceneSfxVarsById"] = {}

            

        for k in [scene_id, sid_key, f"S{clean_sid}", clean_sid]:

            if k:

                pjson["sceneSfxById"][k] = selected_url

                pjson["sceneSfxVarsById"][k] = all_vars

                

        with open(proj_path, "w", encoding="utf-8") as pf:

            json.dump(pjson, pf, indent=2, ensure_ascii=False)

            

        await manager.broadcast({

            "type": "sfx_progress", "sceneId": scene_id, "status": "done",

            "projectId": project_id, "sfxUrl": selected_url, "variations": all_vars

        })

        return Response(content=json.dumps({"status": "success", "sfxUrl": selected_url, "variations": all_vars}), media_type="application/json")

    except Exception as e:

        return Response(content=json.dumps({"status": "error", "message": str(e)}), media_type="application/json", status_code=500)





@router.post("/api/video/sfx_variations/delete")

async def delete_sfx_variation(request: Request):

    data = await request.json()

    project_id = data.get("projectId", "default")

    scene_id = str(data.get("sceneId", ""))

    var_id = str(data.get("varId", ""))

    

    proj_path = os.path.join(PROJECTS_DIR, f"{project_id}.json")

    if not os.path.exists(proj_path):

        return Response(content=json.dumps({"status": "error", "message": "Projektas nerastas"}), media_type="application/json", status_code=404)

        

    try:

        with open(proj_path, "r", encoding="utf-8") as f:

            pjson = json.load(f)

            

        clean_sid = scene_id.replace("S", "").replace("s", "").strip()

        sid_key = f"s{clean_sid}"

        

        all_vars = pjson.get("sceneSfxVarsById", {}).get(sid_key, [])

        idx = next((i for i, v in enumerate(all_vars) if v.get("id") == var_id), -1)

        if idx == -1:

            return Response(content=json.dumps({"status": "error", "message": "Variacija nerasta"}), media_type="application/json", status_code=404)

            

        was_main = all_vars[idx].get("isMain", False)

        deleted_var = all_vars.pop(idx)

        

        if deleted_var.get("url"):

            fname = os.path.basename(deleted_var["url"].split("?")[0])

            fpath = os.path.join(AUDIO_DIR, fname)

            if os.path.exists(fpath):

                try: os.remove(fpath)

                except Exception: pass

                

        new_main_url = None

        if all_vars:

            if was_main:

                all_vars[-1]["isMain"] = True

                new_main_url = all_vars[-1].get("url")

            else:

                main_v = next((v for v in all_vars if v.get("isMain")), all_vars[-1])

                main_v["isMain"] = True

                new_main_url = main_v.get("url")

                

        if "sceneSfxById" not in pjson:

            pjson["sceneSfxById"] = {}

        if "sceneSfxVarsById" not in pjson:

            pjson["sceneSfxVarsById"] = {}

            

        for k in [scene_id, sid_key, f"S{clean_sid}", clean_sid]:

            if k:

                if new_main_url:

                    pjson["sceneSfxById"][k] = new_main_url

                else:

                    pjson["sceneSfxById"].pop(k, None)

                pjson["sceneSfxVarsById"][k] = all_vars

                

        with open(proj_path, "w", encoding="utf-8") as pf:

            json.dump(pjson, pf, indent=2, ensure_ascii=False)

            

        await manager.broadcast({

            "type": "sfx_progress", "sceneId": scene_id, "status": "done",

            "projectId": project_id, "sfxUrl": new_main_url, "variations": all_vars

        })

        return Response(content=json.dumps({"status": "success", "sfxUrl": new_main_url, "variations": all_vars}), media_type="application/json")

    except Exception as e:

        return Response(content=json.dumps({"status": "error", "message": str(e)}), media_type="application/json", status_code=500)

