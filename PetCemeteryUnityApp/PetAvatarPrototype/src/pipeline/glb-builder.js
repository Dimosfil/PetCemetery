const COMPONENT_TYPE = {
  UNSIGNED_SHORT: 5123,
  FLOAT: 5126,
};

const BUFFER_TARGET = {
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
};

function align4(value) {
  return (value + 3) & ~3;
}

function quaternionFromYDegrees(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function parseHexColor(hexColor) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hexColor ?? "") ? hexColor.slice(1) : "9a6846";
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
    1,
  ];
}

function calculateBounds(values, stride) {
  const minimum = new Array(stride).fill(Number.POSITIVE_INFINITY);
  const maximum = new Array(stride).fill(Number.NEGATIVE_INFINITY);
  for (let index = 0; index < values.length; index += stride) {
    for (let component = 0; component < stride; component += 1) {
      minimum[component] = Math.min(minimum[component], values[index + component]);
      maximum[component] = Math.max(maximum[component], values[index + component]);
    }
  }
  return { minimum, maximum };
}

function inverseTranslationMatrix([x, y, z]) {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    -x, -y, -z, 1,
  ];
}

function buildSkeleton() {
  const bones = [
    { name: "Root", parent: null, translation: [0, 0, 0] },
    { name: "Body", parent: 0, translation: [0, 0.9, 0] },
    { name: "Neck", parent: 1, translation: [0, 0.34, 0.64] },
    { name: "Head", parent: 2, translation: [0, 0.27, 0.43] },
    { name: "Tail", parent: 1, translation: [0, 0.15, -0.75] },
    { name: "TailTip", parent: 4, translation: [0, 0, -0.56] },
    { name: "FrontLeftUpper", parent: 1, translation: [-0.34, -0.3, 0.5] },
    { name: "FrontLeftLower", parent: 6, translation: [0, -0.43, 0] },
    { name: "FrontRightUpper", parent: 1, translation: [0.34, -0.3, 0.5] },
    { name: "FrontRightLower", parent: 8, translation: [0, -0.43, 0] },
    { name: "BackLeftUpper", parent: 1, translation: [-0.34, -0.3, -0.5] },
    { name: "BackLeftLower", parent: 10, translation: [0, -0.43, 0] },
    { name: "BackRightUpper", parent: 1, translation: [0.34, -0.3, -0.5] },
    { name: "BackRightLower", parent: 12, translation: [0, -0.43, 0] },
  ];

  const globalTranslations = bones.map(() => [0, 0, 0]);
  for (let index = 0; index < bones.length; index += 1) {
    const bone = bones[index];
    if (bone.parent === null) {
      globalTranslations[index] = [...bone.translation];
    } else {
      const parent = globalTranslations[bone.parent];
      globalTranslations[index] = bone.translation.map((value, component) => value + parent[component]);
    }
  }

  return { bones, globalTranslations };
}

