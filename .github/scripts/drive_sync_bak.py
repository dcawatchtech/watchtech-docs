from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
ROOT_FOLDER_ID = "1A3YXPHpSSg8Yl_B9LOIRLwjw4SrOXSr0"
DOCS_ROOT = Path("docs")
STATE_PATH = Path(".github/sync-state.json")
FOLDER_MIME = "application/vnd.google-apps.folder"
SHORTCUT_MIME = "application/vnd.google-apps.shortcut"
THIRD_PARTY_SHORTCUT_MIME = "application/vnd.google-apps.drive-sdk"

# Google Workspace files don't have downloadable blob bytes through files.get.
# We materialize them into stable, widely usable formats instead.
WORKSPACE_EXPORTS = {
    "application/vnd.google-apps.document": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx", "Google Doc"),
    "application/vnd.google-apps.spreadsheet": ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx", "Google Sheet"),
    "application/vnd.google-apps.presentation": ("application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx", "Google Slides"),
    "application/vnd.google-apps.drawing": ("image/svg+xml", ".svg", "Google Drawing"),
    "application/vnd.google-apps.script": ("application/vnd.google-apps.script+json", ".json", "Apps Script"),
}

# These types cannot currently be materialized through the Drive files.get/export
# flow used by this synchronizer. We fail before modifying the mirror so nothing
# silently disappears.
NON_MATERIALIZABLE = {
    "application/vnd.google-apps.form": "Google Form",
    "application/vnd.google-apps.site": "Google Site",
    "application/vnd.google-apps.map": "Google My Maps",
    "application/vnd.google-apps.jam": "Google Jamboard",
    "application/vnd.google-apps.vid": "Google Vids (requires Drive download LRO)",
    "application/vnd.google-apps.audio": "Google Drive audio",
    "application/vnd.google-apps.video": "Google Drive video",
    "application/vnd.google-gemini.conversation": "Gemini conversation",
    "application/vnd.google-gemini.gem": "Gemini Gem",
}


def log(message: str = "") -> None:
    print(message, flush=True)


def fail(message: str) -> None:
    print(f"ERROR: {message}", flush=True)
    raise SystemExit(1)


def load_drive() -> Any:
    secret = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not secret:
        fail("GOOGLE_SERVICE_ACCOUNT_JSON is not set.")

    try:
        credentials_info = json.loads(secret)
    except json.JSONDecodeError as exc:
        fail(f"GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON: {exc}")

    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=SCOPES,
    )
    return build("drive", "v3", credentials=credentials)


def is_folder(item: dict[str, Any]) -> bool:
    return item.get("mimeType") == FOLDER_MIME


def is_shortcut(item: dict[str, Any]) -> bool:
    return item.get("mimeType") in {SHORTCUT_MIME, THIRD_PARTY_SHORTCUT_MIME}


def sanitize_component(name: str) -> str:
    value = name.replace("/", "_").replace("\\", "_").strip()
    return value if value not in {"", ".", ".."} else "_"


def strip_known_suffix(name: str) -> str:
    known = [
        ".pdf", ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".rtf",
        ".txt", ".html", ".zip", ".epub", ".md", ".csv", ".tsv", ".jpg",
        ".jpeg", ".png", ".svg", ".json", ".mp4",
    ]
    lower = name.lower()
    for suffix in known:
        if lower.endswith(suffix):
            return name[:-len(suffix)]
    return Path(name).stem if Path(name).suffix else name


def output_name_for(item: dict[str, Any]) -> tuple[str, str | None, str | None]:
    name = sanitize_component(item.get("name", item["id"]))
    mime = item.get("mimeType", "")
    export = WORKSPACE_EXPORTS.get(mime)
    if not export:
        return name, None, None
    export_mime, extension, label = export
    base = sanitize_component(strip_known_suffix(name))
    # A Google-native file has no real filesystem extension. The source Drive
    # name may misleadingly end in .pdf/.docx/etc, so replace that suffix.
    return f"{base}{extension}", export_mime, label


def content_fingerprint(item: dict[str, Any], output_name: str, export_mime: str | None) -> str:
    checksum = item.get("md5Checksum")
    if checksum:
        return f"md5:{checksum}"
    # Workspace exports do not expose md5Checksum. modifiedTime/version is the
    # source-of-truth signal; include the selected export format too.
    return (
        f"meta:{item.get('modifiedTime', '')}|"
        f"version:{item.get('version', '')}|"
        f"size:{item.get('size', '')}|"
        f"output:{output_name}|export:{export_mime or ''}"
    )


