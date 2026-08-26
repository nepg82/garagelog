function getLocalDate() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatDataVersion(isoString) {

    const date = new Date(isoString);

    const pad = number =>
        String(number).padStart(2, "0");

    const yy = String(date.getFullYear()).slice(-2);
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());

    return `v.${yy}${mm}${dd}-${hh}${min}`;
}

async function refreshDataVersion() {

    const versionElement = document.getElementById("dataVersion");

    if (!versionElement) {
        return;
    }

    const lastModified = await getMetadataValue("lastModified");
    const lastPushed = await getMetadataValue("lastPushedTimestamp");

    // Show the last synced (pushed/restored) time — not the last edit
    // time. Falls back to lastModified only if nothing has ever been
    // pushed or restored yet.
    const displayTimestamp = lastPushed || lastModified;

    if (!displayTimestamp) {
        return;
    }

    versionElement.textContent = formatDataVersion(displayTimestamp);

    // Dirty (needs backup) whenever local edits exist that haven't
    // been pushed — regardless of what the displayed date says.
    if (lastModified && lastPushed !== lastModified) {
        versionElement.classList.add("data-version-dirty");
    } else {
        versionElement.classList.remove("data-version-dirty");
    }
}

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

        await refreshDataVersion();

        const lastModified = await getMetadataValue("lastModified");

        if (lastModified) {
            GitHubSync.runLaunchCheck(lastModified);
        }
        
    } catch (error) {

        console.error("GarageLog failed to start:", error);

        document.getElementById("app").textContent =
            "GarageLog could not start.";
    }
}

function displayVehicles(vehicles, sorting = false) {

    const container = document.getElementById("app");

    refreshDataVersion();

    container.innerHTML = `
        <div class="garage-header">

            <!-- <h2>Vehicles</h2> -->

    ${
        sorting
        ? `
            <button id="sortButton" class="primary">
                Save Sort
            </button>
        `
        : `
            <button id="allPlansButton">
			    Plans
			</button>

            <button id="addVehicleButton" class="primary">
                Add
            </button>

			<button id="sortButton" class="primary">
                 Sort
            </button>

            <button id="backupButton">
                Backup
            </button>

            <button id="restoreButton">
                Restore
            </button>
        `
    }

        </div>
    `;

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


if (!sorting) {
    // Add Vehicle

    document
        .getElementById("addVehicleButton")
        .addEventListener("click", () => {
            displayVehicleEditor();
        });

	document
    	.getElementById("allPlansButton")
	    .addEventListener("click", () => {
    	    displayAllPlans();
	    });

    // Backup

    document
        .getElementById("backupButton")
        .addEventListener("click", async () => {

            const choice = await GitHubSync.chooseStorage("Backup");

            if (choice === "local") {

                try {

                    const garage = await exportDatabase();

                    const json = JSON.stringify(garage, null, 2);

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

                    console.error("GarageLog backup failed:", error);

                    alert("Backup failed.");
                }

            } else if (choice === "git") {

                await GitHubSync.pushBackup();
            }
        });


    // Restore

    document
        .getElementById("restoreButton")
        .addEventListener("click", async () => {

            const choice = await GitHubSync.chooseStorage("Restore");

            if (choice === "local") {

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
                                "This is not a valid GarageLog backup."
                            );
                        }

                        const confirmed = confirm(
                            "Restore this GarageLog backup?\n\n" +
                            "This will replace all data currently stored " +
                            "on this device."
                        );

                        if (!confirmed) {
                            return;
                        }

                        await importDatabase(garage);

                        alert(
                            "GarageLog restored successfully."
                        );

                        const vehicles = await getVehicles();

                        displayVehicles(vehicles);

                    } catch (error) {

                        console.error(
                            "GarageLog restore failed:",
                            error
                        );

                        alert(
                            "Restore failed. " +
                            "The backup file may be invalid."
                        );
                    }
                });

                input.click();

            } else if (choice === "git") {

                await GitHubSync.pullRestore();
            }
        });
}

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

