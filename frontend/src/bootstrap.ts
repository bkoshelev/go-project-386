if (import.meta.env.DEV) {
  await import("react-devtools-cdt-mcp/register");
}

await import("./main");
