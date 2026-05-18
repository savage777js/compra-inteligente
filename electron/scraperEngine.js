const { getSetting, getQueryCache, saveQueryCache } = require('./database');

// Import Scraper Strategies (Strategy Pattern)
const MercadoLibreScraper = require('./scrapers/MercadoLibre');
const SodimacScraper = require('./scrapers/Sodimac');
const FalabellaScraper = require('./scrapers/Falabella');
const EasyScraper = require('./scrapers/Easy');
const ParisScraper = require('./scrapers/Paris');
const RipleyScraper = require('./scrapers/Ripley');

/**
 * Enterprise Scraper Orchestrator and Factory (Academic/Production Grade)
 * Implements Cache-Aside pattern, Strategy pattern, and batching orchestration.
 */
async function searchProducts(query) {
  const cleanQuery = query.trim();
  const queryKey = cleanQuery.toLowerCase();
  
  console.log(`[Scraper Engine] Starting search request for: "${cleanQuery}"`);

  try {
    // --- 1. Cache-Aside Pattern Implementation ---
    const cachedResults = await getQueryCache(queryKey);
    if (cachedResults && cachedResults.length > 0) {
      console.log(`[Scraper Engine] Cache HIT! Returning ${cachedResults.length} cached results (under 12 hours old).`);
      return cachedResults;
    }
    console.log(`[Scraper Engine] Cache MISS! Fetching fresh data from retail stores...`);

    // Fetch cloud settings to assemble cloudConfig payload
    const provider = await getSetting('cloud_provider') || 'scraperapi';
    const scraperApiKey = await getSetting('scraperapi_key');
    const apifyToken = await getSetting('apify_token');

    const cloudConfig = {
      provider,
      scraperApiKey,
      apifyToken
    };

    console.log(`[Scraper Engine] Configuration loaded. Cloud provider: ${provider.toUpperCase()}`);

    // Instantiate Store Scrapers (Strategy Pattern)
    const scrapers = {
      MercadoLibre: new MercadoLibreScraper(),
      Sodimac: new SodimacScraper(),
      Falabella: new FalabellaScraper(),
      Easy: new EasyScraper(),
      Paris: new ParisScraper(),
      Ripley: new RipleyScraper()
    };

    // 2. MercadoLibre Scraper is exceptionally fast (Axios), execute it immediately
    let mlResults = [];
    try {
      mlResults = await scrapers.MercadoLibre.scrape(cleanQuery, cloudConfig);
    } catch(e) {
      console.error('[Scraper Engine] MercadoLibre execution failed:', e.message);
    }

    // 3. Define other store tasks
    const activeScrapers = [
      { name: 'Sodimac', instance: scrapers.Sodimac },
      { name: 'Falabella', instance: scrapers.Falabella },
      { name: 'Paris', instance: scrapers.Paris },
      { name: 'Easy', instance: scrapers.Easy },
      { name: 'Ripley', instance: scrapers.Ripley }
    ];

    let otherResults = [];
    
    // Process remaining stores in small batches of 2 for memory/stability containment
    for (let i = 0; i < activeScrapers.length; i += 2) {
      const batch = activeScrapers.slice(i, i + 2);
      console.log(`[Scraper Engine] Running batch: ${batch.map(b => b.name).join(', ')}`);
      
      const batchTasks = batch.map(s => s.instance.scrape(cleanQuery, cloudConfig).catch(err => {
        console.error(`[Scraper Engine] ${s.name} strategy error:`, err.message);
        return [];
      }));

      const batchResults = await Promise.all(batchTasks);
      otherResults = otherResults.concat(batchResults.flat());
    }

    // Merge and filter results
    let allResults = [...mlResults, ...otherResults];
    
    // Core validation: Ensure items have name, valid positive price, and url link
    allResults = allResults.filter(p => p && p.title && !isNaN(p.price) && p.price > 0 && p.url);
    
    // Sort by ascending price (Best deals first)
    allResults.sort((a, b) => a.price - b.price);

    console.log(`[Scraper Engine] Scrape completed. Total results parsed: ${allResults.length}`);

    // --- 4. Cache-Aside Cache Save ---
    if (allResults.length > 0) {
      await saveQueryCache(queryKey, allResults).catch(e => {
        console.error('[Scraper Engine] Failed to save query cache:', e.message);
      });
    }

    return allResults;
  } catch (error) {
    console.error('[Scraper Engine] Global search error:', error);
    return [];
  }
}

module.exports = {
  searchProducts
};
