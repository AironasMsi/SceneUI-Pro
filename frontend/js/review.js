// ============================================================================
// REVIEW & CULLING LOGIC (frontend/js/review.js)
// ============================================================================

window.reviewFilter = 'all';
window.reviewList = []; 
window.reviewIndex = 0;
window.reviewMode = 'grid'; // Pradinis režimas yra tinklelis

// Pagrindinė funkcija, kuri surenka nuotraukas iš projektų ir atvaizduoja UI
window.renderReview = function() {
    const proj = window.getProj();
    const allItems = [];
    
    proj.outputs.forEach(out => {
        const variations = out.variations || [];
        const main = variations.find(v => v.id === out.mainId) || variations[variations.length - 1];
        
        // Find best URL: finished URL, or tempUrl, or any valid variation URL
        let activeUrl = (main && main.url) ? main.url : (main && main.tempUrl ? main.tempUrl : "");
        if (!activeUrl && variations.length > 0) {
            const anyWithUrl = variations.find(v => v.url);
            if (anyWithUrl) activeUrl = anyWithUrl.url;
        }

        const isGenerating = !!(out.generating || (main && (main.status === "queued" || main.status === "processing")) || variations.some(v => v.status === "queued" || v.status === "processing"));
        
        const isVideo = (main && main.type === 'video') || (activeUrl && (activeUrl.toLowerCase().endsWith('.mp4') || activeUrl.toLowerCase().endsWith('.webm')));
        if (isVideo) {
            // Video kadrai nereikalauja atrankos Review tabe
            return;
        }
        
        if (activeUrl) {
            allItems.push({
                sceneId: out.sceneId,
                url: activeUrl,
                rating: (main && main.rating) ? main.rating : 'unlisted',
                varId: (main && main.id) ? main.id : (variations[0] ? variations[0].id : ""),
                isGenerating: isGenerating
            });
        }
    });

    // Atnaujiname skaitliukus viršutinėje juostoje
    if($("#countRevAll")) $("#countRevAll").textContent = allItems.length;
    if($("#countRevGood")) $("#countRevGood").textContent = allItems.filter(x => x.rating === 'good').length;
    if($("#countRevBad")) $("#countRevBad").textContent = allItems.filter(x => x.rating === 'bad').length;
    if($("#countRevUn")) $("#countRevUn").textContent = allItems.filter(x => x.rating === 'unlisted').length;

    // Pritaikome aktyvų filtrą
    if (window.reviewFilter === 'all') window.reviewList = allItems;
    else window.reviewList = allItems.filter(x => x.rating === window.reviewFilter);

    const gridEl = $("#reviewGrid");
    const emptyEl = $("#reviewEmpty");
    const detailEl = $("#reviewDetail");

    // Jei nėra ką rodyti
    if (window.reviewList.length === 0) {
        if(emptyEl) emptyEl.classList.remove("hidden");
        if(gridEl) { gridEl.innerHTML = ""; gridEl.style.display = "none"; }
        if(detailEl) detailEl.classList.add("hidden");
        return;
    }

    if(emptyEl) emptyEl.classList.add("hidden");

    // --- TINKLELIO (GRID) GENERAVIMAS ---
    let gridHtml = '';
    window.reviewList.forEach((item, idx) => {
        let badgeClass = item.rating === 'good' ? 'good' : (item.rating === 'bad' ? 'bad' : 'unlisted');
        let genOverlay = item.isGenerating ? `
            <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.65); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; z-index: 12; backdrop-filter: blur(2px);">
                <span class="spin-anim" style="font-size: 22px;">⚡</span>
                <span style="font-size: 11px; font-weight: 800; color: #00ffcc;">Generuojama...</span>
            </div>` : '';

        gridHtml += `
        <div class="card ${badgeClass}" onclick="window.openReviewDetail(${idx})" style="position: relative;">
            <div class="card-img-wrap">
                <div class="rating-badge ${badgeClass}">${item.rating.toUpperCase()}</div>
                ${genOverlay}
                <img src="${item.url}" loading="lazy" />
            </div>
            <div class="card-body" style="padding: 10px; flex: 0;">
                <div class="text-sm font-bold text-center">${item.sceneId}</div>
            </div>
        </div>`;
    });
    if(gridEl) gridEl.innerHTML = gridHtml;

    // --- RODYMO BŪSENOS VALDYMAS ---
    if (window.reviewMode === 'grid') {
        if(gridEl) gridEl.style.display = ""; 
        if(detailEl) detailEl.classList.add("hidden");
    } else {
        if(gridEl) gridEl.style.display = "none";
        if(detailEl) detailEl.classList.remove("hidden");
        window.updateReviewUI();
    }
};

