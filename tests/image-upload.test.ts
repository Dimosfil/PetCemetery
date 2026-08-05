import { describe, expect, it } from "vitest";
import { detectSupportedImage } from "@/lib/image-upload";

describe("uploaded image signatures", () => {
  it("detects the supported JPEG, PNG, and WebP signatures", () => {
    expect(detectSupportedImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ mimeType: "image/jpeg", extension: ".jpg" });
    expect(detectSupportedImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({ mimeType: "image/png", extension: ".png" });
    expect(detectSupportedImage(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toEqual({ mimeType: "image/webp", extension: ".webp" });
  });

  it("rejects arbitrary content and truncated signatures", () => {
    expect(detectSupportedImage(new TextEncoder().encode("not an image"))).toBeNull();
    expect(detectSupportedImage(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeNull();
  });
});
