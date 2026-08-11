async function startApp() {

    try {

		await openDatabase();
		await updateVehicleSchema();
		await importNewVehicles();
		await initializeMetadata();

		let vehicles = await getVehicles();

        if (vehicles.length === 0) {

            const response = await fetch("data/GarageLog.json");
            const garage = await response.json();

            await saveVehicles(garage.vehicles);

            vehicles = await getVehicles();
        }

        displayVehicles(vehicles);

    } catch (error) {

        console.error("Garage Log failed to start:", error);

        document.getElementById("app").textContent =
            "Garage Log could not start.";
    }
}

function displayVehicles(vehicles) {

    const container = document.getElementById("app");

	container.innerHTML = `
 	   <div class="garage-header">
 	       <h2>Vehicles</h2>
	
	        <div>
	            <button id="backupButton">Backup</button>
	            <button id="restoreButton">Restore</button>
	        </div>
	    </div>
	`;

document
    .getElementById("backupButton")
    .addEventListener("click", async () => {

        try {

            const garage = await exportDatabase();

            const json = JSON.stringify(
                garage,
                null,
                2
            );

            const blob = new Blob(
                [json],
                { type: "application/json" }
            );

            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");

            link.href = url;
            link.download = getBackupFilename();

            link.click();

            URL.revokeObjectURL(url);

        } catch (error) {

            console.error(
                "Garage Log backup failed:",
                error
            );

            alert("Backup failed.");
        }
    });
    
    document
    .getElementById("restoreButton")
    .addEventListener("click", () => {

        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".json,application/json";

        input.addEventListener("change", async () => {

            const file = input.files[0];

            if (!file) {
                return;
            }

            try {

                const text = await file.text();
                const garage = JSON.parse(text);

                if (
                    !garage ||
                    garage.schemaVersion === undefined ||
                    !Array.isArray(garage.vehicles) ||
                    !Array.isArray(garage.logEntries)
                ) {
                    throw new Error(
                        "This is not a valid Garage Log backup."
                    );
                }

                const confirmed = confirm(
                    "Restore this Garage Log backup?\n\n" +
                    "This will replace all data currently stored " +
                    "on this device."
                );

                if (!confirmed) {
                    return;
                }

                await importDatabase(garage);

                alert(
                    "Garage Log restored successfully."
                );

                const vehicles = await getVehicles();

                displayVehicles(vehicles);

            } catch (error) {

                console.error(
                    "Garage Log restore failed:",
                    error
                );

                alert(
                    "Restore failed. " +
                    "The backup file may be invalid."
                );
            }
        });

        input.click();
    });

    vehicles.forEach(vehicle => {

        const card = document.createElement("div");

        card.className = "vehicle";

        card.innerHTML = `
            <h2>${vehicle.nickname}</h2>
            <p>${vehicle.year} ${vehicle.make} ${vehicle.model}</p>
            <small>${vehicle.type}</small>
        `;

        card.addEventListener("click", () => {
            displayVehicle(vehicle);
        });

        container.appendChild(card);
    });
}

async function displayVehicle(vehicle) {

    const container = document.getElementById("app");

    const entries = await getLogEntriesForVehicle(vehicle.id);

    container.innerHTML = `
        <button id="backButton">← Vehicles</button>
        <button id="editButton">Edit Vehicle</button>

        <div class="vehicle-detail">

            <h1>${vehicle.nickname}</h1>

            <p class="vehicle-year">
                ${vehicle.year} ${vehicle.make} ${vehicle.model}
            </p>

            <p><strong>Type:</strong> ${vehicle.type}</p>

            <hr>

            <h2>Vehicle Information</h2>

            <p><strong>VIN:</strong>
                ${vehicle.vin || "Not recorded"}
            </p>

            <p><strong>License Plate:</strong>
                ${vehicle.licensePlate || "Not recorded"}
            </p>

            <p><strong>Purchase Date:</strong>
                ${vehicle.purchaseDate || "Not recorded"}
            </p>

            <p><strong>Current Mileage:</strong>
                ${vehicle.currentMileage !== null
                    ? vehicle.currentMileage.toLocaleString()
                    : "Not recorded"}
            </p>

            <h2>Notes</h2>

            <p>${vehicle.notes || "No notes yet."}</p>

            <hr>

            <div class="garage-log-header">
                <h2>Garage Log</h2>
                <button id="addLogButton">+ Add Entry</button>
            </div>

            <div id="logEntries">

                ${
                    entries.length === 0
                    ? "<p>No log entries yet.</p>"
                    : entries.map(entry => `
    <article class="log-entry">

        <h3>${entry.title}</h3>

        <p class="log-date">
            ${entry.date}
            ${entry.mileage !== null
                ? ` · ${entry.mileage.toLocaleString()} miles`
                : ""}
        </p>

        <p>${entry.description || ""}</p>

        ${
            entry.cost
                ? `<p><strong>Cost:</strong> $${Number(entry.cost).toFixed(2)}</p>`
                : ""
        }

        ${
            entry.notes
                ? `<p><strong>Notes:</strong> ${entry.notes}</p>`
                : ""
        }

        <button class="edit-log-button" data-id="${entry.id}">
            Edit
        </button>

        <button class="delete-log-button" data-id="${entry.id}">
            Delete
        </button>

    </article>
`).join("")
                }

            </div>

        </div>
    `;

    document
        .getElementById("backButton")
        .addEventListener("click", async () => {
            const vehicles = await getVehicles();
            displayVehicles(vehicles);
        });

    document
        .getElementById("editButton")
        .addEventListener("click", () => {
            displayVehicleEditor(vehicle);
        });

    document
        .getElementById("addLogButton")
        .addEventListener("click", () => {
            displayLogEntryEditor(vehicle);
        });
    document
    .querySelectorAll(".edit-log-button")
    .forEach(button => {

        button.addEventListener("click", () => {

            const entry = entries.find(
                entry => entry.id === button.dataset.id
            );

            displayLogEntryEditor(vehicle, entry);
        });
    });


document
    .querySelectorAll(".delete-log-button")
    .forEach(button => {

        button.addEventListener("click", async () => {

            const entry = entries.find(
                entry => entry.id === button.dataset.id
            );

            if (!confirm(
                `Delete "${entry.title}"? This cannot be undone.`
            )) {
                return;
            }

            await deleteLogEntry(entry.id);

            displayVehicle(vehicle);
        });
    });
}

