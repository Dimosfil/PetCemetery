using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace PetCemetery.PetAvatarPrototype.Editor
{
    public static class PetAvatarBatchVerifier
    {
        public static void Run()
        {
            string glbPath = GetArgument("-petAvatarGlb");
            if (string.IsNullOrWhiteSpace(glbPath) || !File.Exists(glbPath))
            {
                throw new FileNotFoundException("Pass an existing GLB with -petAvatarGlb", glbPath);
            }

            GameObject host = new GameObject("Pet Avatar Batch Verifier");
            try
            {
                PrototypeGlbLoader loader = host.AddComponent<PrototypeGlbLoader>();
                GameObject avatar = loader.LoadFromPath(glbPath);
                SkinnedMeshRenderer renderer = avatar.GetComponentInChildren<SkinnedMeshRenderer>();
                if (renderer == null || renderer.sharedMesh == null)
                {
                    throw new InvalidOperationException("Generated avatar has no SkinnedMeshRenderer or mesh");
                }
                if (renderer.bones == null || renderer.bones.Length < 10)
                {
                    throw new InvalidOperationException("Generated avatar skeleton is incomplete");
                }
                if (renderer.sharedMesh.vertexCount <= 0 || renderer.sharedMesh.triangles.Length <= 0)
                {
                    throw new InvalidOperationException("Generated avatar mesh is empty");
                }
                if (avatar.GetComponent<PrototypeTailWag>() == null)
                {
                    throw new InvalidOperationException("Generated avatar has no prototype animation driver");
                }
                if (HasArgument("-expectVertexColors"))
                {
                    if (renderer.sharedMesh.colors == null || renderer.sharedMesh.colors.Length != renderer.sharedMesh.vertexCount)
                    {
                        throw new InvalidOperationException("Generated AI avatar lost its vertex colours");
                    }
                    if (renderer.sharedMaterial == null || renderer.sharedMaterial.shader == null ||
                        !string.Equals(renderer.sharedMaterial.shader.name, "Pet Cemetery/Vertex Color", StringComparison.Ordinal))
                    {
                        throw new InvalidOperationException("Generated AI avatar is not using the vertex-colour shader");
                    }
                }

                Debug.Log(
                    $"PET_AVATAR_VERIFY_OK vertices={renderer.sharedMesh.vertexCount} " +
                    $"triangles={renderer.sharedMesh.triangles.Length / 3} bones={renderer.bones.Length}");
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(host);
            }
        }

        private static string GetArgument(string name)
        {
            string[] arguments = Environment.GetCommandLineArgs();
            for (int index = 0; index < arguments.Length - 1; index += 1)
            {
                if (string.Equals(arguments[index], name, StringComparison.Ordinal))
                {
                    return arguments[index + 1];
                }
            }
            return null;
        }

        private static bool HasArgument(string name)
        {
            foreach (string argument in Environment.GetCommandLineArgs())
            {
                if (string.Equals(argument, name, StringComparison.Ordinal))
                {
                    return true;
                }
            }
            return false;
        }
    }
}
