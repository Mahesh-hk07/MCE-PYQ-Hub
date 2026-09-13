const browser = document.querySelector("[data-branch]");
const branch = browser ? browser.dataset.branch : "";
const semesterFilter = document.getElementById("semesterFilter");
const subjectFilter = document.getElementById("subjectFilter");
const paperSearch = document.getElementById("paperSearch");
const paperResults = document.getElementById("paperResults");
const paperCount = document.getElementById("paperCount");

let papers = [];
const semesterOrder = (branch === "First Year")
    ? [
        "1st Semester",
        "2nd Semester"
    ]
    : [
        "1st Semester",
        "2nd Semester",
        "3rd Semester",
        "4th Semester",
        "5th Semester",
        "6th Semester",
        "7th Semester",
        "8th Semester"
    ];

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

function getSubjectIcon(name) {
    const lower = (name || "").toLowerCase();
    if (lower.includes("math")) return "📐";
    if (lower.includes("physic")) return "⚛️";
    if (lower.includes("chem")) return "🧪";
    if (lower.includes("ai") || lower.includes("artificial") || lower.includes("machine learning") || lower.includes("neural") || lower.includes("deep") || lower.includes("python")) return "🤖";
    if (lower.includes("business") || lower.includes("econom") || lower.includes("financ") || lower.includes("market")) return "📊";
    if (lower.includes("graphic") || lower.includes("draw")) return "✏️";
    if (lower.includes("program") || lower.includes("code") || lower.includes("data") || lower.includes("software")) return "💻";
    if (lower.includes("electric") || lower.includes("circuit") || lower.includes("power")) return "⚡";
    if (lower.includes("vlsi") || lower.includes("electron") || lower.includes("signal") || lower.includes("comm")) return "📡";
    if (lower.includes("mechanic") || lower.includes("thermo") || lower.includes("machine")) return "⚙️";
    if (lower.includes("civil") || lower.includes("survey") || lower.includes("struct")) return "🏗️";
    return "📚";
}

function loadSemesterOptions() {
    if (!semesterFilter) return;
    semesterFilter.insertAdjacentHTML(
        "beforeend",
        semesterOrder.map((semester) => `<option value="${escapeHtml(semester)}">${escapeHtml(semester)}</option>`).join("")
    );
}

function updateSubjects() {
    if (!subjectFilter) return;
    const semester = semesterFilter ? semesterFilter.value : "";
    const subjects = [...new Set(
        papers
            .filter((paper) => !semester || paper.semester === semester)
            .map((paper) => paper.subject)
    )].sort();

    subjectFilter.innerHTML = '<option value="">All Subjects</option>';
    subjects.forEach((subject) => {
        subjectFilter.insertAdjacentHTML(
            "beforeend",
            `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`
        );
    });
}

function updatePillState() {
    const currentSem = semesterFilter ? semesterFilter.value : "";
    document.querySelectorAll(".sem-pill").forEach((pill) => {
        if (pill.dataset.sem === currentSem) {
            pill.classList.add("active");
        } else {
            pill.classList.remove("active");
        }
    });
}

