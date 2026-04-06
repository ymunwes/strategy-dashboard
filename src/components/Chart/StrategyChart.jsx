import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, PriceScaleMode } from 'lightweight-charts';

const StrategyChart = ({ mainData, benchmarksData, showBenchmarks, isNormalized, chartType, lineSource }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const benchmarkSeriesRef = useRef({});
  const lastMainDataRef = useRef();
  const rawMainDataRef = useRef([]);
  const rawBenchmarksDataRef = useRef({});
  const isUpdatingRef = useRef(false);

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      rightPriceScale: {
        borderColor: '#2a2e39',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        rightOffset: 12,
        barSpacing: 8,
      },
      crosshair: {
        mode: 0,
        vertLine: { color: '#758696', style: 1 },
        horzLine: { color: '#758696', style: 1 },
      },
    });

    const handleResize = () => {
      chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    // Subscribe to time scale changes for dynamic normalization
    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(() => {
      if (isUpdatingRef.current) return;
      requestAnimationFrame(updateAllSeriesWithNormalization);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) chartRef.current.remove();
    };
  }, []);

  // Helper to re-normalize all active series based on current visible range
  const updateAllSeriesWithNormalization = () => {
    if (!chartRef.current || !seriesRef.current || !isNormalized) return;

    try {
      const range = chartRef.current.timeScale().getVisibleRange();
      if (!range) return;

      const strategyData = rawMainDataRef.current;
      if (!strategyData.length) return;

      const firstVisibleStrategy = strategyData.find(d => d.time >= range.from) || strategyData[0];
      const strategyAnchor = firstVisibleStrategy.open || firstVisibleStrategy.close;

      if (!strategyAnchor || isNaN(strategyAnchor) || strategyAnchor === 0) return;

      isUpdatingRef.current = true;

      // 1. Update Strategy Series
      const newStrategyData = strategyData.map(d => {
        if (chartType === 'line') {
            const val = lineSource === 'open' ? d.open : d.close;
            const normalizedVal = (val / strategyAnchor - 1) * 100;
            return { time: d.time, value: normalizedVal };
        }
        return {
            time: d.time,
            open: (d.open / strategyAnchor - 1) * 100,
            high: (d.high / strategyAnchor - 1) * 100,
            low: (d.low / strategyAnchor - 1) * 100,
            close: (d.close / strategyAnchor - 1) * 100,
        };
      }).filter(d => {
        if (chartType === 'line') return !isNaN(d.value) && isFinite(d.value);
        return isValidOHLC(d);
      });

      if (newStrategyData.length) {
        seriesRef.current.setData(newStrategyData);
      }

      // 2. Update Benchmark Series
      Object.entries(benchmarkSeriesRef.current).forEach(([symbol, series]) => {
        const bData = rawBenchmarksDataRef.current[symbol];
        if (!bData || !bData.length) return;
        
        const firstVisibleBenchmark = bData.find(d => d.time >= range.from) || bData[0];
        const bAnchor = firstVisibleBenchmark.open || firstVisibleBenchmark.close;
        
        if (!bAnchor || isNaN(bAnchor) || bAnchor === 0) return;

        const newBData = bData.map(d => ({
          time: d.time,
          value: (d.close / bAnchor - 1) * 100
        })).filter(d => !isNaN(d.value) && isFinite(d.value));

        if (newBData.length) {
          series.setData(newBData);
        }
      });
    } catch (err) {
      console.warn("Normalization failed for current range:", err);
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Helper to reset to normal prices
  const resetAllToAbsolute = () => {
    if (!chartRef.current || !seriesRef.current) return;
    isUpdatingRef.current = true;

    // 1. Reset Strategy
    const strategyDisplayData = rawMainDataRef.current.map(d => {
        if (chartType === 'line') {
            const val = lineSource === 'open' ? d.open : d.close;
            return { time: d.time, value: val };
        }
        return d;
    }).filter(d => {
        if (chartType === 'line') return !isNaN(d.value) && isFinite(d.value);
        return isValidOHLC(d);
    });
    seriesRef.current.setData(strategyDisplayData);

    // 2. Reset Benchmarks
    Object.entries(benchmarkSeriesRef.current).forEach(([symbol, series]) => {
      const bData = rawBenchmarksDataRef.current[symbol];
      if (!bData) return;
      series.setData(bData.map(d => ({ 
        time: d.time, 
        value: d.close 
      })).filter(d => !isNaN(d.value) && isFinite(d.value)));
    });

    isUpdatingRef.current = false;
  };

  // 2. Handle Strategy Series & Data Updates
  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    rawMainDataRef.current = mainData;

    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
    }

    if (chartType === 'line') {
      seriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#ffffff',
        lineWidth: 3,
        title: 'Strategy',
        priceLineVisible: true,
      });
    } else {
      seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
        upColor: '#00c805',
        downColor: '#ff3b30',
        borderVisible: false,
        wickUpColor: '#00c805',
        wickDownColor: '#ff3b30',
      });
    }

    // Auto-fit on first load or strategy change
    const isDataNew = !lastMainDataRef.current || lastMainDataRef.current !== mainData;
    if (isDataNew) {
      const start = mainData[0].time;
      const end = mainData[mainData.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
      lastMainDataRef.current = mainData;
    }

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();

  }, [mainData, chartType, lineSource, isNormalized]);

  // 4. Handle Benchmarks Updates
  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    rawBenchmarksDataRef.current = benchmarksData;

    Object.values(benchmarkSeriesRef.current).forEach(line => {
      if (chartRef.current) chartRef.current.removeSeries(line);
    });
    benchmarkSeriesRef.current = {};

    Object.entries(benchmarksData).forEach(([symbol, data]) => {
      if (showBenchmarks[symbol] && data.length) {
        const lineSeries = chartRef.current.addSeries(LineSeries, {
          color: getBenchmarkColor(symbol),
          lineWidth: 2,
          title: symbol,
          priceLineVisible: false,
          axisLabelVisible: true,
        });
        benchmarkSeriesRef.current[symbol] = lineSeries;
      }
    });

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();

  }, [benchmarksData, showBenchmarks, isNormalized]);

  // Handle Price Scale Mode Changes Manually
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartRef.current.applyOptions({
      rightPriceScale: {
        mode: PriceScaleMode.Normal,
      },
      localization: {
        priceFormatter: (price) => {
          if (price === null || price === undefined) return "";
          if (isNormalized) return `${price.toFixed(2)}%`;
          return price.toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          });
        }
      }
    });
  }, [isNormalized]);

  // Combined filter for OHLC data to ensure no nulls reach the chart
  const isValidOHLC = (d) => {
    return !isNaN(d.open) && isFinite(d.open) &&
           !isNaN(d.high) && isFinite(d.high) &&
           !isNaN(d.low) && isFinite(d.low) &&
           !isNaN(d.close) && isFinite(d.close);
  };

  // Handle Fit Action: Force view to strategy-specific range
  const handleFitContent = () => {
    if (chartRef.current && mainData.length > 0) {
      const start = mainData[0].time;
      const end = mainData[mainData.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
    }
  };

  const getBenchmarkColor = (symbol) => {
    const colors = { SPY: '#00d2ff', QQQ: '#ff9500', SPXL: '#af52de', TQQQ: '#ff2d55' };
    return colors[symbol] || '#8e8e93';
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      <div style={{ 
        position: 'absolute', top: '10px', left: '10px', 
        display: 'flex', gap: '10px', alignItems: 'center', pointerEvents: 'none', zIndex: 10
      }}>
        {isNormalized && (
          <div style={{ 
            background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px',
            fontSize: '10px', color: 'var(--accent-cyan)', border: '1px solid var(--border-color)',
            fontFamily: 'var(--font-mono)'
          }}>
            PERFORMANCE_COMPARISON_MODE (PERCENTAGE_0%)
          </div>
        )}
        <button 
          onClick={handleFitContent}
          style={{ 
            pointerEvents: 'auto',
            background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)',
            padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)',
            cursor: 'pointer', transition: 'all 0.2s ease', textTransform: 'uppercase'
          }}
          onMouseOver={(e) => e.target.style.borderColor = 'var(--accent-cyan)'}
          onMouseOut={(e) => e.target.style.borderColor = 'var(--border-color)'}
        >
          [ FIT_STRATEGY ]
        </button>
      </div>
    </div>
  );
};

export default StrategyChart;
