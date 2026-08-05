"""Run the local research-licensed BITE runtime and emit the avatar provider contract."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def activate_conda_dll_search() -> None:
    """Make direct env/python.exe launches behave like `conda run` on Windows."""
    prefix = Path(sys.prefix)
    runtime_dirs = [
        prefix,
        prefix / "Library" / "mingw-w64" / "bin",
        prefix / "Library" / "usr" / "bin",
        prefix / "Library" / "bin",
        prefix / "Scripts",
    ]
    os.environ["PATH"] = os.pathsep.join(str(path) for path in runtime_dirs) + os.pathsep + os.environ.get("PATH", "")


activate_conda_dll_search()

import numpy as np
import cv2
import trimesh
from PIL import Image
from scipy.spatial import cKDTree


PROTOTYPE_ROOT = Path(__file__).resolve().parents[1]
BITE_ROOT = PROTOTYPE_ROOT / ".runtime" / "BITEGradio"
sys.path.insert(0, str(PROTOTYPE_ROOT / "scripts"))
sys.path.insert(0, str(BITE_ROOT / "scripts"))
sys.path.insert(0, str(BITE_ROOT / "src"))

from render_rigged_preview import render_preview  # noqa: E402
from rig_triposr_mesh import build_glb  # noqa: E402


def prepare_bite_image(source: Image.Image, size: int = 256) -> np.ndarray:
    pixels = np.asarray(source.convert("RGB"), dtype=np.uint8)
    height, width = pixels.shape[:2]
    extent = max(height, width)
    padded = np.zeros((extent, extent, 3), dtype=np.uint8)
    top = (extent - height) // 2
    left = (extent - width) // 2
    padded[top : top + height, left : left + width] = pixels
    return cv2.resize(padded, (size, size), interpolation=cv2.INTER_LINEAR)


def sample_image(image: np.ndarray, coordinates: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    height, width = image.shape[:2]
    x = coordinates[:, 0]
    y = coordinates[:, 1]
    valid = (x >= 0) & (x <= width - 1) & (y >= 0) & (y <= height - 1)
    x0 = np.clip(np.floor(x).astype(np.int64), 0, width - 1)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, height - 1)
    x1 = np.clip(x0 + 1, 0, width - 1)
    y1 = np.clip(y0 + 1, 0, height - 1)
    wx = (x - x0)[:, None]
    wy = (y - y0)[:, None]
    top = image[y0, x0] * (1.0 - wx) + image[y0, x1] * wx
    bottom = image[y1, x0] * (1.0 - wx) + image[y1, x1] * wx
    return top * (1.0 - wy) + bottom * wy, valid


def isolate_dog_foreground(mask: np.ndarray) -> np.ndarray:
    """Keep the main dog silhouette and reject disconnected people/background."""
    values = np.asarray(mask, dtype=np.float32)
    binary = np.uint8(values > 0.5)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    if count <= 1:
        raise ValueError("BITE foreground mask does not contain a dog component")
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    isolated = np.where(labels == largest, values, 0.0)
    return cv2.erode(isolated, np.ones((3, 3), dtype=np.uint8), iterations=1)


def mirror_hidden_vertex_colors(
    vertices: np.ndarray,
    colors: np.ndarray,
    visible: np.ndarray,
) -> np.ndarray:
    visible_indices = np.flatnonzero(visible)
    if len(visible_indices) == 0:
        raise ValueError("BITE projection did not expose any visible mesh vertices")
    hidden_indices = np.flatnonzero(~visible)
    if len(hidden_indices) == 0:
        return colors
    tree = cKDTree(vertices[visible_indices])
    mirrored = vertices[hidden_indices].copy()
    # Raw SMAL coordinates are X body-length, Y lateral, Z up. Reflect the
    # hidden side across the animal's sagittal plane; flipping X would swap
    # head and tail and smear facial markings across the torso.
    mirrored[:, 1] *= -1.0
    _, nearest = tree.query(mirrored, k=1)
    result = colors.copy()
    result[hidden_indices] = colors[visible_indices[nearest]]
    return result


def rasterize_uv_texture(
    texcoords: np.ndarray,
    faces: np.ndarray,
    colors: np.ndarray,
    size: int = 1024,
) -> np.ndarray:
    texture = np.zeros((size, size, 3), dtype=np.float32)
    coverage = np.zeros((size, size), dtype=bool)
    pixels = np.column_stack(
        (texcoords[:, 0] * (size - 1), (1.0 - texcoords[:, 1]) * (size - 1))
    )
    for face in faces:
        triangle = pixels[face]
        minimum = np.maximum(np.floor(triangle.min(axis=0)).astype(int), 0)
        maximum = np.minimum(np.ceil(triangle.max(axis=0)).astype(int), size - 1)
        if np.any(maximum < minimum):
            continue
        xx, yy = np.meshgrid(
            np.arange(minimum[0], maximum[0] + 1),
            np.arange(minimum[1], maximum[1] + 1),
        )
        p0, p1, p2 = triangle
        denominator = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1])
        if abs(denominator) < 1e-8:
            continue
        w0 = ((p1[1] - p2[1]) * (xx - p2[0]) + (p2[0] - p1[0]) * (yy - p2[1])) / denominator
        w1 = ((p2[1] - p0[1]) * (xx - p2[0]) + (p0[0] - p2[0]) * (yy - p2[1])) / denominator
        w2 = 1.0 - w0 - w1
        inside = (w0 >= -1e-5) & (w1 >= -1e-5) & (w2 >= -1e-5)
        if not np.any(inside):
            continue
        shaded = (
            w0[..., None] * colors[face[0]]
            + w1[..., None] * colors[face[1]]
            + w2[..., None] * colors[face[2]]
        )
        region = texture[minimum[1] : maximum[1] + 1, minimum[0] : maximum[0] + 1]
        region_coverage = coverage[minimum[1] : maximum[1] + 1, minimum[0] : maximum[0] + 1]
        region[inside] = shaded[inside]
        region_coverage[inside] = True

    if not np.any(coverage):
        raise ValueError("UV rasterizer produced an empty albedo")
    _, nearest = cv2.distanceTransformWithLabels(
        (~coverage).astype(np.uint8),
        cv2.DIST_L2,
        5,
        labelType=cv2.DIST_LABEL_PIXEL,
    )
    # OpenCV labels are one-based indices into zero pixels of the input mask.
    source_pixels = np.argwhere(coverage)
    labels = np.clip(nearest.astype(np.int64) - 1, 0, len(source_pixels) - 1)
    missing = ~coverage
    texture[missing] = texture[source_pixels[labels[missing], 0], source_pixels[labels[missing], 1]]
    return np.clip(texture, 0, 255).astype(np.uint8)


def run(request_path: Path) -> dict:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    if request.get("licenseMode") != "research":
        raise ValueError("This adapter is restricted to BITE research mode")
    photos = [Path(value).resolve() for value in request.get("photos", [])]
    if not photos:
        raise ValueError("BITE request contains no photos")
    if not BITE_ROOT.is_dir():
        raise FileNotFoundError(f"BITE runtime not found: {BITE_ROOT}")

    output_dir = Path(request["outputDirectory"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    texture_dir = output_dir / "textures"
    texture_dir.mkdir(parents=True, exist_ok=True)

    previous_cwd = Path.cwd()
    try:
        os.chdir(BITE_ROOT)
        import gradio_demo

        source = Image.open(photos[0]).convert("RGB")
        source_pixels = np.array(source, copy=True)
        inference = gradio_demo.run_bite_inference(
            source_pixels,
            bbox=None,
            apply_ttopt=False,
            dog_name=f"provider_{request['jobId']}",
            return_details=True,
        )
    finally:
        os.chdir(previous_cwd)

    mesh = trimesh.Trimesh(
        vertices=np.asarray(inference["neutral_vertices"], dtype=np.float32),
        faces=np.asarray(inference["faces"], dtype=np.int64),
        process=False,
        maintain_order=True,
    )
    glb, mesh_stats, atlas = build_glb(
        mesh,
        target_height=0.65,
        coordinate_system="bite",
        return_atlas=True,
    )
    (output_dir / "pet.glb").write_bytes(glb)
    bite_input = np.asarray(inference["prepared_image"], dtype=np.uint8)
    projected_colors, inside_image = sample_image(
        bite_input,
        np.asarray(inference["projected_vertices"], dtype=np.float32),
    )
    dog_foreground = isolate_dog_foreground(inference["foreground_mask"])
    foreground, inside_mask = sample_image(
        dog_foreground[..., None],
        np.asarray(inference["projected_vertices"], dtype=np.float32),
    )
    visible = np.asarray(inference["vertex_visibility"], dtype=np.float32) > 0.5
    visible &= inside_image
    visible &= inside_mask
    visible &= foreground[:, 0] > 0.5
    source_vertices = np.asarray(mesh.vertices, dtype=np.float32)
    source_colors = mirror_hidden_vertex_colors(source_vertices, projected_colors, visible)
    atlas_colors = source_colors[atlas["vertex_mapping"]]
    albedo = rasterize_uv_texture(
        atlas["texcoords"],
        atlas["faces"],
        atlas_colors,
    )
    Image.fromarray(albedo, mode="RGB").save(texture_dir / "albedo.png", optimize=True)
    render_preview(output_dir / "pet.glb", output_dir / "preview.png")

    avatar = {
        **mesh_stats,
        "provider": "bite-d-smal",
        "sourcePhotoCount": len(photos),
        "canonicalPose": "neutral-standing",
        "geometryConfidence": 0.0,
        "geometryConfidenceCalibrated": False,
        "topology": "smal-3889-xatlas-seams-v1",
        "skeleton": "prototype-dog-v1-geometric",
        "coordinateMapping": "smal-x-length-y-lateral-z-up_to_unity-x-lateral-y-up-z-length",
        "textureProjection": "single-view-largest-foreground-plus-sagittal-fill-v4",
        "licenseMode": "research",
        "limitations": [
            "Research-only BITE/D-SMAL runtime; not approved for commercial deployment.",
            "Body shape currently uses the first photo and is reposed to neutral standing; multi-view fitting is not implemented.",
            "The visible coat is projected from the segmented foreground of one photo; hidden surfaces use bilateral nearest-neighbour fill.",
            "Rig weights are geometric prototype weights rather than native SMAL skin weights.",
        ],
    }
    (output_dir / "avatar.json").write_text(
        json.dumps(avatar, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    result = {
        "jobId": request["jobId"],
        "model": str((output_dir / "pet.glb").resolve()),
        "preview": str((output_dir / "preview.png").resolve()),
        "vertices": avatar["vertices"],
        "triangles": avatar["triangles"],
        "uvMapped": True,
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(run(args.request), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
