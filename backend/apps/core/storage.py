from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings


def _s3_client():
    return boto3.client(
        "s3",
        endpoint_url=getattr(settings, "MINIO_ENDPOINT", "") or None,
        aws_access_key_id=getattr(settings, "MINIO_ACCESS_KEY", ""),
        aws_secret_access_key=getattr(settings, "MINIO_SECRET_KEY", ""),
        region_name=getattr(settings, "MINIO_REGION", "us-east-1"),
    )


def _local_media_path(path: str) -> Path:
    return Path(settings.MEDIA_ROOT) / path


def _write_local_file(path: str, file_bytes: bytes) -> str:
    destination = _local_media_path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(file_bytes)
    return path


def _delete_local_file(path: str) -> None:
    destination = _local_media_path(path)
    try:
        destination.unlink()
    except FileNotFoundError:
        return


def _quoted_path(path: str) -> str:
    return quote(path.lstrip("/"), safe="/")


def upload_private_file(file_bytes: bytes, path: str, content_type: str = "application/octet-stream") -> str:
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PRIVATE_BUCKET", ""):
        return _write_local_file(path, file_bytes)

    client = _s3_client()
    try:
        client.put_object(
            Bucket=settings.MINIO_PRIVATE_BUCKET,
            Key=path,
            Body=file_bytes,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError):
        return _write_local_file(path, file_bytes)
    return path


def get_signed_url(path: str, expires_in: int = 3600) -> str | None:
    if not path:
        return None
    if path.startswith(("http://", "https://")):
        return path
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PRIVATE_BUCKET", ""):
        return f"{settings.MEDIA_URL.rstrip('/')}/{_quoted_path(path)}"

    client = _s3_client()
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.MINIO_PRIVATE_BUCKET, "Key": path},
            ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError):
        return f"{settings.MEDIA_URL.rstrip('/')}/{_quoted_path(path)}"


def delete_private_file(path: str) -> None:
    if not path:
        return
    if path.startswith(("http://", "https://")):
        return
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PRIVATE_BUCKET", ""):
        _delete_local_file(path)
        return
    try:
        _s3_client().delete_object(Bucket=settings.MINIO_PRIVATE_BUCKET, Key=path)
    except (BotoCoreError, ClientError):
        _delete_local_file(path)


def get_public_url(path: str, *, internal: bool = False) -> str | None:
    if not path:
        return None
    if path.startswith(("http://", "https://")):
        return path

    if getattr(settings, "MINIO_PUBLIC_BUCKET", ""):
        base = settings.MINIO_ENDPOINT if internal else settings.MINIO_PUBLIC_BASE_URL
        if base:
            return f"{base.rstrip('/')}/{settings.MINIO_PUBLIC_BUCKET}/{_quoted_path(path)}"

    return f"{settings.MEDIA_URL.rstrip('/')}/{_quoted_path(path)}"


def upload_public_file(file_bytes: bytes, path: str, content_type: str = "image/png") -> str:
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PUBLIC_BUCKET", ""):
        return _write_local_file(path, file_bytes)

    client = _s3_client()
    try:
        client.put_object(
            Bucket=settings.MINIO_PUBLIC_BUCKET,
            Key=path,
            Body=file_bytes,
            ContentType=content_type,
        )
    except (BotoCoreError, ClientError):
        return _write_local_file(path, file_bytes)
    return path


def read_public_file(path: str) -> bytes | None:
    if not path:
        return None
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PUBLIC_BUCKET", ""):
        local_path = _local_media_path(path)
        try:
            return local_path.read_bytes()
        except FileNotFoundError:
            return None
    client = _s3_client()
    try:
        response = client.get_object(Bucket=settings.MINIO_PUBLIC_BUCKET, Key=path)
        return response["Body"].read()
    except (BotoCoreError, ClientError):
        return None


def delete_public_file(path: str) -> None:
    if not path:
        return
    if path.startswith(("http://", "https://")):
        return
    if not getattr(settings, "MINIO_ENDPOINT", "") or not getattr(settings, "MINIO_PUBLIC_BUCKET", ""):
        _delete_local_file(path)
        return
    try:
        _s3_client().delete_object(Bucket=settings.MINIO_PUBLIC_BUCKET, Key=path)
    except (BotoCoreError, ClientError):
        _delete_local_file(path)
