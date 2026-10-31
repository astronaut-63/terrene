"""Safe local startup checks. Never display credential values or stop processes."""
import os
from pathlib import Path
import socket
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
process_key = os.environ.get('HEIGIT_API_KEY')
from backend.config import ENV_FILE  # noqa: E402
from backend.routing import routing_configuration  # noqa: E402


def main():
    print(f'[Terrene] Checkout: {ROOT}')
    print(f'[Terrene] Local configuration: {ENV_FILE} (exists: {ENV_FILE.exists()})')
    print(f'[Terrene] Routing configured: {routing_configuration()["configured"]}')
    if process_key is not None:
        print('[Terrene] A process HEIGIT_API_KEY variable takes precedence over .env.')
    if not routing_configuration()['configured']:
        print('[Terrene] Add the working HEIGIT_API_KEY to this checkout\'s .env, then restart.')
    blocked = False
    for port in (3002, 5173):
        for host in ('127.0.0.1', '::1'):
            try:
                with socket.create_connection((host, port), timeout=0.25):
                    print(f'[Terrene] Port {port} is already in use. Close the existing Terrene server windows and retry.')
                    blocked = True
                    break
            except OSError:
                pass
    return 1 if blocked else 0


if __name__ == '__main__':
    sys.exit(main())
