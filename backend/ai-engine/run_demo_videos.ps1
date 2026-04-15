$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Camera sources are now defined in cameras.json — no RTSP_CAM_* env vars needed.
# To override the config path: $env:CAMERAS_CONFIG = 'path/to/cameras.json'

# Show live OpenCV preview windows
$env:SHOW_DISPLAY = 'true'

# Optional toggle: set to true if you want a clean incidents file every run.
if ($env:CLEAR_INCIDENTS_ON_START -eq 'true') {
    $incidentsFile = Join-Path $PSScriptRoot 'incidents.jsonl'
    if (Test-Path $incidentsFile) {
        Remove-Item $incidentsFile -Force
    }
}

python detect_video.py
