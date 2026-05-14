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

module.exports = {
  db,
  saveProduct,
  getPriceHistory,
  saveSetting,
  getSetting
};
