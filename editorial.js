(() => {
    const now = new Date();
    document.querySelectorAll("[data-edition-date]").forEach(element => {
        element.dateTime = now.toISOString();
        element.textContent = new Intl.DateTimeFormat("en-AU", {
            weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney"
        }).format(now);
    });
})();
