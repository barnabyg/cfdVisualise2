import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const file of files) {
  const contents = readFileSync(file, "utf8");
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16}/.test(
      contents,
    )
  )
    throw Error(`Possible credential in ${file}`);
}
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
if (!manifest.private)
  throw Error("This application must stay private on npm.");
