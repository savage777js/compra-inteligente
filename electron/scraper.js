const axios = require('axios');
const cheerio = require('cheerio');
const { BrowserWindow, session } = require('electron');
const { getSetting } = require('./database');

// Configuración de selectores de Cheerio para Parsing en Scraping API (Bypass de Cloudflare)
const STORE_CONFIGS = {
  Sodimac: {
    cardSelector: 'a.pod-link, [id^="testId-pod-"], .product-container, [class*="product-card"]',
    titleSelector: 'b, [id*="display-name"], .product-title, .title, h3',
    priceSelector: '[class*="price"], .current-price, .discount-price, .price',
    linkSelector: 'a',
    imageSelector: 'img'
  },
  Falabella: {
    cardSelector: 'a.pod-link, [id^="testId-pod-"], .product-card, [class*="product-card"]',
    titleSelector: 'b, [id*="display-name"], .pod-display-name, .title, h3',
    priceSelector: '[class*="price"], .copy10, .price-0, .current-price, .price',
    linkSelector: 'a',
    imageSelector: 'img'
  },
  Lider: {
    cardSelector: '.product-card, [class*="ProductCard"], .item-product',
    titleSelector: '[class*="ProductName"], .product-name, .name, h3',
    priceSelector: '[class*="PriceValue"], .price, .current-price',
    linkSelector: 'a',
    imageSelector: 'img'
  },
  Paris: {
    cardSelector: '.product-item, .item-product, [class*="product-card"]',
    titleSelector: '.pdp-link, .item-name, h3, h4',
    priceSelector: '.item-price, .price, .price-main',
    linkSelector: 'a',
    imageSelector: 'img'
  },
  Easy: {
    cardSelector: '.product-card, [class*="product-card"], [class*="galleryItem"]',
    titleSelector: '[class*="productBrand"], .product-title, .title, h3',
    priceSelector: '[class*="currencyContainer"], .price, .current-price',
    linkSelector: 'a',
    imageSelector: 'img'
  },
  Ripley: {
    cardSelector: '.catalog-product, .product-item, [class*="catalog-product"]',
    titleSelector: '.catalog-product-details__name, h3, h4',
    priceSelector: '.catalog-prices__offer-price, .catalog-prices__card-price, .price',
    linkSelector: 'a',
    imageSelector: 'img'
  }
};

/**
 * Main function to search across multiple stores
 */
async function searchProducts(query) {
  const cleanQuery = query.trim();
  console.log(`[Scraper] Starting multi-store research for: "${cleanQuery}"`);
  
  try {
    // 1. MercadoLibre is fast (Axios), run it immediately
    const mlResults = await scrapeMercadoLibre(cleanQuery);
    
    // 2. Define other store tasks
    // We run them in sequence or small batches to avoid ERR_FAILED/Memory issues
    const stores = [
      { name: 'Sodimac', fn: () => scrapeSodimac(cleanQuery) },
      { name: 'Falabella', fn: () => scrapeFalabella(cleanQuery) },
      { name: 'Lider', fn: () => scrapeLider(cleanQuery) },
      { name: 'Paris', fn: () => scrapeParis(cleanQuery) },
      { name: 'Easy', fn: () => scrapeEasy(cleanQuery) },
      { name: 'Ripley', fn: () => scrapeRipley(cleanQuery) }
    ];
    
    let otherResults = [];
    // Process in batches of 2 for better stability
    for (let i = 0; i < stores.length; i += 2) {
      console.log(`[Scraper] Batch ${Math.floor(i/2) + 1}/${Math.ceil(stores.length/2)}: ${stores[i].name}${stores[i+1] ? ', ' + stores[i+1].name : ''}`);
      const batch = stores.slice(i, i + 2).map(s => s.fn());
      const batchResults = await Promise.all(batch);
      otherResults = otherResults.concat(batchResults.flat());
    }
    
    let allResults = [...mlResults, ...otherResults];
    
    // Filter invalid results
    allResults = allResults.filter(p => p && p.title && !isNaN(p.price) && p.price > 0 && p.url);
    
    // Sort by price
    allResults.sort((a, b) => a.price - b.price);
    
    console.log(`[Scraper] Research finished. Total results found: ${allResults.length}`);
    return allResults;
  } catch (error) {
    console.error('[Scraper] Global search error:', error);
    return [];
  }
}

/**
 * Helper to ensure URLs are absolute
 */
function ensureAbsoluteUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) {
    try {
      const urlObj = new URL(base);
      return `${urlObj.protocol}//${urlObj.host}${url}`;
    } catch (e) {
      return base.replace(/\/$/, '') + url;
    }
  }
  return base.replace(/\/$/, '') + '/' + url;
}

/**
 * Parse Store HTML using Cheerio configurations
 */