async function displayAllPlans() {

    const container = document.getElementById("app");

    refreshDataVersion();

    const vehicles = await getVehicles();

    const vehiclePlans = [];

    for (const vehicle of vehicles) {

        const plans = await getPlansForVehicle(vehicle.id);

        if (plans.length > 0) {
            vehiclePlans.push({ vehicle, plans });
        }
    }

    container.innerHTML = `
        <button id="backButton">← Vehicles</button>

        <div class="vehicle-detail">

            <h1>All Plans</h1>

            ${
                vehiclePlans.length === 0
                ? "<p>No plans yet on any vehicle.</p>"
                : vehiclePlans.map(({ vehicle, plans }) => `
                    <details name="all-plans-sections" class="vehicle-plans">

                        <summary>
                            <h2>
                                ${vehicle.nickname}
                                <span class="plan-count">(${plans.length})</span>
                            </h2>
                        </summary>

                        <div class="plans-list">

                            ${plans.map(plan => `
                                <details class="log-entry plan-entry">

                                    <summary class="log-summary">

                                        <span class="log-title">
                                            ${plan.title}
                                        </span>

                                        <span class="log-date">
                                            ${plan.date || ""}
                                        </span>

                                        <span class="log-mileage">
                                            ${
                                                plan.mileage !== null &&
                                                plan.mileage !== undefined
                                                    ? `${plan.mileage.toLocaleString()} miles`
                                                    : ""
                                            }
                                        </span>

                                    </summary>

                                    <div class="log-details">

                                        ${
                                            plan.description
                                                ? `<p class="log-description">${plan.description}</p>`
                                                : ""
                                        }

                                        <button
                                            class="edit-plan-button"
                                            data-vehicle-id="${vehicle.id}"
                                            data-id="${plan.id}"
                                        >
                                            Edit
                                        </button>

                                        <button
                                            class="complete-plan-button primary"
                                            data-vehicle-id="${vehicle.id}"
                                            data-id="${plan.id}"
                                        >
                                            Complete
                                        </button>

                                        <button
                                            class="delete-plan-button danger"
                                            data-vehicle-id="${vehicle.id}"
                                            data-id="${plan.id}"
                                        >
                                            Delete
                                        </button>

                                    </div>

                                </details>
                            `).join("")}

                        </div>

                    </details>
                `).join("")
            }

        </div>
    `;

    document
        .getElementById("backButton")
        .addEventListener("click", async () => {
            const vehicles = await getVehicles();
            displayVehicles(vehicles);
        });

    const findVehiclePlan = (vehicleId, planId) => {
        const entry = vehiclePlans.find(vp => vp.vehicle.id === vehicleId);
        const plan = entry.plans.find(p => p.id === planId);
        return { vehicle: entry.vehicle, plan };
    };

    document
        .querySelectorAll(".edit-plan-button")
        .forEach(button => {
            button.addEventListener("click", () => {

                const { vehicle, plan } = findVehiclePlan(
                    button.dataset.vehicleId,
                    button.dataset.id
                );

                displayPlanEditor(vehicle, plan, () => displayAllPlans());
            });
        });

    document
        .querySelectorAll(".complete-plan-button")
        .forEach(button => {
            button.addEventListener("click", () => {

                const { vehicle, plan } = findVehiclePlan(
                    button.dataset.vehicleId,
                    button.dataset.id
                );

                displayPlanCompletion(vehicle, plan, () => displayAllPlans());
            });
        });

    document
        .querySelectorAll(".delete-plan-button")
        .forEach(button => {
            button.addEventListener("click", async () => {

                const { vehicle, plan } = findVehiclePlan(
                    button.dataset.vehicleId,
                    button.dataset.id
                );

                if (!confirm(
                    `Delete "${plan.title}"? This cannot be undone.`
                )) {
                    return;
                }

                await deletePlan(plan.id);

                displayAllPlans();
            });
        });
}

