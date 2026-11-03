// ============================================================================
// 10. TIMELINE LOGIC (TAB 4)
// ============================================================================

// Saugus plėtinio ištraukimas iš bet kokio URL ar failo pavadinimo
function getFileExtension(url) {
    if (!url) return 'png';
    try {
        const cleanUrl = url.split('?')[0].split('#')[0];
        const parts = cleanUrl.split('/');
        const filename = parts[parts.length - 1];
        if (filename.includes('.')) {
            const ext = filename.split('.').pop().toLowerCase();
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    } catch (e) {
        console.error("Error parsing file extension:", e);
    }
    return 'png'; // Standartinis fallback variantas
}

function formatAudioTime(sec) {
    if (isNaN(sec) || sec === null || sec === undefined) return "00:00.00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

window._playingSceneId = null;
window._sceneEndTime = null;
let _rafAudioId = null;

function _startRafAudioMonitor() {
    if (_rafAudioId) cancelAnimationFrame(_rafAudioId);
    function check() {
        const player = document.getElementById("tlAudioElement");
        const btnPlay = document.getElementById("tlBtnPlay");
        if (player && !player.paused && window._playingSceneId !== null && window._sceneEndTime !== null) {
            if (player.currentTime >= window._sceneEndTime) {
                player.pause();
                player.currentTime = window._sceneEndTime;
                window._playingSceneId = null;
                window._sceneEndTime = null;
                window.resetSceneButtons();
                if (btnPlay) btnPlay.textContent = "▶";
                return;
            }
            _rafAudioId = requestAnimationFrame(check);
        }
    }
    _rafAudioId = requestAnimationFrame(check);
}

window.resetSceneButtons = function() {
    if (_rafAudioId) {
        cancelAnimationFrame(_rafAudioId);
        _rafAudioId = null;
    }
    document.querySelectorAll('.btn-scene-play').forEach(btn => {
        btn.textContent = "▶";
        btn.classList.remove('playing');
        btn.style.background = '';
        btn.style.borderColor = '';
    });
};

window.togglePlayScene = function(sceneId, start, end) {
    const player = document.getElementById("tlAudioElement");
    const btnPlay = document.getElementById("tlBtnPlay");
    
    if (!player || !player.src) {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (proj && proj.audioTrack) {
            player.src = proj.audioTrack;
        } else {
            return toast("Audio", "No audio track attached to play.", "info");
        }
    }

    const currentSceneBtn = document.getElementById(`btn-play-scene-${sceneId}`);

    // If already playing this scene, toggle to pause/stop
    if (window._playingSceneId === sceneId && !player.paused) {
        player.pause();
        window._playingSceneId = null;
        window._sceneEndTime = null;
        window.resetSceneButtons();
        if (btnPlay) btnPlay.textContent = "▶";
        return;
    }

    // Play this scene with a natural tail buffer (+0.22s) so the last syllable isn't cut off
    window._playingSceneId = sceneId;
    const maxDur = (player.duration && !isNaN(player.duration)) ? player.duration : 999999;
    window._sceneEndTime = (end !== null && end !== undefined && end > start) ? Math.min(maxDur, end + 0.22) : null;
    
    window.resetSceneButtons();
    if (currentSceneBtn) {
        currentSceneBtn.textContent = "⏸";
        currentSceneBtn.classList.add('playing');
        currentSceneBtn.style.background = 'var(--accent, #3b82f6)';
        currentSceneBtn.style.borderColor = '#fff';
    }

    player.currentTime = Math.max(0, start || 0);
    player.play().then(() => {
        if (btnPlay) btnPlay.textContent = "⏸";
        _startRafAudioMonitor();
    }).catch((e) => {
        console.warn("Audio play failed:", e);
        window.resetSceneButtons();
        window._playingSceneId = null;
        window._sceneEndTime = null;
    });
};

window.seekTimelineToTime = function(seconds) {
    window.togglePlayScene(null, seconds, null);
};

window.updateTimelineAudioUI = function() {
    const proj = typeof window.getProj === 'function' ? window.getProj() : null;
    const badge = document.getElementById("tlAudioStatusBadge");
    const trackInfo = document.getElementById("tlCurrentTrackInfo");
    const player = document.getElementById("tlAudioElement");
    const btnPlay = document.getElementById("tlBtnPlay");
    const timeLabel = document.getElementById("tlTimeLabel");
    const playhead = document.getElementById("tlPlayhead");

    if (!proj || !proj.audioTrack) {
        if (badge) {
            badge.textContent = "No Audio Loaded";
            badge.className = "badge bad text-xs";
        }
        if (trackInfo) trackInfo.textContent = "🎵 Track: None attached";
        if (btnPlay) btnPlay.disabled = true;
        if (timeLabel) timeLabel.textContent = "00:00.00 / 00:00.00";
        if (playhead) playhead.style.display = "none";
        if (player) {
            player.pause();
            player.src = "";
        }
        window.resetSceneButtons();
        return;
    }

    const cleanName = proj.audioTrack.split('/').pop().split('?')[0];
    if (badge) {
        badge.textContent = `Attached: ${cleanName.substring(0, 20)}`;
        badge.className = "badge good text-xs";
    }
    if (trackInfo) trackInfo.textContent = `🎵 Track: ${cleanName}`;
    if (btnPlay) btnPlay.disabled = false;

    if (player && player.src !== window.location.origin + proj.audioTrack && !player.src.endsWith(proj.audioTrack)) {
        player.src = proj.audioTrack;
        player.load();
    }
};

window.renderTimeline = function() {
   const proj = window.getProj();
   const tbody = document.getElementById("tlTbody");
   const visual = document.getElementById("tlVisual");
   const player = document.getElementById("tlAudioElement");

   window.updateTimelineAudioUI();

   const wScriptEl = document.getElementById("wScript");
   if(wScriptEl) {
       wScriptEl.value = proj.wScript || "";
   }
   const tlGapsEl = document.getElementById("tlGaps");
   if(tlGapsEl) {
       tlGapsEl.value = proj.tlGaps || "extend";
   }
   const tlMinLenEl = document.getElementById("tlMinLen");
   if(tlMinLenEl) {
       tlMinLenEl.value = (proj.tlMinLen !== undefined) ? proj.tlMinLen : "1.0";
   }

   if(!proj.timeline || proj.timeline.length === 0) {
       if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding:20px">No timeline built yet. Generate audio or align to build.</td></tr>`;
       if(visual) visual.innerHTML = `<div class="placeholder-view text-muted text-xs">Timeline preview will appear here</div><div id="tlPlayhead" style="position:absolute; top:0; bottom:0; left:0; width:2px; background:#fff; box-shadow: 0 0 8px rgba(255,255,255,0.9); z-index:20; pointer-events:none; transition: none; display:none;"><div style="position:absolute; top:0; left:-4px; width:10px; height:10px; background:var(--accent); clip-path: polygon(0 0, 100% 0, 50% 100%);"></div></div>`;
       return;
   }

   let maxEnd = 0;
   proj.timeline.forEach(t => { if(t.end && t.end > maxEnd) maxEnd = t.end; });
   if(maxEnd === 0) maxEnd = 10;

   let htmlT = '';
   let htmlV = '';

    function formatTimelineSnippet(str, maxChars = 52) {
        if (!str) return '-';
        const clean = str.trim().replace(/\s+/g, ' ');
        if (clean.length <= maxChars) return clean;
        const sub = clean.substring(0, maxChars);
        const lastSpace = sub.lastIndexOf(' ');
        const boundary = lastSpace > 24 ? lastSpace : maxChars;
        return clean.substring(0, boundary) + '…';
    }

    proj.timeline.forEach((t, i) => {
        const scObj = (proj.scenes || []).find(s => s.id === t.id || String(s.id).replace(/^S/i,'') === String(t.id).replace(/^S/i,''));
        const txt = (proj.sceneTextById && proj.sceneTextById[t.id]) || (scObj ? (scObj.text || scObj.prompt || '') : '') || "";

        // Dinaminis tikrinimas: ar ši scena turi sukurtą ar įkeltą vaizdą?
        const tNum = parseInt(String(t.id).replace(/\D/g, ''), 10);
        const out = proj.outputs ? proj.outputs.find(o => {
            if (!o || !o.sceneId) return false;
            if (o.sceneId === t.id || o.sceneId.toLowerCase() === String(t.id).toLowerCase()) return true;
            const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
            return !isNaN(tNum) && !isNaN(oNum) && tNum === oNum;
        }) : null;

        const isKinetic = scObj && (scObj.isKinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(scObj)));

        const hasImage = isKinetic || (out && (
            (out.mainId && out.variations && out.variations.some(v => v.id === out.mainId && v.url)) ||
            (out.variations && out.variations.some(v => v.status === 'done' && v.url))
        ));

        if (hasImage) {
            t.status = 'MATCHED';
        } else if (t.status === 'MATCHED' && !hasImage) {
            t.status = 'MISSING_IMAGE';
        }

        const bd = (t.status === 'MATCHED') ? 'ready' : (t.status === 'MISSING_IMAGE' ? 'warn' : 'bad');
        const bg = (t.status === 'MATCHED') ? 'var(--good)' : (t.status === 'MISSING_IMAGE' ? 'var(--warn)' : 'var(--bad)');
        
        const sStr = t.start !== null ? t.start.toFixed(2) + "s" : "-";
        const eStr = t.end !== null ? t.end.toFixed(2) + "s" : "-";
        const dStr = t.dur > 0 ? t.dur.toFixed(2) + "s" : "-";

        const actualVoiceEnd = (t.originalEnd !== undefined && t.originalEnd !== null) ? t.originalEnd : (t.origEnd !== undefined && t.origEnd !== null) ? t.origEnd : t.end;
        const scEnd = (actualVoiceEnd !== null && actualVoiceEnd !== undefined) ? actualVoiceEnd : (t.start + (t.dur || 5));
        const isCurrentPlaying = (window._playingSceneId === t.id && player && !player.paused);
        const playBtnIcon = isCurrentPlaying ? "⏸" : "▶";
        const playBtnStyle = isCurrentPlaying ? "background: var(--accent, #3b82f6); border-color: #fff;" : "";

        const snippet = formatTimelineSnippet(txt, 52);

        htmlT += `<tr style="cursor: pointer;" onclick="window.togglePlayScene('${t.id}', ${t.start || 0}, ${scEnd})">
           <td class="mono font-bold">${t.id}</td>
           <td class="text-xs text-muted" title="${escapeHtml(txt)}" style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(snippet)}
           </td>
           <td class="mono">${sStr}</td>
           <td class="mono">${eStr}</td>
           <td class="mono">${dStr}</td>
           <td><span class="badge ${bd}">${t.status}</span></td>
           <td style="text-align:center;">
              <button id="btn-play-scene-${t.id}" class="btn primary btn-scene-play text-xs" style="width:32px; height:32px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:6px; font-size:13px; ${playBtnStyle}" onclick="event.stopPropagation(); window.togglePlayScene('${t.id}', ${t.start || 0}, ${scEnd})" title="Play/Pause this scene (${sStr} - ${eStr})">${playBtnIcon}</button>
           </td>
        </tr>`;

        if(t.start !== null && t.dur > 0) {
            const left = (t.start / maxEnd) * 100;
            const width = (t.dur / maxEnd) * 100;
            htmlV += `<div onclick="event.stopPropagation(); window.togglePlayScene('${t.id}', ${t.start}, ${scEnd})" style="position:absolute; left:${left}%; width:${width}%; top:5px; bottom:5px; background:${bg}; opacity:0.85; border-radius:4px; border:1px solid rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:10px; font-weight:bold; color:#000; cursor:pointer;" title="Scene ${t.id} (${sStr} - ${eStr}): ${escapeHtml(txt || 'Be teksto')}">${t.id}</div>`;
        }
    });

    htmlV += `<div id="tlPlayhead" style="position:absolute; top:0; bottom:0; left:0; width:2px; background:#fff; box-shadow: 0 0 8px rgba(255,255,255,0.9); z-index:20; pointer-events:none; transition: none; display:none;"><div style="position:absolute; top:0; left:-4px; width:10px; height:10px; background:var(--accent); clip-path: polygon(0 0, 100% 0, 50% 100%);"></div></div>`;

    if(tbody) tbody.innerHTML = htmlT;
    if(visual) visual.innerHTML = htmlV;
}

// NAUJA: Automatinis laiko juostos suformavimas (Fallback), kai sugeneruojamas naujas balsas
window.autoAlignTimeline = function(audioUrl) {
    const proj = window.getProj();
    if (!proj.scenes || proj.scenes.length === 0) return;

    const audioLoader = new Audio(audioUrl);
    audioLoader.addEventListener("loadedmetadata", () => {
        const totalDuration = audioLoader.duration || 30.0; // Jei nepavyksta nuskaityti, default 30s
        const sceneCount = proj.scenes.length;
        const perSceneDuration = totalDuration / sceneCount;

        proj.timeline = [];
        proj.scenes.forEach((sc, index) => {
            const start = index * perSceneDuration;
            const end = start + perSceneDuration;

            const out = proj.outputs.find(o => o.sceneId === sc.id);
            const isKinetic = sc.isKinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));
            const hasImage = isKinetic || (out && out.mainId != null);

            proj.timeline.push({
                id: sc.id,
                start: start,
                end: end,
                dur: perSceneDuration,
                status: hasImage ? 'MATCHED' : 'MISSING_IMAGE',
                originalStart: start,
                originalEnd: end
            });
        });

        window.saveCurrentProject();
        window.buildTimelineConfig();
    });
    
    // Saugiklis, jei audio failas kraunasi per ilgai ar su klaidomis
    audioLoader.addEventListener("error", () => {
        console.warn("Audio metadata load failed, applying generic 5s per scene fallback.");
        proj.timeline = [];
        proj.scenes.forEach((sc, index) => {
            const start = index * 5.0;
            const end = start + 5.0;
            const out = proj.outputs.find(o => o.sceneId === sc.id);
            const isKinetic = sc.isKinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));
            const hasImage = isKinetic || (out && out.mainId != null);
            proj.timeline.push({
                id: sc.id, start: start, end: end, dur: 5.0,
                status: hasImage ? 'MATCHED' : 'MISSING_IMAGE',
                originalStart: start, originalEnd: end
            });
        });
        window.saveCurrentProject();
        window.buildTimelineConfig();
    });
}

