const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");
const totalPapers = document.getElementById("totalPapers");
const activeBranches = document.getElementById("activeBranches");
const totalSubjects = document.getElementById("totalSubjects");
const recentPapers = document.getElementById("recentPapers");
const loginPanel = document.getElementById("loginPanel");
const loginForm = document.getElementById("loginForm");
const loginStatus = document.getElementById("loginStatus");
const logoutButton = document.getElementById("logoutButton");
const adminControls = document.getElementById("adminControls");
const adminSearchInput = document.getElementById("adminSearchInput");
const adminClearSearch = document.getElementById("adminClearSearch");
const adminBranchFilter = document.getElementById("adminBranchFilter");
const adminSemesterFilter = document.getElementById("adminSemesterFilter");
const adminPapersCount = document.getElementById("adminPapersCount");
const deleteAlert = document.getElementById("deleteAlert");

let allPapers = [];
let selectedBranch = "";
let selectedSemester = "";

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value || "";
    return element.innerHTML;
}

function getBranchBadgeClass(branch) {
    const b = (branch || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (b.includes("aiml") || b.includes("ai") || b === "cseaiml") return "meta-branch-aiml";
    if (b === "csbs") return "meta-branch-csbs";
    switch ((branch || "").toLowerCase()) {
        case "cse": return "meta-branch-cse";
        case "ece": return "meta-branch-ece";
        case "eee": return "meta-branch-eee";
        case "mechanical": return "meta-branch-mech";
        case "civil": return "meta-branch-civil";
        case "first year": return "meta-branch-fy";
        default: return "meta-branch-default";
    }
}

function showNotification(message, isSuccess = true) {
    if (!deleteAlert) return;
    deleteAlert.style.display = "inline-block";
    deleteAlert.className = `upload-status ${isSuccess ? "success" : "error"}`;
    deleteAlert.textContent = (isSuccess ? "✅ " : "❌ ") + message;
    setTimeout(() => {
        deleteAlert.style.display = "none";
    }, 4500);
}

async function loadDashboard() {
    try {
        const response = await fetch("/api/papers");
        allPapers = await response.json();
        totalPapers.textContent = allPapers.length;
        activeBranches.textContent = new Set(allPapers.map((paper) => paper.branch)).size;
        totalSubjects.textContent = new Set(allPapers.map((paper) => `${paper.branch}:${paper.subject}`)).size;
        
        renderAdminPapers();
    } catch (error) {
        totalPapers.textContent = "-";
        activeBranches.textContent = "-";
        totalSubjects.textContent = "-";
        if (recentPapers) {
            recentPapers.innerHTML = '<p class="empty-state">Dashboard records unavailable.</p>';
        }
    }
}

let selectedPapers = new Map();
let currentlyVisiblePapers = [];

function updateBulkToolbarState() {
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    const selectAllText = document.getElementById("selectAllText");
    const bulkActionsGroup = document.getElementById("bulkActionsGroup");
    const bulkSelectedBadge = document.getElementById("bulkSelectedBadge");

    const totalVisible = currentlyVisiblePapers.length;
    const selectedCount = selectedPapers.size;

    if (selectAllText) {
        selectAllText.textContent = `Select All (${totalVisible})`;
    }

    if (selectAllCheckbox) {
        if (totalVisible === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            selectAllCheckbox.disabled = true;
        } else {
            selectAllCheckbox.disabled = false;
            const allVisibleSelected = currentlyVisiblePapers.length > 0 && currentlyVisiblePapers.every(p => selectedPapers.has(p.id));
            const someVisibleSelected = currentlyVisiblePapers.some(p => selectedPapers.has(p.id));
            selectAllCheckbox.checked = allVisibleSelected;
            selectAllCheckbox.indeterminate = !allVisibleSelected && someVisibleSelected;
        }
    }

    if (bulkActionsGroup && bulkSelectedBadge) {
        if (selectedCount > 0) {
            bulkActionsGroup.style.display = "flex";
            bulkSelectedBadge.textContent = `${selectedCount} Selected`;
        } else {
            bulkActionsGroup.style.display = "none";
        }
    }
}

function togglePaperSelect(id, rawBranch, rawTitle, rawFile, isChecked) {
    const branch = decodeURIComponent(rawBranch || "");
    const title = decodeURIComponent(rawTitle || "");
    const file = decodeURIComponent(rawFile || "");
    
    if (isChecked) {
        selectedPapers.set(id, { id: Number(id), branch: branch, title: title, file: file });
    } else {
        selectedPapers.delete(id);
    }
    
    const card = document.getElementById(`paper-card-${id}`);
    if (card) {
        card.classList.toggle("card-selected", isChecked);
    }
    
    updateBulkToolbarState();
}

window.togglePaperSelect = togglePaperSelect;

function toggleSelectAll(masterCheckbox) {
    const shouldSelect = masterCheckbox.checked;
    currentlyVisiblePapers.forEach(paper => {
        if (shouldSelect) {
            selectedPapers.set(paper.id, { id: Number(paper.id), branch: paper.branch, title: paper.title, file: paper.file });
        } else {
            selectedPapers.delete(paper.id);
        }
        
        const card = document.getElementById(`paper-card-${paper.id}`);
        const cb = document.getElementById(`select-paper-${paper.id}`);
        if (card) card.classList.toggle("card-selected", shouldSelect);
        if (cb) cb.checked = shouldSelect;
    });
    
    updateBulkToolbarState();
}

window.toggleSelectAll = toggleSelectAll;

function clearBulkSelection() {
    selectedPapers.clear();
    document.querySelectorAll(".recent-card-checkbox input[type='checkbox']").forEach(cb => {
        cb.checked = false;
    });
    document.querySelectorAll(".recent-card").forEach(c => {
        c.classList.remove("card-selected");
    });
    updateBulkToolbarState();
}

window.clearBulkSelection = clearBulkSelection;

async function batchDeleteSelected() {
    const count = selectedPapers.size;
    if (count === 0) return;

    const isConfirmed = window.confirm(`⚠️ PERMANENT BULK DELETION\n\nAre you sure you want to delete all ${count} selected question papers?\n\nThis will permanently remove these records and their PDF files from the library.`);
    if (!isConfirmed) return;

    const items = Array.from(selectedPapers.values());

    try {
        const response = await fetch("/api/papers/batch-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: items })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to batch delete papers.");
        }
        showNotification(result.message || `Deleted ${count} question papers.`, true);
        selectedPapers.clear();
        await loadDashboard();
    } catch (error) {
        showNotification(error.message, false);
    }
}

