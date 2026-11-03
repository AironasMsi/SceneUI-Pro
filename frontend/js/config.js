// ============================================================================
// 1. WORKFLOW JSON TEMPLATES & CONSTANTS
// ============================================================================
const WF_1_REF = {
  "60": {"inputs": {"filename_prefix": "ComfyUI", "images": ["433:8", 0]}, "class_type": "SaveImage", "_meta": {"title": "Save Image"}},
  "78": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}},
  "435": {"inputs": {"value": ""}, "class_type": "PrimitiveStringMultiline", "_meta": {"title": "Prompt"}},
  "436": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}},
  "437": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}},
  "438": {"inputs": {"target_width": 1920, "target_height": 1080, "padding_color": "white", "interpolation": "area", "image": ["78", 0]}, "class_type": "ResizeAndPadImage", "_meta": {"title": "ResizeAndPadImage"}},
  "433:75": {"inputs": {"strength": 1, "model": ["433:66", 0]}, "class_type": "CFGNorm", "_meta": {"title": "CFGNorm"}},
  "433:39": {"inputs": {"vae_name": "qwen_image_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
  "433:38": {"inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
  "433:37": {"inputs": {"unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
  "433:110": {"inputs": {"prompt": "", "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
  "433:66": {"inputs": {"shift": 3, "model": ["433:89", 0]}, "class_type": "ModelSamplingAuraFlow", "_meta": {"title": "ModelSamplingAuraFlow"}},
  "433:111": {"inputs": {"prompt": ["435", 0], "clip": ["433:38", 0], "vae": ["433:39", 0], "image1": ["433:117", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}},
  "433:88": {"inputs": {"pixels": ["433:117", 0], "vae": ["433:39", 0]}, "class_type": "VAEEncode", "_meta": {"title": "VAE Encode"}},
  "433:8": {"inputs": {"samples": ["433:3", 0], "vae": ["433:39", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
  "433:89": {"inputs": {"lora_name": "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1, "model": ["433:37", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "Load LoRA"}},
  "433:117": {"inputs": {"image": ["438", 0]}, "class_type": "FluxKontextImageScale", "_meta": {"title": "FluxKontextImageScale"}},
  "439": {"inputs": {"upscale_method": "nearest-exact", "width": 1920, "height": 1080, "crop": "disabled", "samples": ["433:88", 0]}, "class_type": "LatentUpscale", "_meta": {"title": "Upscale Latent"}},
  "433:3": {"inputs": {"seed": 941027876668241, "steps": 4, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["433:75", 0], "positive": ["433:111", 0], "negative": ["433:110", 0], "latent_image": ["433:88", 0]}, "class_type": "KSampler", "_meta": {"title": "KSampler"}}
};
const WF_2_REF = JSON.parse(JSON.stringify(WF_1_REF));
WF_2_REF["433:110"].inputs.image2 = ["436", 0];
WF_2_REF["433:111"].inputs.image2 = ["436", 0];
const WF_3_REF = JSON.parse(JSON.stringify(WF_2_REF));
WF_3_REF["433:110"].inputs.image3 = ["437", 0];
WF_3_REF["433:111"].inputs.image3 = ["437", 0];

const MAPPING = { NODE_SAVE:"60", NODE_SAMPLER:"433:3", NODE_RESIZE:"438", NODE_PROMPT:"435", NODE_NEG:"433:110", NODE_REFA:"78", NODE_REFB:"436", NODE_REFC:"437" };

// Qwen 2511 Templates
const WF_1_REF_2511 = {"9": {"inputs": {"filename_prefix": "Qwen_Edit_2511_systms_action", "images": ["246", 0]}, "class_type": "SaveImage", "_meta": {"title": "Save Image"}}, "225": {"inputs": {"shift": 3.1, "model": ["237", 0]}, "class_type": "ModelSamplingAuraFlow", "_meta": {"title": "ModelSamplingAuraFlow"}}, "226": {"inputs": {"vae_name": "qwen_image_vae.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}}, "227": {"inputs": {"reference_latents_method": "index_timestep_zero", "conditioning": ["229", 0]}, "class_type": "FluxKontextMultiReferenceLatentMethod", "_meta": {"title": "Edit Model Reference Method"}}, "228": {"inputs": {"reference_latents_method": "index_timestep_zero", "conditioning": ["231", 0]}, "class_type": "FluxKontextMultiReferenceLatentMethod", "_meta": {"title": "Edit Model Reference Method"}}, "229": {"inputs": {"prompt": "", "clip": ["238", 0], "vae": ["226", 0], "image1": ["247", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus"}}, "231": {"inputs": {"prompt": "", "clip": ["238", 0], "vae": ["226", 0], "image1": ["247", 0]}, "class_type": "TextEncodeQwenImageEditPlus", "_meta": {"title": "TextEncodeQwenImageEditPlus (Positive)"}}, "232": {"inputs": {"strength": 1, "pre_cfg": false, "model": ["225", 0]}, "class_type": "CFGNorm", "_meta": {"title": "CFGNorm"}}, "233": {"inputs": {"lora_name": "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1, "model": ["232", 0]}, "class_type": "LoraLoaderModelOnly", "_meta": {"title": "Load LoRA"}}, "234": {"inputs": {"value": 4}, "class_type": "PrimitiveFloat", "_meta": {"title": "CFG"}}, "235": {"inputs": {"value": 1}, "class_type": "PrimitiveFloat", "_meta": {"title": "CFG"}}, "236": {"inputs": {"pixels": ["247", 0], "vae": ["226", 0]}, "class_type": "VAEEncode", "_meta": {"title": "VAE Encode"}}, "237": {"inputs": {"unet_name": "qwen_image_edit_2511_bf16.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}}, "238": {"inputs": {"clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}}, "239": {"inputs": {"switch": ["242", 0], "on_false": ["232", 0], "on_true": ["233", 0]}, "class_type": "ComfySwitchNode", "_meta": {"title": "Switch (Model)"}}, "240": {"inputs": {"value": 4}, "class_type": "PrimitiveInt", "_meta": {"title": "Steps"}}, "241": {"inputs": {"value": 40}, "class_type": "PrimitiveInt", "_meta": {"title": "Steps"}}, "242": {"inputs": {"value": true}, "class_type": "PrimitiveBoolean", "_meta": {"title": "Enable 4steps LoRA?"}}, "243": {"inputs": {"switch": ["242", 0], "on_false": ["234", 0], "on_true": ["235", 0]}, "class_type": "ComfySwitchNode", "_meta": {"title": "Switch (CFG)"}}, "244": {"inputs": {"switch": ["242", 0], "on_false": ["241", 0], "on_true": ["240", 0]}, "class_type": "ComfySwitchNode", "_meta": {"title": "Switch (Steps)"}}, "245": {"inputs": {"seed": 941027876668241, "steps": ["244", 0], "cfg": ["243", 0], "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["239", 0], "positive": ["228", 0], "negative": ["227", 0], "latent_image": ["250", 0]}, "class_type": "KSampler", "_meta": {"title": "KSampler"}}, "246": {"inputs": {"samples": ["245", 0], "vae": ["226", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}}, "247": {"inputs": {"image": ["249", 0]}, "class_type": "FluxKontextImageScale", "_meta": {"title": "FluxKontextImageScale"}}, "249": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}}, "250": {"inputs": {"upscale_method": "nearest-exact", "width": 1920, "height": 1080, "crop": "disabled", "samples": ["236", 0]}, "class_type": "LatentUpscale", "_meta": {"title": "Upscale Latent"}}, "251": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}}, "252": {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image"}}};

const WF_2_REF_2511 = JSON.parse(JSON.stringify(WF_1_REF_2511));
WF_2_REF_2511["229"].inputs.image2 = ["251", 0];
WF_2_REF_2511["231"].inputs.image2 = ["251", 0];
const WF_3_REF_2511 = JSON.parse(JSON.stringify(WF_2_REF_2511));
WF_3_REF_2511["229"].inputs.image3 = ["252", 0];
WF_3_REF_2511["231"].inputs.image3 = ["252", 0];

const MAPPING_2511 = { NODE_SAVE:"9", NODE_SAMPLER:"245", NODE_RESIZE:"250", NODE_PROMPT:"231", NODE_NEG:"229", NODE_REFA:"249", NODE_REFB:"251", NODE_REFC:"252" };

// Qwen Image 2.1 Templates (Native 2.1 Architecture)
const WF_0_REF_QWEN21 = {
  "461": {"inputs": {"filename_prefix": "SceneUI_Qwen21", "images": ["459:457", 0]}, "class_type": "SaveImage", "_meta": {"title": "Save Image"}},
  "459:451": {"inputs": {"unet_name": "qwen_image_2.1_int8_convrot.safetensors", "weight_dtype": "default"}, "class_type": "UNETLoader", "_meta": {"title": "Load Diffusion Model"}},
  "459:453": {"inputs": {"clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default"}, "class_type": "CLIPLoader", "_meta": {"title": "Load CLIP"}},
  "459:454": {"inputs": {"vae_name": "qwen_image_2.1_vae_bf16.safetensors"}, "class_type": "VAELoader", "_meta": {"title": "Load VAE"}},
  "459:456": {"inputs": {"width": 1920, "height": 1080, "batch_size": 1}, "class_type": "EmptyLatentImage", "_meta": {"title": "Empty Latent Image"}},
  "459:457": {"inputs": {"samples": ["459:458", 0], "vae": ["459:454", 0]}, "class_type": "VAEDecode", "_meta": {"title": "VAE Decode"}},
  "459:458": {"inputs": {"seed": 941027876668241, "steps": 25, "cfg": 1, "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["459:469", 0], "positive": ["459:474", 0], "negative": ["459:474", 1], "latent_image": ["459:456", 0]}, "class_type": "KSampler", "_meta": {"title": "KSampler"}},
  "459:469": {"inputs": {"device": "auto", "dtype": "default", "model": ["459:451", 0]}, "class_type": "QwenImage21Cache", "_meta": {"title": "Qwen Image 2.1 Cache"}},
  "459:474": {"inputs": {"prompt": "", "negative_prompt": "", "resolution": 1024, "clip": ["459:453", 0]}, "class_type": "TextEncodeQwenImage21", "_meta": {"title": "Text Encode Qwen Image 2.1"}}
};

const WF_1_REF_QWEN21 = JSON.parse(JSON.stringify(WF_0_REF_QWEN21));
WF_1_REF_QWEN21["470"] = {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image (Ref A)"}};
WF_1_REF_QWEN21["459:474"].inputs["images.image_1"] = ["470", 0];
WF_1_REF_QWEN21["459:474"].inputs.vae = ["459:454", 0];
WF_1_REF_QWEN21["459:468"] = {"inputs": {"switch": true, "on_false": ["459:474", 2], "on_true": ["459:456", 0]}, "class_type": "ComfySwitchNode", "_meta": {"title": "If/Else Switch"}};
WF_1_REF_QWEN21["459:458"].inputs.latent_image = ["459:468", 0];

const WF_2_REF_QWEN21 = JSON.parse(JSON.stringify(WF_1_REF_QWEN21));
WF_2_REF_QWEN21["475"] = {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image (Ref B)"}};
WF_2_REF_QWEN21["459:474"].inputs["images.image_2"] = ["475", 0];

const WF_3_REF_QWEN21 = JSON.parse(JSON.stringify(WF_2_REF_QWEN21));
WF_3_REF_QWEN21["476"] = {"inputs": {"image": "example.png"}, "class_type": "LoadImage", "_meta": {"title": "Load Image (Ref C)"}};
WF_3_REF_QWEN21["459:474"].inputs["images.image_3"] = ["476", 0];

const MAPPING_QWEN21 = {
  NODE_SAVE: "461",
  NODE_SAMPLER: "459:458",
  NODE_PROMPT: "459:474",
  NODE_NEG: "459:474",
  NODE_LATENT: "459:456",
  NODE_SWITCH: "459:468",
  NODE_UNET: "459:451",
  NODE_CLIP: "459:453",
  NODE_VAE: "459:454",
  NODE_CACHE: "459:469",
  NODE_REFA: "470",
  NODE_REFB: "475",
  NODE_REFC: "476"
};

// Qwen 2509 Inpaint Template (4-Step Lightning + MaskBlur+ & Clean Mask Separation)
const WF_INPAINT_2509 = {
  "1": { "inputs": { "value": "" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Mano Promptas" } },
  "2": { "inputs": { "value": "seamless background texture, empty scenery, natural ambient lighting, clean continuous surface, pristine background without any person or object" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Universal Removal" } },
  "6": { "inputs": { "index": 0, "text0": ["1", 0], "text1": ["2", 0] }, "class_type": "easy textIndexSwitch", "_meta": { "title": "Mode Switch" } },
  "7": { "inputs": { "image": "example.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Pristine Base Image" } },
  "20": { "inputs": { "image": "example_mask.png", "channel": "red" }, "class_type": "LoadImageMask", "_meta": { "title": "Load Pure Mask" } },
  "8": { "inputs": { "unet_name": "qwen_image_edit_2509_fp8_e4m3fn.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Load UNET" } },
  "9": { "inputs": { "lora_name": "Qwen-Image-Edit-2509-Lightning-4steps-V1.0-bf16.safetensors", "strength_model": 1.0, "model": ["8", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "Load LoRA" } },
  "10": { "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
  "11": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
  "12": { "inputs": { "prompt": ["6", 0], "clip": ["10", 0], "vae": ["11", 0], "image1": ["7", 0] }, "class_type": "TextEncodeQwenImageEditPlus", "_meta": { "title": "Encode Positive" } },
  "13": { "inputs": { "prompt": "blurry, bad quality, distorted anatomy, extra limbs, artifacts", "clip": ["10", 0], "vae": ["11", 0], "image1": ["7", 0] }, "class_type": "TextEncodeQwenImageEditPlus", "_meta": { "title": "Encode Negative" } },
  "14": { "inputs": { "pixels": ["7", 0], "vae": ["11", 0], "mask": ["20", 0], "grow_mask_by": 6 }, "class_type": "VAEEncodeForInpaint", "_meta": { "title": "VAE Encode For Inpaint" } },
  "15": { "inputs": { "model": ["9", 0], "positive": ["12", 0], "negative": ["13", 0], "latent_image": ["14", 0], "seed": 42, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0 }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "16": { "inputs": { "samples": ["15", 0], "vae": ["11", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "17": { "inputs": { "destination": ["7", 0], "source": ["16", 0], "mask": ["19", 0], "x": 0, "y": 0, "resize_source": false }, "class_type": "ImageCompositeMasked", "_meta": { "title": "Image Composite Masked" } },
  "18": { "inputs": { "images": ["17", 0], "filename_prefix": "SceneUI_Inpaint_Mask_2509" }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "19": { "inputs": { "mask": ["20", 0], "amount": 12, "device": "auto" }, "class_type": "MaskBlur+", "_meta": { "title": "MaskBlur+" } }
};

// Qwen 2.1 Native Inpaint Template (High-Quality Native Model + SetLatentNoiseMask + MaskBlur+)
const WF_INPAINT_21 = {
  "1": { "inputs": { "value": "" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Mano Custom Promptas" } },
  "2": { "inputs": { "value": "seamless background texture, empty scenery, natural ambient lighting, clean continuous surface, pristine background without any person or object" }, "class_type": "PrimitiveStringMultiline", "_meta": { "title": "Universal Removal" } },
  "6": { "inputs": { "index": 0, "text0": ["1", 0], "text1": ["2", 0] }, "class_type": "easy textIndexSwitch", "_meta": { "title": "Mode Switch" } },
  "7": { "inputs": { "image": "example.png" }, "class_type": "LoadImage", "_meta": { "title": "Load Pristine Base Image" } },
  "20": { "inputs": { "image": "example_mask.png", "channel": "red" }, "class_type": "LoadImageMask", "_meta": { "title": "Load Pure Mask" } },
  "8": { "inputs": { "unet_name": "qwen_image_2.1_int8_convrot.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Qwen 2.1 UNET" } },
  "9": { "inputs": { "clip_name": "qwen3vl_8b_int8_convrot.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Qwen 2.1 CLIP" } },
  "10": { "inputs": { "vae_name": "qwen_image_2.1_vae_bf16.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Qwen 2.1 VAE" } },
  "11": { "inputs": { "device": "auto", "dtype": "default", "model": ["8", 0] }, "class_type": "QwenImage21Cache", "_meta": { "title": "Qwen Cache" } },
  "12": { "inputs": { "prompt": ["6", 0], "negative_prompt": "blurry, artifacts, bad anatomy, deformed", "resolution": 0, "clip": ["9", 0], "vae": ["10", 0], "images.image_1": ["7", 0] }, "class_type": "TextEncodeQwenImage21", "_meta": { "title": "Qwen 2.1 Enkoderis" } },
  "13": { "inputs": { "pixels": ["7", 0], "vae": ["10", 0] }, "class_type": "VAEEncode", "_meta": { "title": "VAE Encode" } },
  "14": { "inputs": { "samples": ["13", 0], "mask": ["19", 0] }, "class_type": "SetLatentNoiseMask", "_meta": { "title": "Set Mask" } },
  "15": { "inputs": { "model": ["11", 0], "positive": ["12", 0], "negative": ["12", 1], "latent_image": ["14", 0], "seed": 42, "steps": 12, "cfg": 3.5, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0 }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "16": { "inputs": { "samples": ["15", 0], "vae": ["10", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "17": { "inputs": { "destination": ["7", 0], "source": ["16", 0], "mask": ["19", 0], "x": 0, "y": 0, "resize_source": false }, "class_type": "ImageCompositeMasked", "_meta": { "title": "Image Composite Masked" } },
  "18": { "inputs": { "images": ["17", 0], "filename_prefix": "SceneUI_Inpaint_Mask_Qwen21" }, "class_type": "SaveImage", "_meta": { "title": "Save Image" } },
  "19": { "inputs": { "mask": ["20", 0], "amount": 12, "device": "auto" }, "class_type": "MaskBlur+", "_meta": { "title": "MaskBlur+" } }
};

// ============================================================================
// IMAGE-TO-VIDEO (I2V) WORKFLOW TEMPLATES
// ============================================================================

// 1. MiniMax H3 Turbo (Native Built-in Video & Audio generation via VAEDecodeAudio)
const WF_VIDEO_MINIMAX_H3 = {
  "1": {
    "inputs": {
      "fl2va_model": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "ref2va_model": "None",
      "text_encoder": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "video_vae": "minimax_h3_video_vae_fp16.safetensors",
      "audio_vae": "minimax_h3_audio_vae_fp32.safetensors"
    },
    "class_type": "MiniMaxH3EasyLoader",
    "_meta": { "title": "MiniMax H3 Loader" }
  },
  "15": {
    "inputs": {
      "image": "input_image.png"
    },
    "class_type": "LoadImage",
    "_meta": { "title": "Input Image" }
  },
  "2": {
    "inputs": {
      "h3_bundle": ["1", 0],
      "media": ["15", 0],
      "mode": "image",
      "prompt": "cinematic idle motion, subtle natural breathing, eye blinking, gentle atmospheric movement, masterpiece, ultra-detailed 4k",
      "resolution": "720P",
      "aspect_ratio": "16:9",
      "width": 1280,
      "height": 720,
      "seconds": 2.5,
      "fps": 24.0,
      "advanced": false,
      "keyframe_role": "first",
      "ref_image_size": "1k",
      "reference_mention_mode": "index",
      "prompt_optimizer_settings": false,
      "prompt_optimizer_scene_guide": "none"
    },
    "class_type": "MiniMaxH3Easy",
    "_meta": { "title": "MiniMax Settings" }
  },
  "24": {
    "inputs": {
      "lora_name": "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
      "strength_model": 1.0,
      "model": ["2", 0]
    },
    "class_type": "LoraLoaderModelOnly",
    "_meta": { "title": "MiniMax Turbo LoRA" }
  },
  "13": {
    "inputs": {
      "h3_context": ["2", 1]
    },
    "class_type": "MiniMaxH3EasyOutput",
    "_meta": { "title": "Unpack Context" }
  },
  "4": {
    "inputs": {
      "model": ["24", 0],
      "conditioning": ["13", 0]
    },
    "class_type": "BasicGuider",
    "_meta": { "title": "Basic Guider" }
  },
  "5": {
    "inputs": {
      "scheduler": "simple",
      "steps": 8,
      "denoise": 1.0,
      "model": ["24", 0]
    },
    "class_type": "BasicScheduler",
    "_meta": { "title": "Basic Scheduler" }
  },
  "6": {
    "inputs": {
      "noise_seed": 42,
      "control_after_generate": "randomize"
    },
    "class_type": "RandomNoise",
    "_meta": { "title": "Random Noise" }
  },
  "7": {
    "inputs": {
      "sampler_name": "euler"
    },
    "class_type": "KSamplerSelect",
    "_meta": { "title": "Sampler Select" }
  },
  "8": {
    "inputs": {
      "noise": ["6", 0],
      "guider": ["4", 0],
      "sampler": ["7", 0],
      "sigmas": ["5", 0],
      "latent_image": ["13", 1]
    },
    "class_type": "SamplerCustomAdvanced",
    "_meta": { "title": "Sampler Custom Advanced" }
  },
  "9": {
    "inputs": {
      "samples": ["8", 0],
      "vae": ["13", 2]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "Video VAE Decode" }
  },
  "10": {
    "inputs": {
      "samples": ["8", 1],
      "vae": ["13", 3]
    },
    "class_type": "VAEDecodeAudio",
    "_meta": { "title": "Audio VAE Decode" }
  },
  "11": {
    "inputs": {
      "images": ["9", 0],
      "audio": ["10", 0],
      "fps": ["13", 4]
    },
    "class_type": "CreateVideo",
    "_meta": { "title": "Create Video" }
  },
  "12": {
    "inputs": {
      "video": ["11", 0],
      "filename_prefix": "video/SceneUI_MiniMax_H3_Turbo",
      "format": "mp4",
      "codec": "auto"
    },
    "class_type": "SaveVideo",
    "_meta": { "title": "Save MP4 Video" }
  },
  "25": {
    "inputs": {
      "anything": ["11", 0],
      "clean_file_cache": true,
      "clean_processes": true,
      "clean_dlls": true,
      "retry_times": 3
    },
    "class_type": "RAMCleanup",
    "_meta": { "title": "RAM Cleanup" }
  }
};

// 2. Wan 2.2 Turbo (4 žingsniai - 480P)
const WF_VIDEO_WAN22_TURBO = {
  "1": { "inputs": { "image": "input_image.png" }, "class_type": "LoadImage", "_meta": { "title": "Input Image" } },
  "2": { "inputs": { "unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Wan UNET" } },
  "3": { "inputs": { "lora_name": "wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors", "strength_model": 1.0, "model": ["2", 0] }, "class_type": "LoraLoaderModelOnly", "_meta": { "title": "Turbo LoRA" } },
  "4": { "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "CLIP Loader" } },
  "5": { "inputs": { "vae_name": "wan_2.1_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "VAE Loader" } },
  "6": { "inputs": { "text": "idle character, subtle breathing, eye blink, soft wind, high quality, 4k cinematic", "clip": ["4", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive Prompt" } },
  "7": { "inputs": { "text": "static, sudden movements, deformation, distorted faces, blurry, artifacts", "clip": ["4", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative Prompt" } },
  "8": { "inputs": { "positive": ["6", 0], "negative": ["7", 0], "vae": ["5", 0], "start_image": ["1", 0], "width": 832, "height": 480, "length": 49, "batch_size": 1 }, "class_type": "WanImageToVideo", "_meta": { "title": "Wan I2V Init" } },
  "9": { "inputs": { "model": ["3", 0], "positive": ["8", 0], "negative": ["8", 1], "latent_image": ["8", 2], "seed": 42, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0 }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "10": { "inputs": { "samples": ["9", 0], "vae": ["5", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "11": { "inputs": { "images": ["10", 0], "fps": 16.0 }, "class_type": "CreateVideo", "_meta": { "title": "Create Video" } },
  "12": { "inputs": { "video": ["11", 0], "filename_prefix": "video/SceneUI_Wan22_Turbo", "format": "mp4" }, "class_type": "SaveVideo", "_meta": { "title": "Save MP4 Video" } }
};

// 3. Wan 2.1 Native (25-30 žingsniai - 480P)
const WF_VIDEO_WAN21_NATIVE = {
  "1": { "inputs": { "image": "input_image.png" }, "class_type": "LoadImage", "_meta": { "title": "Input Image" } },
  "2": { "inputs": { "unet_name": "wan2.1_i2v_480p_14B_fp16.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader", "_meta": { "title": "Wan UNET" } },
  "3": { "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "CLIP Loader" } },
  "4": { "inputs": { "vae_name": "wan_2.1_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "VAE Loader" } },
  "5": { "inputs": { "text": "idle character, subtle breathing, eye blink, soft wind, high quality, 4k cinematic", "clip": ["3", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Positive Prompt" } },
  "6": { "inputs": { "text": "static, sudden movements, deformation, distorted faces, blurry, artifacts", "clip": ["3", 0] }, "class_type": "CLIPTextEncode", "_meta": { "title": "Negative Prompt" } },
  "7": { "inputs": { "positive": ["5", 0], "negative": ["6", 0], "vae": ["4", 0], "start_image": ["1", 0], "width": 832, "height": 480, "length": 49, "batch_size": 1 }, "class_type": "WanImageToVideo", "_meta": { "title": "Wan I2V Init" } },
  "8": { "inputs": { "model": ["2", 0], "positive": ["7", 0], "negative": ["7", 1], "latent_image": ["7", 2], "seed": 42, "steps": 25, "cfg": 4.5, "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0 }, "class_type": "KSampler", "_meta": { "title": "KSampler" } },
  "9": { "inputs": { "samples": ["8", 0], "vae": ["4", 0] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
  "10": { "inputs": { "images": ["9", 0], "fps": 16.0 }, "class_type": "CreateVideo", "_meta": { "title": "Create Video" } },
  "11": { "inputs": { "video": ["10", 0], "filename_prefix": "video/SceneUI_Wan21_Native", "format": "mp4" }, "class_type": "SaveVideo", "_meta": { "title": "Save MP4 Video" } }
};

// ============================================================================
// AUDIO-ENABLED IMAGE-TO-VIDEO (I2V) WORKFLOW TEMPLATES (ComfyUI LoadAudio)
// ============================================================================
const WF_VIDEO_MINIMAX_H3_AUDIO = WF_VIDEO_MINIMAX_H3;

const WF_VIDEO_MINIMAX_H3_NO_AUDIO = JSON.parse(JSON.stringify(WF_VIDEO_MINIMAX_H3));
delete WF_VIDEO_MINIMAX_H3_NO_AUDIO["10"];
if (WF_VIDEO_MINIMAX_H3_NO_AUDIO["11"] && WF_VIDEO_MINIMAX_H3_NO_AUDIO["11"].inputs) {
  delete WF_VIDEO_MINIMAX_H3_NO_AUDIO["11"].inputs.audio;
}

const WF_VIDEO_WAN22_TURBO_AUDIO = JSON.parse(JSON.stringify(WF_VIDEO_WAN22_TURBO));
WF_VIDEO_WAN22_TURBO_AUDIO["21"] = {
  "inputs": { "audio": "scene_audio.wav" },
  "class_type": "LoadAudio",
  "_meta": { "title": "Load Scene Audio" }
};
WF_VIDEO_WAN22_TURBO_AUDIO["11"].inputs.audio = ["21", 0];

const WF_VIDEO_WAN21_NATIVE_AUDIO = JSON.parse(JSON.stringify(WF_VIDEO_WAN21_NATIVE));
WF_VIDEO_WAN21_NATIVE_AUDIO["21"] = {
  "inputs": { "audio": "scene_audio.wav" },
  "class_type": "LoadAudio",
  "_meta": { "title": "Load Scene Audio" }
};
WF_VIDEO_WAN21_NATIVE_AUDIO["10"].inputs.audio = ["21", 0];


// ============================================================================
// WORKFLOW 18: MINIMAX H3 LIPSYNC (VIENTISAS GYVAS KADRAS + KALBA)
// ============================================================================
const WF_VIDEO_MINIMAX_H3_LIPSYNC = {
  "102": {
    "class_type": "ComfyMathExpression",
    "inputs": {
      "values.a": [
        "101",
        0
      ],
      "expression": "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17"
    },
    "_meta": {
      "title": "Auto Frames Calc"
    }
  },
  "1733": {
    "class_type": "PrimitiveInt",
    "inputs": {
      "value": 39
    },
    "_meta": {
      "title": "Auto Audio Latent Scale"
    }
  },
  "2": {
    "class_type": "CLIPLoader",
    "inputs": {
      "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
      "type": "minimax"
    },
    "_meta": {
      "title": "5. Load CLIP (Qwen3-VL 32B)"
    }
  },
  "1753": {
    "class_type": "ComfyMathExpression",
    "inputs": {
      "values.a": [
        "1733",
        0
      ],
      "values.b": [
        "102",
        1
      ],
      "expression": "max(5, min(a, (b - (b % 2)) / 2)) - ((max(5, min(a, (b - (b % 2)) / 2)) - 5) % 17)"
    },
    "_meta": {
      "title": "Auto Step Sync"
    }
  },
  "5": {
    "class_type": "MiniMaxH3SigmaShift",
    "inputs": {
      "model": [
        "977",
        0
      ],
      "shift_video": 12,
      "shift_audio": 3
    },
    "_meta": {
      "title": "4. H3 Sigma Shift"
    }
  },
  "977": {
    "class_type": "LoraLoaderModelOnly",
    "inputs": {
      "model": [
        "1756",
        0
      ],
      "lora_name": "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
      "strength_model": 1
    },
    "_meta": {
      "title": "2. Turbo LoRA (8-Step)"
    }
  },
  "2291": {
    "class_type": "VAEDecode",
    "inputs": {
      "samples": [
        "124",
        0
      ],
      "vae": [
        "3",
        0
      ]
    },
    "_meta": {
      "title": "🖼️ VAE Decode (Kadrų iškodavimas)"
    }
  },
  "910": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "s2_20261026045504.jpg"
    },
    "_meta": {
      "title": "🖼️ 1. PILNA DIDELĖ SCENA (Bendra Nuotrauka su Visais Veikėjais)"
    }
  },
  "2510": {
    "class_type": "MiniMaxH3AudioVAECompatibility",
    "inputs": {
      "audio_vae": [
        "4",
        0
      ]
    },
    "_meta": {
      "title": "8. Audio VAE Compatibility"
    }
  },
  "2293": {
    "class_type": "VHS_VideoCombine",
    "inputs": {
      "images": [
        "2291",
        0
      ],
      "audio": [
        "1755",
        2
      ],
      "frame_rate": 24,
      "loop_count": 0,
      "filename_prefix": "H3_LipSync",
      "format": "video/h264-mp4",
      "pingpong": false,
      "save_output": true
    },
    "_meta": {
      "title": "🎬 GALUTINIS VIENTISAS GYVAS VIDEO SU GARSU (.MP4)"
    }
  },
  "124": {
    "class_type": "SamplerCustomAdvanced",
    "inputs": {
      "noise": [
        "120",
        0
      ],
      "guider": [
        "121",
        0
      ],
      "sampler": [
        "973",
        0
      ],
      "sigmas": [
        "123",
        0
      ],
      "latent_image": [
        "1755",
        0
      ]
    },
    "_meta": {
      "title": "⚡ Sampleris (Vaizdo Generavimas)"
    }
  },
  "1756": {
    "class_type": "ModelAttentionBackend",
    "inputs": {
      "model": [
        "1",
        0
      ],
      "attention": "comfy kitchen attention"
    },
    "_meta": {
      "title": "3. Attention Backend"
    }
  },
  "123": {
    "class_type": "BasicScheduler",
    "inputs": {
      "model": [
        "5",
        0
      ],
      "steps": [
        "970",
        0
      ],
      "scheduler": "simple",
      "denoise": 1.0
    },
    "_meta": {
      "title": "Scheduler (Simple)"
    }
  },
  "101": {
    "class_type": "PrimitiveFloat",
    "inputs": {
      "value": 3.0
    },
    "_meta": {
      "title": "⏱️ Trukmė Sekundėmis (pvz. 2.0 arba 3.0)"
    }
  },
  "1738": {
    "class_type": "ComfyMathExpression",
    "inputs": {
      "values.a": [
        "1736",
        0
      ],
      "expression": "a * 0"
    },
    "_meta": {
      "title": "Auto Context Span"
    }
  },
  "1755": {
    "class_type": "MiniMaxH3SongMaskedAVContext",
    "inputs": {
      "latent": [
        "110",
        1
      ],
      "audio_vae": [
        "2510",
        0
      ],
      "master_audio": [
        "940",
        0
      ],
      "clip_start_seconds": [
        "1738",
        0
      ],
      "context_length": 0.0,
      "source_fps": 24.0,
      "crop": "disabled",
      "audio_start_seconds": 0.0
    },
    "_meta": {
      "title": "🎵 H3 Garso ir Lūpų Sinchronizacija"
    }
  },
  "1736": {
    "class_type": "ComfyMathExpression",
    "inputs": {
      "values.a": [
        "102",
        1
      ],
      "values.b": [
        "1753",
        1
      ],
      "expression": "(a - b) / 24"
    },
    "_meta": {
      "title": "Auto Grid Timing"
    }
  },
  "940": {
    "class_type": "LoadAudio",
    "inputs": {
      "audio": "chunk_default_full_script_11_cb8351.wav"
    },
    "_meta": {
      "title": "🎵 3. GARSO TAKELIS (.wav Kalba ar Daina)"
    }
  },
  "3": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "minimax_h3_video_vae_int8_convrot.safetensors"
    },
    "_meta": {
      "title": "6. Load Video VAE"
    }
  },
  "4": {
    "class_type": "VAELoader",
    "inputs": {
      "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
    },
    "_meta": {
      "title": "7. Load Audio VAE"
    }
  },
  "1": {
    "class_type": "UNETLoader",
    "inputs": {
      "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
      "weight_dtype": "default"
    },
    "_meta": {
      "title": "1. Load UNET (MiniMax H3)"
    }
  },
  "121": {
    "class_type": "BasicGuider",
    "inputs": {
      "model": [
        "5",
        0
      ],
      "conditioning": [
        "110",
        0
      ]
    },
    "_meta": {
      "title": "Guider (CFG)"
    }
  },
  "970": {
    "class_type": "PrimitiveInt",
    "inputs": {
      "value": 8
    },
    "_meta": {
      "title": "Žingsniai (Rekomenduojama 8)"
    }
  },
  "100": {
    "class_type": "ResolutionSelector",
    "inputs": {
      "aspect_ratio": "9:16 (Portrait Widescreen)",
      "megapixels": 1.0,
      "multiple": 32
    },
    "_meta": {
      "title": "📐 Kraštinių Santykis (Rezoliucija)"
    }
  },
  "120": {
    "class_type": "RandomNoise",
    "inputs": {
      "noise_seed": 514005817509111
    },
    "_meta": {
      "title": "Noise Seed"
    }
  },
  "110": {
    "class_type": "MiniMaxH3ReferenceToVideo",
    "inputs": {
      "clip": [
        "2",
        0
      ],
      "width": [
        "100",
        0
      ],
      "height": [
        "100",
        1
      ],
      "length": [
        "102",
        1
      ],
      "vae": [
        "3",
        0
      ],
      "audio_vae": [
        "2510",
        0
      ],
      "ref_images.ref_image_0": [
        "910",
        0
      ],
      "ref_images.ref_image_1": [
        "911",
        0
      ],
      "prompt": "subject_definitions:\n<Picture 1> is the complete wide scene with both characters and the sci-fi environment.\n<Subject 1> is the primary speaking character, whose identity and facial appearance matches <Picture 2>.\n<Subject 2> is the companion character present in <Picture 1>.\n<Audio 1> is the speech audio track driving the lip sync.\n\nsummary:\n[cinematic living wide scene animation] Animate the complete wide scene from <Picture 1>. <Subject 1> (identified by <Picture 2>) speaks actively and expressively with natural mouth movement and head gesture perfectly synchronized to <Audio 1>. Concurrently, <Subject 2> and the full background remain naturally alive and dynamic: <Subject 2> blinks, breathes, and reacts with natural idle body language, while the background monitors and holographic display hum with ambient sci-fi lighting.\n\nretention_analysis:\n<Picture 1>: fully_preserved - preserve the clean linework, art style, room architecture, and character designs from <Picture 1>.\n<Subject 1>: active_speaker - expressively animate mouth articulation, lips, and jaw matching <Audio 1>, with natural speaking head movement.\n<Subject 2>: responsive_listener - natural breathing, eye blinking, idle shifts in posture, attentive listening, mouth remains closed.\n\ndetailed_description:\nA high quality cinematic wide-angle animation of <Picture 1>. The character matching <Picture 2> speaks expressively in cadence with <Audio 1>. The secondary character naturally blinks and shifts posture while observing. The computer screens and holographic table graphics pulse with gentle sci-fi illumination.\n",
      "ref_image_size": "match"
    },
    "_meta": {
      "title": "🎬 MiniMax H3 Vientisas Gyvas Kadras + LipSync"
    }
  },
  "973": {
    "class_type": "KSamplerSelect",
    "inputs": {
      "sampler_name": "res_multistep"
    },
    "_meta": {
      "title": "Sampleris (Euler / DPMPP)"
    }
  },
  "911": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "MARCUS_whitestickman_lead.png_20261027184602.jpg"
    },
    "_meta": {
      "title": "🎯 2. KALBANTIS PERSONAŽAS (Veikėjo Pavyzdys - Ref)"
    }
  }
};

// ============================================================================
// WORKFLOW 19: MMAUDIO SCENE SFX & AMBIENCE (VIDEO -> APLINKOS GARSAS)
// ============================================================================
const WF_VIDEO_MMAUDIO_SFX = {
  "91": {
    "class_type": "VHS_LoadVideo",
    "inputs": {
      "video": "ComfyUI_00415_.mp4",
      "force_rate": 0,
      "force_size": "Disabled",
      "frame_load_cap": 0,
      "skip_first_frames": 0,
      "select_every_nth": 1,
      "custom_width": 512,
      "custom_height": 512
    },
    "_meta": {
      "title": "VHS_LoadVideo"
    }
  },
  "105": {
    "class_type": "VHS_VideoInfo",
    "inputs": {
      "video_info": [
        "91",
        3
      ]
    },
    "_meta": {
      "title": "VHS_VideoInfo"
    }
  },
  "85": {
    "class_type": "MMAudioModelLoader",
    "inputs": {
      "mmaudio_model": "mmaudio_large_44k_v2_fp16.safetensors",
      "base_precision": "fp16"
    },
    "_meta": {
      "title": "MMAudioModelLoader"
    }
  },
  "102": {
    "class_type": "MMAudioFeatureUtilsLoader",
    "inputs": {
      "vae_model": "mmaudio_vae_44k_fp16.safetensors",
      "synchformer_model": "mmaudio_synchformer_fp16.safetensors",
      "clip_model": "apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors",
      "mode": "44k",
      "precision": "fp16"
    },
    "_meta": {
      "title": "MMAudioFeatureUtilsLoader"
    }
  },
  "92": {
    "class_type": "MMAudioSampler",
    "inputs": {
      "mmaudio_model": [
        "85",
        0
      ],
      "feature_utils": [
        "102",
        0
      ],
      "images": [
        "91",
        0
      ],
      "duration": [
        "105",
        7
      ],
      "steps": 15,
      "cfg": 4.5,
      "seed": 42,
      "prompt": "deep industrial server room hum, CRT monitor high pitch tone, quiet electronic beeps, zero speech, zero music",
      "negative_prompt": "music, singing, speech, dialogue, words, vocals, clipping, distortion, robotic noise",
      "mask_away_clip": false,
      "force_offload": true
    },
    "_meta": {
      "title": "MMAudioSampler"
    }
  },
  "98": {
    "class_type": "PreviewAudio",
    "inputs": {
      "audio": [
        "92",
        0
      ]
    },
    "_meta": {
      "title": "PreviewAudio"
    }
  },
  "97": {
    "class_type": "VHS_VideoCombine",
    "inputs": {
      "images": [
        "91",
        0
      ],
      "audio": [
        "92",
        0
      ],
      "frame_rate": [
        "105",
        0
      ],
      "loop_count": 0,
      "filename_prefix": "MMAudio_SFX",
      "format": "video/h264-mp4",
      "pingpong": false,
      "save_output": true
    },
    "_meta": {
      "title": "VHS_VideoCombine"
    }
  }
};

// ============================================================================
// 2. GLOBAL STATE & MULTI-GPU PROXY MANAGEMENT
// ============================================================================

// Originali būsenos struktūra (Dabar Hub pagrindu)
const rawState = {
  // Centralizuotas Python serveris (Hub), per kurį eina visi skambučiai
  serverUrl: '/', 
  wServerUrl: "http://127.0.0.1:8000/",
  ollamaUrl: "http://127.0.0.1:11434",
  llmApiKey: "",
  apiModel: "gpt-4o-mini",

  connected: true, // Ryšys visada true, nes bendraujame tiesiai su savo pačių backend'u
  wConnected: false,
  llmMode: 'api',
  currentLlmTask: null,

  // Multi-GPU Render Nodes (Iš čia UI ims visą informaciją apie darbininkus)
  renderNodes: [],

  // Bazinės aplikacijos būsenos
  baseStatus: {
    male: { file: 'prompts/master_style/base/master_base_male.png', html: false, comfy: false },
    female: { file: 'prompts/master_style/base/master_base_female.png', html: false, comfy: false },
    teen: { file: 'prompts/master_style/base/master_base_teen.png', html: false, comfy: false },
    kid: { file: 'prompts/master_style/base/master_base_kid.png', html: false, comfy: false }
  },

  // UI langų būsenos (nepriklauso nuo projekto)
  editingId: null,
  editingCharId: null,
  viewerContext: 'scene',
  viewerList: [],
  viewerIndex: 0,
  viewerOpen: false,

  // Projektų sistema
  currentProjectId: 'default',
  projects: {
    'default': {
      id: 'default',
      name: 'Main Project',
      lastActiveTab: 'script',
      globals: { w:1920, h:1080, steps:25, cfg:1.0, sampler:'euler', seedMode:'random', fixedSeed:941027876668241, fallbackRef:'', workflowMode:'qwen_2_1', unetName:'qwen_image_2.1_int8_convrot.safetensors', loraName:'none', clipName:'qwen3vl_8b_int8_convrot.safetensors', vaeName:'qwen_image_2.1_vae_bf16.safetensors', charBaseStyle:'default', charSteps:25, charCfg:1.0, charAspectRatio:'tall' },
      refs: [],
      scenes: [],
      sceneTextById: {},
      outputs: [],
      charRefs: {},
      timeline: [],
      alignedData: null,
      kineticScenes: [],
      defaultKineticStyle: null,
      lastActiveKineticSceneId: null
    }
  }
};

// IŠMANUSIS PROXY: Reaguoja į reikšmių pasikeitimus (pvz., atėjus naujam sąrašui iš WebSockets)
const stateHandler = {
    set(target, prop, value) {
        target[prop] = value;
        // Jeigu Python serveris atsiuntė atnaujintą GPU (Nodes) sąrašą, iškart liepiame perpiešti Valdymo Centrą
        if (prop === 'renderNodes' && typeof window.updateSystemNodesUI === 'function') {
            window.updateSystemNodesUI();
        }
        return true;
    }
};

// Sukuriame globalų objektą 'state', apgaubtą proxy
const state = new Proxy(rawState, stateHandler);
window.state = state;

// ============================================================================
// 3. UTILS & HELPER FUNCTIONS
// ============================================================================

// Pagrindinė funkcija, skirta gauti aktyvaus projekto duomenis
window.getProj = function() {
    if (!state.projects[state.currentProjectId]) {
        state.projects[state.currentProjectId] = {
            id: state.currentProjectId,
            name: 'New Project',
            lastActiveTab: 'script',
            globals: { w:1920, h:1080, steps:25, cfg:1.0, sampler:'euler', seedMode:'random', fixedSeed:941027876668241, fallbackRef:'', workflowMode:'qwen_2_1', unetName:'qwen_image_2.1_int8_convrot.safetensors', loraName:'none', clipName:'qwen3vl_8b_int8_convrot.safetensors', vaeName:'qwen_image_2.1_vae_bf16.safetensors', charBaseStyle:'default', charSteps:25, charCfg:1.0, charAspectRatio:'tall' },
            refs: [], scenes: [], sceneTextById: {}, outputs: [], charRefs: {}, timeline: [], alignedData: null,
            kineticScenes: [], defaultKineticStyle: null, lastActiveKineticSceneId: null
        };
    }
    return state.projects[state.currentProjectId];
};

window.$ = (sel) => document.querySelector(sel);
window.$$ = (sel) => Array.from(document.querySelectorAll(sel));
window.escapeHtml = (s) => String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
window.rId = () => Math.random().toString(36).slice(2,9);
window.nowIso = () => new Date().toISOString().replace("T"," ").slice(0,19);

const $ = window.$;
const $$ = window.$$;
const escapeHtml = window.escapeHtml;
const rId = window.rId;
const nowIso = window.nowIso;

// Toast pranešimų talpykla pasikartojimų filtravimui
let _recentToasts = new Map();

// Toast funkcija, leidžianti grupuoti pranešimus pagal ID ir ribojanti ekrano užteršimą (max 3)
function toast(title, sub="", type="info", id=null) {
  const subText = sub ? String(sub) : '';
  const toastKey = `${title}|${subText}|${type}`;
  const now = Date.now();

  // Deduplikacija: jei tas pats pranešimas gautas greičiau nei per 800ms, atnaujiname esamą
  if (!id && _recentToasts.has(toastKey)) {
      const prevEl = _recentToasts.get(toastKey);
      if (prevEl && prevEl.isConnected) {
          clearTimeout(parseInt(prevEl.dataset.tid));
          prevEl.style.animation = 'none';
          prevEl.offsetHeight;
          prevEl.style.animation = 'slideUp .2s ease-out';
          const timeout = type === 'error' ? 6000 : 2500;
          prevEl.dataset.tid = setTimeout(() => { 
              if (prevEl.isConnected) prevEl.remove();
              _recentToasts.delete(toastKey);
          }, timeout);
          return;
      }
  }

  let el = id ? document.getElementById(`toast-${id}`) : null;
  let isNew = false;
  
  if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      if (id) el.id = `toast-${id}`;
      isNew = true;
  }

  const isLong = subText.length > 140;
  const shortSub = isLong ? subText.slice(0, 140) + '…' : subText;
  el.innerHTML = `<div class="t" style="color:${type==='error'?'var(--bad)':type==='success'?'var(--good)':'var(--text)'}">${escapeHtml(title)}</div>${subText?`<div class="s" title="${escapeHtml(subText)}" style="max-height:120px; overflow-y:auto;">${escapeHtml(shortSub)}</div>`:''}`;

  const toastsContainer = document.querySelector("#toasts");
  if (toastsContainer) {
      if (isNew) {
          // Ribojame iki daugiausiai 3 pranešimų vienu metu
          const currentToasts = toastsContainer.querySelectorAll(".toast");
          if (currentToasts.length >= 3) {
              for (let i = 0; i <= currentToasts.length - 3; i++) {
                  currentToasts[i].remove();
              }
          }
          toastsContainer.appendChild(el);
      } else {
          clearTimeout(parseInt(el.dataset.tid));
          el.style.animation = 'none';
          el.offsetHeight; 
          el.style.animation = 'slideUp .2s ease-out';
      }
  }

  _recentToasts.set(toastKey, el);
  const timeout = type === 'error' ? 6000 : 2800;
  el.dataset.tid = setTimeout(() => { 
      if (el.isConnected) el.remove(); 
      _recentToasts.delete(toastKey);
  }, timeout);
}

function mockImage(label, seed, mode) {
  const a=(seed*11+49)%360, b=(seed*7+12)%100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="100%" height="100%" fill="hsl(${a} 60% ${b}%)"/><text x="40" y="360" font-family="sans-serif" font-size="80" fill="#fff" font-weight="bold">${escapeHtml(label)}</text><text x="40" y="420" font-family="sans-serif" font-size="30" fill="#fff">Mode: ${mode} | Seed: ${seed}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function mockPortraitImage(label, seed, mode) {
  const a=(seed*11+49)%360, b=(seed*7+12)%100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="672" height="1568"><rect width="100%" height="100%" fill="hsl(${a} 60% ${b}%)"/><text x="20" y="784" font-family="sans-serif" font-size="50" fill="#fff" font-weight="bold">${escapeHtml(label)}</text><text x="20" y="840" font-family="sans-serif" font-size="20" fill="#fff">Mode: ${mode} | Seed: ${seed}</text></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// PATAISYTA VAULT LOGIKA: Hover Preview palaiko ir nuotraukas, ir vaizdo įrašus (.mp4)
window.showPreviewHover = function(e, val) {
    const pb = $("#hoverPreview"); 
    const pi = $("#hoverImg");
    const pv = $("#hoverVideo");
    if(val && pb) {
        const fullUrl = (val.startsWith('/') || val.startsWith('http') || val.startsWith('data:'))
            ? val 
            : ((val === 'empty_scene.png') ? `/base/${val}` : `/vault/${val}`);
        
        const isVid = fullUrl.toLowerCase().endsWith('.mp4') || fullUrl.toLowerCase().endsWith('.webm');
        if (isVid && pv) {
            if (pi) pi.style.display = 'none';
            pv.style.display = 'block';
            pv.muted = true;
            if (pv.src !== fullUrl) pv.src = fullUrl;
            pv.play().catch(()=>{});
        } else {
            if (pv) {
                pv.pause();
                pv.src = '';
                pv.style.display = 'none';
            }
            if (pi) {
                pi.style.display = 'block';
                pi.src = fullUrl;
            }
        }
        
        pb.style.display = 'block';
        let x = e.clientX + 20, y = e.clientY + 20;
        if(x + 420 > window.innerWidth) x = e.clientX - 440;
        if(y + 320 > window.innerHeight) y = window.innerHeight - 340;
        pb.style.left = `${Math.max(10, x)}px`; 
        pb.style.top = `${Math.max(10, y)}px`;
    } else if (pb) { 
        pb.style.display = 'none'; 
    }
};

window.movePreviewHover = function(e) {
    const pb = $("#hoverPreview");
    if(pb && pb.style.display === 'block') {
        let x = e.clientX + 20, y = e.clientY + 20;
        if(x + 420 > window.innerWidth) x = e.clientX - 440;
        if(y + 320 > window.innerHeight) y = window.innerHeight - 340;
        pb.style.left = `${Math.max(10, x)}px`; 
        pb.style.top = `${Math.max(10, y)}px`;
    }
};

window.hidePreviewHover = function() { 
    const pb = $("#hoverPreview");
    const pv = $("#hoverVideo");
    if (pv) {
        pv.pause();
        pv.src = '';
    }
    if(pb) pb.style.display = 'none'; 
};