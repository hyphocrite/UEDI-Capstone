"""Draws the paper's figures from the regression benchmark.

    python benchmark.py                 # run these first
    python train.py
    python plot_results.py

Writes to models/figures/:
  r2_comparison.png         each model's R² (mean ± 1 SD over the benchmark's test folds) and MAE
  predicted_vs_actual.png   the stacked ensemble's out-of-fold predictions against real scores
  error_types.png           Type I / Type II errors of every model, as 2 x 2 matrices
  error_types.json          the same counts, for the Credit Model page

Predictions are out-of-fold from one 5-fold run: every loan is scored by a model that never
saw it. For the error matrices, a "poor repayer" is a past loan whose real score was below
60, and a model "flags" a loan when its predicted score is below the app's approve line
(from models/metrics.json), so the loan goes to review or deny instead of approve.
  Type I  (false positive): a good repayer flagged.
  Type II (false negative): a poor repayer suggested for approval.
"""

from __future__ import annotations

import argparse
import json
import warnings
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.model_selection import KFold, cross_val_predict  # noqa: E402

from benchmark import load_uedi  # noqa: E402
from uedi_ml.dataset import POOR_REPAYMENT  # noqa: E402
from uedi_ml.model import clip_score, make_stack  # noqa: E402
from uedi_ml.regressors import REGRESSORS, make_regressor  # noqa: E402

HERE = Path(__file__).parent
INK, INK_2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#ffffff"
HIGHLIGHT, MUTED = "#0B422A", "#a9a8a3"
GREENS = ["#f3f9f5", "#d3eedd", "#a6dcbb", "#6fc394", "#3ea66d", "#1f7f4d", "#0B422A"]
ENSEMBLE = "Stacked ensemble (app)"

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "text.color": INK, "axes.labelcolor": INK_2,
                     "xtick.color": INK_2, "ytick.color": INK, "axes.edgecolor": GRID, "figure.facecolor": SURFACE,
                     "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE})


def _clean(ax):
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.tick_params(axis="y", length=0)
    ax.set_axisbelow(True)


def r2_chart(rows: list[dict], out: Path):
    rows = sorted(rows, key=lambda r: r["r2"])
    short = {"Random Forest": "RF", "XGBoost": "XGB", "Linear Regression": "LR", "Ridge Regression": "Ridge", "Decision Tree": "DT"}

    def label(r):
        if not r.get("members"):
            return r["model"]
        parts = " + ".join(short.get(REGRESSORS[m], m) for m in r["members"])
        return f"Stacked ({parts})" + (" — app" if r.get("usedByApp") else "")

    names = [label(r) for r in rows]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 5), sharey=True, gridspec_kw={"width_ratios": [3, 2]})
    for i, r in enumerate(rows):
        app = r.get("usedByApp")
        color = HIGHLIGHT if app else MUTED
        a1.plot([r["r2"] - r["r2Sd"], r["r2"] + r["r2Sd"]], [i, i], color=color, lw=2, solid_capstyle="round")
        a1.plot(r["r2"], i, "o", ms=8, color=color, mec=SURFACE, mew=2)
        a1.text(r["r2"] + r["r2Sd"] + 0.005, i, f"{r['r2']:.3f}", va="center", fontsize=9, color=INK if app else INK_2,
                fontweight="bold" if app else "normal")
        a2.barh(i, r["mae"], color=color, height=0.55)
        a2.text(r["mae"] + 0.2, i, f"{r['mae']:.2f}", va="center", fontsize=9, color=INK if app else INK_2)
    a1.set_yticks(range(len(rows)), names)
    a1.set_xlabel("R² (higher is better)")
    a2.set_xlabel("MAE in score points (lower is better)")
    for ax in (a1, a2):
        ax.grid(axis="x", color=GRID, lw=1)
        _clean(ax)
    fig.suptitle("Regression benchmark: predicting the Repayment Performance Score (0–100)", x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.text(0.01, 0.005, "Dot: mean over the benchmark's test folds (5-fold CV, repeated). Line: ± 1 standard deviation. Green: the app's model.",
             fontsize=8.5, color=INK_2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.96))
    fig.savefig(out, dpi=200)
    plt.close(fig)


