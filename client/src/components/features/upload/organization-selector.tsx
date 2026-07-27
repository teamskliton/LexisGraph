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
import { Skeleton } from "@/components/ui/skeleton";
import { Organization } from "@/services/api/organizations";

interface OrganizationSelectorProps {
  value: string;
  onChange: (value: string) => void;
  organizations: Organization[];
  isLoading: boolean;
  disabled?: boolean;
  error?: string;
}

export function OrganizationSelector({
  value,
  onChange,
  organizations,
  isLoading,
  disabled = false,
  error,
}: OrganizationSelectorProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="organization" className="text-sm font-medium">
        Organization <span className="text-destructive">*</span>
      </Label>
      <Select value={value} onValueChange={(v) => onChange(String(v))} disabled={disabled}>
        <SelectTrigger
          id="organization"
          className={cn(
            "w-full",
            error && "border-destructive focus:ring-destructive/20"
          )}
        >
          <SelectValue placeholder="Select an organization" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {organizations.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No organizations found. Create one first.
              </div>
            ) : (
              organizations.map((org) => (
                <SelectItem key={org.id} value={org.id}>
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
                    <span>{org.name}</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Select the organization to upload this document to
      </p>
    </div>
  );
}