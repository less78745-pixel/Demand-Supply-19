import pandas as pd
import numpy as np
import warnings
import gc
import math

from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.statespace.sarimax import SARIMAX
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor

warnings.filterwarnings("ignore")


def _ols_line(x, y):
    """Closed-form degree-1 least squares (slope, intercept).

    Replaces `np.polyfit(x, y, 1)`, which routes through LAPACK's SVD-based
    solver (dgelsd) - on some Windows/OpenBLAS builds this crashes with
    "On entry to DLASCL parameter number 4 had an illegal value" for
    degenerate single-point fits (e.g. a Cabang x Kategori group with only
    one row of history, which this pipeline forecasts deliberately - see
    `_process_group`). A 2-parameter line fit has a direct formula, so there
    is no need for a general-purpose solver here at all.
    """
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    x_mean, y_mean = x.mean(), y.mean()
    dx = x - x_mean
    denom = np.sum(dx ** 2)
    slope = float(np.sum(dx * (y - y_mean)) / denom) if denom > 0 else 0.0
    intercept = float(y_mean - slope * x_mean)
    return slope, intercept


def _ols_predict(x_train, y_train, x_eval):
    slope, intercept = _ols_line(x_train, y_train)
    return slope * np.asarray(x_eval, dtype=float) + intercept


def _mape(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    mask = y_true != 0
    if not mask.any():
        return 0.0
    return _safe_float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)