def list_children(drive: Any, folder_id: str) -> list[dict[str, Any]]:
    query = f"'{folder_id}' in parents and trashed = false"
    fields = (
        "nextPageToken,files("
        "id,name,mimeType,parents,modifiedTime,md5Checksum,size,version,"
        "shortcutDetails,fileExtension,webViewLink"
        ")"
    )
    items: list[dict[str, Any]] = []
    page_token: str | None = None
    while True:
        response = (
            drive.files().list(
                q=query,
                spaces="drive",
                pageSize=1000,
                pageToken=page_token,
                fields=fields,
                orderBy="folder,name",
            ).execute()
        )
        items.extend(response.get("files", []))
        page_token = response.get("nextPageToken")
        if not page_token:
            return items


def build_current_tree(drive: Any) -> dict[str, dict[str, Any]]:
    root = drive.files().get(fileId=ROOT_FOLDER_ID, fields="id,name,mimeType,trashed").execute()
    if root.get("trashed"):
        fail("The fixed WatchTech Docs root folder is in the Drive trash.")
    if not is_folder(root):
        fail("The fixed root ID is not a Drive folder.")

    log("========================================")
    log("WATCHTECH DRIVE SYNC - ALL DRIVE ITEMS")
    log("========================================")
    log(f"Using fixed root folder ID: {ROOT_FOLDER_ID}")
    log(f"ROOT FOUND: {root['name']}")
    log("Building recursive tree...\n")

    current: dict[str, dict[str, Any]] = {}
    unsupported: list[str] = []

    def walk(folder_id: str, parent_path: str) -> None:
        for item in list_children(drive, folder_id):
            item_id = item["id"]
            mime = item.get("mimeType", "")

            name = sanitize_component(item.get("name", item_id))
            if is_folder(item):
                rel_path = f"{parent_path}/{name}" if parent_path else name
                current[item_id] = {
                    "id": item_id,
                    "name": item.get("name", item_id),
                    "safe_name": name,
                    "output_name": name,
                    "mimeType": mime,
                    "parent_id": folder_id,
                    "path": rel_path,
                    "modifiedTime": item.get("modifiedTime", ""),
                    "content_fingerprint": "folder",
                    "size": item.get("size", ""),
                    "kind": "folder",
                    "export_mime": None,
                }
                log(f"📁 {rel_path}/")
                walk(item_id, rel_path)
                continue

            if is_shortcut(item):
                # Preserve the shortcut item as a metadata JSON file. We do not
                # follow it, because its target can live outside WatchTech Docs.
                output_name = f"{strip_known_suffix(name)}.shortcut.json"
                label = "Drive shortcut"
                export_mime = "application/json"
            elif mime in WORKSPACE_EXPORTS:
                output_name, export_mime, label = output_name_for(item)
            elif mime in NON_MATERIALIZABLE:
                unsupported.append(f"{parent_path}/{name}" if parent_path else name)
                log(f"UNSUPPORTED {parent_path}/{name}  ({NON_MATERIALIZABLE[mime]})")
                continue
            else:
                output_name, export_mime, label = name, None, None

            rel_path = f"{parent_path}/{output_name}" if parent_path else output_name
            record = {
                "id": item_id,
                "name": item.get("name", item_id),
                "safe_name": name,
                "output_name": output_name,
                "mimeType": mime,
                "parent_id": folder_id,
                "path": rel_path,
                "modifiedTime": item.get("modifiedTime", ""),
                "content_fingerprint": content_fingerprint(item, output_name, export_mime),
                "size": item.get("size", ""),
                "kind": "file",
                "export_mime": export_mime,
                "export_label": label,
                "shortcutDetails": item.get("shortcutDetails"),
            }
            current[item_id] = record
            log(f"📄 {rel_path}  [{label or mime}]")

    walk(ROOT_FOLDER_ID, "")

    if unsupported:
        joined = "\n".join(f"  - {x}" for x in sorted(unsupported))
        fail(
            "The Drive tree contains item types that this version cannot materialize "
            "into GitHub yet. Sync stopped before changing anything:\n" + joined
        )

    validate_unique_paths(current)
    return current


