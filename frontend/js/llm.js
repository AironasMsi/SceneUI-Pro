// ============================================================================
// 5. SCRIPT & LLM LOGIC (TAB 0)
// ============================================================================

state.llmMode = 'api';

async function loadPromptFiles() {
    try {
        const res = await fetch('/api/prompts');
        if (!res.ok) throw new Error("Failed to read prompt folders.");
        const data = await res.json();
        const select = $("#promptTemplateSelect"); 
        
        if (!select) return;

        let html = '';
        if (data.prompts && data.prompts.length > 0) {
            data.prompts.forEach(folder => { html += `<option value="${folder}">${folder}</option>`; });
            select.innerHTML = html;
            select.value = data.prompts[0];
        } else {
            html = '<option value="">-- No Style Selected --</option>';
            select.innerHTML = html;
        }
        // Atnaujiname bazinius šablonus pagal pradinį stilių
        await window.updateStyleBaseTemplates();
    } catch (e) { console.warn(e.message); }
}

window.updateStyleBaseTemplates = async function() {
    const select = $("#promptTemplateSelect");
    if (!select) return;
    const style = select.value;
    if (!style) return;

    try {
        const res = await fetch(`/api/style_config?style=${style}`);
        const data = await res.json();
        if (data.status === "success" && data.data) {
            const bt = data.data.base_templates;
            if (bt) {
                state.baseStatus = {
                    male: { file: `prompts/${style}/base/${bt.male}`, html: false, comfy: false },
                    female: { file: `prompts/${style}/base/${bt.female}`, html: false, comfy: false },
                    teen: { file: `prompts/${style}/base/${bt.teen}`, html: false, comfy: false },
                    kid: { file: `prompts/${style}/base/${bt.kid}`, html: false, comfy: false }
                };
            } else {
                // Standartiniai base šablonai
                state.baseStatus = {
                    male: { file: 'base/base_male.png', html: false, comfy: false },
                    female: { file: 'base/base_female.png', html: false, comfy: false },
                    teen: { file: 'base/base_teen.png', html: false, comfy: false },
                    kid: { file: 'base/base_kid.png', html: false, comfy: false }
                };
            }
        } else {
            state.baseStatus = {
                male: { file: 'base/base_male.png', html: false, comfy: false },
                female: { file: 'base/base_female.png', html: false, comfy: false },
                teen: { file: 'base/base_teen.png', html: false, comfy: false },
                kid: { file: 'base/base_kid.png', html: false, comfy: false }
            };
        }
    } catch (e) {
        console.warn("Failed to load style base templates:", e);
    }

    if (typeof window.checkBaseTemplates === 'function') {
        window.checkBaseTemplates();
    }
}

if($("#btnRefreshPrompts")) $("#btnRefreshPrompts").addEventListener("click", loadPromptFiles);

if ($("#promptTemplateSelect")) {
    $("#promptTemplateSelect").addEventListener("change", window.updateStyleBaseTemplates);
}

if ($("#btnToggleLocal")) {
    $("#btnToggleLocal").addEventListener("click", () => {
      state.llmMode = 'local';
      $("#btnToggleLocal").style.background = "var(--accent)"; $("#btnToggleLocal").style.color = "#000";
      if ($("#btnToggleApi")) { $("#btnToggleApi").style.background = "transparent"; $("#btnToggleApi").style.color = "var(--muted)"; }
      if ($("#llmLocalField")) $("#llmLocalField").classList.remove("hidden"); 
      if ($("#llmApiField")) $("#llmApiField").classList.add("hidden");
    });
}

if ($("#btnToggleApi")) {
    $("#btnToggleApi").addEventListener("click", () => {
      state.llmMode = 'api';
      $("#btnToggleApi").style.background = "var(--accent)"; $("#btnToggleApi").style.color = "#000";
      if ($("#btnToggleLocal")) { $("#btnToggleLocal").style.background = "transparent"; $("#btnToggleLocal").style.color = "var(--muted)"; }
      if ($("#llmApiField")) $("#llmApiField").classList.remove("hidden"); 
      if ($("#llmLocalField")) $("#llmLocalField").classList.add("hidden");
    });
}

