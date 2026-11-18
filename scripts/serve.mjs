import "./build.mjs";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/viewer.js", ["viewer.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]],
]);
const port = Number(process.argv[2] === "--port" ? process.argv[3] : 5173);
createServer(async (req, res) => {
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
}).listen(port, "127.0.0.1", () =>
  console.log(`Open http://127.0.0.1:${port}/`),
);
