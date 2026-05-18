const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  searchProducts: (query) => ipcRenderer.invoke('search-products', query),
  getPriceHistory: (productId) => ipcRenderer.invoke('get-price-history', productId),
  analyzeProducts: (query, products) => ipcRenderer.invoke('analyze-products', query, products),
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  saveSetting: (key, value) => ipcRenderer.invoke('save-setting', key, value),
  toggleFavorite: (productId, alertThreshold) => ipcRenderer.invoke('toggle-favorite', productId, alertThreshold),
  getFavorites: () => ipcRenderer.invoke('get-favorites')
});
