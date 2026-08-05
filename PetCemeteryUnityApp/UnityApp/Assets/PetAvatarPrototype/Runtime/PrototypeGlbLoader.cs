using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;

namespace PetCemetery.PetAvatarPrototype
{
    public sealed class PrototypeGlbLoader : MonoBehaviour
    {
        private const uint GlbMagic = 0x46546C67;
        private const uint JsonChunkType = 0x4E4F534A;
        private const uint BinaryChunkType = 0x004E4942;

        [SerializeField] private string sourcePath;
        [SerializeField] private bool loadOnStart;

        public GameObject LoadedAvatar { get; private set; }

        private void Start()
        {
            if (loadOnStart && !string.IsNullOrWhiteSpace(sourcePath))
            {
                LoadFromPath(sourcePath);
            }
        }

        public GameObject LoadFromPath(string glbPath)
        {
            if (string.IsNullOrWhiteSpace(glbPath))
            {
                throw new ArgumentException("GLB path is required", nameof(glbPath));
            }

            byte[] bytes = File.ReadAllBytes(glbPath);
            GlbDocument document = ParseDocument(bytes);
            GameObject avatar = BuildAvatar(document.Root, document.Binary, glbPath);
            sourcePath = glbPath;
            LoadedAvatar = avatar;
            return avatar;
        }

        private GameObject BuildAvatar(GltfRoot root, byte[] binary, string glbPath)
        {
            if (root.meshes == null || root.meshes.Length == 0 || root.meshes[0].primitives.Length == 0)
            {
                throw new InvalidDataException("The prototype GLB has no mesh primitive");
            }

            if (root.skins == null || root.skins.Length == 0)
            {
                throw new InvalidDataException("The prototype GLB has no skin");
            }

            GameObject avatarRoot = new GameObject("Generated Pet Avatar");
            avatarRoot.transform.SetParent(transform, false);

            GltfSkin skin = root.skins[0];
            Transform[] bones = BuildBones(root, skin, avatarRoot.transform);
            GltfPrimitive primitive = root.meshes[0].primitives[0];
            Mesh mesh = BuildMesh(root, binary, primitive, skin, bones, avatarRoot.transform);
            Material material = BuildMaterial(root, glbPath, mesh.colors != null && mesh.colors.Length == mesh.vertexCount);

            GameObject rendererObject = new GameObject("Pet Mesh");
            rendererObject.transform.SetParent(avatarRoot.transform, false);
            SkinnedMeshRenderer renderer = rendererObject.AddComponent<SkinnedMeshRenderer>();
            renderer.sharedMesh = mesh;
            renderer.sharedMaterial = material;
            renderer.bones = bones;
            renderer.rootBone = bones.Length > 0 ? bones[0] : null;
            renderer.updateWhenOffscreen = true;

            Transform tail = FindBone(bones, "Tail");
            PrototypeTailWag tailWag = avatarRoot.AddComponent<PrototypeTailWag>();
            tailWag.Initialize(tail);

            return avatarRoot;
        }

        private static Transform[] BuildBones(GltfRoot root, GltfSkin skin, Transform avatarRoot)
        {
            Transform[] nodeTransforms = new Transform[root.nodes.Length];
            HashSet<int> jointSet = new HashSet<int>(skin.joints);

            foreach (int nodeIndex in skin.joints)
            {
                GltfNode node = root.nodes[nodeIndex];
                GameObject boneObject = new GameObject(string.IsNullOrWhiteSpace(node.name) ? $"Bone {nodeIndex}" : node.name);
                Transform bone = boneObject.transform;
                Vector3 translation = ReadVector3(node.translation);
                bone.localPosition = new Vector3(-translation.x, translation.y, translation.z);
                bone.localRotation = ReadQuaternion(node.rotation);
                nodeTransforms[nodeIndex] = bone;
            }

            foreach (int nodeIndex in skin.joints)
            {
                GltfNode node = root.nodes[nodeIndex];
                Transform parent = nodeTransforms[nodeIndex];
                if (node.children == null)
                {
                    continue;
                }

                foreach (int childIndex in node.children)
                {
                    if (jointSet.Contains(childIndex) && nodeTransforms[childIndex] != null)
                    {
                        nodeTransforms[childIndex].SetParent(parent, false);
                    }
                }
            }

            for (int index = 0; index < skin.joints.Length; index += 1)
            {
                Transform bone = nodeTransforms[skin.joints[index]];
                if (bone.parent == null)
                {
                    bone.SetParent(avatarRoot, false);
                }
            }

            Transform[] bones = new Transform[skin.joints.Length];
            for (int index = 0; index < skin.joints.Length; index += 1)
            {
                bones[index] = nodeTransforms[skin.joints[index]];
            }
            return bones;
        }

