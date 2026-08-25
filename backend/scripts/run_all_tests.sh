#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

MODULES=(
  apps.core.tests
  apps.agenda.tests
  apps.agenda.tests_services
  apps.protocolos.tests
  apps.cotizaciones.tests
  apps.cartera.tests
  apps.cobros.tests
  apps.pacientes.tests
  apps.colaboradores.tests
  apps.clinicas.tests
  apps.historia_clinica.tests
  apps.configuracion.tests
  apps.users.tests.test_impersonation_api
  apps.users.tests.test_invitation_service
)

python manage.py test "${MODULES[@]}" --verbosity="${1:-1}"
