# src/backend/utils/config.py
from pathlib import Path
import json
# Start from the current file's directory and go up three levels
# Calculate the path to the 'config' directory
config_dir = Path(__file__).parent / "config" / "config.json"

with open(config_dir, 'r') as f:
    config = json.load(f)