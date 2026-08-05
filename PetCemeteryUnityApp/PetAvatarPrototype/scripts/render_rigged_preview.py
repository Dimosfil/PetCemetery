from __future__ import annotations

import argparse
import io
import json
import math
import struct
from pathlib import Path
from urllib.parse import unquote

import numpy as np
import trimesh
from PIL import Image, ImageDraw


COMPONENT_DTYPES = {
    5121: np.dtype("u1"),
    5123: np.dtype("<u2"),
    5125: np.dtype("<u4"),
    5126: np.dtype("<f4"),
}
TYPE_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if len(data) < 28 or struct.unpack_from("<I", data, 0)[0] != 0x46546C67:
        raise ValueError(f"Not a GLB file: {path}")
    json_length = struct.unpack_from("<I", data, 12)[0]
    document = json.loads(data[20 : 20 + json_length])
    binary_header = 20 + json_length
    binary_length = struct.unpack_from("<I", data, binary_header)[0]
    binary_offset = binary_header + 8
    return document, data[binary_offset : binary_offset + binary_length]


def read_accessor(document: dict, binary: bytes, accessor_index: int) -> np.ndarray:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    dtype = COMPONENT_DTYPES[accessor["componentType"]]
    components = TYPE_COMPONENTS[accessor["type"]]
    count = accessor["count"]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    packed_size = dtype.itemsize * components
    stride = view.get("byteStride", packed_size)
    if stride == packed_size:
        values = np.frombuffer(binary, dtype=dtype, count=count * components, offset=offset)
        return values.reshape(count, components)
    values = np.empty((count, components), dtype=dtype)
    for index in range(count):
        values[index] = np.frombuffer(binary, dtype=dtype, count=components, offset=offset + index * stride)
    return values


def read_texture_colors(
    path: Path,
    document: dict,
    binary: bytes,
    primitive: dict,
    texcoords: np.ndarray,
) -> np.ndarray | None:
    material_index = primitive.get("material")
    if material_index is None:
        return None
    texture_info = (
        document.get("materials", [])[material_index]
        .get("pbrMetallicRoughness", {})
        .get("baseColorTexture")
    )
    if not texture_info:
        return None
    texture = document["textures"][texture_info["index"]]
    image_spec = document["images"][texture["source"]]
    if "uri" in image_spec and not image_spec["uri"].startswith("data:"):
        image = Image.open(path.parent / unquote(image_spec["uri"]))
    elif "bufferView" in image_spec:
        view = document["bufferViews"][image_spec["bufferView"]]
        start = view.get("byteOffset", 0)
        image = Image.open(io.BytesIO(binary[start : start + view["byteLength"]]))
    else:
        return None
    pixels = np.asarray(image.convert("RGB"), dtype=np.float64)
    height, width = pixels.shape[:2]
    x = np.clip(np.rint(texcoords[:, 0] * (width - 1)).astype(int), 0, width - 1)
    # glTF texture coordinates use the same top-left image orientation as the
    # decoded SF3D atlas. Flipping V samples the atlas' black unused space.
    y = np.clip(np.rint(texcoords[:, 1] * (height - 1)).astype(int), 0, height - 1)
    return pixels[y, x]


def load_glb_render_data(path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    document, binary = read_glb(path)
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    vertices = read_accessor(document, binary, attributes["POSITION"]).astype(np.float64)
    faces = read_accessor(document, binary, primitive["indices"]).reshape(-1, 3).astype(np.int64)
    colors = None
    if "COLOR_0" in attributes:
        colors = read_accessor(document, binary, attributes["COLOR_0"])
        if np.issubdtype(colors.dtype, np.integer):
            colors = colors.astype(np.float64) / np.iinfo(colors.dtype).max * 255.0
        else:
            colors = colors.astype(np.float64) * 255.0
    if colors is None and "TEXCOORD_0" in attributes:
        texcoords = read_accessor(document, binary, attributes["TEXCOORD_0"]).astype(np.float64)
        colors = read_texture_colors(path, document, binary, primitive, texcoords)
    if colors is None:
        colors = np.full((len(vertices), 3), 205.0)
    return vertices, faces, np.asarray(colors[:, :3], dtype=np.float64)


def load_render_data(input_path: Path) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if input_path.suffix.lower() == ".glb":
        return load_glb_render_data(input_path)
    mesh = trimesh.load(input_path, force="mesh", process=False)
    vertices = np.asarray(mesh.vertices, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    colors = getattr(mesh.visual, "vertex_colors", None)
    if colors is None or len(colors) != len(vertices):
        try:
            colors = mesh.visual.to_color().vertex_colors
        except (AttributeError, ValueError):
            colors = None
    if colors is None or len(colors) != len(vertices):
        colors = np.full((len(vertices), 3), 205.0)
    return vertices, faces, np.asarray(colors[:, :3], dtype=np.float64)


def render_preview(input_path: Path, output_path: Path) -> None:
    vertices, faces, colors = load_render_data(input_path)
    vertices -= (vertices.min(axis=0) + vertices.max(axis=0)) / 2.0

    angles = [0, 45, 90, 135, 180]
    width, height = 520, 520
    canvas = Image.new("RGB", (width * len(angles), height), (240, 241, 243))
    span = float(np.max(np.ptp(vertices, axis=0)))
    scale = min(width, height) * 0.80 / max(span, 1e-6)
    light = np.asarray([-0.35, 0.65, 0.68])
    light /= np.linalg.norm(light)

    for panel_index, degrees in enumerate(angles):
        angle = math.radians(degrees)
        rotation = np.asarray(
            [
                [math.cos(angle), 0.0, math.sin(angle)],
                [0.0, 1.0, 0.0],
                [-math.sin(angle), 0.0, math.cos(angle)],
            ]
        )
        rotated = vertices @ rotation.T
        points = np.column_stack(
            (rotated[:, 2] * scale + width / 2, -rotated[:, 1] * scale + height / 2)
        )
        triangles = rotated[faces]
        normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-9)
        shade = 0.58 + 0.42 * np.abs(normals @ light)
        face_colors = colors[faces].mean(axis=1) * shade[:, None]
        depth = triangles[:, :, 0].mean(axis=1)

        panel = Image.new("RGB", (width, height), (240, 241, 243))
        draw = ImageDraw.Draw(panel)
        for face_index in np.argsort(depth):
            polygon = [tuple(points[vertex]) for vertex in faces[face_index]]
            color = tuple(np.clip(face_colors[face_index], 0, 255).astype(np.uint8))
            draw.polygon(polygon, fill=color)
        draw.text((16, 14), f"{degrees} deg", fill=(30, 32, 36))
        canvas.paste(panel, (panel_index * width, 0))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    render_preview(args.input, args.output)
    print(args.output.resolve())


if __name__ == "__main__":
    main()
