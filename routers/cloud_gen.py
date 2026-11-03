import os
import io
import uuid
import asyncio
import traceback
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse

import config
from config import VAULT_DIR, BASE_DIR
from ws_manager import manager

router = APIRouter()

def get_google_client(custom_key: Optional[str] = None):
    from google import genai
    key = (custom_key or "").strip() or config.GOOGLE_API_KEY or os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    if not key:
        raise ValueError("Google API Key nenurodytas! Įrašykite raktą į nustatymus arba .env faile kaip GOOGLE_API_KEY.")
    return genai.Client(api_key=key)

def resolve_cloud_model(model_name: Optional[str]) -> str:
    if not model_name:
        return getattr(config, "CLOUD_MODEL_DEFAULT", "gemini-3.1-flash-image")
    m = model_name.lower().strip()
    if "nano_banana" in m or "flash" in m or "3.1" in m:
        return "gemini-3.1-flash-image"
    if "2.5" in m:
        return "gemini-2.5-flash-image"
    if "pro" in m:
        return "gemini-3-pro-image-preview"
    return getattr(config, "CLOUD_MODEL_DEFAULT", "gemini-3.1-flash-image")

def resolve_aspect_ratio(w: Optional[int], h: Optional[int], explicit_ar: Optional[str] = None) -> str:
    if explicit_ar:
        ar = explicit_ar.strip()
        if ar in ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"]:
            return ar
        if ar == "tall":
            return "9:16"
    if not w or not h:
        return "16:9"
    ratio = w / h
    ratios = {
        "16:9": 16 / 9,
        "9:16": 9 / 16,
        "1:1": 1.0,
        "4:3": 4 / 3,
        "3:4": 3 / 4,
        "3:2": 3 / 2,
        "2:3": 2 / 3,
        "21:9": 21 / 9
    }
    return min(ratios.keys(), key=lambda k: abs(ratios[k] - ratio))

def extract_image_bytes(response) -> bytes:
    if not response or not hasattr(response, "candidates") or not response.candidates:
        raise ValueError("Google API negrąžino jokio atsakymo (candidates tuščias).")
    
    for candidate in response.candidates:
        if candidate.content and candidate.content.parts:
            for part in candidate.content.parts:
                if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                    data = part.inline_data.data
                    if isinstance(data, str):
                        import base64
                        return base64.b64decode(data)
                    elif isinstance(data, (bytes, bytearray)):
                        return bytes(data)
    raise ValueError("Atsakyme nerasta sugeneruoto vaizdo duomenų (inline_data).")

def format_cloud_error(e: Exception) -> str:
    msg = str(e)
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg or "limit: 0" in msg.lower() or "quota" in msg.lower():
        return (
            "Google AI Studio kvotos limitas: Nemokama paskyra (Free Tier) neturi vaizdų generavimo kvotos (limit: 0). "
            "Norint generuoti vaizdus su Nano Banana / Gemini Image API, Google AI Studio (ai.google.dev) prie projekto reikia pridėti mokėjimo metodą (Set up billing / Pay-as-you-go). "
            "Kaina: ~$0.018 - $0.035 už vaizdą."
        )
    if "API_KEY_INVALID" in msg or "API key not valid" in msg or ("400" in msg and "key" in msg.lower()):
        return "Neteisingas Google API raktas. Patikrinkite raktą nustatymuose."
    return f"Cloud API klaida: {msg}"

