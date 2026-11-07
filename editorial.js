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
            if (!expanded && menu.getClientRects().length === 0) toggle.click();
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

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !event.defaultPrevented) families.forEach(family => family.closePreview());
    });

    document.querySelectorAll(".f1-nav-family").forEach(group => {
        const primary = group.querySelector("a");
        const menu = group.querySelector(".f1-nav-family__menu");
        if (!primary || !menu) return;
        const current = menu.querySelector('[aria-current="page"]')?.textContent;
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "sport-nav__toggle f1-nav-family__toggle";
        toggle.setAttribute("aria-label", current ? `More Formula racing, current page ${current}` : "More Formula racing");
        menu.id = "formula-racing-menu";
        toggle.setAttribute("aria-controls", menu.id);
        if (current) toggle.append(current);
        const chevron = document.createElement("span");
        chevron.className = "sport-nav__chevron";
        chevron.setAttribute("aria-hidden", "true");
        toggle.append(chevron);
        menu.before(toggle);
        group.dataset.enhanced = "true";
        if (current) group.dataset.current = "true";

        let open = false;
        function setOpen(value) {
            open = value;
            toggle.setAttribute("aria-expanded", String(open));
            menu.dataset.open = String(open);
            menu.inert = !open;
            if (open) families.forEach(family => family.closePreview());
        }

        toggle.addEventListener("click", () => setOpen(!open));
        toggle.addEventListener("keydown", event => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            setOpen(true);
            menu.querySelector("a")?.focus();
        });
        primary.addEventListener("pointerenter", event => {
            if (event.pointerType === "mouse" && !group.contains(document.activeElement)) setOpen(true);
        });
        group.addEventListener("pointerleave", () => {
            if (!group.contains(document.activeElement)) setOpen(false);
        });
        group.addEventListener("focusout", event => {
            if (!group.contains(event.relatedTarget)) setOpen(false);
        });
        document.addEventListener("pointerdown", event => {
            if (open && !group.contains(event.target)) setOpen(false);
        });
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || event.defaultPrevented || !open) return;
            if (group.contains(document.activeElement)) {
                event.preventDefault();
                toggle.focus();
            }
            setOpen(false);
        });
        setOpen(false);
    });
})();
