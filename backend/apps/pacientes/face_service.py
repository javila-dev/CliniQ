from apps.pacientes.models import ConfiguracionFacial

# Mensajes por defecto si el servicio no manda su propio texto para el codigo.
_MENSAJES_ISSUE = {
    "no_face": "No se detectó ningún rostro en la foto. Asegúrese de que el rostro esté centrado y bien iluminado.",
    "multiple_faces": "Se detectó más de un rostro en la foto. Asegúrese de que solo aparezca el paciente.",
    "low_confidence": "No se pudo detectar el rostro con suficiente confianza. Intente con mejor iluminación y de frente.",
    "face_too_small": "El rostro ocupa muy poco espacio en la foto. Acérquese más a la cámara.",
    "blurry": "La foto está desenfocada. Se recomienda una imagen más nítida.",
    "too_dark": "La foto está muy oscura. Mejore la iluminación.",
    "too_bright": "La foto está sobreexpuesta. Reduzca la iluminación directa.",
    "low_resolution": "La imagen tiene muy baja resolución.",
    "bad_pose": "El rostro no está mirando de frente. Pida al paciente que mire directo a la cámara.",
    "invalid_image": "No se pudo procesar la imagen enviada.",
    "image_too_large": "La imagen es demasiado pesada.",
    "unsupported_format": "El formato de la imagen no es compatible.",
    "embedding_dimension_mismatch": "El embedding de control no es compatible con el modelo actual. Vuelva a registrar la foto de control del paciente.",
}


def _mensaje_issue(issue: dict) -> str:
    return issue.get("message") or _MENSAJES_ISSUE.get(issue.get("code"), "No se pudo procesar la foto.")


def evaluar_enrollment(config: ConfiguracionFacial, resultado_raw: dict) -> dict:
    issues = resultado_raw.get("issues") or []

    if not resultado_raw.get("ok"):
        return {
            "valid": False,
            "errors": [_mensaje_issue(i) for i in issues] or ["No se pudo validar la foto."],
            "warnings": [],
            "embedding": None,
        }

    # ok=True: los issues que igual vengan (si los hay) son advertencias no bloqueantes.
    warnings: list[str] = [_mensaje_issue(i) for i in issues]

    laplacian_var = resultado_raw.get("laplacian_var")
    brightness = resultado_raw.get("brightness")
    face_ratio = resultado_raw.get("face_ratio")

    if laplacian_var is not None and laplacian_var < config.min_blur_score:
        warnings.append("La foto tiene algo de desenfoque. Se recomienda una imagen más nítida.")
    if brightness is not None and brightness < config.min_brightness:
        warnings.append("La foto está muy oscura. Mejore la iluminación.")
    if brightness is not None and brightness > config.max_brightness:
        warnings.append("La foto está sobreexpuesta. Reduzca la iluminación directa.")
    if face_ratio is not None and face_ratio < config.min_face_area_pct:
        warnings.append(f"El rostro ocupa poco espacio ({face_ratio:.1f}%). Acerque un poco más la cámara.")

    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "embedding": resultado_raw.get("embedding"),
    }


def evaluar_checkin(config: ConfiguracionFacial, resultado_raw: dict) -> dict:
    issues = resultado_raw.get("issues") or []
    match_score = resultado_raw.get("match_score")

    if not resultado_raw.get("ok") or match_score is None:
        detalle = _mensaje_issue(issues[0]) if issues else "No se pudo verificar la identidad."
        return {
            "match": False,
            "score": 0.0,
            "confidence": "baja",
            "detail": detalle,
            "requiere_confirmacion": False,
            "det_score_live": float(resultado_raw.get("det_score") or 0.0),
        }

    score = float(match_score)
    det_score_live = float(resultado_raw.get("det_score") or 0.0)

    if score >= config.umbral_alta:
        return {
            "match": True,
            "score": score,
            "confidence": "alta",
            "detail": "Identidad verificada con alta confianza.",
            "requiere_confirmacion": False,
            "det_score_live": det_score_live,
        }
    elif score >= config.umbral_media:
        return {
            "match": True,
            "score": score,
            "confidence": "media",
            "detail": "Posible coincidencia. Confirme visualmente la identidad del paciente.",
            "requiere_confirmacion": True,
            "det_score_live": det_score_live,
        }
    else:
        return {
            "match": False,
            "score": score,
            "confidence": "baja",
            "detail": "No se pudo verificar la identidad. Identifique al paciente por otro medio.",
            "requiere_confirmacion": False,
            "det_score_live": det_score_live,
        }