@router.get("/api/cloud/status")
async def get_cloud_status():
    key = config.GOOGLE_API_KEY or os.getenv("GOOGLE_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    has_key = bool(key and len(key) > 5)
    mask = f"{key[:4]}...{key[-4:]}" if has_key and len(key) >= 8 else ("Taip" if has_key else "Nėra")
    return {
        "status": "ok",
        "hasKey": has_key,
        "keyMask": mask,
        "defaultModel": getattr(config, "CLOUD_MODEL_DEFAULT", "gemini-3.1-flash-image")
    }

@router.post("/api/cloud/key")
async def save_cloud_key(request: Request):
    data = await request.json()
    new_key = data.get("apiKey", "").strip()
    
    # Atnaujiname atmintyje
    config.GOOGLE_API_KEY = new_key
    if new_key:
        os.environ["GOOGLE_API_KEY"] = new_key
    else:
        os.environ.pop("GOOGLE_API_KEY", None)
        os.environ.pop("GEMINI_API_KEY", None)
    
    # Išsaugome į .env failą
    env_path = os.path.join(BASE_DIR, ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.startswith("GOOGLE_API_KEY=") and not line.startswith("GEMINI_API_KEY="):
                    lines.append(line)

    if new_key:
        lines.append(f"GOOGLE_API_KEY={new_key}\n")

    with open(env_path, "w", encoding="utf-8") as f:
        f.writelines(lines)

    msg = "Google API raktas sėkmingai išsaugotas!" if new_key else "Google API raktas pašalintas."
    return {"status": "success", "message": msg}

@router.post("/api/cloud/generate")
async def generate_cloud_image(request: Request):
    """
    Tiesioginis (Real-time Instant) vieno vaizdo generavimas per Google GenAI (Gemini Flash Image).
    Atsakymo greitis ~1.5 - 2.5 sekundės.
    """
    data = await request.json()
    project_id = data.get("projectId", "default")
    scene_id = str(data.get("sceneId", "Unknown"))
    prompt = data.get("prompt", "").strip()
    neg_prompt = data.get("negativePrompt", "")
    w = data.get("width", 1920)
    h = data.get("height", 1080)
    explicit_ar = data.get("aspectRatio")
    req_id = data.get("reqId") or str(uuid.uuid4())
    custom_key = data.get("apiKey")
    model_name = data.get("model")

    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt negali būti tuščias")

    aspect_ratio = resolve_aspect_ratio(w, h, explicit_ar)

    try:
        client = get_google_client(custom_key)
        from google.genai import types

        # Siunčiame pradžios stadiją per WebSocket
        await manager.broadcast({
            "type": "task_stage",
            "reqId": req_id,
            "projectId": project_id,
            "sceneId": scene_id,
            "stage": "cloud_generating",
            "nodeId": "cloud_nano_banana"
        })

        # Generuojame vaizdą per generate_content su IMAGE modalumu
        def call_api():
            target_model = resolve_cloud_model(model_name)
            cfg = types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio)
            )
            full_contents = prompt
            if neg_prompt:
                full_contents += f"\nNegative prompt: {neg_prompt}"

            try:
                return client.models.generate_content(
                    model=target_model,
                    contents=full_contents,
                    config=cfg
                )
            except Exception as e_first:
                # Fallback į gemini-2.5-flash-image jei modelis nerastas
                if target_model != "gemini-2.5-flash-image" and ("not found" in str(e_first).lower() or "404" in str(e_first)):
                    return client.models.generate_content(
                        model="gemini-2.5-flash-image",
                        contents=full_contents,
                        config=cfg
                    )
                raise e_first

        # Vykdome sinchroninį SDK iškvietimą atskirame gijoje (thread)
        res = await asyncio.to_thread(call_api)
        img_bytes = extract_image_bytes(res)

        safe_scene = "".join(c for c in scene_id if c.isalnum() or c in ('_', '-'))
        final_filename = f"{project_id}_{safe_scene}_{req_id[:8]}.png"
        out_path = os.path.join(VAULT_DIR, final_filename)

        with open(out_path, "wb") as f:
            f.write(img_bytes)

        vault_url = f"/vault/{final_filename}"

        # Informuojame frontendą apie sėkmingą užduoties baigimą
        await manager.broadcast({
            "type": "task_complete",
            "projectId": project_id,
            "reqId": req_id,
            "sceneId": scene_id,
            "vaultUrl": vault_url,
            "nodeId": "cloud_nano_banana"
        })

        return {
            "status": "success",
            "reqId": req_id,
            "vaultUrl": vault_url,
            "filename": final_filename
        }

    except Exception as e:
        err_msg = format_cloud_error(e)
        traceback.print_exc()
        await manager.broadcast({
            "type": "task_error",
            "projectId": project_id,
            "reqId": req_id,
            "sceneId": scene_id,
            "error": err_msg,
            "nodeId": "cloud_nano_banana"
        })
        raise HTTPException(status_code=500, detail=err_msg)

