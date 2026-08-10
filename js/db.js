const DB_NAME = "GarageLog";
const DB_VERSION = 3;

function openDatabase() {
    return new Promise((resolve, reject) => {

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = event => {
            const db = event.target.result;

            // Vehicles
            if (!db.objectStoreNames.contains("vehicles")) {
                db.createObjectStore("vehicles", {
                    keyPath: "id"
                });
            }

            // Service records
            if (!db.objectStoreNames.contains("serviceRecords")) {
                db.createObjectStore("serviceRecords", {
                    keyPath: "id"
                });
            }

            // Fuel logs
            if (!db.objectStoreNames.contains("fuelLogs")) {
                db.createObjectStore("fuelLogs", {
                    keyPath: "id"
                });
            }

            // Parts
            if (!db.objectStoreNames.contains("parts")) {
                db.createObjectStore("parts", {
                    keyPath: "id"
                });
            }

            // Modifications
            if (!db.objectStoreNames.contains("modifications")) {
                db.createObjectStore("modifications", {
                    keyPath: "id"
                });
            }

            // Projects
            if (!db.objectStoreNames.contains("projects")) {
                db.createObjectStore("projects", {
                    keyPath: "id"
                });
            }

            // Photos
            if (!db.objectStoreNames.contains("photos")) {
                db.createObjectStore("photos", {
                  keyPath: "id"
                });
            }

            // Maintenance reminders
            if (!db.objectStoreNames.contains("reminders")) {
                db.createObjectStore("reminders", {
                    keyPath: "id"
                });
            }
            
            // Metadata
            if (!db.objectStoreNames.contains("metadata")) {
                db.createObjectStore("metadata", {
                    keyPath: "key"
                });
            }
            // Garage log entries
            if (!db.objectStoreNames.contains("logEntries")) {
                db.createObjectStore("logEntries", {
                   keyPath: "id"
               });
}
        };

        request.onsuccess = event => {
            resolve(event.target.result);
        };

        request.onerror = event => {
            reject(event.target.error);
        };
    });
}

async function saveVehicles(vehicles) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("vehicles", "readwrite");
        const store = transaction.objectStore("vehicles");

        vehicles.forEach(vehicle => {
            store.put(vehicle);
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function getVehicles() {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("vehicles", "readonly");
        const store = transaction.objectStore("vehicles");

        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = event => reject(event.target.error);
    });
}

async function updateVehicle(vehicle) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("vehicles", "readwrite");
        const store = transaction.objectStore("vehicles");

        store.put(vehicle);

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function saveVehicle(vehicle) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["vehicles", "metadata"],
            "readwrite"
        );

        const vehicleStore = transaction.objectStore("vehicles");
        const metadataStore = transaction.objectStore("metadata");

        vehicleStore.put(vehicle);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function updateVehicleSchema() {

    const vehicles = await getVehicles();

    for (const vehicle of vehicles) {

        let changed = false;

        if (!("vin" in vehicle)) {
            vehicle.vin = "";
            changed = true;
        }

        if (!("licensePlate" in vehicle)) {
            vehicle.licensePlate = "";
            changed = true;
        }

        if (!("purchaseDate" in vehicle)) {
            vehicle.purchaseDate = "";
            changed = true;
        }

        if (!("currentMileage" in vehicle)) {
            vehicle.currentMileage = null;
            changed = true;
        }

        if (!("notes" in vehicle)) {
            vehicle.notes = "";
            changed = true;
        }

        if (changed) {
            await updateVehicle(vehicle);
        }
    }
}

async function importNewVehicles() {

    const response = await fetch("data/GarageLog.json");
    const garage = await response.json();

    const existingVehicles = await getVehicles();
    const existingIds = new Set(
        existingVehicles.map(vehicle => vehicle.id)
    );

    const newVehicles = garage.vehicles.filter(
        vehicle => !existingIds.has(vehicle.id)
    );

    if (newVehicles.length > 0) {
        await saveVehicles(newVehicles);
    }
}

async function initializeMetadata() {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("metadata", "readwrite");
        const store = transaction.objectStore("metadata");

        store.put({
            key: "schemaVersion",
            value: 1
        });

        store.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function saveLogEntry(entry) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["logEntries", "metadata"],
            "readwrite"
        );

        const logStore = transaction.objectStore("logEntries");
        const metadataStore = transaction.objectStore("metadata");

        logStore.put(entry);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function updateLogEntry(entry) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["logEntries", "metadata"],
            "readwrite"
        );

        const logStore = transaction.objectStore("logEntries");
        const metadataStore = transaction.objectStore("metadata");

        logStore.put(entry);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function getLogEntriesForVehicle(vehicleId) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            "logEntries",
            "readonly"
        );

        const store = transaction.objectStore("logEntries");
        const request = store.getAll();

        request.onsuccess = () => {

            const entries = request.result.filter(
                entry => entry.vehicleId === vehicleId
            );

            entries.sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );

            resolve(entries);
        };

        request.onerror = event => reject(event.target.error);
    });
}

async function deleteLogEntry(id) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["logEntries", "metadata"],
            "readwrite"
        );

        const logStore = transaction.objectStore("logEntries");
        const metadataStore = transaction.objectStore("metadata");

        logStore.delete(id);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}