def validate_unique_paths(current: dict[str, dict[str, Any]]) -> None:
    paths: dict[str, str] = {}
    conflicts: list[str] = []
    for item_id, item in current.items():
        path = item["path"]
        if path in paths and paths[path] != item_id:
            conflicts.append(path)
        paths[path] = item_id
    if conflicts:
        joined = "\n".join(f"  - {path}" for path in sorted(set(conflicts)))
        fail(
            "Drive contains duplicate items that would map to the same GitHub path. "
            f"Sync stopped before changing anything:\n{joined}"
        )


def load_state() -> dict[str, dict[str, Any]]:
    if not STATE_PATH.exists():
        return {}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"Cannot read {STATE_PATH}: {exc}")
    if not isinstance(data, dict) or data.get("version") != 1:
        fail(f"Unsupported or invalid sync state in {STATE_PATH}.")
    items = data.get("items", {})
    if not isinstance(items, dict):
        fail(f"Invalid items section in {STATE_PATH}.")
    return items


def save_state(current: dict[str, dict[str, Any]]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "root_folder_id": ROOT_FOLDER_ID,
        "docs_root": str(DOCS_ROOT).replace("\\", "/"),
        "items": current,
    }
    temp = STATE_PATH.with_suffix(".tmp")
    temp.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(STATE_PATH)


def local_path(rel_path: str) -> Path:
    return DOCS_ROOT / Path(rel_path)


def remove_path_if_exists(path: Path) -> None:
    if path.is_file() or path.is_symlink():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)


