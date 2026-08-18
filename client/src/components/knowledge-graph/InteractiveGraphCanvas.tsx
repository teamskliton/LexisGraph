"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { GraphNode, GraphEdge } from "@/services/graphService";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Move,
  Scale,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  Wrench,
  Layers,
  FileText,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InteractiveGraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  searchQuery?: string;
  onResetView?: () => void;
}

export type NodeCategory =
  | "regulation"
  | "requirement"
  | "policy"
  | "policy_section"
  | "finding"
  | "remediation"
  | "clause";

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
  category: NodeCategory;
}

/**
 * Node visual style configurations by entity type
 */
function getNodeCategory(node: GraphNode): NodeCategory {
  const kind = (node.kind || "").toLowerCase();
  const docType = (node.document_type || node.source_type || "").toLowerCase();
  const id = (node.id || "").toLowerCase();
  const label = (node.label || "").toLowerCase();

  if (kind.includes("remediation") || id.startsWith("rem:") || label.includes("remediation")) {
    return "remediation";
  }
  if (kind.includes("finding") || id.startsWith("finding:") || label.includes("finding")) {
    return "finding";
  }
  if (kind.includes("requirement") || id.startsWith("req:")) {
    return "requirement";
  }
  if (kind.includes("policy_section") || id.startsWith("pol_sec:")) {
    return "policy_section";
  }
  if (
    kind.includes("regulation") ||
    id.startsWith("reg:") ||
    docType === "regulation" ||
    docType === "domain_document" ||
    label.includes("act") ||
    label.includes("code of") ||
    label.includes("fema")
  ) {
    return "regulation";
  }
  if (
    kind.includes("policy") ||
    id.startsWith("pol:") ||
    docType === "policy" ||
    docType === "user_document"
  ) {
    return "policy";
  }
  return "clause";
}

const NODE_STYLES: Record<
  NodeCategory,
  {
    bg: string;
    border: string;
    text: string;
    iconColor: string;
    dotColor: string;
    glow: string;
    label: string;
    badge: string;
  }
> = {
  regulation: {
    bg: "bg-purple-500/15 dark:bg-purple-500/25",
    border: "stroke-purple-600 dark:stroke-purple-400",
    text: "fill-purple-950 dark:fill-purple-100",
    iconColor: "text-purple-600 dark:text-purple-400",
    dotColor: "bg-purple-500",
    glow: "rgba(168, 85, 247, 0.5)",
    label: "Regulation",
    badge: "REGULATION",
  },
  requirement: {
    bg: "bg-blue-500/15 dark:bg-blue-500/25",
    border: "stroke-blue-600 dark:stroke-blue-400",
    text: "fill-blue-950 dark:fill-blue-100",
    iconColor: "text-blue-600 dark:text-blue-400",
    dotColor: "bg-blue-500",
    glow: "rgba(59, 130, 246, 0.5)",
    label: "Requirement",
    badge: "REQUIREMENT",
  },
  policy: {
    bg: "bg-indigo-500/15 dark:bg-indigo-500/25",
    border: "stroke-indigo-600 dark:stroke-indigo-400",
    text: "fill-indigo-950 dark:fill-indigo-100",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    dotColor: "bg-indigo-500",
    glow: "rgba(99, 102, 241, 0.5)",
    label: "Policy",
    badge: "POLICY",
  },
  policy_section: {
    bg: "bg-teal-500/15 dark:bg-teal-500/25",
    border: "stroke-teal-600 dark:stroke-teal-400",
    text: "fill-teal-950 dark:fill-teal-100",
    iconColor: "text-teal-600 dark:text-teal-400",
    dotColor: "bg-teal-500",
    glow: "rgba(20, 184, 166, 0.5)",
    label: "Policy Section",
    badge: "SECTION",
  },
  finding: {
    bg: "bg-amber-500/15 dark:bg-amber-500/25",
    border: "stroke-amber-600 dark:stroke-amber-400",
    text: "fill-amber-950 dark:fill-amber-100",
    iconColor: "text-amber-600 dark:text-amber-400",
    dotColor: "bg-amber-500",
    glow: "rgba(245, 158, 11, 0.5)",
    label: "Finding",
    badge: "FINDING",
  },
  remediation: {
    bg: "bg-cyan-500/15 dark:bg-cyan-500/25",
    border: "stroke-cyan-600 dark:stroke-cyan-400",
    text: "fill-cyan-950 dark:fill-cyan-100",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    dotColor: "bg-cyan-500",
    glow: "rgba(6, 182, 212, 0.5)",
    label: "Remediation",
    badge: "REMEDIATION",
  },
  clause: {
    bg: "bg-emerald-500/15 dark:bg-emerald-500/25",
    border: "stroke-emerald-600 dark:stroke-emerald-400",
    text: "fill-emerald-950 dark:fill-emerald-100",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    dotColor: "bg-emerald-500",
    glow: "rgba(16, 185, 129, 0.5)",
    label: "Clause",
    badge: "CLAUSE",
  },
};

