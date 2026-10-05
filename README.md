# Download stats

`downloads.csv` gets one row per release asset each day (00:00 in Vietnam):
the asset's total download count at that time, as GitHub reports it.
Downloads during a day = that day's total minus the previous day's.

Written by `.github/workflows/download-stats.yml` on main.
