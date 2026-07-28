import pandas as pd
import numpy as np
from statsmodels.tsa.holtwinters import SimpleExpSmoothing
from pmdarima import auto_arima
from xgboost import XGBRegressor
from sklearn.metrics import mean_squared_error
from sklearn.ensemble import IsolationForest
import warnings
import gc
from concurrent.futures import ThreadPoolExecutor, as_completed

warnings.filterwarnings("ignore")


# ──────────────────────────────────────────────
# Helper
# ──────────────────────────────────────────────
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
    """Cast any numpy scalar to native Python float, guarding against NaN and Inf."""
    try:
        val = float(v)
        import math
        if math.isnan(val) or math.isinf(val):
            return 0.0
        return val
    except Exception:
        return 0.0

def _safe_list(arr):
    """Cast any array-like to a list of native Python floats, handling NaNs."""
    try:
        return [_safe_float(x) for x in arr]
    except Exception:
        return []


# ──────────────────────────────────────────────
# Per-group forecast (runs inside a thread)
# ──────────────────────────────────────────────
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

    # ── Anomaly detection ──
    try:
        iso = IsolationForest(contamination=0.1, random_state=42)
        df['Anomaly'] = iso.fit_predict(df[['Penjualan']])
    except Exception:
        df['Anomaly'] = 1

    train = df.iloc[:-test_size]
    test  = df.iloc[-test_size:]
    y_train, y_test = train['Penjualan'], test['Penjualan']

    exog_cols = [c for c in ['AO', 'RO', 'Rerata Drop Size', 'NOO'] if c in train.columns]
    exog_train = train[exog_cols] if exog_cols else pd.DataFrame()
    exog_test  = test[exog_cols]  if exog_cols else pd.DataFrame()

    models_eval   = []
    forecasts_map = {}
    future_map    = {}
    future_size   = 6

    # ── SMA-3 ──
    sma3_val = y_train.rolling(3).mean().iloc[-1]
    if pd.isna(sma3_val):
        sma3_val = float(y_train.mean())
    y_pred_sma3 = np.full(test_size, _safe_float(sma3_val))
    forecasts_map['SMA-3'] = _safe_list(y_pred_sma3)
    models_eval.append({'model': 'SMA-3',
                        'rmse': _safe_float(np.sqrt(mean_squared_error(y_test, y_pred_sma3))),
                        'mape': _mape(y_test, y_pred_sma3),
                        'bias': _bias(y_test, y_pred_sma3),
                        'mad': _mad(y_test, y_pred_sma3)})
    # Full fit for future
    full_sma3_val = df['Penjualan'].rolling(3).mean().iloc[-1]
    if pd.isna(full_sma3_val):
        full_sma3_val = float(df['Penjualan'].mean())
    future_map['SMA-3'] = _safe_list(np.full(future_size, _safe_float(full_sma3_val)))

    # ── SES ──
    try:
        ses = SimpleExpSmoothing(y_train, initialization_method='estimated').fit()
        y_pred_ses = ses.forecast(test_size).to_numpy()
        forecasts_map['SES'] = _safe_list(y_pred_ses)
        models_eval.append({'model': 'SES',
                            'rmse': _safe_float(np.sqrt(mean_squared_error(y_test, y_pred_ses))),
                            'mape': _mape(y_test, y_pred_ses),
                            'bias': _bias(y_test, y_pred_ses),
                            'mad': _mad(y_test, y_pred_ses)})
        ses_full = SimpleExpSmoothing(df['Penjualan'], initialization_method='estimated').fit()
        future_map['SES'] = _safe_list(ses_full.forecast(future_size))
    except Exception:
        forecasts_map['SES'] = forecasts_map['SMA-3'][:]
        future_map['SES'] = future_map['SMA-3'][:]
        models_eval.append({'model': 'SES', 'rmse': models_eval[0]['rmse'],
                            'mape': models_eval[0]['mape'], 'bias': models_eval[0]['bias'],
                            'mad': models_eval[0]['mad']})

    # ── SARIMAX / AutoARIMA (runs synchronously — already in a thread) ──
    try:
        ro_train = train[['RO']] if 'RO' in train.columns else None
        ro_test  = test[['RO']]  if 'RO' in test.columns  else None

        mdl = auto_arima(y_train, X=ro_train, seasonal=False,
                         stepwise=True, max_p=1, max_q=1, max_d=1,
                         suppress_warnings=True, error_action='ignore',
                         information_criterion='aic', n_jobs=1)
        pred_test = _safe_list(mdl.predict(n_periods=test_size, X=ro_test))

        # full fit
        ro_full = df[['RO']] if 'RO' in df.columns else None
        ro_future = pd.DataFrame(
            np.repeat(ro_full.iloc[-1:].values, future_size, axis=0),
            columns=ro_full.columns
        ) if ro_full is not None else None

        mdl_full = auto_arima(df['Penjualan'], X=ro_full, seasonal=False,
                              stepwise=True, max_p=1, max_q=1, max_d=1,
                              suppress_warnings=True, error_action='ignore',
                              information_criterion='aic', n_jobs=1)
        pred_future = _safe_list(mdl_full.predict(n_periods=future_size, X=ro_future))

        forecasts_map['SARIMAX'] = pred_test
        future_map['SARIMAX'] = pred_future
        models_eval.append({'model': 'SARIMAX',
                            'rmse': _safe_float(np.sqrt(mean_squared_error(y_test, pred_test))),
                            'mape': _mape(y_test, pred_test),
                            'bias': _bias(y_test, pred_test),
                            'mad': _mad(y_test, pred_test)})
        del mdl, mdl_full  # free memory
    except Exception:
        forecasts_map['SARIMAX'] = forecasts_map['SMA-3'][:]
        future_map['SARIMAX'] = future_map['SMA-3'][:]
        models_eval.append({'model': 'SARIMAX', 'rmse': models_eval[0]['rmse'],
                            'mape': models_eval[0]['mape'], 'bias': models_eval[0]['bias'],
                            'mad': models_eval[0]['mad']})

    # ── XGBoost ──
    try:
        if not exog_train.empty and len(exog_train) >= 4:
            xgb = XGBRegressor(n_estimators=50, max_depth=3, learning_rate=0.1, verbosity=0, n_jobs=1)
            xgb.fit(exog_train.values, y_train.values)
            y_pred_xgb = xgb.predict(exog_test.values)

            exog_full = df[exog_cols]
            xgb_full = XGBRegressor(n_estimators=50, max_depth=3, learning_rate=0.1, verbosity=0, n_jobs=1)
            xgb_full.fit(exog_full.values, df['Penjualan'].values)

            exog_future = np.repeat(exog_full.iloc[-1:].values, future_size, axis=0)
            y_future_xgb = xgb_full.predict(exog_future)
        else:
            y_pred_xgb = y_pred_sma3
            y_future_xgb = future_map['SMA-3']

        forecasts_map['XGBoost'] = _safe_list(y_pred_xgb)
        future_map['XGBoost'] = _safe_list(y_future_xgb)
        models_eval.append({'model': 'XGBoost',
                            'rmse': _safe_float(np.sqrt(mean_squared_error(y_test, y_pred_xgb))),
                            'mape': _mape(y_test, y_pred_xgb),
                            'bias': _bias(y_test, y_pred_xgb),
                            'mad': _mad(y_test, y_pred_xgb)})
    except Exception:
        forecasts_map['XGBoost'] = forecasts_map['SMA-3'][:]
        future_map['XGBoost'] = future_map['SMA-3'][:]
        if not any(m['model'] == 'XGBoost' for m in models_eval):
            models_eval.append({'model': 'XGBoost', 'rmse': models_eval[0]['rmse'],
                                'mape': models_eval[0]['mape'], 'bias': models_eval[0]['bias'],
                                'mad': models_eval[0]['mad']})

    # ── Best model & KPIs ──
    models_eval.sort(key=lambda x: x['mape'])
    best_model = models_eval[0]['model'] if models_eval else 'SMA-3'
    best_mape  = models_eval[0]['mape']  if models_eval else 999
    best_stats = next((m for m in models_eval if m['model'] == best_model), {})
    b_mape = best_stats.get('mape', 0.0)
    b_bias = best_stats.get('bias', 0.0)
    b_mad  = best_stats.get('mad', 0.0)
    b_rmse = best_stats.get('rmse', 0.0)

    std_dev      = _safe_float(np.std(y_train))
    avg_sales    = _safe_float(np.mean(y_train))
    safety_stock = 1.65 * std_dev
    rop          = avg_sales + safety_stock

    # ── Build time-series output ──
    test_index = list(df.index[-test_size:])
    combined_data = []
    for date, row in df.iterrows():
        is_test  = date in test_index
        test_idx = test_index.index(date) if is_test else -1
        preds = {}
        for m_name, pred_list in forecasts_map.items():
            preds[m_name] = float(pred_list[test_idx]) if (is_test and test_idx < len(pred_list)) else None
        combined_data.append({
            'cabang':     cabang,
            'category':   category,
            'date':       date.strftime('%Y-%m') if isinstance(date, pd.Timestamp) else str(date),
            'actual':     _safe_float(row['Penjualan']),
            'is_anomaly': int(row.get('Anomaly', 1)) == -1,
            'is_future':  False,
            'forecasts':  preds,
            'best_model': best_model,
            'mape':       b_mape,
            'bias':       b_bias,
            'mad':        b_mad,
            'rmse':       b_rmse,
            'safety_stock': safety_stock,
            'rop':        rop
        })

    # Append Future Dates
    last_date = df.index[-1]
    for i in range(1, future_size + 1):
        future_date = last_date + pd.DateOffset(months=i)
        preds = {}
        for m_name, pred_list in future_map.items():
            preds[m_name] = float(pred_list[i-1])

        combined_data.append({
            'cabang':     cabang,
            'category':   category,
            'date':       future_date.strftime('%Y-%m'),
            'actual':     None,
            'is_anomaly': False,
            'is_future':  True,
            'forecasts':  preds,
            'best_model': best_model,
            'mape':       b_mape,
            'bias':       b_bias,
            'mad':        b_mad,
            'rmse':       b_rmse,
            'safety_stock': safety_stock,
            'rop':        rop
        })

    return {
        'cabang':       cabang,
        'category':     category,
        'combined_data': combined_data,
        'model_comparison': models_eval,
        'best_model':   best_model,
        'best_mape':    best_mape,
        'safety_stock': safety_stock,
        'rop':          rop,
    }


