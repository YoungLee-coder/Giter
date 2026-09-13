/**
 * Split a repo-relative path into its directory prefix and file name so lists can
 * de-emphasise the directory and keep the file name visible when space runs out.
 */
export function splitPath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf("/");
  if (index < 0) return { dir: "", name: path };
  return { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}
