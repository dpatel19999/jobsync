"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { toast } from "../ui/use-toast";
import { Loader2, Upload, FileText } from "lucide-react";
import {
  getMasterTemplates,
  uploadMasterTemplate,
} from "@/actions/templates.actions";
import {
  TEMPLATE_SLOTS,
  TEMPLATE_SLOT_LABELS,
  TemplateSlot,
  type MasterTemplateSummary,
} from "@/models/template.model";

function TemplatesSettings() {
  const [templates, setTemplates] = useState<MasterTemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<TemplateSlot | null>(null);
  const fileInputRefs = useRef<Partial<Record<TemplateSlot, HTMLInputElement | null>>>({});

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const result = await getMasterTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getTemplateForSlot = (slot: TemplateSlot) =>
    templates.find((t) => t.slot === slot);

  const triggerImport = (slot: TemplateSlot) => {
    fileInputRefs.current[slot]?.click();
  };

  const handleFileSelected = async (
    slot: TemplateSlot,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingSlot(slot);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadMasterTemplate(slot, formData);
      if (result.success) {
        toast({
          variant: "success",
          description: `${TEMPLATE_SLOT_LABELS[slot]} template imported.`,
        });
        await fetchTemplates();
      } else {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: result.message || "Failed to import template.",
        });
      }
    } catch (error) {
      console.error("Error uploading template:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      });
    } finally {
      setUploadingSlot(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium">Templates</h3>
          <p className="text-sm text-muted-foreground">
            Master resume and cover letter templates used as the source
            wording for future tailored generation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading templates...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Templates</h3>
        <p className="text-sm text-muted-foreground">
          Import your master resume and cover letter templates, per language.
          Not every slot needs to be filled — the app works with however many
          you upload. Re-importing a slot keeps the previous version instead
          of deleting it.
        </p>
      </div>

      <div className="grid gap-4">
        {TEMPLATE_SLOTS.map((slot) => {
          const current = getTemplateForSlot(slot);
          const isUploading = uploadingSlot === slot;

          return (
            <Card key={slot}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {TEMPLATE_SLOT_LABELS[slot]}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {current ? (
                        <span className="flex items-center gap-1">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          {current.fileName} — v{current.version}, uploaded{" "}
                          {format(new Date(current.createdAt), "PP")}
                        </span>
                      ) : (
                        "No template uploaded yet"
                      )}
                    </CardDescription>
                  </div>
                  {current ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900">
                      v{current.version}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not configured</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <input
                  ref={(el) => {
                    fileInputRefs.current[slot] = el;
                  }}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={(e) => handleFileSelected(slot, e)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => triggerImport(slot)}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3 mr-1" />
                  )}
                  {current ? "Import new version" : "Import template"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default TemplatesSettings;
