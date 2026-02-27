# CobroSmart API (Azure Static Web Apps Functions)

Backend minimo en Node.js + TypeScript para Azure Static Web Apps.

## Endpoint disponible

- `GET /api/health` -> `{ "ok": true, "service": "cobrosmart-api" }`

## Variables de entorno (Azure Static Web Apps > Application settings)

Configura estas variables exactamente con estos nombres:

- `SUPABASE_URL` (requerida)
- `SUPABASE_SERVICE_ROLE_KEY` (requerida, solo backend)
- `AZURE_OPENAI_ENDPOINT` (requerida)
- `AZURE_OPENAI_API_KEY` (requerida, solo backend)
- `AZURE_OPENAI_DEPLOYMENT_NAME` (requerida)
- `AZURE_OPENAI_API_VERSION` (opcional, default: `2024-10-21`)

## Desarrollo local (sin exponer keys en git)

1. Entra a `api/`.
2. Instala dependencias:
   ```bash
   npm install
   ```
3. Crea `local.settings.json` a partir de `local.settings.sample.json` y completa valores reales.
4. Verifica que `local.settings.json` nunca se suba al repo (ya esta ignorado por `api/.gitignore`).
5. Compila y ejecuta Functions:
   ```bash
   npm run build
   npm run start
   ```
6. Prueba:
   - `http://localhost:7071/api/health`

## Notas de seguridad

- Nunca uses `SUPABASE_SERVICE_ROLE_KEY` ni `AZURE_OPENAI_API_KEY` en frontend.
- Todas las keys deben vivir solo en SWA Application settings o en `local.settings.json` local.
