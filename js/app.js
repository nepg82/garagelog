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

function displayVehicles(vehicles, sorting = false) {

    const container = document.getElementById("app");

    container.innerHTML = `
        <div class="garage-header">

            <h2>Vehicles</h2>

            <div>
                <button id="addVehicleButton">+ Add Vehicle</button>

                <button id="sortButton">
                    ${sorting ? "Save Sort" : "Sort"}
                </button>

                <button id="backupButton">Backup</button>
                <button id="restoreButton">Restore</button>
            </div>

        </div>
    `;

    // Add Vehicle

    document
        .getElementById("addVehicleButton")
        .addEventListener("click", () => {
            displayVehicleEditor();
        });


    // Sort

    document
        .getElementById("sortButton")
        .addEventListener("click", async () => {

            if (sorting) {

                for (const vehicle of vehicles) {
                    await saveVehicle(vehicle);
                }

                const updatedVehicles = await getVehicles();

                displayVehicles(updatedVehicles);

            } else {

                displayVehicles(vehicles, true);
            }
        });


    // Backup

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


    // Restore

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


    // Vehicle list

    vehicles.forEach((vehicle, index) => {

        const card = document.createElement("div");

        card.className = "vehicle";

        card.innerHTML = `
            ${
                sorting
                ? `
                    <div class="vehicle-sort-buttons">

                        <button
                            class="move-up-button"
                            data-index="${index}"
                            ${index === 0 ? "disabled" : ""}
                        >
                            ↑
                        </button>

                        <button
                            class="move-down-button"
                            data-index="${index}"
                            ${index === vehicles.length - 1 ? "disabled" : ""}
                        >
                            ↓
                        </button>

                    </div>
                `
                : ""
            }

            <h2>${vehicle.nickname}</h2>

            <p>
                ${vehicle.year} ${vehicle.make} ${vehicle.model}
            </p>
        `;

        if (!sorting) {

            card.addEventListener("click", () => {
                displayVehicle(vehicle);
            });

        }

        container.appendChild(card);
    });


    // Sorting controls

    if (sorting) {

        document
            .querySelectorAll(".move-up-button")
            .forEach(button => {

                button.addEventListener("click", () => {

                    const index =
                        Number(button.dataset.index);

                    if (index === 0) {
                        return;
                    }

                    const previous =
                        vehicles[index - 1];

                    const current =
                        vehicles[index];

                    const temp =
                        current.sortOrder;

                    current.sortOrder =
                        previous.sortOrder;

                    previous.sortOrder =
                        temp;

                    [
                        vehicles[index - 1],
                        vehicles[index]
                    ] = [
                        vehicles[index],
                        vehicles[index - 1]
                    ];

                    displayVehicles(vehicles, true);
                });
            });


        document
            .querySelectorAll(".move-down-button")
            .forEach(button => {

                button.addEventListener("click", () => {

                    const index =
                        Number(button.dataset.index);

                    if (index === vehicles.length - 1) {
                        return;
                    }

                    const next =
                        vehicles[index + 1];

                    const current =
                        vehicles[index];

                    const temp =
                        current.sortOrder;

                    current.sortOrder =
                        next.sortOrder;

                    next.sortOrder =
                        temp;

                    [
                        vehicles[index],
                        vehicles[index + 1]
                    ] = [
                        vehicles[index + 1],
                        vehicles[index]
                    ];

                    displayVehicles(vehicles, true);
                });
            });
    }
}

