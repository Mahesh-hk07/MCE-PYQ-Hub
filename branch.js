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
    semesterFilter.innerHTML = '<option value="">All Semesters</option>' +
        semesterOrder.map((semester) => `<option value="${escapeHtml(semester)}">${escapeHtml(semester)}</option>`).join("");
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

function getAcademicState() {
    const hash = window.location.hash || "";
    if (!hash.startsWith("#/academic")) {
        return { sem: "", type: "", cie: "", year: "" };
    }
    const queryPart = hash.includes("?") ? hash.substring(hash.indexOf("?") + 1) : "";
    const params = new URLSearchParams(queryPart);
    return {
        sem: params.get("sem") || "",
        type: params.get("type") || "",
        cie: params.get("cie") || "",
        year: params.get("year") || ""
    };
}

function setAcademicState(state, replace = false) {
    const params = new URLSearchParams();
    if (state.sem) params.set("sem", state.sem);
    if (state.type) params.set("type", state.type);
    if (state.cie) params.set("cie", state.cie);
    if (state.year) params.set("year", state.year);
    const queryString = params.toString();
    const newHash = queryString ? `#/academic?${queryString}` : `#/academic`;
    if (replace) {
        history.replaceState(null, "", newHash);
        renderPapers();
    } else {
        if (window.location.hash === newHash) {
            renderPapers();
        } else {
            window.location.hash = newHash;
        }
    }
}

function updatePillState(activeSem) {
    const currentSem = activeSem !== undefined ? activeSem : (semesterFilter ? semesterFilter.value : "");
    document.querySelectorAll(".sem-pill").forEach((pill) => {
        if (pill.dataset.sem === currentSem || (!currentSem && pill.dataset.sem === "")) {
            pill.classList.add("active");
        } else {
            pill.classList.remove("active");
        }
    });
    if (semesterFilter && semesterFilter.value !== currentSem) {
        semesterFilter.value = currentSem || "";
    }
}

function renderLegacyArchiveBox(legacyPapers, title = "Legacy / Earlier Scheme Archive") {
    if (!legacyPapers || !legacyPapers.length) return "";
    return `
        <details class="legacy-archive-box">
            <summary class="legacy-archive-header">
                <div class="legacy-archive-title">
                    <span>📦</span>
                    <span>${escapeHtml(title)}</span>
                    <span style="font-size: 12px; background: #e2e8f0; color: #475569; padding: 2px 8px; border-radius: 12px; font-weight: 600;">${legacyPapers.length} paper${legacyPapers.length === 1 ? "" : "s"}</span>
                </div>
                <span style="font-size: 12px; color: #64748b;">Click to Expand ▾</span>
            </summary>
            <div class="legacy-archive-desc">
                The following question papers belong to earlier autonomous or VTU schemes. They remain fully accessible.
            </div>
            <div class="legacy-archive-body">
                ${legacyPapers.map(p => `
                    <div class="academic-paper-row" style="margin-bottom: 8px;">
                        <div class="academic-paper-info">
                            <div class="academic-paper-title">${escapeHtml(p.title || p.subject)}</div>
                            <div class="academic-paper-tags">
                                <span>🎓 ${escapeHtml(p.semester || "Unassigned")}</span>
                                <span>📅 ${p.year || "Archive"}</span>
                                <span>🏛️ ${escapeHtml(p.exam_type || "Autonomous SEE")}</span>
                            </div>
                        </div>
                        <div class="academic-paper-actions">
                            <a class="btn-paper-action btn-paper-view" href="/${encodeURI(p.file)}" target="_blank" rel="noopener">Preview</a>
                            <a class="btn-paper-action btn-paper-download" href="/${encodeURI(p.file)}" download>Download</a>
                        </div>
                    </div>
                `).join("")}
            </div>
        </details>
    `;
}

