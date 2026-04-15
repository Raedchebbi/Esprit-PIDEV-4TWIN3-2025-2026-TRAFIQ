// Plain TypeScript interface — no MongoDB/Mongoose dependency.
// Python AI engine appends incidents to backend/ai-engine/incidents.jsonl.

export interface Accident {
  incident_id:   string;
  incident_type: string;
  timestamp:     string;
  snapshot:      string;
  vehicle_a:     number;
  vehicle_b:     number;
  iou:           number;
  confidence:    number;
  camera_id:     string;
  risk_score?:   number;
  risk_level?:   string;
  risk_reason?:  string;
  false_positive?: boolean;
}
