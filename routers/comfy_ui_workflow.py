"""
comfy_ui_workflow.py
====================

Konvertuoja ComfyUI *API formato* promptą ({"3": {"class_type": ..., "inputs": {...}}})
į pilną *UI (LiteGraph) workflow* formatą ({"nodes": [...], "links": [...]}),
kurį ComfyUI įrašo į PNG "workflow" chunk'ą.

Kodėl to reikia:
  * Kai promptas siunčiamas per /prompt API be `extra_data.extra_pnginfo.workflow`,
    ComfyUI į PNG įrašo tik "prompt" (API) chunk'ą. Naujesnis ComfyUI frontend'as
    (Assets / Queue panelė, "Open workflow") workflow ima TIK iš
    `extra_pnginfo.workflow` -> tokiems vaizdams nieko neparodo.
  * Statinis / neteisingas UI workflow (be inputs/outputs, su netinkamais
    widgets_values) sugadina vaizdą: ComfyUI rodo tuščią drobę su
    "corrupt linking data" klaida.

Naudojimas:
    from comfy_ui_workflow import build_extra_data
    payload = {"prompt": api_prompt, "client_id": cid,
               "extra_data": build_extra_data(api_prompt, node_url)}

Modulis neturi priklausomybių (tik standartinė biblioteka).
"""
from __future__ import annotations

import copy
import json
import threading
import time
import urllib.request
import uuid

__all__ = [
    "api_to_ui_workflow",
    "build_extra_data",
    "get_object_info",
    "get_object_info_async",
    "inject_workflow",
    "is_api_prompt",
]

# ---------------------------------------------------------------------------
# /object_info cache (vienam ComfyUI serveriui)
# ---------------------------------------------------------------------------
_OBJECT_INFO_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = 600.0  # s

WIDGET_TYPES = {"INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"}
UPLOAD_FLAGS = ("image_upload", "video_upload", "audio_upload", "animated_image_upload", "mesh_upload", "model_upload")


def _cache_get(base: str, needed: set[str] | None):
    with _CACHE_LOCK:
        hit = _OBJECT_INFO_CACHE.get(base)
    if not hit:
        return None
    ts, info = hit
    if time.time() - ts > _CACHE_TTL:
        return None
    if needed and not needed.issubset(info.keys()):
        return None  # naujas custom node -> perkrauti
    return info


def _cache_put(base: str, info: dict):
    with _CACHE_LOCK:
        _OBJECT_INFO_CACHE[base] = (time.time(), info)


def get_object_info(node_url: str, needed: set[str] | None = None, timeout: float = 20.0) -> dict:
    """Sinchroniškai gauna (ir kešuoja) ComfyUI /object_info."""
    base = node_url.rstrip("/")
    info = _cache_get(base, needed)
    if info is not None:
        return info
    with urllib.request.urlopen(f"{base}/object_info", timeout=timeout) as r:
        info = json.loads(r.read().decode("utf-8"))
    _cache_put(base, info)
    return info


async def get_object_info_async(session, node_url: str, needed: set[str] | None = None) -> dict:
    """Asinchroninis variantas aiohttp sesijai."""
    base = node_url.rstrip("/")
    info = _cache_get(base, needed)
    if info is not None:
        return info
    async with session.get(f"{base}/object_info") as r:
        info = await r.json(content_type=None)
    _cache_put(base, info)
    return info


# ---------------------------------------------------------------------------
# Pagalbinės funkcijos
# ---------------------------------------------------------------------------
def is_api_prompt(p) -> bool:
    return (
        isinstance(p, dict)
        and len(p) > 0
        and all(isinstance(v, dict) and isinstance(v.get("class_type"), str) and isinstance(v.get("inputs"), dict)
                for v in p.values())
    )


def _is_link(v) -> bool:
    return (
        isinstance(v, list)
        and len(v) == 2
        and isinstance(v[0], (str, int))
        and isinstance(v[1], int)
        and not isinstance(v[1], bool)
    )


def _spec_type(spec):
    if not isinstance(spec, (list, tuple)) or not spec:
        return "*"
    return spec[0]


def _spec_opts(spec) -> dict:
    if isinstance(spec, (list, tuple)) and len(spec) > 1 and isinstance(spec[1], dict):
        return spec[1]
    return {}


def _is_widget_spec(spec) -> bool:
    t = _spec_type(spec)
    opts = _spec_opts(spec)
    if opts.get("forceInput") or opts.get("rawLink"):
        return False
    if isinstance(t, list):
        return True  # senas COMBO formatas
    return isinstance(t, str) and t.upper() in WIDGET_TYPES


def _type_name(spec) -> str:
    t = _spec_type(spec)
    if isinstance(t, list):
        return "COMBO"
    return str(t)


def _ordered_inputs(node_def: dict):
    """[(name, spec, required_bool)] tokia tvarka, kokia frontend'as kuria widget'us."""
    inp = node_def.get("input") or {}
    order = node_def.get("input_order") or {}
    out = []
    for section in ("required", "optional"):
        sec = inp.get(section) or {}
        names = order.get(section) or list(sec.keys())
        # input_order gali neturėti visų raktų
        names = list(names) + [n for n in sec.keys() if n not in names]
        for name in names:
            if name in sec:
                out.append((name, sec[name], section == "required"))
    return out


