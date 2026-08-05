using UnityEngine;

namespace PetCemetery.PetAvatarPrototype
{
    public sealed class PrototypeTailWag : MonoBehaviour
    {
        [SerializeField] private Transform tail;
        [SerializeField] private float amplitudeDegrees = 18f;
        [SerializeField] private float frequency = 2.4f;

        private Quaternion baseRotation;

        public void Initialize(Transform tailBone)
        {
            tail = tailBone;
            baseRotation = tail != null ? tail.localRotation : Quaternion.identity;
        }

        private void Start()
        {
            if (tail != null)
            {
                baseRotation = tail.localRotation;
            }
        }

        private void Update()
        {
            if (tail == null)
            {
                return;
            }

            float angle = Mathf.Sin(Time.time * frequency * Mathf.PI * 2f) * amplitudeDegrees;
            tail.localRotation = baseRotation * Quaternion.Euler(0f, angle, 0f);
        }
    }
}