window.processWhisperResult = function(res) {
    const proj = window.getProj();
    proj.alignedData = res;
    proj.timeline = [];
    
    if (!res || !res.script_alignment || !res.script_alignment.aligned_words) {
        toast("Warning", "No strict script alignment found. Generating proportional timeline fallback.", "warn");
        const currentAudio = proj.audioTrack || null;
        if (currentAudio) {
            window.autoAlignTimeline(currentAudio);
        } else {
            window.renderTimeline();
        }
        return;
    }

    const words = res.script_alignment.aligned_words;
    let wordCursor = 0;

    proj.scenes.forEach((sc, idx) => {
        let text = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || "";
        let tokens = (text.toLowerCase().match(/[a-z0-9]+/g) || []);
        let count = tokens.length;

        if (count === 0) {
            proj.timeline.push({ id: sc.id, start: null, end: null, dur: 0, status: 'NO_TEXT', originalStart: null, originalEnd: null });
            return;
        }

        let slice = words.slice(wordCursor, wordCursor + count);
        wordCursor += count;

        let matched = slice.filter(w => w.matched && w.start !== null && w.end !== null);

        const out = proj.outputs.find(o => o.sceneId === sc.id || String(o.sceneId) === String(sc.id).replace(/^S/i, ''));
        const isKinetic = sc.isKinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));
        const hasImage = isKinetic || (out && out.mainId != null);

        if (matched.length > 0) {
            let st = matched[0].start;
            let en = matched[matched.length - 1].end;
            let dur = Math.max(0.4, Number((en - st).toFixed(2)));
            proj.timeline.push({
                id: sc.id,
                start: st,
                end: en,
                dur: dur,
                duration: dur,
                status: hasImage ? 'MATCHED' : 'MISSING_IMAGE',
                originalStart: st,
                originalEnd: en
            });
        } else {
            proj.timeline.push({ id: sc.id, start: null, end: null, dur: 0, status: 'UNMATCHED', originalStart: null, originalEnd: null });
        }
    });

    window.saveCurrentProject(); 
    window.buildTimelineConfig();
};

window.buildTimelineConfig = function() {
   const proj = window.getProj();
   const keepGapsEl = document.getElementById("tlGaps");
   const minLenEl = document.getElementById("tlMinLen");
   
   const keepGaps = keepGapsEl ? keepGapsEl.value === "keep" : false;
   const minLen = minLenEl ? (parseFloat(minLenEl.value) || 1.0) : 1.0;

   if (!proj.timeline) proj.timeline = [];

   proj.timeline.forEach(t => {
       if(t.originalStart !== null && t.originalStart !== undefined) {
           t.start = t.originalStart; t.end = t.originalEnd;
           if(t.end - t.start < minLen) { t.end = t.start + minLen; }
           t.dur = t.end - t.start;
       }
   });

   if(!keepGaps && proj.timeline.length > 0) {
       for(let i=0; i < proj.timeline.length - 1; i++) {
           let c = proj.timeline[i];
           if(c.start === null) continue;
           let nextValid = i + 1;
           while(nextValid < proj.timeline.length && proj.timeline[nextValid].start === null) nextValid++;
           if(nextValid < proj.timeline.length) {
               let n = proj.timeline[nextValid];
               if(c.end < n.start) { c.end = n.start; c.dur = c.end - c.start; }
           }
       }
   }
   window.saveCurrentProject(); 
   window.renderTimeline();
}

