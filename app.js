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
    tokenClient =  google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: DRIVE_SCOPE,
            callback: async (response) => {
                if (response.error) {
                    console.error( "Google authentication error:",
                        response
                    );
                    updateStatus(
                        "Google authentication failed."
                    );
                    return;
                }

                accessToken = response.access_token;

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
        alert( "Google authentication is still loading. Please wait a few seconds and try again."
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
            throw new Error( `Drive API returned ${response.status}`
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
        await loadDriveFolders(
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
    const container =   document.getElementById("library");

    container.innerHTML = "";

    if (folders.length === 0) {
        container.innerHTML = `
            <div class="folder">
                📂 No folders found inside WatchTech Docs.
            </div>
        `;
        return;
    }

    folders.forEach(folder => {
        const folderElement = document.createElement("div");
        folderElement.className = "folder";
        folderElement.innerHTML = `
            <span class="folder-icon">📁</span>
            ${escapeHtml(folder.name)}
        `;

        folderElement.dataset.folderId =  folder.id;

        // Open this folder when clicked
        folderElement.addEventListener(
            "click",
            () => loadDriveFiles(folder.id, folder.name)
        );
        container.appendChild(folderElement);
    });
}

async function loadDriveFiles(folderId, folderName) {
    try {
        updateStatus(
            `Loading ${folderName}...`
        );
        const query =
            `'${folderId}' in parents ` +
//            "and mimeType != 'application/vnd.google-apps.folder' " +
            "and trashed = false";
        const url =
            "https://www.googleapis.com/drive/v3/files" +
            "?q=" +
            encodeURIComponent(query) +
            "&orderBy=name" +
            "&fields=files(id,name,mimeType,webViewLink,parents)";
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

        const data =  await response.json();

        console.log(  `Files inside ${folderName}:`, data );

        displayDriveFiles(
            data.files || [],
            folderName
        );
        updateStatus(
            `✓ ${folderName} — ${
                (data.files || []).length
            } document(s)`
        );
    }
    catch (error) {
        console.error(
            "File loading error:",
            error
        );
        updateStatus(
            `Could not load files from ${folderName}.`
        );
    }
}

function displayDriveFiles(items, folderName) {
    const container =  document.getElementById("library");

    container.innerHTML = "";
    const heading = document.createElement("div");

    heading.className = "folder";

    heading.innerHTML = `
        <span class="folder-icon">📁</span>
        ${escapeHtml(folderName)}
    `;

    container.appendChild(heading);

    if (items.length === 0) {
        const emptyMessage =  document.createElement("div");

        emptyMessage.className = "document";

        emptyMessage.textContent =  "📂 This folder is empty.";

        container.appendChild(
            emptyMessage
        );
        return;
    }

    items.forEach(item => {
        const element =  document.createElement("div");
        // --------------------------------
        // FOLDER
        // --------------------------------

        if (
            item.mimeType === "application/vnd.google-apps.folder"
        ) {

            element.className = "folder";

            element.innerHTML = `
                <span class="folder-icon">📁</span>
                ${escapeHtml(item.name)}
            `;
            element.dataset.folderId = item.id;

            element.addEventListener(
                "click",
                () => loadDriveFiles(
                    item.id,
                    item.name
                )
            );

        }
        // --------------------------------
        // DOCUMENT
        // --------------------------------
        else {
            element.className = "document";
            const link =  document.createElement("a");

            link.href = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;

            link.target = "_blank";
            link.rel = "noopener noreferrer";

            link.textContent =
                `📄 ${item.name}`;
            element.appendChild(
                link
            );
        }
        container.appendChild(
            element
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
