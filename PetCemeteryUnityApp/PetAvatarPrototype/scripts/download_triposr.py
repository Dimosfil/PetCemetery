from __future__ import annotations

import argparse
from pathlib import Path

from huggingface_hub import snapshot_download


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    args.destination.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id="stabilityai/TripoSR",
        local_dir=args.destination,
        allow_patterns=["config.yaml", "model.ckpt"],
    )
    print(args.destination.resolve())


if __name__ == "__main__":
    main()
