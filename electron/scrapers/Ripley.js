const BaseScraper = require('./BaseScraper');

class RipleyScraper extends BaseScraper {
  constructor() {
    super('Ripley', 'https://simple.ripley.cl', {
      cardSelector: '.catalog-product, .product-item, [class*="catalog-product"]',
      titleSelector: '.catalog-product-details__name, h3, h4',
      priceSelector: '.catalog-prices__offer-price, .catalog-prices__card-price, .price',
      linkSelector: 'a',
      imageSelector: 'img'
    });
  }

  async scrape(query, cloudConfig = {}) {
    const url = `https://simple.ripley.cl/search/${encodeURIComponent(query)}`;
    
    let results = [];
    
    if (cloudConfig.provider === 'scraperapi' && cloudConfig.scraperApiKey) {
      results = await this.scrapeWithAPI(url, cloudConfig.scraperApiKey);
    } else if (cloudConfig.provider === 'apify' && cloudConfig.apifyToken) {
      results = await this.scrapeWithApify(url, cloudConfig.apifyToken);
    }

    // Hybrid Fallback: Execute local stealth BrowserWindow if cloud fails or returns 0 items
    if (results.length === 0) {
      console.log(`[Scraper Strategy - Ripley] Cloud returned 0 items. Triggering local BrowserWindow fallback...`);
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
                  items.push({ title, price, url: linkEl.href, image: imgEl ? imgEl.src : '', store: 'Ripley' });
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

module.exports = RipleyScraper;
