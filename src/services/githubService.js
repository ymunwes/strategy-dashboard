import Papa from 'papaparse';

const BASE_URL = 'https://raw.githubusercontent.com/ymunwes/seed_youngDreamer_strategies/main';

/**
 * Parses the strategy date format (YYYYMMDD'T'HHMMSS) into a standard Date object or timestamp.
 * @param {string} dateStr 
 */
const parseStrategyDate = (dateStr) => {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.length < 8) return NaN;
  
  try {
    // Expected format: 20260323DT000000 or 20260323
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    let hours = '00', minutes = '00', seconds = '00';

    if (dateStr.includes('T')) {
      const timePart = dateStr.split('T')[1];
      hours = timePart.substring(0, 2) || '00';
      minutes = timePart.substring(2, 4) || '00';
      seconds = timePart.substring(4, 6) || '00';
    } else if (dateStr.length > 8) {
      // Handle cases like 20260323000000
      hours = dateStr.substring(8, 10) || '00';
      minutes = dateStr.substring(10, 12) || '00';
      seconds = dateStr.substring(12, 14) || '00';
    }
    
    const date = new Date(`${year}-${month}-${day}T${hours}:${minutes}:${seconds}Z`);
    return Math.floor(date.getTime() / 1000);
  } catch (e) {
    return NaN;
  }
};

/**
 * Fetches the list of strategies from the metadata JSON.
 */
export const fetchStrategyList = async () => {
  try {
    const response = await fetch(`${BASE_URL}/symbol_info/seed_youngDreamer_strategies.json?t=${Date.now()}`);
    const data = await response.json();
    return data.symbols || [];
  } catch (error) {
    console.error('Error fetching strategy list:', error);
    return [];
  }
};

/**
 * Fetches and parses CSV data for a specific strategy symbol.
 * @param {string} symbol 
 */
export const fetchStrategyData = async (symbol) => {
  try {
    const response = await fetch(`${BASE_URL}/data/${symbol}.csv?t=${Date.now()}`);
    const csvContent = await response.text();
    
    return new Promise((resolve) => {
      Papa.parse(csvContent, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const parsedData = results.data
            .map((row) => {
              const time = parseStrategyDate(row[0]);
              const open = parseFloat(row[1]);
              const high = parseFloat(row[2]);
              const low = parseFloat(row[3]);
              const close = parseFloat(row[4]);
              
              if (isNaN(time) || isNaN(close)) return null;
              
              return {
                time,
                open,
                high,
                low,
                close,
                volume: parseFloat(row[5]) || 0,
              };
            })
            .filter(item => item !== null)
            .sort((a, b) => a.time - b.time);
          
          resolve(parsedData);
        },
      });
    });
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    return [];
  }
};

/**
 * Fetches benchmark data (placeholder logic for now).
 * @param {string} symbol (SPY, QQQ, etc.)
 */
export const fetchBenchmarkData = async (symbol) => {
  // For now, let's use a public source if available or mock if not.
  // I will look for a raw CSV for SPY on GitHub.
  // Placeholder implementation:
  return [];
};
