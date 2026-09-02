"""Preview PNG generation: top-down loop + elevation profile."""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def plot_track(out_path, track_id, name, points, corners, start_index, direction):
    xs = np.array([p[0] for p in points])
    # plot north (= -z) on the vertical axis so the preview reads north-up,
    # matching how the real circuit layout is normally drawn.
    norths = np.array([-p[2] for p in points])
    ys = np.array([p[1] for p in points])
    dist = np.concatenate([[0], np.cumsum(np.hypot(np.diff(np.append(xs, xs[0])), np.diff(np.append(norths, norths[0]))))])[:-1]

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 12), gridspec_kw={"height_ratios": [3, 1]})

    ax1.plot(xs, norths, "-", color="#333333", linewidth=1.5)
    ax1.plot([xs[-1], xs[0]], [norths[-1], norths[0]], "-", color="#333333", linewidth=1.5)
    ax1.set_aspect("equal")
    ax1.set_title(f"{name} ({direction})")
    ax1.set_xlabel("x (m, east)")
    ax1.set_ylabel("north (m)")

    si = start_index
    dx = xs[(si + 3) % len(xs)] - xs[si]
    dn = norths[(si + 3) % len(norths)] - norths[si]
    ax1.annotate(
        "",
        xy=(xs[si] + dx * 3, norths[si] + dn * 3),
        xytext=(xs[si], norths[si]),
        arrowprops=dict(facecolor="red", edgecolor="red", width=2, headwidth=8),
    )
    ax1.plot(xs[si], norths[si], "o", color="red", markersize=6)

    for c in corners:
        idx = c["index"]
        ax1.annotate(c["name"], (xs[idx], norths[idx]), fontsize=6, alpha=0.8)
        ax1.plot(xs[idx], norths[idx], ".", color="blue", markersize=3)

    ax2.plot(dist, ys, "-", color="#0066cc")
    ax2.set_xlabel("distance along lap (m)")
    ax2.set_ylabel("elevation (m)")
    ax2.set_title("Elevation profile")

    fig.suptitle(f"{track_id}")
    fig.tight_layout()
    fig.savefig(out_path, dpi=110)
    plt.close(fig)
