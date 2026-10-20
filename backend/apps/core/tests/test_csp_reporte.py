"""Endpoint que recibe los reportes de la CSP del front."""
import json

from django.core.cache import cache
from django.test import TestCase

URL = "/api/v1/core/csp-reporte/"


def _reporte(bloqueado="https://evil.example/x.js?token=abc", directiva="script-src-elem"):
    return json.dumps({
        "csp-report": {
            "document-uri": "https://cliniq.2asoft.tech/pacientes/123?tab=historia",
            "effective-directive": directiva,
            "blocked-uri": bloqueado,
        }
    })


class ReporteCspTests(TestCase):
    def setUp(self):
        cache.clear()

    def _post(self, cuerpo, **extra):
        return self.client.post(URL, cuerpo, content_type="application/csp-report", HTTP_HOST="localhost", **extra)

    def test_registra_el_bloqueo_sin_la_consulta_de_la_url(self):
        with self.assertLogs("cliniq.csp", level="WARNING") as logs:
            r = self._post(_reporte())
        self.assertEqual(r.status_code, 204)
        self.assertIn("https://evil.example/x.js", logs.output[0])
        self.assertIn("script-src-elem", logs.output[0])
        self.assertNotIn("token=abc", logs.output[0])
        self.assertNotIn("tab=historia", logs.output[0])

    def test_el_mismo_bloqueo_se_registra_una_sola_vez(self):
        with self.assertLogs("cliniq.csp", level="WARNING") as logs:
            self._post(_reporte())
            self._post(_reporte())
            self._post(_reporte(bloqueado="inline"))
        self.assertEqual(len(logs.output), 2)

    def test_rechaza_cuerpos_invalidos_o_enormes(self):
        self.assertEqual(self._post("no es json").status_code, 400)
        self.assertEqual(self._post(json.dumps({"otra": 1})).status_code, 400)
        self.assertEqual(self._post("x" * 20_000).status_code, 413)
        self.assertEqual(self.client.get(URL, HTTP_HOST="localhost").status_code, 405)

    def test_limita_los_reportes_por_ip(self):
        with self.assertLogs("cliniq.csp", level="WARNING"):
            for i in range(60):
                self._post(_reporte(bloqueado=f"https://h{i}.example/a.js"))
        with self.assertNoLogs("cliniq.csp", level="WARNING"):
            r = self._post(_reporte(bloqueado="https://otro.example/a.js"))
        self.assertEqual(r.status_code, 204)