def prune_empty_dirs() -> None:
    if not DOCS_ROOT.exists():
        return
    for directory in sorted((p for p in DOCS_ROOT.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        try:
            directory.rmdir()
        except OSError:
            pass


def write_shortcut_json(item: dict[str, Any], destination: Path) -> Path:
    details = item.get("shortcutDetails") or {}
    payload = {
        "type": "google-drive-shortcut",
        "source_name": item.get("name"),
        "source_id": item["id"],
        "target_id": details.get("targetId"),
        "target_mime_type": details.get("targetMimeType"),
        "target_resource_key": details.get("targetResourceKey"),
        "web_view_link": item.get("webViewLink"),
    }
    destination.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return destination


def download_to_temp(drive: Any, item: dict[str, Any], temp_dir: Path) -> Path:
    from googleapiclient.http import MediaIoBaseDownload

    item_id = item["id"]
    mime = item.get("mimeType", "")
    destination = temp_dir / item["output_name"]

    if is_shortcut(item):
        # The current-tree record has shortcutDetails and enough metadata to
        # represent the shortcut deterministically in GitHub.
        return write_shortcut_json(item, destination)

    if mime in WORKSPACE_EXPORTS:
        export_mime = WORKSPACE_EXPORTS[mime][0]
        request = drive.files().export(fileId=item_id, mimeType=export_mime)
        data = request.execute()
        if not isinstance(data, (bytes, bytearray)):
            raise ValueError(f"Unexpected export response for {item.get('name', item_id)}")
        destination.write_bytes(bytes(data))
        return destination

    if mime in NON_MATERIALIZABLE:
        raise ValueError(f"Unsupported Drive file type: {mime}")

    request = drive.files().get_media(fileId=item_id)
    with destination.open("wb") as output:
        downloader = MediaIoBaseDownload(output, request, chunksize=1024 * 1024)
        done = False
        while not done:
            _, done = downloader.next_chunk()
    return destination


def local_md5(path: Path) -> str:
    digest = hashlib.md5()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def bootstrap_match(item: dict[str, Any]) -> bool:
    target = local_path(item["path"])
    if not target.is_file():
        return False
    fingerprint = item["content_fingerprint"]
    if fingerprint.startswith("md5:"):
        return f"md5:{local_md5(target)}" == fingerprint
    return False


def sync(drive: Any, dry_run: bool = False) -> dict[str, int]:
    current = build_current_tree(drive)
    previous = load_state()
    stats = {"added": 0, "updated": 0, "moved": 0, "removed": 0, "folders_created": 0, "folders_removed": 0, "unchanged": 0}

    current_files = {k: v for k, v in current.items() if v["kind"] == "file"}
    current_folders = {k: v for k, v in current.items() if v["kind"] == "folder"}
    previous_files = {k: v for k, v in previous.items() if v.get("kind") == "file"}
    previous_folders = {k: v for k, v in previous.items() if v.get("kind") == "folder"}

    for item_id, item in current_folders.items():
        old = previous_folders.get(item_id)
        if old is None:
            stats["folders_created"] += 1
            log(f"MKDIR      {item['path']}/")
        elif old.get("path") != item["path"]:
            stats["moved"] += 1
            log(f"MOVE/RENAME {old['path']}/  ->  {item['path']}/")

    for item_id, old in previous_folders.items():
        if item_id not in current_folders:
            stats["folders_removed"] += 1
            log(f"RMDIR      {old['path']}/")

    if dry_run:
        for item_id, item in current_files.items():
            old = previous_files.get(item_id)
            if old is None:
                if bootstrap_match(item):
                    stats["unchanged"] += 1
                    log(f"UNCHANGED  {item['path']}  (bootstrap match)")
                else:
                    stats["added"] += 1
                    log(f"ADD        {item['path']}")
            else:
                path_changed = old.get("path") != item["path"]
                content_changed = old.get("content_fingerprint") != item["content_fingerprint"]
                if path_changed:
                    stats["moved"] += 1
                    log(f"MOVE/RENAME {old['path']}  ->  {item['path']}")
                if content_changed:
                    stats["updated"] += 1
                    log(f"UPDATE     {item['path']}")
                if not path_changed and not content_changed:
                    stats["unchanged"] += 1
                    log(f"IGNORE     {item['path']}")
        for item_id, old in previous_files.items():
            if item_id not in current_files:
                stats["removed"] += 1
                log(f"REMOVE     {old['path']}")
    else:
        for item in current_folders.values():
            local_path(item["path"]).mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory(prefix="watchtech-sync-") as tmp:
            staging = Path(tmp)
            staged: dict[str, Path] = {}
            for item_id, item in current_files.items():
                old = previous_files.get(item_id)
                path_changed = bool(old and old.get("path") != item["path"])
                content_changed = bool(old and old.get("content_fingerprint") != item["content_fingerprint"])
                if old is None:
                    if bootstrap_match(item):
                        stats["unchanged"] += 1
                        log(f"UNCHANGED  {item['path']}  (bootstrap match)")
                    else:
                        staged[item_id] = download_to_temp(drive, item, staging)
                        stats["added"] += 1
                        log(f"ADD        {item['path']}")
                elif path_changed or content_changed:
                    if path_changed:
                        stats["moved"] += 1
                        log(f"MOVE/RENAME {old['path']}  ->  {item['path']}")
                    if content_changed:
                        stats["updated"] += 1
                        log(f"UPDATE     {item['path']}")
                    staged[item_id] = download_to_temp(drive, item, staging)
                else:
                    stats["unchanged"] += 1
                    log(f"IGNORE     {item['path']}")

            for item_id, old in previous_files.items():
                if item_id not in current_files:
                    old_path = local_path(old["path"])
                    if old_path.exists():
                        remove_path_if_exists(old_path)
                    stats["removed"] += 1
                    log(f"REMOVE     {old['path']}")

            for item_id, item in current_files.items():
                old = previous_files.get(item_id)
                if old and old.get("path") != item["path"]:
                    old_path = local_path(old["path"])
                    new_path = local_path(item["path"])
                    if old_path.exists() and old_path != new_path:
                        remove_path_if_exists(old_path)

            for item_id, temp_file in staged.items():
                item = current_files[item_id]
                target = local_path(item["path"])
                target.parent.mkdir(parents=True, exist_ok=True)
                temp_target = target.with_name(target.name + ".sync-tmp")
                shutil.copy2(temp_file, temp_target)
                temp_target.replace(target)

        prune_empty_dirs()
        save_state(current)

    log("\n========================================")
    log("DRY RUN COMPLETE" if dry_run else "SYNC COMPLETE")
    log("========================================")
    log(f"ADD        : {stats['added']}")
    log(f"UPDATE     : {stats['updated']}")
    log(f"MOVE/RENAME: {stats['moved']}")
    log(f"REMOVE     : {stats['removed']}")
    log(f"MKDIR      : {stats['folders_created']}")
    log(f"RMDIR      : {stats['folders_removed']}")
    log(f"IGNORE     : {stats['unchanged']}")
    log("========================================")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync all materializable WatchTech Docs items from Google Drive.")
    parser.add_argument("--dry-run", action="store_true", help="Show decisions without changing files or state.")
    args = parser.parse_args()
    try:
        drive = load_drive()
        sync(drive, dry_run=args.dry_run)
        return 0
    except KeyboardInterrupt:
        print("\nSync cancelled.")
        return 130
    except SystemExit as exc:
        return int(exc.code) if exc.code is not None else 1
    except Exception as exc:
        print(f"SYNC FAILED: {type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
