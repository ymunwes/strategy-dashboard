import yfinance as yf
import pandas as pd
import os
from datetime import datetime

SYMBOLS = ['SPY', 'QQQ', 'SPXL', 'TQQQ', 'GRNY']
# Use absolute path to ensure it works from any directory (especially in GitHub Actions)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_DIR = os.path.join(BASE_DIR, 'public/benchmarks')

def update_benchmarks():
    print(f"--- Benchmarks Update Started ({datetime.now()}) ---")
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    for symbol in SYMBOLS:
        print(f"[{symbol}] Fetching data...")
        try:
            # Fetch from 2024-01-01 to now
            data = yf.download(symbol, start="2024-01-01", progress=False)
            
            if data.empty:
                print(f"[{symbol}] No data found.")
                continue

            # yfinance v0.2.x+ returns a MultiIndex for columns if one symbol is passed in some contexts.
            # We flatten it to just the OHLC columns.
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)

            # Keep only the columns we need
            df = data[['Open', 'High', 'Low', 'Close']].copy()
            
            # Save to CSV - ensuring a clean simple header: Date,Open,High,Low,Close
            file_path = os.path.join(OUTPUT_DIR, f"{symbol}.csv")
            df.to_csv(file_path)
            print(f"[{symbol}] Saved {len(df)} rows to {file_path}")
            
        except Exception as e:
            print(f"[{symbol}] Error: {str(e)}")

    print("--- Benchmarks Update Finished ---")

if __name__ == "__main__":
    update_benchmarks()
