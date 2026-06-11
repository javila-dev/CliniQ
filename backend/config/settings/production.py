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
USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Django 4+ requires the public origin(s) in CSRF_TRUSTED_ORIGINS for POST requests.
# Set DJANGO_CSRF_TRUSTED_ORIGINS in Dokploy env, e.g.:
# https://api.cliniq.2asoft.tech,https://cliniq.2asoft.tech
CSRF_TRUSTED_ORIGINS = config(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default="https://api.cliniq.2asoft.tech,https://cliniq.2asoft.tech",
    cast=Csv(),
)

