from .base import *  # noqa: F403,F401
from decouple import Csv, config

DEBUG = False
APPEND_SLASH = False

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Proxy / Traefik
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Django 4+ requires the public origin(s) in CSRF_TRUSTED_ORIGINS for POST requests.
# Set DJANGO_CSRF_TRUSTED_ORIGINS in Dokploy env, e.g.:
# https://api.cliniq.2asoft.tech,https://cliniq.2asoft.tech
CSRF_TRUSTED_ORIGINS = config(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default="https://api.cliniq.2asoft.tech,https://cliniq.2asoft.tech",
    cast=Csv(),
)

# ---------------------------------------------------------------------------
# Sentry (monitoreo de errores). Sin SENTRY_DSN en el entorno, no hace nada:
# no se inicializa el SDK y la app arranca igual.
# ---------------------------------------------------------------------------
SENTRY_DSN = config("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=config("SENTRY_ENVIRONMENT", default="production"),
        release=config("SENTRY_RELEASE", default=None) or None,
        # Solo errores por defecto: sin muestreo de performance (0 = nada de
        # overhead ni consumo de cuota por trazas). Subir vía env si se quiere.
        traces_sample_rate=config("SENTRY_TRACES_SAMPLE_RATE", default=0.0, cast=float),
        # App clínica: nunca adjuntar PII ni cuerpos de request (pueden llevar
        # datos de pacientes).
        send_default_pii=False,
        max_request_body_size="never",
    )