        private static Mesh BuildMesh(
            GltfRoot root,
            byte[] binary,
            GltfPrimitive primitive,
            GltfSkin skin,
            Transform[] bones,
            Transform avatarRoot)
        {
            Vector3[] positions = ReadVector3Accessor(root, binary, primitive.attributes.POSITION, mirrorX: true);
            Vector3[] normals = ReadVector3Accessor(root, binary, primitive.attributes.NORMAL, mirrorX: true);
            Color[] colors = primitive.attributes.COLOR_0 >= 0
                ? ReadColorAccessor(root, binary, primitive.attributes.COLOR_0)
                : Array.Empty<Color>();
            ushort[] jointValues = ReadUnsignedShortAccessor(root, binary, primitive.attributes.JOINTS_0, 4);
            float[] weightValues = ReadFloatAccessor(root, binary, primitive.attributes.WEIGHTS_0, 4);
            ushort[] sourceIndices = ReadUnsignedShortAccessor(root, binary, primitive.indices, 1);

            int[] indices = new int[sourceIndices.Length];
            for (int index = 0; index < sourceIndices.Length; index += 3)
            {
                indices[index] = sourceIndices[index];
                indices[index + 1] = sourceIndices[index + 2];
                indices[index + 2] = sourceIndices[index + 1];
            }

            BoneWeight[] boneWeights = new BoneWeight[positions.Length];
            for (int vertex = 0; vertex < positions.Length; vertex += 1)
            {
                int offset = vertex * 4;
                boneWeights[vertex] = new BoneWeight
                {
                    boneIndex0 = jointValues[offset],
                    boneIndex1 = jointValues[offset + 1],
                    boneIndex2 = jointValues[offset + 2],
                    boneIndex3 = jointValues[offset + 3],
                    weight0 = weightValues[offset],
                    weight1 = weightValues[offset + 1],
                    weight2 = weightValues[offset + 2],
                    weight3 = weightValues[offset + 3],
                };
            }

            Matrix4x4[] bindPoses = new Matrix4x4[bones.Length];
            for (int index = 0; index < bones.Length; index += 1)
            {
                bindPoses[index] = bones[index].worldToLocalMatrix * avatarRoot.localToWorldMatrix;
            }

            Mesh mesh = new Mesh
            {
                name = root.meshes[0].name ?? "Generated Pet Mesh",
                indexFormat = positions.Length > ushort.MaxValue ? IndexFormat.UInt32 : IndexFormat.UInt16,
                vertices = positions,
                normals = normals,
                triangles = indices,
                boneWeights = boneWeights,
                bindposes = bindPoses,
            };
            if (colors.Length == positions.Length)
            {
                mesh.colors = colors;
            }
            mesh.RecalculateBounds();
            return mesh;
        }

        private static Material BuildMaterial(GltfRoot root, string glbPath, bool hasVertexColors)
        {
            Shader shader = hasVertexColors ? Shader.Find("Pet Cemetery/Vertex Color") : null;
            shader ??= Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            Material material = new Material(shader) { name = "Generated Coat Material" };
            float[] color = root.materials?[0]?.pbrMetallicRoughness?.baseColorFactor;
            Color coat = color != null && color.Length >= 4
                ? new Color(color[0], color[1], color[2], color[3])
                : new Color(0.6f, 0.4f, 0.27f, 1f);
            material.color = coat;
            if (material.HasProperty("_BaseColor"))
            {
                material.SetColor("_BaseColor", coat);
            }

            string baseDir = Path.GetDirectoryName(glbPath) ?? string.Empty;
            string texturePath = Path.Combine(baseDir, "textures", "albedo.png");
            if (File.Exists(texturePath))
            {
                Texture2D texture = new Texture2D(2, 2, TextureFormat.RGBA32, false)
                {
                    name = "Generated Coat Texture",
                };
                texture.LoadImage(File.ReadAllBytes(texturePath));
                material.mainTexture = texture;
                if (material.HasProperty("_BaseMap"))
                {
                    material.SetTexture("_BaseMap", texture);
                }
            }
            return material;
        }

        private static Color[] ReadColorAccessor(GltfRoot root, byte[] binary, int accessorIndex)
        {
            float[] values = ReadFloatAccessor(root, binary, accessorIndex, 4);
            Color[] result = new Color[values.Length / 4];
            for (int index = 0; index < result.Length; index += 1)
            {
                int offset = index * 4;
                result[index] = new Color(values[offset], values[offset + 1], values[offset + 2], values[offset + 3]);
            }
            return result;
        }

        private static Transform FindBone(Transform[] bones, string name)
        {
            foreach (Transform bone in bones)
            {
                if (bone != null && string.Equals(bone.name, name, StringComparison.Ordinal))
                {
                    return bone;
                }
            }
            return null;
        }

        private static Vector3[] ReadVector3Accessor(GltfRoot root, byte[] binary, int accessorIndex, bool mirrorX)
        {
            float[] values = ReadFloatAccessor(root, binary, accessorIndex, 3);
            Vector3[] result = new Vector3[values.Length / 3];
            for (int index = 0; index < result.Length; index += 1)
            {
                float x = values[index * 3];
                result[index] = new Vector3(mirrorX ? -x : x, values[index * 3 + 1], values[index * 3 + 2]);
            }
            return result;
        }

