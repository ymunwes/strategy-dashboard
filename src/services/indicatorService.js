/**
 * Service for calculating trading indicators and metrics.
 */

/**
 * Calculates the percentage drawdown from the running maximum (high-water mark).
 * @param {Array} data - Array of price objects with 'time' and a value field.
 * @param {string} valueField - The field to use for calculation (default 'close').
 * @param {number} resetIndex - Optional index to start the calculation from (all-time if null/undefined).
 * @returns {Array} - Array of {time, value} objects where value is the percentage drawdown (negative or zero).
 */
export const calculateDrawdown = (data, valueField = 'close', resetIndex = null) => {
    if (!data || !data.length) return [];
    
    let maxEquity = -Infinity;
    
    return data.map((d, index) => {
        // If resetIndex is provided, only start calculating real drawdown relative to that point
        // Before resetIndex, maxEquity is naturally set from the data or stays -Infinity
        if (resetIndex !== null && index < resetIndex) {
            maxEquity = -Infinity; // Keep resetting until we hit the window
        }

        // Handle both candle objects {open, high, low, close} and line objects {value}
        const val = d[valueField] !== undefined ? d[valueField] : d.value;
        
        if (val === undefined || isNaN(val)) return null;
        
        if (val > maxEquity) {
            maxEquity = val;
        }
        
        // Calculate % drop from the peak (or 0 if peak not established)
        const drawdown = (maxEquity !== -Infinity && maxEquity > 0) ? (val / maxEquity - 1) * 100 : 0;
        
        return {
            time: d.time,
            value: Number(drawdown.toFixed(4))
        };
    }).filter(d => d !== null);
};

/**
 * Calculates Simple Moving Average
 */
export const calculateSMA = (data, period, valueField = 'close') => {
    if (!data || data.length < period) return [];
    
    const results = [];
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const sum = slice.reduce((acc, d) => {
            const val = d[valueField] !== undefined ? d[valueField] : d.value;
            return acc + (val || 0);
        }, 0);
        
        results.push({
            time: data[i].time,
            value: sum / period
        });
    }
    return results;
};
