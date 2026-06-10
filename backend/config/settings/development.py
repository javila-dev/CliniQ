from .base import *  # noqa: F403,F401


DEBUG = True
CORS_ALLOW_ALL_ORIGINS = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "apps.cotizaciones": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
        "apps.agenda": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}

