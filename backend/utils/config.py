# src/backend/utils/config.py
import json
from pathlib import Path

# Start from the current file's directory and go up three levels
# Calculate the path to the 'config' directory
config_dir = Path(__file__).parent.parent / "config.json"

with open(config_dir, "r") as f:
    config = json.load(f)


# Valid wearable device values — derived from config so adding a new device only
# requires updating config.json PatientForm[0].fields[wearableDevice].options.
def _load_wearable_choices() -> list[str]:
    try:
        fields = config["PatientForm"][0]["fields"]
        for f in fields:
            if f.get("name") == "wearableDevice":
                return list(f["options"])
    except (KeyError, IndexError, TypeError):
        pass
    return ["fitbit", "omron", "none"]


WEARABLE_DEVICE_CHOICES: list[str] = _load_wearable_choices()