window.batchDeleteSelected = batchDeleteSelected;

function renderAdminPapers() {
    if (!recentPapers) return;
    const searchQuery = adminSearchInput ? adminSearchInput.value.trim().toLowerCase() : "";
    
    if (adminClearSearch) {
        adminClearSearch.hidden = searchQuery === "";
    }

    const filtered = allPapers.filter((p) => {
        if (selectedBranch && p.branch !== selectedBranch) return false;
        if (selectedSemester && p.semester !== selectedSemester) return false;
        if (!searchQuery) return true;
        const text = `${p.title} ${p.branch} ${p.semester} ${p.subject} ${p.year}`.toLowerCase();
        return text.includes(searchQuery);
    });

    currentlyVisiblePapers = filtered;

    if (adminPapersCount) {
        adminPapersCount.innerHTML = `
            <span class="count-number">${filtered.length}</span>
            <span class="count-text">${filtered.length === 1 ? "Paper" : "Papers"} Found</span>
        `;
    }

    updateBulkToolbarState();

    if (filtered.length === 0) {
        recentPapers.innerHTML = `
            <div class="admin-empty-state">
                <div class="empty-icon">🔍</div>
                <h3>No Question Papers Found</h3>
                <p>No papers match your search and filter criteria.</p>
                <button type="button" class="admin-reset-btn" onclick="resetAdminFilters()">Reset Filters</button>
            </div>
        `;
        return;
    }

    recentPapers.innerHTML = filtered.map((paper) => {
        const branchBadgeClass = getBranchBadgeClass(paper.branch);
        const isSelected = selectedPapers.has(paper.id);
        return `
            <article class="recent-card ${isSelected ? 'card-selected' : ''}" id="paper-card-${paper.id}">
                <div class="recent-card-checkbox">
                    <input type="checkbox" id="select-paper-${paper.id}" ${isSelected ? 'checked' : ''} onchange="togglePaperSelect(${paper.id}, '${encodeURIComponent(paper.branch)}', '${encodeURIComponent(paper.title)}', '${encodeURIComponent(paper.file || '')}', this.checked)" title="Select paper for batch deletion">
                </div>
                <div class="recent-icon">PDF</div>
                <div class="recent-details">
                    <h4>${escapeHtml(paper.title)}</h4>
                    <div class="recent-tags">
                        <span class="meta-pill ${branchBadgeClass}">${escapeHtml(paper.branch)}</span>
                        <span class="meta-pill meta-sem">${escapeHtml(paper.semester)}</span>
                        <span class="meta-pill meta-subject">${escapeHtml(paper.subject)}</span>
                        <span class="meta-pill meta-year">📅 ${paper.year}</span>
                    </div>
                </div>
                <div class="recent-meta">
                    <a class="recent-view-link" href="${encodeURI(paper.file)}" target="_blank" rel="noopener">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                        <span>View PDF</span>
                    </a>
                    <button class="recent-delete-btn" type="button" onclick="confirmDeletePaper(${paper.id}, '${encodeURIComponent(paper.branch)}', '${encodeURIComponent(paper.title)}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                        <span>Delete</span>
                    </button>
                </div>
            </article>
        `;
    }).join("");
}

