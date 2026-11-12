// Auto-unregister any service workers & clear PWA cache on mobile and desktop
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (var i = 0; i < registrations.length; i++) {
            registrations[i].unregister();
        }
    });
}
if (typeof caches !== 'undefined') {
    caches.keys().then(function(keys) {
        keys.forEach(function(key) { caches.delete(key); });
    });
}

const searchBox = document.getElementById("searchBox");
const searchResults = document.getElementById("searchResults");
const paperTotal = document.getElementById("paperTotal");
const clearSearch = document.getElementById("clearSearch");
const mobileToggle = document.getElementById("mobileToggle");
const navMenu = document.getElementById("navMenu");
const backToTopBtn = document.getElementById("backToTop");
const heroSearchToggle = document.getElementById("heroSearchToggle");
const heroSearchContainer = document.getElementById("search");

let searchTimeout = null;
let activeBranchFilter = "";

function setHeroSearchOpen(open, focusInput = false) {
    if (!heroSearchContainer) return;
    heroSearchContainer.hidden = !open;
    const hero = document.querySelector(".premium-home-hero");
    if (hero) hero.classList.toggle("search-active", open);
    const strip = document.getElementById("heroInformation");
    if (strip) {
        strip.classList.toggle("is-search-hidden", open);
        if (open) {
            strip.style.setProperty("display", "none", "important");
        } else {
            strip.style.removeProperty("display");
        }
    }
    const heroActions = document.getElementById("heroActions");
    if (heroActions) {
        if (open) {
            heroActions.style.setProperty("display", "none", "important");
        } else {
            heroActions.style.removeProperty("display");
        }
    }
    if (heroSearchToggle) {
        heroSearchToggle.setAttribute("aria-expanded", String(open));
    }
    if (open) {
        if (focusInput && searchBox) {
            window.requestAnimationFrame(function () { searchBox.focus(); });
        }
    } else {
        if (searchResults) {
            searchResults.classList.remove("active");
            searchResults.innerHTML = "";
        }
        if (searchBox) searchBox.value = "";
        if (clearSearch) clearSearch.hidden = true;
    }
}
window.setHeroSearchOpen = setHeroSearchOpen;

if (heroSearchToggle) {
    heroSearchToggle.addEventListener("click", function () {
        setHeroSearchOpen(heroSearchContainer ? heroSearchContainer.hidden : true, true);
    });
}

const closeHeroSearchBtn = document.getElementById("closeHeroSearchBtn");
if (closeHeroSearchBtn) {
    closeHeroSearchBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        setHeroSearchOpen(false);
    });
}

document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        if (heroSearchContainer && !heroSearchContainer.hidden) {
            setHeroSearchOpen(false);
        }
    }
});

function openSearchFromHash() {
    if (window.location.hash === "#search") {
        setHeroSearchOpen(true, false);
    }
}

window.addEventListener("hashchange", openSearchFromHash);
openSearchFromHash();

window.toggleNightMode = function () {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nextTheme);
    try {
        localStorage.setItem("mce-theme", nextTheme);
        localStorage.setItem("mce_theme", nextTheme);
    } catch (e) {}
    const button = document.getElementById("themeToggleBtn");
    if (button) {
        button.classList.toggle("dark-active", nextTheme === "dark");
        const label = button.querySelector("span");
        if (label) label.textContent = nextTheme === "dark" ? "Day Mode" : "Night Mode";
        button.setAttribute("aria-pressed", String(nextTheme === "dark"));
        const svg = button.querySelector("svg");
        if (svg) {
            svg.innerHTML = nextTheme === "dark"
                ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }
};

