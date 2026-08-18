const CLIENT_ID =
    "716795580682-q00ag4tecj35b49q4tnk2prub01pgd1r.apps.googleusercontent.com";

const DRIVE_SCOPE =
    "https://www.googleapis.com/auth/drive.readonly";

let accessToken = null;
let tokenClient = null;


// --------------------------------------------------
// DEMO LIBRARY
// --------------------------------------------------

const library = [
    {
        type: "folder",
        name: "OMEGA",
        documents: [
            "Omega Calibre 8500",
            "Omega Calibre 9300"
        ]
    },

    {
        type: "folder",
        name: "ROLEX",
        documents: [
            "Rolex 3135 Service Manual",
            "Rolex 3235 Service Manual"
        ]
    },

    {
        type: "folder",
        name: "ETA",
        documents: [
            "ETA 2824 Technical Manual",
            "ETA 7750 Technical Manual"
        ]
    }
];


// --------------------------------------------------
// DISPLAY DEMO LIBRARY
// --------------------------------------------------

function displayLibrary(data = library) {

    const container =
        document.getElementById("library");

    container.innerHTML = "";

    data.forEach(folder => {

        const folderElement =
            document.createElement("div");

        folderElement.className = "folder";

        folderElement.innerHTML =
            `<span class="folder-icon">📁</span>
             ${folder.name}`;

        container.appendChild(folderElement);


        folder.documents.forEach(documentName => {

            const documentElement =
                document.createElement("div");

            documentElement.className = "document";

            documentElement.innerHTML =
                `<span class="document-icon">📄</span>
                 ${documentName}`;

            container.appendChild(documentElement);

        });

    });
}


// --------------------------------------------------
// SEARCH
// --------------------------------------------------

function searchDocuments() {

    const search =
        document
            .getElementById("search")
            .value
            .toLowerCase()
            .trim();


    if (!search) {

        displayLibrary();

        return;
    }


    const results = [];


    library.forEach(folder => {

        const matchingDocuments =
            folder.documents.filter(documentName =>
                documentName
                    .toLowerCase()
                    .includes(search)
            );


        if (
            folder.name
                .toLowerCase()
                .includes(search)
            ||
            matchingDocuments.length > 0
        ) {

            results.push({
                type: "folder",
                name: folder.name,
                documents:
                    matchingDocuments.length
                        ? matchingDocuments
                        : folder.documents
            });

        }

    });


    displayLibrary(results);
}


// --------------------------------------------------
// GOOGLE AUTHENTICATION
// --------------------------------------------------

function initializeGoogleAuthentication() {

    if (
        typeof google === "undefined" ||
        !google.accounts ||
        !google.accounts.oauth2
    ) {
        console.log("Google Identity Services not loaded yet.");
        return;
    }


    tokenClient =
        google.accounts.oauth2.initTokenClient({

            client_id: CLIENT_ID,

            scope: DRIVE_SCOPE,

            callback: async (response) => {

                if (response.error) {

                    console.error(
                        "Google authentication error:",
                        response
                    );

                    updateStatus(
                        "Google authentication failed."
                    );

                    return;
                }


                accessToken =
                    response.access_token;

                updateStatus(
                    "✓ Google authentication successful"
                );

                document.getElementById(
                    "driveStatus"
                ).textContent =
                    "Connected";


                document.getElementById(
                    "googleSignInButton"
                ).textContent =
                    "✓ Google Connected";


                await findWatchtechFolder();

            }

        });

}


// --------------------------------------------------
// GOOGLE LOGIN BUTTON
// --------------------------------------------------

function signInWithGoogle() {

    if (!tokenClient) {

        initializeGoogleAuthentication();

    }


    if (!tokenClient) {

        alert(
            "Google authentication is still loading. Please wait a few seconds and try again."
        );

        return;
    }


    tokenClient.requestAccessToken({
        prompt: "consent"
    });

}


// --------------------------------------------------
// FIND WATCHTECH FOLDER
// --------------------------------------------------

