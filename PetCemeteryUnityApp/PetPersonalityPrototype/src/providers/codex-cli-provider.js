import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export class CodexCliProvider {
  constructor(config, { spawnImplementation = spawn } = {}) {
    this.config = config;
    this.spawnImplementation = spawnImplementation;
    this.name = `codex-cli:${config.model}`;
  }

  async generate({ instructions, input, outputSchema }) {
    const text = input
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n\n")
      .trim();
    const localImages = input.filter((item) => item.type === "localImage");
    for (const image of localImages) {
      if (!path.isAbsolute(image.path)) {
        throw new Error("Codex transport accepts only prepared absolute image paths.");
      }
    }

    await mkdir(this.config.scratchDir, { recursive: true });
    const transportDir = await mkdtemp(path.join(this.config.scratchDir, "request-"));
    const schemaPath = path.join(transportDir, "output-schema.json");
    try {
      await writeFile(schemaPath, JSON.stringify(outputSchema), "utf8");
      const invocation = resolveCodexCliInvocation(this.config.command);
      const args = [
        ...invocation.commandArgs,
        ...buildCodexExecArguments(this.config, schemaPath, localImages),
      ];
      const startedAt = performance.now();
      const eventStream = await executeProcess({
        command: invocation.command,
        args,
        cwd: transportDir,
        input: buildProviderPrompt(instructions, text),
        timeoutMs: this.config.timeoutMs,
        maxOutputBytes: this.config.maxOutputBytes ?? MAX_OUTPUT_BYTES,
        spawnImplementation: this.spawnImplementation,
      });
      const result = parseCodexJsonOutput(eventStream);
      return {
        output: result.output,
        elapsedMs: Math.round(performance.now() - startedAt),
        usage: result.usage,
      };
    } finally {
      await rm(transportDir, { recursive: true, force: true });
    }
  }
}

export function buildCodexExecArguments(config, schemaPath, localImages = []) {
  const args = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--json",
    "--model",
    config.model,
    "--config",
    `model_reasoning_effort=${config.effort}`,
  ];
  for (const image of localImages) {
    args.push("--image", image.path);
  }
  args.push("--output-schema", schemaPath, "-");
  return args;
}

export function parseCodexJsonOutput(eventStream) {
  let output = "";
  let rawUsage = null;
  for (const line of String(eventStream).split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      event.type === "item.completed" &&
      event.item?.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      output = event.item.text;
    }
    if (event.type === "turn.completed" && event.usage) {
      rawUsage = event.usage;
    }
  }
  if (!output.trim()) {
    throw providerError("Codex CLI event stream не содержит итогового ответа.");
  }
  const inputTokens = Number(rawUsage?.input_tokens ?? 0);
  const visibleOutputTokens = Number(rawUsage?.output_tokens ?? 0);
  const reasoningTokens = Number(rawUsage?.reasoning_output_tokens ?? 0);
  return {
    output: output.trim(),
    usage: {
      input_tokens: inputTokens,
      cached_input_tokens: Number(rawUsage?.cached_input_tokens ?? 0),
      output_tokens: visibleOutputTokens + reasoningTokens,
      visible_output_tokens: visibleOutputTokens,
      reasoning_output_tokens: reasoningTokens,
      total_tokens: inputTokens + visibleOutputTokens + reasoningTokens,
    },
  };
}

export function resolveCodexCliInvocation(command) {
  if (process.platform !== "win32") {
    return { command, commandArgs: [] };
  }
  const resolvedCommand = resolveWindowsCommand(command);
  if (!/\.cmd$/iu.test(resolvedCommand)) {
    return { command: resolvedCommand, commandArgs: [] };
  }
  const codexEntrypoint = path.join(
    path.dirname(resolvedCommand),
    "node_modules",
    "@openai",
    "codex",
    "bin",
    "codex.js",
  );
  if (!existsSync(codexEntrypoint)) {
    throw new Error(`Не удалось безопасно разрешить Codex CLI за ${resolvedCommand}.`);
  }
  return { command: process.execPath, commandArgs: [codexEntrypoint] };
}

function buildProviderPrompt(instructions, text) {
  return [
    "Provider constraints: return only the requested structured result. Do not inspect files, run tools, edit files, or ask for approval.",
    "",
    "Domain instructions:",
    instructions,
    "",
    "Task:",
    text,
  ].join("\n");
}

function executeProcess({
  command,
  args,
  cwd,
  input,
  timeoutMs,
  maxOutputBytes,
  spawnImplementation,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImplementation(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(
        reject,
        providerError(`Codex CLI превысил таймаут ${Math.ceil(timeoutMs / 1000)} секунд.`),
      );
    }, timeoutMs);

    child.once("error", (error) => finish(reject, providerError(error.message)));
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, "utf8") > maxOutputBytes) {
        child.kill();
        finish(reject, providerError("Ответ Codex CLI превысил допустимый размер."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-16_384);
    });
    child.once("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim() ? ` ${stderr.trim()}` : "";
        finish(reject, providerError(`Codex CLI завершился с кодом ${code}.${detail}`));
        return;
      }
      const output = stdout.trim();
      if (!output) {
        finish(reject, providerError("Codex CLI вернул пустой ответ."));
        return;
      }
      finish(resolve, output);
    });
    child.stdin.end(input, "utf8");
  });
}

function providerError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  return error;
}

function resolveWindowsCommand(command) {
  if (path.isAbsolute(command) || existsSync(command)) {
    return command;
  }
  const extensions = path.extname(command) ? [""] : [".exe", ".cmd"];
  const entries = (process.env.Path || process.env.PATH || "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const entry of entries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}
