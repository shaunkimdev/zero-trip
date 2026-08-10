# Third-party data notice

## Seoul administrative boundaries

- Dataset: `kostat/2013/json/seoul_municipalities_geo_simple.json`
- Repository: https://github.com/southkorea/seoul-maps
- Original source documented by the repository: KOSTAT administrative division geodata for Census (2013)
- License: Apache License 2.0
- Local file: `src/data/seoul-gu.geojson`
- Use in ZERO TRIP: projected to an aspect-preserving local SVG coordinate system and sampled as a uniform point grid at runtime. The source polygons are not drawn as filled areas or outlines.

The bundled boundary is suitable for this product demo. A production data pipeline should replace it with a current official SGIS/JUSO snapshot while retaining source and license attribution.