function displayLogEntryEditor(vehicle, entry = null) {

    const container = document.getElementById("app");

    container.innerHTML = `
    <button id="cancelButton">← Cancel</button>

    <div class="vehicle-detail">

        <h1>${entry ? "Edit Garage Log Entry" : "New Garage Log Entry"}</h1>

        <p>
            <strong>${vehicle.nickname}</strong>
        </p>

        <label>
            Date<br>
            <input
                type="date"
                id="logDate"
                value="${entry?.date || new Date().toISOString().slice(0, 10)}"
            >
        </label>

        <label>
            Mileage<br>
            <input
                type="number"
                id="logMileage"
                value="${entry?.mileage ?? vehicle.currentMileage ?? ""}"
            >
        </label>

        <label>
            Title<br>
            <input
                type="text"
                id="logTitle"
                value="${entry?.title || ""}"
                placeholder="What did you do?"
            >
        </label>

        <label>
            Description<br>
            <textarea
                id="logDescription"
                rows="6"
                placeholder="Describe the work..."
            >${entry?.description || ""}</textarea>
        </label>

        <label>
            Cost<br>
            <input
                type="number"
                id="logCost"
                step="0.01"
                min="0"
                value="${entry?.cost ?? ""}"
                placeholder="0.00"
            >
        </label>

        <label>
            Notes<br>
            <textarea
                id="logNotes"
                rows="4"
            >${entry?.notes || ""}</textarea>
        </label>

        <button id="saveLogButton">
            ${entry ? "Save Changes" : "Save Entry"}
        </button>

    </div>
`;

    document
        .getElementById("cancelButton")
        .addEventListener("click", () => {
            displayVehicle(vehicle);
        });

    document
    .getElementById("saveLogButton")
    .addEventListener("click", async () => {

        const mileage =
            document.getElementById("logMileage").value;

        const cost =
            document.getElementById("logCost").value;

        const updatedEntry = {
            id: entry ? entry.id : crypto.randomUUID(),
            vehicleId: vehicle.id,
            date: document.getElementById("logDate").value,
            mileage: mileage === "" ? null : Number(mileage),
            title: document.getElementById("logTitle").value.trim(),
            description: document
                .getElementById("logDescription")
                .value
                .trim(),
            cost: cost === "" ? 0 : Number(cost),
            notes: document.getElementById("logNotes").value.trim(),
            photos: entry?.photos || []
        };

        if (!updatedEntry.title) {
            alert("Please enter a title.");
            return;
        }

        await updateLogEntry(updatedEntry);

        if (
            updatedEntry.mileage !== null &&
            (
                vehicle.currentMileage === null ||
                updatedEntry.mileage > vehicle.currentMileage
            )
        ) {
            vehicle.currentMileage = updatedEntry.mileage;
            await saveVehicle(vehicle);
        }

        displayVehicle(vehicle);
    });
}

function displayVehicleEditor(vehicle) {

    const container = document.getElementById("app");

    container.innerHTML = `
        <button id="cancelButton">← Cancel</button>

        <div class="vehicle-detail">

            <h1>Edit ${vehicle.nickname}</h1>

            <label>
                VIN<br>
                <input
                    type="text"
                    id="vin"
                    value="${vehicle.vin || ""}"
                >
            </label>

            <br>

            <label>
                License Plate<br>
                <input
                    type="text"
                    id="licensePlate"
                    value="${vehicle.licensePlate || ""}"
                >
            </label>

            <br>

            <label>
                Purchase Date<br>
                <input
                    type="date"
                    id="purchaseDate"
                    value="${vehicle.purchaseDate || ""}"
                >
            </label>

            <br>

            <label>
                Current Mileage<br>
                <input
                    type="number"
                    id="currentMileage"
                    value="${vehicle.currentMileage ?? ""}"
                >
            </label>

            <br>

            <label>
                Notes<br>
                <textarea id="notes" rows="6">${vehicle.notes || ""}</textarea>
            </label>

            <br>

            <button id="saveButton">Save</button>

        </div>
    `;

    document
        .getElementById("cancelButton")
        .addEventListener("click", () => {
            displayVehicle(vehicle);
        });

    document
        .getElementById("saveButton")
        .addEventListener("click", async () => {

            vehicle.vin =
                document.getElementById("vin").value.trim();

            vehicle.licensePlate =
                document.getElementById("licensePlate").value.trim();

            vehicle.purchaseDate =
                document.getElementById("purchaseDate").value;

            const mileage =
                document.getElementById("currentMileage").value;

            vehicle.currentMileage =
                mileage === "" ? null : Number(mileage);

            vehicle.notes =
                document.getElementById("notes").value.trim();

            await saveVehicle(vehicle);

            displayVehicle(vehicle);
        });
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


startApp();