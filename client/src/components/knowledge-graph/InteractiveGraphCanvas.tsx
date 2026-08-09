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
  FileCheck,
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

interface PositionedNode extends GraphNode {
  x: number;
  y: number;
  radius: number;
  category: "policy" | "regulation" | "finding" | "clause";
}

/**
 * Node visual style configurations by entity type
 */
function getNodeCategory(node: GraphNode): "policy" | "regulation" | "finding" | "clause" {
  const kind = (node.kind || "").toLowerCase();
  const docType = (node.document_type || node.source_type || "").toLowerCase();
  const label = (node.label || "").toLowerCase();

  if (kind.includes("finding") || label.includes("finding")) {
    return "finding";
  }
  if (kind === "clause" || kind === "policyclause" || docType === "clause") {
    return "clause";
  }
  if (
    kind === "domaindocument" ||
    docType === "regulation" ||
    docType === "domain_document" ||
    label.includes("act") ||
    label.includes("code of") ||
    label.includes("fema") ||
    label.includes("regulation")
  ) {
    return "regulation";
  }
  return "policy";
}

const NODE_STYLES: Record<
  "policy" | "regulation" | "finding" | "clause",
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
  regulation: {
    bg: "bg-violet-500/15 dark:bg-violet-500/25",
    border: "stroke-violet-600 dark:stroke-violet-400",
    text: "fill-violet-950 dark:fill-violet-100",
    iconColor: "text-violet-600 dark:text-violet-400",
    dotColor: "bg-violet-500",
    glow: "rgba(139, 92, 246, 0.5)",
    label: "Regulation",
    badge: "REGULATION",
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
  const canvasHeight = 620;

  // Clean Stacked Layout Computation (REGULATION -> POLICY -> FINDINGS)
  const positionedNodes = useMemo<PositionedNode[]>(() => {
    if (!nodes.length) return [];

    const regNodes: GraphNode[] = [];
    const polNodes: GraphNode[] = [];
    const findNodes: GraphNode[] = [];
    const clsNodes: GraphNode[] = [];

    nodes.forEach((n) => {
      const cat = getNodeCategory(n);
      if (cat === "regulation") regNodes.push(n);
      else if (cat === "policy") polNodes.push(n);
      else if (cat === "finding") findNodes.push(n);
      else clsNodes.push(n);
    });

    const result: PositionedNode[] = [];
    const totalGroups = Math.max(1, polNodes.length);
    const colStep = canvasWidth / (totalGroups + 1);

    polNodes.forEach((pNode, idx) => {
      const colX = colStep * (idx + 1);

      // 1. Middle Row: Policy Node (Radius 28)
      result.push({
        ...pNode,
        x: colX,
        y: 310,
        radius: 28,
        category: "policy",
      });

      // 2. Top Row: Regulation Node (Radius 28)
      const connectedRegEdge = edges.find(
        (e) => e.kind === "APPLIES_TO" && (e.target === pNode.id || e.source === pNode.id)
      );

      const regNode = regNodes.find(
        (r) => r.id === (connectedRegEdge?.source === pNode.id ? connectedRegEdge?.target : connectedRegEdge?.source)
      ) || regNodes[idx % Math.max(1, regNodes.length)];

      if (regNode && !result.some((r) => r.id === regNode.id)) {
        result.push({
          ...regNode,
          x: colX,
          y: 120,
          radius: 28,
          category: "regulation",
        });
      }

      // 3. Bottom Row: Finding Node (Radius 24)
      const findingNode = findNodes.find((f) => f.id.includes(pNode.id) || f.text?.includes(pNode.label)) || findNodes[idx];

      if (findingNode && !result.some((f) => f.id === findingNode.id)) {
        result.push({
          ...findingNode,
          x: colX,
          y: 490,
          radius: 24,
          category: "finding",
        });
      }
    });

    // Unattached Regulations
    regNodes.forEach((rNode, idx) => {
      if (!result.some((n) => n.id === rNode.id)) {
        const x = (canvasWidth / (regNodes.length + 1)) * (idx + 1);
        result.push({
          ...rNode,
          x,
          y: 120,
          radius: 28,
          category: "regulation",
        });
      }
    });

    // Clause nodes (Radius 20)
    clsNodes.forEach((cNode, idx) => {
      const x = (canvasWidth / (clsNodes.length + 1)) * (idx + 1);
      result.push({
        ...cNode,
        x,
        y: 560,
        radius: 20,
        category: "clause",
      });
    });

    return result;
  }, [nodes, edges]);

  // Dynamic Legend Categories (Only show categories present in rendered graph)
  const activeCategories = useMemo(() => {
    const set = new Set<"policy" | "regulation" | "finding" | "clause">();
    positionedNodes.forEach((n) => set.add(n.category));
    return Array.from(set);
  }, [positionedNodes]);

  // Fast node position map lookup
  const nodeMap = useMemo(() => {
    const map = new Map<string, PositionedNode>();
    positionedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [positionedNodes]);

  // Active connected node IDs for selection highlight & 25% opacity dimming
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
    setZoom(0.95);
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
      className="relative w-full h-[480px] sm:h-[560px] rounded-xl border border-border bg-card/60 dark:bg-card/40 overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-inner"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Background Subtle Grid Pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-30 dark:opacity-20 pointer-events-none">
        <defs>
          <pattern id="graph-grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#graph-grid-pattern)" />
      </svg>

      {/* Control Toolbar (Top-Right Overlay) */}
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

      {/* Canvas Status & Zoom Indicator (Top-Left Overlay) */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span className="text-[10px] font-mono font-semibold px-2.5 py-1 rounded-md bg-background/90 border border-border text-muted-foreground flex items-center gap-1 shadow-2xs">
          <Move className="h-3 w-3 text-indigo-500" />
          Zoom: {(zoom * 100).toFixed(0)}%
        </span>
      </div>

      {/* Dynamic Graph Legend (Bottom-Left Overlay - Sprint 5.4) */}
      {activeCategories.length > 0 && (
        <div className="absolute bottom-3 left-3 z-20 flex items-center gap-3 bg-background/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-border shadow-xs text-xs font-medium text-foreground">
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
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-violet-500" />
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
            const isHasFinding = edge.kind === "HAS_FINDING";
            const isComparedWith = edge.kind === "COMPARED_WITH";
            const isEvidenceFor = edge.kind === "EVIDENCE_FOR";

            let strokeColor = "stroke-slate-300 dark:stroke-slate-700";
            let markerId = "url(#arrow-default-rel)";

            if (isAppliesTo) {
              strokeColor = "stroke-violet-500/70 dark:stroke-violet-400/60";
              markerId = "url(#arrow-applies-to)";
            } else if (isHasFinding) {
              strokeColor = "stroke-amber-500/70 dark:stroke-amber-400/60";
              markerId = "url(#arrow-has-finding)";
            } else if (isComparedWith || isEvidenceFor) {
              strokeColor = "stroke-emerald-500/70 dark:stroke-emerald-400/60";
            }

            if (isEdgeConnected) {
              strokeColor = "stroke-indigo-600 dark:stroke-indigo-400 stroke-[2.5px]";
            }

            const midX = (sourceNode.x + targetNode.x) / 2;
            const midY = (sourceNode.y + targetNode.y) / 2;
            const isDimmed = activeConnectedNodeIds.size > 0 && !isEdgeConnected;

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
                    x="-34"
                    y="-9"
                    width="68"
                    height="18"
                    rx="4"
                    className="fill-background/95 stroke-border/60 stroke-[0.5]"
                  />
                  <text
                    textAnchor="middle"
                    dy="3.5"
                    className="text-[8px] font-mono font-bold fill-muted-foreground uppercase tracking-wider select-none pointer-events-none"
                  >
                    {isAppliesTo
                      ? "applies to"
                      : isHasFinding
                      ? "has finding"
                      : isComparedWith
                      ? "compared with"
                      : isEvidenceFor
                      ? "evidence for"
                      : edge.kind}
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
            const isHighlightGroup = activeConnectedNodeIds.has(node.id);
            const isDimmed = activeConnectedNodeIds.size > 0 && !isHighlightGroup;
            const matchesSearch =
              searchQuery &&
              (node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                node.id.toLowerCase().includes(searchQuery.toLowerCase()));

            const nodeRadius = node.radius || 26;

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
                {/* Outer Glow Ring when Selected or Matched */}
                {(isSelected || matchesSearch) && (
                  <circle
                    r={nodeRadius + 10}
                    className="animate-pulse opacity-80"
                    fill={style.glow}
                  />
                )}

                {/* Outer Selection Ring */}
                {(isSelected || isHovered) && (
                  <circle
                    r={nodeRadius + 5}
                    fill="none"
                    stroke={isSelected ? "#6366f1" : "#a5b4fc"}
                    strokeWidth="2.5"
                    strokeDasharray={isSelected ? "none" : "3 3"}
                  />
                )}

                {/* Node Main Circle */}
                <circle
                  r={nodeRadius}
                  className={cn(
                    "transition-all duration-150 stroke-[2px]",
                    style.bg,
                    style.border,
                    (isSelected || isHovered) && "stroke-[3px]"
                  )}
                />

                {/* Node Center Icon */}
                <g className="pointer-events-none">
                  {category === "policy" && <BookOpen className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "regulation" && <Scale className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "finding" && <ShieldCheck className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                  {category === "clause" && <FileCheck className={cn("h-4 w-4 -ml-2 -mt-2", style.iconColor)} />}
                </g>

                {/* Node Title & Truncated Label Below */}
                <g transform={`translate(0, ${nodeRadius + 14})`}>
                  <rect
                    x="-70"
                    y="-11"
                    width="140"
                    height="20"
                    rx="5"
                    className={cn(
                      "fill-background/95 stroke-border/60 stroke-[0.5] shadow-2xs",
                      isSelected && "fill-indigo-600 border-indigo-600"
                    )}
                  />
                  <text
                    textAnchor="middle"
                    dy="3"
                    className={cn(
                      "text-[9px] font-semibold tracking-tight select-none pointer-events-none fill-foreground",
                      isSelected && "fill-white font-bold"
                    )}
                  >
                    {node.label.length > 22 ? `${node.label.substring(0, 20)}...` : node.label}
                  </text>
                </g>

                {/* Tooltip on Hover */}
                {isHovered && (
                  <g transform={`translate(0, ${-nodeRadius - 28})`} className="pointer-events-none">
                    <rect
                      x="-90"
                      y="-12"
                      width="180"
                      height="24"
                      rx="6"
                      className="fill-slate-900/95 stroke-slate-700 stroke-[0.5] shadow-md"
                    />
                    <text
                      textAnchor="middle"
                      dy="3"
                      className="text-[9.5px] font-semibold fill-white select-none"
                    >
                      {node.label.length > 28 ? `${node.label.substring(0, 26)}...` : node.label}
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
