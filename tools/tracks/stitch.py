"""Stitch raw Overpass raceway ways into a single ordered loop of nodes."""
import re
import math
from collections import defaultdict, namedtuple

from geometry import make_projector

# "pit" is excluded EXCEPT when it is part of "pit straight" / "pit lane
# straight" -- several circuits (Silverstone's "National Pit Straight",
# many others' plain "Pit Straight") legitimately name their front
# straight that way; only the pit lane/road itself should be dropped.
DROP_NAME_RE = re.compile(r"pit(?!\s*(lane\s+)?straight)|paddock|kart|service|access|escape", re.I)
STRAIGHT_RE = re.compile(r"straight", re.I)
START_WAY_RE = re.compile(
    r"main straight|start|finish|home straight|pit straight|start\/finish", re.I
)

Edge = namedtuple("Edge", ["to", "way_id", "dist", "heading", "preferred"])


def _way_names(tags):
    return [v for k, v in tags.items() if k == "name" or k.startswith("name:")]


def filter_ways(elements, keep_way_ids=None):
    """Return (kept_ways, pit_ways) after applying the drop rules from spec
    step 1. `keep_way_ids` force-keeps specific way ids past the name-drop
    regex (see OVERRIDES in build_tracks.py for why a track needs this --
    e.g. a real corner literally named "Paddock Hill Bend")."""
    keep_way_ids = keep_way_ids or set()
    kept, pit = [], []
    for el in elements:
        if el.get("type") != "way":
            continue
        tags = el.get("tags", {})
        if tags.get("highway") != "raceway":
            continue
        names = _way_names(tags)
        if el["id"] not in keep_way_ids and any(DROP_NAME_RE.search(n) for n in names):
            pit.extend([el] if re.search(r"pit", " ".join(names), re.I) else [])
            continue
        if tags.get("area") == "yes":
            continue
        sport = tags.get("sport")
        if sport is not None and sport != "motor":
            continue
        if "geometry" not in el or len(el["geometry"]) < 2:
            continue
        kept.append(el)
    return kept, pit


def project_ways(ways, extra_ways=None):
    """Project every way's geometry to local meters (x=east, north). Returns
    (projector, ways_with_xy) where each way gets an 'xy' list added."""
    all_pts = []
    for w in ways + (extra_ways or []):
        all_pts.extend((p["lat"], p["lon"]) for p in w["geometry"])
    lat0 = sum(p[0] for p in all_pts) / len(all_pts)
    lon0 = sum(p[1] for p in all_pts) / len(all_pts)
    projector = make_projector(lat0, lon0)
    for w in ways + (extra_ways or []):
        w["xy"] = [projector(p["lat"], p["lon"]) for p in w["geometry"]]
    return projector, (lat0, lon0)


def _way_preferred(tags):
    return tags.get("sport") == "motor" and tags.get("surface") == "asphalt"


def build_graph(ways):
    """Build a directed multigraph on OSM node ids. Returns (node_xy, edges)
    where edges[node] = list[Edge]."""
    node_xy = {}
    edges = defaultdict(list)
    for w in ways:
        tags = w.get("tags", {})
        oneway = tags.get("oneway") == "yes"
        preferred = _way_preferred(tags)
        node_ids = w["nodes"]
        xy = w["xy"]
        for i in range(len(node_ids) - 1):
            a, b = node_ids[i], node_ids[i + 1]
            xa, ya = xy[i]
            xb, yb = xy[i + 1]
            node_xy[a] = (xa, ya)
            node_xy[b] = (xb, yb)
            dist = math.hypot(xb - xa, yb - ya)
            if dist < 1e-6:
                continue
            heading = math.atan2(yb - ya, xb - xa)
            edges[a].append(Edge(b, w["id"], dist, heading, preferred))
            if not oneway:
                edges[b].append(Edge(a, w["id"], dist, heading + math.pi, preferred))
    return node_xy, edges


def find_start_node(ways):
    """Pick a start node: first node of a way whose name matches the
    start/finish regex, else first node of the longest way."""
    named = [w for w in ways if any(START_WAY_RE.search(n) for n in _way_names(w.get("tags", {})))]
    if named:
        named.sort(key=lambda w: -_way_length(w))
        return named[0]["nodes"][0]
    longest = max(ways, key=_way_length)
    return longest["nodes"][0]


def _way_length(w):
    xy = w["xy"]
    return sum(math.hypot(xy[i + 1][0] - xy[i][0], xy[i + 1][1] - xy[i][1]) for i in range(len(xy) - 1))


def _score_edge(edge, cur_heading):
    dh = abs(((edge.heading - cur_heading) + math.pi) % (2 * math.pi) - math.pi)
    return (0 if edge.preferred else 1, dh)


