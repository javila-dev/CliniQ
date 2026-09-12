import { test as setup, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

export function createAuthSetup(authFile: string, emailEnv: string, passwordEnv: string) {
  setup(`autenticar ${path.basename(authFile, '.json')}`, async ({ page, request }) => {
    const backendUrl = process.env.BACKEND_URL ?? 'http://backend:8000'
    const email = process.env[emailEnv] ?? ''
    const password = process.env[passwordEnv] ?? ''

    if (!email || !password) {
      throw new Error(`Variables de entorno ${emailEnv} y ${passwordEnv} son requeridas`)
    }

    const res = await request.post(`${backendUrl}/api/v1/auth/login/`, {
      data: { email, password },
    })
    expect(res.ok(), `Login falló para ${emailEnv}: ${await res.text()}`).toBeTruthy()

    const { access, refresh, user } = await res.json()

    await page.goto('/')
    await page.evaluate(
      ({ access, refresh, clinica_id }) => {
        localStorage.setItem('access_token', access)
        localStorage.setItem('refresh_token', refresh)
        if (clinica_id) localStorage.setItem('clinica_id', clinica_id)
      },
      { access, refresh, clinica_id: user.clinica_id ?? null },
    )

    const dir = path.dirname(authFile)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    await page.context().storageState({ path: authFile })
  })
}