window.renderScriptUI = function() {
    const proj = typeof window.getProj === 'function' ? window.getProj() : null;
    if (!proj) return;
    
    const rawInput = document.getElementById("rawScriptInput");
    const jsonOutput = document.getElementById("llmJsonOutput");
    const btnCommit = document.getElementById("btnCommitLlm");
    
    if (rawInput) {
        rawInput.value = proj.rawScriptInput || "";
    }
    if (jsonOutput) {
        jsonOutput.value = proj.llmJsonOutput || "";
    }
    if (btnCommit) {
        btnCommit.disabled = !Boolean(jsonOutput && jsonOutput.value && jsonOutput.value.trim());
    }
};

document.addEventListener("DOMContentLoaded", () => {
    const rawInput = document.getElementById("rawScriptInput");
    if (rawInput) {
        rawInput.addEventListener("input", (e) => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.rawScriptInput = e.target.value;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
        });
    }

    const jsonOutput = document.getElementById("llmJsonOutput");
    if (jsonOutput) {
        jsonOutput.addEventListener("input", (e) => {
            const proj = typeof window.getProj === 'function' ? window.getProj() : null;
            if (proj) {
                proj.llmJsonOutput = e.target.value;
                if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
            }
            const btnCommit = document.getElementById("btnCommitLlm");
            if (btnCommit) {
                btnCommit.disabled = !Boolean(e.target.value && e.target.value.trim());
            }
        });
    }
});

