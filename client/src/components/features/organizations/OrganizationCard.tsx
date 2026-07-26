import { MoreHorizontal, Building2, Globe, FileText } from "lucide-react";
import { format } from "date-fns";

import { Organization } from "../../../services/api/organizations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface OrganizationCardProps {
  organization: Organization;
  onEdit: (org: Organization) => void;
  onDelete: (id: string) => void;
}

export function OrganizationCard({
  organization,
  onEdit,
  onDelete,
}: OrganizationCardProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-all hover:shadow-md dark:hover:shadow-primary/5">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            {organization.logo_url ? (
              <img
                src={organization.logo_url}
                alt={organization.name}
                className="h-full w-full rounded-md object-cover"
              />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>

          <div className="space-y-1">
            <CardTitle className="text-xl">
              {organization.name}
            </CardTitle>

            <CardDescription className="flex items-center gap-1 text-xs">
              Created {format(new Date(organization.created_at), "MMM d, yyyy")}
            </CardDescription>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={() => onEdit(organization)}>
              Edit Organization
            </DropdownMenuItem>

            <DropdownMenuItem
              variant="destructive"
              onClick={() => onDelete(organization.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="flex-grow pt-4">
        {organization.description && (
          <div className="mb-4 flex items-start gap-2 text-sm text-muted-foreground">
            <FileText className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="line-clamp-2">{organization.description}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {organization.industry && (
            <Badge variant="secondary" className="text-xs font-normal">
              {organization.industry}
            </Badge>
          )}

          {organization.website && (
            <div className="flex items-center gap-1 rounded-full bg-muted/50 px-2.5 py-0.5 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />

              <a
                href={organization.website}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {organization.website.replace(/^https?:\/\//, "")}
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}