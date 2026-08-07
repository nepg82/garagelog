async function loadGarageLog() {

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
}


if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
}


loadGarageLog();
