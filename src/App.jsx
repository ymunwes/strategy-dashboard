import React, { useState, useEffect } from 'react';
import MarketSidebar from './components/Sidebar/MarketSidebar';
import StrategyChart from './components/Chart/StrategyChart';
import { fetchStrategyList, fetchStrategyData } from './services/githubService';
import { Activity, Clock } from 'lucide-react';
import './index.css';

// Simple Error Boundary Fallback component
const ErrorFallback = ({ error }) => (
  <div style={{ padding: '20px', color: '#ff3b30', background: '#0b0e11', height: '100%', fontFamily: 'monospace' }}>
    <h3>[ CHART_CRASH_DETECTED ]</h3>
    <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap' }}>{error.message}</pre>
    <button onClick={() => window.location.reload()} style={{ background: '#2a2e39', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
      RETRY_RENDER
    </button>
  </div>
);

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

function App() {
  const [strategies, setStrategies] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState(null);
  const [mainData, setMainData] = useState([]);
  const [benchmarksData, setBenchmarksData] = useState({});
  const [showBenchmarks, setShowBenchmarks] = useState({
    SPY: true,
    QQQ: false,
    SPXL: false,
    TQQQ: false,
    GRNY: false
  });
  const [isNormalized, setIsNormalized] = useState(true);
  const [appMode, setAppMode] = useState('single'); // 'single' or 'portfolio'
  const [portfolioWeights, setPortfolioWeights] = useState({});
  const [portfolioDataMap, setPortfolioDataMap] = useState({});
  const [chartType, setChartType] = useState('line'); // 'candlestick' or 'line'
  const [lineSource, setLineSource] = useState('close'); // 'close' or 'open'
  const [showDrawdown, setShowDrawdown] = useState(true);
  const [timeframe, setTimeframe] = useState('1D'); // '1D', '1W', '1M'
  const [loading, setLoading] = useState(true);

  // Load strategy list
  useEffect(() => {
    const init = async () => {
      const list = await fetchStrategyList();
      setStrategies(list);
      if (list.length > 0) {
        setSelectedSymbol(list[0].symbol);
      }
      setLoading(false);
    };
    init();
  }, []);

  /**
   * Parses the strategy date format (YYYYMMDD'T'HHMMSS) into a standard Date object or timestamp.
   * @param {string} dateStr 
   */
  const parseStrategyDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) return NaN;
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return new Date(`${year}-${month}-${day}`).getTime();
  };

  // Load selected strategy data
  useEffect(() => {
    if (!selectedSymbol) return;
    const loadData = async () => {
      const data = await fetchStrategyData(selectedSymbol);
      setMainData(data);
    };
    loadData();
  }, [selectedSymbol]);

  const activeStrategy = strategies.find(s => s.symbol === selectedSymbol);
  const deposits = activeStrategy?.deposits || [];

  const [comparedSymbols, setComparedSymbols] = useState([]);
  const [comparedData, setComparedData] = useState({});

  // Load compared strategies data
  useEffect(() => {
    const loadCompared = async () => {
      const missingSymbols = comparedSymbols.filter(sym => !comparedData[sym]);
      for (const symbol of missingSymbols) {
        try {
          const data = await fetchStrategyData(symbol);
          setComparedData(prev => ({ ...prev, [symbol]: data }));
        } catch (e) {
          console.error(`Failed to load compared strategy ${symbol}:`, e);
        }
      }
    };
    loadCompared();
  }, [comparedSymbols]);

  const handleToggleCompare = (symbol, e) => {
    e.stopPropagation(); // Prevent triggering onSelect for the row
    setComparedSymbols(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    );
  };

  // Load portfolio data
  useEffect(() => {
    if (appMode !== 'portfolio') return;
    const loadPortfolioData = async () => {
      const symbols = Object.keys(portfolioWeights);
      const missing = symbols.filter(sym => !portfolioDataMap[sym]);
      for (const sym of missing) {
        try {
          const data = await fetchStrategyData(sym);
          setPortfolioDataMap(prev => ({ ...prev, [sym]: data }));
        } catch (e) {
          console.error(`Failed to load portfolio strategy ${sym}:`, e);
        }
      }
    };
    loadPortfolioData();
  }, [portfolioWeights, appMode, portfolioDataMap]);

  // Aggregate Portfolio Data (Option B: Daily Rebalanced Return Index)
  const aggregatedPortfolioData = React.useMemo(() => {
    if (appMode !== 'portfolio') return null;
    const symbols = Object.keys(portfolioWeights).filter(sym => portfolioWeights[sym] > 0);
    if (symbols.length === 0) return [];
    
    const pointers = {};
    const prevValues = {};
    let currentIndex = 10000;
    const result = [];
    
    const timeSet = new Set();
    symbols.forEach(sym => {
       pointers[sym] = 0;
       if (portfolioDataMap[sym]) {
          portfolioDataMap[sym].forEach(d => timeSet.add(d.time));
       }
    });
    const times = Array.from(timeSet).sort((a,b) => a - b);
    
    for (const t of times) {
       let totalActiveWeight = 0;
       let dailyReturnSum = 0;
       let hasAnyData = false;
       const currentVals = {};

       symbols.forEach(sym => {
          const dataArr = portfolioDataMap[sym];
          if (!dataArr) return;
          
          let p = pointers[sym];
          while (p < dataArr.length && dataArr[p].time < t) p++;
          pointers[sym] = p;
          
          if (p < dataArr.length && dataArr[p].time === t) {
             const pt = dataArr[p];
             const val = pt.close || pt.open;
             currentVals[sym] = val;
             if (prevValues[sym] !== undefined) {
                 totalActiveWeight += portfolioWeights[sym];
             }
             hasAnyData = true;
          }
       });

       if (totalActiveWeight > 0) {
          symbols.forEach(sym => {
             if (currentVals[sym] !== undefined && prevValues[sym] !== undefined) {
                 const normWeight = portfolioWeights[sym] / totalActiveWeight;
                 const ret = (currentVals[sym] / prevValues[sym]) - 1;
                 dailyReturnSum += (normWeight * ret);
             }
          });
          currentIndex = currentIndex * (1 + dailyReturnSum);
       }

       if (hasAnyData) {
          result.push({
             time: t,
             open: currentIndex, 
             high: currentIndex, 
             low: currentIndex,  
             close: currentIndex
          });
       }
       
       Object.assign(prevValues, currentVals);
    }
    
    return result;
  }, [appMode, portfolioWeights, portfolioDataMap]);

  // Load benchmark data (local from public folder)
  useEffect(() => {
    const loadBenchmarks = async () => {
      const activeBenchmarks = Object.keys(showBenchmarks).filter(k => showBenchmarks[k]);
      for (const symbol of activeBenchmarks) {
        if (!benchmarksData[symbol]) {
          try {
            const response = await fetch(`benchmarks/${symbol}.csv?t=${Date.now()}`);
            if (!response.ok) throw new Error(`${symbol} not found`);
            const csv = await response.text();
            // Simple parsing to match StrategyChart requirements
            const rows = csv.split('\n').filter(r => r.trim()).slice(1); // skip header
            const parsed = rows.map(r => {
              const columns = r.split(',').map(s => s.trim());
              const [dateStr, open, high, low, close] = columns;
              
              if (!dateStr || isNaN(Date.parse(dateStr))) return null;
              
              const openVal = parseFloat(open);
              const closeVal = parseFloat(close);
              if (isNaN(openVal) || isNaN(closeVal)) return null;

              return {
                time: Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000),
                open: openVal,
                high: parseFloat(high) || openVal,
                low: parseFloat(low) || closeVal,
                close: closeVal
              };
            }).filter(d => d !== null);
            setBenchmarksData(prev => ({ ...prev, [symbol]: parsed }));
          } catch (e) {
            console.error(`Failed to load benchmark ${symbol}:`, e);
          }
        }
      }
    };
    loadBenchmarks();
  }, [showBenchmarks]);

  const handleToggleBenchmark = (symbol) => {
    setShowBenchmarks(prev => ({ ...prev, [symbol]: !prev[symbol] }));
  };

  return (
    <div className="dashboard-container">
      <main className="chart-area">
        <header className="terminal-header" style={{ width: '100%', justifyContent: 'space-between', borderLeft: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Activity size={16} className="terminal-status" />
            <span style={{ fontWeight: '600' }}>{appMode === 'portfolio' ? 'PORTFOLIO_BUILDER' : (selectedSymbol || 'BOOTING...')}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: '1rem', size: '12px' }}>
              RELIABLE_CHART_v8.0
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setIsNormalized(!isNormalized)}>
              <span style={{ fontSize: '12px', color: isNormalized ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>
                RELATIVE_BASIS
              </span>
              <label className="switch">
                  <input type="checkbox" checked={isNormalized} readOnly />
                  <span className="slider"></span>
              </label>
            </div>
            <Clock size={16} color="var(--text-muted)" />
          </div>
        </header>
        
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)' }}>
            [ LOADING_STRATEGIES... ]
          </div>
        ) : (
          <div style={{ flex: 1, position: 'relative' }}>
            <ErrorBoundary>
              <StrategyChart 
                mainData={appMode === 'portfolio' ? aggregatedPortfolioData : mainData} 
                benchmarksData={benchmarksData} 
                showBenchmarks={showBenchmarks}
                isNormalized={isNormalized}
                chartType={chartType}
                lineSource={lineSource}
                showDrawdown={showDrawdown}
                timeframe={timeframe}
                comparedSymbols={appMode === 'portfolio' ? [] : comparedSymbols}
                comparedData={comparedData}
                deposits={appMode === 'portfolio' ? [] : deposits}
              />
            </ErrorBoundary>
          </div>
        )}
      </main>

      <MarketSidebar 
        strategies={strategies} 
        selectedSymbol={selectedSymbol} 
        onSelect={setSelectedSymbol}
        benchmarks={showBenchmarks}
        onToggleBenchmark={handleToggleBenchmark}
        chartType={chartType}
        setChartType={setChartType}
        lineSource={lineSource}
        setLineSource={setLineSource}
        showDrawdown={showDrawdown}
        onToggleDrawdown={() => setShowDrawdown(!showDrawdown)}
        timeframe={timeframe}
        setTimeframe={setTimeframe}
        comparedSymbols={comparedSymbols}
        onToggleCompare={handleToggleCompare}
        appMode={appMode}
        setAppMode={setAppMode}
        portfolioWeights={portfolioWeights}
        setPortfolioWeights={setPortfolioWeights}
      />
    </div>
  );
}

export default App;
