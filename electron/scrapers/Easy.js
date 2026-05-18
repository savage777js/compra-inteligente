const BaseScraper = require('./BaseScraper');

class EasyScraper extends BaseScraper {
  constructor() {
    super('Easy', 'https://www.easy.cl', {
      cardSelector: '.product-card, [class*="product-card"], [class*="galleryItem"]',
      titleSelector: '[class*="productBrand"], .product-title, .title, h3, b',
      priceSelector: '[class*="currencyContainer"], .price, .current-price',
      linkSelector: 'a',
      imageSelector: 'img'
    });
  }

  async scrape(query, cloudConfig = {}) {
    const url = `https://www.easy.cl/buscar?q=${encodeURIComponent(query)}`;
    
    let results = [];
    
    if (cloudConfig.provider === 'scraperapi' && cloudConfig.scraperApiKey) {
      results = await this.scrapeWithAPI(url, cloudConfig.scraperApiKey);
    } else if (cloudConfig.provider === 'apify' && cloudConfig.apifyToken) {
      results = await this.scrapeWithApify(url, cloudConfig.apifyToken);
    }

    // Hybrid Fallback: Execute local stealth BrowserWindow if cloud fails or returns 0 items
    if (results.length === 0) {
      console.log(`[Scraper Strategy - Easy] Cloud returned 0 items. Triggering local BrowserWindow fallback...`);
      const script = `
        (() => {
          const items = [];
          const cards = document.querySelectorAll('.product-card, [class*="product-card"], [class*="galleryItem"]');
          cards.forEach((card, i) => {
            if (items.length >= 6) return;
            try {
              const titleEl = card.querySelector('[class*="productBrand"], .product-title, .title, h3, b');
              const priceEl = card.querySelector('[class*="currencyContainer"], .price, .current-price');
              const linkEl = card.querySelector('a');
              if (titleEl && priceEl && linkEl) {
                const title = titleEl.innerText.trim();
                
                let rawPrice = priceEl.innerText.trim();
                let price = 0;
                const dollarMatch = rawPrice.match(/\\$\\s*([0-9.]+)/);
                if (dollarMatch) {
                  price = parseInt(dollarMatch[1].replace(/\\./g, ''), 10);
                } else {
                  price = parseInt(rawPrice.replace(/[^0-9]/g, ''), 10);
                }

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
      results = await this.scrapeInWindow(url, script);
    }

    return results;
  }
}

module.exports = EasyScraper;
