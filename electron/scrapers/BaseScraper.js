const { BrowserWindow, session } = require('electron');
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Base abstract class representing a store Scraping Strategy
 * Part of the Strategy Pattern implementation (Academic/Enterprise Grade)
 */
class BaseScraper {
  constructor(storeName, baseUrl, config) {
    this.storeName = storeName;
    this.baseUrl = baseUrl;
    this.config = config; // Contains cardSelector, titleSelector, etc.
  }

  /**
   * Abstract/Hook method to be implemented by subclass strategies
   */
  async scrape(query, cloudConfig = {}) {
    throw new Error(`Scrape method not implemented for strategy: ${this.storeName}`);
  }

  /**
   * Helper to resolve relative and schema-less links
   */
  ensureAbsoluteUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) {
      try {
        const urlObj = new URL(this.baseUrl);
        return `${urlObj.protocol}//${urlObj.host}${url}`;
      } catch (e) {
        return this.baseUrl.replace(/\/$/, '') + url;
      }
    }
    return this.baseUrl.replace(/\/$/, '') + '/' + url;
  }

  /**
   * Invincible defensive price extractor
   * Prevents aggregated multiple prices and strips appended percentage tags (e.g. 19% OFF)
   */
  extractFirstPrice(rawPrice) {
    if (!rawPrice) return 0;
    
    // 1. Try to find the first price pattern with a peso/dollar sign
    const dollarMatch = rawPrice.match(/\$\s*([0-9.]+)/);
    if (dollarMatch) {
      const clean = dollarMatch[1].replace(/\./g, '');
      const val = parseInt(clean, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    
    // 2. Look for a standard dot-formatted number (e.g. 989.990)
    const dotMatch = rawPrice.match(/([0-9]{1,3}(\.[0-9]{3})+)/);
    if (dotMatch) {
      const clean = dotMatch[1].replace(/\./g, '');
      const val = parseInt(clean, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    
    // 3. Fallback: extract the first contiguous sequence of digits
    const digitMatch = rawPrice.match(/\d+/);
    if (digitMatch) {
      const val = parseInt(digitMatch[0], 10);
      if (!isNaN(val) && val > 0) return val;
    }
    
    return 0;
  }

  /**
   * Unified parser using Cheerio and store configurations
   */
  parseHtml(html) {
    const $ = cheerio.load(html);
    const items = [];
    
    $(this.config.cardSelector).each((i, element) => {
      if (items.length >= 6) return false;
      try {
        const card = $(element);
        const titleEl = card.find(this.config.titleSelector);
        const priceEl = card.find(this.config.priceSelector);
        
        let link = card.attr('href') || card.find(this.config.linkSelector).attr('href') || '';
        if (!link) return;
        link = this.ensureAbsoluteUrl(link);

        const imgEl = card.find(this.config.imageSelector);
        let image = imgEl.attr('src') || imgEl.attr('data-src') || imgEl.attr('data-original') || '';
        image = this.ensureAbsoluteUrl(image);

        if (titleEl.length && priceEl.length && link) {
          const title = titleEl.text().trim();
          
          // Use invincible price extractor to bypass percentage and multi-price bugs
          const price = this.extractFirstPrice(priceEl.text());

          if (title && price > 0) {
            items.push({
              title,
              price,
              url: link,
              image: image,
              store: this.storeName
            });
          }
        }
      } catch (e) {
        console.error(`[Scraper Strategy - ${this.storeName}] Cheerio parse error:`, e.message);
      }
    });
    return items;
  }

  /**
   * Cloud Fallback Mode - Bypasses Cloudflare using residential Chilean proxies via ScraperAPI
   */
  async scrapeWithAPI(url, apiKey) {
    try {
      console.log(`[Scraper Strategy - ${this.storeName}] Scraping via ScraperAPI Cloud...`);
      const scraperApiUrl = `https://api.scraperapi.com/?api_key=${apiKey}&url=${encodeURIComponent(url)}&render=true&country_code=cl`;
      
      const response = await axios.get(scraperApiUrl, { timeout: 45000 });
      const items = this.parseHtml(response.data);
      
      return items.map((item, idx) => ({
        ...item,
        id: `${this.storeName.toLowerCase()}-${Date.now()}-${idx}`
      }));
    } catch (error) {
      console.error(`[Scraper Strategy - ${this.storeName}] ScraperAPI Cloud failed:`, error.message);
      return [];
    }
  }

  /**
   * Cloud Fallback Mode - Executes the search synchronously using Apify Playwright Scraper
   * Optimized with waitUntil: 'domcontentloaded' and timeout reductions to execute fast and prevent timeouts!
   */
  async scrapeWithApify(url, token) {
    try {
      console.log(`[Scraper Strategy - ${this.storeName}] Scraping via Apify Playwright Scraper Cloud...`);
      
      // Inject standard client-side pageFunction to execute in Apify's secure Puppeteer/Playwright environment
      const pageFunctionStr = `
        async function pageFunction(context) {
          const { page, request, log } = context;
          const sel = context.customData;
          log.info('Scraping page: ' + request.url);
          
          // Wait for dynamic React/Next.js hydration
          await page.waitForTimeout(4000);
          
          // Evaluate selectors in browser context
          const items = await page.evaluate((s) => {
            const parsed = [];
            const cards = document.querySelectorAll(s.cardSelector);
            cards.forEach((card) => {
              if (parsed.length >= 6) return;
              try {
                const titleEl = card.querySelector(s.titleSelector);
                const priceEl = card.querySelector(s.priceSelector);
                const linkEl = card.querySelector(s.linkSelector) || card;
                const imgEl = card.querySelector(s.imageSelector);
                
                if (titleEl && priceEl) {
                  const title = titleEl.innerText.trim();
                  
                  // Defensive Price parsing inside the browser environment
                  let rawPrice = priceEl.innerText.trim();
                  
                  // Invincible price extractor clone for sandbox execution
                  let extractedPrice = 0;
                  const dollarMatch = rawPrice.match(/\\$\\s*([0-9.]+)/);
                  if (dollarMatch) {
                    extractedPrice = parseInt(dollarMatch[1].replace(/\\./g, ''), 10);
                  } else {
                    const dotMatch = rawPrice.match(/([0-9]{1,3}(\\.[0-9]{3})+)/);
                    if (dotMatch) {
                      extractedPrice = parseInt(dotMatch[1].replace(/\\./g, ''), 10);
                    } else {
                      const digitMatch = rawPrice.match(/\\d+/);
                      if (digitMatch) {
                        extractedPrice = parseInt(digitMatch[0], 10);
                      }
                    }
                  }
                  
                  const urlLink = linkEl.href || card.href || '';
                  if (title && extractedPrice > 0) {
                    parsed.push({
                      title,
                      price: extractedPrice,
                      url: urlLink,
                      image: imgEl ? imgEl.src : '',
                      store: '${this.storeName}'
                    });
                  }
                }
              } catch(e) {}
            });
            return parsed;
          }, sel);
          
          if (items && items.length > 0) {
            await context.pushData(items);
          }
          return items;
        }
      `;

      const response = await axios.post(
        `https://api.apify.com/v2/acts/apify~playwright-scraper/run-sync-get-dataset-items?token=${token}&memory=512&timeout=60`,
        {
          startUrls: [{ url: url }],
          pageFunction: pageFunctionStr,
          customData: {
            cardSelector: this.config.cardSelector,
            titleSelector: this.config.titleSelector,
            priceSelector: this.config.priceSelector,
            linkSelector: this.config.linkSelector,
            imageSelector: this.config.imageSelector
          },
          maxPagesPerCrawl: 1,
          waitUntil: 'domcontentloaded',
          navigationTimeoutSecs: 30,
          proxyConfiguration: {
            useApifyProxy: true
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000
        }
      );

      let items = response.data || [];
      console.log(`[Scraper Strategy - ${this.storeName}] Apify raw response items:`, items.length);
      
      // Auto-flatten nested arrays from Apify
      if (Array.isArray(items) && items.length > 0 && Array.isArray(items[0])) {
        items = items.flat();
      }

      console.log(`[Scraper Strategy - ${this.storeName}] Apify success: Parsed ${items.length} flat items.`);
      
      return items.map((item, idx) => ({
        ...item,
        id: `${this.storeName.toLowerCase()}-${Date.now()}-${idx}`
      }));

    } catch (error) {
      console.error(`[Scraper Strategy - ${this.storeName}] Apify run failed:`, error.response?.data || error.message);
      return [];
    }
  }

  /**
   * Local Mode - Executes an offscreen BrowserWindow using Electron's rendering engine with stealth
   */
  async scrapeInWindow(url, script) {
    return new Promise((resolve) => {
      const ses = session.fromPartition(`persist:${this.storeName.toLowerCase()}`);
      
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
          images: false
        }
      });

      const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
      win.webContents.userAgent = userAgent;

      // 30 seconds safety timeout
      let timer = setTimeout(() => {
        if (!win.isDestroyed()) {
          console.log(`[Scraper Strategy - ${this.storeName}] BrowserWindow timeout (30s)`);
          win.destroy();
          resolve([]);
        }
      }, 30000);

      win.webContents.on('dom-ready', async () => {
        try {
          if (win.isDestroyed()) return;

          // Stealth override for basic headless checkers
          await win.webContents.executeJavaScript(`
            Object.defineProperty(navigator, 'webdriver', {
              get: () => undefined
            });
          `).catch(() => {});

          // Dynamic hydration delay
          await new Promise(r => setTimeout(r, 6000));
          
          if (win.isDestroyed()) return;

          const results = await win.webContents.executeJavaScript(`
            (async () => {
              try {
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
            id: `${this.storeName.toLowerCase()}-${Date.now()}-${i}`
          }));
          
          resolve(processed);
        } catch (err) {
          if (!win.isDestroyed()) {
             console.error(`[Scraper Strategy - ${this.storeName}] BrowserWindow JavaScript error:`, err.message);
             win.destroy();
          }
          clearTimeout(timer);
          resolve([]);
        }
      });

      win.loadURL(url).catch((err) => {
        if (err.code !== 'ERR_ABORTED') {
          console.error(`[Scraper Strategy - ${this.storeName}] Load failed:`, err.message);
        }
        if (!win.isDestroyed()) {
          win.loadURL(url).catch(() => {});
        }
      });
    });
  }
}

module.exports = BaseScraper;