(function restoreThemePreference() {
    let savedTheme = "dark";
    try {
        savedTheme = localStorage.getItem("mce-theme") || localStorage.getItem("mce_theme") || "dark";
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", savedTheme);
    const button = document.getElementById("themeToggleBtn");
    if (button) {
        button.classList.toggle("dark-active", savedTheme === "dark");
        const label = button.querySelector("span");
        if (label) label.textContent = savedTheme === "dark" ? "Day Mode" : "Night Mode";
        button.setAttribute("aria-pressed", String(savedTheme === "dark"));
        const svg = button.querySelector("svg");
        if (svg) {
            svg.innerHTML = savedTheme === "dark"
                ? '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>'
                : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
        }
    }
})();

(function initializePremiumHeroMotion() {
    const hero = document.querySelector(".premium-home-hero");
    const strip = hero ? hero.querySelector(".premium-information-strip") : null;
    const artwork = hero ? hero.querySelector(".premium-hero-artwork") : null;
    if (!hero || !strip || !artwork) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let heroVisible = true;
    let heroRect = null;
    let pointerFrame = 0;
    let pendingX = 0;
    let pendingY = 0;

    if (reducedMotion.matches) {
        strip.classList.add("is-revealed");
        return;
    }

    hero.classList.add("motion-ready");
    window.requestAnimationFrame(function () {
        hero.classList.add("motion-entered");
    });

    const visibilityObserver = new IntersectionObserver(function (entries) {
        heroVisible = Boolean(entries[0] && entries[0].isIntersecting) && !document.hidden;
        hero.classList.toggle("hero-motion-active", heroVisible);
        if (!heroVisible) scheduleParallax(0, 0);
    }, { rootMargin: "0px", threshold: 0.01 });
    visibilityObserver.observe(hero);

    const stripObserver = new IntersectionObserver(function (entries, observer) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) {
            strip.classList.add("is-revealed");
            observer.unobserve(strip);
        }
    }, { threshold: 0.25 });
    stripObserver.observe(strip);

    function scheduleParallax(x, y) {
        pendingX = x;
        pendingY = y;
        if (pointerFrame) return;
        pointerFrame = window.requestAnimationFrame(function () {
            hero.style.setProperty("--hero-parallax-x", pendingX.toFixed(2) + "px");
            hero.style.setProperty("--hero-parallax-y", pendingY.toFixed(2) + "px");
            artwork.style.transform = "translate3d(" + pendingX.toFixed(2) + "px," + pendingY.toFixed(2) + "px,0)";
            pointerFrame = 0;
        });
    }

    if (finePointer.matches) {
        hero.addEventListener("pointerenter", function () {
            heroRect = hero.getBoundingClientRect();
        }, { passive: true });
        hero.addEventListener("pointermove", function (event) {
            if (!heroVisible) return;
            if (!heroRect) heroRect = hero.getBoundingClientRect();
            const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - heroRect.left) / heroRect.width - .5) * 2));
            const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - heroRect.top) / heroRect.height - .5) * 2));
            scheduleParallax(normalizedX * 8, normalizedY * 6);
        }, { passive: true });
        hero.addEventListener("pointerleave", function () {
            heroRect = null;
            scheduleParallax(0, 0);
        }, { passive: true });
        window.addEventListener("resize", function () { heroRect = null; }, { passive: true });
    }

    document.addEventListener("visibilitychange", function () {
        heroVisible = !document.hidden && hero.getBoundingClientRect().bottom > 0;
        hero.classList.toggle("hero-motion-active", heroVisible);
        if (!heroVisible) scheduleParallax(0, 0);
    });
})();

// Mobile menu toggle
if (mobileToggle && navMenu) {
    mobileToggle.addEventListener("click", () => {
        const isOpen = navMenu.classList.toggle("open");
        mobileToggle.setAttribute("aria-expanded", String(isOpen));
    });

    // Close menu when clicking nav links
    document.querySelectorAll(".nav-link").forEach((link) => {
        link.addEventListener("click", () => {
            navMenu.classList.remove("open");
            mobileToggle.setAttribute("aria-expanded", "false");
        });
    });
}

// Global keyboard shortcut ('/' or 'Ctrl+K' to focus search)
document.addEventListener("keydown", (event) => {
    if ((event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k")) && document.activeElement !== searchBox) {
        if (searchBox) {
            event.preventDefault();
            setHeroSearchOpen(true, false);
            searchBox.focus();
            searchBox.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }
});

// Floating Back to Top Button scroll listener
if (backToTopBtn) {
    window.addEventListener("scroll", () => {
        if (window.scrollY > 400) {
            backToTopBtn.classList.add("visible");
        } else {
            backToTopBtn.classList.remove("visible");
        }
    });

    backToTopBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
}

// Branch Filter Tabs inside Search Section
document.querySelectorAll(".branch-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".branch-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        activeBranchFilter = tab.dataset.branchFilter || "";
        const query = searchBox ? searchBox.value.trim() : "";
        searchPapers(query, activeBranchFilter);
    });
});

