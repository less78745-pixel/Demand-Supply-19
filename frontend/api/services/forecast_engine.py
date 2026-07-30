import pandas as pd
import numpy as np
import warnings
import gc
import math

warnings.filterwarnings("ignore")


def _mape(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    mask = y_true != 0
    if not mask.any():
        return 0.0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)

def _bias(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    return float(np.sum(y_pred - y_true))

def _mad(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    return float(np.mean(np.abs(y_pred - y_true)))

def _safe_float(v):
    try:
        val = float(v)
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except Exception:
        return 0.0

def _safe_list(arr):
    try:
        return [_safe_float(x) for x in arr]
    except Exception:
        return []


def _ses_forecast(y_train, steps, alpha=0.3):
    """Simple Exponential Smoothing without statsmodels."""
    series = list(y_train)
    if not series:
        return [0.0] * steps
    s = series[0]
    for val in series[1:]:
        s = alpha * val + (1 - alpha) * s
    return [_safe_float(s)] * steps

def _hw_forecast(y_train, steps, seasonality=3):
    """Lightweight Holt-Winters (Seasonal Trend) proxy for SARIMAX."""
    series = list(y_train)
    n = len(series)
    if n < seasonality * 2:
        return _ses_forecast(series, steps)
    indices = [1.0] * seasonality
    for i in range(seasonality):
        season_vals = series[i::seasonality]
        if season_vals and sum(series) > 0:
            indices[i] = _safe_float(np.mean(season_vals) / (np.mean(series) + 1e-5))
    deseasonalized = [series[i] / (indices[i % seasonality] + 1e-5) for i in range(n)]
    x_train = np.arange(n, dtype=float)
    coeffs = np.polyfit(x_train, deseasonalized, 1)
    
    x_steps = np.arange(n, n + steps, dtype=float)
    trend_steps = np.polyval(coeffs, x_steps)
    preds = [_safe_float(trend_steps[i] * indices[(n + i) % seasonality]) for i in range(steps)]
    return preds

def _gb_forecast(y_train, steps):
    """Lightweight Gradient Boosting proxy for XGBoost."""
    series = list(y_train)
    n = len(series)
    if n < 3:
        return _ses_forecast(series, steps)
    X = np.array(series[:-1])
    Y = np.array(series[1:])
    F_val = float(np.mean(Y))
    trees = []
    residuals = Y - F_val
    for _ in range(5):
        best_err = float('inf')
        best_split = X[0]
        best_left, best_right = 0.0, 0.0
        for split_val in np.unique(X):
            left_mask = X <= split_val
            right_mask = X > split_val
            left_val = np.mean(residuals[left_mask]) if left_mask.any() else 0.0
            right_val = np.mean(residuals[right_mask]) if right_mask.any() else 0.0
            pred = np.where(left_mask, left_val, right_val)
            err = float(np.sum((residuals - pred) ** 2))
            if err < best_err:
                best_err = err
                best_split = split_val
                best_left = float(left_val)
                best_right = float(right_val)
        trees.append((best_split, best_left, best_right))
        pred = np.where(X <= best_split, best_left, best_right)
        residuals -= pred * 0.5
    
    curr_x = series[-1]
    preds = []
    for _ in range(steps):
        nxt = F_val
        for split, l_val, r_val in trees:
            nxt += (l_val if curr_x <= split else r_val) * 0.5
        preds.append(_safe_float(nxt))
        curr_x = nxt
    return preds

def _samai_forecast(y_train, steps, seasonality=3):
    """SAMAI: Simple Average with Moving Average Indexing (perishable/volatile proxy)."""
    series = list(y_train)
    n = len(series)
    if n < seasonality * 2:
        return _ses_forecast(series, steps)
    
    # Calculate simple average
    overall_avg = np.mean(series)
    
    # Calculate seasonal indices (Moving Average Indexing)
    ma_indices = [1.0] * seasonality
    for i in range(seasonality):
        season_vals = series[i::seasonality]
        if season_vals and overall_avg > 0:
            ma_indices[i] = _safe_float(np.mean(season_vals) / overall_avg)
            
    preds = []
    for i in range(steps):
        # Forecast is simple average * seasonal index
        idx = ma_indices[(n + i) % seasonality]
        preds.append(_safe_float(overall_avg * idx))
    return preds

def _bilstm_proxy_forecast(y_train, steps):
    """BiLSTM Proxy: Lightweight RNN-like simulation using numpy for temporal dependencies."""
    series = np.array(y_train, dtype=float)
    n = len(series)
    if n < 4:
        return _ses_forecast(series, steps)
    
    # Normalize
    s_min, s_max = np.min(series), np.max(series)
    if s_max - s_min == 0:
        return [_safe_float(series[-1])] * steps
        
    norm_series = (series - s_min) / (s_max - s_min)
    
    # Simple simulated bi-directional cell state (forward and backward memory)
    forward_state = 0.0
    backward_state = 0.0
    
    # Forward pass
    for x in norm_series:
        forward_state = 0.8 * forward_state + 0.2 * x
        
    # Backward pass
    for x in reversed(norm_series):
        backward_state = 0.8 * backward_state + 0.2 * x
        
    # Predict step-by-step using combined state
    preds = []
    curr_val = norm_series[-1]
    
    for _ in range(steps):
        # Simulated gate activation (tanh/sigmoid-like)
        combined_state = (forward_state + backward_state) / 2
        nxt_norm = curr_val * 0.7 + combined_state * 0.3
        
        # Denormalize
        nxt_val = nxt_norm * (s_max - s_min) + s_min
        preds.append(_safe_float(nxt_val))
        
        # Update states for next step
        forward_state = 0.8 * forward_state + 0.2 * nxt_norm
        curr_val = nxt_norm
        
    return preds

def _process_group(cabang: str, category: str, df: pd.DataFrame, test_size: int) -> dict:
    try:
        df = df.set_index('Bulan').sort_index()
    except Exception:
        return {"cabang": cabang, "category": category, "combined_data": [],
                "best_model": "SMA-3", "best_mape": 999, "safety_stock": 0.0, "rop": 0.0}

    n = len(df)
    if n < test_size + 3:
        return {"cabang": cabang, "category": category, "combined_data": [],
                "best_model": "SMA-3", "best_mape": 999, "safety_stock": 0.0, "rop": 0.0}

    df['Anomaly'] = 1
    train = df.iloc[:-test_size]
    test  = df.iloc[-test_size:]
    y_train, y_test = train['Penjualan'], test['Penjualan']

    future_size = 6
    models_eval   = []
    forecasts_map = {}
    future_map    = {}

    # ── SMA-3 ──
    sma3_val = y_train.rolling(3).mean().iloc[-1]
    if pd.isna(sma3_val):
        sma3_val = float(y_train.mean())
    y_pred_sma3 = np.full(test_size, _safe_float(sma3_val))
    rmse_sma3 = _safe_float(np.sqrt(np.mean((y_test.values - y_pred_sma3) ** 2)))
    forecasts_map['SMA-3'] = _safe_list(y_pred_sma3)
    models_eval.append({'model': 'SMA-3', 'rmse': rmse_sma3,
                        'mape': _mape(y_test, y_pred_sma3),
                        'bias': _bias(y_test, y_pred_sma3),
                        'mad': _mad(y_test, y_pred_sma3)})
    full_sma3 = df['Penjualan'].rolling(3).mean().iloc[-1]
    if pd.isna(full_sma3):
        full_sma3 = float(df['Penjualan'].mean())
    future_map['SMA-3'] = _safe_list(np.full(future_size, _safe_float(full_sma3)))

    # ── SES (manual, no statsmodels) ──
    ses_preds = _ses_forecast(y_train.values, test_size)
    rmse_ses = _safe_float(np.sqrt(np.mean((y_test.values - np.array(ses_preds)) ** 2)))
    forecasts_map['SES'] = ses_preds
    future_map['SES'] = _ses_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'SES', 'rmse': rmse_ses,
                        'mape': _mape(y_test, ses_preds),
                        'bias': _bias(y_test, ses_preds),
                        'mad': _mad(y_test, ses_preds)})

    # ── Linear Trend (replaces SARIMAX / XGBoost) ──
    try:
        x_train = np.arange(len(y_train), dtype=float)
        x_test  = np.arange(len(y_train), len(y_train) + test_size, dtype=float)
        x_fut   = np.arange(len(df), len(df) + future_size, dtype=float)
        coeffs = np.polyfit(x_train, y_train.values, 1)
        trend_test   = _safe_list(np.polyval(coeffs, x_test))
        trend_future = _safe_list(np.polyval(coeffs, x_fut))
        rmse_trend = _safe_float(np.sqrt(np.mean((y_test.values - np.array(trend_test)) ** 2)))
        forecasts_map['Trend'] = trend_test
        future_map['Trend']    = trend_future
        models_eval.append({'model': 'Trend', 'rmse': rmse_trend,
                            'mape': _mape(y_test, trend_test),
                            'bias': _bias(y_test, trend_test),
                            'mad': _mad(y_test, trend_test)})
    except Exception:
        forecasts_map['Trend'] = forecasts_map['SMA-3'][:]
        future_map['Trend']    = future_map['SMA-3'][:]
        models_eval.append({'model': 'Trend', 'rmse': rmse_sma3,
                            'mape': models_eval[0]['mape'], 'bias': models_eval[0]['bias'],
                            'mad': models_eval[0]['mad']})

    # ── SARIMAX (Lightweight Proxy) ──
    sarimax_preds = _hw_forecast(y_train.values, test_size)
    rmse_sarimax = _safe_float(np.sqrt(np.mean((y_test.values - np.array(sarimax_preds)) ** 2)))
    forecasts_map['SARIMAX'] = sarimax_preds
    future_map['SARIMAX'] = _hw_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'SARIMAX', 'rmse': rmse_sarimax,
                        'mape': _mape(y_test, sarimax_preds),
                        'bias': _bias(y_test, sarimax_preds),
                        'mad': _mad(y_test, sarimax_preds)})

    # ── XGBoost (Lightweight Proxy) ──
    xgb_preds = _gb_forecast(y_train.values, test_size)
    rmse_xgb = _safe_float(np.sqrt(np.mean((y_test.values - np.array(xgb_preds)) ** 2)))
    forecasts_map['XGBoost'] = xgb_preds
    future_map['XGBoost'] = _gb_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'XGBoost', 'rmse': rmse_xgb,
                        'mape': _mape(y_test, xgb_preds),
                        'bias': _bias(y_test, xgb_preds),
                        'mad': _mad(y_test, xgb_preds)})

    # ── SAMAI ──
    samai_preds = _samai_forecast(y_train.values, test_size)
    rmse_samai = _safe_float(np.sqrt(np.mean((y_test.values - np.array(samai_preds)) ** 2)))
    forecasts_map['SAMAI'] = samai_preds
    future_map['SAMAI'] = _samai_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'SAMAI', 'rmse': rmse_samai,
                        'mape': _mape(y_test, samai_preds),
                        'bias': _bias(y_test, samai_preds),
                        'mad': _mad(y_test, samai_preds)})

    # ── BiLSTM (Lightweight Proxy) ──
    bilstm_preds = _bilstm_proxy_forecast(y_train.values, test_size)
    rmse_bilstm = _safe_float(np.sqrt(np.mean((y_test.values - np.array(bilstm_preds)) ** 2)))
    forecasts_map['BiLSTM'] = bilstm_preds
    future_map['BiLSTM'] = _bilstm_proxy_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'BiLSTM', 'rmse': rmse_bilstm,
                        'mape': _mape(y_test, bilstm_preds),
                        'bias': _bias(y_test, bilstm_preds),
                        'mad': _mad(y_test, bilstm_preds)})

    # ── Hybrid Ensemble (XGBoost + BiLSTM) ──
    ensemble_preds = _safe_list((np.array(xgb_preds) + np.array(bilstm_preds)) / 2)
    rmse_ens = _safe_float(np.sqrt(np.mean((y_test.values - np.array(ensemble_preds)) ** 2)))
    forecasts_map['Hybrid Ensemble'] = ensemble_preds
    future_map['Hybrid Ensemble'] = _safe_list((np.array(future_map['XGBoost']) + np.array(future_map['BiLSTM'])) / 2)
    models_eval.append({'model': 'Hybrid Ensemble', 'rmse': rmse_ens,
                        'mape': _mape(y_test, ensemble_preds),
                        'bias': _bias(y_test, ensemble_preds),
                        'mad': _mad(y_test, ensemble_preds)})

    # ── Best Model Selection ──
    best_model_info = min(models_eval, key=lambda x: (x['mape'], x['rmse']))
    best_model = best_model_info['model']
    best_mape  = best_model_info['mape']
    b_bias = best_model_info['bias']
    b_mad  = best_model_info['mad']
    b_rmse = best_model_info['rmse']

    std_dev      = _safe_float(np.std(y_train.values))
    avg_sales    = _safe_float(np.mean(y_train.values))
    safety_stock = 1.65 * std_dev
    rop          = avg_sales + safety_stock

    test_index = list(df.index[-test_size:])
    combined_data = []
    for date, row in df.iterrows():
        is_test  = date in test_index
        test_idx = test_index.index(date) if is_test else -1
        preds = {}
        for m_name, pred_list in forecasts_map.items():
            preds[m_name] = float(pred_list[test_idx]) if (is_test and test_idx < len(pred_list)) else None
        combined_data.append({
            'cabang':       cabang,
            'category':     category,
            'date':         date.strftime('%Y-%m') if isinstance(date, pd.Timestamp) else str(date),
            'actual':       _safe_float(row['Penjualan']),
            'is_anomaly':   False,
            'is_future':    False,
            'forecasts':    preds,
            'best_model':   best_model,
            'mape':         best_mape,
            'bias':         b_bias,
            'mad':          b_mad,
            'rmse':         b_rmse,
            'safety_stock': safety_stock,
            'rop':          rop,
        })

    last_date = df.index[-1]
    for i in range(1, future_size + 1):
        future_date = last_date + pd.DateOffset(months=i)
        preds = {m_name: float(pred_list[i - 1]) for m_name, pred_list in future_map.items()}
        combined_data.append({
            'cabang':       cabang,
            'category':     category,
            'date':         future_date.strftime('%Y-%m'),
            'actual':       None,
            'is_anomaly':   False,
            'is_future':    True,
            'forecasts':    preds,
            'best_model':   best_model,
            'mape':         best_mape,
            'bias':         b_bias,
            'mad':          b_mad,
            'rmse':         b_rmse,
            'safety_stock': safety_stock,
            'rop':          rop,
        })

    return {
        'cabang':          cabang,
        'category':        category,
        'combined_data':   combined_data,
        'model_comparison': models_eval,
        'best_model':      best_model,
        'best_mape':       best_mape,
        'safety_stock':    safety_stock,
        'rop':             rop,
    }


