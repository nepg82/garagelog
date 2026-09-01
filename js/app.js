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

function getDueStatus(dateStr) {
// Returns null if no date, otherwise { days, state } where state is
// "overdue" | "soon" | "ok" based on a 30-day warning window.

    if (!dateStr) return null;

    const [y, m, d] = dateStr.split("-").map(Number);
    const due = new Date(y, m - 1, d);
    const today = new Date();

    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    const days = Math.round((due - today) / 86400000);

    return {
        days,
        state: days < 0 ? "overdue" : days <= 30 ? "soon" : "ok"
    };
}

function addOneYear(dateStr) {
// Adds one year to a "YYYY-MM-DD" date string, returning a new
// "YYYY-MM-DD" string. Used by the "Renew" buttons.

    const [y, m, d] = dateStr.split("-").map(Number);
    const next = new Date(y + 1, m - 1, d);

    const pad = n => String(n).padStart(2, "0");

    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

function getVehicleReminderSummary(vehicle) {
// Picks whichever of a vehicle's due dates is most urgent.
// Returns null if neither registrationDue nor inspectionDue is set.

    const candidates = [
        { label: "Registration", dateStr: vehicle.registrationDue },
        { label: "Inspection", dateStr: vehicle.inspectionDue }
    ].filter(r => r.dateStr);

    if (candidates.length === 0) return null;

    const withStatus = candidates
        .map(r => ({ ...r, ...getDueStatus(r.dateStr) }))
        .sort((a, b) => a.days - b.days);

    return withStatus[0];
}

function formatDueLine(dateStr) {
// Human-readable line for the vehicle detail page, e.g.
// "Mar 15, 2027 (12 days)" or "Mar 15, 2026 (overdue by 4 days)"

    const status = getDueStatus(dateStr);

    const dateLabel = new Date(`${dateStr}T00:00:00`)
        .toLocaleDateString(undefined, {
            year: "numeric", month: "short", day: "numeric"
        });

    if (status.state === "overdue") {
        const overdueBy = Math.abs(status.days);
        return `${dateLabel} (overdue by ${overdueBy} day${overdueBy === 1 ? "" : "s"})`;
    }

    return `${dateLabel} (${status.days} day${status.days === 1 ? "" : "s"})`;
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

function buildVehicleCard(vehicle, { sorting = false, index = 0, total = 0 } = {}) {

    const card = document.createElement("div");

    const reminder = getVehicleReminderSummary(vehicle);

    card.className = "vehicle" +
        (reminder?.state === "overdue" ? " overdue" :
         reminder?.state === "soon" ? " due-soon" : "") +
        (vehicle.active === false ? " inactive" : "");

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
                        ${index === total - 1 ? "disabled" : ""}
                    >
                        ↓
                    </button>

                </div>
            `
            : ""
        }

        <div class="vehicle-content">

            <div class="vehicle-main">

                <h2>${vehicle.nickname}</h2>

                <p>
                    ${vehicle.year} ${vehicle.make} ${vehicle.model}
                </p>

            </div>

            ${
                reminder && reminder.state !== "ok"
                ? `
                    <p class="vehicle-reminder-badge">
                        ${reminder.label}
                        ${reminder.state === "overdue" ? "overdue" : `due in ${reminder.days}d`}
                    </p>
                `
                : ""
            }

        </div>
    `;

    return card;
}

function displayVehicles(vehicles, sorting = false) {

    const container = document.getElementById("app");

    refreshDataVersion();

    // In sorting mode, `vehicles` is already the active-only, sortable
    // list handed in by the Sort button below — inactive vehicles are
    // quarantined out of the main list and aren't sortable. In normal
    // mode `vehicles` is the full list, so split it into active and
    // inactive groups for display.
    const activeVehicles = sorting
        ? vehicles
        : vehicles.filter(vehicle => vehicle.active !== false);

    const inactiveVehicles = sorting
        ? []
        : vehicles.filter(vehicle => vehicle.active === false);

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

                displayVehicles(activeVehicles, true);
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

    activeVehicles.forEach((vehicle, index) => {

        const card = buildVehicleCard(vehicle, {
            sorting,
            index,
            total: activeVehicles.length
        });

        if (!sorting) {

            card.addEventListener("click", () => {
                displayVehicle(vehicle);
            });

        }

        container.appendChild(card);
    });

    // Inactive (quarantined) vehicles — collapsed out of the way,
    // still one tap from the main screen.

    if (!sorting && inactiveVehicles.length > 0) {

        const section = document.createElement("details");
        section.className = "inactive-vehicles";

        section.innerHTML = `
            <summary>
                <h2>
                    Inactive Vehicles
                    <span class="plan-count">(${inactiveVehicles.length})</span>
                </h2>
            </summary>
        `;

        inactiveVehicles.forEach(vehicle => {

            const card = buildVehicleCard(vehicle);

            card.addEventListener("click", () => {
                displayVehicle(vehicle);
            });

            section.appendChild(card);
        });

        container.appendChild(section);
    }


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

function renderPlanDescription(plan, vehicleId = null) {
// Renders a plan's description as plain text, or — if it contains
// checklist lines like "[ ] task" / "[x] task" — as a mix of plain
// paragraphs and real checkboxes. Checkbox state lives entirely in the
// description text, so no schema/DB changes are needed.

    if (!plan.description) return "";

    const lines = plan.description.split("\n");

    const hasChecklist = lines.some(line =>
        /^\s*\[[ xX]\]/.test(line)
    );

    if (!hasChecklist) {
        return `<p class="log-description">${plan.description}</p>`;
    }

    return `
        <div
            class="log-description plan-checklist"
            data-plan-id="${plan.id}"
            ${vehicleId ? `data-vehicle-id="${vehicleId}"` : ""}
        >
            ${lines.map((line, index) => {

                const match = line.match(/^\s*\[([ xX])\]\s?(.*)$/);

                if (match) {
                    const checked = match[1].toLowerCase() === "x";
                    const text = match[2];

                    return `
                        <label class="plan-checklist-item">
                            <input
                                type="checkbox"
                                class="plan-checklist-checkbox"
                                data-line-index="${index}"
                                ${checked ? "checked" : ""}
                            >
                            <span>${text}</span>
                        </label>
                    `;
                }

                return line.trim()
                    ? `<p class="log-description">${line}</p>`
                    : "";
            }).join("")}
        </div>
    `;
}

function toggleChecklistLine(description, lineIndex) {
// Flips a single "[ ]" / "[x]" line within a plan description string
// and returns the updated description.

    const lines = description.split("\n");
    const match = lines[lineIndex].match(/^(\s*)\[([ xX])\](.*)$/);

    if (!match) return description;

    const [, indent, mark, rest] = match;
    const newMark = mark.toLowerCase() === "x" ? " " : "x";

    lines[lineIndex] = `${indent}[${newMark}]${rest}`;

    return lines.join("\n");
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

                                        ${renderPlanDescription(plan, vehicle.id)}

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

    document
        .querySelectorAll(".plan-checklist-checkbox")
        .forEach(checkbox => {
            checkbox.addEventListener("change", async () => {

                const container = checkbox.closest(".plan-checklist");
                const lineIndex = Number(checkbox.dataset.lineIndex);

                const { plan } = findVehiclePlan(
                    container.dataset.vehicleId,
                    container.dataset.planId
                );

                plan.description = toggleChecklistLine(
                    plan.description,
                    lineIndex
                );

                await savePlan(plan);
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

                <p><strong>Purchase Date:</strong>
                    ${vehicle.purchaseDate || "Not recorded"}
                </p>

                <p><strong>Last Mileage:</strong>
                    ${vehicle.currentMileage !== null
                        ? vehicle.currentMileage.toLocaleString()
                        : "Not recorded"}
                </p>

                <p><strong>Registration Due:</strong>
                    ${vehicle.registrationDue
                        ? formatDueLine(vehicle.registrationDue)
                        : "Not set"}
                    ${vehicle.registrationDue &&
                      getDueStatus(vehicle.registrationDue).state !== "ok"
                        ? `<button id="renewRegistrationButton">Renew +1yr</button>`
                        : ""}
                </p>

                <p><strong>Inspection Due:</strong>
                    ${vehicle.inspectionDue
                        ? formatDueLine(vehicle.inspectionDue)
                        : "Not set"}
                    ${vehicle.inspectionDue &&
                      getDueStatus(vehicle.inspectionDue).state !== "ok"
                        ? `<button id="renewInspectionButton">Renew +1yr</button>`
                        : ""}
                </p>

                <h3>Notes</h3>

                <p class="vehicle-notes">${vehicle.notes || "No notes yet."}</p>

                <button id="toggleActiveButton">
                    ${vehicle.active === false ? "Reactivate" : "Mark Inactive"}
                </button>

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

                                    ${renderPlanDescription(plan)}

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

        if (vehicle.registrationDue &&
        getDueStatus(vehicle.registrationDue).state !== "ok") {

        document
            .getElementById("renewRegistrationButton")
            .addEventListener("click", async () => {

                vehicle.registrationDue = addOneYear(vehicle.registrationDue);

                await saveVehicle(vehicle);

                displayVehicle(vehicle);
            });
    }

    if (vehicle.inspectionDue &&
        getDueStatus(vehicle.inspectionDue).state !== "ok") {

        document
            .getElementById("renewInspectionButton")
            .addEventListener("click", async () => {

                vehicle.inspectionDue = addOneYear(vehicle.inspectionDue);

                await saveVehicle(vehicle);

                displayVehicle(vehicle);
            });
    }

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
        .getElementById("toggleActiveButton")
        .addEventListener("click", async () => {

            vehicle.active = vehicle.active === false;

            await saveVehicle(vehicle);

            displayVehicle(vehicle);
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

    document
        .querySelectorAll(".plan-checklist-checkbox")
        .forEach(checkbox => {
            checkbox.addEventListener("change", async () => {

                const container = checkbox.closest(".plan-checklist");
                const lineIndex = Number(checkbox.dataset.lineIndex);

                const plan = plans.find(
                    plan => plan.id === container.dataset.planId
                );

                plan.description = toggleChecklistLine(
                    plan.description,
                    lineIndex
                );

                await savePlan(plan);
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
        .getElementById("planDescription")
        .addEventListener("input", event => {

            const textarea = event.target;
            const pos = textarea.selectionStart;
            const value = textarea.value;

            // Typing "[]" anywhere expands it into a checkbox marker.
            if (value.slice(pos - 2, pos) === "[]") {

                const newValue =
                    value.slice(0, pos - 2) + "[ ] " + value.slice(pos);

                textarea.value = newValue;

                const newPos = pos - 2 + 4;
                textarea.setSelectionRange(newPos, newPos);
            }
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
                Registration Due<br>
                <input
                    type="date"
                    id="registrationDue"
                    value="${vehicle?.registrationDue || ""}"
                >
            </label>

            <br>

            <label>
                Inspection Due<br>
                <input
                    type="date"
                    id="inspectionDue"
                    value="${vehicle?.inspectionDue || ""}"
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

            <label>
                <input
                    type="checkbox"
                    id="active"
                    ${vehicle?.active === false ? "" : "checked"}
                >
                Active (uncheck to quarantine in Inactive Vehicles)
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

                purchaseDate:
                    document
                        .getElementById("purchaseDate")
                        .value,

                currentMileage:
                    mileage === ""
                        ? null
                        : Number(mileage),

				registrationDue:
                    document
                        .getElementById("registrationDue")
                        .value,

                inspectionDue:
                    document
                        .getElementById("inspectionDue")
                        .value,

                notes:
                    document
                        .getElementById("notes")
                        .value
                        .trim(),

                active:
                    document
                        .getElementById("active")
                        .checked
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