async function callAutoDirector(mode) {
  const proj = window.getProj();
  const rawText = $("#rawScriptInput") ? $("#rawScriptInput").value.trim() : "";
  if (!rawText) return toast("Error", "Please paste your script text first!", "error");
  
  const btn = mode === 'A' ? $("#btnLlmModeA") : $("#btnLlmModeB");
  if (!btn) return;
  
  const originalText = btn.textContent; btn.textContent = "Thinking... ⏳"; btn.disabled = true;

    // SIMULATION / SANDBOX MODE CHECK
  const chkSandbox = document.getElementById("chkLlmSandboxMode");
  const isSandbox = (typeof window.isGlobalDemoMode === "function" ? window.isGlobalDemoMode() : true) || window._llmSimulationActive;
  
  if (isSandbox) {
      await new Promise(r => setTimeout(r, 1200)); // Natural 1.2s thinking latency
      
      let parsedData;
      if (mode === 'A') {
          parsedData = [
  {
    "id": "ALEX_whitestickman_outfitA.png",
    "base": "male",
    "prompt": "Modern white stickman vector character portrait of Alex (Outfit A: Casual Pedestrian), 25 years old. One single individual, single character centered. Smooth pure white circular head, expressive black dot eyes with simple curved brow lines, simple line mouth, smooth white stylized stickman torso and limbs, clean modern proportions. Strictly wearing a minimalist vector cobalt-blue crewneck t-shirt over his white torso, dark charcoal trousers, and simple flat sneakers. Pure white clean background, isolated single character, full body shot, standing in a relaxed neutral stickman pose, arms resting at sides, neutral calm expression, facing slightly toward camera, vertical 9:16 framing, zero 3D render, zero realism.",
    "negative": "character sheet, model sheet, turnaround sheet, split screen, multiple views, multiple angles, two people, couple, pair, group, multiple characters, photo grid, collage, 3D CGI render, realistic human skin pores, photorealism, realistic face, detailed anatomy, live action, extra limbs, horizontal framing, 16:9, white background, white void, blank canvas, isolated"
  },
  {
    "id": "MAYA_whitestickman_outfitA.png",
    "base": "female",
    "prompt": "Modern white stickman vector character portrait of Maya (Outfit A: Casual Pedestrian), 24 years old. One single individual, single character centered. Smooth pure white circular head with subtle minimalist vector bob hair outline, expressive black dot eyes with simple curved brow lines, simple line mouth, smooth white stylized stickman torso and limbs, clean modern proportions. Strictly wearing a minimalist vector coral-orange casual crewneck sweater over her white torso, dark navy straight-leg trousers, and simple dark shoes. Pure white clean background, isolated single character, full body shot, standing in a relaxed neutral stickman pose, arms at sides, neutral calm expression, facing slightly toward camera, vertical 9:16 framing, zero 3D render, zero realism.",
    "negative": "character sheet, model sheet, turnaround sheet, split screen, multiple views, multiple angles, two people, couple, pair, group, multiple characters, photo grid, collage, 3D CGI render, realistic human skin pores, photorealism, realistic face, detailed anatomy, live action, extra limbs, horizontal framing, 16:9, white background, white void, blank canvas, isolated"
  }
];
      } else {
          parsedData = [
  {
    "id": "s1",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Sunny City Sidewalk]. Wide establishing shot of a modern minimalist city avenue with pastel-toned geometric buildings, clean sidewalks, and tree outlines under a bright morning sky. Character from Image 1 (ALEX_whitestickman_outfitA.png, strictly wearing a minimalist vector cobalt-blue crewneck t-shirt over his white torso, dark charcoal trousers, and simple flat sneakers) and Character from Image 2 (MAYA_whitestickman_outfitA.png, strictly wearing a minimalist vector coral-orange casual crewneck sweater over her white torso, dark navy straight-leg trousers, and simple dark shoes) walking side by side casually on the pavement. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio light footsteps on concrete, gentle distant city ambience, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "What if gravity completely reversed on Earth",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "MAYA_whitestickman_outfitA.png",
    "refC": ""
  },
  {
    "id": "s2",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Sunny City Sidewalk]. Medium shot. Character from Image 1 (ALEX_whitestickman_outfitA.png, strictly wearing a minimalist vector cobalt-blue crewneck t-shirt over his white torso, dark charcoal trousers, and flat sneakers) stopping abruptly and looking down at his shoes with a puzzled tilted head, subtle upward dust drift around his feet in front of clean vector shopfront windows. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio sudden low ambient hum, shoe scuffing abruptly on sidewalk, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "for exactly sixty seconds?",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s3",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Sunny City Sidewalk]. Medium full shot. Character from Image 1 (MAYA_whitestickman_outfitA.png, strictly wearing a minimalist vector coral-orange casual crewneck sweater over her white torso, dark navy straight-leg trousers, and simple dark shoes) gently floating two feet above the asphalt, arms spread outwards in joyful wonder, smiling line mouth, clean minimalist apartment facades and streetlights in background. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio soft cloth swish, gentle ascending air glide, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "The first five seconds feel like weightless ecstasy,",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "MAYA_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s4",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Mid-Air City Plaza]. Wide angle shot looking up toward sky. Character from Image 1 (ALEX_whitestickman_outfitA.png, strictly wearing cobalt-blue t-shirt and charcoal trousers) and Character from Image 2 (MAYA_whitestickman_outfitA.png, strictly wearing coral-orange sweater and navy trousers) drifting higher into mid-air, surrounded by distant floating white stickman crowd silhouettes against glass high-rise towers. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio subtle airy whoosh, floating rustle of garments, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "as billions of people float gracefully",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "MAYA_whitestickman_outfitA.png",
    "refC": ""
  },
  {
    "id": "s5",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: High Above Rooftops]. High-angle tracking shot. Character from Image 1 (ALEX_whitestickman_outfitA.png, strictly wearing cobalt-blue t-shirt and dark charcoal trousers) ascending past skyscraper rooftops, antennas, and solar panels into the soft gradient light-blue morning sky. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio escalating wind rush, distant rooftop air vents fading away, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "off the pavement into the morning sky.",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s6",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Mid-Sky Urban Skyline]. Close-up shot. Character from Image 1 (ALEX_whitestickman_outfitA.png, strictly wearing cobalt-blue t-shirt and dark charcoal trousers) flailing arms with wide, panicked dot eyes and open jagged mouth, rapid speed lines rushing past his white vector face as the upward pull turns violently aggressive. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio sharp whip-like wind howl, rapid garment fluttering, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "But wonder turns into sheer terror by second fifteen.",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s7",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Low wide-angle ground perspective. Minimalist vector sedans, trucks, torn streetlights, loose soil blocks, and cracked sidewalk slabs violently ripping upward from roadbeds into the sky. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio deep concrete tearing crack, metallic groaning of tearing metal, ripping earth, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "Unanchored cars, loose topsoil, and entire buildings",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s8",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Upward towering angle. Entire vector multi-story skyscrapers and apartment towers ripping clean out of foundation craters, rocketing straight up with intense upward white motion streaks against a turbulent overcast sky. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio deafening structural snapping, roaring supersonic sonic boom tear, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "rip from their foundations, rocketing upward at blinding speed",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s9",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Mid-air panoramic shot. Massive airborne skyscrapers, spinning cars, and foundation boulders violently colliding in midair, shattering into clean geometric vector debris clouds and flying fragments. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio massive metallic midair collision crunch, explosive concrete shattering boom, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "and colliding in midair.",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s10",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Extreme wide coastal view. Deep blue and teal ocean surfaces violently lifting off the sea floor in massive sheets, exposing dry continental basins below as water tears skyward. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio immense aquatic vacuum suction sound, roaring oceanic upheaval rumble, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "By second thirty, whole oceans tear loose from their basins,",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s11",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Stratospheric perspective. Colossal swirling cyan and navy water walls roaring upward into the darkening blue-black stratosphere, accompanied by vapor funnels. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio deafening rushing water vortex roar, high-velocity atmospheric whistle, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "churning into massive walls of water screaming toward the stratosphere.",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s12",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: High Atmosphere Edge]. Medium shot. Character from Image 1 (MAYA_whitestickman_outfitA.png, strictly wearing coral-orange casual crewneck sweater and navy trousers) clutching her throat with shivering limbs, dot eyes wide in distress, thin vector frost crystals lining her white outline against dark indigo high-altitude sky. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio hollow whistling freezing wind, muffled desperate gasping foley, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "Anyone caught outdoors is now suffocating in freezing, thin air",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "MAYA_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s13",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Near Earth Orbit Horizon]. Wide orbital shot ten miles above the surface. Character from Image 1 (ALEX_whitestickman_outfitA.png, wearing cobalt-blue t-shirt and dark charcoal trousers) floating as a tiny isolated figure among loose car chassis and debris chunks, set against the curved glowing blue edge of Earth and pitch-black space. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio eerie high-altitude dead silence broken by faint supersonic air hiss, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "ten miles above the planet,",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s14",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void, 16:9 framing. [LOC: Suborbital Trajectory]. Fast tracking side profile. Character from Image 1 (ALEX_whitestickman_outfitA.png, wearing cobalt-blue t-shirt and charcoal trousers) tumbling rapidly upward through thin air with concentric white vector supersonic shock cones forming around his limbs against the dark atmosphere. Full edge-to-edge solid background filling the entire 16:9 frame, detailed environment behind character, zero white void.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio sharp sonic boom crack, roaring high-speed slipstream tear, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "helplessly moving faster than the speed of sound.",
    "negative": "3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, white background, plain background, white void, blank canvas, isolated, cutout, floating in void, vignette",
    "refA": "ALEX_whitestickman_outfitA.png",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s15",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Atmospheric zenith freeze frame. Countless levitating skyscrapers, overturned cars, and churning ocean masses freezing momentarily at their apex in the upper sky, before sharp downward vector velocity arrows indicate the sudden violent reversal. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio split-second absolute dead silence followed by a violent gravitational snapping shockwave crack, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "Then, at second sixty, normal gravity violently slams back on.",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s16",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Low angle looking straight up. Billions of tons of inverted concrete towers, metal trusses, and crushed automobiles falling downward like an apocalyptic meteoric storm through dense gray storm clouds. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio terrifying descending whistling screech of falling steel and concrete, roaring wind plunge, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "Billions of tons of debris, shattered skyscrapers,",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s17",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Wide panoramic catastrophic impact shot. Trillions of gallons of oceanic water and massive structural debris slamming into the ground simultaneously, generating an immense white and dark blue kinetic shockwave wall sweeping across the flat horizon. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio earth-shattering cataclysmic impact boom, massive thunderous water deluge blast, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "and trillions of gallons of water crash down in an apocalyptic kinetic strike,",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  },
  {
    "id": "s18",
    "prompt": "Modern white stickman vector animation cinematic style, clean minimalist urban background, crisp vector lines, elegant flat color blocks, full edge-to-edge solid illustrated background, zero white void. Empty environment with zero people, completely uninhabited. Slow cinematic wide pull-back shot. A completely desolate, flattened wasteland under a pale ochre morning haze, covered in shallow standing water and scattered minimalist debris, eerie silence lingering over the empty land. Full edge-to-edge solid background, zero white void. 16:9 framing.",
    "video_prompt": "Smooth modern vector stickman animation (crisp 24fps vector timing, snappy comedic step cycle, springy limb articulation). Diegetic Foley audio eerie hollow desolate wind blowing softly over flooded ruins, faint distant water drip, strictly zero background music, zero speech. Duration: 4 seconds. 16:9.",
    "text": "erasing nearly all human life and leaving you wondering:",
    "negative": "people, person, human, character, man, woman, crowd, face, hands, white background, white void, blank canvas, 3D CGI render, photorealism, real life people, realistic human skin pores, live action, uncanny valley, extra limbs, deformed hands, watermark, logo, text, words, captions, lower thirds, speech bubble, dialogue box, letters, typography, plain background, cutout, floating in void, vignette",
    "refA": "",
    "refB": "",
    "refC": ""
  }
];
      }
      
      const badge = $("#llmCurrentModeBadge");
      if (badge) {
          badge.className = "badge mode " + (mode === 'A' ? "char" : "scene");
          badge.textContent = mode === 'A' ? "Mode A: Characters" : "Mode B: Scenes";
          badge.classList.remove("hidden");
      }
      state.currentLlmTask = mode;
      
      const prettyJson = JSON.stringify(parsedData, null, 2);
      if ($("#llmJsonOutput")) $("#llmJsonOutput").value = prettyJson;
      proj.llmJsonOutput = prettyJson;
      if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();

      const btnCommit = $("#btnCommitLlm") || document.getElementById("btnCommitLlm");
      if (btnCommit) {
          btnCommit.disabled = false;
          btnCommit.removeAttribute("disabled");
      }

      toast("Success", (mode === 'A' ? "Character assets" : "Scene matrix") + " generated successfully!", "success");
      btn.textContent = originalText;
      btn.disabled = false;
      return;
  }


  const provider = state.llmMode;
  const configUrl = $("#ollamaUrl") ? $("#ollamaUrl").value.trim() : "";
  const configKey = $("#serverKey") ? $("#serverKey").value.trim() : ""; 
  const styleDir = $("#promptTemplateSelect") ? $("#promptTemplateSelect").value : "";
  const apiModel = $("#apiModelSelect") ? $("#apiModelSelect").value : "gpt-4o-mini";
  
  // PATOBULINIMAS: Dinamiškai pasiimame vartotojo pasirinktą vietinį modelį iš UI
  const localModel = $("#localModelSelect") ? $("#localModelSelect").value : "qwen2.5:32b";
  const finalModel = provider === 'local' ? localModel : apiModel;

  let availableChars = [];
  let mainProtagonist = "";
  let characterDictionary = {};

  if (mode === 'B') {
      availableChars = Object.keys(proj.charRefs || {});
      if(availableChars.length === 0) {
          toast("Warning", "No characters found in Character tab. Scene generation might lack logical references.", "warn");
      } else {
          mainProtagonist = availableChars.find(f => f.startsWith("protagonist_")) || availableChars[0];
          
          availableChars.forEach(filename => {
              const charData = (proj.charRefs && proj.charRefs[filename]) || {};
              let cleanDesc = (charData.params && charData.params.prompt) || charData.prompt || "";
              characterDictionary[filename] = {
                  role_or_gender: (charData.params && charData.params.template) || charData.template || "unknown",
                  full_visual_description: cleanDesc.trim()
              };
          });
      }
  }

  try {
      const res = await fetch('/api/llm/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              prompt: rawText, 
              mode: mode, 
              style_file: styleDir, 
              provider: provider, 
              url: configUrl, 
              key: configKey, 
              model: finalModel, // PAKEISTA: Čia perduodamas dinaminis modelio kintamasis
              available_characters: availableChars,
              character_dictionary: characterDictionary,
              main_protagonist: mainProtagonist
          })
      });
      const data = await res.json();
      if (data.status === "success") {
          let jsonString = data.data.replace(/```json/g, '').replace(/```/g, '').trim();
          let parsedData = JSON.parse(jsonString);

          let sceneSuffix = "";
          let sceneNeg = "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, logo";
          let charNeg = "blurry, low quality, deformed, extra limbs, bad anatomy, bad hands, watermark, text, logo";
          let charPrefix = "";
          let charSuffix = "";
          let bgExtras = "";
          let emptyRemovals = [];
          
          if (styleDir) {
              try {
                  const cfgRes = await fetch(`/api/style_config?style=${styleDir}`);
                  const cfgData = await cfgRes.json();
                  if (cfgData.status === "success" && cfgData.data) {
                      sceneSuffix = cfgData.data.scene_suffix || sceneSuffix;
                      sceneNeg = cfgData.data.scene_negative || sceneNeg;
                      charNeg = cfgData.data.character_negative || charNeg;
                      charPrefix = cfgData.data.character_prompt_prefix || charPrefix;
                      charSuffix = cfgData.data.character_prompt_suffix || charSuffix;
                      bgExtras = cfgData.data.background_extras_prompt || bgExtras;
                      emptyRemovals = cfgData.data.empty_scene_removals || [];
                  }
              } catch (e) { console.warn("Nepavyko nuskaityti stiliaus konfigūracijos:", e); }
          }

          if (mode === 'A') {
              let chars = parsedData.characters || (Array.isArray(parsedData) ? parsedData : []);
              const validBases = ["male", "female", "teen", "kid"];

              chars.forEach(c => {
                  if (!c.base || typeof c.base !== 'string' || !validBases.includes(c.base.toLowerCase().trim())) {
                      c.base = "male";
                  } else {
                      c.base = c.base.toLowerCase().trim();
                  }

                  let p = (c.prompt || "").trim();
                  p = p.replace(/^[,.\s]+/, ''); 
                  p = p.trim();

                  if (p.endsWith('.')) p = p.slice(0, -1);
                  
                  if (/make\s+\w+\s+character|in that exact style/i.test(p)) {
                      c.prompt = p;
                  } else {
                      c.prompt = (charPrefix + p + charSuffix).trim();
                  }
                  c.negative = charNeg;
              });
              parsedData = { characters: chars };
              
          } else if (mode === 'B') {
              let scns = parsedData.scenes || (Array.isArray(parsedData) ? parsedData : []);

              scns.forEach(d => {
                  let rawRefs = [d.refA, d.refB, d.refC];
                  let validHumans = [];
                  
                  rawRefs.forEach(ref => {
                      if (ref && typeof ref === 'string') {
                          let r = ref.trim();
                          if (r !== "" && r !== "-" && r !== "empty_scene.png") {
                              if (availableChars.includes(r) && !validHumans.includes(r)) {
                                  validHumans.push(r);
                              }
                          }
                      }
                  });

                  if (validHumans.length > 0) {
                      d.refA = validHumans[0] || "";
                      d.refB = validHumans[1] || "";
                      d.refC = validHumans[2] || "";
                  } else {
                      const fallbackStyleRef = (proj.globals && proj.globals.fallbackRef && proj.globals.fallbackRef !== 'empty_scene.png')
                          ? proj.globals.fallbackRef
                          : ((availableChars && availableChars.length > 0) ? availableChars[0] : ((proj.refs || []).find(r => r && r !== 'empty_scene.png') || ""));
                      d.refA = fallbackStyleRef || "empty_scene.png";
                      d.refB = "";
                      d.refC = "";
                  }

                  if (!d.text || d.text === "") {
                      d.text = (proj.sceneTextById && proj.sceneTextById[d.id]) ? proj.sceneTextById[d.id] : "Script segment missing";
                  }
                  
                  let rawPrompt = (d.prompt || "").trim();
                  rawPrompt = rawPrompt.replace(/^[,.\s]+/, '');
                  rawPrompt = rawPrompt.trim();

                  let prefix = "";
                  let currentSuffix = sceneSuffix;
                  
                  if (d.refA && d.refA !== "empty_scene.png") {
                      if (validHumans.length > 0) {
                          prefix += `Image 1 is the ${d.refA.split('.')[0]} reference. `;
                      } else {
                          prefix += `Image 1 is the art style reference. `;
                      }
                  } else if (d.refA === "empty_scene.png") {
                      emptyRemovals.forEach(removal => {
                          const regex = new RegExp(removal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ",?\\s*", "gi");
                          currentSuffix = currentSuffix.replace(regex, '');
                      });
                      currentSuffix = currentSuffix.replace(/,\s*,/g, ', ').replace(/\s+/g, ' ').trim();
                  }

                  if (d.refB) prefix += `Image 2 is the ${d.refB.split('.')[0]} reference. `;
                  if (d.refC) prefix += `Image 3 is the ${d.refC.split('.')[0]} reference. `;
                  
                  let contextPrefix = "";
                  if (d.location && d.time) {
                      contextPrefix = `${d.location}, ${d.time}. `;
                  }

                  if (rawPrompt.match(/\[BACKGROUND_EXTRAS\]/i)) {
                      rawPrompt = rawPrompt.replace(/\[BACKGROUND_EXTRAS\]/gi, bgExtras);
                  }

                  let finalPrompt = prefix + contextPrefix + rawPrompt;
                  
                  if (finalPrompt && !finalPrompt.endsWith('.') && !finalPrompt.endsWith(',')) {
                      finalPrompt += ",";
                  }
                  
                  if (currentSuffix && !finalPrompt.includes(currentSuffix.substring(0, 20))) {
                      finalPrompt += " " + currentSuffix;
                  }
                  
                  d.prompt = finalPrompt.replace(/,\s*,/g, ', ').replace(/\s+/g, ' ').trim();
                  d.negative = sceneNeg;
              });
              parsedData = { scenes: scns };
          }

          if ($("#llmJsonOutput")) $("#llmJsonOutput").value = JSON.stringify(parsedData, null, 2);
          proj.rawScriptInput = rawText;
          proj.llmJsonOutput = $("#llmJsonOutput").value;
          if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
          state.currentLlmTask = mode;
          
          if ($("#llmCurrentModeBadge")) {
              $("#llmCurrentModeBadge").textContent = `MODE ${mode}`; 
              $("#llmCurrentModeBadge").classList.remove("hidden");
          }
          if ($("#btnCommitLlm")) $("#btnCommitLlm").disabled = false; 
          toast("Success", "JSON Generated & Filters Applied.", "success");
      } else { throw new Error(data.message); }
  } catch (err) { toast("Server Error", err.message, "error"); } 
  finally { btn.textContent = originalText; btn.disabled = false; }
}

