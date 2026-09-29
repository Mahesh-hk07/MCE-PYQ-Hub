/**
 * MCE PYQ Hub - Comprehensive Admin Dashboard Controller
 * Handles session verification, tab navigation, repository CRUD, bulk operations,
 * department insights, student requests, and admin user management.
 */

let currentAdminUser = null;
let allPapers = [];
let filteredPapers = [];
let selectedPaperIds = new Set();
let paperPendingSingleDelete = null;

// ==========================================================
// 1. SESSION VERIFICATION & INITIALIZATION
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
    initTheme();
    await verifyAdminSession();
    setupNavigation();
    setupDropzone();
    setupTableFilters();
    setupModals();
    await refreshAllData();
});

async function verifyAdminSession() {
    try {
        const response = await fetch("/api/admin/me");
        if (!response.ok) {
            window.location.replace("/admin/login");
            return;
        }
        const data = await response.json();
        if (!data.authenticated || !data.user || data.user.role !== "admin") {
            window.location.replace("/admin/login");
            return;
        }
        currentAdminUser = data.user;
        const email = currentAdminUser.email || "admin@mce.ac.in";
        document.getElementById("adminUserEmail").textContent = email;
        document.getElementById("adminUserAvatar").textContent = email.charAt(0).toUpperCase();

        if (currentAdminUser.branch) {
            applyBranchRestrictions(currentAdminUser.branch);
        }
    } catch (e) {
        window.location.replace("/admin/login");
    }
}

function applyBranchRestrictions(branch) {
    if (!branch) return;

    // 1. Update Badges, Avatar, and Brand Text
    const badge = document.getElementById("adminBranchBadge");
    if (badge) {
        badge.textContent = `${branch} Admin`;
        badge.style.fontWeight = "600";
        badge.style.color = "#38bdf8";
    }

    const brandSub = document.getElementById("sidebarBrandSub");
    if (brandSub) {
        brandSub.textContent = `${branch} Admin Portal`;
    }

    const deptLinkText = document.getElementById("sidebarDeptLinkText");
    if (deptLinkText) {
        deptLinkText.textContent = `${branch} Department`;
    }

    // 2. Set Student View Link to assigned department Admin Student View route
    const studentViewLink = document.getElementById("topbarStudentViewLink");
    if (studentViewLink && branch) {
        studentViewLink.href = `/admin/student-view?branch=${encodeURIComponent(branch)}`;
        studentViewLink.setAttribute("title", `Open ${branch} Admin Student View`);
        const span = studentViewLink.querySelector("span");
        if (span) span.textContent = `${branch} Student View`;
    }

    // 3. Update Overview Tab second card
    const branchesLabel = document.getElementById("overviewBranchesLabel");
    if (branchesLabel) {
        branchesLabel.textContent = "Assigned Department";
    }
    const overviewBranches = document.getElementById("overviewBranches");
    if (overviewBranches) {
        overviewBranches.textContent = branch;
    }

    // 4. Lock Upload form branch to assigned department ONLY
    const uploadBranchSelect = document.getElementById("uploadBranch");
    if (uploadBranchSelect) {
        uploadBranchSelect.innerHTML = `<option value="${escapeHtml(branch)}" selected>${escapeHtml(branch)}</option>`;
        uploadBranchSelect.style.pointerEvents = "none";
        uploadBranchSelect.style.backgroundColor = "var(--admin-card-bg)";

        const semesterSelect = document.getElementById("uploadSemester");
        if (semesterSelect) {
            semesterSelect.innerHTML = '<option value="">Select Semester</option>';
            const sems = (branch === "First Year")
                ? ["1st Semester", "2nd Semester"]
                : ["3rd Semester", "4th Semester", "5th Semester", "6th Semester", "7th Semester", "8th Semester"];
            sems.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s;
                opt.textContent = s;
                semesterSelect.appendChild(opt);
            });
            semesterSelect.addEventListener("change", updateUploadCieOptions);
        }
    }

    // 5. Lock Repository Filter to assigned department ONLY
    const filterBranchSelect = document.getElementById("filterBranchSelect");
    if (filterBranchSelect) {
        filterBranchSelect.innerHTML = `<option value="${escapeHtml(branch)}" selected>${escapeHtml(branch)} Department</option>`;
        filterBranchSelect.value = branch;
        filterBranchSelect.style.pointerEvents = "none";
    }

    // 6. Hide other branch pills, display only assigned department pill
    const pillsRow = document.getElementById("branchPillsRow");
    if (pillsRow) {
        pillsRow.innerHTML = `<button type="button" class="btn-branch-pill active" data-branch="${escapeHtml(branch)}">${escapeHtml(branch)}</button>`;
    }

    // 7. Personalize Clear All button
    const clearRepoBtn = document.getElementById("btnClearEntireRepo");
    if (clearRepoBtn) {
        const span = clearRepoBtn.querySelector("span");
        if (span) span.textContent = `Clear All ${branch} Papers`;
    }

    // 8. Update Departments tab header
    const deptTitle = document.getElementById("departmentsTabTitle");
    const deptSubtitle = document.getElementById("departmentsTabSubtitle");
    if (deptTitle) deptTitle.textContent = `${branch} Department Profile`;
    if (deptSubtitle) deptSubtitle.textContent = `Academic structure and examination metrics for ${branch}`;

    // 9. Hide "Manage Admins" tab in sidebar (strictly Department Admins)
    const userTabLink = document.querySelector('.sidebar-link[data-tab="users"]');
    if (userTabLink) {
        userTabLink.style.display = "none";
    }
}

// Logout handler
document.getElementById("adminLogoutBtn").addEventListener("click", async () => {
    try {
        await fetch("/api/admin/logout", { method: "POST" });
    } catch (e) {
        // Continue
    }
    window.location.replace("/admin/login");
});

// Night Mode Toggle
function initTheme() {
    const saved = localStorage.getItem("mce-theme") || "light";
    document.documentElement.setAttribute("data-theme", saved);
    const themeBtn = document.getElementById("themeToggleBtn");
    if (themeBtn) {
        themeBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            const next = current === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("mce-theme", next);
        });
    }
}

// ==========================================================
// 2. TAB NAVIGATION
// ==========================================================

