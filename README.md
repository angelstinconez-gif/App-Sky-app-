# SKY PV Monitor — Aplicación Web Multi-usuario

Sistema de gestión de incidencias fotovoltaicas convertido de HTML estático a aplicación web full-stack con base de datos, autenticación y soporte multi-usuario.

## Arquitectura

```
skypv-app/
├── backend/          → API REST con Flask + SQLAlchemy + JWT
│   ├── app/
│   │   ├── models/   → Tablas: usuarios, incidencias, tickets, pólizas, etc.
│   │   ├── routes/   → Endpoints REST (/api/*)
│   │   ├── seeds/    → Datos iniciales (catálogo errores, pólizas demo)
│   │   └── utils/    → Decoradores de rol, audit log
│   ├── wsgi.py       → Entry point gunicorn
│   ├── config.py     → Configuración por variables de entorno
│   └── requirements.txt
├── frontend/         → SPA con React + Vite
│   ├── src/
│   │   ├── pages/        → Una página por módulo (Dashboard, Incidencias, etc.)
│   │   ├── components/   → Sidebar, Topbar, Modal, DataTable, CrudPage
│   │   ├── api/          → Cliente axios + endpoints
│   │   └── context/      → AuthContext (JWT)
│   └── package.json
├── docker-compose.yml    → Stack completo local (postgres + backend + frontend)
├── render.yaml           → Despliegue en Render.com (gratuito)
└── railway.json          → Alternativa Railway.app
```

## Módulos incluidos

| Módulo | Rol mínimo | Descripción |
|---|---|---|
| Dashboard | Todos | KPIs y gráficos (incidencias, tickets, pólizas) |
| Incidencias | Operador | CRUD con auto-completado desde catálogo de errores |
| Tickets | Mantenimiento | Tickets de servicio con cierre |
| Garantías | Mantenimiento | Reclamos a fabricantes |
| Mantenimiento | Mantenimiento | Programación preventiva/correctiva |
| Pólizas | Mantenimiento | Contratos con cálculo automático de vigencia |
| Directorio | Todos | Contactos (clientes, proveedores, técnicos) |
| Cuadrillas | Operador | Equipos de trabajo por zona |
| Catálogo errores | Admin | Códigos por fabricante (HUAWEI, SUNGROW, SOLIS, SMA) |
| Calendario | Operador | Vista mensual con eventos derivados |
| Reportes | Operador | Exportación a Excel |
| Historial | Admin | Audit log de todas las operaciones |
| Usuarios | Admin | Gestión de cuentas y roles |

## Roles

- **admin** — control total, gestiona usuarios, ve historial, elimina registros.
- **operator** — gestiona incidencias, tickets, calendario, directorio.
- **mantenimiento** — gestiona garantías, mantenimientos, pólizas, tickets.

## Inicio rápido (desarrollo local)

### 1. Backend Flask

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env              # ajusta SECRET_KEY si lo deseas

