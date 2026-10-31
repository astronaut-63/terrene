"""Backend environment loading performed before importing environment users."""

from pathlib import Path

from dotenv import load_dotenv


REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPOSITORY_ROOT / '.env'

# Keep explicitly supplied process variables authoritative over local defaults.
load_dotenv(dotenv_path=ENV_FILE, override=False)
