# Guía de despliegue paso a paso

## Opción 1 — Render.com (recomendado, gratis)

### Pre-requisitos
- Cuenta en [render.com](https://render.com) (gratis con email).
- Cuenta en [github.com](https://github.com) (gratis).
- El proyecto `skypv-app/` empujado a un repo en GitHub.

### Pasos

1. **Sube el código a GitHub**
   ```bash
   cd skypv-app
   git init
   git add .
   git commit -m "primer commit"
   git branch -M main
   git remote add origin https://github.com/tu-usuario/skypv-app.git
   git push -u origin main
   ```

2. **Crea el Blueprint en Render**
   - Entra a render.com → **New +** → **Blueprint**.
   - Conecta tu cuenta de GitHub y elige el repo `skypv-app`.
   - Render detecta `render.yaml` y muestra los tres servicios que va a crear:
     - `skypv-api` (web Python)
     - `skypv-web` (static site)
     - `skypv-db` (PostgreSQL)
   - Click en **Apply**.

3. **Configura el password admin**
   - Espera a que termine el primer build (~5 min).
   - Entra al servicio `skypv-api` → **Environment** → edita `ADMIN_PASSWORD` (la variable está marcada como `sync: false`).
   - Click **Save Changes** — Render redesplegará automáticamente.

4. **Abre la app**
   - Ve a tu servicio `skypv-web` → arriba está la URL pública (algo como `https://skypv-web.onrender.com`).
   - Login con `admin@skyenergy.mx` y la contraseña que configuraste.

> **Tip:** El plan free duerme el backend tras 15 min sin tráfico. La primera petición tras dormir tarda ~30s. Si necesitas que esté siempre activo, sube a Starter ($7/mes).

## Opción 2 — Railway.app

1. railway.app → **New Project** → **Deploy from GitHub**.
2. Elige el repo. Railway detecta Python.
3. Añade un servicio PostgreSQL (botón **+ New** → **Database** → **PostgreSQL**).
4. En el servicio backend, pestaña **Variables**, agrega:
   - `DATABASE_URL` = referencia al PostgreSQL creado (autocompletado)
   - `SECRET_KEY` = generado, p.ej. con `openssl rand -hex 32`
   - `JWT_SECRET_KEY` = igual
   - `CORS_ORIGINS` = la URL pública del frontend
   - `ADMIN_PASSWORD` = tu contraseña
5. Pestaña **Settings** → **Start Command**:
   `flask init-db && flask create-admin && flask seed-all && gunicorn --workers 2 --bind 0.0.0.0:$PORT wsgi:app`
6. Despliega el frontend en Vercel/Netlify (ver opción 3).

## Opción 3 — Frontend en Vercel + Backend en Render

Esta combinación es la más rápida porque Vercel tiene tier gratuito generoso para el frontend.

1. Backend en Render (sigue Opción 1, sólo el servicio API).
2. Frontend en Vercel:
   - vercel.com → **Add new** → **Project** → importa el repo de GitHub.
   - **Root Directory** = `frontend`.
   - **Build Command** = `npm run build`.
   - **Output Directory** = `dist`.
   - **Environment Variables** → `VITE_API_URL` = `https://tu-api.onrender.com/api`.
3. En el backend Render, actualiza `CORS_ORIGINS` con la URL de Vercel.

## Opción 4 — VPS propio con Docker

Para un servidor Ubuntu/Debian:

```bash
# Instala Docker + Compose
curl -fsSL https://get.docker.com | sh
sudo apt install docker-compose-plugin -y

# Clona y levanta
git clone https://github.com/tu-usuario/skypv-app.git
cd skypv-app

# Edita las contraseñas y secretos antes de exponer
nano docker-compose.yml

docker compose up -d --build
```

Para HTTPS y dominio propio, usa nginx + Let's Encrypt en el host o un reverse proxy como Caddy/Traefik.

## Backups de la base de datos

### Render
- Dashboard del PostgreSQL → pestaña **Backups** → tier gratuito incluye snapshots automáticos diarios (90 días de retención).

### Railway
- Snapshots manuales desde el servicio PostgreSQL.

### VPS propio
```bash
# Backup
docker compose exec db pg_dump -U skypv skypv > backup_$(date +%F).sql

# Restore
cat backup_2026-05-18.sql | docker compose exec -T db psql -U skypv skypv
```

## Variables críticas a cambiar antes de producción

```bash
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
ADMIN_PASSWORD=<contraseña fuerte de 12+ caracteres>
POSTGRES_PASSWORD=<contraseña fuerte>
CORS_ORIGINS=https://tu-dominio.com
```

## Verificación post-despliegue

1. `GET /api/health` → `{"status":"ok"}`
2. Login con el usuario admin.
3. Crea una incidencia de prueba.
4. Verifica que aparece en el Dashboard.
5. Cierra sesión y reingresa con otro rol — comprueba que algunas secciones aparezcan ocultas.
6. Revisa la pestaña Historial para ver el audit log.