// Zoom & Pan support for Full Review Mode
window.isRevImageZoomed = false;
window.revImageZoomScale = 2.4;

window.resetRevZoom = function() {
    window.isRevImageZoomed = false;
    window.revImageZoomScale = 2.4;
    const img = document.getElementById('revImage');
    const wrap = document.getElementById('revImageWrap');
    const hint = document.getElementById('revZoomHint');
    if (img) {
        img.style.transform = 'scale(1)';
        img.style.transformOrigin = 'center center';
    }
    if (wrap) {
        wrap.style.cursor = 'zoom-in';
    }
    if (hint) {
        hint.textContent = '🔍 Spustelėkite norimoje vietoje prisiartinimui';
    }
};

window.setupRevZoomAndPan = function() {
    const wrap = document.getElementById('revImageWrap');
    const img = document.getElementById('revImage');
    const hint = document.getElementById('revZoomHint');
    if (!wrap || !img || wrap.__revZoomInit) return;
    wrap.__revZoomInit = true;

    img.addEventListener('dragstart', (e) => e.preventDefault());
    wrap.addEventListener('dragstart', (e) => e.preventDefault());

    function toggleZoomAt(clientX, clientY) {
        if (!window.isRevImageZoomed) {
            const rect = img.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const xPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            const yPct = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

            window.isRevImageZoomed = true;
            img.style.transformOrigin = `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`;
            img.style.transform = `scale(${window.revImageZoomScale})`;
            wrap.style.cursor = 'zoom-out';
            if (hint) hint.textContent = `🔍 Prisiartinta ${window.revImageZoomScale.toFixed(1)}x • Judinkite pelytę peržiūrai • Spustelėkite atstatymui (ESC)`;
        } else {
            window.resetRevZoom();
        }
    }

    let downPos = null;

    wrap.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        downPos = { x: e.clientX, y: e.clientY };
    });

    wrap.addEventListener('mouseup', (e) => {
        if (e.button !== 0 || !downPos) return;
        const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
        downPos = null;

        // Jei pelytė pajudėjo mažiau nei 10px (įprastas paspaudimas arba mikropatempimas), perjungti priartinimą
        if (dist <= 10) {
            toggleZoomAt(e.clientX, e.clientY);
        }
    });

    // When zoomed, smoothly pan across the image as the mouse moves
    wrap.addEventListener('mousemove', (e) => {
        if (!window.isRevImageZoomed) return;
        const wrapRect = wrap.getBoundingClientRect();
        if (wrapRect.width === 0 || wrapRect.height === 0) return;

        const xPct = Math.max(0, Math.min(100, ((e.clientX - wrapRect.left) / wrapRect.width) * 100));
        const yPct = Math.max(0, Math.min(100, ((e.clientY - wrapRect.top) / wrapRect.height) * 100));

        img.style.transformOrigin = `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`;
    });

    // Mouse wheel to dynamically adjust zoom level
    wrap.addEventListener('wheel', (e) => {
        if (!window.isRevImageZoomed) return;
        e.preventDefault();
        if (e.deltaY < 0) {
            window.revImageZoomScale = Math.min(5.0, window.revImageZoomScale + 0.3);
        } else {
            window.revImageZoomScale = Math.max(1.4, window.revImageZoomScale - 0.3);
        }
        img.style.transform = `scale(${window.revImageZoomScale})`;
        if (hint) hint.textContent = `🔍 Prisiartinta ${window.revImageZoomScale.toFixed(1)}x • Judinkite pelytę peržiūrai • Spustelėkite atstatymui (ESC)`;
    }, { passive: false });
};

