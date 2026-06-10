from datetime import timedelta
from pathlib import Path

from corsheaders.defaults import default_headers
from decouple import Csv, config


BASE_DIR = Path(__file__).resolve().parents[2]


def _csv_list(value: str) -> list[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]

SECRET_KEY = config("DJANGO_SECRET_KEY", default="unsafe-dev-secret-key")
DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("DJANGO_ALLOWED_HOSTS", default="*", cast=Csv())
ALLOW_NGROK_HOSTS = config("DJANGO_ALLOW_NGROK_HOSTS", default=DEBUG, cast=bool)

if ALLOW_NGROK_HOSTS:
    for host_pattern in (".ngrok-free.app", ".ngrok.app", ".ngrok.io"):
        if host_pattern not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(host_pattern)

for extra_host in _csv_list(config("DJANGO_ALLOWED_HOSTS_EXTRA", default="")):
    if extra_host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(extra_host)

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "corsheaders",
    "storages",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
]

LOCAL_APPS = [
    "apps.core",
    "apps.users",
    "apps.clinicas",
    "apps.colaboradores",
    "apps.pacientes",
    "apps.agenda",
    "apps.historia_clinica",
    "apps.consentimientos",
    "apps.cobros",
    "apps.inventario",
    "apps.proveedores",
    "apps.comisiones",
    "apps.notificaciones",
    "apps.caja",
    "apps.reportes",
    "apps.configuracion",
    "apps.cotizaciones",
    "apps.cartera",
    "apps.protocolos",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

AUTH_USER_MODEL = "users.User"

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("POSTGRES_DB", default="clinica"),
        "USER": config("POSTGRES_USER", default="clinica"),
        "PASSWORD": config("POSTGRES_PASSWORD", default="clinica"),
        "HOST": config("POSTGRES_HOST", default="localhost"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "apps.users.authentication.ClinicScopedJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 25,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
}

CORS_ALLOWED_ORIGINS = config("CORS_ALLOWED_ORIGINS", default="", cast=Csv())
CORS_ALLOW_ALL_ORIGINS = config("CORS_ALLOW_ALL_ORIGINS", default=False, cast=bool)
CORS_ALLOW_HEADERS = list(default_headers) + [
    "x-clinica-id",
]

LANGUAGE_CODE = "es-co"
TIME_ZONE = "America/Bogota"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

MINIO_ENDPOINT = config("MINIO_ENDPOINT", default=config("MINIO_ENDPOINT_URL", default=""))
MINIO_ACCESS_KEY = config("MINIO_ACCESS_KEY", default="")
MINIO_SECRET_KEY = config("MINIO_SECRET_KEY", default="")
MINIO_PRIVATE_BUCKET = config("MINIO_PRIVATE_BUCKET", default=config("MINIO_BUCKET_NAME", default="clinica-media"))
MINIO_PUBLIC_BUCKET = config("MINIO_PUBLIC_BUCKET", default="clinica-static")
MINIO_PUBLIC_BASE_URL = config("MINIO_PUBLIC_BASE_URL", default=MINIO_ENDPOINT)

DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
AWS_ACCESS_KEY_ID = MINIO_ACCESS_KEY
AWS_SECRET_ACCESS_KEY = MINIO_SECRET_KEY
AWS_STORAGE_BUCKET_NAME = MINIO_PRIVATE_BUCKET
AWS_S3_ENDPOINT_URL = MINIO_ENDPOINT
AWS_S3_REGION_NAME = config("MINIO_REGION", default="us-east-1")
AWS_S3_SIGNATURE_VERSION = "s3v4"
AWS_DEFAULT_ACL = None
AWS_QUERYSTRING_AUTH = True
AWS_QUERYSTRING_EXPIRE = config("MINIO_URL_EXPIRATION", default=900, cast=int)
AWS_S3_FILE_OVERWRITE = False

N8N_BASE_URL = config("N8N_BASE_URL", default="")
N8N_API_KEY = config("N8N_API_KEY", default="")
N8N_WEBHOOK_SECRET = config("N8N_WEBHOOK_SECRET", default="")
N8N_APPOINTMENT_REMINDERS_WEBHOOK = config(
    "N8N_APPOINTMENT_REMINDERS_WEBHOOK",
    default="",
)
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:3000")
FRONTEND_PASSWORD_RESET_PATH = config("FRONTEND_PASSWORD_RESET_PATH", default="/recuperar-contrasena")
EVOLUTION_API_URL = config("EVOLUTION_API_URL", default="")
EVOLUTION_API_KEY = config("EVOLUTION_API_KEY", default="")
EVOLUTION_INSTANCE = config("EVOLUTION_INSTANCE", default="")
MENSATEK_API_URL = config("MENSATEK_API_URL", default="")
MENSATEK_API_KEY = config("MENSATEK_API_KEY", default="")
PASSWORD_RESET_TOKEN_TTL_HOURS = config("PASSWORD_RESET_TOKEN_TTL_HOURS", default=2, cast=int)
PASSWORD_INVITATION_TOKEN_TTL_HOURS = config("PASSWORD_INVITATION_TOKEN_TTL_HOURS", default=72, cast=int)
PASSWORD_INVITATION_RESEND_COOLDOWN_SECONDS = config(
    "PASSWORD_INVITATION_RESEND_COOLDOWN_SECONDS",
    default=300,
    cast=int,
)
DOCUMENSO_API_URL = config("DOCUMENSO_API_URL", default="")
DOCUMENSO_API_KEY = config("DOCUMENSO_API_KEY", default="")
DOCUMENSO_WEBHOOK_SECRET = config("DOCUMENSO_WEBHOOK_SECRET", default="")
DOCUMENSO_FALLBACK_EMAIL = config("DOCUMENSO_FALLBACK_EMAIL", default="")
ORDEN_WEBHOOK_URL = config("ORDEN_WEBHOOK_URL", default="")
WHATSAPP_OUTBOUND_WEBHOOK_URL = config("WHATSAPP_OUTBOUND_WEBHOOK_URL", default="")

EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default="django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = config("EMAIL_HOST", default="smtp.resend.com")
EMAIL_PORT = config("EMAIL_PORT", default=465, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="resend")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=False, cast=bool)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=True, cast=bool)
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=10, cast=int)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="CliniQ <no-reply@noreply.2asoft.tech>")
SERVER_EMAIL = config("SERVER_EMAIL", default=DEFAULT_FROM_EMAIL)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
