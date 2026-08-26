import os
import json
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


# --------------------------------------------------
# Configuration
# --------------------------------------------------

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

TARGET_PATH = [
    "ATM",
    "Procedures",
    "ATM_01_Automatic Archiving - DVD.pdf"
]

OUTPUT_DIR = Path("test-download")
OUTPUT_DIR.mkdir(exist_ok=True)


# --------------------------------------------------
# Authentication
# --------------------------------------------------

SECRET = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]

credentials_info = json.loads(SECRET)

credentials = service_account.Credentials.from_service_account_info(
    credentials_info,
    scopes=SCOPES
)

drive = build("drive", "v3", credentials=credentials)


# --------------------------------------------------
# Find an item by name inside a folder
# --------------------------------------------------

def find_child(parent_id, name):

    query = f"""
    '{parent_id}' in parents
    and name = '{name.replace("'", "\\'")}'
    and trashed = false
    """

    results = drive.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name,mimeType,size)"
    ).execute()

    files = results.get("files", [])

    if not files:
        return None

    return files[0]


# --------------------------------------------------
# Find WatchTech Docs
# --------------------------------------------------

print("========================================")
print("WATCHTECH TEST 2")
print("========================================")

print("\nSearching for WatchTech Docs...")

query = """
name = 'WatchTech Docs'
and mimeType = 'application/vnd.google-apps.folder'
and trashed = false
"""

results = drive.files().list(
    q=query,
    spaces="drive",
    fields="files(id,name)"
).execute()

folders = results.get("files", [])

if not folders:
    print("ERROR: WatchTech Docs folder not found.")
    raise SystemExit(1)

current = folders[0]

print(f"FOUND: {current['name']}")


# --------------------------------------------------
# Walk down the requested path
# --------------------------------------------------

for part in TARGET_PATH:

    print(f"Searching for: {part}")

    item = find_child(current["id"], part)

    if not item:
        print(f"ERROR: Could not find '{part}'.")
        raise SystemExit(1)

    current = item

    print(f"FOUND: {current['name']}")


# --------------------------------------------------
# Verify this is a real downloadable file
# --------------------------------------------------

file_id = current["id"]
file_name = current["name"]
mime_type = current["mimeType"]

print("\nFile located successfully.")
print(f"Name: {file_name}")
print(f"ID: {file_id}")
print(f"MIME type: {mime_type}")


# --------------------------------------------------
# Download the file
# --------------------------------------------------

output_path = OUTPUT_DIR / file_name

print("\nDownloading...")
print(f"Destination: {output_path}")

request = drive.files().get_media(fileId=file_id)

with open(output_path, "wb") as fh:

    downloader = MediaIoBaseDownload(
        fh,
        request
    )

    done = False

    while not done:

        status, done = downloader.next_chunk()

        if status:
            print(
                f"Download progress: "
                f"{int(status.progress() * 100)}%"
            )


# --------------------------------------------------
# Verify
# --------------------------------------------------

file_size = output_path.stat().st_size

print("\n========================================")
print("DOWNLOAD COMPLETE")
print("========================================")

print(f"File: {output_path}")
print(f"Size: {file_size:,} bytes")

if file_size == 0:
    print("ERROR: Downloaded file is empty.")
    raise SystemExit(1)

print("TEST 2 PASSED")
