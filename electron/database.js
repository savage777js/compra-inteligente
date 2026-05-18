const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

// Ensure the data directory exists
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'comprainteligente.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the local SQLite database at:', dbPath);
    db.serialize(() => {
      // Create Products Table
      db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        title TEXT,
        image_url TEXT,
        url TEXT,
        store TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create Price History Table
      db.run(`CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id TEXT,
        price REAL,
        currency TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id)
      )`);

      // Create Settings Table
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )`);

      // Create Queries Cache Table (Enterprise Optimization)
      db.run(`CREATE TABLE IF NOT EXISTS queries_cache (
        query TEXT PRIMARY KEY,
        results_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Create Favorites Table (Academic Extension)
      db.run(`CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        alert_threshold REAL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id)
      )`);
    });
  }
});

// Helper functions to interact with the DB
function saveProduct(product) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO products (id, title, image_url, url, store) VALUES (?, ?, ?, ?, ?)`,
      [product.id, product.title, product.image, product.url, product.store],
      function (err) {
        if (err) return reject(err);
        
        // Always add price history
        db.run(
          `INSERT INTO price_history (product_id, price, currency) VALUES (?, ?, ?)`,
          [product.id, product.price, 'CLP'],
          function (err) {
            if (err) return reject(err);
            resolve();
          }
        );
      }
    );
  });
}

function getPriceHistory(productId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT price, date FROM price_history WHERE product_id = ? ORDER BY date ASC`,
      [productId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function saveSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, value],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT value FROM settings WHERE key = ?`,
      [key],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.value : null);
      }
    );
  });
}

// --- ENTERPRISE CACHE FUNCTIONS ---

function saveQueryCache(query, results) {
  const queryKey = query.trim().toLowerCase();
  const resultsJson = JSON.stringify(results);
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO queries_cache (query, results_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)`,
      [queryKey, resultsJson],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

function getQueryCache(query) {
  const queryKey = query.trim().toLowerCase();
  // 12 hours TTL (Time-To-Live) cache limit to balance relevance and API expenses
  const ttlHours = 12;
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT results_json, updated_at FROM queries_cache 
       WHERE query = ? AND datetime(updated_at, '+${ttlHours} hours') >= datetime('now')`,
      [queryKey],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          try {
            const parsed = JSON.parse(row.results_json);
            resolve(parsed);
          } catch(e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      }
    );
  });
}

// --- FAVORITES AND ALERTS FUNCTIONS ---

function toggleFavorite(productId, alertThreshold = null) {
  const id = `fav-${productId}`;
  return new Promise((resolve, reject) => {
    db.get(`SELECT id FROM favorites WHERE product_id = ?`, [productId], (err, row) => {
      if (err) return reject(err);
      if (row) {
        // Delete if already favorite
        db.run(`DELETE FROM favorites WHERE product_id = ?`, [productId], function (err) {
          if (err) return reject(err);
          resolve({ status: 'removed' });
        });
      } else {
        // Insert new favorite
        db.run(
          `INSERT INTO favorites (id, product_id, alert_threshold) VALUES (?, ?, ?)`,
          [id, productId, alertThreshold],
          function (err) {
            if (err) return reject(err);
            resolve({ status: 'added' });
          }
        );
      }
    });
  });
}

function getFavorites() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT f.alert_threshold, f.added_at, p.id, p.title, p.image_url as image, p.url, p.store,
              (SELECT price FROM price_history WHERE product_id = p.id ORDER BY date DESC LIMIT 1) as price
       FROM favorites f
       JOIN products p ON f.product_id = p.id
       ORDER BY f.added_at DESC`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  db,
  saveProduct,
  getPriceHistory,
  saveSetting,
  getSetting,
  saveQueryCache,
  getQueryCache,
  toggleFavorite,
  getFavorites
};