function resetAdminFilters() {
    if (adminSearchInput) adminSearchInput.value = "";
    if (adminBranchFilter) adminBranchFilter.value = "";
    if (adminSemesterFilter) adminSemesterFilter.value = "";
    selectedBranch = "";
    selectedSemester = "";
    
    document.querySelectorAll(".admin-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.branch === "");
    });
    
    renderAdminPapers();
}

window.resetAdminFilters = resetAdminFilters;

async function confirmDeletePaper(id, rawBranch, rawTitle) {
    const branch = decodeURIComponent(rawBranch || "");
    const title = decodeURIComponent(rawTitle || "");
    const isConfirmed = window.confirm(`Are you sure you want to permanently delete:\n\n"${title}" (${branch})?\n\nThis will remove the question paper from the library.`);
    if (!isConfirmed) return;

    try {
        const response = await fetch("/api/papers/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: Number(id), branch: branch })
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Failed to delete question paper.");
        }
        showNotification(result.message || "Question paper deleted successfully.", true);
        selectedPapers.delete(Number(id));
        await loadDashboard();
    } catch (error) {
        showNotification(error.message || "Failed to delete question paper.", false);
    }
}

window.confirmDeletePaper = confirmDeletePaper;

// Event Listeners for Filters
if (adminSearchInput) {
    adminSearchInput.addEventListener("input", renderAdminPapers);
}

if (adminClearSearch) {
    adminClearSearch.addEventListener("click", () => {
        if (adminSearchInput) {
            adminSearchInput.value = "";
            adminSearchInput.focus();
            renderAdminPapers();
        }
    });
}

if (adminBranchFilter) {
    adminBranchFilter.addEventListener("change", (e) => {
        selectedBranch = e.target.value;
        document.querySelectorAll(".admin-pill").forEach((pill) => {
            pill.classList.toggle("active", pill.dataset.branch === selectedBranch);
        });
        renderAdminPapers();
    });
}

if (adminSemesterFilter) {
    adminSemesterFilter.addEventListener("change", (e) => {
        selectedSemester = e.target.value;
        renderAdminPapers();
    });
}

document.querySelectorAll(".admin-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
        document.querySelectorAll(".admin-pill").forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        selectedBranch = pill.dataset.branch || "";
        if (adminBranchFilter) {
            adminBranchFilter.value = selectedBranch;
        }
        renderAdminPapers();
    });
});

function setAdminLoggedIn(isLoggedIn) {
    if (isLoggedIn) {
        if (loginPanel) loginPanel.hidden = true;
        if (adminControls) adminControls.hidden = false;
        renderAdminPapers();
        fetchPendingSubmissions();
        fetchStudentRequests();
    } else {
        if (loginPanel) loginPanel.hidden = false;
        if (adminControls) adminControls.hidden = true;
        const pendingSection = document.getElementById("pendingSubmissionsSection");
        if (pendingSection) pendingSection.style.display = "none";
    }
}

