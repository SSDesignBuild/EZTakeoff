#!/usr/bin/env python3
"""Package tracked working source and an existing dist build; never run a build."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
from datetime import datetime, timezone
import zipfile


OMIT_DIRS = {
    "node_modules", "dist", ".git", ".netlify", ".cache", ".qa", "qa",
    "logs", "private", "private-qa", "private_qa", "qa-artifacts", "qa_artifacts",
    "test-results", "playwright-report", "qa-screenshots", "qa_screenshots",
    "customer-data", "customer_data", "customer-photos", "customer_photos",
    "client-photos", "client_photos",
}
FEATURES = {
    "Application entry": ["src/App.tsx", "src/main.tsx"],
    "Consultation workflow": ["src/components/ConsultationStudio.tsx", "src/lib/consultationProject.ts"],
    "Finish controls": ["src/components/ConsultationFinishDock.tsx", "src/lib/consultationFinishDock.ts"],
    "3D scene": ["src/components/Consultation3D.tsx"],
    "Estimator handoff": ["src/lib/estimatingBridge.ts", "src/lib/consultationTakeoffBridge.ts", "docs/ESTIMATOR_BRIDGE_V1.md"],
    "Site concrete": ["src/lib/siteConcrete.ts", "src/components/SiteConcretePlanSheet.tsx", "src/lib/siteConcretePlanLayout.ts"],
    "Lighting": ["src/lib/lightingAddons.ts", "src/data/lightingCatalog.ts", "src/components/visual3d/LightingAddons3D.tsx"],
    "Build and checks": ["package.json", "package-lock.json", "netlify.toml"],
    "Current project notes": ["docs/PROJECT_CONTINUATION.md", "docs/DEVELOPMENT_WORKFLOW.md", "docs/CONSULTATION_ARCHITECTURE.md"],
}


def omitted(name, build=False):
    path = PurePosixPath(name)
    parts, leaf = [part.lower() for part in path.parts], path.name.lower()
    private_fixture = (any("fixture" in part for part in parts) and any(
        word in part for part in parts for word in ("private", "customer", "client", "qa")))
    return (bool(set(parts[:-1]) & OMIT_DIRS) or private_fixture
            or (leaf.startswith(".env") and not leaf.endswith(".example"))
            or leaf.endswith((".tsbuildinfo", ".log")) or ".log." in leaf
            or leaf in {"vite.config.js", "vite.config.d.ts"}
            or (build and leaf.endswith((".map", ".ts", ".tsx", ".jsx"))))


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def digest_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path, help="ZIP path outside this repository")
    parser.add_argument("--verification", type=Path, help="External JSON object containing verification evidence")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]

    def git(*arguments):
        return subprocess.run(["git", "-C", str(root), *arguments], check=True,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

    def names(*arguments):
        return {name.decode("utf-8") for name in git(*arguments).split(b"\0") if name}

    root = Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve()
    output = args.output.expanduser().resolve()
    if output.is_relative_to(root) or output.is_dir():
        raise ValueError("--output must be a file outside the repository")
    verification = {}
    if args.verification:
        evidence = args.verification.expanduser().resolve()
        if evidence.is_relative_to(root) or evidence == output:
            raise ValueError("--verification must be outside the repository and separate from --output")
        verification = json.loads(evidence.read_text(encoding="utf-8"))
        if not isinstance(verification, dict):
            raise ValueError("--verification must contain a JSON object")
    dist = root / "dist"
    if not (dist / "index.html").is_file():
        raise ValueError("dist/index.html is required; build the application before packaging")
    tracked = names("ls-files", "-z")
    selected = sorted(name for name in tracked if not omitted(name))
    source = [(name, root / name) for name in selected
              if (root / name).exists() or (root / name).is_symlink()]
    build = [(path.relative_to(dist).as_posix(), path) for path in sorted(dist.rglob("*"))
             if (path.is_symlink() or not path.is_dir())
             and not omitted(path.relative_to(dist).as_posix(), build=True)]
    for name, path in source + build:
        if ("\n" in name or "\r" in name or path.is_symlink() or not path.is_file()
                or not path.resolve().is_relative_to(root)):
            raise ValueError(f"Unsupported or unsafe snapshot entry: {name}")
    if "index.html" not in {name for name, _ in build}:
        raise ValueError("The build snapshot must contain index.html")
    changed = names("diff", "--no-ext-diff", "--name-only", "--no-renames", "-z", "HEAD", "--")
    deleted = names("diff", "--no-ext-diff", "--diff-filter=D", "--name-only", "-z", "HEAD", "--")
    source_names = {name for name, _ in source}
    included_changes = sorted(changed & source_names)
    included_deletions = sorted(name for name in deleted if not omitted(name))
    commit = git("rev-parse", "HEAD").decode().strip()
    checkpoint = {
        "schema_version": 1, "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "git": {"commit": commit, "tree": git("rev-parse", "HEAD^{tree}").decode().strip(),
                "branch": git("branch", "--show-current").decode().strip() or "(detached HEAD)",
                "has_tracked_changes": bool(changed),
                "dirty_changes_included": bool(included_changes or included_deletions),
                "included_changed_files": included_changes, "included_deleted_files": included_deletions,
                "untracked_files_omitted_count": len(names("ls-files", "--others", "--exclude-standard", "-z"))},
        "source": {"directory": "source/", "file_count": len(source),
                   "provenance": "Current bytes of tracked working-tree files; HEAD tree is the base, not a dirty snapshot tree.",
                   "excluded_tracked_files": sorted(name for name in tracked if omitted(name))},
        "build": {"directory": "build/", "file_count": len(build),
                  "provenance": "Existing dist/ at packaging time; this script does not build or establish its source commit."},
        "verification": verification,
        "verification_provenance": "Caller-supplied evidence; not independently verified by this script.",
    }
    start = f"""# EZTakeoff source and build checkpoint

