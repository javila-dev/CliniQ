import asyncio
import json

import httpx
from django.conf import settings

_RETRYABLE_STATUS_CODES = {502, 503, 504}
_MAX_RETRIES = 2
_RETRY_BACKOFF_SECONDS = 0.5


async def _post_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response:
    """
    Reintenta ante errores transitorios: conexión/timeout (el servicio con un
    solo worker puede tardar en liberar el event loop bajo carga) o 502/503/504
    (redeploy en curso). No reintenta 4xx: esos son errores del cliente/imagen
    que no van a cambiar con un segundo intento.
    """
    for intento in range(_MAX_RETRIES + 1):
        try:
            response = await client.post(url, **kwargs)
        except httpx.TransportError:
            if intento >= _MAX_RETRIES:
                raise
        else:
            if response.status_code not in _RETRYABLE_STATUS_CODES or intento >= _MAX_RETRIES:
                return response
        await asyncio.sleep(_RETRY_BACKOFF_SECONDS * (intento + 1))


async def validate_enrollment(photo_bytes: bytes, filename: str, *, config=None) -> dict:
    """
    Llama a /v1/enroll del servicio de reconocimiento facial hospedado.
    Si se pasa `config` (ConfiguracionFacial), reenvía los límites de pose
    y calidad configurados por la clínica para que el servicio bloquee
    (ok=False) según esos umbrales en vez de solo devolver warnings locales.
    """
    url = f"{settings.FACE_SERVICE_URL}/v1/enroll"
    data = {}
    if config is not None:
        data["max_yaw"] = config.max_yaw
        data["max_pitch"] = config.max_pitch
        data["max_roll"] = config.max_roll
        data["min_det_score"] = config.min_det_score
        data["min_face_ratio"] = config.min_face_area_pct
        data["min_laplacian_var"] = config.min_blur_score
        data["min_brightness"] = config.min_brightness
        data["max_brightness"] = config.max_brightness
        # El servicio parsea min_resolution con int(): "400.0" (FloatField) da 422.
        data["min_resolution"] = int(round(config.min_resolution))

    async with httpx.AsyncClient(timeout=30) as client:
        response = await _post_with_retry(
            client,
            url,
            headers={"x-api-key": settings.FACE_SERVICE_API_KEY},
            files={"image": (filename, photo_bytes, "image/jpeg")},
            data=data,
        )
        response.raise_for_status()
        return response.json()


async def verify(live_photo_bytes: bytes, control_embedding_list: list[float], *, config=None) -> dict:
    """
    Llama a /v1/match del servicio de reconocimiento facial hospedado.
    No se envía `threshold`: la clasificación por nivel de confianza
    (alta/media/baja) se hace en face_service.evaluar_checkin usando
    match_score directamente contra ConfiguracionFacial.umbral_alta/media.
    """
    url = f"{settings.FACE_SERVICE_URL}/v1/match"
    data = {"embedding": json.dumps(control_embedding_list)}
    if config is not None:
        data["max_yaw"] = config.max_yaw
        data["max_pitch"] = config.max_pitch
        data["max_roll"] = config.max_roll

    async with httpx.AsyncClient(timeout=10) as client:
        response = await _post_with_retry(
            client,
            url,
            headers={"x-api-key": settings.FACE_SERVICE_API_KEY},
            files={"image": ("live.jpg", live_photo_bytes, "image/jpeg")},
            data=data,
        )
        response.raise_for_status()
        return response.json()
