// Section hashes select a page, rather than a scroll destination.
history.scrollRestoration = "manual";
window.addEventListener("pageshow", () => {
  const section = location.hash.slice(1);
  if (
    !section ||
    ["desk", "projects", "overview", "macro", "settings"].includes(section)
  ) {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }
});
