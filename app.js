const library = [
    {
        type: "folder",
        name: "ROLEX",
        documents: [
            "Rolex 3135 Service Manual",
            "Rolex 3235 Service Manual",
            "Rolex 4130 Service Manual"
        ]
    },

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
        name: "ETA",
        documents: [
            "ETA 2824 Technical Manual",
            "ETA 7750 Technical Manual"
        ]
    },

    {
        type: "folder",
        name: "SELLITA",
        documents: [
            "SW200 Technical Manual",
            "SW300 Technical Manual"
        ]
    }
];


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

            documentElement.className =
                "document";

            documentElement.innerHTML =
                `<span class="document-icon">📄</span>
                 ${documentName}`;

            container.appendChild(documentElement);

        });

    });

}


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


function syncLibrary() {

    alert(
        "Google Drive synchronization will be added in the next stage."
    );

}


displayLibrary();
