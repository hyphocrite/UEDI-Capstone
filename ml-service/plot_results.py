"""Draws the paper's figures from the benchmark: an AUC chart and confusion matrices.

    python benchmark.py --german --balance weights          # run these two first
    python benchmark.py --data data/sample_loans.csv --balance weights
    python plot_results.py

Writes to models/figures/:
  auc_comparison.png            each model's AUC on both datasets, mean ± 1 SD over 25 folds
  confusion_ensemble.png        the stacked ensemble's confusion matrix on both datasets
  confusion_all_<dataset>.png   all 9 models on one dataset

Confusion matrices use out-of-fold predictions from one 5-fold run (every loan is
predicted by a model that never saw it). The class-weighted models use a 50% cut-off.
The stacked ensemble's output is a calibrated chance of default, so 50% would be far too
strict; it flags a loan when that chance is above the dataset's bad-loan rate (30% for
German Credit, 23% for the sample), which is the same balance the class weights give the
other models. Counts are loans; the percentage is the share of that row.
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
from sklearn.metrics import confusion_matrix  # noqa: E402
from sklearn.model_selection import StratifiedKFold, cross_val_predict  # noqa: E402

from benchmark import GERMAN, load_german, load_uedi, models  # noqa: E402

HERE = Path(__file__).parent
INK, INK_2, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#ffffff"
HIGHLIGHT, MUTED = "#2a78d6", "#a9a8a3"
BLUES = ["#f3f8fe", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"]
ENSEMBLE = "Stacked ensemble (app)"
DATASETS = {"german_credit": "German Credit (1,000 real loans)", "sample_loans": "UEDI-shaped loans (3,000 sample)"}

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "text.color": INK, "axes.labelcolor": INK_2,
                     "xtick.color": INK_2, "ytick.color": INK, "axes.edgecolor": GRID, "figure.facecolor": SURFACE,
                     "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE})


def auc_chart(results: dict[str, list[dict]], out: Path):
    order = [r["model"] for r in sorted(results["german_credit"], key=lambda r: r["aucRoc"])]
    fig, axes = plt.subplots(1, 2, figsize=(10, 4.6), sharey=True)
    for ax, (key, rows) in zip(axes, results.items()):
        by = {r["model"]: r for r in rows}
        for i, name in enumerate(order):
            r = by[name]
            color = HIGHLIGHT if name == ENSEMBLE else MUTED
            ax.plot([r["aucRoc"] - r["aucRocSd"], r["aucRoc"] + r["aucRocSd"]], [i, i], color=color, lw=2, solid_capstyle="round")
            ax.plot(r["aucRoc"], i, "o", ms=8, color=color, mec=SURFACE, mew=2)
            ax.text(r["aucRoc"] + r["aucRocSd"] + 0.006, i, f"{r['aucRoc']:.3f}", va="center", fontsize=9,
                    color=INK if name == ENSEMBLE else INK_2, fontweight="bold" if name == ENSEMBLE else "normal")
        ax.set_title(DATASETS[key], loc="left", fontsize=11, color=INK, pad=10)
        ax.set_xlim(0.6, 0.86)
        ax.set_xlabel("AUC-ROC (higher is better)")
        ax.grid(axis="x", color=GRID, lw=1)
        ax.set_axisbelow(True)
        for side in ("top", "right", "left"):
            ax.spines[side].set_visible(False)
        ax.tick_params(axis="y", length=0)
    axes[0].set_yticks(range(len(order)), order)
    fig.suptitle("The stacked ensemble scores highest on both datasets", x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.text(0.01, 0.005, "Dot: mean over 25 test folds (5-fold CV repeated 5 times). Line: ± 1 standard deviation. Class weights for imbalance.",
             fontsize=8.5, color=INK_2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.97))
    fig.savefig(out, dpi=200)
    plt.close(fig)


def draw_matrix(ax, cm: np.ndarray, title: str, small: bool = False):
    share = cm / cm.sum(axis=1, keepdims=True)
    cmap = matplotlib.colors.LinearSegmentedColormap.from_list("blues", BLUES)
    ax.imshow(share, cmap=cmap, vmin=0, vmax=1)
    for (i, j), n in np.ndenumerate(cm):
        dark = share[i, j] > 0.55
        ax.text(j, i - (0 if small else 0.08), f"{n:,}", ha="center", va="center", fontsize=11 if small else 18,
                fontweight="bold", color=SURFACE if dark else INK)
        if not small:
            ax.text(j, i + 0.2, f"{share[i, j]:.0%} of row", ha="center", va="center", fontsize=9, color=SURFACE if dark else INK_2)
    ax.set_xticks([0, 1], ["Predicted\ngood", "Predicted\nbad"], fontsize=8 if small else 10)
    ax.set_yticks([0, 1], ["Actually\ngood", "Actually\nbad"], fontsize=8 if small else 10)
    ax.tick_params(length=0)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_title(title, fontsize=9.5 if small else 11, color=INK, pad=6)


def oof_predictions(X, y, balance: str) -> dict[str, np.ndarray]:
    pos_weight = float((y == 0).sum() / max((y == 1).sum(), 1))
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=7)
    preds = {}
    for name, est in models(pos_weight, weighted=balance == "weights").items():
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            p = cross_val_predict(est, X, y, cv=cv, method="predict_proba")[:, 1]
        preds[name] = (p >= (y.mean() if name == ENSEMBLE else 0.5)).astype(int)
        print(f"  {name}")
    return preds


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--balance", choices=["smote", "weights"], default="weights")
    parser.add_argument("--sample", type=Path, default=HERE / "data" / "sample_loans.csv")
    parser.add_argument("--out", type=Path, default=HERE / "models" / "figures")
    args = parser.parse_args()
    if args.balance == "smote":
        parser.error("Confusion matrices here use class weights; run with --balance weights.")
    args.out.mkdir(parents=True, exist_ok=True)

    results = {k: json.loads((HERE / "models" / f"benchmark_{k}_{args.balance}.json").read_text())["results"] for k in DATASETS}
    auc_chart(results, args.out / "auc_comparison.png")

    data = {"german_credit": load_german(GERMAN), "sample_loans": load_uedi(args.sample)}
    matrices: dict[str, dict[str, list]] = {}
    for key, (X, y) in data.items():
        print(f"Out-of-fold predictions for {key}:")
        preds = oof_predictions(X, y, args.balance)
        matrices[key] = {name: confusion_matrix(y, p, labels=[0, 1]).tolist() for name, p in preds.items()}
        fig, axes = plt.subplots(3, 3, figsize=(9, 9.6))
        for ax, (name, cm) in zip(axes.flat, matrices[key].items()):
            draw_matrix(ax, np.array(cm), name, small=True)
        fig.suptitle(f"Confusion matrices, {DATASETS[key]}", x=0.01, ha="left", fontsize=12, fontweight="bold")
        fig.text(0.01, 0.005, "Out-of-fold predictions. Cut-off 50%, except the ensemble: the bad-loan rate. Darker = larger share of the row.", fontsize=8.5, color=INK_2)
        fig.tight_layout(rect=(0, 0.02, 1, 0.97))
        fig.savefig(args.out / f"confusion_all_{key}.png", dpi=200)
        plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(9, 4.4))
    for ax, key in zip(axes, DATASETS):
        draw_matrix(ax, np.array(matrices[key][ENSEMBLE]), DATASETS[key])
    fig.suptitle("Stacked ensemble: confusion matrices", x=0.01, ha="left", fontsize=13, fontweight="bold")
    fig.text(0.01, 0.005, "Out-of-fold predictions (each loan scored by a model that never saw it). Flags a loan when its chance of default is above the dataset's bad-loan rate.", fontsize=8.5, color=INK_2)
    fig.tight_layout(rect=(0, 0.03, 1, 0.97))
    fig.savefig(args.out / "confusion_ensemble.png", dpi=200)
    plt.close(fig)

    (args.out / "confusion_matrices.json").write_text(json.dumps(
        {"cutoff": "0.5; stacked ensemble: the dataset's bad-loan rate", "layout": "[[actual good: predicted good, predicted bad], [actual bad: predicted good, predicted bad]]",
         "matrices": matrices}, indent=2))
    print(f"Saved figures to {args.out}")
