/**
 * Loads the German Hunspell wordlist (from the `dictionary-de` package,
 * sourced from the igerman98/LibreOffice German dictionary project) into a
 * flat lowercase word set. Used by the compound-noun splitter as the
 * "is this a real German word" check — no frequency data needed since we
 * only need containment, not the single best segmentation.
 *
 * Loaded lazily and cached at module scope: the .dic file is ~1MB, parsed
 * once per server process, not per request.
 */

let cachedWords: Set<string> | null = null;

export async function getGermanWordSet(): Promise<Set<string>> {
  if (cachedWords) return cachedWords;

  const { default: dictionary } = await import("dictionary-de");
  const text = Buffer.from(dictionary.dic).toString("utf-8");
  const lines = text.split("\n");

  const words = new Set<string>();
  // First line is a count, not a word; a handful of header lines are
  // tab-indented license text mixed into the file body itself.
  for (const line of lines.slice(1)) {
    if (!line || line.startsWith("\t")) continue;
    const word = line.split("/")[0].trim();
    if (word) words.add(word.toLowerCase());
  }

  cachedWords = words;
  return words;
}
