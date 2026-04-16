import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, BaselineSeries, PriceScaleMode } from 'lightweight-charts';
import { calculateDrawdown } from '../../services/indicatorService';

const StrategyChart = ({ 
  mainData, 
  benchmarksData, 
  showBenchmarks, 
  isNormalized, 
  chartType, 
  lineSource,
  showDrawdown 
}) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const drawdownSeriesRef = useRef();
  const benchmarkSeriesRef = useRef({});
  const benchmarkDrawdownSeriesRef = useRef({});
  const rawMainDataRef = useRef([]);
  const rawBenchmarksDataRef = useRef({});
  const isUpdatingRef = useRef(false);
  const updateCallbackRef = useRef();
  
  const [paneRatio, setPaneRatio] = useState(0.75);
  const isDraggingRef = useRef(false);

  // 1. Initialize Chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#d1d4dc',
        panes: { separatorColor: 'rgba(255,255,255,0.0)', enableResize: false }
      },
      grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
      rightPriceScale: { borderColor: '#2a2e39', autoScale: true },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, rightOffset: 12, barSpacing: 8 },
      crosshair: { mode: 0, vertLine: { color: '#758696', style: 1 }, horzLine: { color: '#758696', style: 1 } },
    });

    const handleRangeChange = () => {
      if (isUpdatingRef.current) return;
      if (updateCallbackRef.current) requestAnimationFrame(updateCallbackRef.current);
    };

    chartRef.current.timeScale().subscribeVisibleTimeRangeChange(handleRangeChange);

    setTimeout(() => {
      if (chartRef.current && mainData.length) {
          const start = mainData[0].time;
          const end = mainData[mainData.length-1].time;
          chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
      }
    }, 100);

    return () => {
      if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
          drawdownSeriesRef.current = null;
          benchmarkSeriesRef.current = {};
          benchmarkDrawdownSeriesRef.current = {};
      }
    };
  }, [showDrawdown]);

  // 1b. Update Panes Ratio
  useEffect(() => {
    if (chartRef.current && showDrawdown) {
      const timer = setTimeout(() => {
        const panes = chartRef.current.panes();
        if (panes && panes.length >= 2) {
            panes[0].setStretchFactor(paneRatio);
            panes[1].setStretchFactor(1 - paneRatio);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [paneRatio, showDrawdown]);

  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'row-resize';
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    let newRatio = offsetY / rect.height;
    newRatio = Math.max(0.2, Math.min(0.8, newRatio));
    setPaneRatio(newRatio);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
  };

  const updateAllSeriesWithNormalization = () => {
    if (!chartRef.current || !seriesRef.current) return;
    try {
      const strategyData = rawMainDataRef.current;
      if (!strategyData.length) return;

      const visibleRange = chartRef.current.timeScale().getVisibleRange();
      let rangeFrom = visibleRange?.from;
      if (!rangeFrom && strategyData.length > 0) rangeFrom = strategyData[0].time;
      if (!rangeFrom) return;

      isUpdatingRef.current = true;

      const firstSInd = strategyData.findIndex(d => d.time >= rangeFrom);
      const sStartInd = firstSInd === -1 ? 0 : firstSInd;
      const sFirstPoint = strategyData[sStartInd];
      // ABSOLUTE ANCHOR: 측정 기준점을 'Open'으로 고정 (User preference for 'Correct' gains)
      const sAnchor = sFirstPoint ? (sFirstPoint.open || sFirstPoint.close || 0) : 0;

      if (isNormalized && sAnchor !== 0) {
        // INITIALIZE MAX AT 1.0: Ensures DD starts from the Open anchor, matching the Gain logic exactly
        let sMaxFactor = 1.0; 
        const mapped = strategyData.map(d => {
          const factor = (lineSource === 'open' ? (d.open || d.close) : (d.close || d.open)) / sAnchor;
          if (chartType === 'line') return { time: d.time, value: (factor - 1) * 100 };
          return { time: d.time, open: (d.open / sAnchor - 1) * 100, high: (d.high / sAnchor - 1) * 100, low: (d.low / sAnchor - 1) * 100, close: (d.close / sAnchor - 1) * 100 };
        });
        if (mapped.length > 0) seriesRef.current.setData(mapped);

        if (showDrawdown && drawdownSeriesRef.current) {
          const ddMapped = strategyData.map((d, i) => {
            if (i < sStartInd) return null;
            const val = (d.close || d.open) / sAnchor;
            if (val > sMaxFactor) sMaxFactor = val;
            return { time: d.time, value: (val / sMaxFactor - 1) * 100 };
          }).filter(d => d !== null);
          if (ddMapped.length > 0) drawdownSeriesRef.current.setData(ddMapped);
        }
      } else {
        resetAllToAbsolute();
      }

      Object.entries(benchmarkSeriesRef.current).forEach(([symbol, series]) => {
        const bData = rawBenchmarksDataRef.current[symbol];
        if (!bData || !bData.length) return;

        const firstBInd = bData.findIndex(d => d.time >= rangeFrom);
        const bStartInd = firstBInd === -1 ? 0 : firstBInd;
        const bFirstPoint = bData[bStartInd];
        const bAnchor = bFirstPoint ? (bFirstPoint.open || bFirstPoint.close || 0) : 0;

        if (isNormalized && bAnchor !== 0) {
          // INITIALIZE MAX AT 1.0: Syncs benchmark DD with the benchmark Open anchor
          let bMaxFactor = 1.0;
          const mappedB = bData.map(d => ({ time: d.time, value: ((lineSource === 'open' ? (d.open || d.close) : (d.close || d.open)) / bAnchor - 1) * 100 }));
          if (mappedB.length > 0) series.setData(mappedB);

          const ddSeries = benchmarkDrawdownSeriesRef.current[symbol];
          if (showDrawdown && ddSeries) {
            const ddBMapped = bData.map((d, i) => {
              if (i < bStartInd) return null;
              const val = (d.close || d.open) / bAnchor;
              if (val > bMaxFactor) bMaxFactor = val;
              return { time: d.time, value: (val / bMaxFactor - 1) * 100 };
            }).filter(d => d !== null);
            if (ddBMapped.length > 0) ddSeries.setData(ddBMapped);
          }
        }
      });
    } catch (e) {
      console.warn("Sync err:", e);
    } finally {
      isUpdatingRef.current = false;
    }
  };

  const resetAllToAbsolute = () => {
    if (!chartRef.current || !seriesRef.current) return;
    try {
      isUpdatingRef.current = true;
      const strategyData = rawMainDataRef.current;
      if (chartType === 'line') {
        seriesRef.current.setData(strategyData.map(d => ({ time: d.time, value: d.close || d.open || 0 })));
      } else {
        seriesRef.current.setData(strategyData);
      }
      if (showDrawdown && drawdownSeriesRef.current) drawdownSeriesRef.current.setData(calculateDrawdown(strategyData, 'close', null));
      Object.entries(benchmarkSeriesRef.current).forEach(([symbol, series]) => {
        const bData = rawBenchmarksDataRef.current[symbol];
        if (bData) {
          series.setData(bData.map(d => ({ time: d.time, value: d.close || d.open || 0 })));
          const ddSeries = benchmarkDrawdownSeriesRef.current[symbol];
          if (showDrawdown && ddSeries) ddSeries.setData(calculateDrawdown(bData, 'close', null));
        }
      });
    } catch (e) {
      console.warn("Reset err:", e);
    } finally {
      isUpdatingRef.current = false;
    }
  };

  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    rawMainDataRef.current = mainData;
    updateCallbackRef.current = isNormalized ? updateAllSeriesWithNormalization : resetAllToAbsolute;

    if (seriesRef.current) try { chartRef.current.removeSeries(seriesRef.current); } catch(e) {}
    seriesRef.current = chartType === 'line' 
      ? chartRef.current.addSeries(LineSeries, { color: '#ffffff', lineWidth: 3, title: 'Strategy' })
      : chartRef.current.addSeries(CandlestickSeries, { upColor: '#00c805', downColor: '#ff3b30', borderVisible: false, wickUpColor: '#00c805', wickDownColor: '#ff3b30' });

    if (showDrawdown) {
      if (drawdownSeriesRef.current) try { chartRef.current.removeSeries(drawdownSeriesRef.current); } catch(e) {}
      drawdownSeriesRef.current = chartRef.current.addSeries(BaselineSeries, {
        priceScaleId: 'right', 
        baseValue: { type: 'price', price: 0 },
        topLineColor: 'rgba(255, 255, 255, 0.4)',
        topFillColor1: 'rgba(255, 255, 255, 0.0)', 
        topFillColor2: 'rgba(255, 255, 255, 0.0)',
        bottomLineColor: '#ffffff',
        bottomFillColor1: 'rgba(255, 255, 255, 0.3)',
        bottomFillColor2: 'rgba(255, 255, 255, 0.0)',
        lineWidth: 2, 
        title: 'Drawdown (%)',
        priceFormat: { type: 'custom', formatter: (v) => v === null ? '' : `${v.toFixed(2)}%`, minMove: 0.01 }
      }, 1);

      chartRef.current.priceScale('right').applyOptions({
        autoScale: true, scaleMargins: { top: 0, bottom: 0.1 },
        autoscaleInfoProvider: (original) => {
          const res = original();
          if (res && res.priceRange) {
            res.priceRange.maxValue = Math.max(res.priceRange.maxValue, 0);
            res.priceRange.minValue = Math.min(res.priceRange.minValue, -0.5);
          }
          return res;
        }
      });
    }

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();
  }, [mainData, chartType, lineSource, isNormalized, showDrawdown]);

  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    rawBenchmarksDataRef.current = benchmarksData;
    Object.values(benchmarkSeriesRef.current).forEach(s => s && chartRef.current.removeSeries(s));
    Object.values(benchmarkDrawdownSeriesRef.current).forEach(s => s && chartRef.current.removeSeries(s));
    benchmarkSeriesRef.current = {};
    benchmarkDrawdownSeriesRef.current = {};

    Object.entries(benchmarksData).forEach(([symbol, data]) => {
      if (showBenchmarks[symbol] && data.length) {
        const color = getBenchmarkColor(symbol);
        benchmarkSeriesRef.current[symbol] = chartRef.current.addSeries(LineSeries, { color, lineWidth: 2, title: symbol, priceLineVisible: false });
        if (showDrawdown) {
          benchmarkDrawdownSeriesRef.current[symbol] = chartRef.current.addSeries(LineSeries, {
            priceScaleId: 'right', color, lineWidth: 1, lineStyle: 2, title: `${symbol} DD`,
            priceFormat: { type: 'custom', formatter: (v) => v === null ? '' : `${v.toFixed(2)}%`, minMove: 0.01 }
          }, 1);
        }
      }
    });

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();
  }, [benchmarksData, showBenchmarks, isNormalized, showDrawdown, mainData]);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      rightPriceScale: { mode: PriceScaleMode.Normal },
      localization: { 
        priceFormatter: (p) => {
          if (p === null || p === undefined) return "";
          return isNormalized ? `${p.toFixed(2)}%` : p.toLocaleString(undefined, { minimumFractionDigits: 2 });
        }
      }
    });
  }, [isNormalized]);

  const getBenchmarkColor = (s) => ({ SPY: '#00d2ff', QQQ: '#ff9500', SPXL: '#af52de', TQQQ: '#ff2d55' }[s] || '#8e8e93');
  const handleFitContent = () => {
    if (!chartRef.current || !mainData.length) return;
    const start = mainData[0].time;
    const end = mainData[mainData.length-1].time;
    chartRef.current.timeScale().setVisibleRange({ from: start, to: end });
  };

  useEffect(() => {
    handleFitContent();
  }, [mainData]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      <img 
        src="/strategy-dashboard/logo.jpg" 
        alt="youngDreamers" 
        style={{
          position: 'absolute',
          top: '35px',
          left: '20px',
          width: '200px',
          opacity: 0.4,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
          zIndex: 100
        }}
      />
      {showDrawdown && (
        <div onMouseDown={handleMouseDown} style={{ position: 'absolute', top: `calc(${paneRatio * 100}% - 4px)`, left: 0, width: '100%', height: '8px', zIndex: 1000, cursor: 'row-resize', display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%', height: '1px', backgroundColor: 'rgba(255,255,255,0.6)' }} />
        </div>
      )}
      <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '10px', pointerEvents: 'none', zIndex: 1001 }}>
        {isNormalized && <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--accent-cyan)', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)' }}>PERFORMANCE_COMPARISON_MODE (WINDOWED)</div>}
        <button onClick={handleFitContent} style={{ pointerEvents: 'auto', background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.2s ease', textTransform: 'uppercase' }}>[ FIT_STRATEGY ]</button>
      </div>
    </div>
  );
};

export default StrategyChart;
