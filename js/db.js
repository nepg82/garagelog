const DB_NAME = "GarageLog";
const DB_VERSION = 2;

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