// Atidaro detalų vaizdą
window.openReviewDetail = function(index) {
    window.reviewIndex = index;
    window.reviewMode = 'detail';
    document.body.style.overflow = 'hidden';
    if (typeof window.resetRevZoom === 'function') window.resetRevZoom();
    window.renderReview();
};

// Grįžta į tinklelį
window.closeReviewDetail = function() {
    window.reviewMode = 'grid';
    document.body.style.overflow = '';
    if (typeof window.resetRevZoom === 'function') window.resetRevZoom();
    window.renderReview();
};

// Funkcija einanti prie sekančios nuotraukos arba pabaigos ekrano
window.goNextReview = function() {
    if (typeof window.resetRevZoom === 'function') window.resetRevZoom();
    if (window.reviewIndex >= window.reviewList.length) {
        window.reviewIndex = 0; // Nuo pabaigos atgal į pradžią
    } else {
        window.reviewIndex++;
    }
    window.updateReviewUI();
};

// Funkcija einanti atgal
window.goPrevReview = function() {
    if (typeof window.resetRevZoom === 'function') window.resetRevZoom();
    if (window.reviewIndex <= 0) {
        window.reviewIndex = window.reviewList.length; // Į pabaigos ekraną
    } else {
        window.reviewIndex--;
    }
    window.updateReviewUI();
};

// Pasirinkti variaciją iš dešiniojo skydelio
window.selectReviewVariation = function(sceneId, varId) {
    const proj = window.getProj();
    const out = proj.outputs.find(o => o.sceneId === sceneId);
    if (!out) return;
    
    // Nustatome naują pagrindinę variaciją
    out.mainId = varId;
    
    // Atnaujiname laikiną sąrašą
    const listItem = window.reviewList.find(x => x.sceneId === sceneId);
    const selectedVar = out.variations.find(v => v.id === varId);
    if (listItem && selectedVar) {
        listItem.varId = varId;
        listItem.url = selectedVar.url;
        listItem.rating = selectedVar.rating || 'unlisted';
    }
    
    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    window.updateReviewUI();
    
    // NAUDOJAME DEBOUNCE FUNKCIJĄ UŽUOT IŠKART PIEŠĘ
    if (typeof window.triggerUIRefresh === 'function') {
        window.triggerUIRefresh('images');
    } else if (typeof window.renderImages === 'function') {
        window.renderImages();
    }
};

