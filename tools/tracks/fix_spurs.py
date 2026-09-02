"""Removes doubled-back spurs (the walker going up a dead end and returning) and resamples uniformly."""
import json, math, sys, glob

def fix(path):
    d = json.load(open(path))
    p = d['points']; w = d['widths']; n = len(p); sp = d['sampleSpacingM']
    removed = []
    i = 0
    keep = []
    while i < n:
        cut = None
        for j in range(i + 3, min(n, i + 30)):
            if math.dist(p[i][::2], p[j][::2]) < 5.0:
                cut = j
        if cut:
            removed.append((i, cut))
            keep.append(i)
            i = cut + 1
        else:
            keep.append(i)
            i += 1
    if not removed:
        return None
    pts = [p[k] for k in keep]; ws = [w[k] for k in keep]
    # uniform resample by arc length
    cum = [0.0]
    for a, b in zip(pts, pts[1:] + pts[:1]):
        cum.append(cum[-1] + math.dist(a, b))
    total = cum[-1]
    m = int(round(total / sp))
    out = []; outw = []
    for k in range(m):
        s = k * total / m
        idx = max(0, min(len(pts) - 1, next((q for q in range(len(cum) - 1) if cum[q + 1] > s), len(pts) - 1)))
        a = pts[idx]; b = pts[(idx + 1) % len(pts)]
        t = (s - cum[idx]) / max(1e-6, cum[idx + 1] - cum[idx])
        out.append([round(a[c] + (b[c] - a[c]) * t, 2) for c in range(3)])
        outw.append(ws[idx])
    old_len = n * sp
    for c in d['corners']:
        c['index'] = min(m - 1, int(round(c['index'] * m / n)))
    d['points'] = out; d['widths'] = outw; d['lengthM'] = round(total, 1)
    json.dump(d, open(path, 'w'), separators=(',', ':'))
    return (removed, old_len, total, m)

files = sys.argv[1:] or glob.glob('public/tracks/*.json')
for f in files:
    if f.endswith('index.json'):
        continue
    r = fix(f)
    print(f, 'fixed' if r else 'ok', r)