const TAB_TITLES = {
    overview: { title: "Dashboard Overview", subtitle: "Malnad College of Engineering - Autonomous Library Database" },
    papers: { title: "Question Papers Repository", subtitle: "Manage, search, edit, and organize uploaded examination question papers" },
    upload: { title: "Publish Question Paper", subtitle: "Upload verified PDF documents and tag with course metadata" },
    departments: { title: "Engineering Departments", subtitle: "Review question paper distributions across all 8 branches" },
    subjects: { title: "Subjects Directory", subtitle: "Explore course codes, active semesters, and question paper density" },
    requests: { title: "Student Question Paper Demands", subtitle: "Past examination papers requested by students that need to be sourced" },
    submissions: { title: "Student Paper Contributions", subtitle: "Verify and publish question papers contributed by students" },
    users: { title: "Administrator Accounts", subtitle: "Manage library staff credentials and access permissions" },
    logs: { title: "Security & Activity Audit Logs", subtitle: "Real-time records of administrative actions and repository changes" },
    system: { title: "System Settings", subtitle: "Autonomous scheme parameters, database status, and storage settings" }
};

function setupNavigation() {
    const links = document.querySelectorAll(".sidebar-link[data-tab]");
    links.forEach(link => {
        link.addEventListener("click", () => {
            const tab = link.getAttribute("data-tab");
            switchAdminTab(tab);
        });
    });

    // Mobile sidebar toggle
    const toggleBtn = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("adminSidebar");
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
            if (window.innerWidth <= 860 && !sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                sidebar.classList.remove("open");
            }
        });
    }
}

function updateUploadCieOptions() {
    const semSelect = document.getElementById("uploadSemester");
    const cieSelect = document.getElementById("uploadCieNumber");
    if (!semSelect || !cieSelect) return;
    const sem = semSelect.value;
    const semNum = parseInt(sem) || 1;
    // 1st Year (sem 1-2) and 2nd Year (sem 3-4): 2 CIEs (CIE-1, CIE-2)
    // 3rd Year (sem 5-6) and 4th Year (sem 7-8): 3 CIEs (CIE-1, CIE-2, CIE-3)
    const maxCie = (semNum <= 4) ? 2 : 3;
    cieSelect.innerHTML = '<option value="">Select CIE Number</option>';
    for (let i = 1; i <= maxCie; i++) {
        const opt = document.createElement("option");
        opt.value = `CIE-${i}`;
        opt.textContent = `CIE-${i}`;
        cieSelect.appendChild(opt);
    }
}

function switchAdminTab(tabName) {
    document.querySelectorAll(".sidebar-link").forEach(l => l.classList.remove("active"));
    const targetLink = document.querySelector(`.sidebar-link[data-tab="${tabName}"]`);
    if (targetLink) targetLink.classList.add("active");

    document.querySelectorAll(".admin-tab-view").forEach(v => v.classList.remove("active"));
    const targetView = document.getElementById(`tab-${tabName}`);
    if (targetView) targetView.classList.add("active");

    const branch = (currentAdminUser && currentAdminUser.branch) ? currentAdminUser.branch : "";
    if (branch) {
        if (tabName === "overview") {
            document.getElementById("currentTabTitle").textContent = `${branch} Dashboard Overview`;
            document.getElementById("currentTabSubtitle").textContent = `Malnad College of Engineering — Autonomous ${branch} Examination Repository`;
        } else if (tabName === "papers") {
            document.getElementById("currentTabTitle").textContent = `${branch} Question Papers`;
            document.getElementById("currentTabSubtitle").textContent = `Manage, search, edit, and organize ${branch} question papers`;
        } else if (tabName === "upload") {
            document.getElementById("currentTabTitle").textContent = `Publish ${branch} Question Paper`;
            document.getElementById("currentTabSubtitle").textContent = `Upload verified examination PDF documents for ${branch}`;
        } else if (tabName === "departments") {
            document.getElementById("currentTabTitle").textContent = `${branch} Department Profile`;
            document.getElementById("currentTabSubtitle").textContent = `Academic structure and examination metrics for ${branch}`;
        } else if (tabName === "subjects") {
            document.getElementById("currentTabTitle").textContent = `${branch} Subjects Directory`;
            document.getElementById("currentTabSubtitle").textContent = `Active course codes and syllabus catalog for ${branch}`;
        } else if (tabName === "requests") {
            document.getElementById("currentTabTitle").textContent = `${branch} Student Demands`;
            document.getElementById("currentTabSubtitle").textContent = `Past examination papers requested by students for ${branch}`;
        } else if (tabName === "submissions") {
            document.getElementById("currentTabTitle").textContent = `${branch} Student Contributions`;
            document.getElementById("currentTabSubtitle").textContent = `Review and approve contributed question papers for ${branch}`;
        } else if (tabName === "logs") {
            document.getElementById("currentTabTitle").textContent = `${branch} Activity Audit Logs`;
            document.getElementById("currentTabSubtitle").textContent = `Security audit logs for administrative actions in ${branch}`;
        } else {
            const meta = TAB_TITLES[tabName] || { title: "Admin Portal", subtitle: "MCE PYQ Hub" };
            document.getElementById("currentTabTitle").textContent = meta.title;
            document.getElementById("currentTabSubtitle").textContent = meta.subtitle;
        }
    } else {
        const meta = TAB_TITLES[tabName] || { title: "Admin Portal", subtitle: "MCE PYQ Hub" };
        document.getElementById("currentTabTitle").textContent = meta.title;
        document.getElementById("currentTabSubtitle").textContent = meta.subtitle;
    }

    // Trigger tab-specific refresh if needed
    if (tabName === "logs") loadActivityLogs();
    if (tabName === "users") loadAdminUsers();
    if (tabName === "requests") loadStudentRequests();
    if (tabName === "submissions") loadStudentSubmissions();

    if (window.innerWidth <= 860) {
        document.getElementById("adminSidebar").classList.remove("open");
    }
}

// ==========================================================
// 3. DATA REFRESH & STATS
// ==========================================================

async function refreshAllData() {
    await Promise.all([
        loadDashboardStats(),
        loadAllPapers(),
        loadStudentRequests(),
        loadStudentSubmissions()
    ]);
}

