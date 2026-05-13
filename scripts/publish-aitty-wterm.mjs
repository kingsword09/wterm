#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const sourceCoreDir = join(root, "packages", "@wterm", "core");
const sourceDomDir = join(root, "packages", "@wterm", "dom");
const publishRoot = join(root, "dist", "aitty-wterm-publish");

const corePackageName = "@aitty/wterm-core";
const domPackageName = "@aitty/wterm-dom";
const upstreamCorePackageName = "@wterm/core";
const upstreamDomPackageName = "@wterm/dom";

const textExtensions = new Set([
  ".cjs",
  ".d.ts",
  ".js",
  ".json",
  ".mjs",
  ".map",
  ".md",
  ".ts",
]);

function parseArgs(argv) {
  const options = {
    access: "public",
    allowDirty: false,
    build: true,
    dryRun: true,
    otp: "",
    registry: "",
    runTests: false,
    tag: "latest",
    version: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    } else if (arg === "--publish") {
      options.dryRun = false;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--no-build") {
      options.build = false;
    } else if (arg === "--test") {
      options.runTests = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--version") {
      options.version = readArgValue(argv, ++i, arg);
    } else if (arg.startsWith("--version=")) {
      options.version = arg.slice("--version=".length);
    } else if (arg === "--tag") {
      options.tag = readArgValue(argv, ++i, arg);
    } else if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length);
    } else if (arg === "--otp") {
      options.otp = readArgValue(argv, ++i, arg);
    } else if (arg.startsWith("--otp=")) {
      options.otp = arg.slice("--otp=".length);
    } else if (arg === "--registry") {
      options.registry = readArgValue(argv, ++i, arg);
    } else if (arg.startsWith("--registry=")) {
      options.registry = arg.slice("--registry=".length);
    } else if (arg === "--access") {
      options.access = readArgValue(argv, ++i, arg);
    } else if (arg.startsWith("--access=")) {
      options.access = arg.slice("--access=".length);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function readArgValue(argv, index, name) {
  const value = argv[index];

  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }

  return value;
}

function printHelp() {
  console.log(`Prepare or publish the aitty-scoped wterm fork packages.

The source packages stay named @wterm/core and @wterm/dom so this branch can
continue rebasing on upstream wterm. This script creates temporary publish
packages under dist/aitty-wterm-publish with these names:

  ${corePackageName}
  ${domPackageName}

Examples:
  pnpm pack:aitty-wterm -- --version 0.3.1-aitty.0
  pnpm publish:aitty-wterm -- --version 0.3.1-aitty.0
  pnpm publish:aitty-wterm -- --version 0.3.1-aitty.1 --otp 123456

Options:
  --publish            Publish to npm. Without this flag, npm pack --dry-run is used.
  --dry-run            Prepare packages and run npm pack --dry-run. This is the default.
  --version <version>  Version for both fork packages. Defaults to <source-version>-aitty.0.
  --tag <tag>          npm dist-tag. Defaults to latest.
  --access <access>    npm access. Defaults to public.
  --otp <code>         Pass an npm two-factor auth code.
  --registry <url>     Publish to a custom npm registry.
  --test               Run focused core/dom tests before preparing packages.
  --no-build           Skip Zig and TypeScript builds.
  --allow-dirty        Allow real publish from a dirty git worktree.
`);
}

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: process.env,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function defaultForkVersion(sourceVersion) {
  if (sourceVersion.includes("-aitty.")) {
    return sourceVersion;
  }

  return `${sourceVersion}-aitty.0`;
}

function assertValidVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid npm version: ${version}`);
  }
}

function ensureCleanGitWorktree() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error("Unable to inspect git status before publish");
  }

  if (result.stdout.trim()) {
    throw new Error(
      "Refusing to publish from a dirty git worktree. Commit the fork patch first, or pass --allow-dirty."
    );
  }
}

function buildSourcePackages(options) {
  run("zig", ["build", "-Doptimize=ReleaseSmall"]);
  cpSync(join(root, "zig-out", "bin", "wterm.wasm"), join(sourceCoreDir, "wasm", "wterm.wasm"));

  if (options.runTests) {
    run("zig", ["build", "test"]);
  }

  run("pnpm", ["--filter", upstreamCorePackageName, "build"]);
  run("pnpm", ["--filter", upstreamDomPackageName, "build"]);

  if (options.runTests) {
    run("pnpm", ["--filter", upstreamCorePackageName, "test"]);
    run("pnpm", ["--filter", upstreamDomPackageName, "test"]);
  }
}

function copyPackageFiles(sourceDir, targetDir, entries) {
  rmSync(targetDir, { force: true, recursive: true });
  mkdirSync(targetDir, { recursive: true });

  for (const entry of entries) {
    const source = join(sourceDir, entry);
    const target = join(targetDir, entry);

    if (!existsSync(source)) {
      throw new Error(`Missing required publish file: ${relative(root, source)}`);
    }

    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }

  cpSync(join(root, "LICENSE"), join(targetDir, "LICENSE"));
}

function prepareCorePackage(version) {
  const targetDir = join(publishRoot, "core");
  copyPackageFiles(sourceCoreDir, targetDir, ["dist", "wasm", "README.md"]);

  const sourcePackage = readJson(join(sourceCoreDir, "package.json"));
  const packageJson = {
    ...sourcePackage,
    name: corePackageName,
    version,
    repository: {
      type: "git",
      url: "git+https://github.com/kingsword09/wterm.git",
      directory: "packages/@wterm/core",
    },
    publishConfig: { access: "public" },
  };

  delete packageJson.scripts;
  delete packageJson.devDependencies;

  writeJson(join(targetDir, "package.json"), packageJson);
  rewritePublishedTextFiles(targetDir);
  verifyPackage(targetDir, { forbiddenText: ["workspace:"] });

  return targetDir;
}

function prepareDomPackage(version) {
  const targetDir = join(publishRoot, "dom");
  copyPackageFiles(sourceDomDir, targetDir, ["dist", "src/terminal.css", "README.md"]);

  const sourcePackage = readJson(join(sourceDomDir, "package.json"));
  const dependencies = { ...(sourcePackage.dependencies ?? {}) };
  delete dependencies[upstreamCorePackageName];
  dependencies[corePackageName] = version;

  const packageJson = {
    ...sourcePackage,
    name: domPackageName,
    version,
    dependencies,
    repository: {
      type: "git",
      url: "git+https://github.com/kingsword09/wterm.git",
      directory: "packages/@wterm/dom",
    },
    publishConfig: { access: "public" },
  };

  delete packageJson.scripts;
  delete packageJson.devDependencies;

  writeJson(join(targetDir, "package.json"), packageJson);
  rewritePublishedTextFiles(targetDir);
  verifyPackage(targetDir, {
    forbiddenText: ["workspace:", upstreamCorePackageName],
  });

  return targetDir;
}

function rewritePublishedTextFiles(dir) {
  for (const path of walkFiles(dir)) {
    if (!textExtensions.has(extname(path))) {
      continue;
    }

    const current = readFileSync(path, "utf8");
    const next = current
      .replaceAll(upstreamCorePackageName, corePackageName)
      .replaceAll(upstreamDomPackageName, domPackageName);

    if (next !== current) {
      writeFileSync(path, next);
    }
  }
}

function verifyPackage(dir, options) {
  const packageJson = readJson(join(dir, "package.json"));

  if (packageJson.name !== corePackageName && packageJson.name !== domPackageName) {
    throw new Error(`Unexpected package name in ${relative(root, dir)}: ${packageJson.name}`);
  }

  for (const text of options.forbiddenText) {
    verifyNoText(dir, text);
  }
}

function verifyNoText(dir, text) {
  for (const path of walkFiles(dir)) {
    if (!textExtensions.has(extname(path))) {
      continue;
    }

    const content = readFileSync(path, "utf8");

    if (content.includes(text)) {
      throw new Error(`Unexpected ${text} in ${relative(root, path)}`);
    }
  }
}

function* walkFiles(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      yield* walkFiles(path);
    } else if (stat.isFile()) {
      yield path;
    }
  }
}

function publishOrPack(dir, options) {
  if (options.dryRun) {
    run("npm", ["pack", "--dry-run"], { cwd: dir });
    return;
  }

  const args = ["publish", "--access", options.access, "--tag", options.tag];

  if (options.otp) {
    args.push("--otp", options.otp);
  }

  if (options.registry) {
    args.push("--registry", options.registry);
  }

  run("npm", args, { cwd: dir });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceCorePackage = readJson(join(sourceCoreDir, "package.json"));
  const version = options.version || defaultForkVersion(sourceCorePackage.version);

  assertValidVersion(version);

  if (!options.dryRun && !options.allowDirty) {
    ensureCleanGitWorktree();
  }

  if (options.build) {
    buildSourcePackages(options);
  }

  rmSync(publishRoot, { force: true, recursive: true });
  mkdirSync(publishRoot, { recursive: true });

  const coreDir = prepareCorePackage(version);
  const domDir = prepareDomPackage(version);

  console.log(`Prepared ${corePackageName}@${version}: ${relative(root, coreDir)}`);
  console.log(`Prepared ${domPackageName}@${version}: ${relative(root, domDir)}`);

  publishOrPack(coreDir, options);
  publishOrPack(domDir, options);

  if (options.dryRun) {
    console.log("Dry run complete. Re-run with --publish to publish to npm.");
    return;
  }

  console.log(`Published ${corePackageName}@${version} and ${domPackageName}@${version}.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