flask init-db                     # crea las tablas
flask seed-all                    # carga catálogo de errores + usuarios demo
flask run                         # http://localhost:5000
```

### 2. Frontend React

```bash
cd frontend
npm install
cp .env.example .env              # opcional, ya tiene proxy en dev
npm run dev                       # http://localhost:5173
```

### 3. Cuentas de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Admin | `admin@skyenergy.mx` | `Sky@Admin2025` |
| Operador | `operador@skyenergy.mx` | `Sky@Oper2025` |
| Mantenimiento | `mantenimiento@skyenergy.mx` | `Sky@Mant2025` |

> **Importante:** cambia estas contraseñas en producción desde la pestaña *Usuarios*.

## Despliegue en producción

Tres opciones, todas gratuitas para empezar:

### Opción A — Render.com (recomendado)

1. Sube `skypv-app/` a un repositorio en GitHub.
2. En Render: **New +** → **Blueprint** → conecta tu repo.
3. Render detecta `render.yaml` y crea:
   - `skypv-api` (backend Flask)
   - `skypv-web` (frontend estático)
   - `skypv-db` (PostgreSQL gratuito, 90 días)
4. Configura `ADMIN_PASSWORD` manualmente en el dashboard de Render.
5. Espera ~5 min al primer build. Abre la URL de `skypv-web`.

### Opción B — Railway.app

1. **New Project** → **Deploy from GitHub**.
2. Añade un servicio PostgreSQL (Railway lo crea con un click).
3. En el servicio backend define las variables: `DATABASE_URL`, `SECRET_KEY`, `JWT_SECRET_KEY`, `CORS_ORIGINS`.
4. Despliega el frontend como otro servicio o en Vercel/Netlify apuntando `VITE_API_URL` al backend de Railway.

### Opción C — Docker en servidor propio / VPS

```bash
cd skypv-app
docker compose up -d --build
# Frontend: http://localhost:8080
# Backend:  http://localhost:5000/api
```

Edita `docker-compose.yml` para cambiar `POSTGRES_PASSWORD`, `SECRET_KEY` y `ADMIN_PASSWORD` antes de exponer a internet.

## Variables de entorno

### Backend (`backend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `SECRET_KEY` | dev-secret | Clave de sesión Flask (cámbiala) |
| `JWT_SECRET_KEY` | = SECRET_KEY | Clave de firma JWT |
| `DATABASE_URL` | sqlite:///skypv.db | URI SQLAlchemy. Usa `postgresql://...` en producción |
| `CORS_ORIGINS` | localhost:5173,3000 | Dominios permitidos, separados por coma |
| `ADMIN_EMAIL` | admin@skyenergy.mx | Email del admin creado por `flask create-admin` |
| `ADMIN_PASSWORD` | Sky@Admin2025 | Contraseña inicial |

### Frontend (`frontend/.env`)

| Variable | Default | Descripción |
|---|---|---|
| `VITE_API_URL` | /api | URL del backend. En dev se usa el proxy de Vite |

## Endpoints principales

| Recurso | GET (list) | POST (create) | PUT | DELETE |
|---|---|---|---|---|
| `/api/auth/login` | — | ✓ | — | — |
| `/api/auth/me` | ✓ | — | — | — |
| `/api/users` | admin | admin | admin | admin |
| `/api/incidencias` | auth | op | op | admin |
| `/api/tickets` | auth | mant | mant | admin |
| `/api/garantias` | auth | mant | mant | admin |
| `/api/polizas` | auth | mant | mant | admin |
| `/api/errores` | auth | admin | admin | admin |
| `/api/dashboard/kpis` | auth | — | — | — |
| `/api/historial` | admin | — | — | — |
| `/api/importar/incidencias` | — | admin | — | — |

Todas las rutas (excepto `/api/auth/login` y `/api/health`) requieren header `Authorization: Bearer <JWT>`.

## Importación masiva desde Excel

Desde la sección **Importar** (sólo admin) puedes subir archivos `.xlsx` para:

- Incidencias — columnas: `platform`, `site`, `client`, `code`, `priority`, `incDate`, `errCode`, `classification`, `problem`, `cause`, `solution`
- Pólizas — columnas: `project`, `code`, `grupo`, `platform`, `polStart`, `polEnd`, `status`, `zona`, `cuadrilla`
- Errores — columnas: `brand`, `code`, `classification`, `problem`, `cause`, `solution`, `priority`

Los nombres en español también son aceptados (`sitio`, `cliente`, `prioridad`, etc.).

## Seguridad

- Contraseñas con **bcrypt** (no plano).
- Tokens JWT con expiración de 12h, refresh de 30 días.
- CORS restringido a dominios listados en `CORS_ORIGINS`.
- Control de acceso por rol en cada endpoint (decorador `@role_required`).
- Audit log automático: cada crear/editar/eliminar deja huella en la tabla `historial` con email del usuario.

## Migraciones de base de datos

Para cambios futuros al esquema usa Flask-Migrate (ya incluido):

```bash
flask db init       # primera vez
flask db migrate -m "descripción del cambio"
flask db upgrade    # aplica al destino actual
```

## Problemas comunes

| Error | Solución |
|---|---|
| `CORS error` desde el navegador | Añade el dominio del frontend a `CORS_ORIGINS` |
| `psycopg2 module not found` | Instala `psycopg2-binary` (ya está en requirements.txt) |
| `Token expired` en cada request | El frontend hace refresh automático; si falla, vuelve a hacer login |
| Render duerme tras 15 min (free tier) | Es normal; primera petición tras inactividad tarda ~30s. Upgrade a paid plan elimina esto |

## Licencia

Uso interno. © SKY Energy.
