// GarageLog ↔ GitHub backup/restore.
// Adds a "Local Device or GitHub?" popup to the existing Backup/Restore
// buttons, a connect popup for owner/repo/branch/token, a dismissable
// launch-time check against GitHub, and a push-time conflict guard.
// Requires js/github-api.js to be loaded first.

const GitHubSync = (() => {

    const LS_OWNER = "garagelog_gh_owner";
    const LS_REPO = "garagelog_gh_repo";
    const LS_BRANCH = "garagelog_gh_branch";
    const LS_REMEMBER = "garagelog_gh_remember";
    const TOKEN_KEY = "garagelog_gh_token";
    const DATA_PATH = "data/GarageLog.json";

    let stylesInjected = false;

    function injectStyles() {

        if (stylesInjected) return;
        stylesInjected = true;

        const style = document.createElement("style");

        style.textContent = `
            .gh-dialog {
                border: none;
                border-radius: 10px;
                padding: 0;
                width: min(420px, 90vw);
            }
            .gh-dialog::backdrop {
                background: rgba(0, 0, 0, 0.5);
            }
            .gh-dialog-inner {
                padding: 20px;
            }
            .gh-dialog h2 {
                margin-top: 0;
            }
            .gh-dialog label {
                display: block;
                margin-top: 12px;
                font-weight: bold;
            }
            .gh-dialog input[type="text"],
            .gh-dialog input[type="password"] {
                width: 100%;
                box-sizing: border-box;
                margin-top: 4px;
            }
            .gh-dialog .gh-toggle-row {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-top: 14px;
            }
            .gh-dialog .gh-toggle-row label {
                margin: 0;
                font-weight: normal;
            }
            .gh-dialog .gh-actions {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 20px;
            }
            .gh-dialog .gh-status {
                margin-top: 10px;
                min-height: 1.2em;
                font-size: 0.9em;
            }
            .gh-dialog .gh-status.err { color: #b00020; }
            .gh-choice-buttons {
                display: flex;
                flex-direction: column;
                gap: 10px;
                margin-top: 16px;
            }
           .gh-snackbar {
                position: fixed;
                bottom: 16px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                background: #292929;
                border: 1px solid var(--accent-purple);
                border-radius: 10px;
                padding: 14px 18px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                z-index: 1000;
                width: min(360px, 90vw);
                font-size: 0.85rem;
                text-align: center;
            }
            .gh-snackbar-actions {
                display: flex;
                gap: 8px;
                justify-content: center;
                flex-wrap: wrap;
            }
        `;

        document.head.appendChild(style);
    }


    // ---- Storage helpers ----

    function loadSaved() {

        return {
            owner: localStorage.getItem(LS_OWNER) || "",
            repo: localStorage.getItem(LS_REPO) || "",
            branch: localStorage.getItem(LS_BRANCH) || "",
            remember: localStorage.getItem(LS_REMEMBER) === "1",
            token:
                localStorage.getItem(TOKEN_KEY) ||
                sessionStorage.getItem(TOKEN_KEY) ||
                ""
        };
    }

    function saveConnection({ owner, repo, branch, token, remember }) {

        localStorage.setItem(LS_OWNER, owner);
        localStorage.setItem(LS_REPO, repo);
        localStorage.setItem(LS_BRANCH, branch);
        localStorage.setItem(LS_REMEMBER, remember ? "1" : "0");

        if (remember) {
            localStorage.setItem(TOKEN_KEY, token);
            sessionStorage.removeItem(TOKEN_KEY);
        } else {
            sessionStorage.setItem(TOKEN_KEY, token);
            localStorage.removeItem(TOKEN_KEY);
        }
    }

    function forgetToken() {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
    }

    function isAuthError(error) {
        const msg = String(error?.message || "");
        return msg.includes("401") || msg.includes("403") || msg.includes("404");
    }


    // ---- Choice dialog: "Local storage or Git?" ----

    let choiceDialog = null;

    function ensureChoiceDialog() {

        if (choiceDialog) return choiceDialog;

        injectStyles();

        choiceDialog = document.createElement("dialog");
        choiceDialog.className = "gh-dialog";

        choiceDialog.innerHTML = `
            <div class="gh-dialog-inner">
                <h2 id="gh-choice-title">Backup</h2>
                <p id="gh-choice-body">Where would you like to save to?</p>
                <div class="gh-choice-buttons">
                    <button type="button" id="gh-choice-local" class="primary">
                        Local Device
                    </button>
                    <button type="button" id="gh-choice-git" class="primary">
                        GitHub
                    </button>
                    <button type="button" id="gh-choice-cancel">
                        Cancel
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(choiceDialog);

        return choiceDialog;
    }

    function chooseStorage(actionLabel) {

        const dialog = ensureChoiceDialog();

        dialog.querySelector("#gh-choice-title").textContent = actionLabel;

        dialog.querySelector("#gh-choice-body").textContent =
            actionLabel === "Restore"
                ? "Where would you like to load from?"
                : "Where would you like to save to?";

        return new Promise(resolve => {

            const localBtn = dialog.querySelector("#gh-choice-local");
            const gitBtn = dialog.querySelector("#gh-choice-git");
            const cancelBtn = dialog.querySelector("#gh-choice-cancel");

            function cleanup(result) {
                localBtn.onclick = null;
                gitBtn.onclick = null;
                cancelBtn.onclick = null;
                dialog.close();
                resolve(result);
            }

            localBtn.onclick = () => cleanup("local");
            gitBtn.onclick = () => cleanup("git");
            cancelBtn.onclick = () => cleanup(null);

            dialog.showModal();
        });
    }


    // ---- Connect dialog: owner/repo/branch/token ----

    let connectDialog = null;

    function ensureConnectDialog() {

        if (connectDialog) return connectDialog;

        injectStyles();

        connectDialog = document.createElement("dialog");
        connectDialog.className = "gh-dialog";

        connectDialog.innerHTML = `
            <div class="gh-dialog-inner">
                <h2>Connect to GitHub</h2>
                <p>
                    Paste a fine-grained GitHub token scoped to
                    <strong>this repository only</strong>, with
                    <strong>Contents: Read and write</strong> permission.
                    This stays on your device and is sent straight to
                    GitHub over HTTPS.
                </p>

                <label for="gh-owner">GitHub owner (username or org)</label>
                <input type="text" id="gh-owner" placeholder="e.g. jsmith">

                <label for="gh-repo">Repository name</label>
                <input type="text" id="gh-repo" placeholder="e.g. GarageLog">

                <label for="gh-branch">Branch (optional)</label>
                <input type="text" id="gh-branch" placeholder="main">

                <label for="gh-token">Personal access token</label>
                <input type="password" id="gh-token" placeholder="github_pat_...">

                <div class="gh-toggle-row">
                    <input type="checkbox" id="gh-remember">
                    <label for="gh-remember">Remember this token on this device</label>
                </div>

                <p id="gh-connect-status" class="gh-status"></p>

                <div class="gh-actions">
                    <button type="button" id="gh-connect-cancel">
                        Cancel
                    </button>
                    <button type="button" id="gh-connect-submit" class="primary">
                        Connect
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(connectDialog);

        return connectDialog;
    }

    function openConnectDialog() {

        const dialog = ensureConnectDialog();
        const saved = loadSaved();

        dialog.querySelector("#gh-owner").value = saved.owner;
        dialog.querySelector("#gh-repo").value = saved.repo;
        dialog.querySelector("#gh-branch").value = saved.branch;
        dialog.querySelector("#gh-token").value = saved.token;
        dialog.querySelector("#gh-remember").checked = saved.remember;

        const status = dialog.querySelector("#gh-connect-status");
        status.textContent = "";
        status.className = "gh-status";

        return new Promise(resolve => {

            const submitBtn = dialog.querySelector("#gh-connect-submit");
            const cancelBtn = dialog.querySelector("#gh-connect-cancel");

            function cleanup(result) {
                submitBtn.onclick = null;
                cancelBtn.onclick = null;
                dialog.close();
                resolve(result);
            }

            cancelBtn.onclick = () => cleanup(null);

            submitBtn.onclick = async () => {

                const owner = dialog.querySelector("#gh-owner").value.trim();
                const repo = dialog.querySelector("#gh-repo").value.trim();
                const branch = dialog.querySelector("#gh-branch").value.trim();
                const token = dialog.querySelector("#gh-token").value.trim();
                const remember = dialog.querySelector("#gh-remember").checked;

                if (!owner || !repo || !token) {
                    status.textContent = "Fill in owner, repo, and a token.";
                    status.className = "gh-status err";
                    return;
                }

                status.textContent = "Connecting…";
                status.className = "gh-status";
                submitBtn.disabled = true;

                try {

                    await GitHubAPI.verifyAccess({ owner, repo, token });

                    saveConnection({ owner, repo, branch, token, remember });

                    submitBtn.disabled = false;

                    cleanup({ owner, repo, branch, token });

                } catch (error) {

                    status.textContent = `Couldn't connect: ${error.message}`;
                    status.className = "gh-status err";
                    submitBtn.disabled = false;
                }
            };

            dialog.showModal();
        });
    }

    // Returns connection credentials, prompting the user to connect if
    // none are saved yet. Resolves null if the user cancels.
    async function getConnection() {

        const saved = loadSaved();

        if (saved.owner && saved.repo && saved.token) {
            return saved;
        }

        return openConnectDialog();
    }


    // ---- Remote status check ----

    // Compares the local lastModified against the one embedded in the
    // GitHub copy. Returns "current", "behind" (GitHub is newer — you
    // should restore), "ahead" (local is newer — you should back up),
    // or null if there's no saved connection or the check fails.
    async function checkRemoteStatus(localLastModified) {

        const saved = loadSaved();

        if (!saved.owner || !saved.repo || !saved.token) {
            return null;
        }

        try {

            const existing = await GitHubAPI.getJsonFile({
                owner: saved.owner,
                repo: saved.repo,
                branch: saved.branch,
                token: saved.token,
                path: DATA_PATH
            });

            if (!existing || !existing.json || !existing.json.lastModified) {
                return null;
            }

            const remoteTime = new Date(existing.json.lastModified).getTime();
            const localTime = new Date(localLastModified).getTime();

            if (remoteTime > localTime) return "behind";
            if (localTime > remoteTime) return "ahead";

            return "current";

        } catch (error) {

            console.error(
                "GarageLog GitHub status check failed:",
                error
            );

            return null;
        }
    }


    // ---- Launch-time snackbar/banner ----

    let snackbar = null;

    function ensureSnackbar() {

        if (snackbar) return snackbar;

        injectStyles();

        snackbar = document.createElement("div");
        snackbar.className = "gh-snackbar";
        snackbar.style.display = "none";

        snackbar.innerHTML = `
            <span id="gh-snackbar-text">Checking GitHub…</span>
            <div class="gh-snackbar-actions">
                <button type="button" id="gh-snackbar-primary" class="primary" style="display:none;"></button>
                <button type="button" id="gh-snackbar-secondary">Dismiss</button>
            </div>
        `;

        document.body.appendChild(snackbar);

        return snackbar;
    }

    function hideSnackbar() {
        if (snackbar) {
            snackbar.style.display = "none";
        }
    }

    // Kicks off a background check against GitHub at launch. Shows a
    // dismissable "Checking..." snackbar. If GitHub turns out to have a
    // newer version, it becomes a persistent banner requiring a choice.
    // Dismissing early just abandons the check — it never blocks editing.
    async function runLaunchCheck(localLastModified) {

        const saved = loadSaved();

        if (!saved.owner || !saved.repo || !saved.token) {
            return;
        }

        const bar = ensureSnackbar();
        const text = bar.querySelector("#gh-snackbar-text");
        const primaryBtn = bar.querySelector("#gh-snackbar-primary");
        const secondaryBtn = bar.querySelector("#gh-snackbar-secondary");

        let dismissed = false;

        text.textContent = "Checking GitHub…";
        primaryBtn.style.display = "none";
        secondaryBtn.textContent = "Dismiss";
        bar.style.display = "flex";

        secondaryBtn.onclick = () => {
            dismissed = true;
            hideSnackbar();
        };

        const status = await checkRemoteStatus(localLastModified);

        if (dismissed) {
            return;
        }

        if (status === "behind") {

            text.innerHTML =
                "A newer version exists on GitHub —<br>" +
                "probably from another device.";

            primaryBtn.textContent = "Restore Now";
            primaryBtn.style.display = "inline-block";
            secondaryBtn.textContent = "Continue Anyway";

            primaryBtn.onclick = async () => {
                hideSnackbar();
                await pullRestore();
            };

            secondaryBtn.onclick = () => {
                hideSnackbar();
            };

            // Left open — this one waits for a deliberate choice.

        } else {

            hideSnackbar();
        }
    }


    // ---- Backup / Restore actions ----

    async function pushBackup() {

        const creds = await getConnection();

        if (!creds) return;

        try {

            const garage = await exportDatabase();

            const existing = await GitHubAPI.getJsonFile({
                owner: creds.owner,
                repo: creds.repo,
                branch: creds.branch,
                token: creds.token,
                path: DATA_PATH
            });

            if (existing && existing.json && existing.json.lastModified) {

                const remoteTime =
                    new Date(existing.json.lastModified).getTime();

                const localTime =
                    new Date(garage.lastModified).getTime();

                if (remoteTime > localTime) {

                    const overwrite = confirm(
                        "GitHub has a newer version than what you're " +
                        "about to upload — probably from another " +
                        "device.\n\n" +
                        "Overwrite it with this device's data anyway? " +
                        "This will discard whatever changes are on " +
                        "GitHub."
                    );

                    if (!overwrite) {
                        return;
                    }
                }
            }

            await GitHubAPI.putJsonFile({
                owner: creds.owner,
                repo: creds.repo,
                branch: creds.branch,
                token: creds.token,
                path: DATA_PATH,
                json: garage,
                sha: existing ? existing.sha : undefined,
                message: `GarageLog backup — ${getLocalDate()}`
            });

            await setMetadataValue("lastPushedTimestamp", garage.lastModified);

            await refreshDataVersion();

            alert("Backup pushed to GitHub.");

        } catch (error) {

            console.error("GarageLog GitHub backup failed:", error);

            if (isAuthError(error)) {
                forgetToken();
                alert(
                    "GitHub connection failed (invalid or expired token, " +
                    "or the repo/path couldn't be found). Please " +
                    "reconnect and try again."
                );
            } else {
                alert(`GitHub backup failed: ${error.message}`);
            }
        }
    }

    async function pullRestore() {

        const creds = await getConnection();

        if (!creds) return;

        try {

            const existing = await GitHubAPI.getJsonFile({
                owner: creds.owner,
                repo: creds.repo,
                branch: creds.branch,
                token: creds.token,
                path: DATA_PATH
            });

            if (!existing) {
                alert(
                    "No GarageLog backup file was found in that repo yet."
                );
                return;
            }

            const garage = existing.json;

            if (
                !garage ||
                garage.schemaVersion === undefined ||
                !Array.isArray(garage.vehicles) ||
                !Array.isArray(garage.logEntries)
            ) {
                throw new Error(
                    "The file in GitHub is not a valid GarageLog backup."
                );
            }

            const confirmed = confirm(
                "Restore this backup from GitHub?\n\n" +
                "This will replace all data currently stored on this device."
            );

            if (!confirmed) return;

            await importDatabase(garage);

            await setMetadataValue("lastPushedTimestamp", garage.lastModified);

            alert("GarageLog restored from GitHub.");

            const vehicles = await getVehicles();

            displayVehicles(vehicles);

            await refreshDataVersion();

        } catch (error) {

            console.error("GarageLog GitHub restore failed:", error);

            if (isAuthError(error)) {
                forgetToken();
                alert(
                    "GitHub connection failed (invalid or expired token, " +
                    "or the repo/path couldn't be found). Please " +
                    "reconnect and try again."
                );
            } else {
                alert(`Restore from GitHub failed: ${error.message}`);
            }
        }
    }

    return {
        chooseStorage,
        pushBackup,
        pullRestore,
        checkRemoteStatus,
        runLaunchCheck
    };
})();