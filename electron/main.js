const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { searchProducts } = require('./scraperEngine');
const { saveProduct, getPriceHistory, getSetting, saveSetting, toggleFavorite, getFavorites } = require('./database');
const { analyzeProducts } = require('./ai');
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset', // Looks modern on Mac
    autoHideMenuBar: true, // Modern on Windows
  });

  // Intercept target="_blank" links and open in default system browser (Chrome/Safari)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    // In development, load the vite dev server
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built html file
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // Handle IPC calls from React
  ipcMain.handle('search-products', async (event, query) => {
    try {
      const results = await searchProducts(query);
      
      // Save all results to history asynchronously
      for (const product of results) {
        saveProduct(product).catch(e => console.error('Failed to save product:', e.message));
      }

      return { success: true, data: results };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-price-history', async (event, productId) => {
    try {
      const history = await getPriceHistory(productId);
      return { success: true, data: history };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Settings
  ipcMain.handle('get-setting', async (event, key) => {
    return await getSetting(key);
  });

  ipcMain.handle('save-setting', async (event, key, value) => {
    await saveSetting(key, value);
    return true;
  });

  // AI Analysis
  ipcMain.handle('analyze-products', async (event, query, products) => {
    try {
      const analysis = await analyzeProducts(query, products);
      return { success: true, data: analysis };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // --- ACADEMIC / ENTERPRISE FAVORITES IPC EXPOSURE ---
  ipcMain.handle('toggle-favorite', async (event, productId, alertThreshold) => {
    try {
      const result = await toggleFavorite(productId, alertThreshold);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-favorites', async (event) => {
    try {
      const favorites = await getFavorites();
      return { success: true, data: favorites };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
