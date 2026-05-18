const BaseScraper = require('./BaseScraper');

class SodimacScraper extends BaseScraper {
  constructor() {
    super('Sodimac', 'https://www.sodimac.cl', {
      cardSelector: 'a.pod-link, [id^="testId-pod-"], .product-container, [class*="product-card"]',
      titleSelector: '[id*="display-name"], [class*="product-title"], [class*="pod-title"], .title, h3',
      priceSelector: '[class*="price"], .current-price, .discount-price, .price',
      linkSelector: 'a',
      imageSelector: 'img'
    });
  }

  async scrape(query, cloudConfig = {}) {
    const url = `https://www.sodimac.cl/sodimac-cl/search?text=${encodeURIComponent(query)}`;
    
    let results = [];
    
    if (cloudConfig.provider === 'scraperapi' && cloudConfig.scraperApiKey) {
      results = await this.scrapeWithAPI(url, cloudConfig.scraperApiKey);
    } else if (cloudConfig.provider === 'apify' && cloudConfig.apifyToken) {
      results = await this.scrapeWithApify(url, cloudConfig.apifyToken);
    }

    // Hybrid Fallback: Execute local stealth BrowserWindow if cloud fails or returns 0 items
    if (results.length === 0) {
      console.log(`[Scraper Strategy - Sodimac] Cloud returned 0 items. Triggering local BrowserWindow fallback...`);
      const script = `
        (() => {
          const items = [];
          const cards = document.querySelectorAll('a.pod-link, [id^="testId-pod-"], .product-container, [class*="product-card"]');
          cards.forEach((card, i) => {
            if (items.length >= 6) return;
            try {
              const titleEl = card.querySelector('[id*="display-name"], [class*="product-title"], [class*="pod-title"], .title, h3');
              const priceEl = card.querySelector('[class*="price"], .current-price, .discount-price, .price');
              const link = card.href || (card.querySelector('a') ? card.querySelector('a').href : '');
              const imgEl = card.querySelector('img');
              if (titleEl && priceEl && link) {
                const title = titleEl.innerText.trim();
                
                let rawPrice = priceEl.innerText.trim();
                let price = 0;
                const dollarMatch = rawPrice.match(/\\$\\s*([0-9.]+)/);
                if (dollarMatch) {
                  price = parseInt(dollarMatch[1].replace(/\\./g, ''), 10);
                } else {
                  price = parseInt(rawPrice.replace(/[^0-9]/g, ''), 10);
                }

                if (title && price > 0) {
                  items.push({ title, price, url: link, image: imgEl ? imgEl.src : '', store: 'Sodimac' });
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

module.exports = SodimacScraper;
