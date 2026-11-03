import os
import json
import re
import traceback
import aiohttp
from fastapi import Response
from config import OPENAI_API_KEY, PROMPTS_DIR

# ============================================================================
# PAGALBINĖS FUNKCIJOS
# ============================================================================
def clean_text(text):
    if not text: return ""
    text = text.replace('\u2013', '-').replace('\u2014', '-')
    text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', text)
    return text

def split_script_into_strict_chunks(text, max_words=12):
    sentences = re.split(r'(?<=[.?!,;])\s+', text.strip())
    chunks = []
    current_chunk = ""
    for sentence in sentences:
        if not sentence: continue
        current_len = len(current_chunk.split())
        sentence_len = len(sentence.split())
        
        if current_len == 0:
            current_chunk = sentence
        elif current_len + sentence_len <= max_words:
            current_chunk += " " + sentence
        else:
            chunks.append(current_chunk.strip())
            current_chunk = sentence
            
    if current_chunk:
        chunks.append(current_chunk.strip())
        
    return [c for c in chunks if c]

def extract_json_from_text(text):
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    
    text = text.strip()
    start_obj = text.find('{')
    start_arr = text.find('[')
    
    start = -1
    end = -1
    
    if start_obj != -1 and (start_arr == -1 or start_obj < start_arr):
        start = start_obj
        end = text.rfind('}')
    elif start_arr != -1 and (start_obj == -1 or start_arr < start_obj):
        start = start_arr
        end = text.rfind(']')
        
    if start != -1 and end != -1:
        return text[start:end+1]
    return text