function renderSemesterSelection() {
    const semCardsHtml = semesterOrder.map(semName => {
        const count = papers.filter(p => p.semester === semName).length;
        return `
            <div class="academic-card" role="button" tabindex="0" onclick="setAcademicState({ sem: '${escapeHtml(semName)}' })">
                <div class="academic-card-icon-wrap">🎓</div>
                <div class="academic-card-title">${escapeHtml(semName)}</div>
                <div class="academic-card-subtitle">Autonomous Academic Curriculum</div>
                <div class="academic-card-footer">
                    <span class="academic-card-count">${count} paper${count === 1 ? "" : "s"}</span>
                    <span class="academic-card-arrow">→</span>
                </div>
            </div>
        `;
    }).join("");

    const legacyPapers = papers.filter(p => !semesterOrder.includes(p.semester));
    const legacyHtml = renderLegacyArchiveBox(legacyPapers, "Uncategorized & Earlier Scheme Archive");

    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <div class="academic-breadcrumbs">
                        <a href="index.html" class="academic-crumb">Home</a>
                        <span class="academic-crumb-sep">/</span>
                        <a href="index.html#branches" class="academic-crumb">Branches</a>
                        <span class="academic-crumb-sep">/</span>
                        <span class="academic-crumb current">${escapeHtml(branch)}</span>
                    </div>
                    <h2 class="academic-step-title">Select Semester</h2>
                    <p class="academic-step-desc">Choose your current autonomous academic semester to explore question papers</p>
                </div>
            </div>
            <div class="academic-step-grid">
                ${semCardsHtml}
            </div>
            ${legacyHtml}
        </div>
    `;
}

function renderExamTypeSelection(state) {
    const semPapers = papers.filter(p => p.semester === state.sem);
    const cieCount = semPapers.filter(p => p.exam_type === "CIE Examinations" || (p.exam_type && p.exam_type.toLowerCase().includes("cie"))).length;
    const seeCount = semPapers.filter(p => p.exam_type === "Semester Examinations" || !p.exam_type || !p.exam_type.toLowerCase().includes("cie")).length;

    const legacyPapers = semPapers.filter(p => p.year && Number(p.year) < 2025);
    const legacyHtml = renderLegacyArchiveBox(legacyPapers, `Earlier Years Archive for ${escapeHtml(state.sem)} (Pre-2025)`);

    const isTwoCie = isTwoCieSemester(state.sem);
    const cieSubtitle = isTwoCie
        ? "Continuous Internal Evaluations (CIE-1, CIE-2)"
        : "Continuous Internal Evaluations (CIE-1, CIE-2, CIE-3)";

    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <div class="academic-breadcrumbs">
                        <a href="index.html" class="academic-crumb">Home</a>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({})">${escapeHtml(branch)}</button>
                        <span class="academic-crumb-sep">/</span>
                        <span class="academic-crumb current">${escapeHtml(state.sem)}</span>
                    </div>
                    <h2 class="academic-step-title">Select Examination Category</h2>
                    <p class="academic-step-desc">${escapeHtml(state.sem)} • Choose assessment structure</p>
                </div>
                <button type="button" class="academic-back-btn" onclick="setAcademicState({})">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back to Semesters</span>
                </button>
            </div>
            <div class="academic-step-grid">
                <div class="academic-card" role="button" tabindex="0" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: 'CIE Examinations' })">
                    <div class="academic-card-icon-wrap">📝</div>
                    <div class="academic-card-title">CIE Examinations</div>
                    <div class="academic-card-subtitle">${cieSubtitle}</div>
                    <div class="academic-card-footer">
                        <span class="cie-pill-badge">Internal Assessments</span>
                        <span class="academic-card-arrow">→</span>
                    </div>
                </div>
                <div class="academic-card" role="button" tabindex="0" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: 'Semester Examinations' })">
                    <div class="academic-card-icon-wrap">🏛️</div>
                    <div class="academic-card-title">Semester Examinations</div>
                    <div class="academic-card-subtitle">Autonomous Semester End Examinations (SEE)</div>
                    <div class="academic-card-footer">
                        <span class="see-pill-badge">Semester End Exam</span>
                        <span class="academic-card-arrow">→</span>
                    </div>
                </div>
            </div>
            ${legacyHtml}
        </div>
    `;
}

function isTwoCieSemester(sem) {
    if (branch === "First Year") return true;
    if (!sem) return false;
    const match = String(sem).match(/\d+/);
    if (match) {
        const num = parseInt(match[0], 10);
        return num === 1 || num === 2;
    }
    return false;
}

