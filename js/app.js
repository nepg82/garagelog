async function startApp() {

    try {

        await openDatabase();

        let vehicles = await getVehicles();

        // First run: import vehicles from JSON
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

    container.innerHTML = "";

    vehicles.forEach(vehicle => {

        const card = document.createElement("div");

        card.className = "vehicle";

        card.innerHTML = `
            <h2>${vehicle.nickname}</h2>
            <p>${vehicle.year} ${vehicle.make} ${vehicle.model}</p>
            <small>${vehicle.type}</small>
        `;

        container.appendChild(card);
    });
}


if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


startApp();