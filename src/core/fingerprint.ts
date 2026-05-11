export function genBLsid(): string {
  let prefix = "";
  for (let i = 0; i < 8; i += 1) {
    prefix += Math.floor(Math.random() * 16).toString(16).toUpperCase();
  }
  return `${prefix}_${Date.now().toString(16).toUpperCase()}`;
}