async function loadDashboardStats() {
    try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return;
        const stats = await res.json();
        
        document.getElementById("overviewTotalPapers").textContent = Number(stats.total_papers || 0).toLocaleString();
        if (currentAdminUser && currentAdminUser.branch) {
            const lbl = document.getElementById("overviewBranchesLabel");
            if (lbl) lbl.textContent = "Assigned Department";
            const val = document.getElementById("overviewBranches");
            if (val) val.textContent = currentAdminUser.branch;
        } else {
            document.getElementById("overviewBranches").textContent = stats.active_branches || 8;
        }
        document.getElementById("overviewSubjects").textContent = stats.total_subjects || 0;
        document.getElementById("overviewRequests").textContent = stats.student_requests || 0;
        document.getElementById("sidebarPapersBadge").textContent = stats.total_papers || 0;
        document.getElementById("sidebarRequestsBadge").textContent = stats.student_requests || 0;
        document.getElementById("btnReqCount").textContent = stats.student_requests || 0;
    } catch (e) {
        console.warn("Could not load admin stats", e);
    }
}

// ==========================================================
// 4. PAPERS REPOSITORY & FILTERING
// ==========================================================

async function loadAllPapers() {
    try {
        const res = await fetch("/api/papers");
        if (!res.ok) return;
        allPapers = await res.json();
        applyPaperFilters();
        renderRecentPapersOverview();
        renderDepartmentsGrid();
        renderSubjectsCatalog();
    } catch (e) {
        console.error("Could not load papers", e);
    }
}

function setupTableFilters() {
    const searchInput = document.getElementById("paperSearchInput");
    const clearBtn = document.getElementById("btnClearSearch");
    const branchSelect = document.getElementById("filterBranchSelect");
    const semesterSelect = document.getElementById("filterSemesterSelect");
    const yearSelect = document.getElementById("filterYearSelect");
    const branchPills = document.querySelectorAll(".btn-branch-pill");

    const onFilterChange = () => {
        clearBtn.style.display = searchInput.value ? "block" : "none";
        applyPaperFilters();
    };

    searchInput.addEventListener("input", onFilterChange);
    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        onFilterChange();
        searchInput.focus();
    });

    branchSelect.addEventListener("change", () => {
        const val = branchSelect.value;
        branchPills.forEach(p => {
            p.classList.toggle("active", p.getAttribute("data-branch") === val);
        });
        applyPaperFilters();
    });

    semesterSelect.addEventListener("change", applyPaperFilters);
    yearSelect.addEventListener("change", applyPaperFilters);

    branchPills.forEach(pill => {
        pill.addEventListener("click", () => {
            branchPills.forEach(p => p.classList.remove("active"));
            pill.classList.add("active");
            const b = pill.getAttribute("data-branch");
            branchSelect.value = b;
            applyPaperFilters();
        });
    });

    // Bulk selection handlers
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");
    selectAllCheckbox.addEventListener("change", () => {
        if (selectAllCheckbox.checked) {
            filteredPapers.forEach(p => selectedPaperIds.add(p.id));
        } else {
            selectedPaperIds.clear();
        }
        updateBulkUI();
        renderPapersTable();
    });

    document.getElementById("btnClearBulk").addEventListener("click", () => {
        selectedPaperIds.clear();
        selectAllCheckbox.checked = false;
        updateBulkUI();
        renderPapersTable();
    });

    document.getElementById("btnBatchDelete").addEventListener("click", () => {
        if (selectedPaperIds.size === 0) return;
        document.getElementById("batchDeleteCountText").textContent = selectedPaperIds.size;
        openModal("batchDeleteModal");
    });

    document.getElementById("btnConfirmBatchDelete").addEventListener("click", executeBatchDelete);
}

function applyPaperFilters() {
    const search = document.getElementById("paperSearchInput").value.trim().toLowerCase();
    const branch = document.getElementById("filterBranchSelect").value;
    const semester = document.getElementById("filterSemesterSelect").value;
    const year = document.getElementById("filterYearSelect").value;

    filteredPapers = allPapers.filter(paper => {
        if (branch && paper.branch !== branch) return false;
        if (semester && paper.semester !== semester) return false;
        if (year && String(paper.year) !== year) return false;
        if (search) {
            const haystack = [
                paper.title, paper.subject, paper.subject_code, paper.branch, paper.semester, String(paper.year), paper.exam_type
            ].join(" ").toLowerCase();
            if (!haystack.includes(search)) return false;
        }
        return true;
    });

    document.getElementById("papersFilteredCount").textContent = filteredPapers.length;
    document.getElementById("showingPapersCount").textContent = filteredPapers.length;
    updateBulkUI();
    renderPapersTable();
}