def scatter(y: np.ndarray, pred: np.ndarray, approve: float, deny: float, out: Path):
    fig, ax = plt.subplots(figsize=(6.2, 6))
    ax.scatter(y, pred, s=6, alpha=0.35, color=HIGHLIGHT, lw=0)
    ax.plot([0, 100], [0, 100], color=INK_2, lw=1, ls="--")
    for t, label in ((approve, f"approve line {approve:g}"), (deny, f"deny line {deny:g}")):
        ax.axhline(t, color=MUTED, lw=1)
        ax.text(1, t + 1, label, fontsize=8.5, color=INK_2)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.set_xlabel("Actual Repayment Performance Score")
    ax.set_ylabel("Predicted credit score (stacked ensemble)")
    ax.grid(color=GRID, lw=1)
    ax.set_axisbelow(True)
    ax.set_title("Predicted vs actual (out-of-fold)", loc="left", fontsize=12, fontweight="bold")
    fig.tight_layout()
    fig.savefig(out, dpi=200)
    plt.close(fig)


def matrix(y: np.ndarray, pred: np.ndarray, approve: float) -> dict:
    poor, flagged = y < POOR_REPAYMENT, pred < approve
    tp, fn = int((poor & flagged).sum()), int((poor & ~flagged).sum())
    fp, tn = int((~poor & flagged).sum()), int((~poor & ~flagged).sum())
    return {"matrix": [[tn, fp], [fn, tp]], "typeIRate": round(fp / max(fp + tn, 1), 4), "typeIIRate": round(fn / max(tp + fn, 1), 4)}


def draw_matrix(ax, cm: np.ndarray, title: str):
    share = cm / np.maximum(cm.sum(axis=1, keepdims=True), 1)
    cmap = matplotlib.colors.LinearSegmentedColormap.from_list("greens", GREENS)
    ax.imshow(share, cmap=cmap, vmin=0, vmax=1)
    labels = [["", "Type I"], ["Type II", ""]]
    for (i, j), n in np.ndenumerate(cm):
        dark = share[i, j] > 0.55
        ax.text(j, i - 0.08, f"{n:,}", ha="center", va="center", fontsize=11, fontweight="bold", color=SURFACE if dark else INK)
        ax.text(j, i + 0.22, f"{share[i, j]:.0%} {labels[i][j]}".strip(), ha="center", va="center", fontsize=7.5, color=SURFACE if dark else INK_2)
    ax.set_xticks([0, 1], ["Suggested\napprove", "Flagged"], fontsize=8)
    ax.set_yticks([0, 1], ["Good\nrepayer", "Poor\nrepayer"], fontsize=8)
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title(title, fontsize=9, color=INK, pad=6)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", type=Path, default=HERE / "data" / "sample_loans.csv")
    parser.add_argument("--out", type=Path, default=HERE / "models" / "figures")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    bench = json.loads((HERE / "models" / f"benchmark_{args.data.stem}.json").read_text())
    metrics = json.loads((HERE / "models" / "metrics.json").read_text())
    approve, deny = metrics["thresholds"]["approve"], metrics["thresholds"]["deny"]
    r2_chart(bench["results"], args.out / "r2_comparison.png")

    X, y = load_uedi(args.data)
    cv = KFold(n_splits=5, shuffle=True, random_state=7)
    preds = {}
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        for key, name in REGRESSORS.items():
            preds[name] = clip_score(cross_val_predict(make_regressor(key), X, y, cv=cv))
            print(f"  {name}")
        preds[ENSEMBLE] = clip_score(cross_val_predict(make_stack(bench["ensembleMembers"]), X, y, cv=cv))
    scatter(y, preds[ENSEMBLE], approve, deny, args.out / "predicted_vs_actual.png")

    results = {name: matrix(y, p, approve) for name, p in preds.items()}
    fig, axes = plt.subplots(3, 3, figsize=(9, 9.6))
    for ax, (name, r) in zip(axes.flat, results.items()):
        draw_matrix(ax, np.array(r["matrix"]), name)
    fig.suptitle("Type I and Type II errors at the app's approve line", x=0.01, ha="left", fontsize=12, fontweight="bold")
    fig.text(0.01, 0.005, f"Out-of-fold predictions. Poor repayer: real score below {POOR_REPAYMENT:g}. Flagged: predicted score below {approve:g} (review or deny).",
             fontsize=8.5, color=INK_2)
    fig.tight_layout(rect=(0, 0.02, 1, 0.97))
    fig.savefig(args.out / "error_types.png", dpi=200)
    plt.close(fig)

    (args.out / "error_types.json").write_text(json.dumps(
        {"poorRepaymentBelow": POOR_REPAYMENT, "approveLine": approve,
         "layout": "[[good repayer: suggested approve, flagged], [poor repayer: suggested approve, flagged]]", "models": results}, indent=2))
    print(f"Saved figures to {args.out}")