Read `CHECKPOINT.json` first, then `VERIFICATION.md` and `FILE_MAP.md`. Inspect only
the files relevant to the next requested change; do not load all source or old chat
history into the conversation. This package helps resume work; it does not remove
conversation limits or guarantee what an attachment system loads automatically.

## Resume safely

Compare the current GitHub `SSDesignBuild/EZTakeoff` main commit and Netlify's
published production commit for `https://eztakeoff.netlify.app` before editing.
The packaged source base is `{commit}`. A ZIP can become stale: preserve newer
work and any local changes. Read the current project continuation notes only as
needed, and record the next concrete task in the next checkpoint.

## Package contents and provenance

- `source/`: tracked working bytes, including dirty changes listed in the checkpoint.
  Tracked deletions are represented by absent files and recorded in the checkpoint.
  Untracked files, dependencies, private QA/customer fixtures, secrets represented by
  `.env` files (except examples), logs, generated source artifacts, and Git history
  are omitted. Review the source before sharing; exclusion rules are not a secret scan.
- `build/`: the existing `dist/` output, including `index.html`; source maps and
  source-only artifacts are omitted. The packaging timestamp is not a build timestamp.
  Matching this build to source or a deployment requires the supplied evidence.
- `MANIFEST.sha256`: SHA-256 of every other archive entry. It excludes itself;
  the printed archive SHA-256 covers the complete ZIP, including this manifest.

## Rebuild and release

From `source/`, run `npm ci`, then:

```sh
npm run assets:sync && npm test && npm run build
```

Manufacturer asset synchronization needs its configured network access. Use Netlify
as the only automatic CI/build provider; keep GitHub Actions manual-only. A valid ZIP
does not establish passing application tests, a Ready preview, or a live release.
Verify those separately and confirm published production matches current main.
"""
    file_map = "# File map\n\nRead only the paths relevant to the task. Paths below are relative to `source/`.\n\n| Area | Files |\n| --- | --- |\n"
    for area, candidates in FEATURES.items():
        paths = [f"`{name}`" for name in candidates if name in source_names]
        if paths:
            file_map += f"| {area} | {', '.join(paths)} |\n"
    verification_doc = """# Verification

## Packaging checks

Successful creation requires `dist/index.html`, regular source/build files, an
external output path, and a passing ZIP CRC check (`ZipFile.testzip`). Content
checksums are in `MANIFEST.sha256`. The script does not install dependencies,
run application tests, build the app, contact GitHub/Netlify, or verify deployment.

## Supplied evidence

"""
    verification_doc += ("The following JSON was supplied by the caller. Its claims were not independently checked by this script.\n\n```json\n"
                         + json_bytes(verification).decode() + "```\n" if verification else
                         "No evidence supplied. Application tests, build freshness/source match, GitHub main, Netlify preview, and published production are unverified.\n")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(prefix=".eztakeoff-checkpoint-", suffix=".zip", dir=output.parent, delete=False) as handle:
            temporary = Path(handle.name)
        manifest = []
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            def add_bytes(name, content):
                archive.writestr(name, content)
                manifest.append(f"{hashlib.sha256(content).hexdigest()}  {name}\n")

            for prefix, entries in (("source", source), ("build", build)):
                for name, path in entries:
                    # Read once: the manifest hashes the exact bytes written, even if a file changes later.
                    content = path.read_bytes()
                    info = zipfile.ZipInfo.from_file(path, arcname=f"{prefix}/{name}", strict_timestamps=False)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(info, content)
                    manifest.append(f"{hashlib.sha256(content).hexdigest()}  {prefix}/{name}\n")
            for name, content in (("START_HERE.md", start.encode()), ("CHECKPOINT.json", json_bytes(checkpoint)),
                                  ("FILE_MAP.md", file_map.encode()), ("VERIFICATION.md", verification_doc.encode())):
                add_bytes(name, content)
            archive.writestr("MANIFEST.sha256", "".join(sorted(manifest)).encode())
        with zipfile.ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"ZIP integrity check failed: {bad}")
        os.replace(temporary, output)
        print(json.dumps({"output": str(output), "bytes": output.stat().st_size,
                          "sha256": digest_file(output), "source_files": len(source),
                          "build_files": len(build), "total_files": len(manifest) + 1}))
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Checkpoint packaging failed: {error}") from None
