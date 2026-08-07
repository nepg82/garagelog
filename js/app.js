async function startApp() {

    try {
        const db = await openDatabase();

        console.log("Garage Log database opened:", db.name);

        const response = await fetch("data/GarageLog.json");
        const garage = await response.json();

        const container = document.getElementById("app");

        container.innerHTML = "";

        garage.vehicles.forEach(vehicle => {

            const card = document.createElement("div");
            card.className = "vehicle";

            card.innerHTML = `
                <h2>${vehicle.nickname}</h2>
                <p>${vehicle.year} ${vehicle.make} ${vehicle.model}</p>
                <small>${vehicle.type}</small>
            `;

            container.appendChild(card);
        });

    } catch (error) {

        console.error("Garage Log failed to start:", error);

        document.getElementById("app").textContent =
            "Garage Log could not start.";
    }
}


if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


startApp();