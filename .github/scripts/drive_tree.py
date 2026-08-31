import os
import json

from google.oauth2 import service_account
from googleapiclient.discovery import build


# --------------------------------------------------
# Configuration
# --------------------------------------------------

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly"
]

ROOT_FOLDER_ID = "1A3YXPHpSSg8Yl_B9LOIRLwjw4SrOXSr0"


# --------------------------------------------------
# Authentication
# --------------------------------------------------

SECRET = os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"]

credentials_info = json.loads(SECRET)

credentials = service_account.Credentials.from_service_account_info(
    credentials_info,
    scopes=SCOPES
)

drive = build(
    "drive",
    "v3",
    credentials=credentials
)


# --------------------------------------------------
# Verify root folder
# --------------------------------------------------

print("========================================")
print("WATCHTECH DRIVE SCAN - TEST 1.5")
print("========================================")

print("\nUsing fixed root folder ID:")
print(ROOT_FOLDER_ID)

root = drive.files().get(
    fileId=ROOT_FOLDER_ID,
    fields="id,name,mimeType"
).execute()

if root["mimeType"] != "application/vnd.google-apps.folder":
    print("ERROR: Root ID is not a folder.")
    raise SystemExit(1)

print(f"\nROOT FOUND: {root['name']}")
print(f"ID: {root['id']}")

print("\nFOLDER TREE")
print("----------------------------------------")


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

print(f"📁 {root['name']}/")

scan_folder(
    ROOT_FOLDER_ID,
    "    "
)

print("----------------------------------------")
print("SCAN COMPLETE")
print("========================================")
