"""Independent OpenCascade check of ordered skirt cut profiles and extrusion.
Consumes synthetic ConstructionAssembly JSON. No downloads or application edits.
"""
import argparse
import json
import math
from pathlib import Path
import cadquery as cq


def audit(source: Path, target: Path):
    data = json.loads(source.read_text())
    rows = []
    for part in data['parts']:
        if part['kind'] not in ('skirt-board', 'skirt-support'):
            continue
        profile, vertices = part['profile'], part['vertices']
        n = len(profile)
        assert n >= 3 and len(vertices) == n * 2, part['id']
        delta = tuple(vertices[n][key] - vertices[0][key] for key in ('x', 'y', 'z'))
        thickness = math.sqrt(sum(v * v for v in delta))
        # Flat rails and upright studs rotate the same dressed 2x4 section.
        # Its extrusion normal can therefore be the 1.5-in or 3.5-in face.
        normal_sizes = ([part['dressed']['widthIn'], part['dressed']['depthIn']]
                        if part['kind'] == 'skirt-support' else [part['dressed']['depthIn']])
        assert any(abs(thickness * 12 - size) < 1e-7 for size in normal_sizes), part['id']
        first = profile[0]
        j = next(i for i, point in enumerate(profile) if abs(point['stationFt'] - first['stationFt']) > 1e-8)
        distance = profile[j]['stationFt'] - first['stationFt']
        unit = ((vertices[j]['x'] - vertices[0]['x']) / distance,
                (vertices[j]['y'] - vertices[0]['y']) / distance)
        assert abs(math.hypot(*unit) - 1) < 1e-7, part['id']
        for i, point in enumerate(profile):
            station = point['stationFt'] - first['stationFt']
            assert abs(vertices[i]['x'] - vertices[0]['x'] - station * unit[0]) < 1e-7
            assert abs(vertices[i]['y'] - vertices[0]['y'] - station * unit[1]) < 1e-7
            assert abs(vertices[i]['z'] - point['elevationFt']) < 1e-7
            assert all(abs(vertices[i+n][key] - vertices[i][key] - d) < 1e-7
                       for key, d in zip(('x', 'y', 'z'), delta))
        points = [(p['stationFt'], p['elevationFt']) for p in profile]
        area = abs(sum(x * points[(i+1) % n][1] - points[(i+1) % n][0] * z
                       for i, (x, z) in enumerate(points))) / 2
        solid = cq.Workplane('XY').polyline([(x*304.8, z*304.8) for x, z in points]).close().extrude(thickness*304.8).val()
        assert area > 1e-10 and solid.isValid() and len(solid.Solids()) == 1, part['id']
        expected = area * thickness * 304.8**3
        assert abs(solid.Volume() - expected) < max(1e-5, expected*1e-9), part['id']
        rows.append({'id': part['id'], 'profile_vertices': n, 'volume_cu_in': solid.Volume()/25.4**3})
    assert rows, 'Fixture does not exercise skirting profiles'
    result = {'source': source.name, 'cadquery_version': cq.__version__, 'profiles': len(rows),
              'ordered_world_faces': 'passed', 'valid_single_solids': len(rows), 'analytic_volumes': 'passed', 'parts': rows}
    target.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({key:value for key,value in result.items() if key != 'parts'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    audit(args.source, args.target)
