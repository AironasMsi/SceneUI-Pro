# 🎬 SceneUI Pro: Autonomous AI Cinema & Multi-GPU Narrative Video Engine

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB.svg?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ComfyUI](https://img.shields.io/badge/ComfyUI-Multi--GPU-blueviolet.svg?style=flat)](https://github.com/comfyanonymous/ComfyUI)
[![WhisperX](https://img.shields.io/badge/WhisperX-Timestamp--Sync-orange.svg?style=flat)](https://github.com/m-bain/whisperX)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-Hardware--Accelerated-007808.svg?style=flat&logo=ffmpeg&logoColor=white)](https://ffmpeg.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Transform raw scripts and stories into fully synchronized, character-consistent cinematic animations in minutes.**  
> SceneUI Pro bridges Large Language Models, Multi-GPU ComfyUI clusters, Voice/Audio synthesis, WhisperX Alignment, BGM/Foley Mixing, and Hardware-accelerated Master Rendering into a unified desktop workstation.

---

## 📺 Full End-to-End Video Showcase

Watch the complete, continuous workflow demonstration (`SceneUI_Showcase_Edited.mp4`):
- **Complete Chronological Pipeline (Zero Skipped Steps):**
  1. **Script & LLM Director:** Pasting narrative, extracting character personas (*Mode A*) & generating 18-scene matrix (*Mode B*).
  2. **Character Casting:** Generating consistent character reference anchors (Alex & Maya vector stickman styles).
  3. **Voice & Audio Studio:** Multi-chunk voice synthesis and full dialogue audio preview.
  4. **Visual Engine:** Batch generation of all 18 scene illustrations with live GPU progress tracking.
  5. **Batch Video Engine (I2V):** Configuring the Batch Video Generation modal and synthesizing 18 animated video clips.
  6. **WhisperX Synchronization:** Automatic word-level timestamp alignment and scene duration snapping on the Timeline.
  7. **Post-Production Studios:** BGM Waveform Editor, per-scene Foley & SFX Audio Mixer, Transitions, Dynamic Captions & Color Grading LUTs.
  8. **Master Video Render:** Exporting and playing the final 1080p animation with synchronized voiceover, captions, BGM, and Foley sound effects.

---

## 🌟 Core Architectural Modules

### 1. 📝 LLM Auto-Director & Script Decomposition
* **Mode A (Character Extraction):** Automatically identifies cast members, outfits, and visual traits, building isolated character reference prompts.
* **Mode B (Scene Matrix Breakdown):** Decomposes stories into timed scenes with camera framing, environment lighting, motion prompts (`video_prompt`), and character reference bindings (`refA`, `refB`, `refC`).

### 2. 🎭 Character Casting & Visual Consistency
* **Base Template Library:** Pre-configured proportions (`base_male`, `base_female`, `base_teen`, `base_kid`) across multiple art styles (`modern_white_stickman`, `pixar_3d`, `studio_ghibli_anime`, `cyberpunk_neon_noir`, `cinematic_35mm_film`).
* **Zero-Shot Identity Locking:** Ensures characters maintain identical clothing and facial features across every generated scene.

### 3. 🎙️ Voice Synthesis & WhisperX Alignment
* **Full Script to Speech:** Automated dialogue chunking by scene, sentence, or punctuation with custom voice library casting.
* **WhisperX Timestamp Engine:** Aligns generated audio chunks with sub-second precision, automatically calculating exact scene start/end times and word-level subtitle cues.

### 4. 🖼️ Visual Engine & Batch Video Studio (I2V)
* **Multi-GPU Queue Manager:** Distributes image and video generation tasks across local and remote ComfyUI nodes using an asynchronous SQLite WAL queue.
* **Batch Video Generation Modal:** One-click batch conversion of static scene keyframes into smooth 24fps animated video clips with diegetic Foley audio support.
* **Interactive Card Controls:** Variations manager (`VARS`), inpainting canvas (`🖌️`), video trimmer (`✂️`), and fullscreen inspection viewer.

### 5. 🎛️ Master Video Studio: BGM, SFX, Transitions & LUTs
* **🎵 BGM Studio & Timeline Editor:** Interactive waveform range selector, fade-in/fade-out curves, and automatic voiceover ducking.
* **🔊 Scene SFX & Foley Audio Mixer:** Per-scene sound effect volume sliders, mute toggles, and master sub-mix balancing.
* **✨ Transitions, Subtitles & Color Grading:** Dynamic burnt-in word captions, crossfade/whip-pan transitions, and cinematic LUT presets (Original, Teal & Orange, Vintage Film, Cyberpunk).

---

## 📸 Complete Visual Walkthrough (14 Stages)

| Stage | Screenshot | Module Description |
| :--- | :---: | :--- |
| **01. Script & Character Extraction** | ![01](./screenshots/01_Script_and_LLM_Characters.png) | Pasting the raw script and running LLM Mode A to extract character visual profiles. |
| **02. Character Casting** | ![02](./screenshots/02_Character_Casting_Generated.png) | Generating consistent full-body character references (Alex & Maya) from base templates. |
| **03. Scene Matrix JSON (Mode B)** | ![03](./screenshots/03_Script_Scene_Generation_JSON.png) | LLM Mode B decomposing the narrative into 18 structured scenes with image & video prompts. |
| **04. Scene Matrix Table** | ![04](./screenshots/04_Scene_Matrix_Table.png) | Reviewing prompts, character bindings (`refA`/`refB`), and dialogue lines in the matrix table. |
| **05. Voice & Audio Studio** | ![05](./screenshots/05_Voice_and_Audio_Synthesis.png) | Synthesizing 18 scene audio chunks and previewing the stitched master dialogue track. |
| **06. Batch Image Synthesis** | ![06](./screenshots/06_Visual_Engine_Batch_Image_Gen.png) | Live GPU progress telemetry on scene cards during batch image generation. |
| **07. Completed Visual Grid** | ![07](./screenshots/07_Visual_Engine_Completed_Grid.png) | All 18 scene illustrations populated in the Visual Engine grid. |
| **08. Batch Video Modal (I2V)** | ![08](./screenshots/08_Batch_Video_Generation_Modal.png) | Configuring batch Image-to-Video synthesis parameters and audio options. |
| **09. Fullscreen Video Inspector** | ![09](./screenshots/09_Fullscreen_Scene_Video_Preview.png) | Inspecting generated 1080p animated scene videos with variation history. |
| **10. WhisperX Timeline Sync** | ![10](./screenshots/10_Timeline_WhisperX_Alignment.png) | Running WhisperX alignment to lock scene durations to exact speech timestamps. |
| **11. BGM Waveform Studio** | ![11](./screenshots/11_BGM_Studio_and_Waveform_Editor.png) | Selecting background music regions and configuring audio ducking curves. |
| **12. Scene SFX & Foley Mixer** | ![12](./screenshots/12_Scene_SFX_and_Foley_Mixer.png) | Fine-tuning individual scene Foley audio levels and ambient sound effects. |
| **13. Transitions, Captions & LUTs** | ![13](./screenshots/13_Transitions_Subtitles_and_LUTs.png) | Customizing animated word subtitles, scene transitions, and color grading LUTs. |
| **14. Final Master Video Playback** | ![14](./screenshots/14_Final_Rendered_Video_Playback.png) | Watching the rendered 1080p master animation with captions, voiceover, and SFX. |

---

## 🛠️ Technology Stack

* **Backend:** Python 3.12, FastAPI, Uvicorn, SQLite (WAL concurrency), WebSockets
* **Frontend:** Vanilla ES6+ JavaScript, HTML5 Canvas, Web Audio API, CSS3 Grid
* **AI & Media Pipeline:** ComfyUI API, WhisperX, FFmpeg (NVENC hardware acceleration), OpenCV, Pillow

---

## 🚀 Quickstart

```bash
# 1. Clone repository
git clone https://github.com/your-username/SceneUI-Pro.git
cd SceneUI-Pro

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env

# 4. Start server
python server.py
```

Open `http://127.0.0.1:8001` in your browser.
