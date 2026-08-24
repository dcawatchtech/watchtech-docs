import json
import os

from google.oauth2 import service_account
from googleapiclient.discovery import build


SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly"
]


def main():

    print("Starting Google Drive connection test...")

    secret = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")

    if not secret:
        raise RuntimeError(
            "GOOGLE_SERVICE_ACCOUNT_JSON secret was not provided."
        )

    credentials_info = json.loads(secret)

    credentials = (
        service_account.Credentials
        .from_service_account_info(
            credentials_info,
            scopes=SCOPES
        )
    )

    drive = build(
        "drive",
        "v3",
        credentials=credentials
    )

    print("Google authentication successful.")
    print("Searching for WatchTech Docs...")

    query = (
        "name = 'WatchTech Docs' "
        "and mimeType = "
        "'application/vnd.google-apps.folder' "
        "and trashed = false"
    )

    response = drive.files().list(
        q=query,
        spaces="drive",
        fields="files(id,name,mimeType,parents)"
    ).execute()

    folders = response.get("files", [])

    if not folders:
        print("ERROR: WatchTech Docs was not found.")
        raise SystemExit(1)

    print("")
    print("SUCCESS!")
    print("WatchTech Docs found:")
    print("")

    for folder in folders:
        print(f"Name: {folder['name']}")
        print(f"ID:   {folder['id']}")
        print("")


if __name__ == "__main__":
    main()
