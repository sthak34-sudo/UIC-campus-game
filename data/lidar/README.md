# LiDAR building heights

`uic_lidar_heights.csv` has one row for each building footprint in and around UIC East Campus.

- **Heights:** measured from USGS 3DEP LiDAR point cloud `USGS_LPC_IL_4County_Cook_2017_LAS_2019`, read from the public AWS Entwine bucket. US government data, public domain.
- **Footprints, names, `stories_city` and `year_built_city`:** City of Chicago building footprints (GitHub copy, MIT license, Copyright (c) 2013 City of Chicago). Footprints were last edited in about 2010.
- **Height columns:**
  - `lidar_h98_m` is the 98th-percentile roof height above ground, in meters (the roof peak).
  - `lidar_h50_m` is the median (typical roof level).
- **Caveat:** the scan is from 2017, so buildings finished later (ARC 2019, CDRLC 2025) are missing or show the old site.

Generated on 2026-10-10 during planning research.
