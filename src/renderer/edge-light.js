function reflectVisibility() {
  document.body.classList.toggle("lit", !document.hidden);
}
document.addEventListener("visibilitychange", reflectVisibility);
reflectVisibility();