function renderCieNumberSelection(state) {
    const isTwoCie = isTwoCieSemester(state.sem);
    const cieOptions = isTwoCie ? ["CIE-1", "CIE-2"] : ["CIE-1", "CIE-2", "CIE-3"];
    const cardsHtml = cieOptions.map(cieNum => {
        const count = papers.filter(p =>
            p.semester === state.sem &&
            (p.cie_number === cieNum || (p.title && p.title.toLowerCase().includes(cieNum.toLowerCase())))
        ).length;
        return `
            <div class="academic-card" role="button" tabindex="0" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}', cie: '${cieNum}' })">
                <div class="academic-card-icon-wrap">📑</div>
                <div class="academic-card-title">${cieNum}</div>
                <div class="academic-card-subtitle">Continuous Internal Assessment ${cieNum.replace("CIE-", "")}</div>
                <div class="academic-card-footer">
                    <span class="academic-card-count">${count} paper${count === 1 ? "" : "s"}</span>
                    <span class="academic-card-arrow">→</span>
                </div>
            </div>
        `;
    }).join("");

    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <div class="academic-breadcrumbs">
                        <a href="index.html" class="academic-crumb">Home</a>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({})">${escapeHtml(branch)}</button>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}' })">${escapeHtml(state.sem)}</button>
                        <span class="academic-crumb-sep">/</span>
                        <span class="academic-crumb current">CIE Examinations</span>
                    </div>
                    <h2 class="academic-step-title">Select CIE Examination</h2>
                    <p class="academic-step-desc">${escapeHtml(state.sem)} • Choose specific internal evaluation test</p>
                </div>
                <button type="button" class="academic-back-btn" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}' })">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back</span>
                </button>
            </div>
            <div class="academic-step-grid">
                ${cardsHtml}
            </div>
        </div>
    `;
}

function renderYearSelection(state) {
    const years = ["2025", "2026"];
    const isCie = state.type === "CIE Examinations";
    const breadcrumbBackFn = isCie
        ? `setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}' })`
        : `setAcademicState({ sem: '${escapeHtml(state.sem)}' })`;

    const cardsHtml = years.map(yr => {
        const count = papers.filter(p => {
            if (p.semester !== state.sem) return false;
            if (String(p.year) !== String(yr)) return false;
            if (isCie) {
                return (p.exam_type === "CIE Examinations" || (p.exam_type && p.exam_type.toLowerCase().includes("cie"))) &&
                       (!state.cie || p.cie_number === state.cie || (p.title && p.title.toLowerCase().includes(state.cie.toLowerCase())));
            } else {
                return p.exam_type === "Semester Examinations" || !p.exam_type || !p.exam_type.toLowerCase().includes("cie");
            }
        }).length;

        const nextState = isCie
            ? `{ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}', cie: '${escapeHtml(state.cie)}', year: '${yr}' }`
            : `{ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}', year: '${yr}' }`;

        return `
            <div class="academic-card" role="button" tabindex="0" onclick="setAcademicState(${nextState})">
                <div class="academic-card-icon-wrap">📅</div>
                <div class="academic-card-title">${yr}</div>
                <div class="academic-card-subtitle">Academic Year ${yr === "2025" ? "2024-25 / 2025" : "2025-26 / 2026"}</div>
                <div class="academic-card-footer">
                    <span class="academic-card-count">${count} paper${count === 1 ? "" : "s"}</span>
                    <span class="academic-card-arrow">→</span>
                </div>
            </div>
        `;
    }).join("");

    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <div class="academic-breadcrumbs">
                        <a href="index.html" class="academic-crumb">Home</a>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({})">${escapeHtml(branch)}</button>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}' })">${escapeHtml(state.sem)}</button>
                        <span class="academic-crumb-sep">/</span>
                        ${isCie ? `
                            <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}' })">CIE Examinations</button>
                            <span class="academic-crumb-sep">/</span>
                            <span class="academic-crumb current">${escapeHtml(state.cie)}</span>
                        ` : `
                            <span class="academic-crumb current">Semester Examinations</span>
                        `}
                    </div>
                    <h2 class="academic-step-title">Select Academic Year</h2>
                    <p class="academic-step-desc">${escapeHtml(state.sem)} • ${isCie ? escapeHtml(state.cie) : "Semester End Examinations"} • Choose examination year</p>
                </div>
                <button type="button" class="academic-back-btn" onclick="${breadcrumbBackFn}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back</span>
                </button>
            </div>
            <div class="academic-step-grid">
                ${cardsHtml}
            </div>
        </div>
    `;
}

function renderFinalPapersView(state) {
    const isCie = state.type === "CIE Examinations";
    const backFn = isCie
        ? `setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}', cie: '${escapeHtml(state.cie)}' })`
        : `setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}' })`;

    const matchedPapers = papers.filter(p => {
        if (p.semester !== state.sem) return false;
        if (String(p.year) !== String(state.year)) return false;
        if (isCie) {
            const isCieType = p.exam_type === "CIE Examinations" || (p.exam_type && p.exam_type.toLowerCase().includes("cie"));
            if (!isCieType) return false;
            if (p.cie_number) return p.cie_number === state.cie;
            if (p.title && p.title.toLowerCase().includes(state.cie.toLowerCase())) return true;
            return true;
        } else {
            return p.exam_type === "Semester Examinations" || !p.exam_type || !p.exam_type.toLowerCase().includes("cie");
        }
    });

    const uniqueSubjects = [...new Set(matchedPapers.map(p => p.subject || "General / Core"))].sort();

    const legacyPapers = papers.filter(p => p.semester === state.sem && String(p.year) !== String(state.year));
    const legacyHtml = renderLegacyArchiveBox(legacyPapers, `Available Question Papers from Earlier Years (${escapeHtml(state.sem)})`);

    let contentHtml = "";
    if (matchedPapers.length === 0) {
        contentHtml = `
            <div class="academic-empty-state">
                <div class="academic-empty-icon">⏳</div>
                <div class="academic-empty-title">No question papers uploaded yet</div>
                <div class="academic-empty-desc">Question papers for ${escapeHtml(state.sem)} ${isCie ? escapeHtml(state.cie) + ' ' : ''}(Year ${escapeHtml(state.year)}) will be published soon by the autonomous library.</div>
                <button type="button" class="btn-paper-action btn-paper-view" style="margin-top: 18px;" onclick="openRequestModal()">📥 Request This Paper</button>
            </div>
        `;
    } else {
        contentHtml = uniqueSubjects.map(subjName => {
            const subjPapers = matchedPapers.filter(p => (p.subject || "General / Core") === subjName);
            const icon = getSubjectIcon(subjName);
            const code = subjPapers[0]?.subject_code || "";

            return `
                <div class="academic-subject-group">
                    <div class="academic-subject-header">
                        <div class="academic-subject-name">
                            <span>${icon}</span>
                            <span>${escapeHtml(subjName)}</span>
                        </div>
                        ${code ? `<span class="academic-subject-code">${escapeHtml(code)}</span>` : ""}
                    </div>
                    <div class="academic-subject-papers">
                        ${subjPapers.map(p => `
                            <div class="academic-paper-row">
                                <div class="academic-paper-info">
                                    <div class="academic-paper-title">${escapeHtml(p.title || p.subject)}</div>
                                    <div class="academic-paper-tags">
                                        <span>📅 ${p.year}</span>
                                        ${p.cie_number ? `<span class="cie-pill-badge">${escapeHtml(p.cie_number)}</span>` : ""}
                                        <span>🏛️ ${escapeHtml(p.exam_type || "Autonomous SEE")}</span>
                                    </div>
                                </div>
                                <div class="academic-paper-actions">
                                    <a class="btn-paper-action btn-paper-view" href="/${encodeURI(p.file)}" target="_blank" rel="noopener">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                        <span>View PDF</span>
                                    </a>
                                    <a class="btn-paper-action btn-paper-download" href="/${encodeURI(p.file)}" download>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                                        <span>Download</span>
                                    </a>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            `;
        }).join("");
    }

    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <div class="academic-breadcrumbs">
                        <a href="index.html" class="academic-crumb">Home</a>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({})">${escapeHtml(branch)}</button>
                        <span class="academic-crumb-sep">/</span>
                        <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}' })">${escapeHtml(state.sem)}</button>
                        <span class="academic-crumb-sep">/</span>
                        ${isCie ? `
                            <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}' })">CIE</button>
                            <span class="academic-crumb-sep">/</span>
                            <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}', cie: '${escapeHtml(state.cie)}' })">${escapeHtml(state.cie)}</button>
                        ` : `
                            <button type="button" class="academic-crumb" onclick="setAcademicState({ sem: '${escapeHtml(state.sem)}', type: '${escapeHtml(state.type)}' })">Semester Exam</button>
                        `}
                        <span class="academic-crumb-sep">/</span>
                        <span class="academic-crumb current">${escapeHtml(state.year)}</span>
                    </div>
                    <h2 class="academic-step-title">Available Question Papers</h2>
                    <p class="academic-step-desc">${escapeHtml(state.sem)} • ${isCie ? escapeHtml(state.cie) + ' • ' : ''}Year ${escapeHtml(state.year)}</p>
                </div>
                <button type="button" class="academic-back-btn" onclick="${backFn}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    <span>Back</span>
                </button>
            </div>
            ${contentHtml}
            ${legacyHtml}
        </div>
    `;
}

