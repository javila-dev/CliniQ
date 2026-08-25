import json

import httpx
from django.conf import settings


async def validate_enrollment(photo_bytes: bytes, filename: str, *, config=None) -> dict:
    """
    Llama a /v1/enroll del servicio de reconocimiento facial hospedado.
    Si se pasa `config` (ConfiguracionFacial), reenvía los límites de pose
    configurados por la clínica para que el servicio bloquee bad_pose acorde.
    """
    url = f"{settings.FACE_SERVICE_URL}/v1/enroll"
    data = {}
    if config is not None:
        data["max_yaw"] = config.max_yaw
        data["max_pitch"] = config.max_pitch
        data["max_roll"] = config.max_roll

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
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
        response = await client.post(
            url,
            headers={"x-api-key": settings.FACE_SERVICE_API_KEY},
            files={"image": ("live.jpg", live_photo_bytes, "image/jpeg")},
            data=data,
        )
        response.raise_for_status()
        return response.json()
