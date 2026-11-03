# Story Scripts Engine & Framework

Šis aplankas skirtas **istorijų ir video skriptų rašymui**.
Tau nebereikia pačiam sugalvoti visos istorijos struktūros ar sakinių ritmo – **tu tik nurodai temą**, o sistema pagal šias instrukcijas sugeneruoja aukščiausio lygio skriptą, identišką tavo portfolio video stiliui.

---

## 📁 Aplanko struktūra

1. **`MASTER_STORY_SCRIPTWRITER.md`**  
   👉 **Pagrindinė universali instrukcija (Master Prompt)**. Nukopijuok šį tekstą į bet kurį AI (ChatGPT, Claude, Gemini) ir pačiame gale tiesiog įrašyk savo temą:
   ```text
   [TEMA]: POV: Tu esi 1920-ųjų Čikagos kontrabandininkas
   ```

2. **Šablonai pagal žanrus (Specializuotos instrukcijos):**
   - **`01_POV_CRIME_UNDERWORLD.md`** – *Yakuza, Cartel Cook, Mistress, Hells Angels* stilius (2-asis asmuo "Tu", tamsus realizmas, įtraukianti pradžia, moraliniai spąstai, pabaigos kabliukas).
   - **`02_RANK_HIERARCHY_PROGRESSION.md`** – *Delta Force, WWII British Army, Gladiator* stilius (pakopinė hierarchija, konkretūs ginklai/skaičiai, psichologinė kaina).
   - **`03_CURIOSITY_PSYCHOLOGY_ANIMALS.md`** – *Cat Body Language, Dog Sleep Psychology* stilius (klaidinanti kasdienybė -> mokslinis/evoliucinis atskleidimas).
   - **`04_DARK_MYSTERY_PARANORMAL.md`** – *Blackwood Anomaly, Analog Horror, Psychological Suspense* stilius.

3. **`PORTFOLIO_REFERENCE_EXAMPLES.md`**  
   Tikri skriptai, išrašyti (transkribuoti) iš tavo `D:\Desktop\upwork\portfolio` video failų. AI juos naudoja kaip etaloninius pavyzdžius (Few-shot learning).

4. **`generate_script.py`**  
   Patogus pagalbinis įrankis, jei nori paleisti generavimą tiesiai iš komandinės eilutės.

---

## 🚀 Kaip naudotis?

### Paprasčiausias būdas (Per AI pokalbį / Antigravity / ChatGPT):
1. Atsidaryk `MASTER_STORY_SCRIPTWRITER.md` arba atitinkamo žanro failą.
2. Nukopijuok visą turinį.
3. Apačioje pridėk tik savo temą:
   ```markdown
   TEMA: POV: Tu esi Šiaurės Korėjos pabėgėlių vedlys
   TRUKMĖ: 60 sekundžių (apie 140–160 žodžių)
   ```
4. AI iškart sugeneruos paruoštą balso takelį (Voiceover Script) kartu su vaizdų/scenų rekomendacijomis (Scene Prompts).
