/**
 * MCE PYQ Hub - Official PWA App Installation Controller
 * Handles Service Worker registration, native Android install prompt,
 * iOS "Add to Home Screen" guidance, and install banner rendering.
 */

(function () {
    let deferredInstallPrompt = null;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // 1. Register Service Worker for PWA capabilities
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((registration) => {
                    console.log('✓ MCE PYQ Hub PWA Ready. Scope:', registration.scope);
                })
                .catch((err) => {
                    console.warn('PWA registration skipped:', err);
                });
        });
    }

    // If already installed and running standalone, don't show install buttons
    if (isStandalone) {
        document.addEventListener('DOMContentLoaded', () => {
            const btns = document.querySelectorAll('.btn-install-app, #installAppBtn, #pwaInstallFloatingBanner');
            btns.forEach(b => b.style.display = 'none');
        });
        return;
    }

    // 2. Capture Android/Desktop Chrome install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent immediate Chrome mini-infobar
        e.preventDefault();
        deferredInstallPrompt = e;
        showInstallUI();
    });

    // 3. User successfully installed the app
    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        hideInstallUI();
        showInstallToast('🎉 MCE PYQ Hub installed successfully! Find it on your home screen.');
    });

    function showInstallUI() {
        // Check if navbar install button exists; if not, inject a sleek floating install banner
        let banner = document.getElementById('pwaInstallFloatingBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'pwaInstallFloatingBanner';
            banner.className = 'pwa-install-banner';
            banner.innerHTML = `
                <div class="pwa-banner-content">
                    <img src="/icons/icon-96.png" alt="MCE App Icon" class="pwa-banner-icon">
                    <div class="pwa-banner-text">
                        <strong>MCE PYQ Hub App</strong>
                        <span>Install on home screen for fast 1-tap revision & Maya AI</span>
                    </div>
                </div>
                <div class="pwa-banner-actions">
                    <button type="button" class="btn-pwa-dismiss" id="btnDismissPwaBanner" title="Dismiss">&times;</button>
                    <button type="button" class="btn-pwa-install" id="btnTriggerPwaInstall">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Install App</span>
                    </button>
                </div>
            `;
            document.body.appendChild(banner);

            // Button handlers
            document.getElementById('btnTriggerPwaInstall').addEventListener('click', triggerInstallFlow);
            document.getElementById('btnDismissPwaBanner').addEventListener('click', () => {
                banner.style.display = 'none';
                sessionStorage.setItem('mce_pwa_dismissed', 'true');
            });
        }

        if (sessionStorage.getItem('mce_pwa_dismissed') !== 'true') {
            banner.style.display = 'flex';
        }

        // Also activate any header install buttons
        document.querySelectorAll('.btn-install-app').forEach(btn => {
            btn.style.display = 'inline-flex';
            btn.onclick = triggerInstallFlow;
        });
    }

    function hideInstallUI() {
        const banner = document.getElementById('pwaInstallFloatingBanner');
        if (banner) banner.style.display = 'none';
        document.querySelectorAll('.btn-install-app').forEach(btn => btn.style.display = 'none');
    }

    async function triggerInstallFlow() {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const { outcome } = await deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
                deferredInstallPrompt = null;
                hideInstallUI();
            }
        } else {
            // Check if iOS
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                showIOSInstructionsModal();
            } else {
                showInstallToast('💡 Open browser menu (⋮) and tap "Install App" or "Add to Home Screen".');
            }
        }
    }

    function showIOSInstructionsModal() {
        let modal = document.getElementById('iosInstallModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'iosInstallModal';
            modal.className = 'ios-install-modal-overlay';
            modal.innerHTML = `
                <div class="ios-install-card">
                    <div class="ios-install-header">
                        <img src="/icons/icon-96.png" alt="MCE Logo" style="width: 44px; height: 44px; border-radius: 10px;">
                        <div>
                            <h4 style="margin: 0; font-size: 16px; color: #0f172a;">Install on iPhone / iPad</h4>
                            <span style="font-size: 12px; color: #64748b;">MCE PYQ Hub Standalone App</span>
                        </div>
                    </div>
                    <div class="ios-install-steps">
                        <p><strong>1.</strong> Tap the <strong>Share</strong> button <span style="font-size: 16px;">⎋</span> at the bottom of Safari.</p>
                        <p><strong>2.</strong> Scroll down and select <strong>"Add to Home Screen"</strong> <span style="font-size: 16px;">➕</span>.</p>
                        <p><strong>3.</strong> Tap <strong>Add</strong> at top-right. MCE PYQ Hub is now on your home screen!</p>
                    </div>
                    <button type="button" class="btn-ios-close" onclick="document.getElementById('iosInstallModal').classList.remove('active')">Got it!</button>
                </div>
            `;
            document.body.appendChild(modal);
        }
        modal.classList.add('active');
    }

    function showInstallToast(message) {
        let toast = document.getElementById('pwaToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pwaToast';
            toast.className = 'pwa-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4500);
    }

    // Expose trigger to window
    window.installMceApp = triggerInstallFlow;
})();

