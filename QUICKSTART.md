# 🚀 Inicio rápido (5 minutos)

## Prerrequisitos
- Python 3.11+
- Node.js 18+
- (Opcional) PostgreSQL 14+. Si no, usa SQLite por defecto.

## 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env

flask init-db
flask seed-all
flask run
```

Backend disponible en **http://localhost:5000**.

## 2. Frontend (otra terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend disponible en **http://localhost:5173**.

## 3. Entra

| Rol | Email | Contraseña |
|---|---|---|
| Admin | admin@skyenergy.mx | Sky@Admin2025 |
| Operador | operador@skyenergy.mx | Sky@Oper2025 |
| Mantto | mantenimiento@skyenergy.mx | Sky@Mant2025 |

¡Listo! Ya puedes:
- Crear incidencias con auto-completado desde el catálogo de errores
- Ver el dashboard con gráficos en tiempo real
- Exportar cualquier tabla a Excel
- Revisar el historial de cambios (rol admin)
- Gestionar usuarios (rol admin)

## ¿Cómo subirlo a internet?

Lee **[docs/DEPLOY.md](docs/DEPLOY.md)** — paso a paso para Render.com, Railway, Vercel o VPS propio.

## ¿Cómo añado mis datos reales?

Tres opciones:
1. **Manual** — desde la UI con los botones "+ Nuevo".
2. **Importación Excel** — sube `.xlsx` desde la sección Importar (admin).
3. **API directa** — ver `docs/API.md` con ejemplos curl.
