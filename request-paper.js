// =========================================
// MCE PYQ HUB - REQUEST A QUESTION PAPER MODULE
// =========================================

(function () {
    const defaultSemesters = [
        "1st Semester", "2nd Semester", "3rd Semester", "4th Semester",
        "5th Semester", "6th Semester", "7th Semester", "8th Semester"
    ];

    const firstYearSemesters = ["1st Semester", "2nd Semester"];

    window.onRequestBranchChange = function (branch) {
        const semSelect = document.getElementById("reqSem");
        if (!semSelect) return;

        const currentVal = semSelect.value;
        const sems = (branch === "First Year") ? firstYearSemesters : defaultSemesters;

        semSelect.innerHTML = `<option value="" disabled selected>Select Semester</option>` +
            sems.map(s => `<option value="${s}">${s}</option>`).join("");

        if (sems.includes(currentVal)) {
            semSelect.value = currentVal;
        }
    };

    window.openRequestModal = function (prefillBranch, prefillSem, prefillSubject) {
        const modal = document.getElementById("requestModal");
        if (!modal) return;

        modal.style.display = "flex";
        document.body.style.overflow = "hidden";

        const form = document.getElementById("requestForm");
        if (form) form.reset();

        const alert = document.getElementById("requestAlert");
        if (alert) alert.style.display = "none";

        // Auto-detect branch from page context if not passed
        const branchContainer = document.querySelector("[data-branch]");
        const pageBranch = prefillBranch || (branchContainer ? branchContainer.dataset.branch : "");

        const branchSelect = document.getElementById("reqBranch");
        if (branchSelect && pageBranch) {
            branchSelect.value = pageBranch;
            window.onRequestBranchChange(pageBranch);
        }

        const semSelect = document.getElementById("reqSem");
        if (semSelect && prefillSem) {
            semSelect.value = prefillSem;
        }

        const subInput = document.getElementById("reqSubject");
        if (subInput && prefillSubject) {
            subInput.value = prefillSubject;
        }
    };

    window.closeRequestModal = function () {
        const modal = document.getElementById("requestModal");
        if (modal) {
            modal.style.display = "none";
            document.body.style.overflow = "auto";
        }
    };

    window.handleRequestSubmit = async function (event) {
        event.preventDefault();
        const form = event.target;
        const alertBox = document.getElementById("requestAlert");
        const submitBtn = document.getElementById("requestSubmitBtn");

        const data = {
            student_name: (form.student_name ? form.student_name.value : "").trim(),
            branch: form.branch ? form.branch.value : "",
            semester: form.semester ? form.semester.value : "",
            subject: (form.subject ? form.subject.value : "").trim(),
            year: form.year ? form.year.value : "",
            exam_type: (form.exam_type ? form.exam_type.value : "").trim(),
            notes: (form.notes ? form.notes.value : "").trim()
        };

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span>Submitting Request...</span>`;
        }

        try {
            const response = await fetch("/api/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (alertBox) {
                alertBox.style.display = "block";
                if (response.ok) {
                    alertBox.className = "contrib-alert success";
                    alertBox.innerHTML = `
                        <strong>Request Received! 🎉</strong><br>
                        ${escapeHtml(result.message || "We will source this question paper for you soon.")}
                    `;
                    form.reset();
                    setTimeout(() => {
                        window.closeRequestModal();
                    }, 2400);
                } else {
                    alertBox.className = "contrib-alert error";
                    alertBox.innerHTML = `<strong>Submission Failed:</strong> ${escapeHtml(result.error || "Please check your details.")}`;
                }
            }
        } catch (err) {
            if (alertBox) {
                alertBox.style.display = "block";
                alertBox.className = "contrib-alert error";
                alertBox.innerHTML = `<strong>Network Error:</strong> Could not connect to the server. Please try again.`;
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `
                    <span>Submit Paper Request</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                `;
            }
        }
    };

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, function (m) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
        });
    }

    window.switchToRequestModal = function () {
        const cModal = document.getElementById("contributeModal");
        if (cModal) cModal.style.display = "none";
        window.openRequestModal();
    };

    window.switchToSubmitModal = function () {
        const rModal = document.getElementById("requestModal");
        if (rModal) rModal.style.display = "none";
        if (window.openContributeModal) {
            window.openContributeModal();
        }
    };

    // Close on backdrop click or Escape key
    document.addEventListener("click", function (e) {
        const modal = document.getElementById("requestModal");
        if (modal && e.target === modal) {
            window.closeRequestModal();
        }
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
            window.closeRequestModal();
        }
    });
})();