function renderPapers() {
    if (!paperResults) return;
    const semester = semesterFilter ? semesterFilter.value : "";
    const subject = subjectFilter ? subjectFilter.value : "";
    const search = paperSearch ? paperSearch.value.trim().toLowerCase() : "";
    const visiblePapers = papers.filter((paper) => {
        const matchesFilters =
            (!semester || paper.semester === semester) &&
            (!subject || paper.subject === subject);
        const searchableText = `${paper.title} ${paper.subject} ${paper.year}`.toLowerCase();
        return matchesFilters && (!search || searchableText.includes(search));
    });

    if (paperCount) {
        paperCount.textContent = `${visiblePapers.length} paper${visiblePapers.length === 1 ? "" : "s"} available`;
    }

    if (visiblePapers.length === 0 && (search || subject || semester)) {
        paperResults.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <h3>No question papers found</h3>
                <p>Try clearing your search query or selecting another semester or subject.</p>
                <button class="reset-filter-btn" onclick="resetFilters()">Reset all filters</button>
            </div>
        `;
        return;
    }

    const semesters = semester
        ? [semester]
        : semesterOrder;

    paperResults.innerHTML = semesters.map((semesterName) => {
        const semesterPapers = visiblePapers.filter((paper) => paper.semester === semesterName);
        const subjects = [...new Set(semesterPapers.map((paper) => paper.subject))].sort();
        const hasPapers = semesterPapers.length > 0;
        const isSemOpen = Boolean(semester) || (Boolean(search) && semesterPapers.length > 0) || Boolean(subject);

        return `
            <details class="semester-group ${hasPapers ? "has-papers" : "is-empty"}"${isSemOpen ? " open" : ""}>
                <summary class="semester-heading">
                    <div class="heading-left">
                        <span class="heading-arrow">▸</span>
                        <div class="semester-badge-icon">🎓</div>
                        <span class="semester-title">${escapeHtml(semesterName)}</span>
                    </div>
                    <span class="group-count ${hasPapers ? "count-active" : "count-zero"}">${semesterPapers.length} paper${semesterPapers.length === 1 ? "" : "s"}</span>
                </summary>
                ${subjects.length === 0 ? `
                    <div class="semester-empty">
                        <span class="empty-badge">⏳ Coming Soon</span>
                        <p>Question papers for this semester will be uploaded shortly by the department library.</p>
                    </div>
                ` : `<div class="subject-groups">
                    ${subjects.map((subjName) => {
                        const subjectPapers = semesterPapers.filter((paper) => paper.subject === subjName);
                        const years = [...new Set(subjectPapers.map((paper) => paper.year))].sort((first, second) => second - first);
                        const isSubjOpen = Boolean(subject) || (Boolean(search) && subjName.toLowerCase().includes(search));
                        const icon = getSubjectIcon(subjName);

                        return `
                            <details class="subject-group"${isSubjOpen ? " open" : ""}>
                                <summary class="subject-heading">
                                    <div class="heading-left">
                                        <span class="heading-arrow">▸</span>
                                        <div class="subject-badge-icon">${icon}</div>
                                        <span class="subject-title">${escapeHtml(subjName)}</span>
                                    </div>
                                    <span class="group-count count-active">${subjectPapers.length} paper${subjectPapers.length === 1 ? "" : "s"}</span>
                                </summary>
                                <div class="year-groups">
                                    ${years.map((year) => `
                                        <section class="year-group">
                                            <div class="year-heading-wrap">
                                                <h5 class="year-heading">📅 Examination Year ${year}</h5>
                                            </div>
                                            <div class="year-papers">
                                                ${subjectPapers.filter((paper) => paper.year === year).map((paper) => `
                                                    <article class="paper-card">
                                                        <div class="paper-icon">
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                                                <polyline points="14 2 14 8 20 8"></polyline>
                                                            </svg>
                                                            <span>PDF</span>
                                                        </div>
                                                        <div class="paper-details">
                                                            <h3>${escapeHtml(paper.title)}</h3>
                                                            <div class="paper-meta">
                                                                <span class="meta-pill meta-subject">${icon} ${escapeHtml(paper.subject)}</span>
                                                                <span class="meta-pill meta-sem">🎓 ${escapeHtml(paper.semester)}</span>
                                                                <span class="meta-pill meta-year">📅 ${paper.year}</span>
                                                            </div>
                                                        </div>
                                                        <div class="paper-actions">
                                                            <a class="paper-button" href="${encodeURI(paper.file)}" target="_blank" rel="noopener">
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                                    <circle cx="12" cy="12" r="3"></circle>
                                                                </svg>
                                                                <span>View</span>
                                                            </a>
                                                            <a class="paper-button paper-button-secondary" href="${encodeURI(paper.file)}" download>
                                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                                                    <polyline points="7 10 12 15 17 10"></polyline>
                                                                    <line x1="12" y1="15" x2="12" y2="3"></line>
                                                                </svg>
                                                                <span>Download</span>
                                                            </a>
                                                        </div>
                                                    </article>
                                                `).join("")}
                                            </div>
                                        </section>
                                    `).join("")}
                                </div>
                            </details>
                        `;
                    }).join("")}
                </div>`}
            </details>
        `;
    }).join("");
}

function resetFilters() {
    if (semesterFilter) semesterFilter.value = "";
    if (subjectFilter) subjectFilter.value = "";
    if (paperSearch) paperSearch.value = "";
    updatePillState();
    updateSubjects();
    renderPapers();
}

async function loadBranchPapers() {
    if (!paperResults) return;
    paperResults.innerHTML = '<p class="empty-state">Loading question papers...</p>';
    try {
        const response = await fetch(`/api/papers?branch=${encodeURIComponent(branch)}`);
        if (!response.ok) {
            throw new Error("Unable to load papers");
        }
        papers = await response.json();
        updateSubjects();
        renderPapers();
    } catch (error) {
        paperResults.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Unable to load question papers</h3><p>Ensure the server is running on localhost:8000.</p></div>';
        if (paperCount) paperCount.textContent = "Unavailable";
    }
}

// Bind Semester Filter Pills
document.querySelectorAll(".sem-pill").forEach((pill) => {
    if (pill.classList.contains("study-companion-trigger-pill")) return;
    pill.addEventListener("click", () => {
        if (semesterFilter) {
            semesterFilter.value = pill.dataset.sem !== undefined ? pill.dataset.sem : "";
            updatePillState();
            updateSubjects();
            renderPapers();
        }
    });
});

if (semesterFilter) {
    semesterFilter.addEventListener("change", () => {
        if (subjectFilter) subjectFilter.value = "";
        updatePillState();
        updateSubjects();
        renderPapers();
    });
}

if (subjectFilter) {
    subjectFilter.addEventListener("change", renderPapers);
}

if (paperSearch) {
    paperSearch.addEventListener("input", renderPapers);
}

loadSemesterOptions();
loadBranchPapers();