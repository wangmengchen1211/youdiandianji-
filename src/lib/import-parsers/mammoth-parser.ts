import mammoth from "mammoth";

/**
 * Extract plain text from a .docx buffer using mammoth.extractRawText.
 * Throws DocxParseError on failure with the underlying message.
 */
export class DocxParseError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "DocxParseError";
  }
}

export async function parseDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length === 0) {
      throw new DocxParseError("DOCX 内容为空");
    }
    return result.value;
  } catch (err) {
    if (err instanceof DocxParseError) throw err;
    throw new DocxParseError(
      `DOCX 解析失败: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