def _bias(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    return _safe_float(np.sum(y_pred - y_true))

def _mad(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    return _safe_float(np.mean(np.abs(y_pred - y_true)))

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
    """Simple Exponential Smoothing without statsmodels.

    Deliberately hand-rolled (not a stand-in for a bigger model): this is the
    universal fallback used by every model below when a series is too short
    or a real fit fails to converge, so it must never depend on the same
    libraries it is backing up.
    """
    series = list(y_train)
    if not series:
        return [0.0] * steps
    s = series[0]
    for val in series[1:]:
        s = alpha * val + (1 - alpha) * s
    return [_safe_float(s)] * steps

def _holt_winters_forecast(y_train, steps, seasonality=3):
    """Holt-Winters exponential smoothing via statsmodels (genuine fit, not a proxy)."""
    series = np.asarray(y_train, dtype=float)
    n = len(series)
    if n < seasonality * 2 or np.all(series == series[0]):
        return _ses_forecast(series, steps)
    try:
        has_seasonal = n >= seasonality * 2
        model = ExponentialSmoothing(
            series,
            trend='add',
            seasonal='add' if has_seasonal else None,
            seasonal_periods=seasonality if has_seasonal else None,
            initialization_method='estimated',
        ).fit(optimized=True)
        return _safe_list(model.forecast(steps))
    except Exception:
        return _ses_forecast(series, steps)

def _sarimax_forecast(y_train, steps, exog_train=None, seasonality=3):
    """Real SARIMAX (statsmodels), with optional exogenous regressors.

    Order/seasonal_order are kept small on purpose: these run once per
    Cabang x Kategori group (potentially hundreds per upload), so MLE fitting
    time matters. Falls back to SES if the series is too short or the
    optimizer fails to converge (common for short/degenerate series).
    """
    series = np.asarray(y_train, dtype=float)
    n = len(series)
    if n < 6:
        return _ses_forecast(series, steps)
    try:
        exog = None
        if exog_train is not None and len(exog_train) == n:
            exog = np.asarray(exog_train, dtype=float)
        seasonal_order = (1, 0, 0, seasonality) if n >= seasonality * 3 else (0, 0, 0, 0)
        model = SARIMAX(
            series,
            exog=exog,
            order=(1, 1, 1),
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        ).fit(disp=False, maxiter=50, low_memory=True)

        exog_future = np.tile(exog[-1], (steps, 1)) if exog is not None else None
        preds = model.forecast(steps, exog=exog_future)
        return _safe_list(preds)
    except Exception:
        return _ses_forecast(series, steps)

def _samai_forecast(y_train, steps, seasonality=3):
    """SAMAI: Simple Average with Moving Average Indexing (perishable/volatile baseline)."""
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

def _make_lag_features(series, exog=None, n_lags=3):
    """Build a supervised (X, y) lag-feature table for tree-based regressors."""
    n = len(series)
    rows, targets = [], []
    for i in range(n_lags, n):
        feat = list(series[i - n_lags:i])
        if exog is not None:
            feat += list(exog[i])
        rows.append(feat)
        targets.append(series[i])
    return np.array(rows), np.array(targets)

def _tree_forecast(y_train, steps, exog_train, model_cls, model_kwargs, n_lags=3):
    """Genuine gradient-boosted-tree forecast, recursive multi-step.

    Shared by XGBoost and LightGBM: build lag(+exog) features, fit a real
    regressor, then predict one step at a time feeding each prediction back
    in as the next lag. Exogenous columns are held at their last observed
    value across the forecast horizon (no future exog is available).
    """
    series = np.asarray(y_train, dtype=float)
    n = len(series)
    if n < n_lags + 3:
        return _ses_forecast(series, steps)
    try:
        exog = None
        if exog_train is not None and len(exog_train) == n:
            exog = np.asarray(exog_train, dtype=float)
        X, y = _make_lag_features(series, exog, n_lags)
        if len(X) < 2:
            return _ses_forecast(series, steps)

        model = model_cls(**model_kwargs)
        model.fit(X, y)

        history = list(series[-n_lags:])
        exog_hist = exog[-1] if exog is not None else None
        preds = []
        for _ in range(steps):
            feat = list(history[-n_lags:])
            if exog_hist is not None:
                feat += list(exog_hist)
            nxt = float(model.predict(np.array([feat]))[0])
            preds.append(_safe_float(nxt))
            history.append(nxt)
        return preds
    except Exception:
        return _ses_forecast(series, steps)

def _xgboost_forecast(y_train, steps, exog_train=None):
    """Real XGBoost regressor on lag(+exog) features (not a heuristic stand-in)."""
    return _tree_forecast(
        y_train, steps, exog_train,
        model_cls=XGBRegressor,
        model_kwargs=dict(
            n_estimators=100, max_depth=3, learning_rate=0.1,
            objective='reg:squarederror', verbosity=0,
        ),
    )

def _lightgbm_forecast(y_train, steps, exog_train=None):
    """Real LightGBM regressor on lag(+exog) features (not a heuristic stand-in).

    min_child_samples/min_data_in_leaf are dropped to 1 because most
    Cabang x Kategori groups only have a handful of monthly rows -
    LightGBM's default leaf-size minimums (20) would refuse to split at all
    on data this small.
    """
    return _tree_forecast(
        y_train, steps, exog_train,
        model_cls=LGBMRegressor,
        model_kwargs=dict(
            n_estimators=100, max_depth=3, learning_rate=0.1,
            min_child_samples=1, min_data_in_leaf=1, verbosity=-1,
        ),
    )

def _process_group(cabang: str, category: str, df: pd.DataFrame, test_size: int) -> dict:
    try:
        df = df.set_index('Bulan').sort_index()
    except Exception:
        return {"cabang": cabang, "category": category, "combined_data": [],
                "best_model": "SMA-3", "best_mape": 999, "safety_stock": 0.0, "rop": 0.0}

    n = len(df)
    if n < 1:
        return {"cabang": cabang, "category": category, "combined_data": [],
                "best_model": "SMA-3", "best_mape": 999, "safety_stock": 0.0, "rop": 0.0}

    # test_size == 0 means there isn't enough history to hold out a test set
    # (e.g. a group with a single row) - train on everything and skip
    # backtest validation instead of refusing to forecast the group at all.
    # NOTE: `df.iloc[-0:]` is NOT an empty slice (negative zero == zero in
    # Python indexing, so it would silently select the *whole* frame) -
    # test_size == 0 must be branched explicitly rather than relying on the
    # `-test_size` slice below.
    is_validated = test_size > 0

    df['Anomaly'] = 1
    if is_validated:
        train = df.iloc[:-test_size]
        test  = df.iloc[-test_size:]
    else:
        train = df
        test  = df.iloc[0:0]
    y_train, y_test = train['Penjualan'], test['Penjualan']

    exog_cols = [c for c in ['AO', 'RO', 'Rerata Drop Size', 'NOO'] if c in df.columns]
    exog_train = train[exog_cols].values if exog_cols else None
    exog_full  = df[exog_cols].values if exog_cols else None

    future_size = 6
    models_eval   = []
    forecasts_map = {}
    future_map    = {}

    # ── SMA-3 (baseline) ──
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

    # ── SES (baseline) ──
    ses_preds = _ses_forecast(y_train.values, test_size)
    rmse_ses = _safe_float(np.sqrt(np.mean((y_test.values - np.array(ses_preds)) ** 2)))
    forecasts_map['SES'] = ses_preds
    future_map['SES'] = _ses_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'SES', 'rmse': rmse_ses,
                        'mape': _mape(y_test, ses_preds),
                        'bias': _bias(y_test, ses_preds),
                        'mad': _mad(y_test, ses_preds)})

    # ── Trend (OLS, baseline) ──
    try:
        x_train = np.arange(len(y_train), dtype=float)
        x_test  = np.arange(len(y_train), len(y_train) + test_size, dtype=float)
        x_fut   = np.arange(len(df), len(df) + future_size, dtype=float)
        trend_test   = _safe_list(_ols_predict(x_train, y_train.values, x_test))
        trend_future = _safe_list(_ols_predict(x_train, y_train.values, x_fut))
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

    # ── SAMAI (baseline, perishable/volatile) ──
    samai_preds = _samai_forecast(y_train.values, test_size)
    rmse_samai = _safe_float(np.sqrt(np.mean((y_test.values - np.array(samai_preds)) ** 2)))
    forecasts_map['SAMAI'] = samai_preds
    future_map['SAMAI'] = _samai_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'SAMAI', 'rmse': rmse_samai,
                        'mape': _mape(y_test, samai_preds),
                        'bias': _bias(y_test, samai_preds),
                        'mad': _mad(y_test, samai_preds)})

    # ── Holt-Winters (real statsmodels fit) ──
    hw_preds = _holt_winters_forecast(y_train.values, test_size)
    rmse_hw = _safe_float(np.sqrt(np.mean((y_test.values - np.array(hw_preds)) ** 2)))
    forecasts_map['Holt-Winters'] = hw_preds
    future_map['Holt-Winters'] = _holt_winters_forecast(df['Penjualan'].values, future_size)
    models_eval.append({'model': 'Holt-Winters', 'rmse': rmse_hw,
                        'mape': _mape(y_test, hw_preds),
                        'bias': _bias(y_test, hw_preds),
                        'mad': _mad(y_test, hw_preds)})

    # ── SARIMAX (real statsmodels fit, with exogenous regressors) ──
    sarimax_preds = _sarimax_forecast(y_train.values, test_size, exog_train)
    rmse_sarimax = _safe_float(np.sqrt(np.mean((y_test.values - np.array(sarimax_preds)) ** 2)))
    forecasts_map['SARIMAX'] = sarimax_preds
    future_map['SARIMAX'] = _sarimax_forecast(df['Penjualan'].values, future_size, exog_full)
    models_eval.append({'model': 'SARIMAX', 'rmse': rmse_sarimax,
                        'mape': _mape(y_test, sarimax_preds),
                        'bias': _bias(y_test, sarimax_preds),
                        'mad': _mad(y_test, sarimax_preds)})

    # ── XGBoost (real xgboost.XGBRegressor) ──
    xgb_preds = _xgboost_forecast(y_train.values, test_size, exog_train)
    rmse_xgb = _safe_float(np.sqrt(np.mean((y_test.values - np.array(xgb_preds)) ** 2)))
    forecasts_map['XGBoost'] = xgb_preds
    future_map['XGBoost'] = _xgboost_forecast(df['Penjualan'].values, future_size, exog_full)
    models_eval.append({'model': 'XGBoost', 'rmse': rmse_xgb,
                        'mape': _mape(y_test, xgb_preds),
                        'bias': _bias(y_test, xgb_preds),
                        'mad': _mad(y_test, xgb_preds)})

    # ── LightGBM (real lightgbm.LGBMRegressor) ──
    lgbm_preds = _lightgbm_forecast(y_train.values, test_size, exog_train)
    rmse_lgbm = _safe_float(np.sqrt(np.mean((y_test.values - np.array(lgbm_preds)) ** 2)))
    forecasts_map['LightGBM'] = lgbm_preds
    future_map['LightGBM'] = _lightgbm_forecast(df['Penjualan'].values, future_size, exog_full)
    models_eval.append({'model': 'LightGBM', 'rmse': rmse_lgbm,
                        'mape': _mape(y_test, lgbm_preds),
                        'bias': _bias(y_test, lgbm_preds),
                        'mad': _mad(y_test, lgbm_preds)})

    # ── Hybrid Ensemble (avg of the two real tree models) ──
    ensemble_preds = _safe_list((np.array(xgb_preds) + np.array(lgbm_preds)) / 2)
    rmse_ens = _safe_float(np.sqrt(np.mean((y_test.values - np.array(ensemble_preds)) ** 2)))
    forecasts_map['Hybrid Ensemble'] = ensemble_preds
    future_map['Hybrid Ensemble'] = _safe_list((np.array(future_map['XGBoost']) + np.array(future_map['LightGBM'])) / 2)
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

    # Optimize payload size: only send top 3 models + baseline
    top_models = sorted(models_eval, key=lambda x: (x['mape'], x['rmse']))[:3]
    allowed_models = {x['model'] for x in top_models}
    allowed_models.add('SMA-3')
    allowed_models.add(best_model)

    std_dev      = _safe_float(np.std(y_train.values))
    avg_sales    = _safe_float(np.mean(y_train.values))
    safety_stock = 1.65 * std_dev
    rop          = avg_sales + safety_stock

    test_index = list(df.index[-test_size:]) if is_validated else []
    combined_data = []
    for date, row in df.iterrows():
        is_test  = date in test_index
        test_idx = test_index.index(date) if is_test else -1
        preds = {}
        for m_name, pred_list in forecasts_map.items():
            if m_name in allowed_models:
                if is_test and test_idx < len(pred_list):
                    preds[m_name] = round(float(pred_list[test_idx]), 2)

        combined_data.append({
            'cabang':       cabang,
            'category':     category,
            'date':         date.strftime('%Y-%m') if isinstance(date, pd.Timestamp) else str(date),
            'actual':       round(_safe_float(row['Penjualan']), 2),
            'is_anomaly':   False,
            'is_future':    False,
            'forecasts':    preds,
            'best_model':   best_model,
            'mape':         round(best_mape, 2),
            'bias':         round(b_bias, 2),
            'mad':          round(b_mad, 2),
            'rmse':         round(b_rmse, 2),
            'safety_stock': round(safety_stock, 2),
            'rop':          round(rop, 2),
            'validated':    is_validated,
        })

    last_date = df.index[-1]
    for i in range(1, future_size + 1):
        future_date = last_date + pd.DateOffset(months=i)
        preds = {m_name: round(float(pred_list[i - 1]), 2) for m_name, pred_list in future_map.items() if m_name in allowed_models}
        combined_data.append({
            'cabang':       cabang,
            'category':     category,
            'date':         future_date.strftime('%Y-%m'),
            'actual':       None,
            'is_anomaly':   False,
            'is_future':    True,
            'forecasts':    preds,
            'best_model':   best_model,
            'mape':         round(best_mape, 2),
            'bias':         round(b_bias, 2),
            'mad':          round(b_mad, 2),
            'rmse':         round(b_rmse, 2),
            'safety_stock': round(safety_stock, 2),
            'rop':          round(rop, 2),
            'validated':    is_validated,
        })

    return {
        'cabang':          cabang,
        'category':        category,
        'combined_data':   combined_data,
        'model_comparison': models_eval,
        'best_model':      best_model,
        'best_mape':       round(best_mape, 2),
        'safety_stock':    round(safety_stock, 2),
        'rop':             round(rop, 2),
        'validated':       is_validated,
    }

