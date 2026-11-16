"""The 8 regression algorithms from the research objective, in one place.

benchmark.py compares all of them, and model.py builds the app's stacked ensemble from the
top-ranked ones, so both always use the same settings.

Naive Bayes is a classifier only (it models class probabilities and has no regression
form), so Ridge Regression takes its place as the eighth algorithm. Logistic Regression
becomes ordinary (least-squares) Linear Regression.
"""

from __future__ import annotations

import xgboost as xgb
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from sklearn.tree import DecisionTreeRegressor

# key -> display name, in the order the paper lists them.
REGRESSORS = {
    "linear_regression": "Linear Regression",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "ridge": "Ridge Regression",
    "svr": "Support Vector Regression",
    "knn": "KNN",
    "decision_tree": "Decision Tree",
    "mlp": "MLP",
}

# Models whose SHAP values can be computed exactly and quickly (TreeSHAP or coefficients).
# The app's ensemble only uses these, so every score it shows can be explained.
EXPLAINABLE = {"linear_regression", "ridge", "random_forest", "xgboost", "decision_tree"}


def _scaled(est) -> Pipeline:
    return Pipeline([("scale", StandardScaler()), ("model", est)])


def make_regressor(key: str):
    if key == "linear_regression":
        return _scaled(LinearRegression())
    if key == "ridge":
        return _scaled(Ridge(alpha=1.0))
    if key == "random_forest":
        return RandomForestRegressor(n_estimators=300, min_samples_leaf=5, random_state=42, n_jobs=2)
    if key == "xgboost":
        return xgb.XGBRegressor(
            n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
            objective="reg:squarederror", random_state=42, n_jobs=2,
        )
    if key == "svr":
        return _scaled(SVR(kernel="rbf", C=30.0, epsilon=1.0))
    if key == "knn":
        return _scaled(KNeighborsRegressor(n_neighbors=15))
    if key == "decision_tree":
        return DecisionTreeRegressor(max_depth=6, min_samples_leaf=10, random_state=42)
    if key == "mlp":
        return _scaled(MLPRegressor(hidden_layer_sizes=(32, 16), alpha=1e-3, max_iter=2000, early_stopping=True, random_state=42))
    raise KeyError(key)