async function displayVehicle(vehicle) {

    const container = document.getElementById("app");

    refreshDataVersion();

    const entries = await getLogEntriesForVehicle(vehicle.id);
    const plans = await getPlansForVehicle(vehicle.id);

    container.innerHTML = `
        <button id="backButton">← Vehicles</button>
        <button id="editButton" class="primary">Edit Vehicle</button>

        <div class="vehicle-detail">

            <details name="vehicle-sections" class="vehicle-information">

  			  <summary class="vehicle-header">

   			     <h1>${vehicle.nickname}</h1>

   			     <p class="vehicle-year">${vehicle.year} ${vehicle.make} ${vehicle.model}</p>

  			  </summary>

                <p><strong>VIN:</strong>
                    ${vehicle.vin || "Not recorded"}
                </p>

                <p><strong>License Plate:</strong>
                    ${vehicle.licensePlate || "Not recorded"}
                </p>

                <p><strong>Purchase Date:</strong>
                    ${vehicle.purchaseDate || "Not recorded"}
                </p>

                <p><strong>Last Mileage:</strong>
                    ${vehicle.currentMileage !== null
                        ? vehicle.currentMileage.toLocaleString()
                        : "Not recorded"}
                </p>

                <h3>Notes</h3>

                <p class="vehicle-notes">${vehicle.notes || "No notes yet."}</p>

            </details>

            <hr>

            <details name="vehicle-sections" class="vehicle-log">

                <summary>
                    <h2>Service Log</h2>
                </summary>

                <div class="garage-log-header">
                    <button id="addLogButton" class="primary">
                        + Add Entry
                    </button>
                </div>

                <div id="logEntries">

                    ${
                        entries.length === 0
                        ? "<p>No log entries yet.</p>"
                        : entries.map(entry => `
                            <details class="log-entry">

                                <summary class="log-summary">

                                    <span class="log-title">
                                        ${entry.title}
                                    </span>

                                    <span class="log-date">
                                        ${entry.date}
                                    </span>

                                    <span class="log-mileage">
                                        ${entry.mileage !== null
                                            ? `${entry.mileage.toLocaleString()} miles`
                                            : ""}
                                    </span>

                                </summary>

                                <div class="log-details">

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

                                    <button
                                        class="edit-log-button"
                                        data-id="${entry.id}"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        class="delete-log-button danger"
                                        data-id="${entry.id}"
                                    >
                                        Delete
                                    </button>

                                </div>

                            </details>
                        `).join("")
                    }

                </div>

            </details>

            <hr>

            <details name="vehicle-sections" class="vehicle-plans">

                <summary>
                    <h2>Big Plans</h2>
                </summary>

                <div class="garage-log-header">
                    <button id="addPlanButton" class="primary">
                        + Add Plan
                    </button>
                </div>

                <div id="plans">

                    ${
                        plans.length === 0
                        ? "<p>No plans yet.</p>"
                        : plans.map(plan => `
                            <details class="log-entry plan-entry">

                                <summary class="log-summary">

                                    <span class="log-title">
                                        ${plan.title}
                                    </span>

                                    <span class="log-date">
                                        ${plan.date || ""}
                                    </span>

                                    <span class="log-mileage">
                                        ${
                                            plan.mileage !== null &&
                                            plan.mileage !== undefined
                                                ? `${plan.mileage.toLocaleString()} miles`
                                                : ""
                                        }
                                    </span>

                                </summary>

                                <div class="log-details">

                                    ${
                                        plan.description
                                            ? `<p class="log-description">${plan.description}</p>`
                                            : ""
                                    }

                                    <button
                                        class="edit-plan-button"
                                        data-id="${plan.id}"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        class="complete-plan-button primary"
                                        data-id="${plan.id}"
                                    >
                                        Complete
                                    </button>

                                    <button
                                        class="delete-plan-button danger"
                                        data-id="${plan.id}"
                                    >
                                        Delete
                                    </button>

                                </div>

                            </details>
                        `).join("")
                    }

                </div>

            </details>

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
        .getElementById("addPlanButton")
        .addEventListener("click", () => {
            displayPlanEditor(vehicle);
        });

    document
        .querySelectorAll(".edit-plan-button")
        .forEach(button => {
            button.addEventListener("click", () => {

                const plan = plans.find(
                    plan => plan.id === button.dataset.id
                );

                displayPlanEditor(vehicle, plan);
            });
        });

    document
        .querySelectorAll(".delete-plan-button")
        .forEach(button => {
            button.addEventListener("click", async () => {

                const plan = plans.find(
                    plan => plan.id === button.dataset.id
                );

                if (!confirm(
                    `Delete "${plan.title}"? This cannot be undone.`
                )) {
                    return;
                }

                await deletePlan(plan.id);

                displayVehicle(vehicle);
            });
        });

    document
        .querySelectorAll(".complete-plan-button")
        .forEach(button => {
            button.addEventListener("click", () => {

                const plan = plans.find(
                    plan => plan.id === button.dataset.id
                );

                displayPlanCompletion(vehicle, plan);
            });
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

function displayPlanEditor(vehicle, plan = null, onDone = () => displayVehicle(vehicle)) {

    const container = document.getElementById("app");

    container.innerHTML = `
    <button id="cancelButton">← Cancel</button>

    <div class="vehicle-detail">

        <h1>${plan ? "Edit Plan" : "New Plan"}</h1>

        <p>
            <strong>${vehicle.nickname}</strong>
        </p>

        <label>
            Title<br>
            <input
                type="text"
                id="planTitle"
                value="${plan?.title || ""}"
                placeholder="What do you plan to do?"
            >
        </label>

        <label>
            Planned Date<br>
            <input
                type="date"
                id="planDate"
                value="${plan?.date || ""}"
            >
        </label>

        <label>
            Planned Mileage<br>
            <input
                type="number"
                id="planMileage"
                value="${plan?.mileage ?? ""}"
                placeholder="Optional"
            >
        </label>

        <label>
            Description<br>
            <textarea
                id="planDescription"
                rows="6"
                placeholder="Optional notes about the plan..."
            >${plan?.description || ""}</textarea>
        </label>

        <button id="savePlanButton" class="primary">
            ${plan ? "Save Changes" : "Save Plan"}
        </button>

    </div>
    `;


    document
        .getElementById("cancelButton")
        .addEventListener("click", () => {
    	    onDone();
        });


    document
        .getElementById("savePlanButton")
        .addEventListener("click", async () => {

            const title =
                document.getElementById("planTitle").value.trim();

            if (!title) {
                alert("Please enter a title.");
                return;
            }

            const mileage =
                document.getElementById("planMileage").value;

            const updatedPlan = {

                id: plan?.id || crypto.randomUUID(),

                vehicleId: vehicle.id,

                title,

                date:
                    document
                        .getElementById("planDate")
                        .value,

                mileage:
                    mileage === ""
                        ? null
                        : Number(mileage),

                description:
                    document
                        .getElementById("planDescription")
                        .value
                        .trim()
            };

            await savePlan(updatedPlan);

	        onDone();
        });
}

function displayPlanCompletion(vehicle, plan, onDone = () => displayVehicle(vehicle)) {

    const container = document.getElementById("app");

    container.innerHTML = `
    <button id="cancelButton">← Cancel</button>

    <div class="vehicle-detail">

        <h1>Complete Plan</h1>

        <p>
            <strong>${vehicle.nickname}</strong>
        </p>

        <p>
            <strong>${plan.title}</strong>
        </p>

        ${
            plan.description
                ? `<p class="log-description">${plan.description}</p>`
                : ""
        }

        <label>
            Completion Date<br>
            <input
                type="date"
                id="completionDate"
                value="${getLocalDate()}"
            >
        </label>

        <label>
            Completion Mileage<br>
            <input
                type="number"
                id="completionMileage"
                placeholder="Optional"
            >
        </label>

        <button id="completeButton" class="primary">
            Complete Plan
        </button>

    </div>
    `;


    document
        .getElementById("cancelButton")
        .addEventListener("click", () => {
			onDone();
        });


    document
        .getElementById("completeButton")
        .addEventListener("click", async () => {

            const date =
                document.getElementById("completionDate").value;

            const mileage =
                document.getElementById("completionMileage").value;

            if (!date) {
                alert("Please enter a completion date.");
                return;
            }

            const logEntry = {

                id: crypto.randomUUID(),

                vehicleId: vehicle.id,

                date,

                mileage:
                    mileage === ""
                        ? null
                        : Number(mileage),

                title: plan.title,

                description: plan.description || "",

                cost: 0,

                notes: "",

                photos: []
            };

            await saveLogEntry(logEntry);

            await deletePlan(plan.id);

            if (
                logEntry.mileage !== null &&
                (
                    vehicle.currentMileage === null ||
                    logEntry.mileage > vehicle.currentMileage
                )
            ) {
                vehicle.currentMileage = logEntry.mileage;
                await saveVehicle(vehicle);
            }

				 onDone();
        });
}

function displayLogEntryEditor(vehicle, entry = null) {

    const container = document.getElementById("app");

    container.innerHTML = `
    <button id="cancelButton">← Cancel</button>

    <div class="vehicle-detail">

        <h1>${entry ? "Edit GarageLog Entry" : "New GarageLog Entry"}</h1>

        <p>
            <strong>${vehicle.nickname}</strong>
        </p>

        <label>
            Date<br>
            <input
                type="date"
                id="logDate"
                value="${entry?.date || getLocalDate()}"
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
            <textarea id="logDescription" rows="6" placeholder="Describe the work...">${entry?.description || ""}</textarea>
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
            <textarea id="logNotes" rows="4">${entry?.notes || ""}</textarea>
        </label>

        <button id="saveLogButton" class="primary">
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

            <button id="saveButton" class="primary">
                ${isNew ? "Add Vehicle" : "Save"}
            </button>

            ${
                isNew
                ? ""
                : `
                    <hr>

                    <button id="deleteButton" class="danger">
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
                    `and all of its GarageLog entries.\n\n` +
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
