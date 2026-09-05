// =========================================
// MCE NIGHT STUDY COMPANION MODULE
// =========================================

(function () {
    // 1. Theme Management (Auto-load on page start)
    const savedTheme = localStorage.getItem("mce_theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    applyTheme(savedTheme);

    window.addEventListener("DOMContentLoaded", () => {
        initThemeToggle();
        initPomodoroTimer();
        initStudyChecklist();
        initExamTips();
    });

    function applyTheme(theme) {
        if (theme === "dark") {
            document.documentElement.setAttribute("data-theme", "dark");
        } else {
            document.documentElement.removeAttribute("data-theme");
        }
        localStorage.setItem("mce_theme", theme);
        updateThemeToggleIcons(theme);
    }

    window.toggleNightMode = function () {
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const newTheme = isDark ? "light" : "dark";
        applyTheme(newTheme);
    };

    function updateThemeToggleIcons(theme) {
        document.querySelectorAll(".theme-toggle-btn").forEach(btn => {
            if (theme === "dark") {
                btn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                    <span>Day Mode</span>
                `;
                btn.classList.add("dark-active");
            } else {
                btn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                    <span>Night Mode</span>
                `;
                btn.classList.remove("dark-active");
            }
        });
    }

    function initThemeToggle() {
        const current = localStorage.getItem("mce_theme") || "light";
        updateThemeToggleIcons(current);
    }

    // =========================================
    // STUDY COMPANION DRAWER
    // =========================================
    window.toggleStudyCompanion = function () {
        const drawer = document.getElementById("studyCompanionDrawer");
        const fab = document.getElementById("studyCompanionFab");
        if (drawer) {
            const isOpen = drawer.classList.toggle("open");
            if (fab) fab.classList.toggle("active", isOpen);
        }
    };

    // =========================================
    // POMODORO FOCUS TIMER
    // =========================================
    let timerDuration = 25 * 60;
    let timeRemaining = timerDuration;
    let timerInterval = null;
    let isTimerRunning = false;

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function updateTimerDisplay() {
        const display = document.getElementById("pomodoroTimeDisplay");
        if (display) {
            display.textContent = formatTime(timeRemaining);
        }
    }

    window.setPomodoroPreset = function (mins, btn) {
        if (timerInterval) clearInterval(timerInterval);
        isTimerRunning = false;
        timerDuration = mins * 60;
        timeRemaining = timerDuration;
        updateTimerDisplay();
        
        document.querySelectorAll(".pomo-preset-btn").forEach(b => b.classList.remove("active"));
        if (btn) btn.classList.add("active");
        
        const startBtn = document.getElementById("pomodoroStartBtn");
        if (startBtn) startBtn.innerHTML = `<span>Start Study Session</span>`;
    };

    window.togglePomodoroTimer = function () {
        const startBtn = document.getElementById("pomodoroStartBtn");
        if (isTimerRunning) {
            clearInterval(timerInterval);
            isTimerRunning = false;
            if (startBtn) startBtn.innerHTML = `<span>Resume</span>`;
        } else {
            isTimerRunning = true;
            if (startBtn) startBtn.innerHTML = `<span>Pause</span>`;
            timerInterval = setInterval(() => {
                if (timeRemaining > 0) {
                    timeRemaining--;
                    updateTimerDisplay();
                } else {
                    clearInterval(timerInterval);
                    isTimerRunning = false;
                    playCompletionChime();
                    alert("⏰ Focus Session Complete! Great job on preparing for your exams. Take a 5-minute break.");
                    if (startBtn) startBtn.innerHTML = `<span>Start Study Session</span>`;
                }
            }, 1000);
        }
    };

    window.resetPomodoroTimer = function () {
        if (timerInterval) clearInterval(timerInterval);
        isTimerRunning = false;
        timeRemaining = timerDuration;
        updateTimerDisplay();
        const startBtn = document.getElementById("pomodoroStartBtn");
        if (startBtn) startBtn.innerHTML = `<span>Start Study Session</span>`;
    };

    function playCompletionChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = "sine";
            osc.frequency.setValueAtTime(587.33, ctx.currentTime);
            osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.8);
        } catch (e) {}
    }

    function initPomodoroTimer() {
        updateTimerDisplay();
    }

    // =========================================
    // EXAM TARGET CHECKLIST
    // =========================================
    function getChecklistItems() {
        try {
            return JSON.parse(localStorage.getItem("mce_study_checklist")) || [
                { id: 1, text: "Solve 2024 Semester End Exam (SEE) Paper", done: false },
                { id: 2, text: "Review High-Weightage Module Formulas", done: true },
                { id: 3, text: "Practice 10-Mark Circuit / Derivation Question", done: false }
            ];
        } catch (e) {
            return [];
        }
    }

    function saveChecklistItems(items) {
        localStorage.setItem("mce_study_checklist", JSON.stringify(items));
        renderChecklist();
    }

    function renderChecklist() {
        const listEl = document.getElementById("studyChecklistContainer");
        if (!listEl) return;
        const items = getChecklistItems();
        if (items.length === 0) {
            listEl.innerHTML = `<p style="font-size: 12px; color: #64748b; text-align: center; margin: 10px 0;">No exam targets added yet. Add one below!</p>`;
            return;
        }
        listEl.innerHTML = items.map(item => `
            <div class="study-task-item ${item.done ? 'completed' : ''}">
                <input type="checkbox" id="task-${item.id}" ${item.done ? 'checked' : ''} onchange="toggleTaskDone(${item.id})">
                <label for="task-${item.id}">${item.text}</label>
                <button type="button" class="btn-del-task" onclick="deleteStudyTask(${item.id})" title="Delete target">&times;</button>
            </div>
        `).join("");
    }

    window.toggleTaskDone = function (id) {
        const items = getChecklistItems();
        const item = items.find(t => t.id === id);
        if (item) {
            item.done = !item.done;
            saveChecklistItems(items);
        }
    };

    window.deleteStudyTask = function (id) {
        let items = getChecklistItems();
        items = items.filter(t => t.id !== id);
        saveChecklistItems(items);
    };

    window.addStudyTask = function (event) {
        event.preventDefault();
        const input = document.getElementById("newStudyTaskInput");
        if (!input || !input.value.trim()) return;
        const items = getChecklistItems();
        items.push({
            id: Date.now(),
            text: input.value.trim(),
            done: false
        });
        input.value = "";
        saveChecklistItems(items);
    };

    function initStudyChecklist() {
        renderChecklist();
    }

    // =========================================
    // ROTATING EXAM SURVIVAL TIPS
    // =========================================
    const examTips = [
        "💡 In MCE Autonomous exams, solving the previous 3 years' question papers covers over 70% of repeated problem types.",
        "💡 Neat block diagrams and step-by-step mathematical derivations carry substantial step marks even if final calculations vary.",
        "💡 Review CIE 1 & CIE 2 internal question papers — professors often adapt similar conceptual questions for the SEE final.",
        "💡 Answer high-weightage 10-mark questions first when your mind is fresh in the examination hall.",
        "💡 Use the 25-minute Pomodoro timer to practice writing full 20-minute answers to past paper questions without checking solutions."
    ];

    function initExamTips() {
        const tipEl = document.getElementById("examTipText");
        if (tipEl) {
            const randomTip = examTips[Math.floor(Math.random() * examTips.length)];
            tipEl.textContent = randomTip;
        }
    }
})();

