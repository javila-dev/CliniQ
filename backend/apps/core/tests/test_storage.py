from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError
from django.test import SimpleTestCase, TestCase, override_settings

from apps.core.storage import StorageWriteError, _s3_client, upload_private_file, upload_public_file


def _client_error():
    return ClientError({"Error": {"Code": "500", "Message": "boom"}}, "PutObject")


@override_settings(MINIO_ENDPOINT="http://minio.test:9000", MINIO_PRIVATE_BUCKET="clinica-media", MINIO_PUBLIC_BUCKET="clinica-static")
class StorageWriteFailureTests(TestCase):
    """
    Si MinIO esta configurado pero la escritura real falla, no debe caer en
    silencio a disco local (eso deja registros con una ruta que nunca existio
    en MinIO, y las URLs generadas despues apuntan a un archivo fantasma).
    """

    @patch("apps.core.storage._s3_client")
    def test_upload_private_file_falla_ruidosamente_si_minio_rechaza_la_escritura(self, mocked_client):
        mocked_client.return_value = MagicMock(put_object=MagicMock(side_effect=_client_error()))

        with self.assertRaises(StorageWriteError):
            upload_private_file(b"contenido", "consentimientos/2026/01/doc.pdf")

    @patch("apps.core.storage._s3_client")
    def test_upload_public_file_falla_ruidosamente_si_minio_rechaza_la_escritura(self, mocked_client):
        mocked_client.return_value = MagicMock(put_object=MagicMock(side_effect=_client_error()))

        with self.assertRaises(StorageWriteError):
            upload_public_file(b"contenido", "logos/clinica.png")

    @patch("apps.core.storage._s3_client")
    def test_upload_private_file_sin_error_guarda_normal(self, mocked_client):
        mocked_client.return_value = MagicMock(put_object=MagicMock(return_value={}))

        path = upload_private_file(b"contenido", "consentimientos/2026/01/doc.pdf")

        self.assertEqual(path, "consentimientos/2026/01/doc.pdf")


@override_settings(MINIO_ENDPOINT="http://minio.test:9000")
class StorageClientTimeoutTests(SimpleTestCase):
    """
    Sin timeout explicito, una conexion colgada a MinIO puede bloquear un
    worker de Django varios minutos (defaults de boto3 ~60s+60s y reintentos
    sin acotar). El cliente debe traer timeouts cortos y reintentos limitados.
    """

    def test_cliente_s3_trae_timeouts_y_reintentos_acotados(self):
        config = _s3_client()._client_config

        self.assertEqual(config.connect_timeout, 5)
        self.assertEqual(config.read_timeout, 10)
        # botocore expone el max_attempts configurado como total_max_attempts (incluye el intento inicial).
        self.assertEqual(config.retries["total_max_attempts"], 3)