async function checkAdminAuth() {
    try {
        const response = await fetch("/api/admin/status");
        if (response.ok) {
            const data = await response.json();
            setAdminLoggedIn(data.is_admin === true);
        }
    } catch (e) {
        setAdminLoggedIn(false);
    }
}

async function fetchPendingSubmissions() {
    const section = document.getElementById("pendingSubmissionsSection");
    const badge = document.getElementById("pendingBadgeCount");
    const grid = document.getElementById("pendingGrid");
    
    if (!section || !grid) return;
    
    try {
        const res = await fetch("/api/admin/pending");
        if (!res.ok) {
            section.style.display = "none";
            return;
        }
        const data = await res.json();
        const pendingList = data.pending || [];
        
        if (badge) {
            badge.textContent = `${pendingList.length} Pending`;
        }
        
        if (pendingList.length === 0) {
            section.style.display = "none";
            return;
        }
        
        section.style.display = "block";
        grid.innerHTML = pendingList.map(sub => {
            const badgeClass = getBranchBadgeClass(sub.branch);
            return `
                <div class="pending-card" id="pending-card-${sub.id}">
                    <div>
                        <div class="pending-card-top">
                            <span class="meta-tag ${badgeClass}">${escapeHtml(sub.branch)}</span>
                            <span class="pending-contributor">👤 ${escapeHtml(sub.contributor_name || "Student")}</span>
                        </div>
                        <h4 class="pending-subject-title">${escapeHtml(sub.subject)}</h4>
                        <div class="pending-meta">
                            <span>📅 ${escapeHtml(sub.semester)} • ${escapeHtml(sub.year)}</span>
                            <div style="font-size: 11.5px; color: #94a3b8; margin-top: 2px;">${escapeHtml(sub.title || "")}</div>
                        </div>
                    </div>
                    <div class="pending-actions">
                        <a href="/${escapeHtml(sub.file)}" target="_blank" class="btn-preview-sub" title="Open PDF in new tab">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                            <span>Preview</span>
                        </a>
                        <button type="button" class="btn-approve-sub" onclick="approveSubmission(${sub.id}, '${escapeHtml(sub.subject)}', '${escapeHtml(sub.branch)}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span>Approve & Publish</span>
                        </button>
                        <button type="button" class="btn-reject-sub" onclick="rejectSubmission(${sub.id}, '${escapeHtml(sub.subject)}')" title="Reject & Remove">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join("");
    } catch (e) {
        section.style.display = "none";
    }
}

async function approveSubmission(id, subject, branch) {
    if (!confirm(`Are you sure you want to approve and publish "${subject}" (${branch}) to the student repository?`)) {
        return;
    }
    
    try {
        const res = await fetch("/api/admin/submissions/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message || "Paper approved and published!", true);
            await fetchPendingSubmissions();
            await loadDashboard();
        } else {
            showNotification(data.error || "Could not approve submission", false);
        }
    } catch (e) {
        showNotification("Failed to approve submission. Network error.", false);
    }
}

async function rejectSubmission(id, subject) {
    if (!confirm(`Are you sure you want to reject and delete the submission for "${subject}"?`)) {
        return;
    }
    
    try {
        const res = await fetch("/api/admin/submissions/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification("Submission rejected and removed.", true);
            await fetchPendingSubmissions();
        } else {
            showNotification(data.error || "Could not reject submission", false);
        }
    } catch (e) {
        showNotification("Failed to reject submission. Network error.", false);
    }
}

async function fetchStudentRequests() {
    const grid = document.getElementById("requestsGrid");
    const badge = document.getElementById("requestsBadgeCount");
    if (!grid) return;

    try {
        const res = await fetch("/api/requests");
        if (!res.ok) throw new Error("Could not fetch requests");
        const data = await res.json();
        const requests = data.requests || [];
        const pendingCount = requests.filter(r => r.status === "pending").length;

        if (badge) {
            badge.textContent = `${pendingCount} Pending`;
            badge.style.background = pendingCount > 0 ? "#10b981" : "#64748b";
        }

        if (requests.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 24px; color: #94a3b8; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">
                    <p>No student paper requests yet. All demanded papers are available!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = requests.map(req => {
            const isPending = req.status === "pending";
            return `
                <article class="pending-card" style="border-left: 4px solid ${isPending ? '#10b981' : '#64748b'};">
                    <div class="pending-card-header">
                        <div>
                            <span class="meta-pill meta-branch" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">${escapeHtml(req.branch)}</span>
                            <span class="meta-pill meta-sem">${escapeHtml(req.semester)}</span>
                            <span class="meta-pill meta-year">📅 Year: ${escapeHtml(req.year)}</span>
                        </div>
                        <span class="meta-pill" style="font-size: 11px; background: ${isPending ? 'rgba(16, 185, 129, 0.25)' : 'rgba(100, 116, 139, 0.2)'}; color: ${isPending ? '#34d399' : '#94a3b8'};">
                            ${isPending ? '⏳ Pending' : '✅ Fulfilled'}
                        </span>
                    </div>
                    <div class="pending-card-body">
                        <h4 style="margin: 8px 0 4px; font-size: 16px; color: #ffffff;">${escapeHtml(req.subject)}</h4>
                        ${req.exam_type ? `<p style="font-size: 12px; color: #38bdf8; margin: 2px 0;">Scheme/Type: <strong>${escapeHtml(req.exam_type)}</strong></p>` : ''}
                        ${req.notes ? `<p style="font-size: 12px; color: #cbd5e1; margin: 4px 0; font-style: italic;">"${escapeHtml(req.notes)}"</p>` : ''}
                        <p class="pending-contributor" style="margin-top: 6px;">Requested by: <strong>${escapeHtml(req.student_name || 'MCE Student')}</strong> • <small>${new Date(req.created_at).toLocaleDateString()}</small></p>
                    </div>
                    <div class="pending-actions" style="margin-top: 12px; display: flex; gap: 8px;">
                        ${isPending ? `
                            <button class="btn-approve" type="button" onclick="prefillUploadFromRequest('${escapeHtml(req.branch)}', '${escapeHtml(req.semester)}', '${escapeHtml(req.subject)}', '${escapeHtml(req.year)}')">
                                <span>Publish Paper</span>
                            </button>
                            <button class="btn-reject" type="button" onclick="updateRequestStatus(${req.id}, 'fulfilled')">
                                <span>Mark Fulfilled</span>
                            </button>
                        ` : `
                            <span style="font-size: 12px; color: #94a3b8;">Fulfilled & published in library</span>
                        `}
                    </div>
                </article>
            `;
        }).join("");
    } catch (e) {
        console.error(e);
    }
}

window.updateRequestStatus = async function (id, status) {
    try {
        const res = await fetch("/api/admin/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: id, status: status })
        });
        if (res.ok) {
            showNotification(`Request marked as ${status}!`, true);
            await fetchStudentRequests();
        }
    } catch (e) {
        showNotification("Failed to update status", false);
    }
};

window.prefillUploadFromRequest = function (branch, sem, subject, year) {
    const form = document.getElementById("uploadForm");
    if (form) {
        if (form.branch) form.branch.value = branch;
        if (form.semester) form.semester.value = sem;
        if (form.subject) form.subject.value = subject;
        if (form.year) form.year.value = year;
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        showNotification(`Form pre-filled for "${subject}" (${branch})!`, true);
    }
};

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginStatus.className = "upload-status";
    loginStatus.textContent = "Verifying credentials...";
    try {
        const response = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: document.getElementById("adminPassword").value })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setAdminLoggedIn(true);
        loginStatus.textContent = "";
        showNotification("Welcome Admin! You can now publish or delete papers.", true);
    } catch (error) {
        loginStatus.className = "upload-status error";
        loginStatus.textContent = error.message || "Invalid password";
    }
});

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        setAdminLoggedIn(false);
        document.getElementById("adminPassword").value = "";
        showNotification("You have been signed out.", true);
    });
}

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    uploadStatus.className = "upload-status";
    uploadStatus.textContent = "Uploading & processing PDF...";

    try {
        const response = await fetch("/api/papers", {
            method: "POST",
            body: new FormData(uploadForm)
        });
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || "Upload failed");
        }

        uploadStatus.className = "upload-status success";
        uploadStatus.textContent = "✅ " + result.message;
        uploadForm.reset();
        loadDashboard();
    } catch (error) {
        uploadStatus.className = "upload-status error";
        uploadStatus.textContent = "❌ " + error.message;
    }
});

loadDashboard();
checkAdminAuth();
