"use client";

import React from "react";
import {
  WorkspaceSwitcher,
  WorkspaceSwitcherProps,
} from "./WorkspaceSwitcher";
import { Organization } from "@/services/api/organizations";

export interface OrganizationSwitcherProps {
  onOrganizationChanged?: (org: Organization) => void;
  className?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  onOrganizationChanged,
  className,
  collapsed = false,
  onNavigate,
}) => {
  return (
    <WorkspaceSwitcher
      collapsed={collapsed}
      onNavigate={onNavigate}
      onOrganizationChanged={onOrganizationChanged}
      className={className}
    />
  );
};

export default OrganizationSwitcher;