def _greedy_walk(edges, start_node):
    """Greedy walk following the preference rules. Returns list of node ids
    (loop, start repeated at end) or None if it dead-ends without closing."""
    used = set()
    path = [start_node]
    cur = start_node
    cur_heading = None
    for _ in range(20000):
        candidates = [e for e in edges.get(cur, []) if (cur, e.to, e.way_id) not in used]
        if not candidates:
            return None
        if cur_heading is None:
            candidates.sort(key=lambda e: (0 if e.preferred else 1, -e.dist))
            best = candidates[0]
        else:
            best = min(candidates, key=lambda e: _score_edge(e, cur_heading))
        used.add((cur, best.to, best.way_id))
        cur_heading = best.heading
        cur = best.to
        path.append(cur)
        if cur == start_node:
            return path
    return None


def _path_length(path, node_xy):
    total = 0.0
    for i in range(len(path) - 1):
        ax, ay = node_xy[path[i]]
        bx, by = node_xy[path[i + 1]]
        total += math.hypot(bx - ax, by - ay)
    return total


def _dfs_search(edges, node_xy, start_node, real_length, tol, max_branch_tries=3, max_results=25):
    """Depth-limited DFS exploring alternative branch choices when the greedy
    walk doesn't land within tolerance of the known real length."""
    results = []
    max_len = real_length * (1 + tol) * 1.3
    stack = [(start_node, [start_node], set(), None, 0.0)]
    steps = 0
    while stack and steps < 300000 and len(results) < max_results:
        steps += 1
        cur, path, used, cur_heading, length_so_far = stack.pop()
        if length_so_far > max_len:
            continue
        candidates = [e for e in edges.get(cur, []) if (cur, e.to, e.way_id) not in used]
        if cur_heading is None:
            candidates.sort(key=lambda e: (0 if e.preferred else 1, -e.dist))
        else:
            candidates.sort(key=lambda e: _score_edge(e, cur_heading))
        for e in candidates[:max_branch_tries]:
            new_len = length_so_far + e.dist
            if e.to == start_node and len(path) > 3:
                results.append(path + [e.to])
                continue
            if new_len > max_len:
                continue
            new_used = used | {(cur, e.to, e.way_id)}
            stack.append((e.to, path + [e.to], new_used, e.heading, new_len))
    return results


def find_loop(ways, node_xy, edges, real_length, tol=0.15):
    """Find the closed loop matching real_length within tol. Falls back to a
    depth-limited DFS over branch decisions if the greedy walk fails. Raises
    if nothing found is within tolerance -- callers must not silently ship
    a loop that doesn't match the known real lap length."""
    start_node = find_start_node(ways)
    greedy = _greedy_walk(edges, start_node)
    best_path, best_len = None, None
    if greedy is not None:
        glen = _path_length(greedy, node_xy)
        if abs(glen - real_length) / real_length <= tol:
            return greedy, glen
        best_path, best_len = greedy, glen

    candidates = _dfs_search(edges, node_xy, start_node, real_length, tol)
    for p in candidates:
        plen = _path_length(p, node_xy)
        if best_len is None or abs(plen - real_length) < abs(best_len - real_length):
            best_path, best_len = p, plen

    if best_path is not None and abs(best_len - real_length) / real_length <= tol:
        return best_path, best_len

    if best_path is None:
        raise RuntimeError("Could not find a closed loop from the filtered ways")
    diff_pct = (best_len - real_length) / real_length * 100
    raise RuntimeError(
        f"best loop found ({best_len:.0f}m) is {diff_pct:+.1f}% off the real "
        f"length ({real_length}m), outside the {tol*100:.0f}% tolerance"
    )


def extract_corners(ways, loop_node_set):
    """Return list of dicts {name, number, way, mid_xy} for named non-straight
    corner ways that touch the loop."""
    corners = []
    for w in ways:
        tags = w.get("tags", {})
        corner_num = tags.get("raceway:corner_number")
        name = tags.get("name:en") or tags.get("name")
        if not corner_num and (not name or STRAIGHT_RE.search(name)):
            continue
        if not any(n in loop_node_set for n in w["nodes"]):
            continue
        xy = w["xy"]
        mid = xy[len(xy) // 2]
        corners.append(
            {
                "name": name or f"Corner {corner_num}",
                "number": int(corner_num) if corner_num and str(corner_num).isdigit() else None,
                "mid_xy": mid,
            }
        )
    return corners


def dominant_width(ways):
    from collections import Counter

    widths = []
    for w in ways:
        wv = w.get("tags", {}).get("width")
        if wv:
            try:
                widths.append(round(float(wv)))
            except ValueError:
                pass
    if not widths:
        return None
    return Counter(widths).most_common(1)[0][0]
