export type Theme = "light" | "dark" | "system";

// Apply a theme (and store it) from string or <select> onchange
export function setTheme(event: Theme | Event) {
  let newTheme: Theme = "system";
  if (typeof event === "string") {
    newTheme = event;
  } else {
    newTheme = event.target.value;
  }

  if (newTheme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", newTheme);
  }

  const themePicker = document.querySelector("#theme-picker");

  if (!themePicker) {
    // Create the <select> element so out css :has will work
    const selectElement = document.createElement("select");

    selectElement.id = "theme-picker";
    selectElement.value = newTheme;
    selectElement.style = "display: none"; // hide

    const option = document.createElement("option");
    option.value = newTheme;
    selectElement.appendChild(option);

    document.body.appendChild(selectElement);
  }

  localStorage.setItem("theme", newTheme);
}