// Animated Counter function
function animateCounter(element, target, duration = 1200) {
    if (!element) return;
    let startTime = null;
    const startValue = 0;
    
    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(startValue + easeOut * (target - startValue));
        element.textContent = `${current}+`;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            element.textContent = `${target}+`;
        }
    }
    window.requestAnimationFrame(step);
}

async function loadHomepageStats() {
    if (!paperTotal) return;
    try {
        const response = await fetch("/api/papers");
        if (!response.ok) throw new Error("Unable to load stats");
        const papers = await response.json();
        animateCounter(paperTotal, papers.length);
    } catch (error) {
        paperTotal.textContent = "230+";
    }
}

async function loadBranchCounts() {
    const countElements = document.querySelectorAll("[data-branch-count]");
    await Promise.all([...countElements].map(async (element) => {
        try {
            const branch = element.dataset.branchCount;
            const response = await fetch(`/api/papers?branch=${encodeURIComponent(branch)}`);
            if (!response.ok) throw new Error("Unable to load branch count");
            const papers = await response.json();
            element.innerHTML = `<span class="count-pulse"></span> ${papers.length} papers available`;
        } catch (error) {
            element.innerHTML = `<span class="count-pulse"></span> Explore archive`;
        }
    }));
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value || "";
    return element.innerHTML;
}

async function searchPapers(searchText, branchFilter = activeBranchFilter) {
    if (clearSearch) {
        clearSearch.hidden = searchText === "";
    }
    
    // If both empty, clear results and hide dropdown
    if (searchText === "" && branchFilter === "") {
        searchResults.innerHTML = "";
        searchResults.classList.remove("active");
        const strip = document.getElementById("heroInformation");
        if (strip && (!heroSearchContainer || heroSearchContainer.hidden)) {
            strip.classList.remove("is-search-hidden");
            strip.style.removeProperty("display");
        }
        return;
    }

    if (heroSearchContainer && heroSearchContainer.hidden) {
        setHeroSearchOpen(true, false);
    }
    const hero = document.querySelector(".premium-home-hero");
    if (hero) hero.classList.add("search-active");
    const strip = document.getElementById("heroInformation");
    if (strip) {
        strip.classList.add("is-search-hidden");
        strip.style.setProperty("display", "none", "important");
    }
    const heroActions = document.getElementById("heroActions");
    if (heroActions) heroActions.style.setProperty("display", "none", "important");

    searchResults.classList.add("active");
    searchResults.innerHTML = `
        <div class="search-status-box">
            <div class="search-spinner"></div>
            <div>
                <div class="search-status-title">Searching repository...</div>
                <div class="search-status-sub">Looking up question papers by subject, subject code, or branch</div>
            </div>
        </div>
    `;

    try {
        let url = "/api/papers?";
        const params = [];
        if (searchText) params.push(`q=${encodeURIComponent(searchText)}`);
        if (branchFilter) params.push(`branch=${encodeURIComponent(branchFilter)}`);
        url += params.join("&");

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error("Search request failed");
        }

        const results = await response.json();
        searchResults.innerHTML = "";

        if (results.length === 0) {
            searchResults.innerHTML = `
                <div class="search-empty-state">
                    <div class="search-empty-icon">🔍</div>
                    <div class="search-empty-title">No question papers found</div>
                    <p class="search-empty-text">No question papers matching "<strong>${escapeHtml(searchText)}</strong>" were found.</p>
                    <div class="search-empty-tips">
                        💡 <strong>Helpful Tips:</strong><br>
                        • Search by subject code (e.g., <code>21EC503</code>, <code>21MAT11</code>)<br>
                        • Search by subject name (e.g., <code>Digital Communication</code>, <code>Mathematics</code>)<br>
                        • Search by semester or department (e.g., <code>5th Sem</code>, <code>ECE</code>, <code>CSE</code>)
                    </div>
                </div>
            `;
            return;
        }

        // Header with count & close button
        const headerEl = document.createElement("div");
        headerEl.className = "search-results-header";
        headerEl.innerHTML = `
            <div class="search-results-count">
                <span class="search-results-count-icon">📄</span>
                <span>Found <strong>${results.length}</strong> question paper${results.length === 1 ? "" : "s"}${searchText ? ` matching "<em>${escapeHtml(searchText)}</em>"` : ""}</span>
            </div>
            <button type="button" class="search-results-close-btn" id="closeSearchResultsBtn" title="Close search results">
                <span>Close</span> ✕
            </button>
        `;
        searchResults.appendChild(headerEl);

        const closeBtn = headerEl.querySelector("#closeSearchResultsBtn");
        if (closeBtn) {
            closeBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                setHeroSearchOpen(false);
            });
        }

        const listContainer = document.createElement("div");
        listContainer.className = "search-cards-list";

        results.forEach(function (paper) {
            const resultCard = document.createElement("div");
            resultCard.className = "result-card-v2";
            
            const rawFile = paper.file || "";
            const fileUrl = rawFile.startsWith("/") ? rawFile : "/" + rawFile;
            
            resultCard.innerHTML = `
                <div class="result-info">
                    <div class="result-header-row">
                        <h3 class="result-title">${escapeHtml(paper.title || paper.subject || "Question Paper")}</h3>
                        ${paper.subject_code ? `
                            <span class="badge-code" title="Subject Code: ${escapeHtml(paper.subject_code)}">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="16 18 22 12 16 6"></polyline>
                                    <polyline points="8 6 2 12 8 18"></polyline>
                                </svg>
                                ${escapeHtml(paper.subject_code)}
                            </span>
                        ` : ""}
                    </div>
                    ${paper.subject && paper.subject.toLowerCase() !== (paper.title || "").toLowerCase() ? `
                        <div class="result-subject-line">
                            <span class="result-subject-label">Subject:</span>
                            <span class="result-subject-val">${escapeHtml(paper.subject)}</span>
                        </div>
                    ` : ""}
                    <div class="result-meta">
                        <span class="badge-branch">🏛️ ${escapeHtml(paper.branch)}</span>
                        <span class="badge-sem">🎓 ${escapeHtml(paper.semester)}</span>
                        <span class="badge-year">📅 ${paper.year}</span>
                        ${paper.cie_number ? `<span class="badge-cie">📝 ${escapeHtml(paper.cie_number)}</span>` : ""}
                        ${paper.exam_type && !paper.cie_number ? `<span class="badge-exam">📜 ${escapeHtml(paper.exam_type)}</span>` : ""}
                    </div>
                </div>
                <div class="result-actions">
                    <a class="result-btn-pdf" href="${encodeURI(fileUrl)}" target="_blank" rel="noopener">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <span>View PDF</span>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
            `;
            listContainer.appendChild(resultCard);
        });

        searchResults.appendChild(listContainer);
    } catch (error) {
        searchResults.innerHTML = `
            <div class="search-error-state">
                <div class="search-error-title">Search service temporarily unavailable</div>
                <p class="search-error-sub">Please ensure the server is running or try again shortly.</p>
            </div>
        `;
    }
}

