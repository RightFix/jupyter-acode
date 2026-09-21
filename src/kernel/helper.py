#!/usr/bin/env python3
"""Persistent kernel helper for jupyter-acode.

Speaks a JSON-lines protocol over stdio (driven by Acode's Executor.start):

  request:  {"id": <int>, "code": "<base64 utf-8 source>"}
  response: {"id": <int>, "execution_count": <int>, "outputs": [...]}

  request:  {"id": <int>, "cmd": "ping"}
  response: {"id": <int>, "status": "pong"}

Each response is exactly one stdout line: user prints are captured via
redirect_stdout, so framing is trivial. All user code execs in one shared
``NS`` dict, giving notebook-style shared state across cells.

Matplotlib (if installed) uses the Agg backend; open figures are saved as
base64 PNG ``display_data`` outputs after each cell. ``plt.show()`` is a
no-op so it never blocks or warns.
"""
import sys
import json
import base64
import io
import traceback
import contextlib

try:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.show = lambda *a, **k: None  # noqa: E731 - never block on show()
    HAS_MPL = True
except Exception:
    plt = None  # type: ignore
    HAS_MPL = False

NS = {}
COUNT = 0


def _collect_figures():
    images = []
    if not HAS_MPL:
        return images
    try:
        for num in plt.get_fignums():
            fig = plt.figure(num)
            buf = io.BytesIO()
            fig.savefig(buf, format="png", bbox_inches="tight", dpi=100)
            buf.seek(0)
            images.append(base64.b64encode(buf.read()).decode("ascii"))
            plt.close(fig)
    except Exception:
        pass
    return images


def run_code(code_b64):
    global COUNT
    COUNT += 1
    try:
        code = base64.b64decode(code_b64).decode("utf-8")
    except Exception as e:
        return {
            "execution_count": COUNT,
            "outputs": [
                {
                    "output_type": "error",
                    "evalue": "Failed to decode cell: %s" % e,
                    "traceback": ["Failed to decode cell: %s" % e],
                }
            ],
        }

    out = io.StringIO()
    err = io.StringIO()
    tb = None
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            exec(compile(code, "<cell>", "exec"), NS)  # noqa: S102 - intentional
        except SystemExit:
            pass
        except Exception:
            tb = traceback.format_exc()

    outputs = []
    stdout_val = out.getvalue()
    if stdout_val:
        outputs.append(
            {"output_type": "stream", "name": "stdout", "text": stdout_val}
        )
    stderr_val = err.getvalue()
    if stderr_val:
        outputs.append(
            {"output_type": "stream", "name": "stderr", "text": stderr_val}
        )
    for img in _collect_figures():
        outputs.append(
            {
                "output_type": "display_data",
                "data": {"image/png": img},
                "metadata": {},
            }
        )
    if tb is not None:
        lines = tb.strip().split("\n")
        outputs.append(
            {
                "output_type": "error",
                "evalue": lines[-1] if lines else "Error",
                "traceback": lines,
            }
        )
    return {"execution_count": COUNT, "outputs": outputs}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            sys.stdout.write(
                json.dumps(
                    {
                        "id": None,
                        "outputs": [
                            {
                                "output_type": "error",
                                "evalue": "Bad request: %s" % e,
                                "traceback": ["Bad request: %s" % e],
                            }
                        ],
                        "execution_count": COUNT,
                    }
                )
                + "\n"
            )
            sys.stdout.flush()
            continue
        rid = req.get("id")
        if req.get("cmd") == "ping":
            sys.stdout.write(json.dumps({"id": rid, "status": "pong"}) + "\n")
            sys.stdout.flush()
            continue
        try:
            result = run_code(req.get("code", ""))
            result["id"] = rid
            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()
        except Exception as e:  # never let the loop die
            sys.stdout.write(
                json.dumps(
                    {
                        "id": rid,
                        "outputs": [
                            {
                                "output_type": "error",
                                "evalue": str(e),
                                "traceback": [str(e)],
                            }
                        ],
                        "execution_count": COUNT,
                    }
                )
                + "\n"
            )
            sys.stdout.flush()


if __name__ == "__main__":
    main()