function updateBulkUI() {
    const bulkBar = document.getElementById("bulkActionsGroup");
    const countPill = document.getElementById("bulkCountPill");
    const selectAllCheckbox = document.getElementById("selectAllCheckbox");

    const count = selectedPaperIds.size;
    if (count > 0) {
        bulkBar.style.display = "flex";
        countPill.textContent = `${count} Selected`;
    } else {
        bulkBar.style.display = "none";
    }

    if (filteredPapers.length > 0 && selectedPaperIds.size === filteredPapers.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedPaperIds.size > 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function getBranchBadgeHtml(branch) {
    const b = (branch || "").toLowerCase();
    let badgeClass = "badge-branch-cse";
    if (b.includes("aiml")) badgeClass = "badge-branch-aiml";
    else if (b.includes("csbs")) badgeClass = "badge-branch-csbs";
    else if (b.includes("ece")) badgeClass = "badge-branch-ece";
    else if (b.includes("eee")) badgeClass = "badge-branch-eee";
    else if (b.includes("mech")) badgeClass = "badge-branch-mech";
    else if (b.includes("civil")) badgeClass = "badge-branch-civil";
    else if (b.includes("first")) badgeClass = "badge-branch-fy";
    return `<span class="badge-tag ${badgeClass}">${escapeHtml(branch)}</span>`;
}

function renderPapersTable() {
    const tbody = document.getElementById("allPapersTableBody");
    if (!filteredPapers.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 40px; color: var(--admin-text-muted);">No question papers match your current filters.</td></tr>`;
        return;
    }

    tbody.innerHTML = filteredPapers.map(p => {
        const isChecked = selectedPaperIds.has(p.id);
        const encoded = encodeURIComponent(JSON.stringify(p));
        return `
            <tr>
                <td>
                    <input type="checkbox" class="paper-row-checkbox" data-id="${p.id}" ${isChecked ? "checked" : ""}>
                </td>
                <td>
                    <strong style="color: var(--admin-text-main); font-weight: 700;">${escapeHtml(p.title || p.subject)}</strong>
                </td>
                <td>${getBranchBadgeHtml(p.branch)}</td>
                <td><span style="font-size: 12px; font-weight: 600;">${escapeHtml(p.semester)}</span></td>
                <td>${escapeHtml(p.subject)}</td>
                <td><code style="font-size: 11px; background: var(--admin-bg); padding: 2px 6px; border-radius: 4px;">${escapeHtml(p.subject_code || "-")}</code></td>
                <td><strong>${p.year}</strong></td>
                <td>
                    <span style="font-size: 11.5px; color: var(--admin-text-muted);">${escapeHtml(p.exam_type || "Autonomous SEE")}</span>
                    ${p.cie_number ? `<span style="font-size: 10px; background: #e0f2fe; color: #0284c7; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: 600;">${escapeHtml(p.cie_number)}</span>` : ""}
                    ${(!p.exam_type || (!["Semester Examinations", "CIE Examinations"].includes(p.exam_type))) ? `<span style="font-size: 10px; background: #fef3c7; color: #d97706; padding: 2px 5px; border-radius: 4px; margin-left: 4px; font-weight: 600;" title="Legacy / Review Required">Legacy</span>` : ""}
                </td>
                <td>
                    <div class="table-action-btns">
                        <a href="/${escapeHtml(p.file)}" target="_blank" class="btn-table-action" title="Preview PDF Document">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </a>
                        <button type="button" class="btn-table-action" onclick="openEditModal('${encoded}')" title="Edit Metadata">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button type="button" class="btn-table-action action-delete" onclick="promptSingleDelete('${encoded}')" title="Delete Paper">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    // Attach row checkbox handlers
    tbody.querySelectorAll(".paper-row-checkbox").forEach(cb => {
        cb.addEventListener("change", (e) => {
            const id = Number(e.target.getAttribute("data-id"));
            if (e.target.checked) selectedPaperIds.add(id);
            else selectedPaperIds.delete(id);
            updateBulkUI();
        });
    });
}

function renderRecentPapersOverview() {
    const tbody = document.getElementById("recentPapersTableBody");
    const recent = allPapers.slice(0, 6);
    if (!recent.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--admin-text-muted);">No papers found.</td></tr>`;
        return;
    }
    tbody.innerHTML = recent.map(p => {
        const encoded = encodeURIComponent(JSON.stringify(p));
        return `
            <tr>
                <td><strong>${escapeHtml(p.title || p.subject)}</strong></td>
                <td>${getBranchBadgeHtml(p.branch)}</td>
                <td>${escapeHtml(p.semester)}</td>
                <td>${escapeHtml(p.subject)}</td>
                <td><strong>${p.year}</strong></td>
                <td>
                    <div class="table-action-btns">
                        <a href="/${escapeHtml(p.file)}" target="_blank" class="btn-table-action" title="Preview PDF">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        </a>
                        <button type="button" class="btn-table-action" onclick="openEditModal('${encoded}')" title="Edit">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// ==========================================================
// 5. DEPARTMENTS & SUBJECTS CATALOG
// ==========================================================

const DEPT_DEFINITIONS = [
    { name: "Computer Science & Engineering", code: "CSE", icon: "💻" },
    { name: "CSE (Artificial Intelligence & ML)", code: "CSE(AI&ML)", icon: "🤖" },
    { name: "CS & Business Systems", code: "CSBS", icon: "📊" },
    { name: "Electronics & Communication", code: "ECE", icon: "📡" },
    { name: "Electrical & Electronics", code: "EEE", icon: "⚡" },
    { name: "Mechanical Engineering", code: "Mechanical", icon: "⚙️" },
    { name: "Civil Engineering", code: "Civil", icon: "🏗️" },
    { name: "First Year Engineering", code: "First Year", icon: "📚" }
];

function renderDepartmentsGrid() {
    const grid = document.getElementById("departmentsGrid");
    const deptsToShow = (currentAdminUser && currentAdminUser.branch)
        ? DEPT_DEFINITIONS.filter(d => d.code.toLowerCase() === currentAdminUser.branch.toLowerCase())
        : DEPT_DEFINITIONS;

    grid.innerHTML = deptsToShow.map(dept => {
        const deptPapers = allPapers.filter(p => p.branch === dept.code);
        const uniqueSubjects = new Set(deptPapers.map(p => (p.subject || "").trim().toLowerCase())).size;
        return `
            <div class="dept-card">
                <div class="dept-card-header">
                    <div class="dept-card-icon">${dept.icon}</div>
                    <div class="dept-card-title">
                        <h4>${escapeHtml(dept.code)}</h4>
                        <span>${escapeHtml(dept.name)}</span>
                    </div>
                </div>
                <div class="dept-stats-row">
                    <span>Papers Published</span>
                    <strong>${deptPapers.length}</strong>
                </div>
                <div class="dept-stats-row">
                    <span>Distinct Subjects</span>
                    <strong>${uniqueSubjects}</strong>
                </div>
                <button type="button" class="btn-topbar-action" style="margin-top: 6px; justify-content: center;" onclick="jumpToBranchPapers('${dept.code}')">
                    Explore ${dept.code} Papers &rarr;
                </button>
            </div>
        `;
    }).join("");
}

function jumpToBranchPapers(branchCode) {
    switchAdminTab("papers");
    document.getElementById("filterBranchSelect").value = branchCode;
    document.querySelectorAll(".btn-branch-pill").forEach(p => {
        p.classList.toggle("active", p.getAttribute("data-branch") === branchCode);
    });
    applyPaperFilters();
}

function renderSubjectsCatalog() {
    const tbody = document.getElementById("subjectsTableBody");
    const subjectMap = new Map();

    allPapers.forEach(p => {
        const sub = (p.subject || "").trim();
        if (!sub) return;
        const key = `${p.branch}:::${sub.toLowerCase()}`;
        if (!subjectMap.has(key)) {
            subjectMap.set(key, {
                subjectName: sub,
                branch: p.branch,
                semesters: new Set(),
                count: 0
            });
        }
        const item = subjectMap.get(key);
        if (p.semester) item.semesters.add(p.semester);
        item.count++;
    });

    const list = Array.from(subjectMap.values()).sort((a, b) => b.count - a.count);
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--admin-text-muted);">No subjects found.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.subjectName)}</strong></td>
            <td>${getBranchBadgeHtml(item.branch)}</td>
            <td><span style="font-size: 12px; color: var(--admin-text-muted);">${Array.from(item.semesters).join(", ")}</span></td>
            <td><strong>${item.count}</strong> papers</td>
            <td>
                <button type="button" class="btn-table-action" style="width: auto; padding: 4px 10px; font-size: 12px;" onclick="filterBySubject('${escapeHtml(item.subjectName)}', '${escapeHtml(item.branch)}')">
                    View Papers
                </button>
            </td>
        </tr>
    `).join("");
}

function filterBySubject(subjectName, branch) {
    switchAdminTab("papers");
    document.getElementById("paperSearchInput").value = subjectName;
    document.getElementById("filterBranchSelect").value = branch;
    applyPaperFilters();
}

// ==========================================================
// 6. ADD QUESTION PAPER UPLOAD
// ==========================================================

function setupDropzone() {
    const dropzone = document.getElementById("fileDropzone");
    const fileInput = document.getElementById("uploadFileInput");
    const selectedText = document.getElementById("dropzoneSelectedFile");

    fileInput.addEventListener("change", () => {
        if (fileInput.files.length > 0) {
            const f = fileInput.files[0];
            selectedText.textContent = `✓ Selected: ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`;
            selectedText.style.display = "block";
        } else {
            selectedText.style.display = "none";
        }
    });

    ["dragenter", "dragover"].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            dropzone.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(event => {
        dropzone.addEventListener(event, (e) => {
            e.preventDefault();
            dropzone.classList.remove("dragover");
        });
    });

    dropzone.addEventListener("drop", (e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            const f = e.dataTransfer.files[0];
            selectedText.textContent = `✓ Selected: ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`;
            selectedText.style.display = "block";
        }
    });

    // Dynamic Branch -> Semester and Exam Type -> CIE Number handlers
    const branchSelect = document.getElementById("uploadBranch");
    const semesterSelect = document.getElementById("uploadSemester");
    const examTypeSelect = document.getElementById("uploadExamType");
    const cieGroup = document.getElementById("uploadCieGroup");
    const cieNumberSelect = document.getElementById("uploadCieNumber");
    const subjectInput = document.getElementById("uploadSubject");
    const yearInput = document.getElementById("uploadYear");
    const titleInput = document.getElementById("uploadTitle");

    function updateUploadSemesters() {
        if (!branchSelect || !semesterSelect) return;
        const branch = branchSelect.value;
        semesterSelect.innerHTML = '<option value="">Select Semester</option>';
        if (!branch) {
            semesterSelect.innerHTML = '<option value="">Select Department First</option>';
            return;
        }
        const sems = (branch === "First Year")
            ? ["1st Semester", "2nd Semester"]
            : ["3rd Semester", "4th Semester", "5th Semester", "6th Semester", "7th Semester", "8th Semester"];
        sems.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            opt.textContent = s;
            semesterSelect.appendChild(opt);
        });
    }

    if (branchSelect) {
        branchSelect.addEventListener("change", () => {
            updateUploadSemesters();
            autoSuggestTitle();
        });
    }

    if (examTypeSelect) {
        examTypeSelect.addEventListener("change", () => {
            const isCie = examTypeSelect.value === "CIE Examinations";
            if (cieGroup) cieGroup.style.display = isCie ? "block" : "none";
            if (cieNumberSelect) {
                cieNumberSelect.required = isCie;
                if (!isCie) cieNumberSelect.value = "";
            }
            autoSuggestTitle();
        });
    }

    if (cieNumberSelect) {
        cieNumberSelect.addEventListener("change", () => autoSuggestTitle());
    }

    const autoSuggestTitle = () => {
        if (!subjectInput) return;
        const s = subjectInput.value.trim();
        const sem = semesterSelect ? semesterSelect.value : "";
        const y = yearInput ? yearInput.value.trim() : "2025";
        const examType = examTypeSelect ? examTypeSelect.value : "";
        const cie = cieNumberSelect ? cieNumberSelect.value : "";
        if (s && titleInput && !titleInput.value) {
            const tag = (examType === "CIE Examinations" && cie) ? cie : "SEE";
            titleInput.placeholder = `${s} ${sem ? `(${sem})` : ""} ${tag} ${y || 2025}`;
        }
    };

    if (subjectInput) subjectInput.addEventListener("input", autoSuggestTitle);
    if (semesterSelect) semesterSelect.addEventListener("change", autoSuggestTitle);
    if (yearInput) yearInput.addEventListener("change", autoSuggestTitle);

    // Form submit
    const form = document.getElementById("uploadPaperForm");
    const alertBanner = document.getElementById("uploadAlertBanner");
    const submitBtn = document.getElementById("btnPublishPaper");

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        alertBanner.style.display = "none";

        if (!fileInput.files || !fileInput.files[0]) {
            alertBanner.className = "admin-alert-banner admin-alert-danger";
            alertBanner.textContent = "Please choose a PDF question paper to upload.";
            alertBanner.style.display = "flex";
            return;
        }

        const formData = new FormData(form);
        if (currentAdminUser && currentAdminUser.branch) {
            formData.set("branch", currentAdminUser.branch);
        }
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"></path></svg>
            <span>Publishing Paper...</span>
        `;

        try {
            const res = await fetch("/api/papers", {
                method: "POST",
                body: formData
            });
            const data = await res.json();

            if (res.ok) {
                alertBanner.className = "admin-alert-banner admin-alert-success";
                alertBanner.textContent = "Question paper published successfully to the repository!";
                alertBanner.style.display = "flex";
                form.reset();
                selectedText.style.display = "none";
                if (cieGroup) cieGroup.style.display = "none";
                if (currentAdminUser && currentAdminUser.branch) {
                    applyBranchRestrictions(currentAdminUser.branch);
                } else {
                    updateUploadSemesters();
                }
                await refreshAllData();
            } else {
                alertBanner.className = "admin-alert-banner admin-alert-danger";
                alertBanner.textContent = data.error || "Could not publish paper.";
                alertBanner.style.display = "flex";
            }
        } catch (err) {
            alertBanner.className = "admin-alert-banner admin-alert-danger";
            alertBanner.textContent = "Network error during upload.";
            alertBanner.style.display = "flex";
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Publish Paper to Repository</span>
            `;
        }
    });
}

