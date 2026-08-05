import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "../domain/questionnaire.js";

const execFileAsync = promisify(execFile);

export class VideoFrameExtractor {
  constructor({ ffmpegPath, ffprobePath, maxDurationSec, maxFrames }) {
    this.ffmpegPath = ffmpegPath;
    this.ffprobePath = ffprobePath;
    this.maxDurationSec = maxDurationSec;
    this.maxFrames = maxFrames;
  }

  async extract(videoPath, outputDir) {
    await mkdir(outputDir, { recursive: true });
    let probe;
    try {
      const result = await execFileAsync(
        this.ffprobePath,
        ["-v", "error", "-show_entries", "format=duration", "-of", "json", videoPath],
        { timeout: 30_000, windowsHide: true, maxBuffer: 1024 * 1024 },
      );
      probe = JSON.parse(result.stdout);
    } catch (error) {
      throw new ValidationError(`Не удалось прочитать видео: ${error.message}`);
    }

    const durationSec = Number(probe?.format?.duration);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      throw new ValidationError("У видео не удалось определить длительность.");
    }
    if (durationSec > this.maxDurationSec) {
      throw new ValidationError(
        `Видео длиннее лимита ${this.maxDurationSec} секунд. Разделите его на наблюдаемые эпизоды.`,
      );
    }

    const requestedFrames = Math.min(this.maxFrames, Math.max(2, Math.ceil(durationSec / 2)));
    const framesPerSecond = requestedFrames / durationSec;
    const outputPattern = path.join(outputDir, "frame-%03d.jpg");
    try {
      await execFileAsync(
        this.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          videoPath,
          "-vf",
          `fps=${framesPerSecond},scale=960:-2:force_original_aspect_ratio=decrease`,
          "-frames:v",
          String(requestedFrames),
          "-q:v",
          "3",
          "-an",
          outputPattern,
        ],
        { timeout: 120_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (error) {
      throw new ValidationError(`Не удалось извлечь кадры видео: ${error.message}`);
    }

    const files = (await readdir(outputDir))
      .filter((name) => /^frame-\d{3}\.jpg$/u.test(name))
      .sort();
    if (files.length === 0) {
      throw new ValidationError("Из видео не извлечено ни одного кадра.");
    }

    return {
      durationSec: Math.round(durationSec * 100) / 100,
      frames: files.map((name, index) => ({
        path: path.join(outputDir, name),
        timestampSec:
          files.length === 1
            ? 0
            : Math.round(((index * durationSec) / (files.length - 1)) * 100) / 100,
      })),
    };
  }
}
