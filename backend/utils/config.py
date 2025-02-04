# src/backend/utils/config.py
from pathlib import Path
import json
# Start from the current file's directory and go up three levels
config_path = Path(__file__).parent.parent / 'config' / 'config.json'

# Print the absolute path for debugging
print(f"Looking for config file at: {config_path.resolve()}")

# Check if the file exists
if not config_path.is_file():
    raise FileNotFoundError(f"Config file not found at: {config_path.resolve()}")

with open(config_path, 'r') as f:
    config = json.load(f)