function renderSearchResults(searchQuery) {
    const visiblePapers = papers.filter(p => {
        const text = `${p.title} ${p.subject} ${p.subject_code || ''} ${p.semester} ${p.year} ${p.exam_type || ''} ${p.cie_number || ''}`.toLowerCase();
        return text.includes(searchQuery);
    });

    if (paperCount) {
        paperCount.textContent = `${visiblePapers.length} paper${visiblePapers.length === 1 ? "" : "s"} found`;
    }

    if (visiblePapers.length === 0) {
        paperResults.innerHTML = `
            <div class="academic-empty-state">
                <div class="academic-empty-icon">🔍</div>
                <div class="academic-empty-title">No question papers found</div>
                <div class="academic-empty-desc">No papers matching "<strong>${escapeHtml(searchQuery)}</strong>" were found in ${escapeHtml(branch)}.</div>
                <button type="button" class="btn-paper-action btn-paper-view" style="margin-top: 16px;" onclick="resetFilters()">Reset Search</button>
            </div>
        `;
        return;
    }

    const uniqueSubjects = [...new Set(visiblePapers.map(p => p.subject || "General / Core"))].sort();
    paperResults.innerHTML = `
        <div class="academic-nav-container">
            <div class="academic-nav-header">
                <div class="academic-nav-left">
                    <h2 class="academic-step-title">Search Results</h2>
                    <p class="academic-step-desc">Showing ${visiblePapers.length} question paper${visiblePapers.length === 1 ? "" : "s"} matching "${escapeHtml(searchQuery)}"</p>
                </div>
                <button type="button" class="academic-back-btn" onclick="resetFilters()">Clear Search</button>
            </div>
            ${uniqueSubjects.map(subjName => {
                const subjPapers = visiblePapers.filter(p => (p.subject || "General / Core") === subjName);
                const icon = getSubjectIcon(subjName);
                const code = subjPapers[0]?.subject_code || "";
                return `
                    <div class="academic-subject-group">
                        <div class="academic-subject-header">
                            <div class="academic-subject-name">
                                <span>${icon}</span>
                                <span>${escapeHtml(subjName)}</span>
                            </div>
                            ${code ? `<span class="academic-subject-code">${escapeHtml(code)}</span>` : ""}
                        </div>
                        <div class="academic-subject-papers">
                            ${subjPapers.map(p => `
                                <div class="academic-paper-row">
                                    <div class="academic-paper-info">
                                        <div class="academic-paper-title">${escapeHtml(p.title || p.subject)}</div>
                                        <div class="academic-paper-tags">
                                            <span>🎓 ${escapeHtml(p.semester)}</span>
                                            <span>📅 ${p.year}</span>
                                            ${p.cie_number ? `<span class="cie-pill-badge">${escapeHtml(p.cie_number)}</span>` : ""}
                                            <span>🏛️ ${escapeHtml(p.exam_type || "Autonomous SEE")}</span>
                                        </div>
                                    </div>
                                    <div class="academic-paper-actions">
                                        <a class="btn-paper-action btn-paper-view" href="/${encodeURI(p.file)}" target="_blank" rel="noopener">Preview PDF</a>
                                        <a class="btn-paper-action btn-paper-download" href="/${encodeURI(p.file)}" download>Download</a>
                                    </div>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderPapers() {
    if (!paperResults) return;
    const search = paperSearch ? paperSearch.value.trim().toLowerCase() : "";
    if (search) {
        renderSearchResults(search);
        return;
    }

    const state = getAcademicState();
    updatePillState(state.sem);

    if (paperCount) {
        paperCount.textContent = `${papers.length} paper${papers.length === 1 ? "" : "s"} available`;
    }

    if (!state.sem) {
        renderSemesterSelection();
        return;
    }

    if (!state.type) {
        renderExamTypeSelection(state);
        return;
    }

    if (state.type === "CIE Examinations") {
        if (isTwoCieSemester(state.sem) && state.cie === "CIE-3") {
            setAcademicState({ sem: state.sem, type: state.type }, true);
            return;
        }
        if (!state.cie) {
            renderCieNumberSelection(state);
            return;
        }
    }

    if (!state.year) {
        renderYearSelection(state);
        return;
    }

    renderFinalPapersView(state);
}

function resetFilters() {
    if (semesterFilter) semesterFilter.value = "";
    if (subjectFilter) subjectFilter.value = "";
    if (paperSearch) paperSearch.value = "";
    setAcademicState({});
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

// Bind URL Hash Change for Back/Forward navigation
window.addEventListener("hashchange", () => {
    renderPapers();
});

// Bind Semester Filter Pills
document.querySelectorAll(".sem-pill").forEach((pill) => {
    if (pill.classList.contains("study-companion-trigger-pill")) return;
    pill.addEventListener("click", () => {
        const sem = pill.dataset.sem !== undefined ? pill.dataset.sem : "";
        if (sem) {
            setAcademicState({ sem });
        } else {
            setAcademicState({});
        }
    });
});

if (semesterFilter) {
    semesterFilter.addEventListener("change", () => {
        const sem = semesterFilter.value;
        if (sem) {
            setAcademicState({ sem });
        } else {
            setAcademicState({});
        }
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