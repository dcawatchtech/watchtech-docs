import os
import json
from google.oauth2 import service_account
from googleapiclient.discovery import build

# --------------------------------------------------
# Configuration
# --------------------------------------------------

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

SECRET = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]

# Load service-account credentials
credentials_info = json.loads(SECRET)

credentials = service_account.Credentials.from_service_account_info(
    credentials_info,
    scopes=SCOPES
)

drive = build("drive", "v3", credentials=credentials)

# --------------------------------------------------
# Find WatchTech Docs
# --------------------------------------------------

print("========================================")
print("WATCHTECH DRIVE SCAN")
print("========================================")

print("\nSearching for 'WatchTech Docs'...")

query = """
name = 'WatchTech Docs'
and mimeType = 'application/vnd.google-apps.folder'
and trashed = false
"""

results = drive.files().list(
    q=query,
    spaces="drive",
    fields="files(id, name)"
).execute()

folders = results.get("files", [])

if not folders:
    print("ERROR: WatchTech Docs folder not found.")
    raise SystemExit(1)

root = folders[0]

print(f"FOUND: {root['name']}")
print(f"ID: {root['id']}")
print()

# --------------------------------------------------
# Recursive scanner
# --------------------------------------------------

def scan_folder(folder_id, prefix=""):
    query = f"""
    '{folder_id}' in parents
    and trashed = false
    """

    results = drive.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name,mimeType)",
        orderBy="folder,name"
    ).execute()

    items = results.get("files", [])

    for item in items:

        if item["mimeType"] == "application/vnd.google-apps.folder":
            print(f"{prefix}📁 {item['name']}/")

            scan_folder(
                item["id"],
                prefix + "    "
            )

        else:
            print(f"{prefix}📄 {item['name']}")

# --------------------------------------------------
# Start scan
# --------------------------------------------------

print("FOLDER TREE")
print("----------------------------------------")

print(f"📁 {root['name']}/")

scan_folder(
    root["id"],
    "    "
)

print("----------------------------------------")
print("SCAN COMPLETE")
print("========================================")
