# Referencia API — SKY PV Monitor

Base URL: `https://tu-dominio/api` (o `http://localhost:5000/api` en dev).

## Autenticación

Todas las rutas excepto `/auth/login` y `/health` requieren JWT en el header:

```
Authorization: Bearer <accessToken>
```

### POST `/auth/login`

```json
{ "email": "admin@skyenergy.mx", "password": "Sky@Admin2025" }
```

Respuesta:
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": 1, "name": "Administrador SKY", "role": "admin", "email": "..." }
}
```

### POST `/auth/refresh`
Header: `Authorization: Bearer <refreshToken>` → devuelve nuevo `accessToken`.

### GET `/auth/me`
Devuelve el usuario autenticado.

### POST `/auth/change-password`
```json
{ "currentPassword": "...", "newPassword": "..." }
```

## Recursos CRUD estándar

Cada recurso expone:

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/<recurso>` | Lista (con filtros como query params) |
| GET | `/<recurso>/<id>` | Detalle |
| POST | `/<recurso>` | Crear |
| PUT | `/<recurso>/<id>` | Actualizar |
| DELETE | `/<recurso>/<id>` | Eliminar |

Recursos disponibles: `incidencias`, `tickets`, `garantias`, `polizas`, `errores`, `directorio`, `cuadrillas`, `eventos`, `mantenimiento`, `users`, `historial`.

### Endpoints especiales

| Endpoint | Descripción |
|---|---|
| `POST /incidencias/<id>/close` | Cierra incidencia con `{ result, responsible }` |
| `POST /tickets/<id>/close` | Cierra ticket |
| `GET /errores/lookup?brand=X&code=Y` | Búsqueda exacta para autocompletar |
| `GET /dashboard/kpis` | Indicadores numéricos |
| `GET /dashboard/charts` | Datos para los gráficos |
| `POST /importar/incidencias` | Sube `.xlsx` (multipart/form-data, campo `file`) |
| `POST /importar/polizas` | Idem |
| `POST /importar/errores` | Idem |

## Filtros de búsqueda

Casi todas las listas aceptan:
- `q=` → búsqueda libre en campos relevantes
- `status=`, `priority=`, `platform=`, `category=`, etc. según el recurso

Ejemplo:
```
GET /api/incidencias?priority=Critico&status=abierta&q=ASUR
```

## Códigos de respuesta

| Código | Significado |
|---|---|
| 200 | OK |
| 201 | Created |
| 400 | bad_request / missing_fields |
| 401 | invalid_token / token_expired / invalid_credentials |
| 403 | forbidden (rol insuficiente) |
| 404 | not_found |
| 409 | duplicate (email, código único) |

Formato de error:
```json
{ "error": "código_corto", "message": "Descripción legible" }
```

## Ejemplo: crear una incidencia con curl

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@skyenergy.mx","password":"Sky@Admin2025"}' | jq -r .accessToken)

curl -X POST http://localhost:5000/api/incidencias \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "SUNGROW",
    "site": "ASUR Mérida",
    "client": "ASUR",
    "priority": "Alta",
    "errCode": "14",
    "incDate": "2026-05-18"
  }'
```
