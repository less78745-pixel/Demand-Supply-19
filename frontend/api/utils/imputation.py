import pandas as pd

def clean_occupancy_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Impute nulls for In and Out
    df['In'] = pd.to_numeric(df['In'], errors='coerce').fillna(0)
    df['Out'] = pd.to_numeric(df['Out'], errors='coerce').fillna(0)
    
    # Ensure Capacity > 0 (handle zero/null capacities to avoid division by zero)
    df['Capacity'] = pd.to_numeric(df['Capacity'], errors='coerce').fillna(1)
    df['Capacity'] = df['Capacity'].apply(lambda x: x if x > 0 else 1)
    
    # Ensure On Hand is numeric
    df['On Hand'] = pd.to_numeric(df['On Hand'], errors='coerce').fillna(0)
    
    # Date parsing
    if 'Date' in df.columns:
        df['Date'] = pd.to_datetime(df['Date'], errors='coerce')
        df = df.dropna(subset=['Date'])
    
    return df

def clean_forecast_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    
    # Only clean columns that actually exist in the dataframe
    metrics = ['Penjualan', 'AO', 'RO', 'Rerata Drop Size', 'NOO']
    for m in metrics:
        if m in df.columns:
            df[m] = pd.to_numeric(df[m], errors='coerce').fillna(0)
        
    if 'Bulan' in df.columns:
        # Convert to string and map Indonesian month names to English
        indonesian_months = {
            'januari': 'january', 'februari': 'february', 'maret': 'march',
            'april': 'april', 'mei': 'may', 'juni': 'june', 'juli': 'july',
            'agustus': 'august', 'september': 'september', 'oktober': 'october',
            'november': 'november', 'desember': 'december',
            'jan': 'jan', 'feb': 'feb', 'mar': 'mar', 'apr': 'apr',
            'jun': 'jun', 'jul': 'jul', 'agu': 'aug', 'agt': 'aug',
            'sep': 'sep', 'okt': 'oct', 'nov': 'nov', 'des': 'dec'
        }
        bulletin_str = df['Bulan'].astype(str).str.lower().str.strip()
        for ind, eng in indonesian_months.items():
            bulletin_str = bulletin_str.str.replace(ind, eng, regex=False)
        
        df['Bulan'] = pd.to_datetime(bulletin_str, errors='coerce')
        df = df.dropna(subset=['Bulan'])
        
    df = df.sort_values('Bulan')
    
    return df