const homeSearchBtn = document.getElementById("homeSearchBtn");

function handleSearchSubmit() {
    const rawText = searchBox ? searchBox.value.trim() : "";
    const text = rawText.toLowerCase();
    if (!text) {
        if (searchBox) searchBox.focus();
        return;
    }

    // Smart branch redirects
    if (text === "cse" || text === "computer science" || text.includes("computer science & engineering")) {
        window.location.href = "cse.html";
        return;
    }
    if (text === "aiml" || text === "ai" || text === "ml" || text.includes("artificial") || text.includes("ai & ml") || text.includes("ai&ml") || text.includes("machine learning")) {
        window.location.href = "cse-aiml.html";
        return;
    }
    if (text === "csbs" || text.includes("business systems")) {
        window.location.href = "csbs.html";
        return;
    }
    if (text === "ece" || text.includes("electronics & comm") || text.includes("electronics and comm") || text.includes("communication")) {
        window.location.href = "ece.html";
        return;
    }
    if (text === "eee" || text.includes("electrical")) {
        window.location.href = "eee.html";
        return;
    }
    if (text === "mech" || text.includes("mechanical")) {
        window.location.href = "mechanical.html";
        return;
    }
    if (text === "civil") {
        window.location.href = "civil.html";
        return;
    }
    if (text === "first year" || text === "1st year" || text === "phy cycle" || text === "chem cycle") {
        window.location.href = "first-year.html";
        return;
    }

    searchPapers(rawText, activeBranchFilter);
    if (searchResults) {
        searchResults.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
}

if (homeSearchBtn) {
    homeSearchBtn.addEventListener("click", handleSearchSubmit);
}

if (searchBox) {
    searchBox.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSearchSubmit();
        }
    });
}

