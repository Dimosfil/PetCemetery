"""Convert a TripoSR vertex-colour mesh to the prototype's rigged Unity GLB.

The conversion is intentionally dog-specific. It maps TripoSR's X-up output to
the prototype's Y-up coordinate system, fits the shared 14-bone skeleton, and
assigns deterministic geometric skin weights. It is a prototype auto-rigger,
not a replacement for an anatomy-aware production rigging model.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path

import numpy as np
import trimesh
import xatlas
from PIL import Image


ARRAY_BUFFER = 34962
ELEMENT_ARRAY_BUFFER = 34963
FLOAT = 5126
UNSIGNED_SHORT = 5123


def quaternion_y(degrees: float) -> list[float]:
    radians = math.radians(degrees)
    return [0.0, math.sin(radians / 2.0), 0.0, math.cos(radians / 2.0)]


def normalize_mesh(
    mesh: trimesh.Trimesh,
    target_height: float,
    coordinate_system: str = "triposr",
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    source = np.asarray(mesh.vertices, dtype=np.float32)
    source_normals = np.asarray(mesh.vertex_normals, dtype=np.float32)
    if coordinate_system == "triposr":
        # TripoSR: X up, Y image-horizontal, Z depth. Prototype/Unity: Y up,
        # X lateral, Z longitudinal with the head facing +Z.
        positions = np.column_stack((source[:, 2], source[:, 0], -source[:, 1])).astype(np.float32)
        normals = np.column_stack((source_normals[:, 2], source_normals[:, 0], -source_normals[:, 1])).astype(np.float32)
    elif coordinate_system == "bite":
        # Raw SMAL/BITE vertices use X along the body, Y laterally, and Z up.
        # The prototype/Unity contract is X lateral, Y up, Z along the body.
        # Keep this cyclic permutation right-handed so face winding and normals
        # remain valid, with the head continuing to face +Z.
        positions = np.column_stack((source[:, 1], source[:, 2], source[:, 0])).astype(np.float32)
        normals = np.column_stack(
            (source_normals[:, 1], source_normals[:, 2], source_normals[:, 0])
        ).astype(np.float32)
    else:
        raise ValueError(f"Unsupported coordinate system: {coordinate_system}")
    positions[:, 0] -= (positions[:, 0].min() + positions[:, 0].max()) / 2.0
    positions[:, 2] -= (positions[:, 2].min() + positions[:, 2].max()) / 2.0
    positions[:, 1] -= positions[:, 1].min()
    source_height = float(np.ptp(positions[:, 1]))
    if source_height <= 1e-6:
        raise ValueError("Input mesh has no measurable height")
    positions *= target_height / source_height

    normal_lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    normals /= np.maximum(normal_lengths, 1e-8)

    vertex_colors = getattr(mesh.visual, "vertex_colors", None)
    if vertex_colors is None or len(vertex_colors) != len(positions):
        colors = np.ones((len(positions), 4), dtype=np.float32)
    else:
        colors = np.asarray(vertex_colors, dtype=np.float32)
        if colors.shape[1] == 3:
            colors = np.column_stack((colors, np.full(len(colors), 255.0, dtype=np.float32)))
        colors = colors[:, :4] / 255.0
    return positions, normals, colors.astype(np.float32)


def build_skeleton(positions: np.ndarray) -> tuple[list[dict], np.ndarray]:
    minimum = positions.min(axis=0)
    maximum = positions.max(axis=0)
    width, height, length = maximum - minimum
    body_y = height * 0.55
    body_z = -length * 0.02
    lateral = width * 0.29

    bones = [
        {"name": "Root", "parent": None, "translation": [0.0, 0.0, 0.0]},
        {"name": "Body", "parent": 0, "translation": [0.0, body_y, body_z]},
        {"name": "Neck", "parent": 1, "translation": [0.0, height * 0.18, length * 0.28]},
        {"name": "Head", "parent": 2, "translation": [0.0, height * 0.10, length * 0.18]},
        {"name": "Tail", "parent": 1, "translation": [0.0, height * 0.07, -length * 0.38]},
        {"name": "TailTip", "parent": 4, "translation": [0.0, 0.0, -length * 0.22]},
        {"name": "FrontLeftUpper", "parent": 1, "translation": [-lateral, -height * 0.27, length * 0.23]},
        {"name": "FrontLeftLower", "parent": 6, "translation": [0.0, -height * 0.27, 0.0]},
        {"name": "FrontRightUpper", "parent": 1, "translation": [lateral, -height * 0.27, length * 0.23]},
        {"name": "FrontRightLower", "parent": 8, "translation": [0.0, -height * 0.27, 0.0]},
        {"name": "BackLeftUpper", "parent": 1, "translation": [-lateral, -height * 0.27, -length * 0.20]},
        {"name": "BackLeftLower", "parent": 10, "translation": [0.0, -height * 0.27, 0.0]},
        {"name": "BackRightUpper", "parent": 1, "translation": [lateral, -height * 0.27, -length * 0.20]},
        {"name": "BackRightLower", "parent": 12, "translation": [0.0, -height * 0.27, 0.0]},
    ]

    global_positions = np.zeros((len(bones), 3), dtype=np.float32)
    for index, bone in enumerate(bones):
        local = np.asarray(bone["translation"], dtype=np.float32)
        parent = bone["parent"]
        global_positions[index] = local if parent is None else global_positions[parent] + local
    return bones, global_positions


def assign_skin_weights(positions: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    minimum = positions.min(axis=0)
    maximum = positions.max(axis=0)
    width, height, length = maximum - minimum
    joints = np.zeros((len(positions), 4), dtype=np.uint16)
    weights = np.zeros((len(positions), 4), dtype=np.float32)
    joints[:, 0] = 1
    weights[:, 0] = 1.0

    leg_centres = [
        (-width * 0.29, length * 0.21, 6, 7),
        (width * 0.29, length * 0.21, 8, 9),
        (-width * 0.29, -length * 0.19, 10, 11),
        (width * 0.29, -length * 0.19, 12, 13),
    ]

    for index, (x, y, z) in enumerate(positions):
        # Head/neck are checked before legs so the low muzzle stays with Head.
        if z > length * 0.29:
            joints[index, 0] = 3
            weights[index, 0] = 1.0
            continue
        if z > length * 0.15 and y > height * 0.43:
            blend = min(1.0, max(0.0, (z - length * 0.15) / (length * 0.14)))
            joints[index, :2] = (2, 3)
            weights[index, :2] = (1.0 - blend, blend)
            continue
        if z < -length * 0.27 and y > height * 0.34:
            tip_blend = min(1.0, max(0.0, (-z - length * 0.27) / (length * 0.08)))
            joints[index, :2] = (4, 5)
            weights[index, :2] = (1.0 - tip_blend, tip_blend)
            continue

        if y < height * 0.52:
            scaled_distances = [
                ((x - leg_x) / max(width, 1e-6)) ** 2 + ((z - leg_z) / max(length, 1e-6)) ** 2
                for leg_x, leg_z, _, _ in leg_centres
            ]
            leg_index = int(np.argmin(scaled_distances))
            _, _, upper, lower = leg_centres[leg_index]
            if y < height * 0.27:
                joints[index, 0] = lower
                weights[index, 0] = 1.0
            else:
                upper_blend = min(1.0, max(0.0, (height * 0.52 - y) / (height * 0.25)))
                joints[index, :2] = (upper, 1)
                weights[index, :2] = (upper_blend, 1.0 - upper_blend)
    # A single-view mesh can collapse a far lower leg into its upper segment.
    # Preserve the shared rig contract by splitting the lowest part of every
    # detected upper-leg region when that lower bone has no reconstructed area.
    for _, _, upper, lower in leg_centres:
        has_lower = np.any((joints == lower) & (weights > 0.0))
        if has_lower:
            continue
        upper_vertices = np.flatnonzero((joints[:, 0] == upper) & (weights[:, 0] > 0.0))
        if len(upper_vertices) == 0:
            continue
        split_count = max(1, int(math.ceil(len(upper_vertices) * 0.22)))
        split = upper_vertices[np.argsort(positions[upper_vertices, 1])[:split_count]]
        joints[split, :] = 0
        weights[split, :] = 0.0
        joints[split, 0] = lower
        weights[split, 0] = 1.0
    return joints, weights


class BufferBuilder:
    def __init__(self) -> None:
        self.data = bytearray()
        self.views: list[dict] = []

    def append(self, array: np.ndarray, target: int | None = None) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        raw = np.ascontiguousarray(array).tobytes()
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(raw)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        self.data.extend(raw)
        return len(self.views) - 1


def inverse_bind_matrices(global_positions: np.ndarray) -> np.ndarray:
    matrices = np.repeat(np.eye(4, dtype=np.float32)[None, :, :], len(global_positions), axis=0)
    matrices[:, :3, 3] = -global_positions
    # glTF matrices are serialized column-major.
    return matrices.transpose(0, 2, 1).reshape(-1).astype(np.float32)


def build_glb(
    mesh: trimesh.Trimesh,
    target_height: float,
    coordinate_system: str = "triposr",
    return_atlas: bool = False,
) -> tuple:
    positions, normals, colors = normalize_mesh(mesh, target_height, coordinate_system)
    faces = np.asarray(mesh.faces, dtype=np.uint32)
    bones, global_positions = build_skeleton(positions)
    joints, weights = assign_skin_weights(positions)

    vertex_mapping, atlas_faces, texcoords = xatlas.parametrize(positions, faces)
    positions = positions[vertex_mapping]
    normals = normals[vertex_mapping]
    colors = colors[vertex_mapping]
    joints = joints[vertex_mapping]
    weights = weights[vertex_mapping]
    texcoords = np.asarray(texcoords, dtype=np.float32)
    if len(positions) > np.iinfo(np.uint16).max:
        raise ValueError(f"UV mesh has {len(positions)} vertices; prototype GLB profile supports at most 65535")
    indices = np.asarray(atlas_faces, dtype=np.uint16).reshape(-1)

    builder = BufferBuilder()
    position_view = builder.append(positions.astype(np.float32), ARRAY_BUFFER)
    normal_view = builder.append(normals.astype(np.float32), ARRAY_BUFFER)
    color_view = builder.append(colors.astype(np.float32), ARRAY_BUFFER)
    texcoord_view = builder.append(texcoords, ARRAY_BUFFER)
    joints_view = builder.append(joints, ARRAY_BUFFER)
    weights_view = builder.append(weights, ARRAY_BUFFER)
    index_view = builder.append(indices, ELEMENT_ARRAY_BUFFER)
    bind_view = builder.append(inverse_bind_matrices(global_positions))
    times = np.asarray([0.0, 0.5, 1.0], dtype=np.float32)
    rotations = np.asarray([quaternion_y(-16), quaternion_y(16), quaternion_y(-16)], dtype=np.float32)
    time_view = builder.append(times)
    rotation_view = builder.append(rotations)

    minimum = positions.min(axis=0).astype(float).tolist()
    maximum = positions.max(axis=0).astype(float).tolist()
    accessors = [
        {"bufferView": position_view, "componentType": FLOAT, "count": len(positions), "type": "VEC3", "min": minimum, "max": maximum},
        {"bufferView": normal_view, "componentType": FLOAT, "count": len(normals), "type": "VEC3"},
        {"bufferView": color_view, "componentType": FLOAT, "count": len(colors), "type": "VEC4"},
        {"bufferView": texcoord_view, "componentType": FLOAT, "count": len(texcoords), "type": "VEC2"},
        {"bufferView": joints_view, "componentType": UNSIGNED_SHORT, "count": len(joints), "type": "VEC4"},
        {"bufferView": weights_view, "componentType": FLOAT, "count": len(weights), "type": "VEC4"},
        {"bufferView": index_view, "componentType": UNSIGNED_SHORT, "count": len(indices), "type": "SCALAR"},
        {"bufferView": bind_view, "componentType": FLOAT, "count": len(bones), "type": "MAT4"},
        {"bufferView": time_view, "componentType": FLOAT, "count": len(times), "type": "SCALAR", "min": [0.0], "max": [1.0]},
        {"bufferView": rotation_view, "componentType": FLOAT, "count": len(rotations), "type": "VEC4"},
    ]

    nodes = []
    for bone in bones:
        node = {"name": bone["name"], "translation": [float(v) for v in bone["translation"]]}
        children = [i for i, child in enumerate(bones) if child["parent"] == len(nodes)]
        if children:
            node["children"] = children
        nodes.append(node)
    mesh_node = len(nodes)
    nodes.append({"name": "PetAvatar", "mesh": 0, "skin": 0})

    attributes = {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 3, "JOINTS_0": 4, "WEIGHTS_0": 5}
    if coordinate_system == "triposr":
        attributes["COLOR_0"] = 2

    gltf = {
        "asset": {"version": "2.0", "generator": "Pet Avatar Dog Auto-Rigger 0.2.0"},
        "scene": 0,
        "scenes": [{"name": "PetAvatarScene", "nodes": [0, mesh_node]}],
        "nodes": nodes,
        "meshes": [{"name": "ReconstructedDog", "primitives": [{
            "attributes": attributes,
            "indices": 6,
            "material": 0,
        }]}],
        "skins": [{"name": "DogSkeleton", "inverseBindMatrices": 7, "skeleton": 0, "joints": list(range(len(bones)))}],
        "materials": [{"name": "ReconstructedCoat", "pbrMetallicRoughness": {
            "baseColorFactor": [1.0, 1.0, 1.0, 1.0], "baseColorTexture": {"index": 0},
            "metallicFactor": 0.0, "roughnessFactor": 0.88,
        }}],
        "textures": [{"source": 0}],
        "images": [{"uri": "textures/albedo.png"}],
        "animations": [{"name": "TailWag", "samplers": [{"input": 8, "output": 9, "interpolation": "LINEAR"}],
                        "channels": [{"sampler": 0, "target": {"node": 4, "path": "rotation"}}]}],
        "buffers": [{"byteLength": len(builder.data)}],
        "bufferViews": builder.views,
        "accessors": accessors,
    }

    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    binary = bytes(builder.data)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary)
    output = bytearray(struct.pack("<III", 0x46546C67, 2, total_length))
    output.extend(struct.pack("<II", len(json_bytes), 0x4E4F534A))
    output.extend(json_bytes)
    output.extend(struct.pack("<II", len(binary), 0x004E4942))
    output.extend(binary)
    stats = {
        "schemaVersion": 1,
        "avatarVersion": 1,
        "species": "dog",
        "provider": "bite-d-smal" if coordinate_system == "bite" else "triposr-canonical-prototype",
        "aiReconstruction": True,
        "model": (
            {"name": "BITE/D-SMAL", "mode": "research"}
            if coordinate_system == "bite"
            else {"name": "TripoSR", "revision": "107cefdc244c39106fa830359024f6a2f1c78871"}
        ),
        "modelFile": "pet.glb",
        "previewFile": "preview.png",
        "units": "meters",
        "upAxis": "Y",
        "forwardAxis": "+Z",
        "vertices": int(len(positions)),
        "triangles": int(len(indices) // 3),
        "bones": len(bones),
        "animations": 1,
        "vertexColors": coordinate_system == "triposr",
        "uvMapped": True,
        "bounds": {"min": minimum, "max": maximum},
        "rig": "prototype-dog-v1-geometric",
        "limitations": [
            "Requires a clean standing canonical reference; arbitrary reclining photos are not accepted directly.",
            "Geometry and markings on sides hidden from the reference have low confidence.",
            "Geometric skin weights are suitable for prototype motion, not final anatomical animation.",
        ],
    }
    if return_atlas:
        atlas = {
            "vertex_mapping": np.asarray(vertex_mapping, dtype=np.int64),
            "faces": np.asarray(atlas_faces, dtype=np.int64),
            "texcoords": texcoords.copy(),
        }
        return bytes(output), stats, atlas
    return bytes(output), stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path, help="Static reconstruction GLB")
    parser.add_argument("output", type=Path, help="Rigged prototype GLB")
    parser.add_argument("--metadata", type=Path, help="Optional JSON stats path")
    parser.add_argument("--height", type=float, default=1.8, help="Output height in Unity units")
    parser.add_argument(
        "--coordinate-system",
        choices=("triposr", "bite"),
        default="triposr",
        help="Coordinate convention used by the source mesh",
    )
    args = parser.parse_args()

    loaded = trimesh.load(args.input, force="mesh", process=False)
    if not isinstance(loaded, trimesh.Trimesh):
        raise TypeError("Input GLB did not contain a mesh")
    output, stats = build_glb(loaded, args.height, args.coordinate_system)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output)
    texture_path = args.output.parent / "textures" / "albedo.png"
    if not texture_path.exists():
        texture_path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (4, 4), (255, 255, 255)).save(texture_path)
    if args.metadata:
        args.metadata.parent.mkdir(parents=True, exist_ok=True)
        args.metadata.write_text(json.dumps(stats, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), **stats}, ensure_ascii=False))


if __name__ == "__main__":
    main()
