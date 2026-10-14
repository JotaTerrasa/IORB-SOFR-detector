// Section routes must not match element IDs and trigger native anchor scrolling.
history.scrollRestoration = "manual";
const sections = ["desk", "projects", "overview", "macro", "settings"];
const initialSection = location.hash.slice(1);
if (sections.includes(initialSection))
  history.replaceState(null, "", "#/" + initialSection);
window.addEventListener("pageshow", () => {
  const section = location.hash.slice(1).replace(/^\//, "");
  if (!section || sections.includes(section))
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
});
