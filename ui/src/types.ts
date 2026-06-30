export interface GraphNode {
  id: number;
  label: string;
  name: string;
  qualified_name: string;
  color: number;
  size: number;
  x: number;
  y: number;
  z: number;
  file_path?: string | null;
  start_line?: number;
  user_prompt?: string;
  assistant_response?: string;
  text_preview?: string;
}

export interface GraphEdge {
  source: number;
  target: number;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  project: string;
}