        private static float[] ReadFloatAccessor(GltfRoot root, byte[] binary, int accessorIndex, int components)
        {
            GltfAccessor accessor = root.accessors[accessorIndex];
            GltfBufferView view = root.bufferViews[accessor.bufferView];
            int offset = view.byteOffset + accessor.byteOffset;
            int stride = view.byteStride > 0 ? view.byteStride : components * sizeof(float);
            float[] values = new float[accessor.count * components];
            for (int item = 0; item < accessor.count; item += 1)
            {
                for (int component = 0; component < components; component += 1)
                {
                    values[item * components + component] = BitConverter.ToSingle(binary, offset + item * stride + component * sizeof(float));
                }
            }
            return values;
        }

        private static ushort[] ReadUnsignedShortAccessor(GltfRoot root, byte[] binary, int accessorIndex, int components)
        {
            GltfAccessor accessor = root.accessors[accessorIndex];
            GltfBufferView view = root.bufferViews[accessor.bufferView];
            int offset = view.byteOffset + accessor.byteOffset;
            int stride = view.byteStride > 0 ? view.byteStride : components * sizeof(ushort);
            ushort[] values = new ushort[accessor.count * components];
            for (int item = 0; item < accessor.count; item += 1)
            {
                for (int component = 0; component < components; component += 1)
                {
                    values[item * components + component] = BitConverter.ToUInt16(binary, offset + item * stride + component * sizeof(ushort));
                }
            }
            return values;
        }

        private static Vector3 ReadVector3(float[] values)
        {
            return values != null && values.Length >= 3
                ? new Vector3(values[0], values[1], values[2])
                : Vector3.zero;
        }

        private static Quaternion ReadQuaternion(float[] values)
        {
            if (values == null || values.Length < 4)
            {
                return Quaternion.identity;
            }
            return new Quaternion(-values[0], values[1], values[2], -values[3]);
        }

        private static GlbDocument ParseDocument(byte[] bytes)
        {
            if (bytes.Length < 28 || BitConverter.ToUInt32(bytes, 0) != GlbMagic)
            {
                throw new InvalidDataException("The selected file is not a GLB container");
            }
            if (BitConverter.ToUInt32(bytes, 4) != 2)
            {
                throw new InvalidDataException("Only GLB 2.0 is supported");
            }

            int jsonLength = checked((int)BitConverter.ToUInt32(bytes, 12));
            if (BitConverter.ToUInt32(bytes, 16) != JsonChunkType)
            {
                throw new InvalidDataException("GLB JSON chunk is missing");
            }
            string json = Encoding.UTF8.GetString(bytes, 20, jsonLength).TrimEnd(' ', '\0');
            int binaryHeader = 20 + jsonLength;
            int binaryLength = checked((int)BitConverter.ToUInt32(bytes, binaryHeader));
            if (BitConverter.ToUInt32(bytes, binaryHeader + 4) != BinaryChunkType)
            {
                throw new InvalidDataException("GLB binary chunk is missing");
            }
            byte[] binary = new byte[binaryLength];
            Buffer.BlockCopy(bytes, binaryHeader + 8, binary, 0, binaryLength);
            GltfRoot root = JsonUtility.FromJson<GltfRoot>(json);
            return new GlbDocument { Root = root, Binary = binary };
        }

        private sealed class GlbDocument
        {
            public GltfRoot Root;
            public byte[] Binary;
        }

        [Serializable]
        private sealed class GltfRoot
        {
            public GltfNode[] nodes;
            public GltfMesh[] meshes;
            public GltfSkin[] skins;
            public GltfMaterial[] materials;
            public GltfAccessor[] accessors;
            public GltfBufferView[] bufferViews;
        }

        [Serializable]
        private sealed class GltfNode
        {
            public string name;
            public float[] translation;
            public float[] rotation;
            public int[] children;
        }

        [Serializable]
        private sealed class GltfMesh
        {
            public string name;
            public GltfPrimitive[] primitives;
        }

        [Serializable]
        private sealed class GltfPrimitive
        {
            public GltfAttributes attributes;
            public int indices;
            public int material;
        }

        [Serializable]
        private sealed class GltfAttributes
        {
            public int POSITION;
            public int NORMAL;
            public int COLOR_0 = -1;
            public int JOINTS_0;
            public int WEIGHTS_0;
        }

        [Serializable]
        private sealed class GltfSkin
        {
            public string name;
            public int inverseBindMatrices;
            public int skeleton;
            public int[] joints;
        }

        [Serializable]
        private sealed class GltfMaterial
        {
            public string name;
            public GltfPbr pbrMetallicRoughness;
        }

        [Serializable]
        private sealed class GltfPbr
        {
            public float[] baseColorFactor;
        }

        [Serializable]
        private sealed class GltfAccessor
        {
            public int bufferView;
            public int byteOffset;
            public int componentType;
            public int count;
            public string type;
        }

        [Serializable]
        private sealed class GltfBufferView
        {
            public int buffer;
            public int byteOffset;
            public int byteLength;
            public int byteStride;
        }
    }
}
