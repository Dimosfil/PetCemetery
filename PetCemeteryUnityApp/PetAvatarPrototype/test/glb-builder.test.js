import assert from "node:assert/strict";
import test from "node:test";
import { buildRiggedDogGlb, parseGlbJson } from "../src/pipeline/glb-builder.js";

test("builds a GLB 2.0 dog with mesh, skin and animation", () => {
  const result = buildRiggedDogGlb({ coatColor: "#7b4a32" });
  const json = parseGlbJson(result.buffer);

  assert.equal(result.buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(result.buffer.readUInt32LE(4), 2);
  assert.equal(result.buffer.readUInt32LE(8), result.buffer.length);
  assert.equal(json.meshes.length, 1);
  assert.equal(json.skins.length, 1);
  assert.ok(json.skins[0].joints.length >= 10);
  assert.equal(json.animations[0].name, "TailWag");
  assert.equal(json.meshes[0].primitives[0].attributes.TEXCOORD_0, 2);
  assert.equal(json.meshes[0].primitives[0].attributes.JOINTS_0, 3);
  assert.equal(json.meshes[0].primitives[0].attributes.WEIGHTS_0, 4);
  assert.ok(result.stats.vertices > 0);
  assert.ok(result.stats.triangles > 0);
});

test("changes prototype proportions without changing the shared skeleton", () => {
  const compact = buildRiggedDogGlb({ shape: { bodyLength: 0.9, headScale: 1.1 } });
  const long = buildRiggedDogGlb({ shape: { bodyLength: 1.12, headScale: 0.9 } });

  assert.notDeepEqual(compact.buffer, long.buffer);
  assert.equal(compact.stats.bones, long.stats.bones);
});
