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
        <h2>Vehicles</h2>
    `;

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

function displayVehicle(vehicle) {

    const container = document.getElementById("app");

    container.innerHTML = `
        <button id="backButton">← Vehicles</button>
        <button id="editButton">Edit</button>

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

            <h2>Service History</h2>
            <p>No service records yet.</p>

            <h2>Projects</h2>
            <p>No projects yet.</p>

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