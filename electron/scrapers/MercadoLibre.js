const BaseScraper = require('./BaseScraper');
const axios = require('axios');
const cheerio = require('cheerio');

class MercadoLibreScraper extends BaseScraper {
  constructor() {
    super('MercadoLibre', 'https://www.mercadolibre.cl', {
      cardSelector: '.ui-search-layout__item, .poly-card',
      titleSelector: '.poly-component__title, .ui-search-item__title',
      priceSelector: '.poly-price__current .andes-money-amount__fraction, .ui-search-price__second-line .andes-money-amount__fraction',
      linkSelector: 'a.poly-component__title, a.ui-search-link, a.poly-component__link',
      imageSelector: 'img.poly-component__picture, img.ui-search-result-image__element'
    });
  }

  async scrape(query, apiKey = null) {
    try {
      console.log(`[Scraper Strategy - MercadoLibre] Running direct Axios scrape...`);
      const searchUrl = `https://listado.mercadolibre.cl/${encodeURIComponent(query)}`;
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $(this.config.cardSelector).each((i, element) => {
        if (i >= 8) return false; 
        const titleEl = $(element).find(this.config.titleSelector);
        const title = titleEl.text().trim();
        const priceEl = $(element).find(this.config.priceSelector);
        const priceText = priceEl.first().text().replace(/\./g, '').trim();
        const price = parseInt(priceText, 10);
        const urlEl = $(element).find(this.config.linkSelector);
        let url = this.ensureAbsoluteUrl(urlEl.attr('href'));
        const imgEl = $(element).find(this.config.imageSelector);
        let image = imgEl.attr('data-src') || imgEl.attr('src') || '';
        image = this.ensureAbsoluteUrl(image);

        if (title && !isNaN(price) && url) {
          results.push({
            id: `mlc-${Date.now()}-${i}`,
            title,
            price,
            url,
            image,
            store: this.storeName
          });
        }
      });
      
      console.log(`[Scraper Strategy - MercadoLibre] Found ${results.length} results.`);
      return results;
    } catch (error) {
      console.error('[Scraper Strategy - MercadoLibre] Error:', error.message);
      return [];
    }
  }
}

module.exports = MercadoLibreScraper;
