"""cli entrypoint for future tokenizer."""

import argparse
from pathlib import Path

from .tui.app import run


def main():
    parser = argparse.ArgumentParser(
        description="future tokenizer - graph-based thinking for plans"
    )
    parser.add_argument(
        "canvas",
        nargs="?",
        help="path to canvas json file (creates new if doesn't exist)",
    )
    parser.add_argument(
        "--skills-dir",
        "-s",
        help="path to skills directory (default: ../runeforge/canvas)",
    )
    parser.add_argument(
        "--mock",
        "-m",
        action="store_true",
        help="use mock client (no api calls, for testing)",
    )

    args = parser.parse_args()
    run(canvas_path=args.canvas, skills_dir=args.skills_dir, mock=args.mock)


if __name__ == "__main__":
    main()
