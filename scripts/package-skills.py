#!/usr/bin/env python3
"""Build deterministic, standalone Skill ZIPs using only Python's standard library."""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PLUGINS = ROOT / "plugins"
EXCLUDED = {".git", "node_modules", "__pycache__", ".DS_Store", ".gitignore", "reports", "fixtures"}


def payload_files(skill):
    for path in sorted(skill.rglob("*")):
        parts = path.relative_to(skill).parts
        if path.is_symlink():
            raise ValueError(f"Symlink is not portable: {path}")
        if any(part in EXCLUDED for part in parts):
            continue
        if path.is_file():
            if path.name.endswith((".test.js", ".pyc", ".pyo")):
                continue
            if path.name == ".env" or path.name.startswith(".env."):
                raise ValueError(f"Environment file must not ship: {path}")
            yield path


def write_zip(path, files):
    with zipfile.ZipFile(path, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, (content, executable) in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100755 if executable else 0o100644) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)


def skill_directories():
    names = set()
    for plugin in sorted(PLUGINS.iterdir()):
        if plugin.is_symlink() or not plugin.is_dir():
            raise ValueError(f"Invalid plugin directory: {plugin}")
        root = plugin / "skills"
        if root.is_symlink() or not root.is_dir():
            raise ValueError(f"Invalid skills directory: {root}")
        for skill in sorted(root.iterdir()):
            if skill.is_symlink() or not skill.is_dir() or not (skill / "SKILL.md").is_file():
                raise ValueError(f"Invalid skill directory: {skill}")
            if skill.name in names:
                raise ValueError(f"Duplicate Skill name across plugins: {skill.name}")
            names.add(skill.name)
            yield skill


def build(output):
    if output == PLUGINS or PLUGINS in output.parents:
        raise ValueError("Output must be outside the plugin source tree")
    skills = list(skill_directories())
    version = json.loads((ROOT / "package.json").read_text())["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Release version must be stable semver")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=ROOT))
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Output must be empty to avoid stale artifacts: {output}")
    output.mkdir(parents=True, exist_ok=True)
    release = {"version": version, "commit": commit, "dirty": dirty, "skills": []}
    for skill in skills:
        files = {f"{skill.name}/{p.relative_to(skill).as_posix()}": (p.read_bytes(), bool(p.stat().st_mode & 0o111)) for p in payload_files(skill)}
        files.setdefault(f"{skill.name}/LICENSE", ((ROOT / "LICENSE").read_bytes(), False))
        source = {"repository": "https://github.com/MaybeLL/ai-toolkit", "path": skill.relative_to(ROOT).as_posix(), "version": version, "commit": commit, "dirty": dirty}
        files[f"{skill.name}/SOURCE.json"] = ((json.dumps(source, indent=2) + "\n").encode(), False)
        archive = output / f"{skill.name}-{version}.zip"
        write_zip(archive, files)
        release["skills"].append({"name": skill.name, "archive": archive.name, "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "files": len(files)})
    manifest = output / "release.json"
    manifest.write_text(json.dumps(release, indent=2) + "\n")
    artifacts = sorted(output.iterdir())
    (output / "SHA256SUMS").write_text("".join(f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n" for path in artifacts))
    print(f"Built {len(release['skills'])} standalone skills in {output} (dirty={dirty})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    build(parser.parse_args().output.resolve())
