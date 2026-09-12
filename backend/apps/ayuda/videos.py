"""Parseo de URLs de video (YouTube / Vimeo) para el centro de ayuda.

No hace peticiones de red: solo extrae proveedor + id de la URL y arma la URL
del thumbnail cuando se puede derivar sin llamar a un tercero.
"""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

_YOUTUBE_HOSTS = {"youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"}
_YOUTUBE_PATH_RE = re.compile(r"^/(?:embed|shorts|v|live)/([\w-]{6,})")
_VIMEO_ID_RE = re.compile(r"(\d{6,})")


def parse_video(url: str) -> tuple[str | None, str | None]:
    """Devuelve ``(proveedor, video_id)`` o ``(None, None)`` si no se reconoce."""
    if not url:
        return None, None
    try:
        parts = urlparse(url.strip())
    except ValueError:
        return None, None

    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]

    if host in _YOUTUBE_HOSTS:
        if parts.path == "/watch":
            vid = parse_qs(parts.query).get("v", [None])[0]
            return ("youtube", vid) if vid else (None, None)
        match = _YOUTUBE_PATH_RE.match(parts.path)
        if match:
            return "youtube", match.group(1)
        return None, None

    if host == "youtu.be":
        vid = parts.path.lstrip("/").split("/")[0]
        return ("youtube", vid) if vid else (None, None)

    if host in {"vimeo.com", "player.vimeo.com"}:
        match = _VIMEO_ID_RE.search(parts.path)
        return ("vimeo", match.group(1)) if match else (None, None)

    return None, None


def thumbnail_url(proveedor: str | None, video_id: str | None) -> str | None:
    """URL de miniatura derivable sin red. Vimeo requiere oEmbed → se omite por ahora."""
    if proveedor == "youtube" and video_id:
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return None


def embed_url(proveedor: str | None, video_id: str | None) -> str | None:
    if proveedor == "youtube" and video_id:
        return f"https://www.youtube-nocookie.com/embed/{video_id}"
    if proveedor == "vimeo" and video_id:
        return f"https://player.vimeo.com/video/{video_id}"
    return None
