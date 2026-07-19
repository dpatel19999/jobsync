"use server";

import path from "path";
import fs from "fs";
import { writeFile } from "fs/promises";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { getTimestampedFileName } from "@/lib/utils";
import { APP_CONSTANTS } from "@/lib/constants";
import {
  extractText,
  PDF_MAGIC,
  ZIP_MAGIC,
} from "@/lib/ai/import/extract-text";
import {
  TEMPLATE_SLOTS,
  TemplateKind,
  TemplateSlot,
  languageToTemplateLanguage,
  templateSlotFor,
  type MasterTemplateSummary,
} from "@/models/template.model";

const ALLOWED_MIME = new Set<string>(APP_CONSTANTS.TEMPLATE_ALLOWED_MIME_TYPES);

function isValidSlot(slot: string): slot is TemplateSlot {
  return (TEMPLATE_SLOTS as string[]).includes(slot);
}

function validateFileBytes(buf: Buffer, mimeType: string): boolean {
  if (mimeType === "application/pdf") return buf.subarray(0, 4).equals(PDF_MAGIC);
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return buf.subarray(0, 4).equals(ZIP_MAGIC);
  }
  return false;
}

function toSummary(row: {
  id: string;
  slot: string;
  version: number;
  fileName: string;
  createdAt: Date;
}): MasterTemplateSummary {
  return {
    id: row.id,
    slot: row.slot as TemplateSlot,
    version: row.version,
    fileName: row.fileName,
    createdAt: row.createdAt,
  };
}

// Current (isCurrent: true) version of every slot the user has uploaded at
// least once. Slots with no upload simply don't appear in the result.
export async function getMasterTemplates(): Promise<any | undefined> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const rows = await prisma.masterTemplate.findMany({
      where: { userId: user.id, isCurrent: true },
      orderBy: { slot: "asc" },
    });

    return { success: true, data: rows.map(toSummary) };
  } catch (error) {
    return handleError(error, "Failed to load templates.");
  }
}

// Import a new file for a slot. Keeps the prior current version on disk and
// in the DB (isCurrent: false) rather than deleting it — see DECISIONS.md.
// No AI rewriting happens here: extractedText is the raw extracted wording,
// verbatim, for a future generation step to use as-is.
export async function uploadMasterTemplate(
  slot: TemplateSlot,
  formData: FormData,
): Promise<any | undefined> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    if (!isValidSlot(slot)) {
      throw new Error("Invalid template slot.");
    }

    const file = formData.get("file") as File | null;
    if (!file || !file.name || file.size === 0) {
      throw new Error("No file provided.");
    }
    if (file.size > APP_CONSTANTS.MAX_TEMPLATE_FILE_SIZE_BYTES) {
      throw new Error("File size must be less than 5MB.");
    }
    if (!ALLOWED_MIME.has(file.type)) {
      throw new Error("Only PDF and .docx files are supported.");
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!validateFileBytes(buf, file.type)) {
      throw new Error("File content does not match declared type.");
    }

    const extraction = await extractText(buf);
    if (!extraction.success) {
      throw new Error(extraction.error.message);
    }

    const uploadDir = path.join(APP_CONSTANTS.UPLOADS_DIR, "files", "templates");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const timestampedFileName = getTimestampedFileName(file.name);
    const filePath = path.join(uploadDir, timestampedFileName);
    await writeFile(filePath, buf);

    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.masterTemplate.findFirst({
        where: { userId: user.id, slot },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;

      await tx.masterTemplate.updateMany({
        where: { userId: user.id, slot, isCurrent: true },
        data: { isCurrent: false },
      });

      return tx.masterTemplate.create({
        data: {
          userId: user.id,
          slot,
          version: nextVersion,
          isCurrent: true,
          fileName: file.name,
          filePath,
          extractedText: extraction.data.text,
        },
      });
    });

    return { success: true, data: toSummary(created) };
  } catch (error) {
    return handleError(error, "Failed to upload template.");
  }
}

// For the job-detail "no template uploaded yet" empty state: does the
// current user have a current-version template for this kind+language?
// Returns data: null (not an error) when language is unset/undetected yet
// or no matching template exists — callers branch on data being present.
export async function getTemplateForJobLanguage(
  kind: TemplateKind,
  language: string | null | undefined,
): Promise<any | undefined> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new Error("Not authenticated");

    const templateLanguage = languageToTemplateLanguage(language);
    if (!templateLanguage) {
      return { success: true, data: null };
    }

    const slot = templateSlotFor(kind, templateLanguage);
    const template = await prisma.masterTemplate.findFirst({
      where: { userId: user.id, slot, isCurrent: true },
    });

    return { success: true, data: template ? toSummary(template) : null };
  } catch (error) {
    return handleError(error, "Failed to check template availability.");
  }
}
