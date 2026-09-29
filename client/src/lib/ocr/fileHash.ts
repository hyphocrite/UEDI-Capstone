/** SHA-256 of a file, used to seal each uploaded document and spot duplicates. */
export async function sha256HexFromFile(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
