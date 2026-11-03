import json
import time
import urllib.request
import os
import sys
import sqlite3

BASE_URL = "http://127.0.0.1:8001"
PROJECT_ID = "street_racer_ranks"
DB_PATH = "data/queue_v2.db"
REF_FRAME = "street_racer_ref_frame_011.png"

def api_post(path, data):
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def wait_for_task(req_id, label="", timeout_sec=180):
    print(f"\n⏳ [{label}] Waiting for task {req_id[:8]}...", end="", flush=True)
    start = time.time()
    last_status = None
    while time.time() - start < timeout_sec:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT status, error_log FROM queue WHERE req_id = ?", (req_id,))
        row = c.fetchone()
        conn.close()
        if not row:
            return False, "Not found", 0
        status, error_log = row[0], row[1]
        if status != last_status:
            print(f" -> {status}", end="", flush=True)
            last_status = status
        if status == "done":
            elapsed = time.time() - start
            print(f" ✅ (Done in {elapsed:.1f}s)")
            return True, None, elapsed
        elif status == "error":
            print(f" ❌ (FAILED: {error_log})")
            return False, error_log, 0
        time.sleep(1)
    return False, "Timeout", 0

def find_vault_image(prefix):
    vault_dir = "data/vault"
    matches = [f for f in os.listdir(vault_dir) if f.startswith(prefix)]
    if not matches:
        return None
    matches.sort(key=lambda f: os.path.getmtime(os.path.join(vault_dir, f)), reverse=True)
    return matches[0]

