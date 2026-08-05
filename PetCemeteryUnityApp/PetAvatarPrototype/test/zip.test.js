import assert from "node:assert/strict";
import test from "node:test";
import { createZip } from "../src/lib/zip.js";

test("creates a UTF-8 ZIP with the requested entries", () => {
  const zip = createZip([
    { name: "pet.glb", data: Buffer.from("glb") },
    { name: "textures/albedo.png", data: Buffer.from([1, 2, 3]) },
    { name: "README.md", data: Buffer.from("Прототип", "utf8") },
  ]);

  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("pet.glb")));
  assert.ok(zip.includes(Buffer.from("textures/albedo.png")));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
});