// Funkcija atnaujinanti detalaus vaizdo UI
window.updateReviewUI = function() {
    const endScreen = $("#reviewEndScreen");
    const detailContent = $("#revDetailContent");

    if (window.reviewIndex >= window.reviewList.length) {
        if(endScreen) endScreen.classList.remove("hidden");
        if(detailContent) detailContent.classList.add("hidden");
        if($("#revVariationsList")) $("#revVariationsList").innerHTML = "";
        return;
    }

    if(endScreen) endScreen.classList.add("hidden");
    if(detailContent) detailContent.classList.remove("hidden");

    const item = window.reviewList[window.reviewIndex];
    if (!item) return;

    const proj = window.getProj();
    const out = proj.outputs.find(o => o.sceneId === item.sceneId);
    const sc = proj.scenes.find(s => s.id === item.sceneId) || {};

    if($("#revTitle")) $("#revTitle").textContent = `Scene ${item.sceneId}`;
    if($("#revIndexBadge")) $("#revIndexBadge").textContent = `${window.reviewIndex + 1} / ${window.reviewList.length}`;
    if($("#revImage")) $("#revImage").src = item.url;
    
    const badge = $("#revStatusBadge");
    if(badge) {
        badge.textContent = item.rating.toUpperCase();
        badge.className = "badge " + (item.rating === 'good' ? 'ready' : (item.rating === 'bad' ? 'bad' : 'warn'));
    }

    if (typeof window.setupRevZoomAndPan === 'function') {
        window.setupRevZoomAndPan();
    }

    const variations = Array.isArray(out ? out.variations : []) ? out.variations : [];
    const mainVar = variations.find(v => v.id === item.varId) || variations[variations.length - 1] || null;
    const isGen = !!(out && (out.generating || (mainVar && (mainVar.status === 'queued' || mainVar.status === 'processing')) || variations.some(v => v.status === 'queued' || v.status === 'processing')));
    const actionType = (window.lastGenActionByScene && window.lastGenActionByScene[item.sceneId]) || 'regen';

    const btnRegen = $("#btnRevRegenNow");
    const btnEditPrompt = $("#btnRevEditPrompt");
    const btnFurtherEdit = $("#btnRevFurtherEdit");

    if (isGen) {
        if (btnRegen) {
            btnRegen.disabled = true;
            btnRegen.style.opacity = '0.65';
            btnRegen.style.cursor = 'not-allowed';
            if (actionType === 'regen') {
                btnRegen.innerHTML = `<span class="spin-anim">⚡</span> Generuojama...`;
            } else {
                btnRegen.innerHTML = `🔄 Pergeneruoti Kadrą`;
            }
        }
        if (btnEditPrompt) {
            btnEditPrompt.disabled = true;
            btnEditPrompt.style.opacity = '0.65';
            btnEditPrompt.style.cursor = 'not-allowed';
            if (actionType === 'edit') {
                btnEditPrompt.innerHTML = `<span class="spin-anim">⚡</span> Redaguojama...`;
            } else {
                btnEditPrompt.innerHTML = `✏️ Redaguoti`;
            }
        }
        if (btnFurtherEdit) {
            btnFurtherEdit.disabled = true;
            btnFurtherEdit.style.opacity = '0.65';
            btnFurtherEdit.style.cursor = 'not-allowed';
            if (actionType === 'further_edit') {
                btnFurtherEdit.innerHTML = `<span class="spin-anim">⚡</span> Taisoma...`;
            } else {
                btnFurtherEdit.innerHTML = `🎨 Pažangus Pataisymas`;
            }
        }
    } else {
        if (btnRegen) {
            btnRegen.disabled = false;
            btnRegen.innerHTML = `🔄 Pergeneruoti Kadrą`;
            btnRegen.style.opacity = '1';
            btnRegen.style.cursor = 'pointer';
            btnRegen.onclick = () => window.regenerateReviewScene(item.sceneId, item.varId);
        }
        if (btnEditPrompt) {
            btnEditPrompt.disabled = false;
            btnEditPrompt.innerHTML = `✏️ Redaguoti`;
            btnEditPrompt.style.opacity = '1';
            btnEditPrompt.style.cursor = 'pointer';
            btnEditPrompt.onclick = () => {
                if (typeof window.openEdit === 'function') {
                    window.openEdit(item.sceneId);
                }
            };
        }
        if (btnFurtherEdit) {
            btnFurtherEdit.disabled = false;
            btnFurtherEdit.innerHTML = `🎨 Pažangus Pataisymas`;
            btnFurtherEdit.style.opacity = '1';
            btnFurtherEdit.style.cursor = 'pointer';
            btnFurtherEdit.onclick = () => {
                if (typeof window.openFurtherEdit === 'function') {
                    window.openFurtherEdit(item.sceneId, item.varId);
                }
            };
        }
    }

    const btnJump = $("#btnRevJumpImages");
    if (btnJump) {
        btnJump.onclick = () => window.jumpToSceneInImages(item.sceneId);
    }
    const p = (mainVar && mainVar.params) || (out && out.params) || sc || {};

    if($("#revMetaPrompt")) $("#revMetaPrompt").textContent = (p && p.prompt) || "-";
    if($("#revMetaText")) $("#revMetaText").textContent = (proj.sceneTextById && proj.sceneTextById[item.sceneId]) || "-";
    
    const globals = proj.globals || { w: 1920, h: 1080, steps: 4, cfg: 1.0 };
    if($("#revMetaParams")) {
        $("#revMetaParams").innerHTML = `
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:4px">
                <span>Res:</span> <span style="color:var(--text)">${p.w || globals.w || 1920} x ${p.h || globals.h || 1080}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:4px">
                <span>Steps / CFG:</span> <span style="color:var(--text)">${p.steps || globals.steps || 4} / ${p.cfg || globals.cfg || 1.0}</span>
            </div>
            <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; margin-bottom:4px">
                <span>Seed:</span> <span style="color:var(--text)">${(mainVar && mainVar.seedUsed) || p.seed || 'Auto'}</span>
            </div>
            <div style="display:flex; justify-content:space-between">
                <span>Mode:</span> <span style="color:var(--accent)">${(mainVar && mainVar.wfMode) || 'N/A'}</span>
            </div>
        `;
    }

    const refsDiv = $("#revMetaRefs");
    if (refsDiv) {
        let refsHtml = '';
        [p.refA, p.refB, p.refC].forEach(ref => {
            if (ref && ref !== "" && ref !== "none") {
                let thumbUrl = "";
                if (ref.startsWith('/') || ref.startsWith('http') || ref.startsWith('data:')) {
                    thumbUrl = ref;
                } else if (state.connected && state.serverUrl) {
                    thumbUrl = `${state.serverUrl}view?filename=${encodeURIComponent(ref)}&type=input`;
                } else {
                    thumbUrl = `/vault/${encodeURIComponent(ref)}`;
                }
                const label = ref.replace(/\.[^/.]+$/, '').substring(0, 4).toUpperCase();
                refsHtml += `
                    <div style="position:relative; width:44px; height:44px; border-radius:6px; overflow:hidden; border:1px solid rgba(255,255,255,0.18); background:#111; display:flex; align-items:center; justify-content:center;" title="${escapeHtml(ref)}">
                        <img src="${thumbUrl}" class="ref-thumb" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                        <div style="display:none; width:100%; height:100%; align-items:center; justify-content:center; background:linear-gradient(135deg, #1e293b, #0f172a); color:#38bdf8; font-size:10px; font-weight:800;">${label}</div>
                    </div>`;
            }
        });
        if (refsHtml === '') refsHtml = '<div class="text-xs text-muted">Nėra priskirtų veikėjų</div>';
        refsDiv.innerHTML = refsHtml;
    }

    const varsDiv = $("#revVariationsList");
    if (varsDiv) {
        let varsHtml = '';
        out.variations.forEach((v, vIdx) => {
            if (!v.url) return; 
            const isActive = (v.id === item.varId);
            const info = v.createdAt ? v.createdAt.split(' ')[1] : `Var ${vIdx+1}`;
            varsHtml += `
                <div class="var-side-card ${isActive ? 'active' : ''}" onclick="window.selectReviewVariation('${item.sceneId}', '${v.id}')">
                    <img src="${v.url}" loading="lazy" />
                    <div class="flex-col" style="gap:4px">
                        <div class="text-xs font-bold" style="color: ${isActive ? 'var(--accent)' : 'var(--text)'}">${isActive ? '★ MAIN' : 'Variation'}</div>
                        <div class="text-xs text-muted" style="font-size:10px">${info}</div>
                    </div>
                </div>
            `;
        });
        varsDiv.innerHTML = varsHtml;
    }
};

