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
    TQQQ: false
  });
  const [isNormalized, setIsNormalized] = useState(true);
  const [chartType, setChartType] = useState('line'); // 'candlestick' or 'line'
  const [lineSource, setLineSource] = useState('close'); // 'close' or 'open'
  const [showDrawdown, setShowDrawdown] = useState(true);
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
            <span style={{ fontWeight: '600' }}>{selectedSymbol || 'BOOTING...'}</span>
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
                mainData={mainData} 
                benchmarksData={benchmarksData} 
                showBenchmarks={showBenchmarks}
                isNormalized={isNormalized}
                chartType={chartType}
                lineSource={lineSource}
                showDrawdown={showDrawdown}
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
      />
    </div>
  );
}

export default App;
