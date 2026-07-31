"use client";

import React, { useEffect, useState } from "react";
import { Network, GitMerge, ChevronRight, Layers, Tag, ArrowRight } from "lucide-react";
import { documentService, ClauseGraphPayload } from "@/services/document-service";

interface RelatedKnowledgePanelProps {
  clauseId: string;
}

export function RelatedKnowledgePanel({ clauseId }: RelatedKnowledgePanelProps) {
  const [graphData, setGraphData] = useState<ClauseGraphPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!clauseId) return;

    const loadGraph = async () => {
      try {
        setIsLoading(true);
        const data = await documentService.getClauseGraph(clauseId);
        setGraphData(data);
      } catch (err) {
        console.error("Failed to load clause graph:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadGraph();
  }, [clauseId]);

  if (isLoading) {
    return (
      <div className="p-4 bg-muted/40 rounded-xl border border-border/80 space-y-3 animate-pulse">
        <div className="h-4 w-1/3 bg-muted rounded" />
        <div className="h-12 w-full bg-muted rounded" />
        <div className="h-8 w-2/3 bg-muted rounded" />
      </div>
    );
  }

  const neighbors = graphData?.neighbors || [];
  const entities = graphData?.entities || [];

  return (
    <div className="space-y-4 bg-card/60 border border-border rounded-2xl p-4 text-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Network className="h-4 w-4 text-indigo-500" />
          <span>Knowledge Graph Relationships</span>
        </div>
        <span className="px-2 py-0.5 text-[10px] bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-full font-medium border border-indigo-500/20">
          Neo4j 2-Hop
        </span>
      </div>

      {/* Relationship Flow Graph Visualization */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Relationship Path Flow
        </span>
        <div className="p-3 bg-muted/50 rounded-xl border border-border/70 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="px-2 py-1 bg-indigo-600 text-white rounded font-medium shadow-xs">
            Target Clause
          </span>
          {neighbors.length > 0 ? (
            neighbors.slice(0, 3).map((n, idx) => (
              <React.Fragment key={idx}>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="px-2 py-1 bg-card border border-border text-indigo-600 dark:text-indigo-400 rounded font-medium truncate max-w-[150px]">
                  {n.label || n.text || "Neighbor"}
                </span>
              </React.Fragment>
            ))
          ) : (
            <span className="text-muted-foreground italic text-[11px] ml-1">
              No direct 2-hop graph relationships mapped in Neo4j
            </span>
          )}
        </div>
      </div>

      {/* Connected Neighbor Nodes */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Connected Neighbor Nodes ({neighbors.length})
        </span>
        {neighbors.length > 0 ? (
          <div className="grid grid-cols-1 gap-1.5">
            {neighbors.map((node, i) => (
              <div
                key={i}
                className="p-2 bg-muted/40 hover:bg-muted/80 rounded-lg border border-border/60 flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <GitMerge className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="font-medium text-foreground truncate">{node.label || node.text || "Connected Node"}</span>
                </div>
                <span className="px-1.5 py-0.5 text-[9px] bg-background border border-border text-muted-foreground rounded font-mono">
                  {node.relation_type || "CONNECTED"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic text-[11px]">No graph neighbor nodes found.</p>
        )}
      </div>

      {/* Extracted Named Entities */}
      <div className="space-y-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
          Extracted Entities ({entities.length})
        </span>
        {entities.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {entities.map((ent, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 rounded-md font-medium text-[11px] flex items-center gap-1"
              >
                <Tag className="h-3 w-3" />
                {ent.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground italic text-[11px]">No extracted entities found.</p>
        )}
      </div>
    </div>
  );
}