window.regenerateReviewScene = function(sceneId, varId) {
    const proj = window.getProj();
    const out = proj.outputs.find(o => o.sceneId === sceneId || String(o.sceneId) === String(sceneId));
    if (out && (out.generating || (out.variations && out.variations.some(v => v.status === 'queued' || v.status === 'processing')))) {
        if (typeof toast === 'function') toast("Generuojama", `Ši scena jau laukia eilėje arba yra generuojama...`, "warn");
        return;
    }
    window.lastGenActionByScene = window.lastGenActionByScene || {};
    window.lastGenActionByScene[sceneId] = 'regen';
    if (out) out.generating = true;
    window.updateReviewUI();

    if (typeof window.doRegenerate === 'function') {
        window.doRegenerate(sceneId, varId);
        if (typeof toast === 'function') toast("Generavimas", `Scene #${sceneId} pradėta pergeneruoti fone... ⚡`, "info");
    } else if (typeof window.doGenerate === 'function') {
        window.doGenerate(sceneId);
        if (typeof toast === 'function') toast("Generavimas", `Scene #${sceneId} pradėta generuoti... ⚡`, "info");
    }
    window.renderReview();
};

window.jumpToSceneInImages = function(sceneId) {
    window.closeReviewDetail();
    const navItem = document.querySelector('.nav-item[data-tab="images"]');
    if (navItem) navItem.click();
    setTimeout(() => {
        const cleanId = String(sceneId).replace(/^S/i, '');
        const card = document.querySelector(`[data-scene-id="${sceneId}"]`) || 
                     document.querySelector(`[data-scene-id="${cleanId}"]`) || 
                     document.querySelector(`[data-scene-id="S${cleanId}"]`) ||
                     document.getElementById(`scene-card-${sceneId}`) ||
                     document.getElementById(`scene-card-${cleanId}`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.transition = 'box-shadow 0.3s ease, transform 0.3s ease';
            card.style.boxShadow = '0 0 25px #00ffcc';
            card.style.transform = 'scale(1.02)';
            setTimeout(() => {
                card.style.boxShadow = '';
                card.style.transform = '';
            }, 2500);
        }
        if (typeof window.openViewer === 'function') {
            window.openViewer(sceneId);
        }
    }, 250);
};

