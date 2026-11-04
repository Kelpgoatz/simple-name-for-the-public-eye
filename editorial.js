(() => {
    const now = new Date();
    document.querySelectorAll("[data-edition-date]").forEach(element => {
        element.dateTime = now.toISOString();
        element.textContent = new Intl.DateTimeFormat("en-AU", {
            weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney"
        }).format(now);
    });

    const families = [];
    document.querySelectorAll("[data-league-group]").forEach(group => {
        const toggle = group.querySelector("[data-league-toggle]");
        const menu = group.querySelector("[data-league-menu]");
        const subnav = group.querySelector("[data-league-subnav]");
        if (!toggle || !menu || !subnav) return;
        const storageKey = `cgrillo-family-${group.dataset.leagueGroup}-expanded`;
        let expanded = false;
        let preview = false;
        let suppressHover = false;
        let closeTimer;
        try { expanded = sessionStorage.getItem(storageKey) === "true"; } catch {}
        const clearCloseTimer = () => { clearTimeout(closeTimer); closeTimer = undefined; };
        const persist = () => {
            try { sessionStorage.setItem(storageKey, String(expanded)); } catch {}
        };
        const render = () => {
            group.dataset.expanded = String(expanded);
            // CSS animates both views; inert keeps closed links out of the tab order.
            menu.hidden = false;
            subnav.hidden = false;
            const showMenu = !expanded && preview;
            menu.dataset.open = String(showMenu);
            menu.inert = !showMenu;
            menu.setAttribute("aria-hidden", String(!showMenu));
            subnav.dataset.open = String(expanded);
            subnav.inert = !expanded;
            subnav.setAttribute("aria-hidden", String(!expanded));
            toggle.setAttribute("aria-expanded", String(expanded || showMenu));
        };
        const closePreview = () => { clearCloseTimer(); preview = false; render(); };
        const openPreview = () => {
            families.forEach(family => { if (family.group !== group) family.closePreview(); });
            preview = true;
            render();
        };
        families.push({ group, closePreview });
        toggle.addEventListener("click", () => {
            clearCloseTimer();
            expanded = !expanded;
            preview = false;
            // Collapsing must stay closed until the pointer leaves the family.
            suppressHover = true;
            persist();
            render();
        });
        group.addEventListener("pointerenter", event => {
            clearCloseTimer();
            if (event.pointerType === "touch" || expanded || suppressHover) return;
            openPreview();
        });
        group.addEventListener("pointerleave", () => {
            suppressHover = false;
            clearCloseTimer();
            if (!group.contains(document.activeElement)) closeTimer = setTimeout(closePreview, 260);
        });
        group.addEventListener("focusout", () => {
            queueMicrotask(() => {
                if (!group.contains(document.activeElement)) closePreview();
            });
        });
        toggle.addEventListener("keydown", event => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            clearCloseTimer();
            if (expanded) subnav.querySelector("a")?.focus();
            else {
                openPreview();
                menu.querySelector("a")?.focus();
            }
        });
        group.addEventListener("keydown", event => {
            if (event.key !== "Escape" || (!expanded && !preview)) return;
            event.preventDefault();
            clearCloseTimer();
            expanded = false;
            preview = false;
            suppressHover = true;
            persist();
            render();
            toggle.focus();
        });
        render();
    });
})();
