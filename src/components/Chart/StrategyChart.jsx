import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries, BaselineSeries, PriceScaleMode } from 'lightweight-charts';
import { calculateDrawdown } from '../../services/indicatorService';
import { Camera, Copy } from 'lucide-react';

const StrategyChart = ({ 
  mainData, 
  benchmarksData, 
  showBenchmarks, 
  isNormalized, 
  chartType,
  lineSource,
  showDrawdown,
  timeframe,
  comparedSymbols = [],
  comparedData = {}
}) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const drawdownSeriesRef = useRef();
  const benchmarkSeriesRef = useRef({});
  const benchmarkDrawdownSeriesRef = useRef({});
  const comparedSeriesRef = useRef({});
  const comparedDrawdownSeriesRef = useRef({});
  const rawMainDataRef = useRef([]);
  const rawBenchmarksDataRef = useRef({});
  const rawComparedDataRef = useRef({});
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
          comparedSeriesRef.current = {};
          comparedDrawdownSeriesRef.current = {};
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

  const resampleData = (data, tf) => {
    if (!data || !data.length || tf === '1D') return data;
    const resampled = [];
    let currentPeriod = null;
    let currentBar = null;

    for (const bar of data) {
        const d = new Date(bar.time * 1000);
        let periodStart;
        if (tf === '1W') {
            const day = d.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day; // Monday start
            d.setUTCDate(d.getUTCDate() + diff);
            d.setUTCHours(0,0,0,0);
            periodStart = d.getTime() / 1000;
        } else if (tf === '1M') {
            d.setUTCDate(1);
            d.setUTCHours(0,0,0,0);
            periodStart = d.getTime() / 1000;
        } else {
            periodStart = bar.time; // Fallback
        }

        if (currentPeriod !== periodStart) {
            if (currentBar) resampled.push(currentBar);
            currentPeriod = periodStart;
            currentBar = {
                time: periodStart,
                open: bar.open,
                high: bar.high,
                low: bar.low,
                close: bar.close
            };
        } else {
            currentBar.high = Math.max(currentBar.high, bar.high);
            currentBar.low = Math.min(currentBar.low, bar.low);
            currentBar.close = bar.close;
        }
    }
    if (currentBar) resampled.push(currentBar);
    return resampled;
  };

  const updateAllSeriesWithNormalization = () => {
    if (!chartRef.current || !seriesRef.current) return;
    try {
      const strategyData = resampleData(rawMainDataRef.current, timeframe);
      if (!strategyData.length) return;

      const visibleRange = chartRef.current.timeScale().getVisibleRange();
      let rangeFrom = visibleRange?.from;
      if (!rangeFrom && strategyData.length > 0) rangeFrom = strategyData[0].time;
      if (!rangeFrom) return;

      isUpdatingRef.current = true;

      const firstSInd = strategyData.findIndex(d => d.time >= rangeFrom);
      const sStartInd = firstSInd === -1 ? 0 : firstSInd;
      const sFirstPoint = strategyData[sStartInd];
      
      const getAnchor = (pt) => {
        if (!pt) return 0;
        if (chartType === 'line') return lineSource === 'open' ? (pt.open || pt.close) : (pt.close || pt.open);
        return pt.open || pt.close || 0;
      };

      const sAnchor = getAnchor(sFirstPoint);
      const globalAnchorTime = sFirstPoint ? sFirstPoint.time : rangeFrom;

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
        const bData = resampleData(rawBenchmarksDataRef.current[symbol], timeframe);
        if (!bData || !bData.length) return;

        const firstBInd = bData.findIndex(d => d.time >= globalAnchorTime);
        const bStartInd = firstBInd === -1 ? 0 : firstBInd;
        const bFirstPoint = bData[bStartInd];
        const bAnchor = getAnchor(bFirstPoint);

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

      comparedSymbols.forEach((symbol) => {
        const series = comparedSeriesRef.current[symbol];
        if (!series) return;
        const cData = resampleData(rawComparedDataRef.current[symbol], timeframe);
        if (!cData || !cData.length) return;

        const firstCInd = cData.findIndex(d => d.time >= globalAnchorTime);
        const cStartInd = firstCInd === -1 ? 0 : firstCInd;
        const cFirstPoint = cData[cStartInd];
        const cAnchor = getAnchor(cFirstPoint);

        if (isNormalized && cAnchor !== 0) {
          let cMaxFactor = 1.0;
          const mappedC = cData.map(d => ({ time: d.time, value: ((lineSource === 'open' ? (d.open || d.close) : (d.close || d.open)) / cAnchor - 1) * 100 }));
          if (mappedC.length > 0) series.setData(mappedC);

          const ddSeries = comparedDrawdownSeriesRef.current[symbol];
          if (showDrawdown && ddSeries) {
            const ddCMapped = cData.map((d, i) => {
              if (i < cStartInd) return null;
              const val = (d.close || d.open) / cAnchor;
              if (val > cMaxFactor) cMaxFactor = val;
              return { time: d.time, value: (val / cMaxFactor - 1) * 100 };
            }).filter(d => d !== null);
            if (ddCMapped.length > 0) ddSeries.setData(ddCMapped);
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
      const strategyData = resampleData(rawMainDataRef.current, timeframe);
      if (chartType === 'line') {
        seriesRef.current.setData(strategyData.map(d => ({ time: d.time, value: d.close || d.open || 0 })));
      } else {
        seriesRef.current.setData(strategyData);
      }
      if (showDrawdown && drawdownSeriesRef.current) drawdownSeriesRef.current.setData(calculateDrawdown(strategyData, 'close', null));
      Object.entries(benchmarkSeriesRef.current).forEach(([symbol, series]) => {
        const bData = resampleData(rawBenchmarksDataRef.current[symbol], timeframe);
        if (bData) {
          series.setData(bData.map(d => ({ time: d.time, value: d.close || d.open || 0 })));
          const ddSeries = benchmarkDrawdownSeriesRef.current[symbol];
          if (showDrawdown && ddSeries) ddSeries.setData(calculateDrawdown(bData, 'close', null));
        }
      });
      comparedSymbols.forEach((symbol) => {
        const series = comparedSeriesRef.current[symbol];
        if (!series) return;
        const cData = resampleData(rawComparedDataRef.current[symbol], timeframe);
        if (cData) {
          series.setData(cData.map(d => ({ time: d.time, value: d.close || d.open || 0 })));
          const ddSeries = comparedDrawdownSeriesRef.current[symbol];
          if (showDrawdown && ddSeries) ddSeries.setData(calculateDrawdown(cData, 'close', null));
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
      ? chartRef.current.addSeries(LineSeries, { color: '#ffffff', lineWidth: 3, title: 'Strategy', priceLineVisible: false })
      : chartRef.current.addSeries(CandlestickSeries, { upColor: '#00c805', downColor: '#ff3b30', borderVisible: false, wickUpColor: '#00c805', wickDownColor: '#ff3b30', priceLineVisible: false });

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
        priceLineVisible: false,
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
  }, [mainData, chartType, lineSource, isNormalized, showDrawdown, timeframe]);

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
            priceScaleId: 'right', color, lineWidth: 2, lineStyle: 2, title: `${symbol} DD`, priceLineVisible: false,
            priceFormat: { type: 'custom', formatter: (v) => v === null ? '' : `${v.toFixed(2)}%`, minMove: 0.01 }
          }, 1);
        }
      }
    });

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();
  }, [benchmarksData, showBenchmarks, isNormalized, showDrawdown, mainData, timeframe]);

  const COMPARE_COLORS = ['#ffe620', '#34c759', '#ff2d92', '#5ac8fa', '#5856d6', '#00c7be', '#a2845e'];
  const getCompareColor = (index) => COMPARE_COLORS[index % COMPARE_COLORS.length];

  useEffect(() => {
    if (!chartRef.current || !mainData.length) return;
    rawComparedDataRef.current = comparedData;
    Object.values(comparedSeriesRef.current).forEach(s => s && chartRef.current.removeSeries(s));
    Object.values(comparedDrawdownSeriesRef.current).forEach(s => s && chartRef.current.removeSeries(s));
    comparedSeriesRef.current = {};
    comparedDrawdownSeriesRef.current = {};

    comparedSymbols.forEach((symbol, idx) => {
      const data = comparedData[symbol];
      if (data && data.length) {
        const color = getCompareColor(idx);
        comparedSeriesRef.current[symbol] = chartRef.current.addSeries(LineSeries, { color, lineWidth: 2, title: symbol, priceLineVisible: false });
        if (showDrawdown) {
          comparedDrawdownSeriesRef.current[symbol] = chartRef.current.addSeries(LineSeries, {
            priceScaleId: 'right', color, lineWidth: 2, lineStyle: 0, title: `${symbol} DD`, priceLineVisible: false,
            priceFormat: { type: 'custom', formatter: (v) => v === null ? '' : `${v.toFixed(2)}%`, minMove: 0.01 }
          }, 1);
        }
      }
    });

    if (isNormalized) updateAllSeriesWithNormalization();
    else resetAllToAbsolute();
  }, [comparedData, comparedSymbols, isNormalized, showDrawdown, mainData, timeframe]);

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

  const getWatermarkedCanvas = async () => {
    if (!chartRef.current || !chartContainerRef.current) return null;
    const baseCanvas = chartRef.current.takeScreenshot(true, false);
    
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = baseCanvas.width;
      canvas.height = baseCanvas.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(baseCanvas, 0, 0);

      const img = new Image();
      img.src = '/strategy-dashboard/logo.jpg';
      img.onload = () => {
        ctx.globalAlpha = 0.4;
        ctx.globalCompositeOperation = 'screen';
        
        const pixelRatio = baseCanvas.width / chartContainerRef.current.clientWidth;
        const x = 20 * pixelRatio;
        const y = 35 * pixelRatio;
        const imgWidth = 200 * pixelRatio;
        const imgHeight = (img.height / img.width) * imgWidth;
        
        ctx.drawImage(img, x, y, imgWidth, imgHeight);
        resolve(canvas);
      };
      img.onerror = () => {
        resolve(baseCanvas); // Fallback
      };
    });
  };

  const handleScreenshot = async () => {
    const canvas = await getWatermarkedCanvas();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `youngDreamers-chart-${new Date().toISOString().split('T')[0]}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleCopyScreenshot = async () => {
    const canvas = await getWatermarkedCanvas();
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        alert('Screenshot copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy screenshot: ', err);
        alert('Failed to copy screenshot. See console for details.');
      }
    });
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
      <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '8px', pointerEvents: 'none', zIndex: 1001, alignItems: 'center' }}>
        {isNormalized && <div style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: 'var(--accent-cyan)', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)' }}>PERFORMANCE_COMPARISON_MODE (WINDOWED)</div>}
        <button onClick={handleFitContent} style={{ pointerEvents: 'auto', background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '4px', fontSize: '10px', fontFamily: 'var(--font-mono)', cursor: 'pointer', transition: 'all 0.2s ease', textTransform: 'uppercase' }}>[ FIT_STRATEGY ]</button>
        <button onClick={handleCopyScreenshot} title="Copy to Clipboard" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s ease' }}><Copy size={16} /></button>
        <button onClick={handleScreenshot} title="Download PNG" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', background: 'var(--sidebar-bg)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '4px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s ease' }}><Camera size={16} /></button>
      </div>
    </div>
  );
};

export default StrategyChart;
