async function startApp() {

    try {

        await openDatabase();
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

        <div class="vehicle-detail">

            <h1>${vehicle.nickname}</h1>

            <p class="vehicle-year">
                ${vehicle.year} ${vehicle.make} ${vehicle.model}
            </p>

            <p><strong>Type:</strong> ${vehicle.type}</p>

            <hr>

            <h2>Service History</h2>
            <p>No service records yet.</p>

            <h2>Projects</h2>
            <p>No projects yet.</p>

            <h2>Notes</h2>
            <p>No notes yet.</p>

        </div>
    `;

    document
        .getElementById("backButton")
        .addEventListener("click", async () => {

            const vehicles = await getVehicles();

            displayVehicles(vehicles);
        });
}


if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


startApp();