// ==========================================================
// 7. EDIT & DELETE MODALS
// ==========================================================

function setupModals() {
    // Toggle CIE group in edit modal
    const editExamType = document.getElementById("editExamType");
    const editCieGroup = document.getElementById("editCieGroup");
    if (editExamType && editCieGroup) {
        editExamType.addEventListener("change", () => {
            editCieGroup.style.display = editExamType.value === "CIE Examinations" ? "block" : "none";
        });
    }

    // Edit Form submit
    document.getElementById("editPaperForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = Number(document.getElementById("editPaperId").value);
        const branch = document.getElementById("editPaperBranch").value;
        const title = document.getElementById("editTitle").value.trim();
        const subject = document.getElementById("editSubject").value.trim();
        const subject_code = document.getElementById("editSubjectCode").value.trim();
        const semester = document.getElementById("editSemester").value;
        const year = Number(document.getElementById("editYear").value);
        const exam_type = document.getElementById("editExamType").value;
        const cie_number = (exam_type === "CIE Examinations" && document.getElementById("editCieNumber"))
            ? document.getElementById("editCieNumber").value
            : "";

        const btn = document.getElementById("btnSaveEdit");
        btn.disabled = true;
        btn.textContent = "Saving...";

        try {
            const res = await fetch("/api/papers/edit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, branch, title, subject, subject_code, semester, year, exam_type, cie_number })
            });
            if (res.ok) {
                closeModal("editPaperModal");
                await refreshAllData();
            } else {
                const err = await res.json();
                alert(err.error || "Could not update paper.");
            }
        } catch (e) {
            alert("Network error updating paper.");
        } finally {
            btn.disabled = false;
            btn.textContent = "Save Changes";
        }
    });

    // Single delete confirm
    document.getElementById("btnConfirmSingleDelete").addEventListener("click", executeSingleDelete);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}

