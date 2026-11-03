import json
import traceback
from fastapi import APIRouter, Request, Response

# Importuojame logikos funkcijas iš mūsų naujųjų atskirtų failų.
# (Šiuos failus sukursime sekančiuose žingsniuose)
from routers.agents_characters import generate_characters_logic
from routers.agents_scenes import generate_scenes_logic

router = APIRouter()

# ============================================================================
# PAGRINDINIS MARŠRUTIZATORIUS (SWITCHBOARD)
# ============================================================================
@router.post("/api/llm/generate")
async def generate_json(request: Request):
    try:
        # Nuskaitome gaunamą JSON iš Frontendo
        payload = await request.json()
        mode = payload.get("mode", "B")

        print("\n" + "="*80)
        print(f"🔀 [SWITCHBOARD] Gauta užklausa. Nukreipiama į režimą: MODE {mode}")
        print("="*80)

        # Eismo reguliavimas pagal MODE
        if mode == 'A':
            # Atiduodame darbą UŽŠALDYTAI KASTINGO (Characters) daliai
            return await generate_characters_logic(payload)
        
        else:
            # Atiduodame darbą SCENŲ (Scenes) daliai
            return await generate_scenes_logic(payload)

    except Exception as e:
        print("\n--- FATAL ERROR IN SWITCHBOARD (/api/llm/generate) ---")
        traceback.print_exc()
        print("-------------------------------------------------------\n")
        return Response(
            content=json.dumps({"status": "error", "message": f"Switchboard klaida: {str(e)}"}, ensure_ascii=False),
            media_type="application/json",
            status_code=500
        )