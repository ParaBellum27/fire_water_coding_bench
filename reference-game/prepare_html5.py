"""Fetch the pinned community mirror and reproduce our declared startup patches.

Only this script, the startup adapters, and provenance belong in Git. The fetched
upstream bundle and assets remain in the ignored html5 directory.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile
import tempfile
import urllib.request


ROOT = Path(__file__).resolve().parent
PROVENANCE = json.loads((ROOT / "local-provenance.json").read_text(encoding="utf-8"))
BUNDLE = "fireboy-and-watergirl-forest-temple.min.js"
ADAPTERS = (PROVENANCE["entry"], PROVENANCE["adapter"], "local-provenance.json")


def check_hash(path, expected):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != expected:
        raise ValueError(f"Unexpected SHA-256 for {path}: {actual}; expected {expected}")


def check_reference(target):
    check_hash(target / BUNDLE, PROVENANCE["original_bundle_sha256"])
    check_hash(target / "runtime.bundle.js", PROVENANCE["runtime_bundle_sha256"])
    for name in ADAPTERS:
        if (target / name).read_bytes() != (ROOT / name).read_bytes():
            raise ValueError(f"Existing reference adapter/provenance differs: {target / name}")
    for name in ("assets", "data", "bower_components/requirejs/require.js", "version.js"):
        if not (target / name).exists():
            raise ValueError(f"Reference is missing {target / name}")


def prepare(target):
    if target.exists() or target.is_symlink():
        check_reference(target)
        print(f"Verified existing reference; left untouched: {target}")
        return

    target.parent.mkdir(parents=True, exist_ok=True)
    commit = PROVENANCE["commit"]
    url = f"{PROVENANCE['source']}/archive/{commit}.tar.gz"
    prefix = f"fireboy-and-watergirl-1-forest-temple-{commit}"
    with tempfile.TemporaryDirectory(prefix="reference-setup-", dir=target.parent) as temporary:
        temporary = Path(temporary)
        archive_path = temporary / "upstream.tar.gz"
        request = urllib.request.Request(url, headers={"User-Agent": "forest-temple-reference-setup"})
        with urllib.request.urlopen(request, timeout=120) as response, archive_path.open("wb") as output:
            shutil.copyfileobj(response, output)
        staging = temporary / "html5"
        staging.mkdir()
        with tarfile.open(archive_path, "r:gz") as archive:
            for member in archive:
                path = PurePosixPath(member.name)
                if path.is_absolute() or ".." in path.parts or not path.parts or path.parts[0] != prefix:
                    raise ValueError(f"Unexpected archive path: {member.name}")
                relative = Path(*path.parts[1:])
                destination = staging / relative
                if member.isdir():
                    destination.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, destination.open("wb") as output:
                        shutil.copyfileobj(source, output)
                else:
                    raise ValueError(f"Unsupported archive member: {member.name}")

        original = staging / BUNDLE
        check_hash(original, PROVENANCE["original_bundle_sha256"])
        source = original.read_text(encoding="utf-8")
        for before, after in PROVENANCE["bundle_changes"].items():
            if source.count(before) != 1:
                raise ValueError(f"Unexpected upstream patch occurrence count: {before}")
            source = source.replace(before, after)
        (staging / "runtime.bundle.js").write_text(source, encoding="utf-8")
        for name in ADAPTERS:
            shutil.copyfile(ROOT / name, staging / name)
        check_reference(staging)
        # Never replace an existing reference, including one created during download.
        if target.exists() or target.is_symlink():
            raise ValueError(f"Target appeared during setup; refusing to replace it: {target}")
        staging.rename(target)
    print(f"Prepared pinned reference at {target}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", type=Path, default=ROOT / "html5", help="Output directory (default: repository reference-game/html5)")
    args = parser.parse_args()
    try:
        prepare(args.target.resolve())
    except (OSError, ValueError, tarfile.TarError) as error:
        parser.exit(1, f"Reference setup failed; existing reference was not overwritten: {error}\n")


if __name__ == "__main__":
    main()
