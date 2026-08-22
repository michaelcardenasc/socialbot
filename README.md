# SocialBot (powered by Zernio)

**Automatización de Instagram y Facebook sin límites ni suscripciones costosas de ManyChat.**

Conecta tus cuentas sociales fácilmente a través de **Zernio** (con las primeras 2 cuentas gratis) y despliega tu servidor de automatización de comentarios, DMs, notas de voz/audios, imágenes, videos y embudos de venta para infoproductos.

---

## 🚀 Características Principales

- **Automatización Comment-to-DM:** Cuando alguien comenta una palabra clave en tu post o reel, recibe un DM de inmediato y una respuesta pública a su comentario.
- **Soporte Multimedia Completo en DMs:**
  - 🎵 **Notas de audio / voz** automatizadas para conectar mejor con tu audiencia.
  - 🖼️ **Imágenes y mockups** de tus infoproductos o recursos.
  - 🎬 **Videos explicativos** y demostraciones.
  - 🔗 **Botones interactivos y enlaces de compra.**
- **Secuencias y Embudos con Delays:** Configura flujos paso a paso con retardos (`delay`) en segundos para simular una conversación humana (Texto → Audio → Imagen → Link de compra).
- **Captura de Leads y Correos:** Flujo conversacional para recopilar el email del prospecto y entregar el recurso automáticamente por DM y por correo con Resend.
- **Detección de Usuarios Recurrentes:** Recuerda a los usuarios que ya dejaron su correo para no volver a pedírselo.
- **Recordatorios Automáticos:** Seguimiento a los 10 minutos si el usuario no completó su correo.
- **Multiplataforma:** Diseñado para **Instagram** y **Facebook** sobre la infraestructura unificada de Zernio.
- **Base de Datos PostgreSQL:** Registro detallado de leads capturados y logs de DMs enviados/recibidos.
- **Control Anti-Spam:** Cooldowns por palabra clave y límites de frecuencia por usuario.

---

## 🛠️ Cómo Funciona

```
Prospecto comenta "INFO" en tu Reel / Post
        │
        ▼
SocialBot responde el comentario ("¡Revisa tus DMs! 📩")
        │
        ▼
Inicia la secuencia en DM:
1. Mensaje de bienvenida: "¡Hola! Qué gusto que te interese..."
2. Audio explicativo (espera 2s): [Nota de audio]
3. Imagen del producto (espera 4s): [Foto / Mockup]
4. Botón de checkout (espera 2s): [🔘 Comprar ahora con 50% OFF]
        │
        ▼
Guarda el Lead en PostgreSQL
```

---

## 📦 Inicio Rápido

### 1. Clonar e Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Configura tus credenciales:

```env
# Zernio API (Obtén tu API key y Webhook Secret en https://zernio.com)
ZERNIO_API_KEY=tu_zernio_api_key
ZERNIO_WEBHOOK_SECRET=tu_zernio_webhook_secret
ZERNIO_ACCOUNT_ID=tu_account_id_de_zernio
ZERNIO_PROFILE_ID=tu_profile_id # Opcional

# Media CDN (Opcional - URL base para audios/imágenes)
MEDIA_BASE_URL=https://tu-cdn.com/media

# Servidor
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Admin
ADMIN_API_KEY=tu_clave_secreta_admin

# Base de Datos (PostgreSQL)
DATABASE_URL=postgresql://usuario:password@host:5432/dbname

# Correo (Opcional - Resend)
RESEND_API_KEY=tu_resend_api_key
EMAIL_FROM=Tu Marca <noreply@tudominio.com>
WELCOME_EMAIL_TEMPLATE=bienvenido.html
```

---

## 🎯 Configuración de Palabras Clave (`keywords.json`)

Puedes definir tus reglas de automatización en `keywords.json`:

```json
[
  {
    "id": "infoproducto",
    "keyword": "INFO",
    "aliases": ["COMPRAR", "PRECIO"],
    "matchType": "contains",
    "priority": 1,
    "enabled": true,
    "cooldownMinutes": 60,
    "askEmail": false,
    "platforms": ["instagram", "facebook"],
    "commentReply": "¡Te acabo de enviar todos los detalles al privado! 🚀",
    "response": {
      "type": "sequence",
      "text": "Iniciando secuencia",
      "sequence": [
        {
          "delay": 0,
          "text": "¡Hola {{username}}! Qué bueno que te interesa nuestro infoproducto."
        },
        {
          "delay": 2,
          "media": {
            "type": "audio",
            "url": "https://tu-cdn.com/audios/presentacion.mp3"
          }
        },
        {
          "delay": 4,
          "media": {
            "type": "image",
            "url": "https://tu-cdn.com/imagenes/preview.jpg",
            "caption": "Esto es lo que incluye el programa completo."
          }
        },
        {
          "delay": 2,
          "text": "Puedes acceder directamente aquí:",
          "buttons": [
            {
              "type": "web_url",
              "title": "Comprar con 50% de Descuento",
              "url": "https://tu-sitio.com/checkout/infoproducto"
            }
          ]
        }
      ]
    }
  }
]
```

### Tipos de Coincidencia (`matchType`):
- `contains`: Coincide si la palabra está en cualquier parte del comentario (ej: *"quiero info por favor"*).
- `exact`: Requiere que el comentario sea exactamente la palabra clave.
- `word_boundary`: Coincide con la palabra completa (evita falsos positivos en palabras compuestas).

---

## 🌐 Configuración del Webhook en Zernio

1. En el panel de **[Zernio](https://zernio.com)**, ve a la sección de **Webhooks**.
2. Añade la URL de tu servidor: `https://tu-app.railway.app/webhook` (o `https://tu-app.railway.app/webhook/zernio`).
3. Suscríbete a los eventos:
   - `comment.received` / `comment.created`
   - `message.received`
   - `reaction.received`
4. Copia el **Webhook Secret** y pégalo en tu `.env` como `ZERNIO_WEBHOOK_SECRET`.

---

## 🚢 Despliegue en Railway

1. Sube este repositorio a tu GitHub.
2. Crea un nuevo proyecto en **Railway** desde tu repositorio.
3. Añade el plugin de **PostgreSQL** en Railway.
4. En la pestaña **Variables**, añade todas las variables de tu `.env`.
5. Railway compilará automáticamente con el `Dockerfile` o `railway.toml` incluido.

---

## 🧪 Pruebas y Desarrollo Local

```bash
# Modo desarrollo con recarga en vivo
npm run dev

# Compilar TypeScript
npm run build

# Iniciar en producción
npm start

# Ejecutar tests automatizados
npm test
```

Para probar webhooks localmente, puedes usar **ngrok**:
```bash
ngrok http 3000
```
Y configurar la URL generada en Zernio.

---

## ⚖️ Licencia
MIT — Libre para uso personal o comercial.