if (searchBox) {
    searchBox.addEventListener("input", function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchPapers(searchBox.value.trim(), activeBranchFilter);
        }, 180);
    });

    searchBox.addEventListener("focus", function () {
        if (searchBox.value.trim() && searchResults && searchResults.children.length > 0) {
            searchResults.classList.add("active");
        }
    });
}

if (clearSearch) {
    clearSearch.addEventListener("click", function () {
        if (searchBox) {
            searchBox.value = "";
            searchPapers("", activeBranchFilter);
            searchBox.focus();
        }
    });
}

// Close search results dropdown and search bar if clicking outside
document.addEventListener("click", function (event) {
    const searchContainer = document.querySelector(".home-search-container");
    const toggleBtn = document.getElementById("heroSearchToggle");
    if (searchContainer && !searchContainer.contains(event.target)) {
        if (searchResults) {
            searchResults.classList.remove("active");
        }
        if (heroSearchContainer && !heroSearchContainer.hidden && (!toggleBtn || !toggleBtn.contains(event.target))) {
            setHeroSearchOpen(false);
        }
    }
});

// Quick search tags & Semester pills
document.querySelectorAll("[data-search]").forEach(function (shortcut) {
    shortcut.addEventListener("click", function () {
        if (searchBox) {
            setHeroSearchOpen(true, false);
            searchBox.value = shortcut.dataset.search;
            searchPapers(searchBox.value, activeBranchFilter);
            searchBox.scrollIntoView({ behavior: "smooth", block: "center" });
            searchBox.focus();
        }
    });
});

// =========================================
// COMMUNITY CONTRIBUTION MODAL
// =========================================

function openContributeModal() {
    const modal = document.getElementById("contributeModal");
    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
        const form = document.getElementById("contributeForm");
        if (form) form.reset();
        const alert = document.getElementById("contribAlert");
        if (alert) alert.style.display = "none";
        const dropzoneText = document.getElementById("dropzoneFilename");
        if (dropzoneText) {
            dropzoneText.innerHTML = "<strong>Click to select file</strong> or drag and drop";
        }
    }
}

function closeContributeModal() {
    const modal = document.getElementById("contributeModal");
    if (modal) {
        modal.style.display = "none";
        document.body.style.overflow = "auto";
    }
}

function handleContribFileSelect(input) {
    const dropzoneText = document.getElementById("dropzoneFilename");
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
        dropzoneText.innerHTML = `<strong>Selected:</strong> ${file.name} <span style="color: #38bdf8; font-size: 11px;">(${sizeMb} MB)</span>`;
    }
}

async function handleContributeSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const alertBox = document.getElementById("contribAlert");
    const submitBtn = document.getElementById("contribSubmitBtn");
    
    const formData = new FormData(form);
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Submitting...</span>`;
    }
    
    try {
        const response = await fetch("/api/contribute", {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alertBox.className = "contrib-alert contrib-alert-success";
            alertBox.innerHTML = `
                <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px;">🎉 Submission Received!</div>
                <div>${data.message || "Thank you! Your paper is now under admin review and will be published once verified."}</div>
            `;
            alertBox.style.display = "block";
            form.reset();
            const dropzoneText = document.getElementById("dropzoneFilename");
            if (dropzoneText) {
                dropzoneText.innerHTML = "<strong>Click to select file</strong> or drag and drop";
            }
            setTimeout(() => {
                closeContributeModal();
            }, 3500);
        } else {
            alertBox.className = "contrib-alert contrib-alert-error";
            alertBox.textContent = data.error || "Could not submit question paper. Please check the fields.";
            alertBox.style.display = "block";
        }
    } catch (err) {
        alertBox.className = "contrib-alert contrib-alert-error";
        alertBox.textContent = "Network error. Please make sure the server is running.";
        alertBox.style.display = "block";
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <span>Submit for Verification</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
            `;
        }
    }
}

window.addEventListener("click", (e) => {
    const modal = document.getElementById("contributeModal");
    if (e.target === modal) {
        closeContributeModal();
    }
});

loadHomepageStats();
loadBranchCounts();
