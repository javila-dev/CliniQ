from .base import *  # noqa: F403,F401


DEBUG = True
CORS_ALLOW_ALL_ORIGINS = True
# En local se usa http: una cookie Secure no se guardaria.
AUTH_REFRESH_COOKIE_SECURE = False
# En local el front (3000) llama directo al API (8003): la cookie de sesion
# viaja entre puertos.
CORS_ALLOW_CREDENTIALS = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "apps.cotizaciones": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "apps.agenda": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "apps.consentimientos": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "apps.historia_clinica": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}

