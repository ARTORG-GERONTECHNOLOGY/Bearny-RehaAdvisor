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
# "fitbit" is always included even if removed from the UI options so that existing
# patients with wearable_device="fitbit" continue to pass model validation.
def _load_wearable_choices() -> list[str]:
    choices: list[str] = ["google_health", "omron", "none"]
    try:
        fields = config["PatientForm"][0]["fields"]
        for f in fields:
            if f.get("name") == "wearableDevice":
                choices = list(f["options"])
                break
    except (KeyError, IndexError, TypeError):
        pass
    # "fitbit" is kept as a valid choice even after removal from the UI so that
    # existing patients with wearable_device="fitbit" pass model validation.
    if "fitbit" not in choices:
        choices = choices + ["fitbit"]
    return choices


WEARABLE_DEVICE_CHOICES: list[str] = _load_wearable_choices()
