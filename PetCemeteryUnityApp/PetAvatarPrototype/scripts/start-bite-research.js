import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(scriptDir, "..");
const repositoryRoot = path.resolve(prototypeRoot, "..", "..");
const adapter = path.join(prototypeRoot, "scripts", "bite_research_adapter.py");
const biteRoot = path.join(prototypeRoot, ".runtime", "BITEGradio");

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function validatePython(executable) {
  const result = spawnSync(
    executable,
    [adapter, "--help"],
    { encoding: "utf8", windowsHide: true, timeout: 30_000 },
  );
  return result.status === 0
    ? { ok: true }
    : { ok: false, error: (result.stderr || result.stdout || result.error?.message || "unknown error").trim() };
}

function resolveExecutable() {
  const candidates = [
    process.env.PET_AVATAR_BITE_EXECUTABLE,
    path.join(repositoryRoot, ".tmp", "bite-env-official", "python.exe"),
    path.join(prototypeRoot, ".runtime", "envs", "bite", "python.exe"),
  ].filter(Boolean);
  const failures = [];
  for (const candidate of [...new Set(candidates.map((value) => path.resolve(value)))]) {
    if (!isFile(candidate)) {
      failures.push(`${candidate}: file not found`);
      continue;
    }
    const validation = validatePython(candidate);
    if (validation.ok) return candidate;
    failures.push(`${candidate}: ${validation.error}`);
  }
  throw new Error(
    "No usable BITE Python runtime was found. Expected the prepared research environment or "
      + "PET_AVATAR_BITE_EXECUTABLE. Checked:\n- " + failures.join("\n- "),
  );
}

if (!isFile(adapter)) throw new Error(`BITE adapter not found: ${adapter}`);
if (!existsSync(biteRoot)) throw new Error(`BITE model runtime not found: ${biteRoot}`);

const executable = resolveExecutable();
process.env.PET_AVATAR_PROVIDER = "bite-d-smal";
process.env.PET_AVATAR_BITE_LICENSE_MODE = "research";
process.env.PET_AVATAR_BITE_EXECUTABLE = executable;
process.env.PET_AVATAR_BITE_ADAPTER = adapter;

const runtime = {
  provider: process.env.PET_AVATAR_PROVIDER,
  licenseMode: process.env.PET_AVATAR_BITE_LICENSE_MODE,
  executable,
  adapter,
  biteRoot,
  host: process.env.PET_AVATAR_HOST ?? "127.0.0.1",
  port: Number.parseInt(process.env.PET_AVATAR_PORT ?? "4177", 10),
};

if (process.argv.includes("--check")) {
  console.log(JSON.stringify(runtime, null, 2));
} else {
  console.warn("BITE research mode is non-commercial and must not be used as production licensing permission.");
  await import("../src/main.js");
}