export function InteractiveGraphCanvas({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  searchQuery = "",
  onResetView,
}: InteractiveGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNode, setHoveredNode] = useState<PositionedNode | null>(null);

  // Canvas bounds
  const canvasWidth = 1000;
  const canvasHeight = 650;

  // Clean Layered Hierarchy Layout
  const positionedNodes = useMemo<PositionedNode[]>(() => {
    if (!nodes.length) return [];

    const layerMap: Record<NodeCategory, GraphNode[]> = {
      regulation: [],
      requirement: [],
      policy: [],
      policy_section: [],
      finding: [],
      remediation: [],
      clause: [],
    };

    nodes.forEach((n) => {
      const cat = getNodeCategory(n);
      layerMap[cat].push(n);
    });

    const activeLayers: { category: NodeCategory; items: GraphNode[]; y: number }[] = [];
    const layerSequence: { category: NodeCategory; defaultY: number }[] = [
      { category: "regulation", defaultY: 80 },
      { category: "requirement", defaultY: 180 },
      { category: "policy", defaultY: 290 },
      { category: "policy_section", defaultY: 400 },
      { category: "finding", defaultY: 510 },
      { category: "remediation", defaultY: 600 },
      { category: "clause", defaultY: 400 },
    ];

    layerSequence.forEach((ls) => {
      const items = layerMap[ls.category];
      if (items.length > 0) {
        activeLayers.push({
          category: ls.category,
          items,
          y: ls.defaultY,
        });
      }
    });

    // Rebalance Y positions dynamically based on number of active layers
    if (activeLayers.length > 1) {
      const yStep = (canvasHeight - 140) / Math.max(1, activeLayers.length - 1);
      activeLayers.forEach((l, idx) => {
        l.y = 80 + idx * yStep;
      });
    } else if (activeLayers.length === 1) {
      activeLayers[0].y = canvasHeight / 2;
    }

    const result: PositionedNode[] = [];

    activeLayers.forEach((layer) => {
      const count = layer.items.length;
      const xStep = canvasWidth / (count + 1);

      layer.items.forEach((node, idx) => {
        const x = xStep * (idx + 1);
        const radius =
          layer.category === "regulation" || layer.category === "policy"
            ? 26
            : layer.category === "finding" || layer.category === "remediation"
            ? 24
            : 20;

        result.push({
          ...node,
          x,
          y: layer.y,
          radius,
          category: layer.category,
        });
      });
    });

    return result;
  }, [nodes]);

  // Dynamic Legend Categories (Only show categories present in rendered graph)
  const activeCategories = useMemo(() => {
    const set = new Set<NodeCategory>();
    positionedNodes.forEach((n) => set.add(n.category));
    return Array.from(set);
  }, [positionedNodes]);

  // Fast node position map lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  // Active connected node IDs for selection highlight & dimming
  const activeConnectedNodeIds = useMemo(() => {
    const targetId = selectedNode?.id || hoveredNode?.id;
    if (!targetId) return new Set<string>();

    const set = new Set<string>([targetId]);
    edges.forEach((e) => {
      if (e.source === targetId) set.add(e.target);
      if (e.target === targetId) set.add(e.source);
    });
    return set;
  }, [selectedNode, hoveredNode, edges]);

  // Reset zoom & pan and clear selection
  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    onSelectNode(null);
    if (onResetView) onResetView();
  }, [onSelectNode, onResetView]);

  // Fit view to all visible nodes
  const handleFitToView = useCallback(() => {
    setZoom(0.92);
    setPan({ x: 0, y: 0 });
  }, []);

  // Center canvas smoothly on selected node
  useEffect(() => {
    if (!selectedNode || !nodeMap.has(selectedNode.id)) return;
    const target = nodeMap.get(selectedNode.id)!;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const newX = (centerX - target.x) * zoom;
    const newY = (centerY - target.y) * zoom;
    const handle = requestAnimationFrame(() => {
      setPan({ x: newX, y: newY });
    });
    return () => cancelAnimationFrame(handle);
  }, [selectedNode, nodeMap, zoom]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.min(2.5, Math.max(0.4, prev * zoomFactor)));
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[520px] sm:h-[600px] rounded-xl border border-border bg-card/60 dark:bg-card/40 overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-inner"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Background Grid Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-30 dark:opacity-20 pointer-events-none">
        <defs>
          <pattern id="graph-grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#graph-grid-pattern)" />
      </svg>

      {/* Control Toolbar */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-background/90 backdrop-blur-md p-1.5 rounded-lg border border-border shadow-xs">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom In"
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom Out"
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setZoom((z) => Math.max(0.4, z / 1.2))}
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <div className="h-4 w-px bg-border my-auto" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Fit to View"
          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleFitToView}
          title="Fit to View"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Reset View"
          className="h-7 px-2 text-xs gap-1 font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleResetView}
          title="Reset View & Clear Selection"
        >
          <RotateCcw className="h-3 w-3" />
          Reset View
        </Button>
      </div>

      {/* Canvas Zoom Indicator */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-md bg-background/90 border border-border text-muted-foreground flex items-center gap-1 shadow-2xs">
          <Move className="h-3 w-3 text-indigo-500" />
          Zoom: {(zoom * 100).toFixed(0)}%
        </span>
      </div>

      {/* Dynamic Graph Legend */}
      {activeCategories.length > 0 && (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3 bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border shadow-xs text-xs font-medium text-foreground flex-wrap max-w-[85%]">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground mr-1">
            Legend:
          </span>
          {activeCategories.map((cat) => {
            const style = NODE_STYLES[cat];
            return (
              <div key={cat} className="flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full shadow-2xs", style.dotColor)} />
                <span className="text-[11px] font-semibold">{style.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Primary Interactive SVG Canvas */}
      <svg
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        className="w-full h-full touch-none"
      >
        <defs>
          <marker
            id="arrow-applies-to"
            viewBox="0 0 10 10"
            refX="24"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-purple-500" />
          </marker>
          <marker
            id="arrow-has-req"
            viewBox="0 0 10 10"
            refX="22"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-blue-500" />
          </marker>
          <marker
            id="arrow-has-finding"
            viewBox="0 0 10 10"
            refX="22"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-amber-500" />
          </marker>
          <marker
            id="arrow-has-rem"
            viewBox="0 0 10 10"
            refX="22"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-cyan-500" />
          </marker>
          <marker
            id="arrow-default-rel"
            viewBox="0 0 10 10"
            refX="20"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
          </marker>
        </defs>

        {/* Pan & Zoom Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. EDGES / RELATIONSHIP LINES */}
          {edges.map((edge) => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);

            if (!sourceNode || !targetNode) return null;

            const activeTargetId = selectedNode?.id || hoveredNode?.id;
            const isEdgeConnected =
              activeTargetId &&
              (edge.source === activeTargetId || edge.target === activeTargetId);

            const isAppliesTo = edge.kind === "APPLIES_TO";
            const isHasReq = edge.kind === "HAS_REQUIREMENT";
            const isHasFinding = edge.kind === "HAS_FINDING";
            const isHasRem = edge.kind === "HAS_REMEDIATION";
            const isMatchedWith = edge.kind === "MATCHED_WITH";
            const isContains = edge.kind === "CONTAINS";

            let strokeColor = "stroke-slate-300 dark:stroke-slate-700";
            let markerId = "url(#arrow-default-rel)";

            if (isAppliesTo) {
              strokeColor = "stroke-purple-500/70 dark:stroke-purple-400/60";
              markerId = "url(#arrow-applies-to)";
            } else if (isHasReq) {
              strokeColor = "stroke-blue-500/70 dark:stroke-blue-400/60";
              markerId = "url(#arrow-has-req)";
            } else if (isHasFinding) {
              strokeColor = "stroke-amber-500/70 dark:stroke-amber-400/60";
              markerId = "url(#arrow-has-finding)";
            } else if (isHasRem) {
              strokeColor = "stroke-cyan-500/70 dark:stroke-cyan-400/60";
              markerId = "url(#arrow-has-rem)";
            } else if (isMatchedWith || isContains) {
              strokeColor = "stroke-teal-500/70 dark:stroke-teal-400/60";
            }

            if (isEdgeConnected) {
              strokeColor = "stroke-indigo-600 dark:stroke-indigo-400 stroke-[2.5px]";
            }

            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            const isDimmed = activeConnectedNodeIds.size > 0 && !isEdgeConnected;

            const edgeLabel =
              edge.kind === "APPLIES_TO"
                ? "applies to"
                : edge.kind === "HAS_REQUIREMENT"
                ? "has req"
                : edge.kind === "HAS_FINDING"
                ? "has finding"
                : edge.kind === "HAS_REMEDIATION"
                ? "remediation"
                : edge.kind === "MATCHED_WITH"
                ? "matched with"
                : edge.kind === "CONTAINS"
                ? "contains"
                : edge.kind.toLowerCase().replace(/_/g, " ");

            return (
              <g
                key={edge.id}
                className={cn("transition-opacity duration-200", isDimmed && "opacity-25")}
              >
                <line
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  className={cn(
                    "transition-all duration-200 pointer-events-none",
                    strokeColor,
                    isEdgeConnected ? "stroke-[2.5px]" : "stroke-[1.5px]"
                  )}
                  markerEnd={markerId}
                />
                {/* Edge Label Tag */}
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x="-36"
                    y="-9"
                    width="72"
                    height="18"
                    rx="4"
                    className="fill-background/95 stroke-border/60 stroke-[0.5]"
                  />
                  <text
                    textAnchor="middle"
                    dy="3.5"
                    className="text-[8px] font-mono font-bold fill-muted-foreground uppercase tracking-wider select-none pointer-events-none"
                  >
                    {edgeLabel}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 2. NODES */}
          {positionedNodes.map((node) => {
            const category = node.category;
            const style = NODE_STYLES[category];

            const isSelected = selectedNode?.id === node.id;
            const isHovered = hoveredNode?.id === node.id;
            const isFocused = Boolean(node.is_focused);
            const isHighlightGroup = activeConnectedNodeIds.has(node.id);
            const isDimmed = activeConnectedNodeIds.size > 0 && !isHighlightGroup;
            const matchesSearch =
              searchQuery &&
              (node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (node.text || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.id.toLowerCase().includes(searchQuery.toLowerCase()));

            const nodeRadius = node.radius || 24;

            // Coverage badge color
            const covStatus = (node.coverage_status || "").toUpperCase();
            let covColor = "";
            if (covStatus === "COVERED") covColor = "fill-emerald-500";
            else if (covStatus === "PARTIALLY_COVERED") covColor = "fill-amber-500";
            else if (covStatus === "GAP") covColor = "fill-rose-500";
            else if (covStatus === "UNABLE_TO_DETERMINE") covColor = "fill-slate-400";

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                tabIndex={0}
                role="button"
                aria-label={`${style.label} ${node.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectNode(node);
                  }
                }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className={cn(
                  "cursor-pointer group transition-all duration-200 focus:outline-none",
                  isDimmed && "opacity-25"
                )}
              >
                {/* Outer Glow Ring when Focused, Selected or Matched */}
                {(isSelected || isFocused || matchesSearch) && (
                  <circle
                    r={nodeRadius + 12}
                    className="animate-pulse opacity-80"
                    fill={isFocused ? "rgba(99, 102, 241, 0.6)" : style.glow}
                  />
                )}

                {/* Outer Selection Ring */}
                {(isSelected || isHovered || isFocused) && (
                  <circle
                    r={nodeRadius + 5}
                    fill="none"
                    stroke={isSelected || isFocused ? "#6366f1" : "#a5b4fc"}
                    strokeWidth="2.5"
                    strokeDasharray={isSelected || isFocused ? "none" : "3 3"}
                  />
                )}

                {/* Node Main Circle */}
                <circle
                  r={nodeRadius}
                  className={cn(
                    "transition-all duration-150 stroke-[2px]",
                    style.bg,
                    style.border,
                    (isSelected || isHovered || isFocused) && "stroke-[3px]"
                  )}
                />

                {/* Coverage indicator small status dot */}
                {covColor && (
                  <circle
                    cx={nodeRadius - 4}
                    cy={-nodeRadius + 4}
                    r={5}
                    className={cn(covColor, "stroke-background stroke-[1.5]")}
                  />
                )}

                {/* Node Center Icon */}
                <g className="pointer-events-none">
                  {category === "regulation" && <Scale className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "requirement" && <BookOpen className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "policy" && <FileText className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "policy_section" && <Layers className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "finding" && <ShieldAlert className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "remediation" && <Wrench className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "clause" && <FileCheck className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                </g>

                {/* Node Title & Truncated Label Below */}
                <g transform={`translate(0, ${nodeRadius + 14})`}>
                  <rect
                    x="-75"
                    y="-11"
                    width="150"
                    height="20"
                    rx="5"
                    className={cn(
                      "fill-background/95 stroke-border/60 stroke-[0.5] shadow-2xs",
                      (isSelected || isFocused) && "fill-indigo-600 border-indigo-600"
                    )}
                  />
                  <text
                    textAnchor="middle"
                    dy="3"
                    className={cn(
                      "text-[9px] font-semibold tracking-tight select-none pointer-events-none fill-foreground",
                      (isSelected || isFocused) && "fill-white font-bold"
                    )}
                  >
                    {node.label.length > 24 ? `${node.label.substring(0, 22)}...` : node.label}
                  </text>
                </g>

                {/* Tooltip on Hover */}
                {isHovered && (
                  <g transform={`translate(0, ${-nodeRadius - 28})`} className="pointer-events-none">
                    <rect
                      x="-100"
                      y="-12"
                      width="200"
                      height="24"
                      rx="6"
                      className="fill-slate-900/95 stroke-slate-700 stroke-[0.5] shadow-md"
                    />
                    <text
                      textAnchor="middle"
                      dy="3"
                      className="text-[9.5px] font-semibold fill-white select-none"
                    >
                      {node.label.length > 30 ? `${node.label.substring(0, 28)}...` : node.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export default InteractiveGraphCanvas;

