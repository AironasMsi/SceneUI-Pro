// ============================================================================
// UNIVERSALUS JSON JUNGIKLIS & IŠMANUSIS IMPORTO MODULIS (json_fixer.js)
// Sukurtas pagal "Universalus JSON Merger" (json fixer.html) logiką ir
// patobulintas su multi-failų drag&drop, tolerantišku parsingu ir tiesiogine
// integracija į Scenes ir Veikėjus.
// ============================================================================

(function() {
    // Čia kaupiami visi sujungti JSON objektai
    let bendrasMasyvas = [];
    let currentModalMode = 'universal'; // 'universal' | 'scenes' | 'characters'

    // ------------------------------------------------------------------------
    // 1. IŠMANUSIS IR TOLERANTIŠKAS JSON PARSERIS (SMART PARSER & AUTO-FIXER)
    // ------------------------------------------------------------------------

    // Saugus komentarų valymas TIK už eilučių (string) ribų, kad nesugadintų URL ar promptų su //
    function stripCommentsOutsideStrings(str) {
        let result = '';
        let inString = false;
        let stringQuote = null;
        let escape = false;
        let inLineComment = false;
        let inBlockComment = false;

        for (let i = 0; i < str.length; i++) {
            const c = str[i];
            const next = i + 1 < str.length ? str[i + 1] : '';

            if (inLineComment) {
                if (c === '\n' || c === '\r') {
                    inLineComment = false;
                    result += c;
                }
                continue;
            }

            if (inBlockComment) {
                if (c === '*' && next === '/') {
                    inBlockComment = false;
                    i++; // praleidžiame /
                }
                continue;
            }

            if (inString) {
                result += c;
                if (escape) {
                    escape = false;
                } else if (c === '\\') {
                    escape = true;
                } else if (c === stringQuote) {
                    inString = false;
                    stringQuote = null;
                }
                continue;
            }

            // Už string ribų
            if (c === '/' && next === '/') {
                inLineComment = true;
                i++; // praleidžiame antrą /
                continue;
            }
            if (c === '/' && next === '*') {
                inBlockComment = true;
                i++; // praleidžiame *
                continue;
            }

            if (c === '"' || c === "'") {
                inString = true;
                stringQuote = c;
                result += c;
                continue;
            }

            result += c;
        }

        return result;
    }

    // Pagalbinė funkcija ištraukti kelis atskirus JSON blokus {...} arba [...] iš teksto srauto naudojant skliaustų dėklą (stack)
    function extractJsonBlocks(str) {
        const blocks = [];
        const stack = [];
        let inString = false;
        let stringQuote = null;
        let escape = false;
        let startIndex = -1;

        for (let i = 0; i < str.length; i++) {
            const c = str[i];

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (c === '\\') {
                    escape = true;
                } else if (c === stringQuote) {
                    inString = false;
                    stringQuote = null;
                }
                continue;
            }

            if (c === '"' || c === "'") {
                inString = true;
                stringQuote = c;
                continue;
            }

            if (c === '{' || c === '[') {
                if (stack.length === 0) {
                    startIndex = i;
                }
                stack.push(c === '{' ? '}' : ']');
            } else if (c === '}' || c === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === c) {
                    stack.pop();
                    if (stack.length === 0 && startIndex !== -1) {
                        const blockStr = str.substring(startIndex, i + 1);
                        blocks.push(blockStr);
                        startIndex = -1;
                    }
                }
            }
        }

        return blocks;
    }

    // Ištraukia atskirus {...} objektus iš sugedusio masyvo teksto
    function extractObjectsFromArrayString(arrStr) {
        const items = [];
        const stack = [];
        let inString = false;
        let stringQuote = null;
        let escape = false;
        let objStart = -1;

        for (let i = 0; i < arrStr.length; i++) {
            const c = arrStr[i];

            if (inString) {
                if (escape) {
                    escape = false;
                } else if (c === '\\') {
                    escape = true;
                } else if (c === stringQuote) {
                    inString = false;
                    stringQuote = null;
                }
                continue;
            }

            if (c === '"' || c === "'") {
                inString = true;
                stringQuote = c;
                continue;
            }

            if (c === '{') {
                if (stack.length === 0) {
                    objStart = i;
                }
                stack.push('}');
            } else if (c === '}') {
                if (stack.length > 0 && stack[stack.length - 1] === '}') {
                    stack.pop();
                    if (stack.length === 0 && objStart !== -1) {
                        const objStr = arrStr.substring(objStart, i + 1);
                        items.push(objStr);
                        objStart = -1;
                    }
                }
            }
        }
        return items;
    }

    // Bando saugiai ir tolerantiškai išparsuoti vieną JSON bloką
    function tryParseJsonBlock(blockStr) {
        if (!blockStr) return null;

        // 1. Standartinis tiesioginis parse
        try {
            return JSON.parse(blockStr);
        } catch (e) {}

        // 2. Šaliname kabančius kablelius prieš ] arba }
        let cleaned = blockStr.replace(/,\s*([\]}])/g, '$1');
        try {
            return JSON.parse(cleaned);
        } catch (e) {}

        // 3. Jei raktai be kabučių: {id: "S01", prompt: "..."}
        try {
            let relaxed = cleaned.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');
            relaxed = relaxed.replace(/,\s*([\]}])/g, '$1');
            return JSON.parse(relaxed);
        } catch (e) {}

        // 4. Jei viengubos kabutės: {'id': 'S01', 'prompt': '...'}
        try {
            let sq = cleaned
                .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
                .replace(/:\s*'([^']*)'/g, ':"$1"')
                .replace(/,\s*([\]}])/g, '$1');
            return JSON.parse(sq);
        } catch (e) {}

        // 5. Neekranuoti naujos eilutės simboliai string reikšmėse
        try {
            let fixedControl = cleaned.replace(/("(?:[^"\\]|\\.)*")/g, (m) => {
                return m.replace(/\r?\n/g, '\\n').replace(/\t/g, '\\t');
            });
            return JSON.parse(fixedControl);
        } catch (e) {}

        // 6. Jei tai buvo masyvas [ ... ], bet viduje yra klaidų, pabandome išgelbėti atskirus {...} objektus!
        if (blockStr.trim().startsWith('[') && blockStr.trim().endsWith(']')) {
            const subObjs = extractObjectsFromArrayString(blockStr);
            if (subObjs.length > 0) {
                const recovered = [];
                for (const oStr of subObjs) {
                    const parsedSub = tryParseJsonBlock(oStr);
                    if (parsedSub !== null && parsedSub !== undefined) {
                        recovered.push(parsedSub);
                    }
                }
                if (recovered.length > 0) return recovered;
            }
        }

        return null;
    }

    function sanitizeAndParseJsonText(rawText) {
        if (!rawText || !rawText.trim()) return [];

        let text = rawText.trim();

        // Pašaliname Markdown kodo blokus (```json ... ``` arba ``` ...)
        text = text.replace(/^```(?:json)?\s*[\r\n]*/i, '');
        text = text.replace(/[\r\n]*\s*```\s*$/i, '');
        text = text.trim();

        // Normalizuojame nematomas / Unicode tarpų reikšmes
        text = text.replace(/[\u00A0\u200B\uFEFF]/g, ' ');

        // 1 Bandymas: Tiesioginis standartinis JSON.parse
        try {
            const direct = JSON.parse(text);
            if (typeof direct === 'string') {
                const inner = direct.trim();
                if (inner.startsWith('[') || inner.startsWith('{')) {
                    return sanitizeAndParseJsonText(inner);
                }
            }
            const norm = normalizeParsedData(direct);
            if (norm.length > 0) return norm;
        } catch (e) {}

        // Jei visas tekstas apgaubtas išorinėmis kabutėmis (pvz., "[ ... ]" arba '[ ... ]')
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
            const inner = text.substring(1, text.length - 1).trim();
            if ((inner.startsWith('[') && inner.endsWith(']')) || (inner.startsWith('{') && inner.endsWith('}'))) {
                try {
                    return sanitizeAndParseJsonText(inner);
                } catch (e) {}
            }
        }

        // Saugiai pašaliname komentarus TIK UŽ KABUČIŲ RIBŲ
        text = stripCommentsOutsideStrings(text);
        text = text.trim();

        // 2 Bandymas: Po saugaus komentarų šalinimo
        try {
            const direct = JSON.parse(text);
            if (typeof direct === 'string') {
                const inner = direct.trim();
                if (inner.startsWith('[') || inner.startsWith('{')) {
                    return sanitizeAndParseJsonText(inner);
                }
            }
            const norm = normalizeParsedData(direct);
            if (norm.length > 0) return norm;
        } catch (e) {}

        // 3 Bandymas: Jei tekstas apgaubtas papildomu tekstu arba yra keli blokai ([...] ir [...], ar {...} ir {...})
        const blocks = extractJsonBlocks(text);
        if (blocks.length > 0) {
            let combined = [];
            for (const blk of blocks) {
                const parsed = tryParseJsonBlock(blk);
                if (parsed !== null && parsed !== undefined) {
                    combined = combined.concat(normalizeParsedData(parsed));
                }
            }
            if (combined.length > 0) return combined;
        }

        // 4 Bandymas: Globalus kabančių kablelių taisymas
        let cleaned = text.replace(/,\s*([\]}])/g, '$1');
        try {
            const fixedCommas = JSON.parse(cleaned);
            const norm = normalizeParsedData(fixedCommas);
            if (norm.length > 0) return norm;
        } catch (e) {}

        // 5 Bandymas: Unquoted keys ir single quotes bandymas visam tekstui
        const wholeParsed = tryParseJsonBlock(cleaned);
        if (wholeParsed !== null && wholeParsed !== undefined) {
            const norm = normalizeParsedData(wholeParsed);
            if (norm.length > 0) return norm;
        }

        // 6 Bandymas: Jei tekstas turi įžanginį/baigiamąjį aprašymą, ištraukti nuo pirmo [ ar { iki paskutinio ] ar }
        const firstBracket = text.search(/[{\[]/);
        const lastBracket = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
        if (firstBracket !== -1 && lastBracket > firstBracket) {
            const sliced = text.substring(firstBracket, lastBracket + 1);
            const slicedParsed = tryParseJsonBlock(sliced);
            if (slicedParsed !== null && slicedParsed !== undefined) {
                const norm = normalizeParsedData(slicedParsed);
                if (norm.length > 0) return norm;
            }
        }

        throw new Error("Neteisingas JSON formatas! Patikrinkite skliaustus ar kablelius.");
    }

    // Normalizuoja įvairias struktūras į vientisą masyvą
    function normalizeParsedData(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;

        if (typeof data === 'string') {
            const trimmed = data.trim();
            if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || 
                (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
                try {
                    return normalizeParsedData(JSON.parse(trimmed));
                } catch (e) {}
            }
            return [];
        }

        if (typeof data === 'object') {
            // Jei apgaubta populiariuose raktuose: scenes, characters, data, items, list
            if (Array.isArray(data.scenes)) return data.scenes;
            if (Array.isArray(data.characters)) return data.characters;
            if (Array.isArray(data.data)) return data.data;
            if (Array.isArray(data.items)) return data.items;
            if (Array.isArray(data.list)) return data.list;

            // Jei tai objektų žodynas pagal ID, pvz.: { "Hero": { prompt: "..." }, "Girl": { prompt: "..." } }
            const keys = Object.keys(data);
            if (keys.length > 0 && typeof data[keys[0]] === 'object' && data[keys[0]] !== null && !Array.isArray(data[keys[0]])) {
                const firstVal = data[keys[0]];
                if (firstVal.prompt || firstVal.base || firstVal.template || firstVal.params) {
                    return keys.map(k => ({
                        id: k,
                        base: firstVal.template || firstVal.base || (firstVal.params ? firstVal.params.template : 'male'),
                        prompt: firstVal.prompt || (firstVal.params ? firstVal.params.prompt : ''),
                        negative: firstVal.negative || (firstVal.params ? firstVal.params.negative : '')
                    }));
                }
            }

            return [data];
        }

        return [];
    }

    // Aptinka sukauptų duomenų tipą (Scenos, Veikėjai, Stiliai, ar Bendri)
    function detectContentType(arr) {
        if (!arr || arr.length === 0) return { type: 'empty', label: 'Nėra duomenų', badgeClass: 'badge' };

        let sceneScore = 0;
        let charScore = 0;

        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            // Scenos požymiai
            if (item.h3_prompt || item.sfx_prompt || (item.speaker && item.text)) {
                sceneScore += 4;
            }
            if (item.prompt && (item.text || item.refA || item.refB || item.refC || (item.id && String(item.id).match(/^s?\d+$/i)))) {
                sceneScore += 2;
            } else if (item.prompt && item.id) {
                sceneScore += 1;
            }

            // Veikėjų požymiai
            if (item.base || item.template || (item.id && String(item.id).match(/\.(png|jpg|webp)$/i))) {
                charScore += 2;
            }
            if (item.base && ['male', 'female', 'teen', 'kid'].includes(String(item.base).toLowerCase())) {
                charScore += 3;
            }
        }

        if (sceneScore > charScore && sceneScore > 0) {
            return { type: 'scenes', label: `🎬 Scenes (${arr.length} vnt.)`, badgeClass: 'badge good' };
        } else if (charScore >= sceneScore && charScore > 0) {
            return { type: 'characters', label: `🎭 Veikėjai (${arr.length} vnt.)`, badgeClass: 'badge accent' };
        } else {
            return { type: 'generic', label: `📦 JSON Objektai (${arr.length} vnt.)`, badgeClass: 'badge' };
        }
    }

    // ------------------------------------------------------------------------
    // 2. MODALO VALDYMAS IR ATVAIZDAVIMAS
    // ------------------------------------------------------------------------

    window.openJsonFixerModal = function(mode = 'universal') {
        currentModalMode = mode;
        const modal = document.getElementById("modalUniversalJsonFixer");
        if (!modal) return;

        // Nustatome tab'us ir mygtukų aktyvumą
        updateModalModeUI(mode);
        updateOutputDisplay();

        modal.classList.add("show");
        const inputArea = document.getElementById("jsonFixerInput");
        if (inputArea) {
            setTimeout(() => inputArea.focus(), 100);
        }
    };

    window.closeJsonFixerModal = function() {
        const modal = document.getElementById("modalUniversalJsonFixer");
        if (modal) modal.classList.remove("show");
    };

    function updateModalModeUI(mode) {
        currentModalMode = mode;
        const tabs = document.querySelectorAll(".jf-mode-tab");
        tabs.forEach(tab => {
            tab.classList.toggle("active", tab.dataset.mode === mode);
        });

        const titleEl = document.getElementById("jsonFixerTitle");
        const subtitleEl = document.getElementById("jsonFixerSubtitle");
        const btnScenes = document.getElementById("btnJsonFixerApplyScenes");
        const btnChars = document.getElementById("btnJsonFixerApplyChars");

        if (mode === 'scenes') {
            if (titleEl) titleEl.textContent = "🎬 Scenų JSON Įkėlimas & Jungiklis";
            if (subtitleEl) subtitleEl.textContent = "Įklijuokite arba įmeskite failus – jie automatiškai susijungs ir bus įkelti į Scenų lentelę.";
            if (btnScenes) btnScenes.classList.add("primary");
        } else if (mode === 'characters') {
            if (titleEl) titleEl.textContent = "🎭 Veikėjų JSON Įkėlimas & Jungiklis";
            if (subtitleEl) subtitleEl.textContent = "Įklijuokite arba įmeskite veikėjų failus – jie susijungs ir atnaujins personažų sąrašą.";
            if (btnChars) btnChars.classList.add("primary");
        } else {
            if (titleEl) titleEl.textContent = "⚡ Universalus JSON Merger & Taisyklė";
            if (subtitleEl) subtitleEl.textContent = "Jungia kelis JSON gabalus ar failus į vieną vientisą masyvą, pataiso klaidas ir leidžia įkelti arba atsisiųsti.";
        }
    }

    function updateOutputDisplay() {
        const outputEl = document.getElementById("jsonFixerOutput");
        const countEl = document.getElementById("jsonFixerCount");
        const typeBadgeEl = document.getElementById("jsonFixerTypeBadge");
        const btnScenes = document.getElementById("btnJsonFixerApplyScenes");
        const btnChars = document.getElementById("btnJsonFixerApplyChars");

        if (countEl) countEl.textContent = bendrasMasyvas.length;

        if (outputEl) {
            if (bendrasMasyvas.length === 0) {
                outputEl.value = "";
                outputEl.placeholder = "Čia atsiras sujungtas didelis JSON kodas...";
            } else {
                outputEl.value = JSON.stringify(bendrasMasyvas, null, 2);
            }
        }

        const info = detectContentType(bendrasMasyvas);
        if (typeBadgeEl) {
            typeBadgeEl.textContent = info.label;
            typeBadgeEl.className = info.badgeClass;
        }

        // Atnaujiname mygtukų tekstus su elementų kiekiu
        if (btnScenes) {
            btnScenes.textContent = bendrasMasyvas.length > 0 
                ? `🚀 Assign to Scenes (${bendrasMasyvas.length})` 
                : `🚀 Assign to Scenes`;
        }
        if (btnChars) {
            btnChars.textContent = bendrasMasyvas.length > 0 
                ? `🎭 Įkelti į Veikėjus (${bendrasMasyvas.length})` 
                : `🎭 Įkelti į Veikėjus`;
        }
    }

    function showStatus(msg, isSuccess = true) {
        const statusDiv = document.getElementById("jsonFixerStatus");
        if (!statusDiv) return;
        statusDiv.textContent = msg;
        statusDiv.style.color = isSuccess ? "var(--good, #2ecc71)" : "var(--bad, #e74c3c)";
        setTimeout(() => {
            if (statusDiv.textContent === msg) statusDiv.textContent = '';
        }, 5000);
    }

    // ------------------------------------------------------------------------
    // 3. VEIKSMAI: PRIDĖTI, IMPORTUOTI, SIŲSTIS, KOPIJUOTI
    // ------------------------------------------------------------------------

    // Pridėti naują tekstą iš įvesties laukelio prie bendro masyvo
    window.pridetiJsonPrieBendro = function() {
        const inputEl = document.getElementById("jsonFixerInput");
        if (!inputEl) return;
        const textValue = inputEl.value.trim();

        if (!textValue) {
            showStatus("⚠️ KLAIDA: Įvesties laukelyje nėra teksto!", false);
            return;
        }

        try {
            const parsed = sanitizeAndParseJsonText(textValue);
            if (!parsed || parsed.length === 0) {
                showStatus("⚠️ Nepavyko rasti galiojančių JSON objektų!", false);
                return;
            }

            bendrasMasyvas = bendrasMasyvas.concat(parsed);
            inputEl.value = ""; // Išvalome įvestį, kad būtų galima klijuoti kitą dalį!
            updateOutputDisplay();
            showStatus(`✅ Sėkmingai pridėta +${parsed.length} vnt.! Bendras elementų kiekis: ${bendrasMasyvas.length}`, true);

            if (typeof toast === 'function') {
                toast("JSON Pridėta", `Pridėta +${parsed.length} el. Viso sukaupta: ${bendrasMasyvas.length}`, "success");
            }
        } catch (err) {
            showStatus(`❌ KLAIDA: ${err.message}`, false);
        }
    };

    // Apdoroti įmestus ar pasirinktus failus (Gali būti keli vienu metu!)
    window.handleJsonFixerFiles = async function(files) {
        if (!files || files.length === 0) return;

        let totalAdded = 0;
        let filesProcessed = 0;
        let fileErrors = [];

        showStatus(`⏳ Skaitomi ${files.length} failai...`, true);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const content = await readFileAsText(file);
                const parsed = sanitizeAndParseJsonText(content);
                if (parsed && parsed.length > 0) {
                    bendrasMasyvas = bendrasMasyvas.concat(parsed);
                    totalAdded += parsed.length;
                    filesProcessed++;
                }
            } catch (err) {
                fileErrors.push(`${file.name}: ${err.message}`);
            }
        }

        updateOutputDisplay();

        if (totalAdded > 0) {
            const msg = `✅ Apdorota failų: ${filesProcessed}/${files.length}. Pridėta +${totalAdded} el. (Bendras kiekis: ${bendrasMasyvas.length})`;
            showStatus(msg, true);
            if (typeof toast === 'function') toast("Failai apdoroti", msg, "success");
        } else if (fileErrors.length > 0) {
            showStatus(`❌ Klaida skaitant failus: ${fileErrors[0]}`, false);
        }
    };

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Nepavyko perskaityti failo"));
            reader.readAsText(file, "UTF-8");
        });
    }

    // Kopijuoti rezultatą į iškarpinę
    window.kopijuotiJsonRezultata = function() {
        const outputEl = document.getElementById("jsonFixerOutput");
        if (!outputEl || !outputEl.value) {
            showStatus("⚠️ Nėra ką kopijuoti!", false);
            return;
        }

        navigator.clipboard.writeText(outputEl.value).then(() => {
            showStatus("📋 Rezultatas nukopijuotas į iškarpinę!", true);
            if (typeof toast === 'function') toast("Nukopijuota", "JSON nukopijuotas į iškarpinę", "success");
        }).catch(err => {
            outputEl.select();
            document.execCommand('copy');
            showStatus("📋 Rezultatas nukopijuotas!", true);
        });
    };

    // Download kaip .json failą
    window.atsisiustiJsonRezultata = function() {
        if (bendrasMasyvas.length === 0) {
            showStatus("⚠️ Nėra duomenų atsisiuntimui!", false);
            return;
        }

        const tekstas = JSON.stringify(bendrasMasyvas, null, 2);
        const blob = new Blob([tekstas], { type: "application/json;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.href = url;
        a.download = `sujungti_duomenys_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showStatus("💾 Failas atsiunčiamas!", true);
        if (typeof toast === 'function') toast("Atsisiųsta", "JSON failas sėkmingai išsaugotas", "success");
    };

    // Išvalyti viską (programiškai)
    window.resetJsonFixerState = function() {
        bendrasMasyvas = [];
        const inEl = document.getElementById("jsonFixerInput");
        if (inEl) inEl.value = "";
        updateOutputDisplay();
        const statusDiv = document.getElementById("jsonFixerStatus");
        if (statusDiv) {
            statusDiv.textContent = "";
            statusDiv.style.color = "";
        }
    };

    // Išvalyti viską (mygtukas)
    window.isvalytiJsonViska = function() {
        if (bendrasMasyvas.length === 0) return;
        if (confirm("Ar tikrai norite išvalyti visą sukauptą JSON informaciją?")) {
            window.resetJsonFixerState();
            showStatus("🗑️ Visi duomenys išvalyti.", true);
        }
    };

    // Format Input Only (Greitas pataisymas vietoje)
    window.formatuotiJsonIvesti = function() {
        const inputEl = document.getElementById("jsonFixerInput");
        if (!inputEl || !inputEl.value.trim()) return;

        try {
            const parsed = sanitizeAndParseJsonText(inputEl.value);
            inputEl.value = JSON.stringify(parsed, null, 2);
            showStatus(`✨ Įvestis suformatuota ir pataisyta (${parsed.length} el.)`, true);
        } catch (err) {
            showStatus(`❌ KLAIDA: ${err.message}`, false);
        }
    };

    // ------------------------------------------------------------------------
    // 4. INTEGRACIJA Į SCENAS IR VEIKĖJUS
    // ------------------------------------------------------------------------

    // Tiesioginis įkėlimas į SCENAS
    window.applyJsonFixerToScenes = function() {
        let dataToApply = bendrasMasyvas;

        // Jei bendras tuščias, bet įvesties laukelyje yra teksto – automatiškai paimame jį!
        const inputEl = document.getElementById("jsonFixerInput");
        if (dataToApply.length === 0 && inputEl && inputEl.value.trim()) {
            try {
                const parsed = sanitizeAndParseJsonText(inputEl.value.trim());
                if (parsed.length > 0) {
                    bendrasMasyvas = bendrasMasyvas.concat(parsed);
                    dataToApply = bendrasMasyvas;
                    inputEl.value = "";
                    updateOutputDisplay();
                }
            } catch (e) {
                showStatus(`❌ ${e.message}`, false);
                return;
            }
        }

        if (dataToApply.length === 0) {
            showStatus("⚠️ Nėra scenų duomenų įkėlimui!", false);
            return;
        }

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) {
            showStatus("❌ Aktyvus projektas nerastas.", false);
            return;
        }

        const replaceCheck = document.getElementById("jfModeReplace");
        const shouldReplace = replaceCheck && replaceCheck.checked;

        if (shouldReplace) {
            proj.scenes = [];
            proj.sceneTextById = {};
        }

        if (!proj.scenes) proj.scenes = [];
        if (!proj.sceneTextById) proj.sceneTextById = {};

        let added = 0;
        let updated = 0;

        dataToApply.forEach(d => {
            let id = d.id;
            if (!id) {
                const nextNum = proj.scenes.length + 1;
                id = `S${nextNum < 10 ? '0' + nextNum : nextNum}`;
            }

            const cleanIdStr = (s) => String(s || '').trim().toLowerCase().replace(/^s0*(\d+)$/, 's$1');
            const targetNormId = cleanIdStr(id);

            const existing = proj.scenes.find(s => cleanIdStr(s.id) === targetNormId);
            if (existing) {
                if (d.prompt !== undefined) existing.prompt = d.prompt;
                if (d.video_prompt !== undefined) existing.video_prompt = d.video_prompt;
                if (d.negative !== undefined) existing.negative = d.negative;
                if (d.refA !== undefined) existing.refA = d.refA;
                if (d.refB !== undefined) existing.refB = d.refB;
                if (d.refC !== undefined) existing.refC = d.refC;
                if (d.voice !== undefined) existing.voice = d.voice;
                if (d.speaker !== undefined) existing.speaker = d.speaker;
                if (d.h3_prompt !== undefined) existing.h3_prompt = d.h3_prompt;
                if (d.sfx_prompt !== undefined) existing.sfx_prompt = d.sfx_prompt;
                if (d.dialogue !== undefined) existing.dialogue = d.dialogue;
                updated++;
            } else {
                proj.scenes.push({
                    id: id,
                    prompt: d.prompt || '',
                    video_prompt: d.video_prompt || '',
                    negative: d.negative || '',
                    refA: d.refA || '',
                    refB: d.refB || '',
                    refC: d.refC || '',
                    voice: d.voice || '',
                    speaker: d.speaker || '',
                    h3_prompt: d.h3_prompt || '',
                    sfx_prompt: d.sfx_prompt || '',
                    dialogue: d.dialogue || null
                });
                added++;
            }

            if (d.text) {
                proj.sceneTextById[id] = d.text;
                if (existing && existing.id && existing.id !== id) {
                    proj.sceneTextById[existing.id] = d.text;
                }
            }
        });

        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.validateScenes === 'function') window.validateScenes();
        if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
        else if (typeof window.renderImages === 'function') window.renderImages();
        if (typeof window.renderTimeline === 'function') window.renderTimeline();

        window.closeJsonFixerModal();
        const msg = `Sėkmingai įkelta į Scenes: naujų +${added}, atnaujinta ${updated}. Viso: ${proj.scenes.length}`;
        if (typeof toast === 'function') toast("Scenos įkeltos", msg, "success");
    };

    // Tiesioginis įkėlimas į VEIKĖJUS
    window.applyJsonFixerToCharacters = function() {
        let dataToApply = bendrasMasyvas;

        const inputEl = document.getElementById("jsonFixerInput");
        if (dataToApply.length === 0 && inputEl && inputEl.value.trim()) {
            try {
                const parsed = sanitizeAndParseJsonText(inputEl.value.trim());
                if (parsed.length > 0) {
                    bendrasMasyvas = bendrasMasyvas.concat(parsed);
                    dataToApply = bendrasMasyvas;
                    inputEl.value = "";
                    updateOutputDisplay();
                }
            } catch (e) {
                showStatus(`❌ ${e.message}`, false);
                return;
            }
        }

        if (dataToApply.length === 0) {
            showStatus("⚠️ Nėra veikėjų duomenų įkėlimui!", false);
            return;
        }

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) {
            showStatus("❌ Aktyvus projektas nerastas.", false);
            return;
        }

        const replaceCheck = document.getElementById("jfModeReplace");
        const shouldReplace = replaceCheck && replaceCheck.checked;

        if (shouldReplace) {
            proj.charRefs = {};
        }

        if (!proj.charRefs) proj.charRefs = {};

        let created = 0;
        let updated = 0;

        dataToApply.forEach((char, idx) => {
            const name = char.id || char.name || char.ref || char.filename || `Char_${idx + 1}`;
            let base = (char.base || char.template || "").toLowerCase();
            const validBases = ['male', 'female', 'teen', 'kid'];
            if (!validBases.includes(base)) {
                const p = (char.prompt || "").toLowerCase();
                if (p.includes('boy') || p.includes('kid')) base = 'kid';
                else if (p.includes('teen') || p.includes('girl')) base = 'teen';
                else if (p.includes('woman') || p.includes('female')) base = 'female';
                else if (p.includes('man') || p.includes('male')) base = 'male';
                else base = 'male';
            }

            if (!proj.charRefs[name]) {
                proj.charRefs[name] = {
                    template: base,
                    voice_id: char.voice_id || char.voice || '',
                    gender: char.gender || '',
                    voice_description: char.voice_description || char.voicePrompt || '',
                    params: {
                        prompt: char.prompt || '',
                        negative: char.negative || '',
                        seed: char.seed !== undefined ? char.seed : 941027876668241,
                        randomize: char.seed === undefined,
                        steps: 4,
                        cfg: 1.0
                    },
                    variations: [],
                    mainId: null,
                    generating: false
                };
                created++;
            } else {
                const c = proj.charRefs[name];
                if (!c.variations && c.vars) c.variations = c.vars;
                if (!c.variations) c.variations = [];
                if (!c.params) c.params = {};
                c.template = base || c.template;
                if (char.voice_id || char.voice) c.voice_id = char.voice_id || char.voice;
                if (char.gender) c.gender = char.gender;
                if (char.voice_description || char.voicePrompt) c.voice_description = char.voice_description || char.voicePrompt;
                if (char.prompt) c.params.prompt = char.prompt;
                if (char.negative !== undefined) c.params.negative = char.negative;
                if (char.seed !== undefined) { c.params.seed = char.seed; c.params.randomize = false; }
                updated++;
            }
        });

        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.renderCharRefs === 'function') window.renderCharRefs();

        window.closeJsonFixerModal();
        const msg = `Sėkmingai įkelta į Veikėjus: naujų +${created}, atnaujinta ${updated}. Viso: ${Object.keys(proj.charRefs).length}`;
        if (typeof toast === 'function') toast("Veikėjai įkelti", msg, "success");
    };

    // ------------------------------------------------------------------------
    // 5. INICIALIZACIJA IR DRAG & DROP KLAUSYTOJAI
    // ------------------------------------------------------------------------

    function initJsonFixer() {
        const dropzone = document.getElementById("jsonFixerDropzone");
        const fileInput = document.getElementById("jsonFixerFileInput");
        const btnPickFiles = document.getElementById("btnJsonFixerPickFiles");

        if (dropzone && fileInput) {
            // Drag and drop
            dropzone.addEventListener("dragover", (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = "var(--accent, #6ea8ff)";
                dropzone.style.background = "rgba(110, 168, 255, 0.12)";
            });

            dropzone.addEventListener("dragleave", (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = "var(--border)";
                dropzone.style.background = "rgba(0, 0, 0, 0.25)";
            });

            dropzone.addEventListener("drop", (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.style.borderColor = "var(--border)";
                dropzone.style.background = "rgba(0, 0, 0, 0.25)";

                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    window.handleJsonFixerFiles(e.dataTransfer.files);
                }
            });

            if (btnPickFiles) {
                btnPickFiles.addEventListener("click", () => fileInput.click());
            }

            fileInput.addEventListener("change", (e) => {
                if (e.target.files && e.target.files.length > 0) {
                    window.handleJsonFixerFiles(e.target.files);
                    fileInput.value = "";
                }
            });
        }

        // Susiejame esamus mygtukus, kad atidarytų išmanųjį modalą
        const btnLoadJson = document.getElementById("btnLoadJson");
        if (btnLoadJson) {
            btnLoadJson.onclick = (e) => {
                e.preventDefault();
                window.openJsonFixerModal('scenes');
            };
        }

        const btnLoadCharJson = document.getElementById("btnLoadCharJson");
        if (btnLoadCharJson) {
            btnLoadCharJson.onclick = (e) => {
                e.preventDefault();
                window.openJsonFixerModal('characters');
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJsonFixer);
    } else {
        initJsonFixer();
    }

})();
