import urllib.parse

import os

import math

import re

import zipfile

import glob

import subprocess

import json

import shutil

import tempfile

import uuid

import hashlib

import gc

from fastapi import APIRouter, Request

from fastapi.responses import JSONResponse

from config import DATA_DIR, VAULT_DIR, AUDIO_DIR, BGM_DIR



router = APIRouter(prefix="/api/render", tags=["render"])



RENDERS_DIR = os.path.join(DATA_DIR, "renders")

KINETIC_CACHE_DIR = os.path.join(DATA_DIR, "cache", "kinetic")

PADDED_CACHE_DIR = os.path.join(DATA_DIR, "cache", "padded_clips")

SEGMENTS_CACHE_DIR = os.path.join(DATA_DIR, "cache", "segments")

WHISPER_SUBS_CACHE_DIR = os.path.join(DATA_DIR, "cache", "whisper_subs")

os.makedirs(RENDERS_DIR, exist_ok=True)

os.makedirs(KINETIC_CACHE_DIR, exist_ok=True)

os.makedirs(PADDED_CACHE_DIR, exist_ok=True)

os.makedirs(SEGMENTS_CACHE_DIR, exist_ok=True)

os.makedirs(WHISPER_SUBS_CACHE_DIR, exist_ok=True)



def normalize_sc_id(val):

    if val is None:

        return ""

    s = str(val).upper().strip()

    for prefix in ["SCENE_", "SCENE", "KSC_", "KSC", "SC_", "SC"]:

        if s.startswith(prefix):

            s = s[len(prefix):]

    if s.startswith("S") and len(s) > 1 and s[1:].isdigit():

        s = s[1:]

    return s



def resolve_file_path(url_or_path):

    if not url_or_path:

        return None

    url_or_path = str(url_or_path).strip()

    if os.path.isabs(url_or_path) and os.path.exists(url_or_path):

        return url_or_path

    

    clean = url_or_path.split('?')[0].split('#')[0]

    if clean.startswith('/bgm/'):

        rel = urllib.parse.unquote(clean[5:].lstrip('/\\'))

        bgm_cand = os.path.join(BGM_DIR, rel)

        if os.path.exists(bgm_cand):

            return bgm_cand



    filename = os.path.basename(clean)

    

    for d in [BGM_DIR, VAULT_DIR, AUDIO_DIR, DATA_DIR, os.path.join(DATA_DIR, "voices")]:

        candidate = os.path.join(d, filename)

        if os.path.exists(candidate):

            return candidate



    for root, dirs, files in os.walk(BGM_DIR):

        if filename in files:

            return os.path.join(root, filename)

        

    return None



