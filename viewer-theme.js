(() => {
    const storageKey = "cgrillo-theme";
    const controls = "[data-theme-toggle], [data-about-theme], [data-viewer-drawer-theme]";
    const root = document.documentElement;
    const system = matchMedia("(prefers-color-scheme: dark)");
    const valid = value => value === "light" || value === "dark" ? value : null;
    let preference = null;

    try {
        preference = valid(localStorage.getItem(storageKey));
    } catch {
        // The system preference still applies when storage is unavailable.
    }

    function applyTheme() {
        const theme = preference || (system.matches ? "dark" : "light");
        root.dataset.theme = theme;
        const favicon = document.getElementById("favicon");
        if (favicon) favicon.href = theme === "dark" ? "favicon-dark.svg" : "favicon.svg";
        document.querySelectorAll(controls).forEach(button => {
            button.textContent = "Dark mode";
            button.setAttribute("aria-label", "Dark mode");
            button.setAttribute("aria-pressed", String(theme === "dark"));
        });
    }

    applyTheme();
    document.addEventListener("DOMContentLoaded", applyTheme, { once: true });
    document.addEventListener("click", event => {
        if (!event.target.closest?.(controls)) return;
        preference = root.dataset.theme === "dark" ? "light" : "dark";
        try { localStorage.setItem(storageKey, preference); } catch {}
        applyTheme();
    });
    system.addEventListener("change", applyTheme);
    window.addEventListener("storage", event => {
        if (event.key !== storageKey && event.key !== null) return;
        preference = valid(event.newValue);
        applyTheme();
    });
})();
