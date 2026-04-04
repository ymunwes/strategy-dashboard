import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SYMBOLS = ['SPY', 'QQQ', 'SPXL', 'TQQQ'];
const OUTPUT_DIR = path.join(__dirname, '../public/benchmarks');

/**
 * Fetches historical daily OHLC data from Yahoo Finance.
 * URL format: https://query1.finance.yahoo.com/v7/finance/download/{symbol}?period1={start}&period2={end}&interval=1d&events=history
 */
async function updateBenchmark(symbol) {
  const now = Math.floor(Date.now() / 1000);
  const start = Math.floor(new Date('2024-01-01').getTime() / 1000);
  
  const url = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=${start}&period2=${now}&interval=1d&events=history`;
  
  console.log(`[${symbol}] Fetching data...`);
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvContent = await response.text();
    const filePath = path.join(OUTPUT_DIR, `${symbol}.csv`);
    
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    
    fs.writeFileSync(filePath, csvContent);
    console.log(`[${symbol}] Saved to ${filePath}`);
  } catch (error) {
    console.error(`[${symbol}] Error:`, error.message);
  }
}

async function run() {
  console.log('--- Benchmarks Update Started ---');
  for (const symbol of SYMBOLS) {
    await updateBenchmark(symbol);
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('--- Benchmarks Update Finished ---');
}

run();