function createDogGeometry(shape) {
  const positions = [];
  const normals = [];
  const texcoords = [];
  const joints = [];
  const weights = [];
  const indices = [];

  function addBox(center, size, boneIndex) {
    const [cx, cy, cz] = center;
    const [sx, sy, sz] = size.map((value) => value / 2);
    const faces = [
      { normal: [1, 0, 0], corners: [[sx, -sy, -sz], [sx, -sy, sz], [sx, sy, sz], [sx, sy, -sz]] },
      { normal: [-1, 0, 0], corners: [[-sx, -sy, sz], [-sx, -sy, -sz], [-sx, sy, -sz], [-sx, sy, sz]] },
      { normal: [0, 1, 0], corners: [[-sx, sy, -sz], [sx, sy, -sz], [sx, sy, sz], [-sx, sy, sz]] },
      { normal: [0, -1, 0], corners: [[-sx, -sy, sz], [sx, -sy, sz], [sx, -sy, -sz], [-sx, -sy, -sz]] },
      { normal: [0, 0, 1], corners: [[sx, -sy, sz], [-sx, -sy, sz], [-sx, sy, sz], [sx, sy, sz]] },
      { normal: [0, 0, -1], corners: [[-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz]] },
    ];

    for (const face of faces) {
      const base = positions.length / 3;
      const faceTexcoords = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let cornerIndex = 0; cornerIndex < face.corners.length; cornerIndex += 1) {
        const [x, y, z] = face.corners[cornerIndex];
        positions.push(cx + x, cy + y, cz + z);
        normals.push(...face.normal);
        texcoords.push(...faceTexcoords[cornerIndex]);
        joints.push(boneIndex, 0, 0, 0);
        weights.push(1, 0, 0, 0);
      }
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }

  const bodyWidth = 0.82 * shape.bodyWidth;
  const bodyHeight = 0.68 * shape.bodyHeight;
  const bodyLength = 1.42 * shape.bodyLength;
  const headScale = shape.headScale;
  const legScale = shape.legScale;

  addBox([0, 0.9, 0], [bodyWidth, bodyHeight, bodyLength], 1);
  addBox([0, 1.22, 0.68], [0.5 * headScale, 0.55, 0.5], 2);
  addBox([0, 1.5, 1.05], [0.62 * headScale, 0.62 * headScale, 0.7 * headScale], 3);
  addBox([0, 1.37, 1.45], [0.4 * headScale, 0.28 * headScale, 0.38 * headScale], 3);
  addBox([-0.2 * headScale, 1.84, 1], [0.17, 0.42 * shape.earScale, 0.2], 3);
  addBox([0.2 * headScale, 1.84, 1], [0.17, 0.42 * shape.earScale, 0.2], 3);
  addBox([0, 1.05, -1.05], [0.2, 0.2, 0.68 * shape.tailScale], 4);
  addBox([0, 1.05, -1.53], [0.15, 0.15, 0.42 * shape.tailScale], 5);

  const legs = [
    { upperBone: 6, lowerBone: 7, x: -0.34, z: 0.5 },
    { upperBone: 8, lowerBone: 9, x: 0.34, z: 0.5 },
    { upperBone: 10, lowerBone: 11, x: -0.34, z: -0.5 },
    { upperBone: 12, lowerBone: 13, x: 0.34, z: -0.5 },
  ];
  for (const leg of legs) {
    addBox([leg.x, 0.48, leg.z], [0.22, 0.46 * legScale, 0.24], leg.upperBone);
    addBox([leg.x, 0.12, leg.z], [0.18, 0.38 * legScale, 0.2], leg.lowerBone);
    addBox([leg.x, -0.06, leg.z + 0.08], [0.24, 0.12, 0.34], leg.lowerBone);
  }

  return { positions, normals, texcoords, joints, weights, indices };
}

function createBufferBuilder() {
  const chunks = [];
  const views = [];
  let byteLength = 0;

  function append(typedArray, target) {
    const padding = align4(byteLength) - byteLength;
    if (padding > 0) {
      chunks.push(Buffer.alloc(padding));
      byteLength += padding;
    }
    const data = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
    const view = { buffer: 0, byteOffset: byteLength, byteLength: data.length };
    if (target) view.target = target;
    const index = views.length;
    views.push(view);
    chunks.push(data);
    byteLength += data.length;
    return index;
  }

  function finish() {
    const padding = align4(byteLength) - byteLength;
    if (padding > 0) chunks.push(Buffer.alloc(padding));
    return { buffer: Buffer.concat(chunks), views };
  }

  return { append, finish };
}

