import { readFile, mkdir, writeFile } from "node:fs/promises";
const root = new URL("./", import.meta.url);
const [html, css, js, library] = await Promise.all(
  ["index.html", "style.css", "app.js", "library.js"].map((file) =>
    readFile(new URL(file, root), "utf8"),
  ),
);
const standalone = html
  .replace(
    '<script src="/library.js"></script>',
    () => `<script>\n${library}\n</script>`,
  )
  .replace(
    '<link rel="stylesheet" href="/style.css">',
    () => `<style>\n${css}\n</style>`,
  )
  .replace(
    '<script src="/app.js"></script>',
    () => `<script>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`,
  );
await mkdir(new URL("dist/", root), { recursive: true });
await writeFile(new URL("dist/rig-studio.html", root), standalone);
console.log("Created dist/rig-studio.html — open directly in a browser.");