def _node_id(key, remap: dict, next_id: list):
    if key in remap:
        return remap[key]
    try:
        nid = int(key)
        if nid in remap.values():
            raise ValueError
    except (TypeError, ValueError):
        nid = next_id[0]
        next_id[0] += 1
    remap[key] = nid
    return nid


# ---------------------------------------------------------------------------
# Pagrindinė konversija
# ---------------------------------------------------------------------------
def api_to_ui_workflow(prompt: dict, object_info: dict | None = None) -> dict:
    """API promptą paverčia ComfyUI UI workflow (version 0.4) žodynu."""
    if not is_api_prompt(prompt):
        raise ValueError("Not an API-format prompt")
    object_info = object_info or {}

    # 1) ID priskyrimas (išlaikome skaitinius ID, kad sutaptų su 'prompt' chunk'u)
    keys = list(prompt.keys())
    numeric = []
    for k in keys:
        try:
            numeric.append(int(k))
        except (TypeError, ValueError):
            pass
    next_id = [max(numeric, default=0) + 1]
    remap: dict = {}
    for k in keys:  # pirmiausia skaitiniai
        try:
            int(k)
            _node_id(k, remap, next_id)
        except (TypeError, ValueError):
            pass
    for k in keys:
        _node_id(k, remap, next_id)

    nodes: dict = {}
    links: list = []
    link_id = 0

    # 2) Mazgai be jungčių
    for key in keys:
        entry = prompt[key]
        ctype = entry["class_type"]
        api_inputs = entry.get("inputs") or {}
        ndef = object_info.get(ctype)
        nid = remap[key]

        ui_inputs = []      # [{name,type,link,(widget)}]
        widgets_values = []
        input_slot_by_name = {}

        if ndef:
            for name, spec, _req in _ordered_inputs(ndef):
                val = api_inputs.get(name, None)
                if _is_widget_spec(spec):
                    opts = _spec_opts(spec)
                    linked = _is_link(val)
                    if linked:
                        input_slot_by_name[name] = len(ui_inputs)
                        ui_inputs.append({"name": name, "type": _type_name(spec), "link": None,
                                          "widget": {"name": name}})
                        wv = opts.get("default")
                        if wv is None:
                            t = _spec_type(spec)
                            wv = t[0] if isinstance(t, list) and t else (opts.get("options") or [None])[0] if isinstance(opts.get("options"), list) else None
                    else:
                        if name in api_inputs:
                            wv = val
                        else:
                            wv = opts.get("default")
                            if wv is None:
                                t = _spec_type(spec)
                                if isinstance(t, list) and t:
                                    wv = t[0]
                                elif isinstance(opts.get("options"), list) and opts["options"]:
                                    wv = opts["options"][0]
                    widgets_values.append(wv)
                    # papildomi "virtualūs" widget'ai, kuriuos frontend'as prideda
                    t = _type_name(spec).upper()
                    if t in ("INT", "FLOAT") and (opts.get("control_after_generate") or name in ("seed", "noise_seed")):
                        widgets_values.append("fixed")
                    elif t == "COMBO" and opts.get("control_after_generate"):
                        widgets_values.append("fixed")
                    if any(opts.get(f) for f in UPLOAD_FLAGS):
                        widgets_values.append("image")
                else:
                    input_slot_by_name[name] = len(ui_inputs)
                    ui_inputs.append({"name": name, "type": _type_name(spec), "link": None})
            # įvestys, kurių nėra apibrėžime (dinaminės, pvz. rgthree "lora_1")
            for name, val in api_inputs.items():
                if name in input_slot_by_name or any(name == n for n, _s, _r in _ordered_inputs(ndef)):
                    continue
                if _is_link(val):
                    input_slot_by_name[name] = len(ui_inputs)
                    ui_inputs.append({"name": name, "type": "*", "link": None})
                else:
                    widgets_values.append(val)
            outputs = []
            out_types = ndef.get("output") or []
            out_names = ndef.get("output_name") or []
            out_list = ndef.get("output_is_list") or []
            for i, ot in enumerate(out_types):
                o = {"name": out_names[i] if i < len(out_names) else str(ot),
                     "type": "COMBO" if isinstance(ot, list) else ot,
                     "links": [], "slot_index": i}
                if i < len(out_list) and out_list[i]:
                    o["shape"] = 6
                outputs.append(o)
            title = (entry.get("_meta") or {}).get("title") or ndef.get("display_name") or ctype
            is_output_node = bool(ndef.get("output_node"))
        else:
            # Nežinomas mazgas: išsaugome kiek galime
            for name, val in api_inputs.items():
                if _is_link(val):
                    input_slot_by_name[name] = len(ui_inputs)
                    ui_inputs.append({"name": name, "type": "*", "link": None})
                else:
                    widgets_values.append(val)
            outputs = []
            title = (entry.get("_meta") or {}).get("title") or ctype
            is_output_node = False

        n_widgets = len(widgets_values)
        multiline = 0
        if ndef:
            for name, spec, _r in _ordered_inputs(ndef):
                if _is_widget_spec(spec) and _spec_opts(spec).get("multiline"):
                    multiline += 1
        rows = max(len(ui_inputs), len(outputs))
        height = 30 + rows * 22 + n_widgets * 26 + multiline * 90
        node = {
            "id": nid,
            "type": ctype,
            "pos": [0, 0],
            "size": [340 if not multiline else 420, max(60, height)],
            "flags": {},
            "order": 0,
            "mode": 4 if entry.get("mode") == 4 else 0,
            "inputs": ui_inputs,
            "outputs": outputs,
            "properties": {"Node name for S&R": ctype},
            "widgets_values": widgets_values,
        }
        if title and title != ctype:
            node["title"] = title
        node["_slot_by_name"] = input_slot_by_name
        node["_is_output"] = is_output_node
        nodes[key] = node

    # 3) Jungtys
    for key in keys:
        entry = prompt[key]
        dst = nodes[key]
        for name, val in (entry.get("inputs") or {}).items():
            if not _is_link(val):
                continue
            src_key = str(val[0]) if str(val[0]) in nodes else val[0]
            if src_key not in nodes:
                continue
            src = nodes[src_key]
            slot = val[1]
            dst_slot = dst["_slot_by_name"].get(name)
            if dst_slot is None:
                continue
            # jei šaltinio išėjimų nežinome — susikuriame
            while len(src["outputs"]) <= slot:
                i = len(src["outputs"])
                src["outputs"].append({"name": f"out_{i}", "type": "*", "links": [], "slot_index": i})
            ltype = src["outputs"][slot]["type"]
            link_id += 1
            src["outputs"][slot]["links"].append(link_id)
            dst["inputs"][dst_slot]["link"] = link_id
            if dst["inputs"][dst_slot]["type"] == "*":
                dst["inputs"][dst_slot]["type"] = ltype
            links.append([link_id, src["id"], slot, dst["id"], dst_slot, ltype])

    # 4) Išdėstymas: stulpeliai pagal gylį (topologinis)
    deps = {k: set() for k in keys}
    for k in keys:
        for v in (prompt[k].get("inputs") or {}).values():
            if _is_link(v):
                s = str(v[0]) if str(v[0]) in nodes else v[0]
                if s in nodes and s != k:
                    deps[k].add(s)
    depth: dict = {}

    def _depth(k, stack=()):
        if k in depth:
            return depth[k]
        if k in stack:
            return 0
        d = 0
        for s in deps[k]:
            d = max(d, _depth(s, stack + (k,)) + 1)
        depth[k] = d
        return d

    for k in keys:
        _depth(k)
    columns: dict[int, list] = {}
    for k in keys:
        columns.setdefault(depth[k], []).append(k)
    x = 0
    order = 0
    for col in sorted(columns):
        y = 0
        width = 0
        for k in columns[col]:
            n = nodes[k]
            n["pos"] = [x, y]
            n["order"] = order
            order += 1
            y += n["size"][1] + 60
            width = max(width, n["size"][0])
        x += width + 80

    out_nodes = []
    for k in keys:
        n = nodes[k]
        n.pop("_slot_by_name", None)
        n.pop("_is_output", None)
        out_nodes.append(n)

    return {
        "id": str(uuid.uuid4()),
        "revision": 0,
        "last_node_id": max((n["id"] for n in out_nodes), default=0),
        "last_link_id": link_id,
        "nodes": out_nodes,
        "links": links,
        "groups": [],
        "config": {},
        "extra": {"ds": {"scale": 0.75, "offset": [40, 40]}},
        "version": 0.4,
    }


