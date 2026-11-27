"""Independent polygon / OpenCascade validation of synthetic assembly JSON.

Uses already installed CadQuery / OpenCascade. No downloads or customer media.
Input units are feet; CAD solids are millimetres. Optional STEP output is an
offline QA example, not an application STEP-export feature.
"""
import argparse
import json
import math
from pathlib import Path

import cadquery as cq


class PlanPolygon:
    def __init__(self, points):
        self.points = points
        self.bounds = (min(x for x, y in points), min(y for x, y in points),
                       max(x for x, y in points), max(y for x, y in points))
        wire = cq.Wire.makePolygon([(x * 304.8, y * 304.8, 0) for x, y in points], close=True)
        self.face = cq.Face.makeFromWires(wire)
        self.is_valid = self.face.isValid()
        self.area = self.face.Area() / 304.8 ** 2
        shoelace = abs(sum(x * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * y
                           for i, (x, y) in enumerate(points))) / 2
        assert abs(self.area - shoelace) < 1e-7, 'Polygon area disagrees with OpenCascade'

    def intersection_area(self, other):
        a, b = self.bounds, other.bounds
        if min(a[2], b[2]) - max(a[0], b[0]) < 1e-9 or min(a[3], b[3]) - max(a[1], b[1]) < 1e-9:
            return 0
        return self.face.intersect(other.face).Area() / 304.8 ** 2

    def distance(self, point):
        return self.face.distance(point) / 304.8


def check(path: Path, output: Path, step_output: Path | None = None):
    data = json.loads(path.read_text())
    parts = data['parts']
    assert len({p['id'] for p in parts}) == len(parts), 'Duplicate installed-part ID'
    assert len({c['id'] for c in data['connections']}) == len(data['connections']), 'Duplicate connection ID'
    shapes = {}
    for p in parts:
        poly = PlanPolygon([(v['x'], v['y']) for v in p['footprint']])
        assert poly.is_valid and poly.area > 1e-10, 'Invalid footprint: ' + p['id']
        assert all(math.isfinite(v) for v in [p['cutLengthFt'], p['zTop'], p['zBottom']])
        assert p['cutLengthFt'] > 0 and p['zTop'] > p['zBottom'], 'Non-positive part: ' + p['id']
        shapes[p['id']] = poly
    overlaps = []
    for tier in ('M', 'L'):
        same = [p for p in parts if p['tierId'] == tier]
        joists = [p for p in same if p['kind'] == 'joist']
        rims = [p for p in same if p['kind'] == 'rim']
        nailers = [p for p in same if p['kind'] == 'flat-nailer']
        finishes = [p for p in same if p['kind'] in ('field-board', 'picture-frame', 'breaker')]
        pairs = [(a, b) for a in joists for b in rims]
        pairs += [(a, b) for a in nailers for b in joists + rims]
        pairs += [(a, b) for i, a in enumerate(finishes) for b in finishes[i+1:]]
        for a, b in pairs:
            area = shapes[a['id']].intersection_area(shapes[b['id']])
            if area > 1e-7:
                overlaps.append({'a': a['id'], 'b': b['id'], 'area_sq_in': area * 144})
    known = {p['id']: p for p in parts}
    invalid_contacts = []
    for c in data['connections']:
        assert c['holePattern'] is None, 'Unverified drilling geometry was invented'
        assert all(ref in known for ref in c['partIds']), 'Connection references a missing part'
        if c['kind'] in ('deck-board-bearing', 'joist-to-beam'):
            point = cq.Vertex.makeVertex(c['point']['x'] * 304.8, c['point']['y'] * 304.8, 0)
            for ref in c['partIds']:
                if shapes[ref].distance(point) > 1e-6:
                    invalid_contacts.append({'connection': c['id'], 'part': ref,
                                             'offset_in': shapes[ref].distance(point) * 12})
    # Orthogonal constant-thickness members have independently constructible
    # solids. Pitched profiles/illustrative kit parts are not replaced by boxes.
    kinds = {'rim', 'joist', 'beam', 'flat-nailer', 'field-board', 'picture-frame', 'breaker', 'tread', 'riser', 'landing', 'footing'}
    solids = []
    checks = []
    mm_per_ft = 304.8
    for p in parts:
        if p['kind'] not in kinds or p.get('geometryStatus') != 'derived':
            continue
        height = (p['zTop'] - p['zBottom']) * mm_per_ft
        if p['kind'] == 'footing':
            radius = p['dressed']['widthIn'] * 25.4 / 2
            x, y = p['axis']['from']['x'] * mm_per_ft, p['axis']['from']['y'] * mm_per_ft
            solid = cq.Workplane('XY').center(x, y).circle(radius).extrude(height).translate((0, 0, p['zBottom'] * mm_per_ft)).val()
            expected = math.pi * radius * radius * height
        else:
            xy = [(v['x'] * mm_per_ft, v['y'] * mm_per_ft) for v in p['footprint']]
            solid = cq.Workplane('XY').polyline(xy).close().extrude(height).translate((0, 0, p['zBottom'] * mm_per_ft)).val()
            expected = shapes[p['id']].area * mm_per_ft ** 2 * height
        assert solid.isValid() and len(solid.Solids()) == 1, 'Invalid OpenCascade solid: ' + p['id']
        assert abs(solid.Volume() - expected) <= max(1e-5, expected * 1e-9), 'Independent volume mismatch: ' + p['id']
        solids.append(solid)
        checks.append({'id': p['id'], 'kind': p['kind'], 'volume_cu_in': solid.Volume() / 25.4 ** 3})
    assert solids, 'No independently validated solids'
    roundtrip = None
    if step_output:
        compound = cq.Compound.makeCompound(solids)
        cq.exporters.export(compound, str(step_output))
        restored = cq.importers.importStep(str(step_output)).val()
        assert restored.isValid() and len(restored.Solids()) == len(solids)
        assert abs(restored.Volume() - compound.Volume()) <= compound.Volume() * 1e-8
        roundtrip = {'solids': len(restored.Solids()), 'valid': True, 'volume_preserved': True}
    report = {'source': path.name, 'cadquery_version': cq.__version__, 'parts': len(parts),
              'connections': len(data['connections']), 'valid_polygons': len(shapes),
              'overlap_errors': overlaps, 'contact_errors': invalid_contacts,
              'validated_solids': len(solids), 'solid_volumes': checks, 'step_roundtrip': roundtrip}
    output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ('solid_volumes', 'overlap_errors', 'contact_errors')}, indent=2))
    assert not overlaps, f'{len(overlaps)} member overlap errors; see report'
    assert not invalid_contacts, f'{len(invalid_contacts)} off-member connection anchors; see report'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('input', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--step-output', type=Path)
    args = parser.parse_args()
    check(args.input, args.output, args.step_output)
