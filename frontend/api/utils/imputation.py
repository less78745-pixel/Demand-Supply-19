import re
import warnings
import pandas as pd

INDONESIAN_MONTHS = {
    'januari': 'january', 'februari': 'february', 'maret': 'march',
    'april': 'april', 'mei': 'may', 'juni': 'june', 'juli': 'july',
    'agustus': 'august', 'september': 'september', 'oktober': 'october',
    'november': 'november', 'desember': 'december',
    'jan': 'jan', 'feb': 'feb', 'mar': 'mar', 'apr': 'apr',
    'jun': 'jun', 'jul': 'jul', 'agu': 'aug', 'agt': 'aug',
    'sep': 'sep', 'okt': 'oct', 'nov': 'nov', 'des': 'dec',
}

# Matches short 'Mon-YY' / 'Mon YY' forms (e.g. "Jan-26"). Without this,
# pandas reads the 2-digit number as a *day* and silently produces a
# year-0001 date (Jan-26 -> 0001-01-26) instead of failing loudly or
# producing 2026-01-01, corrupting the whole time series without any error.
_MONTH_2DIGIT_YEAR = re.compile(
    r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]+(\d{2})\b'
)


def _expand_two_digit_year(s: str) -> str:
    def _sub(m):
        yy = int(m.group(2))
        year = 2000 + yy if yy <= 68 else 1900 + yy
        return f"{m.group(1)}-{year}"
    return _MONTH_2DIGIT_YEAR.sub(_sub, s)


def parse_flexible_date_series(series: pd.Series) -> tuple[pd.Series, int]:
    """
    Robustly parse a column of dates that may arrive as proper datetimes,
    Excel serial-date numbers, Indonesian month names ('1 Mei 2026'), short
    'Mon-YY' forms ('Jan-26'), or generic day-first/month-first text.

    Returns (parsed_series, n_unparseable). The caller decides whether/how
    to warn about n_unparseable instead of silently dropping rows.
    """
    if pd.api.types.is_datetime64_any_dtype(series):
        return series, int(series.isna().sum())

    raw = series.copy()

    text = raw.astype(str).str.lower().str.strip()
    for ind, eng in INDONESIAN_MONTHS.items():
        text = text.str.replace(ind, eng, regex=False)
    text = text.map(_expand_two_digit_year)

    # Both orientations are tried deliberately (unambiguous formats like ISO
    # dates make dayfirst a no-op either way) - silence pandas' heads-up about it.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        parsed_mdy = pd.to_datetime(text, errors='coerce', dayfirst=False)
        parsed_dmy = pd.to_datetime(text, errors='coerce', dayfirst=True)
    # Prefer whichever day/month order parses more rows; ties keep month-first.
    parsed = parsed_mdy if parsed_mdy.notna().sum() >= parsed_dmy.notna().sum() else parsed_dmy

    # Excel serial-date numbers (e.g. a date-formatted cell exported as a raw
    # number): roughly 1954-01-01 .. 2064-01-01 in Excel's 1899-12-30 epoch.
    still_missing = parsed.isna()
    if still_missing.any():
        numeric = pd.to_numeric(raw[still_missing], errors='coerce')
        is_serial = numeric.between(20000, 60000)
        if is_serial.any():
            serial_dates = pd.to_datetime(numeric[is_serial], unit='D', origin='1899-12-30', errors='coerce')
            parsed.loc[serial_dates.index] = serial_dates

    return parsed, int(parsed.isna().sum())


def clean_occupancy_data(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
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
    n_failed = 0
    if 'Date' in df.columns:
        df['Date'], n_failed = parse_flexible_date_series(df['Date'])
        df = df.dropna(subset=['Date'])

    return df, n_failed

def clean_forecast_data(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    df = df.copy()

    # Only clean columns that actually exist in the dataframe
    metrics = ['Penjualan', 'AO', 'RO', 'Rerata Drop Size', 'NOO']
    for m in metrics:
        if m in df.columns:
            df[m] = pd.to_numeric(df[m], errors='coerce').fillna(0)

    n_failed = 0
    if 'Bulan' in df.columns:
        df['Bulan'], n_failed = parse_flexible_date_series(df['Bulan'])
        df = df.dropna(subset=['Bulan'])
        df = df.sort_values('Bulan')

    return df, n_failed
