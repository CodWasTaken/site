import { access, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(repositoryRoot, ".data");
const explicitPath = process.env.PERKCOMMONS_DATA_REPOSITORY_PATH?.trim();
const siblingPath = resolve(repositoryRoot, "../data");
for (const localPath of [explicitPath, siblingPath].filter(Boolean)) {
  try {
    await access(resolve(localPath, "opportunities"));
    console.log(`Using isolated local data checkout at ${localPath}.`);
    process.exit(0);
  } catch {
    if (explicitPath === localPath) {
      throw new Error(`PERKCOMMONS_DATA_REPOSITORY_PATH does not contain opportunities/: ${localPath}`);
    }
  }
}

const dataRepository = process.env.PERKCOMMONS_DATA_REPOSITORY?.trim();
if (!dataRepository) {
  throw new Error(
    "No isolated data checkout found. Set PERKCOMMONS_DATA_REPOSITORY to a verified fork URL; official repositories are not accepted.",
  );
}
if (/github\.com[/:]PerkCommons\//i.test(dataRepository)) {
  throw new Error("Refusing to clone an official PerkCommons repository in fork-only mode.");
}
const dataRef = process.env.PERKCOMMONS_DATA_REF?.trim();

await rm(destination, { recursive: true, force: true });

try {
  await new Promise((resolveClone, rejectClone) => {
    const clone = spawn(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--single-branch",
        ...(dataRef ? ["--branch", dataRef] : []),
        dataRepository,
        destination,
      ],
      {
        cwd: repositoryRoot,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
        stdio: "inherit",
      },
    );

    clone.once("error", rejectClone);
    clone.once("close", (code, signal) => {
      if (code === 0) {
        resolveClone();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
      rejectClone(new Error(`git clone ended with ${reason}`));
    });
  });
} catch (error) {
  await rm(destination, { recursive: true, force: true });
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`Failed to fetch PerkCommons data from ${dataRepository}: ${reason}`);
  process.exitCode = 1;
}