def _empty_response(reason: str) -> dict:
    return {
        "forecast_data":     [],
        "best_model":        "None",
        "model_tally":       {},
        "ai_insights":       [reason],
        "available_methods": ["SMA-3", "SES", "Trend"],
        "model_comparison":  [],
        "inventory_kpis":    {"avg_safety_stock": 0, "avg_reorder_point": 0},
        "error":             reason,
    }

def run_forecast_pipeline(df: pd.DataFrame) -> dict:
    date_parse_failures = 0
    try:
        # `clean_forecast_data` (called by the router before this) already
        # parses 'Bulan' with the same flexible parser, so this is normally a
        # no-op; it's kept as a safety net for any caller that skips that step.
        from utils.imputation import parse_flexible_date_series
        df['Bulan'], date_parse_failures = parse_flexible_date_series(df['Bulan'])
        df = df.dropna(subset=['Bulan'])
    except Exception:
        pass

    if df.empty:
        return _empty_response(
            "Semua baris gagal diproses: kolom 'Bulan' tidak dapat dibaca sebagai tanggal yang valid. "
            "Periksa format tanggal di file Anda (mis. '2026-01-01', 'Januari 2026', atau 'Jan-2026')."
        )

    if 'Cabang' not in df.columns:
        df['Cabang'] = 'Unknown'
    if 'Kategori' not in df.columns:
        df['Kategori'] = 'Unknown'

    df['Cabang']   = df['Cabang'].astype(str).str.strip().str.replace(r'\s+', ' ', regex=True)
    df['Kategori'] = df['Kategori'].astype(str).str.strip().str.replace(r'\s+', ' ', regex=True)

    # Group case-insensitively. Real-world uploads routinely spell the same
    # branch/category inconsistently across rows ("Surabaya" / "surabaya" /
    # "SURABAYA"), and a case-sensitive .unique() treats each spelling as a
    # separate Cabang x Kategori group. That fragments one branch's history
    # into several groups that each fall under the minimum-rows threshold
    # below and get skipped — leaving only whichever branch happened to be
    # spelled consistently (e.g. "Bandung") with enough rows to survive.
    df['_cabang_key']   = df['Cabang'].str.casefold()
    df['_kategori_key'] = df['Kategori'].str.casefold()
    cabang_labels   = df.groupby('_cabang_key')['Cabang'].agg(lambda s: s.value_counts().idxmax())
    kategori_labels = df.groupby('_kategori_key')['Kategori'].agg(lambda s: s.value_counts().idxmax())

    # Every uploaded Cabang x Kategori combination gets forecasted, no matter
    # how little history it has - a group only needs a single row to produce
    # a (naive, carry-forward) forecast. What adapts is how much of that
    # history gets held out to *validate* the models: a group with >= 5 rows
    # gets a proper adaptive backtest (as before), 2-4 rows gets a minimal
    # 1-row holdout, and a lone data point (1 row) skips validation entirely
    # since there's nothing left to test against - MAPE/RMSE for those groups
    # are meaningless zeros rather than a measured error, which is why each
    # forecast row carries a `validated` flag instead of pretending those
    # numbers came from a real backtest. Previously anything under 5 rows was
    # dropped from the response outright, which is why a file with e.g. 28
    # branches could come back showing only the one branch with enough
    # consistently-spelled history to clear that bar.
    MAX_TEST_SIZE = 6
    MIN_TRAIN_ROWS = 3
    FULL_VALIDATION_MIN_ROWS = MIN_TRAIN_ROWS + 2  # 5 rows: room for a >=2-row holdout

    tasks = []
    low_confidence_groups = []  # informational only - every group here is still forecasted
    for cabang_key in df['_cabang_key'].unique():
        c_df = df[df['_cabang_key'] == cabang_key]
        cabang = cabang_labels[cabang_key]
        for cat_key in c_df['_kategori_key'].unique():
            cat_df = c_df[c_df['_kategori_key'] == cat_key].copy()
            cat = kategori_labels[cat_key]
            n_rows = len(cat_df)

            if n_rows >= FULL_VALIDATION_MIN_ROWS:
                group_test_size = min(MAX_TEST_SIZE, n_rows - MIN_TRAIN_ROWS)
            elif n_rows >= 2:
                group_test_size = 1
            else:
                group_test_size = 0  # single data point - no holdout possible

            if n_rows < FULL_VALIDATION_MIN_ROWS:
                low_confidence_groups.append({"cabang": cabang, "category": cat, "rows": n_rows})

            tasks.append((cabang, cat, cat_df, group_test_size))

    if not tasks:
        return _empty_response("Tidak ada data Cabang/Kategori yang bisa diproses setelah pembersihan tanggal.")

    all_combined = []
    overall_kpis = []
    model_tally  = {}
    global_model_metrics = {}
    failed_groups = []

    for task in tasks:
        cabang_t, cat_t = task[0], task[1]
        try:
            res = _process_group(*task)
            if res['combined_data']:
                all_combined.extend(res['combined_data'])
                overall_kpis.append(res)
                bm = res['best_model']
                model_tally[bm] = model_tally.get(bm, 0) + 1

                # Aggregate metrics for model_comparison
                for eval_data in res.get('model_comparison', []):
                    m_name = eval_data['model']
                    if m_name not in global_model_metrics:
                        global_model_metrics[m_name] = {'mape': [], 'bias': [], 'mad': [], 'rmse': []}
                    global_model_metrics[m_name]['mape'].append(eval_data.get('mape', 0))
                    global_model_metrics[m_name]['bias'].append(eval_data.get('bias', 0))
                    global_model_metrics[m_name]['mad'].append(eval_data.get('mad', 0))
                    global_model_metrics[m_name]['rmse'].append(eval_data.get('rmse', 0))
            else:
                failed_groups.append({"cabang": cabang_t, "category": cat_t, "rows": len(task[2]), "reason": "model produced no output"})
        except Exception as e:
            failed_groups.append({"cabang": cabang_t, "category": cat_t, "rows": len(task[2]), "reason": str(e)})

    gc.collect()

    if not all_combined:
        return _empty_response("All model groups failed or produced no output.")

    # Calculate averages for model_comparison
    model_comparison = []
    for m_name, metrics in global_model_metrics.items():
        count = len(metrics['mape'])
        if count > 0:
            model_comparison.append({
                'model': m_name,
                'mape': _safe_float(sum(metrics['mape']) / count),
                'bias': _safe_float(sum(metrics['bias']) / count),
                'mad': _safe_float(sum(metrics['mad']) / count),
                'rmse': _safe_float(sum(metrics['rmse']) / count)
            })

    # Sort model comparison by MAPE
    model_comparison.sort(key=lambda x: x['mape'])

    best_global = max(model_tally, key=model_tally.get) if model_tally else 'SMA-3'
    avg_ss  = sum(x['safety_stock'] for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0
    avg_rop = sum(x['rop'] for x in overall_kpis) / len(overall_kpis) if overall_kpis else 0

    n_cabang_in = df['_cabang_key'].nunique()
    n_cabang_out = len(set(k['cabang'] for k in overall_kpis))

    insights = [
        f"Model terbaik: {best_global} untuk mayoritas cabang.",
        f"Total {len(overall_kpis)} kombinasi Cabang × Kategori berhasil diprediksi "
        f"({n_cabang_out} dari {n_cabang_in} cabang yang diupload).",
        f"Safety Stock rata-rata nasional: {avg_ss:,.0f} unit.",
    ]

    if date_parse_failures:
        insights.append(
            f"⚠️ {date_parse_failures} baris dibuang karena kolom 'Bulan' tidak terbaca sebagai tanggal valid "
            "— cek format tanggalnya (baris lain tetap diproses normal)."
        )

    if low_confidence_groups:
        detail = "; ".join(f"{s['cabang']}/{s['category']} ({s['rows']} baris)" for s in low_confidence_groups[:15])
        more = f", dan {len(low_confidence_groups) - 15} lainnya" if len(low_confidence_groups) > 15 else ""
        insights.append(
            f"ℹ️ {len(low_confidence_groups)} kombinasi Cabang × Kategori tetap diprediksi walau riwayat "
            f"pendek (< {FULL_VALIDATION_MIN_ROWS} bulan) — MAPE/RMSE untuk kombinasi ini tidak melalui "
            f"validasi backtest penuh sehingga kurang bisa diandalkan: {detail}{more}. Tambahkan lebih banyak "
            "riwayat bulan agar akurasinya bisa divalidasi penuh."
        )

    if failed_groups:
        detail = "; ".join(f"{s['cabang']}/{s['category']}: {s.get('reason', '')}" for s in failed_groups[:15])
        insights.append(
            f"⚠️ {len(failed_groups)} kombinasi Cabang × Kategori gagal diproses karena error teknis: {detail}."
        )

    all_methods = ["SMA-3", "SES", "Trend", "SAMAI", "Holt-Winters", "SARIMAX", "XGBoost", "LightGBM", "Hybrid Ensemble"]

    return {
        "forecast_data":         all_combined,
        "skipped_groups":        failed_groups,
        "low_confidence_groups": low_confidence_groups,
        "date_parse_failures":   date_parse_failures,
        "best_model":        best_global,
        "model_tally":       model_tally,
        "ai_insights":       insights,
        "model_comparison":  model_comparison,
        "available_methods": all_methods,
        "inventory_kpis":    {
            "avg_safety_stock":  round(float(avg_ss), 0),
            "avg_reorder_point": round(float(avg_rop), 0),
        },
    }
