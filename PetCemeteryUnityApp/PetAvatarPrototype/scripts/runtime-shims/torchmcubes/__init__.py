"""CPU marching-cubes compatibility layer for TripoSR on Windows.

The upstream torchmcubes extension needs a local CUDA/C++ compiler. The
prototype only needs its marching_cubes entry point, so scikit-image provides a
deterministic CPU fallback while the neural inference still runs on CUDA.
"""

from __future__ import annotations

import numpy as np
import torch
from skimage.measure import marching_cubes as skimage_marching_cubes


def marching_cubes(volume: torch.Tensor, isolevel: float):
    device = volume.device
    vertices, faces, _, _ = skimage_marching_cubes(
        volume.detach().float().cpu().numpy().astype(np.float32),
        level=float(isolevel),
    )
    return (
        torch.from_numpy(vertices.copy()).to(device=device, dtype=torch.float32),
        torch.from_numpy(faces.astype(np.int64, copy=False).copy()).to(device=device),
    )
