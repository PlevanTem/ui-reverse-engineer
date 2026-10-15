import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).resolve().parents[2] / 'scripts' / 'restore' / 'compare-screens.py'), run_name='__main__')
