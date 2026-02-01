"""cli entrypoint for runeforge canvas."""

import argparse
from pathlib import Path

from .app import run


def main():
    parser = argparse.ArgumentParser(
        description="runeforge canvas - graph-based thinking for plans"
    )
    parser.add_argument(
        "canvas",
        nargs="?",
        help="path to canvas json file (creates new if doesn't exist)",
    )
    parser.add_argument(
        "--skills-dir",
        "-s",
        help="path to skills directory (default: ../runeforge/public)",
    )

    args = parser.parse_args()
    run(canvas_path=args.canvas, skills_dir=args.skills_dir)


if __name__ == "__main__":
    main()
