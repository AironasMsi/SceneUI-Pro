// ============================================================================
// KINETIC TEXT WRITER EFFECTS WORKSTATION (PRO ADVANCED) - text_writer.js
// ============================================================================

(function() {
    const BUILTIN_PRESETS = {
        "wiggly_sketch": {
            name: "✏️ Kreidos & Esdino Efektas",
            effect: "wiggly_sketch", font: "'Permanent Marker', cursive", weight: "bold",
            textColor: "#ffffff", bgColor: "#000000",
            speed: 1.0, intensity: 20, size1: 65, size2: 44, titleRatio: 1.5, duration: 4
        },
        "stopmotion_sketch": {
            name: "🎬 Stop-Motion Sketch",
            effect: "stopmotion_sketch", font: "'Permanent Marker', cursive", weight: "bold",
            textColor: "#ffffff", bgColor: "#111625",
            speed: 0.9, intensity: 22, size1: 60, size2: 40, titleRatio: 1.5, duration: 4
        },
        "cia_intro": {
            name: "🕵️ Classified Dossier Intro",
            effect: "cia_intro", font: "'Impact', sans-serif", weight: "bold",
            textColor: "#ffffff", bgColor: "#090a0f",
            speed: 1.2, intensity: 15, size1: 70, size2: 46, titleRatio: 1.5, duration: 4
        },
        "vhs_glitch": {
            name: "📼 VHS Retro Glitch",
            effect: "vhs_glitch", font: "'Press Start 2P', monospace", weight: "normal",
            textColor: "#00ffff", bgColor: "#0a0512",
            speed: 1.5, intensity: 25, size1: 45, size2: 30, titleRatio: 1.5, duration: 3
        },
        "blueprint_sketch": {
            name: "📐 Architectural Blueprint",
            effect: "blueprint_sketch", font: "'Courier Prime', monospace", weight: "bold",
            textColor: "#ffffff", bgColor: "#0a192f",
            speed: 0.8, intensity: 12, size1: 58, size2: 38, titleRatio: 1.5, duration: 5
        },
        "synthwave_grid": {
            name: "🌆 Synthwave Cyber Grid",
            effect: "synthwave_grid", font: "'Rubik Mono One', sans-serif", weight: "bold",
            textColor: "#ff00aa", bgColor: "#0d021a",
            speed: 1.1, intensity: 18, size1: 55, size2: 36, titleRatio: 1.5, duration: 4
        },
        "comic_pop": {
            name: "💥 Comic Pop Action",
            effect: "comic_pop", font: "'Impact', sans-serif", weight: "bold",
            textColor: "#ffea00", bgColor: "#120024",
            speed: 1.3, intensity: 25, size1: 72, size2: 48, titleRatio: 1.5, duration: 3
        },
        "gold_sparkle": {
            name: "✨ Holivudo Aukso Spindesys",
            effect: "gold_sparkle", font: "'Sacramento', cursive", weight: "bold",
            textColor: "#ffd700", bgColor: "#080600",
            speed: 0.9, intensity: 20, size1: 85, size2: 56, titleRatio: 1.5, duration: 5
        },
        "typewriter": {
            name: "⌨️ Classic Typewriter",
            effect: "typewriter", font: "'Courier Prime', monospace", weight: "normal",
            textColor: "#f8fafc", bgColor: "#111118",
            speed: 1.0, intensity: 10, size1: 48, size2: 32, titleRatio: 1.5, duration: 5
        },
        "matrix": {
            name: "📟 Skaitmeninis Matrix Dreifas",
            effect: "matrix", font: "'Courier Prime', monospace", weight: "bold",
            textColor: "#00ff66", bgColor: "#020a04",
            speed: 1.5, intensity: 30, size1: 52, size2: 34, titleRatio: 1.5, duration: 4
        },
        "neon_glow": {
            name: "💡 Cyberpunk Neon Glow",
            effect: "neon_glow", font: "'Inter', sans-serif", weight: "bold",
            textColor: "#00f0ff", bgColor: "#050510",
            speed: 1.0, intensity: 25, size1: 65, size2: 44, titleRatio: 1.5, duration: 4
        },
        "scary_shake": {
            name: "👻 Horror Cinematic Impact",
            effect: "scary_shake", font: "'Permanent Marker', cursive", weight: "bold",
            textColor: "#ff2222", bgColor: "#0a0000",
            speed: 1.8, intensity: 35, size1: 60, size2: 40, titleRatio: 1.5, duration: 3
        }
    };

    let customPresets = {};
    try {
        customPresets = JSON.parse(localStorage.getItem('kinetic_custom_presets') || '{}');
    } catch(e) { customPresets = {}; }

    let defaultKineticScenes = [
        {
            id: 'S23',
            text1: "BUSINESS 20:",
            text2: "High-Rise & Commercial Window Cleaning",
            effect: "wiggly_sketch",
            font: "'Permanent Marker', cursive",
            weight: "bold",
            textColor: "#ffffff",
            bgColor: "#000000",
            speed: 1.0,
            intensity: 20,
            size1: 65,
            size2: 44,
            titleRatio: 1.5,
            lineGap: 45,
            duration: 4,
            fps: 30,
            textAlign: "center",
            textCase: "uppercase",
            autoFit: true,
            transparentBg: false
        }
    ];

    let activeSceneId = null;
    let isPlaying = true;
    let animationFrameId = null;
    let charOffscreen = null;
    let charOffCtx = null;
    let sceneSearchQuery = "";

    window.resetKineticActiveScene = function() {
        activeSceneId = null;
        if (window._kMediaElements) {
            window._kMediaElements = {};
        }
    };

    function getKineticScenes() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (proj) {
            if (!proj.kineticScenes) {
                proj.kineticScenes = [];
            }
            return proj.kineticScenes;
        }
        return [];
    }

    function getActiveScene() {
        const scenes = getKineticScenes();
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!activeSceneId && proj && proj.lastActiveKineticSceneId) {
            activeSceneId = proj.lastActiveKineticSceneId;
        }
        let sc = scenes.find(s => s.id === activeSceneId);
        if (!sc && scenes.length > 0) {
            sc = scenes[0];
            activeSceneId = sc.id;
        }
        if (proj && sc) {
            proj.lastActiveKineticSceneId = sc.id;
        }
        return sc;
    }

    function initOffscreenCanvas() {
        if (!charOffscreen) {
            charOffscreen = document.createElement('canvas');
            charOffCtx = charOffscreen.getContext('2d');
        }
    }

    function applyTextCase(text, mode) {
        if (!text) return "";
        if (mode === "uppercase") return text.toUpperCase();
        if (mode === "lowercase") return text.toLowerCase();
        if (mode === "titlecase") {
            return text.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        }
        return text;
    }

    function renderWigglyLine(targetCtx, text, cx, cy, fontStyle, color, size, intense, frameIndex, align = "center", scale = 1.0) {
        if (!text) return;
        initOffscreenCanvas();

        const parsedSize = isNaN(parseFloat(size)) ? 50 : Math.max(10, parseFloat(size));
        const parsedIntense = isNaN(parseFloat(intense)) ? 15 : parseFloat(intense);

        targetCtx.font = fontStyle.replace('$SIZE$', Math.round(parsedSize));
        const totalW = targetCtx.measureText(text).width;

        let currentX = cx - totalW / 2;
        if (align === "left") currentX = cx - targetCtx.canvas.width * 0.4;
        else if (align === "right") currentX = cx + targetCtx.canvas.width * 0.4 - totalW;

        const boilStep = Math.floor(frameIndex / 3);
        const canvasSize = Math.max(240, Math.ceil(parsedSize * 2.5));
        if (charOffscreen.width !== canvasSize || charOffscreen.height !== canvasSize) {
            charOffscreen.width = canvasSize;
            charOffscreen.height = canvasSize;
        }
        const charCenter = canvasSize / 2;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            const chWidth = targetCtx.measureText(ch).width;
            if (ch === ' ') {
                currentX += chWidth;
                continue;
            }

            const charCX = currentX + chWidth / 2;
            const charSeed = boilStep * 23 + i * 17;

            charOffCtx.clearRect(0, 0, canvasSize, canvasSize);
            charOffCtx.font = fontStyle.replace('$SIZE$', Math.round(parsedSize));
            charOffCtx.fillStyle = color;
            charOffCtx.textAlign = "center";
            charOffCtx.textBaseline = "middle";
            charOffCtx.fillText(ch, charCenter, charCenter);

            const charOffX = Math.sin(charSeed * 1.3) * (parsedIntense * 0.18);
            const charOffY = Math.cos(charSeed * 1.7) * (parsedIntense * 0.18);
            const charRot = Math.sin(charSeed * 2.1) * (parsedIntense * 0.008);
            const charScaleY = 1 + Math.sin(charSeed * 3.1) * (parsedIntense * 0.006);

            targetCtx.save();
            targetCtx.translate(charCX + charOffX, cy + charOffY);
            targetCtx.rotate(charRot);
            targetCtx.scale(1, charScaleY);

            const sliceH = Math.max(6, Math.floor(parsedSize / 5));
            const startY = Math.max(0, charCenter - Math.floor(parsedSize));
            const endY = Math.min(canvasSize, charCenter + Math.floor(parsedSize));

            for (let srcY = startY; srcY < endY; srcY += sliceH) {
                const sIdx = Math.floor(srcY / sliceH);
                const strokeDistort = Math.sin(charSeed * 0.7 + sIdx * 0.5) * (parsedIntense * 0.15);
                const strokeScaleX = 1 + Math.cos(charSeed * 0.9 + sIdx * 0.35) * (parsedIntense * 0.005);

                targetCtx.save();
                targetCtx.translate(strokeDistort, -charCenter + srcY + sliceH / 2);
                targetCtx.scale(strokeScaleX, 1);

                targetCtx.drawImage(
                    charOffscreen,
                    0, srcY, canvasSize, sliceH,
                    -charCenter, -sliceH / 2, canvasSize, sliceH
                );
                targetCtx.restore();
            }

            targetCtx.restore();
            currentX += chWidth;
        }
    }

    function renderTwoLines(targetCtx, cx, cy, text1, text2, fontStyle, color, size1, size2, lineGap, align = "center", scale = 1.0) {
        targetCtx.fillStyle = color;
        targetCtx.textAlign = align;

        let posX = cx;
        if (align === "left") posX = targetCtx.canvas.width * 0.08;
        else if (align === "right") posX = targetCtx.canvas.width * 0.92;

        targetCtx.font = fontStyle.replace('$SIZE$', Math.round(size1));
        targetCtx.fillText(text1, posX, cy - lineGap * scale);
        targetCtx.font = fontStyle.replace('$SIZE$', Math.round(size2));
        targetCtx.fillText(text2, posX, cy + lineGap * scale);
    }

    // Proportional Auto-Fit Engine (Preserves Title vs Subtitle Ratio)
    function calculateSmartFitSizes(targetCtx, t1, t2, fontStyle, origSize1, titleRatio, canvasWidth) {
        const maxAllowedW = canvasWidth * 0.85;
        let s1 = origSize1;
        let ratio = isNaN(parseFloat(titleRatio)) ? 1.5 : Math.max(1.0, parseFloat(titleRatio));
        let s2 = Math.round(s1 / ratio);

        targetCtx.font = fontStyle.replace('$SIZE$', Math.round(s1));
        let w1 = t1 ? targetCtx.measureText(t1).width : 0;

        targetCtx.font = fontStyle.replace('$SIZE$', Math.round(s2));
        let w2 = t2 ? targetCtx.measureText(t2).width : 0;

        let maxLineW = Math.max(w1, w2);

        if (maxLineW > maxAllowedW) {
            let scaleFactor = maxAllowedW / maxLineW;
            s1 = Math.max(20, s1 * scaleFactor);
            s2 = Math.max(14, Math.round(s1 / ratio));
        }

        return { s1, s2 };
    }

    function renderFrame(targetCtx, w, h, scene, timeSec, frameIndex) {
        if (!scene) return;
        const scale = h / 480;

        let t1 = applyTextCase(scene.text1 || "", scene.textCase || "uppercase");
        let t2 = applyTextCase(scene.text2 || "", scene.textCase || "uppercase");
        const effect = scene.effect || "wiggly_sketch";
        const spd = isNaN(parseFloat(scene.speed)) ? 1.0 : parseFloat(scene.speed);
        const intense = (isNaN(parseFloat(scene.intensity)) ? 15 : parseFloat(scene.intensity)) * scale;
        const mainColor = scene.textColor || "#ffffff";
        const fontStyle = `${scene.weight || 'bold'} $SIZE$px ${scene.font || 'Impact'}`;
        const align = scene.textAlign || "center";
        const isAutoFit = scene.autoFit !== false;
        const titleRatio = isNaN(parseFloat(scene.titleRatio)) ? 1.5 : parseFloat(scene.titleRatio);

        let baseSize1 = (isNaN(parseInt(scene.size1)) ? 65 : parseInt(scene.size1)) * scale;
        let baseSize2 = Math.round(baseSize1 / titleRatio);

        if (isAutoFit) {
            const fitted = calculateSmartFitSizes(targetCtx, t1, t2, fontStyle, baseSize1, titleRatio, w);
            baseSize1 = fitted.s1;
            baseSize2 = fitted.s2;
        } else {
            baseSize2 = (isNaN(parseInt(scene.size2)) ? 44 : parseInt(scene.size2)) * scale;
        }

        const lineGap = (isNaN(parseInt(scene.lineGap)) ? 45 : parseInt(scene.lineGap));

        if (scene.transparentBg) {
            targetCtx.clearRect(0, 0, w, h);
        } else {
            targetCtx.fillStyle = scene.bgColor || "#000000";
            targetCtx.fillRect(0, 0, w, h);
        }

        // Helper: draw image/video with cover fit (preserves aspect ratio without stretching)
        function drawCoverMedia(ctx, el, dw, dh) {
            const sw = el.naturalWidth || el.videoWidth || el.width;
            const sh = el.naturalHeight || el.videoHeight || el.height;
            if (!sw || !sh) {
                ctx.drawImage(el, 0, 0, dw, dh);
                return;
            }
            const rSrc = sw / sh;
            const rDst = dw / dh;
            let sx = 0, sy = 0, sCropW = sw, sCropH = sh;
            if (rSrc > rDst) {
                sCropW = sh * rDst;
                sx = (sw - sCropW) / 2;
            } else {
                sCropH = sw / rDst;
                sy = (sh - sCropH) / 2;
            }
            ctx.drawImage(el, sx, sy, sCropW, sCropH, 0, 0, dw, dh);
        }

        // Background media (Photo / Video)
        let bgMedia = scene.bgMedia || scene.mediaUrl;
        if (!bgMedia && typeof window.getProj === 'function') {
            const proj = window.getProj();
            const scNum = parseInt(String(scene.id).replace(/\D/g, ''), 10);
            const out = (proj?.outputs || []).find(o => {
                if (!o || !o.sceneId) return false;
                if (o.sceneId === scene.id || String(o.sceneId).toLowerCase() === String(scene.id).toLowerCase()) return true;
                const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
                return !isNaN(scNum) && !isNaN(oNum) && scNum === oNum;
            });
            if (out && out.variations && out.variations.length > 0) {
                const doneVar = out.variations.find(v => v.id === out.mainId) || out.variations.slice().reverse().find(v => v && v.status === 'done' && v.url);
                if (doneVar && doneVar.url) {
                    bgMedia = doneVar.url;
                    scene.bgMedia = bgMedia;
                }
            }
        }

        if (bgMedia) {
            if (!window._kMediaElements) window._kMediaElements = {};
            let mEl = window._kMediaElements[bgMedia];
            const isVid = bgMedia.toLowerCase().endsWith('.mp4') || bgMedia.toLowerCase().endsWith('.webm');
            if (!mEl) {
                if (isVid) {
                    mEl = document.createElement('video');
                    mEl.src = bgMedia;
                    mEl.muted = true;
                    mEl.loop = true;
                    mEl.playsInline = true;
                    mEl.play().catch(() => {});
                } else {
                    mEl = new Image();
                    mEl.src = bgMedia;
                }
                window._kMediaElements[bgMedia] = mEl;
            }
            try {
                targetCtx.save();
                const opacity = scene.bgMediaOpacity !== undefined ? parseFloat(scene.bgMediaOpacity) : 1.0;
                const blur = scene.bgMediaBlur !== undefined ? parseFloat(scene.bgMediaBlur) : 0;
                
                if (!isNaN(opacity) && opacity < 1.0) {
                    targetCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
                }
                if (!isNaN(blur) && blur > 0) {
                    targetCtx.filter = `blur(${blur}px)`;
                }

                if (isVid) {
                    if (mEl.readyState >= 2) drawCoverMedia(targetCtx, mEl, w, h);
                } else {
                    if (mEl.complete && mEl.naturalWidth > 0) drawCoverMedia(targetCtx, mEl, w, h);
                }
                targetCtx.restore();
            } catch (mErr) {
                targetCtx.restore();
            }

            // Dim overlay
            const dim = scene.bgMediaDim !== undefined ? scene.bgMediaDim : 0.4;
            if (dim > 0) {
                targetCtx.fillStyle = `rgba(0, 0, 0, ${dim})`;
                targetCtx.fillRect(0, 0, w, h);
            }
        }

        // Mode: Clean Image Only (no kinetic text rendered if hideText is true)
        if (scene.hideText) {
            return;
        }

        let x = w / 2;
        let y = h / 2;
        targetCtx.textAlign = align;
        targetCtx.textBaseline = "middle";

        const timeFactor = timeSec * spd * 3.0;
        targetCtx.save();

        // Entrance transition easing (fade_in, slide_up, pop_zoom)
        const entrance = scene.entrance || 'fade_in';
        const dur = scene.duration || 4.0;
        const loopT = timeSec % dur;
        const enterT = Math.min(1.0, loopT / 0.6);
        let enterAlpha = 1.0;
        let enterOffsetY = 0;
        let enterScale = 1.0;
        if (enterT < 1.0 && entrance !== 'none') {
            if (entrance === 'fade_in') {
                enterAlpha = enterT;
            } else if (entrance === 'slide_up') {
                enterAlpha = enterT;
                enterOffsetY = (1.0 - Math.sin(enterT * Math.PI / 2)) * 40 * scale;
            } else if (entrance === 'pop_zoom') {
                enterAlpha = Math.min(1.0, enterT * 1.5);
                enterScale = 0.6 + 0.4 * Math.sin(enterT * Math.PI / 2);
            }
        }

        targetCtx.globalAlpha = enterAlpha;
        targetCtx.translate(x, y + enterOffsetY);
        if (enterScale !== 1.0) targetCtx.scale(enterScale, enterScale);
        targetCtx.translate(-x, -y);

        if (effect === 'wiggly_sketch') {
            renderWigglyLine(targetCtx, t1, x, y - lineGap * scale, fontStyle, mainColor, baseSize1, intense, frameIndex, align, scale);
            renderWigglyLine(targetCtx, t2, x, y + lineGap * scale, fontStyle, mainColor, baseSize2, intense, frameIndex, align, scale);

        } else if (effect === 'stopmotion_sketch') {
            let boilStep = Math.floor(frameIndex / 3);
            if (!scene.transparentBg) {
                targetCtx.fillStyle = scene.bgColor || "#111625";
                targetCtx.fillRect(0, 0, w, h);
            }

            targetCtx.strokeStyle = "rgba(255, 255, 255, 0.05)";
            targetCtx.lineWidth = Math.max(1, 1 * scale);
            for (let ly = 40 * scale; ly < h; ly += 24 * scale) {
                let lineJitter = Math.sin(boilStep * 7.7 + ly) * (1.5 * scale);
                targetCtx.beginPath();
                targetCtx.moveTo(0, ly + lineJitter);
                targetCtx.lineTo(w, ly + lineJitter);
                targetCtx.stroke();
            }

            targetCtx.save();
            let rotAngle = Math.sin(boilStep * 13.3) * (intense * 0.002);
            let centerJx = Math.sin(boilStep * 19.1) * (intense * 0.15);
            let centerJy = Math.cos(boilStep * 23.7) * (intense * 0.15);

            targetCtx.translate(x + centerJx, y + centerJy);
            targetCtx.rotate(rotAngle);

            for (let stroke = 0; stroke < 3; stroke++) {
                let sjx = Math.sin(boilStep * 31 + stroke * 7) * (intense * 0.18);
                let sjy = Math.cos(boilStep * 43 + stroke * 11) * (intense * 0.18);
                renderTwoLines(targetCtx, sjx, sjy, t1, t2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);
            }
            targetCtx.restore();

        } else if (effect === 'cia_intro') {
            let zoomWave = 1 + Math.sin(timeFactor * 1.5) * 0.08; 
            let shakeX = Math.sin(frameIndex * 0.4) * (intense * 0.1);
            let shakeY = Math.cos(frameIndex * 0.3) * (intense * 0.1);
            targetCtx.translate(x + shakeX, y + shakeY);
            targetCtx.scale(zoomWave, zoomWave);

            renderTwoLines(targetCtx, 0, 0, t1, t2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);

        } else if (effect === 'vhs_glitch') {
            const pseudoRand = Math.sin(frameIndex * 1234.5);
            let glitch = Math.abs(pseudoRand) > 0.85 ? (pseudoRand) * intense : 0;

            let posX = x;
            if (align === "left") posX = w * 0.08;
            else if (align === "right") posX = w * 0.92;

            targetCtx.font = fontStyle.replace('$SIZE$', Math.round(baseSize1));
            targetCtx.fillStyle = "rgba(255, 0, 100, 0.7)"; targetCtx.fillText(t1, posX - glitch, y - lineGap * scale);
            targetCtx.fillStyle = "rgba(0, 255, 255, 0.7)"; targetCtx.fillText(t1, posX + glitch, y - lineGap * scale);
            
            targetCtx.font = fontStyle.replace('$SIZE$', Math.round(baseSize2));
            targetCtx.fillStyle = "rgba(255, 0, 100, 0.7)"; targetCtx.fillText(t2, posX + glitch, y + lineGap * scale);
            targetCtx.fillStyle = "rgba(0, 255, 255, 0.7)"; targetCtx.fillText(t2, posX - glitch, y + lineGap * scale);

            renderTwoLines(targetCtx, x, y, t1, t2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);

        } else if (effect === 'typewriter') {
            let combinedText = t1 + (t2 ? ("  " + t2) : "");
            let currentProgress = Math.floor(timeSec * spd * 15);
            let charsToShow = Math.min(currentProgress, combinedText.length);

            let showT1 = ""; let showT2 = "";
            if (charsToShow <= t1.length) {
                showT1 = t1.substring(0, charsToShow);
            } else {
                showT1 = t1;
                showT2 = t2.substring(0, Math.max(0, charsToShow - t1.length - 2));
            }

            renderTwoLines(targetCtx, x, y, showT1, showT2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);

            if (Math.floor(frameIndex / 10) % 2 === 0) {
                targetCtx.fillStyle = mainColor;
                targetCtx.font = fontStyle.replace('$SIZE$', Math.round(showT2 ? baseSize2 : baseSize1));
                let targetText = showT2 ? showT2 : showT1;
                let textWidth = targetCtx.measureText(targetText).width;
                let targetY = showT2 ? y + lineGap * scale : y - lineGap * scale;
                targetCtx.fillText("|", x + (textWidth / 2) + 10 * scale, targetY);
            }

        } else if (effect === 'neon_glow') {
            let glowRadius = (intense * 0.5) + Math.sin(timeFactor * 3) * (intense * 0.3);
            targetCtx.shadowColor = mainColor;
            targetCtx.shadowBlur = glowRadius;
            renderTwoLines(targetCtx, x, y, t1, t2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);

        } else {
            let shift = Math.abs(Math.sin(timeFactor)) * (intense * 0.3);
            renderTwoLines(targetCtx, x + shift, y, t1, t2, fontStyle, mainColor, baseSize1, baseSize2, lineGap, align, scale);
        }

        targetCtx.restore();
    }

    function populatePresetDropdowns() {
        const select = document.getElementById('kineticPresetSelect');
        if (!select) return;
        select.innerHTML = '';

        const builtinGroup = document.createElement('optgroup');
        builtinGroup.label = "Standartiniai Presetai";

        Object.keys(BUILTIN_PRESETS).forEach(key => {
            const opt = document.createElement('option');
            opt.value = 'builtin:' + key;
            opt.textContent = BUILTIN_PRESETS[key].name;
            builtinGroup.appendChild(opt);
        });
        select.appendChild(builtinGroup);

        const customKeys = Object.keys(customPresets);
        if (customKeys.length > 0) {
            const customGroup = document.createElement('optgroup');
            customGroup.label = "Mano Presetai";
            customKeys.forEach(key => {
                const opt = document.createElement('option');
                opt.value = 'custom:' + key;
                opt.textContent = '⭐ ' + customPresets[key].name;
                customGroup.appendChild(opt);
            });
            select.appendChild(customGroup);
        }
    }

    function updateSidebarUIFromScene(scene) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        if (!scene) {
            setVal('kTextInput1', "");
            setVal('kTextInput2', "");
            return;
        }

        setVal('kTextInput1', scene.text1 || "");
        setVal('kTextInput2', scene.text2 || "");
        setVal('kEffectSelect', scene.effect || "wiggly_sketch");
        setVal('kFontSelect', scene.font || "'Permanent Marker', cursive");
        setVal('kWeightSelect', scene.weight || "bold");
        setVal('kAlignSelect', scene.textAlign || "center");
        setVal('kTextCaseSelect', scene.textCase || "uppercase");
        setVal('kTextColor', scene.textColor || "#ffffff");
        setVal('kBgColor', scene.bgColor || "#000000");

        const spd = isNaN(parseFloat(scene.speed)) ? 1.0 : parseFloat(scene.speed);
        const intVal = isNaN(parseInt(scene.intensity)) ? 20 : parseInt(scene.intensity);
        const sz1 = isNaN(parseInt(scene.size1)) ? 65 : parseInt(scene.size1);
        const sz2 = isNaN(parseInt(scene.size2)) ? 44 : parseInt(scene.size2);
        const lg = isNaN(parseInt(scene.lineGap)) ? 45 : parseInt(scene.lineGap);
        const tr = isNaN(parseFloat(scene.titleRatio)) ? 1.5 : parseFloat(scene.titleRatio);

        setVal('kSpeedInput', spd);
        setVal('kIntensityInput', intVal);
        setVal('kLineGapInput', lg);
        setVal('kSize1Input', sz1);
        setVal('kSize2Input', sz2);
        setVal('kTitleRatioInput', tr);
        setVal('kDurationInput', isNaN(parseInt(scene.duration)) ? 4 : parseInt(scene.duration));
        setVal('kFpsSelect', scene.fps || 30);
        setVal('kMediaUrlInput', scene.bgMedia || scene.mediaUrl || "");
        const dimVal = scene.bgMediaDim !== undefined ? Math.round(scene.bgMediaDim * 100) : 40;
        setVal('kMediaDimInput', dimVal);
        const opacityVal = scene.bgMediaOpacity !== undefined ? Math.round(scene.bgMediaOpacity * 100) : 100;
        setVal('kMediaOpacityInput', opacityVal);
        const blurVal = scene.bgMediaBlur !== undefined ? parseInt(scene.bgMediaBlur) : 0;
        setVal('kMediaBlurInput', blurVal);

        const setText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setText('kMediaDimVal', `${dimVal}%`);
        setText('kMediaOpacityVal', `${opacityVal}%`);
        setText('kMediaBlurVal', `${blurVal}px`);
        setVal('kEntranceSelect', scene.entrance || "fade_in");

        const setChecked = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };
        setChecked('kAutoFitCheckbox', scene.autoFit !== false);
        setChecked('kTransparentBgCheckbox', scene.transparentBg === true);
        setText('kTextColorVal', scene.textColor || "#ffffff");
        setText('kBgColorVal', scene.bgColor || "#000000");
        setText('kSpeedVal', spd.toFixed(1) + 'x');
        setText('kIntensityVal', intVal + 'px');
        setText('kLineGapVal', lg + 'px');
        setText('kSize1Val', sz1 + 'px');
        setText('kSize2Val', sz2 + 'px');
        setText('kTitleRatioVal', tr.toFixed(1) + 'x');

        const toggleModeBtn = document.getElementById('btnToggleKineticSceneMode');
        if (toggleModeBtn) {
            if (scene.hideText) {
                toggleModeBtn.innerHTML = '🖼️ Tik Vaizdas (Be teksto)';
                toggleModeBtn.style.background = 'rgba(234, 179, 8, 0.2)';
                toggleModeBtn.style.color = '#fde047';
                toggleModeBtn.style.borderColor = 'rgba(234, 179, 8, 0.5)';
            } else {
                toggleModeBtn.innerHTML = '🎬 Tekstas + Fonas';
                toggleModeBtn.style.background = 'rgba(0, 255, 204, 0.15)';
                toggleModeBtn.style.color = '#00ffcc';
                toggleModeBtn.style.borderColor = 'rgba(0, 255, 204, 0.4)';
            }
        }

        const scenes = getKineticScenes();
        const idx = scenes.findIndex(s => s.id === scene.id);
        setText('kineticPreviewStatus', `Aktyvi Scene #${scene.id} (${idx !== -1 ? idx + 1 : 1}/${scenes.length})`);
    }

    function applyActiveStyleToAll(sourceScene) {
        const src = sourceScene || getActiveScene();
        if (!src) return;
        const scenes = getKineticScenes();
        scenes.forEach(s => {
            s.effect = src.effect;
            s.font = src.font;
            s.weight = src.weight;
            s.textAlign = src.textAlign;
            s.textCase = src.textCase;
            s.textColor = src.textColor;
            s.bgColor = src.bgColor;
            s.speed = src.speed;
            s.intensity = src.intensity;
            s.size1 = src.size1;
            s.size2 = src.size2;
            s.titleRatio = src.titleRatio;
            s.lineGap = src.lineGap;
            s.duration = src.duration;
            s.fps = src.fps;
            s.autoFit = src.autoFit;
            s.transparentBg = src.transparentBg;
            s.entrance = src.entrance;
            s.bgMediaDim = src.bgMediaDim;
            s.bgMediaOpacity = src.bgMediaOpacity;
            s.bgMediaBlur = src.bgMediaBlur;
        });
        renderScenesGrid();
    }

    function renderScenesGrid() {
        const grid = document.getElementById('kineticScenesGrid');
        if (!grid) return;
        grid.innerHTML = '';
        const scenes = getKineticScenes();

        const badge = document.getElementById('kineticSceneCountBadge');
        if (badge) badge.textContent = `${scenes.length} scenos`;

        const filtered = scenes.filter(sc => {
            if (!sceneSearchQuery) return true;
            const q = sceneSearchQuery.toLowerCase();
            return (sc.id || '').toLowerCase().includes(q) ||
                   (sc.text1 || '').toLowerCase().includes(q) ||
                   (sc.text2 || '').toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            grid.innerHTML = `
                <div style="margin: auto; color: var(--muted); font-size: 12px; text-align: center; padding: 25px; line-height: 1.6;">
                    <div style="font-size: 24px; margin-bottom: 6px; opacity: 0.6;">✨</div>
                    <strong style="color: var(--text);">No kinetic titles created in this project yet.</strong><br/>
                    <span>Spustelėkite <strong style="color: var(--accent-secondary, #00ffcc);">+ Pridėti Sceną</strong> viršuje arba <strong style="color: var(--accent-secondary, #00ffcc);">Sync Title Cards</strong>, jei norite sukurti animuotą tekstą ar intro.</span>
                </div>
            `;
            return;
        }

        filtered.forEach(sc => {
            const card = document.createElement('div');
            card.className = `scene-card ${sc.id === activeSceneId ? 'active' : ''}`;
            card.style.cssText = `
                min-width: 170px; width: 170px; height: 130px;
                background: ${sc.transparentBg ? 'repeating-conic-gradient(#101018 0% 25%, #1c1c28 0% 50%) 50% / 16px 16px' : (sc.bgColor || '#151520')};
                border: 2px solid ${sc.id === activeSceneId ? 'var(--accent-secondary, #00ffcc)' : '#232334'};
                border-radius: 8px; padding: 10px; display: flex; flex-direction: column;
                justify-content: space-between; cursor: pointer; transition: all 0.2s ease;
                position: relative; overflow: hidden;
            `;

            card.onclick = () => {
                activeSceneId = sc.id;
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj) {
                    proj.lastActiveKineticSceneId = sc.id;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                }
                updateSidebarUIFromScene(sc);
                renderScenesGrid();
            };

            card.innerHTML = `
                <div style="position:absolute; top:6px; left:8px; font-size:10px; font-weight:800; color:var(--accent-secondary, #00ffcc); background:rgba(0, 255, 204, 0.15); padding:2px 6px; border-radius:4px;">#${sc.id}</div>
                <div style="position:absolute; top:6px; right:6px; display:flex; gap:4px;">
                    <button class="btn btn-sm" onclick="event.stopPropagation(); window.duplicateKineticScene('${sc.id}');" title="Dubliuoti" style="padding:2px 6px; font-size:10px;">📋</button>
                    ${scenes.length > 1 ? `<button class="btn btn-sm bad" onclick="event.stopPropagation(); window.deleteKineticScene('${sc.id}');" title="Trinti" style="padding:2px 6px; font-size:10px;">🗑️</button>` : ''}
                </div>
                <div style="margin-top:20px; flex:1; display:flex; flex-direction:column; justify-center; text-align:center; gap:2px; overflow:hidden;">
                    <div style="font-weight:700; font-size:12px; color:${sc.textColor || '#fff'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(sc.text1 || '(Tuščia)')}</div>
                    <div style="font-size:11px; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(sc.text2 || '(Tuščia)')}</div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:var(--muted); border-top:1px solid rgba(255,255,255,0.1); padding-top:4px;">
                    <span>⏱️ ${sc.duration}s</span>
                    <span style="max-width:90px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">🎨 ${sc.effect}</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    window.addKineticScene = function(presetData = null, text1Override = null, text2Override = null) {
        const scenes = getKineticScenes();
        const activeScene = getActiveScene();
        const newScene = {
            id: 'S' + (scenes.length + 1),
            text1: text1Override !== null ? text1Override : "NAUJA SCENA",
            text2: text2Override !== null ? text2Override : "Antra Eilutė",
            effect: presetData ? presetData.effect : activeScene.effect,
            font: presetData ? presetData.font : activeScene.font,
            weight: presetData ? presetData.weight : activeScene.weight,
            textAlign: activeScene.textAlign || "center",
            textCase: activeScene.textCase || "uppercase",
            textColor: presetData ? presetData.textColor : activeScene.textColor,
            bgColor: presetData ? presetData.bgColor : activeScene.bgColor,
            speed: presetData ? presetData.speed : activeScene.speed,
            intensity: presetData ? presetData.intensity : activeScene.intensity,
            size1: presetData ? presetData.size1 : activeScene.size1,
            size2: presetData ? presetData.size2 : activeScene.size2,
            titleRatio: activeScene.titleRatio || 1.5,
            lineGap: activeScene.lineGap || 45,
            duration: presetData ? presetData.duration : activeScene.duration,
            fps: activeScene.fps || 30,
            autoFit: activeScene.autoFit !== false,
            transparentBg: activeScene.transparentBg === true
        };
        scenes.push(newScene);
        activeSceneId = newScene.id;
        updateSidebarUIFromScene(newScene);
        renderScenesGrid();
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    };

    window.duplicateKineticScene = function(id) {
        const scenes = getKineticScenes();
        const idx = scenes.findIndex(s => s.id === id);
        if (idx === -1) return;
        const dup = JSON.parse(JSON.stringify(scenes[idx]));
        dup.id = dup.id + '_copy';
        dup.text1 += " (Kopija)";
        scenes.splice(idx + 1, 0, dup);
        activeSceneId = dup.id;
        updateSidebarUIFromScene(dup);
        renderScenesGrid();
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    };

    window.deleteKineticScene = function(id) {
        const scenes = getKineticScenes();
        if (scenes.length <= 1) return;
        const idx = scenes.findIndex(s => s.id === id);
        if (idx !== -1) {
            scenes.splice(idx, 1);
            if (activeSceneId === id) {
                activeSceneId = scenes[Math.max(0, idx - 1)].id;
            }
            updateSidebarUIFromScene(getActiveScene());
            renderScenesGrid();
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }
    };

    function attachControlListeners() {
        const bindInput = (id, prop, parseFn, valDisplayId, suffix = '') => {
            const el = document.getElementById(id);
            if (!el) return;
            const update = () => {
                const scene = getActiveScene();
                if (!scene) return;
                let raw = el.value;
                let parsed = parseFn ? parseFn(raw) : raw;
                scene[prop] = parsed;

                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj) {
                    proj.lastActiveKineticSceneId = scene.id;
                }

                if (valDisplayId) {
                    const disp = document.getElementById(valDisplayId);
                    if (disp) {
                        disp.textContent = (typeof parsed === 'number' && suffix === 'x') ? parsed.toFixed(1) + suffix : parsed + suffix;
                    }
                }

                const syncCheckbox = document.getElementById('syncStyleCheckbox');
                if (syncCheckbox && syncCheckbox.checked) {
                    applyActiveStyleToAll(scene);
                } else {
                    renderScenesGrid();
                }
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            };

            el.addEventListener('input', update);
            el.addEventListener('change', update);
        };

        const bindCheckbox = (id, prop) => {
            const el = document.getElementById(id);
            if (!el) return;
            const update = () => {
                const scene = getActiveScene();
                if (!scene) return;
                scene[prop] = el.checked;

                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj) {
                    proj.lastActiveKineticSceneId = scene.id;
                }

                const syncCheckbox = document.getElementById('syncStyleCheckbox');
                if (syncCheckbox && syncCheckbox.checked) {
                    applyActiveStyleToAll(scene);
                } else {
                    renderScenesGrid();
                }
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            };
            el.addEventListener('change', update);
        };

        bindInput('kTextInput1', 'text1');
        bindInput('kTextInput2', 'text2');
        bindInput('kEffectSelect', 'effect');
        bindInput('kFontSelect', 'font');
        bindInput('kWeightSelect', 'weight');
        bindInput('kAlignSelect', 'textAlign');
        bindInput('kTextCaseSelect', 'textCase');
        bindInput('kTextColor', 'textColor', null, 'kTextColorVal');
        bindInput('kBgColor', 'bgColor', null, 'kBgColorVal');
        bindInput('kSpeedInput', 'speed', v => isNaN(parseFloat(v)) ? 1.0 : parseFloat(v), 'kSpeedVal', 'x');
        bindInput('kIntensityInput', 'intensity', v => isNaN(parseInt(v)) ? 0 : parseInt(v), 'kIntensityVal', 'px');
        bindInput('kLineGapInput', 'lineGap', v => isNaN(parseInt(v)) ? 45 : parseInt(v), 'kLineGapVal', 'px');
        bindInput('kSize1Input', 'size1', v => isNaN(parseInt(v)) ? 65 : parseInt(v), 'kSize1Val', 'px');
        bindInput('kSize2Input', 'size2', v => isNaN(parseInt(v)) ? 44 : parseInt(v), 'kSize2Val', 'px');
        bindInput('kTitleRatioInput', 'titleRatio', v => isNaN(parseFloat(v)) ? 1.5 : parseFloat(v), 'kTitleRatioVal', 'x');
        bindInput('kDurationInput', 'duration', v => isNaN(parseInt(v)) ? 4 : parseInt(duration));
        bindInput('kFpsSelect', 'fps', v => isNaN(parseInt(v)) ? 30 : parseInt(v));

        bindCheckbox('kAutoFitCheckbox', 'autoFit');
        bindCheckbox('kTransparentBgCheckbox', 'transparentBg');

        bindInput('kMediaUrlInput', 'bgMedia');
        bindInput('kMediaDimInput', 'bgMediaDim', v => (parseInt(v) || 0) / 100.0, 'kMediaDimVal', '%');
        bindInput('kMediaOpacityInput', 'bgMediaOpacity', v => (parseInt(v) || 0) / 100.0, 'kMediaOpacityVal', '%');
        bindInput('kMediaBlurInput', 'bgMediaBlur', v => parseInt(v) || 0, 'kMediaBlurVal', 'px');
        bindInput('kEntranceSelect', 'entrance');

        const toggleModeBtn = document.getElementById('btnToggleKineticSceneMode');
        if (toggleModeBtn) {
            toggleModeBtn.addEventListener('click', () => {
                const scene = getActiveScene();
                if (!scene) return;
                scene.hideText = !scene.hideText;
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj && proj.scenes) {
                    const sc = proj.scenes.find(s => String(s.id) === String(scene.id) || String(s.id).toLowerCase() === String(scene.id).toLowerCase());
                    if (sc) sc.kineticHideText = scene.hideText;
                }
                updateSidebarUIFromScene(scene);
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
                else if (typeof window.renderImages === 'function') window.renderImages();
                if (typeof window.renderScenesTable === 'function') window.renderScenesTable();
                if (typeof toast === 'function') {
                    toast(scene.hideText ? "Režimas: Tik Vaizdas" : "Režimas: Tekstas + Fonas", scene.hideText ? "Tekstas paslėptas, rodomas tik fonas" : "Kinetinis tekstas įjungtas", "info");
                }
            });
        }

        const useCurrentSceneBtn = document.getElementById('btnUseCurrentSceneImage');
        if (useCurrentSceneBtn) {
            useCurrentSceneBtn.addEventListener('click', () => {
                const scene = getActiveScene();
                if (!scene) return;
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (!proj || !proj.outputs) {
                    if (typeof toast === 'function') toast("Vaizdas", "Ši scena neturi atlikto vaizdo.", "warn");
                    return;
                }
                const scNum = parseInt(String(scene.id).replace(/\D/g, ''), 10);
                const out = proj.outputs.find(o => {
                    if (!o || !o.sceneId) return false;
                    if (o.sceneId === scene.id || String(o.sceneId).toLowerCase() === String(scene.id).toLowerCase()) return true;
                    const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
                    return !isNaN(scNum) && !isNaN(oNum) && scNum === oNum;
                });
                const matchedVar = out && out.variations ? (out.variations.find(v => v.id === out.mainId) || out.variations.slice().reverse().find(v => v && v.status === 'done' && v.url)) : null;
                if (matchedVar && matchedVar.url) {
                    scene.bgMedia = matchedVar.url;
                    const urlEl = document.getElementById('kMediaUrlInput');
                    if (urlEl) urlEl.value = matchedVar.url;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    if (typeof toast === 'function') toast("Fonas nustatytas", `Scenos ${scene.id} vaizdas priskirtas fonui!`, "success");
                } else {
                    if (typeof toast === 'function') toast("Nėra vaizdo", `Scenei ${scene.id} dar nėra priskirto atlikto vaizdo projekte.`, "warn");
                }
            });
        }

        const pickProjectMediaBtn = document.getElementById('btnPickKineticMediaFromProject');
        if (pickProjectMediaBtn) {
            pickProjectMediaBtn.addEventListener('click', () => {
                if (typeof window.openProjectImagesPickerForKinetic === 'function') {
                    window.openProjectImagesPickerForKinetic();
                }
            });
        }

        const uploadMediaBtn = document.getElementById('btnUploadKineticMedia');
        const mediaInput = document.getElementById('kMediaUpload');
        const clearMediaBtn = document.getElementById('btnClearKineticMedia');

        if (uploadMediaBtn && mediaInput) {
            uploadMediaBtn.addEventListener('click', () => mediaInput.click());
            mediaInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    if (typeof toast === 'function') toast("Medija", `Įkeliamas failas ${file.name}...`, "info");
                    const fd = new FormData();
                    fd.append("file", file);
                    const res = await fetch("/api/upload_vault", { method: "POST", body: fd });
                    const data = await res.json();
                    if (data.status === "success" && data.url) {
                        const scene = getActiveScene();
                        if (scene) {
                            scene.bgMedia = data.url;
                            const urlEl = document.getElementById('kMediaUrlInput');
                            if (urlEl) urlEl.value = data.url;
                            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                            if (typeof toast === 'function') toast("Medija įkelta", "Fono medija sėkmingai pridėta!", "success");
                        }
                    } else {
                        if (typeof toast === 'function') toast("Klaida", data.message || "Nepavyko įkelti medijos", "error");
                    }
                } catch (err) {
                    console.error("Media upload error:", err);
                    if (typeof toast === 'function') toast("Klaida", err.message, "error");
                }
            });
        }

        if (clearMediaBtn) {
            clearMediaBtn.addEventListener('click', () => {
                const scene = getActiveScene();
                if (scene) {
                    scene.bgMedia = "";
                    const urlEl = document.getElementById('kMediaUrlInput');
                    if (urlEl) urlEl.value = "";
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    if (typeof toast === 'function') toast("Išvalyta", "Fono medija pašalinta.", "info");
                }
            });
        }

        const filterOnlyTitlesCheckbox = document.getElementById('kOnlyTitleCardsCheckbox');
        if (filterOnlyTitlesCheckbox) {
            filterOnlyTitlesCheckbox.addEventListener('change', () => {
                window.syncWorkspaceScenesToKinetic(false);
            });
        }

        const searchInput = document.getElementById('kSceneSearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                sceneSearchQuery = e.target.value.trim();
                renderScenesGrid();
            });
        }

        const btnApplyAll = document.getElementById('btnApplyStyleToAll');
        if (btnApplyAll) {
            btnApplyAll.addEventListener('click', () => {
                applyActiveStyleToAll();
                if (typeof toast === 'function') toast("Style Applied", "Aktyvus stilius pritaikytas visoms scenoms!", "success");
            });
        }

        const btnSetDefault = document.getElementById('btnSetAsProjectDefault');
        if (btnSetDefault) {
            btnSetDefault.addEventListener('click', () => {
                const active = getActiveScene();
                const proj = typeof window.getProj === 'function' ? window.getProj() : null;
                if (proj && active) {
                    proj.defaultKineticStyle = {
                        effect: active.effect, font: active.font, weight: active.weight,
                        textAlign: active.textAlign, textCase: active.textCase,
                        textColor: active.textColor, bgColor: active.bgColor,
                        speed: active.speed, intensity: active.intensity,
                        size1: active.size1, size2: active.size2, titleRatio: active.titleRatio, lineGap: active.lineGap,
                        duration: active.duration, fps: active.fps,
                        autoFit: active.autoFit, transparentBg: active.transparentBg
                    };
                    if (typeof toast === 'function') toast("Default Saved", "Šis stilius nustatytas kaip numatytasis projektui!", "success");
                }
            });
        }

        const btnSyncWS = document.getElementById('btnSyncFromWorkspace');
        if (btnSyncWS) {
            btnSyncWS.addEventListener('click', () => syncWorkspaceScenesToKinetic(false));
        }

        const presetSelect = document.getElementById('kineticPresetSelect');
        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                let pData = null;
                if (val.startsWith('builtin:')) {
                    pData = BUILTIN_PRESETS[val.replace('builtin:', '')];
                } else if (val.startsWith('custom:')) {
                    pData = customPresets[val.replace('custom:', '')];
                }

                if (pData) {
                    const activeScene = getActiveScene();
                    Object.assign(activeScene, {
                        effect: pData.effect, font: pData.font, weight: pData.weight,
                        textColor: pData.textColor, bgColor: pData.bgColor,
                        speed: pData.speed, intensity: pData.intensity,
                        size1: pData.size1, size2: pData.size2, duration: pData.duration
                    });
                    updateSidebarUIFromScene(activeScene);

                    const syncCheckbox = document.getElementById('syncStyleCheckbox');
                    if (syncCheckbox && syncCheckbox.checked) {
                        applyActiveStyleToAll(activeScene);
                    } else {
                        renderScenesGrid();
                    }
                }
            });
        }

        const btnSavePreset = document.getElementById('btnSaveKineticPreset');
        if (btnSavePreset) {
            btnSavePreset.addEventListener('click', () => {
                const name = prompt("Įveskite naujo preseto pavadinimą:");
                if (!name || !name.trim()) return;

                const scene = getActiveScene();
                const key = 'preset_' + Date.now();
                customPresets[key] = {
                    name: name.trim(),
                    effect: scene.effect, font: scene.font, weight: scene.weight,
                    textColor: scene.textColor, bgColor: scene.bgColor,
                    speed: scene.speed, intensity: scene.intensity,
                    size1: scene.size1, size2: scene.size2, duration: scene.duration
                };

                localStorage.setItem('kinetic_custom_presets', JSON.stringify(customPresets));
                populatePresetDropdowns();
                document.getElementById('kineticPresetSelect').value = 'custom:' + key;
                if (typeof toast === 'function') toast("Preset Saved", `Išsaugotas presetas "${name}"`, "success");
            });
        }

        const btnDeletePreset = document.getElementById('btnDeleteKineticPreset');
        if (btnDeletePreset) {
            btnDeletePreset.addEventListener('click', () => {
                const val = document.getElementById('kineticPresetSelect').value;
                if (!val.startsWith('custom:')) {
                    alert("Galima ištrinti tik jūsų sukurtus presetus!");
                    return;
                }
                const key = val.replace('custom:', '');
                if (confirm(`Ar tikrai norite ištrinti presetą "${customPresets[key].name}"?`)) {
                    delete customPresets[key];
                    localStorage.setItem('kinetic_custom_presets', JSON.stringify(customPresets));
                    populatePresetDropdowns();
                }
            });
        }

        const btnAdd = document.getElementById('btnAddKineticScene');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => window.addKineticScene());
        }

        const btnTogglePlay = document.getElementById('btnToggleKineticPlay');
        if (btnTogglePlay) {
            btnTogglePlay.addEventListener('click', () => {
                isPlaying = !isPlaying;
                btnTogglePlay.textContent = isPlaying ? "⏸️ Pauzė" : "▶️ Paleisti";
            });
        }

        const btnExportVideo = document.getElementById('btnExportActiveSceneVideo');
        if (btnExportVideo) {
            btnExportVideo.addEventListener('click', () => exportSceneToVideo(getActiveScene()));
        }
    }

    async function exportSceneToVideo(scene) {
        if (!scene) return;
        const canvas = document.getElementById('kineticCanvas');
        if (!canvas) return;

        if (typeof toast === 'function') toast("Rendering", "Ruošiamas scenos video eksportas...", "info");

        const fps = scene.fps || 30;
        const durationSec = scene.duration || 4;
        const totalFrames = fps * durationSec;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = 1280;
        exportCanvas.height = 720;
        const exportCtx = exportCanvas.getContext('2d');

        const stream = exportCanvas.captureStream(fps);
        let mediaRecorder;
        try {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
        } catch(e) {
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        }

        const chunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Kinetic_${scene.id}_${(scene.text1||'').replace(/[^a-z0-9]/gi, '_')}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            if (typeof toast === 'function') toast("Export Complete", "Video failas atsisiųstas!", "success");
        };

        mediaRecorder.start();
        let currentFrame = 0;

        function recordStep() {
            if (currentFrame >= totalFrames) {
                mediaRecorder.stop();
                return;
            }
            const timeSec = currentFrame / fps;
            renderFrame(exportCtx, exportCanvas.width, exportCanvas.height, scene, timeSec, currentFrame);
            currentFrame++;
            setTimeout(recordStep, 1000 / fps);
        }

        recordStep();
    }

    window.renderKineticSceneToWebmBlob = function(scene, durationSec) {
        return new Promise((resolve, reject) => {
            if (!scene) return reject(new Error("No scene provided"));
            const fps = scene.fps || 30;
            const dur = durationSec || scene.duration || 4;
            const totalFrames = Math.max(1, Math.round(fps * dur));

            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = 1920;
            exportCanvas.height = 1080;
            const exportCtx = exportCanvas.getContext('2d');

            const stream = exportCanvas.captureStream(fps);
            let mediaRecorder;
            try {
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
            } catch(e) {
                try {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
                } catch(e2) {
                    return reject(new Error("MediaRecorder not supported"));
                }
            }

            const chunks = [];
            mediaRecorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                resolve(blob);
            };

            mediaRecorder.start();
            let currentFrame = 0;

            function recordStep() {
                if (currentFrame >= totalFrames) {
                    setTimeout(() => {
                        try { mediaRecorder.stop(); } catch(e) {}
                    }, 50);
                    return;
                }
                const timeSec = currentFrame / fps;
                if (typeof renderFrame === 'function') {
                    try {
                        renderFrame(exportCtx, exportCanvas.width, exportCanvas.height, scene, timeSec, currentFrame);
                    } catch(err) {
                        console.error("renderFrame error:", err);
                    }
                }
                currentFrame++;
                setTimeout(recordStep, 1000 / fps);
            }

            recordStep();
        });
    };

    window.renderKineticTextOverlay = function(targetCtx, w, h, scene, timeSec, frameIndex, forceTransparent = true) {
        if (!scene) return;
        const sceneCopy = Object.assign({}, scene);
        if (forceTransparent) sceneCopy.transparentBg = true;
        try {
            renderFrame(targetCtx, w, h, sceneCopy, timeSec, frameIndex);
        } catch(e) {
            console.error("renderKineticTextOverlay error:", e);
        }
    };

    let startTime = performance.now();
    let frameCount = 0;

    function livePreviewLoop(timestamp) {
        const canvas = document.getElementById('kineticCanvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (isPlaying) {
                try {
                    frameCount++;
                    const timeSec = (timestamp - startTime) / 1000;
                    const activeScene = getActiveScene();
                    if (activeScene) {
                        renderFrame(ctx, canvas.width, canvas.height, activeScene, timeSec, frameCount);
                    }
                } catch (err) {
                    console.error("Kinetic preview loop error:", err);
                }
            }
        }
        animationFrameId = requestAnimationFrame(livePreviewLoop);
    }

    function syncWorkspaceScenesToKinetic(auto = false) {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj || !proj.scenes || proj.scenes.length === 0) {
            if (!auto && typeof toast === 'function') toast("No Scenes", "Projekte nerasta sukurtų scenų/promptų!", "error");
            return;
        }

        const onlyTitleCardsEl = document.getElementById('kOnlyTitleCardsCheckbox');
        const onlyTitleCards = onlyTitleCardsEl ? onlyTitleCardsEl.checked : true;

        const defaultStyle = proj.defaultKineticStyle || BUILTIN_PRESETS.wiggly_sketch;
        if (!proj.kineticScenes) proj.kineticScenes = [];
        const kineticScenes = proj.kineticScenes;

        // Map existing scenes by ID so we NEVER overwrite user customizations!
        const existingMap = new Map();
        kineticScenes.forEach(s => {
            if (s && s.id) existingMap.set(String(s.id), s);
        });

        const newKineticScenes = [];

        proj.scenes.forEach((sc, idx) => {
            // Filter out non-title cards if onlyTitleCards is checked
            if (onlyTitleCards && typeof window.isKineticTextScene === 'function' && !window.isKineticTextScene(sc)) {
                return;
            }

            const scId = String(sc.id);
            // If scene was already customized by the user, PRESERVE IT 100%!
            if (existingMap.has(scId)) {
                newKineticScenes.push(existingMap.get(scId));
                return;
            }

            // Otherwise, generate initial title lines
            const uiText = (proj.sceneTextById && proj.sceneTextById[sc.id]) ? proj.sceneTextById[sc.id] : (sc.text || "");
            
            let line1 = "";
            let line2 = "";

            const m1 = sc.prompt ? sc.prompt.match(/First line:\s*['"](.*?)['"]/i) : null;
            const m2 = sc.prompt ? sc.prompt.match(/Second line:\s*['"](.*?)['"]/i) : null;
            if (m1 && m1[1]) line1 = m1[1];
            if (m2 && m2[1]) line2 = m2[1];

            if (!line1) {
                const textToSplit = uiText || sc.text || sc.prompt || `Scene #${sc.id}`;
                let parts = textToSplit.split(/:\s*|\n| - /);
                line1 = parts[0] || `SCENE ${sc.id}`;
                line2 = parts.slice(1).join(' ') || "";
            }

            if (line1.length > 60 && !line2) {
                line2 = line1.substring(45);
                line1 = line1.substring(0, 45);
            }

            newKineticScenes.push({
                id: scId, // Preserve original scene ID (e.g. S23, S42)
                text1: line1,
                text2: line2,
                effect: defaultStyle.effect || "wiggly_sketch",
                font: defaultStyle.font || "'Permanent Marker', cursive",
                weight: defaultStyle.weight || "bold",
                textAlign: defaultStyle.textAlign || "center",
                textCase: defaultStyle.textCase || "uppercase",
                textColor: defaultStyle.textColor || "#ffffff",
                bgColor: defaultStyle.bgColor || "#000000",
                speed: defaultStyle.speed || 1.0,
                intensity: defaultStyle.intensity || 20,
                size1: defaultStyle.size1 || 65,
                size2: defaultStyle.size2 || 44,
                titleRatio: defaultStyle.titleRatio || 1.5,
                lineGap: defaultStyle.lineGap || 45,
                duration: defaultStyle.duration || 4,
                fps: defaultStyle.fps || 30,
                autoFit: defaultStyle.autoFit !== false,
                transparentBg: defaultStyle.transparentBg === true
            });
        });

        // Also keep any custom kinetic scenes created manually that might not match proj.scenes
        existingMap.forEach((val, key) => {
            if (!newKineticScenes.some(s => s.id === key)) {
                newKineticScenes.push(val);
            }
        });

        if (newKineticScenes.length > 0) {
            proj.kineticScenes = newKineticScenes;
        }

        if (proj.kineticScenes.length > 0 && (!activeSceneId || !proj.kineticScenes.some(s => s.id === activeSceneId))) {
            activeSceneId = proj.lastActiveKineticSceneId && proj.kineticScenes.some(s => s.id === proj.lastActiveKineticSceneId)
                ? proj.lastActiveKineticSceneId
                : proj.kineticScenes[0].id;
        }
        
        updateSidebarUIFromScene(getActiveScene());
        renderScenesGrid();
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (!auto && typeof toast === 'function') toast("Synced", `Sinchronizuota ${proj.kineticScenes.length} antraščių scenų!`, "success");
    }

    function openKineticSceneById(targetId) {
        syncWorkspaceScenesToKinetic(true);
        const scenes = getKineticScenes();
        const found = scenes.find(s => s.id === targetId || s.id === 'ksc_' + targetId || String(s.id).toLowerCase() === String(targetId).toLowerCase());
        if (found) {
            activeSceneId = found.id;
            // Auto-detect background if not present
            if (!found.bgMedia && typeof window.getProj === 'function') {
                const proj = window.getProj();
                const scNum = parseInt(String(targetId).replace(/\D/g, ''), 10);
                const out = (proj?.outputs || []).find(o => {
                    if (!o || !o.sceneId) return false;
                    if (o.sceneId === targetId || String(o.sceneId).toLowerCase() === String(targetId).toLowerCase()) return true;
                    const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
                    return !isNaN(scNum) && !isNaN(oNum) && scNum === oNum;
                });
                if (out && out.variations && out.variations.length > 0) {
                    const doneVar = out.variations.find(v => v.id === out.mainId) || out.variations.slice().reverse().find(v => v && v.status === 'done' && v.url);
                    if (doneVar && doneVar.url) {
                        found.bgMedia = doneVar.url;
                    }
                }
            }
        }
        updateSidebarUIFromScene(getActiveScene());
        renderScenesGrid();
    }

    window.openProjectImagesPickerForKinetic = function() {
        const modal = document.getElementById('modalPickProjectImage');
        const grid = document.getElementById('projectImagesPickerGrid');
        const countBadge = document.getElementById('projectImagesPickerCount');
        if (!modal || !grid) return;

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj || !proj.outputs || proj.outputs.length === 0) {
            if (typeof toast === 'function') toast("Nėra vaizdų", "Projekte nerasta sukurtų vaizdų.", "warn");
            return;
        }

        grid.innerHTML = '';
        const items = [];
        (proj.outputs || []).forEach(out => {
            if (!out || !out.variations) return;
            const sc = (proj.scenes || []).find(s => String(s.id) === String(out.sceneId) || String(s.id).toLowerCase() === String(out.sceneId).toLowerCase());
            out.variations.forEach(v => {
                if (v && v.status === 'done' && v.url) {
                    items.push({
                        sceneId: out.sceneId,
                        url: v.url,
                        varId: v.id,
                        prompt: sc ? (sc.prompt || sc.text || '') : ''
                    });
                }
            });
        });

        if (countBadge) countBadge.textContent = `${items.length} vaizdų`;

        if (items.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--muted); padding: 40px;">Projekte dar nėra atliktų ar importuotų vaizdų.</div>`;
            modal.style.display = 'flex';
            return;
        }

        const escapeHtmlSafe = (str) => {
            if (!str) return "";
            return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        };

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'panel flex-col';
            card.style.padding = '8px';
            card.style.gap = '6px';
            card.style.cursor = 'pointer';
            card.style.transition = 'transform 0.15s, border-color 0.15s';
            card.style.border = '1px solid rgba(255,255,255,0.12)';
            card.style.borderRadius = '8px';
            card.style.background = 'rgba(255,255,255,0.03)';

            card.onmouseover = () => { card.style.borderColor = '#00ffcc'; card.style.transform = 'scale(1.02)'; };
            card.onmouseout = () => { card.style.borderColor = 'rgba(255,255,255,0.12)'; card.style.transform = 'scale(1)'; };

            card.innerHTML = `
                <div style="width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 6px; overflow: hidden; position: relative;">
                    <img src="${item.url}" style="width: 100%; height: 100%; object-fit: cover;" loading="lazy" />
                    <span class="badge" style="position: absolute; top: 4px; left: 4px; font-size: 10px; background: rgba(0,0,0,0.75); color: #00ffcc; border: 1px solid rgba(0,255,204,0.4); font-weight: 700;">
                        ${item.sceneId}
                    </span>
                </div>
                <div class="text-xs text-muted" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 11px;" title="${escapeHtmlSafe(item.prompt)}">
                    ${escapeHtmlSafe(item.prompt || item.url.split('/').pop())}
                </div>
            `;

            card.onclick = () => {
                const activeSc = getActiveScene();
                if (activeSc) {
                    activeSc.bgMedia = item.url;
                    const urlEl = document.getElementById('kMediaUrlInput');
                    if (urlEl) urlEl.value = item.url;
                    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
                    if (typeof toast === 'function') toast("Fonas parinktas", `Scenei ${activeSc.id} parinktas fonas iš ${item.sceneId}`, "success");
                }
                modal.style.display = 'none';
            };

            grid.appendChild(card);
        });

        modal.style.display = 'flex';
    };

    window.toggleKineticSceneMode = function(sceneId) {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;
        const sId = String(sceneId);
        const sc = (proj.scenes || []).find(s => String(s.id) === sId || String(s.id).toLowerCase() === sId.toLowerCase());
        if (!proj.kineticScenes) proj.kineticScenes = [];
        let kSc = proj.kineticScenes.find(k => String(k.id) === sId || String(k.id).toLowerCase() === sId.toLowerCase());
        
        const currentHide = (sc && sc.kineticHideText) || (kSc && kSc.hideText);
        const newHide = !currentHide;
        
        if (sc) sc.kineticHideText = newHide;
        if (kSc) kSc.hideText = newHide;
        
        const activeSc = getActiveScene();
        if (activeSc && (String(activeSc.id) === sId || String(activeSc.id).toLowerCase() === sId.toLowerCase())) {
            activeSc.hideText = newHide;
            updateSidebarUIFromScene(activeSc);
        }
        
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.renderScenesTable === 'function') window.renderScenesTable();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
        else if (typeof window.renderImages === 'function') window.renderImages();
        if (typeof window.renderTimeline === 'function') window.renderTimeline();
        if (typeof window.updateViewerData === 'function' && window.state && window.state.viewerOpen) {
            window.updateViewerData();
        }
        if (typeof toast === 'function') {
            toast(newHide ? "Režimas: Tik Vaizdas" : "Režimas: Tekstas + Fonas", newHide ? `Scene ${sceneId}: tekstas paslėptas, rodomas tik fonas` : `Scene ${sceneId}: kinetinis tekstas įjungtas`, "info");
        }
    };

    window.syncWorkspaceScenesToKinetic = syncWorkspaceScenesToKinetic;
    window.openKineticSceneById = openKineticSceneById;
    window.getKineticScenes = getKineticScenes;
    window.getActiveKineticScene = getActiveScene;

    window.openKineticWriterModal = function(sceneId = null) {
        const modal = document.getElementById('modalKineticWriter');
        if (modal) {
            modal.classList.add('show');
            if (typeof window.renderKineticUI === 'function') window.renderKineticUI();
            if (sceneId) {
                openKineticSceneById(sceneId);
            }
            const badge = document.getElementById('modalKineticSceneTargetBadge');
            if (badge) {
                badge.textContent = sceneId ? `Aktyvi Scene: #${sceneId}` : 'Kinetinių Titrų Studija';
            }
        }
    };

    window.closeKineticWriterModal = function() {
        const modal = document.getElementById('modalKineticWriter');
        if (modal) modal.classList.remove('show');
        if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
        if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('images');
        else if (typeof window.renderImages === 'function') window.renderImages();
        if (typeof window.renderReview === 'function') window.renderReview();
        if (typeof window.renderTimeline === 'function') window.renderTimeline();
        if (typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();
    };

    let textWriterInitialized = false;
    function initTextWriter() {
        if (textWriterInitialized) return;
        textWriterInitialized = true;
        attachControlListeners();
        populatePresetDropdowns();
        if (!animationFrameId) {
            animationFrameId = requestAnimationFrame(livePreviewLoop);
        }
    }

    window.renderKineticUI = function() {
        try {
            initTextWriter();
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (!proj || !proj.kineticScenes || proj.kineticScenes.length === 0) {
                syncWorkspaceScenesToKinetic(true);
            } else {
                if (proj.lastActiveKineticSceneId && proj.kineticScenes.some(s => s.id === proj.lastActiveKineticSceneId)) {
                    activeSceneId = proj.lastActiveKineticSceneId;
                }
            }
            const activeScene = getActiveScene();
            if (activeScene) {
                updateSidebarUIFromScene(activeScene);
            }
            renderScenesGrid();
        } catch (err) {
            console.error("renderKineticUI error:", err);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initTextWriter());
    } else {
        initTextWriter();
    }

})();
