import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent

# Bandome užkrauti .env iš SceneUI arba vietinio aplanko
ENV_PATHS = [
    BASE_DIR / ".env",
    Path(r"d:\Documents\SceneUI\SceneUI programa - Copy\.env")
]

openai_key = os.environ.get("OPENAI_API_KEY", "")
for ep in ENV_PATHS:
    if ep.exists() and not openai_key:
        with open(ep, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("OPENAI_API_KEY="):
                    openai_key = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                    break

def load_master_prompt():
    master_file = BASE_DIR / "MASTER_STORY_SCRIPTWRITER.md"
    examples_file = BASE_DIR / "PORTFOLIO_REFERENCE_EXAMPLES.md"
    
    prompt = ""
    if master_file.exists():
        prompt += master_file.read_text(encoding="utf-8")
    if examples_file.exists():
        prompt += "\n\n---\n## TIKRI ETALONINIAI PAVYZDŽIAI IŠ PORTFOLIO:\n"
        prompt += examples_file.read_text(encoding="utf-8")
    return prompt

def generate_script_with_openai(topic, genre="POV Crime / Realism", length="60s (~140-160 words)", language="English"):
    import urllib.request
    import json
    
    system_prompt = load_master_prompt()
    user_prompt = f"""
Sukurk pilną video skriptą pagal šią temą ir parametrus:

TEMA: {topic}
ŽANRAS: {genre}
TRUKMĖ / FORMATAS: {length}
KALBA: {language}

Skriptas turi tiksliai atitikti nurodytą stilių, ritmą, juslines detales ir 5-beat struktūrą.
Pateik:
1. Pilną vientisą balso takelio tekstą (VOICEOVER SCRIPT), paruoštą ElevenLabs.
2. Scenų suskirstymą su vaizdų generavimo promptais (ComfyUI/Midjourney) ir kameros nurodymais.
"""

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_key}"
    }
    
    payload = {
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.8
    }
    
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res["choices"][0]["message"]["content"]

def main():
    print("=" * 65)
    print("  🎬 STORY SCRIPT GENERATOR (Upwork / YouTube / TikTok) 🎬")
    print("=" * 65)
    
    if len(sys.argv) > 1:
        topic = " ".join(sys.argv[1:])
    else:
        topic = input("\nĮvesk norimą temą (pvz. 'POV: You are an undercover cop in a street racing gang'): ").strip()
    
    if not topic:
        print("Klaida: Tema negali būti tuščia!")
        return

    print(f"\nPasirinkta tema: {topic}")
    
    if openai_key:
        print("\n⏳ Generuojamas skriptas per OpenAI API...")
        try:
            result = generate_script_with_openai(topic)
            output_file = BASE_DIR / "generated_script.md"
            output_file.write_text(result, encoding="utf-8")
            print("\n" + "=" * 65)
            print(result)
            print("=" * 65)
            print(f"\n✅ Skriptas sėkmingai sugeneruotas ir išsaugotas į:\n   {output_file}")
        except Exception as e:
            print(f"Klaida kreipiantis į API: {e}")
            print("Paruošiamas suformuluotas promptas kopijavimui...")
    else:
        print("\nℹ️ OpenAI raktas nerastas. Paruošiamas pilnas promptas...")
        full_text = f"{load_master_prompt()}\n\n[USER INPUT]:\nTEMA: {topic}\n"
        out_file = BASE_DIR / "ready_prompt.txt"
        out_file.write_text(full_text, encoding="utf-8")
        print(f"✅ Pilnas promptas išsaugotas į: {out_file}")
        print("Gali nukopijuoti jo turinį į ChatGPT, Claude arba Antigravity!")

if __name__ == "__main__":
    main()