function openEditModal(encodedPaper) {
    const paper = JSON.parse(decodeURIComponent(encodedPaper));
    document.getElementById("editPaperId").value = paper.id;
    const branchInput = document.getElementById("editPaperBranch");
    const activeBranch = (currentAdminUser && currentAdminUser.branch) ? currentAdminUser.branch : paper.branch;
    if (branchInput) {
        branchInput.innerHTML = `<option value="${escapeHtml(activeBranch)}" selected>${escapeHtml(activeBranch)}</option>`;
        branchInput.value = activeBranch;
        branchInput.style.pointerEvents = "none";
    }
    document.getElementById("editTitle").value = paper.title || "";
    document.getElementById("editSubject").value = paper.subject || "";
    document.getElementById("editSubjectCode").value = paper.subject_code || "";
    document.getElementById("editSemester").value = paper.semester || "1st Semester";
    document.getElementById("editYear").value = paper.year || 2024;
    document.getElementById("editExamType").value = paper.exam_type || "Autonomous SEE Exam";

    const editCieNumber = document.getElementById("editCieNumber");
    const editCieGroup = document.getElementById("editCieGroup");
    if (editCieNumber) {
        editCieNumber.value = paper.cie_number || "";
    }
    if (editCieGroup) {
        editCieGroup.style.display = paper.exam_type === "CIE Examinations" ? "block" : "none";
    }

    openModal("editPaperModal");
}

function promptSingleDelete(encodedPaper) {
    const paper = JSON.parse(decodeURIComponent(encodedPaper));
    paperPendingSingleDelete = paper;
    document.getElementById("deleteModalPaperTitle").textContent = paper.title || paper.subject;
    document.getElementById("deleteModalPaperMeta").textContent = `${paper.branch} • ${paper.semester} • ${paper.year}`;
    openModal("deletePaperModal");
}

function showAdminToast(message, isSuccess = true) {
    let toast = document.getElementById("adminLiveToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "adminLiveToast";
        toast.style.position = "fixed";
        toast.style.bottom = "24px";
        toast.style.right = "24px";
        toast.style.zIndex = "99999";
        toast.style.padding = "12px 20px";
        toast.style.borderRadius = "8px";
        toast.style.fontSize = "14px";
        toast.style.fontWeight = "600";
        toast.style.boxShadow = "0 10px 25px rgba(0,0,0,0.2)";
        toast.style.display = "flex";
        toast.style.alignItems = "center";
        toast.style.gap = "10px";
        toast.style.transition = "all 0.3s ease";
        document.body.appendChild(toast);
    }
    toast.style.background = isSuccess ? "#059669" : "#dc2626";
    toast.style.color = "#ffffff";
    toast.innerHTML = (isSuccess ? "✓ " : "✕ ") + escapeHtml(message);
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    setTimeout(() => {
        if (toast) {
            toast.style.opacity = "0";
            toast.style.transform = "translateY(10px)";
        }
    }, 4000);
}

async function executeSingleDelete() {
    if (!paperPendingSingleDelete) return;
    const btn = document.getElementById("btnConfirmSingleDelete");
    btn.disabled = true;
    btn.textContent = "Deleting...";

    try {
        const res = await fetch("/api/papers/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: Number(paperPendingSingleDelete.id),
                branch: paperPendingSingleDelete.branch,
                file: paperPendingSingleDelete.file
            })
        });
        const data = await res.json();
        if (res.ok) {
            closeModal("deletePaperModal");
            selectedPaperIds.delete(paperPendingSingleDelete.id);
            paperPendingSingleDelete = null;
            showAdminToast(data.message || "Question paper deleted successfully.", true);
            await refreshAllData();
        } else {
            showAdminToast(data.error || "Could not delete paper.", false);
            alert(data.error || "Could not delete paper.");
        }
    } catch (e) {
        showAdminToast("Error deleting paper.", false);
        alert("Error deleting paper.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Delete Permanently";
    }
}

