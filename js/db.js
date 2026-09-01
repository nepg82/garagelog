const DB_NAME = "GarageLog";
const DB_VERSION = 5;

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
            
            const oldStores = [
                "serviceRecords",
                "fuelLogs",
                "parts",
                "modifications",
                "projects"
            ];

            oldStores.forEach(storeName => {
                if (db.objectStoreNames.contains(storeName)) {
                    db.deleteObjectStore(storeName);
                }
            });
            
            // Garage log entries
            if (!db.objectStoreNames.contains("logEntries")) {
                db.createObjectStore("logEntries", {
                   keyPath: "id"
               });
            }
               
            // Plans
            if (!db.objectStoreNames.contains("plans")) {
                db.createObjectStore("plans", {
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

        request.onsuccess = () => {

            const vehicles = request.result;

            vehicles.sort((a, b) =>
                (a.sortOrder ?? 999999) -
                (b.sortOrder ?? 999999)
            );

            resolve(vehicles);
        };

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

async function deleteVehicle(id) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["vehicles", "logEntries", "plans", "metadata"],
            "readwrite"
        );

        const vehicleStore = transaction.objectStore("vehicles");
        const logStore = transaction.objectStore("logEntries");
        const planStore = transaction.objectStore("plans");
        const metadataStore = transaction.objectStore("metadata");

        vehicleStore.delete(id);

        // Delete all log entries belonging to this vehicle.
        const request = logStore.getAll();

        request.onsuccess = () => {

            request.result
                .filter(entry => entry.vehicleId === id)
                .forEach(entry => {
                    logStore.delete(entry.id);
                });
        };
        
        // Delete all plans belonging to this vehicle.
        const planRequest = planStore.getAll();

        planRequest.onsuccess = () => {

           planRequest.result
              .filter(plan => plan.vehicleId === id)
              .forEach(plan => {
                  planStore.delete(plan.id);
              });
        };

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

        // VIN and license plate are no longer collected or displayed.
        // Strip them from any records that still carry them (e.g. from
        // before this change, or reimported from an old backup).
        if ("vin" in vehicle) {
            delete vehicle.vin;
            changed = true;
        }

        if ("licensePlate" in vehicle) {
            delete vehicle.licensePlate;
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

        if (!("sortOrder" in vehicle)) {
            vehicle.sortOrder = vehicles.indexOf(vehicle);
            changed = true;
        }

        if (!("active" in vehicle)) {
            vehicle.active = true;
            changed = true;
        }

        if (changed) {
            await updateVehicle(vehicle);
        }
    }
}

async function getMetadataValue(key) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("metadata", "readonly");
        const store = transaction.objectStore("metadata");

        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result ? request.result.value : null);
        };

        request.onerror = event => reject(event.target.error);
    });
}

async function setMetadataValue(key, value) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction("metadata", "readwrite");
        const store = transaction.objectStore("metadata");

        store.put({ key, value });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
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

        const schemaRequest = store.get("schemaVersion");

        schemaRequest.onsuccess = () => {
            if (schemaRequest.result === undefined) {
                store.put({
                    key: "schemaVersion",
                    value: 1
                });
            }
        };

        const modifiedRequest = store.get("lastModified");

        modifiedRequest.onsuccess = () => {
            if (modifiedRequest.result === undefined) {
                store.put({
                    key: "lastModified",
                    value: new Date().toISOString()
                });
            }
        };

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

async function exportDatabase() {

    const db = await openDatabase();

    const storeNames = Array.from(db.objectStoreNames);

    const transaction = db.transaction(storeNames, "readonly");

    const garage = {
        schemaVersion: 1
    };

    await Promise.all(
        storeNames.map(storeName => {

            return new Promise((resolve, reject) => {

                const store = transaction.objectStore(storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    garage[storeName] = request.result;
                    resolve();
                };

                request.onerror = event => {
                    reject(event.target.error);
                };
            });
        })
    );

    const lastModifiedEntry = garage.metadata?.find(
        entry => entry.key === "lastModified"
    );

    garage.lastModified =
        lastModifiedEntry?.value || new Date().toISOString();

    return garage;
}

async function importDatabase(garage) {

    if (
        !garage ||
        garage.schemaVersion === undefined ||
        !Array.isArray(garage.vehicles) ||
        !Array.isArray(garage.logEntries)
    ) {
        throw new Error("Invalid Garage Log backup file.");
    }

    const db = await openDatabase();

    const storeNames = Array.from(db.objectStoreNames);

    const transaction = db.transaction(
        storeNames,
        "readwrite"
    );

    storeNames.forEach(storeName => {

        const store = transaction.objectStore(storeName);

        store.clear();

        if (Array.isArray(garage[storeName])) {

            garage[storeName].forEach(record => {
                store.put(record);
            });
        }
    });

    return new Promise((resolve, reject) => {

        transaction.oncomplete = () => resolve();

        transaction.onerror = event => {
            reject(event.target.error);
        };
    });
}

function getBackupFilename() {

    const now = new Date();

    const pad = number =>
        String(number).padStart(2, "0");

    const yy = String(now.getFullYear()).slice(-2);
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());

    return `garagelog-${yy}${mm}${dd}-${hh}${min}.json`;
}

async function savePlan(plan) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["plans", "metadata"],
            "readwrite"
        );

        const planStore = transaction.objectStore("plans");
        const metadataStore = transaction.objectStore("metadata");

        planStore.put(plan);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function getPlansForVehicle(vehicleId) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            "plans",
            "readonly"
        );

        const store = transaction.objectStore("plans");
        const request = store.getAll();

        request.onsuccess = () => {

            const plans = request.result.filter(
                plan => plan.vehicleId === vehicleId
            );

            plans.sort((a, b) => {

                if (!a.date && !b.date) {
                    return a.title.localeCompare(b.title);
                }

                if (!a.date) {
                    return 1;
                }

                if (!b.date) {
                    return -1;
                }

                return new Date(a.date) - new Date(b.date);
            });

            resolve(plans);
        };

        request.onerror = event => reject(event.target.error);
    });
}

async function deletePlan(id) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["plans", "metadata"],
            "readwrite"
        );

        const planStore = transaction.objectStore("plans");
        const metadataStore = transaction.objectStore("metadata");

        planStore.delete(id);

        metadataStore.put({
            key: "lastModified",
            value: new Date().toISOString()
        });

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}

async function deletePlansForVehicle(vehicleId) {

    const db = await openDatabase();

    return new Promise((resolve, reject) => {

        const transaction = db.transaction(
            ["plans", "metadata"],
            "readwrite"
        );

        const planStore = transaction.objectStore("plans");
        const metadataStore = transaction.objectStore("metadata");

        const request = planStore.getAll();

        request.onsuccess = () => {

            request.result
                .filter(plan => plan.vehicleId === vehicleId)
                .forEach(plan => {
                    planStore.delete(plan.id);
                });

            metadataStore.put({
                key: "lastModified",
                value: new Date().toISOString()
            });
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = event => reject(event.target.error);
    });
}