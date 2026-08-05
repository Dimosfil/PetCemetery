[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$InputImage,
    [string]$OutputDirectory = 'artifacts\local-ai-run',
    [ValidateRange(128, 256)]
    [int]$MarchingCubesResolution = 192
)

$ErrorActionPreference = 'Stop'
$prototypeRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $prototypeRoot '.venv-ai\Scripts\python.exe'
$triposr = Join-Path $prototypeRoot '.runtime\TripoSR\run.py'
$model = Join-Path $prototypeRoot '.model-cache\triposr-model'

if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $triposr) -or -not (Test-Path -LiteralPath (Join-Path $model 'model.ckpt'))) {
    throw 'Local AI runtime is incomplete. Run scripts\setup-local-ai.ps1 first.'
}
$resolvedInput = (Resolve-Path -LiteralPath $InputImage).Path
$output = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))
New-Item -ItemType Directory -Force -Path $output | Out-Null

$env:HF_HOME = Join-Path $prototypeRoot '.model-cache\huggingface'
$env:U2NET_HOME = Join-Path $prototypeRoot '.model-cache\rembg'
$env:PYTORCH_CUDA_ALLOC_CONF = 'max_split_size_mb:128'

& $python $triposr $resolvedInput --pretrained-model-name-or-path $model --output-dir $output --device cuda:0 --chunk-size 512 --mc-resolution $MarchingCubesResolution --model-save-format glb
if ($LASTEXITCODE -ne 0) { throw "TripoSR failed with exit code $LASTEXITCODE" }

$staticMesh = Join-Path $output '0\mesh.glb'
$riggedMesh = Join-Path $output 'pet.glb'
$metadata = Join-Path $output 'avatar.json'
$preview = Join-Path $output 'preview.png'
& $python (Join-Path $PSScriptRoot 'rig_triposr_mesh.py') $staticMesh $riggedMesh --metadata $metadata
if ($LASTEXITCODE -ne 0) { throw "Auto-rigging failed with exit code $LASTEXITCODE" }
& $python (Join-Path $PSScriptRoot 'render_rigged_preview.py') $riggedMesh $preview
if ($LASTEXITCODE -ne 0) { throw "Preview rendering failed with exit code $LASTEXITCODE" }

Write-Host "Rigged Unity GLB: $riggedMesh"
Write-Host "Metadata: $metadata"
Write-Host "Preview: $preview"
