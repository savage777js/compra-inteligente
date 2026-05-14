import React, { useState } from 'react';
import { Search, Bot, TrendingUp, Loader2, ExternalLink } from 'lucide-react';

function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [error, setError] = useState(null);

  const getWords = (text) => text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const getSimilarity = (words1, words2) => {
    const intersection = words1.filter(x => words2.includes(x));
    return intersection.length / Math.min(words1.length, words2.length);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAiAnalysis(null);
    setError(null);
    setResults([]);

    try {
      if (window.electronAPI) {
        const response = await window.electronAPI.searchProducts(query);
        if (response.success) {
          
          let processedResults = [...response.data];
          
          // Detectar modelos similares más baratos en otras tiendas
          for (let i = 0; i < processedResults.length; i++) {
            const p1 = processedResults[i];
            const words1 = getWords(p1.title);
            
            for (let j = 0; j < processedResults.length; j++) {
              if (i === j) continue;
              const p2 = processedResults[j];
              const words2 = getWords(p2.title);
              
              // Si comparten más del 65% de las palabras clave, son de distinta tienda y el otro es más barato
              if (getSimilarity(words1, words2) > 0.65 && p1.store !== p2.store && p2.price < p1.price) {
                if (!p1.cheaperAlternative || p2.price < p1.cheaperAlternative.price) {
                  p1.cheaperAlternative = p2;
                }
              }
            }
          }
          
          setResults(processedResults);
          
          setAnalyzing(true);
          const aiResponse = await window.electronAPI.analyzeProducts(query, processedResults);
          
          if (aiResponse.success) {
            setAiAnalysis(aiResponse.data);
          } else {
            setAiAnalysis('Ocurrió un error al analizar los productos.');
          }
          setAnalyzing(false);
          
        } else {
          setError('Error al buscar: ' + response.error);
        }
      }
    } catch (e) {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
  };

  return (
    <div className="app-container">
      <div className="gradient-mesh"></div>
      <div className="gradient-mesh-2"></div>

      <div className="content-overlay">
        <header className="header">
          <h1>Compra Inteligente</h1>
          <p>Tu Asesor IA de Compras Multi-Categoría</p>
        </header>
        
        <main className="main-content">
          <div className="search-section glass-panel">
          <h2>¿Qué necesitas comprar hoy?</h2>
          <div className="search-bar">
            <Search className="search-icon" size={20} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Ej: Notebook para programar, Taladro percutor, Neumáticos aro 15..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button className="primary-btn" onClick={handleSearch} disabled={loading || analyzing}>
              {loading || analyzing ? <Loader2 className="spin-icon" size={20} /> : 'Investigar con IA'}
            </button>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="card glass-panel ai-assistant">
            <h3><Bot size={24} className="icon" /> Asesor IA</h3>
            <div className="chat-placeholder">
              {analyzing ? (
                <div className="loading-state">
                  <Loader2 className="spin-icon large-spinner" size={32} />
                  <p>La IA está analizando las ofertas para darte una recomendación...</p>
                </div>
              ) : (
                <div className="ai-message">
                  {aiAnalysis ? (
                    <div className="markdown-content">
                      {aiAnalysis.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                    </div>
                  ) : (
                    <p>¡Hola! Soy tu asistente de compras. Dime qué buscas y analizaré el mercado por ti para darte la mejor recomendación calidad/precio.</p>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="card glass-panel trending">
            <h3><TrendingUp size={24} className="icon" /> Resultados de la Búsqueda</h3>
            <div className="results-container">
              {loading && (
                <div className="loading-state">
                  <Loader2 className="spin-icon large-spinner" size={32} />
                  <p>Investigando tiendas, comparando precios...</p>
                </div>
              )}
              {error && <p className="error-text">{error}</p>}
              {!loading && results.length === 0 && !error && (
                <div className="empty-state">
                  Buscando oportunidades en tiendas confiables...
                </div>
              )}
              {!loading && results.length > 0 && (
                <div className="product-list">
                  {results.map((product) => (
                    <div key={product.id} className="product-card">
                      <img src={product.image} alt={product.title} className="product-img" />
                      <div className="product-info">
                        <h4 className="product-title" title={product.title}>{product.title}</h4>
                        <p className="product-price">{formatPrice(product.price)}</p>
                        
                        {product.cheaperAlternative && (
                          <div className="cheaper-alert">
                            🔥 ¡Mismo modelo en <strong>{product.cheaperAlternative.store}</strong> por {formatPrice(product.cheaperAlternative.price)}!
                          </div>
                        )}
                        
                        <div className="product-footer">
                          <span className="store-badge">{product.store}</span>
                          <a href={product.url} target="_blank" rel="noreferrer" className="view-link">
                            Ver <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </main>
      </div>
    </div>
  );
}

export default App;