// Įvertinimas (su galimybe atšaukti į 'unlisted' paspaudus tą patį)
window.setReviewRating = function(rating) {
    if (window.reviewList.length === 0 || window.reviewMode !== 'detail' || window.reviewIndex >= window.reviewList.length) return;
    
    const item = window.reviewList[window.reviewIndex];
    // Jei jau buvo nustatytas tas pats reitingas, atšaukiame atgal į 'unlisted'
    const finalRating = (item.rating === rating) ? 'unlisted' : rating;

    const proj = window.getProj();
    const out = proj.outputs.find(o => o.sceneId === item.sceneId);
    
    if (out) {
        const main = out.variations.find(v => v.id === item.varId);
        if (main) main.rating = finalRating;
    }
    
    item.rating = finalRating;
    if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
    
    if($("#countRevGood")) $("#countRevGood").textContent = proj.outputs.filter(o => {
        const m = o.variations.find(v => v.id === o.mainId) || o.variations[o.variations.length-1];
        return m && m.rating === 'good';
    }).length;
    
    if($("#countRevBad")) $("#countRevBad").textContent = proj.outputs.filter(o => {
        const m = o.variations.find(v => v.id === o.mainId) || o.variations[o.variations.length-1];
        return m && m.rating === 'bad';
    }).length;

    if($("#countRevUn")) $("#countRevUn").textContent = proj.outputs.filter(o => {
        const m = o.variations.find(v => v.id === o.mainId) || o.variations[o.variations.length-1];
        return m && (!m.rating || m.rating === 'unlisted');
    }).length;
    
    if (window.reviewFilter !== 'all') {
        window.renderReview();
    } else {
        window.goNextReview();
    }
};

