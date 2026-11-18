import "./build.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/viewer.js", ["viewer.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);
const port = Number(process.argv[2] === "--port" ? process.argv[3] : 41751);
const server = createServer(async (req, res) => {
  const file = files.get(req.url);
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(new URL(`../dist/${file[0]}`, import.meta.url));
    res
      .writeHead(200, { "Content-Type": `${file[1]}; charset=utf-8` })
      .end(data);
  } catch {
    res.writeHead(500).end();
  }
});
if (process.argv.includes("--fallback-port")) {
  server.once("error", (error) => {
    if (error.code !== "EADDRINUSE") throw error;
    server.listen(0, "127.0.0.1");
  });
}
server.on("listening", () => {
  console.log(`Open http://127.0.0.1:${server.address().port}/`);
  console.log("Press Ctrl+C in this terminal to stop the server.");
});
server.listen(port, "127.0.0.1");
