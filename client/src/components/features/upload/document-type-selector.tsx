"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentType } from "@/types/document";

interface DocumentTypeSelectorProps {
  value: DocumentType | "";
  onChange: (value: DocumentType) => void;
  disabled?: boolean;
  error?: string;
}

export function DocumentTypeSelector({
  value,
  onChange,
  disabled = false,
  error,
}: DocumentTypeSelectorProps) {
  const handleValueChange = (newValue: unknown) => {
    const v = String(newValue);
    if (v === "REGULATION" || v === "POLICY") {
      onChange(v as DocumentType);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="document-type" className="text-sm font-medium">
        Document Type <span className="text-destructive">*</span>
      </Label>
      <Select
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          id="document-type"
          className={cn(
            "w-full",
            error && "border-destructive focus:ring-destructive/20"
          )}
        >
          <SelectValue placeholder="Select document type" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="REGULATION">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
                <span>Regulation</span>
              </div>
            </SelectItem>
            <SelectItem value="POLICY">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                <span>Policy</span>
              </div>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {value === "REGULATION"
          ? "Regulations are legal requirements from government bodies"
          : value === "POLICY"
            ? "Policies are internal organizational documents"
            : "Select whether this is a regulation or internal policy"}
      </p>
    </div>
  );
}