window.generateFCPXML = function(timeline, audioName) {
   const proj = window.getProj();
   const fps = 24;
   let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <project>
    <name>Scene UI Timeline Export</name>
    <children>
      <sequence id="sequence-1">
        <name>Main Timeline</name>
        <duration>864000</duration>
        <rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>
        <media>
          <video>
            <format>
              <samplecharacteristics>
                <width>${proj.globals.w}</width>
                <height>${proj.globals.h}</height>
              </samplecharacteristics>
            </format>
            <track>\n`;
   timeline.forEach(sc => {
       if(sc.start === null || sc.end === null) return;
       const scNum = parseInt(String(sc.id).replace(/\D/g, ''), 10);
       const out = proj.outputs ? proj.outputs.find(o => {
           if (!o || !o.sceneId) return false;
           if (o.sceneId === sc.id || o.sceneId.toLowerCase() === String(sc.id).toLowerCase()) return true;
           const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
           return !isNaN(scNum) && !isNaN(oNum) && scNum === oNum;
       }) : null;
       if(!out) return;
       
       const main = (out.mainId && out.variations && out.variations.find(v => v.id === out.mainId && v.url)) 
                 || (out.variations && out.variations.find(v => v.status === 'done' && v.url)) 
                 || (out.variations && out.variations[out.variations.length-1]);
       if(!main || !main.url) return;
       
       // DINAMINIS IR SAUGUS PLĖTINIO NUSTATYMAS XML FAILE
       const ext = getFileExtension(main.url);
       const filename = `${sc.id}_main.${ext}`;
       const startFrame = Math.round(sc.start * fps); 
       const endFrame = Math.round(sc.end * fps); 
       const durFrame = endFrame - startFrame;
       const offset = 432000;

       xml += `              <clipitem id="clip-${sc.id}">
                <name>${filename}</name>
                <type>video</type>
                <duration>864000</duration>
                <rate><timebase>${fps}</timebase></rate>
                <file id="file-${sc.id}">
                  <name>${filename}</name>
                  <pathurl>file://localhost/${filename}</pathurl>
                  <rate><timebase>${fps}</timebase></rate>
                  <duration>864000</duration>
                  <media><video><duration>864000</duration></video></media>
                </file>
                <start>${startFrame}</start>
                <end>${endFrame}</end>
                <in>${offset}</in>
                <out>${offset + durFrame}</out>
              </clipitem>\n`;
   });

   xml += `            </track>
          </video>
          <audio>
            <track>
              <clipitem id="audio-1">
                <name>${audioName}</name>
                <file id="file-audio">
                  <name>${audioName}</name>
                  <pathurl>file://localhost/${audioName}</pathurl>
                  <rate><timebase>${fps}</timebase></rate>
                  <duration>864000</duration>
                  <media><audio><trackcount>2</trackcount></audio></media>
                </file>
                <start>0</start>
                <end>864000</end>
                <in>0</in>
                <out>864000</out>
              </clipitem>
            </track>
          </audio>
        </media>
      </sequence>
    </children>
  </project>
</xmeml>`;
   return xml;
}

// ----------------------------------------------------------------------------
// EVENT LISTENERS
// ----------------------------------------------------------------------------

// Delegated listeners for guaranteed binding
document.addEventListener("click", (e) => {
    const btnConcat = e.target.closest("#btnConcatScript");
    if (btnConcat) {
        const proj = window.getProj();
        if (!proj.scenes || proj.scenes.length === 0) return toast("Info", "No scenes found in project.", "info");
        const fullScript = proj.scenes.map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || s.prompt || "").filter(Boolean).join(" ");
        const wScript = document.getElementById("wScript");
        if (wScript) {
            wScript.value = fullScript;
            wScript.focus();
        }
        proj.wScript = fullScript;
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        toast("Success", "Script text compiled from all scenes!", "success");
    }
});

document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "wScript") {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (proj) {
            proj.wScript = e.target.value;
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }
    }
});

const tlAudioFileInput = document.getElementById("tlAudioFile");
if(tlAudioFileInput) {
    tlAudioFileInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if(!file) return;
        toast("Uploading Audio", `Uploading ${file.name}...`, "info");
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/audio/upload_track", { method: "POST", body: fd });
            const data = await res.json();
            if(data.status === "success" && data.url) {
                const proj = window.getProj();
                proj.audioTrack = data.url;
                window.saveCurrentProject();
                
                // If timeline has no timestamps yet, auto align based on scenes count
                if (!proj.timeline || proj.timeline.length === 0) {
                    if (typeof window.autoAlignTimeline === 'function') {
                        window.autoAlignTimeline(data.url);
                    }
                }
                
                if(typeof window.updateTimelineAudioUI === 'function') window.updateTimelineAudioUI();
                if(typeof window.renderTimeline === 'function') window.renderTimeline();
                if(typeof window.renderRenderStudioUI === 'function') window.renderRenderStudioUI();
                toast("Audio Saved", `Audio track ${file.name} saved to project!`, "success");
            }
        } catch(err) {
            console.error("Audio track upload failed:", err);
            toast("Upload Error", err.message, "error");
        }
    });
}


    // ==========================================
    // SIMULATED WHISPERX ALIGNMENT (Demo Mode)
    // ==========================================
    async function simulateWhisperXAlignment() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : (window.proj || {});
        const btnAlign = document.getElementById("btnAlignTimeline");
        if (btnAlign) {
            btnAlign.disabled = true;
            btnAlign.innerHTML = '<span class="spin-anim">⏳</span> ⚡ WhisperX GPU: Aligning word phonemes...';
        }

        const dot = document.getElementById("whisperxDot");
        const statusText = document.getElementById("whisperxStatusText");
        const statusSub = document.getElementById("whisperxStatusSub");
        const currentTimeStr = new Date().toLocaleTimeString();

        if (dot) {
            dot.style.background = "#10b981";
            dot.style.boxShadow = "0 0 10px rgba(16,185,129,0.5)";
        }
        if (statusText) statusText.innerHTML = '<span style="color:#10b981; font-weight:800;">WhisperX: GPU Active ✓</span>';
        if (statusSub) statusSub.textContent = `WhisperX Large-v3 engine active (127.0.0.1:8002) • Synced at ${currentTimeStr}`;

        const trackInfo = document.getElementById("tlCurrentTrackInfo");
        if (trackInfo) {
            trackInfo.textContent = `🎵 Track: default_full_script_dialogue.wav (55.99s) • Aligned via WhisperX GPU at ${currentTimeStr}`;
        }

        const wScriptEl = document.getElementById("wScript");
        if (wScriptEl && !wScriptEl.value.trim() && proj.scenes) {
            wScriptEl.value = proj.scenes.map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || '').filter(Boolean).join(' ');
        }

        await new Promise(r => setTimeout(r, 650));

        const default18Timings = [
            { id: 's1', start: 0.071, end: 2.253, dur: 2.182 },
            { id: 's2', start: 2.253, end: 4.354, dur: 2.101 },
            { id: 's3', start: 4.354, end: 7.556, dur: 3.202 },
            { id: 's4', start: 7.556, end: 9.598, dur: 2.042 },
            { id: 's5', start: 9.598, end: 11.96, dur: 2.362 },
            { id: 's6', start: 11.96, end: 15.342, dur: 3.382 },
            { id: 's7', start: 15.342, end: 18.803, dur: 3.461 },
            { id: 's8', start: 18.803, end: 22.523, dur: 3.720 },
            { id: 's9', start: 22.523, end: 24.224, dur: 1.701 },
            { id: 's10', start: 24.224, end: 28.365, dur: 4.141 },
            { id: 's11', start: 28.365, end: 32.585, dur: 4.220 },
            { id: 's12', start: 32.585, end: 36.446, dur: 3.861 },
            { id: 's13', start: 36.446, end: 38.127, dur: 1.681 },
            { id: 's14', start: 38.127, end: 41.047, dur: 2.920 },
            { id: 's15', start: 41.047, end: 45.569, dur: 4.522 },
            { id: 's16', start: 45.569, end: 48.616, dur: 3.047 },
            { id: 's17', start: 48.616, end: 52.785, dur: 4.169 },
            { id: 's18', start: 52.785, end: 55.491, dur: 2.706 }
        ];

        proj.timeline = [];
        const scenes = (proj.scenes && proj.scenes.length) ? proj.scenes : default18Timings.map(t => ({ id: t.id }));
        scenes.forEach((sc, idx) => {
            const scIdStr = String(sc.id || `s${idx+1}`).toLowerCase();
            const num = parseInt(scIdStr.replace(/^s/i, '')) || (idx + 1);
            const timing = default18Timings[num - 1] || default18Timings[idx] || {
                id: sc.id,
                start: Number((idx * 3.1).toFixed(2)),
                end: Number(((idx + 1) * 3.1).toFixed(2)),
                dur: 3.1
            };

            const out = proj.outputs ? proj.outputs.find(o => String(o.sceneId).toLowerCase() === scIdStr || String(o.sceneId).replace(/^S/i, '') === String(num)) : null;
            const isKinetic = sc.isKinetic || (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc));
            const hasMedia = isKinetic || !!(out && (out.mainId || (out.variations && out.variations.length)));

            proj.timeline.push({
                id: sc.id,
                start: timing.start,
                end: timing.end,
                dur: timing.dur,
                duration: timing.dur,
                status: hasMedia ? 'MATCHED' : 'MISSING_IMAGE',
                originalStart: timing.start,
                originalEnd: timing.end
            });
        });

        proj.alignedData = {
            job_id: "demo_whisperx_" + Date.now(),
            model: "large-v3",
            device: "cuda",
            compute_type: "float16",
            language: "en",
            aligned_at: currentTimeStr,
            timing: { seconds_total: 55.491 }
        };

        if (typeof window.saveProjectToDB === 'function') window.saveProjectToDB(state.currentProjectId);
        if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        if (typeof window.buildTimelineConfig === 'function') window.buildTimelineConfig();
        else if (typeof window.renderTimeline === 'function') window.renderTimeline();

        if (btnAlign) {
            btnAlign.disabled = false;
            btnAlign.textContent = "✨ Align / Generate Timestamps (WhisperX)";
        }
    }

const btnAlignTimeline = document.getElementById("btnAlignTimeline");
if(btnAlignTimeline) {
    btnAlignTimeline.addEventListener("click", async () => {
        if (typeof window.isGlobalDemoMode === "function" && window.isGlobalDemoMode()) {
            await simulateWhisperXAlignment();
            return;
        }
       const tlAudioFileInput = document.getElementById("tlAudioFile");
       let audioFile = tlAudioFileInput ? tlAudioFileInput.files[0] : null;
       const proj = typeof window.getProj === 'function' ? window.getProj() : null;

       if (!audioFile && proj && proj.audioTrack) {
           toast("Audio Track", "Naudojamas projekte prisegtas garso takelis...", "info");
           try {
               const aRes = await fetch(proj.audioTrack);
               const blob = await aRes.blob();
               const fileName = proj.audioTrack.split('/').pop().split('?')[0] || "voiceover.wav";
               audioFile = new File([blob], fileName, { type: blob.type || "audio/wav" });
           } catch(e) {
               console.error("Could not fetch project audioTrack:", e);
           }
       }

        if(!audioFile && (!proj || !proj.audioTrack)) {
            return toast("Error", "Please upload or generate an audio file first.", "error");
        }

        const wScriptEl = document.getElementById("wScript");
        const scriptText = (wScriptEl && wScriptEl.value.trim()) || (proj.scenes || []).map(s => (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || '').filter(Boolean).join(' ');
        
        btnAlignTimeline.disabled = true; 

        async function runBuiltinWhisper() {
            btnAlignTimeline.textContent = "⚡ Faster-Whisper aligning audio...";
            toast("Faster-Whisper", "Vykdomas integruotas audio lygiavimas (GPU/CPU)... ⚡", "info");

            let targetUrl = proj.audioTrack || "";
            // If user selected a new local file from disk, upload it first to /api/audio/upload_track
            if (tlAudioFileInput && tlAudioFileInput.files && tlAudioFileInput.files[0]) {
                const fd = new FormData();
                fd.append("file", tlAudioFileInput.files[0]);
                const upRes = await fetch("/api/audio/upload_track", { method: "POST", body: fd });
                if (upRes.ok) {
                    const upData = await upRes.json();
                    targetUrl = upData.url;
                    proj.audioTrack = targetUrl;
                    window.saveCurrentProject();
                }
            }

            if (!targetUrl) {
                throw new Error("Nepavyko nustatyti audio failo adreso integruotam Whisper.");
            }

            const alignPayload = {
                audioUrl: targetUrl,
                scenes: (proj.scenes || []).map(s => ({
                    id: s.id,
                    text: (proj.sceneTextById && proj.sceneTextById[s.id]) || s.text || s.prompt || '',
                    prompt: s.prompt || ''
                })),
                text: scriptText,
                language: "en"
            };

            const resp = await fetch("/api/audio/whisper_align", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(alignPayload)
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.detail || errData.message || `HTTP ${resp.status}`);
            }

            const alignData = await resp.json();
            if (alignData.status === "success") {
                window.processWhisperResult(alignData);
                toast("Success", "Timeline aligned with Faster-Whisper! 🚀", "success");
            } else {
                throw new Error(alignData.message || "Nepavyko atlikti lygiavimo");
            }
        }

        try {
            const whisperMode = localStorage.getItem('whisperEngineMode') || 'builtin';
            
            if (whisperMode === 'builtin') {
                await runBuiltinWhisper();
                return;
            }

            // External WhisperX Mode
            btnAlignTimeline.textContent = "⚡ Jungiamasi prie WhisperX GPU...";
            toast("Processing", "Vykdomas audio suderinimas su WhisperX GPU...");

            const wUrl = (state.wServerUrl || "http://127.0.0.1:8002/").replace(/\/?$/, '/');
            
            let isOnline = false;
            try {
                const hRes = await fetch(wUrl + "health", { method: "GET" });
                if (hRes.ok) isOnline = true;
            } catch(e) {}

            if (!isOnline) {
                btnAlignTimeline.textContent = "⏳ Launching WhisperX GPU service...";
                window.isWhisperXStarting = true;
                if (typeof updateWhisperXCard === "function") updateWhisperXCard("starting", false);
                try {
                    await fetch("/api/whisper/start", { method: "POST" });
                    for (let w = 0; w < 15; w++) {
                        await new Promise(r => setTimeout(r, 1000));
                        try {
                            const h = await fetch(wUrl + "health");
                            if (h.ok) { isOnline = true; break; }
                        } catch(e) {}
                    }
                } catch(e) {}
                window.isWhisperXStarting = false;
                if (typeof updateWhisperXCard === "function") updateWhisperXCard(isOnline, true);
            }

            if (!isOnline) {
                toast("WhisperX Fallback", "External WhisperX offline. Launching Faster-Whisper... 🚀", "warn");
                await runBuiltinWhisper();
                return;
            }

            btnAlignTimeline.textContent = "⚡ WhisperX GPU aligning audio...";
            const fd = new FormData(); 
            fd.append("audio", audioFile); 
            fd.append("script", scriptText); 
            fd.append("model_name", "large-v3");
            
            const res = await fetch(wUrl + "jobs", { method: "POST", body: fd });
            if (!res.ok) throw new Error("Failed to submit task to WhisperX server.");
            const data = await res.json(); 
            const jobId = data.job_id;

            for (let attempt = 0; attempt < 90; attempt++) {
                await new Promise(r => setTimeout(r, 1500));
                const pRes = await fetch(wUrl + "jobs/" + jobId);
                if (!pRes.ok) continue;
                
                const pData = await pRes.json();
                if (pData.status === "done") {
                    window.processWhisperResult(pData.result);
                    toast("Success", "Laiko juosta sėkmingai sugeneruota su WhisperX GPU (Large-v3)! 🚀", "success");
                    break;
                } else if (pData.status === "error") { 
                    throw new Error(pData.error || "WhisperX serverio klaida"); 
                }
            }
        } catch(err) { 
            toast("Alignment Error", err.message, "error");
        } finally { 
            btnAlignTimeline.disabled = false; 
            btnAlignTimeline.textContent = "✨ Align / Generate Timestamps"; 
        }
    });
}

const tlGaps = document.getElementById("tlGaps");
const tlMinLen = document.getElementById("tlMinLen");
const btnRebuildTimeline = document.getElementById("btnRebuildTimeline");

if(tlGaps) {
    tlGaps.addEventListener("change", (e) => {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if(proj) {
            proj.tlGaps = e.target.value;
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }
        window.buildTimelineConfig();
    });
}
if(tlMinLen) {
    tlMinLen.addEventListener("input", (e) => {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if(proj) {
            proj.tlMinLen = parseFloat(e.target.value) || 1.0;
            if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
        }
        window.buildTimelineConfig();
    });
}
if(btnRebuildTimeline) btnRebuildTimeline.addEventListener("click", window.buildTimelineConfig);

const btnExportZip = document.getElementById("btnExportZip");
if(btnExportZip) {
    btnExportZip.addEventListener("click", async () => {
       const proj = window.getProj();
       if(!proj.timeline || proj.timeline.length === 0) return toast("Error", "No timeline built. Align audio first.", "error");
       
       const tlAudioFileInput = document.getElementById("tlAudioFile");
       let audioFile = tlAudioFileInput ? tlAudioFileInput.files[0] : null;
       
       // Saugiklis: Jei vartotojas neturi pasirinkęs lokalaus failo input zonoje, bet yra sugeneruotas fono takelis
       if(!audioFile && proj.audioTrack) {
           try {
               const response = await fetch(proj.audioTrack);
               const blob = await response.blob();
               audioFile = new File([blob], "full_script_dialogue.wav", { type: "audio/wav" });
           } catch(e) {
               console.error("Could not fetch generated audio track for ZIP packaging", e);
           }
       }

       if(!audioFile) return toast("Error", "Audio track is missing. Cannot package ZIP export.", "error");
       if (typeof JSZip === 'undefined') return toast("Error", "JSZip library not loaded", "error");

       toast("Exporting", "Bundling FCP7 XML and media files. Please wait...");
       const zip = new JSZip(); 
       zip.file(audioFile.name, audioFile);
       
       const xmlStr = window.generateFCPXML(proj.timeline, audioFile.name); 
       zip.file("timeline.fcpxml", xmlStr);

       for(let t of proj.timeline) {
           if(t.start !== null) {
               const tNum = parseInt(String(t.id).replace(/\D/g, ''), 10);
               const out = proj.outputs ? proj.outputs.find(o => {
                   if (!o || !o.sceneId) return false;
                   if (o.sceneId === t.id || o.sceneId.toLowerCase() === String(t.id).toLowerCase()) return true;
                   const oNum = parseInt(String(o.sceneId).replace(/\D/g, ''), 10);
                   return !isNaN(tNum) && !isNaN(oNum) && tNum === oNum;
               }) : null;

               if(out) {
                   const main = (out.mainId && out.variations && out.variations.find(v => v.id === out.mainId && v.url))
                             || (out.variations && out.variations.find(v => v.status === 'done' && v.url))
                             || (out.variations && out.variations[out.variations.length-1]);
                   if (main && main.url) {
                       // Saugus plėtinio nustatymas archyvavimo cikle
                       const ext = getFileExtension(main.url);
                       const name = `${t.id}_main.${ext}`;
                       try { 
                           const blob = await (await fetch(main.url)).blob(); 
                           zip.file(name, blob); 
                       } catch(e) { console.error(`Error adding ${name} to ZIP`, e); }
                   }
               }
           }
       }

       try {
           const content = await zip.generateAsync({ type: "blob" });
           const a = document.createElement("a"); 
           a.href = URL.createObjectURL(content);
           a.download = `DaVinci_Timeline_Export_${nowIso().replace(/[: ]/g,'')}.zip`;
           document.body.appendChild(a); 
           a.click(); 
           a.remove();
           toast("Export Done", "ZIP downloaded.", "success");
       } catch(e) { 
           toast("Export Error", "Could not generate ZIP archive.", "error"); 
       }
    });
}

// ----------------------------------------------------------------------------
// TIMELINE AUDIO PLAYER CONTROLS & PLAYHEAD
// ----------------------------------------------------------------------------
window.initTimelineAudioPlayer = function() {
    const player = document.getElementById("tlAudioElement");
    const btnPlay = document.getElementById("tlBtnPlay");
    const btnStop = document.getElementById("tlBtnStop");
    const seek = document.getElementById("tlAudioSeek");
    const timeLabel = document.getElementById("tlTimeLabel");
    const playhead = document.getElementById("tlPlayhead");
    const vol = document.getElementById("tlVolumeSlider");
    const btnMute = document.getElementById("tlBtnMute");
    const uploadTrigger = document.getElementById("tlBtnUploadTrigger");
    const fileInput = document.getElementById("tlAudioFile");
    const btnClear = document.getElementById("tlBtnClearAudio");
    const visual = document.getElementById("tlVisual");

    if (!player) return;

    if (uploadTrigger && fileInput) {
        uploadTrigger.addEventListener("click", () => fileInput.click());
    }

    if (btnClear) {
        btnClear.addEventListener("click", () => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.audioTrack = null;
                window.saveCurrentProject();
                window.updateTimelineAudioUI();
                toast("Audio Removed", "Garso takelis pašalintas iš projekto.", "info");
            }
        });
    }

    if (btnPlay) {
        btnPlay.addEventListener("click", () => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (!player.src && proj && proj.audioTrack) {
                player.src = proj.audioTrack;
            }
            if (!player.src) return toast("Audio", "No audio track attached.", "info");
            
            if (player.paused) {
                window._playingSceneId = null;
                window._sceneEndTime = null;
                window.resetSceneButtons();
                player.play().then(() => {
                    btnPlay.textContent = "⏸";
                }).catch(e => console.warn(e));
            } else {
                player.pause();
                window._playingSceneId = null;
                window._sceneEndTime = null;
                window.resetSceneButtons();
                btnPlay.textContent = "▶";
            }
        });
    }

    if (btnStop) {
        btnStop.addEventListener("click", () => {
            if (!player.src) return;
            player.pause();
            player.currentTime = 0;
            window._playingSceneId = null;
            window._sceneEndTime = null;
            window.resetSceneButtons();
            if (btnPlay) btnPlay.textContent = "▶";
            if (seek) seek.value = 0;
            if (playhead) playhead.style.left = "0%";
            if (timeLabel) timeLabel.textContent = `00:00.00 / ${formatAudioTime(player.duration || 0)}`;
        });
    }

    if (vol) {
        vol.addEventListener("input", (e) => {
            player.volume = parseFloat(e.target.value);
            if (btnMute) btnMute.textContent = player.volume === 0 ? "🔇" : "🔊";
        });
    }

    if (btnMute) {
        btnMute.addEventListener("click", () => {
            player.muted = !player.muted;
            btnMute.textContent = player.muted ? "🔇" : "🔊";
        });
    }

    if (seek) {
        seek.addEventListener("input", (e) => {
            if (!player.duration) return;
            player.currentTime = (parseFloat(e.target.value) / 100) * player.duration;
        });
    }

    player.addEventListener("timeupdate", () => {
        const cur = player.currentTime || 0;
        const dur = player.duration || 0;
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        
        let maxEnd = dur;
        if ((!maxEnd || isNaN(maxEnd)) && proj && proj.timeline) {
            proj.timeline.forEach(t => { if (t.end && t.end > maxEnd) maxEnd = t.end; });
        }
        if (!maxEnd) maxEnd = 10;

        if (timeLabel) {
            timeLabel.textContent = `${formatAudioTime(cur)} / ${formatAudioTime(dur || maxEnd)}`;
        }

        if (dur > 0 && seek && !seek.matches(":active")) {
            seek.value = (cur / dur) * 100;
        }

        if (playhead) {
            playhead.style.display = "block";
            const pct = Math.min(100, Math.max(0, (cur / maxEnd) * 100));
            playhead.style.left = `${pct}%`;
        }

        // Auto-stop at scene boundary if playing a single scene
        if (window._playingSceneId !== null && window._sceneEndTime !== null) {
            if (cur >= window._sceneEndTime) {
                player.pause();
                player.currentTime = window._sceneEndTime;
                window._playingSceneId = null;
                window._sceneEndTime = null;
                window.resetSceneButtons();
                if (btnPlay) btnPlay.textContent = "▶";
            }
        }
    });

    player.addEventListener("ended", () => {
        if (btnPlay) btnPlay.textContent = "▶";
        window._playingSceneId = null;
        window._sceneEndTime = null;
        window.resetSceneButtons();
    });

    if (visual) {
        let isScrubbingTlVisual = false;

        function handleTlVisualScrub(clientX) {
            const rect = visual.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            let maxEnd = player.duration || 0;
            if ((!maxEnd || isNaN(maxEnd)) && proj && proj.timeline) {
                proj.timeline.forEach(t => { if (t.end && t.end > maxEnd) maxEnd = t.end; });
            }
            if (!maxEnd) maxEnd = 10;

            const targetTime = ratio * maxEnd;
            if (player && player.src) {
                player.currentTime = targetTime;
            }
            if (playhead) {
                playhead.style.display = "block";
                playhead.style.left = `${ratio * 100}%`;
            }
            if (timeLabel) {
                timeLabel.textContent = `${formatAudioTime(targetTime)} / ${formatAudioTime(player.duration || maxEnd)}`;
            }
            if (seek && player.duration) {
                seek.value = (targetTime / player.duration) * 100;
            }
        }

        visual.addEventListener("mousedown", (e) => {
            if (e.target.closest("button")) return;
            isScrubbingTlVisual = true;
            handleTlVisualScrub(e.clientX);
        });

        window.addEventListener("mousemove", (e) => {
            if (isScrubbingTlVisual) {
                if (e.buttons === 0) {
                    isScrubbingTlVisual = false;
                    return;
                }
                e.preventDefault();
                handleTlVisualScrub(e.clientX);
            }
        });

        window.addEventListener("mouseup", () => {
            if (isScrubbingTlVisual) {
                isScrubbingTlVisual = false;
            }
        });

        window.addEventListener("blur", () => {
            isScrubbingTlVisual = false;
        });
    }
};

// ============================================================================
// 11. INTERACTIVE FULLSCREEN VISUAL TIMELINE STUDIO (DaVinci Resolve Style)
// ============================================================================
(function() {
    function escapeHtmlSafe(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window._vtlState = {
        pxPerSec: 65,
        activeDrag: null,
        audioBuffer: null,
        audioDuration: 0,
        playheadRaf: null,
        audioCtx: null
    };

    window.openVisualTimelineStudio = async function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) {
            if (typeof toast === 'function') toast("Timeline", "Nėra aktyvaus projekto.", "info");
            return;
        }

        const modal = document.getElementById('modalVisualTimelineStudio');
        if (!modal) return;

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        initVtlEventListeners();

        // Load project audio if available
        await loadVtlAudio();

        window.renderVisualTimelineTracks();
    };

    window.closeVisualTimelineStudio = function() {
        const modal = document.getElementById('modalVisualTimelineStudio');
        if (modal) modal.classList.remove('show');
        document.body.style.overflow = '';

        stopVtlPlayback();

        if (window._vtlState.playheadRaf) {
            cancelAnimationFrame(window._vtlState.playheadRaf);
            window._vtlState.playheadRaf = null;
        }
    };

    function initVtlEventListeners() {
        if (window._vtlEventsBound) return;
        window._vtlEventsBound = true;

        const zoomSlider = document.getElementById('vtlZoomSlider');
        const zoomVal = document.getElementById('vtlZoomVal');
        const zoomIn = document.getElementById('vtlZoomIn');
        const zoomOut = document.getElementById('vtlZoomOut');
        const btnPlay = document.getElementById('vtlBtnPlay');
        const btnSave = document.getElementById('vtlBtnSaveApply');
        const btnAutoFit = document.getElementById('vtlBtnAutoFitAudio');
        const btnApplyUniform = document.getElementById('vtlBtnApplyUniform');
        const ruler = document.getElementById('vtlRuler');

        if (zoomSlider) {
            zoomSlider.addEventListener('input', (e) => {
                window._vtlState.pxPerSec = parseInt(e.target.value, 10) || 65;
                if (zoomVal) zoomVal.textContent = `${window._vtlState.pxPerSec} px/s`;
                window.renderVisualTimelineTracks();
            });
        }

        if (zoomIn) {
            zoomIn.addEventListener('click', () => {
                if (!zoomSlider) return;
                let val = Math.min(220, (parseInt(zoomSlider.value, 10) || 65) + 15);
                zoomSlider.value = val;
                window._vtlState.pxPerSec = val;
                if (zoomVal) zoomVal.textContent = `${val} px/s`;
                window.renderVisualTimelineTracks();
            });
        }

        if (zoomOut) {
            zoomOut.addEventListener('click', () => {
                if (!zoomSlider) return;
                let val = Math.max(25, (parseInt(zoomSlider.value, 10) || 65) - 15);
                zoomSlider.value = val;
                window._vtlState.pxPerSec = val;
                if (zoomVal) zoomVal.textContent = `${val} px/s`;
                window.renderVisualTimelineTracks();
            });
        }

        if (btnPlay) {
            btnPlay.addEventListener('click', toggleVtlPlayback);
        }

        if (btnSave) {
            btnSave.addEventListener('click', window.saveVisualTimelineChanges);
        }

        if (btnAutoFit) {
            btnAutoFit.addEventListener('click', window.vtlAutoFitToAudio);
        }

        if (btnApplyUniform) {
            btnApplyUniform.addEventListener('click', window.vtlApplyUniformDuration);
        }

        if (ruler) {
            let isRulerScrubbing = false;

            function handleRulerScrub(clientX) {
                const rulerRect = ruler.getBoundingClientRect();
                const clickX = clientX - rulerRect.left;
                const sec = Math.max(0, clickX / (window._vtlState.pxPerSec || 65));
                seekVtlPlayback(sec);
            }

            ruler.addEventListener('mousedown', (e) => {
                isRulerScrubbing = true;
                handleRulerScrub(e.clientX);
            });

            window.addEventListener('mousemove', (e) => {
                if (isRulerScrubbing) {
                    if (e.buttons === 0) {
                        isRulerScrubbing = false;
                        return;
                    }
                    e.preventDefault();
                    handleRulerScrub(e.clientX);
                }
            });

            window.addEventListener('mouseup', () => {
                if (isRulerScrubbing) {
                    isRulerScrubbing = false;
                }
            });

            window.addEventListener('blur', () => {
                isRulerScrubbing = false;
            });
        }

        // Global mouse listeners for dragging scene right handles
        window.addEventListener('mousemove', handleVtlMouseMove);
        window.addEventListener('mouseup', handleVtlMouseUp);
        window.addEventListener('blur', () => {
            if (window._vtlState && window._vtlState.activeDrag) {
                handleVtlMouseUp();
            }
        });

        // Keyboard shortcut: Spacebar to toggle playback when modal is open
        window.addEventListener('keydown', (e) => {
            const modal = document.getElementById('modalVisualTimelineStudio');
            if (modal && modal.classList.contains('show')) {
                if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    toggleVtlPlayback();
                }
            }
        });
    }

    async function loadVtlAudio() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        const player = document.getElementById('tlAudioElement');
        const headerAudio = document.getElementById('vtlHeaderAudioName');
        const audioDurBadge = document.getElementById('vtlAudioDurBadge');

        window._vtlState.audioDuration = 0;
        window._vtlState.audioBuffer = null;

        if (!proj || !proj.audioTrack) {
            if (headerAudio) headerAudio.textContent = "Nėra audio";
            if (audioDurBadge) audioDurBadge.textContent = "Nėra";
            return;
        }

        const cleanName = proj.audioTrack.split('/').pop().split('?')[0];
        if (headerAudio) headerAudio.textContent = cleanName;

        if (player) {
            if (!player.src || !player.src.endsWith(proj.audioTrack)) {
                player.src = proj.audioTrack;
                player.load();
            }
            if (player.duration && !isNaN(player.duration)) {
                window._vtlState.audioDuration = player.duration;
            }
        }

        // Try decoding audio waveform for visual audio track
        try {
            if (!window._vtlState.audioCtx) {
                window._vtlState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const resp = await fetch(proj.audioTrack);
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                const decoded = await window._vtlState.audioCtx.decodeAudioData(arrayBuf);
                window._vtlState.audioBuffer = decoded;
                window._vtlState.audioDuration = decoded.duration;
                if (audioDurBadge) {
                    audioDurBadge.textContent = `${formatAudioTime(decoded.duration)} (${decoded.duration.toFixed(1)}s)`;
                }
            }
        } catch (e) {
            console.warn("Could not decode audio data for waveform:", e);
        }
    }

    function toggleVtlPlayback() {
        const player = document.getElementById('tlAudioElement');
        const btnPlay = document.getElementById('vtlBtnPlay');
        if (!player || !player.src) {
            if (typeof toast === 'function') toast("Audio", "Nėra įkelto garso takelio peržiūrai.", "info");
            return;
        }

        if (player.paused) {
            player.play().then(() => {
                if (btnPlay) btnPlay.textContent = "⏸ Pauzė";
                startVtlPlayheadLoop();
            }).catch(err => {
                console.warn("Play audio failed:", err);
            });
        } else {
            player.pause();
            if (btnPlay) btnPlay.textContent = "▶ Groti";
            stopVtlPlayback();
        }
    }

    function stopVtlPlayback() {
        const player = document.getElementById('tlAudioElement');
        const btnPlay = document.getElementById('vtlBtnPlay');
        if (player && !player.paused) {
            player.pause();
        }
        if (btnPlay) btnPlay.textContent = "▶ Groti";
        if (window._vtlState.playheadRaf) {
            cancelAnimationFrame(window._vtlState.playheadRaf);
            window._vtlState.playheadRaf = null;
        }
    }

    function seekVtlPlayback(sec) {
        const player = document.getElementById('tlAudioElement');
        if (player) {
            player.currentTime = Math.max(0, sec);
        }
        updateVtlPlayheadPos(sec);
    }

    function startVtlPlayheadLoop() {
        if (window._vtlState.playheadRaf) cancelAnimationFrame(window._vtlState.playheadRaf);

        function tick() {
            const player = document.getElementById('tlAudioElement');
            const playhead = document.getElementById('vtlPlayhead');
            if (player && playhead) {
                const cur = player.currentTime || 0;
                updateVtlPlayheadPos(cur);

                if (!player.paused) {
                    window._vtlState.playheadRaf = requestAnimationFrame(tick);
                    return;
                }
            }
            const btnPlay = document.getElementById('vtlBtnPlay');
            if (btnPlay) btnPlay.textContent = "▶ Groti";
        }
        window._vtlState.playheadRaf = requestAnimationFrame(tick);
    }

    function updateVtlPlayheadPos(sec) {
        const playhead = document.getElementById('vtlPlayhead');
        const tooltip = document.getElementById('vtlPlayheadTooltip');
        const speechSnippet = document.getElementById('vtlSpokenTextSnippet');
        if (!playhead) return;

        const leftPx = sec * (window._vtlState.pxPerSec || 65);
        playhead.style.left = `${leftPx}px`;

        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        let activeSceneLabel = "";
        let activeSceneText = "";

        if (proj && proj.scenes && proj.scenes.length > 0) {
            let cumSec = 0;
            for (let idx = 0; idx < proj.scenes.length; idx++) {
                const sc = proj.scenes[idx];
                const dur = parseFloat(sc.duration) || 4.0;
                const startSec = cumSec;
                const endSec = cumSec + dur;
                cumSec = endSec;

                if (sec >= startSec && sec <= endSec) {
                    activeSceneLabel = `#S${idx + 1}`;
                    activeSceneText = (proj.sceneTextById && proj.sceneTextById[sc.id]) || sc.text || sc.prompt || "";
                    break;
                }
            }
        }

        // Tikriname, ar turime tikslius Whisper žodžius pagal sekundę
        let spokenWord = "";
        if (proj && proj.alignedData && proj.alignedData.script_alignment && proj.alignedData.script_alignment.aligned_words) {
            const wList = proj.alignedData.script_alignment.aligned_words;
            const matchedWord = wList.find(w => w.start !== null && w.end !== null && sec >= w.start && sec <= w.end);
            if (matchedWord && matchedWord.word) {
                spokenWord = matchedWord.word;
            }
        }

        if (tooltip) {
            const sceneSuffix = activeSceneLabel ? ` • ${activeSceneLabel}` : '';
            tooltip.textContent = `${formatAudioTime(sec)} (${sec.toFixed(1)}s)${sceneSuffix}`;
        }

        if (speechSnippet) {
            if (spokenWord) {
                speechSnippet.innerHTML = `<span style="color:#00ffcc; font-weight:800;">${activeSceneLabel}:</span> <strong>„${escapeHtmlSafe(spokenWord)}“</strong> <span style="opacity:0.65; font-size:10px;">(${escapeHtmlSafe(activeSceneText.substring(0, 35))}...)</span>`;
            } else if (activeSceneText) {
                const trimmed = activeSceneText.trim();
                const displaySnippet = trimmed.length > 45 ? trimmed.substring(0, 45) + '…' : trimmed;
                speechSnippet.innerHTML = `<span style="color:#00ffcc; font-weight:800;">${activeSceneLabel}:</span> „${escapeHtmlSafe(displaySnippet)}“`;
            } else if (activeSceneLabel) {
                speechSnippet.textContent = `${activeSceneLabel} (${sec.toFixed(1)}s)`;
            } else {
                speechSnippet.textContent = `${formatAudioTime(sec)} (${sec.toFixed(1)}s)`;
            }
        }
    }

    window.renderVisualTimelineTracks = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;

        const scenes = proj.scenes || [];
        const pxPerSec = window._vtlState.pxPerSec || 65;

        // Calculate total video duration
        let totalVideoDur = 0;
        scenes.forEach(sc => {
            const dur = parseFloat(sc.duration) || 4.0;
            totalVideoDur += dur;
        });

        const audioDur = window._vtlState.audioDuration || 0;
        const totalTimelineSec = Math.max(totalVideoDur, audioDur, 12) + 2;
        const totalWidthPx = Math.max(900, Math.ceil(totalTimelineSec * pxPerSec));

        // Update header metrics
        const countBadge = document.getElementById('vtlSceneCountBadge');
        const videoDurBadge = document.getElementById('vtlVideoDurBadge');
        const audioDurBadge = document.getElementById('vtlAudioDurBadge');
        const syncBadge = document.getElementById('vtlSyncBadge');

        if (countBadge) countBadge.textContent = `${scenes.length}`;
        if (videoDurBadge) videoDurBadge.textContent = `${formatAudioTime(totalVideoDur)} (${totalVideoDur.toFixed(1)}s)`;
        if (audioDurBadge) {
            audioDurBadge.textContent = audioDur > 0 ? `${formatAudioTime(audioDur)} (${audioDur.toFixed(1)}s)` : 'Nėra';
        }

        if (syncBadge) {
            if (audioDur === 0) {
                syncBadge.textContent = "Nėra garso takelio";
                syncBadge.className = "badge text-xs";
                syncBadge.style.background = "rgba(255,255,255,0.08)";
                syncBadge.style.color = "var(--muted)";
            } else {
                const diff = totalVideoDur - audioDur;
                if (Math.abs(diff) <= 0.4) {
                    syncBadge.textContent = "✅ Pilnas sinchronas";
                    syncBadge.className = "badge good text-xs";
                    syncBadge.style.background = "rgba(16,185,129,0.2)";
                    syncBadge.style.color = "#10b981";
                } else if (diff < 0) {
                    syncBadge.textContent = `⚠️ Video per trumpas (${diff.toFixed(1)}s)`;
                    syncBadge.className = "badge text-xs";
                    syncBadge.style.background = "rgba(245,158,11,0.2)";
                    syncBadge.style.color = "#fbbf24";
                } else {
                    syncBadge.textContent = `ℹ️ Video ilgesnis (+${diff.toFixed(1)}s)`;
                    syncBadge.className = "badge text-xs";
                    syncBadge.style.background = "rgba(56,189,248,0.2)";
                    syncBadge.style.color = "#38bdf8";
                }
            }
        }

        // Set width on tracks container
        const container = document.getElementById('vtlTracksContainer');
        if (container) container.style.width = `${totalWidthPx}px`;

        // Render Ruler
        renderVtlRuler(totalTimelineSec, pxPerSec);

        // Render Video Track V1
        renderVtlVideoTrack(scenes, proj, pxPerSec);

        // Render Audio Track A1
        renderVtlAudioTrack(audioDur, proj, pxPerSec, totalWidthPx);
    };

    function renderVtlRuler(totalTimelineSec, pxPerSec) {
        const ruler = document.getElementById('vtlRuler');
        if (!ruler) return;
        ruler.innerHTML = '';

        // Determine step based on zoom
        let majorStep = 5;
        let minorStep = 1;
        if (pxPerSec < 40) {
            majorStep = 10;
            minorStep = 2;
        } else if (pxPerSec > 120) {
            majorStep = 2;
            minorStep = 0.5;
        }

        for (let sec = 0; sec <= totalTimelineSec; sec += minorStep) {
            const isMajor = (Math.round(sec * 10) % Math.round(majorStep * 10) === 0);
            const tick = document.createElement('div');
            tick.className = `vtl-tick ${isMajor ? 'major' : ''}`;
            tick.style.left = `${sec * pxPerSec}px`;

            if (isMajor) {
                const label = document.createElement('div');
                label.className = 'vtl-tick-label';
                label.textContent = formatAudioTime(sec);
                tick.appendChild(label);
            }
            ruler.appendChild(tick);
        }
    }

    function renderVtlVideoTrack(scenes, proj, pxPerSec) {
        const track = document.getElementById('vtlVideoTrack');
        if (!track) return;
        track.innerHTML = '';

        if (scenes.length === 0) {
            track.innerHTML = '<div style="padding: 20px; color: var(--muted); font-size: 11px;">Šiame projekte dar nėra scenų. Įkelkite ar sugeneruokite scenas 2. Scenų skiltyje.</div>';
            return;
        }

        let cumSec = 0;

        scenes.forEach((sc, idx) => {
            const scId = String(sc.id || `S${idx + 1}`);
            const dur = parseFloat(sc.duration) || 4.0;
            const startSec = cumSec;
            const endSec = cumSec + dur;
            cumSec = endSec;

            // Check if kinetic
            const isKinetic = (typeof window.isKineticTextScene === 'function' && window.isKineticTextScene(sc)) || sc.isKinetic === true || sc.type === 'kinetic';
            const kSc = (proj.kineticScenes || []).find(k => String(k.id) === scId || String(k.id) === scId.replace(/^S/i, ''));

            // Resolve thumbnail image
            let imgUrl = '/base/empty_scene.png';
            let hasImage = false;
            const out = (proj.outputs || []).find(o => String(o.sceneId) === scId || String(o.sceneId) === scId.replace(/^S/i, ''));
            if (out && out.mainId && out.variations) {
                const mainVar = out.variations.find(v => v.id === out.mainId);
                if (mainVar && mainVar.url) {
                    imgUrl = mainVar.url;
                    hasImage = true;
                }
            } else if (sc.refA && typeof window.resolveRefImage === 'function') {
                const resolved = window.resolveRefImage(sc.refA);
                imgUrl = resolved.startsWith('/') ? resolved : (resolved === 'empty_scene.png' ? `/base/${resolved}` : `/vault/${resolved}`);
                if (imgUrl !== '/base/empty_scene.png') hasImage = true;
            }

            const clip = document.createElement('div');
            clip.className = `vtl-scene-clip ${isKinetic ? 'is-kinetic' : ''}`;
            clip.id = `vtlClip_${scId}`;
            clip.style.width = `${Math.max(48, dur * pxPerSec)}px`;
            clip.dataset.sceneId = scId;
            clip.dataset.index = idx;
            clip.dataset.dur = dur;

            const textSnippet = sc.text || sc.prompt || `Scene ${idx + 1}`;

            clip.innerHTML = `
                <div class="vtl-clip-topbar">
                    <span style="font-weight: 800; color: ${isKinetic ? '#00ffcc' : '#38bdf8'}; font-size: 10.5px;">#S${idx + 1}</span>
                    <span class="vtl-dur-pill" id="vtlDurPill_${scId}" title="Dukart spustelkite skaičiui įvesti">${dur.toFixed(1)}s</span>
                    <button type="button" class="btn icon text-xs" style="padding: 0 4px; font-size: 9px; line-height: 1;" title="Peržiūrėti šios scenos atkarpą">▶</button>
                </div>
                <div class="vtl-clip-body" title="${escapeHtmlSafe(textSnippet)}">
                    ${isKinetic ? `
                        <div style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 4px; text-align: center; background: radial-gradient(circle at center, #10252b 0%, #060e10 100%);">
                            <span style="font-size: 8px; font-weight: 800; color: #00ffcc; text-transform: uppercase;">✍️ TEXT EFFECT</span>
                            <span style="font-size: 9px; font-weight: 700; color: #fff; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px;">${escapeHtmlSafe(kSc?.text1 || textSnippet)}</span>
                        </div>
                    ` : `
                        <img src="${imgUrl}" class="vtl-clip-img" onerror="this.src='/base/empty_scene.png';" />
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%); padding: 2px 5px; font-size: 9px; color: rgba(255,255,255,0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; pointer-events: none;">
                            ${escapeHtmlSafe(textSnippet)}
                        </div>
                    `}
                </div>
                <!-- Right Resize Handle -->
                <div class="vtl-resize-handle" data-scene-id="${scId}" data-index="${idx}" title="Tempkite pele (↔) keisti scenos trukmę"></div>
            `;

            // Double click duration pill for direct numeric typing
            const durPill = clip.querySelector(`#vtlDurPill_${scId}`);
            if (durPill) {
                durPill.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    makeDurationEditable(durPill, sc, idx);
                });
            }

            // Play button on clip
            const clipPlayBtn = clip.querySelector('.vtl-clip-topbar button');
            if (clipPlayBtn) {
                clipPlayBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    seekVtlPlayback(startSec);
                    const player = document.getElementById('tlAudioElement');
                    if (player) {
                        player.play().catch(()=>{});
                        startVtlPlayheadLoop();
                    }
                });
            }

            // Drag handle mousedown
            const handle = clip.querySelector('.vtl-resize-handle');
            if (handle) {
                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startVtlDrag(e, sc, idx, clip, handle);
                });
            }

            track.appendChild(clip);
        });
    }

    function makeDurationEditable(pillEl, sc, idx) {
        const curDur = parseFloat(sc.duration) || 4.0;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0.5';
        input.max = '60';
        input.step = '0.1';
        input.value = curDur.toFixed(1);
        input.style.cssText = 'width: 44px; padding: 0 2px; font-size: 10px; font-weight: 800; background: #000; color: #00ffcc; border: 1px solid #00ffcc; border-radius: 4px; text-align: center; outline: none;';

        pillEl.replaceWith(input);
        input.focus();
        input.select();

        let committed = false;
        function commit() {
            if (committed) return;
            committed = true;
            const newDur = Math.max(0.5, parseFloat(input.value) || 4.0);
            sc.duration = newDur;
            window.renderVisualTimelineTracks();
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
                committed = true;
                window.renderVisualTimelineTracks();
            }
        });
        input.addEventListener('blur', commit);
    }

    function startVtlDrag(e, sc, idx, clipEl, handleEl) {
        const startDur = parseFloat(sc.duration) || 4.0;
        const startX = e.clientX;

        // Create tooltip
        let tooltip = document.createElement('div');
        tooltip.className = 'vtl-drag-tooltip';
        tooltip.textContent = `${startDur.toFixed(1)}s`;
        clipEl.appendChild(tooltip);

        clipEl.classList.add('resizing');
        handleEl.classList.add('active');

        window._vtlState.activeDrag = {
            scene: sc,
            index: idx,
            clipEl: clipEl,
            handleEl: handleEl,
            tooltipEl: tooltip,
            startX: startX,
            startDur: startDur,
            currentDur: startDur
        };
    }

    function handleVtlMouseMove(e) {
        const drag = window._vtlState.activeDrag;
        if (!drag) return;
        if (e.buttons === 0) {
            handleVtlMouseUp(e);
            return;
        }

        const pxPerSec = window._vtlState.pxPerSec || 65;
        const deltaX = e.clientX - drag.startX;
        const deltaSec = deltaX / pxPerSec;
        const newDur = Math.max(0.5, Math.round((drag.startDur + deltaSec) * 10) / 10);

        drag.currentDur = newDur;
        drag.clipEl.style.width = `${Math.max(48, newDur * pxPerSec)}px`;

        const pill = drag.clipEl.querySelector('.vtl-dur-pill');
        if (pill) pill.textContent = `${newDur.toFixed(1)}s`;

        const sign = newDur >= drag.startDur ? '+' : '';
        const diff = (newDur - drag.startDur).toFixed(1);
        drag.tooltipEl.textContent = `${newDur.toFixed(1)}s (${sign}${diff}s)`;
    }

    function handleVtlMouseUp(e) {
        const drag = window._vtlState.activeDrag;
        if (!drag) return;

        drag.scene.duration = drag.currentDur;

        if (drag.tooltipEl) drag.tooltipEl.remove();
        drag.clipEl.classList.remove('resizing');
        drag.handleEl.classList.remove('active');

        window._vtlState.activeDrag = null;

        // Re-render tracks with updated cumulative offsets
        window.renderVisualTimelineTracks();
    }

    function renderVtlAudioTrack(audioDur, proj, pxPerSec, totalWidthPx) {
        const track = document.getElementById('vtlAudioTrack');
        const canvas = document.getElementById('vtlAudioWaveformCanvas');
        const chunksLayer = document.getElementById('vtlAudioChunksLayer');
        if (!track || !canvas || !chunksLayer) return;

        chunksLayer.innerHTML = '';
        canvas.width = totalWidthPx;
        canvas.height = 95;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!audioDur || audioDur === 0) {
            chunksLayer.innerHTML = '<div style="padding: 14px 20px; color: var(--muted); font-size: 11px;">🎵 Šiame projekte nėra prijungto garso takelio. Sukurkite balsą „1. Įgarsinimas“ lange.</div>';
            return;
        }

        const audioWidthPx = audioDur * pxPerSec;

        // Draw waveform
        ctx.fillStyle = 'rgba(251, 191, 36, 0.08)';
        ctx.fillRect(0, 4, audioWidthPx, 87);

        const audioBuf = window._vtlState.audioBuffer;
        if (audioBuf) {
            const rawData = audioBuf.getChannelData(0);
            const samplesPerPixel = Math.max(1, Math.floor(rawData.length / audioWidthPx));
            const centerY = 47;
            const amp = 38;

            ctx.beginPath();
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1;

            for (let x = 0; x < audioWidthPx; x++) {
                let min = 1.0;
                let max = -1.0;
                const startSample = x * samplesPerPixel;
                for (let j = 0; j < samplesPerPixel; j += 4) {
                    const val = rawData[startSample + j];
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
                if (max < min) { min = 0; max = 0; }
                const top = centerY + (min * amp);
                const bottom = centerY + (max * amp);
                ctx.moveTo(x, top);
                ctx.lineTo(x, bottom);
            }
            ctx.stroke();
        } else {
            // High-fidelity procedural waveform representation
            const centerY = 47;
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let x = 0; x < audioWidthPx; x += 3) {
                const h = (Math.sin(x * 0.08) * 0.4 + Math.sin(x * 0.02) * 0.5 + 0.5) * 32;
                ctx.moveTo(x, centerY - h / 2);
                ctx.lineTo(x, centerY + h / 2);
            }
            ctx.stroke();
        }

        // Render audio cuts / chunks if present
        const validTl = (proj.timeline || []).filter(t => t.start !== null && t.end !== null && t.end > t.start);
        const chunks = proj.audioChunks || [];

        // Asynchronously measure any chunks missing exact durations
        if (chunks.length > 0) {
            chunks.forEach((chunk) => {
                const audioSrc = chunk.url || chunk.audio_url;
                if (audioSrc && (!chunk.duration || chunk.duration <= 0) && !chunk.__durMeasuring) {
                    chunk.__durMeasuring = true;
                    const a = new Audio();
                    a.src = audioSrc;
                    a.onloadedmetadata = () => {
                        if (a.duration && !isNaN(a.duration) && a.duration > 0) {
                            chunk.duration = Math.round(a.duration * 100) / 100;
                            if (window._vtlState && window._vtlState.isOpen) {
                                window.renderVisualTimelineTracks();
                            }
                        }
                    };
                }
            });
        }

        if (validTl.length > 0) {
            // Render exact acoustic cuts from Whisper timeline
            validTl.forEach((t) => {
                const startSec = parseFloat(t.start) || 0;
                const durSec = Math.max(0.2, (parseFloat(t.end) || startSec + 1) - startSec);
                const leftPx = startSec * pxPerSec;
                const wPx = Math.max(26, durSec * pxPerSec);

                const cEl = document.createElement('div');
                cEl.className = 'vtl-audio-chunk';
                cEl.style.left = `${leftPx}px`;
                cEl.style.width = `${wPx}px`;
                cEl.title = `Scene #${t.id} (${startSec.toFixed(1)}s - ${parseFloat(t.end).toFixed(1)}s): ${t.text || ''}`;
                cEl.innerHTML = `
                    <div style="font-weight: 800; font-size: 8.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        🎬 ${t.id} • ${durSec.toFixed(1)}s
                    </div>
                    <div style="font-size: 8px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtmlSafe(t.text || '')}
                    </div>
                `;
                chunksLayer.appendChild(cEl);
            });
        } else if (chunks.length > 0) {
            // Render stitched audio chunks with inter-chunk silence gap (0.3s) matching backend AudioSegment.silent
            let chunkStartSec = 0;
            const interChunkSilence = 0.3;
            chunks.forEach((chunk, cIdx) => {
                const cDur = parseFloat(chunk.duration) || 3.0;
                const leftPx = chunkStartSec * pxPerSec;
                const wPx = Math.max(30, cDur * pxPerSec);

                const cEl = document.createElement('div');
                cEl.className = 'vtl-audio-chunk';
                cEl.style.left = `${leftPx}px`;
                cEl.style.width = `${wPx}px`;
                cEl.title = `Chunk #${cIdx + 1} (${cDur.toFixed(1)}s): ${chunk.text || ''}`;
                cEl.innerHTML = `
                    <div style="font-weight: 800; font-size: 8.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        Chunk #${cIdx + 1} • ${cDur.toFixed(1)}s
                    </div>
                    <div style="font-size: 8px; opacity: 0.8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHtmlSafe(chunk.text || '')}
                    </div>
                `;
                chunksLayer.appendChild(cEl);

                chunkStartSec += cDur + interChunkSilence;
            });
        }
    }

    window.vtlAutoFitToAudio = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;

        const scenes = proj.scenes || [];
        const validTl = (proj.timeline || []).filter(t => t.start !== null && t.end !== null && (t.end - t.start) > 0.3);
        const chunks = proj.audioChunks || [];

        if (validTl.length > 0) {
            scenes.forEach((sc, idx) => {
                const scId = String(sc.id || `S${idx + 1}`);
                const item = validTl.find(t => String(t.id) === scId || String(t.id) === scId.replace(/^S/i, '')) || validTl[idx];
                if (item && item.end !== null && item.start !== null) {
                    const d = item.end - item.start;
                    if (d > 0.4) sc.duration = parseFloat(d.toFixed(1));
                }
            });
            window.renderVisualTimelineTracks();
            if (typeof toast === 'function') toast("Auto-Fit", `Sulygiuota ${scenes.length} scenų trukmių pagal tikrąsias Whisper garso žymas!`, "success");
            return;
        }

        if (chunks.length > 0) {
            scenes.forEach((sc, idx) => {
                const scId = String(sc.id || `S${idx + 1}`);
                const chunk = chunks.find(c => String(c.sceneId) === scId || String(c.sceneId) === scId.replace(/^S/i, '')) || chunks[idx];
                if (chunk && chunk.duration && chunk.duration > 0) {
                    sc.duration = parseFloat(chunk.duration.toFixed(1));
                }
            });
            window.renderVisualTimelineTracks();
            if (typeof toast === 'function') toast("Auto-Fit", `Sulygiuota ${scenes.length} scenų trukmių pagal audio chunks!`, "success");
            return;
        }

        if (typeof toast === 'function') toast("Auto-Fit", "Nėra atskirų garso segmentų ar WhisperX žymų sulygiavimui.", "info");
    };

    window.vtlApplyUniformDuration = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;

        const input = document.getElementById('vtlUniformDurInput');
        const val = Math.max(0.5, parseFloat(input?.value) || 4.0);

        (proj.scenes || []).forEach(sc => {
            sc.duration = val;
        });

        window.renderVisualTimelineTracks();
        if (typeof toast === 'function') toast("Uniform", `Visiems kadrams nustatyta vienoda trukmė: ${val.toFixed(1)}s`, "info");
    };

    window.saveVisualTimelineChanges = function() {
        const proj = typeof window.getProj === 'function' ? window.getProj() : null;
        if (!proj) return;

        const scenes = proj.scenes || [];
        if (!proj.timeline) proj.timeline = [];

        let curTime = 0;
        scenes.forEach((sc, idx) => {
            const scId = String(sc.id || `S${idx + 1}`);
            const dur = parseFloat(sc.duration) || 4.0;
            sc.duration = dur;

            let tlItem = proj.timeline.find(t => String(t.id) === scId || String(t.id) === scId.replace(/^S/i, ''));
            if (!tlItem) {
                tlItem = { id: scId, start: curTime, end: curTime + dur, dur: dur, duration: dur, status: "MATCHED" };
                proj.timeline.push(tlItem);
            } else {
                tlItem.start = parseFloat(curTime.toFixed(3));
                tlItem.dur = dur;
                tlItem.duration = dur;
                tlItem.end = parseFloat((curTime + dur).toFixed(3));
            }
            curTime += dur;
        });

        // Save project to backend
        if (typeof window.saveCurrentProject === 'function') {
            window.saveCurrentProject();
        }

        // Update studio UI and cockpit
        if (typeof window.renderRenderStudioUI === 'function') {
            window.renderRenderStudioUI();
        }
        if (typeof window.renderTimeline === 'function') {
            window.renderTimeline();
        }

        window.closeVisualTimelineStudio();

        if (typeof toast === 'function') {
            toast("Išsaugota", "Laiko juostos pakeitimai sėkmingai išsaugoti ir pritaikyti renderiui!", "success");
        }
    };
})();

document.addEventListener("DOMContentLoaded", () => {
    if (typeof window.initTimelineAudioPlayer === 'function') {
        window.initTimelineAudioPlayer();
    }
});