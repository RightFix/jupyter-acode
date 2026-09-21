#!/usr/bin/env python3
"""Helper script for persistent Jupyter kernel sessions."""
import sys
import json
import base64
import io
import contextlib

# Use Agg backend so plots don't try to open a display
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Global execution namespace so variables persist between cells
_NAMESPACE = {}
_EXECUTION_COUNT = 0

def run_code(code: str) -> dict:
    global _EXECUTION_COUNT
    _EXECUTION_COUNT += 1

    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    outputs = []

    with contextlib.redirect_stdout(stdout_capture), contextlib.redirect_stderr(stderr_capture):
        try:
            compiled = compile(code, '<cell>', 'exec')
            exec(compiled, _NAMESPACE)
        except SystemExit:
            pass

    stdout_val = stdout_capture.getvalue()
    stderr_val = stderr_capture.getvalue()

    # Check for matplotlib figures
    figs = plt.get_fignums()
    images = []
    for fig_num in figs:
        fig = plt.figure(fig_num)
        buf = io.BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        images.append(base64.b64encode(buf.read()).decode('ascii'))
        plt.close(fig)

    # Stream output
    if stdout_val.strip():
        outputs.append({
            'output_type': 'stream',
            'name': 'stdout',
            'text': stdout_val
        })

    # Error output
    if stderr_val.strip():
        lines = stderr_val.strip().split('\n')
        outputs.append({
            'output_type': 'error',
            'evalue': lines[-1] if lines else 'Error',
            'traceback': lines
        })

    # Plot outputs
    for img_b64 in images:
        outputs.append({
            'output_type': 'display_data',
            'data': {'image/png': img_b64},
            'metadata': {}
        })

    return {
        'outputs': outputs,
        'execution_count': _EXECUTION_COUNT
    }

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            data = json.loads(line)
            code = data.get('code', '')
            if code == '__PING__':
                sys.stdout.write(json.dumps({'status': 'pong'}) + '\n')
                sys.stdout.flush()
                continue
            result = run_code(code)
            sys.stdout.write(json.dumps(result) + '\n')
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({
                'outputs': [{
                    'output_type': 'error',
                    'evalue': str(e),
                    'traceback': [str(e)]
                }],
                'execution_count': _EXECUTION_COUNT
            }) + '\n')
            sys.stdout.flush()

if __name__ == '__main__':
    main()
