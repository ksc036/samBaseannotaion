# Delete Selected Segments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete selected calculated segments from the client-side mask.

**Architecture:** Reuse the measurement row selection state already used by XLSX export. Map selected `segment_id`s to connected components in the current mask canvas, clear those pixels locally, then refresh measurements and overlay state without server requests.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, existing canvas mask editing helpers.

---

### Task 1: Add Delete Button

**Files:**
- Modify: `web_static/index.html`
- Modify: `web_static/app.js`

- [ ] Add a `Delete Selected` button beside `Export Selected XLSX`.
- [ ] Wire the button disabled state to match whether measurement rows exist.

### Task 2: Delete Selected Components

**Files:**
- Modify: `web_static/app.js`

- [ ] Build component membership from current full-image mask data using existing `splitConnectedComponents`.
- [ ] Clear pixels for selected component indexes from the active full mask canvas.
- [ ] Remove deleted measurements from `measurements` and `selectedMeasurementIds`.
- [ ] Rebuild overlay from remaining measurements and current mask data.

### Task 3: Verify

**Files:**
- Test manually through static code checks and existing Python tests.

- [ ] Run `python3 -m unittest discover -s tests`.
- [ ] Confirm no server API changes are required.