if ($("#btnLlmModeA")) $("#btnLlmModeA").addEventListener("click", () => callAutoDirector('A'));
if ($("#btnLlmModeB")) $("#btnLlmModeB").addEventListener("click", () => callAutoDirector('B'));

// ============================================================================
// COMMIT LOGIC
// ============================================================================
if ($("#btnCommitLlm")) {
    $("#btnCommitLlm").addEventListener("click", async () => {
      const jsonStr = $("#llmJsonOutput") ? $("#llmJsonOutput").value.trim() : "";
      if (!jsonStr) {
          if (typeof toast === 'function') toast("Empty Output", "No JSON output to commit. Generate characters or scenes first.", "warn");
          return;
      }
      const proj = window.getProj();
    
      if (!proj.charRefs) proj.charRefs = {};
      if (!proj.scenes) proj.scenes = [];
      if (!proj.sceneTextById) proj.sceneTextById = {};
      if (!proj.outputs) proj.outputs = [];
    
      Object.keys(proj.charRefs).forEach(k => {
          if (proj.charRefs[k] && !proj.charRefs[k].params) {
              proj.charRefs[k].params = { prompt: "", negative: "", template: "male" };
          }
          if (proj.charRefs[k] && !proj.charRefs[k].variations) proj.charRefs[k].variations = [];
      });
    
      try {
          let data = JSON.parse(jsonStr);
          
          if (data.characters && Array.isArray(data.characters)) {
              data = data.characters;
          } else if (data.scenes && Array.isArray(data.scenes)) {
              data = data.scenes;
          } else if (!Array.isArray(data) && typeof data === 'object') {
              const key = Object.keys(data)[0];
              if (Array.isArray(data[key])) data = data[key];
          }
    
          if (!Array.isArray(data)) throw new Error("Parsed data is not an array.");
    
          // Intelligently detect if this is characters or scenes
          const isCharacterTask = state.currentLlmTask === 'A' || 
              (data.length > 0 && (data[0].base !== undefined || (data[0].id && data[0].id.includes('.png')) || data[0].template !== undefined));

          if (isCharacterTask) {
              let formattedDict = {};
              data.forEach(char => {
                  const filename = char.id || char.name || char.filename;
                  if (!filename) return;
    
                  formattedDict[filename] = {
                      main: "", 
                      vars: [],     
                      template: char.base || "male",
                      params: {
                          prompt: char.prompt || "",
                          negative: char.negative || "",
                          template: char.base || "male",
                          seed: 941027876668241,
                          randomize: true
                      }
                  };
              });
    
              // Commit to proj.charRefs
              Object.assign(proj.charRefs, formattedDict);
              
              if (typeof window.processCharJson === 'function') {
                  try { window.processCharJson(JSON.stringify(data)); } catch (err) { console.warn("processCharJson fallback:", err); }
              }
              
              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
              if (typeof window.renderCharacters === 'function') window.renderCharacters();
              if (typeof window.renderCharRefs === 'function') window.renderCharRefs();
              
              if (typeof toast === 'function') toast("Success", `${Object.keys(formattedDict).length} Character(s) committed to Casting tab!`, "success");
              
              // Switch to Characters tab
              const charTabBtn = document.querySelector('.nav-item[data-tab="characters"]');
              if (charTabBtn) charTabBtn.click();
              
          } else {
              // Mode B: Scenes
              data.forEach(d => {
                  let existingScene = proj.scenes.find(s => s && s.id == d.id);
                  
                  if (existingScene) {
                      existingScene.prompt = d.prompt || '';
                      if (d.video_prompt) existingScene.video_prompt = d.video_prompt;
                      existingScene.negative = d.negative || '';
                      existingScene.refA = d.refA || '';
                      existingScene.refB = d.refB || '';
                      existingScene.refC = d.refC || '';
                  } else {
                      proj.scenes.push({
                          id: d.id, 
                          prompt: d.prompt || '', 
                          video_prompt: d.video_prompt || '',
                          negative: d.negative || '', 
                          refA: d.refA || '', 
                          refB: d.refB || '', 
                          refC: d.refC || ''
                      }); 
                  }
                  if (d.id && d.text) proj.sceneTextById[d.id] = d.text;
              });
              
              if (typeof window.saveCurrentProject === 'function') window.saveCurrentProject();
              if (typeof window.renderWorkflow === 'function') window.renderWorkflow();
              if (typeof window.triggerUIRefresh === 'function') window.triggerUIRefresh('workflow');
              if (typeof window.validateScenes === 'function') window.validateScenes();
              if (typeof window.renderImages === 'function') window.renderImages(); 
              if (typeof window.syncWorkspaceScenesToKinetic === 'function') window.syncWorkspaceScenesToKinetic(true);
              
              if (typeof toast === 'function') toast("Success", `${data.length} Scene(s) committed to Scene Matrix!`, "success");

              // Switch to Workflow / Scene Matrix tab
              const workflowTabBtn = document.querySelector('.nav-item[data-tab="workflow"]');
              if (workflowTabBtn) workflowTabBtn.click();
          }
          
          if ($("#llmJsonOutput")) $("#llmJsonOutput").value = ""; 
          if ($("#llmCurrentModeBadge")) $("#llmCurrentModeBadge").classList.add("hidden"); 
          if ($("#btnCommitLlm")) $("#btnCommitLlm").disabled = true; 
          state.currentLlmTask = null;
          
      } catch(e) { 
          console.error("Critical error committing data:", e);
          if (typeof toast === 'function') toast("JSON Commit Error", e.message, "error"); 
      }
    });
}
