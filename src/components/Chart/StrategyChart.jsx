import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, PriceScaleMode } from 'lightweight-charts';

const StrategyChart = ({ mainData, benchmarksData, showBenchmarks, isNormalized, chartType, lineSource }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const benchmarkSeriesRef = useRef({});
  const lastMainDataRef = useRef();

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

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) chartRef.current.remove();
    };
  }, []);

  // 2. Handle Strategy Series & Data Updates (Dynamic Type/Source)
  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    
    // Save current range if we want to preserve it
    const currentRange = chartRef.current.timeScale().getVisibleRange();

    // Remove old series if type changed
    if (seriesRef.current) {
      chartRef.current.removeSeries(seriesRef.current);
    }

    // Create new series based on type
    if (chartType === 'line') {
      seriesRef.current = chartRef.current.addSeries(LineSeries, {
        color: '#ffffff', // Distinct white color for strategy line
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

    try {
      const seenTimes = new Set();
      const processedData = mainData.filter(d => {
        if (seenTimes.has(d.time)) return false;
        if (isNaN(d.time)) return false;
        seenTimes.add(d.time);
        return true;
      }).map(d => {
        if (chartType === 'line') {
          const val = lineSource === 'open' ? d.open : d.close;
          return { time: d.time, value: val };
        }
        return d;
      }).filter(d => {
        if (chartType === 'line') return !isNaN(d.value);
        return !isNaN(d.close) && !isNaN(d.open) && !isNaN(d.high) && !isNaN(d.low);
      });

      if (processedData.length > 0) {
        seriesRef.current.setData(processedData);
        
        // AUTO-FIT only if mainData is NEW (different strategy)
        const isDataNew = !lastMainDataRef.current || lastMainDataRef.current !== mainData;
        if (isDataNew) {
          const start = processedData[0].time;
          const end = processedData[processedData.length - 1].time;
          chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
          lastMainDataRef.current = mainData;
        }
      }
    } catch (err) {
      console.error("Error setting main chart data:", err);
    }
  }, [mainData, chartType, lineSource]);

  // Handle Fit Action: Force view to strategy-specific range
  const handleFitContent = () => {
    if (chartRef.current && mainData.length > 0) {
      const start = mainData[0].time;
      const end = mainData[mainData.length - 1].time;
      chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
    }
  };

  // 3. Handle Normalization Mode Toggle (Percentage Mode)
  useEffect(() => {
    if (!chartRef.current) return;
    
    chartRef.current.applyOptions({
      rightPriceScale: {
        mode: isNormalized ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      }
    });
  }, [isNormalized]);

  // 4. Handle Benchmarks
  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;

    // Cleanup old benchmarks
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

        const processedData = data
            .map(d => ({ time: d.time, value: d.close }))
            .filter(d => !isNaN(d.value) && !isNaN(d.time));

        const seenTimes = new Set();
        const dedupedData = processedData.filter(d => {
          if (seenTimes.has(d.time)) return false;
          seenTimes.add(d.time);
          return true;
        });

        if (dedupedData.length > 0) {
          lineSeries.setData(dedupedData);
          benchmarkSeriesRef.current[symbol] = lineSeries;
        }
      }
    });
  }, [mainData, benchmarksData, showBenchmarks, chartType]); // Re-add if strategy type changes to maintain layering

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
