$ErrorActionPreference = 'Stop'

Set-Location $PSScriptRoot

# Local dashcam videos
$env:RTSP_CAM_0 = Join-Path $PSScriptRoot 'accident.mp4'
$env:RTSP_CAM_1 = Join-Path $PSScriptRoot 'accident0.mp4'

# Astrakhan live HLS streams
$env:RTSP_CAM_2 = 'https://dvr5.astrakhan.ru/cam26hd/index.m3u8'
$env:RTSP_CAM_3 = 'https://dvr5.astrakhan.ru/boev-36-hd-1/index.m3u8'
$env:RTSP_CAM_4 = 'https://dvr5.astrakhan.ru/bogh-17-hd-1/index.m3u8'

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