def build_char_wf(prompt, negative, ref_img, w=832, h=1248, steps=4, cfg=1.0, seed=554433):
    return {
      "60": {"inputs": {"filename_prefix": "Char_StreetRacer", "images": ["433:8", 0]}, "class_type": "SaveImage", "_meta": {"title": "Save Image"}},
      "78": {"inputs": {"image": ref_img}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}},
      "435": {"inputs": {"value": prompt}, "class_type": "PrimitiveStringMultiline", "_meta": {"title": "Prompt"}},
      "433:75": {"inputs": {"strength": 1, "model": ["433:66", 0]}, "class_type": "CFGNorm", "_meta": {"title": "CFGNorm"}},
      "433:39": {"inputs": {"vae_name": "qwen_image_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
      "433:38": {"inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
      "433:37": {"inputs": {"unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
      "433:110": {"inputs": {"prompt": negative, "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
      "433:66": {"inputs": {"shift": 3, "model": ["433:89", 0]}, "class_type": "ModelSamplingAuraFlow", "_meta": {"title": "ModelSamplingAuraFlow"}},
      "433:111": {"inputs": {"prompt": ["435", 0], "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
      "433:88": {"inputs": {"pixels": ["433:117", 0], "vae": ["433:39", 0]}, "class_type": "VAEEncode", "_meta": {"title": "VAE Encode"}},
      "433:8": {"inputs": {"samples": ["433:3", 0], "vae": ["433:39", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
      "433:89": {"inputs": {"lora_name": "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1, "model": ["433:37", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "Load LoRA"}},
      "433:117": {"inputs": {"image": ["78", 0]}, "class_type": "FluxKontextImageScale", "_meta": {"title": "FluxKontextImageScale"}},
      "439": {"inputs": {"upscale_method": "nearest-exact", "width": w, "height": h, "crop": "disabled", "samples": ["433:88", 0]}, "class_type": "LatentUpscale", "_meta": {"title": "Upscale Latent"}},
      "433:3": {"inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["433:75", 0], "positive": ["433:111", 0], "negative": ["433:110", 0], "latent_image": ["439", 0]}, "class_type": "KSampler", "_meta": {"title": "KSampler"}}
    }

def build_scene_wf(prompt, negative, ref_img, w=1920, h=1080, steps=4, cfg=1.0, seed=662211):
    return {
      "60": {"inputs": {"filename_prefix": "Scene_StreetRacer", "images": ["433:8", 0]}, "class_type": "SaveImage", "_meta": {"title": "Save Image"}},
      "78": {"inputs": {"image": ref_img}, "class_type": "LoadImage", "_meta": {"title": "Load Image (Ref A)"}},
      "435": {"inputs": {"value": prompt}, "class_type": "PrimitiveStringMultiline", "_meta": {"title": "Prompt"}},
      "433:75": {"inputs": {"strength": 1, "model": ["433:66", 0]}, "class_type": "CFGNorm", "_meta": {"title": "CFGNorm"}},
      "433:39": {"inputs": {"vae_name": "qwen_image_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
      "433:38": {"inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
      "433:37": {"inputs": {"unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
      "433:110": {"inputs": {"prompt": negative, "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
      "433:66": {"inputs": {"shift": 3, "model": ["433:89", 0]}, "class_type": "ModelSamplingAuraFlow", "_meta": {"title": "ModelSamplingAuraFlow"}},
      "433:111": {"inputs": {"prompt": ["435", 0], "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
      "433:88": {"inputs": {"pixels": ["433:117", 0], "vae": ["433:39", 0]}, "class_type": "VAEEncode", "_meta": {"title": "VAE Encode"}},
      "433:8": {"inputs": {"samples": ["433:3", 0], "vae": ["433:39", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
      "433:89": {"inputs": {"lora_name": "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1, "model": ["433:37", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "Load LoRA"}},
      "433:117": {"inputs": {"image": ["78", 0]}, "class_type": "FluxKontextImageScale", "_meta": {"title": "FluxKontextImageScale"}},
      "439": {"inputs": {"upscale_method": "nearest-exact", "width": w, "height": h, "crop": "disabled", "samples": ["433:88", 0]}, "class_type": "LatentUpscale", "_meta": {"title": "Upscale Latent"}},
      "433:3": {"inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["433:75", 0], "positive": ["433:111", 0], "negative": ["433:110", 0], "latent_image": ["439", 0]}, "class_type": "KSampler", "_meta": {"title": "KSampler"}}
    }

def main():
    print("==================================================")
    print("TESTING VIDEO STYLE PIPELINE (Street Racer Animation)")
    print("==================================================")

    neg_prompt = "photorealistic, 3D render, hyperrealistic anatomy, detailed face, realistic eyes, realistic skin, realistic human pores, complex shading, glossy gradients, western comic shading, crowd of realistic people, blurry, low quality, deformed, extra limbs"

    # 1. GENERATE CHARACTER FROM EXTRACTED VIDEO FRAME
    print("\n--- STEP 1: Generate Street Racer Character from Video Frame Reference ---")
    char_prompt = "make only one adult man character in that exact style, neutral dark grey clothes, oversized dark charcoal hoodie, round bald head with thick expressive eyebrows and calm half-closed eyes, white sneakers, in the same art style, clean 2D anime lineart, chibi anime style with simple clean lines, neutral plain background"
    wf_char = build_char_wf(
        prompt=char_prompt,
        negative=neg_prompt,
        ref_img=REF_FRAME,
        w=832, h=1248, steps=4, cfg=1.0, seed=554433
    )
    res_c = api_post("/api/queue/add", {
        "projectId": PROJECT_ID,
        "sceneId": "street_racer_bald_driver.png",
        "priority": 1,
        "workflow": wf_char
    })
    ok_c, err_c, time_c = wait_for_task(res_c["reqId"], "Street Racer Character")
    if not ok_c:
        print(f"Error on Char: {err_c}")
        sys.exit(1)

    racer_img = find_vault_image(f"{PROJECT_ID}_street_racer_bald_driver.png")
    print(f"Street racer character saved: {racer_img}")

    # 2. GENERATE SCENE USING THE NEW CHARACTER IN 16:9
    print("\n--- STEP 2: Generate Street Racing Underground Scene S1 (16:9 Widescreen) ---")
    scene_prompt = "Image 1 is the street racer character reference. Cinematic wide shot, underground parking garage car meet at night, concrete pillars, neon fluorescent overhead lighting, tuned sports cars parked in the background. Place the character from image 1 in the center foreground standing beside a sleek purple tuned sports car with rear spoiler, hands in hoodie pocket, calm confident expression, wearing dark charcoal hoodie. high resolution, best quality, sharp, bold clean black lines, clean 2D anime lineart, chibi anime style with simple clean lines, dark urban tones, 16:9 cinematic framing"
    wf_scene = build_scene_wf(
        prompt=scene_prompt,
        negative=neg_prompt,
        ref_img=racer_img,
        w=1920, h=1080, steps=4, cfg=1.0, seed=662211
    )
    res_s = api_post("/api/queue/add", {
        "projectId": PROJECT_ID,
        "sceneId": "S1",
        "priority": 1,
        "workflow": wf_scene
    })
    ok_s, err_s, time_s = wait_for_task(res_s["reqId"], "Street Racer Scene S1")
    if not ok_s:
        print(f"Error on Scene: {err_s}")
        sys.exit(1)

    scene_img = find_vault_image(f"{PROJECT_ID}_S1")
    print(f"Street Racer Scene saved: {scene_img}")

    print("\n==================================================")
    print("STREET RACER VIDEO STYLE TEST COMPLETED SUCCESSFULLY!")
    print(f"Character generation time: {time_c:.1f}s")
    print(f"Scene generation time:     {time_s:.1f}s")
    print(f"Character file: {racer_img}")
    print(f"Scene file:     {scene_img}")
    print("==================================================")

if __name__ == "__main__":
    main()
