// Shared contracts used by the gateway (Node) and the browser app.
export interface Atm { id: string; name: string; lat: number; lng: number; history: number }
export interface Origin { lat: number; lng: number }
export interface AtmScore { atm: string; name: string; lat: number; lng: number; prob: number }
export interface Forecast { sigma_km: number; top: AtmScore[]; all: AtmScore[]; engine: string }
export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export interface Risk { urgency: number; level: RiskLevel; window_min: number; engine: string }
export interface Hop { from: string; to: string; amount: number; minute: number }
export interface GraphResult { hops: number; accounts: number; span_min: number; hops_per_hour: number; mule_risk: number; last_hop: string | null; engine: string }
export type Severity = 'high' | 'medium' | 'low';
export interface AlertRecord { id: string; case_id: string; severity: Severity; atms: string[]; window_min: number; message: string; created: string; engine: string }
export interface FeedEvent { type: 'alert' | 'complaint' | 'system'; ts: string; text: string; simulated: boolean }
export interface Complaint { id: string; city: string; amount: number; hops: Hop[]; created: string }