def inject_workflow(payload: dict, ui_workflow: dict) -> dict:
    """Įdeda UI workflow į /prompt payload'ą (extra_data.extra_pnginfo.workflow)."""
    extra = payload.get("extra_data")
    if not isinstance(extra, dict):
        extra = {}
        payload["extra_data"] = extra
    pnginfo = extra.get("extra_pnginfo")
    if not isinstance(pnginfo, dict):
        pnginfo = {}
        extra["extra_pnginfo"] = pnginfo
    pnginfo["workflow"] = ui_workflow
    return payload


def build_extra_data(prompt: dict, node_url: str | None = None, object_info: dict | None = None,
                     extra_pnginfo: dict | None = None) -> dict:
    """Paruošia `extra_data` su teisingu UI workflow. Niekada nemeta klaidų."""
    pnginfo = dict(extra_pnginfo or {})
    try:
        if object_info is None and node_url:
            needed = {v.get("class_type") for v in prompt.values() if isinstance(v, dict)}
            object_info = get_object_info(node_url, needed)
        pnginfo["workflow"] = api_to_ui_workflow(copy.deepcopy(prompt), object_info)
    except Exception as e:  # metaduomenys neturi trukdyti generavimui
        print(f"[comfy_ui_workflow] Nepavyko sukurti UI workflow: {e}")
    return {"extra_pnginfo": pnginfo}