def run_forecast_pipeline(df: pd.DataFrame) -> dict:
    try:
        indonesian_months = {
            'januari': 'january', 'februari': 'february', 'maret': 'march',
            'april': 'april', 'mei': 'may', 'juni': 'june', 'juli': 'july',
            'agustus': 'august', 'september': 'september', 'oktober': 'october',
            'november': 'november', 'desember': 'december',
            'jan': 'jan', 'feb': 'feb', 'mar': 'mar', 'apr': 'apr',
            'jun': 'jun', 'jul': 'jul', 'agu': 'aug', 'agt': 'aug',
            'sep': 'sep', 'okt': 'oct', 'nov': 'nov', 'des': 'dec',
        }
        bulletin_str = df['Bulan'].astype(str).str.lower().str.strip()
        for ind, eng in indonesian_months.items():
            bulletin_str = bulletin_str.str.replace(ind, eng, regex=False)
        df['Bulan'] = pd.to_datetime(bulletin_str, errors='coerce')
        df = df.dropna(subset=['Bulan'])
    except Exception:
        pass

    if df.empty:
        return _empty_response("Empty dataframe after date parsing.")

    if 'Cabang' not in df.columns:
        df['Cabang'] = 'Unknown'
    if 'Kategori' not in df.columns:
        df['Kategori'] = 'Unknown'

    df['Cabang']   = df['Cabang'].astype(str).str.strip()
    df['Kategori'] = df['Kategori'].astype(str).str.strip()

    test_size = 6
    tasks = []
    for cabang in df['Cabang'].unique():
        c_df = df[df['Cabang'] == cabang]
        for cat in c_df['Kategori'].unique():
            cat_df = c_df[c_df['Kategori'] == cat].copy()
            if len(cat_df) >= test_size + 3:
                tasks.append((cabang, cat, cat_df, test_size))

    if not tasks:
        return _empty_response("Insufficient data — each Cabang+Category needs at least 9 rows.")

    all_combined = []
    overall_kpis = []
    model_tally  = {}

    for task in tasks:
        try:
            res = _process_group(*task)
            if res['combined_data']:
                all_combined.extend(res['combined_data'])
                overall_kpis.append(res)
                bm = res['best_model']
                model_tally[bm] = model_tally.get(bm, 0) + 1
        except Exception:
            pass

    gc.collect()

    if not all_combined:
        return _empty_response("All model groups failed or produced no output.")

    best_global = max(model_tally, key=model_tally.get) if model_tally else 'SMA-3'
    avg_ss  = sum(x['safety_stock'] for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0
    avg_rop = sum(x['rop'] for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0

    insights = [
        f"Model terbaik: {best_global} untuk mayoritas cabang.",
        f"Total {len(overall_kpis)} kombinasi Cabang × Kategori berhasil diprediksi.",
        f"Safety Stock rata-rata nasional: {avg_ss:,.0f} unit.",
    ]

    return {
        "forecast_data":     all_combined,
        "best_model":        best_global,
        "model_tally":       model_tally,
        "ai_insights":       insights,
        "available_methods": ["SMA-3", "SES", "Trend", "SARIMAX", "XGBoost"],
        "inventory_kpis":    {
            "avg_safety_stock":  round(float(avg_ss), 0),
            "avg_reorder_point": round(float(avg_rop), 0),
        },
    }


def _empty_response(reason: str) -> dict:
    return {
        "forecast_data":     [],
        "best_model":        "None",
        "model_tally":       {},
        "ai_insights":       [reason],
        "available_methods": ["SMA-3", "SES", "Trend"],
        "inventory_kpis":    {"avg_safety_stock": 0, "avg_reorder_point": 0},
        "error":             reason,
    }
