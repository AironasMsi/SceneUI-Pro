# ============================================================================
# BUILT-IN WHISPER ENGINE & SMART SCRIPT ALIGN (BACKUP COPY)
# ============================================================================
# This module contains the standalone, exact mirror of the Whisper 2 
# word-level sequence alignment engine (smart_script_align) with Faster-Whisper.
#
# Created: 2026-08-21
# ============================================================================

import os
import re
import difflib
import logging
from typing import List, Dict, Any

logger = logging.getLogger("whisper_builtin_backup")

def _tok(s: str) -> List[str]:
    """Tokenize text into lowercase alphanumeric words."""
    return re.findall(r"[a-z0-9]+", (s or "").lower())

def smart_script_align(script_text: str, words: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Exact mirror of smart_script_align from Whisper 2 (server.py).
    Matches script text tokens 1-to-1 with transcribed words using difflib SequenceMatcher
    and number expansion normalization.
    """
    num_map = {str(i): w for i, w in zip(range(30), [
        "zero","one","two","three","four","five","six","seven","eight","nine","ten",
        "eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen",
        "eighteen","nineteen","twenty","twentyone","twentytwo","twentythree","twentyfour",
        "twentyfive","twentysix","twentyseven","twentyeight","twentynine"
    ])}
    num_map.update({
        "30": "thirty", "40": "forty", "50": "fifty", "60": "sixty",
        "70": "seventy", "80": "eighty", "90": "ninety", "100": "hundred"
    })

    script_tokens = _tok(script_text)
    trans_tokens = [_tok(w.get("word", ""))[0] if _tok(w.get("word", "")) else "" for w in words]
    
    sc_norm = [num_map.get(t, t) for t in script_tokens]
    tr_norm = [num_map.get(t, t) for t in trans_tokens]
    
    matcher = difflib.SequenceMatcher(None, sc_norm, tr_norm)
    aligned = []
    matched = 0
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                w = words[j1 + k]
                aligned.append({
                    "script_word": script_tokens[i1 + k], 
                    "start": w.get("start"), 
                    "end": w.get("end"), 
                    "confidence": w.get("score"), 
                    "matched": True
                })
                matched += 1
        else:
            for k in range(i1, i2):
                aligned.append({
                    "script_word": script_tokens[k], 
                    "start": None, 
                    "end": None, 
                    "confidence": None, 
                    "matched": False
                })
                
    return {
        "script_word_count": len(script_tokens), 
        "matched_word_count": matched, 
        "match_rate": (matched / max(1, len(script_tokens))), 
        "aligned_words": aligned
    }

def align_project_scenes(scenes: List[Dict[str, Any]], script_align_res: Dict[str, Any], total_duration: float) -> List[Dict[str, Any]]:
    """
    Distributes aligned word timestamps across project scenes without gaps or desync.
    """
    aligned_words = script_align_res.get("aligned_words", [])
    aligned_scenes = []
    token_cursor = 0

    for sc in scenes:
        sc_text = (sc.get("text") or sc.get("prompt") or "").strip()
        tokens = _tok(sc_text)
        count = len(tokens)

        if count == 0:
            prev_end = aligned_scenes[-1]["end"] if aligned_scenes else 0.0
            aligned_scenes.append({
                "id": sc.get("id"),
                "start": prev_end,
                "end": prev_end + 2.0,
                "duration": 2.0,
                "dur": 2.0,
                "originalStart": prev_end,
                "originalEnd": prev_end + 2.0,
                "text": ""
            })
            continue

        slice_w = aligned_words[token_cursor : token_cursor + count]
        token_cursor += count

        matched_w = [w for w in slice_w if w.get("matched") and w.get("start") is not None and w.get("end") is not None]

        if matched_w:
            st = matched_w[0]["start"]
            en = matched_w[-1]["end"]
            dur = max(0.4, round(en - st, 2))
            aligned_scenes.append({
                "id": sc.get("id"),
                "start": st,
                "end": en,
                "duration": dur,
                "dur": dur,
                "originalStart": st,
                "originalEnd": en,
                "text": sc_text
            })
        else:
            prev_end = aligned_scenes[-1]["end"] if aligned_scenes else 0.0
            dur = max(1.0, round(count * 0.35, 2))
            aligned_scenes.append({
                "id": sc.get("id"),
                "start": prev_end,
                "end": prev_end + dur,
                "duration": dur,
                "dur": dur,
                "originalStart": prev_end,
                "originalEnd": prev_end + dur,
                "text": sc_text
            })

    return aligned_scenes
