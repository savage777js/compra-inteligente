const BaseScraper = require('./BaseScraper');

class ParisScraper extends BaseScraper {
  constructor() {
    super('Paris', 'https://www.paris.cl', {
      cardSelector: '.product-item, .item-product, [class*="product-card"]',
      titleSelector: '.pdp-link, .item-name, h3, h4',
      priceSelector: '.item-price, .price, .price-main',
      linkSelector: 'a',
      imageSelector: 'img'
    });
  }

  async scrape(query, cloudConfig = {}) {
    const url = `https://www.paris.cl/search?q=${encodeURIComponent(query)}`;
    
    let results = [];
    
    if (cloudConfig.provider === 'scraperapi' && cloudConfig.scraperApiKey) {
      results = await this.scrapeWithAPI(url, cloudConfig.scraperApiKey);
    } else if (cloudConfig.provider === 'apify' && cloudConfig.apifyToken) {
      results = await this.scrapeWithApify(url, cloudConfig.apifyToken);
    }

    // Hybrid Fallback: Execute local stealth BrowserWindow if cloud fails or returns 0 items
    if (results.length === 0) {
      console.log(`[Scraper Strategy - Paris] Cloud returned 0 items. Triggering local BrowserWindow fallback...`);
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
                  items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Paris' });
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

module.exports = ParisScraper;
