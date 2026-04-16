import React, { useState, useEffect } from 'react';
import { Activity, LayoutGrid, CheckCircle, TrendingUp, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const MarketSidebar = ({ 
  strategies, 
  selectedSymbol, 
  onSelect, 
  benchmarks, 
  onToggleBenchmark,
  chartType,
  setChartType,
  lineSource,
  setLineSource,
  showDrawdown,
  onToggleDrawdown
}) => {
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    if (selectedSymbol && strategies.length > 0 && Object.keys(expandedGroups).length === 0) {
      const activeStrat = strategies.find(s => s.symbol === selectedSymbol);
      if (activeStrat) {
        const group = activeStrat.group || 'Ungrouped';
        setExpandedGroups({ [group]: true });
      }
    }
  }, [strategies, selectedSymbol, expandedGroups]);

  const toggleGroup = (group) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const groupedStrategies = strategies
    .filter((strat) => strat.active !== 0)
    .reduce((acc, strat) => {
      const group = strat.group || 'Ungrouped';
      if (!acc[group]) acc[group] = [];
      acc[group].push(strat);
      return acc;
    }, {});

  return (
    <aside className="sidebar">
      <div className="sidebar-scrollable">
        <div className="terminal-header">
          <Activity size={16} className="terminal-status" />
          <span>STRATEGY_SELECTOR_v1.0</span>
        </div>

        <div className="sidebar-section">
          <h3 className="section-title">Active Strategies</h3>
          <div className="strategy-list">
            {Object.entries(groupedStrategies).map(([group, groupStrats]) => {
              const isExpanded = !!expandedGroups[group];
              return (
              <div key={group} className="strategy-group">
                <div 
                  onClick={() => toggleGroup(group)}
                  style={{ 
                    fontSize: '11px', 
                    fontWeight: 'bold', 
                    color: isExpanded ? 'var(--text-main)' : 'var(--text-muted)', 
                    padding: '12px 12px 6px 12px', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.5px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none'
                  }}
                >
                  <span>{group}</span>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {isExpanded && groupStrats.map((strat) => (
                  <div
                    key={strat.symbol}
                    className={clsx('strategy-item', selectedSymbol === strat.symbol && 'active')}
                    onClick={() => onSelect(strat.symbol)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '14px', fontWeight: '500' }}>{strat.symbol}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{strat.description}</span>
                    </div>
                    {selectedSymbol === strat.symbol && (
                      <CheckCircle size={14} color="var(--accent-cyan)" />
                    )}
                  </div>
                ))}
              </div>
            )})}
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="section-title">Chart Settings</h3>
          <div className="settings-group">
            <div className="settings-row">
              <span className="settings-label">Type</span>
              <div className="segmented-control">
                <button 
                  className={clsx(chartType === 'candlestick' && 'active')}
                  onClick={() => setChartType('candlestick')}
                >
                  Candle
                </button>
                <button 
                  className={clsx(chartType === 'line' && 'active')}
                  onClick={() => setChartType('line')}
                >
                  Line
                </button>
              </div>
            </div>

            {chartType === 'line' && (
              <div className="settings-row animated-fade-in">
                <span className="settings-label">Source</span>
                <div className="segmented-control">
                  <button 
                    className={clsx(lineSource === 'close' && 'active')}
                    onClick={() => setLineSource('close')}
                  >
                    Close
                  </button>
                  <button 
                    className={clsx(lineSource === 'open' && 'active')}
                    onClick={() => setLineSource('open')}
                  >
                    Open
                  </button>
                </div>
              </div>
            )}

            <div className="settings-row" style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <span className="settings-label" style={{ color: showDrawdown ? 'var(--accent-cyan)' : 'var(--text-muted)' }}>Drawdown</span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={showDrawdown}
                  onChange={onToggleDrawdown}
                />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>

        <div className="sidebar-section">
          <h3 className="section-title">Benchmarks</h3>
          <div className="toggle-group">
            {Object.entries(benchmarks).map(([key, enabled]) => (
              <div key={key} className="toggle-row">
                <span style={{ fontSize: '14px' }}>{key}</span>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={() => onToggleBenchmark(key)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default MarketSidebar;
