import io

import pdfplumber


def extraer_coordenadas_firma(pdf_bytes: bytes) -> dict:
    """
    Abre el PDF renderizado y busca los marcadores __SIG_TL__ (esquina
    superior-izquierda) y __SIG_BR__ (esquina inferior-derecha) que delimitan
    el recuadro real de firma del paciente (".sig-area"). Con ambos puntos
    se calcula la posicion y el tamano exactos del recuadro, en porcentaje
    de pagina (formato que espera Documenso: pageX, pageY, pageWidth, pageHeight).
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page = pdf.pages[0]
        words = page.extract_words()

        marker_tl = next((w for w in words if "__SIG_TL__" in w.get("text", "")), None)
        marker_br = next((w for w in words if "__SIG_BR__" in w.get("text", "")), None)

        if marker_tl is None or marker_br is None:
            return _coordenadas_fallback(page)

        page_w = page.width
        page_h = page.height

        x0 = marker_tl["x0"]
        y0 = marker_tl["top"]
        x1 = marker_br["x1"]
        y1 = marker_br["bottom"]

        return {
            "pageNumber": 1,
            "pageX": round((x0 / page_w) * 100, 2),
            "pageY": round((y0 / page_h) * 100, 2),
            "pageWidth": round(((x1 - x0) / page_w) * 100, 2),
            "pageHeight": round(((y1 - y0) / page_h) * 100, 2),
        }


def recortar_firma_paciente(pdf_bytes: bytes) -> bytes | None:
    """
    Recorta la imagen de la firma manuscrita del paciente desde un PDF de
    registro de asistencia YA FIRMADO (descargado de Documenso). Reutiliza
    los mismos marcadores __SIG_TL__/__SIG_BR__ que ubican el recuadro de
    firma al crear el envelope — siguen presentes en el PDF firmado porque
    Documenso solo estampa la firma encima, no borra el contenido original.
    Devuelve bytes PNG del recorte, o None si no se encuentran los marcadores
    (p.ej. PDF generado antes de que existiera este mecanismo).
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page = pdf.pages[0]
        words = page.extract_words()

        marker_tl = next((w for w in words if "__SIG_TL__" in w.get("text", "")), None)
        marker_br = next((w for w in words if "__SIG_BR__" in w.get("text", "")), None)
        if marker_tl is None or marker_br is None:
            return None

        bbox = (marker_tl["x0"], marker_tl["top"], marker_br["x1"], marker_br["bottom"])
        crop_img = page.crop(bbox).to_image(resolution=200)

        buffer = io.BytesIO()
        crop_img.save(buffer, format="PNG")
        return buffer.getvalue()


def _coordenadas_fallback(page) -> dict:
    # 20mm bottom margin en A4 → firma ≈ 72% desde el top
    return {
        "pageNumber": 1,
        "pageX": 5.0,
        "pageY": 72.0,
        "pageWidth": 45.0,
        "pageHeight": 8.0,
    }
