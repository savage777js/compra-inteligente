# Compra Inteligente

Tu Asesor IA de Compras Multi-Categoría. Esta es una aplicación de escritorio multiplataforma (Windows, macOS, Linux) construida con Electron y React (Vite) que te ayuda a investigar, comparar precios y obtener recomendaciones inteligentes de productos a través de Inteligencia Artificial.

## 🚀 Características Principales

- **Búsqueda Multitienda**: Busca y compara productos en paralelo en tiendas como MercadoLibre, Sodimac y Easy (soporte base).
- **Asesor IA Integrado**: Análisis de mercado en tiempo real y recomendaciones inteligentes de compra calidad/precio.
- **Diseño Premium**: Interfaz moderna "glassmorphism", animaciones suaves y tarjetas dinámicas que se ajustan al contenido.
- **Sin Cortes**: Títulos completos y detallados para que siempre sepas qué producto estás viendo.

## 💻 Requisitos Previos

Para ejecutar y compilar este proyecto, necesitas tener instalado:

- [Node.js](https://nodejs.org/) (versión 16 o superior)
- Git

## 🛠️ Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/savage777js/compra-inteligente.git
   ```

2. Entra en el directorio del proyecto:
   ```bash
   cd compra-inteligente
   ```

3. Instala las dependencias:
   ```bash
   npm install
   ```

## ⚙️ Uso en Desarrollo

Para iniciar la aplicación en modo desarrollo (con recarga rápida):

```bash
npm run electron:dev
```
*(Nota: Si editas archivos de la carpeta `electron/` como `scraper.js`, debes cerrar la app y volver a ejecutar este comando para aplicar los cambios en el "cerebro" de la app).*

## 📦 Construir el Ejecutable (.exe, .dmg, etc.)

Para crear un instalador final de la aplicación listo para distribuir:

```bash
npm run electron:build
```

El instalador (por ejemplo, el `.exe` para Windows si compilas en Windows) se generará en la carpeta `dist-electron/`.

## 🧠 Configuración del Asesor IA

El análisis de IA se realiza a través de un Cloudflare Worker que se conecta a OpenRouter. 
Asegúrate de configurar la URL de tu Worker en el archivo `electron/ai.js` para habilitar las respuestas inteligentes.

---
*Desarrollado con React, Vite y Electron.*
