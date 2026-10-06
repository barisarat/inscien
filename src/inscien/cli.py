"""The `inscien` command.

    inscien                      serve the app on a free loopback port and open the browser
    inscien serve [--port N] [--host H] [--no-browser]
    inscien build <pdf>          a paper PDF -> its library entry (the references the Map draws)
    inscien narrate <pdf>        a paper PDF -> a narration bundle (plan, slice, synthesize)
    inscien voices | sample | structure | score    narration diagnostics

Everything is written under INSCIEN_HOME (see inscien/core/paths.py).
"""

import argparse
import os
import socket
import sys
import threading
import webbrowser
from pathlib import Path


def _free_port(preferred: int = 8000) -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]


def cmd_serve(args) -> None:
    os.environ.setdefault("ENV_NAME", "production")
    os.environ.setdefault("FRONTEND_DIST", str(Path(__file__).resolve().parent / "webui"))
    port = args.port or int((os.getenv("PORT") or "").strip() or _free_port())
    url = f"http://{args.host}:{port}"

    import uvicorn

    from inscien.app import app

    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()
    print(f"InScien running at {url}  (Ctrl+C to stop)")
    uvicorn.run(app, host=args.host, port=port, log_level="info")


def cmd_build(args) -> None:
    from inscien.refs.build import build

    build(args.pdf, slug=args.slug, doi=args.doi, year=args.year, force=args.force, refresh=args.refresh)


def cmd_narrate(args) -> None:
    from inscien.narrate.pipeline import narrate

    narrate(args.pdf, voice=args.voice, speed=args.speed, device=args.device, slug=args.slug)


def main(argv=None) -> None:
    from inscien import __version__
    from inscien.narrate import cli as narrate_cli

    parser = argparse.ArgumentParser(prog="inscien", description=__doc__.split("\n\n")[0])
    parser.add_argument("--version", action="version", version=f"inscien {__version__}")
    subs = parser.add_subparsers(dest="command")

    serve = subs.add_parser("serve", help="serve the app (the default)")
    serve.add_argument("--port", type=int, default=None)
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--no-browser", action="store_true")
    serve.set_defaults(func=cmd_serve)

    build = subs.add_parser("build", help="paper PDF -> library entry")
    build.add_argument("pdf")
    build.add_argument("--slug")
    build.add_argument("--doi")
    build.add_argument("--year", type=int)
    build.add_argument("--force", action="store_true", help="build even if the paper is already in the library")
    build.add_argument("--refresh", action="store_true", help="resolve every reference again, ignoring the library's")
    build.set_defaults(func=cmd_build)

    narrate = subs.add_parser("narrate", help="paper PDF -> narration bundle")
    narrate.add_argument("pdf")
    narrate.add_argument("--voice")
    narrate.add_argument("--speed", type=float)
    narrate.add_argument("--slug", help="bundle name (a rebuild keeps the existing one)")
    narrate.add_argument("--device", choices=("cpu", "cuda"), default=os.getenv("INSCIEN_TTS_DEVICE") or "cpu")
    narrate.set_defaults(func=cmd_narrate)

    narrate_cli.add_commands(subs)

    args = parser.parse_args(argv)
    if not args.command:
        args = parser.parse_args(["serve", *(argv or [])])
    try:
        args.func(args)
    except KeyboardInterrupt:
        sys.exit("\ninterrupted")
    except (RuntimeError, ValueError, FileNotFoundError) as exc:
        sys.exit(f"error: {exc}")


if __name__ == "__main__":
    main()
