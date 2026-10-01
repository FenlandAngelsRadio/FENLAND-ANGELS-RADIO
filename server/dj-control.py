#!/usr/bin/env python3
"""Compatibility entry point. Run only one DJ manager service per host."""
import runpy
from pathlib import Path

if __name__ == '__main__':
    runpy.run_path(str(Path(__file__).with_name('dj_manager.py')), run_name='__main__')
