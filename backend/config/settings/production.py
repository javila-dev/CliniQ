from .base import *  # noqa: F403,F401


DEBUG = False
APPEND_SLASH = False

STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