function parseStoreHtml(html, storeName, baseUrl) {
  const $ = cheerio.load(html);
  const config = STORE_CONFIGS[storeName];
  if (!config) return [];

  const items = [];
  $(config.cardSelector).each((i, element) => {
    if (items.length >= 6) return false;
    try {
      const card = $(element);
      const titleEl = card.find(config.titleSelector);
      const priceEl = card.find(config.priceSelector);
      
      let link = card.attr('href') || card.find(config.linkSelector).attr('href') || '';
      if (!link) return;
      link = ensureAbsoluteUrl(link, baseUrl);

      const imgEl = card.find(config.imageSelector);
      let image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-original') || '';
      image = ensureAbsoluteUrl(image, baseUrl);

      if (titleEl.length && priceEl.length && link) {
        const title = titleEl.text().trim();
        const priceText = priceEl.text().replace(/[^0-9]/g, '');
        const price = parseInt(priceText, 10);

        if (title && price > 0) {
          items.push({
            title,
            price,
            url: link,
            image: image,
            store: storeName
          });
        }
      }
    } catch (e) {
      console.error(`[Scraper] Cheerio parse error for ${storeName}:`, e.message);
    }
  });
  return items;
}

/**
 * Scrape using ScraperAPI (Bypasses Cloudflare using residential Chilean proxies)
 */
async function scrapeWithAPI(url, storeName, apiKey) {
  try {
    console.log(`[Scraper] ${storeName}: Scraping via ScraperAPI with residential IP...`);
    
    // ScraperAPI URL rendering JS and targeting Chile (CL)
    const scraperApiUrl = `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=true&country_code=cl`;
    
    const response = await axios.get(scraperApiUrl, { timeout: 45000 });
    const items = parseStoreHtml(response.data, storeName, url);
    console.log(`[Scraper] ${storeName} ScraperAPI: Extracted ${items.length} items.`);
    return items;
  } catch (error) {
    console.error(`[Scraper] ${storeName} ScraperAPI failed:`, error.message);
    return [];
  }
}

/**
 * Router to decide between ScraperAPI and local BrowserWindow scraping
 */
async function scrapeStore(storeName, url, query, script) {
  let apiKey = null;
  try {
    apiKey = await getSetting('scraperapi_key');
  } catch (e) {
    console.error('[Scraper] Error getting scraperapi_key:', e.message);
  }

  if (apiKey && apiKey.trim().length > 0) {
    return scrapeWithAPI(url, storeName, apiKey);
  } else {
    console.log(`[Scraper] No ScraperAPI key found. Using local BrowserWindow for ${storeName}...`);
    return scrapeInWindow(url, script, storeName);
  }
}

/**
 * Helper for BrowserWindow scraping (Ultra Robust implementation with basic stealth)
 */
async function scrapeInWindow(url, script, storeName) {
  return new Promise((resolve) => {
    const ses = session.fromPartition(`persist:${storeName.toLowerCase()}`);
    
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        session: ses,
        offscreen: false, 
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
        images: false // Speed boost
      }
    });

    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    win.webContents.userAgent = userAgent;

    // Timeout (30s) for slow Chilean retail sites
    let timer = setTimeout(() => {
      if (!win.isDestroyed()) {
        console.log(`[Scraper] ${storeName} timeout (30s)`);
        win.destroy();
        resolve([]);
      }
    }, 30000);

    // Bypass basic navigator.webdriver detection before execution
    win.webContents.on('dom-ready', async () => {
      try {
        if (win.isDestroyed()) return;

        // Apply basic stealth to hide headless nature
        await win.webContents.executeJavaScript(`
          Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
          });
        `).catch(() => {});

        console.log(`[Scraper] ${storeName} DOM ready, waiting for JS hydration...`);
        // Wait for JS framework loading
        await new Promise(r => setTimeout(r, 6000));
        
        if (win.isDestroyed()) return;

        const results = await win.webContents.executeJavaScript(`
          (async () => {
            try {
              // Quick clean of popups
              const popups = document.querySelectorAll('.dy-modal-container, .modal, .popup, .newsletter, .popover, [class*="overlay"]');
              popups.forEach(p => p.remove());
              document.body.style.overflow = 'auto';

              ${script}
            } catch(e) {
              return [];
            }
          })()
        `);
        
        if (!win.isDestroyed()) win.destroy();
        clearTimeout(timer);
        
        const processed = (results || []).map((p, i) => ({
          ...p,
          id: `${storeName.toLowerCase()}-${Date.now()}-${i}`
        }));
        
        console.log(`[Scraper] ${storeName} extracted ${processed.length} results`);
        resolve(processed);
      } catch (err) {
        if (!win.isDestroyed()) {
           console.error(`[Scraper] ${storeName} execution error:`, err.message);
           win.destroy();
        }
        clearTimeout(timer);
        resolve([]);
      }
    });

    win.loadURL(url).catch((err) => {
      if (err.code !== 'ERR_ABORTED') {
        console.error(`[Scraper] ${storeName} load failed:`, err.message);
      }
      if (!win.isDestroyed()) {
        console.log(`[Scraper] Retrying ${storeName}...`);
        win.loadURL(url).catch(() => {});
      }
    });
  });
}

/**
 * MERCADO LIBRE: Axios (Stable)
 */