async function executeBatchDelete() {
    if (selectedPaperIds.size === 0) return;
    const btn = document.getElementById("btnConfirmBatchDelete");
    btn.disabled = true;
    btn.textContent = "Deleting Selected...";

    const items = [];
    allPapers.forEach(p => {
        if (selectedPaperIds.has(p.id)) {
            items.push({ id: Number(p.id), branch: p.branch, file: p.file });
        }
    });

    try {
        const res = await fetch("/api/papers/batch-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items })
        });
        const data = await res.json();
        if (res.ok) {
            closeModal("batchDeleteModal");
            selectedPaperIds.clear();
            showAdminToast(data.message || "Question papers deleted successfully.", true);
            await refreshAllData();
        } else {
            showAdminToast(data.error || "Batch delete failed.", false);
            alert(data.error || "Batch delete failed.");
        }
    } catch (e) {
        showAdminToast("Network error executing batch delete.", false);
        alert("Network error executing batch delete.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Yes, Delete All Selected";
    }
}

async function promptClearEntireRepo() {
    const branch = (currentAdminUser && currentAdminUser.branch) ? currentAdminUser.branch : "";
    const promptMsg = branch
        ? `⚠️ PERMANENT ${branch.toUpperCase()} REPOSITORY PURGE\n\nAre you completely sure you want to delete ALL question papers in ${branch}?\n\nThis will permanently remove all papers for ${branch}. Papers in other departments will not be affected.`
        : "⚠️ PERMANENT REPOSITORY PURGE\n\nAre you completely sure you want to delete ALL question papers from the repository?\n\nThis will permanently remove all papers and reset the library to 0.";
    const isConfirmed = window.confirm(promptMsg);
    if (!isConfirmed) return;

    try {
        const res = await fetch("/api/papers/clear-all", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();
        if (res.ok) {
            selectedPaperIds.clear();
            showAdminToast(data.message || "All question papers deleted successfully.", true);
            await refreshAllData();
        } else {
            showAdminToast(data.error || "Failed to clear repository.", false);
            alert(data.error || "Failed to clear repository.");
        }
    } catch (e) {
        showAdminToast("Network error clearing repository.", false);
        alert("Network error clearing repository.");
    }
}

window.promptClearEntireRepo = promptClearEntireRepo;

// ==========================================================
// 8. STUDENT DEMANDS (REQUESTS) & QUICK PUBLISH
// ==========================================================

async function loadStudentRequests() {
    try {
        const res = await fetch("/api/requests");
        if (!res.ok) return;
        const data = await res.json();
        const requests = data.requests || [];
        
        const pendingCount = requests.filter(r => r.status === "pending").length;
        document.getElementById("requestsCountHeader").textContent = `${pendingCount} Pending`;
        document.getElementById("sidebarRequestsBadge").textContent = pendingCount;
        document.getElementById("overviewRequests").textContent = pendingCount;
        document.getElementById("btnReqCount").textContent = pendingCount;

        const tbody = document.getElementById("requestsTableBody");
        if (!requests.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--admin-text-muted);">No student paper requests found.</td></tr>`;
            return;
        }

        tbody.innerHTML = requests.map(r => {
            const isPending = r.status === "pending";
            const reqJson = encodeURIComponent(JSON.stringify(r));
            return `
                <tr>
                    <td><strong>${escapeHtml(r.student_name || "Student")}</strong></td>
                    <td>${getBranchBadgeHtml(r.branch)}</td>
                    <td>${escapeHtml(r.semester)}</td>
                    <td><strong>${escapeHtml(r.subject)}</strong></td>
                    <td>${escapeHtml(r.year)}</td>
                    <td><span style="font-size: 11px; color: var(--admin-text-muted);">${escapeHtml(r.exam_type || "Autonomous SEE")}</span></td>
                    <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(r.notes || "-")}</td>
                    <td>
                        <span class="badge-tag" style="background: ${isPending ? '#fef2f2' : '#ecfdf5'}; color: ${isPending ? '#dc2626' : '#059669'}; border: 1px solid ${isPending ? '#fecaca' : '#a7f3d0'};">
                            ${isPending ? "Pending Sourcing" : "Fulfilled"}
                        </span>
                    </td>
                    <td>
                        <div class="table-action-btns">
                            ${isPending ? `
                                <button type="button" class="btn-topbar-action" style="padding: 4px 8px; font-size: 11px; background: #2563eb; color: #fff;" onclick="quickPublishFromRequest('${reqJson}')" title="Publish Paper for this request">
                                    Publish Paper
                                </button>
                                <button type="button" class="btn-table-action" style="color: #10b981;" onclick="markRequestStatus(${r.id}, 'fulfilled')" title="Mark Fulfilled">
                                    ✓
                                </button>
                            ` : `
                                <span style="font-size: 12px; color: #10b981; font-weight: 700;">Completed</span>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (e) {
        console.warn("Could not load requests", e);
    }
}

function quickPublishFromRequest(encodedReq) {
    const req = JSON.parse(decodeURIComponent(encodedReq));
    switchAdminTab("upload");

    const bSelect = document.getElementById("uploadBranch");
    const sSelect = document.getElementById("uploadSemester");
    const subInput = document.getElementById("uploadSubject");
    const yInput = document.getElementById("uploadYear");
    const titleInput = document.getElementById("uploadTitle");

    if (bSelect) bSelect.value = req.branch || "";
    if (sSelect) sSelect.value = req.semester || "";
    if (subInput) subInput.value = req.subject || "";
    if (yInput) yInput.value = req.year || "2024";
    if (titleInput) titleInput.value = `${req.subject} (${req.semester}) Autonomous Scheme ${req.year}`;

    // Focus on file upload
    document.getElementById("uploadFileInput").focus();
}

async function markRequestStatus(reqId, status) {
    try {
        const res = await fetch("/api/admin/requests/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: reqId, status })
        });
        if (res.ok) {
            await loadStudentRequests();
        }
    } catch (e) {
        alert("Could not update request status.");
    }
}

// ==========================================================
// 9. STUDENT SUBMISSIONS REVIEW
// ==========================================================

async function loadStudentSubmissions() {
    try {
        const res = await fetch("/api/admin/pending");
        if (!res.ok) return;
        const data = await res.json();
        const pending = data.pending || [];
        
        document.getElementById("submissionsCountHeader").textContent = `${pending.length} Submissions`;
        document.getElementById("sidebarSubmissionsBadge").textContent = pending.length;

        const tbody = document.getElementById("submissionsTableBody");
        if (!pending.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--admin-text-muted);">No student paper submissions awaiting review.</td></tr>`;
            return;
        }

        tbody.innerHTML = pending.map(s => `
            <tr>
                <td><strong>${escapeHtml(s.contributor_name)}</strong></td>
                <td>${getBranchBadgeHtml(s.branch)}</td>
                <td>${escapeHtml(s.semester)}</td>
                <td>${escapeHtml(s.subject)}</td>
                <td><strong>${escapeHtml(s.title)}</strong></td>
                <td><strong>${s.year}</strong></td>
                <td>
                    <a href="/${escapeHtml(s.file)}" target="_blank" class="btn-topbar-action" style="padding: 4px 8px; font-size: 11.5px;">Preview PDF</a>
                </td>
                <td>
                    <div class="table-action-btns">
                        <button type="button" class="btn-topbar-action" style="padding: 4px 10px; background: #10b981; color: #fff;" onclick="approveSubmission(${s.id})">Approve</button>
                        <button type="button" class="btn-topbar-action btn-logout" style="padding: 4px 10px;" onclick="rejectSubmission(${s.id})">Reject</button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (e) {
        console.warn("Could not load submissions", e);
    }
}

async function approveSubmission(id) {
    if (!confirm("Approve and publish this student submission to the repository?")) return;
    try {
        const res = await fetch("/api/admin/submissions/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
        if (res.ok) {
            await refreshAllData();
        } else {
            const err = await res.json();
            alert(err.error || "Approval failed.");
        }
    } catch (e) {
        alert("Error approving submission.");
    }
}

async function rejectSubmission(id) {
    if (!confirm("Permanently reject and delete this student submission?")) return;
    try {
        const res = await fetch("/api/admin/submissions/reject", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id })
        });
        if (res.ok) {
            await refreshAllData();
        }
    } catch (e) {
        alert("Error rejecting submission.");
    }
}

// ==========================================================
// 10. ADMIN USERS & PASSWORD
// ==========================================================

async function loadAdminUsers() {
    try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) return;
        const data = await res.json();
        const users = data.users || [];
        const tbody = document.getElementById("adminUsersTableBody");
        tbody.innerHTML = users.map(u => `
            <tr>
                <td><strong>${escapeHtml(u.name)}</strong></td>
                <td><code>${escapeHtml(u.email)}</code></td>
                <td><span class="badge-tag" style="background: #eff6ff; color: #1d4ed8;">${escapeHtml(u.role)}</span></td>
                <td style="font-size: 12px; color: var(--admin-text-muted);">${escapeHtml(u.created_at || "-")}</td>
            </tr>
        `).join("");
    } catch (e) {
        console.warn("Could not load users", e);
    }
}

// Create admin handler
document.getElementById("createAdminForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("newAdminName").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const password = document.getElementById("newAdminPassword").value;
    const alertBox = document.getElementById("createAdminAlert");
    alertBox.style.display = "none";

    try {
        const res = await fetch("/api/admin/users/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password, role: "admin" })
        });
        const data = await res.json();
        if (res.ok) {
            alertBox.className = "admin-alert-banner admin-alert-success";
            alertBox.textContent = "New administrator created successfully!";
            alertBox.style.display = "flex";
            document.getElementById("createAdminForm").reset();
            await loadAdminUsers();
        } else {
            alertBox.className = "admin-alert-banner admin-alert-danger";
            alertBox.textContent = data.error || "Failed to create administrator.";
            alertBox.style.display = "flex";
        }
    } catch (err) {
        alertBox.className = "admin-alert-banner admin-alert-danger";
        alertBox.textContent = "Network error creating user.";
        alertBox.style.display = "flex";
    }
});

// Change password handler
document.getElementById("changePasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("changeNewPassword").value;
    const alertBox = document.getElementById("changePasswordAlert");
    alertBox.style.display = "none";

    try {
        const res = await fetch("/api/admin/users/password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            alertBox.className = "admin-alert-banner admin-alert-success";
            alertBox.textContent = "Password updated securely!";
            alertBox.style.display = "flex";
            document.getElementById("changePasswordForm").reset();
        } else {
            alertBox.className = "admin-alert-banner admin-alert-danger";
            alertBox.textContent = data.error || "Failed to update password.";
            alertBox.style.display = "flex";
        }
    } catch (err) {
        alertBox.className = "admin-alert-banner admin-alert-danger";
        alertBox.textContent = "Network error changing password.";
        alertBox.style.display = "flex";
    }
});

// ==========================================================
// 11. AUDIT LOGS
// ==========================================================

async function loadActivityLogs() {
    try {
        const res = await fetch("/api/admin/logs");
        if (!res.ok) return;
        const data = await res.json();
        const logs = data.logs || [];
        const tbody = document.getElementById("logsTableBody");
        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--admin-text-muted);">No activity logs recorded yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td style="font-size: 12px; color: var(--admin-text-muted); white-space: nowrap;">${escapeHtml(l.timestamp)}</td>
                <td><strong>${escapeHtml(l.user_email)}</strong></td>
                <td><span class="badge-tag" style="background: #f1f5f9; color: #334155; font-size: 11px;">${escapeHtml(l.action)}</span></td>
                <td style="font-size: 13px;">${escapeHtml(l.details || "-")}</td>
            </tr>
        `).join("");
    } catch (e) {
        console.warn("Could not load activity logs", e);
    }
}

// Utilities
function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    const el = document.createElement("div");
    el.textContent = String(value);
    return el.innerHTML;
}