# ============================================================================
# PAGRINDINĖ GENERAVIMO LOGIKA (MODE: B - SCENES)
# ============================================================================
async def generate_scenes_logic(payload: dict):
    prompt_text = clean_text(payload.get("prompt", ""))
    style_dir = payload.get("style_file", "")
    provider = payload.get("provider", "local") 
    target_url = payload.get("url", "").strip()
    
    api_key = payload.get("key", "").strip()
    if not api_key:
        api_key = OPENAI_API_KEY
        
    if provider == "api" and not api_key:
        return Response(
            content=json.dumps({"status": "error", "message": "Nenurodytas OpenAI API raktas! Įveskite jį nustatymuose arba .env faile."}, ensure_ascii=False),
            media_type="application/json",
            status_code=400
        )
    if provider == "local" and not target_url:
        return Response(
            content=json.dumps({"status": "error", "message": "Nenurodytas vietinio LLM (Ollama) serverio URL!"}, ensure_ascii=False),
            media_type="application/json",
            status_code=400
        )
        
    # SUTVARKUOTA: Ištaisyta lygiavimo klaida (Indentation)
    base_model_name = payload.get("model", "gpt-4o-mini")
    
    if provider == "api":
        smart_model = base_model_name
        draft_model = base_model_name
    else:
        # SUTVARKUOTA: Dabar dinamiškai klausosi UI pasirinkimo, fallback – gemma4:12b
        smart_model = payload.get("model", "gemma4:12b")
        draft_model = payload.get("model", "gemma4:12b")
    
    available_chars = payload.get("available_characters", [])
    character_dictionary = payload.get("character_dictionary", {})
    main_protagonist = payload.get("main_protagonist", "")

    master_logic_instructions = ""
    if style_dir:
        file_path = os.path.join(PROMPTS_DIR, style_dir, "scenes.txt")
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                master_logic_instructions = f.read().strip()

    connector = aiohttp.TCPConnector(ssl=False)
    timeout = aiohttp.ClientTimeout(total=300)
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        
        print("\n" + "*"*80)
        print("🎬 [SCENŲ GENERATORIUS] Analizuojama 'Veikėjų Biblija' (Character Dictionary)...")
        print("*"*80)

        chars_context = ""
        if character_dictionary:
            chars_context += "\n\n[CASTING DICTIONARY (CHARACTER BIBLE)]:\n"
            for fname, data in character_dictionary.items():
                role = data.get('role_or_gender', 'N/A')
                desc = data.get('full_visual_description', 'N/A')
                chars_context += f"- File: {fname}\n  Template/Role: {role}\n  Description: {desc}\n\n"
        elif available_chars:
            chars_context += f"\n\n[AVAILABLE CHARACTER REFERENCES]:\n{', '.join(available_chars)}"

        # ŽINGSNIS 1.5: LAIKO IR ĮVARDŽIŲ SEKLYS
        print(f"\n[AGENT 1.5] Kuriama įvardžių ir laiko juostų špargalkė. Modelis: {smart_model}...")
        master_context_track = ""
        agent15_rules = (
            "You are the Timeline & Casting Decoder AI. Review the script and the [CASTING DICTIONARY].\n"
            "Create a chronological 'Master Context Track' for the scenes.\n"
            "1. TIMELINE & PRONOUNS: Map out the story's eras and locations. Identify ambiguous pronouns ('he', 'she', 'they'). CRITICAL: The pronoun 'You' ALWAYS refers to the main protagonist!\n"
            "2. CASTING MATCH: Map specific .png files from the [CASTING DICTIONARY] to the characters in the script based on their descriptions.\n"
            "3. HIRING NEW ACTORS (CRITICAL): If the script introduces a character that is NOT in the dictionary (e.g., a waiter, a young girl, a boss), DO NOT ignore them. INVENT a logical, descriptive .png filename for them (e.g., 'waiter.png', 'sketchbook_girl.png') and note that they need to be cast.\n"
            "Output plain text notes. No JSON."
        )
        
        if provider == "local":
            url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
            async with session.post(url, json={"model": smart_model, "prompt": f"{chars_context}\n\n[USER SCRIPT]:\n{prompt_text}", "system": agent15_rules, "stream": False, "options": {"temperature": 0.1}}) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    master_context_track = res_json.get("response", "No track generated.")
        elif provider == "api":
            url = "https://" + "api.openai.com" + "/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": smart_model, "temperature": 0.1, "messages": [{"role": "system", "content": agent15_rules}, {"role": "user", "content": f"{chars_context}\n\n[USER SCRIPT]:\n{prompt_text}"}]}
            async with session.post(url, headers=headers, json=data) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    try: master_context_track = res_json["choices"][0]["message"]["content"]
                    except: master_context_track = "No track generated."

        print("\n" + "-"*60)
        print("🗺️ [AGENT 1.5: ĮVARDŽIŲ/ERŲ ŠPARGALKĖ] REZULTATAS:")
        print(master_context_track)
        print("-"*60 + "\n")

        # ŽINGSNIS 1.8: SCENOGRAFAS (PRODUCTION DESIGNER)
        print(f"\n[AGENT 1.8] Kuriama Objektų ir Lokacijų Biblija (Prop Dictionary). Modelis: {smart_model}...")
        prop_dictionary_context = ""
        agent18_rules = (
            "You are the Production Designer AI (Prop & Location Master). Review the script and the [MASTER CONTEXT TRACK].\n"
            "Your ONLY job is to extract recurring or important locations, vehicles, weapons, and key objects, and assign them a STRICT, unchangeable visual description to maintain visual continuity.\n"
            "1. EVOLUTION OF PROPS: If a prop/location evolves with the protagonist's eras (e.g., poor era = old car; rich era = new car), create distinct entries for each era.\n"
            "2. BE HIGHLY SPECIFIC: Don't just write 'sports car'. Write 'gloss black 1969 Ford Mustang Boss 429'. Don't just write 'handgun'. Write 'matte black Glock 19 with tactical flashlight'.\n"
            "3. OUTPUT FORMAT: Output a plain text 'Dictionary' listing the Location/Prop and its highly specific visual description. No JSON."
        )
        
        if provider == "local":
            url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
            async with session.post(url, json={"model": smart_model, "prompt": f"[MASTER CONTEXT TRACK]:\n{master_context_track}\n\n[USER SCRIPT]:\n{prompt_text}", "system": agent18_rules, "stream": False, "options": {"temperature": 0.1}}) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    prop_dictionary_context = res_json.get("response", "No props generated.")
        elif provider == "api":
            url = "https://" + "api.openai.com" + "/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": smart_model, "temperature": 0.1, "messages": [{"role": "system", "content": agent18_rules}, {"role": "user", "content": f"[MASTER CONTEXT TRACK]:\n{master_context_track}\n\n[USER SCRIPT]:\n{prompt_text}"}]}
            async with session.post(url, headers=headers, json=data) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    try: prop_dictionary_context = res_json["choices"][0]["message"]["content"]
                    except: prop_dictionary_context = "No props generated."

        print("\n" + "-"*60)
        print("🛋️ [AGENT 1.8: SCENOGRAFAS (PROP DICTIONARY)] REZULTATAS:")
        print(prop_dictionary_context)
        print("-"*60 + "\n")

        script_chunks = split_script_into_strict_chunks(prompt_text, max_words=12)
        if not script_chunks: 
            return Response(content=json.dumps({"status": "error", "message": "Nepavyko padalinti teksto."}, ensure_ascii=False), media_type="application/json", status_code=500)

        all_scenes = []
        batch_size = 5
        global_scene_counter = 1
        
        for i in range(0, len(script_chunks), batch_size):
            batch_segments = script_chunks[i:i+batch_size]
            
            past_context = script_chunks[max(0, i-4):i]
            future_context = script_chunks[i+batch_size:i+batch_size+4]
            
            task_items = [{"id": f"S{global_scene_counter + j}", "original_text": text} for j, text in enumerate(batch_segments)]
            global_scene_counter += len(batch_segments)
            
            past_text = " ".join(past_context) if past_context else "None"
            future_text = " ".join(future_context) if future_context else "None"

            # ŽINGSNIS 2A: REŽISIERIUS
            print(f"[AGENT 2A: DIRECTOR] Planuoja logiką (Batch {i//batch_size + 1}). Modelis: {smart_model}...")
            
            director_system = f"""{master_logic_instructions}

[PROP & LOCATION DICTIONARY]:
{prop_dictionary_context}"""
            
            director_user = f"""[CASTING DICTIONARY (CHARACTER BIBLE)]:
{chars_context}

[MASTER CONTEXT TRACK]:
{master_context_track}

[PAST STORY CONTEXT]:
{past_text}

[TEXT SEGMENTS TO PROCESS NOW]:
{json.dumps(task_items, ensure_ascii=False)}

[FUTURE STORY CONTEXT]:
{future_text}

INSTRUCTIONS FOR DIRECTOR:
Output ONLY a JSON object with the key "scenes" containing exactly {len(batch_segments)} scene objects.

CRITICAL RULES:
1. CASTING DICTIONARY: Use the .png filenames provided in the [CASTING DICTIONARY] whenever possible.
2. HIRING NEW ACTORS (MISSING CHARACTERS): If the text mentions a person NOT in the dictionary (e.g., 'young girl', 'guard'), YOU MUST INVENT a logical filename (e.g., 'young_girl.png') and assign it to refB or refC.
3. NO HUMANS = EMPTY SCENE: If there are ABSOLUTELY NO humans in the text and no implied presence, set refA, refB, and refC to an empty string "". DO NOT write the words "empty_scene.png" yourself.
4. PROP DICTIONARY (CONTINUITY): Use the exact location names provided in the [PROP & LOCATION DICTIONARY] for the 'location' field if applicable."""

            director_scenes = []
            if provider == "local":
                url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
                async with session.post(url, json={"model": smart_model, "prompt": director_user, "system": director_system, "stream": False, "format": "json", "options": {"temperature": 0.1}}) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try:
                            parsed = json.loads(extract_json_from_text(res_json.get("response", "{}")))
                            if isinstance(parsed, list):
                                director_scenes = parsed
                            elif isinstance(parsed, dict):
                                director_scenes = parsed.get("scenes", [])
                        except: pass
            elif provider == "api":
                url = "https://" + "api.openai.com" + "/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {"model": smart_model, "temperature": 0.1, "messages": [{"role": "system", "content": director_system}, {"role": "user", "content": director_user}], "response_format": { "type": "json_object" }}
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try:
                            parsed = json.loads(res_json["choices"][0]["message"]["content"])
                            if isinstance(parsed, list):
                                director_scenes = parsed
                            elif isinstance(parsed, dict):
                                director_scenes = parsed.get("scenes", [])
                        except: pass

            print(f"\n   --- 🎬 [AGENT 2A] DIRECTOR BATCH REZULTATAS ---")
            print(json.dumps(director_scenes, indent=2, ensure_ascii=False))

            # ŽINGSNIS 2B: RAŠYTOJAS (GOLD STANDARD PROMPTING STYLE)
            print(f"\n[AGENT 2B: WRITER] Rašo vizualų promptą (Batch {i//batch_size + 1}). Modelis: {draft_model}...")
            
            writer_system = f"""{master_logic_instructions}

[PROP & LOCATION DICTIONARY]:
{prop_dictionary_context}

STRICT RULE: Write ONLY the visual description for the image prompt. DO NOT copy or append the system instructions (like 'SYSTEM ROLE') into the output!"""
            
            writer_user = f"""{chars_context}

[TEXT SEGMENTS TO PROCESS NOW]:
{json.dumps(task_items, ensure_ascii=False)}

[DIRECTOR'S BLUEPRINT]:
{json.dumps(director_scenes, ensure_ascii=False)}

INSTRUCTIONS FOR WRITER:
For each scene in the Blueprint, write the visual "prompt".
Output ONLY a JSON object with the key "scenes" containing exactly {len(batch_segments)} scene objects.

PROMPT WRITING RULES (STRICT GOLD STANDARD STYLE):
1. TWO-PART STRUCTURE: 
   - Part 1: Environment, lighting, background (comma-separated, e.g., "dark modern skyscraper office, soft lamp light, cinematic, city skyscrapers outside.").
   - Part 2: Characters and their actions using the "Image X" naming convention.
2. ABSOLUTELY NO PRONOUNS (CRITICAL): NEVER use "he", "she", "his", "her", "they", "them", "man", or "woman" as standalone subjects. AI models lose track of who is who.
3. THE "IMAGE X" NAMING CONVENTION (CRITICAL):
   - You MUST refer to characters strictly by their image slot based on the Director's blueprint.
   - Deduce gender from the [CASTING DICTIONARY].
   - The character in `refA` is ALWAYS "Man from image 1" or "Woman from image 1" (or "Person from image 1").
   - The character in `refB` is ALWAYS "Man from image 2" or "Woman from image 2".
   - The character in `refC` is ALWAYS "Man from image 3" or "Woman from image 3".
   - Example: "Woman from image 1 and man from image 2 are sitting. Woman from image 1 is holding a mug. Man from image 2 is looking at woman from image 1."
4. PRIMITIVE, REPETITIVE SENTENCES: Describe physical actions explicitly. "Woman from image 1 is standing. Woman from image 1 is holding a gun." Do not use complex grammar.
5. EMPTY SLOTS: If a reference field (`refA`, `refB`, `refC`) is empty (""), completely ignore it. If all humans are empty, just describe the environment.
6. CONTINUITY: Use the exact descriptions from the [PROP & LOCATION DICTIONARY] when applicable.

Each object MUST contain:
1. "id": matching the segment.
2. "prompt": The final brute-force visual prompt following the 2-part structure.
3. "video_prompt": A concise camera and motion prompt for Image-to-Video generation (e.g. 'cinematic subtle motion, natural breathing, eye blinking, gentle atmospheric movement, 4k 24fps')."""

            writer_scenes = []
            if provider == "local":
                url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
                async with session.post(url, json={"model": draft_model, "prompt": writer_user, "system": writer_system, "stream": False, "format": "json", "options": {"temperature": 0.1}}) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try:
                            parsed = json.loads(extract_json_from_text(res_json.get("response", "{}")))
                            if isinstance(parsed, list):
                                writer_scenes = parsed
                            elif isinstance(parsed, dict):
                                writer_scenes = parsed.get("scenes", [])
                        except: pass
            elif provider == "api":
                url = "https://" + "api.openai.com" + "/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {"model": draft_model, "temperature": 0.1, "messages": [{"role": "system", "content": writer_system}, {"role": "user", "content": writer_user}], "response_format": { "type": "json_object" }}
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try:
                            parsed = json.loads(res_json["choices"][0]["message"]["content"])
                            if isinstance(parsed, list):
                                writer_scenes = parsed
                            elif isinstance(parsed, dict):
                                writer_scenes = parsed.get("scenes", [])
                        except: pass

            print(f"\n   --- ✍️ [AGENT 2B] WRITER BATCH REZULTATAS ---")
            print(json.dumps(writer_scenes, indent=2, ensure_ascii=False))

            healed_scenes = []
            for task in task_items:
                s_id = task["id"]
                d_scene = next((s for s in director_scenes if s.get("id") == s_id), {})
                w_scene = next((s for s in writer_scenes if s.get("id") == s_id), {})
                
                refA = d_scene.get("refA", "").strip()
                refB = d_scene.get("refB", "").strip()
                refC = d_scene.get("refC", "").strip()
                
                if refB and refB == refA: refB = ""
                if refC and (refC == refA or refC == refB): refC = ""
                
                final_refA = refA if refA else "empty_scene.png"
                final_refB = refB if refB else "empty_scene.png"
                final_refC = refC if refC else "empty_scene.png"
                
                raw_prompt = w_scene.get("prompt", "[AI Error] Prompt missed by LLM. Please edit this manually.")
                clean_prompt = raw_prompt.replace("empty_scene.png", "").replace("empty_scene", "").replace("  ", " ").strip()
                motion_prompt = w_scene.get("video_prompt") or "cinematic idle motion, subtle natural breathing, eye blinking, gentle atmospheric movement, masterpiece, ultra-detailed 4k"
                
                scene_obj = {
                    "id": s_id,
                    "text": task["original_text"],
                    "location": d_scene.get("location", ""),
                    "time": d_scene.get("time", ""),
                    "refA": final_refA,
                    "refB": final_refB,
                    "refC": final_refC,
                    "prompt": clean_prompt,
                    "video_prompt": motion_prompt
                }
                healed_scenes.append(scene_obj)
            
            all_scenes.extend(healed_scenes)

        for idx, scene in enumerate(all_scenes):
            scene['id'] = f"S{idx + 1}"

        if not all_scenes:
            return Response(
                content=json.dumps({"status": "error", "message": "LLM negrąžino jokių scenų. Patikrinkite LLM modelio veikimą, API raktą arba scenarijų."}, ensure_ascii=False),
                media_type="application/json",
                status_code=422
            )

        print("\n" + "="*80)
        print("✅ [AGENTAI BAIGĖ DARBĄ] SCENŲ JSON SUGENERUOTAS IR IŠSIŲSTAS Į UI.")
        print("="*80 + "\n")

        final_json_string = json.dumps({"scenes": all_scenes}, indent=2, ensure_ascii=False)
        return Response(content=json.dumps({"status": "success", "data": final_json_string}, ensure_ascii=False), media_type="application/json")