const axios = require('axios');

// Tu Cloudflare Worker Real conectado a OpenRouter
const CLOUDFLARE_WORKER_URL = 'https://compra-inteligente.lisperguer61.workers.dev';

async function analyzeProducts(query, products) {
  if (!products || products.length === 0) {
    return "No encontré productos para analizar.";
  }

  // Si aún no has puesto tu URL del worker real, avisamos en la UI
  if (CLOUDFLARE_WORKER_URL.includes('tu-worker.tudominio')) {
    return "Por favor, pon la URL de tu Cloudflare Worker en el archivo electron/ai.js para habilitar el análisis de IA.";
  }

  try {
    const response = await axios.post(CLOUDFLARE_WORKER_URL, {
      query: query,
      products: products
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    return response.data.analysis || response.data.error || "Respuesta vacía del Worker.";
    
  } catch (error) {
    console.error('Error conectando al Cloudflare Worker:', error.response?.data || error.message);
    return "Hubo un error al comunicarme con el servidor de IA (Cloudflare Worker).";
  }
}

module.exports = {
  analyzeProducts
};
