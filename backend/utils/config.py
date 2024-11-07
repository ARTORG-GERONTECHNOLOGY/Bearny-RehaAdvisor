# src/backend/utils/config.py
from pathlib import Path
import json
# Start from the current file's directory and go up three levels
config_path = Path(__file__).parent.parent / 'config' / 'config.json'

with open(config_path, 'r') as f:
    config = json.load(f)