// ============================================================================

// 9. VIDEO STUDIO & RENDER ENGINE - render.js

// ============================================================================



(function() {



    let currentBgmFile = null;



    const fxNames = {

        camera: {

            'constant_speed': '⚡ Constant Uniform Zoom',

            'constant_speed_out': '⚡ Constant Uniform Zoom-Out',

            'cinematic': '🎯 Cinematic Zoom In',

            'zoom_out': '🔍 Center Zoom Out',

            'zoom_in_out': '🔄 Center Pulse',

            'pan_left': '⬅️ Pan Left',

            'pan_right': '➡️ Pan Right',

            'pan_up': '⬆️ Pan Up',

            'pan_down': '⬇️ Pan Down',

            'drift': '💫 Cinematic Drift',

            'random': '🌀 Random Smart Motion',

            'disabled': '🚫 Static Frame'

        },

        transition: {

            'cut': '✂️ Direct Cut',

            'dissolve': '🌊 Cross Dissolve',

            'fade_black': '🌑 Fade to Black',

            'fade_white': '⚪ Fade to White',

            'slide_left': '⬅️ Slide Left',

            'slide_right': '➡️ Slide Right',

            'smooth_left': '💨 Smooth Slide Left',

            'wipe_left': '🪟 Wipe Left',

            'circle_crop': '⭕ Circle Iris Crop',

            'radial': '🕒 Radial Clock Wipe',

            'zoom_in': '🔭 Zoom In Push',

            'pixelize': '👾 Pixelize Mosaic'

        },

        color: {

            'none': 'Original (AI)',

            'teal_orange': 'Teal & Orange',

            'vintage': 'Vintage 35mm Film',

            'bw_contrast': 'Noir High-Contrast B&W',

            'golden_hour': 'Warm Golden Hour',

            'cyberpunk': 'Cyberpunk Neon',

            'cold_blue': 'Cold Matrix Blue',

            'vivid_hdr': 'Vivid HDR Boost'

        },

        subtitle: {

            'none': 'Clean (No Subtitles)',

            'tiktok_karaoke': '🔥 TikTok Karaoke',

            'tiktok_green': '⚡ TikTok Mint Green',

            'tiktok_pill': '🎬 TikTok Pill',

            'whisper_yellow': 'Whisper Yellow',

            'whisper_box': 'Whisper Box',

            'whisper_neon': 'Whisper Neon Cyan',

            'kinetic_titles': 'Kinetic Typo Cards'

        }

    };



    function updateStudioCockpitChips() {

        const kbSelect = document.getElementById('renderKenBurnsSelect');

        const kbInput = document.getElementById('renderKenBurnsInput');

        const trSelect = document.getElementById('renderTransitionSelect');

        const trInput = document.getElementById('renderTransitionDurInput');

        const colSelect = document.getElementById('renderColorFilterSelect');

        const subSelect = document.getElementById('renderSubtitleModeSelect');



        const chipKbVal = document.getElementById('chipCameraVal');

        const chipKbBadge = document.getElementById('chipCameraBadge');

        const chipTrVal = document.getElementById('chipTransitionVal');

        const chipTrBadge = document.getElementById('chipTransitionBadge');

        const chipColVal = document.getElementById('chipColorVal');

        const chipSubVal = document.getElementById('chipSubtitleVal');



        const kbVal = kbSelect ? kbSelect.value : 'constant_speed';

        const kbIntensity = kbInput ? kbInput.value : '15';

        const trVal = trSelect ? trSelect.value : 'dissolve';

        const trDur = trInput ? parseFloat(trInput.value).toFixed(1) : '0.6';

        const colVal = colSelect ? colSelect.value : 'none';

        const subVal = subSelect ? subSelect.value : 'none';



        if (chipKbVal) chipKbVal.textContent = fxNames.camera[kbVal] || kbVal;

        if (chipKbBadge) chipKbBadge.textContent = `${kbIntensity}%`;

        if (chipTrVal) chipTrVal.textContent = fxNames.transition[trVal] || trVal;

        if (chipTrBadge) chipTrBadge.textContent = `${trDur}s`;

        if (chipColVal) chipColVal.textContent = fxNames.color[colVal] || colVal;

        if (chipSubVal) chipSubVal.textContent = fxNames.subtitle[subVal] || subVal;



        // Also update modal sidebar tags and inputs

        const sbKbTag = document.getElementById('fxSidebarCameraModeTag');

        const sbTrTag = document.getElementById('fxSidebarTransitionTag');

        const sbColTag = document.getElementById('fxSidebarColorTag');

        const sbSubTag = document.getElementById('fxSidebarSubtitleTag');

        const mKbInput = document.getElementById('modalKenBurnsInput');

        const mKbVal = document.getElementById('modalKenBurnsVal');

        const mTrInput = document.getElementById('modalTransitionDurInput');

        const mTrVal = document.getElementById('modalTransitionDurVal');

        const mZmSelect = document.getElementById('modalZoomModeSelect');

        const zmSelect = document.getElementById('renderZoomModeSelect');



        if (sbKbTag) sbKbTag.textContent = fxNames.camera[kbVal] || kbVal;

        if (sbTrTag) sbTrTag.textContent = fxNames.transition[trVal] || trVal;

        if (sbColTag) sbColTag.textContent = fxNames.color[colVal] || colVal;

        if (sbSubTag) sbSubTag.textContent = fxNames.subtitle[subVal] || subVal;



        if (mKbInput && kbInput) {

            mKbInput.value = kbInput.value;

            if (mKbVal) mKbVal.textContent = `${kbInput.value}%`;

        }

        if (mTrInput && trInput) {

            mTrInput.value = trInput.value;

            if (mTrVal) mTrVal.textContent = `${trDur}s`;

        }

        if (mZmSelect && zmSelect) {

            mZmSelect.value = zmSelect.value;

        }

        const mCamVid = document.getElementById('modalCameraOnVideo');

        if (mCamVid && proj && proj.renderSettings && proj.renderSettings.cameraOnVideo !== undefined) {

            mCamVid.checked = Boolean(proj.renderSettings.cameraOnVideo);

        }

    }



    window.renderRenderStudioUI = async function() {

        try {

            initRenderControlListeners();

            let proj = typeof window.getProj === 'function' ? window.getProj() : null;

            if (!proj) return;



            // If scenes are empty, try to reload from server (race condition fix)

            if (!proj.scenes || proj.scenes.length === 0) {

                if (typeof window.loadAllProjectsFromDB === 'function') {

                    await window.loadAllProjectsFromDB();

                    proj = typeof window.getProj === 'function' ? window.getProj() : null;

                }

            }



            const countEl = document.getElementById('renderSceneCount');

            const durEl = document.getElementById('renderEstDuration');

            const audioEl = document.getElementById('renderAudioStatus');



            const scenes = proj ? (proj.scenes || []) : [];

            if (countEl) countEl.textContent = `${scenes.length} scenų`;



            const placeholderNote = document.getElementById('renderPlaceholderNote');

            if (placeholderNote) {

                if (scenes.length === 0) {

                    placeholderNote.innerHTML = `<span style="color: #f59e0b; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3); padding: 6px 12px; border-radius: 8px; display: inline-block; font-size: 11.5px;">ℹ️ Šiame projekte dar nėra scenų. Pirmiausia įveskite scenas <strong>2. Scene Matrixje</strong> arba viršuje paspauskite <strong>🎯 Demo Showcase</strong>.</span>`;

                } else {

                    placeholderNote.innerHTML = `<span style="color: #00ffcc; background: rgba(0,255,204,0.08); border: 1px solid rgba(0,255,204,0.25); padding: 6px 12px; border-radius: 8px; display: inline-block; font-size: 11.5px;">✅ Paruošta: projekte yra <strong>${scenes.length} scenos</strong>. Pasirinkite efektus kairėje ir spauskite <strong>„Renderinti Pilną Video“</strong>.</span>`;

                }

            }



            let totalDurationSec = 0;



            const timeline = proj ? (proj.timeline || proj.scenesTimeline || []) : [];

            if (timeline.length > 0) {

                timeline.forEach(st => {

                    totalDurationSec += (parseFloat(st.dur || st.duration) || 4.0);

                });

            } else {

                totalDurationSec = scenes.length * 4.0;

            }



            if (durEl) {

                const mins = Math.floor(totalDurationSec / 60);

                const secs = (totalDurationSec % 60).toFixed(1);

                durEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(4, '0')}`;

            }



            if (audioEl) {

                if (proj && proj.audioTrack) {

                    const trackName = proj.audioTrack.split('/').pop();

                    audioEl.textContent = `✅ Voiceover prijungtas (${trackName})`;

                    audioEl.style.color = "#00ffcc";

                } else if (timeline.length > 0) {

                    audioEl.textContent = "✅ WhisperX Timeline sulygiuota";

                    audioEl.style.color = "#00ffcc";

                } else {

                    audioEl.textContent = "⚠️ Default (4s/scene)";

                    audioEl.style.color = "var(--muted)";

                }

            }



            // Restore render settings from project

            const rs = proj.renderSettings || {};

            const voiceSourceEl = document.getElementById('renderVoiceSourceSelect');

            if (voiceSourceEl) {

                voiceSourceEl.value = rs.voiceSource || 'master';

                const updateVoiceSourceBadge = () => {

                    const badge = document.getElementById('renderVoiceSourceBadge');

                    if (badge) {

                        if (voiceSourceEl.value === 'master') {

                            badge.textContent = 'Unified Master Track';

                            badge.style.color = '#c084fc';

                        } else if (voiceSourceEl.value === 'video') {

                            badge.textContent = 'Iš video';

                            badge.style.color = '#38bdf8';

                        } else {

                            badge.textContent = 'Auto hibridas';

                            badge.style.color = '#34d399';

                        }

                    }

                };

                updateVoiceSourceBadge();

                voiceSourceEl.onchange = () => {

                    if (!proj.renderSettings) proj.renderSettings = {};

                    proj.renderSettings.voiceSource = voiceSourceEl.value;

                    updateVoiceSourceBadge();

                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

                };

            }

            if (rs.resolution && document.getElementById('renderResSelect')) document.getElementById('renderResSelect').value = rs.resolution;

            if (rs.fpsCodec && document.getElementById('renderFpsCodecSelect')) document.getElementById('renderFpsCodecSelect').value = rs.fpsCodec;

            if (rs.kenBurnsMode && document.getElementById('renderKenBurnsSelect')) document.getElementById('renderKenBurnsSelect').value = rs.kenBurnsMode;

            if (rs.kenBurnsIntensity !== undefined && document.getElementById('renderKenBurnsInput')) {

                document.getElementById('renderKenBurnsInput').value = rs.kenBurnsIntensity;

                if (document.getElementById('renderKenBurnsVal')) document.getElementById('renderKenBurnsVal').textContent = `${rs.kenBurnsIntensity}%`;

            }

            if (rs.transitionMode && document.getElementById('renderTransitionSelect')) document.getElementById('renderTransitionSelect').value = rs.transitionMode;

            if (rs.transitionDur !== undefined && document.getElementById('renderTransitionDurInput')) {

                document.getElementById('renderTransitionDurInput').value = rs.transitionDur;

                if (document.getElementById('renderTransitionDurVal')) document.getElementById('renderTransitionDurVal').textContent = `${parseFloat(rs.transitionDur).toFixed(1)}s`;

            }

            if (rs.colorFilter && document.getElementById('renderColorFilterSelect')) document.getElementById('renderColorFilterSelect').value = rs.colorFilter;

            if (rs.zoomMode && document.getElementById('renderZoomModeSelect')) document.getElementById('renderZoomModeSelect').value = rs.zoomMode;

            if (rs.engine && document.getElementById('renderEngineSelect')) document.getElementById('renderEngineSelect').value = rs.engine;

            if (rs.subtitleMode && document.getElementById('renderSubtitleModeSelect')) document.getElementById('renderSubtitleModeSelect').value = rs.subtitleMode;

            const effectiveBgmVol = (rs.bgmVolume !== undefined) ? rs.bgmVolume : (proj.bgmSettings && proj.bgmSettings.volume !== undefined ? proj.bgmSettings.volume : 15);

            if (document.getElementById('renderBgmVolInput')) document.getElementById('renderBgmVolInput').value = effectiveBgmVol;

            if (document.getElementById('renderBgmVolVal')) document.getElementById('renderBgmVolVal').textContent = `${effectiveBgmVol}%`;

            

            if (rs.masterVideoVolume !== undefined && document.getElementById('renderMasterVideoVolInput')) {

                const mVol = Math.round(rs.masterVideoVolume * 100);

                document.getElementById('renderMasterVideoVolInput').value = mVol;

                if (document.getElementById('renderMasterVideoVolVal')) document.getElementById('renderMasterVideoVolVal').textContent = `${mVol}%`;

            }

            const activeBgm = (proj && proj.bgmTrack) || (rs && rs.bgmTrack);

            const bgmFileNameEl = document.getElementById('bgmFileName');

            if (bgmFileNameEl) {

                if (activeBgm) {

                    const cleanBgmName = activeBgm.split('/').pop().split('?')[0];

                    bgmFileNameEl.textContent = cleanBgmName;

                    bgmFileNameEl.title = cleanBgmName;

                } else {

                    bgmFileNameEl.textContent = "No track selected";

                    bgmFileNameEl.title = "";

                }

            }



            updateStudioCockpitChips();

            renderSequenceStoryboard();

        } catch (err) {

            console.error("renderRenderStudioUI error:", err);

        }

    };



    let activeStoryboardSceneIdx = 0;

    let isQuickPlaying = false;

    let quickPlayTimer = null;



    function makePlaceholderSvgUrl(title, subtitle) {

        const safeTitle = (title || '').replace(/[<>&"]/g, '');

        const safeSub = (subtitle || '').replace(/[<>&"]/g, '');

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">

            <defs>

                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">

                    <stop offset="0%" stop-color="#0e1322"/>

                    <stop offset="100%" stop-color="#05070d"/>

                </linearGradient>

            </defs>

            <rect width="960" height="540" fill="url(#bgGrad)"/>

            <rect x="24" y="24" width="912" height="492" rx="14" fill="none" stroke="rgba(0,255,204,0.18)" stroke-width="2"/>

            <circle cx="480" cy="220" r="54" fill="rgba(0,255,204,0.06)" stroke="rgba(0,255,204,0.35)" stroke-width="2"/>

            <polygon points="468,198 468,242 505,220" fill="#00ffcc"/>

            <text x="50%" y="325" fill="#ffffff" font-size="28" font-weight="bold" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${safeTitle}</text>

            <text x="50%" y="370" fill="#94a3b8" font-size="18" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif">${safeSub}</text>

        </svg>`;

        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

    }



    function renderSequenceStoryboard() {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        const scenes = proj ? (proj.scenes || []) : [];

        const strip = document.getElementById('renderSequenceFilmstrip');

        const badge = document.getElementById('renderFilmstripCountBadge');

        const placeholder = document.getElementById('renderPlaceholder');

        const monitor = document.getElementById('renderStoryboardMonitor');

        const player = document.getElementById('finalRenderVideoPlayer');

        const btnToggleView = document.getElementById('btnToggleStoryboardView');



        if (badge) badge.textContent = `${scenes.length} kadrų`;

        if (!strip) return;

        strip.innerHTML = '';



        if (scenes.length === 0) {

            if (placeholder) placeholder.classList.remove('hidden');

            if (monitor) monitor.classList.add('hidden');

            if (player) player.classList.add('hidden');

            if (btnToggleView) btnToggleView.classList.add('hidden');

            strip.innerHTML = '<span class="text-muted text-xs" style="padding: 10px;">Projekte dar nėra sukurtų kadrų filmstripui.</span>';

            return;

        }



        // Check if a final video player has a rendered video

        const hasRenderedVideo = Boolean(proj && proj.renderedVideoUrl);

        const topDlBtn = document.getElementById('btnDownloadRenderedMp4Top');

        const downloadArea = document.getElementById('renderDownloadActionArea');

        const downloadBtn = document.getElementById('btnDownloadRenderedMp4');



        if (hasRenderedVideo) {

            const vUrl = proj.renderedVideoUrl;

            if (btnToggleView) btnToggleView.classList.remove('hidden');

            if (player) {

                if (player.src !== vUrl && !player.src.endsWith(vUrl)) {

                    player.src = vUrl;

                }

                player.classList.remove('hidden');

            }

            if (monitor) monitor.classList.add('hidden');

            if (placeholder) placeholder.classList.add('hidden');

            if (topDlBtn && vUrl) {

                topDlBtn.href = vUrl;

                topDlBtn.classList.remove('hidden');

            }

            if (downloadArea && downloadBtn && vUrl) {

                downloadArea.classList.remove('hidden');

                downloadBtn.href = vUrl;

            }

        } else {

            if (btnToggleView) btnToggleView.classList.add('hidden');

            if (player) {

                player.pause();

                player.removeAttribute('src');

                player.load();

                player.classList.add('hidden');

            }

            if (placeholder) placeholder.classList.add('hidden');

            if (monitor) monitor.classList.remove('hidden');

            if (topDlBtn) {

                topDlBtn.classList.add('hidden');

                topDlBtn.href = '#';

            }

            if (downloadArea) downloadArea.classList.add('hidden');

            if (downloadBtn) downloadBtn.href = '#';

        }



        const timeline = proj.timeline || proj.scenesTimeline || [];

        const outputs = proj.outputs || [];



        scenes.forEach((sc, idx) => {

            const scIdStr = String(sc.id || '').trim().toLowerCase();

            const scNormId = scIdStr.replace(/^s/i, '');

            const out = outputs.find(o => {

                const oIdStr = String(o.sceneId || '').trim().toLowerCase();

                const oNormId = oIdStr.replace(/^s/i, '');

                return oIdStr === scIdStr || oNormId === scNormId;

            });

            const mainVar = out && out.variations ? (out.variations.find(v => v.id === out.mainId) || out.variations[0]) : null;

            const isKinetic = typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc);

            const tl = timeline.find(t => {

                const tIdStr = String(t.sceneId || t.id || '').trim().toLowerCase();

                const tNormId = tIdStr.replace(/^s/i, '');

                return tIdStr === scIdStr || tNormId === scNormId;

            });

            const durSec = tl ? (parseFloat(tl.dur || tl.duration) || 4.0) : 4.0;

            let imgSrc = mainVar ? (mainVar.localUrl || mainVar.url || (mainVar.filename ? `/vault/${mainVar.filename}` : '')) : '';

            if (!imgSrc && sc.image) imgSrc = sc.image;



            const card = document.createElement('div');

            card.className = `filmstrip-card ${idx === activeStoryboardSceneIdx ? 'active' : ''}`;

            card.setAttribute('draggable', 'false');

            card.style.cssText = `

                flex: 0 0 auto; width: 105px; height: 70px; border-radius: 6px;

                border: 2px solid ${idx === activeStoryboardSceneIdx ? 'var(--accent-secondary, #00ffcc)' : 'rgba(255,255,255,0.12)'};

                background: #090b14; position: relative; cursor: pointer; overflow: hidden;

                display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease;

                user-select: none; -webkit-user-select: none; -webkit-user-drag: none;

            `;



            let innerThumb = '';

            const fallbackCardSvg = makePlaceholderSvgUrl(`#${sc.id}`, `${durSec.toFixed(1)}s`);

            const isVid = (mainVar && (mainVar.type === 'video' || mainVar.isVideo)) ||

                          (imgSrc && (imgSrc.toLowerCase().includes('.mp4') || imgSrc.toLowerCase().includes('.webm')));

            let posterUrl = '';

            if (isVid && out && out.variations) {

                if (mainVar && mainVar.sourceVarId) {

                    const srcV = out.variations.find(v => v.id === mainVar.sourceVarId);

                    if (srcV && srcV.url && !srcV.url.toLowerCase().endsWith('.mp4') && !srcV.url.toLowerCase().endsWith('.webm')) {

                        posterUrl = srcV.url;

                    }

                }

                if (!posterUrl) {

                    const anyImg = out.variations.find(v => v.url && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm'));

                    if (anyImg) posterUrl = anyImg.url;

                }

            }



            if (imgSrc) {

                if (isVid) {

                    if (posterUrl) {

                        innerThumb = `<img src="${posterUrl}" draggable="false" onerror="this.onerror=null; this.src='${fallbackCardSvg}';" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.85; pointer-events: none;" /><span style="position: absolute; top: 18px; right: 4px; font-size: 10px; z-index: 3;">🎬</span>`;

                    } else {

                        innerThumb = `<video src="${imgSrc}#t=0.1" preload="metadata" muted playsinline style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.85; pointer-events: none;"></video><span style="position: absolute; top: 18px; right: 4px; font-size: 10px; z-index: 3;">🎬</span>`;

                    }

                } else {

                    innerThumb = `<img src="${imgSrc}" draggable="false" onerror="this.onerror=null; this.src='${fallbackCardSvg}';" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.85; pointer-events: none; -webkit-user-drag: none;" />`;

                }

            } else if (isKinetic) {

                innerThumb = `<div style="position: absolute; inset: 0; background: radial-gradient(circle, #1a2035 0%, #05070d 100%); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; color: #00ffcc; text-align: center; padding: 4px; pointer-events: none;">✍️ TITRAS</div>`;

            } else {

                innerThumb = `<div style="position: absolute; inset: 0; background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; font-size: 11px; color: var(--muted); font-weight: 700; pointer-events: none;">#${sc.id}</div>`;

            }



            card.innerHTML = `

                ${innerThumb}

                <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; padding: 2px 4px; background: rgba(0,0,0,0.68); backdrop-filter: blur(4px); pointer-events: none;">

                    <span style="font-weight: 800; font-size: 9px; color: #fff;">#${sc.id}</span>

                    <span style="font-size: 8px; color: #38bdf8; font-weight: 700;">${durSec.toFixed(1)}s</span>

                </div>

                <div style="position: relative; z-index: 2; padding: 2px 4px; background: rgba(0,0,0,0.65); display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #cbd5e1; pointer-events: none;">

                    <span style="max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(sc.prompt || '').substring(0, 15)}</span>

                    <span>${idx < scenes.length - 1 ? '🌊' : '🏁'}</span>

                </div>

            `;



            card.addEventListener('dragstart', (e) => e.preventDefault());

            card.onclick = () => {

                selectStoryboardScene(idx, true);

            };



            strip.appendChild(card);

        });



        strip.addEventListener('dragstart', (e) => e.preventDefault());



        // Update monitor display for current selected scene

        selectStoryboardScene(activeStoryboardSceneIdx, false);

    }



    function selectStoryboardScene(idx, isUserClick = false) {

        try {

            const proj = typeof window.getProj === 'function' ? window.getProj() : null;

            const scenes = proj ? (proj.scenes || []) : [];

            if (scenes.length === 0) return;

            if (idx < 0 || idx >= scenes.length) idx = 0;

            activeStoryboardSceneIdx = idx;



            const sc = scenes[idx];

            if (!sc) return;



            const placeholder = document.getElementById('renderPlaceholder');

            const monitor = document.getElementById('renderStoryboardMonitor');

            const player = document.getElementById('finalRenderVideoPlayer');

            const downloadArea = document.getElementById('renderDownloadActionArea');

            const hasRendered = Boolean(proj && proj.renderedVideoUrl);



            if (isUserClick || !hasRendered) {

                if (placeholder) placeholder.classList.add('hidden');

                if (monitor) monitor.classList.remove('hidden');

                if (player) player.classList.add('hidden');

                if (downloadArea && !hasRendered) downloadArea.classList.add('hidden');

            }



            const outputs = proj.outputs || [];

            const scIdStr = String(sc.id || '').trim().toLowerCase();

            const scNormId = scIdStr.replace(/^s/i, '');

            const out = outputs.find(o => {

                const oIdStr = String(o.sceneId || '').trim().toLowerCase();

                const oNormId = oIdStr.replace(/^s/i, '');

                return oIdStr === scIdStr || oNormId === scNormId;

            });

            const mainVar = out && out.variations ? (out.variations.find(v => v.id === out.mainId) || out.variations[0]) : null;

            const isKinetic = typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc);

            const timeline = proj.timeline || proj.scenesTimeline || [];

            const tl = timeline.find(t => {

                const tIdStr = String(t.sceneId || t.id || '').trim().toLowerCase();

                const tNormId = tIdStr.replace(/^s/i, '');

                return tIdStr === scIdStr || tNormId === scNormId;

            });

            const durSec = tl ? (parseFloat(tl.dur || tl.duration) || 4.0) : 4.0;

            let imgSrc = mainVar ? (mainVar.localUrl || mainVar.url || (mainVar.filename ? `/vault/${mainVar.filename}` : '')) : '';

            if (!imgSrc && sc.image) imgSrc = sc.image;



            const monitorImg = document.getElementById('renderMonitorImg');

            const monitorSceneId = document.getElementById('renderMonitorSceneId');

            const monitorPrompt = document.getElementById('renderMonitorPrompt');

            const monitorTiming = document.getElementById('renderMonitorTiming');



            if (monitorSceneId) monitorSceneId.textContent = `#${sc.id} (${idx + 1}/${scenes.length})`;

            if (monitorPrompt) monitorPrompt.textContent = isKinetic ? `[Kinetic Title] ${sc.text || sc.prompt || ''}` : (sc.prompt || '-');

            if (monitorTiming) monitorTiming.textContent = `⏱️ ${durSec.toFixed(1)}s`;



            const monitorVideo = document.getElementById('renderMonitorVideo');

            const isVidScene = (mainVar && (mainVar.type === 'video' || mainVar.isVideo)) ||

                              (imgSrc && (imgSrc.toLowerCase().includes('.mp4') || imgSrc.toLowerCase().includes('.webm')));

            const fallbackSvg = makePlaceholderSvgUrl(isKinetic ? 'KINETINIS TITRAS' : `SCENA #${sc.id}`, `Trukme: ${durSec.toFixed(1)}s • Paruosta generavimui`);



            if (imgSrc) {

                if (isVidScene) {

                    if (monitorImg) {

                        monitorImg.style.display = 'none';

                        monitorImg.removeAttribute('src');

                    }

                    if (monitorVideo) {

                        monitorVideo.style.display = 'block';

                        monitorVideo.muted = true;

                        if (monitorVideo.src !== imgSrc && !monitorVideo.src.endsWith(imgSrc)) {

                            monitorVideo.src = imgSrc;

                        }

                        monitorVideo.play().catch(()=>{});

                    }

                } else {

                    if (monitorVideo) {

                        monitorVideo.pause();

                        monitorVideo.src = '';

                        monitorVideo.style.display = 'none';

                    }

                    if (monitorImg) {

                        monitorImg.style.display = 'block';

                        monitorImg.src = imgSrc;

                        monitorImg.onerror = function() {

                            this.onerror = null;

                            this.src = fallbackSvg;

                        };

                    }

                }

            } else {

                if (monitorVideo) {

                    monitorVideo.pause();

                    monitorVideo.src = '';

                    monitorVideo.style.display = 'none';

                }

                if (monitorImg) {

                    monitorImg.style.display = 'block';

                    monitorImg.src = fallbackSvg;

                }

            }



            // Highlight active filmstrip card

            const strip = document.getElementById('renderSequenceFilmstrip');

            if (strip) {

                const cards = strip.querySelectorAll('.filmstrip-card');

                cards.forEach((c, i) => {

                    if (i === idx) {

                        c.style.borderColor = 'var(--accent-secondary, #00ffcc)';

                        c.classList.add('active');

                        c.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });

                    } else {

                        c.style.borderColor = 'rgba(255,255,255,0.12)';

                        c.classList.remove('active');

                    }

                });

            }

        } catch (err) {

            console.error("selectStoryboardScene error:", err);

        }

    }



    function toggleQuickStoryboardPlay() {

        const btn = document.getElementById('btnQuickStoryboardPlay');

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        const scenes = proj ? (proj.scenes || []) : [];

        if (scenes.length === 0) {

            if (typeof toast === 'function') toast("No Scenes", "Nėra scenų peržiūrai!", "info");

            return;

        }



        if (isQuickPlaying) {

            isQuickPlaying = false;

            if (quickPlayTimer) clearTimeout(quickPlayTimer);

            if (btn) {

                btn.innerHTML = '▶️ Quick Preview';

                btn.className = 'btn text-xs primary';

            }

            return;

        }



        isQuickPlaying = true;

        if (btn) {

            btn.innerHTML = '⏹️ Sustabdyti';

            btn.className = 'btn text-xs bad';

        }



        let curIdx = activeStoryboardSceneIdx >= scenes.length - 1 ? 0 : activeStoryboardSceneIdx;

        function playStep() {

            if (!isQuickPlaying) return;

            selectStoryboardScene(curIdx);

            const sc = scenes[curIdx];

            const timeline = proj.timeline || proj.scenesTimeline || [];

            const tl = timeline.find(t => t.sceneId === sc.id);

            const durSec = tl ? (parseFloat(tl.dur || tl.duration) || 4.0) : 4.0;



            curIdx++;

            if (curIdx >= scenes.length) {

                quickPlayTimer = setTimeout(() => {

                    isQuickPlaying = false;

                    if (btn) {

                        btn.innerHTML = '▶️ Quick Preview';

                        btn.className = 'btn text-xs primary';

                    }

                    selectStoryboardScene(0);

                }, durSec * 1000);

            } else {

                quickPlayTimer = setTimeout(playStep, durSec * 1000);

            }

        }

        playStep();

    }



    function saveRenderSettingsToProj() {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        if (!proj) return;

        if (!proj.renderSettings) proj.renderSettings = {};

        

        if (document.getElementById('renderResSelect')) proj.renderSettings.resolution = document.getElementById('renderResSelect').value;

        if (document.getElementById('renderFpsCodecSelect')) proj.renderSettings.fpsCodec = document.getElementById('renderFpsCodecSelect').value;

        if (document.getElementById('renderKenBurnsSelect')) proj.renderSettings.kenBurnsMode = document.getElementById('renderKenBurnsSelect').value;

        if (document.getElementById('renderKenBurnsInput')) proj.renderSettings.kenBurnsIntensity = parseInt(document.getElementById('renderKenBurnsInput').value) || 15;

        if (document.getElementById('renderTransitionSelect')) proj.renderSettings.transitionMode = document.getElementById('renderTransitionSelect').value;

        if (document.getElementById('renderTransitionDurInput')) proj.renderSettings.transitionDur = parseFloat(document.getElementById('renderTransitionDurInput').value) || 0.6;

        if (document.getElementById('renderColorFilterSelect')) proj.renderSettings.colorFilter = document.getElementById('renderColorFilterSelect').value;

        if (document.getElementById('renderZoomModeSelect')) proj.renderSettings.zoomMode = document.getElementById('renderZoomModeSelect').value;

        if (document.getElementById('modalCameraOnVideo')) proj.renderSettings.cameraOnVideo = document.getElementById('modalCameraOnVideo').checked;

        if (document.getElementById('renderEngineSelect')) proj.renderSettings.engine = document.getElementById('renderEngineSelect').value;

        if (document.getElementById('renderSubtitleModeSelect')) proj.renderSettings.subtitleMode = document.getElementById('renderSubtitleModeSelect').value;

        if (document.getElementById('renderBgmVolInput')) {

            const bVol = parseInt(document.getElementById('renderBgmVolInput').value) || 15;

            proj.renderSettings.bgmVolume = bVol;

            if (!proj.bgmSettings) proj.bgmSettings = {};

            proj.bgmSettings.volume = bVol;

        } else if (proj.bgmSettings && proj.bgmSettings.volume !== undefined) {

            proj.renderSettings.bgmVolume = proj.bgmSettings.volume;

        }

        if (document.getElementById('renderMasterVideoVolInput')) proj.renderSettings.masterVideoVolume = (parseInt(document.getElementById('renderMasterVideoVolInput').value) || 100) / 100.0;

        if (proj.bgmTrack) proj.renderSettings.bgmTrack = proj.bgmTrack;

        

        updateStudioCockpitChips();

        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

    }



    function logToStudio(msg, type = "info") {

        const logBox = document.getElementById('renderLogOutput');

        if (!logBox) return;

        const timeStr = new Date().toLocaleTimeString();

        let prefix = `[${timeStr}] `;

        if (type === "error") prefix += "❌ KLAIDA: ";

        else if (type === "success") prefix += "✅ SUCCESS: ";

        else if (type === "cmd") prefix += "⚡ FFMPEG: ";



        logBox.innerHTML += `<div>${prefix}${escapeHtml(msg)}</div>`;

        logBox.scrollTop = logBox.scrollHeight;

    }



    let controlListenersAttached = false;

    let isRenderBusy = false;



    function initRenderControlListeners() {

        if (controlListenersAttached) return;

        controlListenersAttached = true;



        const selectIds = [

            'renderResSelect', 'renderFpsCodecSelect', 'renderKenBurnsSelect',

            'renderTransitionSelect', 'renderColorFilterSelect', 'renderZoomModeSelect',

            'renderEngineSelect', 'renderSubtitleModeSelect'

        ];

        selectIds.forEach(id => {

            const el = document.getElementById(id);

            if (el) el.addEventListener('change', saveRenderSettingsToProj);

        });



        const kbInput = document.getElementById('renderKenBurnsInput');

        const kbVal = document.getElementById('renderKenBurnsVal');

        if (kbInput && kbVal) {

            kbInput.addEventListener('input', (e) => {

                kbVal.textContent = `${e.target.value}%`;

                saveRenderSettingsToProj();

            });

        }



        const trDurInput = document.getElementById('renderTransitionDurInput');

        const trDurVal = document.getElementById('renderTransitionDurVal');

        if (trDurInput && trDurVal) {

            trDurInput.addEventListener('input', (e) => {

                trDurVal.textContent = `${parseFloat(e.target.value).toFixed(1)}s`;

                saveRenderSettingsToProj();

            });

        }



        const bgmInput = document.getElementById('renderBgmVolInput');

        const bgmVal = document.getElementById('renderBgmVolVal');

        if (bgmInput && bgmVal) {

            bgmInput.addEventListener('input', (e) => {

                bgmVal.textContent = `${e.target.value}%`;

                saveRenderSettingsToProj();

            });

        }



        const masterVolInput = document.getElementById('renderMasterVideoVolInput');

        const masterVolVal = document.getElementById('renderMasterVideoVolVal');

        if (masterVolInput && masterVolVal) {

            masterVolInput.addEventListener('input', (e) => {

                masterVolVal.textContent = `${e.target.value}%`;

                saveRenderSettingsToProj();

            });

        }



        const btnSelectBgm = document.getElementById('btnSelectBgm');

        const bgmFileInput = document.getElementById('bgmFileInput');

        const bgmFileName = document.getElementById('bgmFileName');



        if (btnSelectBgm && bgmFileInput) {

            btnSelectBgm.addEventListener('click', () => bgmFileInput.click());

            bgmFileInput.addEventListener('change', async (e) => {

                const file = e.target.files[0];

                if (!file) return;

                currentBgmFile = file;

                if (bgmFileName) bgmFileName.textContent = file.name;



                try {

                    logToStudio(`Įkeliama foninė muzika: ${file.name}...`, "info");

                    const fd = new FormData();

                    fd.append("file", file);

                    const res = await fetch('/api/audio/upload_track', { method: 'POST', body: fd });

                    const data = await res.json();

                    if (data.status === 'success') {

                        const bgmUrl = data.url || `/audio/${data.filename}`;

                        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

                        if (proj) {

                            proj.bgmTrack = bgmUrl;

                            if (!proj.renderSettings) proj.renderSettings = {};

                            proj.renderSettings.bgmTrack = bgmUrl;

                            saveRenderSettingsToProj();

                        }

                        logToStudio(`✅ Foninė muzika įkelta į serverį: ${file.name}`, "success");

                        if (typeof toast === 'function') toast("BGM Uploaded", `Foninė muzika ${file.name} įkelta ir išsaugota!`, "success");

                    }

                } catch (err) {

                    logToStudio(`Foninės muzikos įkėlimo klaida: ${err.message}`, "error");

                }

            });

        }



        const btnRender = document.getElementById('btnStartFinalRender');

        if (btnRender) {

            btnRender.addEventListener('click', startFinalVideoRender);

        }



        const btnClearLog = document.getElementById('btnClearRenderLog');

        if (btnClearLog) {

            btnClearLog.addEventListener('click', () => {

                const logBox = document.getElementById('renderLogOutput');

                if (logBox) logBox.innerHTML = '';

            });

        }



        const btnEffects = document.getElementById('btnOpenEffectsGallery');

        if (btnEffects) {

            btnEffects.addEventListener('click', () => {

                const modal = document.getElementById('modalEffectsLibrary');

                if (modal) {

                    syncModalCardSelections();

                    updateStudioCockpitChips();

                    modal.classList.add('show');

                }

            });

        }



        const btnDavinci = document.getElementById('btnExportDavinciPackage') || document.getElementById('btnExportDavinciXml');

        if (btnDavinci) {

            btnDavinci.onclick = exportDavinciResolvePackage;

        }



        const btnTopDavinci = document.getElementById('btnTopExportDavinci');

        if (btnTopDavinci) {

            btnTopDavinci.onclick = exportDavinciResolvePackage;

        }



        const btnQuickPlay = document.getElementById('btnQuickStoryboardPlay');

        if (btnQuickPlay) {

            btnQuickPlay.addEventListener('click', toggleQuickStoryboardPlay);

        }



        const btnToggleView = document.getElementById('btnToggleStoryboardView');

        if (btnToggleView) {

            btnToggleView.onclick = () => {

                const monitor = document.getElementById('renderStoryboardMonitor');

                const player = document.getElementById('finalRenderVideoPlayer');

                const downloadArea = document.getElementById('renderDownloadActionArea');

                if (monitor && player) {

                    if (monitor.classList.contains('hidden')) {

                        monitor.classList.remove('hidden');

                        player.classList.add('hidden');

                        if (downloadArea) downloadArea.classList.add('hidden');

                        btnToggleView.innerHTML = '🎬 Show Video';

                    } else {

                        monitor.classList.add('hidden');

                        player.classList.remove('hidden');

                        if (downloadArea) downloadArea.classList.remove('hidden');

                        btnToggleView.innerHTML = '🎞️ Show Storyboard';

                    }

                }

            };

        }



        initEffectsGalleryModal();

    }



    function syncModalCardSelections() {

        const modal = document.getElementById('modalEffectsLibrary');

        if (!modal) return;



        const currentKb = document.getElementById('renderKenBurnsSelect') ? document.getElementById('renderKenBurnsSelect').value : 'constant_speed';

        const currentTr = document.getElementById('renderTransitionSelect') ? document.getElementById('renderTransitionSelect').value : 'dissolve';

        const currentCol = document.getElementById('renderColorFilterSelect') ? document.getElementById('renderColorFilterSelect').value : 'none';

        const currentSub = document.getElementById('renderSubtitleModeSelect') ? document.getElementById('renderSubtitleModeSelect').value : 'none';



        modal.querySelectorAll('.fx-gallery-card').forEach(c => {

            const cat = c.dataset.category;

            const val = c.dataset.value;

            let isSelected = false;

            if (cat === 'camera' && val === currentKb) isSelected = true;

            else if (cat === 'transition' && val === currentTr) isSelected = true;

            else if (cat === 'color' && val === currentCol) isSelected = true;

            else if (cat === 'subtitle' && val === currentSub) isSelected = true;



            if (isSelected) {

                c.classList.add('selected');

            } else {

                c.classList.remove('selected');

            }

        });



        updateStudioCockpitChips();

    }



    window.openEffectsModalTab = function(tabId) {

        const modal = document.getElementById('modalEffectsLibrary');

        if (!modal) return;

        modal.classList.add('show');



        const tabBtns = modal.querySelectorAll('.fx-tab-btn');

        const tabContents = modal.querySelectorAll('.fx-tab-content');

        tabBtns.forEach(b => {

            if (b.dataset.fxtab === tabId) {

                b.classList.add('primary');

                b.style.fontWeight = '700';

            } else {

                b.classList.remove('primary');

                b.style.fontWeight = 'normal';

            }

        });

        tabContents.forEach(content => {

            if (content.id === tabId) {

                content.classList.remove('hidden');

            } else {

                content.classList.add('hidden');

            }

        });

    };



    function initEffectsGalleryModal() {

        const modal = document.getElementById('modalEffectsLibrary');

        if (!modal) return;



        const tabBtns = modal.querySelectorAll('.fx-tab-btn');

        const tabContents = modal.querySelectorAll('.fx-tab-content');



        tabBtns.forEach(btn => {

            btn.addEventListener('click', (e) => {

                e.preventDefault();

                const targetId = btn.dataset.fxtab;

                tabBtns.forEach(b => {

                    b.classList.remove('primary');

                    b.style.fontWeight = 'normal';

                });

                btn.classList.add('primary');

                btn.style.fontWeight = '700';



                tabContents.forEach(content => {

                    if (content.id === targetId) {

                        content.classList.remove('hidden');

                    } else {

                        content.classList.add('hidden');

                    }

                });

            });

        });



        // Search filtering inside modal

        const searchInput = document.getElementById('fxSearchInput');

        if (searchInput) {

            searchInput.addEventListener('input', (e) => {

                const term = e.target.value.toLowerCase().trim();

                modal.querySelectorAll('.fx-gallery-card').forEach(card => {

                    const text = card.textContent.toLowerCase();

                    const val = (card.dataset.value || '').toLowerCase();

                    if (!term || text.includes(term) || val.includes(term)) {

                        card.style.display = 'flex';

                    } else {

                        card.style.display = 'none';

                    }

                });

            });

        }



        // Modal Right Sidebar Inputs Syncing

        const mKbInput = document.getElementById('modalKenBurnsInput');

        const mKbVal = document.getElementById('modalKenBurnsVal');

        if (mKbInput) {

            mKbInput.addEventListener('input', (e) => {

                const val = e.target.value;

                if (mKbVal) mKbVal.textContent = `${val}%`;

                const rKbInput = document.getElementById('renderKenBurnsInput');

                if (rKbInput) rKbInput.value = val;

                const rKbVal = document.getElementById('renderKenBurnsVal');

                if (rKbVal) rKbVal.textContent = `${val}%`;

                saveRenderSettingsToProj();

            });

        }



        const mTrInput = document.getElementById('modalTransitionDurInput');

        const mTrVal = document.getElementById('modalTransitionDurVal');

        if (mTrInput) {

            mTrInput.addEventListener('input', (e) => {

                const val = parseFloat(e.target.value).toFixed(1);

                if (mTrVal) mTrVal.textContent = `${val}s`;

                const rTrInput = document.getElementById('renderTransitionDurInput');

                if (rTrInput) rTrInput.value = val;

                const rTrVal = document.getElementById('renderTransitionDurVal');

                if (rTrVal) rTrVal.textContent = `${val}s`;

                saveRenderSettingsToProj();

            });

        }



        const mZmSelect = document.getElementById('modalZoomModeSelect');

        if (mZmSelect) {

            mZmSelect.addEventListener('change', (e) => {

                const val = e.target.value;

                const rZmSelect = document.getElementById('renderZoomModeSelect');

                if (rZmSelect) rZmSelect.value = val;

                saveRenderSettingsToProj();

            });

        }

        const mCamVid = document.getElementById('modalCameraOnVideo');

        if (mCamVid) {

            mCamVid.addEventListener('change', () => {

                saveRenderSettingsToProj();

            });

        }



        // Reset FX Defaults Button

        const btnReset = document.getElementById('btnResetFxDefaults');

        if (btnReset) {

            btnReset.addEventListener('click', () => {

                if (document.getElementById('renderKenBurnsSelect')) document.getElementById('renderKenBurnsSelect').value = 'constant_speed';

                if (document.getElementById('renderKenBurnsInput')) document.getElementById('renderKenBurnsInput').value = 15;

                if (document.getElementById('renderTransitionSelect')) document.getElementById('renderTransitionSelect').value = 'dissolve';

                if (document.getElementById('renderTransitionDurInput')) document.getElementById('renderTransitionDurInput').value = 0.6;

                if (document.getElementById('renderColorFilterSelect')) document.getElementById('renderColorFilterSelect').value = 'none';

                if (document.getElementById('renderZoomModeSelect')) document.getElementById('renderZoomModeSelect').value = 'constant_speed';

                if (document.getElementById('renderSubtitleModeSelect')) document.getElementById('renderSubtitleModeSelect').value = 'none';



                syncModalCardSelections();

                saveRenderSettingsToProj();

                if (typeof toast === 'function') toast("Numatytieji Nustatymai", "Efektai atstatyti į rekomenduojamas pradines reikšmes.", "info");

            });

        }



        // Card Click Selection

        const cards = modal.querySelectorAll('.fx-gallery-card');

        cards.forEach(card => {

            card.addEventListener('click', () => {

                const cat = card.dataset.category;

                const val = card.dataset.value;

                const titleEl = card.querySelector('strong');

                const titleText = titleEl ? titleEl.textContent.trim() : val;



                if (cat === 'camera') {

                    const select = document.getElementById('renderKenBurnsSelect');

                    if (select) {

                        select.value = val;

                        select.dispatchEvent(new Event('change'));

                    }

                } else if (cat === 'transition') {

                    const select = document.getElementById('renderTransitionSelect');

                    if (select) {

                        select.value = val;

                        select.dispatchEvent(new Event('change'));

                    }

                } else if (cat === 'color') {

                    const select = document.getElementById('renderColorFilterSelect');

                    if (select) {

                        select.value = val;

                        select.dispatchEvent(new Event('change'));

                    }

                } else if (cat === 'subtitle') {

                    const select = document.getElementById('renderSubtitleModeSelect');

                    if (select) {

                        select.value = val;

                        select.dispatchEvent(new Event('change'));

                    }

                }



                modal.querySelectorAll(`.fx-gallery-card[data-category="${cat}"]`).forEach(c => {

                    c.classList.remove('selected');

                });

                card.classList.add('selected');



                const statusEl = document.getElementById('fxModalActiveStatus');

                if (statusEl) {

                    statusEl.textContent = `✅ Aktyvuota: ${titleText}`;

                }



                updateStudioCockpitChips();



                if (typeof toast === 'function') {

                    toast("Efektas Pritaikytas", `Pasirinkta: ${titleText}`, "success");

                }

            });

        });

    }



    async function startFinalVideoRender() {
        // --- ZERO-GPU DEMO SIMULATION HOOK ---
        if (window.isGlobalDemoMode && window.isGlobalDemoMode()) {
            if (isRenderBusy) return;
            isRenderBusy = true;
            const btn = document.getElementById('btnStartFinalRender');
            const progressArea = document.getElementById('renderProgressArea');
            const progressFill = document.getElementById('renderProgressFill');
            const progressStatus = document.getElementById('renderProgressStatus');
            const player = document.getElementById('finalRenderVideoPlayer');
            const placeholder = document.getElementById('renderPlaceholder');
            const monitor = document.getElementById('renderStoryboardMonitor');
            const downloadArea = document.getElementById('renderDownloadActionArea');
            const downloadBtn = document.getElementById('btnDownloadRenderedMp4');
            const topDlBtn = document.getElementById('btnDownloadRenderedMp4Top');
            const btnToggleView = document.getElementById('btnToggleStoryboardView');

            if (btn) btn.disabled = true;
            if (progressArea) progressArea.classList.remove('hidden');

            try {
                if (progressFill) progressFill.style.width = '15%';
                if (progressStatus) progressStatus.textContent = '⚡ [FFmpeg Pro] Initializing 1080p compositing pipeline (15%)...';
                logToStudio("FFmpeg Pro Studio v8.1.2 pipeline initialized (Lanczos 1080p, H.264 High Profile)", "cmd");
                await new Promise(r => setTimeout(r, 900));

                if (progressFill) progressFill.style.width = '42%';
                if (progressStatus) progressStatus.textContent = '🎬 Stitching 18 timeline scenes & 0.6s Cross Dissolves (42%)...';
                logToStudio("Compositing stickman timeline sequences: [s1 -> s18] with subpixel kinematics...", "info");
                await new Promise(r => setTimeout(r, 1100));

                if (progressFill) progressFill.style.width = '75%';
                if (progressStatus) progressStatus.textContent = '🎙️ Multiplexing diegetic Foley audio and master voiceover track (75%)...';
                logToStudio("Synchronizing 44.1kHz stereo audio streams with timeline scene boundaries...", "info");
                await new Promise(r => setTimeout(r, 950));

                if (progressFill) progressFill.style.width = '95%';
                if (progressStatus) progressStatus.textContent = '📦 Finalizing MP4 container and fast-start web streaming headers (95%)...';
                logToStudio("Writing faststart metadata atom to render_default_180a741a.mp4", "cmd");
                await new Promise(r => setTimeout(r, 650));

                const masterUrl = "/renders/render_default_180a741a.mp4";
                if (progressFill) progressFill.style.width = '100%';
                if (progressStatus) progressStatus.textContent = '✅ Master Video Render Complete (100%)!';
                logToStudio(`Master video export completed successfully: ${masterUrl}`, "success");

                if (placeholder) placeholder.classList.add('hidden');
                if (monitor) monitor.classList.add('hidden');

                if (player) {
                    player.src = masterUrl;
                    player.classList.remove('hidden');
                    const shouldAutoPlay = document.getElementById('renderAutoPlayCheckbox')?.checked !== false;
                    if (shouldAutoPlay) {
                        player.play().catch(()=>{});
                    }
                }
                if (proj) {
                    proj.renderedVideoUrl = masterUrl;
                    if (typeof window.saveProjectToDB === 'function') window.saveProjectToDB(state.currentProjectId);
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }

                if (downloadArea && downloadBtn) {
                    downloadArea.classList.remove('hidden');
                    downloadBtn.href = masterUrl;
                    downloadBtn.download = "render_default_180a741a.mp4";
                }
                if (topDlBtn) {
                    topDlBtn.href = masterUrl;
                    topDlBtn.download = "render_default_180a741a.mp4";
                    topDlBtn.classList.remove('hidden');
                }
                if (btnToggleView) {
                    btnToggleView.classList.remove('hidden');
                    btnToggleView.innerHTML = '🎞️ Show Storyboard';
                }
                if (typeof toast === 'function') toast("Render Complete", "Master 1080p video compiled successfully!", "success");
            } finally {
                if (btn) btn.disabled = false;
                isRenderBusy = false;
            }
            return;
        }
        // --- END ZERO-GPU DEMO SIMULATION HOOK ---


        let proj = typeof window.getProj === 'function' ? window.getProj() : null;



        // If no scenes loaded yet, try reloading from server first

        if (!proj || !proj.scenes || proj.scenes.length === 0) {

            if (typeof window.loadAllProjectsFromDB === 'function') {

                await window.loadAllProjectsFromDB();

                proj = typeof window.getProj === 'function' ? window.getProj() : null;

            }

        }



        if (!proj || !proj.scenes || proj.scenes.length === 0) {

            if (typeof toast === 'function') toast("Error", "Project not loaded! Please reload the page (F5) and try again.", "error");

            return;

        }



        if (isRenderBusy) return;

        isRenderBusy = true;



        try {

            const engineSelect = document.getElementById('renderEngineSelect');

            const engine = engineSelect ? engineSelect.value : 'ffmpeg_pro';



            if (engine === 'web_canvas') {

                // Deleguojama į didelio našumo FFmpeg backend variklį, kuris garantuoja 100% tikslią trukmę ir garso suvedimą

                await startFfmpegBackendRender(proj);

            } else {

                await startFfmpegBackendRender(proj);

            }

        } finally {

            isRenderBusy = false;

        }

    }



    // =========================================================================

    // 🌐 WEB CANVAS GPU VIDEO RENDERER (100% Identical to Preview, 0 Noise, Pure Smoothness)

    // =========================================================================

    async function startWebCanvasRender(proj) {

        const btn = document.getElementById('btnStartFinalRender');

        const progressArea = document.getElementById('renderProgressArea');

        const progressFill = document.getElementById('renderProgressFill');

        const progressStatus = document.getElementById('renderProgressStatus');

        const player = document.getElementById('finalRenderVideoPlayer');

        const placeholder = document.getElementById('renderPlaceholder');



        if (btn) btn.disabled = true;

        if (progressArea) progressArea.classList.remove('hidden');

        if (progressFill) progressFill.style.width = '5%';

        if (progressStatus) progressStatus.textContent = '🌐 Initializing Web Canvas GPU Engine...';



        logToStudio("🚀 Starting Web Canvas GPU Render (100% smooth, subpixel precision)...", "cmd");



        const resSelect = document.getElementById('renderResSelect') ? document.getElementById('renderResSelect').value : '1920x1080';

        let [canvasW, canvasH] = resSelect.split('x').map(x => parseInt(x));

        if (!canvasW || !canvasH) { canvasW = 1920; canvasH = 1080; }



        const fpsCodec = document.getElementById('renderFpsCodecSelect') ? document.getElementById('renderFpsCodecSelect').value : '30_h264';

        const fps = parseInt(fpsCodec.split('_')[0]) || 30;



        const kenBurnsMode = document.getElementById('renderKenBurnsSelect') ? document.getElementById('renderKenBurnsSelect').value : 'cinematic';

        const kenBurnsIntense = (document.getElementById('renderKenBurnsInput') ? parseInt(document.getElementById('renderKenBurnsInput').value) : 15) / 100.0;

        const transitionMode = document.getElementById('renderTransitionSelect') ? document.getElementById('renderTransitionSelect').value : 'dissolve';

        const transitionDur = document.getElementById('renderTransitionDurInput') ? parseFloat(document.getElementById('renderTransitionDurInput').value) : 0.6;

        const colorFilter = document.getElementById('renderColorFilterSelect') ? document.getElementById('renderColorFilterSelect').value : 'none';

        const subtitleMode = document.getElementById('renderSubtitleModeSelect') ? document.getElementById('renderSubtitleModeSelect').value : 'none';



        const allScenes = proj.scenes || [];

        const kineticScenes = typeof window.getKineticScenes === 'function' ? window.getKineticScenes() : (proj.kineticScenes || []);

        const updatedOutputs = JSON.parse(JSON.stringify(proj.outputs || []));



        function normId(id) {

            if (id === null || id === undefined) return "";

            let s = String(id).trim().toUpperCase();

            s = s.replace(/^(SCENE|KSC|SC)[_\-]?/i, "");

            if (s.startsWith("S") && s.length > 1 && /^\d+$/.test(s.slice(1))) {

                s = s.slice(1);

            }

            return s;

        }



        const timelineMap = {};

        (proj.timeline || proj.scenesTimeline || []).forEach(t => {

            if (t && t.id) timelineMap[normId(t.id)] = t;

        });



        // Assemble accurate Whisper scene items

        const timelineList = allScenes.map(sc => {

            const scId = String(sc.id);

            const nId = normId(scId);

            const tItem = timelineMap[nId];

            let dur = 4.0;



            if (tItem) {

                const rawDur = parseFloat(tItem.dur || tItem.duration || (tItem.end && tItem.start ? tItem.end - tItem.start : 0));

                if (rawDur > 0) dur = rawDur;

            } else {

                const scText = sc.text || sc.prompt || "";

                if (scText) {

                    const words = scText.trim().split(/\s+/).filter(w => w.length > 0).length;

                    dur = Math.max(4.0, (words * 0.45) + 1.0);

                }

            }



            return {

                id: scId,

                dur: parseFloat(dur.toFixed(3)),

                text: sc.text || sc.prompt || ""

            };

        });



        function getAiSceneImageUrl(scId, outputsList) {

            const n = normId(scId);

            for (const out of (outputsList || [])) {

                if (normId(out.sceneId) === n) {

                    if (out.mainId && Array.isArray(out.variations)) {

                        const matchedVar = out.variations.find(v => v.id === out.mainId);

                        if (matchedVar && matchedVar.url) return matchedVar.url;

                    }

                    if (Array.isArray(out.variations) && out.variations.length > 0) {

                        const lastVar = out.variations[out.variations.length - 1];

                        if (lastVar && lastVar.url) return lastVar.url;

                    }

                }

            }

            // Check if kinetic scene has bgMedia

            const kObj = (kineticScenes || []).find(k => normId(k.id) === n);

            if (kObj && (kObj.bgMedia || kObj.mediaUrl)) {

                return kObj.bgMedia || kObj.mediaUrl;

            }

            return null;

        }



        try {

            if (progressStatus) progressStatus.textContent = '🖼️ Iš anksto užkraunami AI vaizdai į GPU atmintį...';

            if (progressFill) progressFill.style.width = '10%';



            // Pre-load all scene images into Image objects

            const loadedImages = {};

            let loadedCount = 0;

            const totalToLoad = timelineList.length;



            await Promise.all(timelineList.map(async (item) => {

                const scId = String(item.id);

                const imgUrl = getAiSceneImageUrl(scId, updatedOutputs);

                if (imgUrl) {

                    try {

                        const img = new Image();

                        img.crossOrigin = "anonymous";

                        img.src = imgUrl;

                        await new Promise((resolve) => {

                            img.onload = resolve;

                            img.onerror = resolve;

                        });

                        loadedImages[scId] = img;

                    } catch(e) {}

                }

                loadedCount++;

                if (progressFill) progressFill.style.width = `${10 + Math.round((loadedCount / totalToLoad) * 15)}%`;

            }));



            logToStudio(`✅ Užkrauta ${Object.keys(loadedImages).length} AI vaizdų į Web Canvas renderį.`, "success");



            // Setup offscreen canvas

            const renderCanvas = document.createElement('canvas');

            renderCanvas.width = canvasW;

            renderCanvas.height = canvasH;

            const ctx = renderCanvas.getContext('2d', { alpha: false });

            ctx.imageSmoothingEnabled = true;

            ctx.imageSmoothingQuality = 'high';



            // Calculate scene time ranges strictly matching Timeline & Audio timestamps with continuous momentum

            let currentOffset = 0;

            let prevTransD = 0;

            const sceneRanges = timelineList.map((item, idx) => {

                const scObj = allScenes.find(s => normId(s.id) === normId(item.id)) || {};

                const outObj = updatedOutputs.find(o => normId(o.sceneId) === normId(item.id)) || {};

                const kObj = kineticScenes.find(k => normId(k.id) === normId(item.id)) || null;



                let isKineticScene = false;

                if (scObj.isKinetic || scObj.is_kinetic || outObj.isKineticText) {

                    isKineticScene = true;

                } else if (kObj && (kObj.isCustom || kObj.isKinetic || kObj.enabled)) {

                    isKineticScene = true;

                } else if (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(scObj)) {

                    isKineticScene = true;

                }



                const scTransition = scObj.transition || scObj.trans || transitionMode;

                const isLast = (idx === timelineList.length - 1);

                const nextItem = timelineList[idx + 1];

                const nextDur = nextItem ? nextItem.dur : 4.0;

                const outTransD = (!isLast && scTransition !== "cut" && scTransition !== "none") ? Math.min(transitionDur, item.dur * 0.45, nextDur * 0.45) : 0;

                const inTransD = prevTransD;

                prevTransD = outTransD;



                const start = currentOffset;

                const end = start + item.dur;

                currentOffset = end;



                return {

                    idx,

                    id: item.id,

                    dur: item.dur,

                    text: item.text,

                    start,

                    end,

                    inTransD,

                    outTransD,

                    transition: scTransition,

                    img: loadedImages[item.id] || null,

                    kinetic: isKineticScene ? kObj : null

                };

            });



            const totalDuration = currentOffset;

            const totalFrames = Math.max(1, Math.round(totalDuration * fps));



            logToStudio(`🎬 Pradedamas tiesioginis GPU kadravimas: ${totalFrames} kadrų (${totalDuration.toFixed(1)}s, ${fps} FPS)...`, "info");



            // Filter mapping for CSS filter string

            const filterCssMap = {

                "none": "none",

                "teal_orange": "contrast(1.15) saturate(1.3) sepia(0.15) hue-rotate(170deg)",

                "vintage": "sepia(0.5) contrast(1.1) brightness(0.95)",

                "bw_contrast": "grayscale(1) contrast(1.4) brightness(0.9)",

                "golden_hour": "saturate(1.35) sepia(0.3) brightness(1.05)",

                "cyberpunk": "contrast(1.35) saturate(1.6) hue-rotate(280deg)",

                "cold_blue": "contrast(1.15) saturate(1.1) hue-rotate(190deg)",

                "vivid_hdr": "contrast(1.3) saturate(1.4) brightness(1.05)"

            };

            const activeFilterCss = filterCssMap[colorFilter] || "none";



            // Helper to draw an image centered with aspect ratio "cover"

            function drawCoverImage(context, image, w, h) {

                if (!image || !image.width || !image.height) {

                    context.fillStyle = "#111827";

                    context.fillRect(0, 0, w, h);

                    return;

                }

                const imgW = image.naturalWidth || image.width;

                const imgH = image.naturalHeight || image.height;

                const scale = Math.max(w / imgW, h / imgH);

                const sw = w / scale;

                const sh = h / scale;

                const sx = (imgW - sw) / 2;

                const sy = (imgH - sh) / 2;

                context.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);

            }



            function drawCanvasSubtitle(ctx, text, mode, w, h) {

                if (!text || !text.trim() || !mode || mode === 'none') return;

                const cleanText = text.trim();

                const scale = h / 720.0;

                const fontSize = Math.max(18, Math.round(28 * scale));

                

                ctx.save();

                ctx.font = `bold ${fontSize}px 'Inter', system-ui, -apple-system, sans-serif`;

                ctx.textAlign = 'center';

                ctx.textBaseline = 'middle';



                const maxTextWidth = w * 0.84;

                const words = cleanText.split(/\s+/);

                const lines = [];

                let curLine = '';



                for (const word of words) {

                    const test = curLine ? `${curLine} ${word}` : word;

                    if (ctx.measureText(test).width <= maxTextWidth) {

                        curLine = test;

                    } else {

                        if (curLine) lines.push(curLine);

                        curLine = word;

                    }

                }

                if (curLine) lines.push(curLine);

                const displayLines = lines.slice(-3);



                const lineHeight = Math.round(fontSize * 1.3);

                const totalH = displayLines.length * lineHeight;

                const baseY = h - totalH - Math.round(48 * scale);

                const cx = w / 2;



                const m = String(mode).toLowerCase();

                if (m.includes('box')) {

                    const padX = Math.round(18 * scale);

                    const padY = Math.round(10 * scale);

                    let maxW = 0;

                    displayLines.forEach(l => {

                        const lw = ctx.measureText(l).width;

                        if (lw > maxW) maxW = lw;

                    });

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';

                    const rx = cx - maxW / 2 - padX;

                    const ry = baseY - padY;

                    const rw = maxW + padX * 2;

                    const rh = totalH + padY * 2;

                    ctx.beginPath();

                    if (typeof ctx.roundRect === 'function') {

                        ctx.roundRect(rx, ry, rw, rh, 8 * scale);

                    } else {

                        ctx.rect(rx, ry, rw, rh);

                    }

                    ctx.fill();



                    ctx.fillStyle = '#ffffff';

                    displayLines.forEach((l, idx) => {

                        ctx.fillText(l, cx, baseY + idx * lineHeight + lineHeight / 2);

                    });

                } else if (m.includes('yellow')) {

                    ctx.lineWidth = Math.max(3, Math.round(4 * scale));

                    ctx.strokeStyle = '#000000';

                    ctx.fillStyle = '#ffe600';

                    displayLines.forEach((l, idx) => {

                        const y = baseY + idx * lineHeight + lineHeight / 2;

                        ctx.strokeText(l, cx, y);

                        ctx.fillText(l, cx, y);

                    });

                } else if (m.includes('neon')) {

                    ctx.lineWidth = Math.max(3, Math.round(3.5 * scale));

                    ctx.strokeStyle = '#000000';

                    ctx.fillStyle = '#00ffcc';

                    displayLines.forEach((l, idx) => {

                        const y = baseY + idx * lineHeight + lineHeight / 2;

                        ctx.strokeText(l, cx, y);

                        ctx.fillText(l, cx, y);

                    });

                } else {

                    ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));

                    ctx.strokeStyle = 'rgba(0,0,0,0.85)';

                    ctx.fillStyle = '#ffffff';

                    displayLines.forEach((l, idx) => {

                        const y = baseY + idx * lineHeight + lineHeight / 2;

                        ctx.strokeText(l, cx, y);

                        ctx.fillText(l, cx, y);

                    });

                }

                ctx.restore();

            }



            // Helper to render a single scene state with continuous velocity momentum

            function renderSingleSceneState(context, scRange, localTime, frameIdx) {

                const w = canvasW;

                const h = canvasH;

                const inTd = scRange.inTransD || 0;

                const tEff = Math.max(0, inTd + localTime);

                const dEff = inTd + scRange.dur;

                const p = Math.max(0, Math.min(1, tEff / Math.max(0.1, dEff)));

                const easeOut = p * (2 - p);



                context.save();



                // Apply Color Filter

                if (activeFilterCss !== "none") {

                    context.filter = activeFilterCss;

                }



                // Camera Motion Calculations (Dead-center subpixel smooth GPU transforms)

                if (kenBurnsMode === "cinematic" || kenBurnsMode === "zoom_in" || kenBurnsMode === "zoom_in_center") {

                    const scale = 1.0 + (kenBurnsIntense * easeOut);

                    context.translate(w / 2, h / 2);

                    context.scale(scale, scale);

                    context.translate(-w / 2, -h / 2);

                } else if (kenBurnsMode === "zoom_out") {

                    const scale = 1.0 + kenBurnsIntense - (kenBurnsIntense * easeOut);

                    context.translate(w / 2, h / 2);

                    context.scale(scale, scale);

                    context.translate(-w / 2, -h / 2);

                } else if (kenBurnsMode === "zoom_in_out" || kenBurnsMode === "pulse_center") {

                    const pulse = Math.sin(p * Math.PI);

                    const scale = 1.0 + (kenBurnsIntense * pulse);

                    context.translate(w / 2, h / 2);

                    context.scale(scale, scale);

                    context.translate(-w / 2, -h / 2);

                } else if (kenBurnsMode === "pan_left") {

                    const offset = (1 - easeOut) * (w * 0.08);

                    context.translate(-offset, 0);

                    context.scale(1.08, 1.08);

                } else if (kenBurnsMode === "pan_right") {

                    const offset = easeOut * (w * 0.08);

                    context.translate(-offset, 0);

                    context.scale(1.08, 1.08);

                } else if (kenBurnsMode === "pan_up") {

                    const offset = (1 - easeOut) * (h * 0.08);

                    context.translate(0, -offset);

                    context.scale(1.08, 1.08);

                } else if (kenBurnsMode === "pan_down") {

                    const offset = easeOut * (h * 0.08);

                    context.translate(0, -offset);

                    context.scale(1.08, 1.08);

                } else if (kenBurnsMode === "drift") {

                    context.translate((p * 0.04) * w, (p * 0.03) * h);

                    context.scale(1.06, 1.06);

                }



                if (scRange.img) {

                    drawCoverImage(context, scRange.img, w, h);

                } else {

                    // Modern stylized PIL card

                    context.fillStyle = "#0f172a";

                    context.fillRect(0, 0, w, h);

                    context.filter = "none";

                    context.fillStyle = "#ffffff";

                    context.font = "bold 44px 'Inter', sans-serif";

                    context.textAlign = "center";

                    context.textBaseline = "middle";

                    context.fillText(scRange.text || `Scene #${scRange.id}`, w / 2, h / 2);

                }



                context.restore();



                // If kinetic overlay exists, render on top (unless hideText mode is active)

                if (scRange.kinetic && typeof window.renderKineticTextOverlay === 'function') {

                    if (!scRange.kinetic.hideText) {

                        window.renderKineticTextOverlay(context, w, h, scRange.kinetic, localTime, frameIdx, true);

                    }

                } else if (subtitleMode && subtitleMode !== 'none' && scRange.text) {

                    drawCanvasSubtitle(context, scRange.text, subtitleMode, w, h);

                }

            }



            // Setup MediaRecorder

            const stream = renderCanvas.captureStream(fps);

            let mimeType = 'video/webm;codecs=vp9';

            if (!MediaRecorder.isTypeSupported(mimeType)) {

                mimeType = 'video/webm;codecs=vp8';

                if (!MediaRecorder.isTypeSupported(mimeType)) {

                    mimeType = 'video/webm';

                }

            }



            const recorder = new MediaRecorder(stream, {

                mimeType: mimeType,

                videoBitsPerSecond: 18000000 // 18 Mbps Pristine Bitrate

            });



            const recordedChunks = [];

            recorder.ondataavailable = (e) => {

                if (e.data && e.data.size > 0) recordedChunks.push(e.data);

            };



            const recordPromise = new Promise((resolve) => {

                recorder.onstop = () => {

                    const blob = new Blob(recordedChunks, { type: mimeType });

                    resolve(blob);

                };

            });



            recorder.start();



            // Offscreen buffer canvas for seamless transitions

            const tempBufferCanvas = document.createElement('canvas');

            tempBufferCanvas.width = canvasW;

            tempBufferCanvas.height = canvasH;

            const tempCtx = tempBufferCanvas.getContext('2d', { alpha: true });



            let currentFrame = 0;



            async function renderLoop() {

                const batchSize = 10; // Render 10 frames per microtask for maximum speed

                for (let b = 0; b < batchSize && currentFrame < totalFrames; b++) {

                    const timeSec = currentFrame / fps;



                    // Find active scene

                    let activeIdx = sceneRanges.findIndex(s => timeSec >= s.start && timeSec < s.end);

                    if (activeIdx === -1) activeIdx = sceneRanges.length - 1;



                    const curScene = sceneRanges[activeIdx];

                    const nextScene = (activeIdx < sceneRanges.length - 1) ? sceneRanges[activeIdx + 1] : null;

                    const localTime = Math.max(0, Math.min(curScene.dur, timeSec - curScene.start));

                    const timeUntilEnd = curScene.end - timeSec;

                    const curTransMode = curScene.transition || transitionMode;

                    const transD = (nextScene && curTransMode !== "cut" && curTransMode !== "none") ? Math.min(transitionDur, curScene.dur * 0.45, nextScene.dur * 0.45) : 0;



                    // Render base current scene

                    renderSingleSceneState(ctx, curScene, localTime, currentFrame);



                    // If in transition zone into next scene

                    if (nextScene && transD > 0 && timeUntilEnd <= transD) {

                        const trProgress = Math.max(0, Math.min(1, 1.0 - (timeUntilEnd / transD)));

                        tempCtx.clearRect(0, 0, canvasW, canvasH);

                        // Next scene moves continuously through transition: from t = -transD up to 0.0!

                        const nextT = (trProgress - 1.0) * transD;

                        renderSingleSceneState(tempCtx, nextScene, nextT, currentFrame);



                        ctx.save();

                        if (curTransMode === "dissolve" || curTransMode === "blur_cross" || curTransMode === "fade" || curTransMode === "crossfade") {

                            ctx.globalAlpha = trProgress;

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "slide_left" || curTransMode === "smooth_left" || curTransMode === "slideleft") {

                            ctx.translate((1 - trProgress) * canvasW, 0);

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "slide_right" || curTransMode === "smooth_right" || curTransMode === "slideright") {

                            ctx.translate((trProgress - 1) * canvasW, 0);

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "slide_up" || curTransMode === "slideup") {

                            ctx.translate(0, (1 - trProgress) * canvasH);

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "wipe_left" || curTransMode === "wipeleft") {

                            ctx.beginPath();

                            ctx.rect((1 - trProgress) * canvasW, 0, trProgress * canvasW, canvasH);

                            ctx.clip();

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "circle_crop" || curTransMode === "circle_iris" || curTransMode === "circlewipe") {

                            ctx.beginPath();

                            const maxR = Math.hypot(canvasW / 2, canvasH / 2);

                            ctx.arc(canvasW / 2, canvasH / 2, trProgress * maxR, 0, Math.PI * 2);

                            ctx.clip();

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        } else if (curTransMode === "fade_black" || curTransMode === "fadeblack") {

                            const blackPeak = Math.sin(trProgress * Math.PI);

                            if (trProgress > 0.5) ctx.drawImage(tempBufferCanvas, 0, 0);

                            ctx.fillStyle = `rgba(0,0,0,${blackPeak})`;

                            ctx.fillRect(0, 0, canvasW, canvasH);

                        } else if (curTransMode === "fade_white" || curTransMode === "fadewhite") {

                            const whitePeak = Math.sin(trProgress * Math.PI);

                            if (trProgress > 0.5) ctx.drawImage(tempBufferCanvas, 0, 0);

                            ctx.fillStyle = `rgba(255,255,255,${whitePeak})`;

                            ctx.fillRect(0, 0, canvasW, canvasH);

                        } else {

                            ctx.globalAlpha = trProgress;

                            ctx.drawImage(tempBufferCanvas, 0, 0);

                        }

                        ctx.restore();

                    }



                    currentFrame++;

                }



                const percent = Math.min(90, 25 + Math.round((currentFrame / totalFrames) * 65));

                if (progressFill) progressFill.style.width = `${percent}%`;

                if (progressStatus) progressStatus.textContent = `🚀 GPU Renderinimas: ${currentFrame}/${totalFrames} kadrų (${percent}%)...`;



                if (currentFrame < totalFrames) {

                    setTimeout(renderLoop, 1);

                } else {

                    setTimeout(() => {

                        try { recorder.stop(); } catch(e) {}

                    }, 80);

                }

            }



            renderLoop();



            const finalWebmBlob = await recordPromise;



            if (progressFill) progressFill.style.width = '92%';

            if (progressStatus) progressStatus.textContent = '🎵 Sujungiamas įgarsinimas ir eksportuojamas galutinis MP4...';

            logToStudio(`✅ GPU kadravimas baigtas. Siunčiamas video failas į serverį audio sujungimui...`, "success");



            const fd = new FormData();

            fd.append("video_file", new File([finalWebmBlob], "canvas_render.webm", { type: mimeType }));

            fd.append("project_id", (proj && proj.id) || "default");

            if (proj.audioTrack) fd.append("audio_track_url", proj.audioTrack);



            const finalizeRes = await fetch('/api/render/canvas_finalize', {

                method: 'POST',

                body: fd

            });

            const finalizeData = await finalizeRes.json();



            if (finalizeData.status !== 'success') {

                throw new Error(finalizeData.message || "Nepavyko sujungti audio su video.");

            }



            if (progressFill) progressFill.style.width = '100%';

            if (progressStatus) progressStatus.textContent = '✅ Render Completed Successfully!';



            logToStudio(`🎉 Video sėkmingai paruoštas: ${finalizeData.videoUrl}`, "success");



            if (placeholder) placeholder.classList.add('hidden');

            const monitor = document.getElementById('renderStoryboardMonitor');

            if (monitor) monitor.classList.add('hidden');



            if (player) {

                player.src = finalizeData.videoUrl;

                player.classList.remove('hidden');

                const shouldAutoPlay = document.getElementById('renderAutoPlayCheckbox')?.checked === true;

                if (shouldAutoPlay) {

                    player.play().catch(()=>{});

                }

            }

            if (proj) {

                proj.renderedVideoUrl = finalizeData.videoUrl;

                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

            }



            const downloadArea = document.getElementById('renderDownloadActionArea');

            const downloadBtn = document.getElementById('btnDownloadRenderedMp4');

            const topDlBtn = document.getElementById('btnDownloadRenderedMp4Top');

            const safeProjName = (proj.name || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_');

            if (downloadArea && downloadBtn) {

                downloadArea.classList.remove('hidden');

                downloadBtn.href = finalizeData.videoUrl;

                downloadBtn.download = `${safeProjName}_master.mp4`;

            }

            if (topDlBtn) {

                topDlBtn.href = finalizeData.videoUrl;

                topDlBtn.download = `${safeProjName}_master.mp4`;

                topDlBtn.classList.remove('hidden');

            }

            if (progressArea) {

                setTimeout(() => { if (progressArea) progressArea.classList.add('hidden'); }, 5000);

            }



            const btnToggleView = document.getElementById('btnToggleStoryboardView');

            if (btnToggleView) {

                btnToggleView.classList.remove('hidden');

                btnToggleView.innerHTML = '🎞️ Show Storyboard';

            }



            if (typeof toast === 'function') toast("Render Complete", "Krištolo skaidrumo video sėkmingai sugeneruotas!", "success");



        } catch(err) {

            console.error("Web Canvas render error:", err);

            logToStudio(`Renderinimo klaida: ${err.message}`, "error");

            if (progressStatus) progressStatus.textContent = `❌ Error: ${err.message}`;

            if (typeof toast === 'function') toast("Render Error", err.message, "error");

        } finally {

            if (btn) btn.disabled = false;

        }

    }



    // =========================================================================

    // ⚡ FFMPEG PRO BACKEND RENDERER (Fallback / Alternative Engine)

    // =========================================================================

    async function startFfmpegBackendRender(proj) {

        const btn = document.getElementById('btnStartFinalRender');

        const progressArea = document.getElementById('renderProgressArea');

        const progressFill = document.getElementById('renderProgressFill');

        const progressStatus = document.getElementById('renderProgressStatus');

        const player = document.getElementById('finalRenderVideoPlayer');

        const placeholder = document.getElementById('renderPlaceholder');



        if (btn) btn.disabled = true;

        if (progressArea) progressArea.classList.remove('hidden');

        if (progressFill) progressFill.style.width = '10%';

        if (progressStatus) progressStatus.textContent = '⚡ Initializing FFmpeg Pro process...';



        logToStudio("Starting final FFmpeg Pro composite render...", "cmd");



        const resSelect = document.getElementById('renderResSelect') ? document.getElementById('renderResSelect').value : '1920x1080';

        const fpsCodec = document.getElementById('renderFpsCodecSelect') ? document.getElementById('renderFpsCodecSelect').value : '30_h264';

        const kenBurnsMode = document.getElementById('renderKenBurnsSelect') ? document.getElementById('renderKenBurnsSelect').value : 'cinematic';

        const kenBurnsIntense = document.getElementById('renderKenBurnsInput') ? document.getElementById('renderKenBurnsInput').value : '15';

        const transitionMode = document.getElementById('renderTransitionSelect') ? document.getElementById('renderTransitionSelect').value : 'dissolve';

        const transitionDur = document.getElementById('renderTransitionDurInput') ? parseFloat(document.getElementById('renderTransitionDurInput').value) : 0.6;

        const colorFilter = document.getElementById('renderColorFilterSelect') ? document.getElementById('renderColorFilterSelect').value : 'none';

        const zoomModeEl = document.getElementById('renderZoomModeSelect');

        const zoomMode = zoomModeEl ? zoomModeEl.value : 'constant_speed';

        const subtitleMode = document.getElementById('renderSubtitleModeSelect') ? document.getElementById('renderSubtitleModeSelect').value : 'none';

        

        let projBgmVol = 15;

        if (proj.bgmSettings && proj.bgmSettings.volume !== undefined) {

            projBgmVol = parseFloat(proj.bgmSettings.volume);

        } else if (proj.renderSettings && proj.renderSettings.bgmVolume !== undefined) {

            projBgmVol = parseFloat(proj.renderSettings.bgmVolume);

        } else {

            const volEl = document.getElementById('renderBgmVolInput') || document.getElementById('bgmStudioVolSlider');

            if (volEl) projBgmVol = parseFloat(volEl.value) || 15;

        }

        const bgmVolFraction = Math.max(0.0, Math.min(1.0, projBgmVol / 100.0));



        const kineticScenes = typeof window.getKineticScenes === 'function' ? window.getKineticScenes() : (proj.kineticScenes || []);



        try {

            logToStudio(`Atsiųsti nustatymai: ${resSelect}, Kodekas: ${fpsCodec}, Ken Burns: ${kenBurnsMode} (${kenBurnsIntense}%), Transition: ${transitionMode} (${transitionDur}s), Color: ${colorFilter}, Zoom: ${zoomMode}`);



            if (progressFill) progressFill.style.width = '20%';

            if (progressStatus) progressStatus.textContent = '🎬 Verifying media sources & keyframes...';



            const updatedOutputs = JSON.parse(JSON.stringify(proj.outputs || []));

            const allScenes = proj.scenes || [];



            function normId(id) {

                if (id === null || id === undefined) return "";

                let s = String(id).trim().toUpperCase();

                s = s.replace(/^(SCENE|KSC|SC)[_\-]?/i, "");

                if (s.startsWith("S") && s.length > 1 && /^\d+$/.test(s.slice(1))) {

                    s = s.slice(1);

                }

                return s;

            }



            const timelineMap = {};

            (proj.timeline || proj.scenesTimeline || []).forEach(t => {

                if (t && t.id) timelineMap[normId(t.id)] = t;

            });



            const timelineList = allScenes.map(sc => {

                const scId = String(sc.id);

                const nId = normId(scId);

                const tItem = timelineMap[nId];

                let dur = 4.0;



                if (tItem) {

                    const rawDur = parseFloat(tItem.dur || tItem.duration || (tItem.end && tItem.start ? tItem.end - tItem.start : 0));

                    if (rawDur > 0) dur = rawDur;

                } else if (sc.duration) {

                    dur = parseFloat(sc.duration) || 4.0;

                } else {

                    const scText = sc.text || sc.prompt || "";

                    if (scText) {

                        const words = scText.trim().split(/\s+/).filter(w => w.length > 0).length;

                        dur = Math.max(4.0, (words * 0.45) + 1.0);

                    }

                }



                return {

                    id: scId,

                    dur: parseFloat(dur.toFixed(3)),

                    text: sc.text || sc.prompt || "",

                    cameraMotion: sc.cameraMotion || sc.kenBurns || null,

                    transition: sc.transition || null,

                    colorFilter: sc.colorFilter || null,

                    footageFps: sc.footageFps || sc.fps || null

                };

            });



            // Patikriname ar visos scenos turi atitinkamą laiką audio laiko juostoje

            const unalignedScenes = allScenes.filter(sc => {

                const tItem = timelineMap[normId(sc.id)];

                return tItem && (!tItem.dur || Number(tItem.dur) <= 0 || tItem.start === null);

            });

            if (unalignedScenes.length > 0 && proj.audioTrack) {

                const sampleIds = unalignedScenes.slice(0, 5).map(s => s.id).join(', ') + (unalignedScenes.length > 5 ? ` ir dar ${unalignedScenes.length - 5} vnt.` : '');

                logToStudio(`⚠️ Dėmesio: ${unalignedScenes.length} scenų (${sampleIds}) neturi balso Whisper laiko juostoje! Joms priskirta 4.0s trukmė, todėl vaizdas bus ilgesnis už garso takelį. Jei norite visiško sutapimo, sugeneruokite audio visoms scenoms ir sinchronizuokite laiko juostą.`, 'warn');

            }



            // 🎬 AUTO-RENDER ONLY TRUE TEXT WRITER / KINETIC TYPOGRAPHY SCENES

            const activeKineticScenes = kineticScenes.filter(kSc => {

                const scObj = allScenes.find(s => normId(s.id) === normId(kSc.id));

                const outObj = updatedOutputs.find(o => normId(o.sceneId) === normId(kSc.id));

                if (scObj && (scObj.isKinetic || scObj.is_kinetic)) return true;

                if (outObj && outObj.isKineticText) return true;

                if (kSc.isCustom || kSc.isKinetic || kSc.enabled) return true;

                if (scObj && typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(scObj)) return true;

                return false;

            });



            if (activeKineticScenes.length > 0 && typeof window.renderKineticSceneToWebmBlob === 'function') {

                function computeKineticHash(sc, dur) {

                    const str = `${sc.id}_${sc.effect}_${sc.font}_${sc.weight}_${sc.textAlign}_${sc.textCase}_${sc.textColor}_${sc.bgColor}_${sc.bgMedia || ''}_${sc.bgMediaDim}_${sc.bgMediaOpacity}_${sc.bgMediaBlur}_${sc.hideText}_${sc.speed}_${sc.intensity}_${sc.size1}_${sc.size2}_${sc.titleRatio}_${sc.lineGap}_${sc.autoFit}_${dur}_${sc.text1}_${sc.text2}`;

                    let hash = 0;

                    for (let i = 0; i < str.length; i++) {

                        hash = ((hash << 5) - hash) + str.charCodeAt(i);

                        hash |= 0;

                    }

                    return String(Math.abs(hash));

                }



                try {

                    const scChecks = activeKineticScenes.map(kSc => {

                        const tItem = timelineList.find(t => normId(t.id) === normId(kSc.id));

                        const scDur = tItem ? tItem.dur : (kSc.duration || 4.0);

                        return {

                            id: kSc.id,

                            hash: computeKineticHash(kSc, scDur)

                        };

                    });



                    const cacheRes = await fetch('/api/render/check_kinetic_cache', {

                        method: 'POST',

                        headers: { 'Content-Type': 'application/json' },

                        body: JSON.stringify({ scenes: scChecks })

                    });

                    const cacheData = await cacheRes.json();

                    const cachedIds = new Set((cacheData.cached || []).map(id => String(id)));



                    const toRender = activeKineticScenes.filter(kSc => !cachedIds.has(String(kSc.id)) && !cachedIds.has(normId(kSc.id)));

                    

                    if (toRender.length === 0) {

                        logToStudio(`⚡ Visi ${activeKineticScenes.length} Text Writer video klipai paruošti (Cache Hit)!`, "success");

                    } else {

                        logToStudio(`🎬 Renderinama ${toRender.length} Text Writer scenų naršyklėje su visais efektais...`, "info");

                        for (let ki = 0; ki < toRender.length; ki++) {

                            const kSc = toRender[ki];

                            const tItem = timelineList.find(t => normId(t.id) === normId(kSc.id));

                            const scDur = tItem ? tItem.dur : (kSc.duration || 4.0);

                            const scHash = computeKineticHash(kSc, scDur);

                            

                            logToStudio(`Animuojamas tekstas #${kSc.id}: "${(kSc.text1 || '').slice(0, 25)}..." (${scDur.toFixed(1)}s, ${kSc.effect})...`);

                            

                            const webmBlob = await window.renderKineticSceneToWebmBlob(kSc, scDur);

                            const formData = new FormData();

                            formData.append('file', webmBlob, `kinetic_${kSc.id}.webm`);

                            formData.append('scene_id', String(kSc.id));

                            formData.append('hash_str', scHash);

                            

                            await fetch('/api/render/upload_kinetic_webm', {

                                method: 'POST',

                                body: formData

                            });

                        }

                        logToStudio(`✅ Visi Text Writer klipai sėkmingai sugeneruoti ir paruošti FFmpeg masteriui!`, "success");

                    }

                } catch(kErr) {

                    console.warn("Kinetic text batch rendering warning:", kErr);

                    logToStudio(`Kinetic rendering warning: ${kErr.message}. Fallback to direct text engine.`, "warn");

                }

            }



            if (progressFill) progressFill.style.width = '45%';

            if (progressStatus) progressStatus.textContent = '⚡ FFmpeg Pro Master kompozicija ir kodavimas...';



            logToStudio("Siunčiama užklausa į FFmpeg Pro Master Renderer (/api/render/video)...", "cmd");



            const slowdownCheck = document.getElementById('renderSlowdownIfShort');

            const slowdownIfShort = slowdownCheck ? slowdownCheck.checked : true;



            const voiceSourceEl = document.getElementById('renderVoiceSourceSelect');

            const voiceSource = voiceSourceEl ? voiceSourceEl.value : (proj.renderSettings?.voiceSource || 'master');



            const payload = {

                projectId: state.currentProjectId || "default",

                voiceSource: voiceSource,

                resolution: resSelect,

                fpsCodec: fpsCodec,

                kenBurnsMode: kenBurnsMode,

                kenBurnsIntensity: parseInt(kenBurnsIntense),

                transitionMode: transitionMode,

                transitionDur: transitionDur,

                colorFilter: colorFilter,

                zoomMode: zoomMode,

                subtitleMode: subtitleMode,

                slowdownIfShort: slowdownIfShort,

                footageFps: (proj.renderSettings && proj.renderSettings.footageFps) || null,

                timeline: timelineList,

                scenes: allScenes,

                outputs: updatedOutputs,

                audioTrack: proj.audioTrack || null,

                sceneSfxById: proj.sceneSfxById || {},

                audioChunks: proj.audioChunks || [],

                sceneAudioById: proj.sceneAudioById || {},

                bgmTrack: proj.bgmTrack || null,

                bgmMuted: Boolean(proj.bgmSettings?.muted || proj.renderSettings?.bgmMuted),

                bgmSettings: proj.bgmSettings || {},

                bgmVolume: (proj.bgmSettings?.muted || proj.renderSettings?.bgmMuted) ? 0.0 : bgmVolFraction,

                masterVideoVolume: proj.renderSettings.masterVideoVolume !== undefined ? proj.renderSettings.masterVideoVolume : (document.getElementById('renderMasterVideoVolInput') ? (parseFloat(document.getElementById('renderMasterVideoVolInput').value) / 100.0) : 1.0),

                cameraOnVideo: Boolean(proj.renderSettings && proj.renderSettings.cameraOnVideo),

                renderSettings: proj.renderSettings || {},

                sceneVolumes: (proj.renderSettings && proj.renderSettings.sceneVolumes) || {},

                kineticScenes: kineticScenes,

                sceneTextById: proj.sceneTextById || {}

            };



            const res = await fetch('/api/render/video', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(payload)

            });



            const data = await res.json();

            if (data.status !== 'success') {

                throw new Error(data.message || 'Renderinimo klaida');

            }



            if (progressFill) progressFill.style.width = '100%';

            if (progressStatus) progressStatus.textContent = '✅ Render Completed Successfully!';



            logToStudio(`Video sėkmingai sugeneruotas: ${data.videoUrl}`, "success");



            if (placeholder) placeholder.classList.add('hidden');

            const monitor = document.getElementById('renderStoryboardMonitor');

            if (monitor) monitor.classList.add('hidden');



            if (player) {

                player.src = data.videoUrl;

                player.classList.remove('hidden');

                const shouldAutoPlay = document.getElementById('renderAutoPlayCheckbox')?.checked === true;

                if (shouldAutoPlay) {

                    player.play().catch(()=>{});

                }

            }

            if (proj) {

                proj.renderedVideoUrl = data.videoUrl;

                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

            }



            const downloadArea = document.getElementById('renderDownloadActionArea');

            const downloadBtn = document.getElementById('btnDownloadRenderedMp4');

            const topDlBtn = document.getElementById('btnDownloadRenderedMp4Top');

            const safeProjName = (proj.name || 'project').replace(/[^a-zA-Z0-9_\-]/g, '_');

            if (downloadArea && downloadBtn) {

                downloadArea.classList.remove('hidden');

                downloadBtn.href = data.videoUrl;

                downloadBtn.download = `${safeProjName}_master.mp4`;

            }

            if (topDlBtn) {

                topDlBtn.href = data.videoUrl;

                topDlBtn.download = `${safeProjName}_master.mp4`;

                topDlBtn.classList.remove('hidden');

            }

            if (progressArea) {

                setTimeout(() => { if (progressArea) progressArea.classList.add('hidden'); }, 5000);

            }



            const btnToggleView = document.getElementById('btnToggleStoryboardView');

            if (btnToggleView) {

                btnToggleView.classList.remove('hidden');

                btnToggleView.innerHTML = '🎞️ Show Storyboard';

            }



            if (typeof toast === 'function') toast("Render Complete", "Galutinis MP4 video sėkmingai paruoštas!", "success");



        } catch (err) {

            logToStudio(`Renderinimo klaida: ${err.message}`, "error");

            if (progressStatus) progressStatus.textContent = `❌ Error: ${err.message}`;

            if (typeof toast === 'function') toast("Render Error", err.message, "error");

        } finally {

            if (btn) btn.disabled = false;

        }

    }



    // =========================================================================

    // 🎬 DAVINCI RESOLVE FULL ZIP PACKAGE EXPORTER (With Live Progress Modal & Debounce Guard)

    // =========================================================================

    async function exportDavinciResolvePackage() {

        if (window._isExportingDavinci) {

            console.log("DaVinci Export already in progress, ignoring duplicate click.");

            return;

        }

        window._isExportingDavinci = true;



        const btnTop = document.getElementById('btnTopExportDavinci');

        const btnRender = document.getElementById('btnExportDavinciPackage');

        const originalTopHtml = btnTop ? btnTop.innerHTML : '';

        const originalRenderHtml = btnRender ? btnRender.innerHTML : '';



        // Progress Modal Elements

        const modal = document.getElementById('modalDavinciProgress');

        const titleEl = document.getElementById('davinciModalStatusTitle');

        const subEl = document.getElementById('davinciModalStatusSub');

        const percentEl = document.getElementById('davinciModalPercent');

        const barEl = document.getElementById('davinciModalProgressBar');

        const successBox = document.getElementById('davinciModalSuccessBox');

        const downloadLink = document.getElementById('davinciDirectDownloadLink');



        const s1 = document.getElementById('dStep1');

        const s2 = document.getElementById('dStep2');

        const s3 = document.getElementById('dStep3');

        const s4 = document.getElementById('dStep4');



        function setStep(stepNum, statusText, subText, percent) {

            if (titleEl && statusText) titleEl.textContent = statusText;

            if (subEl && subText) subEl.textContent = subText;

            if (percentEl) percentEl.textContent = `${percent}%`;

            if (barEl) barEl.style.width = `${percent}%`;



            const steps = [s1, s2, s3, s4];

            steps.forEach((el, idx) => {

                if (!el) return;

                const dot = el.querySelector('.dot');

                if (idx + 1 < stepNum) {

                    if (dot) dot.style.background = '#10b981'; // Completed green

                    el.style.color = '#fff';

                    el.style.fontWeight = '600';

                } else if (idx + 1 === stepNum) {

                    if (dot) dot.style.background = '#f59e0b'; // Active amber

                    el.style.color = '#00ffcc';

                    el.style.fontWeight = '700';

                } else {

                    if (dot) dot.style.background = '#555';

                    el.style.color = 'var(--muted, #888)';

                    el.style.fontWeight = 'normal';

                }

            });

        }



        try {

            if (btnTop) {

                btnTop.disabled = true;

                btnTop.innerHTML = `<span class="spinner" style="display:inline-block; animation:spin 1s linear infinite; margin-right:4px;">⏳</span> Ruošiama...`;

            }

            if (btnRender) {

                btnRender.disabled = true;

                btnRender.innerHTML = `<span class="spinner" style="display:inline-block; animation:spin 1s linear infinite; margin-right:4px;">⏳</span> Generuojamas ZIP...`;

            }



            // Show Progress Modal

            if (modal) {

                if (successBox) successBox.classList.add('hidden');

                modal.classList.add('show');

            }



            setStep(1, "⏳ [1/4] Tikrinama projekto struktūra...", "Nuskaitomi Whisper laiko kodai ir scenų seka...", 15);



            let proj = typeof window.getProj === 'function' ? window.getProj() : null;

            if (!proj || !proj.scenes || proj.scenes.length === 0) {

                if (typeof window.loadAllProjectsFromDB === 'function') {

                    await window.loadAllProjectsFromDB();

                    proj = typeof window.getProj === 'function' ? window.getProj() : null;

                }

            }



            if (!proj || !proj.scenes || proj.scenes.length === 0) {

                throw new Error("Project not loaded! Please reload the page (F5) and try again.");

            }



            logToStudio(`🎬 Pradedamas DaVinci Resolve projekto paketo generavimas (${proj.scenes.length} scenų)...`, "cmd");



            const resSelect = document.getElementById('renderResSelect') ? document.getElementById('renderResSelect').value : '1920x1080';

            const fpsCodec = document.getElementById('renderFpsCodecSelect') ? document.getElementById('renderFpsCodecSelect').value : '30_h264';

            const fps = parseInt(fpsCodec.split('_')[0]) || 30;

            const kenBurnsMode = document.getElementById('renderKenBurnsSelect') ? document.getElementById('renderKenBurnsSelect').value : 'cinematic';

            const kenBurnsIntense = document.getElementById('renderKenBurnsInput') ? parseInt(document.getElementById('renderKenBurnsInput').value) : 15;

            const transitionMode = document.getElementById('renderTransitionSelect') ? document.getElementById('renderTransitionSelect').value : 'dissolve';

            const transitionDur = document.getElementById('renderTransitionDurInput') ? parseFloat(document.getElementById('renderTransitionDurInput').value) : 0.6;



            function normId(id) {

                if (id === null || id === undefined) return "";

                let s = String(id).trim().toUpperCase();

                s = s.replace(/^(SCENE|KSC|SC)[_\-]?/i, "");

                if (s.startsWith("S") && s.length > 1 && /^\d+$/.test(s.slice(1))) {

                    s = s.slice(1);

                }

                return s;

            }



            const timelineMap = {};

            (proj.timeline || proj.scenesTimeline || []).forEach(t => {

                if (t && t.id) timelineMap[normId(t.id)] = t;

            });



            const allScenes = proj.scenes || [];

            const timelineList = allScenes.map(sc => {

                const scId = String(sc.id);

                const nId = normId(scId);

                const tItem = timelineMap[nId];

                let dur = 4.0;



                if (tItem) {

                    const rawDur = parseFloat(tItem.dur || tItem.duration || (tItem.end && tItem.start ? tItem.end - tItem.start : 0));

                    if (rawDur > 0) dur = rawDur;

                } else {

                    const scText = sc.text || sc.prompt || "";

                    if (scText) {

                        const words = scText.trim().split(/\s+/).filter(w => w.length > 0).length;

                        dur = Math.max(4.0, (words * 0.45) + 1.0);

                    }

                }



                return {

                    id: scId,

                    dur: parseFloat(dur.toFixed(3)),

                    text: sc.text || sc.prompt || ""

                };

            });



            // Check for kinetic text scenes in Text Writer that need rendering

            const kineticScenes = (typeof window.getKineticScenes === 'function' ? window.getKineticScenes() : proj.kineticScenes) || [];

            if (kineticScenes.length > 0 && typeof window.renderKineticSceneToWebmBlob === 'function') {

                function computeKineticHash(sc, dur) {

                    const str = [

                        sc.id, sc.text1 || '', sc.text2 || '', sc.effect || '',

                        sc.font || '', sc.weight || '', sc.textColor || '', sc.bgColor || '',

                        sc.bgMedia || '', sc.bgMediaDim || 0.4, sc.bgMediaOpacity !== undefined ? sc.bgMediaOpacity : 1.0,

                        sc.bgMediaBlur || 0, sc.hideText === true,

                        sc.speed || 1.0, sc.intensity || 20, sc.size1 || 65, sc.size2 || 44,

                        sc.titleRatio || 1.5, sc.lineGap || 45, sc.textAlign || 'center',

                        sc.textCase || 'uppercase', sc.autoFit !== false, sc.transparentBg === true,

                        parseFloat((dur || 4.0).toFixed(2))

                    ].join('|');

                    let h = 0;

                    for (let i = 0; i < str.length; i++) {

                        h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;

                    }

                    return 'kh_' + Math.abs(h).toString(16);

                }



                // Check cache on server

                const scChecks = kineticScenes.map(kSc => {

                    const nId = normId(kSc.id);

                    const tItem = timelineMap[nId];

                    const scDur = tItem ? parseFloat(tItem.dur || tItem.duration || 4.0) : (kSc.duration || 4.0);

                    return {

                        id: kSc.id,

                        hash: computeKineticHash(kSc, scDur)

                    };

                });



                let cachedIds = new Set();

                try {

                    const cacheRes = await fetch('/api/render/check_kinetic_cache', {

                        method: 'POST',

                        headers: { 'Content-Type': 'application/json' },

                        body: JSON.stringify({ scenes: scChecks })

                    });

                    const cacheData = await cacheRes.json();

                    if (cacheData.status === 'success' && Array.isArray(cacheData.cached)) {

                        cacheData.cached.forEach(id => {

                            cachedIds.add(String(id));

                            cachedIds.add(normId(id));

                            cachedIds.add('S' + normId(id));

                        });

                    }

                } catch(e) {

                    console.warn("Cache check failed:", e);

                }



                const toRender = kineticScenes.filter(kSc => !cachedIds.has(String(kSc.id)) && !cachedIds.has(normId(kSc.id)) && !cachedIds.has('S' + normId(kSc.id)));



                if (toRender.length === 0) {

                    logToStudio(`⚡ Visi ${kineticScenes.length} Text Writer video jau yra paruošti (Cache Hit)! Pakartotinis renderinimas praleistas.`, "success");

                    setStep(2, `⚡ [2/4] Panaudoti ${kineticScenes.length} anksčiau sugeneruoti video klipai (Cache)...`, "Visi Text Writer video jau paruošti, 0 laukimo!", 55);

                } else {

                    logToStudio(`🎬 Reikia surenderinti ${toRender.length} iš ${kineticScenes.length} Text Writer scenų (${kineticScenes.length - toRender.length} paimta iš talpyklos)...`, "cmd");



                    for (let kIdx = 0; kIdx < toRender.length; kIdx++) {

                        const kSc = toRender[kIdx];

                        const nId = normId(kSc.id);

                        const tItem = timelineMap[nId];

                        const scDur = tItem ? parseFloat(tItem.dur || tItem.duration || 4.0) : (kSc.duration || 4.0);

                        const scHash = computeKineticHash(kSc, scDur);



                        const percentVal = Math.round(25 + ((kIdx + 1) / toRender.length) * 35);

                        setStep(2, `🎬 [2/4] Renderinamas Text Writer [${kIdx+1}/${toRender.length}]: S${kSc.id}...`, `Efektas: ${kSc.effect || 'Kreida'}, Duration: ${(scDur + 2.0).toFixed(1)}s (su buferiais)...`, percentVal);



                        try {

                            const webmBlob = await window.renderKineticSceneToWebmBlob(kSc, scDur + 2.0);

                            const formData = new FormData();

                            formData.append('file', webmBlob, `kinetic_${kSc.id}.webm`);

                            formData.append('scene_id', kSc.id);

                            formData.append('hash_str', scHash);



                            await fetch('/api/render/upload_kinetic_clip', {

                                method: 'POST',

                                body: formData

                            });



                            logToStudio(`✅ Surenderintas Text Writer video: S${kSc.id} (${kSc.effect || 'efektas'}) [${(scDur+2.0).toFixed(1)}s]`, "info");

                        } catch (kErr) {

                            console.warn(`Nepavyko surenderinti kinetic scenos S${kSc.id}:`, kErr);

                        }

                    }

                }

            } else {

                setStep(2, "🖼️ [2/4] Suvedami AI vaizdai ir buferiai...", "Paruošiami perėjimų buferiai kiekvienai scenai...", 55);

            }



            const payload = {

                projectId: (proj && proj.id) || (typeof state !== 'undefined' && state.currentProjectId) || "default",

                projectName: (proj && proj.name) || "SceneUI_Project",

                fps: fps,

                resolution: resSelect,

                kenBurnsMode: kenBurnsMode,

                kenBurnsIntensity: kenBurnsIntense,

                transitionMode: transitionMode,

                transitionDur: transitionDur,

                timeline: timelineList,

                scenes: proj.scenes || [],

                outputs: proj.outputs || [],

                kineticScenes: kineticScenes,

                audioTrack: proj.audioTrack || null,

                sceneSfxById: proj.sceneSfxById || {},

                audioChunks: proj.audioChunks || [],

                sceneAudioById: proj.sceneAudioById || {},

                sceneTextById: proj.sceneTextById || {}

            };



            // Progress simulated timer for Step 3 & 4 while server works

            const timer3 = setTimeout(() => {

                setStep(3, "📜 [3/4] Generuojami FCP 7 XML, SRT ir žymekliai...", "Kuriamos tikslios laiko žymos, subtitrai ir DaVinci Resolve Motion efektai...", 75);

            }, 700);



            const timer4 = setTimeout(() => {

                setStep(4, "📦 [4/4] Archyvuojama į ZIP paketą...", "Kompresuojama medija ir XML failai į atsisiuntimo archyvą...", 90);

            }, 1600);



            const res = await fetch('/api/render/davinci_package', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                body: JSON.stringify(payload)

            });



            clearTimeout(timer3);

            clearTimeout(timer4);



            const data = await res.json();

            if (data.status !== 'success') {

                throw new Error(data.message || "Nepavyko sukurti DaVinci ZIP paketo");

            }



            // Finished successfully

            setStep(5, "✅ DaVinci Resolve ZIP Paketas Paruoštas!", `Sukurta ${data.totalScenes} scenų, trukmė: ${data.durationSec.toFixed(1)}s (${data.fps} FPS)`, 100);



            // Mark all steps green

            [s1, s2, s3, s4].forEach(el => {

                if (el) {

                    const dot = el.querySelector('.dot');

                    if (dot) dot.style.background = '#10b981';

                    el.style.color = '#fff';

                }

            });



            if (successBox) {

                successBox.classList.remove('hidden');

            }

            if (downloadLink) {

                downloadLink.href = data.zipUrl;

                downloadLink.download = data.zipName;

            }



            logToStudio(`✅ DaVinci Resolve ZIP paketas sukurtas: ${data.zipName} (${data.totalScenes} scenų, ${data.durationSec.toFixed(1)}s)`, "success");

            logToStudio(`📌 Kaip importuoti: Išskleiskite ZIP ir DaVinci Resolve spauskite File > Import > Timeline... pasirinkdami 'timeline.xml'`, "info");



            // Auto-trigger direct download

            const a = document.createElement('a');

            a.href = data.zipUrl;

            a.download = data.zipName;

            document.body.appendChild(a);

            a.click();

            document.body.removeChild(a);



            if (typeof toast === 'function') {

                toast("DaVinci ZIP Downloaded", `Project package ${data.zipName} is ready!`, "success");

            }



        } catch (err) {

            console.error("DaVinci Export Error:", err);

            logToStudio(`❌ DaVinci eksporto klaida: ${err.message}`, "error");

            if (titleEl) titleEl.textContent = `❌ Error: ${err.message}`;

            if (subEl) subEl.textContent = "Bandykite dar kartą arba patikrinkite serverio logus.";

            if (typeof toast === 'function') toast("Export Error", err.message, "error");

        } finally {

            window._isExportingDavinci = false;

            if (btnTop) {

                btnTop.disabled = false;

                btnTop.innerHTML = originalTopHtml;

            }

            if (btnRender) {

                btnRender.disabled = false;

                btnRender.innerHTML = originalRenderHtml;

            }

        }

    }



    // =========================================================================

    // GLOBAL SCENE AUDIO PLAYBACK HELPER (PRECISE TIMELINE TRACKING & TOGGLE)

    // =========================================================================

    window.playSceneAudio = function(sceneId, btnEl) {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        if (!proj) return;



        const isCurrentlyActiveBtn = btnEl && (

            btnEl.dataset.isPlaying === 'true' || 

            btnEl.classList.contains('btn-scene-audio-playing') ||

            window._playingSceneId === String(sceneId)

        );



        // Always stop any currently playing audio first

        if (window._currentPlayingAudio) {

            try {

                window._currentPlayingAudio.pause();

                window._currentPlayingAudio.ontimeupdate = null;

                window._currentPlayingAudio.onended = null;

            } catch(e) {}

            window._currentPlayingAudio = null;

        }

        if ('speechSynthesis' in window) {

            window.speechSynthesis.cancel();

        }



        document.querySelectorAll('.btn-scene-audio').forEach(b => {

            b.classList.remove('btn-scene-audio-playing');

            b.innerHTML = '🔊 Klausytis';

            b.dataset.isPlaying = 'false';

        });



        // If the user clicked the SAME button that was playing, toggle to STOP!

        if (isCurrentlyActiveBtn) {

            window._playingSceneId = null;

            return;

        }



        window._playingSceneId = String(sceneId);

        const cleanId = String(sceneId);

        const numId = cleanId.replace(/^S/i, '');

        const scIndex = (proj.scenes || []).findIndex(s => String(s.id) === cleanId || String(s.id) === numId);

        const sc = (proj.scenes || []).find(s => String(s.id) === cleanId || String(s.id) === numId);



        let audioUrl = null;



        // 1. Check sceneAudioById dictionary (direct per-scene generated audio)

        if (proj.sceneAudioById) {

            audioUrl = proj.sceneAudioById[cleanId] || 

                       proj.sceneAudioById[numId] || 

                       proj.sceneAudioById[`S${numId}`] || 

                       proj.sceneAudioById[`scene_${numId}`] || 

                       (scIndex >= 0 ? proj.sceneAudioById[scIndex] : null);

        }



        // 2. Check if individual scene audio chunk exists (100% isolated scene audio)

        if (!audioUrl && proj.audioChunks && proj.audioChunks.length > 0) {

            const chunk = proj.audioChunks.find(c => 

                String(c.sceneId) === cleanId || 

                String(c.sceneId) === numId || 

                String(c.sceneId) === `S${numId}` ||

                c.index === scIndex ||

                String(c.id) === `chunk_${scIndex}` ||

                String(c.id) === cleanId

            );

            if (chunk && (chunk.url || chunk.audioUrl)) {

                audioUrl = chunk.url || chunk.audioUrl;

            }

        }



        // 3. Check in scene object for dedicated audioUrl

        if (!audioUrl && sc && (sc.audioUrl || sc.audio || sc.audio_url)) {

            audioUrl = sc.audioUrl || sc.audio || sc.audio_url;

        }



        // If dedicated audio chunk exists, play it cleanly

        if (audioUrl) {

            const audio = new Audio(audioUrl);

            window._currentPlayingAudio = audio;

            if (btnEl) {

                btnEl.dataset.isPlaying = 'true';

                btnEl.classList.add('btn-scene-audio-playing');

                btnEl.innerHTML = '⏹️ Sustabdyti';

            }

            audio.play().catch(e => {

                console.error("Audio playback error:", e);

                if (btnEl) {

                    btnEl.dataset.isPlaying = 'false';

                    btnEl.classList.remove('btn-scene-audio-playing');

                    btnEl.innerHTML = '🔊 Klausytis';

                }

            });

            audio.onended = () => {

                window._currentPlayingAudio = null;

                window._playingSceneId = null;

                if (btnEl) {

                    btnEl.dataset.isPlaying = 'false';

                    btnEl.classList.remove('btn-scene-audio-playing');

                    btnEl.innerHTML = '🔊 Klausytis';

                }

            };

            return;

        }



        // 3. Check WhisperX word alignment in proj.alignedData or proj.timeline for EXACT speech timestamps

        let exactStart = null;

        let exactEnd = null;



        const tlItem = (proj.timeline || proj.scenesTimeline || []).find(t => String(t.id) === cleanId || String(t.id) === numId);



        if (tlItem && tlItem.originalStart !== null && tlItem.originalStart !== undefined && tlItem.originalEnd !== null && tlItem.originalEnd !== undefined) {

            exactStart = parseFloat(tlItem.originalStart);

            exactEnd = parseFloat(tlItem.originalEnd);

        } else if (tlItem && tlItem.start !== null && tlItem.start !== undefined) {

            exactStart = parseFloat(tlItem.start);

            exactEnd = (tlItem.end !== null && tlItem.end !== undefined) ? parseFloat(tlItem.end) : (exactStart + (parseFloat(tlItem.dur || tlItem.duration) || 3.0));

        }



        // Check if aligned words exist in proj.alignedData to get ultra-precise word boundaries

        if (proj.alignedData?.script_alignment?.aligned_words && sc) {

            const scText = (proj.sceneTextById && proj.sceneTextById[cleanId]) || sc.text || "";

            const tokens = scText.toLowerCase().match(/[a-z0-9]+/g) || [];

            if (tokens.length > 0) {

                const words = proj.alignedData.script_alignment.aligned_words;

                let matchIdx = -1;

                for (let i = 0; i <= words.length - tokens.length; i++) {

                    let allMatch = true;

                    for (let j = 0; j < Math.min(tokens.length, 3); j++) {

                        const wClean = (words[i + j].word || "").toLowerCase().replace(/[^a-z0-9]/g, '');

                        if (wClean !== tokens[j]) { allMatch = false; break; }

                    }

                    if (allMatch) { matchIdx = i; break; }

                }

                if (matchIdx !== -1) {

                    const slice = words.slice(matchIdx, matchIdx + tokens.length);

                    const matchedSlice = slice.filter(w => w.matched && w.start !== null && w.end !== null);

                    if (matchedSlice.length > 0) {

                        exactStart = matchedSlice[0].start;

                        exactEnd = matchedSlice[matchedSlice.length - 1].end;

                    }

                }

            }

        }



        const mainAudio = proj.audioTrack || 

                          (document.getElementById("tlAudioElement")?.src) || 

                          (document.getElementById("fullAudioPlayer")?.src);



        // If we have an audioTrack and exact start, play with natural tail padding

        if (mainAudio && exactStart !== null) {

            const audio = new Audio(mainAudio);

            audio.currentTime = Math.max(0, exactStart);

            window._currentPlayingAudio = audio;



            const targetEnd = (exactEnd !== null && exactEnd > exactStart) ? (exactEnd + 0.22) : (exactStart + (parseFloat(tlItem?.dur || 4.0)));



            if (btnEl) {

                btnEl.dataset.isPlaying = 'true';

                btnEl.classList.add('btn-scene-audio-playing');

                btnEl.innerHTML = '⏹️ Sustabdyti';

            }



            const onTimeCheck = () => {

                if (audio.currentTime >= targetEnd) {

                    audio.pause();

                    audio.removeEventListener('timeupdate', onTimeCheck);

                    window._currentPlayingAudio = null;

                    window._playingSceneId = null;

                    if (btnEl) {

                        btnEl.dataset.isPlaying = 'false';

                        btnEl.classList.remove('btn-scene-audio-playing');

                        btnEl.innerHTML = '🔊 Klausytis';

                    }

                }

            };



            audio.addEventListener('timeupdate', onTimeCheck);

            audio.onended = () => {

                audio.removeEventListener('timeupdate', onTimeCheck);

                window._currentPlayingAudio = null;

                window._playingSceneId = null;

                if (btnEl) {

                    btnEl.dataset.isPlaying = 'false';

                    btnEl.classList.remove('btn-scene-audio-playing');

                    btnEl.innerHTML = '🔊 Klausytis';

                }

            };



            audio.play().catch(e => {

                console.error("Audio track playback error:", e);

                window._currentPlayingAudio = null;

                window._playingSceneId = null;

                if (btnEl) {

                    btnEl.dataset.isPlaying = 'false';

                    btnEl.classList.remove('btn-scene-audio-playing');

                    btnEl.innerHTML = '🔊 Klausytis';

                }

            });

            return;

        }



        // 4. Fallback to Web Speech API TTS to speak ONLY this scene's exact words

        const text = (proj.sceneTextById ? (proj.sceneTextById[cleanId] || proj.sceneTextById[numId] || proj.sceneTextById[`S${numId}`]) : null) || (sc ? sc.text : null);

        if (text && 'speechSynthesis' in window) {

            try {

                window.speechSynthesis.cancel();

                const utterance = new SpeechSynthesisUtterance(text);

                utterance.rate = 1.0;

                if (btnEl) {

                    btnEl.dataset.isPlaying = 'true';

                    btnEl.classList.add('btn-scene-audio-playing');

                    btnEl.innerHTML = '⏹️ Sustabdyti';

                }

                utterance.onend = () => {

                    window._playingSceneId = null;

                    if (btnEl) {

                        btnEl.dataset.isPlaying = 'false';

                        btnEl.classList.remove('btn-scene-audio-playing');

                        btnEl.innerHTML = '🔊 Klausytis';

                    }

                };

                utterance.onerror = () => {

                    window._playingSceneId = null;

                    if (btnEl) {

                        btnEl.dataset.isPlaying = 'false';

                        btnEl.classList.remove('btn-scene-audio-playing');

                        btnEl.innerHTML = '🔊 Klausytis';

                    }

                };

                window.speechSynthesis.speak(utterance);

                if (typeof toast === 'function') toast("Garsas", `Grojamas naršyklės kalbos variklis scenai #${cleanId}`, "info");

                return;

            } catch(e) {

                console.warn("speechSynthesis error:", e);

            }

        }



        if (typeof toast === 'function') {

            toast("Garsas", `Scenei #${cleanId} dar nėra sugeneruoto garso failo. Sukurkite garsą „Balsas & Audio“ skirtuke.`, "warning");

        }

    };



    // =========================================================================

    // SCENE & EFFECTS OVERVIEW MODAL CONTROLLER

    // =========================================================================

    window.openSceneOverviewModal = function() {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        if (!proj) return;

        

        window.renderSceneOverviewTable();

        const modal = document.getElementById('modalSceneOverview');

        if (modal) modal.classList.add('show');

    };



    window.renderSceneOverviewTable = function() {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        const tbody = document.getElementById('overviewScenesTbody');

        const badge = document.getElementById('overviewSceneCountBadge');

        if (!proj || !tbody) return;



        const scenes = proj.scenes || [];

        if (badge) badge.textContent = `${scenes.length} Scenų`;



        const searchQuery = (document.getElementById('overviewSearchInput')?.value || '').toLowerCase().trim();

        tbody.innerHTML = '';



        if (scenes.length === 0) {

            tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 30px;">Nėra scenų šiame projekte.</td></tr>`;

            return;

        }



        const defaultCamera = (proj.renderSettings && proj.renderSettings.kenBurnsMode) || document.getElementById('renderKenBurnsSelect')?.value || 'constant_speed';

        const defaultTransition = (proj.renderSettings && proj.renderSettings.transitionMode) || document.getElementById('renderTransitionSelect')?.value || 'dissolve';

        const defaultFps = (proj.renderSettings && (proj.renderSettings.footageFps || proj.renderSettings.fps)) || 'default';



        scenes.forEach((sc, idx) => {

            const scId = String(sc.id || `S${idx + 1}`);

            const displayIndex = idx + 1;

            const promptText = sc.prompt || '';

            const scriptText = sc.text || (proj.sceneTextById ? proj.sceneTextById[scId] : '') || '';

            

            if (searchQuery) {

                const matches = scId.toLowerCase().includes(searchQuery) ||

                                `scena ${displayIndex}`.includes(searchQuery) ||

                                promptText.toLowerCase().includes(searchQuery) ||

                                scriptText.toLowerCase().includes(searchQuery);

                if (!matches) return;

            }



            // Check if this is a Kinetic Text scene

            const isKineticScene = (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc)) || sc.isKinetic === true || sc.type === 'kinetic' || sc.type === 'text_writer';

            const kSc = (proj.kineticScenes || []).find(k => String(k.id) === scId || String(k.id) === scId.replace(/^S/i, ''));



            // Resolve image or kinetic text card preview

            let thumbHtml = '';

            let isRealImage = false;



            if (isKineticScene) {

                const kText = kSc?.text1 || scriptText || sc.prompt || `Scene ${displayIndex}`;

                thumbHtml = `

                    <div class="overview-table-thumb" onclick="if(typeof window.openInKineticWriter==='function') window.openInKineticWriter('${scId}');" title="✍️ Kinetinio teksto scena — spustelk redaguoti Text Writer" style="width: 76px; height: 50px; border-radius: 8px; overflow: hidden; border: 1.5px dashed #00ffcc; margin: 0 auto; background: radial-gradient(circle at center, #151d2a 0%, #06090f 100%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px; text-align: center; cursor: pointer; box-shadow: 0 0 10px rgba(0,255,204,0.15); position: relative;">

                        <span style="font-size: 8px; font-weight: 800; color: #00ffcc; letter-spacing: 0.5px; text-transform: uppercase;">✍️ TEXT EFFECT</span>

                        <span style="font-size: 9px; font-weight: 700; color: #fff; line-height: 1.15; max-width: 68px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">

                            ${escapeHtml(kText)}

                        </span>

                        <div class="thumb-zoom-icon">✍️</div>

                    </div>

                `;

            } else {

                let imgUrl = '/base/empty_scene.png';

                let isVid = false;

                let posterUrl = '';

                const out = (proj.outputs || []).find(o => String(o.sceneId) === scId || String(o.sceneId) === scId.replace(/^S/i, ''));

                if (out && out.mainId && out.variations) {

                    const mainVar = out.variations.find(v => v.id === out.mainId);

                    if (mainVar && mainVar.url) {

                        imgUrl = mainVar.url;

                        isRealImage = true;

                        isVid = (mainVar.type === 'video') || imgUrl.toLowerCase().endsWith('.mp4') || imgUrl.toLowerCase().endsWith('.webm');

                        if (isVid) {

                            if (mainVar.sourceVarId) {

                                const srcV = out.variations.find(v => v.id === mainVar.sourceVarId);

                                if (srcV && srcV.url && !srcV.url.toLowerCase().endsWith('.mp4') && !srcV.url.toLowerCase().endsWith('.webm')) {

                                    posterUrl = srcV.url;

                                }

                            }

                            if (!posterUrl) {

                                const anyImg = out.variations.find(v => v.url && !v.url.toLowerCase().endsWith('.mp4') && !v.url.toLowerCase().endsWith('.webm'));

                                if (anyImg) posterUrl = anyImg.url;

                            }

                        }

                    }

                } else if (sc.refA && typeof window.resolveRefImage === 'function') {

                    const resolved = window.resolveRefImage(sc.refA);

                    imgUrl = resolved.startsWith('/') ? resolved : (resolved === 'empty_scene.png' ? `/base/${resolved}` : `/vault/${resolved}`);

                    if (imgUrl !== '/base/empty_scene.png') isRealImage = true;

                }



                let mediaThumbHtml = '';

                if (isVid) {

                    if (posterUrl) {

                        mediaThumbHtml = `<img src="${posterUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/base/empty_scene.png';" /><span style="position: absolute; top: 3px; right: 4px; font-size: 10px; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">🎬</span>`;

                    } else {

                        mediaThumbHtml = `<video src="${imgUrl}#t=0.1" preload="metadata" muted playsinline style="width: 100%; height: 100%; object-fit: cover;"></video><span style="position: absolute; top: 3px; right: 4px; font-size: 10px; text-shadow: 0 1px 3px rgba(0,0,0,0.8);">🎬</span>`;

                    }

                } else {

                    mediaThumbHtml = `<img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='/base/empty_scene.png';" />`;

                }



                thumbHtml = `

                    <div class="overview-table-thumb" onclick="if(typeof window.openViewer==='function') window.openViewer('${scId}');" title="🔍 Spustelėkite peržiūrėti pilnu ekranu ir redaguoti" style="width: 76px; height: 50px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); margin: 0 auto; background: #000; position: relative;">

                        ${mediaThumbHtml}

                        <div class="thumb-zoom-icon">${isVid ? '🎬' : '🔍'}</div>

                    </div>

                `;

            }



            // Duration from timeline or scene

            let dur = sc.duration || 4.0;

            const tlItem = (proj.timeline || []).find(t => String(t.id) === scId || String(t.id) === scId.replace(/^S/i, ''));

            if (tlItem && (tlItem.dur || tlItem.duration)) {

                dur = parseFloat(tlItem.dur || tlItem.duration);

            }



            // Camera motion assigned

            const curMotion = sc.cameraMotion || sc.kenBurns || defaultCamera;

            // Transition into next

            const curTrans = sc.transition || defaultTransition;

            // Footage FPS assigned

            const curFps = sc.footageFps || sc.fps || defaultFps;

            

            // Kinetic effect: Only defaults to active effect if this is an actual kinetic scene or explicitly assigned!

            let curKinetic = 'none';

            if (isKineticScene) {

                curKinetic = sc.kineticEffect || (kSc ? kSc.effect : 'typewriter') || 'typewriter';

            } else {

                curKinetic = sc.kineticEffect || sc.textEffect || 'none';

            }



            const tr = document.createElement('tr');

            tr.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.08); transition: background 0.15s ease;';

            tr.onmouseenter = () => tr.style.background = 'rgba(255,255,255,0.035)';

            tr.onmouseleave = () => tr.style.background = 'transparent';



            tr.innerHTML = `

                <td style="padding: 10px; text-align: center;">

                    <span style="font-weight: 800; color: #00ffcc; font-size: 12px; background: rgba(0,255,204,0.1); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(0,255,204,0.25);">

                        #${displayIndex}

                    </span>

                    <div style="font-size: 9px; color: var(--muted); margin-top: 2px;">ID: ${scId}</div>

                    ${isKineticScene ? '<span class="badge" style="font-size:8px; padding:1px 4px; background:rgba(245,158,11,0.2); color:#fde68a; border:1px solid rgba(245,158,11,0.3); margin-top:3px; display:inline-block;">KINETIC</span>' : ''}

                </td>

                <td style="padding: 10px; text-align: center;">

                    ${thumbHtml}

                </td>

                <td style="padding: 10px;">

                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">

                        <div style="font-size: 11.5px; font-weight: 700; color: #fff; line-height: 1.35; flex: 1;">

                            ${isKineticScene ? `<span style="color:#fde68a;">✍️ [Text Card]:</span> ` : ''}${escapeHtml(scriptText || (isKineticScene ? (kSc?.text1 || sc.prompt) : '(Be scenarijaus teksto)'))}

                        </div>

                        <button type="button" class="btn-scene-audio" onclick="window.playSceneAudio('${scId}', this)" title="Perklausyti šios scenos garsą">

                            🔊 Klausytis

                        </button>

                    </div>

                    <div style="font-size: 10.5px; color: var(--muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px;" title="${escapeHtml(promptText)}">

                        🎨 ${escapeHtml(promptText || (isKineticScene ? 'Kinetic Text Effect Scene' : 'No prompt'))}

                    </div>

                </td>

                <td style="padding: 10px; text-align: center;">

                    <div class="flex items-center justify-center" style="gap: 3px;">

                        <input type="number" class="overview-dur-input" data-scene-id="${scId}" value="${dur.toFixed(1)}" min="0.5" max="60" step="0.1" style="width: 50px; padding: 4px 6px; font-size: 11px; text-align: center; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); color: #fff;" />

                        <span style="font-size: 10px; color: var(--muted); font-weight: 700;">s</span>

                    </div>

                </td>

                <td style="padding: 10px;">

                    <select class="overview-motion-select" data-scene-id="${scId}" style="padding: 5px 8px; font-size: 11px; width: 100%; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(56,189,248,0.3); color: #bae6fd; font-weight: 600;">

                        <option value="constant_speed" ${curMotion === 'constant_speed' ? 'selected' : ''}>⚡ Constant Zoom-In</option>

                        <option value="constant_speed_out" ${curMotion === 'constant_speed_out' ? 'selected' : ''}>⚡ Constant Zoom-Out</option>

                        <option value="cinematic" ${curMotion === 'cinematic' ? 'selected' : ''}>🎯 Cinematic Smooth</option>

                        <option value="zoom_out" ${curMotion === 'zoom_out' ? 'selected' : ''}>🔍 Zoom-Out Reveal</option>

                        <option value="zoom_in_out" ${curMotion === 'zoom_in_out' ? 'selected' : ''}>🔄 Center Pulse</option>

                        <option value="pan_left" ${curMotion === 'pan_left' ? 'selected' : ''}>⬅️ Pan Left</option>

                        <option value="pan_right" ${curMotion === 'pan_right' ? 'selected' : ''}>➡️ Pan Right</option>

                        <option value="pan_up" ${curMotion === 'pan_up' ? 'selected' : ''}>⬆️ Pan Up</option>

                        <option value="pan_down" ${curMotion === 'pan_down' ? 'selected' : ''}>⬇️ Pan Down</option>

                        <option value="drift" ${curMotion === 'drift' ? 'selected' : ''}>💫 Cinematic Drift</option>

                        <option value="random" ${curMotion === 'random' ? 'selected' : ''}>🌀 Random</option>

                        <option value="disabled" ${curMotion === 'disabled' ? 'selected' : ''}>🚫 Static</option>

                    </select>

                </td>

                <td style="padding: 10px;">

                    <select class="overview-trans-select" data-scene-id="${scId}" style="padding: 5px 8px; font-size: 11px; width: 100%; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(236,72,153,0.3); color: #fbcfe8; font-weight: 600;">

                        <option value="dissolve" ${curTrans === 'dissolve' ? 'selected' : ''}>🌊 Dissolve</option>

                        <option value="cut" ${curTrans === 'cut' ? 'selected' : ''}>✂️ Direct Cut</option>

                        <option value="fade_black" ${curTrans === 'fade_black' ? 'selected' : ''}>🌑 Fade Black</option>

                        <option value="fade_white" ${curTrans === 'fade_white' ? 'selected' : ''}>⚪ Fade White</option>

                        <option value="slide_left" ${curTrans === 'slide_left' ? 'selected' : ''}>⬅️ Slide Left</option>

                        <option value="slide_right" ${curTrans === 'slide_right' ? 'selected' : ''}>➡️ Slide Right</option>

                        <option value="smooth_left" ${curTrans === 'smooth_left' ? 'selected' : ''}>💨 Smooth Left</option>

                        <option value="wipe_left" ${curTrans === 'wipe_left' ? 'selected' : ''}>🪟 Wipe Left</option>

                        <option value="circle_crop" ${curTrans === 'circle_crop' ? 'selected' : ''}>⭕ Circle Crop</option>

                        <option value="zoom_in" ${curTrans === 'zoom_in' ? 'selected' : ''}>🔭 Zoom Push</option>

                    </select>

                </td>

                <td style="padding: 10px; text-align: center;">

                    <select class="overview-fps-select" data-scene-id="${scId}" style="padding: 5px 8px; font-size: 11px; width: 100%; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid ${String(curFps) !== 'default' ? 'rgba(165,180,252,0.6)' : 'rgba(255,255,255,0.15)'}; color: ${String(curFps) !== 'default' ? '#c7d2fe' : 'var(--muted)'}; font-weight: ${String(curFps) !== 'default' ? '700' : 'normal'};">

                        <option value="default" ${String(curFps) === 'default' ? 'selected' : ''}>⚡ Sklandus (Render)</option>

                        <option value="24" ${String(curFps) === '24' ? 'selected' : ''}>🎬 24 FPS Kino filmas</option>

                        <option value="16" ${String(curFps) === '16' ? 'selected' : ''}>🕷️ 16 FPS Spider-Verse</option>

                        <option value="12" ${String(curFps) === '12' ? 'selected' : ''}>🎞️ 12 FPS Stop-Motion</option>

                        <option value="8" ${String(curFps) === '8' ? 'selected' : ''}>👾 8 FPS Retro Glitch</option>

                    </select>

                </td>

                <td style="padding: 10px;">

                    <select class="overview-kinetic-select" data-scene-id="${scId}" style="padding: 5px 8px; font-size: 11px; width: 100%; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid ${curKinetic !== 'none' ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.15)'}; color: ${curKinetic !== 'none' ? '#fde68a' : 'var(--muted)'}; font-weight: ${curKinetic !== 'none' ? '700' : 'normal'};">

                        <option value="none" ${curKinetic === 'none' ? 'selected' : ''}>🚫 Be teksto (Originalas)</option>

                        <option value="typewriter" ${curKinetic === 'typewriter' ? 'selected' : ''}>⌨️ Typewriter</option>

                        <option value="wiggly_sketch" ${curKinetic === 'wiggly_sketch' ? 'selected' : ''}>✏️ Wiggly Sketch</option>

                        <option value="stopmotion_sketch" ${curKinetic === 'stopmotion_sketch' ? 'selected' : ''}>🎬 Stopmotion</option>

                        <option value="cia_intro" ${curKinetic === 'cia_intro' ? 'selected' : ''}>🕵️ CIA Intro</option>

                        <option value="vhs_glitch" ${curKinetic === 'vhs_glitch' ? 'selected' : ''}>📼 VHS Glitch</option>

                        <option value="neon_glow" ${curKinetic === 'neon_glow' ? 'selected' : ''}>💡 Neon Glow</option>

                        <option value="matrix" ${curKinetic === 'matrix' ? 'selected' : ''}>📟 Matrix Code</option>

                    </select>

                </td>

            `;



            tbody.appendChild(tr);

        });



        tbody.querySelectorAll('select, input').forEach(el => {

            el.addEventListener('change', () => {

                window.saveSceneOverviewChangesSilent();

            });

        });

    };



    window.applyBatchCameraOverview = function() {

        const val = document.getElementById('overviewBatchCamera')?.value;

        if (!val) return;

        document.querySelectorAll('.overview-motion-select').forEach(sel => sel.value = val);

        window.saveSceneOverviewChangesSilent();

        if (typeof toast === 'function') toast("Camera Updated", `Visiems nustatyta kamera: ${val}`, "info");

    };



    window.applyBatchTransitionOverview = function() {

        const val = document.getElementById('overviewBatchTransition')?.value;

        if (!val) return;

        document.querySelectorAll('.overview-trans-select').forEach(sel => sel.value = val);

        window.saveSceneOverviewChangesSilent();

        if (typeof toast === 'function') toast("Transition Updated", `Visiems nustatytas perėjimas: ${val}`, "info");

    };



    window.applyBatchFpsOverview = function() {

        const val = document.getElementById('overviewBatchFps')?.value;

        if (!val) return;

        document.querySelectorAll('.overview-fps-select').forEach(sel => sel.value = val);

        window.saveSceneOverviewChangesSilent();

        if (typeof toast === 'function') toast("Footage FPS", `Visiems vaizdams nustatytas FPS: ${val === 'default' ? 'Sklandus (Render)' : val + ' FPS'}`, "info");

    };



    window.applyBatchKineticOverview = function() {

        const val = document.getElementById('overviewBatchKinetic')?.value;

        if (!val) return;

        document.querySelectorAll('.overview-kinetic-select').forEach(sel => sel.value = val);

        window.saveSceneOverviewChangesSilent();

        if (typeof toast === 'function') toast("Text Effect", `Visiems nustatytas teksto efektas: ${val}`, "info");

    };



    window.saveSceneOverviewChangesSilent = function() {

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;

        if (!proj) return;



        document.querySelectorAll('.overview-dur-input').forEach(input => {

            const scId = input.dataset.sceneId;

            const dur = parseFloat(input.value) || 4.0;

            const sc = (proj.scenes || []).find(s => String(s.id) === scId);

            if (sc) sc.duration = dur;



            if (proj.timeline) {

                const tl = proj.timeline.find(t => String(t.id) === scId);

                if (tl) {

                    tl.dur = dur;

                    tl.duration = dur;

                }

            }

        });



        document.querySelectorAll('.overview-motion-select').forEach(sel => {

            const scId = sel.dataset.sceneId;

            const sc = (proj.scenes || []).find(s => String(s.id) === scId);

            if (sc) sc.cameraMotion = sel.value;

        });



        document.querySelectorAll('.overview-trans-select').forEach(sel => {

            const scId = sel.dataset.sceneId;

            const sc = (proj.scenes || []).find(s => String(s.id) === scId);

            if (sc) sc.transition = sel.value;

        });



        document.querySelectorAll('.overview-fps-select').forEach(sel => {

            const scId = sel.dataset.sceneId;

            const sc = (proj.scenes || []).find(s => String(s.id) === scId);

            if (sc) {

                sc.footageFps = sel.value;

                sc.fps = (sel.value === 'default' || !sel.value) ? null : parseInt(sel.value, 10);

            }

        });



        document.querySelectorAll('.overview-kinetic-select').forEach(sel => {

            const scId = sel.dataset.sceneId;

            const effect = sel.value;

            const sc = (proj.scenes || []).find(s => String(s.id) === scId);

            if (sc) sc.kineticEffect = effect;



            if (!proj.kineticScenes) proj.kineticScenes = [];

            let kSc = proj.kineticScenes.find(k => String(k.id) === scId || String(k.id) === scId.replace(/^S/i, ''));

            if (effect === 'none') {

                if (kSc && (!sc || !sc.isKinetic)) {

                    proj.kineticScenes = proj.kineticScenes.filter(k => String(k.id) !== scId && String(k.id) !== scId.replace(/^S/i, ''));

                }

            } else {

                if (!kSc) {

                    kSc = {

                        id: scId,

                        text1: sc ? (sc.text || sc.prompt || `Scene ${scId}`) : `Scene ${scId}`,

                        text2: "",

                        effect: effect,

                        speed: 1.0,

                        duration: sc ? (sc.duration || 4.0) : 4.0

                    };

                    proj.kineticScenes.push(kSc);

                } else {

                    kSc.effect = effect;

                }

            }

        });



        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

        if (typeof window.updateStudioCockpitChips === 'function') window.updateStudioCockpitChips();

    };



    window.saveSceneOverviewChanges = function() {

        window.saveSceneOverviewChangesSilent();

        const modal = document.getElementById('modalSceneOverview');

        if (modal) modal.classList.remove('show');

        if (typeof toast === 'function') toast("Saved", "Scenų ir efektų nustatymai išsaugoti ir paruošti renderiui!", "success");

    };



    window.initRenderTab = initRenderControlListeners;

    window.startFinalVideoRender = startFinalVideoRender;

    window.exportDavinciResolvePackage = exportDavinciResolvePackage;



    function initRenderModule() {

        initRenderControlListeners();



        const searchOverview = document.getElementById('overviewSearchInput');

        if (searchOverview) searchOverview.addEventListener('input', () => window.renderSceneOverviewTable());



        const btnBatchCam = document.getElementById('btnApplyBatchCamera');

        if (btnBatchCam) btnBatchCam.addEventListener('click', () => window.applyBatchCameraOverview());



        const btnBatchTrans = document.getElementById('btnApplyBatchTransition');

        if (btnBatchTrans) btnBatchTrans.addEventListener('click', () => window.applyBatchTransitionOverview());



        const btnBatchFps = document.getElementById('btnApplyBatchFps');

        if (btnBatchFps) btnBatchFps.addEventListener('click', () => window.applyBatchFpsOverview());



        const btnBatchKin = document.getElementById('btnApplyBatchKinetic');

        if (btnBatchKin) btnBatchKin.addEventListener('click', () => window.applyBatchKineticOverview());



        const btnSaveOverview = document.getElementById('btnOverviewSaveApply');

        if (btnSaveOverview) btnSaveOverview.addEventListener('click', () => window.saveSceneOverviewChanges());

    }



    if (document.readyState === 'loading') {

        document.addEventListener('DOMContentLoaded', initRenderModule);

    } else {

        initRenderModule();

    }



})();