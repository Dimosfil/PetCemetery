[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$prototypeRoot = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $prototypeRoot '.venv-ai'
$runtime = Join-Path $prototypeRoot '.runtime\TripoSR'
$model = Join-Path $prototypeRoot '.model-cache\triposr-model'
$torchMcubes = Join-Path $runtime 'torchmcubes'
$pinnedRevision = '107cefdc244c39106fa830359024f6a2f1c78871'

$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if ($null -eq $uvCommand) {
    $userUv = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
    if (Test-Path -LiteralPath $userUv) {
        $uv = $userUv
    } else {
        throw 'uv is required. Install uv and run this setup again.'
    }
} else {
    $uv = $uvCommand.Source
}

if (-not (Test-Path -LiteralPath (Join-Path $venv 'Scripts\python.exe'))) {
    & $uv venv --python 3.11 $venv
}
$python = Join-Path $venv 'Scripts\python.exe'

& $uv pip install --python $python --index-url https://download.pytorch.org/whl/cu121 'torch==2.3.1' 'torchvision==0.18.1'
& $uv pip install --python $python 'numpy==1.26.4' 'Pillow==10.1.0' 'omegaconf==2.3.0' 'einops==0.7.0' 'transformers==4.35.0' 'trimesh==4.0.5' 'rembg[cpu]==2.0.69' 'huggingface-hub==0.36.0' 'scikit-image==0.24.0' 'imageio' 'xatlas==0.0.9' 'moderngl==5.10.0'

if (-not (Test-Path -LiteralPath (Join-Path $runtime '.git'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtime) | Out-Null
    & git clone https://github.com/VAST-AI-Research/TripoSR.git $runtime
}
& git -C $runtime checkout --detach $pinnedRevision

New-Item -ItemType Directory -Force -Path $torchMcubes | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'runtime-shims\torchmcubes\__init__.py') -Destination (Join-Path $torchMcubes '__init__.py') -Force

$env:HF_HOME = Join-Path $prototypeRoot '.model-cache\huggingface'
& $python (Join-Path $PSScriptRoot 'download_triposr.py') $model

& $python -c "import torch; assert torch.cuda.is_available(), 'CUDA GPU is unavailable'; print(torch.cuda.get_device_name(0))"
Write-Host "Local AI runtime is ready at $prototypeRoot"
