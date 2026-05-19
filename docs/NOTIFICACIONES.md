# Configurar notificaciones móviles

La app soporta dos canales de notificación al celular:

1. **Web Push (PWA)** — gratis, funciona en Android Chrome e iOS 16.4+ instalando la app.
2. **WhatsApp** — vía Twilio. Sandbox gratuito para pruebas, plan pago para producción.

## 1. Web Push (PWA)

### A. Generar las claves VAPID (una sola vez)

En tu máquina local:

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install cryptography
python generate_vapid.py
```

Te imprime:
```
VAPID_PUBLIC_KEY=BFx...
VAPID_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----
VAPID_EMAIL=mailto:admin@skyenergy.mx
```

### B. Configurar en Render

1. Entra al servicio `skypv-api` → **Environment**.
2. Añade tres variables:
   - `VAPID_PUBLIC_KEY` = (pega el valor `BFx...`)
   - `VAPID_PRIVATE_KEY` = (pega el PEM completo, multilínea)
   - `VAPID_EMAIL` = `mailto:tu-correo@dominio.com`
3. **Save Changes** → Render redesplegará solo.

### C. Activar en cada celular

Cada usuario abre la app en su celular **desde Chrome (Android)** o **Safari (iPhone)**:

1. **Instalar como app**:
   - Android: menú (⋮) → "Instalar aplicación".
   - iPhone: botón compartir (□↑) → "Añadir a pantalla de inicio".
2. Abre la app desde el ícono recién instalado.
3. Login con tu usuario.
4. Menú lateral → **Notificaciones**.
5. Botón "Activar notificaciones push" → acepta el permiso del navegador.
6. (Opcional) Click "🔔 Enviar prueba" para verificar.

A partir de ahora recibirás avisos cuando se cree o cambie un mantenimiento, aunque la app esté cerrada.

> **Nota iOS:** sólo funciona si la app fue instalada a la pantalla de inicio. En Safari normal NO recibe push.

## 2. WhatsApp via Twilio

### A. Crea cuenta en Twilio

1. Ve a [twilio.com](https://twilio.com) → **Sign up** (gratis con $15 USD de crédito).
2. En el dashboard, anota:
   - **Account SID** (empieza con `AC...`)
   - **Auth Token** (clic en el ojo para revelarlo)

### B. Activa el sandbox de WhatsApp

Para probar sin costo:

1. Console → **Messaging** → **Try it out** → **Send a WhatsApp message**.
2. Sigue instrucciones: envía el código `join <palabras>` desde tu WhatsApp al número de Twilio.
3. Anota el número *from* (suele ser `whatsapp:+14155238886`).

> El sandbox sólo entrega mensajes a números que se hayan unido enviando el `join`. Para producción real necesitas registrar un Sender oficial (proceso de Meta, ~días).

### C. Configurar en Render

Añade en `skypv-api` → **Environment**:

| Variable | Valor |
|---|---|
| `TWILIO_ACCOUNT_SID` | `AC...` |
| `TWILIO_AUTH_TOKEN` | (el token) |
| `TWILIO_WHATSAPP_FROM` | `whatsapp:+14155238886` (sandbox) |

### D. Activar en cada celular

1. Cada usuario en su WhatsApp envía el código `join <...>` al número del sandbox.
2. En la app web → menú → **Notificaciones** → **WhatsApp** → ingresa su número con prefijo `+52` → **Registrar número**.
3. Click "🔔 Enviar prueba" → debería llegar el mensaje a WhatsApp.

## 3. Costos estimados

| Canal | Costo |
|---|---|
| Web Push | $0 |
| Twilio sandbox WhatsApp | $0 (sólo pruebas) |
| Twilio WhatsApp Sender oficial | ~$0.005 USD por mensaje + plan mensual ~$5 USD |

## 4. Eventos que disparan notificación

| Evento | Title | Body |
|---|---|---|
| Nuevo mantenimiento creado | 🔧 Nuevo mantenimiento programado | tipo + proyecto + fecha |
| Cambio de estado mantenimiento | 🔄 Mantenimiento `<estado>` | tipo + proyecto |
| (Futuro) Incidencia crítica | 🚨 Incidencia crítica | sitio + código |
| (Futuro) Póliza por vencer | ⚠️ Póliza vence en 30 días | proyecto |

Cada usuario filtra qué eventos quiere recibir desde su pantalla de Notificaciones.

## 5. Resolución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| "El servidor no tiene VAPID configurada" | Faltan variables VAPID en Render | Repite paso 1.A y 1.B |
| Push no llega en iPhone | App no instalada como PWA | Añadir a pantalla de inicio desde Safari |
| WhatsApp falla con código 63007 | Número no unido al sandbox | Manda `join <palabras>` desde ese WhatsApp |
| WhatsApp falla con código 21408 | Twilio sin saldo | Recarga en console.twilio.com |
| "Twilio no configurado" en logs | Faltan envVars TWILIO_* | Configúralas en Render |
