/**
 * KnowledgeGraph — Unified D3 force-directed knowledge graph.
 * Replaces the duplicated KnowledgeGraphView in both SuperAgentChat and DeepResearch.
 * Supports any node types via configurable color schemes.
 */
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import type { KnowledgeGraphData } from '../../types/chat';

// ─── Color scheme per node type ─────────────────────────────
const NODE_STYLES: Record<string, { fill: string; stroke: string; textColor: string; r: number }> = {
  agent:  { fill: '#f3f4f6', stroke: '#6b7280', textColor: '#374151', r: 18 },
  task:   { fill: '#eff6ff', stroke: '#3b82f6', textColor: '#1d4ed8', r: 14 },
  stance: { fill: '#f5f3ff', stroke: '#7c3aed', textColor: '#5b21b6', r: 14 },
  topic:  { fill: '#eef2ff', stroke: '#6366f1', textColor: '#4338ca', r: 22 },
  source: { fill: '#f3f4f6', stroke: '#6b7280', textColor: '#374151', r: 16 },
  signal: { fill: '#ecfdf5', stroke: '#10b981', textColor: '#047857', r: 14 },
};

const defaultStyle = { fill: '#f3f4f6', stroke: '#6b7280', textColor: '#374151', r: 14 };

interface KnowledgeGraphProps {
  data: KnowledgeGraphData;
  /** Used for unique marker IDs when multiple graphs are on the page */
  markerId?: string;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({ data, markerId = 'kg-arrow' }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    const svg = d3.select(svgRef.current);
    const width = containerRef.current?.clientWidth || 400;
    const height = containerRef.current?.clientHeight || 600;

    svg.selectAll('*').remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (e) => g.attr('transform', e.transform));
    svg.call(zoom as any);

    const g = svg.append('g');

    // Arrow marker
    svg.append('defs').append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 22).attr('refY', 0)
      .attr('markerWidth', 5).attr('markerHeight', 5)
      .attr('orient', 'auto')
      .append('path').attr('fill', '#9ca3af').attr('d', 'M0,-4L8,0L0,4');

    // Clone data for d3 mutation
    const nodes = data.nodes.map(d => ({ ...d }));
    const edges = data.edges.map(d => ({ ...d }));

    const simulation = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(edges).id((d: any) => d.id).distance(115))
      .force('charge', d3.forceManyBody().strength(-450))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(42));

    const link = g.append('g')
      .attr('stroke', '#9ca3af').attr('stroke-opacity', 0.8)
      .selectAll('line').data(edges).join('line')
      .attr('stroke-width', 1.5)
      .attr('marker-end', `url(#${markerId})`);

    const linkLabel = g.append('g')
      .selectAll('text').data(edges).join('text')
      .text((d: any) => d.label)
      .attr('font-size', '8px').attr('fill', '#9ca3af').attr('text-anchor', 'middle');

    const drag = d3.drag<SVGGElement, any>()
      .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; });

    const node = g.append('g')
      .selectAll('g').data(nodes).join('g')
      .call(drag as any).style('cursor', 'grab');

    node.append('circle')
      .attr('r', (d: any) => (NODE_STYLES[d.type] || defaultStyle).r)
      .attr('fill', (d: any) => (NODE_STYLES[d.type] || defaultStyle).fill)
      .attr('stroke', (d: any) => (NODE_STYLES[d.type] || defaultStyle).stroke)
      .attr('stroke-width', 1.5);

    node.append('text')
      .text((d: any) => {
        const parts = d.label.split(' ');
        return d.type === 'agent' ? parts[0] : (d.label.length > 15 ? d.label.slice(0, 13) + '…' : d.label);
      })
      .attr('y', (d: any) => (NODE_STYLES[d.type] || defaultStyle).r + 10)
      .attr('font-size', '9px')
      .attr('fill', (d: any) => (NODE_STYLES[d.type] || defaultStyle).textColor)
      .attr('text-anchor', 'middle').attr('font-weight', '500');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
      linkLabel
        .attr('x', (d: any) => (d.source.x + d.target.x) / 2)
        .attr('y', (d: any) => (d.source.y + d.target.y) / 2 - 4);
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { simulation.stop(); };
  }, [data.nodes, data.edges, markerId]);

  // Derive unique legend types from actual data
  const uniqueTypes = [...new Set(data.nodes.map(n => n.type))];

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Auto-generated legend */}
      <div className="absolute bottom-4 left-4 flex gap-4 z-10">
        {uniqueTypes.map(t => {
          const s = NODE_STYLES[t] || defaultStyle;
          return (
            <div key={t} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.fill, border: `1px solid ${s.stroke}` }} />
              <span className="text-[10px] text-gray-500 uppercase font-mono tracking-wider">{t}</span>
            </div>
          );
        })}
      </div>
      <div className="absolute top-4 right-4 text-[10px] text-gray-500 font-mono text-right pointer-events-none">
        scroll to zoom<br/>drag to pan
      </div>
    </div>
  );
};

export default KnowledgeGraph;
