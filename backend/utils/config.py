# src/backend/utils/config.py
from pathlib import Path
import json
# Start from the current file's directory and go up three levels
# Calculate the path to the 'config' directory
config_dir = Path(__file__).parent.parent / 'config'

# Print the absolute path of the 'config' directory for debugging
print(f"Looking for config directory at: {config_dir.resolve()}")

# Check if the 'config' directory exists
if not config_dir.is_dir():
    raise FileNotFoundError(f"Config directory not found at: {config_dir.resolve()}")

# List and print all files in the 'config' directory
print("Contents of the config directory:")
for item in config_dir.iterdir():
    if item.is_file():
        print(f"File: {item.name}")
    elif item.is_dir():
        print(f"Directory: {item.name}")

# Define the path to the 'config.json' file
config_path = config_dir / 'config.json'

# Check if the 'config.json' file exists
if not config_path.is_file():
    raise FileNotFoundError(f"Config file not found at: {config_path.resolve()}")


with open(config_path, 'r') as f:
    config = json.load(f)