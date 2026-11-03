import os
import asyncio
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

def parse_names_list(json_str):
    if not json_str: return []
    try:
        parsed = json.loads(json_str)
        if isinstance(parsed, dict):
            return parsed.get("names", [])
        elif isinstance(parsed, list):
            return parsed
    except Exception as e:
        print(f"[JSON PARSE ERROR - Nuskaitant veikėjus]: {e}")
    return []

# ============================================================================
# PAGRINDINĖ GENERAVIMO LOGIKA (MODE: A)
# ============================================================================
async def generate_characters_logic(payload: dict):
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
        
    base_model_name = payload.get("model", "gpt-4o-mini")
    
    if provider == "api":
        smart_model = base_model_name
        draft_model = base_model_name
    else:
        smart_model = payload.get("model", "gemma4:12b")
        draft_model = payload.get("model", "gemma4:12b")
    
    main_protagonist = payload.get("main_protagonist", "")

    style_instructions = ""
    if style_dir:
        file_path = os.path.join(PROMPTS_DIR, style_dir, "characters.txt")
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                style_instructions = f.read()

    connector = aiohttp.TCPConnector(ssl=False)
    timeout = aiohttp.ClientTimeout(total=300)
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        
        # ŽINGSNIS 0A: CHRONOLOGAS
        print(f"\n[AGENT 0A] Kuriama laiko juosta ir lokacijų žemėlapis. Modelis: {smart_model}...")
        timeline_context = ""
        agent0A_rules = (
            "You are the Timeline & Location Scout AI. Analyze the user script like a detective.\n"
            "1. STRICT TIMELINE & LOCATION: Map out exactly where and when the action occurs.\n"
            "2. CONTEXTUAL TIME JUMPS: Look carefully for explicit ages, relative time ('years later'), or life stages.\n"
            "3. ESTIMATED AGES: Explicitly estimate the age of the main characters in each timeline segment based on these clues.\n"
            "Output plain text only. Focus solely on the structural timeline, locations, and estimated eras."
        )
        
        if provider == "local":
            url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
            async with session.post(url, json={"model": smart_model, "prompt": f"[USER SCRIPT]:\n{prompt_text}", "system": agent0A_rules, "stream": False, "options": {"temperature": 0.1}}) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    timeline_context = res_json.get("response", "")
        elif provider == "api":
            url = "https://" + "api.openai.com" + "/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": smart_model, "temperature": 0.1, "messages": [{"role": "system", "content": agent0A_rules}, {"role": "user", "content": prompt_text}]}
            async with session.post(url, headers=headers, json=data) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    try: timeline_context = res_json["choices"][0]["message"]["content"]
                    except: pass

        if not timeline_context: timeline_context = "No timeline available."
        
        print("\n" + "-"*60)
        print("🎯 [AGENT 0A: CHRONOLOGAS] REZULTATAS:")
        print(timeline_context)
        print("-"*60 + "\n")

        # ŽINGSNIS 0B: PROFILERIS (Faktų ištraukėjas)
        print(f"[AGENT 0B: PROFILER] Ieškomi faktai apie veikėjus. Modelis: {smart_model}...")
        raw_cast_context = ""
        agent0B_rules = (
            "You are the Profiler AI (Fact Extractor). Your ONLY job is to read the script and extract hard facts about EVERY SINGLE HUMAN mentioned.\n"
            "1. BE EXHAUSTIVE, BUT RATIONAL (CRITICAL): Read word by word. Extract the protagonist, antagonists, background extras, and mere mentions (e.g., 'mogul', 'waiter'). Do not skip actual physical people.\n"
            "2. THE 'YOU' RULE: The script is written in the second person ('You'). 'You' is the MAIN PROTAGONIST.\n"
            "3. NO METAPHORS (CRITICAL FILTER): Do NOT extract poetic comparisons, metaphors, or concepts as physical humans. If the text says 'the world needs a Barbie', 'you are a ghost', or 'the woman who controls the mirror', these are NOT new physical people. Only extract LITERAL, physical humans.\n"
            "4. PAST ALIASES & PROFESSIONS RULE (CRITICAL FILTER): If the text lists the protagonist's past jobs, roles, or aliases (e.g., 'you were a stylist, a creative director, an influencer'), DO NOT create separate characters for them. Merge all these traits into the Protagonist's profile.\n"
            "5. DEDUPLICATION & MERGING: If the same physical person is referred to by different titles across timelines (e.g., 'wife' and 'ex-wife', or 'target' and 'billionaire'), MERGE them into ONE single profile. Do not list them multiple times unless they are explicitly different people.\n"
            "6. INFERRING GENDER FOR 'YOU': Deduce the protagonist's gender logically from the plot. If 'You' has a wife, or is in a gritty military setting without specified gender, assume 'Male' unless text explicitly dictates otherwise.\n"
            "7. EXTRACT ONLY FACTS & ESTIMATE AGE (CRITICAL): List their Gender, Age, Clothes, and Hair. Infer Gender from the context or clothing. CRITICAL AGE ESTIMATION: If a character's age is not explicitly mentioned, you MUST estimate it logically from the context (e.g., if a character has children of a certain age, infer their parent's age logically, or estimate based on career, relation, or life stages). Do not leave age blank if it can be estimated.\n"
            "Output format:\n"
            "- The Protagonist:\n"
            "  Gender: [Male or Female based on context]\n"
            "  Age: [NOT SPECIFIED]\n"
            "  Clothes: 'silk dress'\n"
            "  Hair: [NOT SPECIFIED]\n"
            "- Tech Billionaire:\n"
            "  Gender: Male\n"
            "  Age: [NOT SPECIFIED]\n"
            "  Clothes: [NOT SPECIFIED]\n"
            "  Hair: [NOT SPECIFIED]"
        )
        
        if provider == "local":
            url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
            async with session.post(url, json={"model": smart_model, "prompt": f"[USER SCRIPT]:\n{prompt_text}", "system": agent0B_rules, "stream": False, "options": {"temperature": 0.1}}) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    raw_cast_context = res_json.get("response", "")
        elif provider == "api":
            url = "https://" + "api.openai.com" + "/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": smart_model, "temperature": 0.1, "messages": [{"role": "system", "content": agent0B_rules}, {"role": "user", "content": prompt_text}]}
            async with session.post(url, headers=headers, json=data) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    try: raw_cast_context = res_json["choices"][0]["message"]["content"]
                    except: pass

        if not raw_cast_context: raw_cast_context = "No characters found."
        
        print("\n" + "-"*60)
        print("🕵️‍♂️ [AGENT 0B: PROFILERIS (FAKTAI)] REZULTATAS:")
        print(raw_cast_context)
        print("-"*60 + "\n")

        protagonist_identifier = f"'{main_protagonist}'" if main_protagonist else "'The Protagonist' or 'You'"

        # ŽINGSNIS 0C ir 0D: LYGIAGRETUS STILISTAS IR PLANUOTOJAS
        minor_chars_context = ""
        protagonist_context = ""

        agent0C_rules = (
            f"You are the Minor Character Stylist AI. Read the Timeline Map and the Profiler's Fact Report.\n"
            f"Your ONLY job is to design the MINOR/SUPPORTING characters. DO NOT design the main hero ({protagonist_identifier}).\n"
            "1. NO SKIPPING (CRITICAL): You MUST design EVERY SINGLE minor character listed in the Profiler's report. Do not leave anyone out!\n"
            "2. GENRE ADAPTATION: Identify the genre and design appropriate clothes/hair for [NOT SPECIFIED] fields.\n"
            "3. ONE FILE PER CHARACTER: 1 file is enough for minor characters.\n"
            "4. DESCRIPTIVE FILENAMES: 2-3 words. No numbers.\n"
            "5. BASE CLASSIFICATION (STRICT MATH): 0-13=kid, 14-18=teen, 18+=male/female (female base is only for 18+ years old females). If a character's age is 18 or more (e.g. '18'), you MUST use [base: female] or [base: male]. NEVER use [base: teen] for an adult!\n"
            "6. CONCRETE APPEARANCE: Invent explicit HAIR COLOR, length, and style. Name exact garments. No vague words.\n"
            "Output format:\n"
            "'Character Name' -> [base: male/female/teen/kid] -> 'filename.png' -> 'Hair and Clothing Description'."
        )

        agent0D_rules = (
            f"You are the Protagonist Planner AI. Read the Timeline Map and the Profiler's Fact Report.\n"
            f"Your ONLY job is to design the MAIN HERO ({protagonist_identifier}) across the story's timeline.\n"
            "1. ERA BUCKETING: Create distinct files reflecting the protagonist's life stages or major location changes (e.g., 'protagonist_training.png', 'protagonist_combat.png'). If the character changes visually or requires different gear/clothing for a specific era, create a new file for it. Do not limit the amount of files.\n"
            "2. PROTAGONIST PREFIX: All filenames MUST start with 'protagonist_'.\n"
            "3. BASE CLASSIFICATION (CRITICAL): If the protagonist is 13 or younger, use [base: kid]. If 14 to 18, use [base: teen]. If 18 or older, use [base: female] (if female) or [base: male] (if male).\n"
            "4. CONCRETE APPEARANCE: Explicitly state the exact HAIR COLOR, length, and style. HAIR COLOR MUST remain the same across all eras. Name exact garments.\n"
            "Output format:\n"
            "'The Protagonist (Era Name)' -> [base: male/female/teen/kid] -> 'protagonist_era.png' -> 'Hair and Clothing Description'."
        )

        async def call_agent_0c():
            nonlocal minor_chars_context
            print(f"[AGENT 0C: MINOR STYLIST] Kuriami antraeilių veikėjų dizainai. Modelis: {smart_model}...")
            if provider == "local":
                url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
                async with session.post(url, json={"model": smart_model, "prompt": f"[TIMELINE MAP]:\n{timeline_context}\n\n[PROFILER FACT REPORT]:\n{raw_cast_context}", "system": agent0C_rules, "stream": False, "options": {"temperature": 0.2}}) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        minor_chars_context = res_json.get("response", "")
            elif provider == "api":
                url = "https://" + "api.openai.com" + "/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {"model": smart_model, "temperature": 0.2, "messages": [{"role": "system", "content": agent0C_rules}, {"role": "user", "content": f"[TIMELINE MAP]:\n{timeline_context}\n\n[PROFILER FACT REPORT]:\n{raw_cast_context}"}]}
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try: minor_chars_context = res_json["choices"][0]["message"]["content"]
                        except: pass
            if not minor_chars_context: minor_chars_context = "No minor characters designed."

        async def call_agent_0d():
            nonlocal protagonist_context
            print(f"[AGENT 0D: PROTAGONIST PLANNER] Kuriamos pagrindinio herojaus eros. Modelis: {smart_model}...")
            if provider == "local":
                url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
                async with session.post(url, json={"model": smart_model, "prompt": f"[TIMELINE MAP]:\n{timeline_context}\n\n[PROFILER FACT REPORT]:\n{raw_cast_context}", "system": agent0D_rules, "stream": False, "options": {"temperature": 0.2}}) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        protagonist_context = res_json.get("response", "")
            elif provider == "api":
                url = "https://" + "api.openai.com" + "/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {"model": smart_model, "temperature": 0.2, "messages": [{"role": "system", "content": agent0D_rules}, {"role": "user", "content": f"[TIMELINE MAP]:\n{timeline_context}\n\n[PROFILER FACT REPORT]:\n{raw_cast_context}"}]}
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try: protagonist_context = res_json["choices"][0]["message"]["content"]
                        except: pass
            if not protagonist_context: protagonist_context = "No protagonist designed."

        await asyncio.gather(call_agent_0c(), call_agent_0d())

        # SUJUNGIAME ABU STILISTUS
        shadow_context = f"[PROTAGONIST VERSIONS (From Agent 0D)]:\n{protagonist_context}\n\n[MINOR CHARACTERS (From Agent 0C)]:\n{minor_chars_context}"

        print("\n" + "-"*60)
        print("👗 [SUJUNGTAS CASTING BREAKDOWN (0C + 0D)] REZULTATAS:")
        print(shadow_context)
        print("-"*60 + "\n")

        # ŽINGSNIS 1: JSON KONVERTERIS
        agent1_rules = (
            "You are the JSON Converter AI. Read the CASTING BREAKDOWN provided by the Stylist AIs.\n"
            "Your ONLY job is to extract all the 'filename.png' values from the breakdown and output them as a strict JSON array.\n"
            "CRITICAL RULES:\n"
            "1. Extract EVERY SINGLE character file mentioned in the breakdown. Do not skip ANYONE.\n"
            "2. DO NOT read the script to find new people. ONLY use the filenames exactly as written in the Breakdown.\n"
            "Output a JSON object with the key 'names' containing an array of strings."
        )
        
        print(f"[AGENT 1] Traukia failų pavadinimus iš Breakdown'o. Modelis: {draft_model}...")
        combined_names = []
        
        if provider == "local":
            url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
            prompt_1 = f"[CASTING BREAKDOWN]:\n{shadow_context}"
            async with session.post(url, json={"model": draft_model, "prompt": prompt_1, "system": agent1_rules, "stream": False, "format": "json", "options": {"temperature": 0.0}}) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    combined_names = parse_names_list(extract_json_from_text(res_json.get("response", "{}")))
        elif provider == "api":
            url = "https://" + "api.openai.com" + "/v1/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {"model": draft_model, "temperature": 0.0, "messages": [{"role": "system", "content": agent1_rules}, {"role": "user", "content": f"[CASTING BREAKDOWN]:\n{shadow_context}"}], "response_format": { "type": "json_object" }}
            async with session.post(url, headers=headers, json=data) as resp:
                if resp.status == 200:
                    res_json = await resp.json()
                    try:
                        combined_names = parse_names_list(res_json["choices"][0]["message"]["content"])
                    except: pass
        
        cleaned_names = []
        for name in combined_names:
            name = str(name).strip().lower().replace(" ", "_")
            if not name or name in ["none", "null"]: continue
            if not name.endswith(".png"): name += ".png"
            if name not in cleaned_names: cleaned_names.append(name)
                
        combined_names = cleaned_names
        
        print("\n" + "-"*60)
        print("🤖 [AGENT 1: JSON CONVERTER] IŠTRAUKTI FAILŲ PAVADINIMAI:")
        print(json.dumps(combined_names, indent=2))
        print("-"*60 + "\n")
        
        if not combined_names:
            return Response(content=json.dumps({"status": "error", "message": "Agentai nerado nei vieno veikėjo!"}, ensure_ascii=False), media_type="application/json", status_code=500)

        # ŽINGSNIS 2: DAILININKAS
        print(f"[AGENT 2] Generuoja JSON vizualius promptus. Modelis: {draft_model}...")
        all_characters = []
        batch_size = 5
        
        for i in range(0, len(combined_names), batch_size):
            batch_names = combined_names[i:i+batch_size]
            
            agent2_rules = f"""You are the Lead Concept Artist AI.
{style_instructions}

CRITICAL RULE: You MUST output ONLY a valid JSON object.
The JSON must contain a single key "characters" which is an array of objects.
Each object must strictly match this exact structure:
{{
  "id": "filename.png",
  "base": "male" or "female" or "teen" or "kid",
  "prompt": "white skin, long blonde hair, [SPECIFIC GARMENTS]. (STRICT RULES: ONLY COMMA-SEPARATED VISUAL TAGS. NO SENTENCES. NO EMOTIONS. NEVER USE VAGUE WORDS. NEVER use verbs or transition words like 'wearing', 'dressed in', 'paired with', 'accessorized with'. Just list the items directly.)",
  "negative": "nose, ears, realistic face, extra limbs"
}}

IMPORTANT FOR 'base': Do NOT guess the gender or age. You MUST read the [CASTING BREAKDOWN] below to find the exact '[base: ...]' assigned to each character and copy it directly into the JSON. Ensure it is exactly 'male', 'female', 'teen', or 'kid'.

[TARGET CHARACTERS LIST]:
{json.dumps(batch_names, ensure_ascii=False)}"""

            if provider == "local":
                url = target_url if target_url.endswith("/api/generate") else target_url.rstrip("/") + "/api/generate"
                full_prompt = f"[CASTING BREAKDOWN]:\n{shadow_context}\n\n[USER SCRIPT]:\n{prompt_text}"
                async with session.post(url, json={"model": draft_model, "prompt": full_prompt, "system": agent2_rules, "stream": False, "format": "json", "options": {"temperature": 0.1}}) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        clean_json_str = extract_json_from_text(res_json.get("response", "{}"))
                        try:
                            parsed = json.loads(clean_json_str)
                            if isinstance(parsed, list):
                                all_characters.extend(parsed)
                            elif isinstance(parsed, dict):
                                all_characters.extend(parsed.get("characters", []))
                        except Exception as e: 
                            print(f"Error parsing Agent 2 output: {e}")
            elif provider == "api":
                url = "https://" + "api.openai.com" + "/v1/chat/completions"
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                data = {
                    "model": draft_model,
                    "temperature": 0.1,
                    "messages": [{"role": "system", "content": agent2_rules}, {"role": "user", "content": f"[CASTING BREAKDOWN]:\n{shadow_context}\n\n[USER SCRIPT]:\n{prompt_text}"}],
                    "response_format": { "type": "json_object" }
                }
                async with session.post(url, headers=headers, json=data) as resp:
                    if resp.status == 200:
                        res_json = await resp.json()
                        try:
                            parsed = json.loads(res_json["choices"][0]["message"]["content"])
                            if isinstance(parsed, list):
                                all_characters.extend(parsed)
                            elif isinstance(parsed, dict):
                                all_characters.extend(parsed.get("characters", []))
                        except Exception as e:
                            print(f"Error parsing Agent 2 output: {e}")
        
        unique_chars = {}
        # SUTVARKUOTA: Ištaisyta įsivėlusi \n sintaksės klaida čia
        for c in all_characters:
            char_id = c.get("id")
            if char_id and char_id not in unique_chars:
                unique_chars[char_id] = c
        
        final_characters = list(unique_chars.values())
        
        if not final_characters:
            return Response(
                content=json.dumps({"status": "error", "message": "LLM negrąžino jokių veikėjų. Patikrinkite LLM modelio veikimą, API raktą arba scenarijų."}, ensure_ascii=False),
                media_type="application/json",
                status_code=422
            )
        
        print("\n" + "="*80)
        print("🎨 [AGENT 2: DAILININKAS] GALUTINIS JSON REZULTATAS (Siunčiamas į UI):")
        print(json.dumps(final_characters, indent=2, ensure_ascii=False))
        print("="*80 + "\n")
        
        final_json_string = json.dumps({"characters": final_characters}, indent=2, ensure_ascii=False)
        return Response(content=json.dumps({"status": "success", "data": final_json_string}, ensure_ascii=False), media_type="application/json")