async function displayVehicle(vehicle) {

    const container = document.getElementById("app");

    const entries = await getLogEntriesForVehicle(vehicle.id);

    container.innerHTML = `
        <button id="backButton">← Vehicles</button>
        <button id="editButton">Edit Vehicle</button>

        <div class="vehicle-detail">

            <div class="vehicle-header">
			    <h1>${vehicle.nickname}</h1>

			    <p class="vehicle-year">
			        ${vehicle.year} ${vehicle.make} ${vehicle.model}
			    </p>

			    <p class="vehicle-type">
			        Type: ${vehicle.type === "bike" ? "Bike" : "Car"}
			    </p>
			</div>

			<hr>

			<details class="vehicle-information">

			    <summary>Vehicle Information</summary>

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

			    <h3>Notes</h3>

			    <p class="vehicle-notes">
			        ${vehicle.notes || "No notes yet."}
			    </p>

			</details>

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

        <p class="log-description">${entry.description || ""}</p>

        ${
            entry.cost
                ? `<p><strong>Cost:</strong> $${Number(entry.cost).toFixed(2)}</p>`
                : ""
        }

        ${
            entry.notes
			    ? `<p class="log-notes"><strong>Notes:</strong><br>${entry.notes}</p>`
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

function displayVehicleEditor(vehicle = null) {

    const container = document.getElementById("app");

    const isNew = vehicle === null;

    container.innerHTML = `
        <button id="cancelButton">← ${isNew ? "Vehicles" : "Cancel"}</button>

        <div class="vehicle-detail">

            <h1>${isNew ? "Add Vehicle" : `Edit ${vehicle.nickname}`}</h1>

            <label>
                Nickname<br>
                <input
                    type="text"
                    id="nickname"
                    value="${vehicle?.nickname || ""}"
                >
            </label>

            <br>

            <label>
                Year<br>
                <input
                    type="number"
                    id="year"
                    value="${vehicle?.year || ""}"
                >
            </label>

            <br>

            <label>
                Make<br>
                <input
                    type="text"
                    id="make"
                    value="${vehicle?.make || ""}"
                >
            </label>

            <br>

            <label>
                Model<br>
                <input
                    type="text"
                    id="model"
                    value="${vehicle?.model || ""}"
                >
            </label>

            <br>

            <label>
                Type<br>
                <select id="type">
                    <option value="car"
                        ${vehicle?.type === "car" ? "selected" : ""}>
                        Car
                    </option>

                    <option value="bike"
                        ${vehicle?.type === "bike" ? "selected" : ""}>
                        Bike
                    </option>
                </select>
            </label>

            <br>

            <label>
                VIN<br>
                <input
                    type="text"
                    id="vin"
                    value="${vehicle?.vin || ""}"
                >
            </label>

            <br>

            <label>
                License Plate<br>
                <input
                    type="text"
                    id="licensePlate"
                    value="${vehicle?.licensePlate || ""}"
                >
            </label>

            <br>

            <label>
                Purchase Date<br>
                <input
                    type="date"
                    id="purchaseDate"
                    value="${vehicle?.purchaseDate || ""}"
                >
            </label>

            <br>

            <label>
                Current Mileage<br>
                <input
                    type="number"
                    id="currentMileage"
                    value="${vehicle?.currentMileage ?? ""}"
                >
            </label>

            <br>

            <label>
                Notes<br>
                <textarea
                    id="notes"
                    rows="6"
                >${vehicle?.notes || ""}</textarea>
            </label>

            <br>

            <button id="saveButton">
                ${isNew ? "Add Vehicle" : "Save"}
            </button>

            ${
                isNew
                ? ""
                : `
                    <hr>

                    <button id="deleteButton">
                        Delete Vehicle
                    </button>
                `
            }

        </div>
    `;

    document
        .getElementById("cancelButton")
        .addEventListener("click", async () => {

            if (isNew) {
                const vehicles = await getVehicles();
                displayVehicles(vehicles);
            } else {
                displayVehicle(vehicle);
            }
        });

    document
        .getElementById("saveButton")
        .addEventListener("click", async () => {

            const nickname =
                document.getElementById("nickname").value.trim();

            const year =
                document.getElementById("year").value;

            const make =
                document.getElementById("make").value.trim();

            const model =
                document.getElementById("model").value.trim();

            if (!nickname || !year || !make || !model) {
                alert(
                    "Please enter a nickname, year, make, and model."
                );
                return;
            }

            const mileage =
                document.getElementById("currentMileage").value;

            const updatedVehicle = {

                id: vehicle?.id || crypto.randomUUID(),

				sortOrder:
				    vehicle?.sortOrder ??
				    (await getVehicles()).length,

                nickname,

                year: Number(year),

                make,

                model,

                type:
                    document.getElementById("type").value,

                vin:
                    document.getElementById("vin").value.trim(),

                licensePlate:
                    document
                        .getElementById("licensePlate")
                        .value
                        .trim(),

                purchaseDate:
                    document
                        .getElementById("purchaseDate")
                        .value,

                currentMileage:
                    mileage === ""
                        ? null
                        : Number(mileage),

                notes:
                    document
                        .getElementById("notes")
                        .value
                        .trim()
            };

            await saveVehicle(updatedVehicle);

            if (isNew) {

                const vehicles = await getVehicles();
                displayVehicles(vehicles);

            } else {

                displayVehicle(updatedVehicle);
            }
        });

    if (!isNew) {

        document
            .getElementById("deleteButton")
            .addEventListener("click", async () => {

                const confirmed = confirm(
                    `Delete "${vehicle.nickname}"?\n\n` +
                    `This will permanently delete this vehicle ` +
                    `and all of its Garage Log entries.\n\n` +
                    `This cannot be undone.`
                );

                if (!confirmed) {
                    return;
                }

                const finalConfirmed = confirm(
                    `Are you REALLY sure you want to delete ` +
                    `"${vehicle.nickname}"?`
                );

                if (!finalConfirmed) {
                    return;
                }

                await deleteVehicle(vehicle.id);

                const vehicles = await getVehicles();

                displayVehicles(vehicles);
            });
    }
}

if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


startApp();