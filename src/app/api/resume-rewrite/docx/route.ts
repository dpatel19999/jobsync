import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import prisma from "@/lib/db";
import { sniffFileType } from "@/lib/ai/import/extract-text";
import { splitNonEmptyLines } from "@/lib/ai/guardrails/position-lock";
import {
  buildFormattedDocx,
  buildPlainDocx,
  DocxStructureMismatchError,
} from "@/lib/docx";
import { buildResumeDocumentName } from "@/lib/resume-naming";

// Generates and streams a .docx for a job's rewritten resume on demand —
// nothing is cached on disk. Reuses the exact MasterTemplate version the
// rewrite was generated from (RewrittenResume.sourceTemplateId), not
// whatever the "current" template happens to be now, so a later template
// re-upload can't desync the paragraph structure from the rewritten text.
export const GET = async (req: NextRequest) => {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not Authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId, userId },
      include: { Company: true, RewrittenResume: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!job.RewrittenResume) {
      return NextResponse.json(
        { error: "No rewritten resume has been generated for this job yet." },
        { status: 404 },
      );
    }

    const rewrittenLines = splitNonEmptyLines(job.RewrittenResume.content);
    const template = job.RewrittenResume.sourceTemplateId
      ? await prisma.masterTemplate.findUnique({
          where: { id: job.RewrittenResume.sourceTemplateId },
        })
      : null;

    let docxBuffer: Buffer;
    let usedFallback = false;
    let fallbackReason = "";

    if (!template || !fs.existsSync(template.filePath)) {
      usedFallback = true;
      fallbackReason =
        "The original master template file could not be found on disk, so this download uses a clean, simply-formatted layout instead of the original formatting.";
      docxBuffer = await buildPlainDocx(rewrittenLines);
    } else {
      const originalBuf = fs.readFileSync(template.filePath);
      const fileType = sniffFileType(originalBuf);

      if (fileType !== "docx") {
        usedFallback = true;
        fallbackReason =
          "The original master template was uploaded as a PDF — exact visual formatting can't be reconstructed from a PDF, so this download uses a clean, simply-formatted layout instead.";
        docxBuffer = await buildPlainDocx(rewrittenLines);
      } else {
        try {
          docxBuffer = await buildFormattedDocx(originalBuf, rewrittenLines);
        } catch (err) {
          usedFallback = true;
          fallbackReason =
            err instanceof DocxStructureMismatchError
              ? `${err.message} Using a clean, simply-formatted layout instead.`
              : `Could not reconstruct the original formatting (${err instanceof Error ? err.message : "unknown error"}). Using a clean, simply-formatted layout instead.`;
          docxBuffer = await buildPlainDocx(rewrittenLines);
        }
      }
    }

    const companyName = job.Company?.label ?? "Company";
    const fileName = `${buildResumeDocumentName(companyName)}.docx`;
    const safeFileName = fileName.replace(/[\r\n"]/g, "_");

    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFileName}"`,
        "X-Docx-Filename": safeFileName,
        "X-Docx-Formatting-Fallback": usedFallback ? "true" : "false",
        ...(usedFallback
          ? { "X-Docx-Fallback-Reason": encodeURIComponent(fallbackReason) }
          : {}),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate document" },
      { status: 500 },
    );
  }
};