class SceneVideoSource:

    """

    Srautinis/tingusis (lazy) video kadrų šaltinis scenų renderinimui.

    Neapkrauna RAM atminties: kadrus krauna tik kai scena aktyvi,

    optimizuoja mastelį (scale) ir atlaisvina atmintį baigus sceną.

    """

    def __init__(self, path: str, target_w: int, target_h: int, max_frames: int = 120, flip_h: bool = False, slowdown_if_short: bool = True, trim_start: float = 0.0, trim_end: float = 0.0):

        self.path = path

        self.target_w = target_w

        self.target_h = target_h

        self.max_frames = max_frames

        self.flip_h = flip_h

        self.slowdown_if_short = slowdown_if_short

        self.trim_start = max(0.0, float(trim_start or 0.0))

        self.trim_end = max(0.0, float(trim_end or 0.0))

        self.frames = None

        self._first_frame = None



    def get_first_frame(self):

        if self._first_frame is not None:

            return self._first_frame

        if self.frames and len(self.frames) > 0:

            return self.frames[0]

        v_cap = cv2.VideoCapture(self.path)

        if v_cap.isOpened():

            if self.trim_start > 0:

                fps = v_cap.get(cv2.CAP_PROP_FPS) or 24.0

                start_frame = int(round(self.trim_start * fps))

                v_cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

            ret, frame = v_cap.read()

            v_cap.release()

            if ret and frame is not None:

                rgb_f = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                vh, vw = rgb_f.shape[:2]

                if vw != self.target_w or vh != self.target_h:

                    sf = max(self.target_w / vw, self.target_h / vh)

                    rnw = max(self.target_w, int(round(vw * sf)))

                    rnh = max(self.target_h, int(round(vh * sf)))

                    interp = cv2.INTER_AREA if sf < 1.0 else cv2.INTER_LINEAR

                    r_sc = cv2.resize(rgb_f, (rnw, rnh), interpolation=interp)

                    rx_off = max(0, (rnw - self.target_w) // 2)

                    ry_off = max(0, (rnh - self.target_h) // 2)

                    res = r_sc[ry_off:ry_off + self.target_h, rx_off:rx_off + self.target_w]

                else:

                    res = rgb_f

                if self.flip_h:

                    res = cv2.flip(res, 1)

                self._first_frame = res

                return res

        return np.zeros((self.target_h, self.target_w, 3), dtype=np.uint8)



    def load_frames(self):

        if self.frames is not None:

            return self.frames

        raw = []

        v_cap = cv2.VideoCapture(self.path)

        if v_cap.isOpened():

            fps = v_cap.get(cv2.CAP_PROP_FPS) or 24.0

            start_frame = int(round(self.trim_start * fps)) if self.trim_start > 0 else 0

            end_frame = int(round(self.trim_end * fps)) if (self.trim_end > self.trim_start and self.trim_end > 0) else None



            if start_frame > 0:

                v_cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)



            curr_frame = start_frame

            while len(raw) < self.max_frames:

                if end_frame is not None and curr_frame >= end_frame:

                    break

                ret, frame = v_cap.read()

                if not ret or frame is None:

                    break

                curr_frame += 1

                rgb_f = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                vh, vw = rgb_f.shape[:2]

                if vw != self.target_w or vh != self.target_h:

                    sf = max(self.target_w / vw, self.target_h / vh)

                    rnw = max(self.target_w, int(round(vw * sf)))

                    rnh = max(self.target_h, int(round(vh * sf)))

                    interp = cv2.INTER_AREA if sf < 1.0 else cv2.INTER_LINEAR

                    r_sc = cv2.resize(rgb_f, (rnw, rnh), interpolation=interp)

                    rx_off = max(0, (rnw - self.target_w) // 2)

                    ry_off = max(0, (rnh - self.target_h) // 2)

                    cropped = r_sc[ry_off:ry_off + self.target_h, rx_off:rx_off + self.target_w]

                else:

                    cropped = rgb_f

                if self.flip_h:

                    cropped = cv2.flip(cropped, 1)

                raw.append(cropped)

            v_cap.release()

        if not raw:

            raw = [self.get_first_frame()]

        self.frames = raw

        if self._first_frame is None and raw:

            self._first_frame = raw[0]

        return self.frames



    def get_frame(self, idx: int, total_needed: int = 0):

        f = self.load_frames()

        if not f:

            return self.get_first_frame()

        if self.slowdown_if_short and total_needed > len(f) and len(f) > 1:

            # Sklandus video ištempimas/sulėtinimas per visą scenos trukmę ir buferį

            if idx < total_needed:

                stretched_idx = int(idx * (len(f) / float(total_needed)))

                return f[min(len(f) - 1, max(0, stretched_idx))]

            else:

                # Švelnus judesio tęstinumas pabaigoje, kad vaizdas niekada neužšaltų

                over = idx - total_needed

                offset = over % (len(f) * 2)

                p_idx = len(f) - 1 - offset if offset < len(f) else offset - len(f)

                return f[min(len(f) - 1, max(0, p_idx))]

        return f[idx % len(f)]



    def release(self):

        if self.frames is not None:

            del self.frames

            self.frames = None

            gc.collect()



def hex_to_rgb(hex_str, default=(0, 0, 0)):

    if not hex_str or not isinstance(hex_str, str):

        return default

    hex_str = hex_str.lstrip('#')

    if len(hex_str) == 6:

        try:

            return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

        except Exception:

            pass

    return default



def create_styled_text_slide(sc_id, text1, text2, output_png_path, bg_color="#000000", text_color="#ffffff", width=1920, height=1080):

    try:

        from PIL import Image, ImageDraw, ImageFont

        bg_rgb = hex_to_rgb(bg_color, (0, 0, 0))

        text_rgb = hex_to_rgb(text_color, (255, 255, 255))

        

        img = Image.new('RGB', (width, height), color=bg_rgb)

        draw = ImageDraw.Draw(img)

        

        t1 = (text1 or f"SCENE {sc_id}").upper().strip()

        t2 = (text2 or "").upper().strip()

        

        font_large = None

        font_small = None

        font_names = ["impact.ttf", "arialbd.ttf", "arial.ttf", "segoui.ttf", "courbd.ttf"]

        for fn in font_names:

            try:

                font_large = ImageFont.truetype(fn, 72)

                font_small = ImageFont.truetype(fn, 48)

                break

            except Exception:

                pass



        cx = width // 2

        cy = height // 2

        

        if font_large:

            bbox1 = draw.textbbox((0, 0), t1, font=font_large)

            w1 = bbox1[2] - bbox1[0]

            h1 = bbox1[3] - bbox1[1]

            

            w2, h2 = 0, 0

            if t2:

                bbox2 = draw.textbbox((0, 0), t2, font=font_small)

                w2 = bbox2[2] - bbox2[0]

                h2 = bbox2[3] - bbox2[1]

                

            total_h = h1 + (h2 + 35 if t2 else 0)

            start_y = cy - (total_h // 2)

            

            draw.text((cx - (w1 // 2), start_y), t1, fill=text_rgb, font=font_large)

            if t2:

                draw.text((cx - (w2 // 2), start_y + h1 + 35), t2, fill=text_rgb, font=font_small)

        else:

            draw.text((cx - 250, cy - 40), t1, fill=text_rgb)

            if t2:

                draw.text((cx - 250, cy + 20), t2, fill=text_rgb)

            

        img.save(output_png_path)

        return output_png_path

    except Exception as e:

        print(f"PIL slide creation error: {e}")

        return None



import cv2

import numpy as np

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from moviepy.editor import VideoClip, VideoFileClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips



def apply_subpixel_affine_zoom(base_image, total_zoom, pan_x_pct=0.0, pan_y_pct=0.0, target_w=1920, target_h=1080):

    """

    True 64-bit Floating-Point Subpixel Affine Lanczos Matrix Transformation.

    - Operates on exact continuous floating-point coordinates (target_w/2.0, target_h/2.0).

    - 0.00% discrete pixel stair-stepping, jumping, or vibration.

    - Interpolates with cv2.INTER_LANCZOS4 (8-tap sinc) and BORDER_REFLECT_101.

    """

    cx = float(target_w) / 2.0

    cy = float(target_h) / 2.0

    

    M = cv2.getRotationMatrix2D((cx, cy), 0.0, float(total_zoom))

    

    if pan_x_pct != 0.0:

        M[0, 2] += float(pan_x_pct) * float(target_w)

    if pan_y_pct != 0.0:

        M[1, 2] += float(pan_y_pct) * float(target_h)

        

    return cv2.warpAffine(

        base_image,

        M,

        (target_w, target_h),

        flags=cv2.INTER_LANCZOS4,

        borderMode=cv2.BORDER_REFLECT_101

    )



def crop_with_reflected_borders(base_image, cx, cy, w_crop, h_crop, target_w, target_h):

    """Legacy wrapper redirecting to subpixel affine matrix zoom."""

    zoom_est = target_w / max(1, w_crop)

    return apply_subpixel_affine_zoom(base_image, zoom_est, 0.0, 0.0, target_w, target_h)



def apply_color_grading_np(frame, color_filter):

    """Applies film color grading on RGB numpy frames without FFmpeg filter overhead."""

    if not color_filter or color_filter in ["none", "normal"]:

        return frame

    

    cf = str(color_filter).lower().replace("_", "").replace("-", "")

    f = frame.astype(np.float32)

    

    if "warm" in cf or "gold" in cf or "sunset" in cf:

        f[:, :, 0] = np.clip(f[:, :, 0] * 1.10 + 10, 0, 255)

        f[:, :, 1] = np.clip(f[:, :, 1] * 1.02 + 2, 0, 255)

        f[:, :, 2] = np.clip(f[:, :, 2] * 0.88 - 8, 0, 255)

    elif "cool" in cf or "teal" in cf or "cold" in cf:

        f[:, :, 0] = np.clip(f[:, :, 0] * 0.88 - 8, 0, 255)

        f[:, :, 1] = np.clip(f[:, :, 1] * 1.02 + 2, 0, 255)

        f[:, :, 2] = np.clip(f[:, :, 2] * 1.12 + 12, 0, 255)

    elif "cyberpunk" in cf or "neon" in cf:

        f = (f - 128) * 1.20 + 128

        f[:, :, 0] = np.clip(f[:, :, 0] * 1.12 + 12, 0, 255)

        f[:, :, 2] = np.clip(f[:, :, 2] * 1.18 + 18, 0, 255)

    elif "matrix" in cf:

        f[:, :, 0] = np.clip(f[:, :, 0] * 0.75, 0, 255)

        f[:, :, 1] = np.clip(f[:, :, 1] * 1.25 + 15, 0, 255)

        f[:, :, 2] = np.clip(f[:, :, 2] * 0.75, 0, 255)

    elif "bw" in cf or "monochrome" in cf or "noir" in cf:

        gray = 0.299 * f[:, :, 0] + 0.587 * f[:, :, 1] + 0.114 * f[:, :, 2]

        gray = (gray - 128) * 1.25 + 128

        gray = np.clip(gray, 0, 255)

        f[:, :, 0] = gray

        f[:, :, 1] = gray

        f[:, :, 2] = gray

    elif "vintage" in cf or "retro" in cf or "film" in cf:

        f[:, :, 0] = np.clip(f[:, :, 0] * 1.08 + 16, 0, 255)

        f[:, :, 1] = np.clip(f[:, :, 1] * 0.98 + 4, 0, 255)

        f[:, :, 2] = np.clip(f[:, :, 2] * 0.82 - 12, 0, 255)

    elif "contrast" in cf or "vivid" in cf or "hdr" in cf:

        f = (f - 128) * 1.28 + 128

        

    return np.clip(f, 0, 255).astype(np.uint8)



def draw_kinetic_text_pillow(frame, ks, t, dur, w, h):

    """

    Renders the exact kinetic typography effect configured in Text Writer Effects.

    Supports all 12+ built-in presets and custom configurations:

    - wiggly_sketch, stopmotion_sketch, cia_intro, vhs_glitch, typewriter, neon_glow,

      matrix, scary_shake, blueprint_sketch, synthwave_grid, comic_pop, gold_sparkle.

    """

    if not ks:

        return frame

    if ks.get("hideText") or ks.get("kineticHideText"):

        return frame

        

    raw_t1 = str(ks.get("text1") or "").strip()

    raw_t2 = str(ks.get("text2") or "").strip()

    if not raw_t1 and not raw_t2:

        return frame

        

    text_case = str(ks.get("textCase") or "uppercase").lower()

    def apply_case(txt):

        if not txt: return ""

        if text_case == "uppercase": return txt.upper()

        if text_case == "lowercase": return txt.lower()

        if text_case == "titlecase": return txt.title()

        return txt



    t1 = apply_case(raw_t1)

    t2 = apply_case(raw_t2)



    effect = str(ks.get("effect") or "typewriter").lower().strip()

    text_color = ks.get("textColor") or "#ffffff"

    bg_color = ks.get("bgColor") or "#000000"

    speed = float(ks.get("speed") or 1.0)

    intensity = float(ks.get("intensity") or 20.0)

    text_align = str(ks.get("textAlign") or "center").lower()

    

    pil_img = Image.fromarray(frame)

    scale = h / 720.0



    size1 = max(16, int(float(ks.get("size1") or 65) * scale))

    title_ratio = float(ks.get("titleRatio") or 1.5)

    size2 = max(12, int(float(ks.get("size2") or (size1 / title_ratio)) * scale))

    line_gap = int(float(ks.get("lineGap") or 45) * scale)



    # Font resolution

    font_family = str(ks.get("font") or "Impact").lower()

    font_large = None

    font_small = None

    

    font_candidates = ["impact.ttf", "arialbd.ttf", "arial.ttf", "segoui.ttf", "courbd.ttf"]

    if "courier" in font_family or "mono" in font_family:

        font_candidates = ["courbd.ttf", "cour.ttf", "consola.ttf", "arialbd.ttf"]

    elif "marker" in font_family or "permanent" in font_family or "sketch" in effect:

        font_candidates = ["impact.ttf", "arialbd.ttf", "segoui.ttf"]



    for fn in font_candidates:

        try:

            font_large = ImageFont.truetype(fn, size1)

            font_small = ImageFont.truetype(fn, size2)

            break

        except:

            pass

    if not font_large:

        font_large = ImageFont.load_default()

        font_small = font_large



    cx = w // 2

    cy = h // 2

    time_factor = t * speed * 3.0

    txt_rgb = hex_to_rgb(text_color, (255, 255, 255))



    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    draw = ImageDraw.Draw(overlay)



    # 1. TYPEWRITER EFFECT

    if effect == "typewriter":

        combined = t1 + ("  " + t2 if t2 else "")

        chars_to_show = int(t * speed * 16.0)

        

        if chars_to_show >= len(combined):

            show_t1 = t1

            show_t2 = t2

        elif chars_to_show >= len(t1):

            show_t1 = t1

            show_t2 = t2[:max(0, chars_to_show - len(t1) - 2)] if t2 else ""

        else:

            show_t1 = t1[:chars_to_show] if chars_to_show > 0 else ""

            show_t2 = ""



        bbox1 = draw.textbbox((0, 0), show_t1, font=font_large) if show_t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), show_t2, font=font_small) if show_t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        y1 = (cy - line_gap) if t2 else cy

        y2 = cy + line_gap



        if show_t1:

            draw.text((cx - w1 // 2 + 2, y1 - h1 // 2 + 2), show_t1, font=font_large, fill=(0, 0, 0, 220))

            draw.text((cx - w1 // 2, y1 - h1 // 2), show_t1, font=font_large, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))

        if show_t2:

            draw.text((cx - w2 // 2 + 2, y2 - h2 // 2 + 2), show_t2, font=font_small, fill=(0, 0, 0, 220))

            draw.text((cx - w2 // 2, y2 - h2 // 2), show_t2, font=font_small, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))



        if show_t1 and int(t * 4) % 2 == 0 and (chars_to_show < len(combined) + 5):

            cur_y = y2 if show_t2 else y1

            cur_w = (w2 if show_t2 else w1) // 2

            cur_h = (h2 if show_t2 else h1) // 2

            draw.text((cx + cur_w + 6, cur_y - cur_h), "|", font=font_large if not show_t2 else font_small, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))



    # 2. WIGGLY SKETCH / STOPMOTION SKETCH

    elif effect in ["wiggly_sketch", "stopmotion_sketch"]:

        boil_step = int(t * 12.0)

        bbox1 = draw.textbbox((0, 0), t1, font=font_large) if t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), t2, font=font_small) if t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        for line_idx, (txt, font, cur_w, cur_h, base_y) in enumerate([(t1, font_large, w1, h1, cy - line_gap), (t2, font_small, w2, h2, cy + line_gap)]):

            if not txt: continue

            for pass_idx in range(3):

                jx = int(np.sin(boil_step * 23 + pass_idx * 7 + line_idx * 11) * (intensity * 0.12 * scale))

                jy = int(np.cos(boil_step * 29 + pass_idx * 13 + line_idx * 17) * (intensity * 0.12 * scale))

                alpha_val = 220 if pass_idx == 0 else 120

                draw.text((cx - cur_w // 2 + jx, base_y - cur_h // 2 + jy), txt, font=font, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], alpha_val))



    # 3. CIA INTRO (Classified Zoom Wave)

    elif effect == "cia_intro":

        shake_x = int(np.sin(t * 20.0) * (intensity * 0.08 * scale))

        shake_y = int(np.cos(t * 18.0) * (intensity * 0.08 * scale))



        num_chars1 = int(len(t1) * min(1.0, t * speed / max(0.1, dur * 0.6)))

        disp1 = t1[:num_chars1]

        disp2 = t2[:int(len(t2) * min(1.0, max(0.0, (t - dur * 0.2) * speed / max(0.1, dur * 0.5))))] if t2 else ""



        bbox1 = draw.textbbox((0, 0), disp1, font=font_large) if disp1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), disp2, font=font_small) if disp2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        if disp1:

            draw.text((cx - w1 // 2 + shake_x + 2, cy - line_gap - h1 // 2 + shake_y + 2), disp1, font=font_large, fill=(0, 0, 0, 240))

            draw.text((cx - w1 // 2 + shake_x, cy - line_gap - h1 // 2 + shake_y), disp1, font=font_large, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))

        if disp2:

            draw.text((cx - w2 // 2 + shake_x + 2, cy + line_gap - h2 // 2 + shake_y + 2), disp2, font=font_small, fill=(0, 0, 0, 240))

            draw.text((cx - w2 // 2 + shake_x, cy + line_gap - h2 // 2 + shake_y), disp2, font=font_small, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))



    # 4. VHS GLITCH (RGB Split)

    elif effect == "vhs_glitch":

        pseudo_rand = np.sin(t * 85.0)

        glitch = int(pseudo_rand * intensity * 0.4 * scale) if abs(pseudo_rand) > 0.75 else 0



        bbox1 = draw.textbbox((0, 0), t1, font=font_large) if t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), t2, font=font_small) if t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        if t1:

            draw.text((cx - w1 // 2 - glitch - 3, cy - line_gap - h1 // 2), t1, font=font_large, fill=(255, 0, 100, 180))

            draw.text((cx - w1 // 2 + glitch + 3, cy - line_gap - h1 // 2), t1, font=font_large, fill=(0, 255, 255, 180))

            draw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=(255, 255, 255, 255))

        if t2:

            draw.text((cx - w2 // 2 + glitch + 3, cy + line_gap - h2 // 2), t2, font=font_small, fill=(255, 0, 100, 180))

            draw.text((cx - w2 // 2 - glitch - 3, cy + line_gap - h2 // 2), t2, font=font_small, fill=(0, 255, 255, 180))

            draw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(255, 255, 255, 255))



    # 5. NEON GLOW / CYBERPUNK / SYNTHWAVE

    elif effect in ["neon_glow", "cyberpunk", "synthwave_grid"]:

        glow_rad = max(4, int((intensity * 0.4 + np.sin(time_factor * 2.0) * (intensity * 0.2)) * scale))

        glow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))

        gdraw = ImageDraw.Draw(glow_layer)



        bbox1 = draw.textbbox((0, 0), t1, font=font_large) if t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), t2, font=font_small) if t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        glow_col = (0, 240, 255, 255) if effect == "neon_glow" else (255, 0, 170, 255)

        if t1:

            gdraw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=glow_col)

            draw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=(255, 255, 255, 255))

        if t2:

            gdraw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(0, 255, 200, 255))

            draw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(255, 255, 255, 255))

        

        glow_blur = glow_layer.filter(ImageFilter.GaussianBlur(radius=glow_rad))

        overlay = Image.alpha_composite(overlay, glow_blur)



    # 6. MATRIX / GREEN PHOSPHOR

    elif effect == "matrix":

        bbox1 = draw.textbbox((0, 0), t1, font=font_large) if t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), t2, font=font_small) if t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        glow_layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))

        gdraw = ImageDraw.Draw(glow_layer)

        if t1: gdraw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=(0, 255, 100, 255))

        if t2: gdraw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(0, 255, 100, 255))

        glow_blur = glow_layer.filter(ImageFilter.GaussianBlur(radius=6))

        overlay = Image.alpha_composite(overlay, glow_blur)



        if t1: draw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=(220, 255, 220, 255))

        if t2: draw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(220, 255, 220, 255))



    # 7. DEFAULT / CLEAN TWO LINES

    else:

        bbox1 = draw.textbbox((0, 0), t1, font=font_large) if t1 else (0,0,0,0)

        w1, h1 = bbox1[2] - bbox1[0], bbox1[3] - bbox1[1]

        bbox2 = draw.textbbox((0, 0), t2, font=font_small) if t2 else (0,0,0,0)

        w2, h2 = bbox2[2] - bbox2[0], bbox2[3] - bbox2[1]



        if t1:

            draw.text((cx - w1 // 2 + 2, cy - line_gap - h1 // 2 + 2), t1, font=font_large, fill=(0, 0, 0, 220))

            draw.text((cx - w1 // 2, cy - line_gap - h1 // 2), t1, font=font_large, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))

        if t2:

            draw.text((cx - w2 // 2 + 2, cy + line_gap - h2 // 2 + 2), t2, font=font_small, fill=(0, 0, 0, 220))

            draw.text((cx - w2 // 2, cy + line_gap - h2 // 2), t2, font=font_small, fill=(txt_rgb[0], txt_rgb[1], txt_rgb[2], 255))



    # Entrance transition easing (fade_in, slide_up, pop_zoom, none)

    entrance = str(ks.get("entrance") or "fade_in").lower().strip()

    enter_t = min(1.0, max(0.0, float(t) / 0.6))

    if enter_t < 1.0 and entrance != "none":

        try:

            if entrance == "fade_in":

                r, g, b, a = overlay.split()

                a = a.point(lambda p: int(p * enter_t))

                overlay = Image.merge("RGBA", (r, g, b, a))

            elif entrance == "slide_up":

                ease = np.sin(enter_t * np.pi / 2.0)

                offset_y = int((1.0 - ease) * 50 * scale)

                r, g, b, a = overlay.split()

                a = a.point(lambda p: int(p * enter_t))

                overlay = Image.merge("RGBA", (r, g, b, a))

                shifted = Image.new("RGBA", (w, h), (0, 0, 0, 0))

                shifted.paste(overlay, (0, -offset_y), overlay)

                overlay = shifted

            elif entrance == "pop_zoom":

                ease = np.sin(enter_t * np.pi / 2.0)

                zoom = 0.6 + 0.4 * ease

                zw, zh = max(1, int(w * zoom)), max(1, int(h * zoom))

                resized = overlay.resize((zw, zh), Image.Resampling.BILINEAR)

                r, g, b, a = resized.split()

                a = a.point(lambda p: int(p * min(1.0, enter_t * 1.5)))

                resized = Image.merge("RGBA", (r, g, b, a))

                pop_overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))

                paste_x = (w - zw) // 2

                paste_y = (h - zh) // 2

                pop_overlay.paste(resized, (paste_x, paste_y), resized)

                overlay = pop_overlay

        except Exception as e_err:

            pass



    try:

        rgba_img = pil_img.convert("RGBA")

        composited = Image.alpha_composite(rgba_img, overlay).convert("RGB")

        return np.array(composited)

    except Exception as e:

        print(f"Kinetic text render warning: {e}")

        return frame

# ============================================================================

# 🎯 FASTER-WHISPER WORD-LEVEL TIKTOK SUBTITLE GENERATOR (.ASS & FFMPEG)

# ============================================================================



def transcribe_audio_words_cached(audio_path: str) -> list[dict]:

    """

    Transcribes audio file with Faster-Whisper, returning word-level timestamps.

    Caches results on disk using audio file path, mtime, and size to avoid redundant transcriptions.

    """

    if not audio_path or not os.path.exists(audio_path):

        return []

    

    try:

        mtime = os.path.getmtime(audio_path)

        fsize = os.path.getsize(audio_path)

        cache_key = hashlib.md5(f"{os.path.abspath(audio_path)}_{mtime}_{fsize}".encode()).hexdigest()

        cache_file = os.path.join(WHISPER_SUBS_CACHE_DIR, f"{cache_key}.json")

        

        if os.path.exists(cache_file):

            try:

                with open(cache_file, "r", encoding="utf-8") as f:

                    data = json.load(f)

                    if isinstance(data, list) and len(data) > 0:

                        return data

            except Exception:

                pass

                

        from faster_whisper import WhisperModel

        # CPU int8 is ultra-stable, fast (<6s for full 60s script), and needs no cublas DLL dependencies

        model = WhisperModel("base", device="cpu", compute_type="int8")

        segs, info = model.transcribe(audio_path, word_timestamps=True, vad_filter=True)

        raw_words = []

        for s in segs:

            if s.words:

                for w in s.words:

                    word_str = w.word.strip()

                    if word_str:

                        raw_words.append({

                            "word": word_str,

                            "start": round(float(w.start), 3),

                            "end": round(float(w.end), 3)

                        })

        if raw_words:

            with open(cache_file, "w", encoding="utf-8") as f:

                json.dump(raw_words, f)

        return raw_words

    except Exception as e:

        print(f"[Whisper Transcribe Error]: {e}")

        return []



def format_ass_time(sec: float) -> str:

    sec = max(0.0, float(sec))

    h = int(sec // 3600)

    m = int(sec % 3600 // 60)

    s = sec % 60

    return f"{h}:{m:02d}:{s:05.2f}"



def generate_tiktok_ass_file(words: list[dict], ass_path: str, mode: str, width: int = 1920, height: int = 1080, exclude_ranges: list = None) -> bool:

    """

    Generates high-energy TikTok / CapCut style .ass subtitle script with word-by-word karaoke highlight.

    Matches user's exact specification & screenshot:

    - Currently spoken word highlighted in bright yellow (or mint green for capcut/green)

    - Upcoming words in crisp white

    - Chunky uppercase typography with thick solid black stroke & shadow

    - Grouped into short 2-3 words chunks with natural speech break timing

    """

    if not words:

        return False

        

    m = str(mode).lower().strip()

    is_green = "green" in m

    is_neon = "neon" in m

    is_box = "box" in m or "pill" in m

    

    # ASS colors in &HAABBGGRR& format:

    # Yellow (RGB 255, 235, 0) -> &H0000EBFF&

    # White (RGB 255, 255, 255) -> &H00FFFFFF&

    # Mint Green (RGB 0, 255, 157) -> &H009DFF00&

    # Neon Cyan (RGB 0, 255, 204) -> &H00CCFF00&

    

    if is_green:

        active_color = "&H009DFF00&"

    elif is_neon:

        active_color = "&H00CCFF00&"

    else:

        active_color = "&H0000FFFF&" # Vibrant Yellow pop

        

    inactive_color = "&H00FFFFFF&" # Crisp White

    

    # Scale typography to aspect ratio & resolution

    if height > width:

        # Vertical video (9:16, e.g. 1080x1920)

        font_size = max(26, int(width * 0.082))

        margin_v = int(height * 0.28)

    else:

        # Horizontal video (16:9, e.g. 1920x1080)

        font_size = max(26, int(height * 0.075))

        margin_v = int(height * 0.20)

        

    outline_size = max(4, int(font_size * 0.13))

    shadow_size = 2

    margin_lr = int(width * 0.05)

    

    border_style = 1 # Outline + Shadow

    back_color = "&H80000000&"

    if is_box:

        border_style = 3 # Opaque Box/Pill

        back_color = "&HB5000000&"

        

    font_name = "Arial Black"

    

    header = f"""[Script Info]

ScriptType: v4.00+

PlayResX: {width}

PlayResY: {height}

ScaledBorderAndShadow: yes

WrapStyle: 0



[V4+ Styles]

Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding

Style: TikTokKaraoke,{font_name},{font_size},{inactive_color},&H00FFFFFF&,&H00000000&,{back_color},1,0,0,0,100,100,0,0,{border_style},{outline_size},{shadow_size},2,{margin_lr},{margin_lr},{margin_v},1



[Events]

Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text

"""



    groups = []

    current_chunk = []

    

    for w in words:

        w_text = w.get("word", "").strip()

        w_start = float(w.get("start", 0.0))

        w_end = float(w.get("end", 0.0))

        

        has_pause = (current_chunk and (w_start - current_chunk[-1]["end"] > 0.50))

        is_chunk_full = (len(current_chunk) >= 2)

        ends_sentence = current_chunk and (current_chunk[-1]["word"].endswith(('.', '!', '?', ',', ';', ':')))

        

        if current_chunk and (has_pause or is_chunk_full or ends_sentence):

            groups.append(current_chunk)

            current_chunk = []

            

        current_chunk.append({"word": w_text, "start": w_start, "end": w_end})

        

    if current_chunk:

        groups.append(current_chunk)

        

    events = []

    for grp in groups:

        tokens = [g["word"].strip().upper().replace("{", "").replace("}", "") for g in grp]

        for idx, active_w in enumerate(grp):

            st = active_w["start"]

            if idx + 1 < len(grp):

                en = grp[idx + 1]["start"]

            else:

                en = active_w["end"]

            if en <= st:

                en = st + 0.35



            if exclude_ranges:

                if any((k_st - 0.05) <= st < (k_en + 0.05) or (k_st - 0.05) < en <= (k_en + 0.05) for k_st, k_en in exclude_ranges):

                    continue

                

            parts = []

            for j, tok in enumerate(tokens):

                if j == idx:

                    parts.append(f"{{\\c{active_color}}}{tok}{{\\c{inactive_color}}}")

                else:

                    parts.append(tok)

            line_text = " ".join(parts)

            events.append(f"Dialogue: 0,{format_ass_time(st)},{format_ass_time(en)},TikTokKaraoke,,0,0,0,,{line_text}")

            

    with open(ass_path, "w", encoding="utf-8") as f:

        f.write(header + "\n".join(events) + "\n")

        

    return True



def draw_subtitle_pillow(frame, text, mode, w, h, t_eff: float = 0.0, d_eff: float = 4.0):

    """

    Burns styled subtitles onto the video frame using Pillow.

    Modes supported:

    - tiktok_karaoke: High-energy TikTok/Reels word-by-word karaoke highlight with vibrant yellow pop.

    - tiktok_green: TikTok/CapCut word-by-word karaoke with mint green active word highlight.

    - tiktok_pill: Rounded dark translucent pill with dynamic word-by-word karaoke.

    - whisper_yellow: High-contrast TikTok/Reels style yellow font with dark stroke and drop shadow.

    - whisper_box: Clean modern white text on semi-transparent dark rounded box.

    - whisper_neon: Neon Cyan/Green caption text with dark contrast outline.

    - kinetic_titles: Elegant modern clean caption.

    """

    if not text or not str(text).strip() or str(mode).lower().strip() in ["none", "", "disabled"]:

        return frame



    clean_text = str(text).strip()

    clean_text = " ".join(clean_text.split())

    if not clean_text:

        return frame



    pil_img = Image.fromarray(frame)

    scale = h / 720.0

    font_size = max(18, int(30 * scale))



    font = None

    font_candidates = ["arialbd.ttf", "impact.ttf", "segoui.ttf", "arial.ttf", "calibrib.ttf"]

    for fn in font_candidates:

        try:

            font = ImageFont.truetype(fn, font_size)

            break

        except Exception:

            pass

    if not font:

        font = ImageFont.load_default()



    max_text_width = int(w * 0.84)

    words = clean_text.split()

    if not words:

        return frame



    # Calculate active word index based on scene elapsed progress

    d_eff = max(0.2, float(d_eff))

    progress = min(0.999, max(0.0, float(t_eff) / d_eff))

    active_word_idx = int(progress * len(words))

    active_word_idx = min(len(words) - 1, max(0, active_word_idx))



    # Line wrapping with global word indexing

    lines = []

    current_line = []

    

    dummy_draw = ImageDraw.Draw(pil_img)

    for idx, word in enumerate(words):

        test_line_words = [w for w, _ in current_line] + [word]

        test_line = " ".join(test_line_words)

        bbox = dummy_draw.textbbox((0, 0), test_line, font=font)

        line_w = bbox[2] - bbox[0]

        if line_w <= max_text_width:

            current_line.append((word, idx))

        else:

            if current_line:

                lines.append(current_line)

                current_line = [(word, idx)]

            else:

                lines.append([(word, idx)])

                current_line = []

    if current_line:

        lines.append(current_line)



    if len(lines) > 3:

        active_line_idx = 0

        for l_idx, l in enumerate(lines):

            if any(w_idx == active_word_idx for _, w_idx in l):

                active_line_idx = l_idx

                break

        start_l = max(0, min(active_line_idx, len(lines) - 3))

        lines = lines[start_l:start_l + 3]



    line_spacing = int(10 * scale)

    total_h = 0

    max_lw = 0

    line_metrics = []



    for l in lines:

        line_str = " ".join([w for w, _ in l])

        bbox = dummy_draw.textbbox((0, 0), line_str, font=font)

        lw = bbox[2] - bbox[0]

        lh = bbox[3] - bbox[1]

        line_metrics.append((l, lw, lh))

        total_h += lh

        if lw > max_lw:

            max_lw = lw

    total_h += (len(lines) - 1) * line_spacing



    bottom_margin = int(52 * scale)

    base_y = h - total_h - bottom_margin

    cx = w // 2



    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    draw = ImageDraw.Draw(overlay)



    m = str(mode).lower().strip()

    is_tiktok = "tiktok" in m

    is_green = "green" in m

    is_pill = "pill" in m or ("box" in m and not is_tiktok)



    # Pill or box background

    if is_pill or "box" in m:

        pad_x = int(22 * scale)

        pad_y = int(12 * scale)

        box_x0 = cx - (max_lw // 2) - pad_x

        box_y0 = base_y - pad_y

        box_x1 = cx + (max_lw // 2) + pad_x

        box_y1 = base_y + total_h + pad_y

        draw.rounded_rectangle([box_x0, box_y0, box_x1, box_y1], radius=int(12 * scale), fill=(0, 0, 0, 195), outline=(255, 255, 255, 35), width=max(1, int(1.5 * scale)))



    curr_y = base_y

    space_bbox = dummy_draw.textbbox((0, 0), " ", font=font)

    space_w = space_bbox[2] - space_bbox[0]



    for line_words, lw, lh in line_metrics:

        if is_tiktok:

            curr_x = cx - (lw // 2)

            for word, w_idx in line_words:

                w_bbox = dummy_draw.textbbox((0, 0), word, font=font)

                this_w = w_bbox[2] - w_bbox[0]



                is_active = (w_idx == active_word_idx)

                if is_active:

                    fill_color = (0, 255, 157, 255) if is_green else (255, 230, 0, 255)

                    stroke_w = max(3, int(4.5 * scale))

                    draw.text((curr_x + 2, curr_y + 2), word, font=font, fill=(0, 0, 0, 230), stroke_width=stroke_w + 1, stroke_fill=(0, 0, 0, 230))

                    draw.text((curr_x, curr_y), word, font=font, fill=fill_color, stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))

                else:

                    stroke_w = max(2, int(3.5 * scale))

                    draw.text((curr_x + 1, curr_y + 1), word, font=font, fill=(0, 0, 0, 200), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 200))

                    draw.text((curr_x, curr_y), word, font=font, fill=(255, 255, 255, 255), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))



                curr_x += this_w + space_w



            curr_y += lh + line_spacing



        elif "yellow" in m:

            stroke_w = max(2, int(3.5 * scale))

            line_str = " ".join([w for w, _ in line_words])

            lx = cx - (lw // 2)

            draw.text((lx + 2, curr_y + 2), line_str, font=font, fill=(0, 0, 0, 220), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 220))

            draw.text((lx, curr_y), line_str, font=font, fill=(255, 225, 0, 255), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))

            curr_y += lh + line_spacing



        elif "neon" in m:

            stroke_w = max(2, int(3 * scale))

            line_str = " ".join([w for w, _ in line_words])

            lx = cx - (lw // 2)

            draw.text((lx + 2, curr_y + 2), line_str, font=font, fill=(0, 0, 0, 230), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))

            draw.text((lx, curr_y), line_str, font=font, fill=(0, 255, 204, 255), stroke_width=stroke_w, stroke_fill=(0, 30, 25, 255))

            curr_y += lh + line_spacing



        elif "box" in m:

            line_str = " ".join([w for w, _ in line_words])

            lx = cx - (lw // 2)

            draw.text((lx, curr_y), line_str, font=font, fill=(255, 255, 255, 255))

            curr_y += lh + line_spacing



        else:

            stroke_w = max(1, int(2 * scale))

            line_str = " ".join([w for w, _ in line_words])

            lx = cx - (lw // 2)

            draw.text((lx + 1, curr_y + 1), line_str, font=font, fill=(0, 0, 0, 200), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 200))

            draw.text((lx, curr_y), line_str, font=font, fill=(255, 255, 255, 255), stroke_width=stroke_w, stroke_fill=(0, 0, 0, 220))

            curr_y += lh + line_spacing



    rgba_img = pil_img.convert("RGBA")

    composited = Image.alpha_composite(rgba_img, overlay).convert("RGB")

    return np.array(composited)



@router.post("/video")

async def render_video_endpoint(request: Request):

    """

    ⚡ PRO MASTER RENDERER:

    - 100% Dead-Center Floating-Point Subpixel Zoom (OpenCV + BORDER_REFLECT_101).

    - True Zero-Noise In-RAM Transitions (Crossfade, Smooth Pull-in, Fade Black/White, Zoom Fade).

    - Strict adherence to Text Writer Effects configurations & uploaded WebM animations.

    - Direct High-Bitrate Master MP4 encoding with MoviePy.

    """

    clips_to_cleanup = []

    try:

        data = await request.json()

        project_id = data.get("projectId", "default")

        resolution = data.get("resolution", "1920x1080")

        fps_codec = data.get("fpsCodec", "30_h264")

        ken_burns = data.get("kenBurnsMode", "cinematic")

        intensity = data.get("kenBurnsIntensity", 15)

        

        timeline = data.get("timeline", [])

        scenes = data.get("scenes", [])

        outputs = data.get("outputs", [])

        audio_track_url = data.get("audioTrack", None)

        scene_text_by_id = data.get("sceneTextById", {})

        kinetic_scenes = data.get("kineticScenes", [])

        scene_volumes = data.get("sceneVolumes") or (data.get("renderSettings") or {}).get("sceneVolumes") or {}
        scene_sfx_by_id = data.get("sceneSfxById") or {}
        if not scene_sfx_by_id and project_id:
            try:
                proj_f = os.path.join(DATA_DIR, "projects", f"{project_id}.json")
                if os.path.exists(proj_f):
                    with open(proj_f, "r", encoding="utf-8") as pf:
                        scene_sfx_by_id = json.load(pf).get("sceneSfxById", {})
            except Exception:
                pass

        voice_source = str(data.get("voiceSource") or (data.get("renderSettings") or {}).get("voiceSource") or "master").lower().strip()
        audio_chunks = data.get("audioChunks") or []
        scene_audio_by_id = data.get("sceneAudioById") or {}
        if not audio_chunks and project_id:
            try:
                proj_f = os.path.join(DATA_DIR, "projects", f"{project_id}.json")
                if os.path.exists(proj_f):
                    with open(proj_f, "r", encoding="utf-8") as pf:
                        _pj = json.load(pf)
                        if not audio_chunks:
                            audio_chunks = _pj.get("audioChunks") or []
                        if not scene_audio_by_id:
                            scene_audio_by_id = _pj.get("sceneAudioById") or {}
            except Exception:
                pass

        audio_chunk_by_sc = {}
        for chunk in (audio_chunks or []):
            sc_ref = str(chunk.get("sceneId") or "")
            if sc_ref:
                audio_chunk_by_sc[sc_ref] = chunk
                audio_chunk_by_sc[normalize_sc_id(sc_ref)] = chunk
                audio_chunk_by_sc[f"s{normalize_sc_id(sc_ref)}"] = chunk
                audio_chunk_by_sc[f"S{normalize_sc_id(sc_ref)}"] = chunk

        if "x" in resolution:

            width_str, height_str = resolution.split("x")

        else:

            width_str, height_str = "1920", "1080"

        width = int(width_str)

        height = int(height_str)



        fps_val = 30

        try:

            fps_part = fps_codec.split("_")[0]

            if fps_part.isdigit():

                fps_val = int(fps_part)

            elif "60" in fps_codec:

                fps_val = 60

            elif "24" in fps_codec:

                fps_val = 24

        except Exception:

            fps_val = 30



        scene_items = []

        if timeline and len(timeline) > 0:

            for item in timeline:

                raw_id = item.get("id", "")

                sc_id = str(raw_id)

                dur = float(item.get("dur") or item.get("duration") or 4.0)

                if dur <= 0:

                    dur = 4.0

                txt = scene_text_by_id.get(sc_id, "") or scene_text_by_id.get(normalize_sc_id(sc_id), "")

                scene_items.append({"id": sc_id, "norm_id": normalize_sc_id(sc_id), "dur": dur, "text": txt})

        elif scenes and len(scenes) > 0:

            for sc in scenes:

                raw_id = sc.get("id", "")

                sc_id = str(raw_id)

                txt = sc.get("text", "") or sc.get("prompt", "")

                scene_items.append({"id": sc_id, "norm_id": normalize_sc_id(sc_id), "dur": 4.0, "text": txt})



        if not scene_items:

            return JSONResponse({"status": "error", "message": "Nėra scenų renderinimui!"})



        scenes_obj_map = {}

        for sc in (scenes or []):

            raw_id = str(sc.get("id", ""))

            norm_id = normalize_sc_id(raw_id)

            scenes_obj_map[norm_id] = sc

            scenes_obj_map[raw_id] = sc



        output_map = {}

        output_obj_map = {}

        for out in outputs:

            raw_id = str(out.get("sceneId", ""))

            norm_id = normalize_sc_id(raw_id)

            output_obj_map[norm_id] = out

            output_obj_map[raw_id] = out

            main_id = out.get("mainId")

            variations = out.get("variations", [])

            chosen_url = None

            if main_id and variations:

                for var in variations:

                    if var.get("id") == main_id:

                        chosen_url = var.get("url") or (var.get("params") or {}).get("video_url")

                        break

            if not chosen_url and variations:

                chosen_url = variations[-1].get("url") or (variations[-1].get("params") or {}).get("video_url")

            

            if not chosen_url:

                chosen_url = (out.get("params") or {}).get("video_url") or out.get("video_url")



            # Fallback to scene object if not found in output

            if not chosen_url:

                sc_match = scenes_obj_map.get(norm_id) or scenes_obj_map.get(raw_id) or {}

                chosen_url = sc_match.get("video_url") or (sc_match.get("params") or {}).get("video_url")



            if chosen_url:

                local_p = resolve_file_path(chosen_url)

                if local_p:

                    output_map[norm_id] = local_p

                    output_map[raw_id] = local_p

                    output_map[f"S{norm_id}"] = local_p

                    output_map[f"SCENE_{norm_id}"] = local_p

                    output_map[f"SCENE{norm_id}"] = local_p



        kinetic_map = {}

        for ks in kinetic_scenes:

            raw_k_id = str(ks.get("id", ""))

            norm_k_id = normalize_sc_id(raw_k_id)

            kinetic_map[norm_k_id] = ks

            kinetic_map[raw_k_id] = ks

            kinetic_map[f"S{norm_k_id}"] = ks

            kinetic_map[f"SCENE_{norm_k_id}"] = ks



        temp_dir = tempfile.mkdtemp(prefix="sceneui_render_")

        intensity_val = float(intensity) / 100.0

        transition_mode = str(data.get("transitionMode", "dissolve")).lower().strip()

        color_filter_mode = str(data.get("colorFilter", "none")).lower().strip()

        zoom_mode = str(data.get("zoomMode", "constant_speed")).lower().strip()

        camera_on_video = bool(data.get("cameraOnVideo", False) or data.get("camera_on_video", False) or (data.get("renderSettings") or {}).get("cameraOnVideo", False))

        subtitle_mode = str(data.get("subtitleMode") or data.get("subtitle_mode") or (data.get("renderSettings") or {}).get("subtitleMode") or (data.get("renderSettings") or {}).get("subtitle_mode") or "none").lower().strip()

        slowdown_if_short = bool(data.get("slowdownIfShort", True))

        xfade_dur = float(data.get("transitionDur", 0.5))

        xfade_dur = max(0.1, min(1.2, xfade_dur))



        # zoom_max: target zoom percentage for ease-based modes

        zoom_max = max(0.04, min(0.35, intensity_val * 0.40))

        # zoom_rate_per_sec: linear uniform zoom rate per second (identical zoom velocity across all scenes)

        zoom_rate_per_sec = max(0.01, min(0.12, intensity_val * 0.22))



        audio_path = resolve_file_path(audio_track_url) if audio_track_url else None



        scene_ranges = []

        scene_dialogue_audios = []
        scene_sfx_audios = []

        current_offset = 0.0



        prev_trans_d = 0.0



        for idx, item in enumerate(scene_items):

            sc_id = item["id"]

            norm_id = item["norm_id"]

            dur = float(item.get("dur") or item.get("duration") or 4.0)

            text = item.get("text", "")

            

            sc_obj = scenes_obj_map.get(norm_id) or scenes_obj_map.get(sc_id) or {}

            out_obj = output_obj_map.get(norm_id) or output_obj_map.get(sc_id) or {}

            ks_obj = kinetic_map.get(norm_id) or kinetic_map.get(sc_id) or {}



            # Per-scene effect overrides from Scene Overview

            sc_motion = item.get("cameraMotion") or item.get("kenBurns") or item.get("motion") or (sc_obj.get("cameraMotion") or sc_obj.get("motion")) or ken_burns

            sc_transition = item.get("transition") or (sc_obj.get("transition")) or transition_mode

            sc_color = item.get("colorFilter") or (sc_obj.get("colorFilter")) or color_filter_mode

            

            sc_fps_raw = item.get("footageFps") or item.get("fps") or sc_obj.get("footageFps") or sc_obj.get("fps") or data.get("footageFps") or (data.get("renderSettings") or {}).get("footageFps")

            sc_fps = None

            if sc_fps_raw and str(sc_fps_raw).lower() not in ["default", "none", "auto", "0"]:

                try:

                    sc_fps = float(sc_fps_raw)

                except Exception:

                    sc_fps = None



            # Determine whether this scene is strictly a Kinetic Text Scene or an AI Image Scene

            img_path = output_map.get(norm_id) or output_map.get(sc_id)

            is_kinetic_scene = False



            if sc_obj.get("isKinetic") or sc_obj.get("is_kinetic"):

                is_kinetic_scene = True

            elif out_obj.get("isKineticText"):

                is_kinetic_scene = True

            elif ks_obj.get("isCustom") or ks_obj.get("isKinetic") or ks_obj.get("enabled"):

                is_kinetic_scene = True

            else:

                p_text = (sc_obj.get("prompt") or sc_obj.get("text") or text or "").lower()

                t_text = (sc_obj.get("text") or text or "").strip().lower()

                if (

                    t_text.startswith("chapter ")

                    or t_text.startswith("[chapter")

                    or "kinetic typography" in p_text

                    or "solid pure black background" in p_text

                    or "pure black background" in p_text

                    or "pitch-black screen" in p_text

                    or "solid black screen" in p_text

                    or "solid black background" in p_text

                    or "charcoal-black background" in p_text

                    or "charcoal black background" in p_text

                    or "black background, no texture" in p_text

                    or "white sans-serif text" in p_text

                    or "white sans-serif typography" in p_text

                    or "title card" in p_text

                    or "chapter card" in p_text

                    or "kinetic text" in p_text

                    or ("first line:" in p_text and "second line:" in p_text)

                    or p_text.startswith("chapter ")

                    or p_text.startswith("[chapter")

                ):

                    is_kinetic_scene = True



            # If user enabled 'hideText' (Tik Vaizdas mode) and a real image exists, treat as clean image

            if is_kinetic_scene and (ks_obj.get("hideText") or sc_obj.get("kineticHideText")):

                if img_path and os.path.exists(img_path):

                    is_kinetic_scene = False

            # Check for uploaded / pre-rendered Text Writer WebM clip ONLY if kinetic or missing image

            kinetic_video_path = None

            if is_kinetic_scene or not img_path:

                kinetic_candidates = [

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_{project_id}_{norm_id}.webm"),

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_{project_id}_S{norm_id}.webm"),

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.webm"),

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_{norm_id}.webm"),

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_{sc_id}.webm"),

                    os.path.join(AUDIO_DIR, f"kinetic_{project_id}_S{norm_id}.webm"),

                    os.path.join(AUDIO_DIR, f"kinetic_S{norm_id}.webm"),

                    os.path.join(VAULT_DIR, f"kinetic_S{norm_id}.webm")

                ]

                for kc in kinetic_candidates:

                    if os.path.exists(kc) and os.path.getsize(kc) > 0:

                        kinetic_video_path = kc

                        break



            used_kinetic_webm = False

            if is_kinetic_scene and kinetic_video_path:

                img_path = kinetic_video_path

                used_kinetic_webm = True

            elif not img_path and kinetic_video_path:

                img_path = kinetic_video_path

                used_kinetic_webm = True



            # Check mirror/flipH setting

            is_flipped = False

            if out_obj:

                if out_obj.get("flipH") is True:

                    is_flipped = True

                elif (out_obj.get("params") or {}).get("flipH") is True:

                    is_flipped = True

                else:

                    main_id = out_obj.get("mainId")

                    for v in out_obj.get("variations", []):

                        if v.get("id") == main_id and (v.get("flipH") is True or (v.get("params") or {}).get("flipH") is True):

                            is_flipped = True

                            break

            if not is_flipped and sc_obj and sc_obj.get("flipH") is True:

                is_flipped = True



            is_video_source = False

            video_source = None

            base_img = None



            # Check video trim settings if any

            trim_start = 0.0

            trim_end = 0.0

            if out_obj:

                main_id = out_obj.get("mainId")

                for v in out_obj.get("variations", []):

                    if (not main_id or v.get("id") == main_id) and v.get("trim"):

                        t_data = v.get("trim") or {}

                        if t_data.get("enabled", True):

                            trim_start = float(t_data.get("start", 0.0))

                            trim_end = float(t_data.get("end", 0.0))

                            break

            if trim_start == 0.0 and trim_end == 0.0 and sc_obj and sc_obj.get("video_trim"):

                t_data = sc_obj.get("video_trim") or {}

                if t_data.get("enabled", True):

                    trim_start = float(t_data.get("start", 0.0))

                    trim_end = float(t_data.get("end", 0.0))



            # Svarbu: Jei failas jau yra fiziškai apkirptas diske (pvz. prasideda 'cut_'),

            # jo pradžia jau yra 0.0s, todėl negalima pakartotinai peršokti trim_start sekundžių!

            if img_path and os.path.basename(img_path).lower().startswith("cut_"):

                trim_start = 0.0

                trim_end = 0.0



            if img_path and os.path.exists(img_path):

                if img_path.lower().endswith(('.webm', '.mp4', '.mov', '.mkv')):

                    is_video_source = True

                    needed_frames = max(30, int((dur + 2.5) * fps_val) + 10)

                    video_source = SceneVideoSource(img_path, width, height, max_frames=needed_frames, flip_h=is_flipped, slowdown_if_short=slowdown_if_short, trim_start=trim_start, trim_end=trim_end)

                    base_img = video_source.get_first_frame()

                else:

                    bgr = cv2.imread(img_path)

                    if bgr is not None:

                        base_img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

                        if is_flipped:

                            base_img = cv2.flip(base_img, 1)



            if base_img is None and is_kinetic_scene and ks_obj:

                bg_media_cand = ks_obj.get("bgMedia") or ks_obj.get("bgMediaUrl") or ks_obj.get("mediaUrl") or ks_obj.get("bgImage")

                if bg_media_cand:

                    bg_m_path = resolve_file_path(bg_media_cand)

                    if bg_m_path and os.path.exists(bg_m_path):

                        if bg_m_path.lower().endswith(('.webm', '.mp4', '.mov', '.mkv')):

                            is_video_source = True

                            needed_frames = max(30, int((dur + 2.5) * fps_val) + 10)

                            video_source = SceneVideoSource(bg_m_path, width, height, max_frames=needed_frames, flip_h=is_flipped, slowdown_if_short=slowdown_if_short, trim_start=trim_start, trim_end=trim_end)

                            base_img = video_source.get_first_frame()

                        else:

                            bgr = cv2.imread(bg_m_path)

                            if bgr is not None:

                                base_img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

                                if is_flipped:

                                    base_img = cv2.flip(base_img, 1)



            if base_img is None:

                bg_col = (ks_obj.get("bgColor") if ks_obj else None) or "#0a0e1a"

                txt_col = (ks_obj.get("textColor") if ks_obj else None) or "#ffffff"

                t1 = (ks_obj.get("text1") if ks_obj else None) or text or f"Scene {sc_id}"

                t2 = (ks_obj.get("text2") if ks_obj else None) or ""

                fallback_png = os.path.join(temp_dir, f"slide_{idx:03d}_{sc_id}.png")

                create_styled_text_slide(sc_id, t1, t2, fallback_png, bg_col, txt_col, width, height)

                bgr = cv2.imread(fallback_png)

                if bgr is not None:

                    base_img = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

                else:

                    base_img = np.zeros((height, width, 3), dtype=np.uint8)



            # Fit to target canvas dimensions with fast Area/Linear interpolation

            bh, bw = base_img.shape[:2]

            if bw != width or bh != height:

                scale_f = max(width / bw, height / bh)

                nw = max(width, int(round(bw * scale_f)))

                nh = max(height, int(round(bh * scale_f)))

                interp = cv2.INTER_AREA if scale_f < 1.0 else cv2.INTER_LINEAR

                scaled_base = cv2.resize(base_img, (nw, nh), interpolation=interp)

                x_off = max(0, (nw - width) // 2)

                y_off = max(0, (nh - height) // 2)

                base_canvas = scaled_base[y_off:y_off + height, x_off:x_off + width]

            else:

                base_canvas = base_img



            in_trans_d = prev_trans_d

            is_last = (idx == len(scene_items) - 1)

            next_item = scene_items[idx + 1] if not is_last else None

            next_dur = float(next_item.get("dur") or next_item.get("duration") or 4.0) if next_item else 4.0

            out_trans_d = min(xfade_dur, dur * 0.45, next_dur * 0.45) if (not is_last and sc_transition != "cut" and sc_transition != "none") else 0.0

            prev_trans_d = out_trans_d



            # Raw frame generator function for this scene with seamless continuous momentum

            def make_raw_scene_frame(t, base_c=base_canvas, d=dur, in_td=in_trans_d, is_vid=is_video_source, v_src=video_source, is_k=is_kinetic_scene, k_sc=ks_obj, sc_idx=idx, motion_mode=sc_motion, cf_mode=sc_color, sc_text=text, sub_mode=subtitle_mode, target_sc_fps=sc_fps, target_dur=None, has_webm=used_kinetic_webm, cam_on_vid=camera_on_video):

                cur_canvas = base_c

                t_eff = max(0.0, in_td + t)

                d_eff = in_td + (target_dur if target_dur is not None else d)



                if is_vid and v_src:

                    # Seamless looping or smooth slowdown for videos so they never freeze or cut short

                    if target_sc_fps and float(target_sc_fps) > 0 and float(target_sc_fps) < float(fps_val):

                        # Stylized footage framerate / Posterize time (e.g. 16 FPS, 12 FPS, 24 FPS)

                        step = 1.0 / float(target_sc_fps)

                        t_quant = math.floor(t_eff / step) * step

                        v_idx = int(round(t_quant * float(fps_val)))

                    else:

                        v_idx = int(round(t_eff * float(fps_val)))

                    total_needed = max(1, int(round(d_eff * float(fps_val))))

                    cur_canvas = v_src.get_frame(v_idx, total_needed=total_needed)



                p = max(0.0, min(1.0, t_eff / max(0.1, d_eff)))



                # 1. Camera Motions (Continuous Subpixel Floating-Point Affine Lanczos Matrix)

                if (not is_vid) or cam_on_vid:

                    km = str(motion_mode).lower().replace("_", "").replace("-", "")

                    

                    if km in ["constantspeed", "constantzoom", "uniformspeed", "linearspeed", "linearzoom", "linearzoomin", "uniformzoomin", "fixedspeed", "zoomin", "cinematic", "zoomincenter", "centerzoom"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x, pan_y = 0.0, 0.0

                    elif km in ["constantspeedout", "constantzoomout", "uniformzoomout", "linearzoomout", "zoomout", "zoomoutcenter"]:

                        total_zoom = (1.0 + zoom_rate_per_sec * d_eff) - zoom_rate_per_sec * t_eff

                        pan_x, pan_y = 0.0, 0.0

                    elif km in ["pulse", "breathe", "zoominout", "pulsecenter"]:

                        total_zoom = 1.0 + (zoom_max * 0.5) * np.sin(np.pi * p)

                        pan_x, pan_y = 0.0, 0.0

                    elif km in ["panleft", "left"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x = 0.035 * (1.0 - 2.0 * p)

                        pan_y = 0.0

                    elif km in ["panright", "right"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x = 0.035 * (2.0 * p - 1.0)

                        pan_y = 0.0

                    elif km in ["panup", "up"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x = 0.0

                        pan_y = 0.035 * (1.0 - 2.0 * p)

                    elif km in ["pandown", "down"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x = 0.0

                        pan_y = 0.035 * (2.0 * p - 1.0)

                    elif km in ["drift", "diagonal"]:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x = 0.025 * (1.0 - 2.0 * p)

                        pan_y = 0.025 * (1.0 - 2.0 * p)

                    elif km in ["random", "smart"]:

                        motion_types = ["constant_speed", "zoom_out", "pan_left", "pan_right", "drift"]

                        chosen_motion = motion_types[sc_idx % len(motion_types)]

                        if chosen_motion == "zoom_out":

                            total_zoom = (1.0 + zoom_rate_per_sec * d_eff) - zoom_rate_per_sec * t_eff

                            pan_x, pan_y = 0.0, 0.0

                        elif chosen_motion == "pan_left":

                            total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                            pan_x = 0.035 * (1.0 - 2.0 * p)

                            pan_y = 0.0

                        elif chosen_motion == "pan_right":

                            total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                            pan_x = 0.035 * (2.0 * p - 1.0)

                            pan_y = 0.0

                        elif chosen_motion == "drift":

                            total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                            pan_x = 0.025 * (1.0 - 2.0 * p)

                            pan_y = 0.025 * (1.0 - 2.0 * p)

                        else:

                            total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                            pan_x, pan_y = 0.0, 0.0

                    else:

                        total_zoom = 1.0 + zoom_rate_per_sec * t_eff

                        pan_x, pan_y = 0.0, 0.0



                    frame = apply_subpixel_affine_zoom(cur_canvas, total_zoom, pan_x, pan_y, width, height)

                else:

                    frame = cur_canvas



                # Film color grading

                if cf_mode and cf_mode != "none":

                    frame = apply_color_grading_np(frame, cf_mode)



                # Kinetic Typography ONLY if confirmed kinetic scene AND text not already baked into pre-rendered WebM

                if is_k and k_sc and not has_webm:

                    dim = float(k_sc.get("bgMediaDim", 0.4) if (k_sc.get("bgMedia") or k_sc.get("bgMediaUrl") or k_sc.get("mediaUrl")) else 0.0)

                    if dim > 0.01:

                        dim_f = max(0.0, min(1.0, 1.0 - dim))

                        frame = (frame.astype(np.float32) * dim_f).astype(np.uint8)

                    frame = draw_kinetic_text_pillow(frame, k_sc, t_eff, d_eff, width, height)

                elif sub_mode and sub_mode != "none" and sc_text and not is_k and not (audio_path and os.path.exists(audio_path)):

                    # Tik jei nėra bendro garso takelio ir tai nėra kinetinė scena, piešiame per Pillow; jei audio yra, žodžių lygio subtitrus uždeginsime per Whisper ASS!

                    frame = draw_subtitle_pillow(frame, sc_text, sub_mode, width, height, t_eff=t_eff, d_eff=d_eff)



                if frame is None:

                    frame = cur_canvas if cur_canvas is not None else base_c

                return frame



            # Direct In-Memory Stream: No temporary MP4 files, no subprocess/pipe leaks!

            scene_ranges.append({

                "id": sc_id,

                "norm_id": norm_id,

                "start": current_offset,

                "end": current_offset + dur,

                "dur": dur,

                "is_kinetic": is_kinetic_scene,

                "raw_fn": make_raw_scene_frame,

                "video_source": video_source,

                "transition": sc_transition,

                "out_trans_d": out_trans_d

            })

            # Collect scene SFX / ambient audio if enabled

            # Vartotojo reikalavimas: Šiame sluoksnyje eina TIK SFX (MMAudio arba nedialoginio video garsas)!

            # Garso atskyrimas: Dialogai (Voice / LipSync) ir SFX (Foley / Efektai)
            sfx_url = (
                scene_sfx_by_id.get(norm_id) or
                scene_sfx_by_id.get(sc_id) or
                scene_sfx_by_id.get(f"S{norm_id}") or
                scene_sfx_by_id.get(f"s{norm_id}")
            )
            sfx_file_path = resolve_file_path(sfx_url) if sfx_url else None

            has_dialogue = bool(
                (sc_obj.get("speaker") and str(sc_obj.get("speaker")).strip().lower() not in ["", "pasakotojas", "narrator"]) or
                (sc_obj.get("dialogue") and str(sc_obj.get("dialogue")).strip()) or
                (sc_obj.get("h3_prompt") and str(sc_obj.get("h3_prompt")).strip())
            )

            # 1. SFX takelio nustatymas (visada girdimas ir nepriklausomas nuo balso!)
            chosen_sfx_path = None
            is_sfx_file = False
            if sfx_file_path and os.path.exists(sfx_file_path):
                chosen_sfx_path = sfx_file_path
                is_sfx_file = True
            elif not has_dialogue and is_video_source and img_path and os.path.exists(img_path):
                # Tik jei NĖRA atskiro SFX failo ir NĖRA dialogo, video integruotas garsas naudojamas kaip SFX fonas
                chosen_sfx_path = img_path
                is_sfx_file = False

            if chosen_sfx_path:
                sfx_vol = 1.0
                sfx_enabled = True

                # Scenų Garso Mikseris (scene_volumes) turi aukščiausią prioritetą
                sv_entry = scene_volumes.get(norm_id) or scene_volumes.get(sc_id) or scene_volumes.get(f"S{norm_id}") or scene_volumes.get(f"s{norm_id}")
                if sv_entry and isinstance(sv_entry, dict):
                    if "enabled" in sv_entry:
                        sfx_enabled = bool(sv_entry["enabled"])
                    if "volume" in sv_entry:
                        try:
                            sfx_vol = float(sv_entry["volume"])
                        except Exception:
                            sfx_vol = 1.0
                elif not is_sfx_file:
                    # Tik jei tai video garsas (o ne atskiras SFX failas), tikriname matched_v
                    if out_obj:
                        main_id = out_obj.get("mainId")
                        v_list = out_obj.get("variations", [])
                        matched_v = next((v for v in v_list if v.get("id") == main_id), None) or (v_list[-1] if v_list else None)
                        if matched_v:
                            v_en = matched_v.get("soundEnabled")
                            if v_en is None:
                                v_en = (matched_v.get("params") or {}).get("soundEnabled")
                            if v_en is not None:
                                sfx_enabled = bool(v_en)
                            v_vol = matched_v.get("soundVolume")
                            if v_vol is None:
                                v_vol = (matched_v.get("params") or {}).get("soundVolume")
                            if v_vol is not None:
                                try:
                                    sfx_vol = float(v_vol)
                                except Exception:
                                    sfx_vol = 1.0

                if sfx_enabled and sfx_vol > 0.01:
                    scene_sfx_audios.append({
                        "path": chosen_sfx_path,
                        "start": current_offset,
                        "dur": dur,
                        "volume": sfx_vol,
                        "trim_start": trim_start if (chosen_sfx_path == img_path) else 0.0,
                        "trim_end": trim_end if (chosen_sfx_path == img_path) else 0.0,
                        "is_sfx_file": is_sfx_file
                    })

            # 2. Dialogo / Balso takelis (kai pasirinkta "video" arba "smart_hybrid")
            if voice_source in ["video", "smart_hybrid"]:
                dialogue_added = False
                if is_video_source and img_path and os.path.exists(img_path):
                    # Jei režimas 'video' arba 'smart_hybrid' su dialogu (LipSync)
                    if voice_source == "video" or (voice_source == "smart_hybrid" and has_dialogue):
                        scene_dialogue_audios.append({
                            "path": img_path,
                            "start": current_offset,
                            "dur": dur,
                            "volume": 1.0,
                            "trim_start": trim_start,
                            "trim_end": trim_end,
                            "scene_id": sc_id
                        })
                        dialogue_added = True

                # Jei video garso neįdėjome, bet scena turi balso segmentą (chunk)
                if not dialogue_added:
                    chunk = audio_chunk_by_sc.get(norm_id) or audio_chunk_by_sc.get(sc_id)
                    chunk_url = (chunk.get("audio_url") or chunk.get("url")) if chunk else None
                    if not chunk_url:
                        chunk_url = scene_audio_by_id.get(norm_id) or scene_audio_by_id.get(sc_id)
                    chunk_path = resolve_file_path(chunk_url) if chunk_url else None
                    if chunk_path and os.path.exists(chunk_path):
                        scene_dialogue_audios.append({
                            "path": chunk_path,
                            "start": current_offset,
                            "dur": dur,
                            "volume": 1.0,
                            "trim_start": 0.0,
                            "trim_end": 0.0,
                            "scene_id": sc_id
                        })

            current_offset += dur



            if idx % 25 == 0:

                gc.collect()



        total_video_duration = max(0.1, current_offset)



        # Patikriname pasakotojo balso takelio trukmę:

        # Vartotojo reikalavimas: paskutinio balso sakinio negalima nukirpti!

        # Jei balso takelis turi ilgą tylą gale, nustatome tikrąją pabaigą (+0.25s natūraliam aidui),

        # kad video neužšaltų negyvame kadre po kalbos pabaigos.

        audio_path = resolve_file_path(audio_track_url) if audio_track_url else None

        voice_audio = None

        if audio_path and os.path.exists(audio_path):

            try:

                voice_audio = AudioFileClip(audio_path)

                clips_to_cleanup.append(voice_audio)

                

                # Nustatome aktyvaus balso trukmę (be negyvos sekundės tylos gale)

                try:

                    import soundfile as sf

                    _d, _sr = sf.read(audio_path)

                    if len(_d) > 0:

                        _mono = np.max(np.abs(_d), axis=1) if len(_d.shape) > 1 else np.abs(_d)

                        _active = np.where(_mono > 0.005)[0]

                        if len(_active) > 0:

                            active_dur = min(voice_audio.duration, (_active[-1] / float(_sr)) + 0.25)

                            if active_dur < voice_audio.duration:

                                voice_audio = voice_audio.subclip(0, active_dur)

                                clips_to_cleanup.append(voice_audio)

                except Exception as trim_err:

                    print("Voice active duration detection note:", trim_err)



                if voice_audio.duration > total_video_duration:

                    total_video_duration = voice_audio.duration

                    if scene_ranges:

                        scene_ranges[-1]["end"] = total_video_duration

                        scene_ranges[-1]["dur"] = max(0.1, total_video_duration - scene_ranges[-1]["start"])

            except Exception as a_err:

                print("Voice audio duration check error:", a_err)



        last_cleaned_scene_idx = [-1]

        # Single Global Master Frame Generator: 100% Timeline & Audio synchronized with continuous motion

        def make_master_frame(global_t):

            t_curr = max(0.0, min(total_video_duration - 0.001, global_t))

            

            # Find active scene

            active_idx = 0

            for i, s_range in enumerate(scene_ranges):

                if s_range["start"] <= t_curr < s_range["end"]:

                    active_idx = i

                    break

            else:

                active_idx = len(scene_ranges) - 1



            # Auto-cleanup video frames of earlier scenes that have completely finished

            if active_idx > last_cleaned_scene_idx[0] + 1:

                for past_i in range(last_cleaned_scene_idx[0] + 1, active_idx):

                    p_src = scene_ranges[past_i].get("video_source")

                    if p_src:

                        p_src.release()

                last_cleaned_scene_idx[0] = active_idx - 1



            cur_scene = scene_ranges[active_idx]

            local_t = max(0.0, min(cur_scene["dur"], t_curr - cur_scene["start"]))

            time_until_end = cur_scene["end"] - t_curr



            frame = cur_scene["raw_fn"](local_t, target_dur=cur_scene["dur"])



            next_scene = scene_ranges[active_idx + 1] if (active_idx < len(scene_ranges) - 1) else None

            trans_mode = cur_scene["transition"]

            trans_d = cur_scene.get("out_trans_d", 0.0)



            if next_scene and trans_d > 0 and time_until_end <= trans_d:

                tr_p = max(0.0, min(1.0, 1.0 - (time_until_end / trans_d)))

                # Next scene moves continuously through transition: from t = -trans_d up to 0.0!

                next_t = (tr_p - 1.0) * trans_d

                next_frame = next_scene["raw_fn"](next_t, target_dur=next_scene["dur"])



                tm = str(trans_mode).lower().replace("_", "").replace("-", "")



                if tm in ["dissolve", "crossfade", "fade", "none"]:

                    alpha = float(0.5 - 0.5 * np.cos(tr_p * np.pi))

                    return cv2.addWeighted(frame, 1.0 - alpha, next_frame, alpha, 0)

                elif tm in ["fadeblack", "black"]:

                    alpha = float(np.sin(tr_p * np.pi))

                    src = frame if tr_p < 0.5 else next_frame

                    return cv2.addWeighted(src, max(0.0, 1.0 - alpha), np.zeros_like(src), 0, 0)

                elif tm in ["fadewhite", "white", "flash"]:

                    alpha = float(np.sin(tr_p * np.pi))

                    src = frame if tr_p < 0.5 else next_frame

                    white_m = np.full_like(src, 255)

                    return cv2.addWeighted(src, max(0.0, 1.0 - alpha), white_m, alpha, 0)

                elif tm in ["smoothleft", "slideleft", "slide"]:

                    shift = int(width * tr_p)

                    f_comb = np.copy(next_frame)

                    f_comb[:, 0:width - shift] = frame[:, shift:width]

                    f_comb[:, width - shift:width] = next_frame[:, 0:shift]

                    return f_comb

                elif tm in ["smoothright", "slideright"]:

                    shift = int(width * (1.0 - tr_p))

                    f_comb = np.copy(next_frame)

                    f_comb[:, 0:width - shift] = next_frame[:, shift:width]

                    f_comb[:, width - shift:width] = frame[:, 0:shift]

                    return f_comb

                elif tm in ["smoothup", "slideup"]:

                    shift = int(height * tr_p)

                    f_comb = np.copy(next_frame)

                    f_comb[0:height - shift, :] = frame[shift:height, :]

                    f_comb[height - shift:height, :] = next_frame[0:shift, :]

                    return f_comb

                elif tm in ["smoothdown", "slidedown"]:

                    shift = int(height * (1.0 - tr_p))

                    f_comb = np.copy(next_frame)

                    f_comb[0:height - shift, :] = next_frame[shift:height, :]

                    f_comb[height - shift:height, :] = frame[0:shift, :]

                    return f_comb

                elif tm in ["wipeleft", "wipe"]:

                    split_x = int(width * tr_p)

                    f_comb = np.copy(frame)

                    f_comb[:, 0:split_x] = next_frame[:, 0:split_x]

                    return f_comb

                elif tm in ["wiperight"]:

                    split_x = int(width * (1.0 - tr_p))

                    f_comb = np.copy(frame)

                    f_comb[:, split_x:width] = next_frame[:, split_x:width]

                    return f_comb

                elif tm in ["circlewipe", "circlecrop", "circleopen", "circleiris"]:

                    max_r = int(np.hypot(width, height) / 2.0)

                    cur_r = int(max_r * tr_p)

                    mask = np.zeros((height, width), dtype=np.uint8)

                    cv2.circle(mask, (width // 2, height // 2), cur_r, 255, -1)

                    m_f = (mask.astype(np.float32) / 255.0)[:, :, None]

                    return (next_frame.astype(np.float32) * m_f + frame.astype(np.float32) * (1.0 - m_f)).astype(np.uint8)

                elif tm in ["pixelize", "pixelate", "mosaic"]:

                    pix_scale = max(1, int(32 * (1.0 - abs(tr_p - 0.5) * 2.0)))

                    f_low = cv2.resize(next_frame, (max(1, width // pix_scale), max(1, height // pix_scale)), interpolation=cv2.INTER_NEAREST)

                    f_pix = cv2.resize(f_low, (width, height), interpolation=cv2.INTER_NEAREST)

                    alpha = float(0.5 - 0.5 * np.cos(tr_p * np.pi))

                    return cv2.addWeighted(frame, 1.0 - alpha, f_pix, alpha, 0)

                else:

                    alpha = float(0.5 - 0.5 * np.cos(tr_p * np.pi))

                    return cv2.addWeighted(frame, 1.0 - alpha, next_frame, alpha, 0)



            if frame is None:

                frame = np.zeros((height, width, 3), dtype=np.uint8)

            return frame



        final_video = VideoClip(make_master_frame, duration=total_video_duration)

        clips_to_cleanup.append(final_video)



        # Audio mixing (1. Dialogue / Voice + 2. Scene SFX + 3. BGM)
        audio_layers = []

        # --- 1 KANALAS: DIALOGAS / BALSAS ---
        if voice_source == "master":
            # Bendras balso takelis (Master Audio) - jokių dubliavimų iš video klipų!
            if voice_audio is not None:
                try:
                    _ = voice_audio.get_frame(0.0)
                    if voice_audio.duration > final_video.duration:
                        final_video.duration = voice_audio.duration
                    audio_layers.append(voice_audio)
                except Exception as va_err:
                    print("Voice audio frame read error:", va_err)
            elif audio_path and os.path.exists(audio_path):
                try:
                    voice_audio = AudioFileClip(audio_path)
                    _ = voice_audio.get_frame(0.0)
                    clips_to_cleanup.append(voice_audio)
                    if voice_audio.duration > final_video.duration:
                        final_video.duration = voice_audio.duration
                    audio_layers.append(voice_audio)
                except Exception as a_err:
                    print("Voice audio load error:", a_err)
        else:
            # "video" arba "smart_hybrid": Dialogas eina tiesiai iš scenų / video failų
            dialogue_clips_added = 0
            for d_item in scene_dialogue_audios:
                try:
                    d_clip = AudioFileClip(d_item["path"])
                    if d_clip.duration is None or d_clip.duration <= 0.01:
                        try:
                            d_clip.close()
                        except Exception:
                            pass
                        continue
                    test_f = d_clip.get_frame(0.0)
                    if test_f is None or len(test_f) == 0:
                        try:
                            d_clip.close()
                        except Exception:
                            pass
                        continue
                    clips_to_cleanup.append(d_clip)
                    t_s = float(d_item.get("trim_start", 0.0) or 0.0)
                    t_e = float(d_item.get("trim_end", 0.0) or 0.0)
                    if t_e > t_s and t_e > 0.0:
                        d_clip = d_clip.subclip(t_s, min(d_clip.duration, t_e))
                    elif d_clip.duration > d_item["dur"]:
                        d_clip = d_clip.subclip(0, d_item["dur"])
                    
                    if d_clip.duration > 0.1:
                        try:
                            d_clip = d_clip.audio_fadein(0.02).audio_fadeout(0.04)
                        except Exception:
                            pass
                    
                    d_clip = d_clip.set_start(d_item["start"])
                    _ = d_clip.get_frame(0.0)
                    audio_layers.append(d_clip)
                    dialogue_clips_added += 1
                except Exception as d_err:
                    print(f"Skipping dialogue audio ({d_item.get('path')}):", d_err)

            # Atsarginis variantas: jei nė vienas video klipas neturėjo garso, naudojame bendrą balso takelį
            if dialogue_clips_added == 0 and voice_audio is not None:
                try:
                    _ = voice_audio.get_frame(0.0)
                    audio_layers.append(voice_audio)
                except Exception:
                    pass

        # --- 2 KANALAS: SFX TAKELIAI (Girdisi visuose režimuose kartu su dialogu!) ---
        master_video_vol = float(data.get("masterVideoVolume", 1.0))
        if master_video_vol > 1.0:
            master_video_vol = master_video_vol / 100.0

        for s_item in scene_sfx_audios:
            try:
                s_clip = AudioFileClip(s_item["path"])
                if s_clip.duration is None or s_clip.duration <= 0.01:
                    try:
                        s_clip.close()
                    except Exception:
                        pass
                    continue
                test_f = s_clip.get_frame(0.0)
                if test_f is None or len(test_f) == 0:
                    try:
                        s_clip.close()
                    except Exception:
                        pass
                    continue
                clips_to_cleanup.append(s_clip)
                t_s = float(s_item.get("trim_start", 0.0) or 0.0)
                t_e = float(s_item.get("trim_end", 0.0) or 0.0)
                if t_e > t_s and t_e > 0.0:
                    s_clip = s_clip.subclip(t_s, min(s_clip.duration, t_e))
                elif s_clip.duration > s_item["dur"]:
                    s_clip = s_clip.subclip(0, s_item["dur"])
                
                # Švelnus fade-in ir fade-out pašalinti spragtelėjimams
                if s_clip.duration > 0.1:
                    try:
                        s_clip = s_clip.audio_fadein(0.04).audio_fadeout(0.06)
                    except Exception:
                        pass

                effective_vol = s_item["volume"] * master_video_vol
                if abs(effective_vol - 1.0) > 0.01:
                    s_clip = s_clip.volumex(effective_vol)

                s_clip = s_clip.set_start(s_item["start"])
                _ = s_clip.get_frame(0.0)
                audio_layers.append(s_clip)
            except Exception as s_err:
                print(f"Skipping scene sfx audio ({s_item.get('path')}):", s_err)

        # Background Music (BGM) Track Mixing

        bgm_url = data.get("bgmTrack") or data.get("bgmTrackUrl") or data.get("bgm")

        bgm_settings = data.get("bgmSettings") or {}

        if not bgm_url and bgm_settings.get("url"):

            bgm_url = bgm_settings.get("url")



        bgm_vol = float(data.get("bgmVolume") if data.get("bgmVolume") is not None else (bgm_settings.get("volume") if bgm_settings.get("volume") is not None else 0.03))

        # Jei garsumas perduotas procentais (pvz., 3 vietoj 0.03), normalizuojame į frakciją

        if bgm_vol > 1.0:

            bgm_vol = bgm_vol / 100.0



        track_start = float(data.get("bgmTrackStart") or data.get("bgmStart") or bgm_settings.get("trackStart") or bgm_settings.get("start") or 0.0)

        track_end = float(data.get("bgmTrackEnd") or data.get("bgmEnd") or bgm_settings.get("trackEnd") or bgm_settings.get("end") or 0.0)

        vid_start = max(0.0, float(data.get("bgmVideoStart") or bgm_settings.get("videoStart") or 0.0))

        vid_end = float(data.get("bgmVideoEnd") or bgm_settings.get("videoEnd") or 0.0)

        bgm_loop = bool(data.get("bgmLoop", True) if "bgmLoop" in data else bgm_settings.get("loop", True))

        bgm_fade_in = float(data.get("bgmFadeIn") or bgm_settings.get("fadeIn") or 0.5)

        bgm_fade_out = float(data.get("bgmFadeOut") or bgm_settings.get("fadeOut") or 1.5)

        bgm_muted = bool(data.get("bgmMuted", False) or bgm_settings.get("muted", False))

        if "bgmEnabled" in data and not bool(data.get("bgmEnabled")):

            bgm_muted = True

        elif "enabled" in bgm_settings and not bool(bgm_settings.get("enabled")):

            bgm_muted = True



        if bgm_url and not bgm_muted and bgm_vol > 0.0001:

            bgm_path = resolve_file_path(bgm_url)

            if bgm_path and os.path.exists(bgm_path):

                try:

                    raw_bgm = AudioFileClip(bgm_path)

                    test_bgm = raw_bgm.get_frame(0.0)

                    if test_bgm is None or len(test_bgm) == 0:

                        try:

                            raw_bgm.close()

                        except Exception:

                            pass

                        raise ValueError("Empty BGM audio stream")

                    clips_to_cleanup.append(raw_bgm)



                    # 1. Trimming the music track itself (IN / OUT points)

                    if track_end > track_start and track_start < raw_bgm.duration:

                        raw_bgm = raw_bgm.subclip(track_start, min(track_end, raw_bgm.duration))

                        clips_to_cleanup.append(raw_bgm)

                    elif track_start > 0 and track_start < raw_bgm.duration:

                        raw_bgm = raw_bgm.subclip(track_start)

                        clips_to_cleanup.append(raw_bgm)



                    # 2. Calculating target duration on the video timeline

                    if vid_end > vid_start:

                        target_dur = max(0.1, min(vid_end - vid_start, final_video.duration - vid_start))

                    else:

                        target_dur = max(0.1, final_video.duration - vid_start)



                    # 3. Looping or trimming to target duration with seamless crossfade

                    if raw_bgm.duration < target_dur and bgm_loop and raw_bgm.duration > 0.05:

                        try:

                            # Tolygus persidengiantis (seamless crossfade) loopinimas be aštrių nukirtimų ar spragtelėjimų

                            crossfade_d = min(2.0, max(0.4, raw_bgm.duration * 0.12))

                            step = max(0.5, raw_bgm.duration - crossfade_d)

                            n_loops = int(np.ceil((target_dur + crossfade_d) / step)) + 1



                            loop_layers = []

                            cur_t = 0.0

                            for l_idx in range(n_loops):

                                l_clip = raw_bgm.subclip(0, raw_bgm.duration)

                                if l_idx > 0 and crossfade_d > 0.1:

                                    try:

                                        l_clip = l_clip.audio_fadein(crossfade_d)

                                    except Exception:

                                        pass

                                if l_idx < n_loops - 1 and crossfade_d > 0.1:

                                    try:

                                        l_clip = l_clip.audio_fadeout(crossfade_d)

                                    except Exception:

                                        pass

                                l_clip = l_clip.set_start(cur_t)

                                loop_layers.append(l_clip)

                                clips_to_cleanup.append(l_clip)

                                cur_t += step

                                if cur_t >= target_dur + crossfade_d:

                                    break



                            bgm_clip = CompositeAudioClip(loop_layers).subclip(0, target_dur)

                            clips_to_cleanup.append(bgm_clip)

                        except Exception as loop_err:

                            print(f"[render.py] Seamless crossfade loop fallback: {loop_err}")

                            n_loops = int(np.ceil(target_dur / raw_bgm.duration))

                            from moviepy.editor import concatenate_audioclips

                            bgm_clip = concatenate_audioclips([raw_bgm] * n_loops).subclip(0, target_dur)

                            clips_to_cleanup.append(bgm_clip)

                    else:

                        bgm_clip = raw_bgm.subclip(0, min(raw_bgm.duration, target_dur))

                        clips_to_cleanup.append(bgm_clip)



                    # 4. Volume and fades

                    bgm_clip = bgm_clip.volumex(bgm_vol)

                    if bgm_fade_in > 0 and bgm_clip.duration > bgm_fade_in:

                        try:

                            bgm_clip = bgm_clip.audio_fadein(bgm_fade_in)

                        except Exception:

                            pass

                    if bgm_fade_out > 0 and bgm_clip.duration > bgm_fade_out:

                        try:

                            bgm_clip = bgm_clip.audio_fadeout(bgm_fade_out)

                        except Exception:

                            pass



                    # 5. Position on video timeline

                    if vid_start > 0:

                        bgm_clip = bgm_clip.set_start(vid_start)



                    audio_layers.append(bgm_clip)

                except Exception as bgm_err:

                    print("BGM mixing error:", bgm_err)



        if audio_layers:

            final_audio = CompositeAudioClip(audio_layers) if len(audio_layers) > 1 else audio_layers[0]

            if final_audio.duration > final_video.duration:

                final_audio = final_audio.subclip(0, final_video.duration)

            # Vartotojo reikalavimas: video pabaigoje turi būti tolygus fade out į visišką tylą, o ne pašaliniai garsai

            try:

                final_audio = final_audio.audio_fadeout(0.2)

            except Exception as fo_err:

                print("Final audio fadeout notice:", fo_err)

            clips_to_cleanup.append(final_audio)

            final_video = final_video.set_audio(final_audio)



        is_prores = "prores" in fps_codec.lower()

        is_h265 = "h265" in fps_codec.lower() or "hevc" in fps_codec.lower()



        ext = ".mov" if is_prores else ".mp4"

        output_filename = f"render_{project_id}_{uuid.uuid4().hex[:8]}{ext}"

        output_path = os.path.join(RENDERS_DIR, output_filename)



        if is_prores:

            final_video.write_videofile(

                output_path,

                fps=fps_val,

                codec="prores_ks",

                audio_codec="pcm_s16le",

                ffmpeg_params=[

                    "-profile:v", "3",

                    "-pix_fmt", "yuv422p10le",

                    "-vendor", "apl0"

                ],

                logger=None

            )

        elif is_h265:

            final_video.write_videofile(

                output_path,

                fps=fps_val,

                codec="libx265",

                audio_codec="aac",

                threads=4,

                preset="fast",

                ffmpeg_params=[

                    "-pix_fmt", "yuv420p",

                    "-crf", "20",

                    "-tag:v", "hvc1",

                    "-movflags", "+faststart"

                ],

                logger=None

            )

        else:

            final_video.write_videofile(

                output_path,

                fps=fps_val,

                codec="libx264",

                audio_codec="aac",

                bitrate="16000k",

                threads=4,

                preset="fast",

                ffmpeg_params=[

                    "-pix_fmt", "yuv420p",

                    "-crf", "16",

                    "-movflags", "+faststart",

                    "-g", str(fps_val),

                    "-bf", "2"

                ],

                logger=None

            )



        # TikTok / Reels Word-by-Word Subtitles burn via Whisper & FFmpeg libass

        if subtitle_mode and subtitle_mode != "none" and audio_path and os.path.exists(audio_path):

            try:

                whisper_words = transcribe_audio_words_cached(audio_path)

                if whisper_words:

                    ass_sub_path = os.path.join(temp_dir, f"subtitles_{uuid.uuid4().hex[:6]}.ass")

                    if generate_tiktok_ass_file(whisper_words, ass_sub_path, subtitle_mode, width=width, height=height):

                        subbed_output_path = os.path.join(temp_dir, f"subbed_{output_filename}")

                        # FFmpeg libass filter requires forward slashes, escaped drive colon, and quoted filename

                        fwd_ass_path = os.path.abspath(ass_sub_path).replace("\\", "/")

                        vf_filter = f"ass=filename='{fwd_ass_path.replace(':', '\\:')}'"

                        burn_cmd = [

                            "ffmpeg", "-y",

                            "-i", output_path,

                            "-vf", vf_filter,

                            "-c:v", "libx264",

                            "-preset", "ultrafast",

                            "-crf", "16",

                            "-c:a", "copy",

                            subbed_output_path

                        ]

                        burn_res = subprocess.run(burn_cmd, capture_output=True, text=True)

                        if burn_res.returncode == 0 and os.path.exists(subbed_output_path) and os.path.getsize(subbed_output_path) > 1000:

                            shutil.move(subbed_output_path, output_path)

                            print(f"[Render Subtitles] Successfully burned {len(whisper_words)} words into {output_filename}")

                        else:

                            print(f"[Render Subtitles Error]: FFmpeg failed (code {burn_res.returncode}): {burn_res.stderr[-300:]}")

            except Exception as sub_err:

                print(f"[Render Subtitles Exception]: {sub_err}")



        shutil.rmtree(temp_dir, ignore_errors=True)



        return JSONResponse({

            "status": "success",

            "videoUrl": f"/renders/{output_filename}?t={int(os.path.getmtime(output_path))}"

        })

    except Exception as e:

        import traceback

        traceback.print_exc()

        return JSONResponse({"status": "error", "message": str(e)})

    finally:

        for s_r in scene_ranges:

            try:

                p_src = s_r.get("video_source")

                if p_src:

                    p_src.release()

            except:

                pass

        for c in clips_to_cleanup:

            try:

                c.close()

            except:

                pass

        gc.collect()



from fastapi import UploadFile, File, Form



@router.post("/canvas_finalize")

async def finalize_canvas_video(

    video_file: UploadFile = File(...),

    project_id: str = Form("default"),

    audio_track_url: str = Form(None)

):

    try:

        temp_dir = tempfile.mkdtemp(prefix="sceneui_canvas_")

        webm_input = os.path.join(temp_dir, "canvas_input.webm")



        with open(webm_input, "wb") as f:

            content = await video_file.read()

            f.write(content)



        output_filename = f"{project_id}_final.mp4"

        output_path = os.path.join(RENDERS_DIR, output_filename)



        audio_path = resolve_file_path(audio_track_url)

        if not audio_path and os.path.exists(os.path.join(AUDIO_DIR, "demo_proj_full_script_dialogue (3).wav")):

            audio_path = os.path.join(AUDIO_DIR, "demo_proj_full_script_dialogue (3).wav")

        if not audio_path:

            wavs = glob.glob(os.path.join(AUDIO_DIR, "full_*.wav")) + glob.glob(os.path.join(AUDIO_DIR, "full_*.mp3")) + glob.glob(os.path.join(AUDIO_DIR, "demo_*.wav"))

            if wavs:

                audio_path = wavs[0]



        if audio_path and os.path.exists(audio_path):

            vf_filter = "[0:v]setpts=PTS-STARTPTS,fps=30[v]"

            af_filter = None

            try:

                probe_v = subprocess.run([

                    "ffprobe", "-v", "error", "-show_entries", "format=duration",

                    "-of", "default=noprint_wrappers=1:nokey=1", webm_input

                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

                v_dur = float(probe_v.stdout.strip()) if probe_v.stdout.strip() else 0.0



                probe_a = subprocess.run([

                    "ffprobe", "-v", "error", "-show_entries", "format=duration",

                    "-of", "default=noprint_wrappers=1:nokey=1", audio_path

                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

                a_dur = float(probe_a.stdout.strip()) if probe_a.stdout.strip() else 0.0



                if a_dur > v_dur and v_dur > 0:

                    diff = (a_dur - v_dur) + 0.35

                    vf_filter = f"[0:v]setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration={diff:.2f}[v]"

                    target_dur = a_dur + 0.35

                else:

                    target_dur = max(v_dur, a_dur)



                if target_dur > 0.6:

                    fade_st = max(0.1, target_dur - 0.4)

                    af_filter = f"[1:a]afade=t=out:st={fade_st:.2f}:d=0.4[a]"

            except Exception as probe_err:

                pass



            if af_filter:

                filter_complex_str = f"{vf_filter}; {af_filter}"

                map_audio_str = "[a]"

            else:

                filter_complex_str = vf_filter

                map_audio_str = "1:a:0?"



            cmd = [

                "ffmpeg", "-y",

                "-i", webm_input,

                "-i", audio_path,

                "-filter_complex", filter_complex_str,

                "-map", "[v]", "-map", map_audio_str,

                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",

                "-c:a", "aac", "-b:a", "192k", "-shortest",

                output_path

            ]

        else:

            cmd = [

                "ffmpeg", "-y",

                "-i", webm_input,

                "-vf", "setpts=PTS-STARTPTS,fps=30",

                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",

                output_path

            ]



        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        

        if res.returncode != 0 or not os.path.exists(output_path):

            # Fallback direct transcode

            cmd_fallback = [

                "ffmpeg", "-y",

                "-i", webm_input,

                "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",

                output_path

            ]

            res_fb = subprocess.run(cmd_fallback, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

            if res_fb.returncode != 0 or not os.path.exists(output_path):

                err_msg = res.stderr[-500:] if res.stderr else "FFmpeg transcoding failed."

                shutil.rmtree(temp_dir, ignore_errors=True)

                return JSONResponse({"status": "error", "message": f"FFmpeg render error: {err_msg}"})



        shutil.rmtree(temp_dir, ignore_errors=True)



        mtime = int(os.path.getmtime(output_path)) if os.path.exists(output_path) else 1

        return JSONResponse({

            "status": "success",

            "videoUrl": f"/renders/{output_filename}?t={mtime}"

        })

    except Exception as e:

        return JSONResponse({"status": "error", "message": str(e)})



KINETIC_CACHE_DIR = os.path.join(DATA_DIR, "cache", "kinetic")

PADDED_CACHE_DIR = os.path.join(DATA_DIR, "cache", "padded_clips")

os.makedirs(KINETIC_CACHE_DIR, exist_ok=True)

os.makedirs(PADDED_CACHE_DIR, exist_ok=True)



@router.post("/check_kinetic_cache")

async def check_kinetic_cache(request: Request):

    """

    Checks which kinetic scenes are already rendered on server with identical hashes.

    Returns list of cached scene IDs so client skips re-rendering them.

    """

    try:

        data = await request.json()

        scenes = data.get("scenes", [])

        cached_ids = []



        for sc in scenes:

            sc_id = str(sc.get("id", ""))

            norm_id = normalize_sc_id(sc_id)

            sc_hash = sc.get("hash", "")



            hash_file = os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.hash")

            clip_file = os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.webm")

            alt_clip = os.path.join(AUDIO_DIR, f"kinetic_S{norm_id}.webm")



            has_clip = (os.path.exists(clip_file) and os.path.getsize(clip_file) > 1000) or (os.path.exists(alt_clip) and os.path.getsize(alt_clip) > 1000)



            if has_clip:

                if sc_hash and os.path.exists(hash_file):

                    try:

                        with open(hash_file, "r", encoding="utf-8") as f:

                            saved_hash = f.read().strip()

                        if saved_hash == sc_hash:

                            cached_ids.append(sc_id)

                            continue

                    except Exception:

                        pass

                elif not sc_hash:

                    cached_ids.append(sc_id)



        return JSONResponse({"status": "success", "cached": cached_ids})

    except Exception as e:

        return JSONResponse({"status": "error", "message": str(e), "cached": []})



@router.post("/upload_kinetic_webm")

@router.post("/upload_kinetic_clip")

async def upload_kinetic_clip(

    file: UploadFile = File(...),

    scene_id: str = Form(...),

    hash_str: str = Form(None)

):

    try:

        norm_id = normalize_sc_id(scene_id)

        raw_id = str(scene_id).strip()

        filenames = [

            f"kinetic_S{norm_id}.webm",

            f"kinetic_{norm_id}.webm",

            f"kinetic_{raw_id}.webm"

        ]



        content = await file.read()

        target_path = os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.webm")

        for fn in filenames:

            for d in [AUDIO_DIR, KINETIC_CACHE_DIR]:

                try:

                    with open(os.path.join(d, fn), "wb") as f:

                        f.write(content)

                except Exception:

                    pass



        if hash_str:

            hash_file = os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.hash")

            with open(hash_file, "w", encoding="utf-8") as f:

                f.write(hash_str.strip())



        return JSONResponse({

            "status": "success",

            "filename": f"kinetic_S{norm_id}.webm",

            "path": target_path

        })

    except Exception as e:

        return JSONResponse({"status": "error", "message": str(e)})



def sec_to_timecode_fcp(seconds, fps=30):

    total_frames = int(round(seconds * fps))

    f = total_frames % fps

    s = int(seconds) % 60

    m = (int(seconds) // 60) % 60

    h = int(seconds) // 3600

    return f"{h:02d}:{m:02d}:{s:02d}:{f:02d}"



def sec_to_srt_time(seconds):

    ms = int(round((seconds - int(seconds)) * 1000))

    s = int(seconds) % 60

    m = (int(seconds) // 60) % 60

    h = int(seconds) // 3600

    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"



@router.post("/davinci_package")

async def export_davinci_package(request: Request):

    """

    Exports a complete, ready-to-edit DaVinci Resolve Project ZIP package containing:

    1. timeline_davinci.xml (FCP7 / DaVinci XML timeline with handles for transitions and zoom motion)

    2. timeline_davinci.fcpxml (FCPXML 1.8 timeline)

    3. subtitles.srt (Subtitle track with exact Whisper timestamps)

    4. timeline_markers.csv & .edl (DaVinci timeline markers for all scenes)

    5. scene_script_log.txt & timeline_timestamps.json (Comprehensive scene logs)

    6. README_HOW_TO_IMPORT.txt (Detailed instructions)

    7. media/ (All AI images, kinetic video clips, voiceover track, BGM track)

    """

    try:

        data = await request.json()

        project_id = data.get("projectId", "default")

        project_name = data.get("projectName", "SceneUI_Project") or "SceneUI_Project"

        clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', project_name)



        fps_val = int(data.get("fps", 30))

        if fps_val not in [8, 12, 16, 20, 24, 25, 30, 50, 60]:

            fps_val = 30



        res_str = data.get("resolution", "1920x1080")

        try:

            w_str, h_str = res_str.split("x")

            width, height = int(w_str), int(h_str)

        except Exception:

            width, height = 1920, 1080



        ken_burns = data.get("kenBurnsMode", "cinematic")

        intensity_val = int(data.get("kenBurnsIntensity", 15))

        transition_mode = data.get("transitionMode", "dissolve")

        transition_dur = float(data.get("transitionDur", 0.6))

        trans_frames = max(6, int(round(transition_dur * fps_val)))



        timeline = data.get("timeline", [])

        scenes = data.get("scenes", [])

        outputs = data.get("outputs", [])

        kinetic_scenes = data.get("kineticScenes", [])

        audio_track_url = data.get("audioTrack", None)

        scene_text_by_id = data.get("sceneTextById", {})



        temp_dir = tempfile.mkdtemp(prefix="sceneui_davinci_")

        media_dir = os.path.join(temp_dir, "media")

        os.makedirs(media_dir, exist_ok=True)



        # Map scene texts, prompts, and kinetic configs

        scene_map = {}

        for s in scenes:

            if isinstance(s, dict) and "id" in s:

                scene_map[normalize_sc_id(s["id"])] = s



        kinetic_map = {}

        for k in kinetic_scenes:

            if isinstance(k, dict) and "id" in k:

                kinetic_map[normalize_sc_id(k["id"])] = k



        # Build timeline item list

        timeline_items = []

        for item in timeline:

            sc_id = str(item.get("id", ""))

            dur = float(item.get("dur", 4.0))

            if dur <= 0:

                dur = 4.0

            timeline_items.append({

                "id": sc_id,

                "dur": dur,

                "text": item.get("text", "")

            })



        if not timeline_items and scenes:

            for s in scenes:

                sc_id = str(s.get("id", ""))

                timeline_items.append({

                    "id": sc_id,

                    "dur": 4.0,

                    "text": s.get("text", s.get("prompt", ""))

                })



        # Locate and copy all media

        output_files = {}

        for out in outputs:

            if isinstance(out, dict):

                norm_out_id = normalize_sc_id(out.get("sceneId", ""))

                main_id = out.get("mainId")

                matched_url = None

                if main_id and "variations" in out:

                    for v in out["variations"]:

                        if v.get("id") == main_id:

                            matched_url = v.get("url")

                            break

                if not matched_url and out.get("variations"):

                    matched_url = out["variations"][-1].get("url")

                if matched_url:

                    output_files[norm_out_id] = matched_url



        processed_scenes = []

        copied_media = {}

        cumulative_frames = 0

        cumulative_sec = 0.0

        handle_sec = 1.0

        handle_frames = max(15, int(round(handle_sec * fps_val)))



        for idx, item in enumerate(timeline_items):

            sc_id = item["id"]

            norm_id = normalize_sc_id(sc_id)

            dur = item["dur"]

            dur_frames = max(1, int(round(dur * fps_val)))



            sc_obj = scene_map.get(norm_id, {})

            k_obj = kinetic_map.get(norm_id, {})

            sc_text = item["text"] or sc_obj.get("text", sc_obj.get("prompt", f"Scene {sc_id}"))

            sc_char = sc_obj.get("character", sc_obj.get("speaker", "NARRATOR"))

            sc_prompt = sc_obj.get("prompt", "")



            # 1. Prioritetas: Tikras scenos AI / įkeltas vaizdas iš outputs

            source_path = None

            raw_url = output_files.get(norm_id) or output_files.get(sc_id) or output_files.get(str(norm_id))

            if raw_url:

                source_path = resolve_file_path(raw_url)



            # 2. Tik jei vaizdo nėra, tikriname ar yra paruoštas kinetinio teksto klipas

            if not source_path or not os.path.exists(source_path):

                kinetic_candidates = [

                    os.path.join(KINETIC_CACHE_DIR, f"kinetic_S{norm_id}.webm"),

                    os.path.join(AUDIO_DIR, f"kinetic_S{norm_id}.webm"),

                    os.path.join(AUDIO_DIR, f"kinetic_S{sc_id}.webm"),

                    os.path.join(VAULT_DIR, f"kinetic_S{norm_id}.webm"),

                    os.path.join(AUDIO_DIR, f"kinetic_S{norm_id}.mp4"),

                    os.path.join(AUDIO_DIR, f"kinetic_S{sc_id}.mp4")

                ]

                for kc in kinetic_candidates:

                    if os.path.exists(kc) and os.path.getsize(kc) > 1000:

                        source_path = kc

                        break



            is_video = False

            media_filename = f"S{norm_id}_image.png"



            if source_path and os.path.exists(source_path):

                ext = os.path.splitext(source_path)[1].lower()

                if ext in [".mp4", ".mov", ".webm", ".mkv"]:

                    is_video = True

                    media_filename = f"S{norm_id}_clip.mp4"

                    dest_media_path = os.path.join(temp_dir, media_filename)

                    cache_key = f"padded_S{norm_id}_{int(os.path.getmtime(source_path))}_{fps_val}_{width}x{height}_{int(handle_sec*10)}.mp4"

                    cached_padded_path = os.path.join(PADDED_CACHE_DIR, cache_key)

                    if os.path.exists(cached_padded_path) and os.path.getsize(cached_padded_path) > 1000:

                        shutil.copyfile(cached_padded_path, dest_media_path)

                    else:

                        pad_cmd = [

                            "ffmpeg", "-y",

                            "-i", source_path,

                            "-filter_complex", f"[0:v]tpad=start_duration={handle_sec}:stop_duration={handle_sec}:start_mode=clone:stop_mode=clone,fps={fps_val},scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v]",

                            "-map", "[v]",

                            "-c:v", "libx264", "-preset", "fast", "-crf", "18",

                            "-an",

                            cached_padded_path

                        ]

                        subprocess.run(pad_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

                        if os.path.exists(cached_padded_path) and os.path.getsize(cached_padded_path) > 0:

                            shutil.copyfile(cached_padded_path, dest_media_path)

                        else:

                            shutil.copyfile(source_path, dest_media_path)



                    in_f = handle_frames

                    out_f = handle_frames + dur_frames

                    file_total_f = dur_frames + (2 * handle_frames)

                else:

                    dest_media_path = os.path.join(temp_dir, media_filename)

                    try:

                        from PIL import Image

                        with Image.open(source_path) as im:

                            im.convert("RGB").save(dest_media_path, "PNG")

                    except Exception:

                        shutil.copyfile(source_path, dest_media_path)

                    in_f = 0

                    out_f = dur_frames

                    file_total_f = dur_frames

            else:

                # Generate clean high-res text card using kinetic config if present

                dest_media_path = os.path.join(temp_dir, media_filename)

                t1 = k_obj.get("text1", f"SCENE {norm_id}")

                t2 = k_obj.get("text2", sc_text[:60])

                bg_col = k_obj.get("bgColor", "#000000")

                tx_col = k_obj.get("textColor", "#ffffff")

                create_styled_text_slide(norm_id, t1, t2, dest_media_path, bg_color=bg_col, text_color=tx_col, width=width, height=height)

                in_f = 0

                out_f = dur_frames

                file_total_f = dur_frames



            copied_media[sc_id] = media_filename



            processed_scenes.append({

                "index": idx + 1,

                "id": norm_id,

                "norm_id": norm_id,

                "dur_sec": dur,

                "dur_frames": dur_frames,

                "start_sec": cumulative_sec,

                "end_sec": cumulative_sec + dur,

                "start_frame": cumulative_frames,

                "end_frame": cumulative_frames + dur_frames,

                "in_frame": in_f,

                "out_frame": out_f,

                "file_total_frames": file_total_f,

                "text": sc_text,

                "character": sc_char,

                "prompt": sc_prompt,

                "media_filename": media_filename,

                "is_video": is_video

            })



            cumulative_frames += dur_frames

            cumulative_sec += dur



        total_timeline_frames = cumulative_frames

        total_timeline_sec = cumulative_sec



        # Locate the audio track that best matches the full timeline duration

        audio_candidates = []

        if audio_track_url:

            p = resolve_file_path(audio_track_url)

            if p and os.path.exists(p):

                audio_candidates.append(p)



        for pattern in ["*full*.wav", "*dialogue*.wav", "demo_proj*.wav", "track_*.wav", "*.wav", "*.mp3"]:

            for f in glob.glob(os.path.join(AUDIO_DIR, pattern)):

                if f not in audio_candidates:

                    audio_candidates.append(f)



        selected_audio_path = None

        closest_diff = float("inf")

        import wave

        for ac in audio_candidates:

            try:

                w = wave.open(ac, 'r')

                dur_sec = w.getnframes() / float(w.getframerate())

                w.close()

                diff = abs(dur_sec - total_timeline_sec)

                if diff < closest_diff:

                    closest_diff = diff

                    selected_audio_path = ac

                    if diff < 10.0: # Close match to full project duration

                        break

            except Exception:

                pass



        if not selected_audio_path and audio_candidates:

            selected_audio_path = audio_candidates[0]



        has_audio = False

        audio_media_filename = "voiceover_audio.wav"

        actual_audio_frames = total_timeline_frames

        if selected_audio_path and os.path.exists(selected_audio_path):

            dest_audio_path = os.path.join(temp_dir, audio_media_filename)

            # Render exact matching duration 48kHz Stereo 16-bit PCM WAV

            conv_cmd = [

                "ffmpeg", "-y",

                "-i", selected_audio_path,

                "-ar", "48000",

                "-ac", "2",

                "-t", str(total_timeline_sec),

                "-c:a", "pcm_s16le",

                dest_audio_path

            ]

            subprocess.run(conv_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            if not os.path.exists(dest_audio_path) or os.path.getsize(dest_audio_path) == 0:

                shutil.copyfile(selected_audio_path, dest_audio_path)



            try:

                w = wave.open(dest_audio_path, 'r')

                actual_audio_frames = int(round((w.getnframes() / float(w.getframerate())) * fps_val))

                w.close()

            except Exception:

                actual_audio_frames = total_timeline_frames

            has_audio = True



        # =========================================================================

        # 1. BUILD FCP 7 XML (timeline.xml)

        # =========================================================================

        video_clipitems_xml = []

        for i, sc in enumerate(processed_scenes):

            in_f = sc["in_frame"]

            out_f = sc["out_frame"]

            file_tot_f = sc["file_total_frames"]

            clip_id = f"clipitem-{sc['index']}"

            file_id = f"file-{sc['index']}"

            safe_title = re.sub(r'[<>&"\']', ' ', sc["text"][:30]).strip()



            item_xml = f"""

                    <clipitem id="{clip_id}">

                        <name>S{sc['id']} - {safe_title}</name>

                        <duration>{sc['dur_frames']}</duration>

                        <rate>

                            <timebase>{fps_val}</timebase>

                            <ntsc>FALSE</ntsc>

                        </rate>

                        <start>{sc['start_frame']}</start>

                        <end>{sc['end_frame']}</end>

                        <in>{in_f}</in>

                        <out>{out_f}</out>

                        <file id="{file_id}">

                            <name>{sc['media_filename']}</name>

                            <pathurl>file://localhost/{sc['media_filename']}</pathurl>

                            <rate>

                                <timebase>{fps_val}</timebase>

                                <ntsc>FALSE</ntsc>

                            </rate>

                            <duration>{file_tot_f}</duration>

                            <media>

                                <video>

                                    <samplecharacteristics>

                                        <width>{width}</width>

                                        <height>{height}</height>

                                    </samplecharacteristics>

                                </video>

                            </media>

                        </file>

                        <sourcetrack>

                            <mediatype>video</mediatype>

                            <trackindex>1</trackindex>

                        </sourcetrack>

                    </clipitem>"""

            video_clipitems_xml.append(item_xml)



            # Insert DaVinci transition item between clips if requested

            if transition_mode != "none" and i < len(processed_scenes) - 1:

                half_t = trans_frames // 2

                tr_start = max(sc['start_frame'], sc['end_frame'] - half_t)

                tr_end = sc['end_frame'] + half_t

                tr_xml = f"""

                    <transitionitem>

                        <start>{tr_start}</start>

                        <end>{tr_end}</end>

                        <alignment>center</alignment>

                        <effect>

                            <name>Cross Dissolve</name>

                            <effectid>Cross Dissolve</effectid>

                            <effecttype>transition</effecttype>

                            <mediatype>video</mediatype>

                        </effect>

                    </transitionitem>"""

                video_clipitems_xml.append(tr_xml)



        audio_track_xml = ""

        if has_audio:

            audio_track_xml = f"""

            <audio>

                <numOutputChannels>2</numOutputChannels>

                <format>

                    <samplecharacteristics>

                        <depth>16</depth>

                        <samplerate>48000</samplerate>

                    </samplecharacteristics>

                </format>

                <track>

                    <clipitem id="audio-voiceover-1">

                        <name>{audio_media_filename}</name>

                        <duration>{actual_audio_frames}</duration>

                        <rate>

                            <timebase>{fps_val}</timebase>

                            <ntsc>FALSE</ntsc>

                        </rate>

                        <start>0</start>

                        <end>{actual_audio_frames}</end>

                        <in>0</in>

                        <out>{actual_audio_frames}</out>

                        <file id="file-audio-main">

                            <name>{audio_media_filename}</name>

                            <pathurl>file://localhost/{audio_media_filename}</pathurl>

                            <rate>

                                <timebase>{fps_val}</timebase>

                                <ntsc>FALSE</ntsc>

                            </rate>

                            <duration>{actual_audio_frames}</duration>

                            <media>

                                <audio>

                                    <samplecharacteristics>

                                        <depth>16</depth>

                                        <samplerate>48000</samplerate>

                                    </samplecharacteristics>

                                    <channelcount>2</channelcount>

                                </audio>

                            </media>

                        </file>

                        <sourcetrack>

                            <mediatype>audio</mediatype>

                            <trackindex>1</trackindex>

                        </sourcetrack>

                    </clipitem>

                    <enabled>TRUE</enabled>

                    <locked>FALSE</locked>

                </track>

            </audio>"""



        fcp7_xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>

<!DOCTYPE xmeml>

<xmeml version="4">

    <sequence id="sequence-1">

        <name>{clean_name}_DaVinci_Timeline</name>

        <duration>{total_timeline_frames}</duration>

        <rate>

            <timebase>{fps_val}</timebase>

            <ntsc>FALSE</ntsc>

        </rate>

        <timecode>

            <rate>

                <timebase>{fps_val}</timebase>

                <ntsc>FALSE</ntsc>

            </rate>

            <string>00:00:00:00</string>

            <frame>0</frame>

        </timecode>

        <media>

            <video>

                <format>

                    <samplecharacteristics>

                        <width>{width}</width>

                        <height>{height}</height>

                        <pixelaspectratio>square</pixelaspectratio>

                        <rate>

                            <timebase>{fps_val}</timebase>

                            <ntsc>FALSE</ntsc>

                        </rate>

                    </samplecharacteristics>

                </format>

                <track>

{''.join(video_clipitems_xml)}

                </track>

            </video>{audio_track_xml}

        </media>

    </sequence>

</xmeml>"""



        # =========================================================================

        # 1. BUILD FCP 7 XML (timeline.xml) & FCPXML 1.8 (timeline.fcpxml)

        # =========================================================================

        with open(os.path.join(temp_dir, "timeline.xml"), "w", encoding="utf-8") as f:

            f.write(fcp7_xml_content)



        # Build FCPXML 1.8 sequence as alternative format

        fcpxml_spine_items = []

        for sc in processed_scenes:

            safe_title = re.sub(r'[<>&"\']', ' ', sc["text"][:40]).strip()

            base_rate = (intensity_val / 4.0) if intensity_val > 0 else 2.5

            zoom_delta = max(2.0, min(45.0, round(sc["dur_sec"] * base_rate, 1)))

            start_ratio = 1.0

            end_ratio = round(1.0 + (zoom_delta / 100.0), 3)

            if ken_burns in ["zoom_out", "zoom_out_center"]:

                start_ratio = round(1.0 + (zoom_delta / 100.0), 3)

                end_ratio = 1.0



            fcpxml_spine_items.append(

                f'                <asset-clip name="S{sc["id"]} - {safe_title}" offset="{sc["start_frame"]*100}/{fps_val*100}s" '

                f'duration="{sc["dur_frames"]*100}/{fps_val*100}s" start="0s">\n'

                f'                    <adjust-transform scale="{start_ratio} {start_ratio}" position="0 0">\n'

                f'                        <param name="scale" key="0s" value="{start_ratio} {start_ratio}" />\n'

                f'                        <param name="scale" key="{sc["dur_sec"]:.3f}s" value="{end_ratio} {end_ratio}" />\n'

                f'                    </adjust-transform>\n'

                f'                </asset-clip>'

            )



        fcpxml_content = f"""<?xml version="1.0" encoding="UTF-8"?>

<!DOCTYPE fcpxml>

<fcpxml version="1.8">

    <resources>

        <format id="r1" name="FFVideoFormat{height}p{fps_val}" frameDuration="100/{fps_val*100}s" width="{width}" height="{height}" />

    </resources>

    <library>

        <event name="{clean_name}">

            <project name="{clean_name}_Sequence">

                <sequence format="r1">

                    <spine>

{chr(10).join(fcpxml_spine_items)}

                    </spine>

                </sequence>

            </project>

        </event>

    </library>

</fcpxml>"""



        with open(os.path.join(temp_dir, "timeline.fcpxml"), "w", encoding="utf-8") as f:

            f.write(fcpxml_content)



        # Also write subtitles.srt for convenient subtitle import

        srt_lines = []

        for sc in processed_scenes:

            clean_text = sc["text"].strip()

            if not clean_text:

                clean_text = f"Scene #{sc['id']}"

            t_start = sec_to_srt_time(sc["start_sec"])

            t_end = sec_to_srt_time(sc["end_sec"])

            srt_lines.append(f"{sc['index']}\n{t_start} --> {t_end}\n{clean_text}\n")



        with open(os.path.join(temp_dir, "subtitles.srt"), "w", encoding="utf-8") as f:

            f.write("\n".join(srt_lines))



        # Short & Clean README.txt

        readme_content = f"""========================================================================================

🎬 SCENE UI PRO — DAVINCI RESOLVE TIMELINE

========================================================================================

Projektas: {project_name}

Scenos: {len(processed_scenes)} | Trukmė: {total_timeline_sec:.2f}s | FPS: {fps_val}



📌 1-AS METODAS (GREIČIAUSIAS IR 100% AUTOMATINIS):

1. Išskleiskite šį ZIP archyvą į atskirą aplanką.

2. Atidarykite DaVinci Resolve ir sukurkite naują tuščią projektą.

3. Išskleistame aplanke pažymėkite VISUS failus (Ctrl + A) ir NUTEMPKITE juos į DaVinci Resolve „Media Pool“ langą!

4. Dabar nutempkite failą „timeline.xml“ į laiko juostą (Timeline) arba Media Pool.

5. Visi vaizdai, kinetiniai video, lėtas zoom efektas ir garsas akimirksniu bus sujungti!



📌 2-AS METODAS (PER VIRŠUTINĮ MENIU):

1. DaVinci Resolve spauskite: File ➔ Import ➔ Timeline... (Ctrl + Shift + I).

2. Pasirinkite failą: „timeline.xml“.

3. Kai DaVinci paklaus „Search in directories?“, paspauskite „Yes“ (Taip) ir nurodykite šį išskleistą aplanką.

========================================================================================"""



        with open(os.path.join(temp_dir, "README.txt"), "w", encoding="utf-8") as f:

            f.write(readme_content)



        # =========================================================================

        # 2. ZIP THE CLEAN PACKAGE

        # =========================================================================

        zip_filename = f"{clean_name}_DaVinci_Resolve_Package.zip"

        zip_output_path = os.path.join(VAULT_DIR, zip_filename)



        with zipfile.ZipFile(zip_output_path, "w", zipfile.ZIP_DEFLATED) as zipf:

            for root, dirs, files in os.walk(temp_dir):

                for file in files:

                    file_path = os.path.join(root, file)

                    rel_path = os.path.relpath(file_path, temp_dir)

                    zipf.write(file_path, rel_path)



        shutil.rmtree(temp_dir, ignore_errors=True)



        return JSONResponse({

            "status": "success",

            "zipUrl": f"/vault/{zip_filename}?t={int(os.path.getmtime(zip_output_path))}",

            "zipName": zip_filename,

            "totalScenes": len(processed_scenes),

            "durationSec": total_timeline_sec,

            "fps": fps_val

        })



    except Exception as e:

        import traceback

        traceback.print_exc()

        return JSONResponse({"status": "error", "message": str(e)})