@router.post("/api/cloud/batch/submit")
async def submit_cloud_batch(request: Request):
    """
    Masinis generavimas:
    Priima sąrašą kadrų / veikėjų.
    Vykdo lygiagretų asinchroninį srautą (concurrency pool = 3),
    iš karto pranešdamas per WebSocket apie kiekvieno kadro sėkmę.
    """
    data = await request.json()
    project_id = data.get("projectId", "default")
    items = data.get("items", [])
    custom_key = data.get("apiKey")
    model_name = data.get("model")

    if not items:
        return {"status": "success", "message": "Nėra elementų generavimui", "queued": 0}

    batch_id = str(uuid.uuid4())[:8]

    # Paleidžiame foninį masinio generavimo procesorių
    asyncio.create_task(run_cloud_batch_worker(batch_id, project_id, items, custom_key, model_name))

    return {
        "status": "success",
        "batchId": batch_id,
        "total": len(items),
        "message": f"Pradėtas {len(items)} elementų generavimas per Cloud režimą!"
    }

async def run_cloud_batch_worker(batch_id: str, project_id: str, items: List[Dict[str, Any]], custom_key: Optional[str], model_name: Optional[str]):
    """
    Foninis procesorius: apdoroja masines užklausas su saikingu lygiagretumu (concurrency pool = 3),
    kad neviršytų API greičio limitų, bet greitai užbaigtų visą projektą.
    """
    from google.genai import types
    semaphore = asyncio.Semaphore(3)

    async def process_item(item: Dict[str, Any], index: int):
        scene_id = str(item.get("sceneId", f"item_{index}"))
        prompt = item.get("prompt", "").strip()
        neg_prompt = item.get("negativePrompt", "")
        req_id = item.get("reqId") or str(uuid.uuid4())
        w = item.get("width", 1920)
        h = item.get("height", 1080)
        explicit_ar = item.get("aspectRatio")

        if not prompt:
            return

        aspect_ratio = resolve_aspect_ratio(w, h, explicit_ar)

        async with semaphore:
            try:
                client = get_google_client(custom_key)

                await manager.broadcast({
                    "type": "task_stage",
                    "reqId": req_id,
                    "projectId": project_id,
                    "sceneId": scene_id,
                    "stage": "cloud_generating",
                    "nodeId": "cloud_nano_banana"
                })

                def call_api():
                    target_model = resolve_cloud_model(model_name)
                    cfg = types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(aspect_ratio=aspect_ratio)
                    )
                    full_contents = prompt
                    if neg_prompt:
                        full_contents += f"\nNegative prompt: {neg_prompt}"

                    try:
                        return client.models.generate_content(
                            model=target_model,
                            contents=full_contents,
                            config=cfg
                        )
                    except Exception as e_first:
                        if target_model != "gemini-2.5-flash-image" and ("not found" in str(e_first).lower() or "404" in str(e_first)):
                            return client.models.generate_content(
                                model="gemini-2.5-flash-image",
                                contents=full_contents,
                                config=cfg
                            )
                        raise e_first

                res = await asyncio.to_thread(call_api)
                img_bytes = extract_image_bytes(res)

                safe_scene = "".join(c for c in scene_id if c.isalnum() or c in ('_', '-'))
                final_filename = f"{project_id}_{safe_scene}_{req_id[:8]}.png"
                out_path = os.path.join(VAULT_DIR, final_filename)

                with open(out_path, "wb") as f:
                    f.write(img_bytes)

                vault_url = f"/vault/{final_filename}"

                await manager.broadcast({
                    "type": "task_complete",
                    "projectId": project_id,
                    "reqId": req_id,
                    "sceneId": scene_id,
                    "vaultUrl": vault_url,
                    "nodeId": "cloud_nano_banana"
                })

            except Exception as e:
                err_msg = format_cloud_error(e)
                print(f"[Cloud Batch Error] {scene_id}: {err_msg}")
                await manager.broadcast({
                    "type": "task_error",
                    "projectId": project_id,
                    "reqId": req_id,
                    "sceneId": scene_id,
                    "error": err_msg,
                    "nodeId": "cloud_nano_banana"
                })

    # Vykdome visus elementus per semaphore
    tasks = [process_item(item, idx) for idx, item in enumerate(items)]
    await asyncio.gather(*tasks, return_exceptions=True)
