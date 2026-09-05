// =========================================
// 🤖 ASK MAYA - AI STUDENT ASSISTANT MODULE
// [STATUS: DISABLED - COMING SOON IN NEXT RELEASE]
// =========================================

(function () {
    let currentBranch = "General";

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Detect branch from DOM
    function detectBranch() {
        const branchEl = document.querySelector("[data-branch]");
        if (branchEl && branchEl.dataset.branch) {
            return branchEl.dataset.branch;
        }
        const title = document.title || "";
        if (title.includes("CSE(AI&ML)")) return "CSE(AI&ML)";
        if (title.includes("CSBS")) return "CSBS";
        if (title.includes("CSE")) return "CSE";
        if (title.includes("ECE")) return "ECE";
        if (title.includes("EEE")) return "EEE";
        if (title.includes("Mechanical")) return "Mechanical";
        if (title.includes("Civil")) return "Civil";
        if (title.includes("First Year")) return "First Year";
        return "Engineering";
    }

    window.addEventListener("DOMContentLoaded", () => {
        currentBranch = detectBranch();
        initAskMayaModal();
    });

    function initAskMayaModal() {
        if (document.getElementById("askMayaModal")) return;

        const modalHTML = `
        <!-- ASK MAYA COMING SOON MODAL -->
        <div id="askMayaModal" class="maya-modal-backdrop" style="display: none; position: fixed; inset: 0; background: rgba(3, 10, 24, 0.82); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 10000; align-items: center; justify-content: center; padding: 16px;">
            <div class="maya-modal-container" style="position: relative; width: 100%; max-width: 520px; background: linear-gradient(145deg, #091a38 0%, #050f21 100%); border: 1px solid rgba(96, 165, 250, 0.25); border-radius: 22px; padding: 32px 26px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.7); color: #ffffff; text-align: center; animation: mayaPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);">
                
                <!-- Close Button -->
                <button type="button" class="maya-close-btn" onclick="closeAskMaya()" aria-label="Close" style="position: absolute; top: 16px; right: 18px; width: 34px; height: 34px; border-radius: 50%; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); color: #94a3b8; font-size: 20px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">&times;</button>

                <!-- Avatar & Status -->
                <div style="margin-bottom: 18px;">
                    <div style="position: relative; display: inline-block;">
                        <img src="maya-logo.svg" alt="Maya AI" style="width: 76px; height: 76px; border-radius: 22px; box-shadow: 0 10px 30px rgba(37, 99, 235, 0.45); border: 2px solid rgba(96, 165, 250, 0.4); object-fit: cover;">
                        <span style="position: absolute; bottom: -6px; right: -8px; background: #f59e0b; color: #000; font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 6px rgba(0,0,0,0.4);">SOON</span>
                    </div>
                </div>

                <!-- Coming Soon Pill -->
                <div style="margin-bottom: 12px;">
                    <span style="display: inline-block; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.45); color: #fbbf24; padding: 5px 14px; border-radius: 999px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                        ⏳ Feature Under Active Development
                    </span>
                </div>

                <!-- Main Heading -->
                <h2 style="font-size: 23px; font-weight: 800; margin-bottom: 10px; background: linear-gradient(to right, #ffffff, #93c5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    Maya AI Exam Assistant is Coming Soon!
                </h2>

                <!-- Subtitle Description -->
                <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6; margin-bottom: 20px;">
                    We are currently fine-tuning <strong>Maya AI</strong> with MCE Autonomous syllabus question banks, step-by-step derivations, and instant handwritten question paper solving for <strong>${escapeHtml(currentBranch)}</strong>.
                </p>

                <!-- What is Coming Roadmap -->
                <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 14px; padding: 14px 16px; text-align: left; margin-bottom: 22px;">
                    <div style="font-size: 11.5px; font-weight: 700; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                        ✨ What Maya AI Will Do:
                    </div>
                    <ul style="list-style: none; padding: 0; margin: 0; font-size: 12.5px; color: #e2e8f0; line-height: 1.75;">
                        <li style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px;">
                            <span>📝</span> <span><strong>10-Mark Solutions:</strong> Structured answers aligned with MCE Autonomous exam marking schemes.</span>
                        </li>
                        <li style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 6px;">
                            <span>📸</span> <span><strong>Scan & Solve:</strong> Crop any exam question to generate instant step-by-step solutions.</span>
                        </li>
                        <li style="display: flex; gap: 8px; align-items: flex-start;">
                            <span>📐</span> <span><strong>Proofs & Diagrams:</strong> Complete derivations, network circuit formulas, and calculus steps.</span>
                        </li>
                    </ul>
                </div>

                <!-- Action Buttons -->
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" onclick="closeAskMaya()" style="background: #2563eb; color: #fff; border: none; padding: 11px 22px; border-radius: 10px; font-weight: 700; font-size: 13.5px; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);">
                        📚 Browse Question Papers
                    </button>
                    <button type="button" onclick="closeAskMaya(); if (window.openRequestModal) openRequestModal();" style="background: rgba(255, 255, 255, 0.08); color: #e2e8f0; border: 1px solid rgba(255, 255, 255, 0.15); padding: 11px 18px; border-radius: 10px; font-weight: 600; font-size: 13.5px; cursor: pointer; transition: all 0.2s;">
                        📝 Request a Paper
                    </button>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML("beforeend", modalHTML);
    }

    // Modal Visibility Functions
    window.openAskMaya = function () {
        const modal = document.getElementById("askMayaModal");
        if (modal) {
            modal.style.display = "flex";
        }
    };

    window.closeAskMaya = function () {
        const modal = document.getElementById("askMayaModal");
        if (modal) {
            modal.style.display = "none";
        }
    };

    // Close on backdrop click
    document.addEventListener("click", function (e) {
        const modal = document.getElementById("askMayaModal");
        if (modal && e.target === modal) {
            closeAskMaya();
        }
    });

    // Dummy stubs to avoid runtime errors in any existing scripts
    window.switchMayaMode = function () {};
    window.useMayaPrompt = function () {};
    window.handleMayaSubmit = function (e) { if (e) e.preventDefault(); };
    window.handleMayaImageUpload = function () {};
    window.removeMayaImage = function () {};
    window.closeCropModal = function () {};
    window.confirmCropSelection = function () {};
})();
