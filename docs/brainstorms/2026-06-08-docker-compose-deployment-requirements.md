---
date: 2026-06-08
topic: docker-compose-deployment
---

# Docker Compose Deployment Requirements

## Summary

The project should support a macOS/Linux deployment path where the annotation server runs through Docker Compose, survives machine restarts, and keeps user data on the host. Existing shell scripts remain available for local development and troubleshooting, but Docker Compose becomes the recommended operating path.

---

## Problem Frame

The current setup depends on machine-level Python, conda, Miniforge, and `micro_sam` installation details. That has already created friction on Ubuntu, where conda installation and runtime behavior can vary by machine. A containerized deployment should make the server easier to start, restart, and move between macOS and Linux without re-debugging the Python environment each time.

---

## Key Decisions

- **Docker Compose is the default operating interface.** Compose keeps ports, volumes, environment variables, and restart behavior in one place, which makes repeated operation simpler than a long `docker run` command.
- **CPU-only deployment is the first version.** The current app defaults to CPU, and CPU-only support keeps the macOS/Linux deployment path simpler.
- **Project-relative host storage is the initial data strategy.** Runtime data will stay under the project folder so early operation, backup, and inspection remain straightforward.
- **Model cache is persisted on the host.** Model checkpoints should not be redownloaded every time the container is rebuilt or recreated.
- **Existing shell scripts stay as fallback tooling.** `setup_web_sam.sh` and `run_web_sam.sh` remain useful for development and diagnosis, while README guidance should lead with Docker Compose once implemented.

---

## Requirements

**Deployment Interface**

- R1. The project must provide a Docker Compose based startup path for macOS and Linux.
- R2. The normal operator command should be equivalent to starting the Compose service in detached mode.
- R3. The Compose service must expose the web app on host port `8765` by default.
- R4. The web app must continue to bind to `0.0.0.0` inside the container so LAN access remains possible when the host allows it.

**Startup Reliability**

- R5. The service must be configured to restart automatically after process failure or machine restart unless the operator explicitly stops it.
- R6. The deployment documentation must note that Docker itself must start on boot for automatic restart to work.
- R7. The container entrypoint must start the existing web app without requiring the operator to activate conda manually.

**Persistent Data**

- R8. Uploaded samples must persist on the host under `web_uploads/`.
- R9. Approved annotation samples must persist on the host under `annotation_complete/`.
- R10. Deleted samples must persist on the host under `deleted_annotations/`.
- R11. Logs should persist on the host under `logs/` when the container writes runtime logs.
- R12. Model checkpoints and cache data must persist on the host under `model_cache/`.
- R13. Rebuilding or recreating the container must not delete user annotation data or model cache data.

**Compatibility and Scope**

- R14. The Docker path only needs to support macOS and Linux.
- R15. Windows launchers and Windows-specific deployment behavior are outside the Docker deployment scope.
- R16. GPU/CUDA support is not part of the first Docker deployment.
- R17. The existing `setup_web_sam.sh` and `run_web_sam.sh` scripts should remain available as non-primary fallback paths.

**Documentation**

- R18. `README.md` must describe Docker Compose as the primary deployment path after the Docker files are added.
- R19. `README.md` must include the basic lifecycle commands for build, start, stop, and logs.
- R20. `README.md` must explain which host folders contain persistent data.

---

## Key Flows

- F1. First-time deployment
  - **Trigger:** An operator clones or updates the project on macOS or Linux.
  - **Steps:** The operator builds the Docker image, starts the Compose service, and opens the app in a browser.
  - **Outcome:** The app is reachable at `http://localhost:8765`, with data folders created or reused on the host.

- F2. Machine restart
  - **Trigger:** The host machine restarts.
  - **Steps:** Docker starts, then Compose restart policy starts the app service.
  - **Outcome:** The web app becomes available again without manually running the Python setup or run scripts.

- F3. Container rebuild
  - **Trigger:** The operator rebuilds the container after code or dependency changes.
  - **Steps:** The container image is rebuilt and the service is recreated.
  - **Outcome:** Uploaded samples, approved annotations, deleted samples, logs, and model cache remain on the host.

---

## Acceptance Examples

- AE1. Given Docker is installed and starts on boot, when the host machine restarts after the service was running, then the annotation server starts again without manual app commands.
- AE2. Given a sample has been uploaded and approved, when the container is removed and recreated, then the sample remains available in the host `annotation_complete/` folder.
- AE3. Given the model checkpoint has already been downloaded into `model_cache/`, when the container is rebuilt, then the next run reuses the cached model data instead of relying on a fresh download.
- AE4. Given an operator only has Docker available, when they follow README deployment instructions, then they should not need to install conda, Miniforge, or `micro_sam` directly on the host.

---

## Scope Boundaries

- Windows Docker deployment is out of scope.
- GPU/CUDA container support is out of scope for the first version.
- External storage such as NAS, S3, database-backed sample metadata, or centralized logging is deferred.
- Authentication, TLS, and reverse proxy setup are deferred.

---

## Dependencies / Assumptions

- Docker and Docker Compose are available on the target macOS/Linux machine.
- Docker is configured to start on boot when automatic restart after machine reboot is required.
- Project-relative host folders are acceptable for the current deployment scale.
- CPU inference performance is acceptable for the first deployment target.

---

## Sources / Research

- `README.md` currently documents macOS/Linux shell setup and run flows.
- `runtime.env` already defines app-level runtime settings such as host, port, and entrypoint.
- `web_app.py` already reads `APP_HOST` and `APP_PORT` and stores runtime data under project-relative folders.
