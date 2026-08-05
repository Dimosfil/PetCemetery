import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { materializeFile, validateMediaUpload } from "../domain/media-input.js";
import { VideoFrameExtractor } from "./video-frame-extractor.js";

const PHOTO_EXTENSION = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);
const VIDEO_EXTENSION = new Map([
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
  ["video/webm", ".webm"],
  ["video/x-matroska", ".mkv"],
  ["video/x-msvideo", ".avi"],
]);

export class FrameMediaPreparer {
  constructor(mediaConfig, { frameExtractor } = {}) {
    this.config = mediaConfig;
    this.frameExtractor = frameExtractor ?? new VideoFrameExtractor({
      ffmpegPath: mediaConfig.ffmpegPath,
      ffprobePath: mediaConfig.ffprobePath,
      maxDurationSec: mediaConfig.maxVideoDurationSec,
      maxFrames: mediaConfig.maxFramesPerVideo,
    });
  }

  async prepare(rawInput) {
    const input = validateMediaUpload(rawInput, this.config);
    const runDir = this.createRunDirectory();
    await mkdir(runDir, { recursive: true });

    try {
      const photos = await Promise.all(input.photos.map(materializeFile));
      const videos = await Promise.all(input.videos.map(materializeFile));
      const mediaManifest = [];
      const visualInputs = [];

      for (const [index, photo] of photos.entries()) {
        const sourceId = `photo-${index + 1}`;
        const filePath = path.join(runDir, `${sourceId}${PHOTO_EXTENSION.get(photo.mimeType)}`);
        await writeFile(filePath, photo.buffer);
        mediaManifest.push({
          kind: "photo",
          name: photo.name,
          mimeType: photo.mimeType,
          size: photo.size,
          sha256: photo.sha256,
          sourceIds: [sourceId],
        });
        visualInputs.push({
          sourceId,
          label: `${sourceId}; статическая фотография ${index + 1}`,
          mimeType: photo.mimeType,
          buffer: photo.buffer,
          path: filePath,
        });
      }

      for (const [index, video] of videos.entries()) {
        const videoId = `video-${index + 1}`;
        const videoPath = path.join(runDir, `${videoId}${VIDEO_EXTENSION.get(video.mimeType)}`);
        await writeFile(videoPath, video.buffer);
        const extracted = await this.frameExtractor.extract(
          videoPath,
          path.join(runDir, `${videoId}-frames`),
        );
        const sourceIds = [];
        for (const [frameIndex, frame] of extracted.frames.entries()) {
          const sourceId = `${videoId}-frame-${String(frameIndex + 1).padStart(3, "0")}`;
          sourceIds.push(sourceId);
          visualInputs.push({
            sourceId,
            label: `${sourceId}; видео ${index + 1}; приблизительный таймкод ${frame.timestampSec} с`,
            mimeType: "image/jpeg",
            buffer: await readFile(frame.path),
            path: frame.path,
          });
        }
        mediaManifest.push({
          kind: "video",
          name: video.name,
          mimeType: video.mimeType,
          size: video.size,
          sha256: video.sha256,
          durationSec: extracted.durationSec,
          frameCount: extracted.frames.length,
          sourceIds,
        });
      }

      return {
        input: {
          petName: input.petName,
          species: input.species,
          ownerContext: input.ownerContext,
        },
        mediaManifest,
        visualInputs,
        cleanup: () => this.cleanup(runDir),
      };
    } catch (error) {
      await this.cleanup(runDir);
      throw error;
    }
  }

  createRunDirectory() {
    const scratchRoot = path.resolve(this.config.scratchDir);
    const runDir = path.resolve(scratchRoot, randomUUID());
    if (!runDir.startsWith(`${scratchRoot}${path.sep}`)) {
      throw new Error("Некорректная временная директория анализа.");
    }
    return runDir;
  }

  async cleanup(runDir) {
    if (!this.config.keepUploads) {
      await rm(runDir, { recursive: true, force: true });
    }
  }
}