async function scrapeMercadoLibre(query) {
  try {
    const searchUrl = `https://listado.mercadolibre.cl/${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      timeout: 10000
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
      let url = ensureAbsoluteUrl(urlEl.attr('href'), 'https://www.mercadolibre.cl');
      const imgEl = $(element).find('img.poly-component__picture, img.ui-search-result-image__element');
      let image = imgEl.attr('data-src') || imgEl.attr('src') || '';
      image = ensureAbsoluteUrl(image, 'https://www.mercadolibre.cl');

      if (title && !isNaN(price) && url) {
        results.push({ id: `mlc-${Date.now()}-${i}`, title, price, url, image, store: 'MercadoLibre' });
      }
    });
    console.log(`[Scraper] MercadoLibre: ${results.length} results`);
    return results;
  } catch (error) {
    console.error('[Scraper] ML error:', error.message);
    return [];
  }
}

/**
 * SODIMAC
 */
async function scrapeSodimac(query) {
  const url = `https://www.sodimac.cl/sodimac-cl/search?text=${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('a.pod-link, [id^="testId-pod-"], .product-container, [class*="product-card"]');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('b, [id*="display-name"], .product-title, .title, h3');
          const priceEl = card.querySelector('[class*="price"], .current-price, .discount-price, .price');
          const link = card.href || (card.querySelector('a') ? card.querySelector('a').href : '');
          const imgEl = card.querySelector('img');
          if (titleEl && priceEl && link) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            if (title && price > 0) {
              items.push({ title, price, url: link, image: imgEl ? imgEl.src : '', store: 'Sodimac' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Sodimac', url, query, script);
}

/**
 * FALABELLA
 */
async function scrapeFalabella(query) {
  const url = `https://www.falabella.com/falabella-cl/search?Ntt=${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('a.pod-link, [id^="testId-pod-"], .product-card, [class*="product-card"]');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('b, [id*="display-name"], .pod-display-name, .title, h3');
          const priceEl = card.querySelector('[class*="price"], .copy10, .price-0, .current-price, .price');
          const link = card.href || (card.querySelector('a') ? card.querySelector('a').href : '');
          const imgEl = card.querySelector('img');
          if (titleEl && priceEl && link) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            if (title && price > 0) {
              items.push({ title, price, url: link, image: imgEl ? imgEl.src : '', store: 'Falabella' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Falabella', url, query, script);
}

/**
 * LIDER
 */
async function scrapeLider(query) {
  const url = `https://www.lider.cl/supermercado/search?query=${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('.product-card, [class*="ProductCard"], .item-product');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('[class*="ProductName"], .product-name, .name, h3');
          const priceEl = card.querySelector('[class*="PriceValue"], .price, .current-price');
          const linkEl = card.querySelector('a');
          if (titleEl && priceEl && linkEl) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            const imgEl = card.querySelector('img');
            if (title && price > 0) {
              items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Lider' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Lider', url, query, script);
}

/**
 * PARIS
 */
async function scrapeParis(query) {
  const url = `https://www.paris.cl/search?q=${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('.product-item, .item-product, [class*="product-card"]');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('.pdp-link, .item-name, h3, h4');
          const priceEl = card.querySelector('.item-price, .price, .price-main');
          const linkEl = card.querySelector('a');
          if (titleEl && priceEl && linkEl) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            const imgEl = card.querySelector('img');
            if (title && price > 0) {
              items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Paris' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Paris', url, query, script);
}

/**
 * EASY
 */
async function scrapeEasy(query) {
  const url = `https://www.easy.cl/buscar?q=${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('.product-card, [class*="product-card"], [class*="galleryItem"]');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('[class*="productBrand"], .product-title, .title, h3');
          const priceEl = card.querySelector('[class*="currencyContainer"], .price, .current-price');
          const linkEl = card.querySelector('a');
          if (titleEl && priceEl && linkEl) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            const imgEl = card.querySelector('img');
            if (title && price > 0) {
              items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Easy' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Easy', url, query, script);
}

/**
 * RIPLEY
 */
async function scrapeRipley(query) {
  const url = `https://simple.ripley.cl/search/${encodeURIComponent(query)}`;
  const script = `
    (() => {
      const items = [];
      const cards = document.querySelectorAll('.catalog-product, .product-item, [class*="catalog-product"]');
      cards.forEach((card, i) => {
        if (items.length >= 6) return;
        try {
          const titleEl = card.querySelector('.catalog-product-details__name, h3, h4');
          const priceEl = card.querySelector('.catalog-prices__offer-price, .catalog-prices__card-price, .price');
          const linkEl = card.querySelector('a');
          if (titleEl && priceEl && linkEl) {
            const title = titleEl.innerText.trim();
            const price = parseInt(priceEl.innerText.replace(/[^0-9]/g, ''), 10);
            const imgEl = card.querySelector('img');
            if (title && price > 0) {
              items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Ripley' });
            }
          }
        } catch(e) {}
      });
      return items;
    })()
  `;
  return scrapeStore('Ripley', url, query, script);
}

module.exports = {
  searchProducts
};
