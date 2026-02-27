# CobroSmart API (Azure Static Web Apps Functions)

Backend minimo en Node.js + TypeScript para Azure Static Web Apps.
 
## Endpoints disponibles

- `GET /api/health` -> `{ "ok": true, "service": "cobrosmart-api" }`
- `POST /api/bootstrap` -> crea (si no existe) el business default y devuelve `{ "business_id": "..." }`
- `GET /api/debug/db-check` -> valida conectividad con Supabase y devuelve `{ "ok": true }`
- `POST /api/import` -> importa filas CSV normalizadas y devuelve `{ inserted, updated, rejected, errors }`
- `GET /api/debtors?sort=priority` -> lista deudores del business configurado

## Base de datos (versionada)

- Archivo SQL inicial: `db/001_init.sql`
- Incluye tablas:
  - `business`
  - `debtor`
  - `debtor_event`
  - `message_cache`

Paso humano inicial:
1. Abrir Supabase SQL Editor.
2. Ejecutar el contenido de `db/001_init.sql`.

## Variables de entorno (Azure Static Web Apps > Application settings)

Configura estas variables exactamente con estos nombres:

- `SUPABASE_URL` (requerida)
- `SUPABASE_SERVICE_ROLE_KEY` (requerida, solo backend)
- `AZURE_OPENAI_ENDPOINT` (requerida solo para endpoints de IA)
- `AZURE_OPENAI_API_KEY` (requerida solo para endpoints de IA, solo backend)
- `AZURE_OPENAI_DEPLOYMENT_NAME` (requerida solo para endpoints de IA)
- `AZURE_OPENAI_API_VERSION` (opcional, default: `2024-10-21`)
- `COBROSMART_BUSINESS_ID` (opcional al inicio, recomendado despues de bootstrap)

## Bootstrap (paso humano obligatorio para MVP)

1. Ejecuta una vez:
   - `POST https://<tu-swa>.azurestaticapps.net/api/bootstrap`
2. Copia el `business_id` de la respuesta.
3. En Azure Static Web Apps > Application settings, agrega:
   - `COBROSMART_BUSINESS_ID=<business_id>`
4. Guarda cambios y redeploy (o reinicia la app) para que quede disponible en runtime.

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
   - `http://localhost:7071/api/debug/db-check`
   - `POST http://localhost:7071/api/bootstrap`
   - `POST http://localhost:7071/api/import`
   - `GET http://localhost:7071/api/debtors?sort=priority`

## Importacion CSV (demo)

Como exportar Excel a CSV:
1. Abrir el archivo en Excel.
2. `Archivo` -> `Guardar como`.
3. Elegir tipo `CSV UTF-8 (delimitado por comas) (*.csv)` o `CSV (separado por punto y coma)` segun configuracion regional.
4. Confirmar guardado en formato CSV.

Columnas esperadas:
- `cliente_nombre` (requerida)
- `telefono` (requerida)
- `monto` (requerida)
- `dias_vencido` (requerida para backend; en frontend puede venir `fecha_vencimiento` y se convierte)
- `obra` (opcional)

Como probar importacion en la demo (`/staticdemo/index.html`):
1. Abrir la demo.
2. Elegir archivo en `Importar CSV`.
3. Presionar `Importar CSV`.
4. Ver resumen `inserted/updated/rejected`.
5. Ir a Pantalla 2 y validar lista priorizada desde `GET /api/debtors?sort=priority`.

Ejemplo de payload para prueba manual:
```json
{
  "rows": [
    {
      "cliente_nombre": "Obras Rivas",
      "telefono": "+54 9 11 1234-5678",
      "monto": "612400",
      "dias_vencido": 74,
      "obra": "Lote 17"
    }
  ]
}
```

## Notas de seguridad

- Nunca uses `SUPABASE_SERVICE_ROLE_KEY` ni `AZURE_OPENAI_API_KEY` en frontend.
- Todas las keys deben vivir solo en SWA Application settings o en `local.settings.json` local.
- `POST /api/bootstrap` es anonimo solo para MVP. Debe protegerse con auth antes de produccion.
- Sin WhatsApp API en este MVP: el flujo de envio es copiar/pegar mensaje.