# ──────────────────────────────────────────────
# Main pipeline
# ──────────────────────────────────────────────
def run_forecast_pipeline(df: pd.DataFrame) -> dict:
    # ── Date parsing (handles Indonesian month names too) ──
    try:
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
    except Exception:
        pass

    if df.empty:
        return _empty_response("Empty dataframe after date parsing.")

    if 'Cabang' not in df.columns:
        df['Cabang'] = 'Unknown'
    if 'Kategori' not in df.columns:
        df['Kategori'] = 'Unknown'

    df['Cabang']  = df['Cabang'].astype(str).str.strip()
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
        return _empty_response("Insufficient data — each Cabang+Category needs at least 6 rows.")

    all_combined  = []
    overall_kpis  = []
    model_tally   = {}

    # ── Sequential execution to avoid thread contention on repeated runs ──
    # auto_arima internally uses threads; nesting ThreadPoolExecutors causes deadlocks
    # on 2nd/3rd runs on Windows. Running sequentially is safer and only marginally slower
    # for typical WMS datasets (< 20 groups).
    if len(tasks) <= 20:
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
    else:
        # For large datasets, use threads but limit workers
        max_workers = min(4, len(tasks))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_process_group, *task): task for task in tasks}
            for future in as_completed(futures):
                try:
                    res = future.result(timeout=120)
                    if res['combined_data']:
                        all_combined.extend(res['combined_data'])
                        overall_kpis.append(res)
                        bm = res['best_model']
                        model_tally[bm] = model_tally.get(bm, 0) + 1
                except Exception:
                    pass

    # Force garbage collection to free ARIMA/XGBoost model memory
    gc.collect()

    if not all_combined:
        return _empty_response("All model groups failed or produced no output.")

    best_global  = max(model_tally, key=model_tally.get) if model_tally else 'SMA-3'
    avg_ss  = sum(x['safety_stock'] for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0
    avg_rop = sum(x['rop']          for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0

    insights = []
    if model_tally:
        overall_best = max(model_tally, key=model_tally.get)
        insights.append(f"DSP merekomendasikan model {overall_best} sebagai paling akurat untuk mayoritas cabang.")
        insights.append(f"Total {len(overall_kpis)} kombinasi Cabang × Kategori berhasil diprediksi.")
        insights.append(f"Safety Stock rata-rata nasional: {avg_ss:,.0f} unit.")

    return {
        "forecast_data":      all_combined,
        "best_model":         best_global,
        "model_tally":        model_tally,
        "ai_insights":        insights,
        "available_methods":  ["SMA-3", "SES", "SARIMAX", "XGBoost"],
        "inventory_kpis": {
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
        "available_methods": ["SMA-3", "SES", "SARIMAX", "XGBoost"],
        "inventory_kpis":    {"avg_safety_stock": 0, "avg_reorder_point": 0},
        "error":             reason,
    }
