# Builds js/hawaii-coast.json: the main Hawaiian Islands' coastlines as
# clockwise-on-screen line rings, used by the map's shallow-water glow and
# chart water lines (augmentStyle() in js/app.js).
#
# Why a file and not the map tiles: tiles cut the ocean into squares, and any
# line offset from the tiled water polygons traces those cut edges as straight
# seams across the sea. Real coastline rings have no cut edges.
#
# Source: US Census cartographic boundary, cb_2023_us_state_500k (1:500,000):
#   https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_state_500k.zip
# Usage (needs: pip install pyshp shapely):
#   python3 tools/build-coast.py path/to/cb_2023_us_state_500k.shp js/hawaii-coast.json
# Then bump ?v= on "js/hawaii-coast.json" in js/app.js.
import sys, json, shapefile
from shapely.geometry import shape, LinearRing, LineString
shp, out = sys.argv[1], sys.argv[2]
r = shapefile.Reader(shp)
fields = [f[0] for f in r.fields[1:]]
geom = None
for sr in r.iterShapeRecords():
    rec = dict(zip(fields, sr.record))
    if rec['STUSPS'] == 'HI':
        geom = shape(sr.shape.__geo_interface__); break
polys = list(geom.geoms) if geom.geom_type == 'MultiPolygon' else [geom]
lines = []
for p in polys:
    if p.bounds[0] < -160.4: continue            # Northwestern Hawaiian Islands: off this map
    if p.area < 2e-6: continue                   # rocks and islets smaller than ~2 ha
    ring = LinearRing(p.exterior.coords)
    if not ring.is_ccw: ring = LinearRing(list(ring.coords)[::-1])   # counter-clockwise in lon/lat (y up) = clockwise on screen (y down), so the right-hand side is the sea
    ls = LineString(ring.coords).simplify(0.00025, preserve_topology=False)   # ~25 m
    lines.append([[round(x, 5), round(y, 5)] for x, y in ls.coords])
fc = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "MultiLineString", "coordinates": lines}}]}
json.dump(fc, open(out, 'w'), separators=(',', ':'))
print(len(lines), 'rings', sum(len(l) for l in lines), 'points')
