const axios = require('axios');
const cheerio = require('cheerio');
const { BrowserWindow } = require('electron');

async function searchProducts(query) {
  console.log(`Starting multi-store research for: ${query}`);
  
  try {
    const [mlResults, sodimacResults, falabellaResults] = await Promise.all([
      scrapeMercadoLibre(query),
      scrapeSodimac(query),
      scrapeFalabella(query)
    ]);
    
    let allResults = [...mlResults, ...sodimacResults, ...falabellaResults];
    
    allResults.sort((a, b) => a.price - b.price);
    
    return allResults;
  } catch (error) {
    console.error('Global search error:', error);
    return [];
  }
}

async function scrapeMercadoLibre(query) {
  try {
    const searchUrl = `https://listado.mercadolibre.cl/${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.ui-search-layout__item, .poly-card').each((i, element) => {
      if (i >= 8) return false; 

      const titleEl = $(element).find('.poly-component__title, .ui-search-item__title');
      const title = titleEl.text().trim();
      
      const priceEl = $(element).find('.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .andes-money-amount__fraction');
      const priceText = priceEl.first().text().replace(/\./g, '').trim();
      const price = parseInt(priceText, 10);

      const urlEl = $(element).find('a.poly-component__title, a.ui-search-link, a.poly-component__link');
      let url = urlEl.attr('href');

      if (url && !url.startsWith('http')) {
        url = 'https://www.mercadolibre.cl' + (url.startsWith('/') ? '' : '/') + url;
      }

      const imgEl = $(element).find('img.poly-component__picture, img.ui-search-result-image__element');
      let image = imgEl.attr('data-src') || imgEl.attr('src');

      let id = `mlc-${i}-${Date.now()}`;
      if (title && !isNaN(price) && url) {
        results.push({ id, title, price, url, image, store: 'MercadoLibre' });
      }
    });

    return results;
  } catch (error) {
    console.error('ML error:', error.message);
    return [];
  }
}

async function scrapeSodimac(query) {
  try {
    const url = `https://www.sodimac.cl/sodimac-cl/search?Ntt=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const results = [];
    
    $('.product-container, .ie-product-card').each((i, el) => {
        if (i >= 5) return false;
        const title = $(el).find('.product-title, .title').text().trim();
        const priceText = $(el).find('.price, .current-price').text().replace(/[^0-9]/g, '');
        const price = parseInt(priceText, 10);
        const url = 'https://www.sodimac.cl' + $(el).find('a').attr('href');
        const image = $(el).find('img').attr('src');
        
        if (title && price) {
            results.push({ id: `sodimac-${i}-${Date.now()}`, title, price, url, image, store: 'Sodimac' });
        }
    });

    return results;
  } catch (error) {
    console.error('Sodimac error:', error.message);
    return [];
  }
}

async function scrapeFalabella(query) {
  return new Promise((resolve) => {
    const url = `https://www.falabella.com/falabella-cl/search?Ntt=${encodeURIComponent(query)}`;
    
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        offscreen: true,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    win.webContents.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    win.loadURL(url);

    win.webContents.on('did-finish-load', async () => {
      try {
        const results = await win.webContents.executeJavaScript(`
          new Promise(resolve => {
            setTimeout(() => {
              try {
                const items = [];
                const links = Array.from(document.querySelectorAll('a')).filter(a => a.href && a.href.includes('/product/'));
                links.slice(0, 5).forEach((a, i) => {
                  const container = a.parentElement.parentElement;
                  if(!container) return;
                  const text = container.innerText;
                  const priceMatch = text.match(/\\$[\\s]*([\\d\\.]+)/);
                  const price = priceMatch ? parseInt(priceMatch[1].replace(/[^0-9]/g, '')) : 0;
                  const img = container.querySelector('img');
                  const image = img ? img.src : '';
                  const title = a.innerText.split('\\n')[0];
                  
                  if(title && price > 0) {
                     items.push({ id: 'falabella-'+Date.now()+i, title, price, url: a.href, image, store: 'Falabella' });
                  }
                });
                resolve(items);
              } catch(e) {
                resolve([]);
              }
            }, 3000); // Esperar a que React renderice
          });
        `);
        win.destroy();
        resolve(results || []);
      } catch (err) {
        if (!win.isDestroyed()) win.destroy();
        resolve([]);
      }
    });

    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.destroy();
        resolve([]);
      }
    }, 15000);
  });
}

module.exports = {
  searchProducts
};
