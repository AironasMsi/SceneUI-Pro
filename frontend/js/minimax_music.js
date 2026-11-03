// ============================================================================
// MINIMAX MUSIC 3 & OLLAMA SOUNDTRACK GENERATOR (SCENEUI STUDIO)
// ============================================================================

(function() {
    let lastGeneratedTrack = null;
    let previewAudioPlayer = null;

    // Helper Toast
    function showToast(title, msg, type = 'info') {
        if (typeof window.toast === 'function') {
            window.toast(title, msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            console.log(`[Toast ${type}] ${title}: ${msg}`);
        }
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // 1. OPEN MODAL
    window.openMiniMaxAiMusicGeneratorModal = async function() {
        const modal = document.getElementById('modalMiniMaxMusicGenerator');
        if (!modal) return;

        modal.classList.add('show');
        const proj = typeof window.getProj === 'function' ? window.getProj() : (window.proj || {});

        // Nuskaitome projekto trukmę
        let totalDuration = 60;
        if (proj) {
            const tl = proj.timeline || proj.scenesTimeline || [];
            if (tl && tl.length > 0) {
                totalDuration = tl.reduce((acc, t) => acc + (parseFloat(t.dur || t.duration) || 4.0), 0);
            } else if (proj.scenes && proj.scenes.length > 0) {
                totalDuration = proj.scenes.length * 4.0;
            }
        }
        totalDuration = Math.round(totalDuration);

        // Nustatome trukmės indikatorių
        const durBadge = document.getElementById('mmProjectDurationBadge');
        if (durBadge) {
            durBadge.textContent = `Filmo trukmė: ${totalDuration}s (Seamless Loop paruošimas)`;
        }

        // Užpildome Ollama modelių sąrašą
        await loadOllamaModels();

        // Jei promptas dar tuščias, automatiškai sugeneruojame pradinį pasiūlymą
        const captionArea = document.getElementById('mmCaptionInput');
        if (captionArea && (!captionArea.value || captionArea.value.trim() === '')) {
            window.generateAiMusicPromptFromProject(true);
        }
    };

    // 2. CLOSE MODAL
    window.closeMiniMaxAiMusicGeneratorModal = function() {
        const modal = document.getElementById('modalMiniMaxMusicGenerator');
        if (modal) modal.classList.remove('show');
        if (previewAudioPlayer) {
            previewAudioPlayer.pause();
        }
    };

    // 3. LOAD OLLAMA MODELS
    async function loadOllamaModels() {
        const select = document.getElementById('mmOllamaModelSelect');
        if (!select) return;

        try {
            const res = await fetch('/api/audio/bgm/ollama_models');
            if (res.ok) {
                const data = await res.json();
                if (data.models && data.models.length > 0) {
                    select.innerHTML = '';
                    data.models.forEach(m => {
                        const opt = document.createElement('option');
                        opt.value = m;
                        opt.textContent = m;
                        if (m.includes('qwen2.5:3b') || m.includes('qwen')) {
                            opt.selected = true;
                        }
                        select.appendChild(opt);
                    });
                    return;
                }
            }
        } catch (e) {
            console.warn('[MiniMax Music] Klaida nuskaitant Ollama modelius:', e);
        }

        // Fallback options
        select.innerHTML = `
            <option value="qwen2.5:3b" selected>qwen2.5:3b (Greitas & Tikslus)</option>
            <option value="dolphin-llama3:latest">dolphin-llama3:latest</option>
            <option value="qwen2.5vl:7b">qwen2.5vl:7b</option>
        `;
    }

    // 4. GENERATE PROMPT FROM PROJECT (OLLAMA)
    window.generateAiMusicPromptFromProject = async function(isSilent = false) {
        const btn = document.getElementById('btnMmGeneratePrompt');
        const captionArea = document.getElementById('mmCaptionInput');
        const lyricsArea = document.getElementById('mmLyricsInput');
        const titleInput = document.getElementById('mmTrackTitleInput');
        const genreSelect = document.getElementById('mmGenreSelect');
        const customMood = document.getElementById('mmCustomMoodInput');
        const modelSelect = document.getElementById('mmOllamaModelSelect');
        const statusEl = document.getElementById('mmPromptStatusLabel');

        const proj = typeof window.getProj === 'function' ? window.getProj() : (window.proj || {});
        const projectId = proj ? proj.id : null;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ Ollama analizuoja scenas...';
        }
        if (statusEl) {
            statusEl.textContent = '🧠 Ollama analizuoja siužetą ir kuria instrumentinį garso takelį...';
            statusEl.style.color = '#38bdf8';
        }

        try {
            const res = await fetch('/api/audio/bgm/prompt_from_project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    project_id: projectId,
                    genre: genreSelect ? genreSelect.value : 'cinematic',
                    custom_mood: customMood ? customMood.value : '',
                    model: modelSelect ? modelSelect.value : 'qwen2.5:3b'
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data.status === 'success' && data.prompt) {
                const p = data.prompt;
                if (captionArea) captionArea.value = p.caption || '';
                if (lyricsArea) lyricsArea.value = p.lyrics || '';
                if (titleInput) titleInput.value = p.title || 'Cinematic Soundtrack';

                if (statusEl) {
                    statusEl.textContent = `✨ Sukurtas garso takelis: "${p.title || 'Soundtrack'}" (${p.genre || ''}, ${p.bpm || 80} BPM)`;
                    statusEl.style.color = '#00ffcc';
                }
                if (!isSilent) {
                    showToast('Ollama AI', 'Muzikos promptas sėkmingai sugeneruotas pagal jūsų scenas!', 'success');
                }
            } else {
                throw new Error(data.error_detail || 'Nepavyko sugeneruoti prompto');
            }
        } catch (err) {
            console.error('[MiniMax Music] Ollama prompt error:', err);
            if (statusEl) {
                statusEl.textContent = '⚠️ Nepavyko susisiekti su Ollama, pritaikytas etaloninis garso takelis.';
                statusEl.style.color = '#fbbf24';
            }
            if (!isSilent) {
                showToast('Ollama Įspėjimas', 'Pritaikytas etaloninis instrumentinis šablonas.', 'warning');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '💡 Sugeneruoti Promptą pagal Scenes (Ollama AI)';
            }
        }
    };

    // 5. START MINIMAX MUSIC GENERATION (COMFYUI)
    window.startMiniMaxMusicGeneration = async function() {
        const captionArea = document.getElementById('mmCaptionInput');
        const lyricsArea = document.getElementById('mmLyricsInput');
        const titleInput = document.getElementById('mmTrackTitleInput');
        const durSelect = document.getElementById('mmDurationSelect');
        const stepsSelect = document.getElementById('mmStepsSelect');
        const seedInput = document.getElementById('mmSeedInput');
        const btnGen = document.getElementById('btnMmStartGenerate');
        const statusCard = document.getElementById('mmGenStatusCard');
        const statusText = document.getElementById('mmGenStatusText');
        const progressFill = document.getElementById('mmGenProgressFill');
        const resultCard = document.getElementById('mmGenResultCard');

        const caption = captionArea ? captionArea.value.trim() : '';
        const lyrics = lyricsArea ? lyricsArea.value.trim() : '';
        const trackTitle = titleInput ? titleInput.value.trim() : 'MiniMax Soundtrack';
        const duration = durSelect ? parseInt(durSelect.value, 10) : 60;
        const steps = stepsSelect ? parseInt(stepsSelect.value, 10) : 25;
        let seed = seedInput && seedInput.value.trim() ? parseInt(seedInput.value.trim(), 10) : -1;
        if (isNaN(seed) || seed <= 0) seed = Math.floor(Math.random() * 900000000000) + 100000000000;

        if (!caption) {
            showToast('Klaida', 'Prašome įrašyti arba sugeneruoti muzikos aprašymą (Caption)!', 'error');
            return;
        }

        if (btnGen) {
            btnGen.disabled = true;
            btnGen.innerHTML = '⏳ Vyksta sintezė ComfyUI serveryje...';
        }
        if (statusCard) statusCard.classList.remove('hidden');
        if (resultCard) resultCard.classList.add('hidden');
        if (progressFill) {
            progressFill.style.background = 'linear-gradient(90deg, #6366f1, #00ffcc)';
            progressFill.style.width = '10%';
        }

        const startTimestamp = Date.now();
        const progTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
            const timeStr = formatTime(elapsed);
            
            if (statusText) {
                if (elapsed < 30) {
                    statusText.textContent = `⚡ [${timeStr}] ComfyUI atlaisvina VRAM ir krauna MiniMax DiT modelius...`;
                } else if (elapsed < 180) {
                    statusText.textContent = `🎼 [${timeStr}] KSampler vykdo difuziją (${steps} žingsniai, FP8 režimas)...`;
                } else {
                    statusText.textContent = `⏳ [${timeStr}] Generuojama muzika... Pirmas modelių paleidimas gali užtrukti ilgiau.`;
                }
            }

            if (progressFill) {
                const pct = Math.min(95, 10 + Math.floor(elapsed / 4));
                progressFill.style.width = `${pct}%`;
            }
        }, 1000);

        try {
            const res = await fetch('/api/audio/bgm/generate_minimax', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caption: caption,
                    lyrics: lyrics,
                    duration: duration,
                    steps: steps,
                    cfg_scale: 1.7,
                    seed: seed,
                    track_name: trackTitle
                })
            });

            clearInterval(progTimer);

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
                throw new Error(errJson.detail || `Serverio klaida HTTP ${res.status}`);
            }

            const data = await res.json();
            if (data.status === 'success' && data.track) {
                if (progressFill) progressFill.style.width = '100%';
                if (statusText) statusText.textContent = '✅ Muzika sėkmingai sugeneruota ir išsaugota į BGM biblioteką!';
                
                lastGeneratedTrack = data.track;
                displayGeneratedResult(data.track);
                showToast('MiniMax Music 3', `Muzika sukurta: "${data.track.name}" (${data.track.duration}s)!`, 'success');
            } else {
                throw new Error('Negautas garso takelio rezultatas iš serverio');
            }
        } catch (err) {
            clearInterval(progTimer);
            console.error('[MiniMax Music] Generation error:', err);
            if (statusText) {
                statusText.innerHTML = `❌ Generavimo klaida: ${err.message} <br/><button type="button" class="btn text-xs" style="margin-top:6px; background:#38bdf8; color:#000; font-weight:800; padding: 4px 10px; border-radius: 4px;" onclick="window.fetchLatestComfyUiTrack()">📥 Pasiimti paskutinį sugeneruotą takelį iš ComfyUI</button>`;
                statusText.style.color = '#ef4444';
            }
            if (progressFill) progressFill.style.background = '#ef4444';
            showToast('Generavimo Klaida', err.message, 'error');
        } finally {
            if (btnGen) {
                btnGen.disabled = false;
                btnGen.innerHTML = '🎵 Generate Muziką su ComfyUI (MiniMax 3)';
            }
        }
    };

    // 6. FETCH LATEST COMFYUI TRACK IF TIMEOUT OR RECOVERY
    window.fetchLatestComfyUiTrack = async function() {
        showToast('ComfyUI', 'Tikrinama ComfyUI istorija...', 'info');
        try {
            const res = await fetch('/api/audio/bgm/check_latest_comfy', { method: 'POST' });
            if (!res.ok) {
                const errJson = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
                throw new Error(errJson.detail || 'Nepavyko rasti takelio');
            }
            const data = await res.json();
            if (data.status === 'success' && data.track) {
                lastGeneratedTrack = data.track;
                displayGeneratedResult(data.track);
                showToast('Sėkmė', `Paskutinis sugeneruotas takelis "${data.track.name}" (${data.track.duration}s) sėkmingai prijungtas!`, 'success');
                const statusCard = document.getElementById('mmGenStatusCard');
                if (statusCard) statusCard.classList.add('hidden');
            }
        } catch (err) {
            showToast('Klaida', err.message, 'error');
        }
    };

    // 7. DISPLAY RESULT & AUDIO PREVIEW
    function displayGeneratedResult(track) {
        const resultCard = document.getElementById('mmGenResultCard');
        const titleEl = document.getElementById('mmResultTrackTitle');
        const durEl = document.getElementById('mmResultTrackDuration');
        const audioPlayer = document.getElementById('mmResultAudioPlayer');

        if (titleEl) titleEl.textContent = track.name || 'MiniMax Soundtrack';
        if (durEl) durEl.textContent = `⏱️ ${track.duration || 0}s • Seed: ${track.seed || '-'}`;
        if (audioPlayer) {
            audioPlayer.src = track.url;
            audioPlayer.load();
            audioPlayer.play().catch(() => {});
            previewAudioPlayer = audioPlayer;
        }

        if (resultCard) resultCard.classList.remove('hidden');
    }

    // 8. APPLY GENERATED TRACK DIRECTLY TO PROJECT
    window.applyGeneratedMusicToProject = function() {
        if (!lastGeneratedTrack) {
            showToast('Klaida', 'Pirmiausia sugeneruokite muzikos takelį!', 'error');
            return;
        }

        const proj = typeof window.getProj === 'function' ? window.getProj() : (window.proj || {});
        if (!proj) return;

        // Priskiriame URL projektui
        proj.bgmTrack = lastGeneratedTrack.url;
        if (!proj.renderSettings) proj.renderSettings = {};
        proj.renderSettings.bgmTrack = lastGeneratedTrack.url;
        proj.renderSettings.bgmVolume = proj.renderSettings.bgmVolume || 15;
        proj.renderSettings.bgmLoop = true;

        if (!proj.bgmSettings) proj.bgmSettings = {};
        proj.bgmSettings.url = lastGeneratedTrack.url;
        proj.bgmSettings.name = lastGeneratedTrack.name;
        proj.bgmSettings.loop = true;
        proj.bgmSettings.trackStart = 0;
        proj.bgmSettings.trackEnd = lastGeneratedTrack.duration;

        // Atnaujiname UI elementus
        const bgmNameEl = document.getElementById('bgmFileName');
        if (bgmNameEl) {
            bgmNameEl.textContent = lastGeneratedTrack.name;
            bgmNameEl.title = lastGeneratedTrack.name;
        }
        const chipBgm = document.getElementById('chipBgmVal');
        if (chipBgm) chipBgm.textContent = lastGeneratedTrack.name;

        // Išsaugome projektą
        if (typeof window.saveProj === 'function') {
            window.saveProj();
        }

        // Jei atidaryta BGM studija, atnaujiname jos biblioteką
        if (typeof window.loadBgmLibrary === 'function') {
            window.loadBgmLibrary();
        }

        showToast('Foninė Muzika', `Takelis "${lastGeneratedTrack.name}" sėkmingai nustatytas šiam video!`, 'success');
        window.closeMiniMaxAiMusicGeneratorModal();
    };

    // 9. QUICK REGENERATE WITH RANDOM SEED
    window.regenerateMiniMaxWithNewSeed = function() {
        const seedInput = document.getElementById('mmSeedInput');
        if (seedInput) {
            seedInput.value = Math.floor(Math.random() * 900000000000) + 100000000000;
        }
        window.startMiniMaxMusicGeneration();
    };

})();
