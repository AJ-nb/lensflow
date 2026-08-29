const originalConsoleError = console.error.bind(console);
const ignoredDiagnostics = [
  "Warning: Parameter not found:",
  "Estimating resolution as"
];

console.error = (...values) => {
  const message = values.map(String).join(" ");
  if (ignoredDiagnostics.some((diagnostic) => message.includes(diagnostic))) return;
  originalConsoleError(...values);
};

importScripts("./worker.min.js");