// ============================================================================
// ATSISIUNTIMO (DOWNLOAD ZIP) FUNKCIJA (STANDARTIZUOTI PAVADINIMAI)
// ============================================================================
window.downloadReviewZip = async function() {
    if (window.reviewList.length === 0) {
        return toast("Info", "There are no images in this filter to download.", "warn");
    }

    const btn = $("#btnDownloadReview");
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="pulse-text">⏳ Zipping ${window.reviewList.length} files...</span>`;
    toast("Zipping...", "Server is preparing the archive. Please wait.", "info");

    const filesToZip = [];
    
    window.reviewList.forEach(item => {
        if (item.url) {
            let actualFilename = "";
            try {
                // 1. Jei tai sena ComfyUI nuoroda (pvz: ?filename=S1.png)
                const urlObj = new URL(item.url, window.location.origin);
                actualFilename = urlObj.searchParams.get("filename");
            } catch(e) {}
            
            // 2. Jei tai nauja Vault nuoroda (pvz: /vault/S1_edited.png)
            if (!actualFilename) {
                actualFilename = item.url.split('/').pop().split('?')[0];
            }

            // Įsitikiname, kad neištraukėme serverio žodžio "view"
            if (actualFilename && actualFilename !== "view") {
                filesToZip.push({
                    filename: actualFilename,
                    // PAKEISTA: Dabar failo pavadinimas ZIP archyve visada bus tvarkingas, pvz. "S1_main"
                    prefix: `${item.sceneId}_main` 
                });
            }
        }
    });

    if (filesToZip.length === 0) {
        btn.disabled = false;
        btn.innerHTML = originalText;
        return toast("Error", "Could not read valid filenames.", "error");
    }

    try {
        const filterName = window.reviewFilter.charAt(0).toUpperCase() + window.reviewFilter.slice(1);
        const zipName = `SceneUI_Review_${filterName}_${new Date().toISOString().replace(/[:T\.\-]/g, '').substring(0,14)}.zip`;

        // Siunčiame prašymą sukurti ZIP jūsų Python serveriui
        const res = await fetch('/api/zip', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ files: filesToZip, name: zipName })
        });

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const blob = await res.blob(); 
        const a = document.createElement('a'); 
        a.href = URL.createObjectURL(blob);
        a.download = zipName;
        document.body.appendChild(a); 
        a.click(); 
        a.remove(); 
        URL.revokeObjectURL(a.href);
        
        toast("Success", "ZIP archive downloaded!", "success");

    } catch (e) {
        toast("Download Error", "Failed to create ZIP: " + e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// ============================================================================
// EVENT LISTENERS
// ============================================================================

if($("#btnDownloadReview")) {
    $("#btnDownloadReview").addEventListener("click", window.downloadReviewZip);
}

["All", "Good", "Bad", "Unlisted"].forEach(f => {
    const btnId = `#btnRev${f === 'Unlisted' ? 'Unlisted' : f}`;
    const filterVal = f.toLowerCase();
    const btnEl = $(btnId);
    
    if(btnEl) {
        btnEl.addEventListener("click", () => {
            ["All", "Good", "Bad", "Unlisted"].forEach(x => {
               const el = $(`#btnRev${x === 'Unlisted' ? 'Unlisted' : x}`);
               if(el) el.classList.remove('active');
            });
            btnEl.classList.add('active');
            window.reviewFilter = filterVal;
            window.reviewMode = 'grid';
            window.reviewIndex = 0;
            window.renderReview();
        });
    }
});

if($("#btnRevBack")) {
    $("#btnRevBack").addEventListener("click", window.closeReviewDetail);
}

if($("#btnRevPrev")) $("#btnRevPrev").addEventListener("click", window.goPrevReview);
if($("#btnRevNext")) $("#btnRevNext").addEventListener("click", window.goNextReview);
if($("#btnRevSetGood")) $("#btnRevSetGood").addEventListener("click", () => window.setReviewRating('good'));
if($("#btnRevSetBad")) $("#btnRevSetBad").addEventListener("click", () => window.setReviewRating('bad'));

document.addEventListener("keydown", e => {
    const reviewTab = $("#tab-review");
    const anyModalOpen = document.querySelector('.modal-overlay.show') !== null || document.querySelector('.viewer.show') !== null;
    
    if (reviewTab && !reviewTab.classList.contains("hidden") && !anyModalOpen && window.reviewMode === 'detail' && window.reviewList.length > 0) {
        if (e.key === "Escape") {
            window.closeReviewDetail();
            e.preventDefault();
        } else if (e.key === "ArrowLeft") {
            window.goPrevReview();
        } else if (e.key === "ArrowRight") {
            window.goNextReview();
        } else if (e.key.toLowerCase() === "g" && window.reviewIndex < window.reviewList.length) { 
            window.setReviewRating('good'); 
        } else if (e.key.toLowerCase() === "b" && window.reviewIndex < window.reviewList.length) { 
            window.setReviewRating('bad'); 
        }
    }
});