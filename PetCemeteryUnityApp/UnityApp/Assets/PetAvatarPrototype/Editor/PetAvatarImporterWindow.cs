using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace PetCemetery.PetAvatarPrototype.Editor
{
    public sealed class PetAvatarImporterWindow : EditorWindow
    {
        private string glbPath = string.Empty;
        private Vector2 scrollPosition;

        [MenuItem("Pet Avatar Prototype/Import generated pet.glb")]
        private static void OpenWindow()
        {
            PetAvatarImporterWindow window = GetWindow<PetAvatarImporterWindow>(true, "Pet Avatar Prototype");
            window.minSize = new Vector2(480f, 280f);
            window.Show();
        }

        private void OnGUI()
        {
            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition);
            EditorGUILayout.Space(14f);
            EditorGUILayout.LabelField("Import generated pet.glb", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox(
                "Распакуйте ZIP из Web UI и выберите pet.glb. Loader поддерживает профиль GLB, который создаёт локальный прототип.",
                MessageType.Info);
            EditorGUILayout.Space(8f);

            using (new EditorGUILayout.HorizontalScope())
            {
                glbPath = EditorGUILayout.TextField("GLB", glbPath);
                if (GUILayout.Button("Выбрать…", GUILayout.Width(92f)))
                {
                    string selected = EditorUtility.OpenFilePanel("Выберите pet.glb", GetInitialDirectory(), "glb");
                    if (!string.IsNullOrWhiteSpace(selected))
                    {
                        glbPath = selected;
                    }
                }
            }

            EditorGUILayout.Space(14f);
            using (new EditorGUI.DisabledScope(string.IsNullOrWhiteSpace(glbPath) || !File.Exists(glbPath)))
            {
                if (GUILayout.Button("Создать питомца в текущей сцене", GUILayout.Height(42f)))
                {
                    ImportAvatar(glbPath);
                }
            }

            EditorGUILayout.Space(14f);
            EditorGUILayout.LabelField("После импорта", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("• Нажмите Play, чтобы увидеть движение хвоста.", EditorStyles.wordWrappedLabel);
            EditorGUILayout.LabelField("• Скелет находится внутри объекта Generated Pet Avatar.", EditorStyles.wordWrappedLabel);
            EditorGUILayout.LabelField("• SkinnedMeshRenderer расположен на дочернем объекте Pet Mesh.", EditorStyles.wordWrappedLabel);
            EditorGUILayout.EndScrollView();
        }

        private static string GetInitialDirectory()
        {
            string downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            return Directory.Exists(downloads) ? downloads : Application.dataPath;
        }

        private static void ImportAvatar(string path)
        {
            try
            {
                GameObject host = new GameObject("Pet Avatar Prototype Loader");
                Undo.RegisterCreatedObjectUndo(host, "Import generated pet avatar");
                PrototypeGlbLoader loader = host.AddComponent<PrototypeGlbLoader>();
                GameObject avatar = loader.LoadFromPath(path);
                EnsureViewerEnvironment(avatar);
                Selection.activeGameObject = avatar;
                EditorGUIUtility.PingObject(avatar);
                Debug.Log($"Pet Avatar Prototype imported: {path}");
            }
            catch (Exception error)
            {
                Debug.LogException(error);
                EditorUtility.DisplayDialog("Pet Avatar Prototype", error.Message, "OK");
            }
        }

        private static void EnsureViewerEnvironment(GameObject avatar)
        {
            if (FindFirstObjectByType<Light>() == null)
            {
                GameObject lightObject = new GameObject("Pet Avatar Key Light");
                Undo.RegisterCreatedObjectUndo(lightObject, "Create pet avatar light");
                Light light = lightObject.AddComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 1.15f;
                lightObject.transform.rotation = Quaternion.Euler(42f, -35f, 0f);
            }

            Camera camera = Camera.main;
            if (camera == null)
            {
                GameObject cameraObject = new GameObject("Main Camera") { tag = "MainCamera" };
                Undo.RegisterCreatedObjectUndo(cameraObject, "Create pet avatar camera");
                camera = cameraObject.AddComponent<Camera>();
                cameraObject.AddComponent<AudioListener>();
            }
            camera.transform.position = new Vector3(3.4f, 2.1f, 4.2f);
            camera.transform.LookAt(avatar.transform.position + Vector3.up * 0.85f);
        }
    }
}