async function findWatchtechFolder() {

    try {
        // Find the Watchtech Docs folder in the root of My Drive
        const query =
            "name = 'WatchTech Docs' " +
            "and mimeType = 'application/vnd.google-apps.folder' " +
            "and 'root' in parents " +
            "and trashed = false";
        const url =
            "https://www.googleapis.com/drive/v3/files" +
            "?q=" +
            encodeURIComponent(query) +
            "&fields=files(id,name,mimeType,parents)";
        const response =
            await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}`
                }
            });
        if (!response.ok) {
            throw new Error(
                `Drive API returned ${response.status}`
            );
        }
        const data =
            await response.json();
        console.log(
            "Watchtech Docs search result:",   data
        );
        if (!data.files || data.files.length === 0) {
            updateStatus("Google connected, but Watchtech Docs was not found." );
            return;
        }
        const watchtechFolder = data.files[0];
        updateStatus( "✓ Watchtech Docs folder found" );

        document.getElementById(
            "driveStatus"
        ).textContent =
            "Watchtech Docs found";
        console.log(
            "WATCHTECH DOCS ROOT:",
            watchtechFolder
        );
        // Get the folders inside Watchtech Docs
        await loadWatchTechDocs(
            watchtechFolder.id
        );

    }

    catch (error) {
        console.error(
            "Drive error:",
            error
        );

        updateStatus(
            "Google connected, but Drive access failed."
        );
    }
}

async function loadWatchTechDocs() {
  const status = document.getElementById("status");
  const library = document.getElementById("library");

  status.textContent = "Finding WatchTech Docs...";
  library.innerHTML = "";

  // 1. Find the main WatchTech Docs folder
  const rootResponse = await gapi.client.drive.files.list({
    q:
      "name = 'WatchTech Docs' " +
      "and mimeType = 'application/vnd.google-apps.folder' " +
      "and 'root' in parents " +
      "and trashed = false",
    fields: "files(id, name)",
    spaces: "drive"
  });

  const rootFolders = rootResponse.result.files || [];

  if (!rootFolders.length) {
    status.textContent = "WatchTech Docs folder not found.";
    return;
  }

  const watchTechFolder = rootFolders[0];

  console.log("WatchTech Docs:", watchTechFolder);

  // 2. Find the ATM folder inside WatchTech Docs
  status.textContent = "Finding ATM...";

  const atmResponse = await gapi.client.drive.files.list({
    q:
      `'${watchTechFolder.id}' in parents ` +
      "and name = 'ATM' " +
      "and mimeType = 'application/vnd.google-apps.folder' " +
      "and trashed = false",
    fields: "files(id, name)",
    spaces: "drive"
  });

  const atmFolders = atmResponse.result.files || [];

  if (!atmFolders.length) {
    status.textContent = "ATM folder not found.";
    return;
  }

  const atmFolder = atmFolders[0];

  console.log("ATM folder:", atmFolder);

  // 3. Get the actual files inside ATM
  status.textContent = "Loading ATM documents...";

  const filesResponse = await gapi.client.drive.files.list({
    q:
      `'${atmFolder.id}' in parents ` +
      "and mimeType != 'application/vnd.google-apps.folder' " +
      "and trashed = false",
    fields: "files(id, name, mimeType, webViewLink)",
    orderBy: "name",
    spaces: "drive"
  });

  const files = filesResponse.result.files || [];

  console.log("ATM files:", files);

  if (!files.length) {
    status.textContent = "ATM folder is empty.";
    return;
  }

  // 4. Display the documents
  status.textContent = `ATM — ${files.length} document(s)`;

  const heading = document.createElement("h2");
  heading.textContent = "📁 ATM";
  library.appendChild(heading);

  files.forEach(file => {
    const item = document.createElement("div");
    item.className = "document-item";

    const link = document.createElement("a");

    link.href = file.webViewLink || 
      `https://drive.google.com/file/d/${file.id}/view`;

    link.target = "_blank";
    link.rel = "noopener noreferrer";

    link.textContent = `📄 ${file.name}`;

    item.appendChild(link);
    library.appendChild(item);
  });
}

async function loadDriveFolders(parentFolderId) {
    try {
        const query =
            `'${parentFolderId}' in parents ` +
            "and mimeType = 'application/vnd.google-apps.folder' " +
            "and trashed = false";
        const url =
            "https://www.googleapis.com/drive/v3/files" +
            "?q=" +
            encodeURIComponent(query) +
            "&orderBy=name" +
            "&fields=files(id,name,mimeType,parents)";
        const response =
            await fetch(url, {

                headers: {
                    Authorization:
                        `Bearer ${accessToken}`
                }

            });
        if (!response.ok) {
            throw new Error(
                `Drive API returned ${response.status}`
            );
        }
        const data =
            await response.json();
        console.log(
            "Folders inside Watchtech Docs:",
            data
        );

        displayDriveFolders(
            data.files || []
        );
        updateStatus(
            `✓ Google Drive connected — ${
                (data.files || []).length
            } folder(s) found`
        );
    }
    catch (error) {
        console.error(
            "Folder loading error:",
            error
        );
        updateStatus(
            "Watchtech Docs was found, but its folders could not be loaded."
        );
    }
}

function displayDriveFolders(folders) {
    const container =
        document.getElementById("library");

    container.innerHTML = "";
    if (folders.length === 0) {
        container.innerHTML =            `
            <div class="folder">
                📂 No folders found inside Watchtech Docs.
            </div>
            `;
        return;
    }

    folders.forEach(folder => {
        const folderElement =
            document.createElement("div");
        folderElement.className =
            "folder";
        folderElement.innerHTML =
            `
            <span class="folder-icon">📁</span>
            ${escapeHtml(folder.name)}
            `;
        folderElement.dataset.folderId =
            folder.id;
        container.appendChild(
            folderElement
        );
    });
}

function escapeHtml(text) {
    const div =  document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function updateStatus(message) {

    document.getElementById(
        "connectionStatus"
    ).textContent = message;

}


// --------------------------------------------------
// START APPLICATION
// --------------------------------------------------

displayLibrary();


window.addEventListener(
    "load",
    () => {

        setTimeout(
            initializeGoogleAuthentication,
            1000
        );

    }
);


document.addEventListener(
    "DOMContentLoaded",
    () => {

        document
            .getElementById("googleSignInButton")
            .addEventListener(
                "click",
                signInWithGoogle
            );

    }
);