export function buildRiggedDogGlb({ coatColor = "#9a6846", shape = {} } = {}) {
  const resolvedShape = {
    bodyWidth: shape.bodyWidth ?? 1,
    bodyHeight: shape.bodyHeight ?? 1,
    bodyLength: shape.bodyLength ?? 1,
    headScale: shape.headScale ?? 1,
    legScale: shape.legScale ?? 1,
    earScale: shape.earScale ?? 1,
    tailScale: shape.tailScale ?? 1,
  };
  const geometry = createDogGeometry(resolvedShape);
  const skeleton = buildSkeleton();
  const inverseBindMatrices = skeleton.globalTranslations.flatMap(inverseTranslationMatrix);
  const animationTimes = [0, 0.5, 1];
  const animationRotations = [
    ...quaternionFromYDegrees(-18),
    ...quaternionFromYDegrees(18),
    ...quaternionFromYDegrees(-18),
  ];

  const builder = createBufferBuilder();
  const positionView = builder.append(new Float32Array(geometry.positions), BUFFER_TARGET.ARRAY_BUFFER);
  const normalView = builder.append(new Float32Array(geometry.normals), BUFFER_TARGET.ARRAY_BUFFER);
  const texcoordView = builder.append(new Float32Array(geometry.texcoords), BUFFER_TARGET.ARRAY_BUFFER);
  const jointsView = builder.append(new Uint16Array(geometry.joints), BUFFER_TARGET.ARRAY_BUFFER);
  const weightsView = builder.append(new Float32Array(geometry.weights), BUFFER_TARGET.ARRAY_BUFFER);
  const indicesView = builder.append(new Uint16Array(geometry.indices), BUFFER_TARGET.ELEMENT_ARRAY_BUFFER);
  const bindView = builder.append(new Float32Array(inverseBindMatrices), BUFFER_TARGET.ARRAY_BUFFER);
  const timeView = builder.append(new Float32Array(animationTimes), BUFFER_TARGET.ARRAY_BUFFER);
  const rotationView = builder.append(new Float32Array(animationRotations), BUFFER_TARGET.ARRAY_BUFFER);
  const { buffer: binary, views } = builder.finish();

  const bounds = calculateBounds(geometry.positions, 3);
  const accessors = [
    { bufferView: positionView, componentType: COMPONENT_TYPE.FLOAT, count: geometry.positions.length / 3, type: "VEC3", min: bounds.minimum, max: bounds.maximum },
    { bufferView: normalView, componentType: COMPONENT_TYPE.FLOAT, count: geometry.normals.length / 3, type: "VEC3" },
    { bufferView: texcoordView, componentType: COMPONENT_TYPE.FLOAT, count: geometry.texcoords.length / 2, type: "VEC2" },
    { bufferView: jointsView, componentType: COMPONENT_TYPE.UNSIGNED_SHORT, count: geometry.joints.length / 4, type: "VEC4" },
    { bufferView: weightsView, componentType: COMPONENT_TYPE.FLOAT, count: geometry.weights.length / 4, type: "VEC4" },
    { bufferView: indicesView, componentType: COMPONENT_TYPE.UNSIGNED_SHORT, count: geometry.indices.length, type: "SCALAR" },
    { bufferView: bindView, componentType: COMPONENT_TYPE.FLOAT, count: skeleton.bones.length, type: "MAT4" },
    { bufferView: timeView, componentType: COMPONENT_TYPE.FLOAT, count: animationTimes.length, type: "SCALAR", min: [0], max: [1] },
    { bufferView: rotationView, componentType: COMPONENT_TYPE.FLOAT, count: animationTimes.length, type: "VEC4" },
  ];

  const nodes = skeleton.bones.map((bone) => ({ name: bone.name, translation: bone.translation }));
  for (let index = 0; index < skeleton.bones.length; index += 1) {
    const children = skeleton.bones
      .map((bone, childIndex) => (bone.parent === index ? childIndex : null))
      .filter((childIndex) => childIndex !== null);
    if (children.length > 0) nodes[index].children = children;
  }
  const meshNodeIndex = nodes.length;
  nodes.push({ name: "PetAvatar", mesh: 0, skin: 0 });

  const gltf = {
    asset: { version: "2.0", generator: "Pet Avatar Prototype 0.1.0" },
    scene: 0,
    scenes: [{ name: "PetAvatarScene", nodes: [0, meshNodeIndex] }],
    nodes,
    meshes: [{
      name: "ProceduralDog",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
        indices: 5,
        material: 0,
      }],
    }],
    skins: [{ name: "DogSkeleton", inverseBindMatrices: 6, skeleton: 0, joints: skeleton.bones.map((_, index) => index) }],
    materials: [{
      name: "CoatMaterial",
      pbrMetallicRoughness: {
        baseColorFactor: parseHexColor(coatColor),
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
    }],
    images: [{ uri: "textures/albedo.png" }],
    textures: [{ source: 0 }],
    animations: [{
      name: "TailWag",
      samplers: [{ input: 7, output: 8, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 4, path: "rotation" } }],
    }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: views,
    accessors,
  };

  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = align4(json.length) - json.length;
  if (jsonPadding > 0) json = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const binaryPadding = align4(binary.length) - binary.length;
  const paddedBinary = binaryPadding > 0 ? Buffer.concat([binary, Buffer.alloc(binaryPadding)]) : binary;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + paddedBinary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(paddedBinary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);

  return {
    buffer: Buffer.concat([header, jsonHeader, json, binaryHeader, paddedBinary]),
    stats: {
      vertices: geometry.positions.length / 3,
      triangles: geometry.indices.length / 3,
      bones: skeleton.bones.length,
      animations: 1,
    },
    gltf,
  };
}

export function parseGlbJson(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67 || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Invalid GLB header");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a) throw new Error("GLB JSON chunk is missing");
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());
}
